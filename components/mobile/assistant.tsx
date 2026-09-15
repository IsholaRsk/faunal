'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, Badge } from '@/components/ui/primitives';
import { post } from '@/lib/ui/api';
import { money, titleCaseOr } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;
interface Turn {
  role: 'user' | 'ai';
  text: string;
  cards?: Row[];
  guidance?: string[];
  complianceNote?: string | null;
}

const STARTERS = ['Legally keepable in a small apartment?', 'Beginner gecko under $300', 'Can I buy a sugar glider in CA?', 'Ball pythons shipping to NY'];

/** MOBILE assistant — chat-first screen, results as inline cards, sticky composer. */
export function MobileAssistant({ stateCode, cards: initial }: { stateCode: string | null; cards: Row[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Row[]>(initial);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function ask(prompt = input) {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    try {
      const res = await post<{ reply: string; guidance: string[]; complianceNote: string | null; cards: Row[] }>('assistant', { prompt: text });
      setTurns((t) => [...t, { role: 'ai', text: res.reply, cards: res.cards, guidance: res.guidance, complianceNote: res.complianceNote }]);
      if (res.cards?.length) setSuggestions(res.cards);
    } catch (e) {
      setTurns((t) => [...t, { role: 'ai', text: e instanceof Error ? e.message : 'Assistant unavailable.', cards: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <MobileHeader title="Ask FAUNAL" subtitle={stateCode ? `rulebook for ${stateCode}` : 'set your state for exact answers'} back="/" />

      <div className="flex-1 space-y-3 px-4 pb-3 pt-2">
        {!turns.length ? (
          <>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-[13.5px] leading-relaxed">
                I search the catalogue and read the compliance rulebook for your address. I can tell you what is available and what paperwork is missing —
                I cannot approve anything.
              </p>
            </div>
            <p className="label">Start with</p>
            <ul className="space-y-2">
              {STARTERS.map((s) => (
                <li key={s}>
                  <button className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left text-[13.5px]" onClick={() => ask(s)}>
                    {s}
                    <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--ink)] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">{t.text}</p>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              <div className="rounded-2xl rounded-bl-md bg-[var(--surface)] p-3.5 text-[13.5px] leading-relaxed whitespace-pre-wrap">{t.text}</div>
              {t.complianceNote ? (
                <p className="flex gap-2 rounded-xl border border-[var(--warning)]/40 bg-[rgba(154,123,69,.08)] p-3 text-[12px] leading-relaxed">
                  <Icon name="scale" size={14} className="mt-0.5 shrink-0" />
                  {t.complianceNote}
                </p>
              ) : null}
              {t.guidance?.length ? (
                <ul className="space-y-1.5">
                  {t.guidance.map((g) => (
                    <li key={g} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                      <Icon name="check" size={13} className="mt-0.5 shrink-0 text-[var(--success)]" />
                      {g}
                    </li>
                  ))}
                </ul>
              ) : null}
              {t.cards?.length ? (
                <ul className="space-y-2">
                  {t.cards.slice(0, 2).map((c) => (
                    <li key={String(c.id)}>
                      <Link href={`/animals/${String(c.slug)}`} className="card flex items-center gap-3 p-3">
                        <Media media={{ path_medium: c.image_medium as string, path_small: c.image_small as string, base_path: c.base_path as string }} alt={String(c.name)} ratio="1 / 1" className="w-12 rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{String(c.name)}</span>
                          <span className="block truncate text-[11.5px] text-[var(--muted)]">{String(c.species_name)} · {titleCaseOr(String(c.verdict ?? 'allowed'))}</span>
                        </span>
                        <Money cents={Number(c.price_cents)} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {suggestions.length ? (
        <div className="px-4 pb-2">
          <p className="label">Matches</p>
          <div className="hscroll flex gap-2 pt-1">
            {suggestions.slice(0, 8).map((c) => (
              <Link key={String(c.id)} href={`/animals/${String(c.slug)}`} className="w-[132px] shrink-0">
                <Media media={{ path_medium: c.image_medium as string, path_small: c.image_small as string, base_path: c.base_path as string }} alt={String(c.name)} ratio="1 / 1" className="rounded-lg" />
                <p className="mt-1 truncate text-[12px] font-medium">{String(c.name)}</p>
                <p className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>{money(Number(c.price_cents))}</span>
                  {c.verdict === 'PROHIBITED' ? <Badge tone="bad">blocked</Badge> : null}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-4 pb-[calc(10px+var(--safe-bottom))] pt-2.5 backdrop-blur">
        <div className="flex items-end gap-2">
          <input className="input h-11 flex-1" placeholder="Ask anything about legality or stock…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
          <button className="btn h-11 px-4" onClick={() => ask()} disabled={busy || !input.trim()}>
            {busy ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="sparkle" size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
