'use strict';
// The core, server-authoritative flag submission pipeline.
// Every call here does, in order: rate-limit -> idempotency check -> stage
// gating -> constant-time flag verification -> append-only logging -> (on a
// new correct answer) atomic solve insert -> leaderboard broadcast -> anti-cheat.
//
// Nothing about correctness, gating, or scoring is ever decided on the client.

const rateLimit = require('./rate-limit');
const { normalizeFlag, verifyFlag } = require('./crypto-utils');
const anticheat = require('./anticheat');
const { computeLeaderboard } = require('./leaderboard');

function nowIso() { return new Date().toISOString(); }

function logSubmission(db, row) {
  const stmt = db.prepare(`
    INSERT INTO submissions
      (team_id, stage_number, raw_flag, normalized_flag, is_correct, rejection_reason,
       server_ts, server_ts_ms, monotonic_ns, ip, session_token, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    row.team_id, row.stage_number, row.raw_flag, row.normalized_flag,
    row.is_correct ? 1 : 0, row.rejection_reason || null,
    row.server_ts, row.server_ts_ms, row.monotonic_ns,
    row.ip || null, row.session_token || null, row.user_agent || null,
  );
  return { id: Number(info.lastInsertRowid), ...row };
}

function handleSubmission(ctx, { team, stageNumber, rawFlag, ip, sessionToken, userAgent }) {
  const { db, hub } = ctx;
  const serverTsMs = Date.now();
  const common = {
    team_id: team.id,
    stage_number: stageNumber,
    raw_flag: String(rawFlag ?? ''),
    normalized_flag: normalizeFlag(rawFlag),
    server_ts: nowIso(),
    server_ts_ms: serverTsMs,
    monotonic_ns: process.hrtime.bigint().toString(),
    ip: ip || null,
    session_token: sessionToken || null,
    user_agent: userAgent || null,
  };

  const stage = db.prepare('SELECT * FROM stages WHERE stage_number = ?').get(stageNumber);
  if (!stage) {
    return { status: 404, body: { ok: false, error: 'no such stage' } };
  }

  // Rate limit (per team). Still logged for observability, never silently dropped.
  if (!rateLimit.allow(team.id)) {
    const isCorrect = verifyFlag(rawFlag, stage.flag_hash);
    const submission = logSubmission(db, { ...common, is_correct: isCorrect, rejection_reason: 'rate_limited' });
    anticheat.checkSharedIp(db, hub, submission);
    return { status: 429, body: { ok: false, error: 'too many submissions, slow down' } };
  }

  const alreadySolved = db.prepare('SELECT 1 FROM solves WHERE team_id = ? AND stage_number = ?').get(team.id, stageNumber);
  if (alreadySolved) {
    const isCorrect = verifyFlag(rawFlag, stage.flag_hash);
    const submission = logSubmission(db, { ...common, is_correct: isCorrect, rejection_reason: 'already_solved' });
    anticheat.checkSharedIp(db, hub, submission);
    return { status: 200, body: { ok: true, already_solved: true, message: 'Stage already solved by your team.' } };
  }

  // Gating: stage N (N>1) requires stage N-1 solved by THIS team.
  if (stage.requires_stage) {
    const prevSolved = db.prepare('SELECT 1 FROM solves WHERE team_id = ? AND stage_number = ?').get(team.id, stage.requires_stage);
    if (!prevSolved) {
      const wouldHaveBeenCorrect = verifyFlag(rawFlag, stage.flag_hash);
      const submission = logSubmission(db, {
        ...common, is_correct: wouldHaveBeenCorrect, rejection_reason: 'locked_stage',
      });
      submission.would_have_been_correct = wouldHaveBeenCorrect;
      anticheat.checkPrematureCorrectSubmission(db, hub, submission);
      anticheat.checkSharedIp(db, hub, submission);
      return { status: 403, body: { ok: false, error: `stage ${stageNumber} is locked -- clear stage ${stage.requires_stage} first` } };
    }
  }

  const isCorrect = verifyFlag(rawFlag, stage.flag_hash);
  const submission = logSubmission(db, { ...common, is_correct: isCorrect, rejection_reason: null });
  anticheat.checkSharedIp(db, hub, submission);

  if (!isCorrect) {
    anticheat.checkSameWrongGuessAcrossTeams(db, hub, submission);
    anticheat.checkBruteForce(db, hub, submission);
    if (hub) hub.broadcastOrganizer('submission', { ...submission, team_code: team.code });
    return { status: 200, body: { ok: true, correct: false, message: 'incorrect flag' } };
  }

  // Correct: atomically award the solve. UNIQUE(team_id, stage_number) is the
  // single-winner guard; node:sqlite is synchronous/single-threaded so this
  // whole handler already runs to completion before the next request starts.
  db.exec('BEGIN IMMEDIATE');
  let solve;
  try {
    const solvedAt = nowIso();
    const solvedAtMs = Date.now();
    const stmt = db.prepare(`
      INSERT INTO solves (team_id, stage_number, submission_id, solved_at, solved_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(team.id, stageNumber, submission.id, solvedAt, solvedAtMs);
    solve = {
      id: Number(info.lastInsertRowid),
      team_id: team.id,
      stage_number: stageNumber,
      submission_id: submission.id,
      solved_at: solvedAt,
      solved_at_ms: solvedAtMs,
    };
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    // UNIQUE violation means a solve already landed for this team+stage
    // (should be caught by the alreadySolved check above; this is defense in depth).
    return { status: 200, body: { ok: true, already_solved: true, message: 'Stage already solved by your team.' } };
  }

  anticheat.checkSameFlagMultipleTeams(db, hub, solve);
  anticheat.checkAbnormallyFastSolve(db, hub, solve, stage.expected_min_seconds);

  const leaderboard = computeLeaderboard(db);
  if (hub) {
    hub.broadcastPublic('leaderboard_update', leaderboard);
    hub.broadcastPublic('solve', {
      team_code: team.code, team_name: team.name, stage_number: stageNumber, solved_at: solve.solved_at,
    });
    hub.broadcastOrganizer('submission', { ...submission, team_code: team.code });
    hub.broadcastOrganizer('solve', { ...solve, team_code: team.code });
  }

  const isFinale = !db.prepare('SELECT 1 FROM stages WHERE requires_stage = ?').get(stageNumber);
  return {
    status: 200,
    body: {
      ok: true,
      correct: true,
      stage_number: stageNumber,
      points: stage.points,
      solved_at: solve.solved_at,
      is_finale: isFinale,
      message: isFinale ? 'SIGNAL RECOVERED -- Unit Zero fully awake. Check the leaderboard for finisher order.' : 'Correct. Next stage unlocked.',
    },
  };
}

module.exports = { handleSubmission };
