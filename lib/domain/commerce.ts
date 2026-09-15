import { getDb } from '@/lib/db';
import { id, nowIso } from './util';
import type { OrderStatus } from './types';

/**
 * Business model + payment workflow (spec §33 / §38).
 * Multiple monetisation rails run at the same time and are all driven by the
 * `fee_rules` table so pricing can change without a deploy:
 *   COMMISSION      — % of subtotal by breeder plan
 *   SUBSCRIPTION    — monthly breeder plan
 *   FEATURED        — featured slot on home/search
 *   SHIPPING_SERVICE— margin on live-freight booking
 *   PAYOUT          — flat fee when escrow is released to the breeder
 */

export interface FeeBreakdown {
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  platform_fee_cents: number;
  total_cents: number;
  commission_bps: number;
  plan: string;
}

export function activeRule(kind: string, plan = 'FREE') {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM fee_rules WHERE kind = ? AND plan = ? AND active = 1`)
    .get(kind, plan) as
    | { id: string; rate_bps: number; flat_cents: number; min_cents: number; label: string }
    | undefined;
}

export function computeFees(opts: {
  subtotal_cents: number;
  shipping_cents: number;
  breederId: string;
  destinationState: string | null;
}): FeeBreakdown {
  const db = getDb();
  const breeder = db.prepare(`SELECT storefront_plan FROM breeders WHERE id = ?`).get(opts.breederId) as
    | { storefront_plan: string }
    | undefined;
  const plan = breeder?.storefront_plan ?? 'FREE';
  const rule = activeRule('COMMISSION', plan) ?? activeRule('COMMISSION', 'FREE');
  const commissionBps = rule?.rate_bps ?? 800;
  let fee = Math.round((opts.subtotal_cents * commissionBps) / 10000);
  if (rule?.min_cents) fee = Math.max(fee, rule.min_cents);
  if (rule?.flat_cents) fee += rule.flat_cents;

  // Sales tax on the tangible-goods equivalent: live animals are taxable in most
  // states; service items (shipping margin) are not.
  const taxRate = taxRateFor(opts.destinationState);
  const tax = Math.round(opts.subtotal_cents * taxRate);

  return {
    subtotal_cents: opts.subtotal_cents,
    shipping_cents: opts.shipping_cents,
    tax_cents: tax,
    platform_fee_cents: fee,
    total_cents: opts.subtotal_cents + opts.shipping_cents + tax,
    commission_bps: commissionBps,
    plan,
  };
}

/** Demo rate table (NYC 8.875%, most states 5–8%). Real deploy plugs Avalara/TaxJar. */
export function taxRateFor(state: string | null): number {
  const table: Record<string, number> = {
    NY: 0.08875, NJ: 0.06625, CT: 0.0635, PA: 0.06, MA: 0.0625, FL: 0.06, GA: 0.0725,
    TX: 0.0625, CA: 0.0725, IL: 0.0625, OH: 0.0575, NC: 0.0475, WA: 0.065, CO: 0.029,
    AZ: 0.056, NV: 0.0685, OR: 0, MT: 0, NH: 0, DE: 0,
  };
  if (!state) return 0.06;
  return table[state.toUpperCase()] ?? 0.06;
}

export function subscriptionPrice(plan: 'FREE' | 'PRO' | 'PREMIUM'): { cents: number; perks: string[] } {
  const table: Record<'FREE' | 'PRO' | 'PREMIUM', { cents: number; perks: string[] }> = {
    FREE: { cents: 0, perks: ['8 active listings', 'Standard placement', '0.9% payout fee', 'Messaging + favorites'] },
    PRO: { cents: 4900, perks: ['40 active listings', '+18% search placement', '0.45% payout fee', 'Analytics + CSV export'] },
    PREMIUM: { cents: 14900, perks: ['Unlimited listings', 'Storefront theme + domain', 'Dedicated compliance desk', '0.25% payout fee'] },
  };
  return table[plan];
}

/* ------------------------------------------------------------------ payments */

/**
 * Payment provider abstraction. `providers/faunal-pay.ts` implements the same
 * contract as a Stripe/Adyen-style PSP (intent → confirm → capture → refund)
 * with an escrow account, so swapping in a real PSP touches one file.
 * Card data never reaches FAUNAL: only a token + last4 are stored.
 */
export interface PaymentProvider {
  name: string;
  createIntent(args: { orderId: string; amountCents: number; currency: string; idempotencyKey: string }): {
    intentId: string;
    status: 'REQUIRES_CONFIRMATION';
    clientSecret: string;
  };
  confirm(args: { intentId: string; token: string }): { status: 'AUTHORIZED' | 'FAILED'; message?: string };
  capture(args: { intentId: string; amountCents: number }): { status: 'PAID'; capturedAt: string };
  refund(args: { intentId: string; amountCents: number; reason: string }): { status: 'PENDING'; refundId: string };
  releaseEscrow?(args: { intentId: string; amountCents: number; toAccountId: string }): { status: 'SETTLED'; transferId: string };
}

class FaunalPayProvider implements PaymentProvider {
  name = 'faunal-pay';

  createIntent({ orderId, amountCents, currency, idempotencyKey }: { orderId: string; amountCents: number; currency: string; idempotencyKey: string }) {
    const db = getDb();
    const existing = db.prepare(`SELECT id FROM payments WHERE idempotency_key = ?`).get(idempotencyKey) as
      | { id: string }
      | undefined;
    const paymentId = existing?.id ?? id('pay');
    if (!existing) {
      db.prepare(
        `INSERT INTO payments (id,order_id,provider,provider_intent,method,amount_cents,fee_cents,status,escrow_account,captured_at,created_at,idempotency_key)
         VALUES (?,?,?,?,?,?,0,'REQUIRES_CONFIRMATION','platform_escrow',NULL,?,?)`,
      // `payments` stores no currency column: every order is settled in USD and
      // the currency is carried by the order row, so it is not bound here.
      ).run(paymentId, orderId, this.name, `pi_${paymentId.slice(4)}`, 'CARD', amountCents, nowIso(), idempotencyKey);
    }
    return {
      intentId: paymentId,
      status: 'REQUIRES_CONFIRMATION' as const,
      clientSecret: `${paymentId}_secret_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  confirm({ intentId, token }: { intentId: string; token: string }) {
    const db = getDb();
    const row = db.prepare(`SELECT status, method FROM payments WHERE id = ?`).get(intentId) as
      | { status: string; method: string }
      | undefined;
    if (!row) return { status: 'FAILED' as const, message: 'Unknown payment intent.' };
    // Mock risk decision: tokens ending in "declined" emulate a PSP decline.
    if (/declined/i.test(token)) {
      db.prepare(`UPDATE payments SET status = 'FAILED' WHERE id = ?`).run(intentId);
      return { status: 'FAILED' as const, message: 'Card declined by issuer (mock PSP). Try another method.' };
    }
    db.prepare(`UPDATE payments SET status = 'AUTHORIZED', method = ? WHERE id = ?`).run(row.method, intentId);
    return { status: 'AUTHORIZED' as const };
  }

  capture({ intentId, amountCents }: { intentId: string; amountCents: number }) {
    const db = getDb();
    const capturedAt = nowIso();
    db.prepare(`UPDATE payments SET status = 'PAID', amount_cents = ?, captured_at = ? WHERE id = ?`).run(
      amountCents,
      capturedAt,
      intentId,
    );
    return { status: 'PAID' as const, capturedAt };
  }

  refund({ intentId, amountCents, reason }: { intentId: string; amountCents: number; reason: string }) {
    const db = getDb();
    const payment = db.prepare(`SELECT order_id FROM payments WHERE id = ?`).get(intentId) as { order_id: string } | undefined;
    if (!payment) throw new Error('Unknown payment intent.');
    const refundId = id('ref');
    db.prepare(
      `INSERT INTO refunds (id,order_id,payment_id,amount_cents,reason,status,created_at,processed_at)
       VALUES (?,?,?,?,?,'ISSUED',?,?)`,
    ).run(refundId, payment.order_id, intentId, amountCents, reason, nowIso(), nowIso());
    db.prepare(`UPDATE payments SET status = 'REFUNDED' WHERE id = ?`).run(intentId);
    return { status: 'PENDING' as const, refundId };
  }

  releaseEscrow({ intentId, amountCents, toAccountId }: { intentId: string; amountCents: number; toAccountId: string }) {
    const db = getDb();
    const payment = db
      .prepare(`SELECT o.breeder_id, o.platform_fee_cents, o.shipping_cents FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ?`)
      .get(intentId) as { breeder_id: string; platform_fee_cents: number; shipping_cents: number } | undefined;
    if (!payment) throw new Error('Unknown payment intent.');
    const gross = amountCents;
    const payoutFeeRule = activeRule('PAYOUT', 'FREE');
    const payoutFee = Math.max(payoutFeeRule?.min_cents ?? 0, Math.round((gross * (payoutFeeRule?.rate_bps ?? 90)) / 10000));
    const net = Math.max(0, gross - payoutFee);
    const payoutId = id('pyo');
    db.prepare(
      `INSERT INTO payouts (id,order_id,breeder_id,gross_cents,fee_cents,net_cents,method,status,release_at,released_at,created_at)
       VALUES (?,?,?,?,?,?,?,'PAID',?,?,?)`,
    ).run(payoutId, payment.breeder_id ? intentIdOrder(db, intentId) : intentId, toAccountId, gross, payoutFee, net, 'ACH', nowIso(), nowIso(), nowIso());
    db.prepare(`UPDATE orders SET escrow_state = 'RELEASED', updated_at = ? WHERE id = (SELECT order_id FROM payments WHERE id = ?)`).run(
      nowIso(),
      intentId,
    );
    return { status: 'SETTLED' as const, transferId: payoutId };
  }
}

function intentIdOrder(db: ReturnType<typeof getDb>, intentId: string): string {
  const r = db.prepare(`SELECT order_id FROM payments WHERE id = ?`).get(intentId) as { order_id: string } | undefined;
  return r?.order_id ?? intentId;
}

export const paymentProvider: PaymentProvider = new FaunalPayProvider();

/* ---------------------------------------------------------------- order flow */

export const ORDER_FLOW: OrderStatus[] = [
  'PAYMENT_PENDING',
  'PAID',
  'BREEDER_CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'COMPLETED',
];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CART: [],
  CHECKOUT: [],
  PAYMENT_PENDING: ['PAID', 'CANCELLED'],
  PAID: ['BREEDER_CONFIRMED', 'CANCELLED', 'REFUNDED', 'DISPUTED'],
  BREEDER_CONFIRMED: ['PREPARING', 'READY_FOR_PICKUP', 'CANCELLED', 'REFUNDED', 'DISPUTED'],
  PREPARING: ['SHIPPED', 'READY_FOR_PICKUP', 'DISPUTED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  READY_FOR_PICKUP: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
  DISPUTED: ['REFUNDED', 'COMPLETED', 'CANCELLED'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export function orderStatusLabel(status: OrderStatus): string {
  return (
    {
      PAYMENT_PENDING: 'Awaiting payment',
      PAID: 'Payment confirmed',
      BREEDER_CONFIRMED: 'Breeder confirmed',
      PREPARING: 'Preparing animal',
      SHIPPED: 'In transit',
      READY_FOR_PICKUP: 'Ready for pickup',
      DELIVERED: 'Delivered',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      REFUNDED: 'Refunded',
      DISPUTED: 'Under dispute review',
      CART: 'In cart',
      CHECKOUT: 'Checkout',
    } as Record<OrderStatus, string>
  )[status];
}
