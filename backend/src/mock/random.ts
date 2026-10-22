/** Small deterministic random helpers so seeded data is stable between runs. */

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG – returns a function producing floats in [0, 1). */
export function createRng(seed: number | string): () => number {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
export function gaussian(rng: () => number = Math.random): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hex(rng: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += Math.floor(rng() * 16).toString(16);
  return out;
}

export function digits(rng: () => number, length: number): string {
  let out = String(1 + Math.floor(rng() * 9));
  for (let i = 1; i < length; i += 1) out += Math.floor(rng() * 10).toString();
  return out;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const DAY_MS = 86_400_000;
