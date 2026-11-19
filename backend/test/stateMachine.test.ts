import { describe, expect, it } from 'vitest';
import { CONVERSATION_STATES } from '../src/models/Conversation.js';
import { canTransition, InvalidTransitionError, nextState } from '../src/services/stateMachine.js';

describe('conversation state machine', () => {
  it('happy path', () => {
    let s = nextState('awaiting_image', 'SERIAL_CANDIDATE');
    expect(s).toBe('awaiting_serial_confirmation');
    s = nextState(s, 'SERIAL_CONFIRMED_KNOWN');
    expect(s).toBe('awaiting_assembly');
    s = nextState(s, 'RECOMMEND');
    expect(s).toBe('recommendation');
    s = nextState(s, 'QUOTE_REQUESTED');
    expect(s).toBe('awaiting_lead');
    s = nextState(s, 'LEAD_COMPLETED');
    expect(s).toBe('closed');
  });

  it('review branches', () => {
    expect(nextState('awaiting_serial_confirmation', 'SERIAL_CONFIRMED_UNKNOWN')).toBe('human_review');
    expect(nextState('awaiting_assembly', 'NEEDS_REVIEW')).toBe('human_review');
    expect(nextState('awaiting_image', 'NEEDS_REVIEW')).toBe('human_review');
    expect(nextState('human_review', 'STAFF_RESOLVED')).toBe('closed');
  });

  it('rejection / retry loops', () => {
    expect(nextState('awaiting_serial_confirmation', 'SERIAL_REJECTED')).toBe('awaiting_image');
    expect(nextState('awaiting_image', 'READ_FAILED')).toBe('awaiting_image');
    expect(nextState('awaiting_lead', 'LEAD_CANCELLED')).toBe('recommendation');
    expect(nextState('recommendation', 'RECOMMEND')).toBe('recommendation'); // other assembly, same machine
  });

  it.each(CONVERSATION_STATES)('RESET and HANDOFF_REQUESTED are allowed from %s', (s) => {
    expect(nextState(s, 'RESET')).toBe('awaiting_image');
    expect(nextState(s, 'HANDOFF_REQUESTED')).toBe('human_review');
  });

  it.each([
    ['awaiting_image', 'RECOMMEND'],
    ['awaiting_image', 'SERIAL_CONFIRMED_KNOWN'],
    ['awaiting_image', 'QUOTE_REQUESTED'],
    ['awaiting_serial_confirmation', 'RECOMMEND'],
    ['awaiting_assembly', 'QUOTE_REQUESTED'],
    ['recommendation', 'LEAD_COMPLETED'],
    ['awaiting_lead', 'RECOMMEND'],
    ['human_review', 'RECOMMEND'],
    ['human_review', 'SERIAL_CANDIDATE'],
    ['closed', 'RECOMMEND'],
    ['closed', 'QUOTE_REQUESTED'],
  ] as const)('rejects illegal jump %s --%s-->', (s, e) => {
    expect(() => nextState(s, e)).toThrow(InvalidTransitionError);
    expect(canTransition(s, e)).toBe(false);
  });
});
