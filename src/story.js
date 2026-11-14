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

// vraie foulée : jambes, genoux, contre-balancement des bras, tête, rebond du bassin
function stride(ph, { base = P_REACH, amp = 1, headYaw = 0, headPitch = null } = {}) {
  const sn = Math.sin(ph), cs = Math.cos(ph);
  return { ...base, lean: base.lean + 0.06 * Math.abs(cs), twist: sn * 0.12 * amp, side: cs * 0.04 * amp,
    head: [headPitch ?? base.head[0], headYaw + sn * 0.08, -sn * 0.05],
    legL: [sn * 0.55 * amp - 0.1, -0.08, Math.max(0, -sn) * 0.9 * amp + 0.1], legR: [-sn * 0.55 * amp - 0.1, 0.08, Math.max(0, sn) * 0.9 * amp + 0.1],
    armL: [base.armL[0] - sn * 0.35 * amp, base.armL[1], base.armL[2], base.armL[3]], armR: [base.armR[0] + sn * 0.35 * amp, base.armR[1], base.armR[2], base.armR[3]] };
}
// le monstre marche de `from` à `to` entre t0 et t1 (position, orientation, foulée liée à la distance)
function monsterWalk(M, t, t0, t1, from, to, opt = {}) {
  const k = (opt.ease || easeInOut)(range(t, t0, t1));
  const x = lerp(from[0], to[0], k), z = lerp(from[1], to[1], k);
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]) * k;
  const ph = dist / (opt.step || 6) * Math.PI + (opt.phase || 0);
  M.root.position.set(x, -Math.abs(Math.sin(ph)) * 0.8, z);
  M.root.rotation.y = opt.heading ?? Math.atan2(to[0] - from[0], to[1] - from[1]);
  const moving = t > t0 && t < t1;
  M.setPose(moving || opt.hold ? stride(ph, opt) : (opt.rest || P_FROZEN));
  return ph;
}
// IK : trouve la pose du bras droit qui amène le bout des griffes sur `target` (descente par coordonnées, mise en cache)
const ikCache = new Map();
function reachPose(M, basePose, target, side = 'R') {
  const key = side + target.toArray().map(v => v.toFixed(1)).join(',') + M.root.position.toArray().map(v => v.toFixed(1)).join(',');
  if (ikCache.has(key)) return ikCache.get(key);
  const arm = 'arm' + side, p = { ...basePose, [arm]: [...basePose[arm]] };
  const tip = M.arm[side].fingers[1].tip, v = new THREE.Vector3();
  const err = () => { M.setPose(p); M.root.updateMatrixWorld(true); return tip.getWorldPosition(v).distanceTo(target); };
  let best = err(), stepSize = 0.4;
  for (let it = 0; it < 60 && best > 0.3; it++) {
    let improved = false;
    for (let j = 0; j < 4; j++) for (const d of [stepSize, -stepSize]) {
      p[arm][j] += d; const e = err();
      if (e < best) { best = e; improved = true; } else p[arm][j] -= d;
    }
    if (!improved) stepSize *= 0.5;
    if (stepSize < 0.005) break;
  }
  const out = { ...p, [arm]: [...p[arm]] }; ikCache.set(key, out); M.setPose(basePose);
  return out;
}
// caméra « à l'épaule » : légère dérive permanente
function handheld(w, t, a = 1) {
  const c = w.camera; c.position.x += noise1(t * 0.6, 11) * 0.12 * a; c.position.y += noise1(t * 0.5, 12) * 0.08 * a;
  c.rotation.z += noise1(t * 0.4, 13) * 0.008 * a; c.rotation.x += noise1(t * 0.45, 14) * 0.006 * a;
}

// ---------- Positions de référence ----------
const POST_DAD = [-2.2, 25.2], POST_KID = [1.6, 25.8];
const MONSTER_FRONT = [0, 0, 9];
const SLIP_GUARD = 3, GRAB_GUARD = 7, CABLE_GUARD = 11;
const EMERG = Array.from({ length: 12 }, (_, i) => {
  // positions d'urgence : anneau autour de la clôture, en laissant le poste du père libre
  const a = (i / 12) * TAU + 0.28; return [Math.sin(a) * 21, Math.cos(a) * 21];
});
EMERG[SLIP_GUARD] = [9.5, 19.2];
EMERG[GRAB_GUARD] = [5.0, 17.6];
const HELP_GUARD = 2;
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
  g.place(x, z, 0).face(0, 0).idle(t + i * 1.7, 0.8);
  if (aim > 0) {
    aimAt(g, monsterChest(w)); g.armR.rotation.x = lerp(-0.3, g.armR.rotation.x, aim); g.setFlashlight(1);
    // la torche tremble / balaie légèrement, le garde surveille autour de lui
    g.armR.rotation.x += noise1(t * 0.7, i) * 0.07; g.armR.rotation.y = noise1(t * 0.5, i + 9) * 0.1;
    g.armL.rotation.x = -0.5 + noise1(t * 0.4, i + 3) * 0.15;
  }
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
  if (t > 86.2) helpFallen(w, t);
  // le monstre, après le noir, est juste devant le poste
  if (t > 99.6) { M.root.position.set(...MONSTER_FRONT); M.setPose(P_CROUCH); w.fence.visible = true; }
  if (t > 103.6) holdGuard(w, t);
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

// un collègue court aider le garde tombé, s'accroupit, puis reprend son poste
function helpFallen(w, t) {
  const g = w.guards[HELP_GUARD], from = EMERG[HELP_GUARD], to = [12.2, 18.2], back = t > 98.5;
  const k = back ? 1 - smooth(range(t, 98.5, 99.6)) : smooth(range(t, 86.2, 87.9));
  g.reset(); g.place(lerp(from[0], to[0], k), lerp(from[1], to[1], k), 0);
  if ((t < 87.9 && !back) || (back && t < 99.6)) { g.face(back ? from[0] : to[0], back ? from[1] : to[1]); g.run(t * 12); }
  else if (!back) { g.face(EMERG[SLIP_GUARD][0], EMERG[SLIP_GUARD][1]); g.crouch(smooth(range(t, 87.9, 88.3))); g.armL.rotation.x = -1.2; g.setFace('worried'); }
  else standEmergency(w, t, HELP_GUARD, 1);
  g.setFlashlight(1);
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
  const fr = t < 106 ? 2.2 : 1; // il se débat plus fort juste après la capture
  g.armL.rotation.set(-3.0 + Math.sin(t * 2.4 * fr) * 0.08 * fr, 0, 0.15); g.armR.rotation.set(-3.0 + Math.cos(t * 2.2 * fr) * 0.08 * fr, 0, -0.15);
  g.legL.rotation.x = 0.25 + Math.sin(t * 2.6 * fr) * 0.35 * fr; g.legR.rotation.x = -0.15 + Math.sin(t * 2.6 * fr + 2) * 0.35 * fr;
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
  w.dad.place(...POST_DAD, Math.PI).idle(t, 0.8);
  w.kid.place(...POST_KID, Math.PI).idle(t * 1.3 + 1, 1.1);
  if (lookMonster) { w.dad.face(0, 0); w.kid.face(0, 0); w.dad.neck.rotation.x = -0.25 + Math.sin(t * 0.6) * 0.06; w.kid.neck.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.08; }
  // réactions à l'orage : sursaut à chaque éclair
  const b = lightningAt(t)[0];
  if (b > 0.3) { w.kid.flinch(Math.min(1, b * 1.4)); w.dad.neck.rotation.x += b * 0.2; }
  if (t > 77) w.kid.shiver(t, 0.8);
  w.kid.setFace(kidFace); w.dad.setFace(dadFace);
}

// passants qui traversent la place en journée (la vie continue autour du monstre figé)
function crowd(w, t) {
  const paths = [[[-45, 40], [45, 42]], [[44, -38], [-44, -40]], [[-40, -46], [-38, 46]], [[40, 46], [42, -44]]];
  [3, 4, 5, 6].forEach((ci, j) => {
    const c = w.civilians[ci], [a, b] = paths[j], k = ((t * 0.035 + j * 0.27) % 1);
    c.root.visible = true; c.reset(); c.place(lerp(a[0], b[0], k), lerp(a[1], b[1], k), 0).face(b[0], b[1]).walk(t * 5.5 + j, 0.6);
    c.neck.rotation.y = Math.sin(t * 0.8 + j) * 0.5; c.setFace(j % 2 ? 'smile' : 'worried');
  });
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
    w.setCam(lerp3([5, 3, 26], [3, 6.5, 21], easeInOut(k)), [0, 35, 2], lerp(58, 46, k));
    // à « one second » : tout s'éteint une seconde… et le monstre BOUGE (un pas, la tête se tourne vers nous, le bras se lève)
    const off = t > 5.7 && t < 6.75;
    const flick = off ? 0 : (t > 5.5 && t < 5.7 ? (Math.floor(t * 30) % 2) : 1);
    w.towers.forEach(tw => tw.set(flick));
    w.guards.forEach(g => g.setFlashlight(flick));
    s.ambient = flick ? 1 : 0.3; s.night = 1;
    w.monster.eyes(off ? 1 : 0);
    const m = smooth(range(t, 5.75, 6.7));
    const target = { ...P_REACH, head: [0.25, -0.45, -0.12], armR: [-1.7, 0.1, 0.35, -0.3], curlR: 0 };
    const ph = m * Math.PI * 1.5;
    const pose = mixPose(P_FROZEN, target, m);
    if (m > 0 && m < 1) { const st = stride(ph, { base: pose, amp: 0.8 }); w.monster.setPose({ ...st, head: pose.head, armR: pose.armR }); }
    else w.monster.setPose(pose);
    w.monster.root.position.z = 2.5 * m;
    if (off) w.shake(0.15, t);
    if (t > 6.7) w.shake(0.35 * (1 - range(t, 6.7, 7.4)), t);
    // les gardes sursautent au retour de la lumière
    if (t > 6.75) w.guards.forEach((g, i) => g.flinch(0.6 * (1 - range(t, 6.8 + (i % 3) * 0.1, 7.6))));
  } },
  // 8.48 « Three years ago, it appeared in the middle of our town. »
  { at: 8.3, name: 'Flash-back – apparition', run(w, t, s) {

    s.sepia = 0.55; s.label = { text: '3 YEARS AGO', a: pulse(t, 8.4, 11.3, 0.25) };
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    const rise = easeOut(range(t, 9.3, 10.6));
    w.monster.root.position.y = lerp(-44, 0, rise);
    // il surgit, lève les bras (rugissement), puis tourne la tête vers les passants et tend la main
    const roar = smooth(range(t, 9.6, 10.3)) * (1 - smooth(range(t, 10.6, 11.1)));
    const ROAR = { ...P_REST, lean: -0.1, head: [-0.5, 0, 0], armL: [-2.5, 0, -0.7, -0.4], armR: [-2.5, 0, 0.7, -0.4], curlL: 0, curlR: 0 };
    const look = smooth(range(t, 10.6, 11.3));
    let pose = mixPose(P_REST, ROAR, roar);
    pose = mixPose(pose, { ...P_REACH, head: [0.4, 0.5, 0.1], twist: 0.25 }, look);
    w.monster.setPose(pose);
    w.monster.spine.rotation.z += Math.sin(t * 25) * 0.03 * roar;
    w.monster.eyes(0.6 + 0.4 * roar);
    w.rubble.visible = true; w.rubble.scale.setScalar(lerp(0.2, 1, rise)); w.rubble.position.y = Math.sin(rise * Math.PI) * 4;
    // des passants regardent, puis s'enfuient en courant
    show(w.civilians, true);
    w.civilians.forEach((c, i) => {
      const a = i * 0.9 + 0.3, r0 = 15 + i * 2.2, run = range(t, 9.5 + i * 0.07, 11.3);
      const r = r0 + run * 17;
      c.place(Math.sin(a) * r, Math.cos(a) * r, a);
      if (run > 0) { c.run(t * 12 + i); c.setFace('scared'); if (i % 2) { c.armL.rotation.x = -2.6; } c.neck.rotation.y = Math.sin(t * 5 + i) * 0.5; }
      else { c.face(0, 0); c.idle(t + i); c.setFace('smile'); if (t > 9.3) { c.flinch(seg(t, 9.3, 9.5)); c.setFace('scared'); } }
    });
    const k = range(t, 8.3, 11.3);
    w.setCam(lerp3([10, 4, 62], [6, 9, 50], easeOut(k)), [0, lerp(8, 24, rise), 0], lerp(54, 48, k));
    if (t > 9.3) w.shake(0.6 * (1 - range(t, 10.6, 11.3)) + 0.3 * roar, t, 22);
    s.flash = 0.6 * (1 - range(t, 8.3, 8.55));
  } },
  // 11.52 « By sunrise, seven people had vanished. »
  { at: 11.3, name: 'Flash-back – disparitions', run(w, t, s) {

    s.sepia = 0.55; s.label = { text: '3 YEARS AGO', a: 1 - range(t, 13.6, 14.1) };
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    show(w.civilians, true);
    // 7 personnes ; chaque coupure de lumière en fait disparaître une, le monstre avance vers elles
    const flick = [12.0, 12.35, 12.7, 13.0, 13.25, 13.5, 13.75];
    let blk = 0;
    const n = flick.filter(f => t > f + 0.06).length;
    w.civilians.forEach((c, i) => {
      // ils reculent, regardent partout ; à partir de 3 disparus les autres paniquent
      const back = range(t, 11.3, 14.1) * 3;
      c.place(-13 + i * 4.2, 47 + (i % 2) * 1.5 + back, Math.PI);
      if (n >= 3) { c.run(t * 10 + i, 0.6); c.panic(t + i); } else { c.walk(t * 3 + i, 0.25); c.armL.rotation.x = -0.6; }
      c.setFace('scared'); c.neck.rotation.y = Math.sin(t * 3.3 + i * 2) * 0.6;
      if (t > flick[i] + 0.06) c.root.visible = false;
      if (t > flick[i] && t < flick[i] + 0.13) blk = 1;
    });
    s.fade = blk * 0.92;
    const ph = monsterWalk(w.monster, t, 11.3, 14.1, [0, 0], [-3, 26], { step: 7, ease: k => k, hold: true, headYaw: Math.sin(t * 2.2) * 0.4, headPitch: 0.45 });
    // à chaque disparition, la main droite se tend brusquement
    const grab = Math.max(...flick.map(f => pulse(t, f - 0.1, f + 0.3, 0.12)));
    if (grab > 0) { const p = w.monster.pose; w.monster.setPose({ ...p, armR: lerp3(p.armR, [-1.5, 0, 0.1], grab).concat([lerp(p.armR[3], -0.1, grab)]), curlR: grab }); }
    w.monster.eyes(0.8);
    w.setCam(lerp3([16, 5, 70], [10, 6, 66], range(t, 11.3, 14.1)), [-2, lerp(13, 17, range(t, 11.3, 14.1)), 30], 58);
    s.counter = { n: n, a: range(t, 11.9, 12.1) * (1 - range(t, 13.9, 14.1)) };
  } },
  // 14.34 « But something strange happened when daylight touched its body. » 17.70 « It froze completely. »
  { at: 14.1, name: 'Le lever du soleil fige le monstre', run(w, t, s) {

    const d1 = smooth(range(t, 14.1, 16.3)), d2 = smooth(range(t, 15.6, 17.6));
    s.preset = d2 > 0 ? ['dawn', 'day', d2] : ['night', 'dawn', d1]; s.night = 1 - d1;
    s.sepia = 0.25 * (1 - d1);
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    setCityLights(w, t, 1 - d1);
    // le monstre marche vers un passant tombé, tête basse, main tendue… et se fige net à 17.72 en pleine foulée
    const tt = Math.min(t, 17.72), freeze = t >= 17.72;
    const reach = smooth(range(tt, 14.1, 17.6));
    const base = mixPose(P_FROZEN, P_REACH, reach);
    monsterWalk(w.monster, tt, 14.1, 17.9, [0, -6], [0, 4.5], { step: 6.5, ease: k => k, hold: true, base, headPitch: lerp(0.2, 0.55, reach), headYaw: Math.sin(tt * 1.6) * 0.15 });
    // le passant rampe à reculons
    const v = w.civilians[0]; v.root.visible = true; v.setFace('scared');
    const crawl = Math.min(t, 17.72);
    v.place(3, 19 + range(crawl, 14.1, 17.72) * 4, Math.PI);
    v.root.rotation.x = -0.5; v.root.position.y = 0.4;
    v.legL.rotation.x = -1.4 + Math.sin(crawl * 7) * 0.25; v.legR.rotation.x = -1.2 - Math.sin(crawl * 7) * 0.25;
    v.armL.rotation.x = -2.2 + (freeze ? 0 : Math.sin(t * 9) * 0.2); v.armR.rotation.x = -0.4 + Math.cos(crawl * 7) * 0.3;
    v.neck.rotation.y = freeze ? Math.sin(t * 2) * 0.3 : 0;
    const zoom = freeze ? easeOut(range(t, 17.72, 18.1)) : 0;
    w.setCam(lerp3([14, 5, 52], [9, 6, 40], easeInOut(range(t, 14.1, 17.7))), [0, lerp(18, 27, zoom), 3], lerp(52, 32, zoom));
    if (!freeze) w.shake(0.12 * Math.abs(Math.sin(w.monster.pose.twist * 8)), t, 8); // chaque pas fait trembler le sol
    if (freeze) { s.flash = 0.45 * (1 - range(t, 17.72, 18.2)); s.sat = lerp(0.4, 1.1, range(t, 17.8, 18.9)); w.shake(0.25 * (1 - range(t, 17.72, 18.3)), t); }
  } },
  // 19.28 « That's when we discovered its only weakness. » 21.82 « Light. »
  { at: 19.0, name: 'Sa seule faiblesse : la lumière', run(w, t, s) {

    s.preset = ['day', 'day', 0]; s.night = 0;
    w.towers.forEach(tw => (tw.root.visible = false)); w.fence.visible = false; show(w.guards, false); w.cable.visible = false; w.panel.visible = false; w.cars.forEach(c => (c.root.visible = false));
    w.monster.root.position.z = 4.5; w.monster.setPose({ ...P_REACH, head: [0.55, 0.15, 0] });
    // deux scientifiques s'approchent prudemment ; à « Light » l'un braque une torche sur lui
    show([w.civilians[1], w.civilians[2]], true);
    [1, 2].forEach((i, j) => {
      const c = w.civilians[i], k = range(t, 19, 21.3), z = lerp(38, 26, k);
      c.place(-4 + j * 7, z, Math.PI).setFace('worried');
      if (k < 1) c.walk(t * 4.5 + j, 0.4); else c.idle(t);
      c.neck.rotation.x = -0.45; c.neck.rotation.y = Math.sin(t * 1.5 + j) * 0.2;
    });
    const up = seg(t, 21.5, 21.85);
    const c1 = w.civilians[1]; c1.setFlashlight(up); c1.aim('R', lerp(0.9, -0.55, up));
    const c2 = w.civilians[2]; c2.aim('L', lerp(1.2, -0.7, seg(t, 20.2, 20.7)));
    crowd(w, t);
    const a = lerp(-0.5, 0.35, easeInOut(range(t, 19, 22.5)));
    const flash = t > 21.82 ? 1 - range(t, 21.82, 22.4) : 0;
    w.setCam([Math.sin(a) * 26, lerp(14, 20, range(t, 19, 22.5)), 4.5 + Math.cos(a) * 26], [0, 30, 4.5], lerp(50, 40, flash > 0 ? 1 : 0));
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
    crowd(w, t);
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
    const z = lerp(46, 27.5, range(t, 38.4, 43.4));
    w.dad.place(-2.2, z, Math.PI).walk(t * 5, 0.6); w.kid.place(1.4, z + 0.6, Math.PI).walk(t * 6.2, 0.75);
    w.dad.setFace('serious'); w.kid.setFace('smile');
    // le père tourne la tête vers son fils en parlant, le fils sautille de joie à « first time »
    w.dad.neck.rotation.y = -0.45 * pulse(t, 38.7, 40.3, 0.3);
    w.kid.neck.rotation.y = 0.4 * pulse(t, 39.2, 40.4, 0.3);
    if (t > 40.6 && t < 41.5) { const j = Math.sin(range(t, 40.6, 41.3) * Math.PI); w.kid.body.position.y += j * 1.5; w.kid.armL.rotation.x = w.kid.armR.rotation.x = -2.8 * j; w.kid.setFace('shout'); }
    w.dad.setFlashlight(1); w.dad.armR.rotation.x = -0.9; w.kid.setFlashlight(1); w.kid.armR.rotation.x = -0.9;
    // en arrivant, le père montre le monstre ; le garçon lève les yeux
    const pt = seg(t, 41.6, 42.1) * (1 - seg(t, 43.0, 43.5));
    w.dad.armL.rotation.set(lerp(w.dad.armL.rotation.x, -2.4, pt), 0, 0);
    w.kid.neck.rotation.x = -0.5 * seg(t, 41.8, 42.4);
    if (t < 40.8) { // travelling arrière devant eux
      w.setCam([1.8, 5.6, z - 12.5 + range(t, 38.4, 40.8) * 1.5], [-0.3, 4.0, z], 46); w.key.position.set(2, 9, z - 10); w.key.target.position.set(0, 4, z); w.key.intensity = 40;
    } else { // grue par-dessus l'épaule : révélation du monstre
      const k = easeInOut(range(t, 40.8, 43.6));
      w.setCam([lerp(-5, 4, k), lerp(6.5, 12, k), z + lerp(11, 15, k)], [0, lerp(8, 24, k), 0], 52);
    }
  } },
  // 43.76 « Everything was quiet until 2 a.m. »
  { at: 43.6, name: '2 heures du matin', run(w, t, s) {

    atPost(w, t, { kidFace: 'smile' });
    // nuit calme : le garçon s'étire et bâille, le père regarde sa montre
    const yawn = pulse(t, 43.9, 45.0, 0.3);
    w.kid.armL.rotation.set(-2.9 * yawn, 0, -0.3 * yawn); w.kid.armR.rotation.set(-2.9 * yawn, 0, 0.3 * yawn); w.kid.hip.rotation.x = -0.15 * yawn;
    if (yawn > 0.5) w.kid.setFace('scared');
    w.kid.setFlashlight(1 - yawn);
    const watch = pulse(t, 44.7, 45.9, 0.25);
    w.dad.armL.rotation.set(-1.5 * watch, 0.9 * watch, 0); w.dad.neck.rotation.x = -0.25 + 0.55 * watch; w.dad.neck.rotation.y = -0.3 * watch;
    w.dad.setFlashlight(1); aimAt(w.dad, V(0, 4, 0));
    const k = range(t, 43.6, 46.05);
    w.setCam(lerp3([-10, 24, 62], [-3, 12, 40], easeInOut(k)), lerp3([0, 14, 4], [0, 5, 25], easeInOut(k)), lerp(50, 46, k));
    s.clock = { text: '2:00 AM', a: range(t, 44.8, 45.1) * (1 - range(t, 45.9, 46.05)) };
  } },
  // 46.18 « Boom! » 47.38 « One of the massive floodlights exploded. »
  { at: 46.05, name: 'BOOM – un projecteur explose', run(w, t, s) {

    atPost(w, t, { kidFace: t > 46.25 ? 'scared' : 'smile', dadFace: t > 46.25 ? 'worried' : 'serious' });
    w.kid.setFlashlight(1); w.dad.setFlashlight(1);
    const tw = w.towers[0], lens = tw.lensWorld;
    const e = t - 46.18;
    // le souffle projette le garçon au sol ; le père se baisse et le protège de son bras
    const fall = easeOut(range(t, 46.22, 46.6));
    if (t > 46.2) {
      const hd = Math.atan2(lens.x - POST_KID[0], lens.z - POST_KID[1]);
      w.kid.place(POST_KID[0] - 0.8 * fall, POST_KID[1] + 1.2 * fall, hd, 0.5 * fall); w.kid.root.rotation.x = -1.35 * fall;
      w.kid.legL.rotation.x = -1.3 * fall; w.kid.legR.rotation.x = -0.9 * fall; w.kid.flinch(fall);
      w.dad.face(lens.x, lens.z); w.dad.crouch(seg(t, 46.2, 46.45) * (1 - seg(t, 47.6, 48.4)));
      w.dad.armR.rotation.set(-1.6, -0.6, 0); w.dad.neck.rotation.x = -0.5;
    }
    w.sparks.sparks(t, 46.18, lens, { speed: 20, life: 2.4 });
    w.glass.sparks(t, 46.2, lens, { speed: 8, life: 3, gravity: 18 });
    w.blast.position.copy(lens); w.blast.intensity = e > 0 ? 3000 * Math.max(0, 1 - e / 0.9) : 0;
    if (e > 0) { s.flash = 0.75 * Math.max(0, 1 - e / 0.35); w.smoke.smoke(t, lens, { rate: 0.6, height: 16, spread: 3, on: Math.min(1, e) }); }
    // les gardes les plus proches courent vers la tour
    [0, 1, 11].forEach((gi, j) => { const g = w.guards[gi]; if (t > 46.5) { const k = range(t, 46.5 + j * 0.1, 49.4); const p = g.root.position; g.reset(); g.place(lerp(p.x, 12.5 + j * 1.5, k), lerp(p.z, 23 - j, k), 0).face(15, 26).run(t * 12 + j); g.setFlashlight(1); g.aim('R', -0.6); g.setFace('shout'); } });
    if (t < 47.3) {
      const whip = easeInOut(range(t, 46.15, 46.45));
      const tgt = lerp3([0, 5, 25], [lens.x, lens.y - 2, lens.z], whip);
      w.setCam([-6, 4.5, 37], tgt, lerp(46, 34, whip));
      w.shake(e > 0 ? 1.4 * Math.max(0, 1 - e / 1.1) : 0, t, 25);
    } else { // zoom progressif sur le projecteur éventré
      const k = easeInOut(range(t, 47.3, 49.45));
      w.setCam(lerp3([-2, 26, 46], [6, 32, 37], k), [lens.x, lens.y - 1, lens.z], lerp(40, 26, k));
      w.shake(0.12, t);
    }
  } },
  // 49.66 « Dad stayed calm. » 50.96 « "We still have five," he said. »
  { at: 49.45, name: '« Il en reste cinq »', run(w, t, s) {

    atPost(w, t, { kidFace: 'scared', dadFace: 'serious', lookMonster: false });
    // le père aide son fils à se relever, puis lève la main : « cinq »
    const lift = smooth(range(t, 49.7, 50.7));
    w.kid.place(POST_KID[0] - 0.8, POST_KID[1] + 1.2, 0).face(POST_DAD[0], POST_DAD[1]);
    w.kid.root.rotation.x = -1.35 * (1 - lift); w.kid.root.position.y = 0.5 * (1 - lift);
    w.kid.legL.rotation.x = -1.3 * (1 - lift); w.kid.legR.rotation.x = -0.9 * (1 - lift);
    w.kid.armR.rotation.set(-1.4 * (1 - seg(t, 50.7, 51.1)), 0, 0);
    w.dad.face(POST_KID[0] - 0.8, POST_KID[1] + 1.2);
    w.dad.crouch(0.6 * (1 - lift)); w.dad.armR.rotation.set(lerp(-1.5, -0.6, seg(t, 50.7, 51.0)), 0, 0); w.dad.setFlashlight(0);
    if (t > 50.8) { w.dad.face(1, 40); }
    const up = seg(t, 50.9, 51.3) * (1 - seg(t, 52.4, 52.9));
    w.dad.armL.rotation.set(lerp(-0.05, -2.7, up), 0, lerp(-0.05, -0.25, up));
    w.dad.neck.rotation.y = Math.sin(t * 1.3) * 0.08;
    const k = easeInOut(range(t, 49.45, 52.9));
    w.setCam(lerp3([12, 4.4, 30], [6, 5.6, 32], k), lerp3([-0.8, 2.6, 26.2], [-2.2, 5, 25.4], k), lerp(46, 38, k));
    w.key.position.set(7, 9, 31); w.key.target.position.set(-1, 3.5, 26); w.key.intensity = 32;
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

    // le garde arrive en courant, s'accroupit près du câble qui crache des étincelles, et appelle à la radio
    const g = w.guards[CABLE_GUARD]; g.root.visible = true; g.reset();
    const k0 = smooth(range(t, 55.1, 56.4));
    g.place(lerp(-46, -39.2, k0), lerp(54, 50.4, k0), 0);
    if (k0 < 1) { g.face(-39.2, 50.4); g.run(t * 12); } else { g.face(-36.5, 47.6).idle(t); g.crouch(seg(t, 56.4, 56.8)); g.armL.rotation.set(-2.2, 0, 0.7); aimAt(g, V(-36.5, 0.3, 47.6)); }
    g.setFace('worried'); g.setFlashlight(1);
    if (t > 56.9) g.flinch(0.5 * pulse(t, 57.6, 58.2, 0.1));
    const dmg = V(-36.5, 0.6, 47.6);
    const cyc = Math.floor((t - 55.1) / 0.55), t0 = 55.1 + cyc * 0.55;
    w.cableSparks.sparks(t, t0, dmg, { speed: 9, life: 0.55, gravity: 30 });
    w.fill.color.set('#9fd0ff'); w.fill.position.copy(dmg).add(V(0, 1, 0)); w.fill.intensity = 60 * Math.max(0, 1 - (t - t0) / 0.3);
    const k = easeInOut(range(t, 55.1, 59.2));
    w.setCam(lerp3([-27, 2.6, 54], [-29.5, 3, 54.5], k), lerp3([-38, 2, 49.5], [-37.5, 2.2, 49], k), lerp(46, 40, k));
    w.key.position.set(-31, 8, 54); w.key.target.position.set(-38.5, 2, 50.2); w.key.intensity = 35;
  } },
  // 59.42 « The backup generators were overheating, too. »
  { at: 59.2, name: 'Les générateurs surchauffent', run(w, t, s) {

    const tw = w.towers[5], gp = tw.gen.root.getWorldPosition(new THREE.Vector3());
    w.towers.forEach(x => x.gen.heat(1, t));
    w.smoke.smoke(t, gp.clone().add(V(0, 2.5, 0)), { rate: 1.2, height: 10, spread: 2, on: 1 });
    const k = range(t, 59.2, 61.8);
    const dir = V(-Math.sin(tw.angle), 0, -Math.cos(tw.angle)), side = V(dir.z, 0, -dir.x);
    const cp = gp.clone().addScaledVector(dir, 6.5 - k * 2).addScaledVector(side, 3.5 - k * 1.5);
    // un garde arrive en courant et recule devant la chaleur
    const g = w.guards[10]; g.reset(); g.root.visible = true;
    const rk = smooth(range(t, 59.3, 60.6));
    const gpos = gp.clone().addScaledVector(side, lerp(-9, -2.2, rk)).addScaledVector(dir, 2.2);
    g.place(gpos.x, gpos.z, 0).face(gp.x, gp.z);
    if (rk < 1) g.run(t * 12); else { g.flinch(0.8 * pulse(t, 60.7, 61.8, 0.15)); g.setFace('scared'); }
    g.setFlashlight(1);
    w.fill.color.set('#ff2a10'); w.fill.position.copy(gp).addScaledVector(dir, 2).add(V(0, 3, 0)); w.fill.intensity = 25 * (Math.sin(t * 12) > 0 ? 1 : 0.2);
    w.setCam([cp.x, 2.6 + k, cp.z], [gp.x, 1.8, gp.z], lerp(48, 40, k));
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
    const from = V(gx - 0.5, 4.5, gz - 0.5), to = V(6.0, 0.55, 16.6);
    const sink = range(t, 87.1, 88.1);
    flyLight(w.dropLight, w.dropLens, w.dropBeam, t, 85.5, 86.5, from, to, { spin: 9, on: 1 - sink, height: 3.5 });
    if (t > 86.5) { w.dropLight.position.y = lerp(0.55, 0.1, sink); w.dropLight.rotation.z = -0.15; }
    w.key.position.set(13, 8, 12); w.key.target.position.set(gx, 1.5, gz); w.key.intensity = 35;
    if (t < 86.0) {
      w.setCam(lerp3([15, 2.6, 12.5], [14.5, 3, 13.5], range(t, 83.95, 86)), [gx, 2.6, gz], 46);
    } else {
      w.setCam(lerp3([2.5, 3.6, 22.5], [3.2, 2.4, 21.2], range(t, 86, 88.75)), [6.0, 0.4, 16.6], 40);
      w.guards[0].root.visible = false; w.guards[GRAB_GUARD].root.visible = false;
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
    w.guards.forEach((g, i) => { if (i === SLIP_GUARD || i === HELP_GUARD) return; g.setFlashlight(1); g.armR.rotation.x = -0.25; g.armR.rotation.y = (i % 2 ? 1 : -1) * 0.8 + Math.sin(t * 2 + i) * 0.3; g.neck.rotation.y = Math.sin(t * 3 + i) * 0.6; });
    w.kid.place(POST_KID[0], 20.4, Math.PI); w.kid.root.rotation.x = 1.45; w.kid.root.position.y = 0.55; w.kid.armL.rotation.x = -2.6; w.kid.armR.rotation.x = -2.6 + Math.sin(t * 6) * 0.2;
    w.kid.neck.rotation.x = -0.9; // il relève la tête vers le monstre
    w.kidLight.visible = true; w.kidLight.position.set(-3.5, 0.5, 13.5); w.kidLight.rotation.set(0, Math.atan2(-5.1, -6.3) + Math.PI / 2, -0.05);
    w.kidBeam.material.uniforms.opacity.value = 0.12; w.kidLens.emissiveIntensity = 2;
    w.dad.armR.rotation.x = -0.3; w.dad.setFlashlight(1); w.dad.neck.rotation.y = Math.sin(t * 2.5) * 0.5;
    const dark = t > 99.0 ? 1 : 0;
    w.cars.forEach(c => c.set(t, { siren: 0.25, head: 0 }));
    s.ambient = 0.3; s.exposure = 0.6;
    // dans le noir, le monstre marche droit sur nous — un éclair (100.42) le révèle en pleine foulée
    if (t < 99.1) w.monster.setPose(P_FROZEN);
    else if (t < 101.7) monsterWalk(w.monster, t, 99.1, 101.7, [0, 0], [MONSTER_FRONT[0], MONSTER_FRONT[2]], { step: 5, ease: k => k, hold: true, headYaw: Math.sin(t * 1.8) * 0.35, headPitch: 0.3 });
    else { w.monster.root.position.set(...MONSTER_FRONT); w.monster.setPose(mixPose(stride(9 / 5 * Math.PI, { headPitch: 0.3 }), P_CROUCH, smooth(range(t, 101.7, 102.3)))); }
    w.monster.eyes(dark * (0.7 + 0.3 * Math.sin(t * 9)));
    const k = range(t, 98.75, 102.35);
    w.setCam(lerp3([1.2, 2, 27], [1.8, 1.5, 24.5], k), [0, lerp(22, 25, k), lerp(0, 8, k)], lerp(52, 44, k));
    w.key.position.set(4, 5, 26); w.key.target.position.set(1.6, 1, 20.4); w.key.intensity = 10;
    w.shake(0.05 + 0.08 * Math.max(0, Math.sin(t * 7)), t, 6); // battements de cœur
    s.vignette = 1.8;
  } },
  // 102.54 « A blood-curdling scream shattered the silence. »
  { at: 102.35, name: 'Un cri', run(w, t, s) {

    s.ambient = 0.35; s.exposure = 0.7;
    // LA SAISIE : la main géante descend, les griffes se referment sur le garde et l'arrachent du sol
    const M = w.monster, g = w.guards[GRAB_GUARD], [gx, gz] = EMERG[GRAB_GUARD];
    M.root.position.set(...MONSTER_FRONT);
    const target = V(gx, 3.6, gz);
    const REACH = reachPose(M, P_CROUCH, target);
    const down = smooth(range(t, 102.4, 102.72)), lift = smooth(range(t, 102.85, 103.6));
    let pose = mixPose(P_CROUCH, { ...REACH, curlR: 0 }, down);
    pose.curlR = lerp(lerp(0.85, 0, down), 0.9, smooth(range(t, 102.72, 102.85)));
    if (t > 102.85) pose = mixPose({ ...REACH, curlR: 0.9 }, P_CROUCH, lift);
    pose.head = [lerp(-0.22, 0.35, down * (1 - lift)), -0.25 * down * (1 - lift), 0.1];
    M.setPose(pose); M.eyes(0.9);
    if (t < 102.8) {
      g.root.visible = true; g.reset(); g.place(gx, gz, 0).face(0, 0).idle(t);
      g.setFlashlight(1); g.armR.rotation.x = -0.3; g.armR.rotation.y = 0.8;
      g.neck.rotation.x = -0.9 * seg(t, 102.45, 102.7); g.setFace(t > 102.55 ? 'scared' : 'serious');
      g.flinch(seg(t, 102.6, 102.78));
    } else holdGuard(w, t);
    const from = V(gx + 0.6, 4, gz), to = V(gx + 2.5, 0.55, gz + 2);
    flyLight(w.dropLight, w.dropLens, w.dropBeam, t, 102.85, 103.5, from, to, { spin: 6, on: 1, height: 1.5 });
    if (t > 103.5) { w.dropLight.rotation.y += (t - 103.5) * 0.6; }
    // les voisins sursautent
    [w.guards[6], w.guards[8]].forEach(x => x.flinch(seg(t, 102.8, 103.0)));
    w.guards[1].root.visible = false; w.guards[HELP_GUARD].root.visible = false;
    w.key.position.set(gx + 10, 9, gz + 2); w.key.target.position.set(gx, 6, gz); w.key.angle = 0.6; w.key.intensity = 70;
    // caméra : plan large latéral, puis elle suit le garde emporté vers le haut
    if (t < 102.85) {
      w.setCam(lerp3([gx + 14, 4, gz - 1], [gx + 14.5, 4.3, gz - 1.5], range(t, 102.35, 102.85)), [gx - 2, 8, gz - 2], 60);
    } else {
      const gp = w.guards[GRAB_GUARD].root.getWorldPosition(new THREE.Vector3()).add(V(0, 3, 0));
      const k2 = easeOut(range(t, 102.85, 104.85));
      w.setCam([gp.x + lerp(14, 11, k2), lerp(4.3, gp.y - 1, k2), gp.z + lerp(-1.5, 5, k2)], [gp.x, gp.y + 1, gp.z], lerp(60, 48, k2));
      w.key.position.set(gp.x + 9, gp.y, gp.z + 6); w.key.target.position.copy(gp);
    }
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

    atPost(w, t, { kidFace: 'scared', dadFace: 'worried' }); w.dad.setFlashlight(1); w.kid.setFlashlight(1);
    // le garçon recule lentement, le père tend le bras devant lui
    const back = range(t, 113.3, 116.6);
    w.kid.place(POST_KID[0], lerp(23.5, 25.2, back), Math.PI); w.kid.walk(t * 4, 0.25 * (back > 0 && back < 1 ? 1 : 0));
    aimAt(w.dad, monsterChest(w)); aimAt(w.kid, monsterChest(w));
    w.dad.armL.rotation.set(-1.4 * seg(t, 113.8, 114.3), 0.6, 0);
    const tilt = easeInOut(range(t, 113.4, 115.4));
    w.setCam([1.2, lerp(4.8, 3.2, tilt), lerp(34, 35, tilt)], lerp3([0, 4.5, 24], [0, 22, 14], tilt), lerp(42, 60, tilt));
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
    // il fait deux pas vers le monstre en tendant le bras vers le garde
    const step = smooth(range(t, 120.3, 121.4));
    w.kid.place(POST_KID[0], lerp(24.4, 23.0, step), 0).face(POST_DAD[0] - 1, POST_DAD[1] + 2);
    if (step > 0 && step < 1) { w.kid.walk(t * 9, 0.6); }
    w.kid.armL.rotation.set(-1.6 + Math.sin(t * 8) * 0.15, 0.4, 0);
    w.kid.setFlashlight(0);
    if (t > 120.7) { w.kid.face(0, 0); w.kid.aim('R', -0.9); w.kid.neck.rotation.x = -0.4; } else w.kid.neck.rotation.x = -0.1;
    w.dad.setFlashlight(1); aimAt(w.dad, monsterChest(w));
    portrait(w, w.kid, { dist: 6, side: 0.3, h: 0.3, fov: 44, push: 1.5 * easeOut(range(t, 119.9, 121)), light: 0.6 });
    w.shake(0.05, t, 20);
  } },
  // 122.44 « But Dad grabbed my arm and whispered, » 124.38 « Don't move! »
  { at: 122.25, name: '« Ne bouge pas ! »', run(w, t, s) {

    atPost(w, t, { kidFace: 'scared', dadFace: 'serious', lookMonster: false });
    // le père attrape le bras du garçon et le tire vers lui
    const grab = seg(t, 122.8, 123.25), pull = seg(t, 123.3, 123.9);
    w.kid.place(lerp(POST_KID[0], POST_KID[0] - 0.6, pull), lerp(23.0, 24.4, pull), 0).face(lerp(0, POST_DAD[0], pull), lerp(0, POST_DAD[1], pull));
    w.kid.hip.rotation.x = 0.25 * (1 - pull) * grab;
    w.dad.face(w.kid.root.position.x, w.kid.root.position.z); w.dad.setFlashlight(0);
    w.dad.armL.rotation.set(lerp(-0.05, -1.35, grab) + 0.3 * pull, lerp(0, -0.35, grab), 0);
    w.kid.armR.rotation.set(lerp(0, -0.6, grab), 0, 0);
    w.dad.neck.rotation.x = 0.1 * seg(t, 123.6, 124.0);
    if (t < 124.2) {
      const k = range(t, 122.25, 124.2);
      w.setCam(lerp3([6, 5.4, 21.8], [5, 5.0, 22.8], k), [-1.0, 4.1, 24.6], lerp(44, 38, k));
      w.key.position.set(5, 9, 22); w.key.target.position.set(-2.2, 4.5, 25.2); w.key.intensity = 30;
    } else {
      portrait(w, w.dad, { dist: 5.5, side: 0.3, h: 0.2, fov: 40, push: 2.4 * easeOut(range(t, 124.2, 125.4)), light: 1.2 });
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

    const M = w.monster;
    // les lumières vacillent… et à chaque coupure, la tête du monstre se tourne un peu plus vers nous
    const fl = t > 131.25 ? (t > 131.95 ? 0 : (Math.floor(t * 18) % 2)) : 1;
    const creep = range(t, 131.25, 132.3);
    M.setPose({ ...P_CROUCH, head: [lerp(-0.22, 0.1, creep), lerp(-0.08, 0.35, creep), lerp(0.1, -0.2, creep)], armL: [lerp(-0.5, -1.2, creep), 0, -0.45, -0.9] });
    M.root.position.z = MONSTER_FRONT[2] + 2.5 * creep;
    if (t > 103.6) holdGuard(w, t);
    const h = M.head.getWorldPosition(new THREE.Vector3()).add(V(0, 2.6, 0));
    const k = easeInOut(range(t, 129.25, 131.9));
    w.setCam(lerp3([1, 18, 33], [0.3, 23.5, 22.5], k), [h.x, h.y, h.z], lerp(46, 34, k));
    underlight(w, fl);
    w.towers.forEach((tw, i) => i && tw.set(fl * 0.8, false, '#ffc9a8'));
    w.guards.forEach(g => g.setFlashlight(fl));
    s.ambient = fl ? 1 : 0.15; s.exposure = fl ? 1 : 0.5;
    M.eyes(fl ? 0 : 1);
    if (t > 131.95) { s.fade = range(t, 132.1, 132.6) * 0.9 + 0.1; M.eyes(1); s.ambient = 0.05; }
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
const STRIKES = [[82.58, 1], [83.05, 0.6], [86.9, 0.7], [92.3, 0.8], [96.0, 0.5], [100.42, 1], [102.68, 1], [103.25, 0.7], [109.9, 0.6], [115.0, 0.7], [121.4, 0.6], [126.9, 0.5], [131.6, 0.8]];
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
  if (!SHOTS[i].steady) handheld(w, t, SHOTS[i].hand ?? 1);
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
