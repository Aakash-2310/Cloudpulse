import dotenv from 'dotenv';
import path from 'path';

// Load backend/.env first, then the repository root .env (used by Docker Compose) as a fallback.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: int('PORT', 5000),
  mongoUri: required('MONGO_URI'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  cookieSecure: bool('COOKIE_SECURE', process.env.NODE_ENV === 'production'),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  demoMode: bool('DEMO_MODE', true),
  cloudProviderMode: (process.env.CLOUD_PROVIDER_MODE ?? 'mock') as 'mock' | 'live',
  simulationEnabled: bool('SIMULATION_ENABLED', true),
  simulationIntervalMs: int('SIMULATION_INTERVAL_MS', 60_000),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  cacheTtl: {
    dashboard: int('CACHE_TTL_DASHBOARD', 30),
    resources: int('CACHE_TTL_RESOURCES', 15),
    serviceHealth: int('CACHE_TTL_SERVICE_HEALTH', 10),
    providers: int('CACHE_TTL_PROVIDERS', 30),
    alerts: int('CACHE_TTL_ALERTS', 15),
    costs: int('CACHE_TTL_COSTS', 60),
  },
};
