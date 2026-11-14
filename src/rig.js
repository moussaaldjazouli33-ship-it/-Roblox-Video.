// Personnage "Roblox" (R6) articulé : tête, torse, 2 bras, 2 jambes + animations procédurales
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { faceTexture } from './textures.js';
import { makeBeam } from './effects.js';

const GEO = {
  head: new RoundedBoxGeometry(1.25, 1.2, 1.2, 4, 0.32),
  torso: new RoundedBoxGeometry(2, 2, 1, 3, 0.12),
  limb: new RoundedBoxGeometry(1, 2, 1, 3, 0.12),
};
GEO.limb.translate(0, -1, 0); // pivot en haut du membre (épaule / hanche)

export class Rig {
  constructor({ skin = '#f5cd8a', shirt = '#1c1c22', pants = '#2c3550', shoes = '#1a1a1a', hair = null, hat = null, scale = 1, vest = null, face = 'smile' } = {}) {
    const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const mk = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const skinM = M(skin), shirtM = M(shirt), pantsM = M(pants);
    this.hip = new THREE.Group(); this.hip.position.y = 2; this.body.add(this.hip);
    this.torso = mk(GEO.torso, shirtM, this.hip, 0, 1, 0);
    if (vest) { const v = mk(new RoundedBoxGeometry(2.08, 1.3, 1.08, 2, 0.1), M(vest), this.hip, 0, 1.25, 0); }
    // jambes
    this.legL = new THREE.Group(); this.legL.position.set(-0.5, 0, 0); this.hip.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.5, 0, 0); this.hip.add(this.legR);
    mk(GEO.limb, pantsM, this.legL, 0, 0, 0); mk(GEO.limb, pantsM, this.legR, 0, 0, 0);
    const shoeG = new RoundedBoxGeometry(1.02, 0.4, 1.1, 2, 0.1);
    mk(shoeG, M(shoes), this.legL, 0, -1.8, 0.04); mk(shoeG, M(shoes), this.legR, 0, -1.8, 0.04);
    // bras (pivot épaule)
    this.armL = new THREE.Group(); this.armL.position.set(-1.5, 2, 0); this.hip.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(1.5, 2, 0); this.hip.add(this.armR);
    mk(GEO.limb, shirtM, this.armL, 0, 0, 0); mk(GEO.limb, shirtM, this.armR, 0, 0, 0);
    // mains (couleur peau)
    const handG = new RoundedBoxGeometry(1.02, 0.6, 1.02, 2, 0.12);
    mk(handG, skinM, this.armL, 0, -1.7, 0); mk(handG, skinM, this.armR, 0, -1.7, 0);
    // tête
    this.neck = new THREE.Group(); this.neck.position.y = 2; this.hip.add(this.neck);
    this.head = mk(GEO.head, skinM, this.neck, 0, 0.62, 0);
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(face), transparent: true, depthWrite: false });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), this.faceMat); fp.position.set(0, 0, 0.61); this.head.add(fp);
    if (hair) this.addHair(hair);
    if (hat) this.addHat(hat);
    this.root.scale.setScalar(scale);
    this.hand = { L: new THREE.Group(), R: new THREE.Group() };
    this.hand.L.position.y = -2.05; this.armL.add(this.hand.L);
    this.hand.R.position.y = -2.05; this.armR.add(this.hand.R);
  }
  addHair(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.55, 1.35, 2, 0.15), m); top.position.set(0, 0.6, -0.04); this.head.add(top);
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.38, 1.0, 0.35, 2, 0.12), m); back.position.set(0, 0.15, -0.55); this.head.add(back);
    // mèches en pointe (style avatar de la référence)
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 4), m);
      s.position.set(-0.55 + i * 0.27, 0.85, 0.35); s.rotation.set(0.9, 0, (i - 2) * 0.25); this.head.add(s);
    }
    for (const sx of [-1, 1]) { const s = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.8, 1.0, 1, 0.08), m); s.position.set(sx * 0.68, 0.2, -0.1); this.head.add(s); }
  }
  addHat(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.7, 0.55, 20), m); cap.position.y = 0.72; this.head.add(cap);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.72, 0.25, 20), m); top.position.y = 1.05; this.head.add(top);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3 }));
    visor.position.set(0, 0.5, 0.68); visor.rotation.x = 0.2; this.head.add(visor);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: '#f5c542', metalness: 0.8, roughness: 0.3 }));
    badge.position.set(0, 0.78, 0.72); this.head.add(badge);
  }
  // Lampe torche tenue dans la main droite (faisceau dirigé dans l'axe du bras)
  giveFlashlight(side = 'R', beamLen = 22) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6, roughness: 0.4 }));
    body.position.y = -0.3; g.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6d8', emissiveIntensity: 4 }));
    lens.position.y = -0.95; g.add(lens);
    const beam = makeBeam(beamLen, 3.2, '#fff4d6', 0.22); beam.position.y = -1.0; g.add(beam);
    this.hand[side].add(g);
    this.flashlight = { group: g, lens, beam };
    return this.flashlight;
  }
  setFlashlight(on) {
    if (!this.flashlight) return;
    this.flashlight.lens.material.emissiveIntensity = on ? 4 : 0;
    this.flashlight.beam.visible = on > 0;
    this.flashlight.beam.material.uniforms.opacity.value = 0.22 * on;
  }
  setFace(kind) { const t = faceTexture(kind); if (this.faceMat.map !== t) { this.faceMat.map = t; this.faceMat.needsUpdate = true; } }

  // ---------- Poses ----------
  reset() {
    for (const p of [this.armL, this.armR, this.legL, this.legR, this.neck, this.hip, this.body]) p.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.armL.rotation.z = -0.05; this.armR.rotation.z = 0.05;
    return this;
  }
  place(x, z, heading = 0, y = 0) { this.root.position.set(x, y, z); this.root.rotation.set(0, heading, 0); return this; }
  face(x, z) { this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z); return this; }
  idle(t, k = 1) {
    const b = Math.sin(t * 2.2) * 0.04 * k;
    this.body.position.y = b; this.armL.rotation.z = -0.07 - b; this.armR.rotation.z = 0.07 + b;
    this.neck.rotation.y = Math.sin(t * 0.7) * 0.15 * k;
    return this;
  }
  walk(phase, amp = 0.7) {
    const s = Math.sin(phase);
    this.legL.rotation.x = s * amp; this.legR.rotation.x = -s * amp;
    this.armL.rotation.x = -s * amp * 0.9; this.armR.rotation.x = s * amp * 0.9;
    this.body.position.y = Math.abs(Math.cos(phase)) * 0.18 * amp;
    return this;
  }
  run(phase) { this.walk(phase, 1.15); this.hip.rotation.x = 0.18; this.armL.rotation.x -= 0.2; this.armR.rotation.x -= 0.2; return this; }
  // bras tendu devant (torche, pointer, viser)
  aim(side, pitch = 0, yaw = 0) { const a = side === 'L' ? this.armL : this.armR; a.rotation.set(-Math.PI / 2 + pitch, 0, 0); a.rotation.y = yaw; return this; }
  // bras levés (panique / cri)
  panic(t) { this.armL.rotation.set(-2.6 + Math.sin(t * 14) * 0.25, 0, -0.4); this.armR.rotation.set(-2.6 + Math.cos(t * 13) * 0.25, 0, 0.4); return this; }
}

// Personnages prédéfinis
export const LOOKS = {
  kid: { shirt: '#17181d', pants: '#2d3a5c', hair: '#6b3b1c', scale: 0.82, skin: '#f7d39c' },
  dad: { shirt: '#22324f', pants: '#1c2335', hat: '#1c2742', vest: '#2c3e63', skin: '#e8b98a' },
  guard: { shirt: '#2a3b5e', pants: '#1d2333', hat: '#1b2540', vest: '#121620', skin: '#f2c690' },
};
const CIVIL = [['#e04848', '#3a4a7a', '#3a2412'], ['#f2b632', '#2a2a2a', '#111'], ['#4aa3df', '#444', '#c79a4b'], ['#7fc46b', '#33476b', '#5a3a20'],
  ['#c66ad9', '#2b2b38', '#e7d36a'], ['#ff8a3d', '#384a5a', '#222'], ['#e9e9e9', '#5a3c2a', '#7a4b2a']];
export function civilian(i) { const [s, p, h] = CIVIL[i % CIVIL.length]; return new Rig({ shirt: s, pants: p, hair: h, skin: ['#f5cd8a', '#c58c5c', '#8d5a3b', '#f2c690'][i % 4] }); }
