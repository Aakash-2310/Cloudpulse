import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectDatabase(retries = 10, delayMs = 3000): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
      logger.info(`MongoDB connected (${conn.connection.host}/${conn.connection.name})`);
      mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', err));
      mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
      return conn;
    } catch (err) {
      logger.warn(`MongoDB connection attempt ${attempt}/${retries} failed`, (err as Error).message);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Unable to connect to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
