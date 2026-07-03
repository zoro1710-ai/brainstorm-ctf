---
name: champion-field-fix
description: Real bug found+fixed 2026-07-02 — is_winner could be true for multiple teams, both public UIs showed multiple "KIT" winners
metadata:
  type: project
---

**The bug**: `computeLeaderboard()` in `src/leaderboard.js` set `is_winner =
stagesCleared >= maxStage` — true for ANY team that finished all 10 stages,
not just the first. Once a second team also finished the trail (verified by
manually racing two demo teams through all 10 stages, using placeholder
`REPLACE_*` flag text since stages 3-10 aren't authored yet), both
`public/participant-live.html` (`r.is_winner ? ' *KIT*' : ''`) and
`public/organizer.html` (`t.is_winner ? 'YES - KIT' : ''`) rendered BOTH teams
as the kit winner. For a single-physical-kit event this is exactly the kind
of integrity bug that matters — an organizer skimming the dashboard could
believe there's a dispute or that the second finisher also won.

**The fix**: `computeLeaderboard()` now also returns `is_champion`, computed
AFTER sorting as `i === 0 && r.is_winner` (i.e. true only for the rank-1 row,
and only once someone has actually finished). Because ranking ties break on
immutable `solved_at_ms` ([[schema-and-race-safety]]), this can only ever be
true for one team and — critically — can never flip to a different team
later (the first finisher's timestamp never changes; a later finisher always
sorts to rank 2+). Both HTML files were updated to key the "*KIT*" / "YES -
KIT WINNER" badge off `is_champion`, with `is_winner` (now shown as
"(finished)" / "finished (not first)") kept as separate, still-useful info
("this team completed the whole trail, just not first").

**Don't revert this** — `is_winner` alone is NOT sufficient to answer "who
gets the kit," only `is_champion` is. If either HTML file or any future
frontend/consumer needs "who won" logic, it must read `is_champion`, not
`is_winner`. Verified via `GET /api/leaderboard` after the fix: first-finisher
(TEAM06 in the test) showed `is_champion: true`, second-finisher (TEAM07)
showed `is_winner: true, is_champion: false`.
