// Accessoires : tours de projecteurs, générateurs, clôture, voitures de police, câble, gravats
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { hazardTexture, fenceTexture } from './textures.js';
import { makeBeam, aimBeam } from './effects.js';
import { mulberry32 } from './util.js';
import { mergeStatic } from './merge.js';

const steel = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.55, metalness: 0.2 });
const hazard = hazardTexture();

export class FloodTower {
  constructor(i, angle, radius = 30, height = 34) {
    this.i = i; this.angle = angle; this.height = height;
    this.root = new THREE.Group();
    this.root.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    this.root.rotation.y = angle + Math.PI; // face au centre
    this.mast = new THREE.Group(); this.root.add(this.mast);
    const w = 2.6, H = height;
    // treillis : 4 montants + croisillons
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), steel); p.position.set(x * w / 2, H / 2, z * w / 2); p.castShadow = true; this.mast.add(p);
    }
    const n = 11, step = H / n, diag = Math.hypot(w, step);
    for (let k = 0; k < n; k++) for (let f = 0; f < 4; f++) {
      const g = new THREE.Group(); g.rotation.y = f * Math.PI / 2; this.mast.add(g);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, diag, 0.14), steel);
      b.position.set(0, k * step + step / 2, w / 2); b.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(w, step); g.add(b);
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.14), steel); h.position.set(0, k * step, w / 2); g.add(h);
    }
    // socle béton avec bandes de danger
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 4.5), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7 }));
    base.position.y = 1; base.castShadow = true; base.receiveShadow = true; this.root.add(base);
    // tête de projecteur
    this.head = new THREE.Group(); this.head.position.y = H + 1.2; this.head.rotation.x = 0.55; this.mast.add(this.head);
    const box = new THREE.Mesh(new RoundedBoxGeometry(5.5, 4, 2.4, 2, 0.3), steel); box.castShadow = true; this.head.add(box);
    this.lensMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7e0', emissiveIntensity: 6, roughness: 0.2 });
    this.lens = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.3, 0.2), this.lensMat); this.lens.position.z = 1.25; this.head.add(this.lens);
    // lumière réelle + cône volumétrique
    this.light = new THREE.SpotLight('#fff3dc', 0, 130, 0.5, 0.6, 1.1);
    this.light.position.set(0, H + 1.2, 1.5); this.root.add(this.light);
    this.target = new THREE.Object3D(); this.target.position.set(0, 21, radius); this.root.add(this.target); this.light.target = this.target;
    this.beam = makeBeam(46, 10, '#fff2d0', 0.045); this.root.add(this.beam);
    aimBeam(this.beam, new THREE.Vector3(0, H + 1.2, 1.4), new THREE.Vector3(0, 16, radius));
    // générateur au pied
    this.gen = new Generator(); this.gen.root.position.set(4.5, 0, 1); this.root.add(this.gen.root);
    mergeStatic(this.mast, { exclude: [this.head] });
    this.set(1);
  }
  set(v, broken = false, color = '#fff3dc') {
    this.on = v; this.light.color.set(color); this.lensMat.emissive.set(color);
    this.light.intensity = 260 * v;
    this.lensMat.emissiveIntensity = broken ? 0 : 0.3 + 6 * v;
    this.lensMat.color.set(broken ? '#222' : '#fff');
    this.beam.visible = v > 0.01; this.beam.material.uniforms.opacity.value = 0.045 * v;
  }
  get lensWorld() { return this.lens.getWorldPosition(new THREE.Vector3()); }
}

export class Generator {
  constructor() {
    this.root = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2.4, 2.2, 2, 0.15), new THREE.MeshStandardMaterial({ color: '#3d6b45', roughness: 0.6, metalness: 0.3 }));
    body.position.y = 1.2; body.castShadow = true; this.root.add(body);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.4, 2.25), new THREE.MeshStandardMaterial({ map: hazard })); strip.position.y = 0.3; this.root.add(strip);
    for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.05), steel); v.position.set(-1 + i * 0.3, 1.4, 1.11); this.root.add(v); }
    this.warnMat = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2200', emissiveIntensity: 0 });
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), this.warnMat); w.position.set(1.1, 2.55, 0.6); this.root.add(w);
    this.ventGlow = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff5a1a', emissiveIntensity: 0 });
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.06), this.ventGlow); g.position.set(0.6, 1.3, 1.12); this.root.add(g);
  }
  heat(v, t) { this.warnMat.emissiveIntensity = v * (Math.sin(t * 12) > 0 ? 4 : 0.3); this.ventGlow.emissiveIntensity = v * 2.5; }
}

export function buildFence(radius = 15) {
  const g = new THREE.Group();
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), steel, 48);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; m.makeTranslation(Math.sin(a) * radius, 1.6, Math.cos(a) * radius); posts.setMatrixAt(i, m); }
  posts.castShadow = true; g.add(posts);
  const railMat = new THREE.MeshStandardMaterial({ color: '#cfd2d8', metalness: 0.7, roughness: 0.35 });
  for (const y of [3.1, 1.6]) { const r = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 6, 96), railMat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  const ft = fenceTexture(); ft.repeat.set(70, 3);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 3, 96, 1, true), new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));
  mesh.position.y = 1.6; g.add(mesh);
  return g;
}

export class PoliceCar {
  constructor() {
    this.root = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.35, metalness: 0.2 });
    const black = new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.35, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1e2a3a', roughness: 0.1, metalness: 0.6 });
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; this.root.add(o); return o; };
    add(new RoundedBoxGeometry(4.4, 1.5, 9, 2, 0.35), black, 0, 1.4, 0);
    add(new RoundedBoxGeometry(4.45, 0.8, 4, 2, 0.2), white, 0, 1.7, 0);
    add(new RoundedBoxGeometry(3.8, 1.5, 4.6, 2, 0.35), white, 0, 2.8, -0.6);
    add(new THREE.BoxGeometry(3.6, 1.1, 0.1), glass, 0, 2.9, 1.73).rotation.x = -0.3;
    add(new THREE.BoxGeometry(3.85, 1.0, 3.6), glass, 0, 2.9, -0.6);
    this.red = new THREE.MeshStandardMaterial({ color: '#500', emissive: '#ff1a1a', emissiveIntensity: 0 });
    this.blue = new THREE.MeshStandardMaterial({ color: '#005', emissive: '#1a55ff', emissiveIntensity: 0 });
    add(new THREE.BoxGeometry(1.4, 0.45, 0.8), this.red, -0.75, 3.75, -0.6); add(new THREE.BoxGeometry(1.4, 0.45, 0.8), this.blue, 0.75, 3.75, -0.6);
    const wheel = new THREE.CylinderGeometry(0.85, 0.85, 0.6, 16); wheel.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-2.1, 2.9], [2.1, 2.9], [-2.1, -2.9], [2.1, -2.9]]) add(wheel, black, x, 0.85, z);
    this.headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fffbe8', emissiveIntensity: 0 });
    for (const x of [-1.5, 1.5]) add(new THREE.BoxGeometry(0.9, 0.4, 0.1), this.headMat, x, 1.6, 4.52);
    this.beams = [-1.5, 1.5].map(x => { const b = makeBeam(26, 4, '#fff8e0', 0.14); b.position.set(x, 1.6, 4.6); b.rotation.x = -Math.PI / 2 + 0.06; this.root.add(b); return b; });
  }
  set(t, { siren = 1, head = 1 } = {}) {
    const ph = Math.floor(t * 6) % 2;
    this.red.emissiveIntensity = siren * (ph ? 6 : 0.2); this.blue.emissiveIntensity = siren * (ph ? 0.2 : 6);
    this.headMat.emissiveIntensity = head * 4;
    for (const b of this.beams) { b.visible = head > 0.02; b.material.uniforms.opacity.value = 0.14 * head; }
  }
}

// Gros câble électrique au sol (courbe), avec zone endommagée
export function buildCable(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.28, 8), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 }));
  m.castShadow = true; m.curve = curve; return m;
}

export function buildRubble(radius = 9, n = 34, seed = 8) {
  const g = new THREE.Group(), r = mulberry32(seed);
  const mat = new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.9 });
  for (let i = 0; i < n; i++) {
    const s = 0.6 + r() * 1.6, b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s * 0.6, s), mat);
    const a = r() * Math.PI * 2, d = radius * (0.5 + r() * 0.6);
    b.position.set(Math.cos(a) * d, s * 0.3 + 0.3, Math.sin(a) * d); b.rotation.set(r() * 0.4, r() * 3, r() * 0.4); b.castShadow = true; b.receiveShadow = true; g.add(b);
  }
  return g;
}
