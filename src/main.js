// Point d'entrée : prévisualisation temps réel (avec la voix off) + API de rendu image par image
import * as THREE from 'three';
import { World, W, H } from './world.js';
import { applyStory, SHOTS, DURATION, shotAt } from './story.js';
import { Subtitles } from './subtitles.js';
import { clamp } from './util.js';
import transcript from './transcript.json' with { type: 'json' };

const glCanvas = document.getElementById('gl');
const overlay = document.getElementById('overlay');
overlay.width = W; overlay.height = H;
const octx = overlay.getContext('2d');
const SCALE = +(new URLSearchParams(location.search).get('scale') || 1);
const world = new World(glCanvas, SCALE);
const subs = new Subtitles(transcript, W, H);
await document.fonts.load('100px "Luckiest Guy"');

function drawOverlay(t, s) {
  octx.clearRect(0, 0, W, H);
  const pill = (text, y, a, color = '#ffe41a') => {
    if (!text || a <= 0) return;
    octx.save(); octx.globalAlpha = clamp(a); octx.font = '78px "Luckiest Guy"'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
    const w = octx.measureText(text).width + 80;
    octx.fillStyle = 'rgba(0,0,0,0.55)'; octx.beginPath(); octx.roundRect(W / 2 - w / 2, y - 62, w, 124, 30); octx.fill();
    octx.lineWidth = 14; octx.strokeStyle = '#000'; octx.lineJoin = 'round'; octx.strokeText(text, W / 2, y + 6);
    octx.fillStyle = color; octx.fillText(text, W / 2, y + 6); octx.restore();
  };
  if (s.label) pill(s.label.text, 330, s.label.a);
  if (s.clock && s.clock.a > 0) {
    octx.save(); octx.globalAlpha = s.clock.a; octx.font = '150px "Luckiest Guy"'; octx.textAlign = 'center';
    octx.shadowColor = '#ff2a2a'; octx.shadowBlur = 40; octx.fillStyle = '#ff4d4d'; octx.lineWidth = 16; octx.strokeStyle = '#000';
    octx.strokeText(s.clock.text, W / 2, 420); octx.fillText(s.clock.text, W / 2, 420); octx.restore();
  }
  if (s.counter && s.counter.a > 0) pill(`MISSING: ${s.counter.n}`, 470, s.counter.a, '#ff5a5a');
  subs.draw(octx, t);
}

export function renderFrame(t) {
  t = clamp(t, 0, DURATION);
  const s = applyStory(world, t);
  // les lumières éteintes sont retirées du shader (gros gain de vitesse en rendu logiciel)
  for (const l of world.dynLights) l.visible = l.intensity > 0.001;
  world.env.apply(s);
  world.env.render();
  drawOverlay(t, s);
  return s;
}

// Composite final (3D + sous-titres) en JPEG pour l'export
const comp = document.createElement('canvas'); comp.width = Math.round(W * SCALE); comp.height = Math.round(H * SCALE);
const cctx = comp.getContext('2d');
window.captureFrame = (t, q = 0.94) => {
  renderFrame(t);
  cctx.drawImage(glCanvas, 0, 0); cctx.drawImage(overlay, 0, 0, comp.width, comp.height);
  return comp.toDataURL('image/jpeg', q);
};
window.renderFrame = renderFrame; window.world = world; window.THREE = THREE;
window.DURATION = DURATION;
window.SHOTS = SHOTS.map(s => ({ at: s.at, name: s.name }));
window.ready = true;

// ------------------- Interface de prévisualisation -------------------
const ui = document.getElementById('ui');
if (ui && !new URLSearchParams(location.search).has('render')) {
  const audio = document.getElementById('vo');
  const scrub = document.getElementById('scrub'), tl = document.getElementById('time'), shotName = document.getElementById('shot'), list = document.getElementById('shots');
  scrub.max = DURATION;
  SHOTS.forEach((s, i) => { const b = document.createElement('button'); b.textContent = `${s.at.toFixed(1)}s · ${s.name}`; b.onclick = () => { audio.currentTime = s.at + 0.01; draw(); }; list.appendChild(b); });
  let playing = false, fpsT = performance.now(), frames = 0, fps = 0;
  const draw = () => {
    const t = audio.currentTime; renderFrame(t); scrub.value = t;
    const i = shotAt(t); shotName.textContent = `Plan ${i + 1}/${SHOTS.length} — ${SHOTS[i].name}`;
    frames++; const now = performance.now(); if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
    tl.textContent = `${t.toFixed(2)} / ${DURATION.toFixed(2)} s · ${fps} i/s`;
    [...list.children].forEach((b, j) => b.classList.toggle('on', j === i));
  };
  const loop = () => { if (!playing) return; draw(); requestAnimationFrame(loop); };
  document.getElementById('play').onclick = () => { if (audio.paused) { audio.play(); playing = true; loop(); } else { audio.pause(); playing = false; } };
  scrub.oninput = () => { audio.currentTime = +scrub.value; draw(); };
  audio.onended = () => (playing = false);
  window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); document.getElementById('play').click(); } if (e.code === 'ArrowRight') { audio.currentTime += 1; draw(); } if (e.code === 'ArrowLeft') { audio.currentTime -= 1; draw(); } });
  draw();
}
