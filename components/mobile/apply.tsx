'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { EmptyState, ErrorNote } from '@/components/ui/primitives';
import { post, ApiError } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { titleCaseOr } from '@/lib/ui/screen-helpers';

const DOCS = ['BREEDER_LICENSE', 'PROOF_OF_ORIGIN', 'HEALTH_CERTIFICATE', 'PERMIT', 'CITES'] as const;

/** MOBILE application — one card per question, sticky submit, files from the phone. */
export function MobileApply({ states, city, email, already }: { states: { code: string; name: string }[]; city: string; email: string; name: string; already: boolean }) {
  const router = useRouter();
  const { toast, refresh } = useApp();
  const [form, setForm] = useState({ businessName: '', city, state: 'NY', licenseNumber: '', bio: '', yearsActive: '3' });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (already) {
    return (
      <div>
        <MobileHeader title="Sell on FAUNAL" back="/profile" />
        <div className="px-4 py-8">
          <EmptyState icon="store" title="You already sell here" body="Your verification and documents live in the seller desk." action={<Link href="/seller" className="btn">Open seller desk</Link>} />
        </div>
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
      if (!documents.length) throw new ApiError('Attach at least your licence or permit.', 'NO_DOCS', 400);
      await post('seller/apply', { ...form, yearsActive: Number(form.yearsActive || 0), licenseNumber: form.licenseNumber || undefined, documents });
      toast('Application filed', { tone: 'success' });
      refresh();
      router.push('/seller');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not file the application.');
      setBusy(false);
    }
  }

  return (
    <div className="pb-24">
      <MobileHeader title="Become a breeder" subtitle="Takes about 10 minutes" back="/profile" />
      <div className="space-y-3 px-4 pt-3">
        <section className="card space-y-2.5 p-4">
          <p className="label">Your operation</p>
          <MField label="Business name" value={form.businessName} onChange={(v) => set('businessName', v)} />
          <MField label="City" value={form.city} onChange={(v) => set('city', v)} />
          <label className="block">
            <span className="label">State</span>
            <select className="select mt-1 h-12" value={form.state} onChange={(e) => set('state', e.target.value)}>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <MField label="Years keeping these taxa" value={form.yearsActive} onChange={(v) => set('yearsActive', v.replace(/\D/g, ''))} />
        </section>

        <section className="card space-y-2.5 p-4">
          <p className="label">Licence</p>
          <MField label="Licence or permit number" value={form.licenseNumber} onChange={(v) => set('licenseNumber', v)} placeholder="NY-DW-2291" />
          {DOCS.map((type) => (
            <label key={type} className="block">
              <span className="label">{titleCaseOr(type)} {files[type] ? '· attached' : '· optional'}</span>
              <input type="file" accept="application/pdf,image/*" className="input mt-1 h-12 py-0 text-[13px]" onChange={(e) => setFiles((f) => ({ ...f, [type]: e.target.files?.[0] ?? null }))} />
            </label>
          ))}
          <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">Uploaded straight to the private vault — never shown on your storefront.</p>
        </section>

        <section className="card p-4">
          <p className="label">Storefront bio</p>
          <textarea className="textarea mt-2" rows={4} value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Captive-bred only, quarantine room, licensed live-freight…" />
          <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">Contact email on file: {email}</p>
        </section>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>

      <div className="sticky-cta-single">
        <button className="btn btn-block" onClick={submit} disabled={busy || form.businessName.trim().length < 3}>
          {busy ? 'Filing…' : 'Submit application'}
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}

function MField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-1 h-12" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
