const fs = require('fs');
const path = require('path');
const { registerFont } = require('canvas');

// Same handwriting fonts as the browser tool. `file` is the filename setup-fonts.js
// saves each one as under /fonts. `size` is the base font size tuned per-typeface
// (some scripts read smaller/larger at the same px size than others).
const FONTS = [
  { name: 'Nanum Pen Script', file: 'NanumPenScript.ttf', size: 62 },
  { name: 'Just Another Hand', file: 'JustAnotherHand.ttf', size: 66 },
  { name: 'Reenie Beanie', file: 'ReenieBeanie.ttf', size: 66 },
  { name: 'Gochi Hand', file: 'GochiHand.ttf', size: 46 },
  { name: 'Indie Flower', file: 'IndieFlower.ttf', size: 44 },
  { name: 'Neucha', file: 'Neucha.ttf', size: 48 },
  { name: 'Caveat', file: 'Caveat.ttf', size: 54 },
  { name: 'Homemade Apple', file: 'HomemadeApple.ttf', size: 38 },
  { name: 'Patrick Hand', file: 'PatrickHand.ttf', size: 42 },
  { name: 'Shadows Into Light', file: 'ShadowsIntoLight.ttf', size: 46 },
  { name: 'Kalam', file: 'Kalam.ttf', size: 42 },
];

// Used for the small "AIR MAIL" / "TO:" caption text on the postcard layout.
const MONO_FONT = { name: 'IBM Plex Mono', file: 'IBMPlexMono.ttf' };

const INKS = ['#33408f', '#24314a', '#2c2620', '#a6402f', '#1a1a1a'];

const PAPERS = [
  { id: 'plain', base: '#f2f0ec', speck: '#e4e1d8', speckDensity: 0 },
  { id: 'kraft', base: '#cbb384', speck: '#a68f61', speckDensity: 220 },
  { id: 'cream', base: '#f4ecd8', speck: '#d8c9a3', speckDensity: 220 },
  { id: 'sage', base: '#c8cbb0', speck: '#9fa584', speckDensity: 220 },
  { id: 'dusk', base: '#b7a9c9', speck: '#93819e', speckDensity: 220 },
];

const FONTS_DIR = path.join(__dirname, '..', 'fonts');
let registered = false;

// Registers every font file that's actually present. Safe to call more than once;
// only runs once per process. Missing files just get skipped with a warning so the
// server still boots (Canvas will fall back to a default font for that one style).
function registerAllFonts() {
  if (registered) return;
  registered = true;
  [...FONTS, MONO_FONT].forEach((f) => {
    const filepath = path.join(FONTS_DIR, f.file);
    if (fs.existsSync(filepath)) {
      registerFont(filepath, { family: f.name });
    } else {
      console.warn(`[fonts] Missing ${f.file} for "${f.name}" — run "npm run setup-fonts" first.`);
    }
  });
}

function findFont(name) {
  if (!name) return FONTS[0];
  return FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase()) || FONTS[0];
}

function findPaper(id) {
  if (!id) return PAPERS[0];
  return PAPERS.find((p) => p.id.toLowerCase() === id.toLowerCase()) || PAPERS[0];
}

module.exports = { FONTS, MONO_FONT, INKS, PAPERS, registerAllFonts, findFont, findPaper };
