'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, ComplianceBadge, EmptyState, Stars, Timeline, VerifiedMark } from '@/components/ui/primitives';
import { DesktopAnimalCard } from '@/components/ui/cards';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { money, titleCaseOr } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

/* ------------------------------------------------------------------ favorites */

export function DesktopFavorites({ cards, signedIn }: { cards: Row[]; signedIn: boolean }) {
  const { user } = useApp();
  if (!signedIn) {
    return (
      <div className="shell py-20">
        <EmptyState
          icon="heart"
          title="Sign in to keep favorites"
          body="Saved animals follow you between the app and the website, and you get a notification when their status or price changes."
          action={
            <Link href="/login?next=/favorites" className="btn">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="shell py-8">
      <header className="border-b border-[var(--line)] pb-5">
        <p className="eyebrow">Saved animals</p>
        <h1 className="h2 mt-1.5">Favorites{cards.length ? ` · ${cards.length}` : ''}</h1>
      </header>
      {!cards.length ? (
        <div className="py-14">
          <EmptyState
            icon="heart"
            title="Nothing saved yet"
            body="Tap the heart on any listing. FAUNAL watches the ones you save for paperwork changes, price moves and availability."
            action={
              <Link href="/animals" className="btn">
                Browse animals
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-4 gap-5">
          {cards.map((c) => (
            <DesktopAnimalCard key={String(c.id)} animal={c as never} />
          ))}
        </div>
      )}
      {user ? null : null}
    </div>
  );
}

/* --------------------------------------------------------------------- orders */

const ORDER_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'quiet'> = {
  COMPLETED: 'ok',
  DELIVERED: 'ok',
  PAID: 'quiet',
  BREEDER_CONFIRMED: 'quiet',
  PREPARING: 'warn',
  SHIPPED: 'warn',
  READY_FOR_PICKUP: 'warn',
  DISPUTED: 'bad',
  CANCELLED: 'bad',
  REFUNDED: 'bad',
};

export function DesktopOrders({ rows, scope }: { rows: Row[]; scope: string }) {
  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled & disputes' },
    { key: 'all', label: 'All' },
  ];
  return (
    <div className="shell py-8">
      <header className="flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Buyer</p>
          <h1 className="h2 mt-1.5">My orders</h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--muted)]">
            One order per breeder. Payments stay in escrow until you confirm the animal arrived in condition.
          </p>
        </div>
        <div className="flex gap-1.5">
          {tabs.map((t) => (
            <Link key={t.key} href={t.key === 'all' ? '/orders' : `/orders?scope=${t.key}`} className={`chip ${scope === t.key ? 'bg-[var(--ink)] text-white' : ''}`}>
              {t.label}
            </Link>
          ))}
        </div>
      </header>

      {!rows.length ? (
        <div className="py-14">
          <EmptyState
            icon="box"
            title="No orders in this view"
            body="When you place an order it appears here with the transport legs, paperwork and escrow state."
            action={
              <Link href="/animals" className="btn">
                Browse animals
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {rows.map((o) => (
            <li key={String(o.id)} className="grid grid-cols-[76px_minmax(0,1fr)_200px_190px] items-center gap-6 py-5">
              <Media media={{ path_medium: o.image as string, path_small: o.image as string, base_path: null }} alt={String(o.first_animal ?? 'order')} ratio="1 / 1" className="rounded-lg" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium">
                  <Link href={`/orders/${String(o.id)}`} className="hover:underline">
                    {String(o.first_animal ?? 'Order')}
                    {Number(o.item_count) > 1 ? ` + ${Number(o.item_count) - 1} more` : ''}
                  </Link>
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                  <span className="mono">{String(o.number)}</span> · {String(o.business_name)} · placed {String(o.placed_at).slice(0, 10)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone={ORDER_TONE[String(o.status)] ?? 'quiet'}>{titleCaseOr(String(o.status))}</Badge>
                  {o.escrow_state ? <Badge tone={String(o.escrow_state) === 'RELEASED' ? 'ok' : 'warn'} icon="lock">escrow {String(o.escrow_state).toLowerCase()}</Badge> : null}
                  {Number(o.has_review) ? <Badge icon="star">reviewed</Badge> : null}
                </div>
              </div>
              <div>
                <p className="label">Transport</p>
                <p className="mt-1 text-[13px]">
                  {titleCaseOr(String(o.fulfillment))} · ETA {String(o.estimated_delivery ?? '').slice(0, 10) || 'pending'}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">{String(o.handoff_window ?? '')}</p>
              </div>
              <div className="text-right">
                <Money cents={Number(o.total_cents)} />
                <Link href={`/orders/${String(o.id)}`} className="btn btn-quiet btn-sm mt-2 w-full">
                  Track order <Icon name="chevronRight" size={14} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- order detail */

export function DesktopOrderDetail({
  data,
  actions,
  isBuyer,
}: {
  data: {
    order: Row & { compliance: Record<string, unknown> | null };
    items: Row[];
    shipping: (Row & { legs: Row[] }) | null;
    payment: Row | null;
    payout: Row | null;
    events: Row[];
    review: Row | null;
    timeline: { steps: { key: string; label: string; done: boolean; current: boolean }[]; events: Row[]; cancelled: boolean; note: string | null };
    canReview: boolean;
  };
  actions: { status: string; label: string; hint: string }[];
  isBuyer: boolean;
}) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const o = data.order;

  async function advance(status: string) {
    setBusy(status);
    try {
      await post(`orders/${String(o.id)}/advance`, { status });
      toast(`Order moved to ${titleCaseOr(status).toLowerCase()}`, { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That transition was refused', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="shell py-8">
      <Link href="/orders" className="flex items-center gap-1 text-[12.5px] text-[var(--muted)] hover:text-[var(--ink)]">
        <Icon name="back" size={14} /> All orders
      </Link>
      <header className="mt-3 flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow mono">{String(o.number)}</p>
          <h1 className="h2 mt-1.5">
            {data.items.length === 1 ? String(data.items[0].animal_name) : `${data.items.length} animals`}
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            {String(o.seller_business ?? '')} · placed {String(o.placed_at).slice(0, 16).replace('T', ' ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ORDER_TONE[String(o.status)] ?? 'quiet'}>{titleCaseOr(String(o.status))}</Badge>
          <Badge tone={String(o.escrow_state) === 'RELEASED' ? 'ok' : 'warn'} icon="lock">
            escrow {titleCaseOr(String(o.escrow_state))}
          </Badge>
        </div>
      </header>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)_380px] items-start gap-10">
        <div className="space-y-5">
          <section className="card p-6">
            <p className="label">Progress</p>
            <div className="mt-4">
              <Timeline steps={data.timeline.steps} events={data.timeline.events} />
            </div>
            {actions.length ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
                {actions.map((a) => (
                  <button key={a.status} className="btn btn-sm" onClick={() => advance(a.status)} disabled={busy === a.status} title={a.hint}>
                    {busy === a.status ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card p-6">
            <p className="label">Animals on this order</p>
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {data.items.map((it) => (
                <li key={String(it.id)} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <Media media={{ path_medium: it.image as string, path_small: it.image as string, base_path: null }} alt={String(it.animal_name)} ratio="1 / 1" className="w-16 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium">{String(it.animal_name)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                      {String(it.species_name)}
                      {it.morph_name ? ` · ${String(it.morph_name)}` : ''} · {titleCaseOr(String(it.animal_sex))} · {Number(it.animal_age_months)} months
                    </p>
                    {it.snapshot ? (
                      <p className="mt-1 text-[11.5px] text-[var(--muted)]">
                        snapshot {String(it.snapshot).length} bytes stored at purchase — price, paperwork and route are frozen with it
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Money cents={Number(it.unit_price_cents)} size="sm" />
                    <p className="mono mt-0.5 text-[11.5px] text-[var(--muted)]">sku {String(it.animal_id).slice(-6).toUpperCase()}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {data.shipping ? (
            <section className="card p-6">
              <div className="flex items-center justify-between">
                <p className="label">Transport</p>
                {data.shipping.tracking_number ? (
                  <span className="mono text-[12.5px]">tracking {String(data.shipping.tracking_number)}</span>
                ) : null}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed">
                {titleCaseOr(String(data.shipping.method))} · {titleCaseOr(String(data.shipping.status))}
                {data.shipping.carrier ? ` · ${String(data.shipping.carrier)}` : ''}
                {data.shipping.eta_days ? ` · ${Number(data.shipping.eta_days)} day transit` : ''}
              </p>
              {Array.isArray(data.shipping.legs) && data.shipping.legs.length ? (
                <ol className="mt-4 space-y-2.5">
                  {data.shipping.legs.map((leg, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-lg bg-[var(--surface-2)] p-3">
                      <span className="mono text-[11px] text-[var(--accent-soft)]">0{i + 1}</span>
                      <div className="text-[13px] leading-relaxed">
                        <p className="font-medium">{String(leg.label ?? titleCaseOr(String(leg.kind ?? 'leg')))}</p>
                        <p className="text-[12px] text-[var(--muted)]">
                          {String(leg.at ?? '').slice(0, 16).replace('T', ' ') || 'scheduled'}
                          {leg.from ? ` · ${String(leg.from)} → ${String(leg.to ?? '')}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
              <div className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-[var(--muted)]">
                <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                {Number(data.shipping.temp_controlled)
                  ? 'Temperature-controlled crate with a heat or cool pack per the forecast; handoff window agreed in the breeder chat.'
                  : 'Ambient crate with ventilation and a moss liner; handoff window agreed in the breeder chat.'}
              </div>
            </section>
          ) : null}

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <p className="label">Compliance record</p>
              <Link href="/compliance" className="text-[12.5px] text-[var(--muted)] hover:text-[var(--ink)]">
                How this works
              </Link>
            </div>
            {o.compliance ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <ComplianceBadge verdict={String((o.compliance as Row).verdict)} />
                  <span className="text-[12.5px] text-[var(--muted)]">
                    snapshot stored with the order at {String(o.placed_at).slice(0, 10)}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {(((o.compliance as Record<string, unknown>).notes as unknown as string[]) ?? []).map((n, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                      {n}
                    </li>
                  ))}
                  {(((o.compliance as Record<string, unknown>).rules as unknown as Row[]) ?? []).map((r) => (
                    <li key={String(r.id)} className="text-[12.5px] leading-relaxed">
                      <span className="font-medium">{String(r.label)}</span> — {String(r.detail)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-[var(--muted)]">No compliance snapshot on this order.</p>
            )}
          </section>

          {data.canReview ? (
            <ReviewForm orderId={String(o.id)} breederName={String(o.seller_business ?? 'the breeder')} />
          ) : data.review ? (
            <section className="card p-6">
              <p className="label">Your review</p>
              <div className="mt-2 flex items-center gap-3">
                <Stars value={Number(data.review.rating)} showValue />
                <span className="text-[13px] text-[var(--muted)]">{String(data.review.created_at).slice(0, 10)}</span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed">
                <span className="font-medium">{String(data.review.title)}</span>. {String(data.review.body)}
              </p>
            </section>
          ) : null}
        </div>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-6">
            <p className="label">Payment</p>
            <dl className="mt-3 space-y-2 text-[13.5px]">
              <Line label="Animals" value={Number(o.subtotal_cents)} />
              <Line label="Transport" value={Number(o.shipping_cents)} />
              <Line label="Sales tax" value={Number(o.tax_cents)} />
              <div className="flex items-end justify-between border-t border-[var(--line)] pt-3">
                <span className="text-[13px] text-[var(--muted)]">Paid</span>
                <Money cents={Number(o.total_cents)} size="lg" />
              </div>
            </dl>
            {data.payment ? (
              <p className="mt-3 text-[12px] text-[var(--muted)]">
                {titleCaseOr(String(data.payment.provider))} · {titleCaseOr(String(data.payment.status))}
                {data.payment.brand ? ` · ···· ${String(data.payment.last4 ?? '')}` : ''} · captured{' '}
                {String(data.payment.created_at).slice(0, 10)}
              </p>
            ) : null}
            <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-[12px] leading-relaxed text-[var(--muted)]">
              {String(o.escrow_state) === 'RELEASED'
                ? `Escrow released to the breeder on ${String(data.payout?.released_at ?? o.completed_at ?? '').slice(0, 10)}.`
                : 'Funds are held by FaunalPay. Confirm the animal arrived in condition and the breeder is paid 48 hours later.'}
            </div>
            {isBuyer && String(o.status) === 'DELIVERED' ? (
              <button className="btn btn-block mt-4" onClick={() => advance('COMPLETED')}>
                Confirm arrival &amp; release payment
              </button>
            ) : null}
            {isBuyer && ['PAID', 'BREEDER_CONFIRMED', 'PREPARING'].includes(String(o.status)) ? (
              <button className="btn btn-quiet btn-block mt-2" onClick={() => advance('DISPUTED')}>
                Open a dispute
              </button>
            ) : null}
          </div>

          <div className="card p-6">
            <p className="label">Seller</p>
            <p className="mt-2 flex items-center gap-1.5 text-[14px] font-medium">
              {String(o.business_name ?? '')} <VerifiedMark tier={String(o.breeder_tier ?? '')} />
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
              {String(o.breeder_city ?? '')}, {String(o.breeder_state ?? '')} · licence {String(o.license_number ?? 'on file')}
            </p>
            <div className="mt-3 flex gap-2">
              <Link href={`/breeders/${String(o.seller_slug ?? '')}`} className="btn btn-quiet btn-sm flex-1">
                Storefront
              </Link>
              {o.seller_user_id ? (
                <Link href={`/messages?to=${String(o.seller_user_id)}&order=${String(o.id)}`} className="btn btn-sm flex-1">
                  Message
                </Link>
              ) : null}
            </div>
          </div>

          <div className="card p-6">
            <p className="label">Documents</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Health certificate, transport manifest and proof of origin are released to you as an order participant. Files are never public.
            </p>
            <Link href="/profile/documents" className="btn btn-quiet btn-sm mt-3 w-full">
              <Icon name="doc" size={15} /> Open my document vault
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
      <dd className="mono">{money(value)}</dd>
    </div>
  );
}

function ReviewForm({ orderId, breederName }: { orderId: string; breederName: string }) {
  const router = useRouter();
  const { toast } = useApp();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dims, setDims] = useState({ animal_health: 5, documentation: 5, transport: 5, communication: 5 });
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await post(`orders/${orderId}/review`, { rating, title, body, dimensions: dims });
      toast('Review published — thank you', { tone: 'success' });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not publish that review', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <p className="label">Review {breederName}</p>
      <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">
        Only buyers with a completed order can review. Scores are averaged into the breeder's public rating.
      </p>
      <div className="mt-4 flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} className="p-1">
            <Icon name="star" size={22} filled={n <= rating} className={n <= rating ? 'text-[var(--warning)]' : 'text-[var(--accent-soft)]'} />
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Object.entries(dims).map(([key, value]) => (
          <label key={key} className="block">
            <span className="label">{titleCaseOr(key)}</span>
            <input
              type="range"
              min={1}
              max={5}
              value={value}
              onChange={(e) => setDims({ ...dims, [key]: Number(e.target.value) })}
              className="range mt-1.5 w-full"
            />
          </label>
        ))}
      </div>
      <input className="input mt-3 h-11" placeholder="Headline" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="textarea mt-2" rows={3} placeholder="How was the animal's condition, the paperwork and the handoff?" value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn mt-3" onClick={send} disabled={busy || body.length < 12}>
        {busy ? 'Publishing…' : 'Publish review'}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------- notifications */

export function DesktopNotifications({ rows }: { rows: Row[] }) {
  const { refresh, setBadges } = useApp();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await post('notifications/read', {});
      setBadges({ unreadNotifications: 0 });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell py-8">
      <header className="flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Alerts</p>
          <h1 className="h2 mt-1.5">Notifications</h1>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={markAll} disabled={busy}>
          <Icon name="check" size={15} /> Mark all read
        </button>
      </header>
      {!rows.length ? (
        <div className="py-14">
          <EmptyState icon="bell" title="Nothing new" body="Order updates, listing approvals, breeder replies and compliance notices land here." />
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {rows.map((n) => (
            <li key={String(n.id)} className={`flex items-start gap-4 py-4 ${n.read_at ? 'opacity-60' : ''}`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)]">
                <Icon name={KIND_ICON[String(n.kind)] ?? 'bell'} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium">{String(n.title)}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--muted)]">{String(n.body)}</p>
              </div>
              <span className="shrink-0 text-[12px] text-[var(--muted)]">{relTime(String(n.created_at))}</span>
              {n.href ? (
                <Link href={String(n.href)} className="btn btn-ghost btn-sm shrink-0">
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_ICON: Record<string, 'cart' | 'chat' | 'shield' | 'bell' | 'box' | 'doc'> = {
  ORDER: 'box',
  MESSAGE: 'chat',
  COMPLIANCE: 'shield',
  LISTING: 'doc',
  PAYMENT: 'cart',
  SYSTEM: 'bell',
};

const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 8) return `${days}d ago`;
  return iso.slice(0, 10);
};

