import { getDb } from '@/lib/db';
import type { ShippingMethod } from './types';

/**
 * Shipping (spec §34). Quotes are computed, never hard-coded: base rate per
 * method + interstate zone surcharge + size factor + temperature-controlled
 * handling. A method is only selectable when the compliance engine leaves that
 * method open for the exact origin→destination route.
 */

export interface QuoteInput {
  originState: string;
  destinationState: string | null;
  speciesId: string;
  weightKg: number;
  blockedMethods?: ShippingMethod[];
  requiresHealthCertificate?: boolean;
}

export interface Quote {
  method: ShippingMethod;
  label: string;
  blurb: string;
  cost_cents: number;
  eta_days: number;
  temp_controlled: boolean;
  available: boolean;
  unavailable_reason?: string;
}

const METHODS: {
  method: ShippingMethod;
  label: string;
  blurb: string;
  baseCents: number;
  perKgCents: number;
  eta: [number, number];
}[] = [
  {
    method: 'LOCAL_PICKUP',
    label: 'Local pickup',
    blurb: "Collect at the breeder's facility in an approved carrier. ID + permit copies on arrival.",
    baseCents: 0,
    perKgCents: 0,
    eta: [1, 7],
  },
  {
    method: 'SPECIALIZED_SHIPPING',
    label: 'Specialized live shipping',
    blurb: 'Temperature-controlled live-freight van, hand-delivered to the airport of entry, USDA/vet checked.',
    baseCents: 18500,
    perKgCents: 2200,
    eta: [1, 3],
  },
  {
    method: 'BREEDER_DELIVERY',
    label: 'Breeder delivery',
    blurb: 'The breeder drives the animal to a safe handoff point inside your metro area.',
    baseCents: 9500,
    perKgCents: 900,
    eta: [2, 10],
  },
  {
    method: 'INTERNATIONAL',
    label: 'International export',
    blurb: 'Enabled only where origin, destination and CITES paperwork all permit it.',
    baseCents: 74000,
    perKgCents: 6100,
    eta: [7, 21],
  },
];

// Commerce zones (0 = dense north-east corridor … 5 = far west).
const STATE_ZONE: Record<string, number> = {
  NY: 0, NJ: 0, CT: 0, PA: 0, MA: 1, MD: 1, DC: 1,
  NH: 1, VT: 1, ME: 1, DE: 1,
  NC: 2, SC: 2, GA: 2, FL: 2, TN: 2, KY: 2, WV: 2,
  OH: 2, MI: 2, IN: 2, IL: 2, WI: 3,
  TX: 3, LA: 3, OK: 3, AR: 3, MS: 3, AL: 3,
  MN: 3, IA: 3, MO: 3, KS: 3, NE: 3, ND: 3, SD: 3,
  CO: 4, WY: 4, MT: 4, NM: 4, AZ: 4, NV: 4, UT: 4,
  CA: 5, OR: 5, WA: 5, ID: 5, AK: 6, HI: 6,
};

export function zone(originState: string, destState: string | null): number {
  if (!destState) return 0;
  const o = originState.toUpperCase();
  const d = destState.toUpperCase();
  if (o === d) return 0;
  return Math.abs((STATE_ZONE[o] ?? 3) - (STATE_ZONE[d] ?? 3)) || 1;
}

export function needsTempControl(speciesId: string, weightKg: number): boolean {
  const db = getDb();
  const s = db.prepare(`SELECT care_difficulty, adult_length_cm, is_sensitive FROM species WHERE id = ?`).get(speciesId) as
    | { care_difficulty: string; adult_length_cm: number; is_sensitive: number }
    | undefined;
  if (!s) return weightKg > 6;
  return weightKg > 6 || s.care_difficulty === 'EXPERT' || s.is_sensitive === 1 || s.adult_length_cm >= 90;
}

export function buildQuotes(input: QuoteInput): Quote[] {
  const db = getDb();
  const species = db.prepare(`SELECT adult_length_cm FROM species WHERE id = ?`).get(input.speciesId) as
    | { adult_length_cm: number }
    | undefined;
  const sizeFactor = Math.min(2.4, Math.max(0.85, 1 + ((species?.adult_length_cm ?? 40) - 30) / 90));
  const z = zone(input.originState, input.destinationState);
  const sameState = !input.destinationState || input.destinationState.toUpperCase() === input.originState.toUpperCase();
  const blocked = new Set(input.blockedMethods ?? []);
  const temp = needsTempControl(input.speciesId, input.weightKg);

  return METHODS.map((m) => {
    let cost = m.baseCents + m.perKgCents * input.weightKg + z * 3200;
    cost *= sizeFactor;
    if (m.method === 'SPECIALIZED_SHIPPING' && temp) cost += 4500;
    if (input.requiresHealthCertificate && m.method !== 'LOCAL_PICKUP') cost += 2500;
    if (m.method === 'LOCAL_PICKUP') cost = 0;

    let eta = m.eta[0] + Math.min(4, z);
    if (m.method === 'INTERNATIONAL') eta = m.eta[1];
    if (m.method === 'LOCAL_PICKUP') eta = 3;

    const quote: Quote = {
      method: m.method,
      label: m.label,
      blurb: m.blurb,
      cost_cents: Math.round(cost / 100) * 100,
      eta_days: eta,
      temp_controlled: m.method === 'SPECIALIZED_SHIPPING' && temp,
      available: true,
    };

    if (blocked.has(m.method)) {
      quote.available = false;
      quote.unavailable_reason = 'Blocked by the FAUNAL compliance engine for this species on this route.';
    } else if (m.method === 'INTERNATIONAL') {
      quote.available = false;
      quote.unavailable_reason = 'FAUNAL currently operates domestic U.S. routes only.';
    } else if (!sameState && m.method === 'LOCAL_PICKUP') {
      quote.available = false;
      quote.unavailable_reason = `Pickup requires travel to ${input.originState}, where this animal is held.`;
    } else if (m.method === 'BREEDER_DELIVERY' && z > 2) {
      quote.available = false;
      quote.unavailable_reason = "Outside this breeder's delivery radius.";
    }
    return quote;
  });
}

export function methodLabel(method: string): string {
  return (
    {
      LOCAL_PICKUP: 'Local pickup',
      SPECIALIZED_SHIPPING: 'Specialized live shipping',
      BREEDER_DELIVERY: 'Breeder delivery',
      INTERNATIONAL: 'International export',
    } as Record<string, string>
  )[method] ?? method;
}
