import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { logger } from './logger.js';
import { User } from './models/index.js';
import { startRetentionJob } from './services/media.js';
import { getOcr } from './services/ocr.js';
import { drainWebhookQueue } from './routes/webhook.js';

async function ensureDemoUsers() {
  if ((await User.countDocuments()) > 0) return;
  await User.create([
    { email: config.ADMIN_EMAIL.toLowerCase(), name: 'Demo Admin', role: 'admin', passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 10) },
    { email: config.STAFF_EMAIL.toLowerCase(), name: 'Demo Staff', role: 'staff', passwordHash: await bcrypt.hash(config.STAFF_PASSWORD, 10) },
  ]);
  logger.warn('No users existed: created demo admin/staff from ADMIN_*/STAFF_* env. Change these passwords before any real deployment.');
}

async function main() {
  await connectDb();
  await ensureDemoUsers();
  const app = createApp();
  const retention = startRetentionJob();
  const server = app.listen(config.PORT, () => logger.info(`Seal-kit advisor API listening on :${config.PORT} (OCR=${config.OCR_PROVIDER}, WhatsApp ${config.whatsappConfigured ? 'configured' : 'NOT configured - simulator only'})`));

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    clearInterval(retention);
    server.close();
    await drainWebhookQueue().catch(() => undefined);
    await getOcr().close?.().catch(() => undefined);
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
