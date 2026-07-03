---
name: schema-and-race-safety
description: DB schema (teams/sessions/stages/submissions/solves/alerts) and how single-winner race safety is enforced
metadata:
  type: project
---

Full schema lives in `backend/src/db.js` (`SCHEMA` const) — read that file directly
for the authoritative field list, this is the design rationale layer on top.

**Tables**: `teams`, `sessions`, `stages` (seeded from challenge.yml, `flag_hash` is
sha256 of normalized flag, `requires_stage` encodes the linear 10-stage gate,
`expected_min_seconds` is the anti-cheat speed floor per stage — 45s for stages
1-3, 90s for 4-7, 180s for 8-10), `submissions` (append-only, every attempt logged
including rejected/rate-limited ones), `solves` (append-only, `UNIQUE(team_id,
stage_number)`), `anticheat_alerts` (append-only, evidence as JSON), `alert_reviews`
(append-only notes, never overwrite the alert).

**Single-winner / first-finisher race safety**: `solves.UNIQUE(team_id,
stage_number)` plus `node:sqlite` being synchronous/single-threaded within one
Node process plus the solve insert being wrapped in `BEGIN IMMEDIATE`/`COMMIT`
in `src/submit.js` (`handleSubmission`) means two near-simultaneous correct
submissions for the same team+stage can't both create a solve row — the second
hits the UNIQUE constraint, catches it, and returns "already_solved". This was
verified by design review, not by literally firing concurrent requests (single
Node process makes a genuine race hard to construct in a quick test) — the
proof is structural: node:sqlite has no async gap where two writes interleave.

**Flags**: stored as sha256 hex only (`stages.flag_hash`); raw flag text never
persisted except in the append-only `submissions.raw_flag` (needed for anti-cheat
"same wrong guess across teams" comparisons) — that table is organizer-only.
Comparison is `crypto.timingSafeEqual` (constant-time), see `src/crypto-utils.js`.

**Leaderboard ranking** (`src/leaderboard.js`, `computeLeaderboard`): sort by (1)
most stages cleared desc, (2) earliest `solved_at_ms` of the highest-cleared stage
asc (ties break here — this is what makes it a *race* ranking, not a score-sum
ranking), (3) fewest incorrect submissions asc, (4) team_id asc (stable fallback).
This matches `IEEE_RAS_CTF_Plan.md` §4. See [[champion-field-fix]] for a real bug
found in how "the winner" was surfaced from this ranking.
