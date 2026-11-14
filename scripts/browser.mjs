// Ouvre la scène dans Chromium headless (WebGL logiciel) — partagé par snap.mjs et render.mjs
import { createRequire } from 'node:module';
// Playwright local (npm i -D playwright) ou installation globale
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
import { startServer } from './serve.mjs';

export async function openScene({ port = 5199, scale = 1 } = {}) {
  const server = await startServer(port);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', e => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${port}/?render&scale=${scale}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
  return { page, close: async () => { await browser.close(); server.close(); } };
}
