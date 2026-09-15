'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, EmptyState, Stars, ComplianceBadge, VerifiedMark, ErrorNote } from '@/components/ui/primitives';
import { post, patch, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { money, titleCaseOr, relTime } from '@/lib/ui/screen-helpers';

export type Row = Record<string, string | number | null>;

export interface SellerBundle {
  dash: {
    breeder: Row | null;
    counts: { active: number; pending: number; sold: number; rejected: number; suspended: number; drafts: number };
    revenue: { gross_cents: number; paid_cents: number; held_cents: number };
    orders: { total: number; open: number };
    unreadMessages: number;
    views: number;
    trend: { day: string; cents: number }[];
  };
  listings: Row[];
  orders: Row[];
  documents: Row[];
  reviews: Row[];
  plan: { plan: string; commission_bps: number; price_cents_month: number; featured_cents_week: number; payout_bps: number; description: string | null }[];
  verification: Row | null;
}

export const WIZARD_STEPS = ['Animal', 'Attributes', 'Husbandry', 'Media', 'Paperwork', 'Pricing', 'Route', 'Review'];

const SELLER_NAV = [
  { href: '/seller', label: 'Overview', icon: 'grid' },
  { href: '/seller/listings', label: 'Listings', icon: 'paw' },
  { href: '/seller/listings/new', label: 'Add animal', icon: 'plus' },
  { href: '/seller/orders', label: 'Orders', icon: 'box' },
  { href: '/seller/documents', label: 'Documents', icon: 'doc' },
  { href: '/seller/reviews', label: 'Reviews', icon: 'star' },
  { href: '/seller/plan', label: 'Plan & fees', icon: 'dollar' },
  { href: '/breeders', label: 'My storefront', icon: 'store' },
] as const;

export function SellerSidebar({ active }: { active: string }) {
  return (
    <nav className="sticky top-[86px]">
      <p className="label">Seller desk</p>
      <ul className="mt-2 space-y-0.5">
        {SELLER_NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${active === n.href ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Icon name={n.icon} size={16} />
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SellerGate({ mobile = false, kind = 'access' }: { mobile?: boolean; kind?: 'access' | 'pending' | 'rejected' }) {
  const copy =
    kind === 'pending'
      ? { title: 'Verification in review', body: 'The compliance desk is checking your licence and documents. Approved sellers can list; you will be notified the moment a decision lands.' }
      : kind === 'rejected'
        ? { title: 'Application needs attention', body: 'We could not verify the documents supplied. Re-upload a current licence or permit and the desk will look again within 24 hours.' }
        : { title: 'Seller desk', body: 'The dashboard opens to verified breeders. Apply and you can draft listings immediately — they publish once your paperwork clears.' };
  return (
    <div className={mobile ? 'px-4 py-10' : 'shell py-20'}>
      <EmptyState
        icon={kind === 'access' ? 'store' : 'shield'}
        title={copy.title}
        body={copy.body}
        action={
          <div className="flex gap-2">
            <Link href="/become-a-breeder" className="btn">
              Apply as a breeder
            </Link>
            <Link href="/compliance/documents" className="btn btn-quiet">
              What we accept
            </Link>
          </div>
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- dashboard */

export function DesktopSellerDashboard({ data }: { data: SellerBundle }) {
  const b = data.dash.breeder ?? {};
  const max = Math.max(1, ...data.dash.trend.map((t) => Number(t.cents)));
  const alerts = [
    data.dash.counts.pending ? { tone: 'warn', text: `${data.dash.counts.pending} listing(s) waiting on the compliance desk` } : null,
    data.dash.counts.rejected ? { tone: 'bad', text: `${data.dash.counts.rejected} listing(s) rejected — review and resubmit` } : null,
    data.dash.orders.open ? { tone: 'quiet', text: `${data.dash.orders.open} order(s) need a fulfilment update` } : null,
    data.dash.unreadMessages ? { tone: 'quiet', text: `${data.dash.unreadMessages} unanswered buyer message(s)` } : null,
  ].filter(Boolean) as { tone: 'warn' | 'bad' | 'quiet'; text: string }[];

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller" />
        <div className="space-y-5">
          <header className="flex items-start justify-between gap-6 border-b border-[var(--line)] pb-5">
            <div>
              <p className="eyebrow">Seller desk</p>
              <h1 className="h2 mt-1.5 flex items-center gap-2">
                {String(b.business_name ?? 'Your storefront')}
                {b.tier ? <VerifiedMark tier={String(b.tier)} /> : null}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">
                {String(b.city ?? '')}, {String(b.state ?? '')} · licence {String(b.license_number ?? 'on file')} · plan {titleCaseOr(String(b.storefront_plan ?? 'FREE'))}
              </p>
            </div>
            <Link href="/seller/listings/new" className="btn">
              <Icon name="plus" size={16} /> Add an animal
            </Link>
          </header>

          {alerts.length ? (
            <ul className="grid grid-cols-2 gap-3">
              {alerts.map((a) => (
                <li key={a.text} className={`card flex items-center gap-3 p-3.5 tone-${a.tone}`}>
                  <Icon name={a.tone === 'bad' ? 'alert' : a.tone === 'warn' ? 'clock' : 'chat'} size={17} className="shrink-0" />
                  <span className="text-[13px] leading-snug">{a.text}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid grid-cols-4 gap-4">
            {[
              ['Gross volume', money(data.dash.revenue.gross_cents), `${data.dash.orders.total} orders`],
              ['Settled', money(data.dash.revenue.paid_cents), 'released payouts'],
              ['In escrow', money(data.dash.revenue.held_cents), 'awaiting arrival'],
              ['Listing views', data.dash.views.toLocaleString('en-US'), 'all time'],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="card p-5">
                <p className="label">{String(label)}</p>
                <p className="h3 mt-1.5">{String(value)}</p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">{String(hint)}</p>
              </div>
            ))}
          </div>

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <p className="label">Revenue, last 30 days</p>
              <span className="text-[12px] text-[var(--muted)]">net of the {Math.round(Number(b.commission_bps ?? 800) / 100)}% marketplace commission</span>
            </div>
            {data.dash.trend.length ? (
              <div className="mt-5 flex h-32 items-end gap-1.5">
                {data.dash.trend.map((t) => (
                  <div key={t.day} className="group flex flex-1 flex-col items-center gap-1.5">
                    <span className="w-full rounded-t bg-[var(--ink)] transition-colors group-hover:bg-[var(--accent-soft)]" style={{ height: `${Math.max(4, (Number(t.cents) / max) * 100)}%` }} />
                    <span className="text-[9.5px] text-[var(--muted)]">{t.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--muted)]">No orders placed in the last 30 days.</p>
            )}
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
            <section className="card p-6">
              <div className="flex items-center justify-between">
                <p className="label">Your listings</p>
                <Link href="/seller/listings" className="btn btn-ghost btn-sm">
                  Manage all
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-[var(--line)]">
                {data.listings.slice(0, 5).map((l) => (
                  <li key={String(l.id)} className="flex items-center gap-3 py-3">
                    <Media media={{ path_medium: l.image_medium as string, path_small: l.image_small as string, base_path: l.base_path as string }} alt={String(l.name)} ratio="1 / 1" className="w-11 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{String(l.name)}</p>
                      <p className="truncate text-[12px] text-[var(--muted)]">{String(l.species_name)} · {titleCaseOr(String(l.availability))} · {relTime(String(l.published_at ?? l.created_at))}</p>
                    </div>
                    <Badge tone={String(l.status) === 'APPROVED' ? 'ok' : String(l.status) === 'PENDING_REVIEW' ? 'warn' : String(l.status) === 'REJECTED' ? 'bad' : 'quiet'}>{titleCaseOr(String(l.status))}</Badge>
                    <Money cents={Number(l.price_cents)} size="sm" />
                  </li>
                ))}
                {!data.listings.length ? <li className="py-4 text-[13px] text-[var(--muted)]">No listings yet — the wizard walks you through it in about four minutes.</li> : null}
              </ul>
            </section>

            <section className="card p-6">
              <p className="label">Status mix</p>
              <ul className="mt-3 space-y-2">
                {(
                  [
                    ['Live', data.dash.counts.active, 'ok'],
                    ['Pending review', data.dash.counts.pending, 'warn'],
                    ['Drafts', data.dash.counts.drafts, 'quiet'],
                    ['Sold', data.dash.counts.sold, 'quiet'],
                    ['Rejected', data.dash.counts.rejected, 'bad'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <li key={label} className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--muted)]">{label}</span>
                    <Badge tone={tone}>{Number(value)}</Badge>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="label">Verification</p>
                {data.verification ? (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                    {titleCaseOr(String(data.verification.status))} · reviewed {relTime(String(data.verification.reviewed_at ?? data.verification.submitted_at))}
                    {data.verification.rejection_reason ? ` — ${String(data.verification.rejection_reason)}` : ''}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">No verification on file yet.</p>
                )}
                <Link href="/seller/documents" className="btn btn-quiet btn-sm mt-3 w-full">
                  Upload a document
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- listings */

export function DesktopSellerListings({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = rows.filter((r) => !filter || `${r.name} ${r.species_name}`.toLowerCase().includes(filter.toLowerCase()));

  async function act(idValue: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await patch(`seller/listings/${idValue}`, body);
      toast(message, { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That action was refused', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller/listings" />
        <div>
          <header className="flex items-end justify-between border-b border-[var(--line)] pb-5">
            <div>
              <p className="eyebrow">Inventory</p>
              <h1 className="h2 mt-1.5">Listings</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">One listing = one animal. Status changes re-run the compliance check immediately.</p>
            </div>
            <div className="flex items-center gap-2">
              <input className="input h-10 w-[220px]" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Link href="/seller/listings/new" className="btn btn-sm">
                New listing
              </Link>
            </div>
          </header>

          {!shown.length ? (
            <div className="py-12">
              <EmptyState icon="paw" title="Nothing here yet" body="Draft a listing and it stays private until you submit it for review." action={<Link href="/seller/listings/new" className="btn">Add an animal</Link>} />
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--surface-2)] text-[11px] uppercase tracking-[.08em] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Animal</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Legality</th>
                    <th className="px-4 py-2.5 font-medium">Views</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {shown.map((l) => (
                    <tr key={String(l.id)} className="align-middle">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Media media={{ path_medium: l.image_medium as string, path_small: l.image_small as string, base_path: l.base_path as string }} alt={String(l.name)} ratio="1 / 1" className="w-10 rounded-md" />
                          <div className="min-w-0">
                            <Link href={`/animals/${String(l.slug)}`} className="block truncate font-medium hover:underline">
                              {String(l.name)}
                            </Link>
                            <p className="truncate text-[11.5px] text-[var(--muted)]">
                              {String(l.species_name)}
                              {l.morph_name ? ` · ${String(l.morph_name)}` : ''} · {titleCaseOr(String(l.sex))}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={String(l.status) === 'APPROVED' ? 'ok' : String(l.status) === 'PENDING_REVIEW' ? 'warn' : String(l.status) === 'REJECTED' ? 'bad' : 'quiet'}>
                          {titleCaseOr(String(l.status))}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{l.compliance_status ? <ComplianceBadge verdict={String(l.compliance_status)} /> : <span className="text-[var(--muted)]">—</span>}</td>
                      <td className="mono px-4 py-3 text-[12px] text-[var(--muted)]">{Number(l.view_count ?? 0)}</td>
                      <td className="px-4 py-3 text-right">
                        {editing?.id === String(l.id) ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input className="input h-8 w-[86px] text-right" value={editing.price} onChange={(e) => setEditing({ id: String(l.id), price: e.target.value.replace(/[^\d.]/g, '') })} />
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => {
                                const next = editing.price;
                                setEditing(null);
                                void act(String(l.id), { price: Number(next) }, `Price set to ${money(Math.round(Number(next) * 100))}`);
                              }}
                            >
                              Save
                            </button>
                          </span>
                        ) : (
                          <button className="mono hover:underline" onClick={() => setEditing({ id: String(l.id), price: String(Number(l.price_cents) / 100) })} title="Click to edit price">
                            {money(Number(l.price_cents))}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {String(l.status) === 'DRAFT' ? (
                            <button className="btn btn-sm" disabled={busy} onClick={() => act(String(l.id), { status: 'PENDING_REVIEW' }, 'Submitted for review')}>
                              Submit
                            </button>
                          ) : null}
                          {String(l.status) === 'APPROVED' ? (
                            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act(String(l.id), { status: 'PAUSED' }, 'Listing paused')}>
                              Pause
                            </button>
                          ) : null}
                          {String(l.status) === 'PAUSED' ? (
                            <button className="btn btn-sm" disabled={busy} onClick={() => act(String(l.id), { status: 'APPROVED' }, 'Listing live again')}>
                              Resume
                            </button>
                          ) : null}
                          <Link href={`/seller/listings/${String(l.id)}`} className="btn btn-ghost btn-sm">
                            Edit
                          </Link>
                          {String(l.status) !== 'SOLD' ? (
                            <button className="icon-btn" title="Mark sold & archive" disabled={busy} onClick={() => act(String(l.id), { status: 'SOLD' }, 'Marked sold')}>
                              <Icon name="check" size={15} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ orders */

export function DesktopSellerOrders({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  const NEXT: Record<string, { status: string; label: string }[]> = {
    PAID: [{ status: 'BREEDER_CONFIRMED', label: 'Confirm order' }],
    BREEDER_CONFIRMED: [{ status: 'PREPARING', label: 'Start preparation' }],
    PREPARING: [
      { status: 'SHIPPED', label: 'Mark shipped' },
      { status: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
    ],
    READY_FOR_PICKUP: [{ status: 'DELIVERED', label: 'Confirm handoff' }],
    SHIPPED: [{ status: 'DELIVERED', label: 'Mark delivered' }],
  };

  async function advance(orderId: string, status: string) {
    setBusy(orderId + status);
    try {
      await post(`orders/${orderId}/advance`, { status, trackingNumber: tracking[orderId] || undefined, note: null });
      toast('Order updated', { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Transition refused', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller/orders" />
        <div>
          <header className="border-b border-[var(--line)] pb-5">
            <p className="eyebrow">Fulfilment</p>
            <h1 className="h2 mt-1.5">Orders to prepare</h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Money stays in escrow until the buyer confirms arrival. Shipping without a health certificate where one is required blocks the order.
            </p>
          </header>
          {!rows.length ? (
            <div className="py-12">
              <EmptyState icon="box" title="No open orders" body="Orders land here the moment a buyer checks out." />
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((o) => (
                <li key={String(o.id)} className="card p-5">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[15px] font-medium">
                        <span className="mono text-[13px]">{String(o.number)}</span>
                        <Badge tone={String(o.escrow_state) === 'HELD' ? 'warn' : 'ok'}>escrow {String(o.escrow_state).toLowerCase()}</Badge>
                        <Badge>{titleCaseOr(String(o.status))}</Badge>
                      </p>
                      <p className="mt-1 text-[13px] text-[var(--muted)]">
                        {String(o.buyer_first)} {String(o.buyer_last)} · {String(o.destination_city ?? '')}, {String(o.destination_state ?? '')} ·{' '}
                        {titleCaseOr(String(o.fulfillment))}
                      </p>
                      <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">
                        {String(o.first_animal ?? '')} · placed {relTime(String(o.placed_at))} · {String(o.item_count)} animal(s) · buyer paid{' '}
                        <span className="mono">{money(Number(o.total_cents))}</span>
                      </p>
                    </div>
                    <div className="w-[300px] shrink-0 space-y-2">
                      {['PREPARING', 'BREEDER_CONFIRMED'].includes(String(o.status)) ? (
                        <input
                          className="input h-10"
                          placeholder={o.tracking_number ? `on file: ${String(o.tracking_number)}` : 'Tracking number'}
                          value={tracking[String(o.id)] ?? ''}
                          onChange={(e) => setTracking({ ...tracking, [String(o.id)]: e.target.value })}
                        />
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(NEXT[String(o.status)] ?? []).map((n) => (
                          <button key={n.status} className="btn btn-sm" disabled={busy === String(o.id) + n.status} onClick={() => advance(String(o.id), n.status)}>
                            {n.label}
                          </button>
                        ))}
                        <Link href={`/orders/${String(o.id)}`} className="btn btn-ghost btn-sm">
                          Details
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- documents */

export function DesktopSellerDocuments({ rows, types }: { rows: Row[]; types: string[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [docType, setDocType] = useState(types[0] ?? 'BREEDER_LICENSE');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('doc_type', docType);
      if (expires) form.set('expires_at', expires);
      await post('seller/documents', form);
      toast('Uploaded — the desk reviews within 24 h', { tone: 'success' });
      setFile(null);
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Upload failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller/documents" />
        <div>
          <header className="border-b border-[var(--line)] pb-5">
            <p className="eyebrow">Compliance</p>
            <h1 className="h2 mt-1.5">Licences & documents</h1>
            <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--muted)]">
              Files go to the private vault. Buyers only ever see that a document exists and passed review — never the file itself. Every view of a
              document is logged.
            </p>
          </header>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
            <ul className="space-y-2.5">
              {rows.map((d) => (
                <li key={String(d.id)} className="card flex items-center gap-4 p-4">
                  <Icon name="doc" size={18} className="shrink-0 text-[var(--accent-soft)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {titleCaseOr(String(d.doc_type))}
                      {d.animal_name ? <span className="text-[var(--muted)]"> · {String(d.animal_name)}</span> : null}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                      {String(d.filename)} · {money(Number(d.size_bytes ?? 0) / 1024)} kb · uploaded {relTime(String(d.uploaded_at))}
                    </p>
                  </div>
                  <ComplianceBadge verdict={String(d.status) === 'VERIFIED' ? 'ALLOWED' : String(d.status) === 'PENDING' ? 'REQUIRES_DOCUMENTATION' : 'PROHIBITED'} label={titleCaseOr(String(d.status))} />
                  {d.expires_at ? <span className={`text-[12px] ${new Date(String(d.expires_at)) < new Date() ? 'text-[var(--error)]' : 'text-[var(--muted)]'}`}>expires {String(d.expires_at).slice(0, 10)}</span> : null}
                  {String(d.status) === 'REJECTED' && d.review_note ? <span className="max-w-[220px] text-[11.5px] leading-snug text-[var(--error)]">{String(d.review_note)}</span> : null}
                </li>
              ))}
              {!rows.length ? <li className="card p-6 text-[13px] text-[var(--muted)]">No documents yet. Upload the licence that authorises you to keep and sell these taxa.</li> : null}
            </ul>

            <section className="card sticky top-[86px] p-5">
              <p className="label">Upload</p>
              <label className="mt-3 block">
                <span className="label">Type</span>
                <select className="select mt-1 h-11" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {titleCaseOr(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className="label">Expiry (if any)</span>
                <input className="input mt-1 h-11" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
              <label className="mt-3 block">
                <span className="label">File</span>
                <input type="file" accept="application/pdf,image/*" className="input mt-1 h-11 py-0 text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <button className="btn btn-block mt-4" onClick={upload} disabled={busy || !file}>
                {busy ? 'Uploading…' : 'Upload privately'}
              </button>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">PDF or image, 12 MB max. Storage path never leaves the server.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- reviews */

export function DesktopSellerReviews({ rows, rating }: { rows: Row[]; rating: { avg: number; count: number } }) {
  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller/reviews" />
        <div>
          <header className="flex items-end justify-between border-b border-[var(--line)] pb-5">
            <div>
              <p className="eyebrow">Reputation</p>
              <h1 className="h2 mt-1.5">Reviews</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">Only buyers with a completed order can review. Scores feed your public rating.</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Stars value={rating.avg} />
                <span className="mono text-[15px]">{rating.avg.toFixed(2)}</span>
              </div>
              <p className="text-[12px] text-[var(--muted)]">{rating.count} reviews</p>
            </div>
          </header>
          {!rows.length ? (
            <div className="py-12">
              <EmptyState icon="star" title="No reviews yet" body="The first completed order unlocks the first review." />
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-4">
              {rows.map((r) => (
                <li key={String(r.id)} className="card p-5">
                  <div className="flex items-center gap-2">
                    <Stars value={Number(r.overall)} showValue />
                    <span className="ml-auto text-[12px] text-[var(--muted)]">{String(r.created_at).slice(0, 10)}</span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium">{String(r.title)}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{String(r.body)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(['animal_health', 'documentation', 'transport', 'communication'] as const).map((k) =>
                      r[k] != null ? (
                        <Badge key={k}>
                          {titleCaseOr(k)} {Number(r[k]).toFixed(1)}
                        </Badge>
                      ) : null,
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- plan */

export function DesktopSellerPlan({ data }: { data: SellerBundle }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const current = String(data.dash.breeder?.storefront_plan ?? 'FREE');

  async function choose(plan: string) {
    setBusy(plan);
    try {
      const res = await post<{ price_cents_month: number }>('seller/plan', { plan });
      toast(`${titleCaseOr(plan)} plan active — ${money(res.price_cents_month)}/mo`, { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Plan change failed', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <SellerSidebar active="/seller/plan" />
        <div>
          <header className="border-b border-[var(--line)] pb-5">
            <p className="eyebrow">Commerce</p>
            <h1 className="h2 mt-1.5">Plan & fees</h1>
            <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--muted)]">
              Commission is charged on completed sales only. Buyers never pay a marketplace fee — the total they see at checkout is the animal, transport
              and tax.
            </p>
          </header>
          <div className="mt-5 grid grid-cols-3 gap-4">
            {data.plan.map((p) => {
              const isCurrent = current === p.plan;
              return (
                <div key={p.plan} className={`card flex flex-col p-6 ${isCurrent ? 'ring-1 ring-[var(--ink)]' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-medium">{titleCaseOr(p.plan)}</p>
                    {isCurrent ? <Badge tone="ink">current</Badge> : null}
                  </div>
                  <p className="mt-3 h3">{p.price_cents_month ? money(p.price_cents_month) : '$0'}<span className="text-[13px] font-normal text-[var(--muted)]">/mo</span></p>
              {p.description ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{p.description}</p> : null}
                  <ul className="mt-4 space-y-2 text-[13px]">
                    <li className="flex gap-2">
                      <Icon name="check" size={14} className="mt-0.5 text-[var(--success)]" /> {(p.commission_bps / 100).toFixed(0)}% commission on completed sales
                    </li>
                    <li className="flex gap-2">
                      <Icon name={p.featured_cents_week ? 'star' : 'minus'} size={14} className="mt-0.5 text-[var(--success)]" />
                      {p.featured_cents_week ? `Featured placement ${money(p.featured_cents_week)}/week` : 'Featured slots purchasable per listing'}
                    </li>
                    <li className="flex gap-2">
                      <Icon name="dollar" size={14} className="mt-0.5 text-[var(--success)]" /> Payout fee {(p.payout_bps / 100).toFixed(1)}% on escrow release
                    </li>
                    <li className="flex gap-2">
                      <Icon name="check" size={14} className="mt-0.5 text-[var(--success)]" /> {p.plan === 'FREE' ? 'Up to 8 live listings' : 'Unlimited listings'}
                    </li>
                    {p.plan !== 'FREE' ? (
                      <li className="flex gap-2">
                        <Icon name="check" size={14} className="mt-0.5 text-[var(--success)]" /> Payout release fee reduced
                      </li>
                    ) : null}
                  </ul>
                  <button className={`btn btn-sm mt-5 w-full ${isCurrent ? 'btn-quiet' : ''}`} disabled={isCurrent || busy === p.plan} onClick={() => choose(p.plan)}>
                    {isCurrent ? 'Active plan' : busy === p.plan ? 'Switching…' : `Switch to ${titleCaseOr(p.plan)}`}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="card-quiet mt-5 p-5 text-[12.5px] leading-relaxed text-[var(--muted)]">
            <p className="label">Where the money goes</p>
            <p className="mt-1.5">
              Buyer pays animal + transport + tax. The marketplace keeps the commission shown above; the rest is held in escrow and paid out to you 48
              hours after the buyer confirms arrival, minus the flat release fee. Refunds and disputes are settled from the hold, never from your balance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- listing wizard */

export interface WizardData {
  species: { id: string; common_name: string; scientific_name: string; category: string; is_sensitive: number; cites_appendix: string | null; morphs: { id: string; name: string }[] }[];
  states: { code: string; name: string }[];
  docTypes: string[];
  draft: Row | null;
  draftImages: Row[];
  draftDocuments: Row[];
}

const EMPTY = {
  name: '',
  speciesId: '',
  morphId: '',
  sex: 'UNKNOWN',
  ageMonths: '',
  lengthCm: '',
  weightG: '',
  color: '',
  temperament: '',
  experienceLevel: 'INTERMEDIATE',
  diet: '',
  habitat: '',
  temperatureF: '',
  humidityPct: '',
  feedingSchedule: '',
  enclosureMinCm: '',
  medicalNotes: '',
  healthStatus: 'GOOD',
  price: '',
  description: '',
  city: '',
  state: 'NY',
  captiveBred: true,
  availability: 'AVAILABLE',
};

export function DesktopListingWizard({ data }: { data: WizardData }) {
  const router = useRouter();
  const { toast } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string | boolean>>({
    ...EMPTY,
    ...(data.draft
      ? {
          name: String(data.draft.name ?? ''),
          speciesId: String(data.draft.species_id ?? ''),
          morphId: String(data.draft.morph_id ?? ''),
          sex: String(data.draft.sex ?? 'UNKNOWN'),
          ageMonths: String(data.draft.age_months ?? ''),
          price: String(Number(data.draft.price_cents ?? 0) / 100),
          description: String(data.draft.description ?? ''),
          city: String(data.draft.city ?? ''),
          state: String(data.draft.state ?? 'NY'),
          temperament: String(data.draft.temperament ?? ''),
          diet: String(data.draft.diet ?? ''),
        }
      : {}),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [docs, setDocs] = useState<{ doc_type: string; file: File | null; expires_at: string }[]>(data.docTypes.map((d) => ({ doc_type: d, file: null, expires_at: '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(data.draft ? String(data.draft.id) : null);

  const species = useMemo(() => data.species.find((s) => s.id === form.speciesId) ?? null, [data.species, form.speciesId]);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const valid = [
    () => !!form.name && !!form.speciesId,
    () => !!form.sex && Number(form.ageMonths) >= 0 && form.ageMonths !== '',
    () => !!form.diet && !!form.temperatureF,
    () => true,
    () => true,
    () => !!form.price && Number(form.price) > 0 && String(form.description).length >= 40,
    () => !!form.city && !!form.state,
    () => true,
  ];
  const canNext = valid[step]();

  async function saveDraft(submit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        id: saved ?? undefined,
        action: submit ? 'submit' : 'draft',
        ageMonths: Number(form.ageMonths || 0),
        price: Number(form.price || 0),
        lengthCm: form.lengthCm ? Number(form.lengthCm) : null,
        weightG: form.weightG ? Number(form.weightG) : null,
        enclosureMinCm: form.enclosureMinCm ? Number(form.enclosureMinCm) : null,
        morphId: form.morphId || null,
      };
      const res = await post<{ animal?: { id: string }; listing?: { id: string }; warnings?: string[] }>('seller/listings', payload);
      const animalId = res.animal?.id ?? res.listing?.id ?? saved;
      if (animalId) {
        setSaved(animalId);
        if (files.length) {
          const fd = new FormData();
          files.forEach((f) => fd.append('files', f));
          await post(`seller/listings/${animalId}/images`, fd);
        }
        for (const d of docs) {
          if (!d.file) continue;
          const fd = new FormData();
          fd.set('file', d.file);
          fd.set('doc_type', d.doc_type);
          if (d.expires_at) fd.set('expires_at', d.expires_at);
          fd.set('animal_id', animalId);
          await post('seller/documents', fd);
        }
      }
      toast(submit ? 'Submitted — the compliance desk reviews it within 24 h' : 'Draft saved', { tone: 'success' });
      router.push(submit ? '/seller/listings' : '/seller/listings');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that listing.');
      setBusy(false);
    }
  }

  return (
    <div className="shell py-8">
      <div className="mx-auto max-w-[900px]">
        <header className="border-b border-[var(--line)] pb-5">
          <p className="eyebrow">New listing</p>
          <h1 className="h2 mt-1.5">Add an animal</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Eight steps. Everything you enter is used to decide legality — inaccurate facts are a terms violation even when the animal is legal.
          </p>
          <ol className="mt-5 flex items-center gap-2">
            {WIZARD_STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <button
                  onClick={() => i <= step && setStep(i)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${i === step ? 'border-[var(--ink)] bg-[var(--surface-2)]' : i < step ? 'border-[var(--line)] hover:border-[var(--accent-soft)]' : 'border-dashed border-[var(--line)]'}`}
                >
                  <span className={`mono text-[10.5px] ${i <= step ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>0{i + 1}</span>
                  <span className={`truncate text-[12px] ${i === step ? 'font-medium' : 'text-[var(--muted)]'}`}>{label}</span>
                  {i < step ? <Icon name="check" size={12} className="ml-auto shrink-0 text-[var(--success)]" /> : null}
                </button>
              </li>
            ))}
          </ol>
        </header>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_230px] items-start gap-8">
          <div className="space-y-4">
            {step === 0 ? (
              <Fieldset title="Who is this animal" hint="Pick from the FAUNAL taxonomy — species and morph drive the rule lookup.">
                <label className="block">
                  <span className="label">Display name</span>
                  <input className="input mt-1 h-11" value={String(form.name)} onChange={(e) => set('name', e.target.value)} placeholder="Sunbeam" />
                </label>
                <label className="mt-3 block">
                  <span className="label">Species</span>
                  <select className="select mt-1 h-11" value={String(form.speciesId)} onChange={(e) => set('speciesId', e.target.value)}>
                    <option value="">Choose a species…</option>
                    {data.species.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.common_name} — {s.category}
                        {s.cites_appendix ? ` · CITES ${s.cites_appendix}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block">
                  <span className="label">Morph / variety</span>
                  <select className="select mt-1 h-11" value={String(form.morphId)} onChange={(e) => set('morphId', e.target.value)} disabled={!species?.morphs.length}>
                    <option value="">{species ? (species.morphs.length ? 'None / not listed' : 'No morphs recorded') : 'Choose a species first'}</option>
                    {species?.morphs.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check mt-3">
                  <input type="checkbox" checked={!!form.captiveBred} onChange={(e) => set('captiveBred', e.target.checked)} />
                  <span className="text-[13px] leading-snug">Captive-bred here (not wild-caught). Wild-caught specimens need CITES and import paperwork.</span>
                </label>
              </Fieldset>
            ) : null}

            {step === 1 ? (
              <Fieldset title="Attributes">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Sex</span>
                    <select className="select mt-1 h-11" value={String(form.sex)} onChange={(e) => set('sex', e.target.value)}>
                      {['FEMALE', 'MALE', 'UNKNOWN'].map((s) => (
                        <option key={s} value={s}>
                          {titleCaseOr(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Age (months)</span>
                    <input className="input mt-1 h-11" inputMode="numeric" value={String(form.ageMonths)} onChange={(e) => set('ageMonths', e.target.value.replace(/\D/g, ''))} />
                  </label>
                  <label className="block">
                    <span className="label">Total length (cm)</span>
                    <input className="input mt-1 h-11" value={String(form.lengthCm)} onChange={(e) => set('lengthCm', e.target.value.replace(/[^\d.]/g, ''))} />
                  </label>
                  <label className="block">
                    <span className="label">Weight (g)</span>
                    <input className="input mt-1 h-11" value={String(form.weightG)} onChange={(e) => set('weightG', e.target.value.replace(/[^\d.]/g, ''))} />
                  </label>
                  <label className="block">
                    <span className="label">Colour / pattern</span>
                    <input className="input mt-1 h-11" value={String(form.color)} onChange={(e) => set('color', e.target.value)} placeholder="Banana pastels, no break" />
                  </label>
                  <label className="block">
                    <span className="label">Temperament</span>
                    <input className="input mt-1 h-11" value={String(form.temperament)} onChange={(e) => set('temperament', e.target.value)} placeholder="Calm, feeds in hand" />
                  </label>
                </div>
              </Fieldset>
            ) : null}

            {step === 2 ? (
              <Fieldset title="Husbandry & health" hint="Buyers filter on this. The care desk checks that your numbers match the species standard.">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Diet</span>
                    <input className="input mt-1 h-11" value={String(form.diet)} onChange={(e) => set('diet', e.target.value)} placeholder="Frozen pinky mice, every 5 days" />
                  </label>
                  <label className="block">
                    <span className="label">Feeding schedule</span>
                    <input className="input mt-1 h-11" value={String(form.feedingSchedule)} onChange={(e) => set('feedingSchedule', e.target.value)} placeholder="14 feeds on record" />
                  </label>
                  <label className="block">
                    <span className="label">Hot side (°F)</span>
                    <input className="input mt-1 h-11" value={String(form.temperatureF)} onChange={(e) => set('temperatureF', e.target.value)} placeholder="88-92" />
                  </label>
                  <label className="block">
                    <span className="label">Humidity (%)</span>
                    <input className="input mt-1 h-11" value={String(form.humidityPct)} onChange={(e) => set('humidityPct', e.target.value)} placeholder="55-65" />
                  </label>
                  <label className="block">
                    <span className="label">Minimum enclosure (cm)</span>
                    <input className="input mt-1 h-11" value={String(form.enclosureMinCm)} onChange={(e) => set('enclosureMinCm', e.target.value)} placeholder="120 x 60" />
                  </label>
                  <label className="block">
                    <span className="label">Habitat type</span>
                    <input className="input mt-1 h-11" value={String(form.habitat)} onChange={(e) => set('habitat', e.target.value)} placeholder="Bioactive, cork rounds" />
                  </label>
                  <label className="block">
                    <span className="label">Care level</span>
                    <select className="select mt-1 h-11" value={String(form.experienceLevel)} onChange={(e) => set('experienceLevel', e.target.value)}>
                      {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((l) => (
                        <option key={l} value={l}>
                          {titleCaseOr(l)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Health status</span>
                    <select className="select mt-1 h-11" value={String(form.healthStatus)} onChange={(e) => set('healthStatus', e.target.value)}>
                      {['GOOD', 'UNDER_OBSERVATION', 'RECOVERING'].map((l) => (
                        <option key={l} value={l}>
                          {titleCaseOr(l)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="label">Medical notes (private — never shown to buyers)</span>
                  <textarea className="textarea mt-1" rows={2} value={String(form.medicalNotes)} onChange={(e) => set('medicalNotes', e.target.value)} placeholder="Vet check date, mites treatment, injuries" />
                </label>
              </Fieldset>
            ) : null}

            {step === 3 ? (
              <Fieldset title="Media" hint="Photos must show this individual. FAUNAL hashes every upload and flags images reused across accounts.">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="input h-12 py-0 text-[13px]"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
                />
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px]">
                      <Icon name="image" size={14} className="text-[var(--muted)]" /> {f.name} · {Math.round(f.size / 1024)} kb
                      <button className="ml-auto text-[var(--muted)]" onClick={() => setFiles((arr) => arr.filter((_, n) => n !== i))}>
                        <Icon name="close" size={13} />
                      </button>
                    </li>
                  ))}
                  {data.draftImages.map((img) => (
                    <li key={String(img.id)} className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
                      <Media media={{ path_medium: img.path_medium as string, path_small: img.path_small as string, base_path: img.base_path as string }} alt="" className="h-8 w-8 rounded" />
                      on listing · {titleCaseOr(String(img.kind ?? 'photo'))}
                    </li>
                  ))}
                  {!files.length && !data.draftImages.length ? <li className="text-[12.5px] text-[var(--muted)]">No files selected — a listing without a photo of the actual animal gets rejected.</li> : null}
                </ul>
              </Fieldset>
            ) : null}

            {step === 4 ? (
              <Fieldset title="Paperwork" hint="Attach what the rulebook requires for this species and origin. Missing documents keep the listing in review, not hidden.">
                <ul className="space-y-3">
                  {docs.map((d, i) => (
                    <li key={d.doc_type} className="grid grid-cols-[190px_minmax(0,1fr)_150px] items-center gap-3">
                      <span className="text-[13px]">{titleCaseOr(d.doc_type)}</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="input h-10 py-0 text-[12.5px]"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setDocs((arr) => arr.map((x, n) => (n === i ? { ...x, file } : x)));
                        }}
                      />
                      <input className="input h-10" type="date" value={d.expires_at} onChange={(e) => setDocs((arr) => arr.map((x, n) => (n === i ? { ...x, expires_at: e.target.value } : x)))} />
                    </li>
                  ))}
                </ul>
                {data.draftDocuments.length ? (
                  <p className="mt-3 text-[12px] text-[var(--muted)]">
                    {data.draftDocuments.length} document(s) already attached to this listing: {data.draftDocuments.map((d) => titleCaseOr(String(d.doc_type))).join(', ')}
                  </p>
                ) : null}
              </Fieldset>
            ) : null}

            {step === 5 ? (
              <Fieldset title="Price & availability">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Price (USD)</span>
                    <input className="input mt-1 h-11" value={String(form.price)} onChange={(e) => set('price', e.target.value.replace(/[^\d.]/g, ''))} placeholder="450" />
                    <span className="field-hint">Settled in USD. Buyers see {form.price ? money(Math.round(Number(form.price) * 100)) : '$—'}.</span>
                  </label>
                  <label className="block">
                    <span className="label">Availability</span>
                    <select className="select mt-1 h-11" value={String(form.availability)} onChange={(e) => set('availability', e.target.value)}>
                      {['AVAILABLE', 'RESERVED', 'NOT_AVAILABLE'].map((a) => (
                        <option key={a} value={a}>
                          {titleCaseOr(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="label">Description (40 characters minimum)</span>
                  <textarea className="textarea mt-1" rows={5} value={String(form.description)} onChange={(e) => set('description', e.target.value)} placeholder="Lineage, feeding history, what you include in the sale, what you do not." />
                  <span className="field-hint">{String(form.description).length} characters</span>
                </label>
              </Fieldset>
            ) : null}

            {step === 6 ? (
              <Fieldset title="Origin & transport" hint="The origin state is where the animal was bred — it selects which export rules apply.">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">City</span>
                    <input className="input mt-1 h-11" value={String(form.city)} onChange={(e) => set('city', e.target.value)} placeholder="Albany" />
                  </label>
                  <label className="block">
                    <span className="label">State</span>
                    <select className="select mt-1 h-11" value={String(form.state)} onChange={(e) => set('state', e.target.value)}>
                      {data.states.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ul className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  <li className="flex gap-2">
                    <Icon name="truck" size={14} className="mt-0.5 shrink-0" /> Pickup, specialized courier and breeder delivery are offered per
                    destination — a route with no legal method cannot be sold, whatever you prefer.
                  </li>
                  <li className="flex gap-2">
                    <Icon name="thermometer" size={14} className="mt-0.5 shrink-0" /> Cold-chain limits are enforced at booking, not at your discretion.
                  </li>
                </ul>
              </Fieldset>
            ) : null}

            {step === 7 ? (
              <Fieldset title="Review & submit">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13px]">
                  {[
                    ['Animal', `${form.name || '—'} · ${species?.common_name ?? 'no species'}`],
                    ['Morph', species?.morphs.find((m) => m.id === form.morphId)?.name ?? '—'],
                    ['Sex / age', `${titleCaseOr(String(form.sex))} · ${form.ageMonths || '—'} months`],
                    ['Price', form.price ? money(Math.round(Number(form.price) * 100)) : '—'],
                    ['Origin', `${form.city || '—'}, ${form.state}`],
                    ['Captive-bred', form.captiveBred ? 'Yes' : 'No — CITES/origin proof required'],
                    ['Photos', `${files.length + data.draftImages.length} attached`],
                    ['Documents', `${docs.filter((d) => d.file).length + data.draftDocuments.length} attached`],
                    ['Care level', titleCaseOr(String(form.experienceLevel))],
                    ['Availability', titleCaseOr(String(form.availability))],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-[var(--line)] pb-1.5">
                      <dt className="text-[var(--muted)]">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <ErrorNote tone="warn">
                  Submitting sends the listing to the compliance desk. If the verdict on your state is PROHIBITED the listing cannot go live — you will be
                  told which rule blocked it.
                </ErrorNote>
              </Fieldset>
            ) : null}

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <div className="flex items-center justify-between pt-1">
              <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                <Icon name="back" size={15} /> Back
              </button>
              <div className="flex items-center gap-2">
                <button className="btn btn-quiet" onClick={() => saveDraft(false)} disabled={busy}>
                  {busy ? 'Saving…' : 'Save draft'}
                </button>
                {step < WIZARD_STEPS.length - 1 ? (
                  <button className="btn" onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>
                    Continue <Icon name="chevronRight" size={15} />
                  </button>
                ) : (
                  <button className="btn" onClick={() => saveDraft(true)} disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit for review'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="sticky top-[86px] space-y-3">
            <div className="card-quiet p-4 text-[12px] leading-relaxed text-[var(--muted)]">
              <p className="label">Step {step + 1} of 8</p>
              <p className="mt-1.5">{WIZARD_STEPS[step]} — {['identity and taxonomy', 'measurable facts', 'conditions you maintain', 'proof it is this animal', 'documents that make it legal', 'what it costs and whether it is spoken for', 'where it came from and how it moves', 'sanity check before the desk sees it'][step]}</p>
            </div>
            {species?.is_sensitive ? (
              <div className="card p-4 tone-warn">
                <p className="text-[12.5px] leading-relaxed">
                  <span className="font-medium">{species.common_name}</span> is flagged sensitive
                  {species.cites_appendix ? ` (CITES appendix ${species.cites_appendix})` : ''}. Listings for it always pass a human review, even with
                  clean paperwork.
                </p>
              </div>
            ) : null}
            <div className="card p-4">
              <p className="label">Compliance preview</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
                The verdict for {form.state || 'your state'} is computed on submit and shown on the listing. Fix the facts now and you skip a round trip
                with the desk.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Fieldset({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <p className="label">{title}</p>
      {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
