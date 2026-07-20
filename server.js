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
const { createKey, listKeys } = require('./lib/keystore');
const { signupForm, signupResult, tryPage } = require('./lib/pages');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
}));

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
      'GET /signup': 'Self-serve — get your own API key (no approval needed)',
      'GET /try': 'Interactive browser tool to test the API without writing code',
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

app.get('/signup', (req, res) => {
  res.type('html').send(signupForm());
});

app.post('/signup', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) {
    return res.status(400).type('html').send(signupForm({ error: 'Name and email are both required.' }));
  }
  const record = createKey({ name, email });
  res.type('html').send(signupResult({ key: record.key }));
});

app.get('/try', (req, res) => {
  res.type('html').send(tryPage());
});

app.get('/admin/keys', requireApiKey, (req, res) => {
  res.json({ keys: listKeys() });
});

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

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'See GET / for a list of endpoints.' });
});

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

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
