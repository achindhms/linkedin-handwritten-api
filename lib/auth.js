// Supports one or more API keys via API_KEYS="key1,key2,key3" (or the older
// single API_KEY var, kept for backwards compatibility). Each key gets its own
// usage counter so you can see who's calling what — resets on restart since
// there's no database here; swap in Redis/Postgres if you need it to persist.

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
  if (VALID_KEYS.size === 0) {
    req.apiKey = null;
    return next();
  }
  const provided = req.header('x-api-key');
  if (!provided || !VALID_KEYS.has(provided)) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key header' });
  }
  req.apiKey = provided;
  next();
}

function getUsageSnapshot() {
  const out = {};
  for (const [key, stats] of usage.entries()) {
    // Never echo full keys back, even to an authenticated caller — just enough to tell them apart.
    const label = key === 'no-auth' ? 'no-auth' : `${key.slice(0, 4)}***`;
    out[label] = stats;
  }
  return out;
}

module.exports = { requireApiKey, trackUsage, getUsageSnapshot, hasAuthConfigured: VALID_KEYS.size > 0 };
