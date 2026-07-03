---
name: ctfd-vs-custom-backend
description: Why ctf-website/backend/ (custom Node backend) exists alongside ctf-website/docker-compose.yml (CTFd) — both are real, only one is used for the event
metadata:
  type: project
---

`ctf-website/README.md` documents a full CTFd deployment path
(`docker-compose.yml` = CTFd + MariaDB + Redis, reskinned via theme injection).
That path is genuinely complete and was built first — it is NOT dead/stale
code, it's a valid alternative deployment. The custom backend in
`ctf-website/backend/` was built afterward and is what's actually intended
for the live event, because CTFd doesn't natively give three things this
event needs: race-safe single-first-finisher determination (not just a
points-based scoreboard), anti-cheat/flag-sharing heuristics, and an
append-only organizer-readable activity log. Full explanation now lives in
`ctf-website/BACKEND_NOTES.md` (created 2026-07-02, was previously referenced
by `server.js` but didn't exist — this was one of the loose ends from a prior
session that got fixed).

**If asked to work on "the CTF backend" going forward**: default to
`ctf-website/backend/` (the custom one) unless the user specifically says
CTFd/docker-compose. If touching `README.md` or `docker-compose.yml`,
confirm with the user first — that's the other, independent path and
shouldn't be assumed dead.
