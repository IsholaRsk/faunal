'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NumberBox } from '@/components/desktop/explore';
import type { FilterState } from '@/domain/types';
import type { Facets } from '@/components/desktop/explore';

/**
 * MOBILE filter form (spec §12) — the same FilterState object the desktop rail
 * mutates, presented as stacked app sections inside a full-height sheet.
 */
export function MobileFilterForm({ facets, initial, onApply }: { facets: Facets; initial: FilterState; onApply: (f: FilterState) => void }) {
  const [local, setLocal] = useState<FilterState>(initial);
  const set = (patch: Partial<FilterState>) => setLocal((prev) => ({ ...prev, ...patch }));

  return (
    <div className="pb-1">
      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {facets.categories.map((c) => (
            <button key={c.value} className="chip" data-active={local.category === c.value} onClick={() => set({ category: local.category === c.value ? undefined : c.value })}>
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Species">
        <select className="select" value={local.species ?? ''} onChange={(e) => set({ species: e.target.value || undefined })}>
          <option value="">Any species</option>
          {facets.species.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.count})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Morph">
        <select className="select" value={local.morph ?? ''} onChange={(e) => set({ morph: e.target.value || undefined })}>
          <option value="">Any morph</option>
          {facets.morphs.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} ({m.count})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sex">
        <div className="grid grid-cols-3 gap-2">
          {(['ANY', 'FEMALE', 'MALE'] as const).map((s) => (
            <button
              key={s}
              className="chip justify-center"
              data-active={(local.sex ?? 'ANY') === s}
              onClick={() => set({ sex: s === 'ANY' ? undefined : (s as FilterState['sex']) })}
            >
              {s === 'ANY' ? 'Any' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Price (USD)">
        <div className="flex items-end gap-3">
          <NumberBox label="Min" value={local.minPrice} onChange={(v) => set({ minPrice: v })} />
          <span className="pb-3 text-[var(--muted)]">—</span>
          <NumberBox label="Max" value={local.maxPrice} onChange={(v) => set({ maxPrice: v })} />
        </div>
        <input type="range" className="range mt-3" min={0} max={15000} step={50} value={local.maxPrice ?? 15000} onChange={(e) => set({ maxPrice: Number(e.target.value) })} />
        <p className="field-hint">
          ${local.minPrice ?? 0} — ${(local.maxPrice ?? 15000).toLocaleString()} · catalogue {Math.round((facets.price.min_cents ?? 0) / 100)}–
          {Math.round((facets.price.max_cents ?? 0) / 100).toLocaleString()}
        </p>
      </Field>

      <Field label="Location">
        <select className="select" value={local.state ?? ''} onChange={(e) => set({ state: e.target.value || undefined })}>
          <option value="">Anywhere in the U.S.</option>
          {facets.states.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.count})
            </option>
          ))}
        </select>
        <p className="field-hint">Prohibited species for your state stay hidden even when this is unset.</p>
      </Field>

      <Field label="Experience level">
        <div className="flex flex-wrap gap-2">
          {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const).map((x) => (
            <button key={x} className="chip" data-active={local.experience === x} onClick={() => set({ experience: local.experience === x ? undefined : x })}>
              {x.charAt(0) + x.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Adult size">
        <div className="grid grid-cols-3 gap-2">
          {(['SMALL', 'MEDIUM', 'LARGE'] as const).map((s) => (
            <button key={s} className="chip justify-center" data-active={local.size === s} onClick={() => set({ size: local.size === s ? undefined : s })}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Age (months)">
        <div className="flex items-end gap-3">
          <NumberBox label="Min age" prefix="" value={local.minAgeMonths} onChange={(v) => set({ minAgeMonths: v })} />
          <NumberBox label="Max age" prefix="" value={local.maxAgeMonths} onChange={(v) => set({ maxAgeMonths: v })} />
        </div>
      </Field>

      <Field label="Seller & availability">
        <Toggle label="Verified breeder only" checked={!!local.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} />
        <Toggle label="Available now" checked={local.availableOnly !== false} onChange={(v) => set({ availableOnly: v })} />
        <Toggle label="Captive-bred only" checked={!!local.captiveBredOnly} onChange={(v) => set({ captiveBredOnly: v })} />
      </Field>

      <div className="mt-5 flex gap-3">
        <button className="btn btn-quiet flex-1" onClick={() => setLocal({})}>
          Clear all
        </button>
        <button className="btn flex-1" onClick={() => onApply(local)}>
          Apply filters
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--line)] py-4 first:pt-0 last:border-0">
      <div className="mb-2.5 text-[13px] font-semibold tracking-[-0.01em]">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="mb-1.5 flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3.5 py-3 text-left text-[14px]" onClick={() => onChange(!checked)}>
      {label}
      <span className={`relative h-[26px] w-[44px] rounded-full transition ${checked ? 'bg-[var(--ink)]' : 'bg-[var(--surface-2)]'}`}>
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[21px]' : 'left-[3px]'}`} />
      </span>
    </button>
  );
}
