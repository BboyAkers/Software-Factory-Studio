import type { SteeringHint, SteeringSuggestion } from '../contracts';

/** A hint left unacknowledged this many turns after delivery is flagged in the UI. */
export const ACK_MISSED_AFTER_TURNS = 2;

export type HintState = 'queued' | 'delivered' | 'acknowledged' | 'undelivered';

/** The pill a steering hint shows: Queued → Delivered → Acknowledged (spec §7.4). */
export function hintState(hint: Pick<SteeringHint, 'queuedAt' | 'deliveredAt' | 'acknowledgedAt' | 'undelivered'>): HintState {
  if (hint.acknowledgedAt) return 'acknowledged';
  if (hint.deliveredAt) return 'delivered';
  if (hint.undelivered) return 'undelivered';
  return 'queued';
}

export const ackMissed = (hint: Pick<SteeringHint, 'acknowledgedAt' | 'deliveredAt' | 'turnsSinceDelivery'>): boolean =>
  hint.deliveredAt !== null && hint.acknowledgedAt === null && hint.turnsSinceDelivery >= ACK_MISSED_AFTER_TURNS;

export type SuggestionPill = SteeringSuggestion['status'];
