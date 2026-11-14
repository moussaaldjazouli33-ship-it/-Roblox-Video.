import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makeCharacter } from './character.js';
import { noise1, lerp, easeInOut, clamp } from './util.js';

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || 1080), H = +(params.get('h') || 1920);
const storyName = params.get('story') || 'preview';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 2000);
scene.add(camera);
const world = buildWorld(scene);

// Cinematic vignette + warm grade overlay attached to the camera (no text, image only).
{
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 120, 256, 256, 380);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(20,6,10,0.55)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  const vig = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  vig.renderOrder = 999; vig.position.z = -1; camera.add(vig);
  const fit = () => { const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); vig.scale.set(h * camera.aspect / 2 * 1.02, h / 2 * 1.02, 1); };
  camera.userData.fitVignette = fit;
  // full-screen flash/fade plane for transitions
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  fade.renderOrder = 1000; fade.position.z = -0.99; camera.add(fade);
  camera.userData.fade = fade;
  camera.userData.fitFade = () => { const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); fade.scale.set(h * camera.aspect, h, 1); };
}

const ctx = { THREE, scene, camera, renderer, world, makeCharacter };
const story = (await import(`./stories/${storyName}.js`)).default;
story.setup(ctx);

const _p = new THREE.Vector3(), _l = new THREE.Vector3();
function vec(v, t) { return typeof v === 'function' ? v(t) : v; }

/** Shot = { start, end, from:{pos, look}, to:{pos, look}, fov, fovTo, shake, ease } — pos/look can be fns(t). */
function applyCamera(t) {
  const shots = story.shots;
  let s = shots[shots.length - 1];
  for (const sh of shots) if (t >= sh.start && t < sh.end) { s = sh; break; }
  const k = (s.ease || easeInOut)(clamp((t - s.start) / (s.end - s.start)));
  const fp = vec(s.from.pos, t), tp = vec((s.to || s.from).pos, t);
  const fl = vec(s.from.look, t), tl = vec((s.to || s.from).look, t);
  _p.set(lerp(fp[0], tp[0], k), lerp(fp[1], tp[1], k), lerp(fp[2], tp[2], k));
  _l.set(lerp(fl[0], tl[0], k), lerp(fl[1], tl[1], k), lerp(fl[2], tl[2], k));
  const sh = s.shake ?? 0.06;
  _p.x += noise1(t * 0.9, 1) * sh; _p.y += noise1(t * 1.1, 2) * sh; _l.x += noise1(t * 0.7, 3) * sh * 0.6; _l.y += noise1(t * 0.8, 4) * sh * 0.6;
  if (s.impact) { const d = t - s.impact.at; if (d > 0 && d < s.impact.dur) { const a = (1 - d / s.impact.dur) * s.impact.amt; _p.x += Math.sin(d * 70) * a; _p.y += Math.cos(d * 63) * a; } }
  camera.position.copy(_p); camera.lookAt(_l);
  if (s.roll) camera.rotateZ(vec(s.roll, t) * 1);
  camera.fov = lerp(s.fov ?? 40, s.fovTo ?? s.fov ?? 40, k);
  camera.updateProjectionMatrix(); camera.userData.fitVignette(); camera.userData.fitFade();
  return s;
}

window.renderAt = (t) => {
  story.update(t, ctx);
  applyCamera(t);
  world.update(t, camera);
  const f = story.fade ? story.fade(t) : 0;
  camera.userData.fade.material.opacity = f;
  renderer.render(scene, camera);
};
window.frameJPEG = (t, q = 0.93) => { window.renderAt(t); return renderer.domElement.toDataURL('image/jpeg', q); };
window.storyDuration = story.duration;
window.ready = true;
