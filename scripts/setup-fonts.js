// Downloads the .ttf files this API needs from Google Fonts into /fonts.
// Run once after `npm install`: `npm run setup-fonts`

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadFont({ family, file }, attempt = 1) {
  const query = encodeURIComponent(family).replace(/%20/g, '+');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': OLD_BROWSER_UA } });
  if (!cssRes.ok) {
    if (cssRes.status === 429 && attempt < 4) {
      await sleep(1500 * attempt);
      return downloadFont({ family, file }, attempt + 1);
    }
    throw new Error(`Stylesheet request failed (${cssRes.status})`);
  }
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
    await sleep(600); // space requests out so Google doesn't rate-limit the batch
  }

  if (failures > 0) {
    console.log(`\n${failures} font(s) failed to download automatically. Re-run "npm run setup-fonts" — it's safe to run again, it'll just overwrite what's there.`);
  } else {
    console.log('\nAll fonts downloaded.');
  }
})();
