---
name: verification-2026-07-02
description: What was tested end-to-end on 2026-07-02 and confirmed working, plus the DB was reset to clean state afterward
metadata:
  type: project
---

Session context: agent-memory dir was empty (no prior session notes existed
despite the code already being ~1400 lines of finished-looking backend), so
this session re-derived everything from reading the source, then verified it
end-to-end rather than trusting the code looked done. Event goes live
2026-07-04; today was 2026-07-02.

**Confirmed working by actually running the server and hitting the API**
(not just read-through):
- Boots cleanly on Node v22.13.1 / Windows 11 / Git Bash, `node:sqlite` works
  (experimental warning only, no errors).
- `POST /api/login`, `GET /api/me`, `GET /api/stages` — correct data, correct gating flags.
- `POST /api/submit`: wrong flag, correct flag, re-submit after already-solved
  (idempotent, doesn't double-count), locked-stage gating (403 + still logged),
  rate limiting (8/15s per team, confirmed 429 kicks in exactly on schedule,
  confirmed rejected attempts are STILL written to `submissions` with
  `rejection_reason='rate_limited'` — nothing is silently dropped).
- `GET /api/leaderboard` — correct ordering, confirmed against a real 10-stage
  race (see below).
- Organizer: `/teams`, `/submissions` (with `team_code`/`stage` filters),
  `/alerts` (with `severity`/`stage`/`reviewed` filters), `/alerts/:id/review`,
  `/activity`, bad-key rejection (401 confirmed).
- SSE: both `/api/stream` (public) and `/api/organizer/stream` (organizer) —
  confirmed live push arrives within the same second an event happens (watched
  `anticheat_alert` and `submission` events land on an open organizer stream
  while a submission happened concurrently in another terminal).
- Anti-cheat: see [[anticheat-heuristics]] for exactly which checks were
  confirmed firing.
- Full 10-stage race: manually walked TEAM06 then TEAM07 through all 10
  stages (using the real Stage 1/2 flags and the current placeholder text for
  Stages 3-10, since that's what's actually hashed into the DB right now).
  Confirmed `is_finale: true` fires only on stage 10, confirmed leaderboard
  rank 1 went to whichever team's stage-10 `solved_at_ms` was earlier. This is
  where the `is_champion` bug was found — see [[champion-field-fix]].

**Fixed this session**:
- Created `ctf-website/BACKEND_NOTES.md` (was referenced by `server.js` line 4
  but didn't exist) — explains why a custom backend exists alongside the CTFd
  docker-compose path, full architecture/schema/anti-cheat/run instructions.
  See [[ctfd-vs-custom-backend]].
- Fixed the `is_champion` vs `is_winner` leaderboard bug — see [[champion-field-fix]].

**Cleanup**: ran `npm run reset-db` then a clean `npm start` at the end of the
session to wipe all the test-team activity generated during verification
(TEAM06/TEAM07 full completions, dozens of test submissions/alerts) so the
DB is back to a fresh, unsolved state for the next real session or dry run.
Confirmed the reseed produces 10 stages + 8 fresh demo teams with new
credentials/organizer key as expected.

**Not tested / not touched (out of scope)**:
- Did not author real flags for stages 3-10 — explicitly out of scope
  ("content, not backend" per the task). Backend correctly seeds/gates
  whatever's in each `challenge.yml` and logs which stages are still
  `REPLACE` placeholders on every boot.
- Did not test literal concurrent/simultaneous requests (e.g. two processes
  racing the same team+stage at the exact same millisecond) — the race
  safety argument is structural (see [[schema-and-race-safety]]), not
  empirically fired with concurrent load. If this needs empirical proof
  before go-live, that's the next thing to script (e.g. fire N parallel
  `fetch` calls at `/api/submit` for the same team+stage and confirm exactly
  one `solves` row + N-1 "already_solved" responses).
- No load/stress testing (8 teams is a small event; unlikely to matter, but
  not verified).
