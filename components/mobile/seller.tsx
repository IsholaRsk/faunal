'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, Badge, EmptyState, Stars, ComplianceBadge, VerifiedMark, ErrorNote, ProgressSteps } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { post, patch, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { money, titleCaseOr, relTime } from '@/lib/ui/screen-helpers';
import { WIZARD_STEPS, type Row, type SellerBundle, type WizardData } from '@/components/desktop/seller';

/**
 * MOBILE seller desk — an app, not a shrunken console: KPI cards, task list,
 * one action per sheet, thumb-height controls.
 */

export function MobileSellerGate({ kind = 'access' }: { kind?: 'access' | 'pending' | 'rejected' }) {
  const copy =
    kind === 'pending'
      ? { title: 'Verification in review', body: 'The desk is checking your licence. Draft listings are open now; publishing waits for approval.' }
      : kind === 'rejected'
        ? { title: 'Application needs attention', body: 'Re-upload a current licence or permit and the desk reviews again within 24 hours.' }
        : { title: 'Seller desk', body: 'Verified breeders get the desk. Apply, then draft and submit listings from your phone.' };
  return (
    <div>
      <MobileHeader title="Seller desk" back="/profile" />
      <div className="px-4 py-6">
        <EmptyState
          icon={kind === 'access' ? 'store' : 'shield'}
          title={copy.title}
          body={copy.body}
          action={
            <div className="flex gap-2">
              <Link href="/become-a-breeder" className="btn">
                Apply
              </Link>
              <Link href="/compliance/documents" className="btn btn-quiet">
                What we accept
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}

export function MobileSellerDashboard({ data }: { data: SellerBundle }) {
  const b = data.dash.breeder ?? {};
  const max = Math.max(1, ...data.dash.trend.map((t) => Number(t.cents)));
  const tasks: { href: string; label: string; value: number; icon: IconName; tone?: 'warn' | 'bad' }[] = [
    { href: '/seller/orders', label: 'Orders to fulfil', value: data.dash.orders.open, icon: 'box', tone: 'warn' },
    { href: '/seller/listings', label: 'Awaiting review', value: data.dash.counts.pending, icon: 'clock' },
    { href: '/seller/documents', label: 'Documents', value: data.documents.length, icon: 'doc' },
    { href: '/messages', label: 'Unanswered messages', value: data.dash.unreadMessages, icon: 'chat' },
  ];

  return (
    <div className="pb-8">
      <MobileHeader
        title="Seller desk"
        subtitle={String(b.business_name ?? '')}
        back="/profile"
        actions={
          <Link href="/seller/listings/new" className="icon-btn" aria-label="Add animal">
            <Icon name="plus" size={19} />
          </Link>
        }
      />

      <div className="space-y-3 px-4 pt-3">
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-[15px] font-medium">
            {String(b.business_name ?? 'Storefront')} {b.tier ? <VerifiedMark tier={String(b.tier)} /> : null}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {String(b.city ?? '')}, {String(b.state ?? '')} · {titleCaseOr(String(b.storefront_plan ?? 'FREE'))} plan · {String(b.license_number ?? 'licence on file')}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Stars value={Number(b.rating_avg ?? 0)} size={14} />
            <span className="mono text-[12px]">{Number(b.rating_avg ?? 0).toFixed(2)}</span>
            <span className="text-[12px] text-[var(--muted)]">· {Number(b.rating_count ?? 0)} reviews · {Number(b.transactions_count ?? 0)} transfers</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['Gross volume', money(data.dash.revenue.gross_cents)],
            ['In escrow', money(data.dash.revenue.held_cents)],
            ['Settled', money(data.dash.revenue.paid_cents)],
            ['Listing views', data.dash.views.toLocaleString('en-US')],
          ].map(([label, value]) => (
            <div key={String(label)} className="card p-3.5">
              <p className="text-[11px] text-[var(--muted)]">{String(label)}</p>
              <p className="mt-1 text-[17px] font-semibold">{String(value)}</p>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <p className="label">Last 30 days</p>
          {data.dash.trend.length ? (
            <div className="mt-3 flex h-16 items-end gap-1">
              {data.dash.trend.map((t) => (
                <span key={t.day} className="flex-1 rounded-t bg-[var(--ink)]" style={{ height: `${Math.max(6, (Number(t.cents) / max) * 100)}%` }} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-[var(--muted)]">No orders in the window.</p>
          )}
        </div>

        <div className="card overflow-hidden">
          <p className="border-b border-[var(--line)] px-4 py-3 label">Needs you</p>
          <ul className="divide-y divide-[var(--line)]">
            {tasks.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-2)]">
                    <Icon name={t.icon} size={17} />
                  </span>
                  <span className="flex-1 text-[13.5px]">{t.label}</span>
                  <Badge tone={t.value ? 'warn' : 'quiet'}>{t.value}</Badge>
                  <Icon name="chevronRight" size={15} className="text-[var(--muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2">
          <Link href="/seller/listings/new" className="btn flex-1">
            <Icon name="plus" size={15} /> Add animal
          </Link>
          <Link href={`/breeders/${String(b.slug ?? '')}`} className="btn btn-quiet flex-1">
            <Icon name="store" size={15} /> Storefront
          </Link>
        </div>

        <p className="pt-1 text-center text-[11.5px] leading-relaxed text-[var(--muted)]">
          {data.dash.counts.active} live · {data.dash.counts.drafts} draft · {data.dash.counts.sold} sold · {data.dash.counts.rejected} rejected
        </p>
      </div>
    </div>
  );
}

export function MobileSellerListings({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = rows.filter((r) => !filter || `${r.name} ${r.species_name}`.toLowerCase().includes(filter.toLowerCase()));

  async function act(body: Record<string, unknown>, message: string) {
    if (!open) return;
    setBusy(true);
    try {
      await patch(`seller/listings/${String(open.id)}`, body);
      toast(message, { tone: 'success' });
      setOpen(null);
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Refused', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-8">
      <MobileHeader
        title="Listings"
        back="/seller"
        actions={
          <Link href="/seller/listings/new" className="icon-btn" aria-label="Add">
            <Icon name="plus" size={19} />
          </Link>
        }
      />
      <div className="px-4 pt-2">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3">
          <Icon name="search" size={16} className="text-[var(--muted)]" />
          <input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>

      {!shown.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="paw" title="No listings" body="Draft one — it stays private until you submit it for review." action={<Link href="/seller/listings/new" className="btn">Add an animal</Link>} />
        </div>
      ) : (
        <ul className="mt-2 space-y-2.5 px-4">
          {shown.map((l) => (
            <li key={String(l.id)}>
              <button className="card flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(l)}>
                <Media media={{ path_medium: l.image_medium as string, path_small: l.image_small as string, base_path: l.base_path as string }} alt={String(l.name)} ratio="1 / 1" className="w-14 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{String(l.name)}</span>
                  <span className="block truncate text-[12px] text-[var(--muted)]">{String(l.species_name)} · {money(Number(l.price_cents))}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <Badge tone={String(l.status) === 'APPROVED' ? 'ok' : String(l.status) === 'PENDING_REVIEW' ? 'warn' : String(l.status) === 'REJECTED' ? 'bad' : 'quiet'}>{titleCaseOr(String(l.status))}</Badge>
                    {l.compliance_status ? <ComplianceBadge verdict={String(l.compliance_status)} /> : null}
                  </span>
                </span>
                <Icon name="menu" size={16} className="text-[var(--muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={String(open?.name ?? 'Listing')}>
        <div className="space-y-2.5">
          {open && String(open.status) === 'DRAFT' ? (
            <button className="btn btn-block" disabled={busy} onClick={() => act({ status: 'PENDING_REVIEW' }, 'Submitted for review')}>
              Submit for review
            </button>
          ) : null}
          {open && String(open.status) === 'APPROVED' ? (
            <button className="btn btn-block" disabled={busy} onClick={() => act({ status: 'PAUSED' }, 'Paused')}>
              Pause listing
            </button>
          ) : null}
          {open && String(open.status) === 'PAUSED' ? (
            <button className="btn btn-block" disabled={busy} onClick={() => act({ status: 'APPROVED' }, 'Back live')}>
              Resume listing
            </button>
          ) : null}
          {open && String(open.status) !== 'SOLD' ? (
            <button className="btn btn-quiet btn-block" disabled={busy} onClick={() => act({ status: 'SOLD' }, 'Marked sold')}>
              Mark sold &amp; archive
            </button>
          ) : null}
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="label">New price</p>
            <div className="mt-2 flex gap-2">
              <input className="input h-11 flex-1" inputMode="decimal" value={price || String(Number(open?.price_cents ?? 0) / 100)} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
              <button className="btn" disabled={busy} onClick={() => act({ price: Number(price || '0') }, 'Price updated')}>
                Save
              </button>
            </div>
          </div>
          <Link href={`/animals/${String(open?.slug ?? '')}`} className="btn btn-quiet btn-block">
            View public listing
          </Link>
        </div>
      </Sheet>
    </div>
  );
}

export function MobileSellerOrders({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const NEXT: Record<string, { status: string; label: string }> = {
    PAID: { status: 'BREEDER_CONFIRMED', label: 'Confirm order' },
    BREEDER_CONFIRMED: { status: 'PREPARING', label: 'Start preparation' },
    PREPARING: { status: 'SHIPPED', label: 'Mark shipped' },
    READY_FOR_PICKUP: { status: 'DELIVERED', label: 'Confirm handoff' },
    SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
  };

  async function advance(orderId: string, status: string) {
    setBusy(orderId);
    try {
      await post(`orders/${orderId}/advance`, { status });
      toast('Updated', { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Refused', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-8">
      <MobileHeader title="Orders" back="/seller" />
      {!rows.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="box" title="No open orders" body="New orders appear here the moment a buyer checks out." />
        </div>
      ) : (
        <ul className="space-y-2.5 px-4 pt-3">
          {rows.map((o) => (
            <li key={String(o.id)} className="card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[12px]">{String(o.number)}</span>
                <Badge tone={String(o.escrow_state) === 'HELD' ? 'warn' : 'ok'}>{titleCaseOr(String(o.status))}</Badge>
              </div>
              <p className="mt-1.5 text-[13.5px] font-medium">
                {String(o.buyer_first)} {String(o.buyer_last)} · {String(o.destination_state ?? '')}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                {titleCaseOr(String(o.fulfillment))} · {String(o.item_count)} animal(s) · {money(Number(o.total_cents))} · {relTime(String(o.placed_at))}
              </p>
              <div className="mt-2.5 flex gap-2">
                {NEXT[String(o.status)] ? (
                  <button className="btn btn-sm flex-1" disabled={busy === String(o.id)} onClick={() => advance(String(o.id), NEXT[String(o.status)].status)}>
                    {NEXT[String(o.status)].label}
                  </button>
                ) : null}
                <Link href={`/orders/${String(o.id)}`} className="btn btn-quiet btn-sm flex-1">
                  Details
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileSellerDocuments({ rows, types }: { rows: Row[]; types: string[] }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [docType, setDocType] = useState(types[0] ?? 'BREEDER_LICENSE');
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('doc_type', docType);
      if (expires) fd.set('expires_at', expires);
      await post('seller/documents', fd);
      toast('Uploaded for review', { tone: 'success' });
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
    <div className="pb-8">
      <MobileHeader title="Documents" back="/seller" />
      <ul className="space-y-2 px-4 pt-3">
        {rows.map((d) => (
          <li key={String(d.id)} className="card flex items-center gap-3 p-3.5">
            <Icon name="doc" size={17} className="shrink-0 text-[var(--accent-soft)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{titleCaseOr(String(d.doc_type))}</span>
              <span className="block truncate text-[11.5px] text-[var(--muted)]">
                {d.animal_name ? `${String(d.animal_name)} · ` : ''}
                {relTime(String(d.uploaded_at))}
                {d.expires_at ? ` · expires ${String(d.expires_at).slice(0, 10)}` : ''}
              </span>
            </span>
            <ComplianceBadge verdict={String(d.status) === 'VERIFIED' ? 'ALLOWED' : String(d.status) === 'PENDING' ? 'REQUIRES_DOCUMENTATION' : 'PROHIBITED'} label={titleCaseOr(String(d.status))} />
          </li>
        ))}
        {!rows.length ? <li className="card p-4 text-[13px] text-[var(--muted)]">Nothing filed. Upload the licence that authorises you to keep and sell these taxa.</li> : null}
      </ul>

      <div className="mt-3 px-4">
        <div className="card space-y-2.5 p-4">
          <p className="label">Upload a document</p>
          <select className="select h-12" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {titleCaseOr(t)}
              </option>
            ))}
          </select>
          <input type="file" accept="application/pdf,image/*" className="input h-12 py-0 text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input className="input h-12" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <button className="btn btn-block" onClick={upload} disabled={busy || !file}>
            {busy ? 'Uploading…' : 'Upload privately'}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">Files are stored privately; buyers only ever see that a document exists and passed review.</p>
        </div>
      </div>
    </div>
  );
}

export function MobileSellerReviews({ rows, rating }: { rows: Row[]; rating: { avg: number; count: number } }) {
  return (
    <div className="pb-8">
      <MobileHeader title="Reviews" back="/seller" subtitle={`${rating.avg.toFixed(2)} · ${rating.count} reviews`} />
      {!rows.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="star" title="No reviews yet" body="Completed orders unlock reviews." />
        </div>
      ) : (
        <ul className="space-y-2.5 px-4 pt-3">
          {rows.map((r) => (
            <li key={String(r.id)} className="card p-3.5">
              <div className="flex items-center gap-2">
                <Stars value={Number(r.overall)} size={14} />
                <span className="text-[13px] font-medium">{String(r.title)}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{String(r.body)}</p>
              <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                {String(r.first_name)} · {String(r.created_at).slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileSellerPlan({ data }: { data: SellerBundle }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const current = String(data.dash.breeder?.storefront_plan ?? 'FREE');

  async function choose(plan: string) {
    setBusy(plan);
    try {
      const res = await post<{ price_cents_month: number }>('seller/plan', { plan });
      toast(`${titleCaseOr(plan)} active · ${money(res.price_cents_month)}/mo`, { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Change failed', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-8">
      <MobileHeader title="Plan & fees" back="/seller" />
      <ul className="space-y-2.5 px-4 pt-3">
        {data.plan.map((p) => (
          <li key={p.plan} className={`card p-4 ${current === p.plan ? 'ring-1 ring-[var(--ink)]' : ''}`}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium">{titleCaseOr(p.plan)}</p>
              {current === p.plan ? <Badge tone="ok">current</Badge> : null}
            </div>
            <p className="mt-2 text-[20px] font-semibold">
              {p.price_cents_month ? money(p.price_cents_month) : '$0'}
              <span className="text-[12px] font-normal text-[var(--muted)]">/mo</span>
            </p>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-[var(--muted)]">
              <li className="flex gap-2">
                <Icon name="check" size={13} className="mt-0.5 text-[var(--success)]" /> {(p.commission_bps / 100).toFixed(0)}% commission
              </li>
              <li className="flex gap-2">
                <Icon name="star" size={13} className="mt-0.5 text-[var(--success)]" />
                {p.featured_cents_week ? `Featured ${money(p.featured_cents_week)}/week` : 'Featured purchasable per listing'}
              </li>
              <li className="flex gap-2">
                <Icon name="dollar" size={13} className="mt-0.5 text-[var(--success)]" /> Payout fee {(p.payout_bps / 100).toFixed(1)}%
              </li>
            </ul>
            <button className="btn btn-sm mt-3 w-full" disabled={current === p.plan || busy === p.plan} onClick={() => choose(p.plan)}>
              {current === p.plan ? 'Active' : busy === p.plan ? 'Switching…' : 'Switch plan'}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-4 text-[11.5px] leading-relaxed text-[var(--muted)]">
        Commission applies to completed sales only. Escrow pays out 48 hours after the buyer confirms arrival, less the release fee.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- wizard */

export function MobileListingWizard({ data }: { data: WizardData }) {
  const router = useRouter();
  const { toast } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string | boolean>>({
    sex: 'UNKNOWN',
    state: 'NY',
    captiveBred: true,
    experienceLevel: 'INTERMEDIATE',
    healthStatus: 'GOOD',
    availability: 'AVAILABLE',
    name: '',
    speciesId: '',
    morphId: '',
    ageMonths: '',
    price: '',
    description: '',
    city: '',
    diet: '',
    temperatureF: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const species = data.species.find((s) => s.id === form.speciesId) ?? null;
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const ok = [
    () => !!form.name && !!form.speciesId,
    () => !!form.sex && form.ageMonths !== '',
    () => !!form.diet && !!form.temperatureF,
    () => true,
    () => true,
    () => !!form.price && String(form.description).length >= 40,
    () => !!form.city && !!form.state,
    () => true,
  ][step]();

  async function save(submit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ animal?: { id: string }; listing?: { id: string } }>('seller/listings', {
        ...form,
        ageMonths: Number(form.ageMonths || 0),
        price: Number(form.price || 0),
        morphId: form.morphId || null,
        action: submit ? 'submit' : 'draft',
      });
      const animalId = res.animal?.id ?? res.listing?.id;
      if (animalId && files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        await post(`seller/listings/${animalId}/images`, fd);
      }
      toast(submit ? 'Submitted to the compliance desk' : 'Draft saved', { tone: 'success' });
      router.push('/seller/listings');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <div className="pb-24">
      <MobileHeader title="Add an animal" back="/seller" subtitle={`Step ${step + 1} of 8 · ${WIZARD_STEPS[step]}`} />
      <ProgressSteps steps={WIZARD_STEPS} current={step} />

      <div className="space-y-3 px-4 pt-3">
        {step === 0 ? (
          <>
            <MLabel text="Display name" />
            <input className="input h-12" value={String(form.name)} onChange={(e) => set('name', e.target.value)} placeholder="Sunbeam" />
            <MLabel text="Species" />
            <select className="select h-12" value={String(form.speciesId)} onChange={(e) => set('speciesId', e.target.value)}>
              <option value="">Choose…</option>
              {data.species.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.common_name}
                  {s.cites_appendix ? ` · CITES ${s.cites_appendix}` : ''}
                </option>
              ))}
            </select>
            {species?.morphs.length ? (
              <>
                <MLabel text="Morph" />
                <select className="select h-12" value={String(form.morphId)} onChange={(e) => set('morphId', e.target.value)}>
                  <option value="">None / not listed</option>
                  {species.morphs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label className="check mt-1">
              <input type="checkbox" checked={!!form.captiveBred} onChange={(e) => set('captiveBred', e.target.checked)} />
              <span className="text-[13px] leading-snug">Captive-bred here, not wild-caught</span>
            </label>
            {species?.is_sensitive ? <ErrorNote tone="warn">Sensitive taxon: every listing for it is reviewed by a human before it goes live.</ErrorNote> : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <MLabel text="Sex" />
            <div className="segmented">
              {['FEMALE', 'MALE', 'UNKNOWN'].map((s) => (
                <button key={s} className={form.sex === s ? 'is-active' : ''} onClick={() => set('sex', s)}>
                  {titleCaseOr(s)}
                </button>
              ))}
            </div>
            <MLabel text="Age in months" />
            <input className="input h-12" inputMode="numeric" value={String(form.ageMonths)} onChange={(e) => set('ageMonths', e.target.value.replace(/\D/g, ''))} />
            <MLabel text="Colour / pattern" />
            <input className="input h-12" value={String(form.color ?? '')} onChange={(e) => set('color', e.target.value)} />
            <MLabel text="Temperament" />
            <input className="input h-12" value={String(form.temperament ?? '')} onChange={(e) => set('temperament', e.target.value)} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <MLabel text="Diet" />
            <input className="input h-12" value={String(form.diet)} onChange={(e) => set('diet', e.target.value)} placeholder="Frozen pinky, every 5 days" />
            <MLabel text="Hot side °F" />
            <input className="input h-12" value={String(form.temperatureF)} onChange={(e) => set('temperatureF', e.target.value)} placeholder="88-92" />
            <MLabel text="Humidity %" />
            <input className="input h-12" value={String(form.humidityPct ?? '')} onChange={(e) => set('humidityPct', e.target.value)} />
            <MLabel text="Care level" />
            <div className="segmented">
              {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((l) => (
                <button key={l} className={form.experienceLevel === l ? 'is-active' : ''} onClick={() => set('experienceLevel', l)}>
                  {titleCaseOr(l)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <MLabel text="Photos of this individual" />
            <input type="file" accept="image/*" multiple className="input h-12 py-0 text-[13px]" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))} />
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.name} className="text-[12.5px] text-[var(--muted)]">
                  {f.name} · {Math.round(f.size / 1024)} kb
                </li>
              ))}
              {!files.length ? <li className="text-[12.5px] text-[var(--muted)]">Hashes are checked against the catalogue for reused or stolen images.</li> : null}
            </ul>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <MLabel text="Paperwork" />
            <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
              Upload after the listing exists — the desk links each file to this animal. Missing paperwork keeps the listing in review rather than hidden.
            </p>
            <Link href="/seller/documents" className="btn btn-quiet btn-block">
              <Icon name="doc" size={15} /> Open document uploads
            </Link>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <MLabel text="Price in USD" />
            <input className="input h-12" inputMode="decimal" value={String(form.price)} onChange={(e) => set('price', e.target.value.replace(/[^\d.]/g, ''))} placeholder="450" />
            {form.price ? <p className="text-[12px] text-[var(--muted)]">Buyers see {money(Math.round(Number(form.price) * 100))}.</p> : null}
            <MLabel text="Description (40+ characters)" />
            <textarea className="textarea" rows={5} value={String(form.description)} onChange={(e) => set('description', e.target.value)} placeholder="Lineage, feeding history, what is included." />
            <p className="text-[11.5px] text-[var(--muted)]">{String(form.description).length} characters</p>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <MLabel text="City" />
            <input className="input h-12" value={String(form.city)} onChange={(e) => set('city', e.target.value)} placeholder="Albany" />
            <MLabel text="Origin state" />
            <select className="select h-12" value={String(form.state)} onChange={(e) => set('state', e.target.value)}>
              {data.states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              Transport methods offered to a buyer depend on this origin plus their destination. If no legal route exists, the listing cannot be bought
              there — that is the point.
            </p>
          </>
        ) : null}

        {step === 7 ? (
          <div className="card p-4">
            <p className="label">Check before submitting</p>
            <dl className="mt-2 space-y-2 text-[13px]">
              {[
                ['Animal', `${form.name || '—'} · ${species?.common_name ?? '—'}`],
                ['Sex / age', `${titleCaseOr(String(form.sex))} · ${form.ageMonths || '—'} mo`],
                ['Price', form.price ? money(Math.round(Number(form.price) * 100)) : '—'],
                ['Origin', `${form.city || '—'}, ${form.state}`],
                ['Photos', `${files.length}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-[var(--line)] pb-1.5">
                  <dt className="text-[var(--muted)]">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        ) : null}
      </div>

      <div className="sticky-cta">
        <button className="btn btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          <Icon name="back" size={15} /> Back
        </button>
        {step < 7 ? (
          <button className="btn" onClick={() => ok && setStep((s) => s + 1)} disabled={!ok}>
            Next
          </button>
        ) : (
          <button className="btn" onClick={() => save(true)} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        )}
      </div>
      {step < 7 ? (
        <p className="px-4 pb-2 pt-2 text-center">
          <button className="text-[12.5px] text-[var(--muted)]" onClick={() => save(false)} disabled={busy}>
            Save as draft and exit
          </button>
        </p>
      ) : null}
    </div>
  );
}

function MLabel({ text }: { text: string }) {
  return <p className="label mt-1">{text}</p>;
}
