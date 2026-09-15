'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { post, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { titleCaseOr } from '@/lib/ui/screen-helpers';

const DOCS = ['BREEDER_LICENSE', 'PROOF_OF_ORIGIN', 'HEALTH_CERTIFICATE', 'PERMIT', 'CITES'] as const;

/** DESKTOP application — a three-stage form: identity, licence evidence, review. */
export function DesktopApply({ states, city, email, name, already }: { states: { code: string; name: string }[]; city: string; email: string; name: string; already: boolean }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ businessName: '', city, state: 'NY', licenseNumber: '', bio: '', yearsActive: '3' });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (already) {
    return (
      <div className="shell py-20">
        <EmptyState icon="store" title="You already have a breeder account" body="Your applications and listings live in the seller desk, where new paperwork can be uploaded at any time." action={<Link href="/seller" className="btn">Open the seller desk</Link>} />
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const documents: { doc_type: string; documentId: string }[] = [];
      for (const [type, file] of Object.entries(files)) {
        if (!file) continue;
        const fd = new FormData();
        fd.set('file', file);
        fd.set('doc_type', type);
        const up = await post<{ documentId: string }>('documents', fd);
        documents.push({ doc_type: type, documentId: up.documentId });
      }
      if (!documents.length) throw new ApiError('Attach at least your state licence or permit.', 'NO_DOCS', 400);
      await post('seller/apply', {
        businessName: form.businessName,
        city: form.city,
        state: form.state,
        licenseNumber: form.licenseNumber || undefined,
        bio: form.bio,
        yearsActive: Number(form.yearsActive || 0),
        documents,
      });
      toast('Application filed — the desk replies within 24 hours', { tone: 'success' });
      refresh();
      router.push('/seller');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The application could not be filed.');
      setBusy(false);
    }
  }

  const stepOk = [
    () => form.businessName.trim().length > 2 && !!form.city.trim(),
    () => !!form.bio.trim(),
    () => true,
  ][step]();

  return (
    <div className="shell py-10">
      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-12">
        <div>
          <p className="eyebrow">Selling on FAUNAL</p>
          <h1 className="h1 mt-2 max-w-[20ch]">Prove the paperwork once. Sell with it everywhere.</h1>
          <p className="lede mt-3 max-w-[58ch]">
            We verify who you are, what you are licensed to keep and sell, and where. After that your listings inherit the proof — and every buyer sees
            the same verdict you do.
          </p>

          <ol className="mt-7 flex gap-2">
            {['Business', 'Licence & documents', 'Review'].map((label, i) => (
              <li key={label} className="flex-1">
                <button className={`w-full rounded-lg border px-3.5 py-2.5 text-left ${i === step ? 'border-[var(--ink)] bg-[var(--surface-2)]' : i < step ? 'border-[var(--line)]' : 'border-dashed border-[var(--line)]'}`} onClick={() => i <= step && setStep(i)}>
                  <span className="mono text-[10.5px] text-[var(--muted)]">0{i + 1}</span>
                  <span className={`block text-[13px] ${i === step ? 'font-medium' : 'text-[var(--muted)]'}`}>{label}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 0 ? (
            <div className="card mt-5 grid grid-cols-2 gap-4 p-6">
              <Field label="Business name" value={form.businessName} onChange={(v) => set('businessName', v)} placeholder="Empire Reptile Works" />
              <Field label="Contact email" value={email} onChange={() => undefined} hint="Verified from your account" />
              <Field label="City" value={form.city} onChange={(v) => set('city', v)} />
              <label className="block">
                <span className="label">State of operation</span>
                <select className="select mt-1 h-11" value={form.state} onChange={(e) => set('state', e.target.value)}>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Years keeping these taxa" value={form.yearsActive} onChange={(v) => set('yearsActive', v.replace(/\D/g, ''))} />
              <div className="col-span-2">
                <label className="block">
                  <span className="label">How you operate (shown on your storefront)</span>
                  <textarea className="textarea mt-1" rows={4} value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Captive-bred only, 40 enclosures, quarantine room, shipped via licensed live-freight." />
                </label>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="card mt-5 p-6">
              <Field label="Licence or permit number" value={form.licenseNumber} onChange={(v) => set('licenseNumber', v)} hint="Exactly as printed — the desk checks it against the issuing agency." placeholder="NY-DW-2291" />
              <p className="mt-5 label">Attach what you hold</p>
              <ul className="mt-2 space-y-2">
                {DOCS.map((type) => (
                  <li key={type} className="grid grid-cols-[210px_minmax(0,1fr)_90px] items-center gap-3">
                    <span className="text-[13px]">{titleCaseOr(type)}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="input h-10 py-0 text-[12.5px]"
                      onChange={(e) => setFiles((f) => ({ ...f, [type]: e.target.files?.[0] ?? null }))}
                    />
                    <span className="text-[11.5px] text-[var(--muted)]">{files[type] ? 'ready' : 'optional'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">
                Files go to the private vault the moment you attach them; they are never shown on your storefront. At least one authorising document is
                required to start verification.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="card mt-5 p-6">
              <p className="label">Review</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
                {[
                  ['Business', form.businessName || '—'],
                  ['Location', `${form.city || '—'}, ${form.state}`],
                  ['Licence', form.licenseNumber || '—'],
                  ['Experience', `${form.yearsActive || 0} years`],
                  ['Documents', `${Object.values(files).filter(Boolean).length} attached`],
                  ['Storefront', 'created as a draft until you are approved'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-[var(--line)] pb-1.5">
                    <dt className="text-[var(--muted)]">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--muted)]">
                <span className="font-medium text-[var(--ink)]">Bio:</span> {form.bio || 'Not written yet — approved sellers with a bio get more enquiries.'}
              </p>
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <button className="btn btn-lg mt-5 w-full" onClick={submit} disabled={busy}>
                {busy ? 'Filing…' : 'Submit application'}
              </button>
            </div>
          ) : null}

          {step < 2 ? (
            <div className="mt-4 flex items-center justify-between">
              <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                <Icon name="back" size={15} /> Back
              </button>
              <button className="btn" onClick={() => stepOk && setStep((s) => s + 1)} disabled={!stepOk}>
                Continue <Icon name="chevronRight" size={15} />
              </button>
            </div>
          ) : null}
          {error && step < 2 ? <ErrorNote>{error}</ErrorNote> : null}
        </div>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-6">
            <p className="label">What verification unlocks</p>
            <ul className="mt-3 space-y-2.5 text-[13px]">
              {[
                'Listings publish with your documents attached',
                'A verified mark on every one of your animals',
                'Escrow payouts 48 h after the buyer confirms arrival',
                'Featured placement and a themed storefront',
              ].map((t) => (
                <li key={t} className="flex gap-2 leading-relaxed">
                  <Icon name="check" size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-quiet p-6 text-[12.5px] leading-relaxed text-[var(--muted)]">
            <p className="label">What gets you rejected</p>
            <ul className="mt-2 space-y-2">
              {[
                'A licence that does not cover the taxa you list',
                'Photos that are not yours or not this animal',
                'Wild-caught animals without CITES and import proof',
                'Any offer to settle payment outside FAUNAL',
              ].map((t) => (
                <li key={t} className="flex gap-2 leading-relaxed">
                  <Icon name="close" size={13} className="mt-0.5 shrink-0 text-[var(--error)]" />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/compliance/documents" className="link mt-3 inline-block">
              Read the documentation standards
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="ok" icon="shield">Desk review in 24 h</Badge>
            <Badge>Mon–Sat</Badge>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-1 h-11" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
