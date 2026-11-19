import { describe, expect, it } from 'vitest';
import { extractSerials, normalizeSerial } from '../src/lib/serial.js';

describe('serial normalisation', () => {
  it.each([
    ['DEMO-BHL-0001', 'DEMO-BHL-0001'],
    ['demo-bhl-0001', 'DEMO-BHL-0001'],
    ['  demo bhl 0001  ', 'DEMO-BHL-0001'],
    ['DEMO_BHL_0001', 'DEMO-BHL-0001'],
    ['DEMO–BHL–0001', 'DEMO-BHL-0001'], // en dashes
    ['DEMO BHL-0001', 'DEMO-BHL-0001'],
    ['DEMOBHL0001', 'DEMO-BHL-0001'],
    ['My serial is DEMO-EXC-0005 thanks', 'DEMO-EXC-0005'],
    ['SERIAL NUMBER\nDEMO-EXC-0008\nFICTIONAL TEST', 'DEMO-EXC-0008'],
    ['DEMO-UNKNOWN-9999', 'DEMO-UNKNOWN-9999'],
  ])('%j -> %s', (input, expected) => {
    expect(normalizeSerial(input)).toBe(expected);
  });

  it('repairs OCR look-alikes ONLY inside the 4-digit group', () => {
    const [c] = extractSerials('DEMO-BHL-OOO1');
    expect(c.serial).toBe('DEMO-BHL-0001');
    expect(c.repaired).toBe(true);
    expect(extractSerials('DEMO-BHL-0001')[0].repaired).toBe(false);
    expect(normalizeSerial('DEMO-B0L-0001')).toBeNull(); // family letters are never "repaired"
  });

  it.each(['', null, undefined, 'hello', 'BHL-0001', 'DEMO-BHL-12', 'DEMO-123-0001', 'JCB3DX1234'])('rejects %j', (v) => {
    expect(normalizeSerial(v as string)).toBeNull();
  });

  it('returns several distinct candidates (ambiguous OCR) and dedupes repeats', () => {
    const list = extractSerials('DEMO-BHL-0001 ... DEMO-BHL-0002 ... demo bhl 0001');
    expect(list.map((x) => x.serial)).toEqual(['DEMO-BHL-0001', 'DEMO-BHL-0002']);
    expect(normalizeSerial('DEMO-BHL-0001 DEMO-BHL-0002')).toBeNull(); // ambiguous => no single serial
  });
});
