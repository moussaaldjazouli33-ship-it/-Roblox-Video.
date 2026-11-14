// Rendu final : capture image par image (déterministe) → MP4 H.264 1080×1920 30 i/s + voix off + bruitages
//   node scripts/render.mjs [--fps 30] [--workers 3] [--from 0] [--to 132.62] [--scale 1] [--out out/video.mp4]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { openScene } from './browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), WORKERS = +arg('workers', 3), SCALE = +arg('scale', 1);
const VO = 'assets/audio/voiceover.mp3', SFX = 'assets/audio/sfx.wav';
const voDur = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VO]).stdout.toString();
const FROM = +arg('from', 0), TO = +arg('to', voDur), OUT = arg('out', 'out/monstre-dans-le-noir.mp4');
const tmp = path.join('out', 'segments'); fs.mkdirSync(tmp, { recursive: true });
const total = Math.round((TO - FROM) * FPS);
console.log(`Rendu ${total} images (${FROM}s → ${TO.toFixed(2)}s) à ${FPS} i/s, ${WORKERS} processus, échelle ${SCALE}`);

const t0 = Date.now(); let done = 0;
const per = Math.ceil(total / WORKERS);
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const a = w * per, b = Math.min(total, a + per); if (a >= b) return;
  const seg = path.join(tmp, `seg${w}.mp4`);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-maxrate', '5500k', '-bufsize', '11000k', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const { page, close } = await openScene({ port: 5400 + w, scale: SCALE });
  for (let f = a; f < b; f++) {
    const t = FROM + f / FPS;
    const url = await page.evaluate(([t]) => window.captureFrame(t, 0.95), [t]);
    if (!ff.stdin.write(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    done++;
    if (done % 30 === 0) { const el = (Date.now() - t0) / 1000, eta = el / done * (total - done); console.log(`${done}/${total} images — ${el.toFixed(0)} s écoulées, reste ≈ ${(eta / 60).toFixed(1)} min`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await close();
}));

// concaténation + mixage audio (voix off 100 % + bruitages)
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, Array.from({ length: WORKERS }, (_, w) => `file 'seg${w}.mp4'`).filter((_, w) => w * per < total).join('\n'));
const audioIn = fs.existsSync(SFX) ? ['-ss', String(FROM), '-t', String(TO - FROM), '-i', VO, '-ss', String(FROM), '-t', String(TO - FROM), '-i', SFX] : ['-ss', String(FROM), '-t', String(TO - FROM), '-i', VO];
const mix = fs.existsSync(SFX)
  ? ['-filter_complex', '[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0[v];[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.32[s];[v][s]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]', '-map', '0:v', '-map', '[a]']
  : ['-map', '0:v', '-map', '1:a'];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, ...audioIn, ...mix,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
console.log(`✔ ${OUT} — ${((Date.now() - t0) / 60000).toFixed(1)} min`);
