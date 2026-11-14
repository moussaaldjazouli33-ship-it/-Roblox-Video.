// Effets : faisceaux lumineux volumétriques, pluie, étincelles, fumée, éclairs
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { softDot } from './textures.js';

// Cône de lumière doux, additif. Pointe en (0,0,0) et s'étend vers -Y sur `len`.
const beamVS = `varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ vH = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const beamFS = `uniform vec3 color; uniform float opacity; varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float a = opacity * f * pow(vH, 1.4); gl_FragColor = vec4(color*a, a); }`;
export function makeBeam(len, radius, color = '#fff', opacity = 0.25) {
  const geo = new THREE.CylinderGeometry(0.15, radius, len, 32, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 10; m.frustumCulled = false;
  return m;
}
// oriente un faisceau (créé par makeBeam) de `from` vers `to`
export function aimBeam(beam, from, to) {
  beam.position.copy(from);
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
}

// Pluie : segments déterministes autour de la caméra
export class Rain {
  constructor(scene, n = 7000) {
    this.n = n; const rnd = mulberry32(99);
    this.seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { this.seed[i * 4] = rnd(); this.seed[i * 4 + 1] = rnd(); this.seed[i * 4 + 2] = rnd(); this.seed[i * 4 + 3] = 0.8 + rnd() * 0.4; }
    this.pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#c9d6ff', transparent: true, opacity: 0.45, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(t, cam, amount) {
    this.mesh.visible = amount > 0.01; if (!this.mesh.visible) return;
    this.mat.opacity = 0.42 * amount;
    const S = 50, H = 40, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, p = this.pos, sd = this.seed;
    const count = Math.floor(this.n * amount);
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      if (i >= count) { p[o] = p[o + 1] = p[o + 2] = p[o + 3] = p[o + 4] = p[o + 5] = 0; continue; }
      const sp = 55 * sd[i * 4 + 3];
      const x = cx + (sd[i * 4] - 0.5) * S, z = cz + (sd[i * 4 + 2] - 0.5) * S;
      let y = (sd[i * 4 + 1] * H - t * sp) % H; if (y < 0) y += H;
      y = cy - H / 2 + y;
      p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x + 0.25; p[o + 4] = y + 1.6; p[o + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Système de particules générique : chaque particule = f(âge) → déterministe
export class Burst {
  constructor(scene, { n = 200, color = '#ffb347', size = 0.5, additive = true, opacity = 1 } = {}) {
    this.n = n; this.pos = new Float32Array(n * 3); this.rnd = [];
    const r = mulberry32(n * 13 + size * 100);
    for (let i = 0; i < n; i++) this.rnd.push([r(), r(), r(), r()]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.visible = false; scene.add(this.points);
  }
  // étincelles balistiques depuis `origin` à partir de t0
  sparks(t, t0, origin, { speed = 18, life = 1.6, gravity = 22, spread = 1 } = {}) {
    const age = t - t0; this.points.visible = age > 0 && age < life + 0.5; if (!this.points.visible) return;
    this.mat.opacity = Math.max(0, 1 - age / life);
    for (let i = 0; i < this.n; i++) {
      const [a, b, c, d] = this.rnd[i], th = a * Math.PI * 2, ph = Math.acos(1 - 2 * b) * spread, v = speed * (0.3 + c * 0.7);
      const vx = Math.sin(ph) * Math.cos(th) * v, vy = Math.cos(ph) * v * 0.8 + 4, vz = Math.sin(ph) * Math.sin(th) * v;
      const tt = Math.min(age * (0.7 + d * 0.6), life);
      this.pos[i * 3] = origin.x + vx * tt; this.pos[i * 3 + 1] = Math.max(0.2, origin.y + vy * tt - 0.5 * gravity * tt * tt); this.pos[i * 3 + 2] = origin.z + vz * tt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  // fumée montante continue
  smoke(t, origin, { rate = 1, height = 14, spread = 3, on = 1 } = {}) {
    this.points.visible = on > 0.01; if (!this.points.visible) return;
    this.mat.opacity = 0.5 * on;
    for (let i = 0; i < this.n; i++) {
      const [a, b, c] = this.rnd[i], life = 3 + c * 2, age = ((t * rate + a * life) % life) / life;
      this.pos[i * 3] = origin.x + (b - 0.5) * spread * (0.3 + age * 2) + age * 2;
      this.pos[i * 3 + 1] = origin.y + age * height;
      this.pos[i * 3 + 2] = origin.z + (c - 0.5) * spread * (0.3 + age * 2);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// Éclair : ligne brisée générée par graine
export class Lightning {
  constructor(scene) {
    this.mat = new THREE.LineBasicMaterial({ color: '#e8eeff', transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    this.group = new THREE.Group(); scene.add(this.group); this.cache = {};
  }
  bolt(seed, top, bottom) {
    if (this.cache[seed]) return this.cache[seed];
    const r = mulberry32(seed), pts = [], N = 26, g = new THREE.Group();
    for (let i = 0; i <= N; i++) { const k = i / N; pts.push(new THREE.Vector3(top.x + (bottom.x - top.x) * k + (r() - 0.5) * 9 * (i % N ? 1 : 0), top.y + (bottom.y - top.y) * k, top.z + (bottom.z - top.z) * k + (r() - 0.5) * 9 * (i % N ? 1 : 0))); }
    for (let w = 0; w < 3; w++) { // ligne épaissie par décalages
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => p.clone().add(new THREE.Vector3(w * 0.25, 0, w * 0.2)))), this.mat); g.add(l);
    }
    for (let b = 0; b < 3; b++) { // branches
      const s = 5 + Math.floor(r() * 15), bp = [pts[s].clone()];
      for (let i = 1; i < 8; i++) bp.push(bp[i - 1].clone().add(new THREE.Vector3((r() - 0.5) * 8, -4 - r() * 3, (r() - 0.5) * 8)));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bp), this.mat));
    }
    this.group.add(g); g.visible = false; return (this.cache[seed] = g);
  }
  show(seed, top, bottom, intensity) {
    const b = this.bolt(seed, top, bottom); b.visible = intensity > 0.05; this.mat.opacity = Math.min(1, intensity);
  }
  hideAll() { for (const k in this.cache) this.cache[k].visible = false; }
}
