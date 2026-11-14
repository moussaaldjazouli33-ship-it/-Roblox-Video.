import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, canvasTex, noise1 } from './util.js';

// Street runs along -Z. Road |x|<7, sidewalks 7..11, buildings from |x|=11.
export const ROAD_HALF = 7, WALK = 4;
const B0 = ROAD_HALF + WALK;

function noiseFill(ctx, w, h, base, amount, n, r) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amount;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}

function windowTexture(wall, frame, glassA, glassB, r, opts = {}) {
  return canvasTex(THREE, 256, 256, (ctx, w, h) => {
    noiseFill(ctx, w, h, wall, 0.12, 2500, r);
    if (opts.brick) {
      ctx.strokeStyle = 'rgba(60,25,20,0.35)'; ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 8) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8); ctx.stroke(); }
      }
    }
    // one window per tile, centred
    const ww = 110, wh = 150, x0 = (w - ww) / 2, y0 = 50;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 - 10, y0 - 10, ww + 20, wh + 24); // sill shadow
    ctx.fillStyle = frame; ctx.fillRect(x0 - 8, y0 - 8, ww + 16, wh + 16);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + wh);
    g.addColorStop(0, glassA); g.addColorStop(1, glassB);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, ww, wh);
    ctx.fillStyle = frame; ctx.fillRect(x0 + ww / 2 - 3, y0, 6, wh); ctx.fillRect(x0, y0 + wh * 0.45, ww, 6);
    ctx.fillStyle = 'rgba(255,220,180,0.18)'; ctx.fillRect(x0 + 6, y0 + 6, 30, wh * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 - 12, y0 + wh + 8, ww + 24, 8); // sill
    ctx.fillStyle = frame; ctx.fillRect(x0 - 12, y0 + wh + 6, ww + 24, 6);
  });
}

const PALETTE = [
  { wall: '#b5654f', frame: '#e8dccb', brick: true },
  { wall: '#c9a782', frame: '#f1e6d6' },
  { wall: '#d8c6a6', frame: '#8a6d55' },
  { wall: '#a8553f', frame: '#efe3d0', brick: true },
  { wall: '#bfb5a8', frame: '#5e5148' },
  { wall: '#c98d63', frame: '#f4ead8' },
  { wall: '#e3d8c4', frame: '#7a5b44' },
];

export function buildWorld(scene, opts = {}) {
  const r = rng(opts.seed ?? 7);
  const world = { updaters: [], colliders: [] };
  const group = new THREE.Group(); scene.add(group);

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#7d4a63') },
      mid: { value: new THREE.Color('#d9775a') },
      hor: { value: new THREE.Color('#f6b07c') },
      sunDir: { value: new THREE.Vector3(0.15, 0.12, -1).normalize() },
      sunCol: { value: new THREE.Color('#ffd9a0') },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top,mid,hor,sunDir,sunCol; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(hor, mid, smoothstep(0.0,0.18,h)); c = mix(c, top, smoothstep(0.18,0.7,h));
        float s = max(dot(normalize(vP), sunDir),0.); c += sunCol*pow(s,60.)*0.9 + sunCol*pow(s,6.)*0.25;
        gl_FragColor = vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.frustumCulled = false; scene.add(sky);
  world.sky = skyMat;

  scene.fog = new THREE.Fog('#e39274', 40, 260);
  world.fog = scene.fog;

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#ffc9a6', '#5a4a52', 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffbf86', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
  scene.add(sun); scene.add(sun.target);
  world.sun = sun; world.hemi = hemi;
  // soft fill from the camera side so backlit characters keep readable detail
  const fill = new THREE.DirectionalLight('#ffd6bf', 1.1); scene.add(fill); scene.add(fill.target);
  world.fill = fill;
  world.updaters.push((t, cam) => { fill.position.copy(cam.position).add(new THREE.Vector3(4, 6, 0)); fill.target.position.set(cam.position.x, 2, cam.position.z - 30); });
  world.sunOffset = new THREE.Vector3(-30, 55, -110); // low sun down the street
  world.focusShadow = (p) => { sun.position.copy(p).add(world.sunOffset); sun.target.position.copy(p); };
  world.focusShadow(new THREE.Vector3());

  // ---------- ground ----------
  const asphalt = canvasTex(THREE, 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#55525a', 0.25, 18000, r);
    for (let i = 0; i < 14; i++) { // cracks / patches
      ctx.strokeStyle = 'rgba(25,22,28,0.5)'; ctx.lineWidth = 1 + r() * 2; ctx.beginPath();
      let x = r() * w, y = r() * h; ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; ctx.lineTo(x, y); } ctx.stroke();
    }
  }, { repeat: [2, 40] });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 600), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -250); road.receiveShadow = true; group.add(road);

  // lane markings
  const markMat = new THREE.MeshStandardMaterial({ color: '#e9e2d3', roughness: 0.8 });
  for (let z = 15; z > -540; z -= 9) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 4), markMat);
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, z); m.receiveShadow = true; group.add(m);
  }
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 600), markMat);
    m.rotation.x = -Math.PI / 2; m.position.set(s * (ROAD_HALF - 0.7), 0.02, -250); m.receiveShadow = true; group.add(m);
  }

  const paving = canvasTex(THREE, 256, 256, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#b9b0a8', 0.15, 4000, r);
    ctx.strokeStyle = 'rgba(70,60,60,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= w; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
  }, { repeat: [1, 150] });
  for (const s of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(WALK, 0.4, 600), new THREE.MeshStandardMaterial({ map: paving, roughness: 0.9 }));
    walk.position.set(s * (ROAD_HALF + WALK / 2), 0.2, -250); walk.receiveShadow = true; group.add(walk);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 600), new THREE.MeshStandardMaterial({ color: '#d6cfc6', roughness: 0.8 }));
    curb.position.set(s * (ROAD_HALF + 0.15), 0.22, -250); curb.receiveShadow = true; group.add(curb);
  }

  // ---------- buildings ----------
  const shopGlass = new THREE.MeshStandardMaterial({ color: '#2c2a33', roughness: 0.15, metalness: 0.6 });
  const plankMat = new THREE.MeshStandardMaterial({ color: '#b08a62', roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3b3236', roughness: 0.9 });
  const awningTex = (c1, c2) => canvasTex(THREE, 128, 32, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? c1 : c2; ctx.fillRect(i * 16, 0, 16, h); }
  });
  const awnings = [awningTex('#c0392b', '#f2e6d8'), awningTex('#2e6b5a', '#efe6d5'), awningTex('#b6862c', '#f3ead7')];

  for (const side of [-1, 1]) {
    let z = 25;
    while (z > -420) {
      const width = 10 + Math.floor(r() * 8);
      const floors = 3 + Math.floor(r() * (z < -120 ? 9 : 6));
      const fh = 6.5, height = floors * fh + 3;
      const depth = 14;
      const pal = PALETTE[Math.floor(r() * PALETTE.length)];
      const tex = windowTexture(pal.wall, pal.frame, '#3c3a46', '#6e5f66', r, pal);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(2, Math.round(width / 5)), floors - 1);
      tex.offset.y = 0;
      const wallMat = new THREE.MeshStandardMaterial({ color: pal.wall, roughness: 0.92 });
      const facadeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      // facade facing the street (+x for left side, -x for right side)
      const mats = side < 0
        ? [facadeMat, wallMat, wallMat, wallMat, wallMat, wallMat]
        : [wallMat, facadeMat, wallMat, wallMat, wallMat, wallMat];
      const upper = new THREE.Mesh(new THREE.BoxGeometry(depth, height - fh, width), mats);
      const cx = side * (B0 + depth / 2) + side * (r() < 0.3 ? 0.6 : 0);
      upper.position.set(cx, fh + (height - fh) / 2, z - width / 2);
      upper.castShadow = true; upper.receiveShadow = true; group.add(upper);

      // ground floor storefront
      const ground = new THREE.Mesh(new THREE.BoxGeometry(depth, fh, width), new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.wall).multiplyScalar(0.8), roughness: 0.9 }));
      ground.position.set(cx + side * 0.3, fh / 2, z - width / 2); ground.castShadow = true; ground.receiveShadow = true; group.add(ground);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, fh * 0.6, width * 0.7), shopGlass);
      const fx = side * B0 + side * 0.15 - side * 0.05;
      glass.position.set(fx, fh * 0.45, z - width / 2); group.add(glass);
      if (r() < 0.45) { // boarded up
        for (let k = 0; k < 3; k++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, width * 0.75), plankMat);
          p.position.set(fx - side * 0.2, fh * 0.25 + k * 1.3, z - width / 2);
          p.rotation.x = (r() - 0.5) * 0.4; p.castShadow = true; group.add(p);
        }
      }
      // cornice + ledge
      const cor = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.2, 0.8, width + 0.4), new THREE.MeshStandardMaterial({ color: pal.frame, roughness: 0.8 }));
      cor.position.set(cx - side * 0.0, height + 0.4, z - width / 2); cor.castShadow = true; group.add(cor);
      const ledge = cor.clone(); ledge.scale.y = 0.6; ledge.position.y = fh; group.add(ledge);
      // awning
      if (r() < 0.55) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, width * 0.8), new THREE.MeshStandardMaterial({ map: awnings[Math.floor(r() * 3)], roughness: 0.8 }));
        aw.position.set(side * (B0 - 1.1), fh * 0.85, z - width / 2); aw.rotation.z = side * 0.32;
        aw.castShadow = true; group.add(aw);
      }
      // rooftop boxes
      if (r() < 0.6) {
        const rb = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), darkMat);
        rb.position.set(cx + (r() - 0.5) * 6, height + 1.8, z - width / 2 + (r() - 0.5) * 4); rb.castShadow = true; group.add(rb);
      }
      // fire escape on some brick buildings
      if (pal.brick && floors > 3 && r() < 0.7) {
        const fe = new THREE.MeshStandardMaterial({ color: '#2b2729', roughness: 0.6, metalness: 0.4 });
        for (let f = 1; f < floors; f++) {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 4.5), fe);
          pl.position.set(side * (B0 - 0.8), f * fh + 0.5, z - width / 2); pl.castShadow = true; group.add(pl);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 4.5), fe);
          rail.position.set(side * (B0 - 1.55), f * fh + 1.1, z - width / 2); group.add(rail);
        }
      }
      z -= width + (r() < 0.12 ? 3 : 0);
    }
  }

  // ---------- street props ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3528', roughness: 1 });
  function bareTree(x, z) {
    const g = new THREE.Group();
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), darkMat); planter.position.y = 0.65; g.add(planter);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 6, 6), trunkMat); t.position.y = 3.4; t.castShadow = true; g.add(t);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 5), trunkMat);
      const a = r() * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.6, 4.8 + r() * 1.5, Math.sin(a) * 0.6);
      b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); b.castShadow = true; g.add(b);
    }
    g.position.set(x, 0, z); group.add(g);
  }
  function hedge(x, z) { // tall topiary like in the reference
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: '#5f7a3a', roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.2, 0), m);
      s.position.set((r() - 0.5) * 0.3, 0.9 + i * 0.75, (r() - 0.5) * 0.3); s.castShadow = true; g.add(s);
    }
    g.position.set(x, 0.4, z); group.add(g);
  }
  for (const side of [-1, 1]) {
    for (let z = 10; z > -400; z -= 18 + r() * 10) {
      if (r() < 0.6) bareTree(side * (ROAD_HALF + 1.6), z); else hedge(side * (B0 - 0.8), z);
    }
  }

  // street lamps
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2e2b2e', roughness: 0.5, metalness: 0.5 });
  world.lampLights = [];
  for (const side of [-1, 1]) for (let z = -5; z > -300; z -= 32) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), poleMat); p.position.y = 4.5; p.castShadow = true; g.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.15), poleMat); arm.position.set(-side * 1, 9, 0); g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: '#2e2b2e', emissive: '#ffcf8a', emissiveIntensity: 0 }));
    head.position.set(-side * 1.9, 8.85, 0); g.add(head); world.lampLights.push(head.material);
    g.position.set(side * (ROAD_HALF + 0.9), 0.4, z); group.add(g);
  }

  // cars
  world.makeCar = (color, x, z, rotY = 0, wrecked = false) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(3.6, 1.3, 7.6, 2, 0.25), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 }));
    body.position.y = 1.15; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.2, 4, 2, 0.25), new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.1, metalness: 0.7 }));
    cab.position.set(0, 2.3, -0.3); cab.castShadow = true; g.add(cab);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(3.25, 0.2, 3.4, 2, 0.08), body.material); roof.position.set(0, 2.95, -0.3); g.add(roof);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.9 });
    for (const [wx, wz] of [[-1.7, 2.4], [1.7, 2.4], [-1.7, -2.4], [1.7, -2.4]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.5, 14), wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.65, wz); w.castShadow = true; g.add(w);
    }
    const lightMat = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffe2a0', emissiveIntensity: 0.3 });
    for (const lx of [-1.2, 1.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), lightMat); l.position.set(lx, 1.4, 3.82); g.add(l); }
    const tailMat = new THREE.MeshStandardMaterial({ color: '#8a1010', emissive: '#ff2020', emissiveIntensity: 0.2 });
    for (const lx of [-1.2, 1.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), tailMat); l.position.set(lx, 1.4, -3.82); g.add(l); }
    if (wrecked) { g.rotation.z = 0.04; body.rotation.x = 0.03; }
    g.position.set(x, 0, z); g.rotation.y = rotY; g.userData.lights = lightMat; g.userData.tail = tailMat;
    group.add(g); return g;
  };
  world.makeCar('#e2b12c', 3.6, -38, 0.25, true);      // abandoned taxi like the reference
  world.makeCar('#6d7380', -4, -70, -0.15, true);
  world.makeCar('#8f2f2a', 4.5, -110, 0.4, true);
  world.makeCar('#d9d4c8', -3.8, -150, -0.3, true);

  // trash, bins, debris
  const binMat = new THREE.MeshStandardMaterial({ color: '#3f4a45', roughness: 0.7, metalness: 0.2 });
  const bagMat = new THREE.MeshStandardMaterial({ color: '#1d1c22', roughness: 0.4 });
  for (const side of [-1, 1]) for (let z = 0; z > -260; z -= 14 + r() * 16) {
    if (r() < 0.5) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 1.8, 10), binMat);
      b.position.set(side * (B0 - 1.2), 1.3, z); b.castShadow = true; group.add(b);
      if (r() < 0.5) { b.rotation.z = side * 1.5; b.position.y = 1.0; b.position.x -= side * 1; }
    } else {
      for (let k = 0; k < 3; k++) {
        const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), bagMat);
        bag.scale.set(1, 0.8, 1); bag.position.set(side * (B0 - 1 - r() * 1.4), 0.85, z + (r() - 0.5) * 2); bag.castShadow = true; group.add(bag);
      }
    }
  }
  // road debris: cardboard/paper + dry grass tufts (instanced)
  const paperGeo = new THREE.BoxGeometry(1.1, 0.03, 0.8);
  const paperMat = new THREE.MeshStandardMaterial({ color: '#d8c3a0', roughness: 1 });
  const nPaper = 220, papers = new THREE.InstancedMesh(paperGeo, paperMat, nPaper);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
  for (let i = 0; i < nPaper; i++) {
    v.set((r() - 0.5) * 2 * (ROAD_HALF + 2), 0.06, 12 - r() * 260);
    if (Math.abs(v.x) > ROAD_HALF) v.y = 0.45;
    e.set(0, r() * Math.PI, 0); q.setFromEuler(e); const s = 0.6 + r() * 1.2; sv.set(s, 1, s);
    m4.compose(v, q, sv); papers.setMatrixAt(i, m4);
  }
  papers.receiveShadow = true; papers.castShadow = true; group.add(papers);

  const grassGeo = new THREE.ConeGeometry(0.08, 1, 3); grassGeo.translate(0, 0.5, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: '#8f8a3c', roughness: 1 });
  const nGrass = 1800, grass = new THREE.InstancedMesh(grassGeo, grassMat, nGrass);
  let gi = 0;
  while (gi < nGrass) {
    // clumps along curbs and road cracks
    const cx = r() < 0.7 ? (r() < 0.5 ? -1 : 1) * (ROAD_HALF - 0.3 + r() * 0.6) : (r() - 0.5) * 12;
    const cz = 14 - r() * 250, n = 8 + Math.floor(r() * 10);
    for (let k = 0; k < n && gi < nGrass; k++, gi++) {
      v.set(cx + (r() - 0.5) * 1.0, Math.abs(cx) > ROAD_HALF ? 0.4 : 0.02, cz + (r() - 0.5) * 1.0);
      e.set((r() - 0.5) * 0.9, r() * 6, (r() - 0.5) * 0.9); q.setFromEuler(e);
      const h = 0.4 + r() * 1.1; sv.set(1, h, 1); m4.compose(v, q, sv); grass.setMatrixAt(gi, m4);
    }
  }
  grass.castShadow = true; group.add(grass);

  // ---------- airborne dust & flying paper ----------
  const nDust = 500, dustGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const dust = new THREE.InstancedMesh(dustGeo, new THREE.MeshBasicMaterial({ color: '#4b3433', fog: true }), nDust);
  const seeds = []; for (let i = 0; i < nDust; i++) seeds.push([r(), r(), r(), r()]);
  dust.frustumCulled = false; group.add(dust);
  const nFly = 24, fly = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshStandardMaterial({ color: '#e1cfae', side: THREE.DoubleSide, roughness: 1 }), nFly);
  const fseeds = []; for (let i = 0; i < nFly; i++) fseeds.push([r(), r(), r(), r()]);
  fly.frustumCulled = false; fly.castShadow = true; group.add(fly);
  world.wind = 1;
  world.updaters.push((t, cam) => {
    const cz = cam.position.z, cx = cam.position.x;
    for (let i = 0; i < nDust; i++) {
      const [a, b, c, d] = seeds[i];
      const span = 70;
      const x = cx + (a - 0.5) * 50 + Math.sin(t * 0.7 + d * 9) * 1.5 + t * 1.6 * world.wind;
      const y = 0.5 + b * 22 + Math.sin(t * 0.5 + a * 7) * 0.8;
      let zz = c * span + t * 2.2 * world.wind; zz = cz + 10 - (zz % span);
      const xx = ((x - cx + 25) % 50 + 50) % 50 + cx - 25;
      v.set(xx, y, zz); e.set(t * d * 2, t * a * 3, 0); q.setFromEuler(e);
      const s = 0.4 + d * 0.9; sv.set(s, s, s); m4.compose(v, q, sv); dust.setMatrixAt(i, m4);
    }
    dust.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < nFly; i++) {
      const [a, b, c, d] = fseeds[i];
      const cyc = 9 + a * 6, ph = ((t * world.wind + d * cyc) % cyc) / cyc;
      const x = cx - 18 + ph * 36 + Math.sin(t * 2 + i) * 1.2;
      const y = 0.3 + Math.abs(Math.sin(ph * Math.PI * 2 + b * 6)) * (1.5 + b * 4);
      const zz = cz - 8 - c * 50 + Math.sin(t + a * 5) * 3;
      v.set(x, y, zz); e.set(t * (2 + a * 3), t * (1 + b * 2), t * 1.7 + c); q.setFromEuler(e);
      sv.set(1, 1, 1); m4.compose(v, q, sv); fly.setMatrixAt(i, m4);
    }
    fly.instanceMatrix.needsUpdate = true;
  });

  // ---------- mood presets (lerped by story) ----------
  world.moods = {
    sunset: { top: '#7d4a63', mid: '#d9775a', hor: '#f6b07c', fog: '#e39274', fogNear: 40, fogFar: 260, sun: '#ffbf86', sunI: 3.2, hemiSky: '#ffc9a6', hemiGround: '#5a4a52', hemiI: 1.25, lamp: 0, exposure: 1.0 },
    tense:  { top: '#4a2e45', mid: '#a5503f', hor: '#d9805a', fog: '#b4634f', fogNear: 25, fogFar: 180, sun: '#ff9a5c', sunI: 2.4, hemiSky: '#e09a80', hemiGround: '#3a2e36', hemiI: 1.0, lamp: 0.3, exposure: 0.92 },
    danger: { top: '#2a1420', mid: '#7c2a24', hor: '#c2442c', fog: '#7e2d26', fogNear: 18, fogFar: 140, sun: '#ff6a3a', sunI: 2.2, hemiSky: '#c0584a', hemiGround: '#2a1a1e', hemiI: 0.9, lamp: 0.6, exposure: 0.9 },
    night:  { top: '#0d1022', mid: '#232845', hor: '#3d3f5e', fog: '#262a44', fogNear: 15, fogFar: 140, sun: '#8ea0ff', sunI: 1.0, hemiSky: '#6b78b8', hemiGround: '#141420', hemiI: 0.7, lamp: 2.5, exposure: 1.0 },
    dawn:   { top: '#6f7fae', mid: '#e3a58a', hor: '#ffd2a1', fog: '#e8b79c', fogNear: 50, fogFar: 300, sun: '#ffe0b0', sunI: 3.0, hemiSky: '#ffe2c8', hemiGround: '#6a5a5a', hemiI: 1.4, lamp: 0, exposure: 1.05 },
  };
  const ca = new THREE.Color(), cb = new THREE.Color();
  const mix = (A, B, k, target) => target.copy(ca.set(A)).lerp(cb.set(B), k);
  world.applyMood = (A, B, k, renderer) => {
    const a = world.moods[A], b = world.moods[B];
    mix(a.top, b.top, k, skyMat.uniforms.top.value);
    mix(a.mid, b.mid, k, skyMat.uniforms.mid.value);
    mix(a.hor, b.hor, k, skyMat.uniforms.hor.value);
    mix(a.fog, b.fog, k, scene.fog.color);
    scene.fog.near = a.fogNear + (b.fogNear - a.fogNear) * k;
    scene.fog.far = a.fogFar + (b.fogFar - a.fogFar) * k;
    mix(a.sun, b.sun, k, sun.color); sun.intensity = a.sunI + (b.sunI - a.sunI) * k;
    mix(a.hemiSky, b.hemiSky, k, hemi.color); mix(a.hemiGround, b.hemiGround, k, hemi.groundColor);
    hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * k;
    const lamp = a.lamp + (b.lamp - a.lamp) * k;
    for (const m of world.lampLights) m.emissiveIntensity = lamp;
    renderer.toneMappingExposure = a.exposure + (b.exposure - a.exposure) * k;
  };

  world.update = (t, cam) => { for (const u of world.updaters) u(t, cam); };
  return world;
}
