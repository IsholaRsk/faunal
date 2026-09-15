import type { OrderStatus } from '@/domain/types';

/**
 * Shared copy for the order state machine so the buyer app, the seller desk and
 * the admin console describe a transition identically (spec §18 / §32).
 */
export const ACTION_COPY: Record<string, { label: string; hint: string }> = {
  PAID: { label: 'Mark payment captured', hint: 'Escrow holds the funds until the animal is confirmed in condition.' },
  BREEDER_CONFIRMED: { label: 'Confirm the animal', hint: 'Breeder accepts the order and reserves the animal.' },
  PREPARING: { label: 'Start preparation', hint: 'Quarantine check, final photos, crate and paperwork.' },
  SHIPPED: { label: 'Mark shipped', hint: 'Adds the tracking number and starts the transit clock.' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', hint: 'Buyer is invited to collect within the agreed window.' },
  DELIVERED: { label: 'Mark delivered', hint: 'Starts the buyer’s 48-hour condition window.' },
  COMPLETED: { label: 'Confirm arrival & release payment', hint: 'Releases escrow to the breeder and unlocks the review.' },
  CANCELLED: { label: 'Cancel order', hint: 'Buyer-protection rules decide whether the hold is released.' },
  REFUNDED: { label: 'Refund', hint: 'Full or partial release back to the buyer from escrow.' },
  DISPUTED: { label: 'Open a dispute', hint: 'Freezes escrow and routes the case to the compliance desk.' },
};

export function actionFor(status: OrderStatus | string) {
  const copy = ACTION_COPY[status] ?? { label: status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), hint: '' };
  return { status, ...copy };
}

export const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'quiet'> = {
  PAYMENT_PENDING: 'quiet',
  PAID: 'quiet',
  BREEDER_CONFIRMED: 'quiet',
  PREPARING: 'warn',
  SHIPPED: 'warn',
  READY_FOR_PICKUP: 'warn',
  DELIVERED: 'ok',
  COMPLETED: 'ok',
  CANCELLED: 'bad',
  REFUNDED: 'bad',
  DISPUTED: 'bad',
};
