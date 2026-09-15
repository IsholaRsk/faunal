'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, Logo } from '@/components/ui/Icon';
import { ErrorNote } from '@/components/ui/primitives';
import { useAuthForm, DEMO_ACCOUNTS, DEMO_PASSWORD, type AuthMode } from '@/components/shared/auth-form';

/**
 * DESKTOP auth — a split screen: editorial left panel, single-column form on the
 * right. Sign-up asks only what compliance actually needs (age, state).
 */
export function DesktopAuth({ mode, states }: { mode: AuthMode; states: { code: string; name: string; rules: number; animals: number }[] }) {
  const f = useAuthForm(mode, states);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="grid min-h-[calc(100vh-68px)] grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden border-r border-[var(--line)] bg-[var(--surface-2)] p-12 lg:block">
        <Logo size={28} />
        <h2 className="h1 mt-10 max-w-[16ch]">
          {mode === 'signup' ? 'Start with the law, not the luck.' : mode === 'reset' ? 'Reset it. We will hold the line for you.' : 'The marketplace where the paperwork is already done.'}
        </h2>
        <p className="lede mt-4 max-w-[46ch]">
          FAUNAL reads species law for your state before a listing can be bought. Creating an account is how we know who to send the animal to — and who
          may not receive it.
        </p>
        <ul className="mt-10 space-y-4">
          {[
            ['shield', 'Legality checked per species, state and city'],
            ['doc', 'Breeder licences, CITES and health certificates on file'],
            ['lock', 'Payment held in escrow until you confirm arrival'],
            ['chat', 'Direct messaging with the breeder, never off-platform'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-start gap-3 text-[14px] leading-relaxed">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface)]">
                <Icon name={icon as 'shield'} size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <p className="absolute bottom-12 left-12 right-12 text-[12px] leading-relaxed text-[var(--muted)]">
          Demo environment — every table below is real data from the SQLite instance. Sign in with{' '}
          <span className="mono">alex@example.com</span> / <span className="mono">{DEMO_PASSWORD}</span>.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-[430px]">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={24} />
            <span className="font-display text-[19px] tracking-tight">FAUNAL</span>
          </div>
          <h1 className="h2 mt-6 lg:mt-0">
            {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
            {mode === 'login'
              ? 'One account for the website and the mobile app: same cart, favorites, orders and messages.'
              : mode === 'signup'
                ? 'We need your state to decide what you may legally keep. Sellers add their licence details after signing up.'
                : 'We will send a six-digit code. Setting a new password signs every other device out.'}
          </p>

          {f.notice ? (
            <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-[13px] leading-relaxed">
              {f.notice}
              {f.devCode ? (
                <p className="mono mt-1.5 text-[12px] text-[var(--muted)]">
                  dev code: <span className="text-[var(--ink)]">{f.devCode}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === 'login' && f.stage === 'code' ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void f.submitCode();
              }}
            >
              <Text label="Six-digit code" value={f.values.code} onChange={(v) => f.set({ code: v.replace(/\D/g, '').slice(0, 6) })} mono autoFocus />
              {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}
              <button className="btn btn-block btn-lg" disabled={f.busy || f.values.code.length !== 6}>
                {f.busy ? 'Verifying…' : 'Verify and continue'}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => f.set({ code: '' })}>
                Use a different account
              </button>
            </form>
          ) : mode === 'reset' && f.stage === 'sent' ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void f.submit();
              }}
            >
              <Text label="Reset code" value={f.values.code} onChange={(v) => f.set({ code: v.replace(/\D/g, '').slice(0, 6) })} mono />
              <Text label="New password" value={f.values.password} onChange={(v) => f.set({ password: v })} type={showPw ? 'text' : 'password'} hint="At least 10 characters." />
              {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}
              <button className="btn btn-block btn-lg" disabled={f.busy || f.values.code.length !== 6 || f.values.password.length < 10}>
                {f.busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          ) : mode === 'reset' && f.stage === 'done' ? (
            <div className="mt-6">
              <Link href="/login" className="btn btn-block btn-lg">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void f.submit();
              }}
            >
              {mode === 'signup' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Text label="First name" value={f.values.firstName} onChange={(v) => f.set({ firstName: v })} autoComplete="given-name" />
                  <Text label="Last name" value={f.values.lastName} onChange={(v) => f.set({ lastName: v })} autoComplete="family-name" />
                </div>
              ) : null}

              <Text label="Email" value={f.values.email} onChange={(v) => f.set({ email: v })} type="email" autoComplete="email" autoFocus={mode !== 'login'} />

              {mode !== 'reset' ? (
                <label className="block">
                  <span className="label">Password</span>
                  <div className="input-group mt-1">
                    <input
                      className="input"
                      type={showPw ? 'text' : 'password'}
                      value={f.values.password}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      onChange={(e) => f.set({ password: e.target.value })}
                    />
                    <button type="button" className="icon-btn" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                      <Icon name={showPw ? 'eye' : 'lock'} size={16} />
                    </button>
                  </div>
                  <span className="field-hint">{mode === 'signup' ? 'At least 10 characters. scrypt-hashed; never stored in clear.' : 'Two-factor codes go to your email when enabled.'}</span>
                </label>
              ) : null}

              {mode === 'signup' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="label">Shipping state</span>
                      <select className="select mt-1 h-11" value={f.values.state} onChange={(e) => f.set({ state: e.target.value })}>
                        {f.states.map((st) => (
                          <option key={st.code} value={st.code}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Text label="City" value={f.values.city} onChange={(v) => f.set({ city: v })} placeholder="Queens" />
                  </div>
                  <Text label="Date of birth (optional)" value={f.values.dateOfBirth} onChange={(v) => f.set({ dateOfBirth: v })} type="date" />
                  <label className="check">
                    <input type="checkbox" checked={f.values.adult} onChange={(e) => f.set({ adult: e.target.checked })} />
                    <span className="text-[13px] leading-snug">
                      I am 18 or older and it is legal for me to keep restricted exotic animals at this address.
                    </span>
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        ['BUYER', 'I am buying'],
                        ['VERIFIED_BREEDER', 'I breed and sell'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`chip ${f.values.role === value ? 'chip-static bg-[var(--ink)] text-white' : ''}`}
                        onClick={() => f.set({ role: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                    Rulebook coverage today: {f.states.length} states — {f.states.reduce((n, s) => n + s.rules, 0)} recorded restrictions. Sellers finish
                    licence verification before a listing can go live.
                  </p>
                </>
              ) : null}

              {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}

              <button className="btn btn-block btn-lg" disabled={f.busy || !f.values.email || f.values.password.length < (mode === 'signup' ? 10 : 1)}>
                {f.busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset code'}
                <Icon name="chevronRight" size={16} />
              </button>
            </form>
          )}

          {mode === 'login' ? (
            <div className="mt-7 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="label">Demo accounts — password {DEMO_PASSWORD}</p>
              <ul className="mt-2 space-y-1.5">
                {DEMO_ACCOUNTS.map((d) => (
                  <li key={d.email}>
                    <button className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-2)]" onClick={() => f.useDemo(d.email, DEMO_PASSWORD)}>
                      <span className="text-[13px]">
                        <span className="font-medium">{d.label}</span> <span className="text-[var(--muted)]">· {d.hint}</span>
                      </span>
                      <span className="mono text-[11.5px] text-[var(--muted)]">{d.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <Link href="/signup" className="link">
                  Create one
                </Link>{' '}
                ·{' '}
                <Link href="/reset" className="link">
                  Forgot password
                </Link>
              </>
            ) : (
              <Link href="/login" className="link">
                Back to sign in
              </Link>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  mono = false,
  autoFocus = false,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  mono?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className={`input mt-1 h-11 ${mono ? 'mono tracking-[0.2em]' : ''}`}
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
