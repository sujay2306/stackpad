// Renders the PWA icons in public/icons from public/favicon.svg using headless Chrome.
// Run: node scripts/make-icons.mjs   (needs Google Chrome; set CHROME=/path/to/chrome to override)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const favicon = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
const inner = favicon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const glyph = inner.replace(/<rect width="32" height="32"[^>]*\/>/, ''); // the logo without its tile
const tile = inner.match(/<rect width="32" height="32"[^>]*fill="([^"]+)"/)[1];

// "any": the favicon as-is (rounded tile, transparent corners).
const anySvg = favicon;
// "maskable": full-bleed tile, logo scaled into the 80% safe circle.
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${tile}"/><g transform="translate(16 16.25) scale(.72) translate(-16 -16.25)">${glyph}</g></svg>`;
// Apple touch icon: full-bleed (iOS applies its own corner mask), logo at a natural size.
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${tile}"/><g transform="translate(16 16.25) scale(.86) translate(-16 -16.25)">${glyph}</g></svg>`;

const jobs = [
  ['icon-192.png', anySvg, 192],
  ['icon-512.png', anySvg, 512],
  ['icon-maskable-192.png', maskSvg, 192],
  ['icon-maskable-512.png', maskSvg, 512],
  ['apple-touch-icon.png', appleSvg, 180],
];
const tmp = mkdtempSync(join(tmpdir(), 'stackpad-icons-'));
try {
  for (const [name, svg, size] of jobs) {
    const page = join(tmp, name + '.html');
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--user-data-dir=${join(tmp, 'prof')}`,
      `--window-size=${size},${size}`, `--screenshot=${join(root, 'public/icons', name)}`, 'file://' + page,
    ], { stdio: 'ignore' });
    console.log('wrote public/icons/' + name);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
