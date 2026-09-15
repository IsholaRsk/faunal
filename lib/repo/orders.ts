import { getDb } from '@/lib/db';
import { insert, update, updateWhere, get, parse } from '@/db/kit';
import { HttpError, audit } from '@/domain/rbac';
import { evaluateCompliance, recordComplianceCheck } from '@/domain/compliance';
import { buildQuotes, methodLabel } from '@/domain/shipping';
import { computeFees, paymentProvider, orderStatusLabel } from '@/domain/commerce';
import { id, nowIso } from '@/domain/util';
import { notify } from '@/domain/notify';
import type { OrderStatus, SessionUser, ShippingMethod } from '@/domain/types';
import { cartFor, type CartLine } from './cart';

/**
 * Checkout, order lifecycle, tracking, reviews.
 *
 * A cart containing animals from two breeders becomes two orders: escrow,
 * shipping and compliance are per-seller. Payment is authorised to the FAUNAL
 * platform escrow account and released to the breeder on COMPLETED (spec §33).
 */

export interface CheckoutInput {
  fulfillment: 'SHIPPING' | 'PICKUP' | 'BREEDER_DELIVERY';
  method: ShippingMethod;
  addressId?: string | null;
  pickupDate?: string | null;
  paymentToken: string;
  paymentMethodId?: string | null;
  buyerNote?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface Group {
  breederId: string;
  breederName: string;
  lines: CartLine[];
  method: ShippingMethod;
  methodLabel: string;
  quote: ReturnType<typeof buildQuotes>[number];
  quotes: ReturnType<typeof buildQuotes>;
  legal: ReturnType<typeof evaluateCompliance>;
  fees: ReturnType<typeof computeFees>;
  weightKg: number;
}

export function checkoutPreview(user: SessionUser, input: Partial<CheckoutInput>) {
  const db = getDb();
  const cart = cartFor(user);
  if (!cart.lines.length) throw new HttpError(400, 'Your cart is empty.');
  const destination = resolveDestination(user, input.addressId ?? null);
  const fulfillment = input.fulfillment ?? 'SHIPPING';
  const method: ShippingMethod =
    input.method ?? (fulfillment === 'PICKUP' ? 'LOCAL_PICKUP' : fulfillment === 'BREEDER_DELIVERY' ? 'BREEDER_DELIVERY' : 'SPECIALIZED_SHIPPING');

  const byBreeder = new Map<string, CartLine[]>();
  for (const line of cart.lines) {
    const key = String(line.breeder_id);
    byBreeder.set(key, [...(byBreeder.get(key) ?? []), line]);
  }

  const orders: Group[] = [...byBreeder.entries()].map(([breederId, lines]) => {
    const first = lines[0];
    const speciesId = String(first.species_id);
    const weightKg = lines.reduce((sum, l) => {
      const a = get<{ weight_g: number | null }>(`SELECT weight_g FROM animals WHERE id = ?`, [l.animal_id]);
      return sum + (((a?.weight_g ?? 800) as number) / 1000) * Number(l.quantity);
    }, 0);

    const verdict = evaluateCompliance({
      speciesId,
      animalId: String(first.animal_id),
      breederId,
      originJurisdictionId: String(first.origin_jurisdiction_id ?? first.jurisdiction_id ?? ''),
      destinationJurisdictionId: destination.id,
      buyerUserId: user.id,
      method,
    });

    const quotes = buildQuotes({
      originState: String(first.state),
      destinationState: destination.state,
      speciesId,
      weightKg,
      blockedMethods: verdict.blockedMethods.map((b) => b.method),
      requiresHealthCertificate: verdict.requiredDocuments.includes('HEALTH_CERTIFICATE'),
    });
    const quote = quotes.find((q) => q.method === method) ?? quotes.find((q) => q.available) ?? quotes[0];
    const subtotal = lines.reduce((s, l) => s + Number(l.price_cents) * Number(l.quantity), 0);
    const fees = computeFees({
      subtotal_cents: subtotal,
      shipping_cents: quote?.available ? quote.cost_cents : 0,
      breederId,
      destinationState: destination.state,
    });

    return {
      breederId,
      breederName: String(first.business_name),
      lines,
      method,
      methodLabel: methodLabel(method),
      quote: quote as Group['quote'],
      quotes,
      legal: verdict,
      fees,
      weightKg: Math.round(weightKg * 100) / 100,
    };
  });

  const totals = orders.reduce(
    (acc, o) => ({
      subtotal_cents: acc.subtotal_cents + o.fees.subtotal_cents,
      shipping_cents: acc.shipping_cents + (o.quote?.available ? o.quote.cost_cents : 0),
      tax_cents: acc.tax_cents + o.fees.tax_cents,
      platform_fee_cents: acc.platform_fee_cents + o.fees.platform_fee_cents,
      // fees.total_cents already contains the quote for the chosen method —
      // adding it again here inflated every previewed order.
      total_cents: acc.total_cents + o.fees.total_cents,
    }),
    { subtotal_cents: 0, shipping_cents: 0, tax_cents: 0, platform_fee_cents: 0, total_cents: 0 },
  );

  return { orders, totals, destination, fulfillment };
}

function resolveDestination(user: SessionUser, addressId: string | null) {
  let address = addressId
    ? get<Record<string, string | null>>(`SELECT * FROM addresses WHERE id = ? AND user_id = ?`, [addressId, user.id])
    : undefined;
  if (!address) {
    address = get<Record<string, string | null>>(
      `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1`,
      [user.id],
    );
  }
  const state = address?.state ?? user.jurisdictionCode ?? null;
  const jur = state ? get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, [state]) : undefined;
  return { id: jur?.id ?? null, state, address: address ?? null };
}

function nextOrderNumber(db: ReturnType<typeof getDb>): string {
  const row = db.prepare(`SELECT COALESCE(MAX(CAST(substr(number, 10) AS INTEGER)), 0) + 1 AS n FROM orders`).get() as { n: number };
  return `FNL-${new Date().getFullYear()}-${String(row.n).padStart(6, '0')}`;
}

export function placeOrder(user: SessionUser, input: CheckoutInput) {
  const db = getDb();
  const preview = checkoutPreview(user, input);

  for (const group of preview.orders) {
    if (!group.legal.canBuy) {
      throw new HttpError(451, group.legal.notes[0] ?? 'This order is blocked by the compliance engine.', 'COMPLIANCE_BLOCK');
    }
    if (!group.quote?.available) {
      throw new HttpError(451, `${group.methodLabel}: ${group.quote?.unavailable_reason ?? 'not available for this route'}`, 'SHIPPING_BLOCK');
    }
  }

  const created: { id: string; number: string; total_cents: number; status: string; breeder: string }[] = [];
  const run = db.transaction(() => {
    for (const group of preview.orders) {
      const orderId = id('ord');
      const number = nextOrderNumber(db);
      const firstLine = group.lines[0];
      const t = nowIso();
      // fees.total_cents = subtotal + transport + tax (see computeFees); the
      // quote is already inside it, so the order total must not add it twice.
      const total = group.fees.total_cents;
      const eta = new Date(Date.now() + group.quote.eta_days * 86400000).toISOString();

      insert('orders', {
        id: orderId,
        number,
        buyer_id: user.id,
        breeder_id: group.breederId,
        status: 'BREEDER_CONFIRMED',
        fulfillment: group.method === 'LOCAL_PICKUP' ? 'PICKUP' : group.method === 'BREEDER_DELIVERY' ? 'BREEDER_DELIVERY' : 'SHIPPING',
        subtotal_cents: group.fees.subtotal_cents,
        shipping_cents: group.quote.cost_cents,
        tax_cents: group.fees.tax_cents,
        platform_fee_cents: group.fees.platform_fee_cents,
        total_cents: total,
        currency: 'USD',
        address_snapshot: group.method === 'LOCAL_PICKUP' ? { note: 'Pickup at breeder facility', facility: group.breederName } : preview.destination.address,
        contact_snapshot: { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone },
        compliance_snapshot: group.legal,
        destination_jurisdiction_id: preview.destination.id,
        origin_jurisdiction_id: firstLine.origin_jurisdiction_id ?? firstLine.jurisdiction_id,
        estimated_delivery: eta,
        handoff_window: group.method === 'LOCAL_PICKUP' ? input.pickupDate ?? 'Within 7 days' : `${group.quote.eta_days}-day transit window`,
        escrow_state: 'HELD',
        buyer_note: input.buyerNote ?? null,
        placed_at: t,
        updated_at: t,
        completed_at: null,
      });

      for (const line of group.lines) {
        const animal = get<Record<string, unknown>>(`SELECT * FROM animals WHERE id = ?`, [line.animal_id]);
        insert('order_items', {
          id: id('oit'),
          order_id: orderId,
          animal_id: line.animal_id as string,
          quantity: Number(line.quantity),
          price_cents: Number(line.price_cents),
          snapshot: {
            name: animal?.name,
            species: line.species_name,
            morph: line.morph_name ?? null,
            state: animal?.state,
            sex: animal?.sex,
            age_months: animal?.age_months,
            price_cents: line.price_cents,
          },
        });
        updateWhere(
          'animals',
          { availability: 'RESERVED', updated_at: t },
          `id = ? AND availability = 'AVAILABLE'`,
          [line.animal_id as string],
        );
        db.prepare(`DELETE FROM cart_items WHERE user_id = ? AND animal_id = ?`).run(user.id, line.animal_id as string);
        recordComplianceCheck(
          'ORDER',
          orderId,
          {
            speciesId: String(animal?.species_id),
            animalId: String(animal?.id),
            breederId: group.breederId,
            originJurisdictionId: String(animal?.jurisdiction_id),
            destinationJurisdictionId: preview.destination.id,
            buyerUserId: user.id,
            method: group.method,
          },
          group.legal,
        );
      }

      // Payment: intent → confirm → capture into platform escrow (idempotent).
      const intent = paymentProvider.createIntent({
        orderId,
        amountCents: total,
        currency: 'USD',
        idempotencyKey: `${orderId}_capture`,
      });
      const confirmed = paymentProvider.confirm({ intentId: intent.intentId, token: input.paymentToken });
      if (confirmed.status !== 'AUTHORIZED') {
        throw new HttpError(402, confirmed.message ?? 'Payment failed.', 'PAYMENT_FAILED');
      }
      paymentProvider.capture({ intentId: intent.intentId, amountCents: total });

      insert('shipping', {
        id: id('shp'),
        order_id: orderId,
        method: group.method,
        carrier: group.method === 'LOCAL_PICKUP' ? `${group.breederName} facility` : 'FAUNAL Live Freight',
        service: group.quote.label,
        cost_cents: group.quote.cost_cents,
        eta_days: group.quote.eta_days,
        status: group.method === 'LOCAL_PICKUP' ? 'PICKUP_READY' : 'BOOKED',
        legs: [
          { label: 'Booking confirmed', at: t },
          { label: 'Health certificate + transport manifest prepared', at: null },
          { label: group.method === 'LOCAL_PICKUP' ? 'Handoff at facility' : 'Temperature-controlled delivery', at: null },
        ],
        temp_controlled: group.quote.temp_controlled,
        health_cert_required: group.legal.requiredDocuments.includes('HEALTH_CERTIFICATE'),
        created_at: t,
        updated_at: t,
      });

      insert('payouts', {
        id: id('pyo'),
        order_id: orderId,
        breeder_id: group.breederId,
        gross_cents: group.fees.subtotal_cents + group.quote.cost_cents,
        fee_cents: group.fees.platform_fee_cents,
        net_cents: group.fees.subtotal_cents + group.quote.cost_cents - group.fees.platform_fee_cents,
        method: 'ACH',
        status: 'HELD',
        release_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        released_at: null,
        created_at: t,
      });

      addEvent(orderId, 'PAYMENT_PENDING', 'Order placed', `Order ${number} created from your cart.`, user.id);
      addEvent(orderId, 'PAID', 'Payment confirmed', 'Funds are held in FAUNAL escrow until you confirm delivery.', user.id);
      addEvent(orderId, 'BREEDER_CONFIRMED', 'Breeder confirmed', `${group.breederName} acknowledged the order and must verify paperwork within 24h.`, null);

      const sellerUserId = breederUserId(group.breederId);
      notify(user.id, 'ORDER_UPDATE', `Order ${number} confirmed`, 'Your payment is protected in escrow until the animal reaches you.', `/orders/${orderId}`);
      if (sellerUserId) {
        notify(sellerUserId, 'ORDER_UPDATE', `New order ${number}`, 'A buyer has paid. Confirm health paperwork and schedule the handoff.', '/seller/orders');
      }
      audit(user, 'ORDER_CREATE', 'ORDER', orderId, { number, total_cents: total }, 'api');
      created.push({ id: orderId, number, total_cents: total, status: 'BREEDER_CONFIRMED', breeder: group.breederName });
    }
  });

  try {
    run();
  } catch (e) {
    // Release reservations if the transaction rolled back.
    for (const g of preview.orders) {
      for (const l of g.lines) {
        updateWhere('animals', { availability: 'AVAILABLE', updated_at: nowIso() }, `id = ? AND availability = 'RESERVED'`, [l.animal_id as string]);
      }
    }
    throw e;
  }

  return { orders: created, totals: preview.totals, destination: preview.destination };
}

function breederUserId(breederId: string): string | null {
  return get<{ user_id: string }>(`SELECT user_id FROM breeders WHERE id = ?`, [breederId])?.user_id ?? null;
}

export function addEvent(orderId: string, status: string, label: string, note: string | null, actorId: string | null) {
  insert('order_events', { id: id('oev'), order_id: orderId, status, label, note, actor_id: actorId, created_at: nowIso() });
}

export function orderFor(orderId: string, viewer: SessionUser | null) {
  const db = getDb();
  const order = get<Record<string, string | number | null>>(
    `SELECT o.*, bu.first_name AS buyer_first, bu.last_name AS buyer_last, bu.email AS buyer_email,
            bs.business_name, bs.slug AS breeder_slug, bs.city AS breeder_city, bs.state AS breeder_state,
            bs.rating_avg, bs.user_id AS seller_user_id, bs.license_number
     FROM orders o
     JOIN breeders bs ON bs.id = o.breeder_id
     JOIN users bu ON bu.id = o.buyer_id
     WHERE o.id = ?`,
    [orderId],
  );
  if (!order) return null;
  const isParty =
    !!viewer && (viewer.id === order.buyer_id || viewer.id === order.seller_user_id || viewer.role === 'ADMIN' || viewer.role === 'MODERATOR');
  if (!isParty) return null;

  const items = db.prepare(
    `SELECT oi.*, a.name AS animal_name, a.slug, a.sex AS animal_sex, a.age_months AS animal_age_months,
            a.id AS animal_id, oi.price_cents AS unit_price_cents, img.path_small AS image,
            s.common_name AS species_name, m.name AS morph_name
     FROM order_items oi
     JOIN animals a ON a.id = oi.animal_id
     JOIN species s ON s.id = a.species_id
     LEFT JOIN morphs m ON m.id = a.morph_id
     LEFT JOIN (SELECT animal_id, path_small, ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY position) rn FROM animal_images) img
            ON img.animal_id = a.id AND img.rn = 1
     WHERE oi.order_id = ?`,
  ).all(orderId) as Record<string, string | number | null>[];

  const shipping = get<Record<string, string | number | null>>(`SELECT * FROM shipping WHERE order_id = ?`, [orderId]);
  const payment = get<Record<string, string | number | null>>(`SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`, [orderId]);
  const payout = get<Record<string, string | number | null>>(`SELECT * FROM payouts WHERE order_id = ?`, [orderId]);
  const events = db.prepare(`SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at`).all(orderId) as Record<string, string | number | null>[];
  const review = get<Record<string, string | number | null>>(`SELECT * FROM reviews WHERE order_id = ? LIMIT 1`, [orderId]);

  return {
    order: { ...order, compliance: parse(order.compliance_snapshot as string, null) },
    items,
    shipping: shipping ? { ...shipping, legs: parse(shipping.legs as string, []) } : null,
    payment,
    payout,
    events,
    review,
    timeline: buildTimeline(String(order.status), String(order.fulfillment), events),
    canReview: String(order.status) === 'COMPLETED' && !review && viewer?.id === order.buyer_id,
  };
}

/** Mobile timeline (spec §18) and the desktop rail both render from this shape. */
export function buildTimeline(status: string, fulfillment: string, events: Record<string, string | number | null>[]) {
  const seq =
    fulfillment === 'PICKUP'
      ? ['PAYMENT_PENDING', 'PAID', 'BREEDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERED', 'COMPLETED']
      : ['PAYMENT_PENDING', 'PAID', 'BREEDER_CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
  const idx = seq.indexOf(String(status));
  const cancelled = ['CANCELLED', 'REFUNDED', 'DISPUTED'].includes(String(status));
  const steps = seq.map((s, i) => ({
    key: s,
    label: orderStatusLabel(s as OrderStatus),
    done: !cancelled && idx >= i,
    current: !cancelled && idx === i,
  }));
  return { steps, cancelled, note: cancelled ? orderStatusLabel(status as OrderStatus) : null, events };
}

/** Server-side state machine. The UI only surfaces what this allows. */
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAYMENT_PENDING: ['PAID', 'CANCELLED'],
  PAID: ['BREEDER_CONFIRMED', 'PREPARING', 'CANCELLED', 'REFUNDED', 'DISPUTED'],
  BREEDER_CONFIRMED: ['PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'CANCELLED', 'DISPUTED'],
  PREPARING: ['SHIPPED', 'READY_FOR_PICKUP', 'DISPUTED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  READY_FOR_PICKUP: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: ['REFUNDED'],
  DISPUTED: ['REFUNDED', 'COMPLETED', 'CANCELLED'],
};

const SELLER_ONLY: OrderStatus[] = ['BREEDER_CONFIRMED', 'PREPARING', 'SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED'];
const BUYER_ONLY: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'DISPUTED'];

export function availableTransitions(order: Record<string, string | number | null>, viewer: SessionUser) {
  const from = String(order.status) as OrderStatus;
  const next = TRANSITIONS[from] ?? [];
  const isBuyer = viewer.id === order.buyer_id;
  const isSeller = viewer.id === order.seller_user_id;
  const isStaff = viewer.role === 'ADMIN' || viewer.role === 'MODERATOR';
  return next.filter((s) => (isStaff ? true : isSeller ? !BUYER_ONLY.includes(s) || s === 'COMPLETED' : isBuyer ? !SELLER_ONLY.includes(s) : false));
}

export function advanceOrder(
  viewer: SessionUser,
  orderId: string,
  next: OrderStatus,
  extra: { note?: string; trackingNumber?: string } = {},
) {
  const db = getDb();
  const order = get<Record<string, string | null>>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw new HttpError(404, 'Order not found.');
  const sellerUserId = order.seller_user_id ?? breederUserId(order.breeder_id as string);
  const isBuyer = viewer.id === order.buyer_id;
  const isSeller = viewer.id === sellerUserId;
  const isStaff = viewer.role === 'ADMIN' || viewer.role === 'MODERATOR';
  if (!isBuyer && !isSeller && !isStaff) throw new HttpError(403, 'You are not a participant in this order.', 'FORBIDDEN');

  const from = order.status as OrderStatus;
  if (!isStaff && !(TRANSITIONS[from] ?? []).includes(next)) {
    throw new HttpError(409, `An order cannot move from ${from} to ${next}.`, 'BAD_TRANSITION');
  }
  if (!isStaff && SELLER_ONLY.includes(next) && !isSeller) {
    throw new HttpError(403, 'Only the breeder can update fulfilment progress.', 'FORBIDDEN');
  }
  if (!isStaff && BUYER_ONLY.includes(next) && !isBuyer) {
    throw new HttpError(403, 'Only the buyer can take this action.', 'FORBIDDEN');
  }

  const t = nowIso();
  update('orders', { status: next, updated_at: t, completed_at: next === 'COMPLETED' ? t : order.completed_at }, 'id', orderId);
  addEvent(orderId, next, orderStatusLabel(next), extra.note ?? null, viewer.id);

  if (extra.trackingNumber) {
    updateWhere('shipping', { tracking_number: extra.trackingNumber, status: 'IN_TRANSIT', updated_at: t }, 'order_id = ?', [orderId]);
  }
  if (next === 'DELIVERED') {
    updateWhere('shipping', { status: 'DELIVERED', updated_at: t }, 'order_id = ?', [orderId]);
  }
  if (next === 'COMPLETED') {
    db.prepare(`UPDATE animals SET status='SOLD', availability='SOLD_OUT', updated_at = ? WHERE id IN (SELECT animal_id FROM order_items WHERE order_id = ?)`).run(t, orderId);
    db.prepare(`UPDATE breeders SET transactions_count = transactions_count + 1, updated_at = ? WHERE id = ?`).run(t, order.breeder_id);
    updateWhere('payouts', { status: 'PAID', released_at: t }, 'order_id = ?', [orderId]);
    updateWhere('orders', { escrow_state: 'RELEASED' }, 'id = ?', [orderId]);
    const payment = get<{ id: string; amount_cents: number }>(`SELECT id, amount_cents FROM payments WHERE order_id = ? AND status='PAID'`, [orderId]);
    if (payment) {
      try {
        paymentProvider.releaseEscrow?.({ intentId: payment.id, amountCents: payment.amount_cents, toAccountId: order.breeder_id as string });
      } catch {
        /* settlement job retries a failed release */
      }
    }
    if (isSeller) notify(order.buyer_id as string, 'ORDER_UPDATE', 'How did it go?', 'Leave a review so other keepers can trust this transaction.', `/orders/${orderId}/review`);
  }
  if (next === 'CANCELLED') {
    db.prepare(`UPDATE animals SET availability='AVAILABLE', updated_at = ? WHERE id IN (SELECT animal_id FROM order_items WHERE order_id = ?)`).run(t, orderId);
    const payment = get<{ id: string; amount_cents: number }>(`SELECT id, amount_cents FROM payments WHERE order_id = ? AND status='PAID'`, [orderId]);
    if (payment) {
      paymentProvider.refund({ intentId: payment.id, amountCents: payment.amount_cents, reason: extra.note ?? 'Order cancelled' });
      updateWhere('orders', { escrow_state: 'REFUNDED' }, 'id = ?', [orderId]);
    }
  }
  if (next === 'DISPUTED') {
    updateWhere('orders', { escrow_state: 'DISPUTED' }, 'id = ?', [orderId]);
    const admin = get<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
    if (admin) notify(admin.id, 'COMPLIANCE', `Dispute opened on ${order.number}`, extra.note ?? 'Funds are frozen until a moderator resolves this.', '/admin/orders');
  }

  const other = isBuyer ? sellerUserId : (order.buyer_id as string);
  if (other) notify(other, 'ORDER_UPDATE', `Order ${order.number}: ${orderStatusLabel(next)}`, extra.note ?? 'Open the order for the full timeline.', `/orders/${orderId}`);
  audit(viewer, `ORDER_${next}`, 'ORDER', orderId, { number: order.number }, isStaff ? 'admin' : 'api');
  return orderFor(orderId, viewer);
}

export function myOrders(user: SessionUser, scope: 'active' | 'completed' | 'cancelled' | 'all' = 'all') {
  const db = getDb();
  const predicate =
    scope === 'active'
      ? `o.status NOT IN ('COMPLETED','CANCELLED','REFUNDED')`
      : scope === 'completed'
        ? `o.status = 'COMPLETED'`
        : scope === 'cancelled'
          ? `o.status IN ('CANCELLED','REFUNDED','DISPUTED')`
          : `1=1`;
  return db
    .prepare(
      `SELECT o.*, b.business_name, b.slug AS breeder_slug,
              (SELECT a.name FROM order_items oi JOIN animals a ON a.id = oi.animal_id WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS first_animal,
              (SELECT img.path_small FROM order_items oi JOIN animal_images img ON img.animal_id = oi.animal_id AND img.position = 0 WHERE oi.order_id = o.id LIMIT 1) AS image,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              (SELECT COUNT(*) FROM reviews r WHERE r.order_id = o.id) AS has_review
       FROM orders o JOIN breeders b ON b.id = o.breeder_id
       WHERE o.buyer_id = ? AND ${predicate}
       ORDER BY o.placed_at DESC LIMIT 60`,
    )
    .all(user.id) as Record<string, string | number | null>[];
}

export function breederOrders(user: SessionUser) {
  if (!user.breederId) return [];
  const db = getDb();
  return db
    .prepare(
      `SELECT o.*, u.first_name, u.last_name, u.email,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              (SELECT a.name FROM order_items oi JOIN animals a ON a.id = oi.animal_id WHERE oi.order_id = o.id LIMIT 1) AS first_animal,
              (SELECT s.status FROM shipping s WHERE s.order_id = o.id LIMIT 1) AS shipping_status,
              (SELECT s.tracking_number FROM shipping s WHERE s.order_id = o.id LIMIT 1) AS tracking_number
       FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.breeder_id = ? ORDER BY o.placed_at DESC LIMIT 60`,
    )
    .all(user.breederId)
    .map((raw) => {
      const row = raw as Record<string, string | number | null>;
      const snap = parse(row.address_snapshot as string, {}) as Record<string, string>;
      return { ...row, destination_city: snap.city ?? null, destination_state: snap.state ?? null };
    }) as Record<string, string | number | null>[];
}

export function submitReview(
  user: SessionUser,
  orderId: string,
  scores: {
    overall: number;
    communication: number;
    listing_accuracy: number;
    animal_condition: number;
    shipping: number;
    experience: number;
    comment?: string;
  },
) {
  const db = getDb();
  const order = get<Record<string, string | null>>(`SELECT * FROM orders WHERE id = ? AND buyer_id = ?`, [orderId, user.id]);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status !== 'COMPLETED') throw new HttpError(409, 'You can review an order once it is completed.');
  const reviewId = id('rev');
  const animalId = get<{ animal_id: string }>(`SELECT animal_id FROM order_items WHERE order_id = ? LIMIT 1`, [orderId])?.animal_id;

  insert('reviews', {
    id: reviewId,
    order_id: orderId,
    breeder_id: order.breeder_id,
    animal_id: animalId ?? null,
    author_id: user.id,
    overall: clampScore(scores.overall),
    communication: clampScore(scores.communication),
    listing_accuracy: clampScore(scores.listing_accuracy),
    animal_condition: clampScore(scores.animal_condition),
    shipping: clampScore(scores.shipping),
    experience: clampScore(scores.experience),
    comment: scores.comment ?? null,
    status: 'PUBLISHED',
    created_at: nowIso(),
  });

  const agg = db.prepare(`SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE breeder_id = ? AND status='PUBLISHED'`).get(order.breeder_id) as {
    avg: number;
    n: number;
  };
  update('breeders', { rating_avg: Math.round(agg.avg * 100) / 100, rating_count: agg.n, updated_at: nowIso() }, 'id', order.breeder_id);
  const sellerUserId = breederUserId(order.breeder_id as string);
  if (sellerUserId) notify(sellerUserId, 'SYSTEM', `New ${clampScore(scores.overall)}★ review`, 'Your public profile rating has been updated.', `/breeders/${order.breeder_slug ?? ''}`);
  audit(user, 'REVIEW_CREATE', 'REVIEW', reviewId, { order: order.number }, 'api');
  return { reviewId };
}

function clampScore(n: number) {
  return Math.max(1, Math.min(5, Math.round(Number(n) || 5)));
}
