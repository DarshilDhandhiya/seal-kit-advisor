import type { ConversationState } from '../models/Conversation.js';

/**
 * Conversation state machine. All state changes go through `nextState`, so an illegal jump
 * (e.g. awaiting_image -> recommendation) is impossible and unit-testable.
 */
export type ConversationEvent =
  | 'SERIAL_CANDIDATE' // an extracted/typed serial needs customer confirmation
  | 'READ_FAILED' // unreadable photo / no serial found: stay and ask again
  | 'SERIAL_CONFIRMED_KNOWN' // customer confirmed, machine exists
  | 'SERIAL_CONFIRMED_UNKNOWN' // customer confirmed, machine not in catalogue
  | 'SERIAL_REJECTED'
  | 'ASSEMBLY_UNCLEAR' // reply did not map to an assembly
  | 'RECOMMEND' // exact verified fitment found (in stock or not)
  | 'NEEDS_REVIEW' // no fitment / multiple kits / unknown assembly / repeated failures
  | 'QUOTE_REQUESTED'
  | 'LEAD_COMPLETED'
  | 'LEAD_CANCELLED'
  | 'HANDOFF_REQUESTED'
  | 'STAFF_RESOLVED'
  | 'RESET';

type Table = Partial<Record<ConversationState, Partial<Record<ConversationEvent, ConversationState>>>>;

const TABLE: Table = {
  awaiting_image: {
    READ_FAILED: 'awaiting_image',
    SERIAL_CANDIDATE: 'awaiting_serial_confirmation',
    NEEDS_REVIEW: 'human_review',
  },
  awaiting_serial_confirmation: {
    SERIAL_CANDIDATE: 'awaiting_serial_confirmation',
    READ_FAILED: 'awaiting_image',
    SERIAL_CONFIRMED_KNOWN: 'awaiting_assembly',
    SERIAL_CONFIRMED_UNKNOWN: 'human_review',
    SERIAL_REJECTED: 'awaiting_image',
    NEEDS_REVIEW: 'human_review',
  },
  awaiting_assembly: {
    SERIAL_CANDIDATE: 'awaiting_serial_confirmation',
    READ_FAILED: 'awaiting_assembly',
    ASSEMBLY_UNCLEAR: 'awaiting_assembly',
    RECOMMEND: 'recommendation',
    NEEDS_REVIEW: 'human_review',
  },
  recommendation: {
    SERIAL_CANDIDATE: 'awaiting_serial_confirmation',
    READ_FAILED: 'recommendation',
    RECOMMEND: 'recommendation', // customer picked another assembly for the same confirmed machine
    NEEDS_REVIEW: 'human_review',
    ASSEMBLY_UNCLEAR: 'recommendation',
    QUOTE_REQUESTED: 'awaiting_lead',
  },
  awaiting_lead: {
    LEAD_COMPLETED: 'closed',
    LEAD_CANCELLED: 'recommendation',
  },
  human_review: {
    STAFF_RESOLVED: 'closed',
  },
  closed: {},
};
// Events allowed from every state.
const GLOBAL: Partial<Record<ConversationEvent, ConversationState>> = {
  RESET: 'awaiting_image',
  HANDOFF_REQUESTED: 'human_review',
};

export class InvalidTransitionError extends Error {
  constructor(
    public from: ConversationState,
    public event: ConversationEvent,
  ) {
    super(`Invalid transition: ${from} --${event}-->`);
  }
}

export function nextState(from: ConversationState, event: ConversationEvent): ConversationState {
  const target = TABLE[from]?.[event] ?? GLOBAL[event];
  if (!target) throw new InvalidTransitionError(from, event);
  return target;
}

export function canTransition(from: ConversationState, event: ConversationEvent): boolean {
  return Boolean(TABLE[from]?.[event] ?? GLOBAL[event]);
}
