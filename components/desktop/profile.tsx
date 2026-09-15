'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Media, Badge, Money, EmptyState, VerifiedMark, DataRow, StatBlock, Section, ErrorNote } from '@/components/ui/primitives';
import { Modal, ReportDialog } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { del, patch, post, ApiError } from '@/lib/ui/api';
import { relTime, titleCaseOr, money } from '@/lib/ui/screen-helpers';
import { DEMO_PASSWORD } from '@/components/shared/auth-form';

export type Row = Record<string, string | number | null>;

export interface AccountData {
  account: Row;
  profile: Row;
  stats: { favorites: number; followed: number; orders: number; cart: number; documents: number };
  reviews: { count: number; avg: number };
  breeder: Row | null;
  addresses: Row[];
  methods: Row[];
  documents: Row[];
  sessions: Row[];
  prefs: Record<string, boolean>;
  states: { code: string; name: string; rules: number; animals: number }[];
  recentOrders: Row[];
  twoFactor: boolean;
  locale: string;
  currency: string;
  email: string;
}

export const SECTIONS = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'security', label: 'Security', icon: 'lock' },
  { key: 'addresses', label: 'Address book', icon: 'location' },
  { key: 'payment', label: 'Payment', icon: 'card' },
  { key: 'documents', label: 'Documents', icon: 'doc' },
  { key: 'alerts', label: 'Notifications & locale', icon: 'bell' },
] as const;

/* --------------------------------------------------------------- dashboard */

export function DesktopProfile({ data }: { data: AccountData }) {
  const { user, badges } = useApp();
  const a = data.account;
  const isSeller = !!data.breeder;
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  return (
    <div className="shell py-8">
      <div className="flex items-start justify-between gap-8 border-b border-[var(--line)] pb-6">
        <div className="flex items-start gap-4">
          <Media media={{ path_medium: a.avatar_path ? String(a.avatar_path) : null, base_path: null }} alt="" ratio="1 / 1" className="h-16 w-16 rounded-full border border-[var(--line)]" />
          <div>
            <p className="eyebrow">Account</p>
            <h1 className="h2 mt-1 flex items-center gap-2">
              {String(a.first_name)} {String(a.last_name)}
              <Badge>{titleCaseOr(String(a.role))}</Badge>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {data.email} · ship to {String(a.jurisdiction_code ?? 'unset')} · member since {String(a.created_at).slice(0, 7)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/profile/settings" className="btn btn-quiet btn-sm">
            <Icon name="gear" size={15} /> Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              className="btn btn-ghost btn-sm"
              onClick={async (e) => {
                e.preventDefault();
                await post('auth/logout', {});
                window.location.href = '/';
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatBlock label="Orders" value={data.stats.orders} hint="escrow-protected" />
        <StatBlock label="Favorites" value={data.stats.favorites} hint="watched listings" />
        <StatBlock label="Unread" value={badges.unreadMessages} hint="breeder messages" />
        <StatBlock label="Documents" value={data.stats.documents} hint="private vault" />
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-8">
        <div className="space-y-5">
          <Section
            title="Recent orders"
            action={
              <Link href="/orders" className="btn btn-ghost btn-sm">
                All orders <Icon name="chevronRight" size={14} />
              </Link>
            }
          >
            {data.recentOrders.length ? (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {data.recentOrders.map((o) => (
                <li key={String(o.id)} className="flex items-center gap-4 p-4">
                  <Media media={{ path_medium: o.image as string, path_small: o.image as string, base_path: null }} alt="" ratio="1 / 1" className="w-12 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/orders/${String(o.id)}`} className="text-[14px] font-medium hover:underline">
                      {String(o.first_animal ?? o.number)}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                      <span className="mono">{String(o.number)}</span> · {String(o.business_name)} · {relTime(String(o.placed_at))}
                    </p>
                  </div>
                  <Badge tone={String(o.status) === 'COMPLETED' ? 'ok' : String(o.status) === 'DISPUTED' ? 'bad' : 'quiet'}>{titleCaseOr(String(o.status))}</Badge>
                  <Money cents={Number(o.total_cents)} size="sm" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="box" title="No orders yet" body="When you check out, tracking, paperwork and escrow show up here." action={<Link href="/animals" className="btn btn-sm">Browse animals</Link>} />
          )}
          </Section>

          <Section title="Quick actions">
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['/animals', 'compass', 'Browse animals', 'Every listing checked against your state'],
                  ['/favorites', 'heart', 'Favorites', `${data.stats.favorites} saved listings`],
                  ['/messages', 'chat', 'Messages', `${badges.unreadMessages} unread`],
                  ['/checkout', 'cart', 'Resume checkout', `${data.stats.cart} items in cart`],
                  ['/assistant', 'sparkle', 'Ask the assistant', 'Plain-language search and advice'],
                  ['/profile/documents', 'lock', 'Document vault', `${data.stats.documents} files, private`],
                ] as const
              ).map(([href, icon, title, hint]) => (
                <Link key={href} href={href} className="group-card flex items-start gap-3 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)]">
                    <Icon name={icon} size={17} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium">{title}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          {isSeller ? (
            <div className="card p-6">
              <p className="label">Seller tools</p>
              <p className="mt-2 flex items-center gap-1.5 text-[15px] font-medium">
                {String(data.breeder!.business_name)} <VerifiedMark tier={String(data.breeder!.tier)} />
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                {titleCaseOr(String(data.breeder!.status))} · {String(data.breeder!.tier).replace(/_/g, ' ').toLowerCase()} · {Number(data.breeder!.transactions_count)} transfers
              </p>
              <div className="mt-4 space-y-2">
                <Link href="/seller" className="btn btn-block btn-sm">
                  Dashboard
                </Link>
                <Link href="/seller/listings/new" className="btn btn-quiet btn-block btn-sm">
                  Add an animal
                </Link>
                <Link href="/seller/orders" className="btn btn-quiet btn-block btn-sm">
                  Orders to fulfil
                </Link>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <p className="label">Sell on FAUNAL</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                Verified breeders list with paperwork, escrow payouts and a public storefront. Application takes about ten minutes.
              </p>
              <Link href="/become-a-breeder" className="btn btn-block btn-sm mt-4">
                Apply as a breeder
              </Link>
            </div>
          )}

          {isStaff ? (
            <div className="card p-6">
              <p className="label">Trust &amp; compliance</p>
              <div className="mt-3 space-y-2">
                <Link href="/admin" className="btn btn-block btn-sm">
                  Admin console
                </Link>
                <Link href="/admin/rules" className="btn btn-quiet btn-block btn-sm">
                  Rulebook editor
                </Link>
              </div>
            </div>
          ) : null}

          <div className="card p-6">
            <p className="label">Account</p>
            <div className="mt-3 space-y-2.5">
              <DataRow label="Email" value={data.email} />
              <DataRow label="Shipping state" value={String(a.jurisdiction_code ?? '—')} />
              <DataRow label="Currency" value={data.currency} />
              <DataRow label="Language" value={data.locale.toUpperCase()} />
              <DataRow label="Two-factor" value={data.twoFactor ? 'Enabled' : 'Off'} />
              <DataRow label="Age confirmed" value={a.age_confirmed_at ? String(a.age_confirmed_at).slice(0, 10) : 'Not yet'} />
            </div>
            <ReportDialog targetType="USER" targetId={String(a.id)}>
              <button className="btn btn-ghost btn-sm mt-4 w-full">
                <Icon name="flag" size={14} /> Report an issue
              </button>
            </ReportDialog>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

export function DesktopAccount({ section, data }: { section: string; data: AccountData }) {
  const [draft, setDraft] = useState<Row>({
    firstName: data.account.first_name,
    lastName: data.account.last_name,
    email: data.email,
    phone: data.account.phone ?? '',
    city: data.profile?.public_city ?? '',
    state: String(data.account.jurisdiction_code ?? 'NY'),
    bio: data.profile?.bio ?? '',
  });
  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-10">
        <nav className="sticky top-[86px]">
          <p className="label">Settings</p>
          <ul className="mt-2 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <Link
                  href={`/profile/${s.key === 'profile' ? 'settings' : s.key}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${section === s.key ? 'bg-[var(--surface-2)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'}`}
                >
                  <Icon name={s.icon as 'user'} size={16} /> {s.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/profile" className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-[var(--muted)] hover:bg-[var(--surface-2)]">
                <Icon name="back" size={16} /> Account overview
              </Link>
            </li>
          </ul>
        </nav>

        <div className="space-y-5">
          {section === 'profile' ? <ProfileForm draft={draft} setDraft={setDraft} states={data.states} /> : null}
          {section === 'security' ? <Security data={data} /> : null}
          {section === 'addresses' ? <Addresses rows={data.addresses} /> : null}
          {section === 'payment' ? <Payment rows={data.methods} /> : null}
          {section === 'documents' ? <Documents rows={data.documents} /> : null}
          {section === 'alerts' ? <Alerts prefs={data.prefs} locale={data.locale} currency={data.currency} /> : null}
          <DangerZone />
        </div>
      </div>
    </div>
  );
}

function useSave() {
  const { toast, refresh } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast(message, { tone: 'success' });
      refresh();
      router.refresh();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That did not work', { tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

function ProfileForm({
  draft,
  setDraft,
  states,
}: {
  draft: Row;
  setDraft: (v: Row) => void;
  states: { code: string; name: string; rules: number; animals: number }[];
}) {
  const { run, busy } = useSave();
  const field = (k: string) => String(draft[k] ?? '');
  return (
    <section className="card p-6">
      <p className="label">Your details</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(
          [
            ['firstName', 'First name'],
            ['lastName', 'Last name'],
            ['email', 'Email'],
            ['phone', 'Phone'],
            ['city', 'City'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="label">{label}</span>
            <input className="input mt-1 h-11" value={field(key)} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          </label>
        ))}
        <label className="block">
          <span className="label">Shipping state — decides legality</span>
          <select className="select mt-1 h-11" value={field('state')} onChange={(e) => setDraft({ ...draft, state: e.target.value })}>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.rules} rules)
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className="label">Public bio</span>
        <textarea className="textarea mt-1" rows={3} value={field('bio')} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
      </label>
      <button className="btn mt-4" disabled={busy} onClick={() => run(() => patch('profile', draft), 'Profile saved')}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </section>
  );
}

function Security({ data }: { data: AccountData }) {
  const { run, busy } = useSave();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [twoOn, setTwoOn] = useState(data.twoFactor);
  return (
    <>
      <section className="card p-6">
        <p className="label">Password</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Current password</span>
            <input className="input mt-1 h-11" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">New password</span>
            <input className="input mt-1 h-11" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
        </div>
        <button
          className="btn btn-sm mt-3"
          disabled={busy || pw.newPassword.length < 10}
          onClick={() => run(() => post('auth/password', pw), 'Password updated — other devices signed out')}
        >
          Update password
        </button>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Two-factor authentication</p>
            <p className="mt-1 text-[13px] text-[var(--muted)]">A six-digit code by email at each sign-in. Sellers must keep it on.</p>
          </div>
          <Badge tone={twoOn ? 'ok' : 'quiet'}>{twoOn ? 'Enabled' : 'Off'}</Badge>
        </div>
        {!twoOn ? (
          <div className="mt-3 flex items-end gap-2">
            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run(async () => {
              const res = await post<{ devCode?: string }>('auth/2fa/request', {});
              setDevCode(res.devCode ?? null);
            }, 'Code sent')}>
              Send code
            </button>
            <label className="block flex-1">
              <span className="label">Code</span>
              <input className="input mt-1 h-10" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <button className="btn btn-sm" disabled={busy || code.length !== 6} onClick={() => run(() => post('auth/2fa/verify', { code }).then(() => setTwoOn(true)), 'Two-factor enabled')}>
              Enable
            </button>
          </div>
        ) : (
          <button className="btn btn-quiet btn-sm mt-3" disabled={busy} onClick={() => run(() => post('auth/2fa/disable', {}).then(() => setTwoOn(false)), 'Two-factor turned off')}>
            Turn off two-factor
          </button>
        )}
        {devCode ? (
          <p className="mono mt-2 text-[12px] text-[var(--muted)]">
            dev code (email transport is stubbed here): <span className="text-[var(--ink)]">{devCode}</span>
          </p>
        ) : null}
      </section>

      <section className="card p-6">
        <p className="label">Active sessions</p>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {data.sessions.map((s) => (
            <li key={String(s.id)} className="flex items-center gap-4 py-3">
              <Icon name={String(s.user_agent).includes('Mobile') ? 'phone' : 'grid'} size={17} className="text-[var(--muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{String(s.user_agent ?? 'unknown device')}</p>
                <p className="text-[11.5px] text-[var(--muted)]">
                  signed in {relTime(String(s.created_at))} · expires {String(s.expires_at).slice(0, 10)}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post('account/sessions/revoke', { sessionId: String(s.id) }), 'Session revoked')}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Addresses({ rows }: { rows: Row[] }) {
  const { run, busy } = useSave();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: 'Home', recipient: '', line1: '', line2: '', city: '', state: 'NY', zip: '' });
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <p className="label">Address book</p>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={15} /> Add address
        </button>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {rows.map((addr) => (
          <li key={String(addr.id)} className="rounded-lg border border-[var(--line)] p-4">
            <p className="text-[13px] font-medium">
              {String(addr.label)} {Number(addr.is_default) ? <Badge tone="ink">default</Badge> : null}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
              {String(addr.recipient)}
              <br />
              {String(addr.line1)}
              {addr.line2 ? `, ${String(addr.line2)}` : ''}
              <br />
              {String(addr.city)}, {String(addr.state)} {String(addr.zip)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await post('addresses', { ...addr, id: undefined, isDefault: true });
                  }, 'Default address updated')
                }
              >
                Make default
              </button>
              <button className="text-[12.5px] text-[var(--muted)] hover:text-[var(--error)]" disabled={busy} onClick={() => run(() => del(`addresses/${String(addr.id)}`), 'Address removed')}>
                Remove
              </button>
            </div>
          </li>
        ))}
        {!rows.length ? <li className="col-span-2 text-[13px] text-[var(--muted)]">No address on file yet — checkout needs one to evaluate legality.</li> : null}
      </ul>

      {open ? (
        <Modal title="Add address" onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['recipient', 'Recipient'],
                ['line1', 'Street'],
                ['line2', 'Apartment'],
                ['city', 'City'],
                ['state', 'State'],
                ['zip', 'ZIP'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="label">{label}</span>
                <input className="input mt-1 h-11" value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          <button
            className="btn btn-block mt-4"
            disabled={busy || !(form.recipient && form.line1 && form.city && form.zip.length === 5)}
            onClick={() => run(() => post('addresses', form).then(() => setOpen(false)), 'Address saved')}
          >
            Save address
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

function Payment({ rows }: { rows: Row[] }) {
  const { run, busy } = useSave();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState({ number: '', expMonth: '', expYear: '', cvv: '' });
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <p className="label">Payment methods</p>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={15} /> Add card
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((m) => (
          <li key={String(m.id)} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-4">
            <Icon name="card" size={18} className="text-[var(--accent-soft)]" />
            <span className="flex-1 text-[13.5px]">
              {titleCaseOr(String(m.brand))} ···· {String(m.last4)}
              {m.expiry_month ? ` · ${String(m.expiry_month).padStart(2, '0')}/${String(m.expiry_year).slice(-2)}` : ''}
            </span>
            {Number(m.is_default) ? <Badge tone="ink">default</Badge> : null}
            <span className="mono text-[11px] text-[var(--muted)]">token {String(m.token).slice(0, 10)}…</span>
            <button className="text-[12.5px] text-[var(--muted)] hover:text-[var(--error)]" disabled={busy} onClick={() => run(() => del(`payment-methods/${String(m.id)}`), 'Card removed')}>
              Remove
            </button>
          </li>
        ))}
        {!rows.length ? <li className="text-[13px] text-[var(--muted)]">No card saved. FAUNAL stores a token, brand and last four digits only.</li> : null}
      </ul>
      {open ? (
        <Modal title="Add a card" onClose={() => setOpen(false)}>
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            In this environment FaunalPay tokenizes locally: the number you type is validated with Luhn, then thrown away — only a token, brand and the
            last four digits are stored.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <label className="col-span-2 block">
              <span className="label">Card number</span>
              <input className="input mt-1 h-11" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} placeholder="4242 4242 4242 4242" />
            </label>
            <label className="block">
              <span className="label">MM</span>
              <input className="input mt-1 h-11" value={card.expMonth} onChange={(e) => setCard({ ...card, expMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            </label>
            <label className="block">
              <span className="label">YY</span>
              <input className="input mt-1 h-11" value={card.expYear} onChange={(e) => setCard({ ...card, expYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </label>
          </div>
          <label className="mt-3 block w-[140px]">
            <span className="label">CVC</span>
            <input className="input mt-1 h-11" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </label>
          <button className="btn btn-block mt-4" disabled={busy || card.number.replace(/\D/g, '').length < 13} onClick={() => run(() => post('payment-methods', card).then(() => setOpen(false)), 'Card tokenized and saved')}>
            Save card
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

function Documents({ rows }: { rows: Row[] }) {
  const { run, busy } = useSave();
  const [docType, setDocType] = useState('PROOF_OF_ORIGIN');
  const [file, setFile] = useState<File | null>(null);
  return (
    <section className="card p-6">
      <p className="label">Document vault</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
        Licences, permits and health certificates are stored in the private bucket. Only you, the counterparty of an order and the compliance desk can
        open them — each view is written to the audit log.
      </p>
      <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {rows.map((d) => (
          <li key={String(d.id)} className="flex items-center gap-4 py-3">
            <Icon name="doc" size={17} className="text-[var(--accent-soft)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{titleCaseOr(String(d.doc_type))}</p>
              <p className="text-[12px] text-[var(--muted)]">
                {d.animal_name ? `${String(d.animal_name)} · ` : ''}uploaded {relTime(String(d.uploaded_at))} · {String(d.filename)}
              </p>
            </div>
            <Badge tone={String(d.status) === 'VERIFIED' ? 'ok' : String(d.status) === 'PENDING' ? 'warn' : 'bad'}>{titleCaseOr(String(d.status))}</Badge>
            {d.expires_at ? <span className="text-[12px] text-[var(--muted)]">expires {String(d.expires_at).slice(0, 10)}</span> : null}
            <a className="btn btn-ghost btn-sm" href={`/api/documents/${String(d.id)}`}>
              <Icon name="eye" size={14} /> Open
            </a>
          </li>
        ))}
        {!rows.length ? <li className="py-3 text-[13px] text-[var(--muted)]">Nothing filed yet.</li> : null}
      </ul>
      <div className="mt-4 flex items-end gap-2">
        <label className="block w-[240px]">
          <span className="label">Document type</span>
          <select className="select mt-1 h-11" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {['PROOF_OF_ORIGIN', 'HEALTH_CERTIFICATE', 'PERMIT', 'CITES', 'BREEDER_LICENSE', 'TRANSPORT_MANIFEST'].map((t) => (
              <option key={t} value={t}>
                {titleCaseOr(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1">
          <span className="label">File (PDF or image, max 12 MB)</span>
          <input type="file" className="input mt-1 h-11 py-0 text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button
          className="btn"
          disabled={busy || !file}
          onClick={() =>
            run(async () => {
              const form = new FormData();
              form.set('file', file as File);
              form.set('doc_type', docType);
              await post('documents', form);
              setFile(null);
            }, 'Document uploaded — the desk reviews it within 24 h')
          }
        >
          Upload
        </button>
      </div>
    </section>
  );
}

function Alerts({ prefs, locale, currency }: { prefs: Record<string, boolean>; locale: string; currency: string }) {
  const { run, busy } = useSave();
  const [local, setLocal] = useState(prefs);
  const labels: Record<string, string> = {
    order_update: 'Order and transport updates',
    messages: 'New breeder messages',
    price_drops: 'Price drops on saved animals',
    new_listings: 'New listings matching your species',
    marketing: 'Product news (rare, no spam)',
  };
  return (
    <section className="card p-6">
      <p className="label">Notifications</p>
      <ul className="mt-3 space-y-2.5">
        {Object.keys(labels).map((key) => (
          <li key={key}>
            <label className="check">
              <input type="checkbox" checked={!!local[key]} onChange={(e) => setLocal({ ...local, [key]: e.target.checked })} />
              <span className="text-[13.5px]">{labels[key]}</span>
            </label>
          </li>
        ))}
      </ul>
      <button className="btn btn-sm mt-4" disabled={busy} onClick={() => run(() => patch('profile/settings', { notify: local }), 'Preferences saved')}>
        Save preferences
      </button>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-[var(--line)] pt-6">
        <div>
          <p className="label">Display currency</p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">Listings stay priced in USD; this only changes what you see.</p>
          <div className="mt-2 flex gap-1.5">
            {['USD', 'EUR', 'GBP', 'CAD'].map((c) => (
              <button
                key={c}
                className={`chip ${currency === c ? 'bg-[var(--ink)] text-white' : ''}`}
                disabled={busy}
                onClick={() => run(() => post('i18n', { currency: c }), `Currency set to ${c}`)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Language</p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">English is the launch language; FR and ES strings ship with the app.</p>
          <div className="mt-2 flex gap-1.5">
            {['en', 'fr', 'es'].map((l) => (
              <button key={l} className={`chip ${locale === l ? 'bg-[var(--ink)] text-white' : ''}`} disabled={busy} onClick={() => run(() => post('i18n', { locale: l }), `Language set to ${l.toUpperCase()}`)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DangerZone() {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function close() {
    setBusy(true);
    try {
      const res = await post<{ message?: string }>('account/delete', { password });
      toast(res.message ?? 'Account closed', { tone: 'warn' });
      window.location.href = '/';
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not close the account', { tone: 'error' });
      setBusy(false);
    }
  }
  return (
    <section className="card border-[var(--error)]/30 p-6">
      <p className="label text-[var(--error)]">Close account</p>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--muted)]">
        FAUNAL keeps compliance records for the statutory retention period, so closure is a soft delete: your listings are withdrawn, sessions killed
        and personal details anonymised. Accounts with an open order cannot be closed.
      </p>
      <button className="btn btn-danger btn-sm mt-3" onClick={() => setOpen(true)}>
        Close my account
      </button>
      {open ? (
        <Modal title="Confirm closure" onClose={() => setOpen(false)}>
          <ErrorNote tone="warn">This cannot be undone from the app — support can reopen an account within 30 days.</ErrorNote>
          <label className="mt-3 block">
            <span className="label">Password (demo password: {DEMO_PASSWORD})</span>
            <input className="input mt-1 h-11" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-danger btn-block mt-3" onClick={close} disabled={busy || !password}>
            {busy ? 'Closing…' : 'Close my account'}
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

export { money };
