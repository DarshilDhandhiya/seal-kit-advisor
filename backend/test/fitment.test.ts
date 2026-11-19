import { describe, expect, it } from 'vitest';
import { resolveFitment } from '../src/services/fitment.js';
import { memoryRepo, seed } from './helpers.js';

describe('fitment rules engine — dataset test cases (Appendix A)', () => {
  const repo = memoryRepo();
  const outcomeOf = (r: Awaited<ReturnType<typeof resolveFitment>>) => (r.outcome === 'ask_assembly' ? 'ask_assembly' : r.outcome);

  for (const tc of seed.testCases.filter((t: any) => t.inputSerial.startsWith('DEMO-'))) {
    it(`${tc.inputSerial} + ${tc.assemblyCode ?? '(none)'} => ${tc.expectedOutcome}`, async () => {
      const r = await resolveFitment(repo, tc.inputSerial, tc.assemblyCode);
      const map: Record<string, string> = {
        recommend: 'recommend',
        out_of_stock: 'out_of_stock',
        human_review_no_fitment: 'human_review_no_fitment',
        human_review_unknown_serial: 'human_review_unknown_serial',
        ask_assembly: 'ask_assembly',
      };
      expect(outcomeOf(r)).toBe(map[tc.expectedOutcome]);
      expect(r.kit?.sku ?? null).toBe(tc.expectedSku);
    });
  }

  it('every one of the 24 seeded fitments resolves to exactly its kit, and nothing else resolves', async () => {
    let hits = 0;
    for (const m of seed.machines) {
      for (const a of seed.assemblies) {
        const r = await resolveFitment(repo, m.serial, a.code);
        const expected = seed.fitments.find((f: any) => f.machineSerial === m.serial && f.assemblyCode === a.code);
        if (expected) {
          hits++;
          expect(r.kit?.sku).toBe(expected.kitSku);
        } else {
          expect(r.outcome).toBe('human_review_no_fitment');
          expect(r.kit).toBeUndefined();
        }
      }
    }
    expect(hits).toBe(24);
  });
});

describe('fitment rules engine — precedence & safety', () => {
  const base = memoryRepo();

  it('unknown serial wins over everything (even with a valid assembly)', async () => {
    expect((await resolveFitment(base, 'DEMO-NOPE-0000', 'BOOM')).outcome).toBe('human_review_unknown_serial');
    expect((await resolveFitment(base, 'DEMO-NOPE-0000', null)).outcome).toBe('human_review_unknown_serial');
    expect((await resolveFitment(base, '', 'BOOM')).outcome).toBe('human_review_unknown_serial');
  });

  it('inactive machine is treated like an unknown serial', async () => {
    const repo = memoryRepo({ machines: seed.machines.map((m: any) => (m.serial === 'DEMO-BHL-0001' ? { ...m, status: 'inactive' } : m)) });
    expect((await resolveFitment(repo, 'DEMO-BHL-0001', 'BOOM')).outcome).toBe('human_review_unknown_serial');
  });

  it('missing assembly asks, invalid assembly goes to staff', async () => {
    expect((await resolveFitment(base, 'DEMO-BHL-0001', null)).outcome).toBe('ask_assembly');
    expect((await resolveFitment(base, 'DEMO-BHL-0001', 'WHEEL')).outcome).toBe('human_review_unknown_assembly');
  });

  it('is case/space tolerant for the serial and assembly inputs', async () => {
    expect((await resolveFitment(base, ' demo-bhl-0001 ', 'boom')).kit?.sku).toBe('DK-BHL-A-BOOM');
  });

  it('NEVER falls back to the same model / nearest serial', async () => {
    // DEMO-EXC-0008 is a JS220 like DEMO-EXC-0007, but has no STAB fitment; neither has anyone else.
    const r = await resolveFitment(base, 'DEMO-EXC-0008', 'STAB');
    expect(r.outcome).toBe('human_review_no_fitment');
    // 3DX serial 0001 vs 0002 resolve to DIFFERENT kits (A vs B)
    expect((await resolveFitment(base, 'DEMO-BHL-0001', 'BOOM')).kit?.sku).toBe('DK-BHL-A-BOOM');
    expect((await resolveFitment(base, 'DEMO-BHL-0002', 'BOOM')).kit?.sku).toBe('DK-BHL-B-BOOM');
  });

  it('ignores unverified and inactive fitments', async () => {
    const unverified = memoryRepo({ fitments: seed.fitments.map((f: any) => (f.machineSerial === 'DEMO-BHL-0001' && f.assemblyCode === 'BOOM' ? { ...f, verified: false } : f)) });
    expect((await resolveFitment(unverified, 'DEMO-BHL-0001', 'BOOM')).outcome).toBe('human_review_no_fitment');
    const inactive = memoryRepo({ fitments: seed.fitments.map((f: any) => (f.machineSerial === 'DEMO-BHL-0001' && f.assemblyCode === 'BOOM' ? { ...f, active: false } : f)) });
    expect((await resolveFitment(inactive, 'DEMO-BHL-0001', 'BOOM')).outcome).toBe('human_review_no_fitment');
  });

  it('missing fitment record => staff review, never a guess', async () => {
    const repo = memoryRepo({ fitments: seed.fitments.filter((f: any) => !(f.machineSerial === 'DEMO-BHL-0003' && f.assemblyCode === 'STAB')) });
    const r = await resolveFitment(repo, 'DEMO-BHL-0003', 'STAB');
    expect(r.outcome).toBe('human_review_no_fitment');
    expect(r.kit).toBeUndefined();
  });

  it('duplicate/multiple kits for one serial+assembly => staff review with candidates', async () => {
    const repo = memoryRepo({
      fitments: [...seed.fitments, { machineSerial: 'DEMO-BHL-0001', assemblyCode: 'BOOM', kitSku: 'DK-BHL-B-BOOM', evidenceSource: 'x', verified: true, active: true }],
    });
    const r = await resolveFitment(repo, 'DEMO-BHL-0001', 'BOOM');
    expect(r.outcome).toBe('human_review_multiple_kits');
    expect(r.candidates?.map((k) => k.sku)).toEqual(['DK-BHL-A-BOOM', 'DK-BHL-B-BOOM']);
    expect(r.kit).toBeUndefined();
  });

  it('exact duplicate rows of the SAME kit collapse to one recommendation', async () => {
    const dup = seed.fitments.find((f: any) => f.machineSerial === 'DEMO-BHL-0001' && f.assemblyCode === 'BOOM');
    const r = await resolveFitment(memoryRepo({ fitments: [...seed.fitments, { ...dup }] }), 'DEMO-BHL-0001', 'BOOM');
    expect(r.outcome).toBe('recommend');
    expect(r.kit?.sku).toBe('DK-BHL-A-BOOM');
  });

  it('inactive kit, or kit mapped to a different assembly, is not recommended', async () => {
    const inactiveKit = memoryRepo({ kits: seed.kits.map((k: any) => (k.sku === 'DK-BHL-A-BOOM' ? { ...k, active: false } : k)) });
    expect((await resolveFitment(inactiveKit, 'DEMO-BHL-0001', 'BOOM')).outcome).toBe('human_review_inactive_kit');
    const wrongAsm = memoryRepo({ kits: seed.kits.map((k: any) => (k.sku === 'DK-BHL-A-BOOM' ? { ...k, assemblyCode: 'BUCKET' } : k)) });
    expect((await resolveFitment(wrongAsm, 'DEMO-BHL-0001', 'BOOM')).outcome).toBe('human_review_inactive_kit');
  });

  it('zero stock => out_of_stock (kit still returned, availability must not be promised)', async () => {
    const r = await resolveFitment(base, 'DEMO-BHL-0002', 'DIPPER');
    expect(r.outcome).toBe('out_of_stock');
    expect(r.kit?.sku).toBe('DK-BHL-B-DIP');
    expect(r.kit?.stock).toBe(0);
  });
});
