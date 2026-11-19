import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/lib/csv.js';
import { KeyedQueue } from '../src/lib/queue.js';
import { decrypt, encrypt, sniffImageMime, validateImage, ImageRejected } from '../src/services/media.js';
import { interpretOcr } from '../src/services/ocr.js';
import { plate } from './helpers.js';
import crypto from 'node:crypto';

describe('csv', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(null)).toBe('');
    expect(toCsv(['a', 'b'], [{ a: 1, b: '=x' }])).toBe("a,b\r\n1,'=x\r\n");
  });
});

describe('KeyedQueue', () => {
  it('runs tasks of one key strictly in order, other keys in parallel', async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const slow = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
    };
    await Promise.all([q.run('u1', slow('a', 40)), q.run('u1', slow('b', 1)), q.run('u2', slow('c', 5))]);
    expect(log.indexOf('end a')).toBeLessThan(log.indexOf('start b'));
    expect(log.indexOf('end c')).toBeLessThan(log.indexOf('end a')); // other key did not wait
  });
  it('a failing task does not block the next one', async () => {
    const q = new KeyedQueue();
    await expect(q.run('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(q.run('k', async () => 7)).resolves.toBe(7);
  });
});

describe('image validation + encryption at rest', () => {
  it('detects real types by magic bytes', () => {
    expect(sniffImageMime(plate('01_DEMO-BHL-0001_clear.png'))).toBe('image/png');
    expect(sniffImageMime(Buffer.from('<html>not an image</html>'))).toBeNull();
    expect(() => validateImage(Buffer.from('GIF89a.........'))).toThrow(ImageRejected);
    expect(() => validateImage(Buffer.alloc(0))).toThrow(ImageRejected);
    expect(() => validateImage(Buffer.concat([plate('01_DEMO-BHL-0001_clear.png'), Buffer.alloc(6 * 1024 * 1024)]))).toThrow(/too_large/);
  });
  it('AES-256-GCM round trip; tampering is detected', () => {
    const key = crypto.randomBytes(32);
    const data = Buffer.from('plate-bytes');
    const blob = encrypt(data, key);
    expect(blob.includes(data)).toBe(false);
    expect(decrypt(blob, key).equals(data)).toBe(true);
    blob[blob.length - 1] ^= 1;
    expect(() => decrypt(blob, key)).toThrow();
  });
});

describe('OCR interpretation (OCR is never a fitment verdict)', () => {
  const r = (text: string, confidence: number) => ({ text, confidence, provider: 't', durationMs: 1 });
  it('confident single serial', () => expect(interpretOcr(r('MODEL 3DX\nSERIAL NUMBER\nDEMO-BHL-0001', 90))).toMatchObject({ kind: 'confirm', uncertain: false }));
  it('mid confidence => warn', () => expect(interpretOcr(r('DEMO-BHL-0001', 55))).toMatchObject({ kind: 'confirm', uncertain: true }));
  it('very low confidence => ask for a clearer photo', () => expect(interpretOcr(r('DEMO-BHL-0001', 20))).toMatchObject({ kind: 'unreadable', reason: 'low_confidence' }));
  it('no serial => unreadable', () => expect(interpretOcr(r('MODEL 4DX', 95))).toMatchObject({ kind: 'unreadable', reason: 'no_serial' }));
  it('two serials => ambiguous', () => expect(interpretOcr(r('DEMO-BHL-0001 DEMO-BHL-0004', 90))).toMatchObject({ kind: 'ambiguous' }));
  it('look-alike repair => always flagged uncertain', () => expect(interpretOcr(r('DEMO-BHL-OOO1', 95))).toMatchObject({ kind: 'confirm', uncertain: true }));
});
