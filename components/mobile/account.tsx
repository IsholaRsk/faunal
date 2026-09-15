'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, Badge, ComplianceBadge, EmptyState, Stars, Timeline, VerifiedMark } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { MobileAnimalCard } from '@/components/ui/cards';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { money, titleCaseOr, relTime } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

/* ------------------------------------------------------------------ favorites */

export function MobileFavorites({ cards, signedIn }: { cards: Row[]; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <div>
        <MobileHeader title="Favorites" />
        <div className="px-4 py-10">
          <EmptyState
            icon="heart"
            title="Sign in to save animals"
            body="Saved listings sync with the website and get you a notice when paperwork or price changes."
            action={
              <Link href="/login?next=/favorites" className="btn">
                Sign in
              </Link>
            }
          />
        </div>
      </div>
    );
  }
  return (
    <div className="pb-6">
      <MobileHeader title="Favorites" subtitle={cards.length ? `${cards.length} saved` : undefined} />
      {!cards.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="heart" title="Nothing saved yet" body="Tap the heart on a listing to watch it here." action={<Link href="/explore" className="btn">Explore animals</Link>} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-4 pt-3">
          {cards.map((c) => (
            <MobileAnimalCard key={String(c.id)} animal={c as never} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- orders */

export function MobileOrders({ rows, scope }: { rows: Row[]; scope: string }) {
  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Done' },
    { key: 'cancelled', label: 'Issues' },
    { key: 'all', label: 'All' },
  ];
  return (
    <div className="pb-6">
      <MobileHeader title="Orders" />
      <div className="hscroll flex gap-2 px-4 py-3">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key === 'all' ? '/orders' : `/orders?scope=${t.key}`} className={`chip ${scope === t.key ? 'bg-[var(--ink)] text-white' : ''}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {!rows.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="box" title="No orders here" body="Orders appear once you check out — one per breeder, each with its own paperwork pack." action={<Link href="/explore" className="btn">Find an animal</Link>} />
        </div>
      ) : (
        <ul className="space-y-2.5 px-4">
          {rows.map((o) => (
            <li key={String(o.id)}>
              <Link href={`/orders/${String(o.id)}`} className="card flex items-center gap-3 p-3">
                <Media media={{ path_medium: o.image as string, path_small: o.image as string, base_path: null }} alt={String(o.first_animal ?? '')} ratio="1 / 1" className="w-14 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{String(o.first_animal ?? 'Order')}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                    <span className="mono">{String(o.number)}</span> · {String(o.business_name)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge tone={['COMPLETED', 'DELIVERED'].includes(String(o.status)) ? 'ok' : String(o.status) === 'DISPUTED' ? 'bad' : 'quiet'}>
                      {titleCaseOr(String(o.status))}
                    </Badge>
                    {o.escrow_state ? <Badge icon="lock">{String(o.escrow_state).toLowerCase()}</Badge> : null}
                  </div>
                </div>
                <div className="text-right">
                  <Money cents={Number(o.total_cents)} size="sm" />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{relTime(String(o.placed_at))}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- order detail */

export function MobileOrderDetail({
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
  const [sheet, setSheet] = useState<null | 'actions' | 'review' | 'compliance'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const o = data.order;

  async function advance(status: string) {
    setBusy(status);
    try {
      await post(`orders/${String(o.id)}/advance`, { status });
      toast('Order updated', { tone: 'success' });
      setSheet(null);
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Transition refused', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-24">
      <MobileHeader title={data.items.length === 1 ? String(data.items[0].animal_name) : `${data.items.length} animals`} subtitle={String(o.number)} back="/orders" actions={
        <button className="icon-btn" onClick={() => setSheet('actions')} aria-label="Order actions">
          <Icon name="menu" size={19} />
        </button>
      } />

      <div className="space-y-3 px-4 pt-3">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <Badge tone={String(o.status) === 'COMPLETED' ? 'ok' : String(o.status) === 'DISPUTED' ? 'bad' : 'quiet'}>{titleCaseOr(String(o.status))}</Badge>
            <Badge tone={String(o.escrow_state) === 'RELEASED' ? 'ok' : 'warn'} icon="lock">
              escrow {String(o.escrow_state).toLowerCase()}
            </Badge>
          </div>
          <div className="mt-4">
            <Timeline steps={data.timeline.steps} events={data.timeline.events} />
          </div>
        </section>

        <section className="card p-4">
          <p className="label">Animals</p>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {data.items.map((it) => (
              <li key={String(it.id)} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Media media={{ path_medium: it.image as string, path_small: it.image as string, base_path: null }} alt={String(it.animal_name)} ratio="1 / 1" className="w-12 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{String(it.animal_name)}</p>
                  <p className="text-[12px] text-[var(--muted)]">
                    {String(it.species_name)}
                    {it.morph_name ? ` · ${String(it.morph_name)}` : ''}
                  </p>
                </div>
                <Money cents={Number(it.unit_price_cents)} size="sm" />
              </li>
            ))}
          </ul>
        </section>

        {data.shipping ? (
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <p className="label">Transport</p>
              {data.shipping.tracking_number ? <span className="mono text-[11.5px]">{String(data.shipping.tracking_number)}</span> : null}
            </div>
            <p className="mt-1.5 text-[13px]">
              {titleCaseOr(String(data.shipping.method))} · {titleCaseOr(String(data.shipping.status))}
            </p>
            <ol className="mt-3 space-y-2">
              {(data.shipping.legs ?? []).map((leg, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
                  <span className="mono mt-0.5 text-[11px] text-[var(--accent-soft)]">0{i + 1}</span>
                  <span>
                    {String(leg.label ?? 'leg')}
                    <span className="block text-[11.5px] text-[var(--muted)]">{String(leg.at ?? '').slice(0, 16).replace('T', ' ')}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <button className="card flex w-full items-center gap-3 p-4 text-left" onClick={() => setSheet('compliance')}>
          <Icon name="shield" size={18} className="text-[var(--accent-soft)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">Compliance record</span>
            <span className="block text-[12px] text-[var(--muted)]">{o.compliance ? titleCaseOr(String(o.compliance.verdict)) : 'snapshot stored with the order'}</span>
          </span>
          <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
        </button>

        <section className="card p-4">
          <div className="flex items-center justify-between">
            <p className="label">Paid</p>
            <Money cents={Number(o.total_cents)} />
          </div>
          <dl className="mt-2.5 space-y-1.5 text-[12.5px] text-[var(--muted)]">
            <div className="flex justify-between">
              <dt>Animals</dt>
              <dd className="mono">{money(Number(o.subtotal_cents))}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Transport</dt>
              <dd className="mono">{money(Number(o.shipping_cents))}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="mono">{money(Number(o.tax_cents))}</dd>
            </div>
          </dl>
        </section>

        <section className="card p-4">
          <p className="label">Seller</p>
          <div className="mt-2 flex items-center gap-3">
            <Media media={{ path_medium: null, base_path: null }} alt="" ratio="1 / 1" className="w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
                {String(o.business_name ?? '')} <VerifiedMark tier={String(o.breeder_tier ?? '')} />
              </p>
              <p className="text-[12px] text-[var(--muted)]">
                {String(o.breeder_city ?? '')}, {String(o.breeder_state ?? '')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={`/breeders/${String(o.breeder_slug ?? '')}`} className="btn btn-quiet btn-sm flex-1">
              Storefront
            </Link>
            <Link href={`/messages?to=${String(o.seller_user_id ?? '')}&order=${String(o.id)}`} className="btn btn-sm flex-1">
              Message
            </Link>
          </div>
        </section>

        {data.review ? (
          <section className="card p-4">
            <p className="label">Your review</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Stars value={Number(data.review.rating)} showValue={false} />
              <span className="text-[12px] text-[var(--muted)]">{String(data.review.created_at).slice(0, 10)}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed">{String(data.review.body)}</p>
          </section>
        ) : null}
      </div>

      <div className="sticky-cta">
        {data.canReview ? (
          <button className="btn btn-quiet" onClick={() => setSheet('review')}>
            <Icon name="star" size={15} /> Leave review
          </button>
        ) : (
          <Link href={`/messages?to=${String(o.seller_user_id ?? '')}&order=${String(o.id)}`} className="btn btn-quiet">
            <Icon name="chat" size={15} /> Ask breeder
          </Link>
        )}
        {isBuyer && String(o.status) === 'DELIVERED' ? (
          <button className="btn" onClick={() => advance('COMPLETED')} disabled={busy === 'COMPLETED'}>
            <Icon name="check" size={15} /> Confirm arrival
          </button>
        ) : (
          <button className="btn" onClick={() => setSheet('actions')}>
            <Icon name="menu" size={15} /> Actions
          </button>
        )}
      </div>

      <Sheet open={sheet === 'actions'} onClose={() => setSheet(null)} title="Order actions">
        <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
          Transitions are enforced by the order state machine — an action is only offered when the current status and your role allow it.
        </p>
        <ul className="mt-3 space-y-2">
          {actions.map((a) => (
            <li key={a.status}>
              <button className="w-full rounded-lg border border-[var(--line)] p-3.5 text-left" onClick={() => advance(a.status)} disabled={busy === a.status}>
                <span className="block text-[14px] font-medium">{a.label}</span>
                <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{a.hint}</span>
              </button>
            </li>
          ))}
          {!actions.length ? <li className="text-[13px] text-[var(--muted)]">No actions available on this status.</li> : null}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'compliance'} onClose={() => setSheet(null)} title="Compliance record">
        {o.compliance ? (
          <>
            <ComplianceBadge verdict={String(o.compliance.verdict)} />
            <ul className="mt-3 space-y-2.5">
              {((o.compliance.notes as unknown as string[]) ?? []).map((n, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-[var(--muted)]">
                  {n}
                </li>
              ))}
              {((o.compliance.rules as unknown as Row[]) ?? []).map((r) => (
                <li key={String(r.id)} className="text-[12.5px] leading-relaxed">
                  <span className="font-medium">{String(r.label)}</span> — {String(r.detail)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[13px] text-[var(--muted)]">No snapshot stored for this order.</p>
        )}
      </Sheet>

      <Sheet open={sheet === 'review'} onClose={() => setSheet(null)} title={`Review ${String(o.business_name ?? 'the breeder')}`}>
        <MobileReviewForm orderId={String(o.id)} onDone={() => setSheet(null)} />
      </Sheet>
    </div>
  );
}

function MobileReviewForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useApp();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await post(`orders/${orderId}/review`, { rating, title, body, dimensions: { animal_health: rating, documentation: rating, transport: rating, communication: rating } });
      toast('Review published', { tone: 'success' });
      onDone();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not publish', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} className="p-2">
            <Icon name="star" size={26} filled={n <= rating} className={n <= rating ? 'text-[var(--warning)]' : 'text-[var(--accent-soft)]'} />
          </button>
        ))}
      </div>
      <input className="input mt-3 h-12" placeholder="Headline" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="textarea mt-2" rows={4} placeholder="Condition on arrival, paperwork, communication…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn btn-block mt-3" onClick={send} disabled={busy || body.length < 12}>
        {busy ? 'Publishing…' : 'Publish review'}
      </button>
      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">Reviews are limited to completed orders so they reflect a real transfer.</p>
    </>
  );
}

/* -------------------------------------------------------------- notifications */

export function MobileNotifications({ rows }: { rows: Row[] }) {
  const { refresh, setBadges } = useApp();
  const [busy, setBusy] = useState(false);
  const groups: Record<string, Row[]> = {};
  for (const n of rows) {
    const key = String(n.kind ?? 'SYSTEM');
    groups[key] = [...(groups[key] ?? []), n];
  }

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
    <div className="pb-6">
      <MobileHeader
        title="Notifications"
        actions={
          <button className="text-[12.5px] font-medium" onClick={markAll} disabled={busy}>
            Mark read
          </button>
        }
      />
      {!rows.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="bell" title="No notifications" body="Order, listing, compliance and message alerts land here." />
        </div>
      ) : (
        <ul className="space-y-2 px-4 pt-3">
          {rows.map((n) => (
            <li key={String(n.id)}>
              <Link href={String(n.href ?? '/notifications')} className={`card flex items-start gap-3 p-3.5 ${n.read_at ? 'opacity-60' : ''}`}>
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)]">
                  <Icon name={n.kind === 'MESSAGE' ? 'chat' : n.kind === 'COMPLIANCE' ? 'shield' : n.kind === 'ORDER' ? 'box' : 'bell'} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium leading-tight">{String(n.title)}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--muted)]">{String(n.body)}</span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">{relTime(String(n.created_at))}</span>
                </span>
                {!n.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
