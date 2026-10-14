/** Small deterministic random source, so the same inputs and seed always give the same simulation. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeRng(seed: number) {
  let s = seed >>> 0;
  let spare: number | null = null;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let u = 0;
    while (u === 0) u = uniform();
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * uniform();
    spare = r * Math.sin(a);
    return r * Math.cos(a);
  };
  return { uniform, normal };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
