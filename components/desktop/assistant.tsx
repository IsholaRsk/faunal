'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, ComplianceBadge } from '@/components/ui/primitives';
import { post } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';
import { titleCaseOr, money } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

interface Turn {
  role: 'user' | 'ai';
  text: string;
  cards?: Row[];
  guidance?: string[];
  complianceNote?: string | null;
  filters?: Record<string, string | number | null>;
}

const STARTERS = [
  'What can I legally keep in an NYC apartment with no UVB budget?',
  'Find me a beginner-friendly gecko under $300 with a health certificate',
  'Can I buy a sugar glider in California?',
  'Which breeders near me have ball pythons ready this month?',
];

/**
 * DESKTOP assistant — a conversation column with a live results rail. Every
 * answer carries the compliance verdict; the model never overrides the rulebook.
 */
export function DesktopAssistant({ stateCode, cards: initial }: { stateCode: string | null; cards: Row[] }) {
  const { user } = useApp();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [rail, setRail] = useState<Row[]>(initial);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function ask(prompt = input) {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    try {
      const res = await post<{ reply: string; guidance: string[]; complianceNote: string | null; filters: Record<string, string | number | null>; cards: Row[] }>('assistant', { prompt: text });
      setTurns((t) => [...t, { role: 'ai', text: res.reply, cards: res.cards, guidance: res.guidance, complianceNote: res.complianceNote, filters: res.filters }]);
      if (res.cards?.length) setRail(res.cards);
    } catch (e) {
      setTurns((t) => [...t, { role: 'ai', text: e instanceof Error ? e.message : 'The assistant is unavailable right now.', cards: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 30);
    }
  }

  const last = [...turns].reverse().find((t) => t.role === 'ai');

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-10">
        <section className="card flex min-h-[620px] flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--line)] p-5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ink)] text-white">
              <Icon name="sparkle" size={17} />
            </span>
            <div className="flex-1">
              <p className="text-[15px] font-medium">FAUNAL assistant</p>
              <p className="text-[12px] text-[var(--muted)]">
                Reads the rulebook for {stateCode ? <span className="font-medium">{stateCode}</span> : 'your state'} — it can narrow a search, never clear a
                prohibition.
              </p>
            </div>
            <Link href="/compliance" className="btn btn-ghost btn-sm">
              Legality rules
            </Link>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-5" style={{ maxHeight: '58vh' }}>
            {!turns.length ? (
              <div className="pt-2">
                <p className="label">Try one of these</p>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {STARTERS.map((s) => (
                    <button key={s} className="rounded-lg border border-[var(--line)] p-3.5 text-left text-[13.5px] leading-snug transition-colors hover:border-[var(--ink)]" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <p className="mt-5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  The assistant is a retrieval layer over the catalogue and the compliance engine. It has no authority to publish, price, or approve
                  anything — every listing it shows you carries the same verdict a human moderator would see.
                </p>
              </div>
            ) : null}

            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[70%] rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[14px] leading-relaxed text-white">{t.text}</p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)]">
                    <Icon name="sparkle" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{t.text}</p>
                    {t.complianceNote ? (
                      <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-[rgba(154,123,69,.08)] p-3 text-[12.5px] leading-relaxed">
                        <Icon name="scale" size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
                        {t.complianceNote}
                      </p>
                    ) : null}
                    {t.guidance?.length ? (
                      <ul className="mt-2.5 space-y-1.5">
                        {t.guidance.map((g) => (
                          <li key={g} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                            <Icon name="check" size={13} className="mt-0.5 shrink-0 text-[var(--success)]" />
                            {g}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {t.filters && Object.keys(t.filters).length ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {Object.entries(t.filters).map(([k, v]) => (
                          <span key={k} className="chip">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {t.cards?.length ? (
                      <ul className="mt-3 space-y-2">
                        {t.cards.slice(0, 3).map((c) => (
                          <li key={String(c.id)}>
                            <Link href={`/animals/${String(c.slug)}`} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2.5 hover:border-[var(--ink)]">
                              <Media media={{ path_medium: c.image_medium as string, path_small: c.image_small as string, base_path: c.base_path as string }} alt={String(c.name)} ratio="1 / 1" className="w-11 rounded-md" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium">{String(c.name)} · {String(c.species_name)}</span>
                                <span className="block text-[11.5px] text-[var(--muted)]">{String(c.breeder_business ?? c.city ?? '')} · {titleCaseOr(String(c.verdict ?? 'ALLOWED'))}</span>
                              </span>
                              <Money cents={Number(c.price_cents)} size="sm" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ),
            )}
            {busy ? (
              <p className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                <Icon name="refresh" size={14} className="animate-spin" /> Reading the rulebook…
              </p>
            ) : null}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-[var(--line)] p-4">
            <div className="flex items-end gap-2">
              <textarea
                className="textarea flex-1"
                rows={2}
                placeholder="Ask about species, legality, setup or what is available in your state…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
              <button className="btn" onClick={() => ask()} disabled={busy || !input.trim()}>
                Ask
              </button>
            </div>
            {!user ? <p className="mt-2 text-[11.5px] text-[var(--muted)]">Answers use the state in your browser; sign in to use your saved address and favorites.</p> : null}
          </footer>
        </section>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-5">
            <p className="label">Matching listings</p>
            {rail.length ? (
              <ul className="mt-3 space-y-3">
                {rail.slice(0, 6).map((c) => (
                  <li key={String(c.id)} className="flex gap-3">
                    <Media media={{ path_medium: c.image_medium as string, path_small: c.image_small as string, base_path: c.base_path as string }} alt={String(c.name)} ratio="1 / 1" className="w-14 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/animals/${String(c.slug)}`} className="block truncate text-[13.5px] font-medium hover:underline">
                        {String(c.name)}
                      </Link>
                      <p className="truncate text-[11.5px] text-[var(--muted)]">{String(c.species_name)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Money cents={Number(c.price_cents)} size="sm" />
                        {c.verdict ? <ComplianceBadge verdict={String(c.verdict)} /> : <Badge>{titleCaseOr(String(c.availability))}</Badge>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">Ask a question and the listings the assistant found appear here, with the verdict attached.</p>
            )}
            {last?.filters ? (
              <Link href={`/animals?${new URLSearchParams(Object.entries(last.filters).map(([k, v]) => [k, String(v)]))}`} className="btn btn-quiet btn-sm mt-3 w-full">
                Open these filters in Browse
              </Link>
            ) : null}
          </div>

          <div className="card-quiet p-5 text-[12px] leading-relaxed text-[var(--muted)]">
            <p className="label">Guardrail</p>
            <p className="mt-1.5">
              The assistant is not a legal source. If it cannot match a species and your jurisdiction in the rulebook, it says so and routes the case to a
              human instead of guessing.
            </p>
            <p className="mt-2">
              Prices shown: {money(45000)}–{money(249900)} typical range for approved listings.
            </p>
          </div>

          {user ? (
            <button className="btn btn-ghost btn-sm w-full" onClick={() => router.push('/search')}>
              Prefer plain search?
            </button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
