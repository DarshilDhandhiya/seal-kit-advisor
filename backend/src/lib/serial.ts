/**
 * DEMO serial handling. Format: DEMO-<FAMILY>-<4 digits>, e.g. DEMO-BHL-0001.
 * Normalisation only fixes *formatting* (case, spaces, dash variants, common OCR digit look-alikes
 * inside the 4-digit group). It never guesses a different serial: the customer must still confirm it,
 * and the rules engine only matches exact serials.
 */
const DASHES = '\\s\\-\\u2010-\\u2015\\u2212_.:';
// DEMO <sep> FAMILY(2-10 letters) <sep> 4 chars that are digits or typical OCR look-alikes
const SERIAL_RE = new RegExp(`DEMO[${DASHES}]*([A-Z]{2,10})[${DASHES}]*([0-9OQDIL|SB]{4})`, 'g');
const DIGIT_FIX: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8' };

export interface SerialCandidate {
  serial: string; // canonical, e.g. DEMO-BHL-0001
  raw: string; // text as found
  repaired: boolean; // true if OCR look-alike characters were corrected in the digit group
}

function fixDigits(group: string): { digits: string; repaired: boolean } {
  let repaired = false;
  const digits = group
    .split('')
    .map((c) => {
      if (/[0-9]/.test(c)) return c;
      repaired = true;
      return DIGIT_FIX[c] ?? c;
    })
    .join('');
  return { digits, repaired };
}

export function extractSerials(input: string | null | undefined): SerialCandidate[] {
  if (!input) return [];
  const text = input.toUpperCase();
  const found = new Map<string, SerialCandidate>();
  for (const m of text.matchAll(SERIAL_RE)) {
    const family = m[1];
    const { digits, repaired } = fixDigits(m[2]);
    if (!/^[0-9]{4}$/.test(digits)) continue;
    const serial = `DEMO-${family}-${digits}`;
    const existing = found.get(serial);
    if (!existing || (existing.repaired && !repaired)) found.set(serial, { serial, raw: m[0], repaired });
  }
  return [...found.values()];
}

/** Returns the canonical serial if `input` contains exactly one serial-like value, else null. */
export function normalizeSerial(input: string | null | undefined): string | null {
  const list = extractSerials(input);
  return list.length === 1 ? list[0].serial : null;
}

export const SERIAL_EXAMPLE = 'DEMO-BHL-0001';
