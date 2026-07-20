const { FONTS, INKS, PAPERS } = require('./fonts');

const MAX_MESSAGE_LENGTH = 4000;
const MAX_DIMENSION = 2400;
const MIN_DIMENSION = 300;
const MAX_RECIPIENTS = 500;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const VALID_FONT_NAMES = new Set(FONTS.map((f) => f.name.toLowerCase()));
const VALID_PAPER_IDS = new Set(PAPERS.map((p) => p.id.toLowerCase()));
const VALID_LAYOUTS = new Set(['note', 'postcard']);

// Returns { ok: true } or { ok: false, error: '...' }. Doesn't mutate the body —
// the render layer already has its own sensible fallbacks (findFont/findPaper),
// this just catches obviously-bad input early with a clear 400 instead of a
// confusing 500 or silently-wrong-looking render.
function validateGenerateBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Request body must be a JSON object' };
  if (!body.message || typeof body.message !== 'string') {
    return { ok: false, error: '"message" is required and must be a string' };
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `"message" is too long (max ${MAX_MESSAGE_LENGTH} characters)` };
  }
  if (body.font && !VALID_FONT_NAMES.has(String(body.font).toLowerCase())) {
    return { ok: false, error: `"font" must be one of: ${[...VALID_FONT_NAMES].join(', ')}` };
  }
  if (body.ink && !HEX_COLOR.test(body.ink)) {
    return { ok: false, error: '"ink" must be a 6-digit hex color, e.g. "#33408f"' };
  }
  if (body.paper && !VALID_PAPER_IDS.has(String(body.paper).toLowerCase())) {
    return { ok: false, error: `"paper" must be one of: ${[...VALID_PAPER_IDS].join(', ')}` };
  }
  if (body.layout && !VALID_LAYOUTS.has(String(body.layout).toLowerCase())) {
    return { ok: false, error: '"layout" must be "note" or "postcard"' };
  }
  if (body.width && (body.width < MIN_DIMENSION || body.width > MAX_DIMENSION)) {
    return { ok: false, error: `"width" must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}` };
  }
  if (body.height && (body.height < MIN_DIMENSION || body.height > MAX_DIMENSION)) {
    return { ok: false, error: `"height" must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}` };
  }
  if (body.fields && typeof body.fields !== 'object') {
    return { ok: false, error: '"fields" must be an object' };
  }
  return { ok: true };
}

function validateBulkBody(body) {
  const base = validateGenerateBody(body);
  if (!base.ok) return base;
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return { ok: false, error: '"recipients" must be a non-empty array' };
  }
  if (body.recipients.length > MAX_RECIPIENTS) {
    return { ok: false, error: `Max ${MAX_RECIPIENTS} recipients per request — split larger lists into batches` };
  }
  for (const r of body.recipients) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'Each recipient must be an object' };
  }
  return { ok: true };
}

module.exports = { validateGenerateBody, validateBulkBody, MAX_RECIPIENTS };
