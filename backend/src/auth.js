'use strict';
const { verifyPassword, randomToken } = require('./crypto-utils');

function nowIso() { return new Date().toISOString(); }

function login(db, { code, password, ip, userAgent }) {
  const team = db.prepare('SELECT * FROM teams WHERE code = ?').get(String(code || '').toUpperCase());
  if (!team) return null;
  if (!verifyPassword(password, team.password_salt, team.password_hash)) return null;

  // Only one active session per team -- a fresh login invalidates any other
  // device/tab already logged in as this team (anti-share: a shared team
  // code/password can't be used by two people at once).
  db.prepare('DELETE FROM sessions WHERE team_id = ?').run(team.id);

  const token = randomToken(32);
  db.prepare(`
    INSERT INTO sessions (token, team_id, created_at, last_seen_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, team.id, nowIso(), nowIso(), ip || null, userAgent || null);

  return { token, team: { id: team.id, code: team.code, name: team.name } };
}

/** Express middleware: requires `Authorization: Bearer <token>`, attaches req.team + req.sessionToken.
 *  Also accepts the token via `?token=` query param so plain browser navigations (e.g. <a download>
 *  file links, which cannot set an Authorization header) can authenticate the same way. */
function requireTeamAuth(db) {
  return (req, res, next) => {
    const header = req.headers['authorization'] || '';
    let token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token && req.query && req.query.token) token = String(req.query.token).trim();
    if (!token) return res.status(401).json({ ok: false, error: 'missing bearer token' });

    const session = db.prepare(`
      SELECT s.token, t.id AS team_id, t.code, t.name
      FROM sessions s JOIN teams t ON t.id = s.team_id
      WHERE s.token = ?
    `).get(token);
    if (!session) return res.status(401).json({ ok: false, error: 'invalid or expired session' });

    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(nowIso(), token);
    req.team = { id: session.team_id, code: session.code, name: session.name };
    req.sessionToken = token;
    next();
  };
}

/** Express middleware: requires the organizer API key via header or ?key= query (for EventSource). */
function requireOrganizerAuth(organizerKey) {
  return (req, res, next) => {
    const provided = req.headers['x-organizer-key'] || req.query.key;
    if (provided !== organizerKey) return res.status(401).json({ ok: false, error: 'invalid organizer key' });
    next();
  };
}

/** Best-effort real client IP, accounting for a local reverse proxy if one is added later. */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress;
}

module.exports = { login, requireTeamAuth, requireOrganizerAuth, clientIp };
