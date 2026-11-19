import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';
import { ensureModelIndexes } from './models/index.js';

export async function connectDb(uri = config.MONGODB_URI, dbName = config.MONGODB_DB) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  await ensureModelIndexes();
  logger.info({ db: dbName }, 'MongoDB connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
