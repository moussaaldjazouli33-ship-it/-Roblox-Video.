// Sous-titres dynamiques style TikTok : groupes de 1 à 3 mots, apparition "pop", mots clés en jaune
import { clamp, easeOutBack } from './util.js';

// mots importants → jaune
const KEY = new Set(('monster darkness dark lights light nobody safe three years seven vanished sunrise daylight strange froze frozen weakness six enormous floodlights floodlight generator ' +
  '12 armed guards never moved last night dad security first night shift 2 a.m. boom exploded calm five radio crackled damaged shut down overheating emergency immediately ' +
  'police cars flashlights lamps click entire went emergency thunderstorm violent rain slipped water headlights screamed tripped cable flashlight flew terrifying scream ' +
  'blood-curdling silence wrong no longer right front enormous hand breathing save move don\'t dead already').split(' '));
const norm = w => w.toLowerCase().replace(/[.,!?"]/g, '');

export function buildChunks(transcript) {
  const words = transcript.flatMap(s => s.words);
  const chunks = []; let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], next = words[i + 1];
    cur.push(w);
    const punct = /[.,!?]$/.test(w.w), gap = next ? next.s - w.e : 9;
    if (cur.length >= 3 || punct || gap > 0.3 || !next) { chunks.push(cur); cur = []; }
  }
  return chunks.map((ws, i) => ({
    start: ws[0].s - 0.05,
    end: Math.min(chunks[i + 1] ? chunks[i + 1][0].s - 0.05 : ws[ws.length - 1].e + 0.6, ws[ws.length - 1].e + 0.8),
    words: ws.map(w => ({ text: w.w.replace(/[,.]$/, '').toUpperCase(), s: w.s, key: KEY.has(norm(w.w)) || KEY.has(norm(w.w).replace(/'s$/, '')) })),
  }));
}

export class Subtitles {
  constructor(transcript, W, H) {
    this.chunks = buildChunks(transcript); this.W = W; this.H = H;
  }
  draw(ctx, t) {
    const c = this.chunks.find(c => t >= c.start && t < c.end);
    if (!c) return;
    const W = this.W, age = t - c.start;
    const pop = easeOutBack(clamp(age / 0.18));
    const out = clamp((c.end - t) / 0.08);
    const base = 118, gapX = 26, lineH = 150;
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // mise en page (retour à la ligne si trop large)
    const items = c.words.map(w => { const size = base * (w.key ? 1.12 : 1); ctx.font = `${size}px "Luckiest Guy"`; return { ...w, size, width: ctx.measureText(w.text).width }; });
    const lines = [[]]; let lw = 0;
    for (const it of items) { if (lw + it.width > W * 0.84 && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push(it); lw += it.width + gapX; }
    const cy = this.H * 0.645 - (lines.length - 1) * lineH / 2;
    ctx.globalAlpha = out; ctx.translate(W / 2, cy); ctx.scale(pop, pop); ctx.translate(-W / 2, -cy);
    lines.forEach((line, li) => {
      const total = line.reduce((a, it) => a + it.width, 0) + gapX * (line.length - 1);
      let x = (W - total) / 2; const y = cy + li * lineH;
      for (const it of line) {
        const spoken = t >= it.s - 0.04, k = clamp((t - it.s) / 0.12);
        const s = spoken ? 1 + 0.12 * Math.sin(Math.PI * k) : 1;
        ctx.save(); ctx.translate(x + it.width / 2, y); ctx.scale(s, s); ctx.rotate(it.key && spoken ? -0.03 : 0);
        ctx.font = `${it.size}px "Luckiest Guy"`; ctx.textAlign = 'center';
        if (!spoken) { ctx.restore(); x += it.width + gapX; continue; }
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowOffsetY = 9; ctx.shadowBlur = 4;
        ctx.lineWidth = 22; ctx.strokeStyle = '#000'; ctx.strokeText(it.text, 0, 6);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = it.key ? '#ffe41a' : '#ffffff';
        ctx.fillText(it.text, 0, 6);
        ctx.restore();
        x += it.width + gapX;
      }
    });
    ctx.restore();
  }
}
