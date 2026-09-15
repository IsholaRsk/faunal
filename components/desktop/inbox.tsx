'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Media, Avatar, Badge, EmptyState, VerifiedMark } from '@/components/ui/primitives';
import { Modal, ReportDialog } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { relTime, titleCaseOr, money } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

export function DesktopInbox({ conversations }: { conversations: Row[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [openNew, setOpenNew] = useState(false);
  const [to, setTo] = useState(params.get('to') ?? '');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ conversation: { id: string } }>('conversations', { sellerUserId: to, seed: seed || undefined });
      router.push(`/messages/${res.conversation.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open that conversation');
      setBusy(false);
    }
  }

  return (
    <div className="shell py-8">
      <header className="flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Breeder chat</p>
          <h1 className="h2 mt-1.5">Messages</h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--muted)]">
            Conversations stay on FAUNAL so orders, paperwork and disputes stay protected. Asking to move payment off-platform is flagged automatically.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => setOpenNew(true)}>
          <Icon name="chat" size={15} /> New conversation
        </button>
      </header>

      {!conversations.length ? (
        <div className="py-14">
          <EmptyState
            icon="chat"
            title="No conversations yet"
            body="Contact a breeder from any listing to ask about husbandry, paperwork or the handoff — they usually reply within a few hours."
            action={
              <Link href="/animals" className="btn">
                Browse animals
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {conversations.map((c) => (
            <li key={String(c.id)}>
              <Link href={`/messages/${String(c.id)}`} className="grid grid-cols-[44px_minmax(0,1fr)_160px] items-center gap-4 py-4 hover:bg-[var(--surface-2)]">
                <Avatar name={String(c.counterparty_name ?? '?')} src={c.counterparty_avatar ? String(c.counterparty_avatar) : null} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[14.5px] font-medium">
                    {String(c.counterparty_name ?? 'Conversation')}
                    {c.breeder_tier ? <VerifiedMark tier={String(c.breeder_tier)} /> : null}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{String(c.last_body ?? '')}</p>
                  {c.animal_name ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--muted)]">
                      <Icon name="paw" size={13} /> re: {String(c.animal_name)}
                      {c.price_cents ? ` · ${money(Number(c.price_cents))}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[12px] text-[var(--muted)]">{relTime(String(c.last_message_at ?? c.created_at))}</span>
                  {Number(c.unread) > 0 ? <Badge tone="ink">{Number(c.unread)} new</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {openNew ? (
        <Modal title="New conversation" onClose={() => setOpenNew(false)}>
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
            Paste a user id, or open a chat from a listing so the animal is attached automatically. From a listing, use the “Contact breeder” button.
          </p>
          <input className="input mt-3 h-11" placeholder="usr_…" value={to} onChange={(e) => setTo(e.target.value)} />
          <textarea className="textarea mt-2" rows={3} placeholder="Say what you need — setup size, paperwork, timing…" value={seed} onChange={(e) => setSeed(e.target.value)} />
          {error ? <p className="mt-2 text-[12.5px] text-[var(--error)]">{error}</p> : null}
          <button className="btn btn-block mt-3" onClick={start} disabled={busy || !to}>
            {busy ? 'Opening…' : 'Start chat'}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/** Thread — shared by the desktop route and the mobile route (mobile wraps it). */
export function DesktopThread({ data }: { data: ThreadData }) {
  const { toast, refresh } = useApp();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const conv = data.conversation;
  const other = data.other ?? {};

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data.messages.length]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await post('messages', { conversationId: String(conv.id), body: body.trim() });
      setBody('');
      refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Message not sent', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    try {
      await post('blocks', { userId: String(other.id) });
      toast('User blocked — they can no longer message you', { tone: 'warn' });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not block', { tone: 'error' });
    }
  }

  return (
    <div className="shell py-8">
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-8">
        <section className="card flex min-h-[560px] flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--line)] p-4">
            <Link href="/messages" className="icon-btn" aria-label="Back">
              <Icon name="back" size={18} />
            </Link>
            <Avatar name={String(other.first_name ?? other.business_name ?? '?')} src={other.avatar_path ? String(other.avatar_path) : null} size={38} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[14.5px] font-medium">
                {String(other.business_name ?? `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim())}
                {other.tier ? <VerifiedMark tier={String(other.tier)} /> : null}
              </p>
              <p className="text-[12px] text-[var(--muted)]">
                {other.city ? `${String(other.city)}, ${String(other.state)} · usually replies within hours` : 'FAUNAL member'}
              </p>
            </div>
            {data.isBlocked ? <Badge tone="bad">blocked</Badge> : <button className="btn btn-ghost btn-sm" onClick={block}>Block</button>}
            <ReportDialog targetType="USER" targetId={String(other.id ?? '')}>
              <button className="btn btn-ghost btn-sm">
                <Icon name="flag" size={14} /> Report
              </button>
            </ReportDialog>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ maxHeight: '58vh' }}>
            {data.messages.map((m) => (
              <div key={String(m.id)} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[72%] rounded-xl px-3.5 py-2.5 ${m.mine ? 'bg-[var(--ink)] text-white' : 'bg-[var(--surface-2)]'}`}>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{String(m.body)}</p>
                  <p className={`mt-1 text-[11px] ${m.mine ? 'text-white/60' : 'text-[var(--muted)]'}`}>
                    {relTime(String(m.created_at))}
                    {m.read_at ? ' · read' : ''}
                  </p>
                </div>
              </div>
            ))}
            {data.messages.some((m) => (m.flags as unknown as string[])?.length) ? (
              <div className="rounded-lg border border-[var(--warning)]/40 bg-[rgba(154,123,69,.08)] p-3 text-[12.5px] leading-relaxed">
                <p className="flex items-start gap-2">
                  <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
                  <span>
                    FAUNAL detected a request to move this conversation off-platform. Payments made outside the marketplace are not covered by buyer
                    protection, and the seller risk score was updated.
                  </span>
                </p>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-[var(--line)] p-4">
            <div className="flex items-end gap-2">
              <textarea
                className="textarea flex-1"
                rows={2}
                placeholder="Ask about the animal, paperwork or the handoff…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
                }}
              />
              <button className="btn" onClick={send} disabled={busy || !body.trim()}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Is the enclosure setup included?', 'Can I see a fresh video?', 'When could you ship to my state?'].map((q) => (
                <button key={q} className="chip" onClick={() => setBody(q)}>
                  {q}
                </button>
              ))}
            </div>
          </footer>
        </section>

        <aside className="space-y-4">
          {data.animal ? (
            <div className="card p-5">
              <p className="label">Listing in this thread</p>
              <Link href={`/animals/${String(data.animal.slug)}`} className="mt-3 flex gap-3">
                <Media media={{ path_medium: null, base_path: null }} alt={String(data.animal.name)} ratio="1 / 1" className="w-16 rounded-lg" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{String(data.animal.name)}</span>
                  <span className="block text-[12.5px] text-[var(--muted)]">{titleCaseOr(String(data.animal.availability))}</span>
                  <span className="mono mt-1 block text-[13px]">{money(Number(data.animal.price_cents))}</span>
                </span>
              </Link>
            </div>
          ) : null}
          <div className="card-quiet p-5">
            <p className="label">Safety</p>
            <ul className="mt-2 space-y-2">
              {[
                'Never pay a breeder outside FAUNAL — escrow only protects orders placed here.',
                'Keep transport and handoff arrangements in the chat so they are on record.',
                'Ask for a fresh video if the listing photos are older than 30 days.',
              ].map((t) => (
                <li key={t} className="flex gap-2 text-[12px] leading-relaxed text-[var(--muted)]">
                  <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export interface ThreadData {
  conversation: Row;
  other: Row | null;
  animal: Row | null;
  isBlocked: boolean;
  messages: (Row & { mine?: boolean; flags?: unknown })[];
}
