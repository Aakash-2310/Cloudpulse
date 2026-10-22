/**
 * Seeds MongoDB with a realistic multi-cloud demo environment.
 *
 *   npm run seed            # wipe and reseed
 *   npm run seed -- --if-empty   # only seed when the database has no users/accounts
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { connectRedis, disconnectRedis } from '../config/redis';
import { isDatabaseEmpty, seedDatabase } from '../services/seedService';
import { logger } from '../utils/logger';

async function main() {
  const ifEmpty = process.argv.includes('--if-empty');
  await connectDatabase();
  await connectRedis();
  if (ifEmpty && !(await isDatabaseEmpty())) {
    logger.info('Database already contains data – skipping seed (--if-empty).');
  } else {
    const summary = await seedDatabase({ reset: true });
    console.table(summary);
    console.log('\nDemo login → admin@cloudpulse.com / Admin@123 (demo only – change for any shared deployment)\n');
  }
  await disconnectRedis();
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error('Seed failed', err);
  await disconnectRedis().catch(() => undefined);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
