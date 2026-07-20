require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');

const { renderPostcard } = require('./lib/render');
const { FONTS, INKS, PAPERS } = require('./lib/fonts');
const { validateGenerateBody, validateBulkBody } = require('./lib/validate');
const { requireApiKey, trackUsage, getUsageSnapshot, hasAuthConfigured } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));

app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
}));

// A generous but real rate limit — this is a free-tier tool meant for automation
// workloads (n8n), not a public-facing product, so this exists mainly to stop
// runaway loops/misconfigured workflows from hammering it, not to gate normal use.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down and try again in a moment.' },
});
app.use('/generate', limiter);

app.get('/', (req, res) => {
  res.json({
    name: 'Postcard API',
    description: 'Renders handwritten notes / postcards as PNGs for use with n8n or any HTTP client.',
    authRequired: hasAuthConfigured,
    endpoints: {
      'GET /health': 'Uptime check',
      'GET /fonts': 'Valid font/ink/paper/layout values',
      'POST /generate': 'Render one postcard',
      'POST /generate/bulk': 'Render a list of recipients as a ZIP',
      'GET /stats': 'Usage counters for your API key (requires x-api-key)',
    },
    docs: 'See README.md in the project repo for full request/response examples.',
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

app.get('/fonts', (req, res) => {
  res.json({
    fonts: FONTS.map((f) => f.name),
    inks: INKS,
    papers: PAPERS.map((p) => p.id),
    layouts: ['note', 'postcard'],
  });
});

app.get('/stats', requireApiKey, (req, res) => {
  res.json({ usage: getUsageSnapshot() });
});

/**
 * POST /generate
 * Body: {
 *   name, company,               // shorthand — merged into `fields` automatically
 *   fields: { role, dealSize },  // any extra custom merge tags, all optional
 *   message: "Hey {{name}} ...", // required
 *   font, ink, paper, layout,    // all optional, see GET /fonts for valid values
 *   logoUrl,                    // optional, postcard layout only
 *   format: "png" | "base64"    // defaults to "png" (binary response)
 * }
 */
app.post('/generate', requireApiKey, async (req, res) => {
  const check = validateGenerateBody(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const body = req.body;
  const fields = { name: body.name || '', company: body.company || '', ...(body.fields || {}) };

  try {
    const buffer = await renderPostcard({
      template: body.message,
      fields,
      font: body.font,
      ink: body.ink,
      paper: body.paper,
      layout: body.layout,
      logoUrl: body.logoUrl,
      bgImageUrl: body.bgImageUrl,
      width: body.width,
      height: body.height,
    });

    trackUsage(req.apiKey, 'generate');

    if (body.format === 'base64') {
      return res.json({ image: `data:image/png;base64,${buffer.toString('base64')}` });
    }
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Render failed:', err);
    res.status(500).json({ error: 'Failed to render postcard', detail: err.message });
  }
});

/**
 * POST /generate/bulk
 * Body: {
 *   recipients: [{ name, company, fields: {...}, logoUrl }, ...],  // required, max 500
 *   message, font, ink, paper, layout, bgImageUrl                  // shared across all recipients
 * }
 * Returns application/zip — one PNG per recipient, named postcard_001_<name>_<company>.png etc.
 */
app.post('/generate/bulk', requireApiKey, async (req, res) => {
  const check = validateBulkBody(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const body = req.body;

  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', 'attachment; filename="postcards.zip"');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to build ZIP', detail: err.message });
  });
  archive.pipe(res);

  try {
    for (let i = 0; i < body.recipients.length; i++) {
      const r = body.recipients[i] || {};
      const fields = { name: r.name || '', company: r.company || '', ...(r.fields || {}) };
      const buffer = await renderPostcard({
        template: body.message,
        fields,
        font: body.font,
        ink: body.ink,
        paper: body.paper,
        layout: body.layout,
        logoUrl: r.logoUrl || body.logoUrl,
        bgImageUrl: body.bgImageUrl,
        width: body.width,
        height: body.height,
        seed: i,
      });
      const safe = (s) => String(s || 'card').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      const filename = `postcard_${String(i + 1).padStart(3, '0')}_${safe(r.name)}_${safe(r.company)}.png`;
      archive.append(buffer, { name: filename });
    }

    trackUsage(req.apiKey, 'bulk', body.recipients.length);
    await archive.finalize();
  } catch (err) {
    console.error('Bulk render failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to render postcards', detail: err.message });
    }
  }
});

// 404 for anything else
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'See GET / for a list of endpoints.' });
});

// Last-resort error handler so a thrown error never crashes the process or leaks a stack trace.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Postcard API listening on http://localhost:${PORT}`);
  if (!hasAuthConfigured) {
    console.warn('No API_KEYS/API_KEY set — /generate endpoints are open. Set one before deploying publicly.');
  }
});

// Graceful shutdown — important on platforms like Render that send SIGTERM on redeploys/restarts.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
