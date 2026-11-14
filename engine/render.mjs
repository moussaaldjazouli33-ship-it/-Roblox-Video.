// Usage: node render.mjs --story preview --out out.mp4 [--audio voice.mp3] [--from 0 --to 8] [--fps 30] [--stills 1,3.5]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const root = path.dirname(new URL(import.meta.url).pathname);
const fps = +(args.fps || 30), W = +(args.w || 1080), H = +(args.h || 1920);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e));
await page.goto(`http://localhost:${port}/index.html?story=${args.story || 'preview'}&w=${W}&h=${H}`);
await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
const duration = await page.evaluate('window.storyDuration');

if (args.stills) {
  for (const t of args.stills.split(',').map(Number)) {
    const data = await page.evaluate(([t]) => window.frameJPEG(t, 0.92), [t]);
    const f = (args.outdir || '.') + `/still_${t.toFixed(2)}.jpg`;
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); console.log('wrote', f);
  }
} else {
  const from = +(args.from || 0), to = +(args.to || duration);
  const n = Math.round((to - from) * fps);
  const ff = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
  if (args.audio) ff.push('-ss', String(from), '-t', String(to - from), '-i', args.audio);
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart');
  if (args.audio) ff.push('-c:a', 'aac', '-b:a', '192k', '-map', '0:v', '-map', '1:a', '-shortest');
  ff.push(args.out || 'out.mp4');
  const proc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'pipe'] });
  let err = ''; proc.stderr.on('data', (d) => (err += d));
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = from + i / fps;
    const data = await page.evaluate(([t]) => window.frameJPEG(t, 0.93), [t]);
    if (!proc.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => proc.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)}s/frame`);
  }
  proc.stdin.end();
  const code = await new Promise((r) => proc.on('close', r));
  if (code) console.error(err.slice(-2000)); else console.log('done', args.out);
}
await browser.close(); server.close();
