import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAcceptance } from '../src/services/acceptance.js';
import { getOcr } from '../src/services/ocr.js';
import { hasDb, setupDb, teardownDb } from './db.js';

const d = hasDb ? describe : describe.skip;

d('10 acceptance cases (real Tesseract OCR on fixture plates + MongoDB)', () => {
  beforeAll(setupDb);
  afterAll(async () => {
    await getOcr().close?.();
    await teardownDb();
  });

  it('all 10 cases pass with persisted state as expected', async () => {
    const results = await runAcceptance();
    for (const r of results) {
      const failed = [...r.steps.filter((s) => !s.pass).map((s) => `${s.input}\n${s.actual}`), ...r.checks.filter((c) => !c.pass).map((c) => `check: ${c.name} ${c.detail}`)];
      expect(failed, `case ${r.id} ${r.title}`).toEqual([]);
    }
    expect(results).toHaveLength(10);
  }, 240_000);
});
