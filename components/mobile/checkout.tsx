'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, ComplianceBadge, ErrorNote, EmptyState } from '@/components/ui/primitives';
import { Accordion, Sheet } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { useCheckout, FULFILLMENT_OPTIONS, type Preview } from '@/lib/ui/checkout-core';
import { money } from '@/lib/ui/animal-view';
import type { AddressView, MethodView } from '@/components/desktop/checkout';
import { titleCase } from '@/domain/util';

/**
 * MOBILE checkout — one decision per screen-section, sheets instead of modals,
 * a sticky pay bar above the home indicator. Same server preview, same rules.
 */
export function MobileCheckout({
  initial,
  addresses,
  methods,
  contact,
}: {
  initial: Preview | null;
  addresses: AddressView[];
  methods: MethodView[];
  contact: { firstName: string; lastName: string; email: string; phone: string };
}) {
  const { refresh, toast } = useApp();
  const c = useCheckout(initial, true);
  const [addressOpen, setAddressOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(methods[0]?.id ?? null);
  const [cardFormOpen, setCardFormOpen] = useState(!methods.length);
  const [card, setCard] = useState({ number: '', expMonth: '', expYear: '', cvv: '' });
  const [form, setForm] = useState({ recipient: contact.firstName + ' ' + contact.lastName, line1: '', city: '', state: '', zip: '' });
  const [agreed, setAgreed] = useState({ age: false, legal: false, accurate: false });
  const allAgreed = agreed.age && agreed.legal && agreed.accurate;

  if (!initial || !initial.orders.length) {
    return (
      <div>
        <MobileHeader title="Checkout" back="/cart" />
        <div className="px-4 py-10">
          <EmptyState icon="cart" title="Nothing to check out" body="Your cart is empty or blocked. Browse animals cleared for your address." action={<Link href="/explore" className="btn">Explore</Link>} />
        </div>
      </div>
    );
  }

  const chosenAddress = c.addressId ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id;
  const address = addresses.find((a) => a.id === chosenAddress);

  async function saveAddress() {
    try {
      await post('addresses', { ...form, label: 'Home', isDefault: addresses.length === 0 });
      toast('Address saved', { tone: 'success' });
      setAddressOpen(false);
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save address', { tone: 'error' });
    }
  }

  async function tokenize(): Promise<string | null> {
    try {
      const res = await post<{ methods: MethodView[] }>('payment-methods', card);
      const newId = res.methods[0]?.id ?? null;
      setPaymentId(newId);
      setCardFormOpen(false);
      setCard({ number: '', expMonth: '', expYear: '', cvv: '' });
      refresh();
      return newId;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Card rejected', { tone: 'error' });
      return null;
    }
  }

  async function pay() {
    let methodId = paymentId;
    if (!methodId) {
      if (!card.number) {
        setPayOpen(true);
        toast('Add a payment method to continue', { tone: 'warn' });
        return;
      }
      methodId = await tokenize();
      if (!methodId) return;
    }
    await c.place({ paymentMethodId: methodId, paymentToken: `tok_mob_${Math.random().toString(36).slice(2, 12)}`, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone });
  }

  return (
    <div className="pb-2">
      <MobileHeader title="Checkout" subtitle={`${initial.orders.length} order${initial.orders.length === 1 ? '' : 's'}`} back="/cart" />

      <div className="space-y-3 px-4 pt-3">
        {/* -------------------------------------------------------- destination */}
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <p className="label">Shipping to</p>
            <button className="text-[12.5px] font-medium" onClick={() => setAddressOpen(true)}>
              Change
            </button>
          </div>
          {address ? (
            <p className="mt-1.5 text-[13.5px] leading-relaxed">
              {address.recipient}
              <br />
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.zip}
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] text-[var(--warning)]">No address on file — add one so we can prove legality at the destination.</p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
            <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
            Every verdict below is recomputed by the compliance engine when this address changes.
          </p>
        </section>

        {/* ---------------------------------------------------------- transport */}
        <section className="card p-4">
          <p className="label">Transport</p>
          <div className="mt-2 space-y-2">
            {FULFILLMENT_OPTIONS.map((o) => {
              const blocked = initial.orders.some((g) => g.quotes.some((q) => q.method === (o.value === 'PICKUP' ? 'LOCAL_PICKUP' : o.value === 'BREEDER_DELIVERY' ? 'BREEDER_DELIVERY' : 'SPECIALIZED_SHIPPING') && !q.available));
              return (
                <button
                  key={o.value}
                  onClick={() => c.chooseFulfillment(o.value)}
                  className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left ${c.fulfillment === o.value ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`}
                >
                  <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${c.fulfillment === o.value ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--accent-soft)]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{o.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--muted)]">{o.hint}</span>
                    {blocked ? <span className="mt-1 block text-[11.5px] text-[var(--warning)]">Not permitted on one of these routes — that leg falls back automatically.</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------- per order */}
        {initial.orders.map((g) => (
          <section key={g.breederId} className="card overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">{g.breederName}</p>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  {g.lines.length} animal{g.lines.length === 1 ? '' : 's'} · {g.methodLabel.toLowerCase()} · {money(g.quote?.cost_cents ?? 0)}
                </p>
              </div>
              <ComplianceBadge verdict={g.legal.verdict} />
            </div>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {g.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 p-3">
                  <Media media={{ path_medium: l.image, path_small: l.image, base_path: null }} alt={l.name} ratio="1 / 1" className="w-11 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{l.name}</span>
                    <span className="block text-[12px] text-[var(--muted)]">{l.species_name}</span>
                  </span>
                  <Money cents={l.line_cents} size="sm" />
                </li>
              ))}
            </ul>
            <div className="p-4">
              <Accordion title="Paperwork & rules for this leg" icon="doc">
                <ul className="space-y-2">
                  {g.legal.requiredDocuments.length ? (
                    g.legal.requiredDocuments.map((d) => {
                      const missing = g.legal.missingDocuments.includes(d);
                      return (
                        <li key={d} className="flex items-center gap-2 text-[12.5px]">
                          <Icon name={missing ? 'alert' : 'check'} size={14} className={missing ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
                          {titleCase(d)} {missing ? '· waiting on the breeder' : '· verified'}
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-[12.5px] text-[var(--muted)]">Standard FAUNAL terms only.</li>
                  )}
                </ul>
                {g.legal.rules.length ? (
                  <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                    {g.legal.rules.map((r) => (
                      <li key={r.id} className="text-[11.5px] leading-relaxed text-[var(--muted)]">
                        {r.label} — {r.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Accordion>
            </div>
          </section>
        ))}

        {/* ------------------------------------------------------------ payment */}
        <button className="card flex w-full items-center gap-3 p-4 text-left" onClick={() => setPayOpen(true)}>
          <Icon name="card" size={18} className="text-[var(--accent-soft)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">Payment</span>
            <span className="block text-[12.5px] text-[var(--muted)]">
              {methods.find((m) => m.id === paymentId) ? `${methods.find((m) => m.id === paymentId)!.brand} ···· ${methods.find((m) => m.id === paymentId)!.last4}` : cardFormOpen ? 'Enter a card — tokenized, never stored' : 'Select a method'}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
        </button>

        <section className="card p-4">
          <p className="label">Declarations</p>
          <ul className="mt-2 space-y-2.5">
            {[
              ['age', 'I am 18 or older.'],
              ['legal', 'It is legal for me to keep these species at this address.'],
              ['accurate', 'Contact and delivery details are correct.'],
            ].map(([key, text]) => (
              <li key={key}>
                <label className="check">
                  <input type="checkbox" checked={agreed[key as 'age' | 'legal' | 'accurate']} onChange={(e) => setAgreed({ ...agreed, [key]: e.target.checked })} />
                  <span className="text-[13px] leading-snug">{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {c.error ? <ErrorNote>{c.error}</ErrorNote> : null}
        {c.blocking.length ? <ErrorNote tone="warn">{c.blocking.length} order leg(s) are blocked by compliance and cannot be paid for.</ErrorNote> : null}

        <div className="h-2" />
      </div>

      <div className="sticky-cta sticky-cta-single mt-3">
        <button className="btn btn-block" onClick={pay} disabled={!c.canPlace || !allAgreed || c.placing || (!paymentId && !cardFormOpen)}>
          {c.busy ? (
            <>
              <Icon name="refresh" size={15} className="animate-spin" /> Re-checking legality…
            </>
          ) : c.placing ? (
            <>
              <Icon name="refresh" size={15} className="animate-spin" /> Authorising escrow…
            </>
          ) : (
            <>
              <Icon name="lock" size={15} /> Pay {money(c.totals?.total_cents ?? 0)}
            </>
          )}
        </button>
      </div>

      {/* -------------------------------------------------------------- sheets */}
      <Sheet open={addressOpen} onClose={() => setAddressOpen(false)} title="Delivery address" footer={<button className="btn btn-block" onClick={saveAddress} disabled={!(form.line1 && form.city && form.state.length === 2 && form.zip.length === 5)}>Save & re-check legality</button>}>
        <ul className="mb-3 space-y-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <button
                className={`w-full rounded-lg border p-3 text-left text-[13px] leading-relaxed ${a.id === chosenAddress ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`}
                onClick={() => {
                  c.chooseAddress(a.id);
                  setAddressOpen(false);
                }}
              >
                {a.recipient} — {a.line1}, {a.city}, {a.state} {a.zip}
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2.5">
          <p className="label">Add a new address</p>
          {(
            [
              ['recipient', 'Recipient'],
              ['line1', 'Street address'],
              ['city', 'City'],
              ['state', 'State'],
              ['zip', 'ZIP'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="label">{label}</span>
              <input
                className="input mt-1 h-11"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: key === 'zip' ? e.target.value.replace(/\D/g, '').slice(0, 5) : key === 'state' ? e.target.value.toUpperCase().slice(0, 2) : e.target.value })}
              />
            </label>
          ))}
        </div>
      </Sheet>

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="Payment method" footer={<button className="btn btn-block" onClick={() => setPayOpen(false)}>Done</button>}>
        <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
          FaunalPay holds the amount in escrow. The breeder is paid 48 hours after you confirm the animal arrived in condition.
        </p>
        <ul className="mt-3 space-y-2">
          {methods.map((m) => (
            <li key={m.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-lg border p-3.5 text-left ${paymentId === m.id ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`}
                onClick={() => {
                  setPaymentId(m.id);
                  setCardFormOpen(false);
                }}
              >
                <Icon name="card" size={17} />
                <span className="flex-1 text-[13.5px]">
                  {m.brand.replace('_', ' ')} ···· {m.last4}
                </span>
                {paymentId === m.id ? <Icon name="check" size={16} className="text-[var(--success)]" /> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2.5">
          <p className="label">{cardFormOpen ? 'New card' : 'Add another card'}</p>
          {cardFormOpen ? (
            <>
              <label className="block">
                <span className="label">Card number</span>
                <input className="input mt-1 h-11" inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} placeholder="4242 4242 4242 4242" />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="label">MM</span>
                  <input className="input mt-1 h-11" inputMode="numeric" value={card.expMonth} onChange={(e) => setCard({ ...card, expMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                </label>
                <label className="block">
                  <span className="label">YY</span>
                  <input className="input mt-1 h-11" inputMode="numeric" value={card.expYear} onChange={(e) => setCard({ ...card, expYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </label>
                <label className="block">
                  <span className="label">CVC</span>
                  <input className="input mt-1 h-11" inputMode="numeric" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </label>
              </div>
              <button className="btn btn-block" onClick={() => tokenize()} disabled={!card.number}>
                Save card to my account
              </button>
            </>
          ) : (
            <button className="btn btn-quiet btn-block" onClick={() => setCardFormOpen(true)}>
              <Icon name="plus" size={15} /> Add a card
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
