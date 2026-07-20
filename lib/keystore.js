// A minimal, dependency-free key store backed by a JSON file on disk.
//
// Persistence note: this survives normal restarts (the free instance spinning
// down after inactivity and waking back up is the same container, same disk),
// but a fresh deploy (new commit) on Render's free tier gets a brand-new
// container, so self-issued keys do NOT survive a redeploy. For a small
// team this is a fair trade-off with zero setup. If you outgrow that,
// swap this file's read/write for a real database (or something like
// Upstash Redis's free REST API) — everything else in the app just calls
// isValidKey()/createKey()/listKeys() below, so the rest of the app doesn't change.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '[]');
}

function loadKeys() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveKeys(keys) {
  ensureStore();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function createKey({ name, email }) {
  const keys = loadKeys();
  const key = 'pk_' + crypto.randomBytes(20).toString('hex');
  const record = { key, name: name || '', email: email || '', createdAt: new Date().toISOString() };
  keys.push(record);
  saveKeys(keys);
  return record;
}

function isValidKey(key) {
  if (!key) return false;
  return loadKeys().some((k) => k.key === key);
}

function findByKey(key) {
  return loadKeys().find((k) => k.key === key) || null;
}

// For an admin view — never exposes full keys.
function listKeys() {
  return loadKeys().map((k) => ({
    key: `${k.key.slice(0, 8)}***`,
    name: k.name,
    email: k.email,
    createdAt: k.createdAt,
  }));
}

module.exports = { createKey, isValidKey, findByKey, listKeys };
