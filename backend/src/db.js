'use strict';
// Database layer: schema, seeding from the real challenges/*/challenge.yml files,
// and demo team provisioning. Uses node:sqlite (built-in, synchronous, single-file).
//
// Design notes (see agent memory for the full rationale):
//  - submissions and anticheat_alerts are append-only: we never UPDATE or DELETE a row,
//    only INSERT, so organizers always see full history.
//  - solves has a UNIQUE(team_id, stage_number) constraint -- this is the single-winner /
//    no-double-solve guarantee. Combined with node:sqlite's synchronous, single-threaded
//    access from one Node process, first-finisher determination is race-free by construction.
//  - flags are stored as sha256 hashes only; the raw flag text never touches the DB except
//    inside the append-only submissions log (needed for anti-cheat "same wrong guess" /
//    "same correct flag" comparisons), and organizer-only endpoints are the only readers.

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const YAML = require('yaml');
const { hashFlag, hashPassword, randomPassword } = require('./crypto-utils');

// DATA_DIR holds the SQLite DB + generated credential/key files. On cloud hosts
// (Railway) point this at a mounted volume (e.g. DATA_DIR=/data) so the database
// survives redeploys and restarts. Falls back to the local ./data dir for dev.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'nodezero.db');
// Challenge content lives in ctf-website/challenges (canonical). On a host that only
// deploys the backend/ folder (Railway), that path is absent, so we fall back to a
// bundled copy at backend/challenges (created by `npm run bundle-challenges`).
// CHALLENGES_DIR env var overrides everything.
const CANONICAL_CHALLENGES = path.join(__dirname, '..', '..', 'challenges');
const BUNDLED_CHALLENGES = path.join(__dirname, '..', 'challenges');
const CHALLENGES_DIR = process.env.CHALLENGES_DIR
  || (fs.existsSync(CANONICAL_CHALLENGES) ? CANONICAL_CHALLENGES : BUNDLED_CHALLENGES);
const CREDENTIALS_PATH = path.join(DATA_DIR, 'team_credentials.csv');
const ORGANIZER_KEY_PATH = path.join(DATA_DIR, 'organizer_api_key.txt');

fs.mkdirSync(DATA_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS stages (
  stage_number INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  points INTEGER NOT NULL,
  flag_hash TEXT NOT NULL,
  flag_is_placeholder INTEGER NOT NULL DEFAULT 0,
  requires_stage INTEGER,
  expected_min_seconds INTEGER NOT NULL DEFAULT 30
);

-- Append-only: every submission attempt, correct or not, gated or not, rate-limited or not.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  stage_number INTEGER NOT NULL,
  raw_flag TEXT NOT NULL,
  normalized_flag TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  rejection_reason TEXT,
  server_ts TEXT NOT NULL,
  server_ts_ms INTEGER NOT NULL,
  monotonic_ns TEXT NOT NULL,
  ip TEXT,
  session_token TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_stage ON submissions(stage_number);
CREATE INDEX IF NOT EXISTS idx_submissions_correct ON submissions(stage_number, is_correct);
CREATE INDEX IF NOT EXISTS idx_submissions_ip ON submissions(ip);

-- First-correct-submission-wins per team per stage. Never updated.
CREATE TABLE IF NOT EXISTS solves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  stage_number INTEGER NOT NULL,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  solved_at TEXT NOT NULL,
  solved_at_ms INTEGER NOT NULL,
  UNIQUE(team_id, stage_number)
);
CREATE INDEX IF NOT EXISTS idx_solves_stage ON solves(stage_number, solved_at_ms);

-- Tracks hint unlocks per team -- used to deduct points from score.
CREATE TABLE IF NOT EXISTS hint_unlocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  stage_number INTEGER NOT NULL,
  hint_index INTEGER NOT NULL,   -- 0-based index into the hints array
  cost INTEGER NOT NULL DEFAULT 0,
  unlocked_at TEXT NOT NULL,
  UNIQUE(team_id, stage_number, hint_index)
);
CREATE INDEX IF NOT EXISTS idx_hint_unlocks_team ON hint_unlocks(team_id);

-- Append-only anti-cheat findings, evidence attached as JSON.
CREATE TABLE IF NOT EXISTS anticheat_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  stage_number INTEGER,
  team_ids TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Review notes are appended, never overwrite the alert itself (keeps evidence immutable).
CREATE TABLE IF NOT EXISTS alert_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL REFERENCES anticheat_alerts(id),
  reviewer TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
`;

function nowIso() {
  return new Date().toISOString();
}

/** Parse a challenges/L0N-.../challenge.yml file into a stage row. */
function loadStageDefs() {
  const dirs = fs.readdirSync(CHALLENGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^L\d{2}-/.test(d.name))
    .map((d) => d.name)
    .sort();

  const stages = [];
  for (const dir of dirs) {
    const stageNumber = parseInt(dir.slice(1, 3), 10);
    const ymlPath = path.join(CHALLENGES_DIR, dir, 'challenge.yml');
    if (!fs.existsSync(ymlPath)) continue;
    const doc = YAML.parse(fs.readFileSync(ymlPath, 'utf8'));
    const flag = Array.isArray(doc.flags) ? doc.flags[0] : doc.flags;
    const isPlaceholder = /REPLACE/.test(flag || '');
    // Player-facing content served (gated) by the portal. Flags are NEVER included here.
    const attachments = (Array.isArray(doc.attachments) ? doc.attachments : [])
      .filter((name) => typeof name === 'string' && fs.existsSync(path.join(CHALLENGES_DIR, dir, name)));
    const hints = (Array.isArray(doc.hints) ? doc.hints : [])
      .map((h) => (typeof h === 'string' ? { content: h } : { content: h.content, cost: h.cost }))
      .filter((h) => h.content);
    stages.push({
      stageNumber,
      slug: dir,
      title: doc.name || dir,
      points: doc.value || stageNumber * 100,
      flag: flag || `nodezero{REPLACE_stage_${stageNumber}}`,
      isPlaceholder,
      requiresStage: stageNumber === 1 ? null : stageNumber - 1,
      // Rough "too fast to be legitimate" floor per tier -- tune post dry-run.
      expectedMinSeconds: stageNumber <= 3 ? 45 : stageNumber <= 7 ? 90 : 180,
      // Content (not persisted to DB; held in memory and served via gated routes).
      dir: path.join(CHALLENGES_DIR, dir),
      description: typeof doc.description === 'string' ? doc.description : '',
      hints,
      attachments,
    });
  }
  return stages;
}

function seedStages(db) {
  const defs = loadStageDefs();
  const upsert = db.prepare(`
    INSERT INTO stages (stage_number, slug, title, points, flag_hash, flag_is_placeholder, requires_stage, expected_min_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stage_number) DO UPDATE SET
      slug=excluded.slug, title=excluded.title, points=excluded.points,
      flag_hash=excluded.flag_hash, flag_is_placeholder=excluded.flag_is_placeholder,
      requires_stage=excluded.requires_stage, expected_min_seconds=excluded.expected_min_seconds
  `);
  for (const s of defs) {
    upsert.run(
      s.stageNumber, s.slug, s.title, s.points,
      hashFlag(s.flag), s.isPlaceholder ? 1 : 0, s.requiresStage, s.expectedMinSeconds,
    );
  }

  // Prune stages whose challenges/L0N-*/ folder no longer exists (e.g. after
  // deleting/renumbering stages) -- otherwise old rows linger in the trail
  // UI forever since the upsert above only ever adds/updates, never removes.
  const currentNumbers = defs.map((s) => s.stageNumber);
  const placeholders = currentNumbers.map(() => '?').join(',');
  if (placeholders) {
    db.prepare(`DELETE FROM stages WHERE stage_number NOT IN (${placeholders})`).run(...currentNumbers);
  } else {
    db.prepare('DELETE FROM stages').run();
  }

  return defs;
}

function seedDemoTeams(db, count = 8) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
  if (existing > 0) return null; // already seeded, idempotent

  const rows = [];
  const insert = db.prepare(`
    INSERT INTO teams (code, name, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  // Neutral call-signs ONLY — must NOT echo any stage title, flag word, or
  // technique (no hawksbill/cold_start/quiet_spaces/uplink/wake/full_boot/etc.),
  // otherwise the team name itself leaks a hint about an upcoming stage.
  const names = [
    'crimson_comet', 'azure_falcon', 'amber_pulsar', 'violet_orbit',
    'jade_meteor', 'scarlet_nebula', 'cobalt_quasar', 'onyx_photon',
  ];
  for (let i = 1; i <= count; i++) {
    const code = `TEAM${String(i).padStart(2, '0')}`;
    const name = names[i - 1] || `team_${i}`;
    const password = randomPassword();
    const { hash, salt } = hashPassword(password);
    insert.run(code, name, hash, salt, nowIso());
    rows.push({ code, name, password });
  }

  const header = 'team_code,team_name,password\n';
  const body = rows.map((r) => `${r.code},${r.name},${r.password}`).join('\n');
  fs.writeFileSync(CREDENTIALS_PATH, header + body + '\n', 'utf8');
  return rows;
}

function ensureOrganizerKey() {
  // Allow the organizer key to be pinned via env var (recommended on cloud hosts,
  // where reading the generated file off the server is awkward). If set, it wins
  // and is also persisted so restarts stay consistent.
  const envKey = process.env.ORGANIZER_KEY && process.env.ORGANIZER_KEY.trim();
  if (envKey) {
    fs.writeFileSync(ORGANIZER_KEY_PATH, envKey + '\n', 'utf8');
    return envKey;
  }
  if (fs.existsSync(ORGANIZER_KEY_PATH)) {
    return fs.readFileSync(ORGANIZER_KEY_PATH, 'utf8').trim();
  }
  const { randomToken } = require('./crypto-utils');
  const key = randomToken(24);
  fs.writeFileSync(ORGANIZER_KEY_PATH, key + '\n', 'utf8');
  return key;
}

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const stageDefs = seedStages(db);
  const newTeams = seedDemoTeams(db);
  const organizerKey = ensureOrganizerKey();
  // In-memory content map (stageNumber -> player-facing description/hints/attachments).
  // Kept out of the DB on purpose: it's static per deploy and never includes flags.
  const stageContent = new Map(
    stageDefs.map((s) => [s.stageNumber, {
      stageNumber: s.stageNumber,
      slug: s.slug,
      dir: s.dir,
      description: s.description,
      hints: s.hints,
      attachments: s.attachments,
    }])
  );
  return { db, stageDefs, stageContent, newTeams, organizerKey, paths: { DB_PATH, CREDENTIALS_PATH, ORGANIZER_KEY_PATH } };
}

module.exports = { openDb, nowIso, DATA_DIR, DB_PATH, CREDENTIALS_PATH, ORGANIZER_KEY_PATH };
