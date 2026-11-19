/** npm run demo:cases  -> runs the 10 acceptance cases against your DB and writes docs/ACCEPTANCE_REPORT.md */
import fs from 'node:fs';
import path from 'node:path';
import { connectDb, disconnectDb } from '../db.js';
import { seedDatabase } from './seed.js';
import { renderReport, runAcceptance } from '../services/acceptance.js';
import { getOcr } from '../services/ocr.js';

(async () => {
  await connectDb();
  await seedDatabase({ log: () => undefined }); // make sure the catalogue exists (never duplicates)
  const results = await runAcceptance((m) => console.log(m));
  const out = path.resolve(process.cwd(), '../docs/ACCEPTANCE_REPORT.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderReport(results));
  console.log(`\nReport written to ${out}`);
  await getOcr().close?.();
  await disconnectDb();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
