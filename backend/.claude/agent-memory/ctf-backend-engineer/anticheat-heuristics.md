---
name: anticheat-heuristics
description: The 6 anti-cheat checks implemented in src/anticheat.js, their thresholds, and confirmation they fire correctly
metadata:
  type: project
---

All in `backend/src/anticheat.js`, called from `backend/src/submit.js` at the
relevant point in the submission pipeline. Each is independent, non-blocking
(never drops/delays the submission response), and writes an evidence-attached
row to `anticheat_alerts` (severity labeled) plus broadcasts it live on the
organizer SSE channel.

1. `checkPrematureCorrectSubmission` (HIGH) — flag matches the correct answer
   for a stage the team hasn't unlocked (gating rejected it as `locked_stage`
   but the flag would've been correct). Strong leaked-flag signal.
2. `checkSameFlagMultipleTeams` (HIGH) — same stage solved by 2+ teams within
   `SAME_FLAG_WINDOW_MS` = 3 min.
3. `checkAbnormallyFastSolve` (MEDIUM) — solved faster than
   `stages.expected_min_seconds` for that stage (elapsed = this solve's
   `solved_at_ms` minus previous-stage solve time, or team creation time for
   stage 1).
4. `checkSharedIp` (MEDIUM) — same IP used by 2+ distinct teams within
   `SHARED_IP_WINDOW_MS` = 30 min. In-memory de-dupe (`lastAlertAt` Map,
   5 min window) so a persistent shared NAT for the whole event fires one
   alert per window instead of one per submission — the underlying
   `submissions` rows are NOT throttled, only the alert noise is.
5. `checkSameWrongGuessAcrossTeams` (LOW) — identical incorrect submission
   (normalized, >=6 chars) from 2+ teams within `SAME_WRONG_GUESS_WINDOW_MS` = 5 min.
6. `checkBruteForce` (MEDIUM) — fires exactly once when a team+stage crosses
   `BRUTE_FORCE_THRESHOLD` = 15 incorrect submissions within `BRUTE_FORCE_WINDOW_MS` = 5 min.

**Confirmed firing live** on 2026-07-02: triggered `same_flag_multiple_teams`,
`shared_ip_multiple_teams`, and `premature_correct_submission` by hand (two
demo teams submitting the same correct Stage-1 flag, one team probing a
locked Stage-2 with its real flag) and watched them (a) get persisted to
`anticheat_alerts`, (b) show up on `GET /api/organizer/alerts`, and (c) arrive
live over `GET /api/organizer/stream` as `anticheat_alert` SSE events, within
the same second they were generated. `checkAbnormallyFastSolve` also fired
organically (curl submissions are obviously much faster than
`expected_min_seconds`, which is expected/correct behavior in dev testing —
in production these floors (45s/90s/180s) are a rough guess "tune post
dry-run" per the code comment; revisit after a real team does a real solve
so the floors aren't calibrated only off developer curl timing).

Alert review: `POST /api/organizer/alerts/:id/review` appends to
`alert_reviews` (never mutates the alert) — confirmed working, and
`GET /api/organizer/alerts?reviewed=true|false` filters correctly on it.

Thresholds are untuned production guesses — flagged in the code as
"tune after a dry run." Worth revisiting once real participant timing data
exists, especially `expected_min_seconds` per stage tier.
