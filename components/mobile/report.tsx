'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { ErrorNote } from '@/components/ui/primitives';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';

const REASONS = [
  ['ILLEGAL_SPECIES', 'Looks illegal'],
  ['SCAM', 'Scam / off-platform payment'],
  ['STOLEN_IMAGES', 'Stolen photos'],
  ['MISLEADING_LISTING', 'Misleading description'],
  ['WELFARE', 'Welfare concern'],
  ['IMPERSONATION', 'Impersonation'],
] as const;

/** MOBILE report — one question per card, thumb-sized choices, sticky submit. */
export function MobileReport({ targets }: { targets: { kind: string; label: string; value: string }[] }) {
  const router = useRouter();
  const { user, toast } = useApp();
  const params = useSearchParams();
  const [targetType, setTargetType] = useState<'ANIMAL' | 'BREEDER' | 'USER' | 'MESSAGE'>((params.get('type') as never) || 'ANIMAL');
  const [targetId, setTargetId] = useState(params.get('target') ?? '');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<string | null>(null);

  async function submit() {
    if (!user) {
      router.push('/login?next=/report');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ reportId: string; message: string }>('reports', { targetType, targetId: targetId.trim(), reason, details });
      setFiled(res.reportId);
      toast(res.message, { tone: 'success' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Report not filed.');
    } finally {
      setBusy(false);
    }
  }

  if (filed) {
    return (
      <div className="px-5 pb-10 pt-16 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--success)] text-white">
          <Icon name="check" size={22} />
        </span>
        <h1 className="h2 mt-4">Report filed</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
          Case <span className="mono">{filed}</span> is with the trust &amp; safety desk. You will get a notification when it is decided.
        </p>
        <Link href="/explore" className="btn btn-block mt-5">
          Back to browsing
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <MobileHeader title="Report" back="/" />
      <div className="space-y-3 px-4 pt-3">
        <section className="card p-4">
          <p className="label">What are you reporting</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['ANIMAL', 'BREEDER', 'USER', 'MESSAGE'] as const).map((t) => (
              <button key={t} className={`rounded-lg border p-3 text-left text-[13.5px] ${targetType === t ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`} onClick={() => setTargetType(t)}>
                {t === 'ANIMAL' ? 'A listing' : t === 'BREEDER' ? 'A breeder' : t === 'USER' ? 'A person' : 'A message'}
              </button>
            ))}
          </div>
          <input
            className="input mt-2.5 h-12"
            placeholder="paste link, name or id"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            list="m-targets"
          />
          <datalist id="m-targets">
            {targets.filter((t) => t.kind === targetType).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </datalist>
        </section>

        <section className="card p-4">
          <p className="label">Reason</p>
          <ul className="mt-2 space-y-2">
            {REASONS.map(([value, label]) => (
              <li key={value}>
                <button className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-[13.5px]" style={{ borderColor: reason === value ? 'var(--ink)' : 'var(--line)', background: reason === value ? 'var(--surface-2)' : undefined }} onClick={() => setReason(value)}>
                  {label}
                  {reason === value ? <Icon name="check" size={16} className="text-[var(--success)]" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <p className="label">Details</p>
          <textarea className="textarea mt-2" rows={4} placeholder="What happened, and when." value={details} onChange={(e) => setDetails(e.target.value)} />
        </section>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>

      <div className="sticky-cta-single">
        <button className="btn btn-block" onClick={submit} disabled={busy || !reason || !targetId.trim()}>
          {busy ? 'Filing…' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}
