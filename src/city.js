// La ville : place centrale, routes, immeubles colorés, gratte-ciel, lampadaires, arbres
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { mergeStatic } from './merge.js';
import { facadeTextures, towerTextures, tileTexture, asphaltTexture, stripeTexture } from './textures.js';

// Boîte dont les UV sont proportionnels à la taille (les fenêtres gardent la même taille)
export function scaledBox(w, h, d, tileW, tileH) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / tileW, uv.getY(k) * dims[f][1] / tileH);
  }
  return g;
}

function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
// fenêtres : l'extinction se propage depuis le centre (uniforme uOffR = rayon déjà éteint)
export const lightsOff = { value: 0 };
function windowMaterial(params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = sh => {
    sh.uniforms.uOffR = lightsOff;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uOffR; varying vec3 vWPos;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= step(uOffR, length(vWPos.xz));');
  };
  return m;
}

const PASTELS = ['#f2cf73', '#8fb1df', '#e8a2a6', '#dcc7a2', '#a5d3bf', '#f0ad7a', '#c7b2e0', '#f4e3b5'];

export function buildCity(scene) {
  const rnd = mulberry32(42);
  const city = { lightsOff, windowMats: [], lampMats: [], antennaMats: [], trees: [], group: new THREE.Group() };
  const G = city.group; scene.add(G);

  // --- Sol -----------------------------------------------------------------
  const asphalt = asphaltTexture(); asphalt.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, color: '#9a9ca3' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; G.add(ground);
  city.groundMat = ground.material;

  const tiles = tileTexture(); tiles.repeat.set(14, 14);
  const plazaMat = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.85 });
  city.plazaMat = plazaMat;
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(100, 0.3, 100), plazaMat);
  plaza.position.y = 0.15; plaza.receiveShadow = true; G.add(plaza);
  // trottoirs autour de la place et des immeubles
  const curbMat = new THREE.MeshStandardMaterial({ color: '#b9b6b2', roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (const axis of [0, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(axis ? 6 : 160, 0.35, axis ? 160 : 6), curbMat);
      m.position.set(axis ? s * 69 : 0, 0.17, axis ? 0 : s * 69); m.receiveShadow = true; G.add(m);
    }
  }
  // marquage de chaussée
  const lineMat = new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.7 });
  for (const s of [-1, 1]) for (let i = -70; i <= 70; i += 8) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 0.4), lineMat); a.position.set(i, 0.03, s * 58); G.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 4), lineMat); b.position.set(s * 58, 0.03, i); G.add(b);
  }
  // passages piétons
  for (const [x, z, r] of [[0, 51.5, 0], [0, -51.5, 0], [51.5, 0, 1], [-51.5, 0, 1]]) for (let i = -6; i <= 6; i += 2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r ? 6 : 1.1, 0.06, r ? 1.1 : 6), lineMat);
    m.position.set(x + (r ? 3.5 * Math.sign(x) : i), 0.04, z + (r ? i : 3.5 * Math.sign(z))); G.add(m);
  }

  // dalle circulaire sombre au centre (là où se tient le monstre)
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 0.36, 64), new THREE.MeshStandardMaterial({ color: '#8d8f94', roughness: 0.95 }));
  pad.position.y = 0.18; pad.receiveShadow = true; G.add(pad);

  // --- Pelouses + arbres "bonbons" (référence de jour) ----------------------
  const grassMat = new THREE.MeshStandardMaterial({ color: '#7fdc3c', roughness: 0.8 });
  const curb2 = new THREE.MeshStandardMaterial({ color: '#d5d0c8', roughness: 0.9 });
  const pebbleMats = ['#ff8fc8', '#ffd84a', '#b78cff', '#ff9f43', '#ffffff'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  const pebbleGeo = new THREE.SphereGeometry(0.9, 12, 8);
  const treePos = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * 34, cz = sz * 34;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 22), curb2); rim.position.set(cx, 0.3, cz); rim.receiveShadow = true; rim.castShadow = true; G.add(rim);
    const grass = new THREE.Mesh(new THREE.BoxGeometry(21, 0.65, 21), grassMat); grass.position.set(cx, 0.33, cz); grass.receiveShadow = true; G.add(grass);
    treePos.push([cx - 4 * sx, cz + 4 * sz], [cx + 5 * sx, cz - 5 * sz]);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(pebbleGeo, pebbleMats[i % 5]);
      p.scale.set(1.3, 0.45, 0.9); p.position.set(cx - sx * 9 + sx * i * 1.6, 0.75, cz - sz * 9 + sz * (i % 2) * 0.6); G.add(p);
    }
  }
  for (let i = -60; i <= 60; i += 24) for (const s of [-1, 1]) { treePos.push([i, s * 72.5]); treePos.push([s * 72.5, i]); }
  const trunkGeo = new THREE.CylinderGeometry(0.55, 0.75, 7, 10);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.9 });
  const leafGeo = new THREE.IcosahedronGeometry(1, 3);
  { // relief "duveteux"
    const p = leafGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.06 * Math.sin(v.x * 9) * Math.sin(v.y * 8) * Math.sin(v.z * 10); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
    leafGeo.computeVertexNormals();
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: '#86e03a', roughness: 0.75 });
  city.leafMat = leafMat;
  for (const [x, z] of treePos) {
    const t = new THREE.Group(); t.position.set(x, 0.6, z);
    const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 3.5; tr.castShadow = true; t.add(tr);
    for (const [ox, oy, oz, r] of [[0, 8.5, 0, 3.4], [1.9, 7.4, 0.8, 2.6], [-1.7, 7.6, -0.6, 2.7], [0.4, 10.2, -0.4, 2.4]]) {
      const l = new THREE.Mesh(leafGeo, leafMat); l.position.set(ox, oy, oz); l.scale.setScalar(r); l.castShadow = true; t.add(l);
    }
    const s = 0.8 + rnd() * 0.35; t.scale.setScalar(s);
    G.add(t); city.trees.push(t);
  }

  // --- Lampadaires -----------------------------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3a3e46', roughness: 0.5, metalness: 0.2 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd890', emissiveIntensity: 2 });
  city.lampMats.push(lampMat);
  for (let i = -40; i <= 40; i += 20) for (const s of [-1, 1]) for (const ax of [0, 1]) {
    const L = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 9, 8), poleMat); pole.position.y = 4.5; L.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2), poleMat); arm.position.set(0, 9, -0.9); L.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.2), lampMat); head.position.set(0, 8.85, -1.8); L.add(head);
    const x = ax ? s * 48.5 : i, z = ax ? i : s * 48.5;
    L.position.set(x, 0.3, z); L.lookAt(0, 0.3, 0); L.rotateY(Math.PI);
    G.add(L);
  }

  // --- Immeubles colorés autour de la place -----------------------------------
  const facadeSets = [0, 1, 2, 3, 4, 5].map(i => facadeTextures(100 + i));
  const facadeMats = facadeSets.map(fs => windowMaterial({ map: fs.map, emissiveMap: fs.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.75 }));
  facadeMats.forEach(m => (m.userData.base = 0.85)); city.windowMats.push(...facadeMats);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#8b8e95', roughness: 0.9 });
  const corMat = new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.8 });
  const shopMat = windowMaterial({ color: '#2b3140', roughness: 0.3, metalness: 0.2, emissive: '#ffefc7', emissiveIntensity: 0 });
  shopMat.userData.base = 0.6; city.windowMats.push(shopMat);
  const awnMats = [['#e14b4b', '#ffffff'], ['#3c7be0', '#ffffff'], ['#2fae62', '#ffffff'], ['#f0a020', '#ffffff']].map(c => new THREE.MeshStandardMaterial({ map: stripeTexture(c), roughness: 0.7 }));
  const fm = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6, metalness: 0.5 });
  function building(x, z, w, d, h, rotY) {
    const color = PASTELS[Math.floor(rnd() * PASTELS.length)];
    const mat = facadeMats[Math.floor(rnd() * facadeMats.length)];
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = rotY;
    const m = new THREE.Mesh(tint(scaledBox(w, h, d, 16, 16), color), [mat, mat, roofMat, roofMat, mat, mat]);
    m.position.y = h / 2; m.castShadow = true; m.receiveShadow = true; b.add(m);
    const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.8, d + 0.8), corMat);
    cor.position.y = h + 0.4; b.add(cor);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 4.2, 0.6), shopMat);
    shop.position.set(0, 2.1, d / 2 + 0.3); b.add(shop);
    const awn = new THREE.Mesh(scaledBox(w - 0.4, 0.25, 2, 3, 2), awnMats[Math.floor(rnd() * awnMats.length)]);
    awn.position.set(0, 4.6, d / 2 + 1.1); awn.rotation.x = 0.25; awn.castShadow = true; b.add(awn);
    if (rnd() < 0.4) {
      for (let y = 8; y < h - 2; y += 4) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1.6), fm); p.position.set(-w / 4, y, d / 2 + 0.8); b.add(p);
        const r = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.08), fm); r.position.set(-w / 4, y + 0.5, d / 2 + 1.6); b.add(r);
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 4.5), fm); st.position.set(-w / 4 + (y % 8 ? 1.5 : -1.5), y + 2, d / 2 + 0.8); st.rotation.x = 0.75; st.rotation.y = Math.PI / 2; b.add(st);
      }
    }
    G.add(b); return b;
  }
  for (let side = 0; side < 4; side++) {
    const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
    let u = -92;
    while (u < 92) {
      const w = 14 + Math.floor(rnd() * 8), h = 16 + Math.floor(rnd() * 5) * 4, d = 16;
      const cu = u + w / 2, off = 72 + d / 2 + 2;
      // côté 0 : nord (z négatif) face au sud
      const p = new THREE.Vector3(cu, 0, -off).applyAxisAngle(new THREE.Vector3(0, 1, 0), -rot);
      building(p.x, p.z, w, d, h, -rot);
      u += w + 0.5;
    }
  }

  // --- Gratte-ciel à l'horizon -----------------------------------------------
  const towerSets = [0, 1, 2].map(i => towerTextures(300 + i));
  const towerMats = towerSets.map(ts => windowMaterial({ map: ts.map, emissiveMap: ts.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.55 }));
  towerMats.forEach(m => (m.userData.base = 0.75)); city.windowMats.push(...towerMats);
  const antMat = new THREE.MeshStandardMaterial({ color: '#ff3355', emissive: '#ff2244', emissiveIntensity: 3 });
  city.antennaMats.push(antMat);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 125 + rnd() * 110;
    const w = 16 + rnd() * 14, h = 55 + rnd() * 95;
    const mat = towerMats[i % 3];
    if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.35) continue; // couloir pour la caméra d'ouverture
    const m = new THREE.Mesh(tint(scaledBox(w, h, w, 16, 16), rnd() < 0.5 ? '#eef1f6' : '#c9d6ea'), [mat, mat, roofMat, roofMat, mat, mat]);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); m.rotation.y = Math.round(rnd() * 4) * Math.PI / 2;
    G.add(m);
    if (rnd() < 0.6) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 6), poleMat); ant.position.set(m.position.x, h + 4, m.position.z); G.add(ant);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), antMat); bulb.position.set(m.position.x, h + 8.3, m.position.z); G.add(bulb);
    }
  }
  mergeStatic(G);
  return city;
}
