import type { HealthStatus, ResourceType } from '../models/types';
import type { MetricContext } from '../providers/CloudProvider';

export const THRESHOLDS = {
  cpu: { warning: 75, critical: 90 },
  memory: { warning: 80, critical: 92 },
  disk: { warning: 85, critical: 95 },
};

export function storagePct(storage?: { usedGB?: number | null; totalGB?: number | null } | null): number {
  if (!storage?.totalGB) return 0;
  return ((storage.usedGB ?? 0) / storage.totalGB) * 100;
}

/** Derives a health status from utilisation; stopped resources report "unknown". */
export function deriveStatus(r: { state?: string | null; cpu?: number | null; memory?: number | null; storage?: { usedGB?: number | null; totalGB?: number | null } | null }): HealthStatus {
  if (r.state === 'stopped') return 'unknown';
  const cpu = r.cpu ?? 0;
  const mem = r.memory ?? 0;
  const disk = storagePct(r.storage);
  if (cpu >= THRESHOLDS.cpu.critical || mem >= THRESHOLDS.memory.critical || disk >= THRESHOLDS.disk.critical) return 'critical';
  if (cpu >= THRESHOLDS.cpu.warning || mem >= THRESHOLDS.memory.warning || disk >= THRESHOLDS.disk.warning) return 'warning';
  return 'healthy';
}

interface MetricSource {
  resourceId: string;
  type: string;
  state?: string | null;
  cpu?: number | null;
  memory?: number | null;
  network?: number | null;
  storage?: { usedGB?: number | null; totalGB?: number | null } | null;
  baseline?: { cpu?: number | null; memory?: number | null; network?: number | null } | null;
}

export function toMetricContext(r: MetricSource): MetricContext {
  return {
    resourceId: r.resourceId,
    type: r.type as ResourceType,
    state: r.state ?? 'running',
    cpu: r.cpu ?? 0,
    memory: r.memory ?? 0,
    network: r.network ?? 0,
    storage: { usedGB: r.storage?.usedGB ?? 0, totalGB: r.storage?.totalGB ?? 0 },
    baseline: {
      cpu: r.baseline?.cpu ?? 30,
      memory: r.baseline?.memory ?? 45,
      network: r.baseline?.network ?? 50,
    },
  };
}
