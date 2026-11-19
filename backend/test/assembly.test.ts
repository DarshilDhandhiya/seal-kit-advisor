import { describe, expect, it } from 'vitest';
import { detectLanguageCommand, isHumanCommand, isResetCommand, parseAssembly, parseYesNo } from '../src/lib/assembly.js';

describe('assembly / intent parsing', () => {
  it.each([
    ['boom', 'BOOM'],
    ['the Boom cylinder is leaking', 'BOOM'],
    ['dipper', 'DIPPER'],
    ['stick cylinder', 'DIPPER'],
    ['Bucket', 'BUCKET'],
    ['stabilizer', 'STAB'],
    ['stabiliser leg', 'STAB'],
    ['outrigger', 'STAB'],
    ['not sure', 'UNSURE'],
    ["I don't know", 'UNSURE'],
    ['बूम', 'BOOM'],
    ['पता नहीं', 'UNSURE'],
    ['boom and bucket', 'AMBIGUOUS'],
    ['banana', null],
  ])('%j -> %s', (t, e) => expect(parseAssembly(t)).toBe(e));

  it('yes / no', () => {
    expect(parseYesNo('Yes')).toBe('yes');
    expect(parseYesNo('haan')).toBe('yes');
    expect(parseYesNo('हाँ')).toBe('yes');
    expect(parseYesNo('no')).toBe('no');
    expect(parseYesNo('नहीं')).toBe('no');
    expect(parseYesNo('maybe')).toBeNull();
  });
  it('commands', () => {
    expect(isResetCommand('Start over')).toBe(true);
    expect(isResetCommand('reset!')).toBe(true);
    expect(isResetCommand('boom')).toBe(false);
    expect(isHumanCommand('talk to human')).toBe(true);
    expect(isHumanCommand('human')).toBe(true);
    expect(detectLanguageCommand('हिन्दी')).toBe('hi');
    expect(detectLanguageCommand('english')).toBe('en');
    expect(detectLanguageCommand('boom')).toBeNull();
  });
});
