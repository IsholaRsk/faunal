'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { post, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';

export type AuthMode = 'login' | 'signup' | 'reset';

export interface AuthValues {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  state: string;
  city: string;
  code: string;
  dateOfBirth: string;
  adult: boolean;
  role: 'BUYER' | 'VERIFIED_BREEDER';
}

const BLANK: AuthValues = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  state: 'NY',
  city: '',
  code: '',
  dateOfBirth: '',
  adult: false,
  role: 'BUYER',
};

/**
 * One auth state machine for both surfaces: sign-in, sign-up with age gate,
 * 2FA challenge and password reset. The screens differ; the flow does not.
 */
export type StateOption = { code: string; name: string; rules: number; animals: number };

export function useAuthForm(mode: AuthMode, states: StateOption[]) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || (mode === 'signup' ? '/' : '/account');
  const { refresh } = useApp();
  const [values, setValues] = useState<AuthValues>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<'form' | 'code' | 'sent' | 'done'>('form');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);

  const set = (patch: Partial<AuthValues>) => setValues((v) => ({ ...v, ...patch }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        const res = await post<{ twoFactorRequired?: boolean; devCode?: string; message?: string }>('auth/login', {
          email: values.email,
          password: values.password,
        });
        if (res.twoFactorRequired) {
          setStage('code');
          setDevCode(res.devCode ?? null);
          setNotice(res.message ?? 'Enter the six-digit code from your email.');
        } else {
          finish();
        }
      } else if (mode === 'signup') {
        if (!values.adult) throw new ApiError('You must confirm you are 18 or older.', 'AGE', 400);
        if (values.password.length < 10) throw new ApiError('Choose a password of at least 10 characters.', 'WEAK', 400);
        await post('auth/signup', {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          state: values.state,
          city: values.city,
          dateOfBirth: values.dateOfBirth || undefined,
          role: values.role,
        });
        finish(values.role === 'VERIFIED_BREEDER' ? '/become-a-breeder' : next);
      } else if (stage === 'sent') {
        const res = await post<{ message?: string; devCode?: string }>('auth/reset/confirm', {
          email: values.email,
          code: values.code,
          password: values.password,
        });
        setNotice(res.message ?? 'Password updated.');
        setStage('done');
      } else {
        const res = await post<{ message?: string; devCode?: string }>('auth/reset/request', { email: values.email });
        setResetCode(res.devCode ?? null);
        setDevCode(res.devCode ?? null);
        setNotice(res.message ?? 'Check your inbox.');
        setStage('sent');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      await post('auth/2fa/complete', { email: values.email, code: values.code });
      finish();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  }

  function finish(to = next) {
    refresh();
    router.push(to);
    router.refresh();
  }

  /** Fills the demo account and submits it — the buttons on the login screen. */
  function useDemo(email: string, password: string) {
    setValues((v) => ({ ...v, email, password }));
    setStage('form');
    setError(null);
    setBusy(true);
    post('auth/login', { email, password })
      .then(() => finish())
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Sign-in failed'))
      .finally(() => setBusy(false));
  }

  return {
    values,
    set,
    busy,
    error,
    notice,
    stage,
    devCode,
    resetCode,
    submit,
    submitCode,
    useDemo,
    next,
    states,
  };
}

export const DEMO_ACCOUNTS = [
  { email: 'alex@example.com', label: 'Buyer', hint: 'Alex — Brooklyn collector with a saved cart' },
  { email: 'owner@empirereptiles.com', label: 'Breeder', hint: 'Empire Reptile Works — verified, 8 listings' },
  { email: 'admin@faunal.market', label: 'Admin', hint: 'Nora — compliance desk, full console' },
];
export const DEMO_PASSWORD = 'Faunal2026!';
