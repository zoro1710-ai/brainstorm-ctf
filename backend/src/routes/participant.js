'use strict';
const path = require('node:path');
const express = require('express');
const { login, requireTeamAuth, clientIp } = require('../auth');
const { handleSubmission } = require('../submit');
const { computeLeaderboard } = require('../leaderboard');

function buildParticipantRouter(ctx) {
  const { db, hub, stageContent } = ctx;
  const router = express.Router();

  // Is `stageNumber` unlocked for this team? (stage 1 always; others need the prior solve)
  function stageUnlocked(teamId, stageNumber) {
    const stage = db.prepare('SELECT requires_stage FROM stages WHERE stage_number = ?').get(stageNumber);
    if (!stage) return false;
    if (!stage.requires_stage) return true;
    const solved = db.prepare('SELECT 1 FROM solves WHERE team_id = ? AND stage_number = ?')
      .get(teamId, stage.requires_stage);
    return !!solved;
  }

  router.post('/login', (req, res) => {
    const { code, password } = req.body || {};
    if (!code || !password) return res.status(400).json({ ok: false, error: 'code and password required' });
    const result = login(db, { code, password, ip: clientIp(req), userAgent: req.headers['user-agent'] });
    if (!result) return res.status(401).json({ ok: false, error: 'invalid team code or password' });
    res.json({ ok: true, ...result });
  });

  router.get('/me', requireTeamAuth(db), (req, res) => {
    const solves = db.prepare(
      'SELECT stage_number, solved_at FROM solves WHERE team_id = ? ORDER BY stage_number'
    ).all(req.team.id);
    res.json({ ok: true, team: req.team, solves });
  });

  router.get('/stages', requireTeamAuth(db), (req, res) => {
    const stages = db.prepare('SELECT stage_number, slug, title, points, requires_stage FROM stages ORDER BY stage_number').all();
    const solvedSet = new Set(
      db.prepare('SELECT stage_number FROM solves WHERE team_id = ?').all(req.team.id).map((r) => r.stage_number)
    );
    const out = stages.map((s) => ({
      stage_number: s.stage_number,
      slug: s.slug,
      title: s.title,
      points: s.points,
      solved: solvedSet.has(s.stage_number),
      unlocked: !s.requires_stage || solvedSet.has(s.requires_stage),
    }));
    res.json({ ok: true, stages: out });
  });

  // Full player-facing content for one stage (description, hints, download list).
  // Gated: a team can only read a stage it has unlocked. Never returns the flag.
  // Hints: content is hidden until explicitly unlocked via POST /stages/:n/hints/:i/unlock
  router.get('/stages/:n', requireTeamAuth(db), (req, res) => {
    const n = parseInt(req.params.n, 10);
    const content = stageContent && stageContent.get(n);
    if (!content) return res.status(404).json({ ok: false, error: 'no such stage' });
    if (!stageUnlocked(req.team.id, n)) return res.status(403).json({ ok: false, error: 'stage locked' });

    // Fetch which hints this team has already unlocked
    const unlockedRows = db.prepare(
      'SELECT hint_index, cost FROM hint_unlocks WHERE team_id = ? AND stage_number = ?'
    ).all(req.team.id, n);
    const unlockedMap = new Map(unlockedRows.map((r) => [r.hint_index, r.cost]));

    const hints = content.hints.map((h, i) => {
      const alreadyUnlocked = unlockedMap.has(i);
      return {
        index: i,
        cost: h.cost || 0,
        unlocked: alreadyUnlocked,
        // Only send content if already unlocked — never leak it for free
        content: alreadyUnlocked ? h.content : null,
      };
    });

    res.json({
      ok: true,
      stage_number: n,
      description: content.description,
      hints,
      attachments: content.attachments.map((name) => ({ name, url: `/api/stages/${n}/files/${encodeURIComponent(name)}` })),
    });
  });

  // Unlock a specific hint for a stage. Deducts hint cost from team score.
  // Idempotent: unlocking the same hint twice returns the content without double-charging.
  router.post('/stages/:n/hints/:i/unlock', requireTeamAuth(db), (req, res) => {
    const n = parseInt(req.params.n, 10);
    const i = parseInt(req.params.i, 10);
    const content = stageContent && stageContent.get(n);
    if (!content) return res.status(404).json({ ok: false, error: 'no such stage' });
    if (!stageUnlocked(req.team.id, n)) return res.status(403).json({ ok: false, error: 'stage locked' });
    if (i < 0 || i >= content.hints.length) return res.status(404).json({ ok: false, error: 'no such hint' });

    const hint = content.hints[i];
    const cost = hint.cost || 0;

    // Check if already unlocked (idempotent -- no double charge)
    const existing = db.prepare(
      'SELECT id FROM hint_unlocks WHERE team_id = ? AND stage_number = ? AND hint_index = ?'
    ).get(req.team.id, n, i);

    if (!existing) {
      db.prepare(
        'INSERT INTO hint_unlocks (team_id, stage_number, hint_index, cost, unlocked_at) VALUES (?, ?, ?, ?, ?)'
      ).run(req.team.id, n, i, cost, new Date().toISOString());
    }

    res.json({ ok: true, hint_index: i, cost, already_unlocked: !!existing, content: hint.content });
  });

  // Download a stage attachment. Gated identically; only files declared in challenge.yml
  // are reachable (no path traversal — the name is matched against the whitelist).
  router.get('/stages/:n/files/:name', requireTeamAuth(db), (req, res) => {
    const n = parseInt(req.params.n, 10);
    const content = stageContent && stageContent.get(n);
    if (!content) return res.status(404).json({ ok: false, error: 'no such stage' });
    if (!stageUnlocked(req.team.id, n)) return res.status(403).json({ ok: false, error: 'stage locked' });
    const name = content.attachments.find((a) => a === req.params.name);
    if (!name) return res.status(404).json({ ok: false, error: 'no such file' });
    // Serve raw bytes; disable transforms so trailing-whitespace (L07) survives intact.
    res.sendFile(path.join(content.dir, name), { dotfiles: 'deny', cacheControl: false });
  });

  router.post('/submit', requireTeamAuth(db), (req, res) => {
    const { stage_number, flag } = req.body || {};
    const stageNumber = parseInt(stage_number, 10);
    if (!stageNumber || !flag) return res.status(400).json({ ok: false, error: 'stage_number and flag required' });

    const result = handleSubmission(ctx, {
      team: req.team,
      stageNumber,
      rawFlag: flag,
      ip: clientIp(req),
      sessionToken: req.sessionToken,
      userAgent: req.headers['user-agent'],
    });
    res.status(result.status).json(result.body);
  });

  router.get('/leaderboard', (req, res) => {
    res.json({ ok: true, leaderboard: computeLeaderboard(db) });
  });

  router.get('/stream', (req, res) => {
    hub.attachPublic(res);
  });

  return router;
}

module.exports = { buildParticipantRouter };
