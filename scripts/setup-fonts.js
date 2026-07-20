// Downloads the .ttf files this API needs from Google Fonts into /fonts.
// Run once after `npm install`: `npm run setup-fonts`
//
// Google Fonts serves woff2 to modern browsers and .ttf to older ones, so this
// requests the stylesheet with an old-browser User-Agent to get a .ttf URL back —
// node-canvas (built on Cairo/FreeType) wants .ttf/.otf, not .woff2.

const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, '..', 'fonts');

const FONT_FILES = [
  { family: 'Nanum Pen Script', file: 'NanumPenScript.ttf' },
  { family: 'Just Another Hand', file: 'JustAnotherHand.ttf' },
  { family: 'Reenie Beanie', file: 'ReenieBeanie.ttf' },
  { family: 'Gochi Hand', file: 'GochiHand.ttf' },
  { family: 'Indie Flower', file: 'IndieFlower.ttf' },
  { family: 'Neucha', file: 'Neucha.ttf' },
  { family: 'Caveat', file: 'Caveat.ttf' },
  { family: 'Homemade Apple', file: 'HomemadeApple.ttf' },
  { family: 'Patrick Hand', file: 'PatrickHand.ttf' },
  { family: 'Shadows Into Light', file: 'ShadowsIntoLight.ttf' },
  { family: 'Kalam', file: 'Kalam.ttf' },
  { family: 'IBM Plex Mono', file: 'IBMPlexMono.ttf' },
];

const OLD_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.101 Safari/537.36';

async function downloadFont({ family, file }) {
  const query = encodeURIComponent(family).replace(/%20/g, '+');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': OLD_BROWSER_UA } });
  if (!cssRes.ok) throw new Error(`Stylesheet request failed (${cssRes.status})`);
  const css = await cssRes.text();
  const match = css.match(/url\((https:[^)]+\.(?:ttf|otf))\)/);
  if (!match) throw new Error('No .ttf URL found in stylesheet (Google may have changed formats)');
  const fontRes = await fetch(match[1]);
  if (!fontRes.ok) throw new Error(`Font file request failed (${fontRes.status})`);
  const buffer = Buffer.from(await fontRes.arrayBuffer());
  fs.writeFileSync(path.join(FONTS_DIR, file), buffer);
}

(async () => {
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

  let failures = 0;
  for (const font of FONT_FILES) {
    process.stdout.write(`Downloading ${font.family}... `);
    try {
      await downloadFont(font);
      console.log('done');
    } catch (e) {
      failures++;
      console.log(`FAILED (${e.message})`);
    }
  }

  if (failures > 0) {
    console.log(
      `\n${failures} font(s) failed to download automatically. ` +
      `Grab them manually from https://fonts.google.com, unzip, and drop the .ttf into the /fonts folder ` +
      `using the exact filenames listed in scripts/setup-fonts.js.`
    );
  } else {
    console.log('\nAll fonts downloaded.');
  }
})();
