import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

const PREFIX = 'cloudpulse:';

/** Cache key namespaces. Invalidating a namespace removes every key under it. */
export const CacheKeys = {
  dashboard: 'dashboard',
  resources: 'resources',
  providers: 'providers',
  serviceHealth: 'service-health',
  alerts: 'alerts',
  costs: 'costs',
  monitoring: 'monitoring',
} as const;

const stats = { hits: 0, misses: 0 };

export function cacheStats() {
  return { ...stats };
}

/** Builds a deterministic key from a namespace and a parameter object. */
export function buildKey(namespace: string, params: Record<string, unknown> = {}): string {
  const parts = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => `${k}=${String(params[k])}`);
  return `${PREFIX}${namespace}${parts.length ? ':' + parts.join('&') : ''}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn('Redis GET failed', (err as Error).message);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('Redis SET failed', (err as Error).message);
  }
}

/**
 * Read-through cache: returns the cached value when present, otherwise runs the loader,
 * stores the result with the given TTL and returns it. Falls back to the loader when Redis is down.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) {
    stats.hits += 1;
    return hit;
  }
  stats.misses += 1;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Removes every key in the given namespaces (uses SCAN, safe for production). */
export async function invalidate(...namespaces: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const ns of namespaces) {
      const pattern = `${PREFIX}${ns}*`;
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    }
  } catch (err) {
    logger.warn('Redis invalidation failed', (err as Error).message);
  }
}
