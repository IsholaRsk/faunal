'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, ComplianceBadge, ErrorNote, EmptyState, ProgressSteps } from '@/components/ui/primitives';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { useCheckout, FULFILLMENT_OPTIONS, type Preview } from '@/lib/ui/checkout-core';
import { money } from '@/lib/ui/animal-view';
import { titleCase } from '@/domain/util';

export interface AddressView {
  id: string;
  label: string;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  is_default: number;
}
export interface MethodView {
  id: string;
  brand: string;
  last4: string;
  expiry_month: number | null;
  expiry_year: number | null;
  is_default: number;
  provider: string;
}

/**
 * DESKTOP checkout — four visible stages in a wide two-column layout: the
 * destination decides legality, so it comes first and everything downstream is
 * recomputed by the server (spec §13 / §21 / §22).
 */
export function DesktopCheckout({
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
  const [step, setStep] = useState(0);
  const [showAddress, setShowAddress] = useState(false);
  const [newCard, setNewCard] = useState(false);
  const [card, setCard] = useState({ number: '', expMonth: '', expYear: '', cvv: '' });
  const [paymentId, setPaymentId] = useState<string | null>(methods[0]?.id ?? null);
  const [form, setForm] = useState({ recipient: '', line1: '', line2: '', city: '', state: '', zip: '' });
  const [who, setWho] = useState(contact);
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState({ age: false, legal: false, accurate: false });
  const allAgreed = agreed.age && agreed.legal && agreed.accurate;

  if (!initial || !initial.orders.length) {
    return (
      <div className="shell py-20">
        <EmptyState
          icon="cart"
          title="Nothing to check out"
          body="Your cart is empty or every line is blocked. Add an animal that is legal at your address and the compliance panel will clear for checkout."
          action={
            <Link href="/animals" className="btn">
              Browse animals
            </Link>
          }
        />
      </div>
    );
  }

  async function addAddress() {
    try {
      await post('addresses', { ...form, isDefault: addresses.length === 0 });
      toast('Address saved', { tone: 'success' });
      setShowAddress(false);
      setForm({ recipient: '', line1: '', line2: '', city: '', state: '', zip: '' });
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save that address', { tone: 'error' });
    }
  }

  async function submit() {
    let methodId = paymentId;
    if (newCard) {
      try {
        const res = await post<{ methods: MethodView[] }>('payment-methods', card);
        methodId = res.methods[0]?.id ?? null;
        setPaymentId(methodId);
        setNewCard(false);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Card could not be tokenized', { tone: 'error' });
        return;
      }
    }
    await c.place({
      paymentMethodId: methodId,
      paymentToken: `tok_web_${Math.random().toString(36).slice(2, 12)}`,
      buyerNote: note || undefined,
      firstName: who.firstName,
      lastName: who.lastName,
      email: who.email,
      phone: who.phone,
    });
  }

  const groups = initial.orders;

  return (
    <div className="shell py-8">
      <div className="flex items-end justify-between gap-8 border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1 className="h2 mt-1.5">Complete your order</h1>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            {groups.length} order{groups.length === 1 ? '' : 's'} — one per breeder, so each paperwork pack stays attached to the right animal.
          </p>
        </div>
        <div className="w-[420px]">
          <ProgressSteps steps={['Destination', 'Transport', 'Compliance', 'Payment', 'Review']} current={step} />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)_400px] items-start gap-10">
        <div className="space-y-5">
          {/* ------------------------------------------------------ 1 address */}
          <section id="destination" className="card p-6">
            <StageHead
              n={1}
              title="Delivery destination"
              hint="Legality is evaluated against this address — not the seller's."
              onEdit={() => setShowAddress((v) => !v)}
              editLabel="Add address"
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {addresses.map((a) => {
                const active = (c.addressId ?? addresses.find((x) => x.is_default)?.id) === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => c.chooseAddress(a.id)}
                    className={`rounded-lg border p-4 text-left transition ${active ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--accent-soft)]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">{a.label}</span>
                      {active ? <Icon name="check" size={15} className="text-[var(--success)]" /> : null}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      {a.recipient}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}
                      <br />
                      {a.city}, {a.state} {a.zip}
                    </p>
                  </button>
                );
              })}
              {!addresses.length ? (
                <div className="col-span-3 rounded-lg border border-dashed border-[var(--line)] p-4 text-[13px] text-[var(--muted)]">
                  No address on file. Add one — without it we cannot prove the animal is legal where it will live.
                </div>
              ) : null}
            </div>

            {showAddress ? (
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-2)] p-4">
                <Field label="Recipient" value={form.recipient} onChange={(v) => setForm({ ...form, recipient: v })} />
                <Field label="Street address" value={form.line1} onChange={(v) => setForm({ ...form, line1: v })} className="col-span-2" />
                <Field label="Apartment (optional)" value={form.line2} onChange={(v) => setForm({ ...form, line2: v })} />
                <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase().slice(0, 2) })} placeholder="NY" />
                <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v.replace(/\D/g, '').slice(0, 5) })} />
                <div className="col-span-3 flex items-center justify-between">
                  <p className="text-[12px] text-[var(--muted)]">Saved to your account for later orders.</p>
                  <button className="btn btn-sm" onClick={addAddress} disabled={!(form.recipient && form.line1 && form.city && form.state.length === 2 && form.zip.length === 5)}>
                    Save address
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* ----------------------------------------------------- 2 transport */}
          <section id="transport" className="card p-6">
            <StageHead n={2} title="Transport" hint="Methods that the compliance engine blocks for a route are not selectable." />
            <div className="mt-4 flex gap-2">
              {FULFILLMENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => c.chooseFulfillment(o.value)}
                  className={`flex-1 rounded-lg border p-3.5 text-left transition ${c.fulfillment === o.value ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--accent-soft)]'}`}
                >
                  <span className="text-[13.5px] font-medium">{o.label}</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[var(--muted)]">{o.hint}</span>
                </button>
              ))}
            </div>
            {c.fulfillment === 'PICKUP' ? (
              <label className="mt-4 block">
                <span className="label">Preferred pickup date</span>
                <input type="date" className="input mt-1 w-[220px]" value={c.pickupDate} onChange={(e) => c.setPickupDate(e.target.value)} />
              </label>
            ) : null}

            <div className="mt-4 divide-y divide-[var(--line)]">
              {groups.map((g) => (
                <div key={g.breederId} className="py-4 first:pt-0">
                  <p className="text-[13px] font-medium">
                    {g.breederName} · <span className="font-normal text-[var(--muted)]">{g.lines.length} animal{g.lines.length === 1 ? '' : 's'} · {g.weightKg} kg</span>
                  </p>
                  <div className="mt-2.5 grid grid-cols-4 gap-2.5">
                    {g.quotes.map((q) => {
                      const active = g.method === q.method;
                      return (
                        <button
                          key={q.method}
                          disabled={!q.available}
                          onClick={() => c.chooseMethod(q.method)}
                          className={`rounded-lg border p-3 text-left transition ${active ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'} ${q.available ? 'hover:border-[var(--accent-soft)]' : 'cursor-not-allowed opacity-50'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[12.5px] font-medium leading-tight">{q.label}</span>
                            {q.available ? null : <Icon name="ban" size={14} className="text-[var(--error)]" />}
                          </div>
                          <span className="mt-1.5 block text-[12px] text-[var(--muted)]">{q.available ? `${money(q.cost_cents)} · ${q.eta_days}d` : q.unavailable_reason}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------- 3 compliance */}
          <section id="compliance" className="card p-6">
            <StageHead n={3} title="Compliance & paperwork" hint="This is the same check the moderation desk reviews before dispatch is released." />
            <ul className="mt-4 space-y-3">
              {groups.map((g) => (
                <li key={g.breederId} className="rounded-lg border border-[var(--line)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[13.5px] font-medium">{g.breederName}</p>
                      <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-[var(--muted)]">
                        {g.legal.notes[0] ?? `Cleared for ${c.destination?.state ?? 'your state'} with standard FAUNAL terms.`}
                      </p>
                    </div>
                    <ComplianceBadge verdict={g.legal.verdict} />
                  </div>
                  {g.legal.rules.length ? (
                    <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                      {g.legal.rules.map((r) => (
                        <li key={r.id} className="text-[12px] text-[var(--muted)]">
                          <span className="text-[var(--ink)]">{r.label}</span> — {r.detail}
                          {r.citation ? <span className="mono ml-1 text-[11px]">({r.citation})</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {g.legal.missingDocuments.length ? (
                    <div className="mt-3">
                      <ErrorNote tone="warn">
                        Held until the breeder files {g.legal.missingDocuments.map((d) => titleCase(d)).join(', ')}. You are not charged
                        before that document is verified.
                      </ErrorNote>
                    </div>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--success)]">
                      <Icon name="check" size={14} /> All required documents verified on this order
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------------- 4 payment */}
          <section id="payment" className="card p-6">
            <StageHead
              n={4}
              title="Payment"
              hint="Charged to escrow on placement; released to the breeder 48 hours after you confirm the animal arrived in condition."
              onEdit={() => setNewCard((v) => !v)}
              editLabel={newCard ? 'Use a saved method' : 'Add a card'}
            />
            <div className="mt-4 space-y-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setPaymentId(m.id);
                    setNewCard(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition ${paymentId === m.id && !newCard ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--accent-soft)]'}`}
                >
                  <Icon name="card" size={18} className="text-[var(--accent-soft)]" />
                  <span className="text-[13.5px]">
                    {m.brand.replace('_', ' ')} ···· {m.last4}
                  </span>
                  <span className="ml-auto text-[12px] text-[var(--muted)]">
                    {m.expiry_month ? `${String(m.expiry_month).padStart(2, '0')}/${String(m.expiry_year).slice(-2)}` : ''}
                  </span>
                </button>
              ))}
              {newCard ? (
                <div className="grid grid-cols-4 gap-3 rounded-lg bg-[var(--surface-2)] p-4">
                  <Field label="Card number" value={card.number} onChange={(v) => setCard({ ...card, number: v.replace(/[^\d ]/g, '').slice(0, 23) })} className="col-span-2" placeholder="4242 4242 4242 4242" />
                  <Field label="Expiry (MM)" value={card.expMonth} onChange={(v) => setCard({ ...card, expMonth: v.replace(/\D/g, '').slice(0, 2) })} />
                  <Field label="Year" value={card.expYear} onChange={(v) => setCard({ ...card, expYear: v.replace(/\D/g, '').slice(0, 4) })} />
                  <Field label="CVC" value={card.cvv} onChange={(v) => setCard({ ...card, cvv: v.replace(/\D/g, '').slice(0, 4) })} />
                  <p className="col-span-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                    Tokenized by FaunalPay on submit — FAUNAL stores a token, brand and the last four digits only. Never the PAN, never the CVC.
                  </p>
                </div>
              ) : null}
              {!methods.length && !newCard ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-[13px] text-[var(--muted)]">
                  No payment method on file. Add a card to continue — the charge is held in escrow, not sent to the breeder.
                </div>
              ) : null}
            </div>
          </section>

          {/* ------------------------------------------------------- 5 review */}
          <section id="review" className="card p-6">
            <StageHead n={5} title="Contact & declarations" hint="The breeder uses these details for the transport booking and the paperwork." />
            <div className="mt-4 grid grid-cols-4 gap-3">
              <Field label="First name" value={who.firstName} onChange={(v) => setWho({ ...who, firstName: v })} />
              <Field label="Last name" value={who.lastName} onChange={(v) => setWho({ ...who, lastName: v })} />
              <Field label="Email" value={who.email} onChange={(v) => setWho({ ...who, email: v })} />
              <Field label="Phone" value={who.phone} onChange={(v) => setWho({ ...who, phone: v })} />
            </div>
            <label className="mt-4 block">
              <span className="label">Note to the breeders (optional)</span>
              <textarea
                className="textarea mt-1"
                rows={3}
                placeholder="Rack dimensions, preferred arrival window, questions about acclimation…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <ul className="mt-4 space-y-2.5">
              {[
                ['age', 'I am 18 or older.'],
                ['legal', 'I have confirmed it is legal for me to keep these species at this address, and I will keep the enclosure and transport conditions described on each listing.'],
                ['accurate', 'The contact and delivery details above are accurate; live-animal transport cannot be redirected once booked.'],
              ].map(([key, text]) => (
                <li key={key}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={agreed[key as 'age' | 'legal' | 'accurate']}
                      onChange={(e) => setAgreed({ ...agreed, [key]: e.target.checked })}
                    />
                    <span className="text-[13px] leading-relaxed">{text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ------------------------------------------------------------ summary */}
        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-6">
            <p className="label">Order summary</p>
            <ul className="mt-3 space-y-3">
              {groups.map((g) => (
                <li key={g.breederId} className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
                  <p className="text-[12.5px] font-medium">{g.breederName}</p>
                  {g.lines.map((l) => (
                    <div key={l.id} className="mt-2 flex items-center gap-2.5">
                      <Media media={{ path_medium: l.image, path_small: l.image, base_path: null }} alt={l.name} ratio="1 / 1" className="w-9 rounded" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{l.name}</span>
                      <Money cents={l.line_cents} size="sm" />
                    </div>
                  ))}
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-[var(--line)] pt-4 text-[13.5px]">
              <SumRow label="Animals" value={c.totals?.subtotal_cents ?? 0} />
              <SumRow label="Transport" value={c.totals?.shipping_cents ?? 0} />
              <SumRow label={`Sales tax (${c.destination?.state ?? '—'})`} value={c.totals?.tax_cents ?? 0} />
              <div className="flex items-end justify-between border-t border-[var(--line)] pt-3">
                <span className="text-[13px] text-[var(--muted)]">Total</span>
                <Money cents={c.totals?.total_cents ?? 0} size="lg" />
              </div>
            </dl>
            <p className="mt-2 text-[11.5px] text-[var(--muted)]">
              FAUNAL keeps a {(groups[0]?.fees.commission_bps / 100).toFixed(1)}% platform fee from the breeder side — the price you pay is the price the
              breeder sets.
            </p>

            {c.error ? <div className="mt-3"><ErrorNote>{c.error}</ErrorNote></div> : null}
            {c.blocking.length ? (
              <div className="mt-3">
                <ErrorNote tone="warn">
                  {c.blocking.length} order{c.blocking.length === 1 ? '' : 's'} blocked by compliance. Change the destination, remove the animal, or wait
                  for the missing document.
                </ErrorNote>
              </div>
            ) : null}

            <button className="btn btn-block mt-4" onClick={submit} disabled={!c.canPlace || !allAgreed || c.placing || (!newCard && !paymentId)}>
              {c.placing ? (
                <>
                  <Icon name="refresh" size={16} className="animate-spin" /> Authorising escrow…
                </>
              ) : (
                <>
                  <Icon name="lock" size={16} /> Place order · <span className="mono">{money(c.totals?.total_cents ?? 0)}</span>
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[11.5px] leading-relaxed text-[var(--muted)]">
              {c.busy ? 'Re-checking legality for this combination…' : !allAgreed ? 'Accept the three declarations to continue.' : 'By placing this order you authorise a live-animal transport booking.'}
            </p>
          </div>

          <div className="card-quiet p-5">
            <p className="label">What happens next</p>
            <ol className="mt-2.5 space-y-2">
              {[
                'The breeder confirms the animal and the transport window (usually same day).',
                'The compliance desk verifies the final documents and the route.',
                'The animal is crated, travelled and delivered or handed over at pickup.',
                'You confirm condition within 48 h — only then is escrow released to the breeder.',
              ].map((t, i) => (
                <li key={t} className="flex gap-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  <span className="mono text-[11px] text-[var(--accent-soft)]">0{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>

          <Link href="/cart" className="flex items-center justify-center gap-1.5 text-[12.5px] text-[var(--muted)]">
            <Icon name="back" size={14} /> Back to cart
          </Link>
        </aside>
      </div>
    </div>
  );
}

function StageHead({ n, title, hint, onEdit, editLabel }: { n: number; title: string; hint: string; onEdit?: () => void; editLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--ink)] text-[11.5px] font-semibold text-white">{n}</span>
          <h2 className="h4">{title}</h2>
        </div>
        <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--muted)]">{hint}</p>
      </div>
      {onEdit ? (
        <button className="btn btn-quiet btn-sm shrink-0" onClick={onEdit}>
          {editLabel}
        </button>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className = '',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <input className="input mt-1 h-10" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
      <dd className="mono text-[13px]">{money(value)}</dd>
    </div>
  );
}

export { Badge };
