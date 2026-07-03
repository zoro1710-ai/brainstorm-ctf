'use strict';
// Small in-memory sliding-window rate limiter for flag submissions.
// Scoped per team_id (not per IP) since teams are pre-provisioned accounts, not
// anonymous users -- this stops one compromised/scripted team from hammering
// the endpoint without punishing everyone behind a shared NAT/IP.

const WINDOW_MS = 15000;
const MAX_ATTEMPTS = 8;

const hits = new Map(); // team_id -> array of timestamps (ms)

function allow(teamId) {
  const now = Date.now();
  const arr = (hits.get(teamId) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(teamId, arr);
  return arr.length <= MAX_ATTEMPTS;
}

module.exports = { allow, WINDOW_MS, MAX_ATTEMPTS };
