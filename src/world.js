// Assemble toute la scène 3D et expose render(t) déterministe
import * as THREE from 'three';
import { buildCity, scaledBox } from './city.js';
import { Rig, LOOKS, civilian } from './rig.js';
import { Monster } from './monster.js';
import { FloodTower, PoliceCar, buildFence, buildCable, buildRubble, Generator } from './props.js';
import { Rain, Burst, Lightning, makeBeam, aimBeam } from './effects.js';
import { Env } from './env.js';
import { facadeTextures } from './textures.js';
import { noise1 } from './util.js';

export const W = 1080, H = 1920;

export class World {
  constructor(canvas, scale = 1) {
    const RW = Math.round(W * scale), RH = Math.round(H * scale);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.setSize(RW, RH, false);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.3, 2000);
    this.env = new Env(this.renderer, this.scene, this.camera, RW, RH);
    const S = this.scene;

    this.city = buildCity(S);
    this.monster = new Monster(); S.add(this.monster.root);
    this.rubble = buildRubble(); S.add(this.rubble);
    this.fence = buildFence(15); S.add(this.fence);
    this.towers = [0, 1, 2, 3, 4, 5].map(i => { const t = new FloodTower(i, (30 + 60 * i) * Math.PI / 180); S.add(t.root); return t; });
    this.cars = [0, 1, 2, 3, 4, 5].map(() => { const c = new PoliceCar(); S.add(c.root); return c; });
    // câble principal (passe devant le poste du père → le gamin trébuche dessus)
    this.cable = buildCable([[-95, 0.3, 47.5], [-60, 0.3, 47.5], [-35, 0.3, 47.6], [-20, 0.3, 47], [-14, 0.3, 32], [0, 0.32, 21.5], [14, 0.3, 26], [30, 0.3, 30]]); S.add(this.cable);
    // panneau électrique avec levier (le « clic »)
    this.panel = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 1.2), new THREE.MeshStandardMaterial({ color: '#7d858f', metalness: 0.6, roughness: 0.4 })); pb.position.y = 3; this.panel.add(pb);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshStandardMaterial({ color: '#333' })); leg.position.y = 0.5; this.panel.add(leg);
    this.lever = new THREE.Group(); this.lever.position.set(0.4, 3, 0.7); this.panel.add(this.lever);
    const lv = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), new THREE.MeshStandardMaterial({ color: '#c62020', roughness: 0.4 })); lv.position.y = 0.7; this.lever.add(lv);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshStandardMaterial({ color: '#111' })); knob.position.y = 1.5; this.lever.add(knob);
    this.panelLed = new THREE.MeshStandardMaterial({ color: '#030', emissive: '#22ff44', emissiveIntensity: 3 });
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.panelLed); l.position.set(-0.8, 4.3 - i * 0.6, 0.62); this.panel.add(l); }
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 110; const g = c.getContext('2d'); g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(64, 5); g.lineTo(123, 105); g.lineTo(5, 105); g.fill(); g.fillStyle = '#111'; g.font = 'bold 70px sans-serif'; g.textAlign = 'center'; g.fillText('⚡', 64, 95); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), transparent: true }));
    warn.position.set(-0.6, 2.4, 0.61); this.panel.add(warn);
    this.panel.position.set(-17.5, 0.3, 41); this.panel.rotation.y = 0.6; S.add(this.panel);

    // personnages
    this.kid = new Rig(LOOKS.kid); this.dad = new Rig(LOOKS.dad);
    this.kid.giveFlashlight('R', 20); this.dad.giveFlashlight('R', 22);
    this.radio = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), this.radio.material); ant.position.set(0.12, 0.85, 0); this.radio.add(ant);
    this.dad.hand.L.add(this.radio); this.radio.position.set(0, -0.2, 0.3);
    this.guards = Array.from({ length: 12 }, (_, i) => { const g = new Rig({ ...LOOKS.guard, skin: ['#f2c690', '#c58c5c', '#8d5a3b', '#e8b98a'][i % 4] }); g.giveFlashlight('R', 24); return g; });
    this.civilians = Array.from({ length: 7 }, (_, i) => civilian(i));
    this.civilians[1].giveFlashlight('R', 30);
    this.windowPeople = Array.from({ length: 6 }, (_, i) => { const c = civilian(i + 2); c.giveFlashlight('R', 40); c.flashlight.beam.scale.set(1.4, 1, 1.4); return c; });
    for (const r of [this.kid, this.dad, ...this.guards, ...this.civilians]) S.add(r.root);
    // lampes torches "libres" (qui volent / roulent / coulent)
    const mkDrop = () => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6 })); b.rotation.z = Math.PI / 2; g.add(b);
      const lens = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6d8', emissiveIntensity: 4 });
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 12), lens); l.rotation.z = Math.PI / 2; l.position.x = 0.7; g.add(l);
      const beam = makeBeam(14, 2.5, '#fff4d6', 0.2); beam.rotation.z = Math.PI / 2; beam.position.x = 0.8; g.add(beam);
      S.add(g); return [g, lens, beam];
    };
    [this.dropLight, this.dropLens, this.dropBeam] = mkDrop();
    [this.kidLight, this.kidLens, this.kidBeam] = mkDrop();
    this.puddles = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: '#1a2233', roughness: 0.05, metalness: 0.9 });
    for (const [x, z, r] of [[9, 20, 2.5], [-6, 21, 1.8], [12, 23.5, 1.5], [-11, 18.5, 2.2], [3, 18.5, 1.6]]) { const p = new THREE.Mesh(new THREE.CircleGeometry(r, 24), pm); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.37, z); p.scale.y = 0.7; this.puddles.add(p); }
    S.add(this.puddles);

    // façade avec habitants aux fenêtres
    this.windowSet = this.buildWindowSet(); S.add(this.windowSet);

    // lumières pilotées par les plans
    this.key = new THREE.SpotLight('#fff1d8', 0, 80, 0.5, 0.6, 1); S.add(this.key); S.add(this.key.target);
    this.fill = new THREE.PointLight('#ff3030', 0, 70, 1.2); S.add(this.fill);
    this.siren = [new THREE.PointLight('#ff2020', 0, 90, 1.1), new THREE.PointLight('#2050ff', 0, 90, 1.1)]; this.siren.forEach(l => S.add(l));
    this.blast = new THREE.PointLight('#ffb060', 0, 90, 1.2); S.add(this.blast);

    this.dynLights = [this.key, this.fill, ...this.siren, this.blast, ...this.towers.map(t => t.light)];
    // effets
    this.rain = new Rain(S);
    this.sparks = new Burst(S, { n: 260, color: '#ffbb55', size: 0.7 });
    this.cableSparks = new Burst(S, { n: 120, color: '#9fd0ff', size: 0.35 });
    this.glass = new Burst(S, { n: 120, color: '#dfe8ff', size: 0.45 });
    this.smoke = new Burst(S, { n: 140, color: '#55575c', size: 4.5, additive: false });
    this.lightning = new Lightning(S);
    this.monster.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  }

  buildWindowSet() {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: '#d8a59b', roughness: 0.85 });
    const Wd = 34, Hd = 26, cols = 3, rows = 2, ww = 4.2, wh = 4.6;
    const xs = [-9, 0, 9], ys = [10, 18];
    // mur construit autour des ouvertures
    const add = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), wallMat); m.position.set(x, y, 0); m.receiveShadow = true; g.add(m); };
    add(Wd, ys[0] - wh / 2, 0, (ys[0] - wh / 2) / 2);
    add(Wd, ys[1] - ys[0] - wh, 0, (ys[0] + ys[1]) / 2);
    add(Wd, Hd - ys[1] - wh / 2, 0, (ys[1] + wh / 2 + Hd) / 2);
    for (const y of ys) {
      const edges = [-Wd / 2, ...xs.flatMap(x => [x - ww / 2, x + ww / 2]), Wd / 2];
      for (let i = 0; i < edges.length; i += 2) add(edges[i + 1] - edges[i], wh, (edges[i] + edges[i + 1]) / 2, y);
    }
    this.windowRoomMat = new THREE.MeshStandardMaterial({ color: '#6b4a3a', emissive: '#ffb066', emissiveIntensity: 1.4, side: THREE.BackSide });
    let k = 0;
    for (const y of ys) for (const x of xs) {
      const room = new THREE.Mesh(new THREE.BoxGeometry(ww + 2, wh + 2, 5), this.windowRoomMat); room.position.set(x, y, -2.6); g.add(room);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.6, 0.35, 1.4), new THREE.MeshStandardMaterial({ color: '#f1ece2' })); sill.position.set(x, y - wh / 2, 0.4); g.add(sill);
      const p = this.windowPeople[k++]; p.place(x, -1.0, 0, y - wh / 2 - 2.4); g.add(p.root);
    }
    g.position.set(0, 0, -73.2);
    return g;
  }

  shake(amount, t, freq = 18) {
    const c = this.camera;
    c.position.x += noise1(t * freq, 1) * amount; c.position.y += noise1(t * freq, 2) * amount; c.rotation.z += noise1(t * freq, 3) * amount * 0.02;
  }
  setCam(pos, target, fov = 50, roll = 0) {
    this.camera.position.set(...pos); this.camera.fov = fov; this.camera.updateProjectionMatrix();
    this.camera.lookAt(new THREE.Vector3(...target)); this.camera.rotation.z += roll;
  }
}
