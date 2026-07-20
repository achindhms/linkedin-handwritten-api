# Postcard API

A self-hosted API that renders personalized handwritten notes and postcards as PNG images — the same engine behind the browser-based Postcard Generator tool, ported to run headlessly so it can be called from **n8n** (or Zapier, Make, curl, anything that speaks HTTP) to automate personalized direct mail / DMs at scale.

## What this is (and isn't)

- It's an image renderer with an HTTP API in front of it. Give it a name, company, and message template, get back a PNG (or a ZIP of PNGs for a whole list).
- It does **not** send anything itself — no email, no LinkedIn, no physical mail. You wire the output into whatever actually sends things (Gmail node, Instantly, a mail house's API, etc.) inside your n8n workflow.

## What's "production-grade" about it

This isn't just the render logic with an HTTP wrapper — it has the basics you'd expect from a small real service:

- **Auth**: one or more API keys via `x-api-key`, supports multiple keys at once (`API_KEYS=key1,key2`).
- **Rate limiting**: per-IP limit on `/generate` (default 60/min, configurable) so a runaway n8n loop can't take the service down.
- **Input validation**: bad font/ink/paper/layout/dimensions/message-length get a clear `400` instead of a confusing crash.
- **Security headers** (helmet), **gzip compression**, **request logging** (morgan).
- **Usage stats** at `GET /stats` — request counts per API key, in-memory (resets on restart; swap in Redis/Postgres if you need it to persist).
- **Graceful shutdown** on `SIGTERM`/`SIGINT` — matters on platforms like Render that restart your service on every deploy.
- A proper `404` and a global error handler, so nothing ever throws a raw stack trace at the caller.

What it deliberately does **not** have: a database, a job queue, or multi-tenant billing. It's sized for "one person/team automating outbound," not "SaaS product with paying customers." If you outgrow that, the notes at the bottom point at what to add.

## 1. Run it locally

Requires Node 18+.

```bash
npm install
npm run setup-fonts   # downloads the handwriting fonts from Google Fonts into /fonts
cp .env.example .env  # then edit .env — at minimum set API_KEYS before deploying anywhere public
npm start
```

Server listens on `http://localhost:3000`. Try it:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key-here" \
  -d '{"name":"Nicolas","company":"Atom11","message":"Hey {{name}}, good morning!"}' \
  --output test.png
```

## 2. Host it for free (Render)

Render is the most straightforward option that has a genuine no-credit-card-required free tier for web services with Docker support. The tradeoff: a free web service **spins down after 15 minutes of no traffic** and takes ~30–60 seconds to wake back up on the next request. For an n8n automation that runs occasionally (not a live user-facing endpoint), that's a fair trade for $0/month — and the keep-warm workflow below avoids it almost entirely.

**Steps:**

1. Push this folder to a GitHub repo (public or private, both work).
2. Go to [render.com](https://render.com) → sign up (no card needed) → **New +** → **Web Service**.
3. Connect the repo. Render will detect the `Dockerfile` automatically (this repo also includes a `render.yaml` blueprint if you'd rather use **New +** → **Blueprint** for a slightly more one-click setup).
4. Instance type: **Free**.
5. Add an environment variable: `API_KEYS` = some long random string (this is the key you'll put in n8n's HTTP Request node header).
6. Create the service. First build takes a few minutes — it installs the Cairo/Pango system libraries the renderer needs and downloads the handwriting fonts as part of the Docker build.
7. You'll get a URL like `https://postcard-api-xxxx.onrender.com`. Test it with the same curl command above, swapping in that URL.

**Keeping it warm (optional, still free):** this repo includes `.github/workflows/keep-warm.yml`, a GitHub Actions workflow that pings `/health` every 10 minutes using GitHub's free scheduled-workflow minutes. To turn it on: in your GitHub repo, go to **Settings → Secrets and variables → Actions**, add a secret named `PING_URL` set to your Render URL, and the workflow starts running automatically on its schedule. This keeps the free instance awake during business hours without costing anything — GitHub Actions and Render are both still free at this usage level.

### Other free-tier options if you outgrow Render's spin-down

- **Fly.io** and **Railway** both dropped their truly-free tiers for new accounts as of 2026 (Railway gives a small usage credit, Fly.io now requires a card) — worth a look if you want always-on and don't mind a few dollars a month.
- A cheap always-on VPS (Oracle Cloud's free tier ARM instances, or a $4–5/mo box anywhere) avoids spin-down entirely if this becomes something you rely on daily — the Dockerfile in this repo works unchanged there too.

## 3. API reference

### `GET /health`
`{ "status": "ok", "uptimeSeconds": 1234 }` — use this for the keep-warm ping or your own monitoring.

### `GET /fonts`
Valid values for `font`, `ink`, `paper`, `layout`:
```json
{
  "fonts": ["Nanum Pen Script", "Just Another Hand", "..."],
  "inks": ["#33408f", "#24314a", "..."],
  "papers": ["plain", "kraft", "cream", "sage", "dusk"],
  "layouts": ["note", "postcard"]
}
```

### `GET /stats`
Requires `x-api-key`. Returns request counts for your key(s):
```json
{ "usage": { "your***": { "requests": 42, "generated": 40, "bulkGenerated": 120, "lastUsed": "2026-07-19T..." } } }
```

### `POST /generate`
**Headers:** `Content-Type: application/json`, `x-api-key: <your key>`

**Body:**
```json
{
  "name": "Nicolas",
  "company": "Atom11",
  "message": "Hey {{name}}, good morning!\n\nI came across {{company}} recently and wanted to reach out.",
  "font": "Nanum Pen Script",
  "ink": "#33408f",
  "paper": "plain",
  "layout": "note",
  "fields": { "role": "VP of Growth" },
  "format": "png"
}
```
Only `message` is required. `fields` is optional, for custom merge tags beyond `{{name}}`/`{{company}}`.

**Response:** raw PNG (`Content-Type: image/png`) by default. Set `"format": "base64"` to get `{ "image": "data:image/png;base64,..." }` instead — useful in n8n when you want the image as a string rather than binary data.

`layout: "postcard"` also accepts `"logoUrl"` — a direct image URL, or a bare domain like `"atom11.com"` to auto-pull that company's logo, rendered inside the airmail stamp box.

### `POST /generate/bulk`
Same shared fields as above, plus a `recipients` array (max 500):
```json
{
  "message": "Hey {{name}}, good morning!\n\nI came across {{company}} recently.",
  "font": "Nanum Pen Script",
  "recipients": [
    { "name": "Nicolas", "company": "Atom11" },
    { "name": "Priya", "company": "Figr", "fields": { "role": "Head of Growth" } }
  ]
}
```
**Response:** `application/zip`, one PNG per recipient, named `postcard_001_Nicolas_Atom11.png` etc.

### Errors
Validation failures return `400` with `{ "error": "..." }` describing exactly what's wrong (bad font name, message too long, etc.) rather than silently rendering something unexpected. Auth failures return `401`. Rate-limit hits return `429`.

## 4. Using this from n8n

**Single note per trigger row:**
1. Trigger node (Google Sheets "On Row Added", Airtable, webhook, whatever feeds you leads).
2. **HTTP Request** node → `POST https://your-app.onrender.com/generate`, header `x-api-key`, JSON body mapping `name`/`company`/`message` from the trigger, **Response Format: File**.
3. Feed that binary output into a **Gmail/Outlook** node as an attachment, or upload it elsewhere.

**Bulk run over a list:** same idea but `POST /generate/bulk` with a `recipients` array, then feed the ZIP to a Drive/S3 upload node (or a Compression node to split it back into individual files).

If the free instance is cold (hasn't had traffic in 15+ min), the first HTTP Request node in your workflow may take up to a minute — that's normal, not a bug. The keep-warm workflow above minimizes how often this happens.

## 5. If you outgrow this

Things to add before this becomes an actual multi-customer SaaS product rather than your own automation tool:
- A real database for usage tracking and API keys (the in-memory version here resets on every restart/redeploy).
- A queue (BullMQ + Redis, or similar) in front of `/generate/bulk` so large batches don't block a single request/dyno.
- Per-key rate limits and quotas instead of the global per-IP limit.
- Signed, revocable API keys instead of static shared secrets.
