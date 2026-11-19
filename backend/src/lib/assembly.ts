export type AssemblyChoice = 'BOOM' | 'DIPPER' | 'BUCKET' | 'STAB' | 'UNSURE';

const PATTERNS: Array<[AssemblyChoice, RegExp]> = [
  ['UNSURE', /\b(not sure|unsure|don'?t know|dont know|no idea|idk|unknown|can'?t tell|cant tell)\b|पता नहीं|मालूम नहीं|पता नही/i],
  ['BOOM', /\bboom\b|बूम/i],
  ['DIPPER', /\bdipper\b|\bdipper arm\b|\bstick\b|डिप्पर/i],
  ['BUCKET', /\bbucket\b|बकेट|बाल्टी/i],
  ['STAB', /\bstab(?:i|e)?(?:l|li)?[sz]?er\b|\bstabili[sz]er\b|\bstabiliser\b|\bstab\b|\boutrigger\b|स्टेबिलाइज़र|स्टेबिलाइजर|स्टेबलाइजर/i],
];

/** Parse free text. Returns the choice, 'AMBIGUOUS' if several different assemblies are mentioned, or null. */
export function parseAssembly(text: string | null | undefined): AssemblyChoice | 'AMBIGUOUS' | null {
  if (!text) return null;
  const hits = PATTERNS.filter(([, re]) => re.test(text)).map(([c]) => c);
  if (hits.length === 0) return null;
  if (hits.includes('UNSURE') && hits.length === 1) return 'UNSURE';
  const real = hits.filter((h) => h !== 'UNSURE');
  if (real.length === 1) return real[0];
  return 'AMBIGUOUS';
}

export function parseYesNo(text: string | null | undefined): 'yes' | 'no' | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (/^(y|yes|yeah|yep|yup|ok|okay|correct|right|confirm|confirmed|sure|haan|han|ha|हाँ|हां|हा|सही|ठीक है|जी)\W*$/i.test(t)) return 'yes';
  if (/^(n|no|nope|nah|wrong|incorrect|not correct|nahi|nahin|नहीं|नही|गलत)\W*$/i.test(t)) return 'no';
  return null;
}

const RESET_RE = /^(reset|restart|start over|startover|start again|menu|new|new search|cancel|शुरू|फिर से शुरू|दोबारा शुरू|रीसेट)\W*$/i;
const HUMAN_RE = /^(human|agent|talk to (a )?human|talk to (an )?agent|speak to (a )?(human|person|agent)|support|help me|staff|executive|इंसान|मानव|एजेंट|मदद)\W*$/i;
export const isResetCommand = (t?: string | null) => !!t && RESET_RE.test(t.trim());
export const isHumanCommand = (t?: string | null) => !!t && HUMAN_RE.test(t.trim());

export function detectLanguageCommand(t?: string | null): 'en' | 'hi' | null {
  if (!t) return null;
  const s = t.trim();
  if (/^(hindi|हिंदी|हिन्दी|in hindi|switch to hindi)\W*$/i.test(s)) return 'hi';
  if (/^(english|इंग्लिश|अंग्रेज़ी|अंग्रेजी|in english|switch to english)\W*$/i.test(s)) return 'en';
  return null;
}
export const hasDevanagari = (t?: string | null) => !!t && /[ऀ-ॿ]/.test(t);
