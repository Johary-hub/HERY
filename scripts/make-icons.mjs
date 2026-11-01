// Génère les icônes PNG à partir de public/icons/icon.svg (utilise Playwright/Chromium).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Playwright est préinstallé globalement dans l'environnement de dev (non requis pour l'app).
const { chromium } = require('playwright');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  { name: 'icon-192.png', size: 192, pad: 0 },
  { name: 'icon-512.png', size: 512, pad: 0 },
  { name: 'maskable-512.png', size: 512, pad: 0.12 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0 },
];
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:#12161c;display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: join(dir, t.name), omitBackground: false });
}
await browser.close();
console.log('Icônes générées dans', dir);
