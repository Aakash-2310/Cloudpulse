import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { createApp } from './app';
import { logger } from './utils/logger';
import { isDatabaseEmpty, seedDatabase } from './services/seedService';
import { backfillMetrics, refreshServiceHealth, runMonitoringCycle, startMonitoring, stopMonitoring } from './services/monitoringService';
import { ensureCostsUpToDate } from './services/cloudService';

async function bootstrap() {
  await connectDatabase();
  await connectRedis();

  if (env.demoMode && (await isDatabaseEmpty())) {
    logger.info('DEMO_MODE: empty database detected – seeding demo environment');
    await seedDatabase({ reset: false });
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`CloudPulse API listening on :${env.port} (${env.nodeEnv}, provider mode: ${env.cloudProviderMode})`);
  });

  if (env.simulationEnabled) {
    // Catch up on anything missed while offline, then start the polling loop.
    backfillMetrics()
      .then(() => ensureCostsUpToDate(true))
      .then(() => refreshServiceHealth())
      .then(() => runMonitoringCycle())
      .catch((err) => logger.error('Startup catch-up failed', err))
      .finally(() => startMonitoring());
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received – shutting down`);
    stopMonitoring();
    server.close(async () => {
      await disconnectRedis();
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));

bootstrap().catch((err) => {
  logger.error('Failed to start CloudPulse API', err);
  process.exit(1);
});
