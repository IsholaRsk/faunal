'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Badge, EmptyState, ComplianceBadge } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { post, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { money, titleCaseOr, relTime } from '@/lib/ui/screen-helpers';
import type { AdminBundle, Row } from '@/components/desktop/admin';

const SECTIONS: { key: string; label: string; icon: IconName }[] = [
  { key: '', label: 'Queue', icon: 'grid' },
  { key: 'listings', label: 'Listings', icon: 'paw' },
  { key: 'verifications', label: 'Breeders', icon: 'shield' },
  { key: 'documents', label: 'Docs', icon: 'doc' },
  { key: 'reports', label: 'Reports', icon: 'flag' },
  { key: 'fraud', label: 'Fraud', icon: 'alert' },
  { key: 'orders', label: 'Escrow', icon: 'box' },
  { key: 'users', label: 'Users', icon: 'user' },
];

/**
 * MOBILE admin — the desk you carry: the review queues first, each item as a
 * card with its decision actions in a sheet. Nothing read-only is a dead end.
 */
export function MobileAdmin({ section, data, role }: { section: string; data: AdminBundle; role: string }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(route: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await post(route, body);
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

  const queueCount = data.queue.length + data.verifications.length + data.reports.filter((r) => String(r.status) === 'OPEN').length + data.documents.filter((d) => String(d.status) === 'PENDING').length;

  const list: { id: string; title: string; sub: string; tone?: 'warn' | 'bad' | 'ok'; badge?: string; raw: Row; route: string; actions: { label: string; body: Record<string, unknown>; quiet?: boolean }[] }[] =
    section === 'listings'
      ? data.queue.map((q) => ({
          id: String(q.animal.id),
          title: `${String(q.animal.name)} · ${String(q.animal.species_name)}`,
          sub: `${String(q.breeder.business_name)} · ${money(Number(q.animal.price_cents))} · ${relTime(String(q.animal.created_at))}`,
          badge: titleCaseOr(String(q.animal.compliance_status ?? 'review')),
          tone: 'warn',
          raw: q.animal,
          route: 'admin/listings',
          actions: [
            { label: 'Approve', body: { animalId: q.animal.id, decision: 'APPROVE', note } },
            { label: 'Request documents', body: { animalId: q.animal.id, decision: 'NEEDS_DOCS', note }, quiet: true },
            { label: 'Reject', body: { animalId: q.animal.id, decision: 'REJECT', note }, quiet: true },
            { label: 'Suspend listing', body: { animalId: q.animal.id, decision: 'SUSPEND', note } },
          ],
        }))
      : section === 'verifications'
        ? data.verifications.map((v) => ({
            id: String(v.id),
            title: String(v.business_name),
            sub: `${String(v.city)}, ${String(v.state)} · wants ${titleCaseOr(String(v.requested_tier))}`,
            badge: 'pending',
            tone: 'warn',
            raw: v,
            route: 'admin/verification',
            actions: [
              { label: 'Approve breeder', body: { verificationId: v.id, decision: 'APPROVE', note } },
              { label: 'Reject', body: { verificationId: v.id, decision: 'REJECT', note }, quiet: true },
            ],
          }))
        : section === 'documents'
          ? data.documents.map((d) => ({
              id: String(d.id),
              title: `${titleCaseOr(String(d.doc_type))}`,
              sub: `${String(d.animal_name ?? d.business_name ?? 'account')} · ${relTime(String(d.uploaded_at))}`,
              badge: titleCaseOr(String(d.status)),
              raw: d,
              route: 'admin/documents',
              actions: [
                { label: 'Verify document', body: { documentId: d.id, decision: 'VERIFIED' } },
                { label: 'Reject', body: { documentId: d.id, decision: 'REJECTED', note: note || 'Illegible or expired' }, quiet: true },
              ],
            }))
          : section === 'reports'
            ? data.reports.map((r) => ({
                id: String(r.id),
                title: titleCaseOr(String(r.reason)),
                sub: `${String(r.target_type)} ${String(r.target_id)} · ${relTime(String(r.created_at))}`,
                badge: titleCaseOr(String(r.status)),
                tone: 'bad',
                raw: r,
                route: 'admin/reports',
                actions: [
                  { label: 'Resolve', body: { reportId: r.id, decision: 'RESOLVE', note } },
                  { label: 'Take action', body: { reportId: r.id, decision: 'ACTION', note } },
                  { label: 'Dismiss', body: { reportId: r.id, decision: 'DISMISS' }, quiet: true },
                ],
              }))
            : section === 'fraud'
              ? data.flags.map((f) => ({
                  id: String(f.id),
                  title: titleCaseOr(String(f.kind)),
                  sub: `${String(f.entity_type)} · score ${Number(f.score).toFixed(2)} · ${relTime(String(f.created_at))}`,
                  badge: titleCaseOr(String(f.severity)),
                  tone: String(f.severity) === 'HIGH' ? 'bad' : 'warn',
                  raw: f,
                  route: 'admin/flags',
                  actions: [
                    { label: 'Clear flag', body: { flagId: f.id, status: 'CLEARED' } },
                    { label: 'Action it', body: { flagId: f.id, status: 'ACTIONED', note } },
                  ],
                }))
              : section === 'orders'
                ? data.orders.map((o) => ({
                    id: String(o.id),
                    title: `${String(o.number)} · ${titleCaseOr(String(o.status))}`,
                    sub: `${String(o.business_name)} · ${money(Number(o.total_cents))} · escrow ${String(o.escrow_state).toLowerCase()}`,
                    badge: titleCaseOr(String(o.escrow_state)),
                    raw: o,
                    route: 'admin/orders',
                    actions: ['COMPLETED', 'REFUNDED', 'DISPUTED', 'CANCELLED'].map((s) => ({ label: `Move to ${titleCaseOr(s)}`, body: { orderId: o.id, status: s, note }, quiet: s !== 'COMPLETED' })),
                  }))
                : section === 'users'
                  ? data.users.map((u) => ({
                      id: String(u.id),
                      title: `${String(u.first_name)} ${String(u.last_name)}`,
                      sub: `${String(u.email)} · ${titleCaseOr(String(u.role))} · ${titleCaseOr(String(u.status))}`,
                      raw: u,
                      route: 'admin/users/status',
                      actions: [
                        { label: 'Suspend', body: { userId: u.id, status: 'SUSPENDED', reason: note || 'Policy review' } },
                        { label: 'Reinstate', body: { userId: u.id, status: 'ACTIVE' }, quiet: true },
                        { label: 'Ban', body: { userId: u.id, status: 'BANNED', reason: note || 'Confirmed violation' }, quiet: true },
                      ],
                    }))
                  : [];

  return (
    <div className="pb-8">
      <MobileHeader title="Admin desk" subtitle={queueCount ? `${queueCount} item(s) need a decision` : 'Queues are clear'} back="/profile" />

      <div className="hscroll flex gap-2 px-4 py-3">
        {SECTIONS.map((s) => (
          <Link key={s.key} href={s.key ? `/admin/${s.key}` : '/admin'} className={`chip shrink-0 py-2 ${section === s.key ? 'bg-[var(--ink)] text-white' : ''}`}>
            {s.label}
          </Link>
        ))}
      </div>

      {section === '' ? (
        <div className="space-y-2.5 px-4">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Live', data.kpis.live_listings],
              ['Pending', data.kpis.pending_listings, 'warn'],
              ['Reports', data.kpis.open_reports, 'bad'],
              ['Flags', data.kpis.open_flags, 'warn'],
              ['In flight', data.kpis.orders_in_flight],
              ['Escrow', money(data.kpis.escrow_cents)],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className={`card p-3.5 ${tone ? `tone-${tone}` : ''}`}>
                <p className="text-[11px] text-[var(--muted)]">{String(label)}</p>
                <p className="mt-1 text-[19px] font-semibold">
                  {typeof value === 'number' ? value.toLocaleString('en-US') : String(value)}
                </p>
              </div>
            ))}
          </div>
          <div className="card p-4">
            <p className="label">Rulebook coverage</p>
            <ul className="mt-2 space-y-1.5">
              {data.states.slice(0, 6).map((s) => (
                <li key={s.code} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium">{s.code}</span>
                  <span className="text-[var(--muted)]">
                    {s.prohibited} banned · {s.restricted} restricted · {s.listings} live
                  </span>
                </li>
              ))}
            </ul>
            {role === 'ADMIN' ? (
              <Link href="/admin/rules" className="btn btn-quiet btn-sm mt-3 w-full">
                <Icon name="scale" size={15} /> Rulebook editor
              </Link>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">Rulebook editing is reserved for administrators.</p>
            )}
          </div>
          <Link href="/admin/audit" className="card flex items-center gap-3 p-4 text-left">
            <Icon name="clock" size={17} className="text-[var(--accent-soft)]" />
            <span className="flex-1 text-[13.5px] font-medium">Audit log</span>
            <Icon name="chevronRight" size={15} className="text-[var(--muted)]" />
          </Link>
        </div>
      ) : section === 'rules' ? (
        <div className="px-4">
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            The rulebook editor is built for a wide screen — open FAUNAL on a desktop to add or change a rule. {data.rules.length} rules are recorded today.
          </p>
        </div>
      ) : section === 'audit' ? (
        <ul className="space-y-2 px-4">
          {data.audit.slice(0, 40).map((a) => (
            <li key={String(a.id)} className="card p-3.5">
              <p className="text-[13px] font-medium">{String(a.action)}</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                {String(a.created_at).slice(0, 16).replace('T', ' ')} · {String(a.first_name ?? 'system')} · {String(a.entity_type)}:{String(a.entity_id)}
              </p>
            </li>
          ))}
        </ul>
      ) : !list.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="check" title="Nothing waiting" body="This queue is clear right now." />
        </div>
      ) : (
        <ul className="space-y-2.5 px-4">
          {list.map((item) => (
            <li key={item.id}>
              <button className="card w-full p-3.5 text-left" onClick={() => setOpen(item.raw)}>
                <div className="flex items-start gap-3">
                  {section === 'listings' ? (
                    <Media media={{ path_medium: item.raw.image_medium as string, path_small: item.raw.image_small as string, base_path: null }} alt="" ratio="1 / 1" className="w-12 rounded-lg" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--muted)]">{item.sub}</span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      {item.badge ? <Badge tone={item.tone}>{item.badge}</Badge> : null}
                      {section === 'listings' ? <ComplianceBadge verdict={String(item.raw.compliance_status ?? 'REQUIRES_ADMIN_REVIEW')} /> : null}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={15} className="mt-1 shrink-0 text-[var(--muted)]" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title="Decision">
        <textarea className="textarea" rows={3} placeholder="Note to the seller (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-3 space-y-2">
          {(list.find((l) => l.raw === open)?.actions ?? []).map((a) => (
            <button key={a.label} className={`btn btn-block ${a.quiet ? 'btn-quiet' : ''}`} disabled={busy} onClick={() => { const item = list.find((l) => l.raw === open); if (item) run(item.route, a.body, `${a.label} recorded`); }}>
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
          Decisions are final on the marketplace side: approving a listing whose verdict is PROHIBITED is refused by the API, not just discouraged.
        </p>
      </Sheet>
    </div>
  );
}
