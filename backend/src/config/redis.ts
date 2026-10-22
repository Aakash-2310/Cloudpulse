import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let client: Redis | null = null;
let ready = false;

export function getRedis(): Redis | null {
  return client && ready ? client : null;
}

export function isRedisConnected(): boolean {
  return ready;
}

export async function connectRedis(): Promise<void> {
  client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });

  client.on('ready', () => {
    ready = true;
    logger.info(`Redis connected (${env.redisUrl.replace(/\/\/.*@/, '//***@')})`);
  });
  client.on('end', () => {
    ready = false;
  });
  client.on('error', (err) => {
    if (ready) logger.warn('Redis error', err.message);
    ready = false;
  });

  try {
    await client.connect();
  } catch (err) {
    // The API keeps serving from MongoDB if Redis is down; ioredis keeps retrying in the background.
    logger.warn('Redis unavailable at startup – continuing without cache until it reconnects', (err as Error).message);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
    ready = false;
  }
}
