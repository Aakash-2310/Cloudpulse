import type { MetricContext, MetricSample } from '../providers/CloudProvider';
import type { ResourceType } from '../models/types';
import { clamp, createRng, gaussian, hashString } from './random';

/** Request volume per minute that a resource of each type typically serves. */
const REQUEST_BASE: Record<ResourceType, number> = {
  'virtual-machine': 900,
  'kubernetes-cluster': 6500,
  database: 2400,
  'object-storage': 1800,
  'load-balancer': 12000,
  'virtual-network': 0,
  container: 3200,
  'serverless-function': 1500,
};

/** Daily traffic curve: quiet overnight (UTC), peak during business hours. */
function diurnal(date: Date): number {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const curve = Math.sin(((hour - 8) / 24) * 2 * Math.PI); // peaks ~14:00 UTC
  const weekend = [0, 6].includes(date.getUTCDay()) ? -0.25 : 0;
  return curve + weekend;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function storagePercent(ctx: MetricContext, daysAgo: number): number {
  if (!ctx.storage.totalGB) return 0;
  const current = (ctx.storage.usedGB / ctx.storage.totalGB) * 100;
  // Storage grows ~0.25 percentage points per day, so history trends upward.
  return clamp(current - daysAgo * 0.25, 2, 100);
}

function buildSample(ctx: MetricContext, timestamp: Date, cpu: number, memory: number, net: number, rng: () => number): MetricSample {
  const now = Date.now();
  const daysAgo = Math.max(0, (now - timestamp.getTime()) / 86_400_000);
  const load = diurnal(timestamp);
  const stopped = ctx.state === 'stopped';
  const reqBase = REQUEST_BASE[ctx.type];
  const requestCount = stopped || reqBase === 0 ? 0 : Math.max(0, Math.round(reqBase * (1 + load * 0.45) * (0.9 + rng() * 0.2)));
  // Error rate rises sharply once the resource is saturated.
  const saturation = Math.max(0, cpu - 80) / 20;
  const errorRate = stopped ? 0 : clamp(0.15 + rng() * 0.35 + saturation * 4.5, 0, 25);
  const inShare = 0.55 + rng() * 0.1;
  return {
    resourceId: ctx.resourceId,
    timestamp,
    cpu: round(cpu, 1),
    memory: round(memory, 1),
    networkIn: round(net * inShare, 1),
    networkOut: round(net * (1 - inShare), 1),
    diskUsage: round(storagePercent(ctx, daysAgo), 1),
    requestCount,
    errorRate: round(errorRate, 2),
  };
}

/** Deterministic historical series between `from` and `to` at `stepMinutes` resolution. */
export function generateMetricSeries(ctx: MetricContext, from: Date, to: Date, stepMinutes: number): MetricSample[] {
  const samples: MetricSample[] = [];
  const stepMs = stepMinutes * 60_000;
  const start = Math.ceil(from.getTime() / stepMs) * stepMs;
  const seed = hashString(ctx.resourceId);
  for (let t = start; t <= to.getTime(); t += stepMs) {
    const ts = new Date(t);
    const rng = createRng(seed ^ Math.floor(t / 60_000));
    if (ctx.state === 'stopped') {
      samples.push(buildSample(ctx, ts, 0, 0, 0, rng));
      continue;
    }
    const load = diurnal(ts);
    // Occasional short spikes (~2% of samples) make charts look like real telemetry.
    const spike = rng() < 0.02 ? 15 + rng() * 20 : 0;
    const cpu = clamp(ctx.baseline.cpu + load * ctx.baseline.cpu * 0.28 + gaussian(rng) * 4 + spike, 1, 100);
    const memory = clamp(ctx.baseline.memory + load * 4 + gaussian(rng) * 2.2 + spike * 0.3, 3, 100);
    const net = Math.max(0, ctx.baseline.network * (1 + load * 0.5) * (0.85 + rng() * 0.3) + spike * 2);
    samples.push(buildSample(ctx, ts, cpu, memory, net, rng));
  }
  return samples;
}

/**
 * Next live sample: mean-reverts from the resource's current value toward its
 * time-of-day baseline with noise, so values drift smoothly between polls.
 */
export function nextLiveSample(ctx: MetricContext, timestamp = new Date()): MetricSample {
  const rng = Math.random;
  if (ctx.state === 'stopped') return buildSample(ctx, timestamp, 0, 0, 0, rng);
  const load = diurnal(timestamp);
  const cpuTarget = ctx.baseline.cpu + load * ctx.baseline.cpu * 0.28;
  const memTarget = ctx.baseline.memory + load * 4;
  const netTarget = ctx.baseline.network * (1 + load * 0.5);
  const spike = rng() < 0.03 ? 12 + rng() * 18 : 0;
  const cpu = clamp(ctx.cpu + (cpuTarget - ctx.cpu) * 0.35 + gaussian(rng) * 3 + spike, 1, 100);
  const memory = clamp(ctx.memory + (memTarget - ctx.memory) * 0.25 + gaussian(rng) * 1.2, 3, 100);
  const net = Math.max(0, ctx.network + (netTarget - ctx.network) * 0.35 + gaussian(rng) * ctx.baseline.network * 0.08 + spike);
  return buildSample(ctx, timestamp, cpu, memory, net, rng);
}
