---
name: backend-architecture
description: Stack, file map, and run/reset commands for the NODE ZERO CTF custom backend
metadata:
  type: project
---

The backend (`ctf-website/backend/`) is a custom Node.js + Express + `node:sqlite`
(built-in, synchronous) + Server-Sent Events service — NOT the CTFd stack in
`ctf-website/docker-compose.yml`. Both exist in the repo; the custom one is what's
actually used for the event. Full rationale in [[ctfd-vs-custom-backend]] and in
`ctf-website/BACKEND_NOTES.md` (this file is referenced from `server.js` line 4 —
it exists now, don't let it go stale).

**File map** (~1400 lines total):
- `server.js` — entry point, wires everything together, prints organizer key/URLs on boot.
- `src/db.js` — schema (`SCHEMA` const), seeds `stages` from `../../challenges/L*/challenge.yml`
  on every boot (upsert — editing a challenge.yml and restarting picks up changes),
  seeds 8 demo teams once (idempotent, checks `COUNT(*) FROM teams`), writes
  `data/organizer_api_key.txt` and `data/team_credentials.csv`.
- `src/auth.js` — team login (bearer token sessions), `requireTeamAuth`,
  `requireOrganizerAuth` (shared API key via header or `?key=`), `clientIp`.
- `src/crypto-utils.js` — flag normalize/hash/constant-time verify, scrypt password hashing.
- `src/rate-limit.js` — in-memory sliding window, 8 attempts / 15s, per team_id.
- `src/submit.js` — the submission pipeline: rate-limit -> idempotency -> gating ->
  constant-time verify -> append-only log -> atomic solve insert -> broadcast -> anti-cheat.
- `src/anticheat.js` — see [[anticheat-heuristics]].
- `src/leaderboard.js` — see [[schema-and-race-safety]] and [[champion-field-fix]].
- `src/sse.js` — two SSE channels (public, organizer), no socket.io.
- `src/routes/participant.js` — `/api/login`, `/me`, `/stages`, `/submit`, `/leaderboard`, `/stream`.
- `src/routes/organizer.js` — `/api/organizer/{teams,submissions,solves,alerts,alerts/:id/review,activity,credentials-hint,stream}`.
- `public/participant-live.html`, `public/organizer.html` — plain JS/fetch/EventSource, no build step.
- `scripts/reset-db.js` — deletes `data/nodezero.db*`, `team_credentials.csv`, `organizer_api_key.txt`. Next `npm start` reseeds fresh.

**Run**: `cd backend && npm install && npm start` (Node >=22.5.0 required for `node:sqlite`).
Confirmed working on Node v22.13.1, Windows 11 + Git Bash, as of 2026-07-02.

**Reset for a clean demo/test state**: `npm run reset-db` then `npm start`. Do this
before handing off to organizers so stale test-team activity isn't in the DB —
I did this at the end of the 2026-07-02 session (see [[verification-2026-07-02]]).
