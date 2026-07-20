// Supports one or more API keys via API_KEYS="key1,key2,key3" (or the older
// single API_KEY var, kept for backwards compatibility) PLUS any keys people
// have self-issued via /signup (see lib/keystore.js). Each key gets its own
// usage counter so you can see who's calling what — resets on restart since
// there's no database here; swap in Redis/Postgres if you need it to persist.

const { isValidKey: isSelfIssuedKey, findByKey } = require('./keystore');

const rawKeys = process.env.API_KEYS || process.env.API_KEY || '';
const VALID_KEYS = new Set(rawKeys.split(',').map((k) => k.trim()).filter(Boolean));

const usage = new Map(); // key -> { requests, lastUsed, generated, bulkGenerated }

function trackUsage(key, kind, count = 1) {
  const label = key || 'no-auth';
  if (!usage.has(label)) usage.set(label, { requests: 0, generated: 0, bulkGenerated: 0, lastUsed: null });
  const entry = usage.get(label);
  entry.requests += 1;
  entry.lastUsed = new Date().toISOString();
  if (kind === 'generate') entry.generated += 1;
  if (kind === 'bulk') entry.bulkGenerated += count;
}

function requireApiKey(req, res, next) {
  if (VALID_KEYS.size === 0 && !hasSelfIssuedKeys()) {
    req.apiKey = null;
    return next();
  }
  const provided = req.header('x-api-key');
  if (!provided || (!VALID_KEYS.has(provided) && !isSelfIssuedKey(provided))) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key header. Get one at /signup.' });
  }
  req.apiKey = provided;
  const owner = findByKey(provided);
  req.apiKeyOwner = owner ? owner.name || owner.email : null;
  next();
}

function hasSelfIssuedKeys() {
  try {
    return require('./keystore').listKeys().length > 0;
  } catch (e) {
    return false;
  }
}

function getUsageSnapshot() {
  const out = {};
  for (const [key, stats] of usage.entries()) {
    const label = key === 'no-auth' ? 'no-auth' : `${key.slice(0, 4)}***`;
    out[label] = stats;
  }
  return out;
}

module.exports = {
  requireApiKey,
  trackUsage,
  getUsageSnapshot,
  hasAuthConfigured: VALID_KEYS.size > 0 || hasSelfIssuedKeys(),
};
