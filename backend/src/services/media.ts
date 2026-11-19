import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { Message } from '../models/index.js';

/**
 * Inbound plate photos are personal data: they are validated, stored ENCRYPTED (AES-256-GCM) with a
 * retention limit, only readable through an authenticated admin endpoint, and purged automatically.
 */
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Detect the real type from magic bytes (the declared mime type is not trusted). */
export function sniffImageMime(buf: Buffer): (typeof ALLOWED_MIME)[number] | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export class ImageRejected extends Error {
  constructor(public reason: 'too_large' | 'bad_type' | 'empty') {
    super(`Image rejected: ${reason}`);
  }
}

export function validateImage(buf: Buffer): (typeof ALLOWED_MIME)[number] {
  if (!buf || buf.length === 0) throw new ImageRejected('empty');
  if (buf.length > config.MAX_IMAGE_BYTES) throw new ImageRejected('too_large');
  const mime = sniffImageMime(buf);
  if (!mime) throw new ImageRejected('bad_type');
  return mime;
}

export function encrypt(buf: Buffer, key = config.mediaKey): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decrypt(blob: Buffer, key = config.mediaKey): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

const dir = () => path.resolve(config.MEDIA_DIR);

export async function saveMedia(buf: Buffer, mime: string) {
  await fs.mkdir(dir(), { recursive: true, mode: 0o700 });
  const file = `${crypto.randomUUID()}.bin`;
  await fs.writeFile(path.join(dir(), file), encrypt(buf), { mode: 0o600 });
  return {
    mime,
    size: buf.length,
    sha256: sha256(buf),
    file,
    expiresAt: new Date(Date.now() + config.MEDIA_RETENTION_HOURS * 3600_000),
  };
}

export async function readMedia(file: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.bin$/.test(file)) throw new Error('Invalid media file name'); // no path traversal
  return decrypt(await fs.readFile(path.join(dir(), file)));
}

export async function deleteMediaFile(file: string | null | undefined) {
  if (!file || !/^[0-9a-f-]{36}\.bin$/.test(file)) return;
  await fs.rm(path.join(dir(), file), { force: true });
}

/** Retention job: delete expired files, keep the audit metadata (hash, OCR text). */
export async function purgeExpiredMedia(now = new Date()): Promise<number> {
  const expired = await Message.find({ 'media.file': { $ne: null }, 'media.expiresAt': { $lte: now }, 'media.deletedAt': null });
  let n = 0;
  for (const m of expired) {
    await deleteMediaFile(m.media?.file);
    m.set('media.file', null);
    m.set('media.deletedAt', now);
    await m.save();
    n++;
  }
  if (n) logger.info({ purged: n }, 'expired plate images deleted');
  return n;
}

export function startRetentionJob(everyMs = 15 * 60_000) {
  const run = () => purgeExpiredMedia().catch((e) => logger.error({ err: e }, 'retention job failed'));
  run();
  const t = setInterval(run, everyMs);
  t.unref();
  return t;
}
