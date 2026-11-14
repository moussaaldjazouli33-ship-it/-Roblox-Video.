// =====================================================================================
//  LE SCÉNARIO : chaque plan est calé sur les horodatages exacts de la voix off.
//  Tout est une fonction pure du temps t (secondes) → rendu reproductible image par image.
// =====================================================================================
import * as THREE from 'three';
import { clamp, lerp, range, smooth, seg, easeInOut, easeOut, easeIn, easeOutBack, keys, noise1, pulse, lerp3 } from './util.js';
import { aimBeam } from './effects.js';

export const DURATION = 132.62;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------- Poses du monstre ----------
const P_REST = { lean: 0.1, head: [0.2, 0, 0], armL: [-0.15, 0, -0.2, -0.3], armR: [-0.15, 0, 0.2, -0.3], legL: [0, -0.06, 0], legR: [0, 0.06, 0], curlL: 0.3, curlR: 0.3 };
const P_FROZEN = { lean: 0.14, head: [0.28, 0.18, 0.06], armL: [-0.35, 0, -0.35, -0.6], armR: [-0.7, 0.1, 0.3, -0.45], legL: [0.08, -0.08, 0], legR: [-0.2, 0.08, 0.25], curlL: 0.45, curlR: 0.2 };
const P_REACH = { lean: 0.42, head: [0.45, 0.05, 0], armL: [-0.3, 0, -0.4, -0.7], armR: [-1.15, 0, 0.12, -0.35], legL: [-0.25, -0.08, 0.35], legR: [0.15, 0.08, 0.1], curlL: 0.4, curlR: 0.05 };
const P_CROUCH = { lean: 0.5, twist: 0.05, head: [-0.22, -0.08, 0.1], armL: [-0.5, 0, -0.45, -0.9], armR: [-0.95, -0.1, 0.12, -0.75], legL: [-0.85, -0.14, 1.3], legR: [-0.55, 0.14, 0.95], curlL: 0.5, curlR: 0.85 };
const mixPose = (a, b, k) => { const o = {}; for (const key in a) o[key] = Array.isArray(a[key]) ? lerp3(a[key], b[key], k).concat(a[key].length > 3 ? [lerp(a[key][3], b[key][3], k)] : []) : lerp(a[key], b[key] ?? a[key], k); return o; };
// pose de marche du monstre (dans le noir)
const walkPose = (ph) => ({ ...P_REACH, lean: 0.3, legL: [Math.sin(ph) * 0.5 - 0.1, -0.08, Math.max(0, -Math.sin(ph)) * 0.8], legR: [-Math.sin(ph) * 0.5 - 0.1, 0.08, Math.max(0, Math.sin(ph)) * 0.8], armL: [-0.3 + Math.sin(ph) * 0.3, 0, -0.4, -0.6], armR: [-0.6 - Math.sin(ph) * 0.3, 0, 0.3, -0.6] });

// ---------- Positions de référence ----------
const POST_DAD = [-2.2, 25.2], POST_KID = [1.6, 25.8];
const MONSTER_FRONT = [0, 0, 9];
const SLIP_GUARD = 3, GRAB_GUARD = 7, CABLE_GUARD = 11;
const EMERG = Array.from({ length: 12 }, (_, i) => {
  // positions d'urgence : anneau autour de la clôture, en laissant le poste du père libre
  const a = (i / 12) * TAU + 0.28; return [Math.sin(a) * 21, Math.cos(a) * 21];
});
EMERG[SLIP_GUARD] = [9.5, 19.2];
EMERG[GRAB_GUARD] = [-7.5, 19.5];
const CAR_ANG = [0.55, 1.4, 2.3, 3.4, 4.3, 5.4];
const carPos = (i, k) => { const r = lerp(105, 44, k), a = CAR_ANG[i]; return [Math.sin(a) * r, Math.cos(a) * r, a + Math.PI]; };
const monsterChest = (w) => (w.monster.root.updateMatrixWorld(true), w.monster.chest).getWorldPosition(new THREE.Vector3()).add(V(0, 4, 0));

// ---------- Helpers personnages ----------
function show(list, v) { for (const r of list) r.root.visible = v; }
function patrol(w, t, i) {
  const g = w.guards[i], a = (i / 12) * TAU + t * 0.075, r = 19.5;
  g.place(Math.sin(a) * r, Math.cos(a) * r, a + Math.PI / 2).walk(t * 5.2 + i, 0.55);
  g.aim('R', 0.9); g.armR.rotation.x = -0.75; // torche baissée devant soi
}
// fait viser la torche d'un perso vers un point du monde
function aimAt(rig, target, side = 'R') {
  const p = rig.root.position; rig.face(target.x, target.z);
  const d = Math.hypot(target.x - p.x, target.z - p.z), sh = 4 * rig.root.scale.y;
  const pitch = Math.atan2(target.y - sh, d);
  rig.aim(side, -pitch);
}
function standEmergency(w, t, i, aim = 1) {
  const g = w.guards[i], [x, z] = EMERG[i];
  g.place(x, z, 0).face(0, 0).idle(t + i, 0.6);
  if (aim > 0) { aimAt(g, monsterChest(w)); g.armR.rotation.x = lerp(-0.3, g.armR.rotation.x, aim); g.setFlashlight(1); }
}

// ---------- État "par défaut" du monde à l'instant t (continuité entre les plans) ----------
function base(w, t, s) {
  const M = w.monster;
  M.reset(); M.setPose(P_FROZEN);
  w.rubble.visible = true; w.fence.visible = true; w.cable.visible = true; w.panel.visible = true;
  w.windowSet.visible = false; w.puddles.visible = t > 82;
  for (const r of [w.kid, w.dad, ...w.guards, ...w.civilians]) { r.root.visible = false; r.reset(); r.root.rotation.set(0, 0, 0); r.setFace('smile'); r.setFlashlight(0); if (r.root.parent !== w.scene) w.scene.add(r.root); }
  w.guards.forEach(g => g.setFace('serious')); w.dad.setFace('serious');
  w.radio.visible = false; w.dropLight.visible = false; w.kidLight.visible = false;
  w.key.intensity = 0; w.fill.intensity = 0; w.blast.intensity = 0; w.siren.forEach(l => (l.intensity = 0));
  w.lightning.hideAll();
  w.lever.rotation.x = -0.6; w.panelLed.emissiveIntensity = 3;
  // tours : allumées la nuit ; la n°0 explose à 46.18 ; extinction totale à 75.64
  const night = s.night;
  w.towers.forEach((tw, i) => {
    tw.root.visible = true; tw.mast.position.y = 0; tw.gen.root.scale.setScalar(1);
    const broken = i === 0 && t >= 46.18;
    let v = night * (broken ? 0 : 1), col = '#fff3dc';
    if (t >= 75.64) v = 0;
    // « seules les lumières de secours » : lampes de secours orangées sur les tours
    if (t >= 77.45 && !broken) { v = 0.65 * Math.min(1, (t - 77.45) / 0.3); col = '#ff8f78'; }
    if (t >= 98.9 && t < 104.95) v = 0;                       // le noir total
    if (t >= 104.95 && !broken) { v = 0.8; col = '#ffc9a8'; }  // les lumières reviennent
    tw.set(v, broken, col); tw.gen.heat(0, t);
  });
  // voitures de police (après 65.28)
  w.cars.forEach((c, i) => {
    const k = easeOut(range(t, 65.3 + i * 0.18, 67.6 + i * 0.12));
    c.root.visible = t > 65.2;
    const [x, z, h] = carPos(i, k); c.root.position.set(x, 0, z); c.root.rotation.y = h;
    c.set(t + i * 0.13, { siren: 1, head: i === 1 && t > 90.2 ? 0 : 1 });
  });
  // ville
  setCityLights(w, t, night);
  // personnages par défaut selon l'histoire
  show(w.guards, night > 0.5);
  for (let i = 0; i < 12; i++) {
    if (t < 62.4) patrol(w, t, i);
    else standEmergency(w, t, i, t > 68.06 ? 1 : 0);
  }
  if (t > 75.64) w.guards.forEach(g => g.setFlashlight(1));
  if (t > 85.2) layFallen(w, t);
  if (t > 102.6) w.guards[GRAB_GUARD].root.visible = false;
  // le monstre, après le noir, est juste devant le poste
  if (t > 99.6) { M.root.position.set(...MONSTER_FRONT); M.setPose(P_CROUCH); w.fence.visible = true; }
  if (t > 104.9) holdGuard(w, t);
  // pluie / orage
  s.rain = t > 82.4 ? Math.min(1, (t - 82.4) / 1.2) : 0;
  return s;
}

function setCityLights(w, t, night) {
  // vague d'extinction depuis le centre à 75.64 ("The entire town went dark")
  for (const m of w.city.windowMats) m.emissiveIntensity = night * m.userData.base;
  w.city.lightsOff.value = t >= 75.64 ? (t - 75.64) * 260 : 0;
  const lamps = night * (t >= 75.75 ? 0 : 1);
  for (const m of w.city.lampMats) m.emissiveIntensity = 2 * lamps;
  for (const m of w.city.antennaMats) m.emissiveIntensity = (Math.sin(t * 3) > 0 ? 3 : 0.3) * (t >= 76 ? 0 : 1);
}

function layFallen(w, t) {
  const g = w.guards[SLIP_GUARD], k = easeIn(range(t, 85.25, 85.85));
  const [x, z] = EMERG[SLIP_GUARD];
  g.place(x, z, 0).face(0, 0);
  g.root.rotation.x = -k * 1.45; g.root.position.y = k * 0.6;
  g.legL.rotation.x = -k * 1.2; g.legR.rotation.x = -k * 0.8; g.armL.rotation.x = -k * 2.4; g.armR.rotation.x = -k * 2.8;
  g.setFace(t > 85.3 ? 'scared' : 'serious');
  g.setFlashlight(t < 85.5 ? 1 : 0);
  if (t > 87.0) { // il se relève à moitié
    const u = smooth(range(t, 88.5, 90)); g.root.rotation.x = lerp(-1.45, -0.4, u);
  }
}

function holdGuard(w, t) {
  // le garde pend sous les griffes de la main droite, bras levés, jambes qui gigotent
  const g = w.guards[GRAB_GUARD];
  w.monster.root.updateMatrixWorld(true);
  const tip = w.monster.arm.R.fingers[1].tip.getWorldPosition(new THREE.Vector3());
  g.root.visible = true; g.reset();
  const sw = Math.sin(t * 1.7) * 0.08;
  g.place(tip.x, tip.z + 0.3, 0.4 + sw, tip.y - 5.9).face(0, 40);
  g.root.rotation.z = sw;
  const br = Math.sin(t * 3.1);
  g.torso.scale.set(1 + br * 0.03, 1, 1 + br * 0.06); // respiration
  g.armL.rotation.set(-3.0 + Math.sin(t * 2.4) * 0.08, 0, 0.15); g.armR.rotation.set(-3.0 + Math.cos(t * 2.2) * 0.08, 0, -0.15);
  g.legL.rotation.x = 0.25 + Math.sin(t * 2.6) * 0.35; g.legR.rotation.x = -0.15 + Math.sin(t * 2.6 + 2) * 0.35;
  g.neck.rotation.x = -0.25 + Math.sin(t * 3.1) * 0.05;
  g.setFace('scared'); g.setFlashlight(0);
}

// Gros plan sur le visage d'un perso (+ lumière d'appoint sur le visage)
function headPos(rig) { rig.root.updateMatrixWorld(true); return rig.head.getWorldPosition(new THREE.Vector3()); }
function portrait(w, rig, { dist = 6, h = 0.4, side = 0.35, fov = 40, look = [0, 0, 0], light = 1, push = 0 } = {}) {
  const hp = headPos(rig), hd = rig.root.rotation.y + side, d = dist - push;
  const cam = [hp.x + Math.sin(hd) * d, hp.y + h, hp.z + Math.cos(hd) * d];
  w.setCam(cam, [hp.x + look[0], hp.y + look[1] - 0.15, hp.z + look[2]], fov);
  w.key.color.set('#ffe6c4'); w.key.position.set(cam[0] + 1.5, cam[1] + 2.5, cam[2]); w.key.target.position.copy(hp); w.key.angle = 0.35; w.key.intensity = 28 * light;
}

// lumière des torches qui éclaire le monstre par en dessous (plans après le retour des lumières)
function underlight(w, k = 1) {
  const h = w.monster.head.getWorldPosition(new THREE.Vector3());
  w.key.color.set('#fff0d8'); w.key.position.set(3, 3, 30); w.key.target.position.copy(h).add(V(0, -6, 0)); w.key.angle = 0.45; w.key.intensity = 260 * k;
}

// garçon et père à leur poste
function atPost(w, t, { kidFace = 'smile', dadFace = 'serious', lookMonster = true } = {}) {
  show([w.kid, w.dad], true);
  w.dad.place(...POST_DAD, Math.PI).idle(t, 0.5);
  w.kid.place(...POST_KID, Math.PI).idle(t + 1, 0.8);
  if (lookMonster) { w.dad.face(0, 0); w.kid.face(0, 0); w.dad.neck.rotation.x = -0.25; w.kid.neck.rotation.x = -0.3; }
  w.kid.setFace(kidFace); w.dad.setFace(dadFace);
}

// lampe qui vole / roule (objet libre)
function flyLight(obj, lens, beam, t, t0, t1, from, to, { spin = 8, on = 1, height = 4 } = {}) {
  const k = range(t, t0, t1);
  obj.visible = t > t0;
  obj.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + Math.sin(Math.PI * k) * height, lerp(from.z, to.z, k));
  obj.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2, -k * spin * (1 - k * 0.5));
  if (k >= 1) obj.rotation.z = -0.05;
  lens.emissiveIntensity = 4 * on; beam.visible = on > 0.05; beam.material.uniforms.opacity.value = 0.2 * on;
}

// ======================================================================================
//                                    LES PLANS
// ======================================================================================
// at : début du plan (s) — un plan dure jusqu'au début du suivant.
export const SHOTS = [
  // 0.00 « In our town, there's a monster that can only move in complete darkness. »
  { at: 0, name: 'Ouverture – la ville la nuit', run(w, t, s) {
    const k = easeInOut(range(t, 0, 4.1));
    w.setCam(lerp3([0, 120, 260], [6, 46, 74], k), lerp3([0, 22, 0], [0, 20, 0], k), lerp(38, 50, k));
    s.fade = 1 - range(t, 0, 0.5);
  } },
  // 4.12 « And if the lights go out for even one second, nobody is safe. »
  { at: 4.0, name: 'Les lumières vacillent', run(w, t, s) {
    const k = range(t, 4, 8.3);
    w.setCam(lerp3([5, 3, 26], [3, 6.5, 21], easeInOut(k)), [0, 35, 0], lerp(58, 46, k));
    // à « one second » : tout s'éteint une seconde
    const off = t > 5.7 && t < 6.75;
    const flick = off ? 0 : (t > 5.5 && t < 5.7 ? (Math.floor(t * 30) % 2) : 1);
    w.towers.forEach(tw => tw.set(flick));
    w.guards.forEach(g => g.setFlashlight(flick));
    s.ambient = flick ? 1 : 0.25; s.night = 1;
    w.monster.eyes(off ? 1 : 0);
    const twitch = seg(t, 5.9, 6.6);
    w.monster.setPose(mixPose(P_FROZEN, { ...P_FROZEN, head: [0.05, -0.25, -0.1], armR: [-0.9, 0.1, 0.3, -0.6] }, twitch));
    if (off) w.shake(0.15, t);
    if (t > 6.7) w.shake(0.35 * (1 - range(t, 6.7, 7.4)), t);
  } },
  // 8.48 « Three years ago, it appeared in the middle of our town. »
  { at: 8.3, name: 'Flash-back – apparition', run(w, t, s) {
    s.sepia = 0.55; s.label = { text: '3 YEARS AGO', a: pulse(t, 8.4, 11.3, 0.25) };
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    const rise = easeOut(range(t, 9.3, 11.0));
    w.monster.root.position.y = lerp(-44, 0, rise);
    w.monster.setPose(mixPose(P_REST, P_REACH, smooth(range(t, 10.2, 11.3)) * 0.6));
    w.monster.eyes(0.6);
    w.rubble.visible = true; w.rubble.scale.setScalar(lerp(0.2, 1, rise)); w.rubble.position.y = Math.sin(rise * Math.PI) * 4;
    // des passants s'enfuient
    show(w.civilians, true);
    w.civilians.forEach((c, i) => {
      const a = i * 0.9 + 0.3, r0 = 14 + i * 2.2, run = range(t, 9.4 + i * 0.05, 11.3);
      const r = r0 + run * 16;
      c.place(Math.sin(a) * r, Math.cos(a) * r, a).run(t * 11 + i);
      c.setFace(run > 0 ? 'scared' : 'smile');
      if (run <= 0) c.reset().idle(t);
    });
    const k = range(t, 8.3, 11.3);
    w.setCam(lerp3([10, 4, 62], [6, 9, 50], easeOut(k)), [0, lerp(8, 22, rise), 0], 54);
    if (t > 9.3) w.shake(0.6 * (1 - range(t, 10.6, 11.3)), t, 22);
    s.flash = 0.6 * (1 - range(t, 8.3, 8.55));
  } },
  // 11.52 « By sunrise, seven people had vanished. »
  { at: 11.3, name: 'Flash-back – disparitions', run(w, t, s) {
    s.sepia = 0.55; s.label = { text: '3 YEARS AGO', a: 1 - range(t, 13.6, 14.1) };
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    show(w.civilians, true);
    // 7 personnes ; chaque coupure de lumière en fait disparaître une
    const flick = [12.0, 12.35, 12.7, 13.0, 13.25, 13.5, 13.75];
    let blk = 0;
    w.civilians.forEach((c, i) => {
      c.place(-13 + i * 4.2, 48 + (i % 2) * 1.5, Math.PI).idle(t * 1.3 + i, 1.2);
      c.setFace('scared'); c.neck.rotation.y = Math.sin(t * 3 + i) * 0.5;
      if (t > flick[i] + 0.06) c.root.visible = false;
      if (t > flick[i] && t < flick[i] + 0.13) blk = 1;
    });
    s.fade = blk * 0.92;
    // le monstre se rapproche entre chaque coupure
    const n = flick.filter(f => t > f + 0.06).length;
    w.monster.setPose(n % 2 ? P_REACH : mixPose(P_REST, P_REACH, 0.5));
    w.monster.root.position.z = n * 2.2; w.monster.root.rotation.y = (n % 3 - 1) * 0.2;
    w.monster.eyes(0.8);
    w.setCam(lerp3([16, 4.5, 66], [10, 5, 62], range(t, 11.3, 14.1)), [-2, 9, 44], 56);
    s.counter = { n: n, a: range(t, 11.9, 12.1) * (1 - range(t, 13.9, 14.1)) };
  } },
  // 14.34 « But something strange happened when daylight touched its body. » 17.70 « It froze completely. »
  { at: 14.1, name: 'Le lever du soleil fige le monstre', run(w, t, s) {
    const d1 = smooth(range(t, 14.1, 16.3)), d2 = smooth(range(t, 15.6, 17.6));
    s.preset = d2 > 0 ? ['dawn', 'day', d2] : ['night', 'dawn', d1]; s.night = 1 - d1;
    s.sepia = 0.25 * (1 - d1);
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    setCityLights(w, t, 1 - d1);
    // le monstre avance vers un passant tombé... puis se fige net à 17.70
    const tt = Math.min(t, 17.72), freeze = t >= 17.72;
    w.monster.root.position.z = lerp(0, 3.5, range(tt, 14.1, 17.72));
    w.monster.setPose(mixPose(P_FROZEN, P_REACH, smooth(range(tt, 14.1, 17.4))));
    if (!freeze) w.monster.spine.rotation.z = Math.sin(tt * 4) * 0.05;
    const v = w.civilians[0]; v.root.visible = true; v.place(3, 21, Math.PI).setFace('scared');
    v.root.rotation.x = -0.5; v.root.position.y = 0.4; v.legL.rotation.x = -1.4; v.legR.rotation.x = -1.2; v.armL.rotation.x = -2.2; v.armR.rotation.x = -0.4;
    if (!freeze) v.armL.rotation.x += Math.sin(t * 9) * 0.2;
    const zoom = freeze ? easeOut(range(t, 17.72, 18.1)) : 0;
    w.setCam(lerp3([14, 5, 52], [9, 6, 42], easeInOut(range(t, 14.1, 17.7))), [0, lerp(18, 26, zoom), 2], lerp(52, 32, zoom));
    if (freeze) { s.flash = 0.45 * (1 - range(t, 17.72, 18.2)); s.sat = lerp(0.4, 1.1, range(t, 17.8, 18.9)); w.shake(0.25 * (1 - range(t, 17.72, 18.3)), t); }
  } },
  // 19.28 « That's when we discovered its only weakness. » 21.82 « Light. »
  { at: 19.0, name: 'Sa seule faiblesse : la lumière', run(w, t, s) {
    s.preset = ['day', 'day', 0]; s.night = 0;
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    w.monster.root.position.z = 3.5; w.monster.setPose(P_REACH);
    // deux scientifiques s'approchent prudemment
    show([w.civilians[1], w.civilians[2]], true);
    [1, 2].forEach((i, j) => { const c = w.civilians[i], z = lerp(36, 24, range(t, 19, 22)); c.place(-4 + j * 6, z, Math.PI).walk(t * 4 + j, 0.35).setFace('worried'); });
    const a = lerp(-0.5, 0.35, easeInOut(range(t, 19, 22.5)));
    const flash = t > 21.82 ? 1 - range(t, 21.82, 22.4) : 0;
    w.setCam([Math.sin(a) * 26, lerp(14, 20, range(t, 19, 22.5)), 3.5 + Math.cos(a) * 26], [0, 30, 3], lerp(50, 40, flash > 0 ? 1 : 0));
    s.flash = flash * 0.85; s.bloom = 0.6 + flash * 1.5;
  } },
  // 22.60 « The government immediately installed six enormous floodlights around it, each with its own backup generator. »
  { at: 22.5, name: 'Installation des 6 projecteurs', run(w, t, s) {
    s.preset = ['day', 'day', 0]; s.night = 0; show(w.guards, false); w.cars.forEach(c => (c.root.visible = false));
    w.monster.root.position.z = 0; w.monster.setPose(P_FROZEN);
    w.towers.forEach((tw, i) => {
      const k = easeOutBack(range(t, 24.15 + i * 0.32, 24.9 + i * 0.32));
      tw.mast.position.y = lerp(-40, 0, k); tw.root.visible = t > 24.1 + i * 0.32;
      tw.set(t > 25.2 + i * 0.1 ? 0.35 : 0);
      const g = easeOutBack(range(t, 26.4 + i * 0.22, 26.9 + i * 0.22)); tw.gen.root.scale.setScalar(Math.max(0.001, g));
      if (t > 27.6) tw.gen.heat(0.2, t);
    });
    w.fence.visible = t > 23.1; w.fence.scale.y = Math.max(0.01, easeOut(range(t, 23.1, 23.7)));
    w.cable.visible = t > 27.2; w.panel.visible = t > 27.2;
    // grue caméra en orbite
    const a = lerp(0.25, 1.35, easeInOut(range(t, 22.5, 28.8)));
    const r = t < 26.3 ? 82 : lerp(82, 46, easeInOut(range(t, 26.3, 28.8)));
    w.setCam([Math.sin(a) * r, lerp(55, 24, range(t, 22.5, 28.8)), Math.cos(a) * r], [0, lerp(14, 6, range(t, 26.3, 28.8)), 0], 50);
    if (t > 24.1 && t < 26.4) w.shake(0.12, t);
  } },
  // 28.80 « Every night, 12 armed guards patrol the area, making sure not a single light goes out. »
  { at: 28.6, name: 'Les 12 gardes patrouillent', run(w, t, s) {
    const g = w.guards[0], gp = g.root.position;
    if (t < 31.3) {
      const a = (0 / 12) * TAU + t * 0.075; // le garde n°0 marche vers la caméra
      w.setCam([Math.sin(a + 0.42) * 22.5, 4.6, Math.cos(a + 0.42) * 22.5], [gp.x, lerp(4.5, 9, range(t, 28.6, 31.3)), gp.z], 46);
      w.key.position.set(Math.sin(a + 0.3) * 23, 9, Math.cos(a + 0.3) * 23); w.key.target.position.copy(gp).add(V(0, 4, 0)); w.key.intensity = 40;
      w.guards.forEach(x => x.setFlashlight(1));
    } else {
      const k = easeInOut(range(t, 31.3, 34.3));
      w.setCam(lerp3([28, 10, 38], [20, 52, 50], k), [0, lerp(10, 4, k), 0], 50);
      w.guards.forEach(x => x.setFlashlight(1));
    }
    s.label = { text: 'EVERY NIGHT', a: pulse(t, 28.7, 31.2, 0.3) * 0 };
  } },
  // 34.46 « For three years, the monster never moved... » 36.66 « until last night. »
  { at: 34.3, name: 'Il n\'a jamais bougé… jusqu\'à hier soir', run(w, t, s) {
    w.guards.forEach(x => x.setFlashlight(1));
    const k = easeInOut(range(t, 34.3, 36.9)), z = easeIn(range(t, 37.3, 38.3));
    w.setCam(lerp3(lerp3([0, 24, 44], [0, 31, 24], k), [0, 36, 13], z), [0, 37, 2], lerp(lerp(46, 40, k), 26, z));
    w.monster.eyes(t > 37.6 ? 0.6 * Math.abs(Math.sin(t * 20)) : 0);
    s.red = 0.25 * z; s.vignette = 1 + z;
  } },
  // 38.56 « My dad is the head of security, and for the first time he allowed me to join his night shift. »
  { at: 38.4, name: 'Papa et moi', run(w, t, s) {
    show([w.kid, w.dad], true);
    const z = lerp(46, 27, range(t, 38.4, 43.4));
    w.dad.place(-2.2, z, Math.PI).walk(t * 5, 0.6); w.kid.place(1.4, z + 0.6, Math.PI).walk(t * 6.2, 0.75);
    w.dad.setFace('serious'); w.kid.setFace('smile');
    if (t > 40.48 && t < 41.3) { const j = Math.sin(range(t, 40.48, 41.1) * Math.PI); w.kid.body.position.y += j * 1.4; w.kid.armL.rotation.x = w.kid.armR.rotation.x = -2.8 * j; }
    w.dad.setFlashlight(1); w.dad.armR.rotation.x = -0.9; w.kid.setFlashlight(1); w.kid.armR.rotation.x = -0.9;
    if (t < 40.8) { // travelling avant (on voit les visages)
      w.setCam([1.8, 5.6, z - 12.5], [-0.3, 4.0, z], 46); w.key.position.set(2, 9, z - 10); w.key.target.position.set(0, 4, z); w.key.intensity = 40;
      
    } else { // par-dessus l'épaule : révélation du monstre
      const k = easeInOut(range(t, 40.8, 43.6));
      w.setCam([lerp(-4, 3, k), lerp(5, 7, k), z + 10], [0, lerp(10, 22, k), 0], 52);
    }
  } },
  // 43.76 « Everything was quiet until 2 a.m. »
  { at: 43.6, name: '2 heures du matin', run(w, t, s) {
    atPost(w, t, { kidFace: 'smile' });
    w.kid.setFlashlight(1); w.dad.setFlashlight(1); aimAt(w.kid, V(0, 4, 0)); aimAt(w.dad, V(0, 4, 0));
    const k = range(t, 43.6, 46.05);
    w.setCam(lerp3([-8, 26, 64], [-6, 22, 56], k), [0, 14, 4], 50);
    s.clock = { text: '2:00 AM', a: range(t, 44.8, 45.1) * (1 - range(t, 45.9, 46.05)) };
  } },
  // 46.18 « Boom! » 47.38 « One of the massive floodlights exploded. »
  { at: 46.05, name: 'BOOM – un projecteur explose', run(w, t, s) {
    atPost(w, t, { kidFace: t > 46.25 ? 'scared' : 'smile', dadFace: t > 46.25 ? 'worried' : 'serious' });
    w.kid.setFlashlight(1); w.dad.setFlashlight(1);
    const tw = w.towers[0], lens = tw.lensWorld;
    if (t > 46.25) { w.kid.face(lens.x, lens.z); w.dad.face(lens.x, lens.z); w.kid.neck.rotation.x = w.dad.neck.rotation.x = -0.6; w.kid.panic(t); }
    const e = t - 46.18;
    w.sparks.sparks(t, 46.18, lens, { speed: 20, life: 2.4 });
    w.glass.sparks(t, 46.2, lens, { speed: 8, life: 3, gravity: 18 });
    w.blast.position.copy(lens); w.blast.intensity = e > 0 ? 3000 * Math.max(0, 1 - e / 0.9) : 0;
    if (e > 0) { s.flash = 0.75 * Math.max(0, 1 - e / 0.35); w.smoke.smoke(t, lens, { rate: 0.6, height: 16, spread: 3, on: Math.min(1, e) }); }
    if (t < 47.3) {
      const whip = easeInOut(range(t, 46.15, 46.45));
      const tgt = lerp3([0, 7, 25], [lens.x, lens.y - 2, lens.z], whip);
      w.setCam([-6, 4.5, 37], tgt, lerp(46, 34, whip));
      w.shake(e > 0 ? 1.4 * Math.max(0, 1 - e / 1.1) : 0, t, 25);
    } else {
      const k = range(t, 47.3, 49.45);
      w.setCam(lerp3([2, 30, 42], [5, 33, 38], k), [lens.x, lens.y - 1, lens.z], 34);
      w.shake(0.12, t);
    }
  } },
  // 49.66 « Dad stayed calm. » 50.96 « "We still have five," he said. »
  { at: 49.45, name: '« Il en reste cinq »', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'serious', lookMonster: false });
    w.dad.face(POST_KID[0], POST_KID[1] + 6); w.kid.face(POST_DAD[0], POST_DAD[1] + 2);
    w.dad.setFlashlight(1); w.dad.armR.rotation.x = -0.8;
    // il lève la main gauche : « cinq »
    const up = seg(t, 50.9, 51.4) * (1 - seg(t, 52.4, 52.9));
    w.dad.armL.rotation.set(lerp(-0.05, -2.7, up), 0, lerp(-0.05, -0.25, up));
    w.dad.neck.rotation.y = Math.sin(t * 1.3) * 0.08;
    portrait(w, w.dad, { dist: 7.5, side: 0.55, h: 0.2, fov: 42, look: [1.2, -0.4, 0], push: 1.5 * range(t, 49.45, 52.9) });
    w.smoke.smoke(t, w.towers[0].lensWorld, { rate: 0.6, height: 16, spread: 3, on: 1 });
  } },
  // 53.14 « Then his radio suddenly crackled. »
  { at: 52.9, name: 'La radio grésille', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried', dadFace: 'serious', lookMonster: false });
    w.dad.face(4, 40); w.radio.visible = true;
    const up = seg(t, 53.3, 53.9);
    w.dad.armL.rotation.set(lerp(-0.2, -2.25, up), 0, lerp(0, 0.75, up)); w.dad.neck.rotation.y = -0.25 * up;
    w.dad.setFlashlight(1); w.dad.armR.rotation.x = -0.6;
    const crackle = t > 54.0 ? Math.abs(noise1(t * 30)) : 0;
    portrait(w, w.dad, { dist: 5.2, side: -0.35, h: 0.3, fov: 40, push: 1.2 * range(t, 52.9, 55.1) });
    w.shake(crackle * 0.06, t, 40);
    s.flash = crackle * 0.05;
  } },
  // 55.22 « Chief, the main power cable is damaged. We need to shut down the system. »
  { at: 55.1, name: 'Le câble principal est endommagé', run(w, t, s) {
    const g = w.guards[CABLE_GUARD]; g.root.visible = true; g.reset();
    g.place(-39.2, 50.4, 0).face(-36.5, 47.6).idle(t); g.setFace('worried');
    g.armL.rotation.set(-2.2, 0, 0.7); g.setFlashlight(1); aimAt(g, V(-36.5, 0.3, 47.6));
    const dmg = V(-36.5, 0.6, 47.6);
    const cyc = Math.floor((t - 55.1) / 0.55), t0 = 55.1 + cyc * 0.55;
    w.cableSparks.sparks(t, t0, dmg, { speed: 9, life: 0.55, gravity: 30 });
    w.fill.color.set('#9fd0ff'); w.fill.position.copy(dmg).add(V(0, 1, 0)); w.fill.intensity = 60 * Math.max(0, 1 - (t - t0) / 0.3);
    const k = easeInOut(range(t, 55.1, 59.2));
    w.setCam(lerp3([-30.5, 1.8, 51.5], [-31.5, 3, 53.5], k), lerp3([-36.5, 1, 47.6], [-38.5, 3.6, 50.2], k), 46);
    w.key.position.set(-31, 8, 54); w.key.target.position.set(-38.5, 3, 50.2); w.key.intensity = 35;
    if (t > 57.9) s.label = { text: 'SHUT DOWN?!', a: 0 };
  } },
  // 59.42 « The backup generators were overheating, too. »
  { at: 59.2, name: 'Les générateurs surchauffent', run(w, t, s) {
    const tw = w.towers[5], gp = tw.gen.root.getWorldPosition(new THREE.Vector3());
    w.towers.forEach(x => x.gen.heat(1, t));
    w.smoke.smoke(t, gp.clone().add(V(0, 2.5, 0)), { rate: 1.2, height: 10, spread: 2, on: 1 });
    const k = range(t, 59.2, 61.8);
    const dir = V(-Math.sin(tw.angle), 0, -Math.cos(tw.angle)), side = V(dir.z, 0, -dir.x);
    const cp = gp.clone().addScaledVector(dir, 6.5 - k * 1.5).addScaledVector(side, 3.5);
    w.fill.color.set('#ff2a10'); w.fill.position.copy(gp).addScaledVector(dir, 2).add(V(0, 3, 0)); w.fill.intensity = 25 * (Math.sin(t * 12) > 0 ? 1 : 0.2);
    w.setCam([cp.x, 2.6 + k, cp.z], [gp.x, 1.6, gp.z], 46);
    w.shake(0.04, t, 30);
  } },
  // 61.96 « Dad immediately ordered everyone into emergency positions. »
  { at: 61.8, name: 'Positions d\'urgence !', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried', dadFace: 'shout', lookMonster: false });
    w.dad.face(-10, 15); w.dad.aim('R', -0.15); w.dad.setFlashlight(1);
    w.dad.armR.rotation.y = Math.sin(t * 4) * 0.25;
    // les gardes courent de leur patrouille vers leur poste
    for (let i = 0; i < 12; i++) {
      const g = w.guards[i], a = (i / 12) * TAU + 62.4 * 0.075, r = 19.5;
      const from = [Math.sin(a) * r, Math.cos(a) * r], to = EMERG[i], k = smooth(range(t, 62.2 + (i % 4) * 0.1, 64.6));
      g.reset(); g.place(lerp(from[0], to[0], k), lerp(from[1], to[1], k), 0);
      if (k > 0 && k < 1) { g.face(to[0], to[1]); g.run(t * 13 + i); } else { g.face(0, 0); g.idle(t); }
      g.setFlashlight(1); g.armR.rotation.x = k > 0 && k < 1 ? g.armR.rotation.x : -0.5;
    }
    const k = range(t, 61.8, 65.1);
    w.setCam(lerp3([-5, 12, 38], [-8, 16, 42], k), [-2, 3, 14], 54);
  } },
  // 65.28 « Within minutes, police cars surrounded the square. »
  { at: 65.1, name: 'Les voitures de police encerclent la place', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1);
    const k = range(t, 65.1, 67.9);
    w.setCam(lerp3([60, 62, 100], [40, 70, 80], easeInOut(k)), [0, 0, 8], 52);
    // lumière d'ambiance des gyrophares
    const ph = Math.floor(t * 6) % 2;
    w.siren[0].position.set(0, 6, 44); w.siren[1].position.set(30, 6, -30);
    w.siren[0].intensity = ph ? 60 : 0; w.siren[1].intensity = ph ? 0 : 60;
  } },
  // 68.06 « Guards aimed their flashlights at the creature, » 70.22 « while people in nearby buildings pointed lamps through their windows. »
  { at: 67.9, name: 'Toutes les torches sur la créature', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1); aimAt(w.kid, monsterChest(w)); aimAt(w.dad, monsterChest(w));
    for (let i = 0; i < 12; i++) standEmergency(w, t, i, seg(t, 68.06 + (i % 5) * 0.12, 68.9 + (i % 5) * 0.12));
    if (t < 70.5) {
      const k = range(t, 67.9, 70.5);
      w.setCam(lerp3([25, 3, 13], [24, 3.5, 7], k), lerp3([4, 7, 22], [0, 24, 0], easeInOut(k)), 52);
    } else {
      w.windowSet.visible = true;
      w.windowPeople.forEach((p, i) => {
        p.reset().idle(t + i); p.setFace('worried');
        const up = seg(t, 71.5 + i * 0.12, 72.1 + i * 0.12);
        p.aim('R', lerp(1.4, 0.15, up)); p.setFlashlight(up);
      });
      const k = range(t, 70.5, 73.3);
      w.setCam(lerp3([-8, 10, -44], [6, 13, -47], easeInOut(k)), [0, 13, -73], 54);
      w.key.position.set(0, 14, -55); w.key.target.position.set(0, 12, -73); w.key.angle = 0.6; w.key.intensity = 60;
    }
  } },
  // 73.42 « Then suddenly, click! » (74.66)  75.64 « The entire town went dark. »
  { at: 73.3, name: 'Clic ! – la ville s\'éteint', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1);
    for (let i = 0; i < 12; i++) standEmergency(w, t, i, 1);
    if (t < 75.5) {
      const flip = easeIn(range(t, 74.55, 74.7));
      w.lever.rotation.x = lerp(-0.6, 0.8, flip);
      w.panelLed.emissiveIntensity = t > 74.7 ? 0 : 3;
      const pp = w.panel.position, pr = w.panel.rotation.y, fx = Math.sin(pr), fz = Math.cos(pr);
      const hand = w.guards[CABLE_GUARD]; hand.root.visible = true; hand.reset();
      hand.place(pp.x + fx * 2.6 + fz * 1.2, pp.z + fz * 2.6 - fx * 1.2, 0).face(pp.x, pp.z);
      hand.aim('R', lerp(-0.25, 0.35, flip)); hand.setFace('worried');
      const k = range(t, 73.3, 75.5);
      const d = lerp(8, 6.5, k);
      w.setCam([pp.x + fx * d - fz * 2.5, 4.8, pp.z + fz * d + fx * 2.5], [pp.x, 3.2, pp.z], 44);
      w.key.position.set(pp.x + fx * 4, 7, pp.z + fz * 4); w.key.target.position.set(pp.x, 3, pp.z); w.key.intensity = 30;
      if (t > 74.66) w.shake(0.05 * (1 - range(t, 74.66, 75.0)), t, 40);
    } else {
      const k = range(t, 75.5, 77.25);
      w.setCam(lerp3([-20, 95, 175], [-14, 88, 160], k), [0, 8, 0], 52);
      s.exposure = 1 - 0.45 * range(t, 75.64, 76.8);
    }
  } },
  // 77.40 « Only the emergency lights remained, keeping the monster frozen. »
  { at: 77.25, name: 'Seules les lumières de secours', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1); aimAt(w.kid, monsterChest(w)); aimAt(w.dad, monsterChest(w));
    const a = lerp(-0.6, 0.15, easeInOut(range(t, 77.25, 81)));
    w.setCam([Math.sin(a) * 33, lerp(4, 9, range(t, 77.25, 81)), Math.cos(a) * 33], [0, 24, 0], 50);
    w.fill.color.set('#ff2020'); w.fill.position.set(Math.sin(t * 2.5) * 18, 3, Math.cos(t * 2.5) * 18); w.fill.intensity = 40;
    s.red = 0.12;
  } },
  // 81.08 « I thought we were safe until a violent thunderstorm hit. »
  { at: 81.0, name: 'L\'orage éclate', run(w, t, s) {
    atPost(w, t, { kidFace: t > 82.5 ? 'scared' : 'worried', dadFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1); aimAt(w.kid, monsterChest(w)); aimAt(w.dad, monsterChest(w));
    const k = range(t, 81, 83.95);
    w.setCam(lerp3([5, 4.2, 35], [4, 5, 38], k), [0, 22, -10], 54);
    w.fill.color.set('#ff2020'); w.fill.position.set(Math.sin(t * 2.5) * 18, 3, Math.cos(t * 2.5) * 18); w.fill.intensity = 30;
    if (t > 82.55) w.shake(0.4 * (1 - range(t, 82.55, 83.6)), t, 20);
  } },
  // 84.06 « Rain poured down, one guard slipped, » 86.06 « and his flashlight disappeared into the water. »
  { at: 83.95, name: 'Un garde glisse', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' }); w.kid.setFlashlight(1); w.dad.setFlashlight(1); aimAt(w.kid, monsterChest(w)); aimAt(w.dad, monsterChest(w));
    const g = w.guards[SLIP_GUARD], [gx, gz] = EMERG[SLIP_GUARD];
    if (t < 85.25) { g.setFlashlight(1); }
    // la torche vole puis coule dans la flaque
    const from = V(gx + 0.5, 4.5, gz + 0.8), to = V(11.6, 0.55, 21.8);
    const sink = range(t, 87.1, 88.1);
    flyLight(w.dropLight, w.dropLens, w.dropBeam, t, 85.5, 86.5, from, to, { spin: 9, on: 1 - sink, height: 3.5 });
    if (t > 86.5) { w.dropLight.position.y = lerp(0.55, 0.1, sink); w.dropLight.rotation.z = -0.15; }
    w.key.position.set(13, 8, 12); w.key.target.position.set(gx, 1.5, gz); w.key.intensity = 35;
    if (t < 86.0) {
      w.setCam(lerp3([15, 2.6, 12.5], [14.5, 3, 13.5], range(t, 83.95, 86)), [gx, 2.6, gz], 46);
    } else {
      w.setCam(lerp3([16.5, 1.8, 17], [15.5, 1.4, 18], range(t, 86, 88.75)), [11.6, 0.5, 21.8], 38);
    }
    s.bloom = 0.8;
  } },
  // 88.84 « Then another police car lost its headlights. »
  { at: 88.75, name: 'Une voiture perd ses phares', run(w, t, s) {
    const c = w.cars[1];
    const fl = t > 89.6 && t < 90.45 ? (Math.floor(t * 22) % 3 ? 1 : 0) : (t >= 90.45 ? 0 : 1);
    c.set(t, { siren: 1, head: fl });
    const p = c.root.position, f = V(-Math.sin(CAR_ANG[1]), 0, -Math.cos(CAR_ANG[1]));
    const k = range(t, 88.75, 91.4);
    w.setCam([p.x + f.x * 12 + f.z * 4, lerp(2.6, 1.8, k), p.z + f.z * 12 - f.x * 4], [p.x, 1.8, p.z], lerp(48, 40, k));
    const ph = Math.floor(t * 6) % 2;
    w.siren[0].position.set(p.x, 7, p.z - 3); w.siren[0].intensity = ph ? 25 : 0; w.siren[1].position.set(p.x, 7, p.z + 3); w.siren[1].intensity = ph ? 0 : 25;
    w.key.position.set(p.x + f.x * 12, 6, p.z + f.z * 12); w.key.target.position.copy(p); w.key.intensity = 30;
  } },
  // 91.52 « Keep those lights on! » 92.96 « Dad screamed. »
  { at: 91.4, name: '« Gardez ces lumières allumées ! »', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'shout', lookMonster: false });
    w.dad.face(6, 40); w.dad.setFlashlight(1); w.dad.armR.rotation.x = -0.9;
    w.dad.armL.rotation.set(-1.4 + Math.sin(t * 9) * 0.3, 0, 0.2);
    w.dad.neck.rotation.x = -0.1 + Math.sin(t * 8) * 0.06;
    portrait(w, w.dad, { dist: 7.5, side: 0.25, h: 0.1, fov: 40, push: 1.4 * easeOut(range(t, 91.4, 92.2)), light: 1.3 });
    w.shake(0.07, t, 24);
  } },
  // 93.96 « I rushed forward to help, but tripped over a cable. » 96.82 « My flashlight flew out of my hand. »
  { at: 93.9, name: 'Je trébuche sur le câble', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' }); w.dad.setFlashlight(1); aimAt(w.dad, monsterChest(w));
    const kid = w.kid;
    const runK = range(t, 94.05, 95.45), z = lerp(POST_KID[1], 22.6, runK);
    kid.place(POST_KID[0], z, Math.PI); kid.setFace(t > 95.4 ? 'shout' : 'scared');
    if (t < 95.45) { kid.run(t * 13); kid.setFlashlight(1); kid.armR.rotation.x = -1.2; }
    else { // chute vers l'avant
      const f = easeIn(range(t, 95.45, 96.2));
      kid.place(POST_KID[0], lerp(22.6, 20.4, easeOut(range(t, 95.45, 96.4))), Math.PI);
      kid.root.rotation.x = f * 1.45; kid.root.position.y = f * 0.55;
      kid.armL.rotation.x = -2.6 * f; kid.armR.rotation.x = -2.6 * f; kid.legL.rotation.x = 0.4 * f;
      kid.setFlashlight(t < 96.82 ? 1 : 0);
    }
    // la torche s'envole
    const from = V(POST_KID[0] + 0.6, 1.6, 19.8), to = V(-3.5, 0.5, 13.5);
    flyLight(w.kidLight, w.kidLens, w.kidBeam, t, 96.82, 98.3, from, to, { spin: 14, on: t > 98.3 ? 0.7 : 1, height: 5 });
    w.key.position.set(9, 8, z + 3); w.key.target.position.set(POST_KID[0], 1.5, z - 1); w.key.intensity = 35;
    if (t < 96.8) {
      const k = range(t, 93.9, 96.8);
      w.setCam([lerp(9, 8, k), lerp(3, 2.2, k), z + 1], [POST_KID[0], 2.2, z - 1], 46);
    } else { // ralenti : on suit la lampe
      const lp = w.kidLight.position;
      w.setCam([lp.x + 6, Math.max(1.2, lp.y + 1.5), lp.z + 5.5], [lp.x, lp.y, lp.z], 44);
    }
    s.bloom = 0.8;
  } },
  // 98.88 « For one terrifying second, the monster was completely in darkness. »
  { at: 98.75, name: 'Dans le noir…', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' });
    // toutes les torches ont dévié : plus aucune ne touche le monstre
    w.guards.forEach((g, i) => { g.setFlashlight(1); g.armR.rotation.x = -0.25; g.armR.rotation.y = (i % 2 ? 1 : -1) * 0.8; });
    w.kid.place(POST_KID[0], 20.4, Math.PI); w.kid.root.rotation.x = 1.45; w.kid.root.position.y = 0.55; w.kid.armL.rotation.x = w.kid.armR.rotation.x = -2.6;
    w.kidLight.visible = true; w.kidLight.position.set(-3.5, 0.5, 13.5); w.kidLight.rotation.set(0, Math.atan2(-5.1, -6.3) + Math.PI / 2, -0.05);
    w.kidBeam.material.uniforms.opacity.value = 0.12; w.kidLens.emissiveIntensity = 2;
    const dark = t > 99.0 ? 1 : 0;
    w.cars.forEach(c => c.set(t, { siren: 0.25, head: 0 }));
    s.ambient = 0.25; s.exposure = 0.55;
    // le monstre bouge dans le noir — révélé par un éclair à ~100.4
    const m = range(t, 99.2, 101.6);
    w.monster.root.position.set(0, 0, lerp(0, MONSTER_FRONT[2], easeInOut(m)));
    w.monster.setPose(t < 99.2 ? P_FROZEN : (m < 1 ? walkPose(t * 4) : P_CROUCH));
    w.monster.eyes(dark * (0.7 + 0.3 * Math.sin(t * 9)));
    const k = range(t, 98.75, 102.35);
    w.setCam(lerp3([1.2, 2, 27], [1.6, 1.6, 25], k), [0, lerp(22, 26, k), 0], lerp(52, 44, k));
    w.shake(0.05 + 0.08 * Math.max(0, Math.sin(t * 7)), t, 6); // battements de cœur
    s.vignette = 1.8;
  } },
  // 102.54 « A blood-curdling scream shattered the silence. »
  { at: 102.35, name: 'Un cri', run(w, t, s) {
    s.ambient = 0.2; s.exposure = 0.6;
    const g = w.guards[GRAB_GUARD], [gx, gz] = EMERG[GRAB_GUARD];
    // le garde est arraché vers le haut, sa lampe tombe
    const yank = easeIn(range(t, 102.6, 102.95));
    g.root.visible = yank < 1; g.reset(); g.place(gx, gz, 0).face(0, 0); g.root.position.y = yank * 14; g.panic(t); g.setFace('scared');
    w.monster.eyes(0.8);
    const from = V(gx + 0.6, 4, gz), to = V(gx + 2.5, 0.55, gz + 2);
    flyLight(w.dropLight, w.dropLens, w.dropBeam, t, 102.62, 103.3, from, to, { spin: 6, on: 1, height: 1.5 });
    if (t > 103.3) { w.dropLight.rotation.y += (t - 103.3) * 0.6; }
    w.key.position.set(gx + 6, 6, gz + 6); w.key.target.position.set(gx, 0.5, gz); w.key.intensity = 18;
    w.setCam(lerp3([gx + 7, 1.4, gz + 6], [gx + 6, 1.8, gz + 5], range(t, 102.35, 104.85)), [gx + 1.2, 1.2, gz + 1.2], 46);
    s.red = 0.35 * pulse(t, 102.7, 104.4, 0.2); w.shake(0.5 * pulse(t, 102.8, 104.3, 0.2), t, 30);
  } },
  // 104.92 « Everyone immediately pointed their lights back at it. »
  { at: 104.85, name: 'Toutes les lumières reviennent', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'shout' });
    w.kid.root.rotation.x = 1.45 * (1 - smooth(range(t, 105, 106.5))); w.kid.place(POST_KID[0], 20.4 + 2 * range(t, 105, 106.5), Math.PI); w.kid.root.rotation.x = 1.45 * (1 - smooth(range(t, 105, 106.5)));
    w.dad.setFlashlight(1);
    const mc = monsterChest(w);
    w.guards.forEach((g, i) => {
      if (i === GRAB_GUARD || i === SLIP_GUARD) return;
      const swing = seg(t, 105.2 + (i % 4) * 0.15, 105.9 + (i % 4) * 0.15);
      const [x, z] = EMERG[i]; g.root.visible = true; g.reset(); g.place(x, z, 0); aimAt(g, mc);
      g.armR.rotation.x = lerp(-0.25, g.armR.rotation.x, swing); g.armR.rotation.y = lerp((i % 2 ? 1 : -1) * 0.8, 0, swing); g.setFlashlight(1);
    });
    aimAt(w.dad, mc); w.dad.armR.rotation.x = lerp(-0.4, w.dad.armR.rotation.x, seg(t, 105.1, 105.7));
    s.exposure = lerp(0.6, 1, range(t, 105.2, 106.4)); s.ambient = lerp(0.2, 1, range(t, 105.2, 106.4));
    const k = range(t, 104.85, 107.4);
    w.setCam(lerp3([-8, 2.6, -15], [-9, 3.2, -13], k), lerp3([-20, 4, -2], [-16, 9, 6], easeInOut(range(t, 105.3, 107.2))), 50);
    w.key.position.set(-10, 8, -14); w.key.target.position.set(-20, 3, 0); w.key.intensity = 30;
  } },
  // 107.46 « The monster froze again, but something was terribly wrong. »
  { at: 107.4, name: 'Il se fige à nouveau… mais', run(w, t, s) {
    const h = w.monster.head.getWorldPosition(new THREE.Vector3()).add(V(0, 3, 0));
    const k = easeInOut(range(t, 107.4, 111));
    w.setCam([h.x + lerp(9, 6, k), h.y - 4 + k, h.z + lerp(16, 10, k)], [h.x, h.y, h.z], 40, 0.06 * k);
    s.vignette = 1.5; w.monster.eyes(0.1); underlight(w);
  } },
  // 111.08 « It was no longer standing in the middle of the square. »
  { at: 111.0, name: 'Le centre est vide', run(w, t, s) {
    const k = range(t, 111, 113.0);
    w.setCam(lerp3([-26, 50, -3], [-23, 46, -3], k), [0, 0, -3], 34);
    s.label = { text: '', a: 0 };
  } },
  // 113.06 « It was right in front of us, » 114.96 « and in its enormous hand »
  { at: 113.0, name: 'Juste devant nous', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' }); w.dad.setFlashlight(1); w.kid.setFlashlight(1); aimAt(w.dad, monsterChest(w)); aimAt(w.kid, monsterChest(w));
    w.kid.place(POST_KID[0], 23.5, Math.PI); aimAt(w.kid, monsterChest(w));
    const tilt = easeInOut(range(t, 113.4, 115.4));
    w.setCam([1.2, lerp(4.8, 3.2, tilt), 34], lerp3([0, 4.5, 24], [0, 22, 14], tilt), lerp(42, 60, tilt));
    w.shake(0.12 * pulse(t, 114.0, 115.6, 0.3), t, 10); underlight(w, tilt);
  } },
  // 116.86 « was one of our guards, still breathing. »
  { at: 116.6, name: 'Un garde dans sa main', run(w, t, s) {
    const hp = w.guards[GRAB_GUARD].root.getWorldPosition(new THREE.Vector3());
    const k = easeInOut(range(t, 116.6, 119.9));
    hp.y += 3.2;
    w.setCam([hp.x + lerp(9, 6.5, k), hp.y + lerp(-2.5, -1.2, k), hp.z + lerp(12, 9, k)], [hp.x, hp.y + 1.2, hp.z], 48);
    w.key.position.set(hp.x + 5, hp.y - 3, hp.z + 9); w.key.target.position.copy(hp); w.key.intensity = 45;
  } },
  // 120.10 « Dad! We have to save him! »
  { at: 119.9, name: '« Papa ! Il faut le sauver ! »', run(w, t, s) {
    atPost(w, t, { kidFace: 'shout', dadFace: 'worried', lookMonster: false });
    w.kid.place(POST_KID[0], 24.2, 0).face(POST_DAD[0] - 1, POST_DAD[1] + 2);
    w.kid.armL.rotation.set(-1.6 + Math.sin(t * 8) * 0.15, 0.4, 0); w.kid.neck.rotation.x = -0.1;
    w.dad.setFlashlight(1); aimAt(w.dad, monsterChest(w));
    portrait(w, w.kid, { dist: 5.5, side: 0.3, h: 0.3, fov: 42, push: 1.5 * easeOut(range(t, 119.9, 121)), light: 1.2 });
    w.shake(0.05, t, 20);
  } },
  // 122.44 « But Dad grabbed my arm and whispered, » 124.38 « Don't move! »
  { at: 122.25, name: '« Ne bouge pas ! »', run(w, t, s) {
    atPost(w, t, { kidFace: 'scared', dadFace: 'serious', lookMonster: false });
    w.kid.place(POST_KID[0], 24.2, 0).face(POST_DAD[0], POST_DAD[1]);
    w.dad.face(POST_KID[0], 24.2); w.dad.setFlashlight(0);
    const grab = seg(t, 122.8, 123.3);
    w.dad.armL.rotation.set(lerp(-0.05, -1.35, grab), lerp(0, -0.35, grab), 0);
    w.kid.armR.rotation.set(lerp(0, -0.6, grab), 0, 0);
    if (t < 124.2) {
      const k = range(t, 122.25, 124.2);
      w.setCam(lerp3([5.5, 5.4, 22.2], [5, 5.2, 22.8], k), [-1.2, 4.1, 25.0], 42);
      w.key.position.set(5, 9, 22); w.key.target.position.set(-2.2, 4.5, 25.2); w.key.intensity = 30;
    } else {
      portrait(w, w.dad, { dist: 5.5, side: 0.3, h: 0.2, fov: 40, push: 2.4 * easeOut(range(t, 124.2, 125.4)), light: 1.2 });
      w.dad.neck.rotation.x = 0.05;
    }
  } },
  // 125.74 « I couldn't understand why. » 127.38 « Then he pointed at the monster and said, »
  { at: 125.6, name: 'Il pointe le monstre', run(w, t, s) {
    atPost(w, t, { kidFace: 'worried', dadFace: 'serious', lookMonster: false });
    w.kid.place(POST_KID[0], 24.2, 0).face(POST_DAD[0], POST_DAD[1]);
    if (t < 127.3) {
      w.dad.face(POST_KID[0], 24.2);
      w.kid.neck.rotation.y = Math.sin(t * 2) * 0.12;
      portrait(w, w.kid, { dist: 5, side: -0.3, h: 0.3, fov: 40, push: 0.8 * range(t, 125.6, 127.3) });
    } else {
      const head = w.monster.head.getWorldPosition(new THREE.Vector3());
      aimAt(w.dad, head); w.dad.armR.rotation.x -= 0.15;
      w.kid.face(head.x, head.z); w.kid.neck.rotation.x = -0.5;
      const pt = seg(t, 127.5, 128.0);
      w.dad.armR.rotation.x = lerp(0, w.dad.armR.rotation.x, pt);
      const k = easeInOut(range(t, 127.9, 129.25));
      w.setCam(lerp3([-4.5, 4.2, 30.5], [-4, 5, 31], k), lerp3([-1.5, 5.5, 23], [head.x, head.y + 2, head.z], k), lerp(44, 52, k));
      underlight(w, 0.8);
    }
  } },
  // 129.34 « Because if those lights go out again, he's already dead. »
  { at: 129.25, name: 'Final', run(w, t, s) {
    const h = w.monster.head.getWorldPosition(new THREE.Vector3()).add(V(0, 3, 0));
    const k = easeInOut(range(t, 129.25, 131.9));
    w.setCam(lerp3([h.x + 1, h.y - 6, h.z + 22], [h.x + 0.3, h.y - 1, h.z + 9.5], k), [h.x, h.y, h.z], lerp(46, 34, k));
    // les lumières vacillent... noir.
    const fl = t > 131.25 ? (t > 131.95 ? 0 : (Math.floor(t * 18) % 2)) : 1;
    underlight(w, fl);
    w.towers.forEach((tw, i) => i && tw.set(fl * 0.8, false, '#ffc9a8'));
    w.guards.forEach(g => g.setFlashlight(fl));
    s.ambient = fl ? 1 : 0.15; s.exposure = fl ? 1 : 0.5;
    w.monster.eyes(fl ? 0 : 1);
    if (t > 131.95) s.fade = range(t, 132.1, 132.6) * 0.9 + 0.1;
    if (t > 131.95) { w.monster.eyes(1); s.ambient = 0.05; }
  } },
];

// Préréglage d'ambiance par défaut selon l'heure de l'histoire
function defaultEnv(t) {
  const s = { preset: ['night', 'night', 0], night: 1, time: t, bloom: 0.75, flash: 0, fade: 0, sepia: 0, red: 0, ambient: 1, exposure: 1, sat: 1.12, vignette: 1, bolt: 0, label: null, clock: null, counter: null };
  if (t >= 14.1 && t < 28.6) { s.preset = ['day', 'day', 0]; s.night = 0; s.bloom = 0.35; }
  if (t >= 75.64) { s.preset = ['night', 'black', clamp((t - 75.64) / 1.2)]; s.ambient = 0.7; }
  if (t >= 81.0) { s.preset = ['black', 'storm', clamp((t - 81.5) / 1.5)]; }
  return s;
}

// Éclairs (instants) — orage à partir de 82.6
const STRIKES = [[82.58, 1], [83.05, 0.6], [86.9, 0.7], [92.3, 0.8], [96.0, 0.5], [100.42, 1], [103.2, 0.9], [109.9, 0.6], [115.0, 0.7], [121.4, 0.6], [126.9, 0.5], [131.6, 0.8]];
function lightningAt(t) {
  let v = 0, idx = -1;
  STRIKES.forEach(([ts, a], i) => { const e = t - ts; if (e >= 0 && e < 0.5) { const f = a * (e < 0.06 ? 1 : e < 0.12 ? 0.3 : e < 0.2 ? 0.8 : Math.max(0, 1 - e / 0.5) * 0.5); if (f > v) { v = f; idx = i; } } });
  return [v, idx];
}

export function shotAt(t) { let i = 0; while (i + 1 < SHOTS.length && t >= SHOTS[i + 1].at) i++; return i; }

export function applyStory(w, t) {
  const s = defaultEnv(t);
  base(w, t, s);
  const i = shotAt(t);
  SHOTS[i].run(w, t, s);
  // orage
  const [b, idx] = lightningAt(t);
  if (t > 82 && b > 0) {
    s.bolt = b;
    const sd = 7 + idx, a = idx * 1.7;
    w.lightning.show(sd, V(Math.sin(a) * 160, 260, -Math.abs(Math.cos(a)) * 200 - 60), V(Math.sin(a) * 150, 0, -Math.abs(Math.cos(a)) * 190 - 60), b);
  }
  w.rain.update(t, w.camera, s.rain);
  w.monster.root.updateMatrixWorld(true);
  return s;
}
