'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { post, ApiError } from './api';
import { useApp } from './app-provider';
import type { ComplianceResult } from '@/domain/types';
import { titleCase } from '@/domain/util';

/**
 * Shared checkout brain for both surfaces (spec §48): one state machine, one
 * API contract, two very different screens. The preview is re-requested from the
 * server whenever address or method changes — the client never computes legality.
 */

export interface QuoteView {
  method: string;
  label: string;
  blurb: string;
  cost_cents: number;
  eta_days: number;
  temp_controlled: boolean;
  available: boolean;
  unavailable_reason?: string;
}

export interface CheckoutLine {
  id: string;
  animal_id: string;
  name: string;
  slug: string;
  species_name: string;
  morph_name: string | null;
  price_cents: number;
  line_cents: number;
  quantity: number;
  image: string | null;
  shipping_method: string;
  listing_blocked: boolean;
  legal: ComplianceResult;
  [key: string]: unknown;
}

export interface CheckoutGroup {
  breederId: string;
  breederName: string;
  lines: CheckoutLine[];
  method: string;
  methodLabel: string;
  quote: QuoteView | null;
  quotes: QuoteView[];
  legal: ComplianceResult;
  weightKg: number;
  fees: {
    subtotal_cents: number;
    shipping_cents: number;
    tax_cents: number;
    platform_fee_cents: number;
    total_cents: number;
    commission_bps: number;
    plan: string;
  };
}

export interface Totals {
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  platform_fee_cents: number;
  total_cents: number;
}

export interface Preview {
  orders: CheckoutGroup[];
  totals: Totals;
  destination: { id: string | null; state: string | null; address: Record<string, string | number | null> | null };
  fulfillment: 'SHIPPING' | 'PICKUP' | 'BREEDER_DELIVERY';
}

export type Fulfillment = 'SHIPPING' | 'PICKUP' | 'BREEDER_DELIVERY';

export function useCheckout(initial: Preview | null, signedIn: boolean) {
  const router = useRouter();
  const { refresh, toast } = useApp();
  const [preview, setPreview] = useState<Preview | null>(initial);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(initial?.fulfillment ?? 'SHIPPING');
  const [method, setMethod] = useState<string>('SPECIALIZED_SHIPPING');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [pickupDate, setPickupDate] = useState<string>('');
  const [busy, setBusy] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ orders: { id: string; number: string }[]; total: number } | null>(null);

  const run = useCallback(
    async (patch: { fulfillment?: Fulfillment; method?: string; addressId?: string | null }) => {
      if (!signedIn) return;
      setBusy(true);
      setError(null);
      try {
        const res = await post<Preview>('checkout/preview', { fulfillment, method, addressId, ...patch });
        setPreview(res);
        // A method that just became illegal for this route falls back to the first legal one.
        const stillValid = res.orders.every((o) => o.quote?.method === (patch.method ?? method));
        if (!stillValid) {
          const fallback = res.orders.find((o) => o.quote)?.quote?.method;
          if (fallback && fallback !== method) {
            setMethod(fallback);
            setError(`“${titleCase(patch.method ?? method).toLowerCase()}” is not permitted on one of these routes — switched to ${titleCase(fallback).toLowerCase()}.`);
          }
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not price this order.');
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addressId, fulfillment, method, signedIn],
  );

  useEffect(() => {
    // First paint already has a server-computed preview; only changes re-query.
    if (preview) return;
    void run({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseMethod = (m: string) => {
    setMethod(m);
    void run({ method: m });
  };
  const chooseFulfillment = (f: Fulfillment) => {
    setFulfillment(f);
    const m = f === 'PICKUP' ? 'LOCAL_PICKUP' : f === 'BREEDER_DELIVERY' ? 'BREEDER_DELIVERY' : 'SPECIALIZED_SHIPPING';
    setMethod(m);
    void run({ fulfillment: f, method: m });
  };
  const chooseAddress = (idValue: string | null) => {
    setAddressId(idValue);
    void run({ addressId: idValue });
  };

  const blocking = (preview?.orders ?? []).filter((o) => !o.legal.canBuy || o.lines.some((l) => l.listing_blocked));
  const needsDocs = (preview?.orders ?? []).filter((o) => o.legal.verdict === 'REQUIRES_DOCUMENTATION' || o.legal.verdict === 'RESTRICTED');
  const canPlace = signedIn && !!preview && preview.orders.length > 0 && blocking.length === 0 && !busy;

  async function place(body: Record<string, unknown>) {
    if (!canPlace) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await post<{ orders: { id: string; number: string }[]; totals: Totals }>('checkout', {
        fulfillment,
        method,
        addressId,
        pickupDate: pickupDate || undefined,
        ...body,
      });
      setPlaced({ orders: res.orders, total: res.totals.total_cents });
      refresh();
      toast(`Order ${res.orders[0]?.number ?? ''} placed — payment is held in escrow`, { tone: 'success' });
      router.push(res.orders.length === 1 ? `/orders/${res.orders[0].id}` : '/orders');
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Checkout failed.';
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setPlacing(false);
    }
  }

  return {
    preview,
    totals: preview?.totals ?? null,
    destination: preview?.destination ?? null,
    fulfillment,
    method,
    addressId,
    setAddressId,
    setPickupDate,
    pickupDate,
    busy,
    error,
    placing,
    placed,
    blocking,
    needsDocs,
    canPlace,
    chooseMethod,
    chooseFulfillment,
    chooseAddress,
    place,
    retry: () => run({}),
  };
}

export const FULFILLMENT_OPTIONS: { value: Fulfillment; label: string; hint: string }[] = [
  { value: 'SHIPPING', label: 'Specialized live shipping', hint: 'Insured ground/air in a temperature-boxed container, booked on mild days.' },
  { value: 'PICKUP', label: 'Local pickup', hint: 'Meet the breeder at their facility. No transport restriction applies.' },
  { value: 'BREEDER_DELIVERY', label: 'Breeder delivery', hint: 'The breeder drives the animal to you on an agreed date.' },
];
