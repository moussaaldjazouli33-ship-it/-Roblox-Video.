// Textures procédurales (canvas) : façades, visages Roblox, sol, rayures de danger…
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Façade : une grille de COLS×ROWS fenêtres par tuile. Renvoie {map, emissive}
export function facadeTextures(seed, { cols = 4, rows = 4, glass = '#3b4a66', frame = '#e9e9ee', wall = '#ffffff', litRatio = 0.55, warm = true, shop = false } = {}) {
  const S = 256, rnd = mulberry32(seed);
  const [c, g] = canvas(S, S), [e, ge] = canvas(S, S);
  g.fillStyle = wall; g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const cw = S / cols, ch = S / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = x * cw + cw * 0.2, py = y * ch + ch * 0.18, w = cw * 0.6, h = ch * 0.62;
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px - 3, py - 3, w + 6, h + 8); // ombre du cadre
    g.fillStyle = frame; g.fillRect(px - 2, py - 2, w + 4, h + 4);
    const gr = g.createLinearGradient(px, py, px + w, py + h);
    gr.addColorStop(0, glass); gr.addColorStop(1, '#1d2537');
    g.fillStyle = gr; g.fillRect(px, py, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px + 2, py + 2, w * 0.25, h - 4); // reflet
    g.fillStyle = frame; g.fillRect(px + w / 2 - 1, py, 2, h);
    if (rnd() < litRatio) {
      const col = warm ? (rnd() < 0.7 ? '#ffe7a8' : '#fff6e0') : (rnd() < 0.5 ? '#eaf2ff' : '#fff3c9');
      ge.fillStyle = col; ge.fillRect(px, py, w, h);
      ge.fillStyle = 'rgba(0,0,0,0.25)'; ge.fillRect(px + w / 2 - 1, py, 2, h);
    }
    // bas de fenêtre (appui)
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px - 3, py + h + 2, w + 6, 3);
  }
  return { map: tex(c), emissive: tex(e) };
}

// Gratte-ciel : grille très dense
export function towerTextures(seed) {
  return facadeTextures(seed, { cols: 8, rows: 10, glass: '#3e4f73', frame: '#f4f5f8', wall: '#f4f5f8', litRatio: 0.75, warm: false });
}

export function tileTexture() {
  const S = 512, [c, g] = canvas(S, S), rnd = mulberry32(7);
  g.fillStyle = '#c9c4be'; g.fillRect(0, 0, S, S);
  const n = 8, s = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 195 + Math.floor(rnd() * 22);
    g.fillStyle = `rgb(${v},${v - 4},${v - 9})`;
    g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
  }
  g.strokeStyle = 'rgba(80,70,60,0.35)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
  return tex(c);
}

export function asphaltTexture() {
  const S = 512, [c, g] = canvas(S, S), rnd = mulberry32(3);
  g.fillStyle = '#5b5e66'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) { const v = 70 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v + 5},0.35)`; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  return tex(c);
}

export function hazardTexture() {
  const S = 128, [c, g] = canvas(S, S);
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#1b1b1b';
  for (let i = -S; i < S * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - S, S); g.lineTo(i - S, S); g.fill(); }
  return tex(c);
}

export function fenceTexture() {
  const S = 128, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S); g.strokeStyle = '#c9ccd2'; g.lineWidth = 5;
  for (let i = 0; i <= S; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  return tex(c);
}

export function stripeTexture(colors) {
  const S = 128, [c, g] = canvas(S, 32), w = S / colors.length;
  colors.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * w, 0, w, 32); });
  return tex(c);
}

// Visages Roblox : 'smile', 'scared', 'shout', 'serious', 'worried'
const faceCache = {};
export function faceTexture(kind = 'smile') {
  if (faceCache[kind]) return faceCache[kind];
  const S = 256, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#111';
  const eye = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const big = kind === 'scared' || kind === 'shout';
  eye(90, 100, big ? 16 : 13, big ? 26 : 22); eye(166, 100, big ? 16 : 13, big ? 26 : 22);
  g.fillStyle = '#fff';
  if (big) { eye(94, 92, 5, 7); eye(170, 92, 5, 7); }
  g.strokeStyle = '#111'; g.lineWidth = 9; g.lineCap = 'round';
  if (kind === 'serious' || kind === 'worried' || kind === 'shout') { // sourcils
    g.beginPath(); g.moveTo(66, kind === 'worried' ? 70 : 66); g.lineTo(110, kind === 'worried' ? 54 : 58); g.stroke();
    g.beginPath(); g.moveTo(190, kind === 'worried' ? 70 : 66); g.lineTo(146, kind === 'worried' ? 54 : 58); g.stroke();
  }
  g.fillStyle = '#111';
  if (kind === 'smile') { g.beginPath(); g.arc(128, 150, 42, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (kind === 'scared') { g.beginPath(); g.ellipse(128, 175, 20, 28, 0, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'shout') { g.beginPath(); g.ellipse(128, 172, 34, 30, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c33'; g.beginPath(); g.ellipse(128, 186, 20, 10, 0, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'worried') { g.beginPath(); g.arc(128, 190, 30, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
  else { g.beginPath(); g.moveTo(100, 168); g.lineTo(156, 168); g.stroke(); }
  return (faceCache[kind] = tex(c, false));
}

// Visage du monstre : tête "haut-parleur" grise, yeux noirs, bouche ronde dentée
export function monsterFaceTextures() {
  const S = 512, [c, g] = canvas(S, S), [e, ge] = canvas(S, S);
  const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#d9d9d4'); gr.addColorStop(1, '#a8a8a2');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(11);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,50,40,${rnd() * 0.12})`; g.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 20, 2 + rnd() * 6); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(14, 14, S - 28, S - 28);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const eye = (x) => {
    g.fillStyle = '#121212'; g.beginPath(); g.ellipse(x, 170, 62, 70, 0, 0, 7); g.fill();
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.ellipse(x, 170, 40, 46, 0, 0, 7); g.fill();
    ge.fillStyle = '#ff2a1a'; ge.beginPath(); ge.ellipse(x, 172, 16, 18, 0, 0, 7); ge.fill();
    g.fillStyle = '#5a0b07'; g.beginPath(); g.ellipse(x, 172, 16, 18, 0, 0, 7); g.fill();
  };
  eye(150); eye(362);
  // bouche
  g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(256, 360, 96, 0, 7); g.fill();
  g.fillStyle = '#3a0e0e'; g.beginPath(); g.arc(256, 360, 54, 0, 7); g.fill();
  g.fillStyle = '#f2ede0';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r0 = 94, r1 = 62;
    g.beginPath();
    g.moveTo(256 + Math.cos(a - 0.15) * r0, 360 + Math.sin(a - 0.15) * r0);
    g.lineTo(256 + Math.cos(a + 0.15) * r0, 360 + Math.sin(a + 0.15) * r0);
    g.lineTo(256 + Math.cos(a) * r1, 360 + Math.sin(a) * r1); g.fill();
  }
  g.strokeStyle = '#555'; g.lineWidth = 8; g.beginPath(); g.arc(256, 360, 100, 0, 7); g.stroke();
  return { map: tex(c, false), emissive: tex(e, false) };
}

export function rustTexture() {
  const S = 256, [c, g] = canvas(S, S), rnd = mulberry32(5);
  g.fillStyle = '#8a8178'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(30,26,24,0.4)` : `rgba(110,70,45,0.25)`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 30, 1 + rnd() * 4);
  }
  return tex(c);
}

// Texture douce ronde pour particules (fumée, étincelles, gouttes)
export function softDot() {
  const S = 64, [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); return t;
}
