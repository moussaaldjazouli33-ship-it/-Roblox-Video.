// Outils mathématiques déterministes (tout est fonction du temps t → rendu reproductible image par image)
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = k => k * k * (3 - 2 * k);
export const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = k => 1 - Math.pow(1 - k, 3);
export const easeIn = k => k * k * k;
export const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
export const seg = (t, a, b, e = smooth) => e(range(t, a, b));
export const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const pulse = (t, a, b, fade = 0.1) => Math.min(range(t, a, a + fade), 1 - range(t, b - fade, b));

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// bruit 1D lisse et déterministe (secousses de caméra, scintillements)
export function noise1(x, seed = 0) {
  const h = n => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}
// Interpolation le long d'une liste de clés [[t, valeur], ...] (valeurs nombres ou tableaux)
export function keys(t, list, e = easeInOut) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 0; i < list.length - 1; i++) {
    const [t0, v0] = list[i], [t1, v1] = list[i + 1];
    if (t <= t1) {
      const k = e(range(t, t0, t1));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return list[list.length - 1][1];
}
