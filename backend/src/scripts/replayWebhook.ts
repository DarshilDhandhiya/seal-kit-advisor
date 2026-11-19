/**
 * Safe webhook replay.
 *   npm run replay:webhook -- ../docs/webhook-samples/text-message.json
 *   npm run replay:webhook -- <file> --url http://localhost:4000/api/webhooks/whatsapp --repeat 2 --same-id
 * - Signs the body with WHATSAPP_APP_SECRET (same HMAC-SHA256 scheme Meta uses).
 * - By default every message id gets a unique suffix so a replay is a NEW message. Use --same-id to
 *   re-send the identical id (this proves idempotency: the second delivery must be ignored).
 * - Only send to a DEV/TEST deployment. Never replay captured production payloads.
 */
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { signBody } from '../services/whatsappClient.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] ?? 'true' : d;
};
if (!file) {
  console.error('Usage: npm run replay:webhook -- <payload.json> [--url URL] [--secret S] [--repeat N] [--same-id] [--from 9199...]');
  process.exit(2);
}
const url = flag('url', `http://localhost:${process.env.PORT ?? 4000}/api/webhooks/whatsapp`)!;
const secret = flag('secret', process.env.WHATSAPP_APP_SECRET);
if (!secret) {
  console.error('WHATSAPP_APP_SECRET (or --secret) is required to sign the payload.');
  process.exit(2);
}
if (/^https:\/\/.*(prod|production)/i.test(url)) console.warn('⚠️  URL looks like production. Replays belong on test environments only.');

const repeat = Number(flag('repeat', '1'));
const sameId = args.includes('--same-id');
const from = flag('from');
const run = Date.now().toString(36);

(async () => {
  for (let i = 0; i < repeat; i++) {
    let text = fs.readFileSync(path.resolve(file), 'utf8');
    if (!sameId) text = text.replace(/"id": "wamid\.([A-Z0-9_]+)"/g, (_m, id) => `"id": "wamid.${id}_${run}_${i}"`);
    if (from) text = text.replace(/919999900001/g, from);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signBody(text, secret) }, body: text });
    console.log(`#${i + 1} → HTTP ${res.status} ${await res.text()}`);
  }
})();
