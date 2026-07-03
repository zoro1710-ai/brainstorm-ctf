'use strict';
// One-shot: replace the `teams` roster with your OWN list for the real event, and
// wipe all prior play data (submissions / solves / sessions / anti-cheat alerts) so
// the event starts from a clean slate. Passwords are hashed with the exact same
// scrypt helper the login path uses, so the credentials work immediately.
//
// Run it on the machine that owns the database (e.g. inside `railway ssh`):
//   1) Create a plain-text team list at  data/custom_teams.csv  — one team per line:
//          TEAM01,alpha_squad,somePassword123
//          TEAM02,bravo_squad,anotherPass456
//      (A `team_code,team_name,password` header line is optional and ignored.)
//   2) node scripts/set-teams.js
//
// It rewrites data/team_credentials.csv to match, so the organizer copy stays in
// sync. Re-runnable: every run fully replaces the roster.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('../src/crypto-utils');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'nodezero.db');
const INPUT_PATH = process.env.TEAMS_CSV || path.join(DATA_DIR, 'custom_teams.csv');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'team_credentials.csv');

// Words that would leak a stage answer if they appeared in a team NAME (the name is
// shown publicly on the leaderboard). Non-fatal — we only warn.
const LEAK_WORDS = [
  'hawksbill', 'static', 'sign_of_life', 'cold_start', 'cipher', 'mission_047', '047',
  'uplink', 'quiet_spaces', 'wake_sequence', 'wake_word', 'revive', 'signal_recovered',
  'full_boot', 'diagnostic',
];

function nowIso() { return new Date().toISOString(); }

function parseTeams(csv) {
  const out = [];
  const seen = new Set();
  const lines = csv.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',').map((p) => p.trim());
    if (i === 0 && parts[0].toLowerCase() === 'team_code') continue; // optional header
    if (parts.length < 3) {
      throw new Error(`Line ${i + 1}: expected "code,name,password", got: ${line}`);
    }
    const code = parts[0].toUpperCase();
    const name = parts[1];
    const password = parts.slice(2).join(','); // allow commas inside a password
    if (!code || !name || !password) {
      throw new Error(`Line ${i + 1}: code, name and password are all required.`);
    }
    if (seen.has(code)) throw new Error(`Duplicate team code: ${code}`);
    seen.add(code);
    out.push({ code, name, password });
  }
  if (out.length === 0) throw new Error('No teams found in ' + INPUT_PATH);
  return out;
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}.\nStart the server once (npm start) so it gets created, then re-run.`);
  process.exit(1);
}
if (!fs.existsSync(INPUT_PATH)) {
  console.error(`No team list at ${INPUT_PATH}.\nCreate it with lines like:\n  TEAM01,alpha_squad,somePassword\nthen re-run.`);
  process.exit(1);
}

const teams = parseTeams(fs.readFileSync(INPUT_PATH, 'utf8'));

for (const t of teams) {
  const lower = t.name.toLowerCase();
  const hit = LEAK_WORDS.find((w) => lower.includes(w));
  if (hit) {
    console.warn(`WARNING: team name "${t.name}" contains "${hit}", which hints at a stage answer. Consider renaming.`);
  }
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('BEGIN IMMEDIATE');
try {
  for (const table of ['alert_reviews', 'anticheat_alerts', 'solves', 'submissions', 'sessions', 'teams']) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('teams','submissions','solves','anticheat_alerts','alert_reviews');");

  const insert = db.prepare(
    'INSERT INTO teams (code, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const t of teams) {
    const { hash, salt } = hashPassword(t.password);
    insert.run(t.code, t.name, hash, salt, nowIso());
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Failed, rolled back — no changes made:', err.message);
  process.exit(1);
}

const header = 'team_code,team_name,password\n';
const body = teams.map((t) => `${t.code},${t.name},${t.password}`).join('\n');
fs.writeFileSync(CREDENTIALS_PATH, header + body + '\n', 'utf8');

console.log(`Done. Roster replaced with ${teams.length} team(s); all prior play data wiped.`);
console.log(`Credentials written to ${CREDENTIALS_PATH}:`);
for (const t of teams) console.log(`  ${t.code}  ${t.name}`);
