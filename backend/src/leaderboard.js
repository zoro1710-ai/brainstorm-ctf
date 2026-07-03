'use strict';
// Leaderboard ranking per IEEE_RAS_CTF_Plan.md section 4:
//   rank by (1) most stages cleared, then (2) earliest timestamp of their
//   highest-cleared stage (this collapses to "earliest Stage-10 timestamp"
//   once a team reaches the finale), then (3) fewest incorrect submissions.
//
// Single-winner note: `is_winner` means "has cleared all stages" -- once the
// event runs long enough, MORE THAN ONE team can be true here. That is
// correct (several teams may eventually finish the trail) but it is NOT the
// same as "gets the physical kit." The kit goes to whoever finished FIRST,
// which is unambiguously the rank===1 row (rank already breaks ties on
// earliest last_solve_at_ms, and solved_at_ms is immutable/append-only, so
// the rank-1 finisher can never be displaced retroactively). We surface that
// explicitly as `is_champion` so the UI/organizers never have to infer it
// from `rank === 1 && is_winner` themselves.

function computeLeaderboard(db) {
  const teams = db.prepare('SELECT id, code, name FROM teams ORDER BY id').all();
  const maxStage = (db.prepare('SELECT MAX(stage_number) AS m FROM stages').get() || {}).m || 10;

  const rows = teams.map((team) => {
    const solves = db.prepare(
      'SELECT stage_number, solved_at, solved_at_ms FROM solves WHERE team_id = ? ORDER BY stage_number ASC'
    ).all(team.id);

    const stagesCleared = solves.length;
    const top = solves[solves.length - 1]; // highest stage_number solved (linear trail)
    const incorrectCount = db.prepare(
      'SELECT COUNT(*) AS n FROM submissions WHERE team_id = ? AND is_correct = 0'
    ).get(team.id).n;

    const score = solves.reduce((sum, s) => sum + s.stage_number * 100, 0);
    const isWinner = stagesCleared >= maxStage; // finished the finale (may be true for >1 team)

    return {
      team_id: team.id,
      team_code: team.code,
      team_name: team.name,
      stages_cleared: stagesCleared,
      current_stage: top ? top.stage_number : 0,
      score,
      last_solve_at: top ? top.solved_at : null,
      last_solve_at_ms: top ? top.solved_at_ms : 0,
      incorrect_submissions: incorrectCount,
      is_winner: isWinner,
    };
  });

  rows.sort((a, b) => {
    if (b.stages_cleared !== a.stages_cleared) return b.stages_cleared - a.stages_cleared;
    // fewer stages cleared than 1 => no solves yet => keep stable by team_id
    if (a.stages_cleared === 0 && b.stages_cleared === 0) return a.team_id - b.team_id;
    if (a.last_solve_at_ms !== b.last_solve_at_ms) return a.last_solve_at_ms - b.last_solve_at_ms;
    if (a.incorrect_submissions !== b.incorrect_submissions) return a.incorrect_submissions - b.incorrect_submissions;
    return a.team_id - b.team_id;
  });

  // The single physical-kit champion: the rank-1 row, but only once someone
  // has actually finished. Race-safe by construction (see note above) --
  // this bit can only ever "turn on" once, for exactly one team, and never
  // flips to a different team afterward.
  return rows.map((r, i) => ({ rank: i + 1, ...r, is_champion: i === 0 && r.is_winner }));
}

module.exports = { computeLeaderboard };
