import { connectDb, disconnectDb } from '../src/db.js';
import { seedDatabase } from '../src/scripts/seed.js';

/** Integration tests need MongoDB: set TEST_MONGODB_URI (a DISPOSABLE database; it is wiped). */
export const hasDb = Boolean(process.env.TEST_MONGODB_URI);

export async function setupDb() {
  if (!/test/i.test(process.env.MONGODB_DB ?? '')) throw new Error('Refusing to wipe a database whose name does not contain "test"');
  await connectDb();
  await seedDatabase({ reset: true });
}
export const teardownDb = () => disconnectDb();
