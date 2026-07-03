'use strict';
// Copies the canonical ctf-website/challenges tree into backend/challenges so the
// backend is a self-contained deployable unit (Railway uploads only backend/).
// Run this before `railway up` / committing for a GitHub deploy. Safe to re-run.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'challenges');
const DEST = path.join(__dirname, '..', 'challenges');

if (!fs.existsSync(SRC)) {
  console.error('Canonical challenges dir not found at', SRC);
  process.exit(1);
}
// Node 22 has fs.cpSync with recursive copy.
fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });

const count = fs.readdirSync(DEST).filter((d) => /^L\d{2}-/.test(d)).length;
console.log(`Bundled ${count} challenge stages -> ${DEST}`);
console.log('Backend is now self-contained for deploy.');
