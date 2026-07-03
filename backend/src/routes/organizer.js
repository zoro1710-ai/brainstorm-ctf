'use strict';
// Organizer-only observability surface. Every "what's happening" question an
// organizer would ask (who did what, when, from where, and why something got
// flagged) is answerable by one of these read endpoints, backed directly by the
// append-only tables -- no separate reporting pipeline to keep in sync.

const path = require('node:path');
const express = require('express');
const { requireOrganizerAuth } = require('../auth');
const { computeLeaderboard } = require('../leaderboard');

function buildOrganizerRouter(ctx) {
  const { db, hub, organizerKey, stageContent } = ctx;
  const router = express.Router();
  router.use(requireOrganizerAuth(organizerKey));

  router.get('/teams', (req, res) => {
    const leaderboard = computeLeaderboard(db);
    res.json({ ok: true, teams: leaderboard });
  });

  // Per-stage overview: solve count, first blood, placeholder status, and the
  // puzzle files (organizers can pre-check every artifact before the event).
  router.get('/stages', (req, res) => {
    const stages = db.prepare(
      'SELECT stage_number, slug, title, points, flag_is_placeholder FROM stages ORDER BY stage_number'
    ).all();
    const agg = new Map(
      db.prepare('SELECT stage_number, COUNT(*) AS solves, MIN(solved_at_ms) AS first_ms FROM solves GROUP BY stage_number')
        .all().map((r) => [r.stage_number, r])
    );
    const fbStmt = db.prepare(
      'SELECT t.code, t.name FROM solves sv JOIN teams t ON t.id = sv.team_id WHERE sv.stage_number = ? AND sv.solved_at_ms = ?'
    );
    const teamCount = db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
    const out = stages.map((s) => {
      const a = agg.get(s.stage_number);
      let firstBlood = null;
      if (a && a.first_ms != null) {
        const fb = fbStmt.get(s.stage_number, a.first_ms);
        if (fb) firstBlood = { team_code: fb.code, team_name: fb.name, at_ms: a.first_ms };
      }
      const content = stageContent && stageContent.get(s.stage_number);
      const attachments = content
        ? content.attachments.map((name) => ({ name, url: `/api/organizer/stages/${s.stage_number}/files/${encodeURIComponent(name)}` }))
        : [];
      return {
        stage_number: s.stage_number,
        title: s.title,
        points: s.points,
        is_placeholder: !!s.flag_is_placeholder,
        solves: a ? a.solves : 0,
        team_count: teamCount,
        first_blood: firstBlood,
        attachments,
      };
    });
    res.json({ ok: true, stages: out });
  });

  // Organizer file download — key-authed, NOT unlock-gated (organizers see everything).
  router.get('/stages/:n/files/:name', (req, res) => {
    const n = parseInt(req.params.n, 10);
    const content = stageContent && stageContent.get(n);
    if (!content) return res.status(404).json({ ok: false, error: 'no such stage' });
    const name = content.attachments.find((a) => a === req.params.name);
    if (!name) return res.status(404).json({ ok: false, error: 'no such file' });
    res.sendFile(path.join(content.dir, name), { dotfiles: 'deny', cacheControl: false });
  });

  router.get('/submissions', (req, res) => {
    const { team_code, stage, limit } = req.query;
    let sql = `
      SELECT s.*, t.code AS team_code, t.name AS team_name
      FROM submissions s JOIN teams t ON t.id = s.team_id
      WHERE 1=1
    `;
    const params = [];
    if (team_code) { sql += ' AND t.code = ?'; params.push(String(team_code).toUpperCase()); }
    if (stage) { sql += ' AND s.stage_number = ?'; params.push(parseInt(stage, 10)); }
    sql += ' ORDER BY s.id DESC LIMIT ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 1000));
    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, submissions: rows });
  });

  router.get('/solves', (req, res) => {
    const rows = db.prepare(`
      SELECT sv.*, t.code AS team_code, t.name AS team_name
      FROM solves sv JOIN teams t ON t.id = sv.team_id
      ORDER BY sv.solved_at_ms ASC
    `).all();
    res.json({ ok: true, solves: rows });
  });

  router.get('/alerts', (req, res) => {
    const { severity, stage, reviewed } = req.query;
    let sql = 'SELECT * FROM anticheat_alerts WHERE 1=1';
    const params = [];
    if (severity) { sql += ' AND severity = ?'; params.push(String(severity).toUpperCase()); }
    if (stage) { sql += ' AND stage_number = ?'; params.push(parseInt(stage, 10)); }
    sql += ' ORDER BY id DESC';
    const rows = db.prepare(sql).all(...params);

    const reviewStmt = db.prepare('SELECT * FROM alert_reviews WHERE alert_id = ? ORDER BY id DESC');
    let out = rows.map((r) => ({
      ...r,
      team_ids: JSON.parse(r.team_ids),
      evidence: JSON.parse(r.evidence),
      reviews: reviewStmt.all(r.id),
    }));
    if (reviewed === 'true') out = out.filter((a) => a.reviews.length > 0);
    if (reviewed === 'false') out = out.filter((a) => a.reviews.length === 0);
    res.json({ ok: true, alerts: out });
  });

  router.post('/alerts/:id/review', (req, res) => {
    const { reviewer, note } = req.body || {};
    const alertId = parseInt(req.params.id, 10);
    const alert = db.prepare('SELECT id FROM anticheat_alerts WHERE id = ?').get(alertId);
    if (!alert) return res.status(404).json({ ok: false, error: 'no such alert' });
    db.prepare('INSERT INTO alert_reviews (alert_id, reviewer, note, created_at) VALUES (?, ?, ?, ?)')
      .run(alertId, reviewer || 'organizer', note || '', new Date().toISOString());
    res.json({ ok: true });
  });

  // Chronological, human-readable activity feed combining submissions + solves + alerts --
  // this is the "reconstruct what a participant did" view.
  router.get('/activity', (req, res) => {
    const { team_code, limit } = req.query;
    const cap = Math.min(parseInt(limit, 10) || 200, 2000);

    let subSql = `
      SELECT s.id, 'submission' AS kind, t.code AS team_code, s.stage_number,
             s.is_correct, s.rejection_reason, s.server_ts AS at, s.ip
      FROM submissions s JOIN teams t ON t.id = s.team_id WHERE 1=1
    `;
    const subParams = [];
    if (team_code) { subSql += ' AND t.code = ?'; subParams.push(String(team_code).toUpperCase()); }

    let alertSql = `SELECT id, 'alert' AS kind, alert_type, severity, stage_number, team_ids, created_at AS at FROM anticheat_alerts`;

    const submissions = db.prepare(subSql).all(...subParams);
    const alerts = db.prepare(alertSql).all().map((a) => ({ ...a, team_ids: JSON.parse(a.team_ids) }));

    const combined = [...submissions, ...alerts].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, cap);
    res.json({ ok: true, activity: combined });
  });

  router.get('/credentials-hint', (req, res) => {
    res.json({
      ok: true,
      note: 'Team login credentials were written once at first startup to backend/data/team_credentials.csv (organizer-only, gitignored).',
    });
  });

  router.get('/stream', (req, res) => {
    hub.attachOrganizer(res);
  });

  return router;
}

module.exports = { buildOrganizerRouter };
