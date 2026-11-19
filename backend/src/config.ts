import 'dotenv/config';
import crypto from 'node:crypto';
import { z } from 'zod';

// Treat empty strings in .env as "not set".
const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
function str(): z.ZodType<string | undefined>;
function str(def: string): z.ZodType<string>;
function str(def?: string): z.ZodType<string | undefined> {
  return z.preprocess(emptyToUndef, def === undefined ? z.string().optional() : z.string().default(def)) as unknown as z.ZodType<string | undefined>;
}
const num = (def: number) => z.preprocess(emptyToUndef, z.coerce.number().default(def)) as unknown as z.ZodType<number>;
const bool = (def: boolean) =>
  z.preprocess(emptyToUndef, z.enum(['true', 'false']).default(def ? 'true' : 'false')).transform((v) => v === 'true') as unknown as z.ZodType<boolean>;

const schema = z.object({
  NODE_ENV: str('development'),
  PORT: num(4000),
  MONGODB_URI: z.string().min(10, 'MONGODB_URI is required (MongoDB Atlas connection string)'),
  MONGODB_DB: str('sealkit_demo'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: str('8h'),
  ADMIN_EMAIL: str('admin@demo.local'),
  ADMIN_PASSWORD: str('Admin@12345'),
  STAFF_EMAIL: str('staff@demo.local'),
  STAFF_PASSWORD: str('Staff@12345'),
  CORS_ORIGINS: str('http://localhost:5173'),
  PUBLIC_BASE_URL: str('http://localhost:4000'),
  SERVE_FRONTEND: bool(true),

  WHATSAPP_VERIFY_TOKEN: str(),
  WHATSAPP_APP_SECRET: str(),
  WHATSAPP_ACCESS_TOKEN: str(),
  WHATSAPP_PHONE_NUMBER_ID: str(),
  WHATSAPP_API_VERSION: str('v21.0'),
  WHATSAPP_GRAPH_URL: str('https://graph.facebook.com'),
  ALLOW_UNSIGNED_WEBHOOKS: bool(false),
  SEND_MAX_ATTEMPTS: num(4),

  OCR_PROVIDER: z.preprocess(emptyToUndef, z.enum(['tesseract', 'mock']).default('tesseract')) as unknown as z.ZodType<'tesseract' | 'mock'>,
  OCR_MIN_CONFIDENCE: num(40), // below this we ask for a clearer photo
  OCR_CONFIRM_CONFIDENCE: num(68), // below this we warn "please double-check"
  OCR_TIMEOUT_MS: num(60000),
  OCR_LANG_PATH: str(),

  MEDIA_DIR: str('./storage/media'),
  MEDIA_ENCRYPTION_KEY: str(), // 64 hex chars (32 bytes). Derived from JWT_SECRET if absent.
  MEDIA_RETENTION_HOURS: num(24),
  MAX_IMAGE_BYTES: num(5 * 1024 * 1024),
  LOG_LEVEL: str('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${msg}\nCopy backend/.env.example to backend/.env and fill it in.`);
}
const env = parsed.data;

let mediaKey: Buffer;
if (env.MEDIA_ENCRYPTION_KEY) {
  if (!/^[0-9a-fA-F]{64}$/.test(env.MEDIA_ENCRYPTION_KEY)) {
    throw new Error('MEDIA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32');
  }
  mediaKey = Buffer.from(env.MEDIA_ENCRYPTION_KEY, 'hex');
} else {
  mediaKey = crypto.createHash('sha256').update(`media:${env.JWT_SECRET}`).digest();
}

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  mediaKey,
  whatsappConfigured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
};
export type Config = typeof config;
