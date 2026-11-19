import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { extractSerials, type SerialCandidate } from '../lib/serial.js';

/**
 * OCR adapter. Accepts image bytes and returns text + confidence. The OCR result is NEVER a fitment verdict:
 * it only proposes a candidate serial which the customer must confirm.
 */
export interface OcrResult {
  text: string;
  confidence: number; // 0..100
  provider: string;
  durationMs: number;
}
export interface OcrProvider {
  name: string;
  recognize(image: Buffer): Promise<OcrResult>;
  close?(): Promise<void>;
}

/* ---------- Tesseract.js provider (free, local, no API key) ---------- */
type TWorker = {
  recognize(img: Buffer, opts?: object, out?: object): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
  setParameters(p: Record<string, string>): Promise<unknown>;
};

class TesseractProvider implements OcrProvider {
  name = 'tesseract.js';
  private worker: Promise<TWorker> | null = null;
  private chain: Promise<unknown> = Promise.resolve(); // a single worker handles one image at a time

  private langPath(): string {
    if (config.OCR_LANG_PATH) return config.OCR_LANG_PATH;
    const require = createRequire(import.meta.url);
    const pkg = require.resolve('@tesseract.js-data/eng/package.json');
    return path.join(path.dirname(pkg), '4.0.0_best_int'); // bundled offline language data
  }

  private async getWorker(): Promise<TWorker> {
    if (!this.worker) {
      this.worker = (async () => {
        const { createWorker } = await import('tesseract.js');
        const w = (await createWorker('eng', 1, {
          langPath: this.langPath(),
          gzip: true,
          cachePath: path.join(os.tmpdir(), 'sealkit-tesseract-cache'),
          logger: () => undefined,
        })) as unknown as TWorker;
        await w.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ .:/',
          preserve_interword_spaces: '1',
        });
        return w;
      })();
      this.worker.catch(() => (this.worker = null));
    }
    return this.worker;
  }

  /** Preprocess: greyscale, upscale small images, stretch contrast, light sharpen. */
  private async prepare(image: Buffer, angle = 0): Promise<Buffer> {
    let img = sharp(image, { failOn: 'none' }).rotate(); // honour EXIF orientation
    if (angle) img = img.rotate(angle, { background: '#2f353b' });
    const meta = await sharp(await img.toBuffer()).metadata();
    const width = meta.width ?? 0;
    let pipeline = sharp(await img.toBuffer()).grayscale();
    if (width && width < 1600) pipeline = pipeline.resize({ width: 1600, kernel: 'lanczos3' });
    return pipeline.normalise().sharpen().png().toBuffer();
  }

  async recognize(image: Buffer): Promise<OcrResult> {
    const started = Date.now();
    const job = this.chain.then(async () => {
      const worker = await this.getWorker();
      // Pass 1 straight; extra passes for tilted photos only when no serial was found.
      const angles = [0, -10, 10, -5, 5, -15, 15];
      let best: { text: string; confidence: number; hasSerial: boolean } | null = null;
      for (const angle of angles) {
        const prepared = await this.prepare(image, angle);
        const { data } = await worker.recognize(prepared);
        const hasSerial = extractSerials(data.text).length > 0;
        const candidate = { text: data.text ?? '', confidence: data.confidence ?? 0, hasSerial };
        if (
          !best ||
          (candidate.hasSerial && !best.hasSerial) ||
          (candidate.hasSerial === best.hasSerial && candidate.confidence > best.confidence)
        ) {
          best = candidate;
        }
        if (hasSerial && candidate.confidence >= config.OCR_CONFIRM_CONFIDENCE) break;
      }
      return best!;
    });
    this.chain = job.catch(() => undefined);
    const best = await job;
    return { text: best.text, confidence: best.confidence, provider: this.name, durationMs: Date.now() - started };
  }

  async close() {
    if (this.worker) {
      const w = await this.worker.catch(() => null);
      await w?.terminate();
      this.worker = null;
    }
  }
}

/* ---------- Mock provider (tests / CI): the "image" bytes are UTF-8 text like "MOCKOCR:95:DEMO-BHL-0001" ---------- */
class MockProvider implements OcrProvider {
  name = 'mock';
  async recognize(image: Buffer): Promise<OcrResult> {
    const s = image.toString('utf8');
    const m = s.match(/^MOCKOCR:(\d{1,3}):([\s\S]*)$/);
    return { text: m ? m[2] : '', confidence: m ? Number(m[1]) : 0, provider: this.name, durationMs: 1 };
  }
}

let provider: OcrProvider | null = null;
export function getOcr(): OcrProvider {
  if (!provider) provider = config.OCR_PROVIDER === 'mock' ? new MockProvider() : new TesseractProvider();
  return provider;
}
export function setOcrProvider(p: OcrProvider | null) {
  provider = p;
}

/* ---------- Interpreting OCR output ---------- */
export type OcrOutcome =
  | { kind: 'confirm'; candidate: SerialCandidate; uncertain: boolean; confidence: number }
  | { kind: 'ambiguous'; candidates: SerialCandidate[]; confidence: number }
  | { kind: 'unreadable'; confidence: number; reason: 'no_serial' | 'low_confidence' | 'error' };

export function interpretOcr(r: OcrResult): OcrOutcome {
  const candidates = extractSerials(r.text);
  if (candidates.length === 0) return { kind: 'unreadable', confidence: r.confidence, reason: 'no_serial' };
  if (r.confidence < config.OCR_MIN_CONFIDENCE) {
    return { kind: 'unreadable', confidence: r.confidence, reason: 'low_confidence' };
  }
  if (candidates.length > 1) return { kind: 'ambiguous', candidates, confidence: r.confidence };
  const c = candidates[0];
  return { kind: 'confirm', candidate: c, uncertain: c.repaired || r.confidence < config.OCR_CONFIRM_CONFIDENCE, confidence: r.confidence };
}

export async function runOcr(image: Buffer): Promise<{ result: OcrResult | null; outcome: OcrOutcome }> {
  try {
    const p = getOcr();
    const result = await Promise.race([
      p.recognize(image),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('OCR timeout')), config.OCR_TIMEOUT_MS)),
    ]);
    return { result, outcome: interpretOcr(result) };
  } catch (err) {
    logger.error({ err }, 'OCR failed');
    return { result: null, outcome: { kind: 'unreadable', confidence: 0, reason: 'error' } };
  }
}
