'use strict';
// Anti-cheat heuristics. Each check is independent, evidence-attached, and
// non-blocking (submissions are never silently dropped -- alerts are additive).
// Tunable windows/thresholds are constants below; tune after a dry run.

const SAME_FLAG_WINDOW_MS = 3 * 60 * 1000;      // same correct flag, different teams
const SHARED_IP_WINDOW_MS = 30 * 60 * 1000;     // same IP, different teams
const SAME_WRONG_GUESS_WINDOW_MS = 5 * 60 * 1000;
const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000;
const BRUTE_FORCE_THRESHOLD = 15;               // incorrect submissions, same team+stage, in window
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;         // suppress re-firing the same alert signature this often

function nowIso() { return new Date().toISOString(); }

// In-memory de-dupe so a persistent condition (e.g. two teams behind the same
// NAT for the whole event) raises one alert per window instead of one per
// submission. The underlying evidence is still fully logged in `submissions`
// either way -- this only throttles the *alert* noise, never the audit trail.
const lastAlertAt = new Map();
function shouldSuppressDuplicateAlert(signature, windowMs = DEDUPE_WINDOW_MS) {
  const now = Date.now();
  const last = lastAlertAt.get(signature);
  if (last && now - last < windowMs) return true;
  lastAlertAt.set(signature, now);
  return false;
}

function insertAlert(db, hub, { type, severity, stageNumber, teamIds, evidence }) {
  const stmt = db.prepare(`
    INSERT INTO anticheat_alerts (alert_type, severity, stage_number, team_ids, evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const createdAt = nowIso();
  const info = stmt.run(type, severity, stageNumber ?? null, JSON.stringify(teamIds), JSON.stringify(evidence), createdAt);
  const alert = {
    id: Number(info.lastInsertRowid),
    alert_type: type,
    severity,
    stage_number: stageNumber ?? null,
    team_ids: teamIds,
    evidence,
    created_at: createdAt,
  };
  if (hub) hub.broadcastOrganizer('anticheat_alert', alert);
  return alert;
}

/** Flag submitted for a stage the team has not unlocked yet (gating rejected it),
 *  AND it happens to be the correct flag for that stage -- strong signal of a
 *  leaked/shared flag rather than a lucky guess (guessing a full nodezero{...}
 *  string is not realistic). */
function checkPrematureCorrectSubmission(db, hub, submission) {
  if (submission.rejection_reason !== 'locked_stage' || !submission.would_have_been_correct) return;
  insertAlert(db, hub, {
    type: 'premature_correct_submission',
    severity: 'HIGH',
    stageNumber: submission.stage_number,
    teamIds: [submission.team_id],
    evidence: {
      submission_id: submission.id,
      team_id: submission.team_id,
      stage_number: submission.stage_number,
      server_ts: submission.server_ts,
      ip: submission.ip,
      reason: 'Submitted flag matches the correct flag for a stage this team has not unlocked (previous stage not solved). Likely leaked/shared flag or out-of-order access.',
    },
  });
}

/** Same correct flag (i.e. same stage solved) by 2+ distinct teams within a short window. */
function checkSameFlagMultipleTeams(db, hub, solve) {
  const others = db.prepare(`
    SELECT s.team_id, s.solved_at, s.solved_at_ms, t.code AS team_code
    FROM solves s JOIN teams t ON t.id = s.team_id
    WHERE s.stage_number = ? AND s.team_id != ? AND ABS(s.solved_at_ms - ?) <= ?
  `).all(solve.stage_number, solve.team_id, solve.solved_at_ms, SAME_FLAG_WINDOW_MS);

  if (others.length === 0) return;

  const teamIds = [solve.team_id, ...others.map((o) => o.team_id)];
  insertAlert(db, hub, {
    type: 'same_flag_multiple_teams',
    severity: 'HIGH',
    stageNumber: solve.stage_number,
    teamIds,
    evidence: {
      stage_number: solve.stage_number,
      this_team_id: solve.team_id,
      this_solved_at: solve.solved_at,
      other_teams: others.map((o) => ({ team_id: o.team_id, team_code: o.team_code, solved_at: o.solved_at })),
      window_ms: SAME_FLAG_WINDOW_MS,
      reason: `Stage ${solve.stage_number}'s flag was solved by ${teamIds.length} distinct teams within ${SAME_FLAG_WINDOW_MS / 1000}s of each other.`,
    },
  });
}

/** Solve time much faster than the stage's expected minimum -- inconsistent with difficulty. */
function checkAbnormallyFastSolve(db, hub, solve, expectedMinSeconds) {
  const prev = db.prepare(`
    SELECT solved_at_ms FROM solves WHERE team_id = ? AND stage_number = ? - 1
  `).get(solve.team_id, solve.stage_number);

  const baselineMs = prev ? prev.solved_at_ms : db.prepare(
    'SELECT strftime(\'%s\', created_at) * 1000 AS ms FROM teams WHERE id = ?'
  ).get(solve.team_id).ms;

  const elapsedSeconds = (solve.solved_at_ms - baselineMs) / 1000;
  if (elapsedSeconds >= expectedMinSeconds || elapsedSeconds < 0) return;

  insertAlert(db, hub, {
    type: 'abnormally_fast_solve',
    severity: 'MEDIUM',
    stageNumber: solve.stage_number,
    teamIds: [solve.team_id],
    evidence: {
      team_id: solve.team_id,
      stage_number: solve.stage_number,
      elapsed_seconds: Math.round(elapsedSeconds),
      expected_min_seconds: expectedMinSeconds,
      reason: `Solved stage ${solve.stage_number} in ${Math.round(elapsedSeconds)}s, well under the ${expectedMinSeconds}s difficulty floor.`,
    },
  });
}

/** Same source IP used by two different teams within a window -- shared network or shared session. */
function checkSharedIp(db, hub, submission) {
  if (!submission.ip) return;
  const others = db.prepare(`
    SELECT DISTINCT team_id FROM submissions
    WHERE ip = ? AND team_id != ? AND server_ts_ms >= ?
  `).all(submission.ip, submission.team_id, submission.server_ts_ms - SHARED_IP_WINDOW_MS);

  if (others.length === 0) return;
  const teamIds = [submission.team_id, ...others.map((o) => o.team_id)].sort((a, b) => a - b);
  if (shouldSuppressDuplicateAlert(`shared_ip:${submission.ip}:${teamIds.join(',')}`)) return;
  insertAlert(db, hub, {
    type: 'shared_ip_multiple_teams',
    severity: 'MEDIUM',
    stageNumber: submission.stage_number,
    teamIds,
    evidence: {
      ip: submission.ip,
      submission_id: submission.id,
      teams_sharing_ip: teamIds,
      window_ms: SHARED_IP_WINDOW_MS,
      reason: `IP ${submission.ip} was used by ${teamIds.length} distinct teams within ${SHARED_IP_WINDOW_MS / 60000} minutes.`,
    },
  });
}

/** The exact same wrong guess, submitted by 2+ different teams close together --
 *  suggests coordination (sharing incorrect attempts / a leaked partial). */
function checkSameWrongGuessAcrossTeams(db, hub, submission) {
  if (submission.is_correct) return;
  if (submission.normalized_flag.length < 6) return; // ignore trivially short noise
  const others = db.prepare(`
    SELECT team_id, server_ts FROM submissions
    WHERE normalized_flag = ? AND team_id != ? AND is_correct = 0
      AND server_ts_ms >= ?
  `).all(submission.normalized_flag, submission.team_id, submission.server_ts_ms - SAME_WRONG_GUESS_WINDOW_MS);

  if (others.length === 0) return;
  const teamIds = [submission.team_id, ...others.map((o) => o.team_id)];
  insertAlert(db, hub, {
    type: 'shared_wrong_guess',
    severity: 'LOW',
    stageNumber: submission.stage_number,
    teamIds,
    evidence: {
      guessed_value: submission.normalized_flag,
      submission_id: submission.id,
      teams: teamIds,
      window_ms: SAME_WRONG_GUESS_WINDOW_MS,
      reason: 'Identical incorrect submission from multiple teams in a short window.',
    },
  });
}

/** Excessive incorrect submissions for one team+stage in a short window -- brute forcing. */
function checkBruteForce(db, hub, submission) {
  if (submission.is_correct) return;
  const count = db.prepare(`
    SELECT COUNT(*) AS n FROM submissions
    WHERE team_id = ? AND stage_number = ? AND is_correct = 0 AND server_ts_ms >= ?
  `).get(submission.team_id, submission.stage_number, submission.server_ts_ms - BRUTE_FORCE_WINDOW_MS).n;

  if (count !== BRUTE_FORCE_THRESHOLD) return; // fire once when crossing the threshold
  insertAlert(db, hub, {
    type: 'brute_force_suspected',
    severity: 'MEDIUM',
    stageNumber: submission.stage_number,
    teamIds: [submission.team_id],
    evidence: {
      team_id: submission.team_id,
      stage_number: submission.stage_number,
      incorrect_count: count,
      window_ms: BRUTE_FORCE_WINDOW_MS,
      reason: `${count} incorrect submissions for stage ${submission.stage_number} within ${BRUTE_FORCE_WINDOW_MS / 60000} minutes.`,
    },
  });
}

module.exports = {
  checkPrematureCorrectSubmission,
  checkSameFlagMultipleTeams,
  checkAbnormallyFastSolve,
  checkSharedIp,
  checkSameWrongGuessAcrossTeams,
  checkBruteForce,
  insertAlert,
};
