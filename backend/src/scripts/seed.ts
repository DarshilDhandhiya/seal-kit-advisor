/**
 * Idempotent seed script.  npm run seed            -> upsert (never duplicates; keeps staff edits)
 *                          npm run seed -- --reset -> wipe catalogue/conversation collections first, then seed
 * Seeds the EXACT fictional dataset from data/seed.json (Appendix A) + demo admin/staff users.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { Assembly, AuditLog, Conversation, Fitment, Kit, Lead, Machine, Message, ReviewTicket, User } from '../models/index.js';

const HI_LABELS: Record<string, string> = { BOOM: 'बूम सिलेंडर', DIPPER: 'डिप्पर सिलेंडर', BUCKET: 'बकेट सिलेंडर', STAB: 'स्टेबिलाइज़र सिलेंडर' };

export interface SeedFile {
  machines: any[];
  assemblies: any[];
  kits: any[];
  fitments: any[];
  testCases?: any[];
}

export function loadSeed(file = path.resolve(process.cwd(), 'data/seed.json')): SeedFile {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as SeedFile;
}

/** Referential integrity checks so a broken seed fails loudly. */
export function validateSeed(seed: SeedFile): string[] {
  const errs: string[] = [];
  const serials = new Set(seed.machines.map((m) => m.serial));
  const asms = new Set(seed.assemblies.map((a) => a.code));
  const kits = new Map(seed.kits.map((k) => [k.sku, k]));
  for (const k of seed.kits) if (!asms.has(k.assemblyCode)) errs.push(`kit ${k.sku}: unknown assembly ${k.assemblyCode}`);
  const seen = new Set<string>();
  for (const f of seed.fitments) {
    const key = `${f.machineSerial}|${f.assemblyCode}|${f.kitSku}`;
    if (seen.has(key)) errs.push(`duplicate fitment ${key}`);
    seen.add(key);
    if (!serials.has(f.machineSerial)) errs.push(`fitment ${key}: unknown machine`);
    if (!asms.has(f.assemblyCode)) errs.push(`fitment ${key}: unknown assembly`);
    const k = kits.get(f.kitSku);
    if (!k) errs.push(`fitment ${key}: unknown kit`);
    else if (k.assemblyCode !== f.assemblyCode) errs.push(`fitment ${key}: kit belongs to ${k.assemblyCode}`);
  }
  return errs;
}

async function upsertAll(model: any, docs: any[], keyOf: (d: any) => Record<string, unknown>, overwrite: boolean) {
  if (!docs.length) return;
  await model.bulkWrite(
    docs.map((d) => ({
      updateOne: { filter: keyOf(d), update: overwrite ? { $set: d } : { $setOnInsert: d }, upsert: true },
    })),
  );
}

export async function seedDatabase(opts: { reset?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => undefined);
  const seed = loadSeed();
  const errs = validateSeed(seed);
  if (errs.length) throw new Error('Seed validation failed:\n - ' + errs.join('\n - '));

  if (opts.reset) {
    await Promise.all([Machine, Assembly, Kit, Fitment, Conversation, Message, Lead, ReviewTicket, AuditLog].map((m: any) => m.deleteMany({})));
    log('Reset: collections cleared');
  }
  const ow = Boolean(opts.reset);
  await upsertAll(Machine, seed.machines.map(({ serial, model, family, variant, year, status, notes }) => ({ serial, model, family, variant, year, status, notes })), (d) => ({ serial: d.serial }), ow);
  await upsertAll(Assembly, seed.assemblies.map((a) => ({ ...a, labelHi: HI_LABELS[a.code] ?? '' })), (d) => ({ code: d.code }), ow);
  await upsertAll(Kit, seed.kits, (d) => ({ sku: d.sku }), ow);
  await upsertAll(Fitment, seed.fitments, (d) => ({ machineSerial: d.machineSerial, assemblyCode: d.assemblyCode, kitSku: d.kitSku }), ow);

  const users = [
    { email: config.ADMIN_EMAIL.toLowerCase(), name: 'Demo Admin', role: 'admin' as const, pw: config.ADMIN_PASSWORD },
    { email: config.STAFF_EMAIL.toLowerCase(), name: 'Demo Staff', role: 'staff' as const, pw: config.STAFF_PASSWORD },
  ];
  for (const u of users) {
    if (!(await User.exists({ email: u.email }))) {
      await User.create({ email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.pw, 10) });
      log(`Created user ${u.email} (${u.role})`);
    }
  }
  const counts = {
    machines: await Machine.countDocuments(),
    assemblies: await Assembly.countDocuments(),
    kits: await Kit.countDocuments(),
    fitments: await Fitment.countDocuments(),
    users: await User.countDocuments(),
  };
  log(`Seed complete: ${JSON.stringify(counts)}`);
  return counts;
}

// CLI entry
if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'seed.ts')) || process.argv[1]?.endsWith(path.join('scripts', 'seed.js'))) {
  (async () => {
    await connectDb();
    await seedDatabase({ reset: process.argv.includes('--reset'), log: (m) => console.log(m) });
    await disconnectDb();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
