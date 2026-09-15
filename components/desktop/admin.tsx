'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Media, Money, Badge, EmptyState, ComplianceBadge, VerifiedMark, ErrorNote } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/interactions';
import { post, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { money, titleCaseOr, relTime } from '@/lib/ui/screen-helpers';

export type Row = Record<string, string | number | null>;

export interface AdminBundle {
  kpis: Record<string, number>;
  days: { day: string; orders: number; cents: number }[];
  byCategory: { name: string; listings: number; avg_price: number }[];
  states: { code: string; name: string; prohibited: number; restricted: number; listings: number }[];
  queue: { animal: Row; breeder: Row; flags: Row[]; documents: Row[]; check: Row | null }[];
  verifications: Row[];
  documents: Row[];
  reports: Row[];
  flags: Row[];
  users: Row[];
  orders: Row[];
  rules: Row[];
  audit: Row[];
  analytics: {
    funnel: Row[];
    topAnimals: Row[];
    conversion: Record<string, number>;
    complianceMix: { result: string; n: number }[];
  };
  species: { id: string; common_name: string }[];
  jurisdictions: { code: string; name: string }[];
}

export const ADMIN_SECTIONS = [
  { key: '', label: 'Overview', icon: 'grid' },
  { key: 'listings', label: 'Listing review', icon: 'paw' },
  { key: 'verifications', label: 'Breeders', icon: 'shield' },
  { key: 'documents', label: 'Documents', icon: 'doc' },
  { key: 'reports', label: 'Reports', icon: 'flag' },
  { key: 'fraud', label: 'Fraud signals', icon: 'alert' },
  { key: 'users', label: 'Users', icon: 'user' },
  { key: 'orders', label: 'Orders & escrow', icon: 'box' },
  { key: 'rules', label: 'Rulebook', icon: 'scale' },
  { key: 'analytics', label: 'Analytics', icon: 'chart' },
  { key: 'audit', label: 'Audit log', icon: 'clock' },
] as const;

function AdminShell({ section, children, wide = false }: { section: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[210px_minmax(0,1fr)] items-start gap-9">
        <nav className="sticky top-[86px]">
          <p className="label">Console</p>
          <ul className="mt-2 space-y-0.5">
            {ADMIN_SECTIONS.map((s) => {
              const active = (section || 'overview') === (s.key || 'overview');
              return (
                <li key={s.key}>
                  <Link
                    href={s.key ? `/admin/${s.key}` : '/admin'}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${active ? 'bg-[var(--surface-2)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'}`}
                  >
                    <Icon name={s.icon as IconName} size={16} />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-[11px] leading-relaxed text-[var(--muted)]">
            Every decision you take here is written to the audit log with your user id and the surface you used.
          </p>
        </nav>
        <div className={wide ? '' : 'space-y-5'}>{children}</div>
      </div>
    </div>
  );
}

function useDecision() {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(route: string, body: Record<string, unknown>, key: string, message: string) {
    setBusy(key);
    try {
      await post(route, body);
      toast(message, { tone: 'success' });
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Refused', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}

export function DesktopAdmin({ section, data, role }: { section: string; data: AdminBundle; role: string }) {
  const { run, busy } = useDecision();
  const [note, setNote] = useState<Record<string, string>>({});
  const [userQuery, setUserQuery] = useState('');
  const [ruleOpen, setRuleOpen] = useState(false);

  const kpi = (label: string, value: number | string, hint?: string, tone?: 'warn' | 'bad') => (
    <div key={label} className={`card p-5 ${tone ? `tone-${tone}` : ''}`}>
      <p className="label">{label}</p>
      <p className="h3 mt-1.5">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</p>
      {hint ? <p className="mt-1 text-[12px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );

  if (section === 'listings' || section === 'verifications' || section === 'documents' || section === 'reports' || section === 'fraud' || section === 'users' || section === 'orders' || section === 'rules') {
    return (
      <AdminShell section={section}>
        {section === 'listings' ? (
          <>
            <Header title="Listing review queue" sub={`${data.queue.length} listing(s) waiting. Approving re-runs the compliance engine; a PROHIBITED verdict cannot be approved.`} />
            {!data.queue.length ? <EmptyState icon="check" title="Queue is clear" body="No listing is waiting on a human right now." /> : null}
            {data.queue.map(({ animal, breeder, flags, documents, check }) => (
              <article key={String(animal.id)} className="card p-6">
                <div className="flex items-start gap-5">
                  <Media media={{ path_medium: animal.image_medium as string, path_small: animal.image_small as string, base_path: null }} alt={String(animal.name)} ratio="1 / 1" className="w-28 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium">
                      <Link href={`/animals/${String(animal.slug)}`} className="hover:underline">
                        {String(animal.name)}
                      </Link>
                      <span className="text-[13px] font-normal text-[var(--muted)]">{String(animal.species_name)}</span>
                      <ComplianceBadge verdict={String(animal.compliance_status ?? 'REQUIRES_ADMIN_REVIEW')} />
                      <Badge tone="quiet">{titleCaseOr(String(animal.status))}</Badge>
                    </p>
                    <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                      {String(breeder.business_name)} · {String(breeder.city)}, {String(breeder.state)} · tier {titleCaseOr(String(breeder.tier))} ·{' '}
                      <VerifiedMark tier={String(breeder.tier)} />
                    </p>
                    <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[var(--muted)]">{String(animal.description ?? '')}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Badge icon="dollar">{money(Number(animal.price_cents))}</Badge>
                      <Badge icon="eye">{Number(animal.view_count)} views</Badge>
                      <Badge icon="doc">{documents.length} document(s)</Badge>
                      {flags.length ? <Badge tone="bad" icon="alert">{flags.length} fraud flag(s)</Badge> : null}
                    </div>
                    {check ? (
                      <ul className="mt-3 space-y-1.5 rounded-lg bg-[var(--surface-2)] p-3">
                        <li className="text-[12px] text-[var(--muted)]">
                          evaluated {relTime(String(check.evaluated_at))} · decision {String(check.decision ?? 'none yet')}
                        </li>
                        {(((check.matched_rules as unknown as Row[]) ?? []) as Row[]).slice(0, 4).map((r) => (
                          <li key={String(r.id)} className="text-[12px] leading-relaxed">
                            <span className="font-medium">{String(r.label)}</span> — {String(r.detail)}
                            {r.citation ? <span className="mono text-[11px] text-[var(--muted)]"> · {String(r.citation)}</span> : null}
                          </li>
                        ))}
                        {(((check.required_documents as unknown as string[]) ?? []) as string[]).length ? (
                          <li className="text-[12px] text-[var(--muted)]">needs: {((check.required_documents as unknown as string[]) as string[]).map((d) => titleCaseOr(d)).join(', ')}</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                  <div className="w-[240px] shrink-0 space-y-2">
                    <textarea className="textarea" rows={2} placeholder="Note (goes to the seller)" value={note[String(animal.id)] ?? ''} onChange={(e) => setNote({ ...note, [String(animal.id)]: e.target.value })} />
                    <button className="btn btn-sm btn-block" disabled={busy === String(animal.id)} onClick={() => run('admin/listings', { animalId: animal.id, decision: 'APPROVE', note: note[String(animal.id)] }, String(animal.id), 'Listing approved')}>
                      Approve
                    </button>
                    <button className="btn btn-quiet btn-sm btn-block" disabled={busy === `r${String(animal.id)}`} onClick={() => run('admin/listings', { animalId: animal.id, decision: 'NEEDS_DOCS', note: note[String(animal.id)] }, `r${String(animal.id)}`, 'Sent back for documents')}>
                      Request documents
                    </button>
                    <button className="btn btn-quiet btn-sm btn-block" disabled={busy === `x${String(animal.id)}`} onClick={() => run('admin/listings', { animalId: animal.id, decision: 'REJECT', note: note[String(animal.id)] }, `x${String(animal.id)}`, 'Listing rejected')}>
                      Reject
                    </button>
                    <button className="btn btn-danger btn-sm btn-block" disabled={busy === `s${String(animal.id)}`} onClick={() => run('admin/listings', { animalId: animal.id, decision: 'SUSPEND', note: note[String(animal.id)] }, `s${String(animal.id)}`, 'Listing suspended')}>
                      Suspend
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </>
        ) : null}

        {section === 'verifications' ? (
          <>
            <Header title="Breeder verification" sub="Approving a verification flips the tier, marks pending documents verified and auto-publishes listings whose verdict is clean." />
            {!data.verifications.length ? <EmptyState icon="shield" title="No pending verifications" body="Every applicant has been decided." /> : null}
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-[.08em] text-[var(--muted)]">
                <tr>
                  <th className="py-2 font-medium">Breeder</th>
                  <th className="py-2 font-medium">Requested</th>
                  <th className="py-2 font-medium">Documents</th>
                  <th className="py-2 font-medium">Submitted</th>
                  <th className="py-2 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.verifications.map((v) => (
                  <tr key={String(v.id)}>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{String(v.business_name)}</p>
                      <p className="text-[12px] text-[var(--muted)]">
                        {String(v.city)}, {String(v.state)} · {String(v.license_number ?? 'no licence number')}
                      </p>
                    </td>
                    <td className="py-3 pr-3">{titleCaseOr(String(v.requested_tier))}</td>
                    <td className="py-3 pr-3 text-[12px] text-[var(--muted)]">
                      {((v.documents as unknown as Row[]) ?? []).map((d) => titleCaseOr(String(d.doc_type))).join(', ') || '—'}
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-[var(--muted)]">{relTime(String(v.submitted_at))}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button className="btn btn-sm" disabled={busy === String(v.id)} onClick={() => run('admin/verification', { verificationId: v.id, decision: 'APPROVE' }, String(v.id), 'Breeder approved')}>
                          Approve
                        </button>
                        <button className="btn btn-quiet btn-sm" disabled={busy === `n${String(v.id)}`} onClick={() => run('admin/verification', { verificationId: v.id, decision: 'REJECT', note: 'Documents unreadable' }, `n${String(v.id)}`, 'Applicant rejected')}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card p-5">
              <p className="label">Tier adjustments</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">Granting a tier by hand is reserved for partner onboarding; it is audited like every other decision.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.states.length ? null : null}
                {['BREEDER', 'VERIFIED_BREEDER', 'PARTNER_BREEDER'].map((t) => (
                  <Badge key={t}>{titleCaseOr(t)}</Badge>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {section === 'documents' ? (
          <>
            <Header title="Document review" sub="Pending uploads first. Verifying a document releases the listings that were waiting on it." />
            <ul className="space-y-2.5">
              {data.documents.map((d) => (
                <li key={String(d.id)} className="card flex items-center gap-4 p-4">
                  <Icon name="doc" size={18} className="shrink-0 text-[var(--accent-soft)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {titleCaseOr(String(d.doc_type))} · {String(d.animal_name ?? d.business_name ?? 'account document')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                      {String(d.filename)} · uploaded {relTime(String(d.uploaded_at))}
                      {d.expires_at ? ` · expires ${String(d.expires_at).slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <ComplianceBadge verdict={String(d.status) === 'VERIFIED' ? 'ALLOWED' : String(d.status) === 'PENDING' ? 'REQUIRES_DOCUMENTATION' : 'PROHIBITED'} label={titleCaseOr(String(d.status))} />
                  <div className="flex gap-1.5">
                    <button className="btn btn-sm" disabled={busy === String(d.id)} onClick={() => run('admin/documents', { documentId: d.id, decision: 'VERIFIED' }, String(d.id), 'Document verified')}>
                      Verify
                    </button>
                    <button className="btn btn-quiet btn-sm" disabled={busy === `n${String(d.id)}`} onClick={() => run('admin/documents', { documentId: d.id, decision: 'REJECTED', note: 'Illegible or expired' }, `n${String(d.id)}`, 'Document rejected')}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
              {!data.documents.length ? <EmptyState icon="doc" title="Nothing to review" body="No document is waiting." /> : null}
            </ul>
          </>
        ) : null}

        {section === 'reports' ? (
          <>
            <Header title="User reports" sub="Reports come from buyers, sellers and the automated detectors (stolen images, off-platform payment requests)." />
            <ul className="space-y-2.5">
              {data.reports.map((r) => (
                <li key={String(r.id)} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13.5px] font-medium">
                        {titleCaseOr(String(r.reason))}
                        <Badge tone="quiet">
                          {String(r.target_type)} · {String(r.target_id)}
                        </Badge>
                        <Badge>{titleCaseOr(String(r.status))}</Badge>
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{String(r.details ?? 'No further detail supplied.')}</p>
                      <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">
                        {String(r.reporter_name ?? 'reporter')} · {relTime(String(r.created_at))}
                        {r.resolution ? ` · ${String(r.resolution)}` : ''}
                      </p>
                    </div>
                    {String(r.status) === 'OPEN' ? (
                      <div className="flex shrink-0 gap-1.5">
                        <button className="btn btn-sm" disabled={busy === String(r.id)} onClick={() => run('admin/reports', { reportId: r.id, decision: 'RESOLVE', note: note[String(r.id)] }, String(r.id), 'Report resolved')}>
                          Resolve
                        </button>
                        <button className="btn btn-quiet btn-sm" disabled={busy === `a${String(r.id)}`} onClick={() => run('admin/reports', { reportId: r.id, decision: 'ACTION', note: note[String(r.id)] }, `a${String(r.id)}`, 'Action taken against target')}>
                          Take action
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === `d${String(r.id)}`} onClick={() => run('admin/reports', { reportId: r.id, decision: 'DISMISS' }, `d${String(r.id)}`, 'Report dismissed')}>
                          Dismiss
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
              {!data.reports.length ? <EmptyState icon="flag" title="No open reports" body="Nothing is waiting on the desk." /> : null}
            </ul>
          </>
        ) : null}

        {section === 'fraud' ? (
          <>
            <Header title="Anti-fraud signals" sub="Duplicate image hashes, reused device fingerprints, suspicious pricing and multi-account detection." />
            <ul className="space-y-2.5">
              {data.flags.map((f) => (
                <li key={String(f.id)} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13.5px] font-medium">
                        {titleCaseOr(String(f.kind))}
                        <Badge tone={String(f.severity) === 'HIGH' ? 'bad' : String(f.severity) === 'MEDIUM' ? 'warn' : 'quiet'}>{titleCaseOr(String(f.severity))}</Badge>
                        <span className="mono text-[12px] text-[var(--muted)]">score {Number(f.score).toFixed(2)}</span>
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--muted)]">
                        {String(f.entity_type)} · {String(f.entity_id)} · {relTime(String(f.created_at))}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {((f.signals as unknown as Row[]) ?? []).map((s, i) => (
                          <li key={i} className="text-[12px] leading-relaxed text-[var(--muted)]">
                            · {String(s.note ?? JSON.stringify(s))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button className="btn btn-sm" disabled={busy === String(f.id)} onClick={() => run('admin/flags', { flagId: f.id, status: 'CLEARED' }, String(f.id), 'Flag cleared')}>
                        Clear
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={busy === `a${String(f.id)}`} onClick={() => run('admin/flags', { flagId: f.id, status: 'ACTIONED', note: note[String(f.id)] }, `a${String(f.id)}`, 'Flag actioned')}>
                        Action
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {!data.flags.length ? <EmptyState icon="shield" title="No open flags" body="The detectors are quiet." /> : null}
            </ul>
          </>
        ) : null}

        {section === 'users' ? (
          <>
            <div className="flex items-end justify-between gap-6">
              <Header title="Users" sub="Suspending an account kills its sessions immediately; banning keeps the compliance record." />
              <div className="flex h-10 w-[260px] items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3">
                <Icon name="search" size={15} className="text-[var(--muted)]" />
                <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder="name or email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                <Link href={`/admin/users?q=${encodeURIComponent(userQuery)}`} className="btn btn-sm">
                  Search
                </Link>
              </div>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-[.08em] text-[var(--muted)]">
                <tr>
                  <th className="py-2 font-medium">Account</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">State</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.users.map((u) => (
                  <tr key={String(u.id)}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{String(u.first_name)} {String(u.last_name)}</p>
                      <p className="mono text-[11.5px] text-[var(--muted)]">{String(u.email)}</p>
                    </td>
                    <td className="py-2.5 pr-3">{titleCaseOr(String(u.role))}</td>
                    <td className="py-2.5 pr-3">{String(u.jurisdiction_code ?? '—')}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={String(u.status) === 'ACTIVE' ? 'ok' : String(u.status) === 'BANNED' ? 'bad' : 'warn'}>{titleCaseOr(String(u.status))}</Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {String(u.status) !== 'SUSPENDED' ? (
                          <button className="btn btn-quiet btn-sm" disabled={busy === String(u.id)} onClick={() => run('admin/users/status', { userId: u.id, status: 'SUSPENDED', reason: note[String(u.id)] ?? 'Policy review' }, String(u.id), 'Account suspended')}>
                            Suspend
                          </button>
                        ) : (
                          <button className="btn btn-sm" disabled={busy === String(u.id)} onClick={() => run('admin/users/status', { userId: u.id, status: 'ACTIVE' }, String(u.id), 'Account reinstated')}>
                            Reinstate
                          </button>
                        )}
                        <button className="btn btn-danger btn-sm" disabled={busy === `b${String(u.id)}`} onClick={() => run('admin/users/status', { userId: u.id, status: 'BANNED', reason: note[String(u.id)] ?? 'Confirmed violation' }, `b${String(u.id)}`, 'Account banned')}>
                          Ban
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {section === 'orders' ? (
          <>
            <Header title="Orders & escrow" sub="Staff can force a transition where a dispute needs it — every one is audited with the reason." />
            <ul className="space-y-2.5">
              {data.orders.map((o) => (
                <li key={String(o.id)} className="card flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13.5px] font-medium">
                      <span className="mono">{String(o.number)}</span>
                      <Badge tone={String(o.escrow_state) === 'RELEASED' ? 'ok' : String(o.escrow_state) === 'DISPUTED' ? 'bad' : 'warn'}>escrow {String(o.escrow_state).toLowerCase()}</Badge>
                      <Badge>{titleCaseOr(String(o.status))}</Badge>
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--muted)]">
                      {String(o.first_name)} {String(o.last_name)} ({String(o.buyer_email)}) · {String(o.business_name)} · payment{' '}
                      {titleCaseOr(String(o.payment_status ?? '—'))} · shipping {titleCaseOr(String(o.shipping_status ?? '—'))}
                    </p>
                  </div>
                  <Money cents={Number(o.total_cents)} size="sm" />
                  <div className="flex w-[220px] shrink-0 gap-1.5">
                    <select className="select h-9 flex-1 text-[12.5px]" onChange={(e) => e.target.value && run('admin/orders', { orderId: o.id, status: e.target.value, note: note[String(o.id)] }, String(o.id), `Order set to ${e.target.value.toLowerCase()}`)} defaultValue="">
                      <option value="" disabled>
                        Move order to…
                      </option>
                      {['PAID', 'BREEDER_CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CANCELLED'].map((s) => (
                        <option key={s} value={s}>
                          {titleCaseOr(s)}
                        </option>
                      ))}
                    </select>
                    <Link href={`/orders/${String(o.id)}`} className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  </div>
                </li>
              ))}
              {!data.orders.length ? <EmptyState icon="box" title="No orders in this view" body="Switch the scope filter to see disputes or escrow." /> : null}
            </ul>
          </>
        ) : null}

        {section === 'rules' ? (
          <>
            <div className="flex items-end justify-between gap-6">
              <Header title="Rulebook" sub={`${data.rules.length} recorded rules. Editing one re-evaluates only future checks; existing orders keep their frozen snapshot.`} />
              {role === 'ADMIN' ? (
                <button className="btn btn-sm" onClick={() => setRuleOpen(true)}>
                  <Icon name="plus" size={15} /> New rule
                </button>
              ) : (
                <Badge tone="warn">moderators read rules only</Badge>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-[var(--surface-2)] text-[11px] uppercase tracking-[.08em] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Species</th>
                    <th className="px-4 py-2.5 font-medium">Jurisdiction</th>
                    <th className="px-4 py-2.5 font-medium">Verdict</th>
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                    <th className="px-4 py-2.5 font-medium">Citation</th>
                    <th className="px-4 py-2.5 font-medium">Limits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {data.rules.map((r) => (
                    <tr key={String(r.id)}>
                      <td className="px-4 py-2.5 font-medium">{String(r.species_name)}</td>
                      <td className="px-4 py-2.5">{String(r.jurisdiction_code)}</td>
                      <td className="px-4 py-2.5">
                        <ComplianceBadge verdict={String(r.status)} />
                      </td>
                      <td className="max-w-[320px] px-4 py-2.5 text-[var(--muted)]">{String(r.reason)}</td>
                      <td className="mono px-4 py-2.5 text-[11.5px]">{String(r.citation ?? '—')}</td>
                      <td className="px-4 py-2.5 text-[11.5px] text-[var(--muted)]">
                        {r.permit_class ? `permit ${String(r.permit_class)}` : ''}
                        {r.max_specimens ? ` · max ${String(r.max_specimens)}` : ''}
                        {Number(r.requires_admin_review) ? ' · human review' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {ruleOpen ? (
              <RuleForm
                species={data.species}
                jurisdictions={data.jurisdictions}
                busy={busy === 'rule'}
                onClose={() => setRuleOpen(false)}
                onSave={(body) => run('admin/rules', body, 'rule', 'Rule saved — the engine uses it from now on')}
              />
            ) : null}
          </>
        ) : null}
      </AdminShell>
    );
  }

  if (section === 'analytics') {
    const mix = data.analytics.complianceMix;
    const totalMix = Math.max(1, mix.reduce((n, m) => n + m.n, 0));
    return (
      <AdminShell section={section}>
        <Header title="Marketplace analytics" sub="Behaviour events, conversion and the verdict mix across all checks." />
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-5">
            <p className="label">Funnel</p>
            <ul className="mt-2.5 space-y-2">
              {data.analytics.funnel.map((f) => (
                <li key={String(f.kind)} className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--muted)]">{titleCaseOr(String(f.kind))}</span>
                  <span className="mono">{Number(f.n).toLocaleString('en-US')}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-5">
            <p className="label">Conversion</p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
              {Number(data.analytics.conversion.views).toLocaleString('en-US')} listing views → {Number(data.analytics.conversion.carts).toLocaleString('en-US')} carts →{' '}
              {Number(data.analytics.conversion.orders).toLocaleString('en-US')} orders.
            </p>
            <p className="mt-2 text-[12px] text-[var(--muted)]">
              Cart-to-order {Number(data.analytics.conversion.carts) ? ((Number(data.analytics.conversion.orders) / Number(data.analytics.conversion.carts)) * 100).toFixed(1) : '0.0'}%
            </p>
          </div>
          <div className="card p-5">
            <p className="label">Verdict mix</p>
            <ul className="mt-2.5 space-y-1.5">
              {mix.map((m) => (
                <li key={m.result} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-[130px] shrink-0">{titleCaseOr(m.result)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <span className="block h-full rounded-full bg-[var(--ink)]" style={{ width: `${(m.n / totalMix) * 100}%` }} />
                  </span>
                  <span className="mono w-[42px] text-right">{m.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card p-5">
          <p className="label">Most-viewed animals</p>
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {data.analytics.topAnimals.map((a) => (
              <li key={String(a.id)} className="flex items-center gap-3">
                <Media media={{ path_medium: a.image_medium as string, path_small: a.image_small as string, base_path: null }} alt={String(a.name)} ratio="1 / 1" className="w-11 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <Link href={`/animals/${String(a.slug)}`} className="block truncate text-[13px] font-medium hover:underline">
                    {String(a.name)}
                  </Link>
                  <span className="block text-[11.5px] text-[var(--muted)]">{Number(a.view_count)} views · {money(Number(a.price_cents))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </AdminShell>
    );
  }

  if (section === 'audit') {
    return (
      <AdminShell section={section}>
        <Header title="Audit log" sub="Every privileged action: decisions, document views, status changes, sign-ins." />
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full text-left text-[12.5px]">
            <tbody className="divide-y divide-[var(--line)]">
              {data.audit.map((a) => (
                <tr key={String(a.id)}>
                  <td className="w-[190px] px-4 py-2 align-top text-[var(--muted)]">{String(a.created_at).slice(0, 19).replace('T', ' ')}</td>
                  <td className="w-[170px] px-4 py-2 align-top font-medium">{String(a.action)}</td>
                  <td className="w-[150px] px-4 py-2 align-top text-[var(--muted)]">
                    {String(a.first_name ?? 'system')} {String(a.last_name ?? '')}
                  </td>
                  <td className="px-4 py-2 align-top mono text-[11.5px] text-[var(--muted)]">
                    {String(a.entity_type)}:{String(a.entity_id)}
                  </td>
                  <td className="px-4 py-2 align-top text-[var(--muted)]">{String(a.metadata ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminShell>
    );
  }

  const k = data.kpis;
  const max = Math.max(1, ...data.days.map((d) => Number(d.cents)));
  return (
    <AdminShell section={section}>
      <div className="flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Trust, compliance &amp; commerce</p>
          <h1 className="h2 mt-1.5">Console</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Live counters from the same tables the engine writes to. Nothing here is decorative.</p>
        </div>
        <Link href="/animals?status=PENDING_REVIEW" className="btn btn-quiet btn-sm">
          See queue on the storefront
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {kpi('Live listings', k.live_listings, 'approved and available')}
        {kpi('Awaiting review', k.pending_listings, 'human decision needed', k.pending_listings ? 'warn' : undefined)}
        {kpi('Verifications', k.pending_verifications, 'breeder applications', k.pending_verifications ? 'warn' : undefined)}
        {kpi('Open reports', k.open_reports, 'trust & safety', k.open_reports ? 'bad' : undefined)}
        {kpi('Fraud flags', k.open_flags, 'detector output', k.open_flags ? 'warn' : undefined)}
        {kpi('Compliance backlog', k.compliance_backlog, 'unreviewed checks')}
        {kpi('Orders in flight', k.orders_in_flight, 'paid → delivered')}
        {kpi('New accounts (7d)', k.new_users_7d, `${k.users} total · ${k.breeders} breeders`)}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
        <div className="space-y-5">
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <p className="label">GMV, last 30 days</p>
              <span className="text-[12.5px] text-[var(--muted)]">
                <span className="mono">{money(k.gmv_cents)}</span> total · <span className="mono">{money(k.fee_cents)}</span> commission
              </span>
            </div>
            {data.days.length ? (
              <div className="mt-5 flex h-36 items-end gap-1.5">
                {data.days.map((d) => (
                  <div key={d.day} className="group flex flex-1 flex-col items-center gap-1.5" title={`${d.day}: ${money(d.cents)}`}>
                    <span className="w-full rounded-t bg-[var(--ink)] group-hover:bg-[var(--accent-soft)]" style={{ height: `${Math.max(4, (Number(d.cents) / max) * 100)}%` }} />
                    <span className="text-[9.5px] text-[var(--muted)]">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--muted)]">No orders in the window.</p>
            )}
            <div className="mt-5 flex gap-6 border-t border-[var(--line)] pt-4 text-[12.5px]">
              <span className="text-[var(--muted)]">
                Escrow held <span className="mono text-[var(--ink)]">{money(k.escrow_cents)}</span>
              </span>
              <span className="text-[var(--muted)]">
                Paid out <span className="mono text-[var(--ink)]">{money(k.paid_out_cents)}</span>
              </span>
            </div>
          </section>

          <section className="card p-6">
            <p className="label">Category mix</p>
            <ul className="mt-3 space-y-2">
              {data.byCategory.map((c) => (
                <li key={c.name} className="flex items-center gap-3 text-[13px]">
                  <span className="w-[170px] shrink-0">{c.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <span className="block h-full rounded-full bg-[var(--ink)]" style={{ width: `${(c.listings / Math.max(1, data.byCategory[0].listings)) * 100}%` }} />
                  </span>
                  <span className="mono w-[110px] text-right text-[12px] text-[var(--muted)]">
                    {c.listings} · {money(Math.round(c.avg_price))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="card p-6">
          <p className="label">Rulebook coverage</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--surface-2)] text-[10.5px] uppercase tracking-[.06em] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 text-right font-medium">Ban</th>
                  <th className="px-3 py-2 text-right font-medium">Restr.</th>
                  <th className="px-3 py-2 text-right font-medium">Live</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.states.map((s) => (
                  <tr key={s.code}>
                    <td className="px-3 py-1.5 font-medium">{s.code}</td>
                    <td className={`px-3 py-1.5 text-right ${s.prohibited ? 'text-[var(--error)]' : 'text-[var(--muted)]'}`}>{s.prohibited}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--muted)]">{s.restricted}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--muted)]">{s.listings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/admin/rules" className="btn btn-quiet btn-sm mt-4 w-full">
            Edit the rulebook
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="border-b border-[var(--line)] pb-4">
      <h1 className="h2">{title}</h1>
      <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-[var(--muted)]">{sub}</p>
    </header>
  );
}

function RuleForm({
  species,
  jurisdictions,
  busy,
  onClose,
  onSave,
}: {
  species: { id: string; common_name: string }[];
  jurisdictions: { code: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({ speciesId: species[0]?.id ?? '', jurisdictionCode: 'NY', status: 'RESTRICTED', reason: '', citation: '', permitClass: '', maxSpecimens: '', requiresAdminReview: false });
  return (
    <Modal title="New rule" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Species</span>
          <select className="select mt-1 h-11" value={f.speciesId} onChange={(e) => setF({ ...f, speciesId: e.target.value })}>
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.common_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Jurisdiction</span>
          <select className="select mt-1 h-11" value={f.jurisdictionCode} onChange={(e) => setF({ ...f, jurisdictionCode: e.target.value })}>
            {jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name} ({j.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Verdict</span>
          <select className="select mt-1 h-11" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {['ALLOWED', 'RESTRICTED', 'REQUIRES_DOCUMENTATION', 'REQUIRES_ADMIN_REVIEW', 'PROHIBITED'].map((v) => (
              <option key={v} value={v}>
                {titleCaseOr(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Max specimens (optional)</span>
          <input className="input mt-1 h-11" inputMode="numeric" value={f.maxSpecimens} onChange={(e) => setF({ ...f, maxSpecimens: e.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="label">Reason (shown to sellers and buyers)</span>
        <textarea className="textarea mt-1" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Citation</span>
          <input className="input mt-1 h-11" value={f.citation} onChange={(e) => setF({ ...f, citation: e.target.value })} placeholder="NY Env. Conserv. Law §11-0535" />
        </label>
        <label className="block">
          <span className="label">Permit class</span>
          <input className="input mt-1 h-11" value={f.permitClass} onChange={(e) => setF({ ...f, permitClass: e.target.value })} placeholder="RESTRICTED_SPECIES" />
        </label>
      </div>
      <label className="check mt-3">
        <input type="checkbox" checked={f.requiresAdminReview} onChange={(e) => setF({ ...f, requiresAdminReview: e.target.checked })} />
        <span className="text-[13px]">Always require a human review for this pairing</span>
      </label>
      {!f.reason ? <ErrorNote tone="warn">A rule without a stated reason is not saved — buyers see this text.</ErrorNote> : null}
      <button
        className="btn btn-block mt-4"
        disabled={busy || !f.reason || !f.speciesId}
        onClick={() => {
          onSave({
            speciesId: f.speciesId,
            jurisdictionCode: f.jurisdictionCode,
            status: f.status,
            reason: f.reason,
            citation: f.citation || undefined,
            permitClass: f.permitClass || undefined,
            maxSpecimens: f.maxSpecimens ? Number(f.maxSpecimens) : null,
            requiresAdminReview: f.requiresAdminReview,
          });
          onClose();
        }}
      >
        Save rule
      </button>
    </Modal>
  );
}
