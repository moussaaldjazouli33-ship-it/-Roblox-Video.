// Captures d'images fixes pour vérifier un plan : node scripts/snap.mjs 1.5 20 46.3 ...
import fs from 'node:fs';
import { openScene } from './browser.mjs';
const times = process.argv.slice(2).map(Number);
const dir = process.env.SNAP_DIR || 'out/snaps';
fs.mkdirSync(dir, { recursive: true });
const { page, close } = await openScene();
for (const t of times) {
  const t0 = Date.now();
  const url = await page.evaluate(t => window.captureFrame(t, 0.9), t);
  fs.writeFileSync(`${dir}/t${t.toFixed(2).padStart(6, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`t=${t} → ${Date.now() - t0} ms`);
}
await close();
