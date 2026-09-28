// Rasterises public/favicon.svg into the PNG icons browsers and home screens
// ask for. Run after changing the mark:  node scripts/generate-icons.mjs
//
// Uses the Playwright Chromium already installed for the e2e suite, so no
// image library is needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, 'public');
const svg = readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');

// Apple and "maskable" icons are cropped by the OS itself, so they get a
// full-bleed square with the glyph kept inside the central safe zone.
const fullBleed = svg
  .replace('rx="8"', 'rx="0"')
  .replace(/<path /, '<g transform="translate(16 16) scale(0.8) translate(-16 -16)"><path ')
  .replace('</svg>', '')
  .replace(/(<circle[^>]*\/>)/, '$1</g>')
  .concat('</svg>');

const targets = [
  { file: 'favicon-32.png', size: 32, source: svg },
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'apple-touch-icon.png', size: 180, source: fullBleed },
  { file: 'icon-maskable-512.png', size: 512, source: fullBleed },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, source } of targets) {
  await page.setViewportSize({ width: size, height: size });
  const sized = source.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: path.join(publicDir, file), omitBackground: true });
  console.log(`wrote public/${file}`);
}
await browser.close();
