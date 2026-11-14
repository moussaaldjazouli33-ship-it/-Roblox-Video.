import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, canvasTex, clamp, smooth, noise1 } from './util.js';

export const O = { ocean: 2000, mansion: 3000, silent: 4000, gas: 5000, hosp: 6000, vault: 7000, lab: 8000 };

const std = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function box(parent, w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function noiseTex(base, amt, n, seed, repeat, size = 256, extra) {
  const r = rng(seed);
  return canvasTex(THREE, size, size, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { const v = (r() - 0.5) * amt; ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    if (extra) extra(ctx, w, h, r);
  }, { repeat });
}
const tiles = (ctx, w, h, step, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2; for (let i = 0; i <= w; i += step) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); } };

// ---------------------------------------------------------------- street hatches
export function buildHatches(world) {
  const hatches = [];
  const lidCols = ['#c9a227', '#3b7dd8', '#c0392b', '#27ae60', '#8e44ad', '#e67e22', '#7f8c8d', '#16a085', '#d35400', '#2c3e50'];
  const ringMat = std('#4d4f55', 0.5, 0.6);
  const stripe = canvasTex(THREE, 256, 16, (ctx, w, h) => { for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#1a1a1a' : '#e8b923'; ctx.fillRect(i * 16, 0, 16, h); } });
  stripe.wrapS = THREE.RepeatWrapping;
  let k = 0;
  for (let z = -6; z > -200; z -= 16) {
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.35, 28), ringMat); base.position.y = 0.55; base.castShadow = true; base.receiveShadow = true; g.add(base);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.76, 1.76, 0.12, 28, 1, true), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 })); band.position.y = 0.6; g.add(band);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.6; g.add(glow);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 7.6; g.add(beam);
      const hinge = new THREE.Group(); hinge.position.set(0, 0.75, -1.5); g.add(hinge);
      const lidMat = std(lidCols[k % lidCols.length], 0.45, 0.5);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.22, 28), lidMat); lid.position.set(0, 0, 1.5); lid.castShadow = true; hinge.add(lid);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 20), std('#2b2b2b', 0.4, 0.7)); wheel.rotation.x = Math.PI / 2; wheel.position.set(0, 0.2, 1.5); hinge.add(wheel);
      g.position.set(side * 9.2, 0, z - (side > 0 ? 8 : 0));
      g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      world.group.add(g);
      hatches.push({ g, hinge, glow, beam, setOpen(a, light = a) { hinge.rotation.x = -a * 1.9; glow.material.color.setRGB(1 * light + 0.05, 0.85 * light + 0.05, 0.62 * light + 0.05); beam.material.opacity = 0.18 * light; } });
      hatches[hatches.length - 1].setOpen(0, 0);
      k++;
    }
  }
  return hatches;
}

// ---------------------------------------------------------------- ocean glass bunker
export function buildOcean(scene) {
  const X = O.ocean, g = new THREE.Group(); scene.add(g);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 60, 60), new THREE.MeshStandardMaterial({ map: noiseTex('#c2b28a', 0.2, 6000, 3, [30, 30]), roughness: 1 }));
  const pos = sand.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.08) * 0.8 + Math.cos(pos.getY(i) * 0.06) * 0.8);
  sand.geometry.computeVertexNormals(); sand.rotation.x = -Math.PI / 2; sand.position.set(X, -0.5, 0); sand.receiveShadow = true; g.add(sand);
  const r = rng(21);
  const rockMat = std('#5d6a6a', 1);
  for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = 18 + r() * 60; const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + r() * 3, 0), rockMat); m.position.set(X + Math.cos(a) * d, 0, Math.sin(a) * d); m.castShadow = true; g.add(m); }
  const weeds = [];
  const weedMat = std('#2f7a4a', 0.9);
  for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = 15 + r() * 40; const h = 3 + r() * 7; const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), weedMat); w.geometry.translate(0, h / 2, 0); w.position.set(X + Math.cos(a) * d, -0.3, Math.sin(a) * d); g.add(w); weeds.push([w, r() * 6]); }
  // the dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bff3ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  dome.position.set(X, 0, 0); g.add(dome);
  const frameMat = std('#cfd8dc', 0.3, 0.8);
  for (let i = 0; i < 10; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(11, 0.15, 6, 40, Math.PI), frameMat); rib.rotation.y = (i / 10) * Math.PI; rib.position.set(X, 0, 0); g.add(rib); }
  for (const h of [3.5, 7]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(121 - h * h), 0.15, 6, 48), frameMat); ring.rotation.x = Math.PI / 2; ring.position.set(X, h, 0); g.add(ring); }
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.6, 48), std('#e9eef0', 0.4)); floor.position.set(X, -0.2, 0); floor.receiveShadow = true; g.add(floor);
  // furniture
  box(g, 6, 1.2, 2, std('#3f6fa0', 0.8), X - 2, 0.7, 3); box(g, 6, 2, 0.6, std('#3f6fa0', 0.8), X - 2, 1.5, 3.8);
  box(g, 3, 0.2, 2, std('#ffffff', 0.3), X - 2, 1.4, 0.5); box(g, 0.3, 1.2, 0.3, std('#999', 0.3), X - 2, 0.7, 0.5);
  const lamp = new THREE.PointLight('#fff2d0', 60, 25); lamp.position.set(X, 8, 0); g.add(lamp);
  // fish
  const nf = 70, fish = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), nf);
  const fc = ['#f5a623', '#ff6f61', '#ffd166', '#5ad1e6', '#ffffff'], fs = [];
  for (let i = 0; i < nf; i++) { fish.setColorAt(i, new THREE.Color(fc[i % fc.length])); fs.push([14 + r() * 25, 1 + r() * 14, r() * 6.28, 0.2 + r() * 0.4]); }
  fish.frustumCulled = false; g.add(fish);
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.6 }), 120);
  const bs = []; for (let i = 0; i < 120; i++) bs.push([r() * 50 - 25, r() * 50 - 25, r()]); bubbles.frustumCulled = false; g.add(bubbles);
  // light shafts
  const shafts = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#bdf4ff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); s.position.set(X - 20 + i * 8, 28, -15 + (i % 3) * 10); s.rotation.z = 0.25; g.add(s); shafts.push(s); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  return {
    group: g, X,
    update(t) {
      for (let i = 0; i < nf; i++) { const [rad, h, ph, sp] = fs[i]; const a = ph + t * sp * (i % 2 ? 1 : -1); v.set(X + Math.cos(a) * rad, h + Math.sin(t + i) * 0.4, Math.sin(a) * rad); e.set(0, -a + (i % 2 ? 0 : Math.PI), Math.sin(t * 6 + i) * 0.15); q.setFromEuler(e); m4.compose(v, q, one); fish.setMatrixAt(i, m4); }
      fish.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 120; i++) { const [bx, bz, p] = bs[i]; v.set(X + bx + Math.sin(t * 2 + i) * 0.3, ((p * 30 + t * 2.5) % 30), bz); m4.compose(v, q.identity(), one); bubbles.setMatrixAt(i, m4); }
      bubbles.instanceMatrix.needsUpdate = true;
      for (const [w, ph] of weeds) w.rotation.z = Math.sin(t * 1.2 + ph) * 0.15;
      shafts.forEach((s, i) => (s.material.opacity = 0.05 + Math.sin(t * 0.8 + i) * 0.02));
    },
  };
}

// ---------------------------------------------------------------- luxury mansion bunker
export function buildMansion(scene) {
  const X = O.mansion, g = new THREE.Group(); scene.add(g);
  const marble = noiseTex('#efe7da', 0.08, 3000, 5, [8, 8], 256, (ctx, w, h) => tiles(ctx, w, h, 128, 'rgba(160,140,110,0.5)'));
  box(g, 60, 0.4, 50, std('#ffffff', 0.25, 0.1, { map: marble }), X, -0.2, 0, false);
  const wallMat = std('#e9d8b8', 0.7), gold = std('#d4af37', 0.3, 0.9), wood = std('#6b4226', 0.6);
  box(g, 60, 18, 1, wallMat, X, 9, -25); box(g, 1, 18, 50, wallMat, X - 30, 9, 0); box(g, 1, 18, 50, wallMat, X + 30, 9, 0);
  for (let i = -28; i <= 28; i += 7) { box(g, 1.2, 18, 1.4, std('#f6efe2', 0.5), X + i, 9, -24.3); box(g, 1.4, 0.5, 1.6, gold, X + i, 0.25, -24.2); }
  box(g, 60, 0.6, 1.4, gold, X, 17.5, -24.3);
  // pool
  const water = new THREE.Mesh(new THREE.PlaneGeometry(24, 12, 40, 20), new THREE.MeshStandardMaterial({ color: '#2fc4e8', roughness: 0.05, metalness: 0.2, emissive: '#0a6f8f', emissiveIntensity: 0.5, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(X - 4, 0.02, -6); g.add(water);
  box(g, 25, 0.5, 0.8, std('#ffffff', 0.4), X - 4, 0.1, 0.4, false); box(g, 25, 0.5, 0.8, std('#ffffff', 0.4), X - 4, 0.1, -12.4, false);
  box(g, 0.8, 0.5, 13.6, std('#ffffff', 0.4), X - 16.4, 0.1, -6, false); box(g, 0.8, 0.5, 13.6, std('#ffffff', 0.4), X + 8.4, 0.1, -6, false);
  // loungers
  for (let i = 0; i < 3; i++) { const l = box(g, 2, 0.5, 5, std('#ffffff', 0.6), X - 12 + i * 6, 0.6, 6); const b = box(g, 2, 0.5, 2, std('#ffffff', 0.6), X - 12 + i * 6, 1.3, 8.2); b.rotation.x = -0.7; }
  // banquet table with "unlimited food"
  box(g, 14, 0.4, 4, std('#ffffff', 0.5), X + 16, 2.6, 4); box(g, 13.6, 2.4, 3.6, wood, X + 16, 1.2, 4);
  const r = rng(77), foodCols = ['#e74c3c', '#f1c40f', '#e67e22', '#8e44ad', '#2ecc71', '#d35400', '#fdf2e9', '#a0522d'];
  for (let i = 0; i < 46; i++) {
    const c = foodCols[Math.floor(r() * foodCols.length)];
    const kind = r();
    const geo = kind < 0.4 ? new THREE.SphereGeometry(0.28 + r() * 0.2, 10, 8) : kind < 0.7 ? new THREE.CylinderGeometry(0.5, 0.5, 0.5 + r() * 0.4, 16) : new RoundedBoxGeometry(0.7, 0.4, 0.5, 2, 0.12);
    const m = new THREE.Mesh(geo, std(c, 0.6)); m.position.set(X + 9.6 + r() * 12.8, 3.05 + (kind > 0.4 && kind < 0.7 ? 0.1 : 0), 2.4 + r() * 3.2); m.castShadow = true; g.add(m);
  }
  for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 20), std('#ffffff', 0.3)); p.position.set(X + 10 + i * 3, 2.85, 4); g.add(p); }
  // chandeliers
  const lights = [];
  for (const cx of [-10, 6, 18]) {
    const c = new THREE.Group(); c.position.set(X + cx, 13, -2); g.add(c);
    c.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 24), gold)); c.children[0].rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false })); b.position.set(Math.cos(i / 8 * 6.28) * 1.5, 0.2, Math.sin(i / 8 * 6.28) * 1.5); c.add(b); }
    const pl = new THREE.PointLight('#ffe2a8', 140, 40); pl.position.set(X + cx, 12, -2); g.add(pl); lights.push(pl);
  }
  // plants
  for (const [px, pz] of [[-26, -20], [26, -20], [-26, 18], [26, 18]]) { box(g, 2, 2, 2, std('#ffffff', 0.4), X + px, 1, pz); const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), std('#3c8d40', 1)); f.position.set(X + px, 3.6, pz); f.castShadow = true; g.add(f); }
  return {
    group: g, X, poolY: 0.02, pool: [X - 4, -6],
    update(t) { const p = water.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.9 + t * 2) * 0.05 + Math.cos(p.getY(i) * 1.1 + t * 1.6) * 0.05); p.needsUpdate = true; water.geometry.computeVertexNormals(); },
  };
}

// ---------------------------------------------------------------- silent bunker (No. 12)
export function buildSilent(scene) {
  const X = O.silent, g = new THREE.Group(); scene.add(g);
  const conc = noiseTex('#6b6764', 0.25, 9000, 9, [4, 2]);
  const cm = std('#ffffff', 0.95, 0, { map: conc });
  box(g, 30, 0.4, 24, cm, X, -0.2, 0, false); box(g, 30, 12, 1, cm, X, 6, -12); box(g, 1, 12, 24, cm, X - 15, 6, 0); box(g, 1, 12, 24, cm, X + 15, 6, 0);
  // bunk beds
  const metal = std('#3a3c40', 0.5, 0.7), sheet = std('#5a5f4e', 1);
  for (const bx of [-10, 9]) for (const by of [1.2, 4.6]) { box(g, 3.2, 0.3, 7, metal, X + bx, by, -7); box(g, 3, 0.5, 6.6, sheet, X + bx, by + 0.4, -7); }
  for (const bx of [-11.5, -8.5, 7.5, 10.5]) for (const bz of [-10.4, -3.6]) box(g, 0.25, 6, 0.25, metal, X + bx, 3, bz);
  // shelves with cans, pipes
  for (let i = 0; i < 3; i++) box(g, 8, 0.25, 1.4, metal, X, 2 + i * 2.2, -11.2);
  const r = rng(12); for (let i = 0; i < 30; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), std(['#8a8d91', '#b03a2e', '#c9b458'][i % 3], 0.4, 0.6)); c.position.set(X - 3.6 + (i % 10) * 0.8, 2.45 + Math.floor(i / 10) * 2.2, -11.2); g.add(c); }
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 10), metal); p.rotation.z = Math.PI / 2; p.position.set(X, 10.5 - i * 0.7, -11.3); g.add(p); }
  // single red bulb
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b2a', toneMapped: false })); bulb.position.set(X, 10, -2); g.add(bulb);
  const wire = box(g, 0.05, 2, 0.05, metal, X, 11, -2, false);
  const red = new THREE.PointLight('#ff3020', 120, 35, 1.6); red.position.set(X, 9.5, -2); red.castShadow = true; red.shadow.mapSize.set(1024, 1024); g.add(red);
  return { group: g, X, update(t) { const f = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3); red.intensity = 120 * f; bulb.position.x = X + Math.sin(t * 0.9) * 0.15; } };
}

// ---------------------------------------------------------------- gas station (night)
export function buildGas(scene) {
  const X = O.gas, g = new THREE.Group(); scene.add(g);
  box(g, 200, 0.2, 200, std('#ffffff', 0.95, 0, { map: noiseTex('#46454b', 0.3, 15000, 4, [20, 20]) }), X, -0.1, 0, false);
  const road = box(g, 14, 0.05, 200, std('#2e2d33', 0.95), X + 24, 0.02, 0, false);
  for (let z = -100; z < 100; z += 9) box(g, 0.35, 0.03, 4, std('#d8d0c0', 0.8), X + 24, 0.06, z, false);
  // canopy
  const white = std('#e6e3dc', 0.6), redMat = std('#b8322a', 0.6);
  box(g, 22, 1.4, 14, white, X, 9, 0); box(g, 22.2, 0.6, 14.2, redMat, X, 8.6, 0);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(21, 13), new THREE.MeshBasicMaterial({ color: '#f4f1df', toneMapped: false })); under.rotation.x = Math.PI / 2; under.position.set(X, 8.25, 0); g.add(under);
  for (const px of [-7, 7]) for (const pz of [-4, 4]) box(g, 0.8, 8.3, 0.8, white, X + px, 4.15, pz);
  for (const px of [-7, 7]) { box(g, 3, 0.6, 7, std('#9a948a', 0.8), X + px, 0.3, 0); for (const pz of [-1.8, 1.8]) { box(g, 1.3, 3.6, 1.0, redMat, X + px, 2.4, pz); box(g, 1.0, 0.9, 1.04, std('#1a1a1a', 0.2), X + px, 3.2, pz, false); } }
  const canopyLight = new THREE.PointLight('#f4f1df', 220, 40, 1.4); canopyLight.position.set(X, 7.6, 0); canopyLight.castShadow = true; canopyLight.shadow.mapSize.set(1024, 1024); g.add(canopyLight);
  // store
  const sx = X - 22;
  const wallM = std('#c9c1b0', 0.9);
  box(g, 18, 8, 0.6, wallM, sx, 4, -8); box(g, 0.6, 8, 16, wallM, sx - 9, 4, 0); box(g, 0.6, 8, 16, wallM, sx + 9, 4, 0);
  box(g, 18, 2, 0.6, wallM, sx, 7, 8); box(g, 4, 6, 0.6, wallM, sx - 7, 3, 8); box(g, 4, 6, 0.6, wallM, sx + 7, 3, 8);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshStandardMaterial({ color: '#8fb0c0', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.8, depthWrite: false })); glass.position.set(sx, 3, 8); g.add(glass);
  box(g, 18, 0.6, 16.6, std('#4a4744', 0.9), sx, 8.3, 0);
  // counter, shelves, debris
  box(g, 8, 2.6, 2, std('#6b4b35', 0.7), sx + 2, 1.3, -2);
  for (let i = 0; i < 3; i++) { box(g, 1.2, 4, 6, std('#7b7f86', 0.5, 0.5), sx - 6 + i * 0.01, 2, -2 - i * 0.01); }
  box(g, 1.2, 4, 6, std('#7b7f86', 0.5, 0.5), sx - 6, 2, -2).rotation.z = 0.0;
  const r = rng(55); for (let i = 0; i < 24; i++) { const c = box(g, 0.6, 0.8, 0.5, std(['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'][i % 4], 0.6), sx - 5.4, 0.6 + Math.floor(i / 6) * 1.0, -4.5 + (i % 6) * 1.0); c.rotation.y = r(); }
  box(g, 3, 0.3, 2, std('#4b5a6b', 1), sx + 3, 0.15, -5); // sleeping mat behind counter
  const lampStore = new THREE.PointLight('#ffb36b', 45, 16, 1.4); lampStore.position.set(sx + 3, 2.2, -4.5); g.add(lampStore);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false })); candle.position.set(sx + 5.2, 0.25, -5); g.add(candle);
  // moonlight-ish street lamps
  for (const z of [-40, 0, 40]) { box(g, 0.3, 10, 0.3, std('#2b2b2b', 0.5, 0.5), X + 16, 5, z); }
  return {
    group: g, X, store: [sx, 0, 0],
    update(t) {
      const flick = (Math.sin(t * 31) > 0.86 || Math.sin(t * 5.3 + 1) > 0.97) ? 0.15 : 1;
      canopyLight.intensity = 220 * flick; under.material.color.setScalar(0.25 + 0.75 * flick);
      lampStore.intensity = 42 + Math.sin(t * 9) * 4 + Math.sin(t * 23) * 1.5;
    },
  };
}

// ---------------------------------------------------------------- abandoned hospital (night)
export function buildHospital(scene, world) {
  const X = O.hosp, g = new THREE.Group(); scene.add(g);
  box(g, 300, 0.2, 300, std('#ffffff', 0.95, 0, { map: noiseTex('#3f3e44', 0.3, 15000, 6, [25, 25]) }), X, -0.1, 0, false);
  const win = canvasTex(THREE, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d9dcd6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#20252b'; ctx.fillRect(20, 26, 88, 66); ctx.fillStyle = '#9aa0a0'; ctx.fillRect(20, 92, 88, 6);
  }, { repeat: [12, 6] });
  const facade = std('#ffffff', 0.85, 0, { map: win });
  const plain = std('#cfd2cc', 0.9);
  const b = new THREE.Mesh(new THREE.BoxGeometry(60, 36, 20), [plain, plain, plain, plain, facade, plain]); b.position.set(X, 18, -50); b.castShadow = true; b.receiveShadow = true; g.add(b);
  const wingMat = [plain, plain, plain, plain, std('#ffffff', 0.85, 0, { map: win.clone() }), plain];
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 40), wingMat); w.position.set(X + s * 42, 12, -40); w.castShadow = true; g.add(w); }
  // red cross emblem (symbol only)
  const crossM = new THREE.MeshStandardMaterial({ color: '#c81e1e', emissive: '#ff2a2a', emissiveIntensity: 0.6 });
  box(g, 2.2, 7, 0.4, crossM, X, 30, -39.7, false); box(g, 7, 2.2, 0.4, crossM, X, 30, -39.7, false);
  // entrance
  box(g, 16, 0.8, 8, std('#bfc3bd', 0.8), X, 7.5, -36); for (const px of [-7, 7]) box(g, 0.7, 7.5, 0.7, std('#bfc3bd', 0.8), X + px, 3.75, -32.5);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ color: '#05070a' })); door.position.set(X, 3, -39.9); g.add(door);
  // ambulance + debris
  const amb = world.makeCar('#e8e8e8', 0, 0, 0.6, true); g.add(amb); amb.position.set(X + 14, 0, -24);
  box(g, 8, 0.4, 0.3, std('#b8322a', 0.6), X + 14, 1.6, -24, false).rotation.y = 0.6;
  const r = rng(31); for (let i = 0; i < 18; i++) { const p = box(g, 1 + r(), 0.05, 0.8, std('#cdbb98', 1), X - 20 + r() * 40, 0.05, -30 + r() * 40); p.rotation.y = r() * 3; }
  // flickering lamp posts
  const lamps = [];
  for (const [lx, lz] of [[-12, -8], [12, -8], [-12, 12], [12, 12]]) {
    box(g, 0.3, 9, 0.3, std('#2b2b2b', 0.5, 0.5), X + lx, 4.5, lz);
    const h = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: '#cfe3ff', toneMapped: false })); h.position.set(X + lx, 9, lz); g.add(h);
    const pl = new THREE.PointLight('#cfe3ff', 70, 26, 1.5); pl.position.set(X + lx, 8.5, lz); g.add(pl); lamps.push([pl, h, r() * 10]);
  }
  return { group: g, X, update(t) { for (const [pl, h, ph] of lamps) { const on = Math.sin(t * 17 + ph) > -0.7 && Math.sin(t * 3 + ph) > -0.95 ? 1 : 0.1; pl.intensity = 70 * on; h.material.color.setScalar(on); } } };
}

// ---------------------------------------------------------------- Bunker 100: corridor, vault door, monitor room
function iconCanvas() { const c = document.createElement('canvas'); c.width = 512; c.height = 320; return c; }
export function buildVault(scene) {
  const X = O.vault, g = new THREE.Group(); scene.add(g);
  const conc = noiseTex('#5b5d61', 0.25, 9000, 13, [6, 2]);
  const cm = std('#ffffff', 0.9, 0, { map: conc });
  const metal = std('#6f747a', 0.35, 0.85), dark = std('#2a2d31', 0.5, 0.6);
  // corridor (z from +40 to door at z=0)
  box(g, 20, 0.4, 120, cm, X, -0.2, -20, false);
  box(g, 1, 22, 50, cm, X - 10, 11, 20); box(g, 1, 22, 50, cm, X + 10, 11, 20);
  for (let z = 4; z < 45; z += 8) { box(g, 1.2, 22, 1.2, dark, X - 9.3, 11, z); box(g, 1.2, 22, 1.2, dark, X + 9.3, 11, z); }
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 50, 10), metal); p.rotation.x = Math.PI / 2; p.position.set(X - 8.8, 15 + i, 20); g.add(p); const p2 = p.clone(); p2.position.x = X + 8.8; g.add(p2); }
  const corrLights = [];
  for (let z = 6; z < 45; z += 12) { const l = new THREE.PointLight('#ffd9a8', 50, 20, 1.6); l.position.set(X, 13, z); g.add(l); corrLights.push(l); const h = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: '#ffe8c8', toneMapped: false })); h.position.set(X, 14, z); g.add(h); }
  // wall with the giant round door
  const stripe = canvasTex(THREE, 512, 64, (ctx, w, h) => { for (let i = -2; i < 20; i++) { ctx.fillStyle = '#e8b923'; ctx.beginPath(); ctx.moveTo(i * 40, h); ctx.lineTo(i * 40 + 20, h); ctx.lineTo(i * 40 + 60, 0); ctx.lineTo(i * 40 + 40, 0); ctx.fill(); } }, {});
  { const sh = new THREE.Shape(); sh.moveTo(-10, 0); sh.lineTo(10, 0); sh.lineTo(10, 22); sh.lineTo(-10, 22); sh.lineTo(-10, 0);
    const hole = new THREE.Path(); hole.absarc(0, 9, 7.9, 0, Math.PI * 2, true); sh.holes.push(hole);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false, curveSegments: 48 }); wg.translate(0, 0, -2);
    const wm = new THREE.Mesh(wg, std('#5b5d61', 0.9)); wm.position.set(X, 0, 0); wm.castShadow = true; wm.receiveShadow = true; g.add(wm); }
  const doorG = new THREE.Group(); doorG.position.set(X, 9, 0.2); g.add(doorG);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(8, 0.9, 12, 48), metal); doorG.add(frame);
  const halves = [];
  for (const s of [-1, 1]) {
    const hg = new THREE.Group(); doorG.add(hg);
    const shape = new THREE.Shape(); shape.moveTo(0, -7.6); shape.absarc(0, 0, 7.6, -Math.PI / 2, Math.PI / 2, s < 0); shape.lineTo(0, -7.6);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, curveSegments: 32 }); geo.translate(0, 0, -0.6);
    const m = new THREE.Mesh(geo, std('#8a9097', 0.3, 0.9)); m.castShadow = true; hg.add(m);
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i + 0.5) / 6 * Math.PI; const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), dark); bolt.rotation.x = Math.PI / 2; bolt.position.set(-s * Math.cos(a) * 6.3, Math.sin(a) * 6.3, 0.9); hg.add(bolt); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 0.4), dark); bar.position.set(-s * 3.2, 0, 0.9); hg.add(bar);
    halves.push([hg, s]);
  }
  // emblem: concentric glowing rings + three bars (no lettering)
  const emblemMat = new THREE.MeshBasicMaterial({ color: '#7fd4ff', toneMapped: false });
  const emblem = new THREE.Group(); emblem.position.z = 1.0; doorG.add(emblem);
  emblem.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 48), emblemMat));
  emblem.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 48), emblemMat));
  for (let i = 0; i < 3; i++) { const sb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.1), emblemMat); sb.position.set(-0.5 + i * 0.5, 0, 0); emblem.add(sb); }
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(20, 1.2), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 })); hazard.position.set(X, 0.62, 0.05); hazard.rotation.x = 0; g.add(hazard);
  const hazard2 = hazard.clone(); hazard2.position.y = 19; g.add(hazard2);
  const behind = new THREE.PointLight('#e8f4ff', 0, 60, 1.2); behind.position.set(X, 9, -4); g.add(behind);
  const flood = new THREE.Mesh(new THREE.CircleGeometry(7.6, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); flood.position.set(X, 9, -0.8); g.add(flood);

  // monitor room behind the door (z from -2 to -60)
  box(g, 70, 30, 1, std('#1b1e22', 0.7), X, 15, -60);
  box(g, 1, 30, 58, std('#1b1e22', 0.7), X - 35, 15, -31); box(g, 1, 30, 58, std('#1b1e22', 0.7), X + 35, 15, -31);
  box(g, 70, 30, 1, std('#1b1e22', 0.7), X - 0, 15, -2.2).visible = false;
  const backWall = new THREE.Group(); g.add(backWall);
  for (const s of [-1, 1]) box(g, 25, 30, 1, std('#1b1e22', 0.7), X + s * 22.5, 15, -2.2);
  box(g, 20, 8, 1, std('#1b1e22', 0.7), X, 26, -2.2);
  // monitor textures
  const feedCols = [['#1d6f8f', '#bdf4ff'], ['#d4af37', '#2fc4e8'], ['#2a0d0d', '#ff3b2a'], ['#e39274', '#3a3b41'], ['#4a5568', '#9fb4d0'], ['#2e8b57', '#d8f6ff']];
  const feeds = feedCols.map(([a, b], i) => canvasTex(THREE, 128, 80, (ctx, w, h) => {
    const r = rng(90 + i);
    const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(1, '#0a0a0a'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b; for (let k = 0; k < 4; k++) ctx.fillRect(r() * w * 0.8, h * 0.4 + r() * h * 0.4, 8 + r() * 30, 6 + r() * 20);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(10, 9, 3.5, 0, 7); ctx.fill(); // REC dot
  }));
  const redTex = canvasTex(THREE, 128, 80, (ctx, w, h) => {
    ctx.fillStyle = '#7a0000'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ff1a1a';
    ctx.beginPath(); ctx.moveTo(w / 2, 14); ctx.lineTo(w / 2 + 26, 64); ctx.lineTo(w / 2 - 26, 64); ctx.closePath(); ctx.lineWidth = 6; ctx.strokeStyle = '#ff4a3a'; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  });
  const monitors = [];
  const screenGeo = new THREE.PlaneGeometry(3.6, 2.25);
  const caseMat = std('#111316', 0.5, 0.4);
  const r = rng(404);
  for (let row = 0; row < 7; row++) for (let col = -8; col <= 8; col++) {
    if (row >= 2 && row <= 4 && Math.abs(col) <= 2) continue; // big centre screen there
    const x = col * 4.0, y = 3 + row * 2.85;
    const ang = -col * 0.035;
    const zz = -58.5 + Math.abs(col) * 0.6;
    const casing = box(g, 3.9, 2.55, 0.5, caseMat, X + x, y, zz - 0.3, false); casing.rotation.y = ang;
    const sm = new THREE.MeshBasicMaterial({ map: feeds[Math.floor(r() * feeds.length)], toneMapped: false });
    const s = new THREE.Mesh(screenGeo, sm); s.position.set(X + x, y, zz); s.rotation.y = ang; g.add(s);
    monitors.push({ s, sm, base: sm.map, ph: r() * 10, order: Math.abs(col) * 0.6 + r() * 1.5 });
  }
  // the big centre screen with a dynamic canvas
  const bigC = iconCanvas(); const bigT = new THREE.CanvasTexture(bigC); bigT.colorSpace = THREE.SRGBColorSpace;
  box(g, 20.6, 8.9, 0.6, caseMat, X, 11.55, -58.9, false);
  const big = new THREE.Mesh(new THREE.PlaneGeometry(20, 8.4 * 1), new THREE.MeshBasicMaterial({ map: bigT, toneMapped: false })); big.position.set(X, 11.55, -58.55); g.add(big);
  const screenGlow = new THREE.PointLight('#9fd8ff', 80, 50, 1.3); screenGlow.position.set(X, 11, -50); g.add(screenGlow);
  // consoles
  for (let i = -2; i <= 2; i++) { const c = box(g, 8, 2.6, 3, std('#25282d', 0.5, 0.5), X + i * 9, 1.3, -48 + Math.abs(i) * 1.5); c.rotation.y = -i * 0.15; const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshBasicMaterial({ color: '#2a9fd8', toneMapped: false })); p.position.set(X + i * 9, 2.65, -48 + Math.abs(i) * 1.5); p.rotation.x = -1.2; p.rotation.z = i * 0.15; g.add(p); }
  // alarm beacons
  const beacons = [];
  for (const [bx, bz] of [[-30, -20], [30, -20], [-30, -45], [30, -45], [-9, -3.5], [9, -3.5]]) {
    const bg = new THREE.Group(); bg.position.set(X + bx, 24, bz); g.add(bg);
    bg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.9, 12), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false })));
    const spot = new THREE.SpotLight('#ff2a1a', 0, 60, 0.45, 0.6, 1.2); spot.position.set(0, 0, 0); bg.add(spot); bg.add(spot.target); spot.target.position.set(10, -8, 0);
    beacons.push([bg, spot, bg.children[0].material]);
  }
  const roomLight = new THREE.PointLight('#a8c4e8', 70, 80, 1.2); roomLight.position.set(X, 22, -25); g.add(roomLight);

  // ---- big screen painter (symbols only, never text)
  const bctx = bigC.getContext('2d');
  const W = 512, H = 320;
  function scan(a = 0.18) { bctx.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < H; y += 4) bctx.fillRect(0, y, W, 2); }
  function personIcon(cx, cy, s, col) {
    bctx.fillStyle = col;
    bctx.beginPath(); bctx.roundRect(cx - 26 * s, cy - 70 * s, 52 * s, 50 * s, 10 * s); bctx.fill(); // head
    bctx.beginPath(); bctx.roundRect(cx - 50 * s, cy - 14 * s, 100 * s, 70 * s, 14 * s); bctx.fill(); // shoulders
    bctx.fillStyle = col === '#ffffff' ? '#5b3920' : 'rgba(0,0,0,0.35)';
    bctx.beginPath(); bctx.roundRect(cx - 30 * s, cy - 82 * s, 60 * s, 20 * s, 8 * s); bctx.fill(); // messy hair block
  }
  function crosshair(cx, cy, rad, col, t) {
    bctx.strokeStyle = col; bctx.lineWidth = 4;
    bctx.beginPath(); bctx.arc(cx, cy, rad, 0, 7); bctx.stroke();
    bctx.beginPath(); bctx.arc(cx, cy, rad * 0.7, t, t + 4); bctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { bctx.beginPath(); bctx.moveTo(cx + dx * rad * 0.85, cy + dy * rad * 0.85); bctx.lineTo(cx + dx * rad * 1.25, cy + dy * rad * 1.25); bctx.stroke(); }
  }
  function biohazard(cx, cy, rad, col) {
    bctx.fillStyle = col; bctx.strokeStyle = col;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * 2.094;
      bctx.beginPath(); bctx.arc(cx + Math.cos(a) * rad * 0.55, cy + Math.sin(a) * rad * 0.55, rad * 0.5, 0, 7); bctx.fill();
    }
    bctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094; bctx.beginPath(); bctx.arc(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.72, rad * 0.36, 0, 7); bctx.fill(); }
    bctx.beginPath(); bctx.arc(cx, cy, rad * 0.16, 0, 7); bctx.fill();
    bctx.globalCompositeOperation = 'source-over';
    bctx.lineWidth = rad * 0.1; bctx.beginPath(); bctx.arc(cx, cy, rad * 0.42, 0, 7); bctx.stroke();
  }
  function staticNoise(r, a = 1) { for (let i = 0; i < 1600; i++) { const v = Math.floor(r() * 255); bctx.fillStyle = `rgba(${v},${v},${v},${a})`; bctx.fillRect(r() * W, r() * H, 6, 3); } }
  const oldImg = (t) => { // sepia "recording": silhouette of a scientist holding a baby
    bctx.fillStyle = '#5a4a32'; bctx.fillRect(0, 0, W, H);
    bctx.fillStyle = '#d8c9a3'; bctx.fillRect(40, 30, W - 80, H - 60);
    // scientist: round head, white coat with lapels, arms cradling a swaddled baby
    bctx.fillStyle = '#efe6d0'; bctx.beginPath(); bctx.moveTo(W / 2 - 80, H - 30); bctx.lineTo(W / 2 - 62, 150); bctx.lineTo(W / 2 + 62, 150); bctx.lineTo(W / 2 + 80, H - 30); bctx.fill();
    bctx.strokeStyle = '#6a5a40'; bctx.lineWidth = 4; bctx.beginPath(); bctx.moveTo(W / 2, 150); bctx.lineTo(W / 2 - 20, 205); bctx.moveTo(W / 2, 150); bctx.lineTo(W / 2 + 20, 205); bctx.stroke();
    bctx.fillStyle = '#c9a383'; bctx.beginPath(); bctx.arc(W / 2, 112, 34, 0, 7); bctx.fill();
    bctx.fillStyle = '#8a8070'; bctx.beginPath(); bctx.arc(W / 2, 98, 34, Math.PI, 0); bctx.fill();
    bctx.fillStyle = '#3a2f20'; bctx.fillRect(W / 2 - 14, 112, 7, 7); bctx.fillRect(W / 2 + 8, 112, 7, 7);
    bctx.fillStyle = '#a9c0d6'; bctx.beginPath(); bctx.ellipse(W / 2 + 6, 222, 62, 24, -0.15, 0, 7); bctx.fill();
    bctx.fillStyle = '#e8c6a6'; bctx.beginPath(); bctx.arc(W / 2 - 46, 228, 17, 0, 7); bctx.fill();
    bctx.fillStyle = '#efe6d0'; bctx.fillRect(W / 2 - 75, 238, 150, 22);
    bctx.fillStyle = 'rgba(40,30,15,0.35)'; for (let y = 0; y < H; y += 3) bctx.fillRect(0, y, W, 1);
  };
  const vault = {
    group: g, X, halves, emblem, emblemMat, behind, flood, monitors, beacons, big, screenGlow, roomLight, corrLights,
    mode: 'feeds', redWave: -1, alarm: 0, doorOpen: 0, count: 10,
    update(t) {
      // door
      for (const [hg, s] of halves) hg.position.x = s * vault.doorOpen * 9;
      flood.material.color.setScalar(clamp(vault.doorOpen * 3)); flood.visible = vault.doorOpen > 0.001;
      behind.intensity = vault.doorOpen * 400;
      emblemMat.color.setRGB(0.5 + 0.5 * Math.sin(t * 3) * 0.5 + 0.25, 0.83, 1);
      // small monitors
      for (const m of monitors) {
        const red = vault.redWave >= 0 && t - vault.redWave > m.order * 0.45;
        m.sm.map = red ? redTex : m.base;
        const fl = red ? 0.6 + 0.4 * Math.max(0, Math.sin(t * 8 + m.ph)) : 0.85 + 0.15 * Math.sin(t * 2 + m.ph);
        m.sm.color.setScalar(fl);
      }
      // beacons
      for (const [bg, spot, mat] of beacons) { bg.rotation.y = t * 6; spot.intensity = vault.alarm * 900; mat.color.setRGB(0.3 + 0.7 * vault.alarm, 0.05, 0.03); }
      // big screen
      const r = rng(Math.floor(t * 30));
      const mode = vault.mode;
      if (mode === 'feeds') { bctx.fillStyle = '#0d2a3a'; bctx.fillRect(0, 0, W, H); for (let i = 0; i < 6; i++) { bctx.drawImage(feeds[i].image, (i % 3) * (W / 3) + 6, Math.floor(i / 3) * (H / 2) + 6, W / 3 - 12, H / 2 - 12); } scan(0.1); }
      else if (mode === 'static') { bctx.fillStyle = '#222'; bctx.fillRect(0, 0, W, H); staticNoise(r); }
      else if (mode === 'subject') {
        bctx.fillStyle = '#04121c'; bctx.fillRect(0, 0, W, H);
        const gl = r() < 0.12 ? (r() - 0.5) * 30 : 0;
        personIcon(W / 2 + gl, H / 2 + 30, 1.3, '#ffffff'); crosshair(W / 2 + gl, H / 2 - 10, 110, '#ff3b2a', t * 2);
        if (r() < 0.15) { bctx.fillStyle = 'rgba(255,40,40,0.5)'; bctx.fillRect(0, r() * H, W, 8 + r() * 20); }
        scan(0.2);
      } else if (mode === 'red') { bctx.fillStyle = Math.sin(t * 8) > 0 ? '#a00000' : '#5a0000'; bctx.fillRect(0, 0, W, H); bctx.lineWidth = 14; bctx.strokeStyle = '#ff3b2a'; bctx.beginPath(); bctx.moveTo(W / 2, 50); bctx.lineTo(W / 2 + 110, 260); bctx.lineTo(W / 2 - 110, 260); bctx.closePath(); bctx.stroke(); scan(0.25); }
      else if (mode === 'old') { oldImg(t); if (r() < 0.3) staticNoise(r, 0.25); }
      else if (mode === 'bio') { oldImg(t); bctx.fillStyle = 'rgba(80,0,0,0.55)'; bctx.fillRect(0, 0, W, H); const p = 0.75 + 0.25 * Math.abs(Math.sin(t * 4)); biohazard(W / 2, H / 2, 120 * p, `rgba(255,${40 + 40 * p},30,1)`); scan(0.2); }
      else if (mode === 'activated') {
        bctx.fillStyle = '#1a0000'; bctx.fillRect(0, 0, W, H);
        const p = 0.7 + 0.3 * Math.abs(Math.sin(t * 5));
        personIcon(W / 2, H / 2 + 34, 1.0, `rgba(255,${60 * p},${40 * p},1)`);
        // countdown ring of 10 lights
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI * 2; const on = i < vault.count; bctx.fillStyle = on ? '#ff2a1a' : '#3a0a0a'; bctx.beginPath(); bctx.arc(W / 2 + Math.cos(a) * 130, H / 2 + Math.sin(a) * 130, 14, 0, 7); bctx.fill(); }
        scan(0.22);
      }
      bigT.needsUpdate = true;
      const glowCol = { feeds: '#7fc8ff', static: '#cccccc', subject: '#a8dcff', red: '#ff2a1a', old: '#d8b878', bio: '#ff4020', activated: '#ff2a1a' }[mode];
      screenGlow.color.set(glowCol);
    },
  };
  return vault;
}

// ---------------------------------------------------------------- lab (old recording)
export function buildLab(scene) {
  const X = O.lab, g = new THREE.Group(); scene.add(g);
  const tile = noiseTex('#e8ece8', 0.06, 2000, 15, [6, 3], 256, (ctx, w, h) => tiles(ctx, w, h, 32, 'rgba(120,140,130,0.45)'));
  const wm = std('#ffffff', 0.5, 0, { map: tile });
  box(g, 40, 0.4, 30, std('#ffffff', 0.6, 0, { map: tile.clone() }), X, -0.2, 0, false);
  box(g, 40, 16, 1, wm, X, 8, -15); box(g, 1, 16, 30, wm, X - 20, 8, 0); box(g, 1, 16, 30, wm, X + 20, 8, 0);
  const steel = std('#b8bec4', 0.3, 0.8);
  box(g, 14, 0.4, 3.5, steel, X - 8, 3, -12); for (const px of [-14, -2]) box(g, 0.3, 3, 3, steel, X + px, 1.5, -12);
  const r = rng(8);
  for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1 + r(), 12), new THREE.MeshStandardMaterial({ color: ['#61e294', '#7fd4ff', '#ffd166'][i % 3], emissive: ['#2fa85f', '#2a8fbf', '#b8860b'][i % 3], emissiveIntensity: 0.6, transparent: true, opacity: 0.8 })); b.position.set(X - 14 + i * 1.3, 3.8, -12); g.add(b); }
  // incubator / crib
  box(g, 5, 2.5, 3, std('#dfe6ea', 0.4, 0.3), X + 7, 1.25, -9);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 3), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, roughness: 0.05 })); hood.position.set(X + 7, 3.5, -9); g.add(hood);
  // machines
  for (let i = 0; i < 3; i++) { box(g, 3, 7, 2.5, std('#c4ccd0', 0.5, 0.4), X + 12 + i * 3.2, 3.5, -13.5); const sc = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), new THREE.MeshBasicMaterial({ color: '#4fd18b', toneMapped: false })); sc.position.set(X + 12 + i * 3.2, 5, -12.2); g.add(sc); }
  const lights = []; for (const lx of [-8, 8]) { const l = new THREE.PointLight('#f2fff6', 120, 40, 1.3); l.position.set(X + lx, 14, -2); g.add(l); lights.push(l); }
  return { group: g, X, update(t) { lights.forEach((l, i) => (l.intensity = 120 * (Math.sin(t * 40 + i) > 0.97 ? 0.6 : 1))); } };
}
