// Génère la piste de bruitages (assets/audio/sfx.wav) synchronisée sur l'histoire — synthèse pure, sans fichier externe.
import fs from 'node:fs';
const SR = 44100, DUR = 133.5, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 1234; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const add = (t, i, v, pan = 0) => { const k = Math.floor(t * SR) + i; if (k >= 0 && k < N) { L[k] += v * (1 - Math.max(0, pan)); R[k] += v * (1 + Math.min(0, pan)); } };
// filtres simples
const lp = (a) => { let y = 0; return x => (y += a * (x - y)); };
const hp = (a) => { let y = 0, px = 0; return x => { y = a * (y + x - px); px = x; return y; }; };
const env = (i, att, dec) => { const t = i / SR; return t < att ? t / att : Math.exp(-(t - att) / dec); };

function noiseHit(t, dur, { cut = 0.05, dec = 0.3, att = 0.002, gain = 0.8, hpA = 0, pan = 0 } = {}) {
  const f = lp(cut), h = hpA ? hp(hpA) : x => x;
  for (let i = 0; i < dur * SR; i++) add(t, i, h(f(rnd())) * env(i, att, dec) * gain, pan);
}
function tone(t, dur, f0, f1, { gain = 0.3, dec = 0.5, att = 0.005, type = 'sin', vib = 0 } = {}) {
  let ph = 0;
  for (let i = 0; i < dur * SR; i++) {
    const k = i / (dur * SR), f = f0 * Math.pow(f1 / f0, k) * (1 + vib * Math.sin(i / SR * 6 * Math.PI * 2));
    ph += f / SR; const s = type === 'saw' ? 2 * (ph % 1) - 1 : type === 'sq' ? (ph % 1 < 0.5 ? 1 : -1) : Math.sin(ph * Math.PI * 2);
    add(t, i, s * env(i, att, dec) * gain);
  }
}
const boom = (t, g = 1) => { tone(t, 2.5, 70, 28, { gain: 0.9 * g, dec: 0.7 }); noiseHit(t, 2.5, { cut: 0.08, dec: 0.5, gain: 1.2 * g }); noiseHit(t, 0.4, { cut: 0.6, dec: 0.08, gain: 0.5 * g }); };
const thunder = (t, g = 1) => { noiseHit(t, 0.25, { cut: 0.5, dec: 0.05, gain: 0.7 * g }); noiseHit(t + 0.05, 5, { cut: 0.015, dec: 1.4, att: 0.2, gain: 2.6 * g }); tone(t, 3, 45, 30, { gain: 0.4 * g, dec: 1.2, att: 0.1 }); };
const click = (t, g = 0.5) => { noiseHit(t, 0.03, { cut: 0.9, dec: 0.004, gain: g, hpA: 0.6 }); tone(t, 0.06, 2400, 1800, { gain: g * 0.4, dec: 0.01 }); };
const thud = (t, g = 0.7) => { tone(t, 0.35, 110, 50, { gain: g, dec: 0.09 }); noiseHit(t, 0.2, { cut: 0.1, dec: 0.05, gain: g * 0.6 }); };
const whoosh = (t, dur = 0.6, g = 0.4) => { const f = lp(0.08); for (let i = 0; i < dur * SR; i++) { const k = i / (dur * SR); add(t, i, f(rnd()) * Math.sin(Math.PI * k) * g * 3); } };
const heartbeat = (t, g = 0.9) => { tone(t, 0.25, 60, 40, { gain: g, dec: 0.07 }); tone(t + 0.22, 0.25, 55, 38, { gain: g * 0.7, dec: 0.07 }); };
const crackle = (t, dur, g = 0.25) => { for (let k = 0; k < dur * 40; k++) { const tt = t + Math.abs(rnd()) * dur; noiseHit(tt, 0.02, { cut: 0.7, dec: 0.005, gain: g * Math.abs(rnd()), hpA: 0.5 }); } };
const stinger = (t, g = 0.35) => { for (const f of [55, 82.4, 110, 116.5]) tone(t, 3.5, f, f * 0.97, { gain: g, dec: 1.4, att: 0.02, type: 'saw' }); boom(t, 0.5); };

// --- Ambiance : nappe grave continue, ville la nuit ---
{ const f = lp(0.004), f2 = lp(0.02);
  for (let i = 0; i < N; i++) { const t = i / SR; let a = t < 14.1 || t > 28.6 ? 0.18 : 0.08; if (t > 75.6 && t < 77.4) a *= 0.3;
    const d = f(rnd()) * a * 6 + Math.sin(t * 2 * Math.PI * 41) * 0.012 * (t > 28.6 ? 1 : 0.3); add(0, i, d); } }
// pluie (à partir de 82.4)
{ const h = hp(0.85), f = lp(0.35); for (let i = Math.floor(82.4 * SR); i < N; i++) { const t = i / SR, a = Math.min(1, (t - 82.4) / 1.5) * 0.11; add(0, i, f(h(rnd())) * a, rnd() * 0.3); } }

// --- Événements, calés sur la voix off ---
tone(0.2, 3.5, 40, 38, { gain: 0.35, dec: 3, att: 1.2, type: 'saw' });           // ouverture : drone
tone(5.7, 0.8, 300, 40, { gain: 0.35, dec: 0.4 }); click(5.7, 0.6);               // extinction
tone(6.75, 0.6, 60, 400, { gain: 0.25, dec: 0.3 }); click(6.75, 0.6);             // rallumage
for (let k = 0; k < 6; k++) noiseHit(9.3 + k * 0.3, 0.6, { cut: 0.02, dec: 0.4, gain: 1.4 }); boom(9.3, 0.6); // apparition : séisme
[12.0, 12.35, 12.7, 13.0, 13.25, 13.5, 13.75].forEach(f => { click(f, 0.5); whoosh(f, 0.25, 0.25); });  // disparitions
stinger(17.72, 0.25);                                                              // il se fige
for (const f of [880, 1320, 1760]) tone(21.82, 2, f, f, { gain: 0.06, dec: 0.9, att: 0.05 }); whoosh(21.7, 0.5, 0.3);
for (let i = 0; i < 6; i++) { thud(24.15 + i * 0.32 + 0.4, 0.6); click(24.15 + i * 0.32 + 0.4, 0.3); }   // tours
for (let i = 0; i < 6; i++) thud(26.6 + i * 0.22, 0.35);                         // générateurs
heartbeat(37.4); heartbeat(38.0);                                                  // « until last night »
tone(44.9, 1.2, 1200, 1200, { gain: 0.05, dec: 0.15, type: 'sq' });                // bip 2:00
boom(46.18, 1.2); crackle(46.25, 1.8, 0.35); for (let k = 0; k < 14; k++) tone(46.6 + Math.abs(rnd()) * 1.6, 0.2, 3000 + rnd() * 1500, 2500, { gain: 0.05, dec: 0.05 }); // explosion + verre
crackle(54.0, 1.1, 0.3); noiseHit(54.0, 1.1, { cut: 0.3, dec: 0.6, gain: 0.08, hpA: 0.5 });  // radio
for (let k = 0; k < 8; k++) { crackle(55.1 + k * 0.55, 0.15, 0.4); tone(55.1 + k * 0.55, 0.12, 120, 120, { gain: 0.12, dec: 0.05, type: 'saw' }); } // étincelles câble
for (let k = 0; k < 10; k++) tone(59.4 + k * 0.25, 0.12, 900, 900, { gain: 0.05, dec: 0.05, type: 'sq' });        // alarme générateur
for (let k = 0; k < 4; k++) tone(65.3 + k * 0.62, 0.62, 650, 950, { gain: 0.07, dec: 1, att: 0.05, vib: 0 }), tone(65.6 + k * 0.62, 0.62, 950, 650, { gain: 0.05, dec: 1, att: 0.05 }); // sirènes
for (let i = 0; i < 12; i++) click(68.1 + (i % 5) * 0.12 + i * 0.03, 0.25);                  // torches
click(74.66, 1.0); thud(74.68, 0.5);                                               // CLIC !
tone(75.64, 1.6, 220, 30, { gain: 0.4, dec: 0.8 }); noiseHit(75.64, 1.5, { cut: 0.03, dec: 0.6, gain: 0.5 }); // la ville s'éteint
thunder(82.58, 1.2); thunder(86.9, 0.6); thunder(92.3, 0.7); thunder(96.0, 0.5); thunder(100.42, 1.0); thunder(103.2, 0.8); thunder(109.9, 0.5); thunder(115.0, 0.6); thunder(121.4, 0.5); thunder(126.9, 0.4); thunder(131.6, 0.7);
thud(85.6, 0.8); noiseHit(86.5, 0.5, { cut: 0.3, dec: 0.15, gain: 0.4, hpA: 0.4 });      // glissade + plouf
tone(89.6, 0.85, 120, 100, { gain: 0.08, dec: 1, type: 'sq' }); click(90.45, 0.5);  // phares qui grésillent
thud(95.6, 0.9); thud(95.9, 0.5); whoosh(96.82, 1.3, 0.35); click(98.3, 0.4);       // chute + torche
for (let k = 0; k < 5; k++) heartbeat(98.9 + k * 0.72, 1.0);                        // le noir
whoosh(102.6, 0.5, 0.7); thud(103.3, 0.4);                                           // arraché
for (let i = 0; i < 10; i++) click(105.2 + i * 0.09, 0.3); tone(105.2, 1.0, 40, 400, { gain: 0.2, dec: 0.4 }); // lumières rallumées
stinger(113.64, 0.3);                                                                // révélation
for (let k = 0; k < 4; k++) heartbeat(124.38 + k * 0.85, 0.6);
for (let k = 0; k < 10; k++) click(131.25 + k * 0.07, 0.4); boom(131.95, 0.8);       // dernier noir

// normalisation + écriture WAV 16 bits stéréo
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.9 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
fs.mkdirSync('assets/audio', { recursive: true });
fs.writeFileSync('assets/audio/sfx.wav', buf);
console.log('assets/audio/sfx.wav écrit (' + DUR + ' s)');
