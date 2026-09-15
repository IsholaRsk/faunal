'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote } from '@/components/ui/primitives';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';

const REASONS = [
  ['ILLEGAL_SPECIES', 'Animal or sale looks illegal'],
  ['MISUSE_OF_FAUNAL', 'Prohibited conduct on the platform'],
  ['SCAM', 'Scam or payment requested off-platform'],
  ['STOLEN_IMAGES', 'Photos are not the seller’s own'],
  ['MISLEADING_LISTING', 'Description, health or lineage is misleading'],
  ['WELFARE', 'Animal welfare concern'],
  ['IMPERSONATION', 'Someone is pretending to be another seller'],
] as const;

/** DESKTOP report — a two-column intake form that files a real T&S case. */
export function DesktopReport({ targets }: { targets: { kind: string; label: string; value: string }[] }) {
  const router = useRouter();
  const { user, toast } = useApp();
  const params = useSearchParams();
  const [targetType, setTargetType] = useState<'ANIMAL' | 'BREEDER' | 'USER' | 'MESSAGE'>((params.get('type') as never) || 'ANIMAL');
  const [targetId, setTargetId] = useState(params.get('target') ?? '');
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<string | null>(null);

  async function submit() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/report?target=${targetId}&type=${targetType}`)}`);
      return;
    }
    if (!reason || !targetId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ reportId: string; message: string }>('reports', { targetType, targetId: targetId.trim(), reason, details });
      setFiled(res.reportId);
      toast(res.message, { tone: 'success' });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Report not filed.');
    } finally {
      setBusy(false);
    }
  }

  if (filed) {
    return (
      <div className="shell py-20">
        <div className="mx-auto max-w-[560px] card p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--success)] text-white">
            <Icon name="check" size={22} />
          </span>
          <h1 className="h2 mt-4">Report filed</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
            Case <span className="mono">{filed}</span> is open with the trust &amp; safety desk. A moderator reviews it within 24 hours; if we need the
            listing frozen sooner, we act on the report alone.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button className="btn btn-quiet" onClick={() => { setFiled(null); setReason(''); setDetails(''); }}>
              File another
            </button>
            <a href="/orders" className="btn">
              Back to browsing
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-10">
      <div className="grid grid-cols-[minmax(0,1fr)_330px] items-start gap-12">
        <div>
          <p className="eyebrow">Trust &amp; safety</p>
          <h1 className="h1 mt-2">Report a listing or a seller</h1>
          <p className="lede mt-3 max-w-[60ch]">
            Reports open a case in the moderation queue. Anything that touches legality or welfare is acted on before the marketplace waits for a reply.
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <p className="label">What are you reporting?</p>
              <div className="mt-2 flex gap-1.5">
                {(['ANIMAL', 'BREEDER', 'USER', 'MESSAGE'] as const).map((t) => (
                  <button key={t} className={`chip py-2 ${targetType === t ? 'bg-[var(--ink)] text-white' : ''}`} onClick={() => setTargetType(t)}>
                    {t === 'ANIMAL' ? 'A listing' : t === 'BREEDER' ? 'A breeder' : t === 'USER' ? 'A person' : 'A message'}
                  </button>
                ))}
              </div>
            </div>

            <label className="block max-w-[520px]">
              <span className="label">Which one</span>
              <input
                className="input mt-1 h-11"
                placeholder={targetType === 'ANIMAL' ? 'paste the listing URL or slug' : targetType === 'BREEDER' ? 'business name' : 'email or user id'}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                list="report-targets"
              />
              <datalist id="report-targets">
                {targets.filter((t) => t.kind === targetType).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </datalist>
              <span className="field-hint">
                From a listing page, the Report button in the menu fills this in for you.
              </span>
            </label>

            <div>
              <p className="label">Reason</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {REASONS.map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded-lg border p-3 text-left text-[13.5px] transition-colors ${reason === value ? 'border-[var(--ink)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--accent-soft)]'}`}
                    onClick={() => setReason(value)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {label}
                      {reason === value ? <Icon name="check" size={15} className="text-[var(--success)]" /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="label">What happened</span>
              <textarea
                className="textarea mt-1"
                rows={5}
                placeholder="Dates, what you were told, and anything you can attach or quote. Screenshots are not required — the chat record is already on file."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <button className="btn btn-lg" onClick={submit} disabled={busy || !reason || !targetId.trim()}>
              {busy ? 'Filing…' : 'Submit report'}
            </button>
          </div>
        </div>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-5">
            <p className="label">What happens next</p>
            <ol className="mt-2.5 space-y-2.5">
              {[
                'A moderator reads the report and the target together.',
                'Anything that looks illegal or unsafe is frozen first, questions later.',
                'The reported party is asked for their side, in writing, inside FAUNAL.',
                'You get the outcome by notification — not always the details.',
              ].map((t, i) => (
                <li key={t} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                  <span className="mono text-[11px] text-[var(--accent-soft)]">0{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <div className="card-quiet p-5 text-[12.5px] leading-relaxed text-[var(--muted)]">
            <p className="label">Not a report?</p>
            <p className="mt-1.5">
              For an animal already bought and in transit, open a dispute on the order instead — that freezes the escrow, which a report cannot do.
            </p>
            <a href="/orders" className="link mt-2 inline-block">
              Go to my orders
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
