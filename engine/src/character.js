import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, rng, noise1, lerp } from './util.js';

const faceCache = {};
function faceTexture(kind) {
  if (faceCache[kind]) return faceCache[kind];
  const tex = canvasTex(THREE, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const zombie = kind.startsWith('zombie');
    const eye = (x, y, rx, ry, pupil = true) => {
      ctx.fillStyle = zombie ? '#f2e8c8' : '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      if (pupil) {
        ctx.fillStyle = zombie ? '#a3121a' : '#2a1d17';
        ctx.beginPath(); ctx.ellipse(x, y + 2, rx * 0.62, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = zombie ? '#ff4b3a' : '#ffffff';
        ctx.beginPath(); ctx.arc(x - rx * 0.25, y - ry * 0.25, rx * 0.2, 0, Math.PI * 2); ctx.fill();
      }
    };
    const brow = (x1, y1, x2, y2, wdt = 9) => { ctx.strokeStyle = zombie ? '#2b3a22' : '#3a2516'; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const mouth = (fn) => { ctx.strokeStyle = '#2a1712'; ctx.fillStyle = '#4a1d1a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); fn(); };
    switch (kind) {
      case 'neutral':
        eye(88, 118, 17, 22); eye(168, 118, 17, 22);
        brow(66, 84, 106, 80); brow(150, 80, 190, 84);
        mouth(() => { ctx.moveTo(108, 182); ctx.quadraticCurveTo(128, 192, 150, 182); ctx.stroke(); });
        break;
      case 'smile':
        eye(88, 118, 17, 22); eye(168, 118, 17, 22);
        brow(66, 82, 106, 78); brow(150, 78, 190, 82);
        mouth(() => { ctx.moveTo(98, 172); ctx.quadraticCurveTo(128, 205, 160, 172); ctx.stroke(); });
        break;
      case 'worried':
        eye(88, 120, 17, 22); eye(168, 120, 17, 22);
        brow(68, 90, 106, 76); brow(150, 76, 188, 90);
        mouth(() => { ctx.moveTo(108, 188); ctx.quadraticCurveTo(128, 176, 150, 188); ctx.stroke(); });
        break;
      case 'scared':
        eye(88, 118, 21, 27); eye(168, 118, 21, 27);
        brow(66, 78, 106, 66); brow(150, 66, 190, 78);
        ctx.fillStyle = '#3b1513'; ctx.beginPath(); ctx.ellipse(128, 190, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'determined':
        eye(88, 122, 17, 18); eye(168, 122, 17, 18);
        brow(64, 92, 110, 102); brow(146, 102, 192, 92);
        mouth(() => { ctx.moveTo(108, 184); ctx.lineTo(150, 182); ctx.stroke(); });
        break;
      case 'shocked':
        eye(88, 116, 22, 28, true); eye(168, 116, 22, 28, true);
        brow(64, 70, 108, 66); brow(148, 66, 192, 70);
        ctx.fillStyle = '#3b1513'; ctx.beginPath(); ctx.ellipse(128, 192, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'sad':
        eye(88, 124, 16, 18); eye(168, 124, 16, 18);
        brow(70, 96, 104, 84); brow(152, 84, 186, 96);
        mouth(() => { ctx.moveTo(104, 192); ctx.quadraticCurveTo(128, 174, 152, 192); ctx.stroke(); });
        break;
      case 'zombie':
      case 'zombie2':
        eye(86, 120, 18, 18); eye(170, 116, kind === 'zombie2' ? 12 : 18, kind === 'zombie2' ? 14 : 18);
        brow(64, 96, 108, 102, 8); brow(148, 100, 192, 92, 8);
        ctx.fillStyle = '#2a0f10'; ctx.beginPath(); ctx.moveTo(98, 178); ctx.lineTo(160, 174); ctx.lineTo(150, 204); ctx.lineTo(106, 206); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8dfc0'; for (let i = 0; i < 4; i++) ctx.fillRect(104 + i * 13, 178, 9, 9);
        ctx.strokeStyle = 'rgba(80,20,20,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(196, 140); ctx.lineTo(214, 176); ctx.stroke();
        break;
    }
  });
  faceCache[kind] = tex;
  return tex;
}

function std(color, rough = 0.85) { return new THREE.MeshStandardMaterial({ color, roughness: rough }); }
function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const RB = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);

/**
 * Blocky character, ~5.4 studs tall. Origin at feet, facing -Z by default
 * (so walking "down the street" toward the sunset).
 */
export function makeCharacter(scene, spec = {}) {
  const S = Object.assign({
    skin: '#e8b98f', shirt: '#1d1d22', shirtAccent: '#2c2c33', pants: '#3b3c42', shoes: '#141416',
    hair: '#5a3a22', hood: true, zombie: false, face: 'neutral', seed: 3, backpack: null,
  }, spec);
  const r = rng(S.seed);
  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body); // flipped so local +Z is the character's back; faces -Z
  body.rotation.y = Math.PI;

  const skin = std(S.skin, 0.7), shirt = std(S.shirt, 0.9), pants = std(S.pants, 0.9), shoes = std(S.shoes, 0.6);

  const hips = new THREE.Group(); hips.position.y = 2.15; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  part(RB(2.0, 2.05, 1.0, 0.14), shirt, torso, 0, 1.02, 0);
  // hoodie details
  if (S.hood) {
    part(RB(1.5, 0.55, 0.45, 0.14), std(S.shirtAccent), torso, 0, 2.05, -0.38); // hood bunched at back
    part(RB(1.3, 0.55, 0.1, 0.05), std(S.shirtAccent), torso, 0, 0.45, 0.52);   // kangaroo pocket
    const cord = std('#d9d5cc', 0.6);
    part(new THREE.BoxGeometry(0.07, 0.55, 0.07), cord, torso, -0.22, 1.65, 0.53);
    part(new THREE.BoxGeometry(0.07, 0.48, 0.07), cord, torso, 0.22, 1.68, 0.53);
    part(RB(2.04, 0.18, 1.04, 0.06), std(S.shirtAccent), torso, 0, 0.08, 0); // waistband
  }
  if (S.zombie) { // torn shirt patches + stains
    part(new THREE.BoxGeometry(0.6, 0.5, 0.05), skin, torso, 0.45, 0.4, 0.51);
    part(new THREE.BoxGeometry(0.5, 0.35, 0.05), std('#5b1d1a', 0.9), torso, -0.4, 1.3, 0.51);
  }
  if (S.backpack) {
    part(RB(1.5, 1.6, 0.7, 0.18), std(S.backpack, 0.9), torso, 0, 1.05, -0.82);
    part(RB(1.0, 0.6, 0.25, 0.1), std(new THREE.Color(S.backpack).multiplyScalar(0.8).getStyle()), torso, 0, 0.7, -1.23);
  }

  const neck = new THREE.Group(); neck.position.y = 2.05; torso.add(neck);
  const head = part(RB(1.25, 1.2, 1.2, 0.22), skin, neck, 0, 0.62, 0);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(S.face), transparent: true, depthWrite: false });
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshStandardMaterial({ map: faceTexture(S.face), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  faceMesh.position.set(0, 0.6, 0.605); neck.add(faceMesh);

  // messy hair: clustered rounded chunks with jitter
  if (S.hair) {
    const hm = std(S.hair, 0.95);
    const hairG = new THREE.Group(); hairG.position.y = 0.62; neck.add(hairG);
    part(RB(1.36, 0.34, 1.34, 0.14), hm, hairG, 0, 0.5, -0.02);
    part(RB(1.36, 0.8, 0.3, 0.12), hm, hairG, 0, 0.2, -0.56); // back
    part(RB(0.22, 0.42, 1.1, 0.1), hm, hairG, -0.63, 0.36, -0.08);
    part(RB(0.22, 0.42, 1.1, 0.1), hm, hairG, 0.63, 0.36, -0.08);
    for (let i = 0; i < 11; i++) {
      const s = 0.32 + r() * 0.22;
      const m = part(RB(s, s * 1.1, s * 1.4, 0.08), hm, hairG, (r() - 0.5) * 1.2, 0.6 + r() * 0.18, (r() - 0.5) * 1.1);
      m.rotation.set((r() - 0.5) * 1.1, r() * 3, (r() - 0.5) * 1.1);
    }
    // bangs over forehead
    for (let i = 0; i < 4; i++) {
      const m = part(RB(0.38, 0.3, 0.3, 0.08), hm, hairG, -0.45 + i * 0.3, 0.42 - (i % 2) * 0.06, 0.52);
      m.rotation.set(0.4, 0, (r() - 0.5) * 0.8);
    }
  }

  function limb(parent, x, y, w, len, matTop, matEnd, endLen, endMat2) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
    const upper = new THREE.Group(); pivot.add(upper);
    part(RB(w, len * 0.55, w, 0.1), matTop, upper, 0, -len * 0.275, 0);
    const knee = new THREE.Group(); knee.position.y = -len * 0.5; upper.add(knee);
    part(RB(w * 0.98, len * 0.5 - endLen, w * 0.98, 0.1), matTop, knee, 0, -(len * 0.5 - endLen) / 2, 0);
    const end = part(RB(w * 0.92, endLen, w * (endMat2 ? 1.35 : 0.92), 0.1), matEnd, knee, 0, -(len * 0.5 - endLen) - endLen / 2, endMat2 ? 0.15 : 0);
    return { pivot, knee };
  }
  const armL = limb(torso, -1.5, 1.9, 0.92, 2.0, shirt, skin, 0.42);
  const armR = limb(torso, 1.5, 1.9, 0.92, 2.0, shirt, skin, 0.42);
  for (const a of [armL, armR]) a.pivot.children[0].children[0].position.y += 0.05;
  const legL = limb(hips, -0.5, 0, 0.96, 2.15, pants, shoes, 0.38, true);
  const legR = limb(hips, 0.5, 0, 0.96, 2.15, pants, shoes, 0.38, true);

  const ch = {
    root, body, hips, torso, neck, head, armL, armR, legL, legR, spec: S,
    setFace(kind) { faceMesh.material.map = faceTexture(kind); faceMesh.material.needsUpdate = true; ch.face = kind; },
    face: S.face,
  };

  /**
   * Pose by blending named motions. m = { walk, run, idle, zombie, cower, lookBack, wave, crouch, phase, t }
   */
  ch.pose = (m) => {
    const t = m.t ?? 0, ph = m.phase ?? 0;
    const walk = m.walk ?? 0, run = m.run ?? 0, z = m.zombie ?? 0, cower = m.cower ?? 0, idle = 1;
    const look = m.lookBack ?? 0, crouch = m.crouch ?? 0, point = m.point ?? 0, reach = m.reach ?? 0;
    const s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(ph * 2);
    const breath = Math.sin(t * 2.2) * 0.02;
    // legs
    const legA = s * (0.55 * walk + 0.95 * run) + s * 0.35 * z;
    legL.pivot.rotation.x = legA - crouch * 1.2; legR.pivot.rotation.x = -legA - crouch * 1.2;
    legL.knee.rotation.x = -Math.max(0, -c) * (0.6 * walk + 1.4 * run) * 1 + crouch * 2.0;
    legR.knee.rotation.x = -Math.max(0, c) * (0.6 * walk + 1.4 * run) + crouch * 2.0;
    legL.knee.rotation.x *= -1; legR.knee.rotation.x *= -1;
    // arms
    const armA = s * (0.5 * walk + 1.1 * run);
    armL.pivot.rotation.set(-armA * (1 - z) + z * -1.45 + breath - cower * 1.9 - reach * 1.5, 0, -0.06 - z * 0.05 + cower * 0.35);
    armR.pivot.rotation.set(armA * (1 - z) + z * -1.35 + noise1(t * 1.3, 4) * 0.12 * z - breath - cower * 1.9 - point * 1.55 - reach * 1.5, 0, 0.06 + z * 0.05 - cower * 0.35);
    armL.knee.rotation.x = -(0.25 * walk + 1.2 * run) - cower * 1.1;
    armR.knee.rotation.x = -(0.25 * walk + 1.2 * run) - cower * 1.1;
    // torso/hips
    hips.position.y = 2.15 + Math.abs(s) * (0.12 * walk + 0.28 * run) - crouch * 0.9 - cower * 0.3;
    torso.rotation.x = 0.05 * walk + 0.32 * run + 0.28 * z + cower * 0.35 + crouch * 0.4 + breath;
    torso.rotation.y = s * (0.06 * walk + 0.1 * run) + look * 0.55;
    torso.rotation.z = z * Math.sin(ph * 0.5) * 0.1;
    hips.rotation.y = -s * 0.08 * (walk + run);
    // head
    neck.rotation.y = look * 0.9 + (m.headYaw ?? 0) + noise1(t * 0.6, S.seed) * 0.08 * idle;
    neck.rotation.x = -0.1 * run + (m.headPitch ?? 0) + z * 0.25 + cower * 0.2;
    neck.rotation.z = z * 0.35 + noise1(t * 0.8, S.seed + 2) * 0.05;
  };
  ch.pose({});
  return ch;
}

export const TREVOR = {
  skin: '#e9b98d', shirt: '#232329', shirtAccent: '#303038', pants: '#3a3b41', shoes: '#0f0f11', hair: '#5b3920', hood: true, face: 'neutral', seed: 11,
};
export function zombieSpec(i) {
  const r = rng(100 + i);
  const shirts = ['#52624a', '#6b4f3a', '#4a5568', '#7a3e3a', '#5d5a48', '#3e4d5c'];
  const pants = ['#2f3a4a', '#4a3f35', '#333', '#4b4a3a'];
  return {
    skin: ['#8fb07a', '#7fa36c', '#9bb486', '#86a875'][i % 4], shirt: shirts[Math.floor(r() * shirts.length)], shirtAccent: '#2a2a2a',
    pants: pants[Math.floor(r() * pants.length)], shoes: '#2a2420', hair: r() < 0.6 ? ['#2b2018', '#4a3a2a', '#222'][i % 3] : null,
    hood: false, zombie: true, face: i % 2 ? 'zombie2' : 'zombie', seed: 200 + i,
  };
}
