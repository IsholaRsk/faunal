'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Badge, Money, VerifiedMark } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { del, patch, post, ApiError } from '@/lib/ui/api';
import { relTime, titleCaseOr, money } from '@/lib/ui/screen-helpers';
import type { AccountData } from '@/components/desktop/profile';

/**
 * MOBILE profile — the app's fifth tab: identity card, stat row, task list.
 * Settings screens are separate routes so nothing is a squeezed table.
 */
export function MobileProfile({ data }: { data: AccountData }) {
  const { user, badges, toast } = useApp();
  const a = data.account;
  const isSeller = !!data.breeder;
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  const menu: { href: string; label: string; hint: string; icon: 'doc' | 'card' | 'bell' | 'lock' | 'gear' | 'compass' | 'store' | 'chart' }[] = [
    { href: '/profile/settings', label: 'Profile & security', hint: 'Name, state, password, two-factor', icon: 'gear' },
    { href: '/profile/addresses', label: 'Address book', hint: `${data.addresses.length} saved`, icon: 'location' as never },
    { href: '/profile/payment', label: 'Payment', hint: `${data.methods.length} methods`, icon: 'card' },
    { href: '/profile/documents', label: 'Documents', hint: `${data.documents.length} files · private`, icon: 'lock' },
    { href: '/orders', label: 'My orders', hint: `${data.stats.orders} placed`, icon: 'compass' },
    { href: '/notifications', label: 'Notifications', hint: `${badges.unreadNotifications} unread`, icon: 'bell' },
  ];

  return (
    <div className="pb-6">
      <MobileHeader
        title="Profile"
        actions={
          <button
            className="icon-btn"
            aria-label="Sign out"
            onClick={async () => {
              await post('auth/logout', {});
              toast('Signed out');
              window.location.href = '/';
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        }
      />

      <div className="px-4 pt-3">
        <div className="card flex items-center gap-3.5 p-4">
          <Media media={{ path_medium: a.avatar_path ? String(a.avatar_path) : null, base_path: null }} alt="" ratio="1 / 1" className="h-14 w-14 shrink-0 rounded-full border border-[var(--line)]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[16px] font-medium">
              {String(a.first_name)} {String(a.last_name)}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--muted)]">{data.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge>{titleCaseOr(String(a.role))}</Badge>
              <Badge icon="location">ship to {String(a.jurisdiction_code ?? 'set')}</Badge>
              {!data.twoFactor ? <Badge tone="warn" icon="shield">2FA off</Badge> : null}
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {[
            ['Orders', data.stats.orders, '/orders'],
            ['Saved', data.stats.favorites, '/favorites'],
            ['Cart', data.stats.cart, '/cart'],
            ['Chats', badges.unreadMessages, '/messages'],
          ].map(([label, value, href]) => (
            <Link key={String(label)} href={String(href)} className="card p-3 text-center">
              <p className="h4">{Number(value)}</p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">{String(label)}</p>
            </Link>
          ))}
        </div>

        {isSeller ? (
          <Link href="/seller" className="mt-2.5 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink)] text-white">
              <Icon name="store" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[14px] font-medium">
                {String(data.breeder!.business_name)} <VerifiedMark tier={String(data.breeder!.tier)} />
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--muted)]">Seller dashboard · {titleCaseOr(String(data.breeder!.status))}</span>
            </span>
            <Icon name="chevronRight" size={17} className="text-[var(--muted)]" />
          </Link>
        ) : (
          <Link href="/become-a-breeder" className="mt-2.5 flex items-center gap-3 rounded-xl border border-dashed border-[var(--line)] p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)]">
              <Icon name="paw" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium">Sell on FAUNAL</span>
              <span className="mt-0.5 block text-[12px] text-[var(--muted)]">Verify your licence and list captive-bred animals</span>
            </span>
            <Icon name="chevronRight" size={17} className="text-[var(--muted)]" />
          </Link>
        )}

        {isStaff ? (
          <Link href="/admin" className="mt-2.5 flex items-center gap-3 rounded-xl border border-[var(--ink)] bg-[var(--ink)] p-4 text-white">
            <Icon name="shield" size={18} />
            <span className="flex-1 text-[14px] font-medium">Admin console</span>
            <Icon name="chevronRight" size={17} />
          </Link>
        ) : null}

        <ul className="mt-2.5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {menu.map((m) => (
            <li key={m.href} className="border-b border-[var(--line)] last:border-0">
              <Link href={m.href} className="flex items-center gap-3 px-4 py-3.5">
                <Icon name={m.icon} size={18} className="text-[var(--accent-soft)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px]">{m.label}</span>
                  <span className="block text-[11.5px] text-[var(--muted)]">{m.hint}</span>
                </span>
                <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <Link href="/assistant" className="btn btn-quiet btn-sm flex-1">
            <Icon name="sparkle" size={15} /> Ask FAUNAL
          </Link>
          <Link href="/guides" className="btn btn-quiet btn-sm flex-1">
            <Icon name="book" size={15} /> Care guides
          </Link>
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-[var(--muted)]">
          Signed in on {data.sessions.length} device{data.sessions.length === 1 ? '' : 's'} · account created {String(a.created_at).slice(0, 10)}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- mobile sub-screens */

export function MobileAccount({ section, data }: { section: string; data: AccountData }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    firstName: String(data.account.first_name ?? ''),
    lastName: String(data.account.last_name ?? ''),
    email: data.email,
    phone: String(data.account.phone ?? ''),
    city: String(data.profile?.public_city ?? ''),
    state: String(data.account.jurisdiction_code ?? 'NY'),
    bio: String(data.profile?.bio ?? ''),
    label: 'Home',
    recipient: '',
    line1: '',
    line2: '',
    zip: '',
    docType: 'PROOF_OF_ORIGIN',
    currentPassword: '',
    newPassword: '',
    code: '',
  });
  const [card, setCard] = useState({ number: '', expMonth: '', expYear: '', cvv: '' });
  const [devCode, setDevCode] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [prefs, setPrefs] = useState(data.prefs);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const title = { profile: 'Profile', security: 'Security', addresses: 'Address book', payment: 'Payment', documents: 'Documents', alerts: 'Notifications' }[section];

  return (
    <div className="pb-8">
      <MobileHeader
        title={title}
        back="/profile"
        actions={
          section === 'addresses' || section === 'payment' ? (
            <button className="icon-btn" aria-label="Add" onClick={() => setOpen('add')}>
              <Icon name="plus" size={19} />
            </button>
          ) : undefined
        }
      />

      <div className="space-y-3 px-4 pt-3">
        {section === 'profile' ? (
          <section className="card space-y-2.5 p-4">
            {(
              [
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['city', 'City'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label} value={form[key]} onChange={(v) => set(key, v)} />
            ))}
            <label className="block">
              <span className="label">Shipping state — decides legality</span>
              <select className="select mt-1 h-12" value={form.state} onChange={(e) => set('state', e.target.value)}>
                {data.states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Public bio" value={form.bio} onChange={(v) => set('bio', v)} area />
            <button className="btn btn-block" disabled={busy} onClick={() => run(() => patch('profile', form), 'Saved')}>
              Save profile
            </button>
          </section>
        ) : null}

        {section === 'security' ? (
          <>
            <section className="card space-y-2.5 p-4">
              <p className="label">Password</p>
              <Field label="Current" value={form.currentPassword} onChange={(v) => set('currentPassword', v)} type="password" />
              <Field label="New (10+ characters)" value={form.newPassword} onChange={(v) => set('newPassword', v)} type="password" />
              <button className="btn btn-block" disabled={busy || form.newPassword.length < 10} onClick={() => run(() => post('auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword }), 'Password updated')}>
                Update password
              </button>
            </section>
            <section className="card p-4">
              <div className="flex items-center justify-between">
                <p className="label">Two-factor</p>
                <Badge tone={data.twoFactor ? 'ok' : 'warn'}>{data.twoFactor ? 'On' : 'Off'}</Badge>
              </div>
              {!data.twoFactor ? (
                <div className="mt-2.5 space-y-2">
                  <button className="btn btn-quiet btn-block" disabled={busy} onClick={() => run(async () => setDevCode((await post<{ devCode?: string }>('auth/2fa/request', {})).devCode ?? null), 'Code sent')}>
                    Send code
                  </button>
                  <Field label="Six-digit code" value={form.code} onChange={(v) => set('code', v.replace(/\D/g, '').slice(0, 6))} />
                  <button className="btn btn-block" disabled={busy || form.code.length !== 6} onClick={() => run(() => post('auth/2fa/verify', { code: form.code }), 'Two-factor on')}>
                    Enable
                  </button>
                  {devCode ? <p className="mono text-[12px] text-[var(--muted)]">dev code: {devCode}</p> : null}
                </div>
              ) : (
                <button className="btn btn-quiet btn-block mt-2.5" disabled={busy} onClick={() => run(() => post('auth/2fa/disable', {}), 'Two-factor off')}>
                  Turn off
                </button>
              )}
            </section>
            <section className="card p-4">
              <p className="label">Devices</p>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {data.sessions.map((s) => (
                  <li key={String(s.id)} className="flex items-center gap-3 py-2.5">
                    <Icon name="phone" size={16} className="shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{String(s.user_agent ?? 'device')}</span>
                      <span className="block text-[11px] text-[var(--muted)]">since {relTime(String(s.created_at))}</span>
                    </span>
                    <button className="text-[12px] text-[var(--muted)]" disabled={busy} onClick={() => run(() => post('account/sessions/revoke', { sessionId: String(s.id) }), 'Revoked')}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {section === 'addresses' ? (
          <ul className="space-y-2.5">
            {data.addresses.map((addr) => (
              <li key={String(addr.id)} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {String(addr.label)} {Number(addr.is_default) ? <Badge tone="ink">default</Badge> : null}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                      {String(addr.recipient)} · {String(addr.line1)}
                      {addr.line2 ? `, ${String(addr.line2)}` : ''} · {String(addr.city)}, {String(addr.state)} {String(addr.zip)}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button className="btn btn-quiet btn-sm flex-1" disabled={busy} onClick={() => run(() => post('addresses', { ...addr, id: undefined, isDefault: true }), 'Default updated')}>
                    Make default
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => del(`addresses/${String(addr.id)}`), 'Removed')}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </li>
            ))}
            {!data.addresses.length ? <li className="card p-4 text-[13px] text-[var(--muted)]">No addresses yet. Checkout needs one to check legality at the destination.</li> : null}
          </ul>
        ) : null}

        {section === 'payment' ? (
          <ul className="space-y-2.5">
            {data.methods.map((m) => (
              <li key={String(m.id)} className="card flex items-center gap-3 p-4">
                <Icon name="card" size={18} className="text-[var(--accent-soft)]" />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  {titleCaseOr(String(m.brand))} ···· {String(m.last4)}
                  <span className="block text-[11.5px] text-[var(--muted)]">token {String(m.token).slice(0, 12)}… · stored by FaunalPay</span>
                </span>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => del(`payment-methods/${String(m.id)}`), 'Removed')}>
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
            {!data.methods.length ? <li className="card p-4 text-[13px] text-[var(--muted)]">No card saved. Only a token, brand and last four digits are stored.</li> : null}
          </ul>
        ) : null}

        {section === 'documents' ? (
          <>
            <ul className="space-y-2">
              {data.documents.map((d) => (
                <li key={String(d.id)} className="card flex items-center gap-3 p-3.5">
                  <Icon name="doc" size={17} className="text-[var(--accent-soft)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{titleCaseOr(String(d.doc_type))}</span>
                    <span className="block truncate text-[11.5px] text-[var(--muted)]">
                      {d.animal_name ? `${String(d.animal_name)} · ` : ''}
                      {relTime(String(d.uploaded_at))}
                    </span>
                  </span>
                  <Badge tone={String(d.status) === 'VERIFIED' ? 'ok' : String(d.status) === 'PENDING' ? 'warn' : 'bad'}>{titleCaseOr(String(d.status))}</Badge>
                  <a href={`/api/documents/${String(d.id)}`} className="icon-btn" aria-label="Open document">
                    <Icon name="eye" size={16} />
                  </a>
                </li>
              ))}
              {!data.documents.length ? <li className="card p-4 text-[13px] text-[var(--muted)]">Nothing filed. Upload a licence or health certificate and the desk reviews it.</li> : null}
            </ul>
            <section className="card p-4">
              <p className="label">Upload a document</p>
              <label className="mt-2 block">
                <span className="label">Type</span>
                <select className="select mt-1 h-12" value={form.docType} onChange={(e) => set('docType', e.target.value)}>
                  {['PROOF_OF_ORIGIN', 'HEALTH_CERTIFICATE', 'PERMIT', 'CITES', 'BREEDER_LICENSE', 'TRANSPORT_MANIFEST'].map((t) => (
                    <option key={t} value={t}>
                      {titleCaseOr(t)}
                    </option>
                  ))}
                </select>
              </label>
              <input type="file" className="input mt-2 h-12 py-0 text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button
                className="btn btn-block mt-2.5"
                disabled={busy || !file}
                onClick={() =>
                  run(async () => {
                    const fd = new FormData();
                    fd.set('file', file as File);
                    fd.set('doc_type', form.docType);
                    await post('documents', fd);
                    setFile(null);
                  }, 'Uploaded for review')
                }
              >
                Upload privately
              </button>
            </section>
          </>
        ) : null}

        {section === 'alerts' ? (
          <section className="card p-4">
            <p className="label">Alerts</p>
            <ul className="mt-2 space-y-2">
              {Object.entries({
                order_update: 'Order & transport updates',
                messages: 'Breeder messages',
                price_drops: 'Price drops on saved animals',
                new_listings: 'New matching listings',
                marketing: 'Product news',
              }).map(([key, label]) => (
                <li key={key}>
                  <label className="check">
                    <input type="checkbox" checked={!!prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} />
                    <span className="text-[13.5px]">{label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button className="btn btn-block mt-3" disabled={busy} onClick={() => run(() => patch('profile/settings', { notify: prefs }), 'Preferences saved')}>
              Save preferences
            </button>
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <p className="label">Currency</p>
              <div className="mt-1.5 flex gap-1.5">
                {['USD', 'EUR', 'GBP', 'CAD'].map((c) => (
                  <button key={c} className={`chip ${data.currency === c ? 'bg-[var(--ink)] text-white' : ''}`} disabled={busy} onClick={() => run(() => post('i18n', { currency: c }), `Currency ${c}`)}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="mt-3 label">Language</p>
              <div className="mt-1.5 flex gap-1.5">
                {['en', 'fr', 'es'].map((l) => (
                  <button key={l} className={`chip ${data.locale === l ? 'bg-[var(--ink)] text-white' : ''}`} disabled={busy} onClick={() => run(() => post('i18n', { locale: l }), `Language ${l.toUpperCase()}`)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">Prices remain in USD; display currency converts at the reference rate.</p>
            </div>
          </section>
        ) : null}
      </div>

      <Sheet
        open={open === 'add' && section === 'addresses'}
        onClose={() => setOpen(null)}
        title="Add address"
        footer={
          <button className="btn btn-block" disabled={busy || !(form.recipient && form.line1 && form.city && form.zip.length === 5)} onClick={() => run(() => post('addresses', { label: form.label, recipient: form.recipient, line1: form.line1, line2: form.line2, city: form.city, state: form.state, zip: form.zip }).then(() => setOpen(null)), 'Address saved')}>
            Save
          </button>
        }
      >
        <div className="space-y-2.5">
          {(
            [
              ['label', 'Label'],
              ['recipient', 'Recipient'],
              ['line1', 'Street address'],
              ['line2', 'Apartment'],
              ['city', 'City'],
              ['zip', 'ZIP'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} value={form[key]} onChange={(v) => set(key, key === 'zip' ? v.replace(/\D/g, '').slice(0, 5) : v)} />
          ))}
        </div>
      </Sheet>

      <Sheet
        open={open === 'add' && section === 'payment'}
        onClose={() => setOpen(null)}
        title="Add a card"
        footer={
          <button className="btn btn-block" disabled={busy || card.number.replace(/\D/g, '').length < 13} onClick={() => run(() => post('payment-methods', card).then(() => setOpen(null)), 'Card tokenized')}>
            Save card
          </button>
        }
      >
        <div className="space-y-2.5">
          <Field label="Card number" value={card.number} onChange={(v) => setCard({ ...card, number: v.replace(/[^\d ]/g, '').slice(0, 23) })} />
          <div className="flex gap-2">
            <Field label="MM" value={card.expMonth} onChange={(v) => setCard({ ...card, expMonth: v.replace(/\D/g, '').slice(0, 2) })} />
            <Field label="YY" value={card.expYear} onChange={(v) => setCard({ ...card, expYear: v.replace(/\D/g, '').slice(0, 4) })} />
            <Field label="CVC" value={card.cvv} onChange={(v) => setCard({ ...card, cvv: v.replace(/\D/g, '').slice(0, 4) })} />
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">
            The number is validated and exchanged for a token by FaunalPay — FAUNAL never stores the PAN or the CVC.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  area = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  area?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {area ? (
        <textarea className="textarea mt-1" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input mt-1 h-12" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function useRunner() {
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
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That did not work', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

export { Money, Badge, money };
