'use strict';
// Crypto helpers: constant-time flag verification, password hashing, token generation.
// No client input is ever trusted for correctness -- everything here runs server-side.

const crypto = require('node:crypto');

/** Normalize a submitted flag before hashing/comparing. Case-sensitive (CTF convention),
 *  only trims incidental whitespace a participant's terminal/browser might add. */
function normalizeFlag(raw) {
  return String(raw ?? '').trim();
}

/** sha256 hex digest of the normalized flag -- this is what we persist, never the raw flag. */
function hashFlag(rawFlag) {
  return crypto.createHash('sha256').update(normalizeFlag(rawFlag), 'utf8').digest('hex');
}

/** Constant-time compare of a submitted flag against the stored hash. */
function verifyFlag(submittedRaw, storedHashHex) {
  const submittedHash = hashFlag(submittedRaw);
  const a = Buffer.from(submittedHash, 'hex');
  const b = Buffer.from(storedHashHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** scrypt password hashing for team login credentials. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, storedHashHex) {
  const hash = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(storedHashHex, 'hex');
  if (hash.length !== stored.length) return false;
  return crypto.timingSafeEqual(hash, stored);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomPassword(bytes = 9) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  normalizeFlag,
  hashFlag,
  verifyFlag,
  hashPassword,
  verifyPassword,
  randomToken,
  randomPassword,
};
