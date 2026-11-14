// Le monstre géant articulé (~40 m) : tête "haut-parleur", membres longs et griffus, pointes
import * as THREE from 'three';
import { monsterFaceTextures, rustTexture } from './textures.js';

const T = 10, S = 10.5, UA = 12.5, FA = 12.5; // cuisses, tibias, bras, avant-bras

export class Monster {
  constructor() {
    const rust = rustTexture();
    const metal = new THREE.MeshStandardMaterial({ color: '#857a71', map: rust, roughness: 0.7, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#4f4842', map: rust, roughness: 0.8, metalness: 0.1 });
    const bone = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.6 });
    this.mats = [metal, dark];
    const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const limb = (len, w, mat, parent) => { // segment avec plaques pour un look "ferraille"
      const g = new THREE.Group(); parent.add(g);
      const geo = new THREE.BoxGeometry(w, len, w); geo.translate(0, -len / 2, 0);
      mk(geo, mat, g);
      for (let i = 0; i < 3; i++) { const p = mk(new THREE.BoxGeometry(w * 1.3, len * 0.12, w * 1.3), dark, g, 0, -len * (0.2 + i * 0.3), 0); p.rotation.y = i * 0.4; }
      return g;
    };
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group(); this.pelvis.position.y = T + S + 1; this.root.add(this.pelvis);
    mk(new THREE.BoxGeometry(5.5, 2.2, 3), dark, this.pelvis, 0, 0, 0);
    // jambes
    this.leg = {};
    for (const [k, sx] of [['L', -1], ['R', 1]]) {
      const hip = new THREE.Group(); hip.position.set(sx * 2.2, 0, 0); this.pelvis.add(hip);
      const thigh = limb(T, 1.5, metal, hip);
      const knee = new THREE.Group(); knee.position.y = -T; thigh.add(knee);
      mk(new THREE.SphereGeometry(1.2, 10, 8), dark, knee);
      const shin = limb(S, 1.25, metal, knee);
      const foot = mk(new THREE.BoxGeometry(2.4, 1, 4.2), dark, shin, 0, -S - 0.4, 0.9);
      for (let i = -1; i <= 1; i++) { const c = mk(new THREE.ConeGeometry(0.35, 1.8, 5), bone, foot, i * 0.75, -0.1, 2.6); c.rotation.x = Math.PI / 2; }
      this.leg[k] = { hip, knee };
    }
    // colonne + torse
    this.spine = new THREE.Group(); this.spine.position.y = 0.8; this.pelvis.add(this.spine);
    mk(new THREE.BoxGeometry(2, 4, 2), dark, this.spine, 0, 2, 0);
    this.chest = new THREE.Group(); this.chest.position.y = 3.5; this.spine.add(this.chest);
    mk(new THREE.BoxGeometry(6.4, 8, 3.2), metal, this.chest, 0, 4, 0);
    mk(new THREE.BoxGeometry(4.6, 2, 3.6), dark, this.chest, 0, 1.5, 0);
    for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(5.6, 0.45, 3.5), dark, this.chest, 0, 3 + i * 1.3, 0); // côtes
    // pointes dorsales et d'épaules (silhouette hérissée de la référence)
    const spike = new THREE.ConeGeometry(0.45, 4.5, 5);
    for (let i = 0; i < 9; i++) {
      const sx = i < 4 ? -1 : i < 8 ? 1 : 0, j = i % 4;
      const s = mk(spike, dark, this.chest, sx * (4 + j * 0.4), 7.5 + j * 0.3, (j - 1.5) * 0.6);
      s.rotation.z = -sx * (0.7 + j * 0.25); s.rotation.x = (j - 1.5) * 0.3;
    }
    // bras
    this.arm = {};
    for (const [k, sx] of [['L', -1], ['R', 1]]) {
      const sh = new THREE.Group(); sh.position.set(sx * 4.0, 7.2, 0); this.chest.add(sh);
      mk(new THREE.BoxGeometry(3, 2.4, 3), dark, sh, sx * 0.4, 0.2, 0);
      const up = limb(UA, 1.1, metal, sh);
      const el = new THREE.Group(); el.position.y = -UA; up.add(el);
      mk(new THREE.SphereGeometry(0.95, 10, 8), dark, el);
      const fo = limb(FA, 0.95, metal, el);
      const hand = new THREE.Group(); hand.position.y = -FA; fo.add(hand);
      mk(new THREE.BoxGeometry(2.4, 2, 1.2), dark, hand, 0, -1, 0);
      const fingers = [];
      for (let f = 0; f < 4; f++) {
        const fp = new THREE.Group(); fp.position.set(-0.9 + f * 0.6, -1.9, f === 0 ? 0.5 : 0); hand.add(fp);
        const g1 = new THREE.BoxGeometry(0.32, 3.2, 0.32); g1.translate(0, -1.6, 0); mk(g1, metal, fp);
        const tip = new THREE.Group(); tip.position.y = -3.2; fp.add(tip);
        const c = mk(new THREE.ConeGeometry(0.22, 2.4, 5), bone, tip, 0, -1.1, 0); c.rotation.x = Math.PI;
        fingers.push({ fp, tip });
      }
      this.arm[k] = { sh, el, hand, fingers };
    }
    // cou + tête
    this.neck = new THREE.Group(); this.neck.position.y = 8.2; this.chest.add(this.neck);
    mk(new THREE.BoxGeometry(1.6, 2.5, 1.6), dark, this.neck, 0, 1.2, 0);
    this.head = new THREE.Group(); this.head.position.y = 2.4; this.neck.add(this.head);
    const ft = monsterFaceTextures();
    this.faceMat = new THREE.MeshStandardMaterial({ map: ft.map, emissiveMap: ft.emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6 });
    const sideMat = new THREE.MeshStandardMaterial({ color: '#b9b8b2', roughness: 0.7 });
    mk(new THREE.BoxGeometry(5.2, 5.2, 4.4), [sideMat, sideMat, sideMat, sideMat, this.faceMat, sideMat], this.head, 0, 2.6, 0);
    for (let i = 0; i < 7; i++) { // couronne de pointes
      const s = mk(new THREE.ConeGeometry(0.32, 2.6 + (i % 3), 5), dark, this.head, -2.2 + i * 0.73, 5.8, -1 + (i % 2));
      s.rotation.z = (i - 3) * 0.25;
    }
    this.pose = {};
    this.reset();
  }
  reset() {
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); this.root.scale.setScalar(1); this.root.visible = true;
    this.setPose({});
    this.faceMat.emissiveIntensity = 0;
    return this;
  }
  // p : { lean, twist, side, head:[x,y,z], armL:[x,y,z,coude], armR, legL:[x,z,genou], legR, curlL, curlR }
  setPose(p) {
    const d = { lean: 0.08, twist: 0, side: 0, head: [0.12, 0, 0], armL: [-0.15, 0, -0.18, -0.25], armR: [-0.15, 0, 0.18, -0.25], legL: [0, -0.05, 0], legR: [0, 0.05, 0], curlL: 0.25, curlR: 0.25 };
    p = { ...d, ...p }; this.pose = p;
    this.spine.rotation.set(p.lean, p.twist, p.side);
    this.head.rotation.set(...p.head);
    for (const k of ['L', 'R']) {
      const a = p['arm' + k], A = this.arm[k];
      A.sh.rotation.set(a[0], a[1], a[2]); A.el.rotation.set(a[3], 0, 0);
      const c = p['curl' + k];
      A.fingers.forEach((f, i) => { f.fp.rotation.x = -c * 0.9 - (i === 0 ? -0.3 : 0); f.tip.rotation.x = -c * 1.1; f.fp.rotation.z = (i - 1.5) * 0.12; });
      const l = p['leg' + k], L = this.leg[k];
      L.hip.rotation.set(l[0], 0, l[1]); L.knee.rotation.set(l[2], 0, 0);
    }
    // pieds au sol : hauteur du bassin = la jambe la plus "longue"
    const h = k => { const l = p['leg' + k]; return (T * Math.cos(l[0]) + S * Math.cos(l[0] + l[2])) * Math.cos(l[1]); };
    this.pelvis.position.y = Math.max(h('L'), h('R')) + 1;
    return this;
  }
  eyes(v) { this.faceMat.emissiveIntensity = v * 3; }
  get headWorld() { return this.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 3, 0)); }
}
