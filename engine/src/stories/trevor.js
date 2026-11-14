// "In this town, everyone has a bunker except me" — Trevor / Subject Zero.
// Every shot boundary sits on a pause in the voiceover (see audio/timing notes in README).
import * as THREE from 'three';
import { TREVOR, zombieSpec, npcSpec, makeBaby } from '../character.js';
import { O, buildHatches, buildOcean, buildMansion, buildSilent, buildGas, buildHospital, buildVault, buildLab } from '../sets.js';
import { clamp, smooth, easeInOut, easeOut, easeIn, lerp, noise1 } from '../util.js';

let trevor, zs = [], npcs = [], sci, baby, hatches, sets = {};
const lin = (t) => t;

// ---------- helpers
function faceTo(ch, x, z) { const p = ch.root.position; ch.root.rotation.set(0, Math.atan2(-(x - p.x), -(z - p.z)), 0); }
function place(ch, x, y, z, rotY = 0) { ch.root.visible = true; ch.root.position.set(x, y, z); ch.root.rotation.set(0, rotY, 0); }
const FWD = Math.PI;                 // facing +Z (toward a camera placed at larger z)
const ramp = (lt, a, b) => smooth((lt - a) / (b - a));

// Trevor's opening walk (shots 1–2): walks at 3 studs/s, eases to a stop at ~4.4s
function tz(t) {
  if (t < 3.6) return -3 * t;
  const u = Math.min(t - 3.6, 0.8);
  return -10.8 - (3 * u - (3 * u * u) / 1.6);
}
const tspeed = (t) => (t < 3.6 ? 1 : clamp(1 - (t - 3.6) / 0.8));

// hatch lookup on the street
const hatchAt = (i) => hatches[i];

export default {
  duration: 84.09,
  setup({ scene, makeCharacter, world }) {
    trevor = makeCharacter(scene, TREVOR);
    for (let i = 0; i < 46; i++) zs.push(makeCharacter(scene, zombieSpec(i)));
    for (let i = 0; i < 12; i++) npcs.push(makeCharacter(scene, npcSpec(i)));
    sci = makeCharacter(scene, { skin: '#f0cfae', shirt: '#f4f4f2', shirtAccent: '#dcdcdc', pants: '#2c3e50', shoes: '#1d1d1d', hair: '#8f8f8f', hood: false, face: 'smile', seed: 900 });
    baby = makeBaby(scene);
    hatches = buildHatches(world);
    sets.ocean = buildOcean(scene); sets.mansion = buildMansion(scene); sets.silent = buildSilent(scene);
    sets.gas = buildGas(scene); sets.hosp = buildHospital(scene, world); sets.vault = buildVault(scene); sets.lab = buildLab(scene);
  },

  update(t, ctx, shot) {
    const { world, renderer } = ctx;
    // visibility of sets
    world.group.visible = shot.set === 'street';
    for (const k in sets) sets[k].group.visible = shot.set === k;
    // mood
    const m = shot.mood || 'sunset';
    if (typeof m === 'string') world.applyMood(m, m, 0, renderer);
    else world.applyMood(m[0], m[1], m[2](t - shot.start), renderer);
    world.wind = shot.wind ?? 1;
    // reset cast
    for (const c of [trevor, sci, ...zs, ...npcs]) c.root.visible = false;
    baby.visible = false;
    for (const h of hatches) h.setOpen(0, 0);
    trevor.setFace('neutral');
    shot.act && shot.act(t - shot.start, t);
    if (sets[shot.set]) sets[shot.set].update(t);
  },

  overlay(t, shot) {
    const o = { black: 0, white: 0, red: 0, old: shot.old ? 1 : 0 };
    if (t < 0.35) o.black = 1 - t / 0.35;
    if (t > 83.55) o.black = clamp((t - 83.55) / 0.5);
    const flash = (at, dur, amt = 1) => (t >= at && t < at + dur ? (1 - (t - at) / dur) * amt : 0);
    o.white = Math.max(flash(4.72, 0.35, 0.9), flash(40.15, 0.7, 1), flash(58.3, 0.3, 0.8), flash(61.45, 0.25, 0.9), flash(73.2, 0.25, 0.6));
    o.red = Math.max(flash(50.15, 0.5, 0.45), flash(63.9, 0.45, 0.4), flash(76.17, 0.35, 0.4), flash(77.0, 0.35, 0.4), flash(77.99, 0.35, 0.45),
      shot.redPulse ? 0.12 + 0.1 * Math.sin(t * 7) : 0);
    return o;
  },

  shots: buildShots(),
};

function buildShots() {
  const V = O.vault, sh = [];
  const add = (start, end, set, mood, cam, act, extra = {}) => sh.push({ start, end, set, mood, ...cam, act, ...extra });
  const cam = (p0, l0, p1 = p0, l1 = l0, fov = 40, fovTo, more = {}) => ({ from: { pos: p0, look: l0 }, to: { pos: p1, look: l1 }, fov, fovTo, ...more });

  // street families standing by their hatches (opening shots)
  const families = (lt, t) => {
    const spots = [[2, -1], [4, 1], [6, -1], [3, 1], [8, -1], [5, 1]];
    spots.forEach(([hi, side], i) => {
      const h = hatchAt(hi); const p = h.g.position;
      const n = npcs[i]; place(n, p.x - side * 1.0, 0.4, p.z + 2.4);
      faceTo(n, 0, tz(t)); n.pose({ t: t + i });
      h.setOpen(0.15, 0.4);
    });
  };
  const trevorWalk = (lt, t, face = 'neutral') => {
    place(trevor, 0.6, 0, tz(t)); trevor.setFace(face);
    trevor.pose({ t, walk: tspeed(t), phase: -tz(t) * 1.25 });
  };

  // 1 — In this town, everyone has a bunker except me.
  add(0, 2.76, 'street', 'sunset',
    cam((t) => [0.0, 4.2, tz(t) + 15], (t) => [0.3, 5.5, tz(t) - 30], (t) => [0.3, 4.4, tz(t) + 12.5], (t) => [0.5, 5.6, tz(t) - 30], 48),
    (lt, t) => { trevorWalk(lt, t); families(lt, t); });
  // 2 — My name is Trevor.
  add(2.76, 4.72, 'street', 'sunset',
    cam((t) => [1.8, 5.0, tz(t) - 8.5], (t) => [0.6, 4.3, tz(t)], (t) => [1.2, 4.9, tz(t) - 6.2], (t) => [0.6, 4.5, tz(t)], 38),
    (lt, t) => { trevorWalk(lt, t, lt > 0.4 && lt < 1.6 ? 'smile' : 'neutral'); trevor.pose({ t, walk: tspeed(t), phase: -tz(t) * 1.25, headYaw: lt > 1.2 ? -0.12 : 0 }); families(lt, t); });

  // 3 — Ten years ago, the zombie apocalypse began,
  add(4.72, 7.05, 'street', 'danger',
    cam([-3, 2.5, 6], [0, 3.5, -30], [-6, 11, 14], [0, 1, -30], 46, 46, { shake: 0.12 }),
    (lt, t) => {
      for (let i = 0; i < 6; i++) { const n = npcs[i]; const z = -34 + lt * 9 + (i % 3) * 3; place(n, -5 + i * 2, 0, z, FWD); n.setFace('scared'); n.pose({ t, run: 1, phase: z * 1.1 + i }); }
      for (let i = 0; i < 12; i++) { const zb = zs[i]; const z = -46 + lt * 6 - (i % 4) * 3.5; place(zb, -6 + (i % 6) * 2.4, 0, z, FWD + noise1(i, 3) * 0.2); zb.pose({ t: t + i, zombie: 1, run: 0.5, phase: z * 1.4 + i }); }
    }, { wind: 2.2 });
  // 4 — and every family received an underground bunker.
  add(7.05, 9.31, 'street', 'tense',
    cam([3, 12, -10], [-8, 1.0, -23], [2.5, 10, -14], [-8.5, 1.0, -23.5], 42),
    (lt, t) => {
      const h = hatchAt(2); const p = h.g.position;
      h.setOpen(lt < 1.9 ? ramp(lt, 0, 0.3) : 1 - ramp(lt, 1.9, 2.25), 1);
      [6, 7, 8].forEach((k, i) => {
        const n = npcs[k]; const start = i * 0.55; const u = lt - start;
        const x = lerp(p.x + 4 + i * 1.5, p.x, clamp(u / 0.6)), z = lerp(p.z + 3.5, p.z, clamp(u / 0.6));
        const y = 0.4 - Math.max(0, u - 0.6) * 9;
        if (y < -6) return;
        place(n, x, y, z); faceTo(n, p.x - 2, p.z - 1);
        n.pose({ t, walk: u < 0.6 ? 1 : 0, phase: u * 8, crouch: clamp((u - 0.5) * 2) * 0.4 });
      });
    });
  // 5 — But each bunker was different.
  add(9.31, 11.11, 'street', 'sunset',
    cam([0, 24, -10], [0, 0, -40], [0, 21, -40], [0, 0, -75], 50),
    (lt, t) => { hatches.forEach((h, i) => h.setOpen(0.25 + 0.15 * Math.sin(i), 0.8)); });

  // 6 — Bunker No. 1: glass beneath the ocean.
  const OC = O.ocean;
  add(11.11, 14.47, 'ocean', 'ocean',
    cam([OC + 22, 4, 12], [OC, 4, 0], [OC + 8, 8, 24], [OC, 3.5, 0], 44, 44, { shake: 0.04 }),
    (lt, t) => {
      place(npcs[0], OC - 3.5, 0.1, 3.0, FWD); npcs[0].pose({ t, sit: 1 });
      place(npcs[1], OC - 0.5, 0.1, 3.0, FWD); npcs[1].pose({ t: t + 2, sit: 1, headYaw: 0.5 });
      place(npcs[2], OC + 5, 0.1, -3, -2.2); npcs[2].setFace('smile'); npcs[2].pose({ t, point: 1, headPitch: -0.3 });
    });
  // 7 — Bunker No. 7: luxury mansion, pool, unlimited food.
  const MA = O.mansion;
  add(14.47, 16.45, 'mansion', 'mansion',
    cam([MA - 20, 8, 14], [MA - 4, 1, -6], [MA - 4, 9, 16], [MA + 2, 1, -5], 46),
    (lt, t) => {
      place(npcs[3], MA - 6 + Math.sin(t * 0.6) * 3, -2.4, -6 + Math.cos(t * 0.5) * 1.5, -1.2); npcs[3].setFace('smile'); npcs[3].pose({ t, swim: 1 });
      place(npcs[4], MA - 6, 0.6, 6.0, FWD); npcs[4].root.position.y = 0.95; npcs[4].setFace('smile'); npcs[4].pose({ t, sit: 1 });
      place(npcs[5], MA + 12, 0, 6.8, FWD); npcs[5].pose({ t, reach: 0.4 + 0.2 * Math.sin(t * 3) });
      place(npcs[9], MA + 19, 0, 6.8, FWD); npcs[9].setFace('smile'); npcs[9].pose({ t: t + 3, reachR: 0.6 });
    });
  add(16.45, 18.52, 'mansion', 'mansion',
    cam([MA + 21, 7.5, -7], [MA + 15, 2.8, 5], [MA + 18, 6.0, -3], [MA + 15, 3, 5], 40),
    (lt, t) => {
      place(npcs[5], MA + 12, 0, 6.8, 0); npcs[5].setFace('smile'); npcs[5].pose({ t, reach: 0.4 + 0.2 * Math.sin(t * 3) });
      place(npcs[9], MA + 19, 0, 6.8, 0); npcs[9].setFace('smile'); npcs[9].pose({ t: t + 3, reachR: 0.6 + 0.3 * Math.sin(t * 4) });
      place(npcs[3], MA - 6 + Math.sin(t * 0.6) * 3, -2.4, -6, -1.2); npcs[3].pose({ t, swim: 1 });
    });

  // 8 — Bunker No. 12 had one rule:
  const SI = O.silent;
  const silentFamily = (t) => {
    place(npcs[0], SI - 3, 0, -3, FWD); npcs[0].setFace('scared'); npcs[0].pose({ t, sit: 1, cower: 0.6 });
    place(npcs[1], SI + 2.5, 0, -4, FWD - 0.3); npcs[1].setFace('worried'); npcs[1].pose({ t, sit: 1 });
    place(npcs[7], SI, 0, 0, FWD); npcs[7].setFace('worried');
  };
  add(18.52, 20.55, 'silent', 'silent',
    cam([SI + 1, 7, 16], [SI, 3, -4], [SI + 0.5, 5.5, 10], [SI, 3.5, -3], 42, 42, { shake: 0.03 }),
    (lt, t) => { silentFamily(t); npcs[7].pose({ t }); });
  // 9 — never make a sound.
  add(20.55, 21.72, 'silent', 'silent',
    cam([SI + 0.6, 5, 6.5], [SI, 4.6, 0], [SI + 0.4, 4.9, 5.2], [SI, 4.6, 0], 34, 34, { shake: 0.02 }),
    (lt, t) => { silentFamily(t); npcs[7].pose({ t, shush: ramp(lt, 0, 0.35) }); });

  // 10 — But I had no bunker.
  add(21.72, 23.0, 'street', ['sunset', 'tense', (lt) => lt / 1.3],
    cam([3.5, 6.5, -13], [-6, 2, -25], [3, 6, -15], [-6.5, 2, -25], 44),
    (lt, t) => {
      const h = hatchAt(2); h.setOpen(lt < 0.2 ? 0.4 : 0.4 * (1 - ramp(lt, 0.2, 0.7)), 1 - ramp(lt, 0.2, 0.8));
      place(trevor, -3.5, 0, -24.5); faceTo(trevor, -9.2, -22); trevor.setFace('sad'); trevor.pose({ t, headPitch: 0.2 });
    }, { wind: 0.6 });

  // 11 — I slept inside an abandoned gas station,
  const GA = O.gas, SX = GA - 22;
  const zombiesOnRoad = (t, n = 4) => { for (let i = 0; i < n; i++) { const zb = zs[i]; const z = -30 + ((t * 1.2 + i * 12) % 60); place(zb, GA + 21 + (i % 2) * 4, 0, z, FWD); zb.pose({ t: t + i, zombie: 1, phase: z * 1.6 + i }); } };
  add(23.0, 24.97, 'gas', 'night',
    cam([GA + 44, 16, 34], [GA - 8, 3, -2], [GA + 34, 7, 26], [GA - 10, 3, -2], 44),
    (lt, t) => zombiesOnRoad(t));
  // 12 — hiding from zombies every night.
  add(24.97, 26.62, 'gas', 'night',
    cam([SX + 8.3, 3.4, -5.2], [SX + 3.6, 2.3, -4.4], [SX + 7.8, 3.1, -5.0], [SX + 3.6, 2.4, -4.4], 42, 42, { shake: 0.02 }),
    (lt, t) => {
      place(trevor, SX + 3.6, 0.3, -4.4, -Math.PI / 2);
      trevor.setFace('scared'); trevor.pose({ t, sit: 1, cower: 0.55, headYaw: noise1(t, 9) * 0.35 });
      const zb = zs[5]; place(zb, SX - 6 + lt * 3, 0, 11, -Math.PI / 2); zb.pose({ t, zombie: 1, phase: lt * 5 });
    });

  // 13 — Until I noticed something terrifying.
  add(26.62, 28.33, 'street', 'tense',
    cam((t) => [1.6, 5.0, -40 - (t - 26.62) * 2.2 - 6.8], (t) => [0.6, 4.4, -40 - (t - 26.62) * 2.2], (t) => [1.1, 4.8, -40 - (t - 26.62) * 2.2 - 5.2], (t) => [0.6, 4.5, -40 - (t - 26.62) * 2.2], 36),
    (lt, t) => {
      const z = -40 - lt * 2.2; const stop = ramp(lt, 1.0, 1.4);
      place(trevor, 0.6, 0, z); trevor.setFace(lt > 1.0 ? 'shocked' : 'worried');
      trevor.pose({ t, walk: 1 - stop, phase: -z * 1.25, headYaw: stop * -0.3 });
    });
  // 14 — Zombies never attacked me.
  add(28.33, 29.85, 'street', 'tense',
    cam([7, 5, -40.5], [-0.5, 3.6, -47], [6.6, 5, -41.2], [-0.5, 3.6, -47], 42, 38, { impact: { at: 29.05, dur: 0.35, amt: 0.25 } }),
    (lt, t) => {
      place(trevor, 0.6, 0, -43.5); trevor.setFace('scared'); trevor.pose({ t, cower: ramp(lt, 0.5, 0.75) * 0.6 });
      const zb = zs[0]; const k = easeOut(clamp(lt / 0.72)); const z = lerp(-58, -47.6, k);
      place(zb, 0.2, 0, z, 0); faceTo(zb, 0.6, -43.5); zb.pose({ t, zombie: 1, run: lt < 0.72 ? 0.9 : 0, phase: z * 1.6 });
      if (lt > 0.72) zb.pose({ t, zombie: 0.6, headPitch: -0.2 });
    });
  // 15 — They chased everyone else,
  add(29.85, 31.3, 'street', 'tense',
    cam([9, 5, -42], [-2, 3, -56], [8.5, 5, -45], [0, 3, -57], 50),
    (lt, t) => {
      const n = npcs[2]; const x = -14 + lt * 14; place(n, x, 0, -56, -Math.PI / 2); n.setFace('scared'); n.pose({ t, run: 1, phase: x * 1.2 });
      for (let i = 0; i < 4; i++) { const zb = zs[i]; const zx = x - 5 - i * 2.4; place(zb, zx, 0, -55 + (i % 2) * 2.2, -Math.PI / 2); zb.pose({ t: t + i, zombie: 1, run: 0.7, phase: zx * 1.6 }); }
    }, { wind: 1.4 });
  // 16 — but whenever I walked past, they simply stopped and stared.
  add(31.3, 33.28, 'street', 'tense',
    cam((t) => [-1.2, 3.6, -62 - (t - 31.3) * 3 - 9], (t) => [0.6, 4.4, -62 - (t - 31.3) * 3], (t) => [-1.6, 3.4, -62 - (t - 31.3) * 3 - 7], (t) => [0.6, 4.4, -62 - (t - 31.3) * 3], 46),
    (lt, t) => {
      const z = -62 - lt * 3; place(trevor, 0.6, 0, z); trevor.setFace('worried'); trevor.pose({ t, walk: 1, phase: -z * 1.25, headYaw: Math.sin(lt * 2) * 0.25 });
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1, zz = -63 - Math.floor(i / 2) * 3.4;
        const zb = zs[i]; place(zb, side * (4.6 + (i % 3) * 0.8), 0, zz);
        faceTo(zb, 0.6, z); zb.pose({ t: t + i, zombie: 0.75 });
      }
    });

  // 17 — So one night, I followed them to an abandoned hospital.
  const HO = O.hosp;
  add(33.28, 35.69, 'hosp', 'night',
    cam([HO + 2, 3, 26], [HO, 4, -10], [HO + 6, 13, 34], [HO, 14, -40], 46),
    (lt, t) => {
      for (let i = 0; i < 6; i++) { const zb = zs[i]; const z = 8 - lt * 2.4 - i * 3.2; place(zb, HO - 1.5 + (i % 2) * 3, 0, z, 0); zb.pose({ t: t + i, zombie: 1, phase: z * 1.6 + i }); }
      const z = 18 - lt * 2.4; place(trevor, HO + 0.5, 0, z, 0); trevor.setFace('worried'); trevor.pose({ t, walk: 0.8, phase: -z * 1.25 });
    });

  // 18 — Beneath it stood a giant metal door marked Bunker 100.
  add(35.69, 38.92, 'vault', 'vault',
    cam([V + 3, 1.6, 36], [V, 9.5, 0], [V + 1.5, 2.2, 24], [V, 9.5, 0], 50, 46),
    (lt, t) => {
      const z = 16 - lt * 1.2; place(trevor, V + 0.6, 0, z, 0); trevor.setFace('worried'); trevor.pose({ t, walk: 0.6, phase: -z * 1.25 });
      sets.vault.doorOpen = 0; sets.vault.mode = 'feeds'; sets.vault.redWave = -1; sets.vault.alarm = 0;
    });
  // 19 — The moment I touched it, the door opened.
  add(38.92, 40.95, 'vault', 'vault',
    cam([V + 6, 6, 7], [V + 0.8, 6.2, 1], [V + 7, 7, 10], [V, 7, 0], 40, 46, { impact: { at: 40.15, dur: 0.6, amt: 0.3 } }),
    (lt, t) => {
      place(trevor, V + 1.6, 0, 3.4, 0); trevor.setFace(lt > 1.2 ? 'shocked' : 'determined');
      trevor.pose({ t, reachR: ramp(lt, 0.1, 0.6) * (1 - ramp(lt, 1.25, 1.6)), cower: ramp(lt, 1.25, 1.5) * 0.3 });
      sets.vault.doorOpen = easeIn(clamp((lt - 1.2) / 0.75)); sets.vault.mode = 'feeds';
    });

  // 20 — Inside, hundreds of monitors showed every bunker in the city.
  const TZ = -22;
  add(40.95, 43.75, 'vault', 'vault',
    cam([V + 0.5, 4, -5], [V, 6, -40], [V + 2, 15, -3], [V, 10, -58], 44, 50),
    (lt, t) => {
      sets.vault.doorOpen = 1; sets.vault.mode = 'feeds';
      const z = lerp(-8, TZ, easeOut(clamp(lt / 2.6))); place(trevor, V, 0, z, 0); trevor.setFace('shocked');
      trevor.pose({ t, walk: lt < 2.4 ? 1 : 0, phase: -z * 1.25, headPitch: -0.25, headYaw: Math.sin(lt * 1.5) * 0.3 });
    });
  // 21 — But one screen displayed a strange message: (SUBJECT ZERO HAS RETURNED)
  add(43.75, 46.12, 'vault', 'vault',
    cam([V + 2, 9, TZ - 2], [V, 11.5, -58.5], [V + 0.5, 11.4, -44], [V, 11.5, -58.5], 46, 40),
    (lt, t) => { sets.vault.doorOpen = 1; sets.vault.mode = lt < 0.3 ? 'feeds' : lt < 0.45 ? 'static' : 'subject'; place(trevor, V, 0, TZ, 0); trevor.pose({ t }); });
  add(46.12, 47.92, 'vault', 'vault',
    cam([V + 1.2, 5.0, TZ - 6.5], [V, 4.6, TZ], [V + 0.8, 4.9, TZ - 5.2], [V, 4.6, TZ], 36),
    (lt, t) => { sets.vault.mode = 'subject'; place(trevor, V, 0, TZ, 0); trevor.setFace('shocked'); trevor.pose({ t, headPitch: -0.15 }); });

  // 22 — Suddenly, every screen turned red.
  add(47.92, 50.12, 'vault', ['vault', 'alarm', (lt) => ramp(lt, 0.4, 1.2)],
    cam([V + 7, 9, 0], [V, 10, -58], [V + 5, 10, -6], [V, 10, -58], 52),
    (lt, t) => {
      sets.vault.doorOpen = 1; sets.vault.redWave = 48.3; sets.vault.mode = lt > 0.38 ? 'red' : 'subject'; sets.vault.alarm = ramp(lt, 0.5, 0.9);
      place(trevor, V, 0, TZ, 0); trevor.pose({ t, headYaw: lt > 0.8 ? Math.sin(lt * 3) * 0.4 : 0 });
    });
  // 23 — LOCKDOWN INITIATED.
  add(50.12, 51.5, 'vault', 'alarm',
    cam([V - 6, 4.2, TZ - 3], [V + 0.5, 7, 0], [V - 5.4, 4.4, TZ - 1.8], [V + 0.5, 7, 0], 46, 46, { impact: { at: 50.5, dur: 0.6, amt: 0.35 }, redPulse: true }),
    (lt, t) => {
      sets.vault.doorOpen = 1 - easeIn(clamp(lt / 0.38)); sets.vault.mode = 'red'; sets.vault.alarm = 1; sets.vault.redWave = 48.3;
      place(trevor, V + 1.5, 0, TZ + 1, 0); trevor.setFace('scared'); trevor.pose({ t, lookBack: ramp(lt, 0.3, 0.7) });
    }, { redPulse: true });

  // 24 — I turned around.
  add(51.5, 52.47, 'vault', 'alarm',
    cam([V + 0.6, 5.2, TZ + 6.5], [V, 4.6, TZ], [V + 0.4, 5.0, TZ + 5.5], [V, 4.6, TZ], 38),
    (lt, t) => {
      Object.assign(sets.vault, { doorOpen: 0, mode: 'red', alarm: 1 });
      const a = easeInOut(clamp(lt / 0.6)); place(trevor, V, 0, TZ, a * Math.PI); trevor.setFace(lt > 0.4 ? 'scared' : 'worried'); trevor.pose({ t, walk: a > 0 && a < 1 ? 0.4 : 0, phase: lt * 10 });
    }, { redPulse: true });

  // horde layout for the vault room
  const horde = (t, bowFn, headUp = 0) => {
    let k = 0;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) {
      const zb = zs[k++]; const x = V - 16 + col * 4 + (row % 2) * 1.6 + noise1(k, 5) * 0.6, z = -14.5 + row * 2.9 + noise1(k, 6) * 0.4;
      place(zb, x, 0, z); faceTo(zb, V, TZ);
      const b = bowFn ? bowFn(row, col) : 0;
      zb.pose({ t: t + k * 0.37, zombie: 1 - b, bow: b, headPitch: -headUp * 0.5 });
    }
  };
  // 25 — Hundreds of zombies were standing behind me.
  add(52.47, 54.25, 'vault', 'alarm',
    cam([V + 2.5, 5.2, TZ - 4], [V, 3.5, -6], [V + 5, 14, TZ - 9], [V, 2, -6], 46, 52),
    (lt, t) => { Object.assign(sets.vault, { doorOpen: 0, mode: 'red', alarm: 1 }); place(trevor, V, 0, TZ, Math.PI); trevor.setFace('scared'); trevor.pose({ t, cower: 0.3 }); horde(t); }, { redPulse: true });
  // 26 — But they weren't attacking.
  add(54.25, 55.75, 'vault', 'alarm',
    cam([V - 4.5, 3.2, TZ - 6], [V + 1, 5, -8], [V - 4.2, 3.4, TZ - 5.2], [V + 1, 5, -8], 42),
    (lt, t) => { Object.assign(sets.vault, { doorOpen: 0, mode: 'red', alarm: 1 }); place(trevor, V, 0, TZ, Math.PI); trevor.setFace('worried'); trevor.pose({ t }); horde(t); }, { redPulse: true });
  // 27 — They were bowing.
  add(55.75, 56.87, 'vault', 'alarm',
    cam([V + 3, 6.5, TZ - 4], [V, 3, -8], [V + 3.4, 7.5, TZ - 5.5], [V, 3, -8], 50),
    (lt, t) => {
      Object.assign(sets.vault, { doorOpen: 0, mode: 'red', alarm: 1 });
      place(trevor, V, 0, TZ, Math.PI); trevor.setFace('shocked'); trevor.pose({ t });
      horde(t, (row, col) => easeInOut(clamp((lt - row * 0.1 - Math.abs(col - 4) * 0.04) / 0.45)));
    }, { redPulse: true });

  // 28 — Then an old recording appeared.
  add(56.87, 58.3, 'vault', ['alarm', 'vault', (lt) => ramp(lt, 0, 0.6)],
    cam([V + 3, 8, TZ - 6], [V, 11.5, -58.5], [V + 0.5, 11.4, -45], [V, 11.5, -58.5], 46, 40),
    (lt, t) => { Object.assign(sets.vault, { doorOpen: 0, alarm: 1 - ramp(lt, 0, 0.5), mode: lt < 0.5 ? 'static' : 'old' }); place(trevor, V, 0, TZ, 0); trevor.pose({ t }); horde(t, () => 1); });

  // 29 — A scientist holding a newborn baby.
  const LA = O.lab;
  const scientist = (t) => {
    place(sci, LA + 1, 0, -4, FWD); sci.setFace('smile'); sci.pose({ t, hold: 1, headPitch: 0.35 });
    baby.visible = true; baby.position.set(LA + 1, 3.95, -4 + 1.75); baby.rotation.set(0, Math.PI / 2, 0.1);
  };
  add(58.3, 60.7, 'lab', 'lab',
    cam([LA + 4, 6, 10], [LA + 1, 4.5, -4], [LA + 2.5, 5.6, 6.5], [LA + 1, 4.3, -4], 40, 38, { shake: 0.05 }),
    (lt, t) => scientist(t), { old: true });
  // 30 — That baby was me.
  add(60.7, 61.45, 'lab', 'lab',
    cam([LA + 0.5, 7.0, 1.2], [LA + 0.45, 4.2, -2.25], [LA + 0.45, 6.4, 0.3], [LA + 0.4, 4.2, -2.25], 40, 34, { shake: 0.03 }),
    (lt, t) => scientist(t), { old: true });
  add(61.45, 62.0, 'vault', 'alarm',
    cam([V + 0.3, 4.9, TZ - 3.6], [V, 4.65, TZ], [V + 0.2, 4.85, TZ - 3.1], [V, 4.65, TZ], 34),
    (lt, t) => { Object.assign(sets.vault, { doorOpen: 0, alarm: 0.3, mode: 'old' }); place(trevor, V, 0, TZ, 0); trevor.setFace('shocked'); trevor.pose({ t }); }, { redPulse: false });

  // 31 — Underneath, three words appeared: (THE FIRST INFECTED)
  add(62.0, 63.92, 'vault', 'alarm',
    cam([V + 1, 11, -40], [V, 11.5, -58.5], [V + 0.3, 11.5, -46], [V, 11.5, -58.5], 40, 38),
    (lt, t) => { Object.assign(sets.vault, { doorOpen: 0, alarm: 0.3, mode: lt < 0.6 ? 'old' : 'bio' }); });
  add(63.92, 65.22, 'vault', 'alarm',
    cam([V + 0.2, 5.25, TZ - 2.8], [V, 5.15, TZ], [V + 0.1, 5.2, TZ - 2.3], [V, 5.15, TZ], 30, 30, { impact: { at: 63.95, dur: 0.4, amt: 0.08 } }),
    (lt, t) => { Object.assign(sets.vault, { alarm: 0.5, mode: 'bio' }); place(trevor, V, 0, TZ, 0); trevor.setFace('shocked'); trevor.pose({ t }); }, { redPulse: true });

  // 32 — That's when I understood.
  add(65.22, 66.57, 'vault', 'alarm',
    cam([V + 2.2, 5.0, TZ - 5.5], [V, 4.6, TZ], [V + 1.2, 4.9, TZ - 4.4], [V, 4.6, TZ], 36),
    (lt, t) => { Object.assign(sets.vault, { alarm: 0.4, mode: 'bio' }); place(trevor, V, 0, TZ, 0); trevor.setFace('sad'); trevor.pose({ t, headPitch: 0.25 * ramp(lt, 0.2, 1) }); });
  // 33 — The bunkers weren't built to protect people from zombies.
  add(66.57, 69.0, 'street', 'night',
    cam([-4, 32, 10], [0, 0, -30], [4, 26, -26], [0, 0, -70], 50),
    (lt, t) => {
      hatches.forEach((h) => h.setOpen(0, 0.35));
      for (let i = 0; i < 14; i++) { const zb = zs[i]; const z = -10 - i * 6 + Math.sin(t * 0.3 + i) * 2; place(zb, -5 + ((i * 3.7) % 10), 0, z, i * 0.9); zb.pose({ t: t + i, zombie: 1, phase: t * 2 + i }); }
    }, { wind: 0.5 });
  // 34 — They were built to protect everyone from me.
  add(69.0, 71.3, 'vault', 'alarm',
    cam([V + 1.6, 1.7, TZ + 6.6], [V, 5.0, TZ], [V + 1.0, 2.0, TZ + 5.4], [V, 5.0, TZ], 40, 36),
    (lt, t) => {
      Object.assign(sets.vault, { alarm: 0.6, mode: 'bio' }); horde(t, () => 1);
      place(trevor, V, 0, TZ, Math.PI); trevor.setFace(lt > 1.25 ? 'infected' : 'determined'); trevor.pose({ t, headPitch: -0.12 * ramp(lt, 1, 1.5) });
    }, { redPulse: true });

  // 35 — But suddenly, another message appeared:
  add(71.3, 73.2, 'vault', 'alarm',
    cam([V + 4, 7, -6], [V, 10, -58], [V + 2, 8.5, -11], [V, 10.5, -58], 50),
    (lt, t) => {
      Object.assign(sets.vault, { alarm: 0.6, mode: lt < 1.1 ? 'bio' : 'static' });
      horde(t, () => 1); place(trevor, V, 0, TZ, 0); trevor.setFace('infected'); trevor.pose({ t });
    });
  // 36 — SUBJECT ZERO ACTIVATED.
  add(73.2, 74.8, 'vault', 'alarm',
    cam([V + 0.8, 11.2, -42], [V, 11.5, -58.5], [V + 0.2, 11.5, -47], [V, 11.5, -58.5], 42, 38),
    (lt, t) => { Object.assign(sets.vault, { alarm: 1, mode: 'activated', count: 10 }); }, { redPulse: true });
  // 37 — A countdown began.
  add(74.8, 76.15, 'vault', 'alarm',
    cam([V + 13, 14, -13], [V, 4, TZ - 2], [V + 9, 11.5, -10], [V, 4, TZ - 2], 50),
    (lt, t) => {
      Object.assign(sets.vault, { alarm: 1, mode: 'activated', count: 10, redWave: 0 });
      horde(t, () => 1); place(trevor, V, 0, TZ, 0); trevor.setFace('infected'); trevor.pose({ t });
    }, { redPulse: true });
  // 38 — Ten… Nine… Eight…
  add(76.15, 76.98, 'vault', 'alarm',
    cam([V + 0.2, 11.5, -42], [V, 11.5, -58.5], [V + 0.1, 11.5, -43.5], [V, 11.5, -58.5], 42),
    (lt, t) => { Object.assign(sets.vault, { alarm: 1, mode: 'activated', count: lt < 0.25 ? 10 : 9 }); }, { redPulse: true });
  add(76.98, 77.97, 'vault', 'alarm',
    cam([V + 0.15, 5.2, TZ - 2.5], [V, 5.15, TZ], [V + 0.1, 5.2, TZ - 2.1], [V, 5.15, TZ], 30),
    (lt, t) => { Object.assign(sets.vault, { alarm: 1, mode: 'activated', count: 8 }); place(trevor, V, 0, TZ, 0); trevor.setFace('infected'); trevor.pose({ t }); }, { redPulse: true });
  add(77.97, 78.86, 'vault', 'alarm',
    cam([V - 2, 1.4, -19.5], [V + 1, 5, -8], [V - 1.8, 1.6, -19.8], [V + 1, 5.5, -8], 46),
    (lt, t) => { Object.assign(sets.vault, { alarm: 1, mode: 'activated', count: 7 }); place(trevor, V, 0, TZ, 0); horde(t, () => 1 - easeOut(clamp(lt / 0.5)), 1); }, { redPulse: true });

  // 39 — Then every bunker door in the city started opening.
  add(78.86, 81.2, 'street', ['night', 'danger', () => 0.55],
    cam([0, 30, 14], [0, 0, -40], [0, 24, -14], [0, 0, -90], 52),
    (lt, t) => {
      hatches.forEach((h) => { const d = -h.g.position.z; const k = easeOut(clamp((lt - d / 120) / 0.5)); h.setOpen(k, k); });
      for (let i = 0; i < 10; i++) { const zb = zs[i]; const z = -20 - i * 9; place(zb, -4 + (i % 3) * 4, 0, z, FWD); zb.pose({ t: t + i, zombie: 1, headPitch: -0.3 }); }
    }, { wind: 1.8 });
  // 40 — And a voice whispered: Phase Two has begun.
  add(81.2, 84.1, 'street', ['night', 'danger', () => 0.55],
    cam([1.0, 4.6, -22], [0.6, 4.8, -32], [0.8, 4.9, -27.2], [0.6, 4.95, -32], 44, 36, { shake: 0.03 }),
    (lt, t) => {
      hatches.forEach((h) => h.setOpen(1, 1));
      place(trevor, 0.6, 0, -32, FWD); trevor.setFace('infected'); trevor.pose({ t, headPitch: -0.05 });
      for (let i = 0; i < 12; i++) { const zb = zs[i]; const side = i % 2 ? 1 : -1; const z = -36 - Math.floor(i / 2) * 3.5; place(zb, side * (2.6 + (i % 3) * 1.3), 0, z, FWD); zb.pose({ t: t + i, zombie: 0.5, bow: 0.15 }); }
    }, { wind: 0.8 });

  return sh;
}
