'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, Logo } from '@/components/ui/Icon';
import { ErrorNote } from '@/components/ui/primitives';
import { useAuthForm, DEMO_ACCOUNTS, DEMO_PASSWORD, type AuthMode } from '@/components/shared/auth-form';

/**
 * MOBILE auth — a full-screen app flow: big 48 px fields, thumb-reachable
 * primary action, no page chrome while unauthenticated.
 */
export function MobileAuth({ mode, states }: { mode: AuthMode; states: { code: string; name: string; rules: number; animals: number }[] }) {
  const f = useAuthForm(mode, states);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--canvas)]">
      <div className="flex items-center justify-between px-4 pt-[calc(12px+var(--safe-top))] pb-2">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-display text-[17px] tracking-tight">FAUNAL</span>
        </div>
        {mode !== 'login' ? (
          <Link href="/login" className="icon-btn" aria-label="Back to sign in">
            <Icon name="close" size={20} />
          </Link>
        ) : (
          <Link href="/" className="text-[13px] text-[var(--muted)]">
            Browse first
          </Link>
        )}
      </div>

      <div className="flex-1 px-5 pt-4">
        <h1 className="h2">
          {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
          {mode === 'login'
            ? 'Same account in the app and on the web — cart, favorites, orders and messages stay in sync.'
            : mode === 'signup'
              ? 'Your state decides what you may legally keep, so we ask for it up front.'
              : 'A six-digit code arrives by email. Setting a new one signs out every device.'}
        </p>

        {f.notice ? (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-[13px] leading-relaxed">
            {f.notice}
            {f.devCode ? (
              <p className="mono mt-1 text-[12px]">
                dev code <span className="text-[var(--ink)]">{f.devCode}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'login' && f.stage === 'code' ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void f.submitCode();
            }}
          >
            <MField label="Six-digit code" value={f.values.code} onChange={(v) => f.set({ code: v.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" autoFocus />
            {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}
            <button className="btn btn-block btn-lg" disabled={f.busy || f.values.code.length !== 6}>
              {f.busy ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
        ) : mode === 'reset' && f.stage === 'sent' ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void f.submit();
            }}
          >
            <MField label="Reset code" value={f.values.code} onChange={(v) => f.set({ code: v.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
            <MField label="New password" value={f.values.password} onChange={(v) => f.set({ password: v })} type={showPw ? 'text' : 'password'} />
            {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}
            <button className="btn btn-block btn-lg" disabled={f.busy || f.values.code.length !== 6 || f.values.password.length < 10}>
              {f.busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : mode === 'reset' && f.stage === 'done' ? (
          <Link href="/login" className="btn btn-block btn-lg mt-5">
            Back to sign in
          </Link>
        ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void f.submit();
            }}
          >
            {mode === 'signup' ? (
              <div className="flex gap-3">
                <div className="flex-1">
                  <MField label="First name" value={f.values.firstName} onChange={(v) => f.set({ firstName: v })} />
                </div>
                <div className="flex-1">
                  <MField label="Last name" value={f.values.lastName} onChange={(v) => f.set({ lastName: v })} />
                </div>
              </div>
            ) : null}

            <MField label="Email" value={f.values.email} onChange={(v) => f.set({ email: v })} type="email" autoComplete="email" autoFocus={mode !== 'login'} />

            {mode !== 'reset' ? (
              <label className="block">
                <span className="label">Password</span>
                <div className="input-group mt-1">
                  <input
                    className="input h-12"
                    type={showPw ? 'text' : 'password'}
                    value={f.values.password}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    onChange={(e) => f.set({ password: e.target.value })}
                  />
                  <button type="button" className="icon-btn" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password visibility">
                    <Icon name={showPw ? 'eye' : 'lock'} size={18} />
                  </button>
                </div>
                <span className="field-hint">{mode === 'signup' ? '10 characters minimum.' : 'Codes arrive by email when two-factor is on.'}</span>
              </label>
            ) : null}

            {mode === 'signup' ? (
              <>
                <label className="block">
                  <span className="label">Shipping state</span>
                  <select className="select mt-1 h-12" value={f.values.state} onChange={(e) => f.set({ state: e.target.value })}>
                    {f.states.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
                <MField label="City" value={f.values.city} onChange={(v) => f.set({ city: v })} placeholder="Queens" />
                <MField label="Date of birth" value={f.values.dateOfBirth} onChange={(v) => f.set({ dateOfBirth: v })} type="date" />
                <label className="check mt-1">
                  <input type="checkbox" checked={f.values.adult} onChange={(e) => f.set({ adult: e.target.checked })} />
                  <span className="text-[13px] leading-snug">I am 18 or older and may legally keep restricted exotic animals here.</span>
                </label>
                <div className="segmented">
                  {(
                    [
                      ['BUYER', 'Buying'],
                      ['VERIFIED_BREEDER', 'Selling'],
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" className={f.values.role === value ? 'is-active' : ''} onClick={() => f.set({ role: value })}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">
                  {f.states.length} states reviewed · {f.states.reduce((n, s) => n + s.rules, 0)} recorded restrictions. Sellers verify their licence after
                  signup.
                </p>
              </>
            ) : null}

            {f.error ? <ErrorNote>{f.error}</ErrorNote> : null}

            <div className="pt-1">
              <button className="btn btn-block btn-lg" disabled={f.busy || !f.values.email || f.values.password.length < (mode === 'signup' ? 10 : 1)}>
                {f.busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset code'}
              </button>
            </div>
          </form>
        )}

        {mode === 'login' ? (
          <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="label">Demo · {DEMO_PASSWORD}</p>
            <ul className="mt-1.5">
              {DEMO_ACCOUNTS.map((d) => (
                <li key={d.email}>
                  <button className="flex w-full items-center justify-between gap-2 py-2.5 text-left" onClick={() => f.useDemo(d.email, DEMO_PASSWORD)}>
                    <span className="text-[13px]">
                      <span className="font-medium">{d.label}</span>
                      <span className="block text-[11.5px] text-[var(--muted)]">{d.hint}</span>
                    </span>
                    <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="px-5 pb-[calc(18px+var(--safe-bottom))] pt-5 text-center text-[13px] text-[var(--muted)]">
        {mode === 'login' ? (
          <>
            New here?{' '}
            <Link href="/signup" className="link">
              Create an account
            </Link>
          </>
        ) : (
          <Link href="/login" className="link">
            Back to sign in
          </Link>
        )}
      </p>
    </div>
  );
}

function MField({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoFocus = false,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input mt-1 h-12"
        type={type}
        inputMode={inputMode as never}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
