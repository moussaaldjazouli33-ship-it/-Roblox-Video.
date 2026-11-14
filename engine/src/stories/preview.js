// Look-dev preview: Trevor walking down the sunset street, close-up, then aerial reveal of zombies.
import { TREVOR, zombieSpec } from '../character.js';
import { smooth, clamp, easeOut } from '../util.js';

let trevor, zombies = [];
const SPEED = 3.0;
const trevorZ = (t) => 4 - SPEED * Math.min(t, 6) - (t > 6 ? SPEED * 0.4 * (t - 6) : 0);

export default {
  duration: 10,
  setup({ scene, makeCharacter }) {
    trevor = makeCharacter(scene, TREVOR);
    for (let i = 0; i < 7; i++) {
      const z = makeCharacter(scene, zombieSpec(i));
      z.home = [(i % 2 ? 1 : -1) * (1 + (i * 1.7) % 5), -62 - i * 5];
      zombies.push(z);
    }
  },
  update(t, { world, renderer }) {
    world.applyMood('sunset', 'tense', smooth((t - 6) / 3), renderer);
    const z = trevorZ(t);
    trevor.root.position.set(0.6, 0, z);
    const walking = t < 6 ? 1 : clamp(1 - (t - 6) * 0.8);
    trevor.pose({ t, walk: walking, phase: (4 - z) * 1.25, lookBack: t > 4.6 && t < 6 ? Math.sin((t - 4.6) / 1.4 * Math.PI) * 0.7 : 0, headPitch: 0 });
    trevor.setFace(t > 7 ? 'scared' : t > 4.6 ? 'worried' : 'neutral');
    world.focusShadow(trevor.root.position);
    zombies.forEach((zb, i) => {
      const zz = zb.home[1] + t * 0.9;
      zb.root.position.set(zb.home[0], 0, zz);
      zb.root.rotation.y = Math.PI + Math.sin(t * 0.4 + i) * 0.15; // facing toward +Z (toward Trevor)
      zb.pose({ t: t + i, zombie: 1, phase: zz * 1.6 + i });
    });
  },
  shots: [
    { // behind Trevor, low tracking like the reference shot
      start: 0, end: 3.4, fov: 48,
      from: { pos: (t) => [0.0, 4.2, trevorZ(t) + 15], look: (t) => [0.3, 5.5, trevorZ(t) - 30] },
      to:   { pos: (t) => [0.4, 4.4, trevorZ(t) + 12.5], look: (t) => [0.5, 5.6, trevorZ(t) - 30] },
    },
    { // front close-up, dolly backward as he walks and glances behind
      start: 3.4, end: 6.4, fov: 36,
      from: { pos: (t) => [2.2, 5.0, trevorZ(t) - 9.5], look: (t) => [0.6, 4.0, trevorZ(t)] },
      to:   { pos: (t) => [2.8, 5.0, trevorZ(t) - 7.5], look: (t) => [0.6, 4.2, trevorZ(t)] },
    },
    { // aerial crane up revealing the horde down the street
      start: 6.4, end: 10, fov: 42, shake: 0.03,
      from: { pos: (t) => [-2, 6, trevorZ(t) + 8], look: (t) => [0, 3, trevorZ(t) - 15] },
      to:   { pos: (t) => [-6, 26, trevorZ(t) + 18], look: (t) => [0, 0, trevorZ(t) - 40] },
    },
  ],
  fade: (t) => (t < 0.4 ? 1 - t / 0.4 : t > 9.6 ? (t - 9.6) / 0.4 : 0),
};
