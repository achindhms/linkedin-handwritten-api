const { createCanvas, loadImage } = require('canvas');
const { MONO_FONT, PAPERS, registerAllFonts, findFont, findPaper } = require('./fonts');

registerAllFonts();

// ---- generic helpers (ported 1:1 from the browser version) ----

// {{key}} substitution against a flat fields object, case-insensitive.
// Unlike the browser tool there's no CSV column-mapping step here — the API caller
// just sends the field values directly, so this is the simplified generic version.
function mergeText(template, fields) {
  return String(template || '').replace(/{{\s*([\w .-]+)\s*}}/g, (m, key) => {
    const k = key.trim();
    const hitKey = Object.keys(fields || {}).find((f) => f.toLowerCase() === k.toLowerCase());
    return hitKey !== undefined ? String(fields[hitKey] ?? '') : m;
  });
}

function wrapLines(context, text, maxWidth) {
  const paragraphs = String(text || '').split('\n');
  const lines = [];
  paragraphs.forEach((p) => {
    if (p.trim() === '') { lines.push(''); return; }
    const words = p.split(' ');
    let line = '';
    words.forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

// Shrinks font size (down to a floor) until the wrapped message fits maxHeight,
// so long messages never get cut off.
function fitTextToBox(context, text, family, maxWidth, maxHeight, baseSize, lineHeightRatio, minSize) {
  let size = baseSize;
  const floor = minSize || Math.max(14, Math.round(baseSize * 0.4));
  while (size > floor) {
    context.font = `${size}px "${family}"`;
    const lines = wrapLines(context, text, maxWidth);
    const lh = size * lineHeightRatio;
    if (lines.length * lh <= maxHeight) return { size, lines, lh };
    size -= 2;
  }
  context.font = `${floor}px "${family}"`;
  const lines = wrapLines(context, text, maxWidth);
  return { size: floor, lines, lh: floor * lineHeightRatio };
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function resolveImageUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return `https://logo.clearbit.com/${v}`;
  return null;
}

async function loadImageSafe(url) {
  try {
    return await loadImage(url);
  } catch (e) {
    return null;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawTexture(ctx, w, h, paper, seedIndex) {
  ctx.fillStyle = paper.base;
  ctx.fillRect(0, 0, w, h);
  const density = paper.speckDensity != null ? paper.speckDensity : 220;
  if (!density) return;
  const rnd = mulberry32(seedIndex + 7);
  ctx.fillStyle = paper.speck;
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < density; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd() * 1.6 + 0.3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- layouts ----

async function drawNoteLayout(ctx, w, h, { fields, template, font, ink, paper, seedIndex, bgImg }) {
  ctx.save();

  if (bgImg) {
    const scale = Math.max(w / bgImg.width, h / bgImg.height);
    const iw = bgImg.width * scale, ih = bgImg.height * scale;
    ctx.drawImage(bgImg, (w - iw) / 2, (h - ih) / 2, iw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = paper.base;
    ctx.fillRect(0, 0, w, h);
    if (paper.speckDensity) drawTexture(ctx, w, h, paper, 1);
    const vg = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.25, w / 2, h * 0.42, h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  const marginX = w * 0.11, marginTop = h * 0.075;
  const bodyText = mergeText(template, fields);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  const baseFontSize = Math.round(w * (font.size / 1000) * 0.92);
  const textMaxWidth = w - marginX * 2;
  const maxTextHeight = h - marginTop * 2;
  const fit = fitTextToBox(ctx, bodyText, font.name, textMaxWidth, maxTextHeight, baseFontSize, 1.42);
  ctx.font = `${fit.size}px "${font.name}"`;
  let ly = marginTop + fit.size;
  const rnd = mulberry32(seedIndex + 101);
  fit.lines.forEach((line) => {
    const jitterX = (rnd() - 0.5) * 3;
    const jitterY = (rnd() - 0.5) * 2.5;
    ctx.save();
    ctx.translate(marginX + jitterX, ly + jitterY);
    ctx.rotate((rnd() - 0.5) * 0.008);
    ctx.fillText(line, 0, 0);
    ctx.restore();
    ly += fit.lh;
  });

  ctx.restore();
}

async function drawPostcardLayout(ctx, w, h, { fields, template, font, ink, paper, bgImg, logoImg }) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.012);
  ctx.translate(-w / 2, -h / 2);

  const margin = w * 0.02;
  const cw = w - margin * 2, ch = h - margin * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, cw, ch);
  ctx.clip();

  if (bgImg) {
    const scale = Math.max(cw / bgImg.width, ch / bgImg.height);
    const iw = bgImg.width * scale, ih = bgImg.height * scale;
    ctx.drawImage(bgImg, margin + (cw - iw) / 2, margin + (ch - ih) / 2, iw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillRect(margin, margin, cw, ch);
  } else {
    drawTexture(ctx, w, h, paper, 1);
  }

  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin + 14, margin + 14, cw - 28, ch - 28);
  ctx.globalAlpha = 1;

  const stampW = w * 0.11, stampH = h * 0.19;
  const sx = margin + cw - stampW - 26, sy = margin + 26;

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, stampW, stampH);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (logoImg) {
    const inset = 5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx + inset, sy + inset, stampW - inset * 2, stampH - inset * 2);
    ctx.clip();
    const boxW = stampW - inset * 2, boxH = stampH - inset * 2;
    const scale = Math.max(boxW / logoImg.width, boxH / logoImg.height);
    const iw = logoImg.width * scale, ih = logoImg.height * scale;
    ctx.drawImage(logoImg, sx + inset + (boxW - iw) / 2, sy + inset + (boxH - ih) / 2, iw, ih);
    ctx.restore();
  } else {
    ctx.fillStyle = ink;
    ctx.font = `${Math.round(stampW * 0.34)}px "${font.name}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(fields.name) || '~', sx + stampW / 2, sy + stampH * 0.42);
    ctx.font = `${Math.round(stampW * 0.11)}px "${MONO_FONT.name}"`;
    ctx.fillText('AIR MAIL', sx + stampW / 2, sy + stampH * 0.78);
  }

  const bodyText = mergeText(template, fields);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  const baseFontSize = Math.round(w * (font.size / 1200));
  const textMaxWidth = cw - 70 - (stampW + 40);
  const maxTextHeight = ch - 130;
  const fit = fitTextToBox(ctx, bodyText, font.name, textMaxWidth, maxTextHeight, baseFontSize, 1.28);
  ctx.font = `${fit.size}px "${font.name}"`;
  let ly = margin + 90;
  fit.lines.forEach((line) => {
    ctx.fillText(line, margin + 50, ly);
    ly += fit.lh;
  });

  ctx.font = `13px "${MONO_FONT.name}"`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(
    ('to: ' + (fields.name || '') + (fields.company ? '  \u2022  ' + fields.company : '')).toUpperCase(),
    margin + 50, margin + ch - 30
  );
  ctx.globalAlpha = 1;

  ctx.restore();
  ctx.restore();
}

/**
 * Renders one postcard/note to a PNG buffer.
 *
 * @param {object} opts
 * @param {string} opts.template   - message with {{tags}}, e.g. "Hey {{name}}, ..."
 * @param {object} opts.fields     - flat key/value map, e.g. { name, company, role }
 * @param {string} [opts.font]     - font name, e.g. "Nanum Pen Script" (see GET /fonts)
 * @param {string} [opts.ink]      - hex color, e.g. "#33408f"
 * @param {string} [opts.paper]    - paper id: plain | kraft | cream | sage | dusk
 * @param {string} [opts.layout]   - "note" (default) or "postcard"
 * @param {string} [opts.logoUrl]  - image URL or bare domain (postcard layout only)
 * @param {string} [opts.bgImageUrl] - custom background image URL
 * @param {number} [opts.width]    - override canvas width
 * @param {number} [opts.height]   - override canvas height
 * @param {number} [opts.seed]     - jitter seed for the note layout (defaults to 0)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function renderPostcard(opts) {
  const {
    template = '',
    fields = {},
    font: fontName,
    ink,
    paper: paperId,
    layout = 'note',
    logoUrl,
    bgImageUrl,
    width,
    height,
    seed = 0,
  } = opts;

  const font = findFont(fontName);
  const inkColor = ink || require('./fonts').INKS[0];
  const paper = findPaper(paperId);
  const isPostcard = layout === 'postcard';
  const w = width || (isPostcard ? 1200 : 1000);
  const h = height || (isPostcard ? 800 : 1250);

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  let bgImg = null;
  if (bgImageUrl) bgImg = await loadImageSafe(bgImageUrl);

  let logoImg = null;
  if (isPostcard && logoUrl) {
    const resolved = resolveImageUrl(logoUrl);
    if (resolved) logoImg = await loadImageSafe(resolved);
  }

  if (isPostcard) {
    await drawPostcardLayout(ctx, w, h, { fields, template, font, ink: inkColor, paper, bgImg, logoImg });
  } else {
    await drawNoteLayout(ctx, w, h, { fields, template, font, ink: inkColor, paper, seedIndex: seed, bgImg });
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderPostcard, PAPERS };
