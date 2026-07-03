# Backend notes — custom Node.js backend vs. the CTFd path

`README.md` in this folder documents a **CTFd** deployment (`docker-compose.yml`).
That path is still valid and is the lowest-effort way to run NODE ZERO. The
`backend/` folder is a **second, custom-built backend** that supersedes it for
this event. This file explains why, and how to run/operate the custom one.

## Why not just use CTFd

CTFd gets you flags, a scoreboard, and admin for free, and the README above
documents that path in full. It was built first. It was set aside for the
actual event because of three requirements specific to this event that CTFd
doesn't give you out of the box:

1. **Single physical kit to the first finisher.** CTFd's scoreboard ranks by
   points, with earliest-last-solve as an incidental tiebreak. That's "close
   enough" for a leaderboard, but this event needs the *first-finisher*
   determination itself to be race-safe and auditable (append-only, immutable
   solve timestamps, no way for a later action to retroactively change who
   "won"), not just a UI sort order.
2. **Anti-cheat / flag-sharing detection.** CTFd doesn't ship heuristics for
   "same correct flag from two teams within seconds," "flag submitted before
   the team reached that stage," shared-IP detection, brute-force detection,
   etc. Building these requires access to the raw submission stream, which
   means owning the submission endpoint.
3. **Organizer observability.** The event needs a queryable, human-readable,
   append-only activity log (who did what, when, from where, why flagged) as
   a first-class feature, not something bolted on via CTFd's admin export.

None of that is impossible in CTFd (plugins could get you there), but for an
8-team, 10-stage, single-organizer event, a ~1,400-line purpose-built Node
service was faster to get right and easier to fully audit than a CTFd plugin.

**If you want the CTFd path instead**, follow `README.md` — it's complete and
independent of everything below. Don't run both against the same "real" flags
simultaneously; pick one before go-live.

## Stack (backend/)

- **Node.js (>=22.5.0) + Express** — HTTP layer.
- **`node:sqlite`** (built-in, synchronous, single-file, no native deps to
  install) — all persistence. WAL mode, foreign keys on.
- **Server-Sent Events** (`src/sse.js`) — real-time push for the leaderboard,
  live solves, and organizer alerts. No socket.io; SSE is one-way and enough
  for this event, and needs zero client-side library.
- No auth framework — bearer tokens for teams (`sessions` table), a single
  shared API key for the organizer surface (`data/organizer_api_key.txt`).

## Running it

```bash
cd backend
npm install
npm start                 # boots on :3000, seeds stages + 8 demo teams on first run
npm run reset-db          # wipe local DB + credentials, next `npm start` reseeds fresh
```

On first boot it prints the organizer key and writes:
- `data/organizer_api_key.txt` — organizer API key (gitignored)
- `data/team_credentials.csv` — one row per demo team: code / name / password (gitignored)
- `data/nodezero.db(-wal/-shm)` — the live database (gitignored)

Participant UI: `http://localhost:3000/participant-live.html`
Organizer UI: `http://localhost:3000/organizer.html?key=<organizer key>`

Stages are seeded directly from `../challenges/L0*-*/challenge.yml` on every
boot (upsert, so editing a `challenge.yml` and restarting picks up the
change). **Stages 3–10 currently have `REPLACE` placeholder flags** in their
`challenge.yml` — the backend detects this (`/REPLACE/` regex) and logs which
stage numbers are still placeholders on every startup. Only Stages 1 and 2
have real, finished flags as of this writing. This is a content/authoring gap,
not a backend gap — the backend seeds and gates whatever flag text is present.

## Schema (`src/db.js`)

- `teams` — one row per team, scrypt-hashed password.
- `sessions` — bearer tokens, one per login (not expired/rotated currently).
- `stages` — seeded from `challenge.yml`; `flag_hash` is sha256 of the
  normalized flag, never the raw flag; `requires_stage` encodes the linear
  gate; `expected_min_seconds` is the anti-cheat "too fast" floor per stage.
- `submissions` — **append-only**, every attempt (correct, incorrect,
  rate-limited, locked-stage) with server timestamp (ISO + epoch ms +
  `process.hrtime.bigint()` monotonic ns), IP, session token, user agent.
  Nothing is ever silently dropped without a row here.
- `solves` — **append-only**, first-correct-submission per team+stage.
  `UNIQUE(team_id, stage_number)` is the single-winner / no-double-solve
  guarantee. Combined with `node:sqlite` being synchronous/single-threaded in
  one process, and the solve insert wrapped in `BEGIN IMMEDIATE`/`COMMIT`,
  first-finisher determination is race-free by construction — see
  `src/submit.js`.
- `anticheat_alerts` — **append-only**, evidence attached as JSON, severity
  labeled.
- `alert_reviews` — organizer notes on an alert, appended, never overwrites
  the alert itself.

## Flag handling

`src/crypto-utils.js`: flags are normalized (trim only, case-sensitive),
sha256-hashed, and compared with `crypto.timingSafeEqual` (constant-time).
The raw flag text is never stored except inside the append-only `submissions`
log (needed so anti-cheat can compare "did two teams submit the exact same
wrong guess" etc.) — that table is organizer-only.

## First-finisher / single-winner logic (`src/leaderboard.js`)

Ranking: most stages cleared, then earliest timestamp of the highest stage
solved (collapses to "earliest Stage-10 timestamp" once a team finishes),
then fewest incorrect submissions, per `IEEE_RAS_CTF_Plan.md` §4. This is a
**race** ranking (completion order + time), not a point-accumulation ranking.

Two leaderboard fields matter and are easy to conflate:
- `is_winner` — **has cleared all 10 stages.** Can be `true` for more than
  one team once the event has run long enough (several teams may eventually
  finish the trail).
- `is_champion` — **is the physical-kit winner**, i.e. rank === 1 AND
  `is_winner`. True for **at most one team, ever**, and — because rank
  ties break on immutable `solved_at_ms` — cannot be displaced by a later
  event once set. Both `public/participant-live.html` and
  `public/organizer.html` render the "*KIT*" badge off `is_champion`, not
  `is_winner`. (This was a real bug found and fixed 2026-07-02: both UIs were
  keying the KIT badge off `is_winner`, which showed multiple "winners" once
  more than one team finished. See agent-memory for detail.)

## Anti-cheat (`src/anticheat.js`)

Six independent, non-blocking, evidence-attached checks, fired from
`src/submit.js` at the relevant point in the pipeline:
- `premature_correct_submission` — correct flag for a stage the team hasn't
  unlocked yet (strong leaked-flag signal; guessing a full `nodezero{...}` by
  chance is not realistic).
- `same_flag_multiple_teams` — same stage solved by 2+ teams within 3 min.
- `abnormally_fast_solve` — solved faster than the stage's `expected_min_seconds`.
- `shared_ip_multiple_teams` — same IP, 2+ teams, within 30 min (de-duped
  in-memory per IP+team-set signature so a persistent shared NAT doesn't spam
  alerts; the underlying submission rows are still all logged regardless).
- `shared_wrong_guess` — identical incorrect submission from 2+ teams within 5 min.
- `brute_force_suspected` — 15+ incorrect submissions, same team+stage, within 5 min.

All alerts are readable via `GET /api/organizer/alerts` (filterable by
severity/stage/reviewed) and pushed live over the organizer SSE stream.

## Verified this session (2026-07-02)

Booted the server end-to-end and exercised: login, `/me`, `/stages`, wrong/
correct/duplicate/locked-stage submissions, rate limiting (8 attempts / 15s
per team, still logs rejected attempts), the full leaderboard, all organizer
read endpoints, alert review, the live SSE feed (both channels, confirmed
real-time push on submission), and a full synthetic 10-stage race for two
teams to confirm finale detection and first-vs-second-finisher ranking. See
agent-memory (`backend/.claude/agent-memory/ctf-backend-engineer/`) for the
full verification log and any future-session context.

## Known gaps / open items

- Stages 3–10 still need real flags authored in their `challenge.yml`
  (content work, not backend — the backend already handles it correctly
  either way and logs which stages are placeholders on boot).
- Sessions never expire/rotate. Fine for a short event; revisit if the event
  runs multi-day.
- Rate limiter and anti-cheat de-dupe state are in-memory (`Map`), so they
  reset on process restart. The underlying audit trail (`submissions`,
  `anticheat_alerts`) does not reset — only the throttling state does.
- No HTTPS/reverse-proxy config included here; put one in front of this for
  the real event the same way the CTFd README recommends for that path.
