'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Avatar, Badge, EmptyState, VerifiedMark } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { relTime } from '@/lib/ui/screen-helpers';
import type { ThreadData } from '@/components/desktop/inbox';

type Row = Record<string, string | number | null>;

export function MobileInbox({ conversations }: { conversations: Row[] }) {
  return (
    <div className="pb-6">
      <MobileHeader title="Messages" subtitle={conversations.length ? `${conversations.length} threads` : undefined} />
      {!conversations.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="chat" title="No conversations" body="Contact a breeder from any listing to ask about the animal, its paperwork or the handoff." action={<Link href="/explore" className="btn">Explore animals</Link>} />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {conversations.map((c) => (
            <li key={String(c.id)}>
              <Link href={`/messages/${String(c.id)}`} className="flex items-start gap-3 px-4 py-3.5">
                <Avatar name={String(c.counterparty_name ?? '?')} src={c.counterparty_avatar ? String(c.counterparty_avatar) : null} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{String(c.counterparty_name ?? 'Conversation')}</span>
                    {c.breeder_tier ? <VerifiedMark tier={String(c.breeder_tier)} /> : null}
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">{relTime(String(c.last_message_at ?? c.created_at))}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[var(--muted)]">{String(c.last_body ?? '')}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    {c.animal_name ? (
                      <Badge icon="paw">
                        {String(c.animal_name)}
                      </Badge>
                    ) : null}
                    {Number(c.unread) > 0 ? <Badge tone="ink">{Number(c.unread)} new</Badge> : null}
                    {Number(c.risk_count) > 0 ? (
                      <Badge tone="warn" icon="alert">
                        safety notice
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileThread({ data }: { data: ThreadData }) {
  const { toast, refresh } = useApp();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const other = data.other ?? {};

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data.messages.length]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await post('messages', { conversationId: String(data.conversation.id), body: body.trim() });
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
    setSheet(false);
    try {
      await post('blocks', { userId: String(other.id) });
      toast('User blocked', { tone: 'warn' });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not block', { tone: 'error' });
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <MobileHeader
        title={String(other.business_name ?? `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim())}
        subtitle={data.animal ? `re: ${String(data.animal.name)}` : 'FAUNAL chat'}
        back="/messages"
        actions={
          <button className="icon-btn" onClick={() => setSheet(true)} aria-label="Conversation options">
            <Icon name="menu" size={18} />
          </button>
        }
      />

      <div className="flex-1 space-y-2.5 px-4 py-3">
        {data.messages.map((m) => (
          <div key={String(m.id)} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${m.mine ? 'rounded-br-md bg-[var(--ink)] text-white' : 'rounded-bl-md bg-[var(--surface)]'}`}>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{String(m.body)}</p>
              <p className={`mt-1 text-[10.5px] ${m.mine ? 'text-white/60' : 'text-[var(--muted)]'}`}>
                {relTime(String(m.created_at))}
                {m.read_at ? ' · read' : ''}
              </p>
            </div>
          </div>
        ))}
        {data.messages.some((m) => (m.flags as unknown as string[])?.length) ? (
          <div className="flex gap-2 rounded-xl border border-[var(--warning)]/40 bg-[rgba(154,123,69,.08)] p-3 text-[12px] leading-relaxed">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
            <span>
              A request to pay outside FAUNAL was detected. Off-platform payments are not covered by buyer protection — keep the transaction here.
            </span>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-4 pb-[calc(10px+var(--safe-bottom))] pt-2.5 backdrop-blur">
        <div className="flex items-end gap-2">
          <input
            className="input h-11 flex-1"
            placeholder="Message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn h-11 px-4" onClick={send} disabled={busy || !body.trim()}>
            <Icon name="share" size={17} />
          </button>
        </div>
        <div className="hscroll mt-2 flex gap-1.5">
          {['Fresh video?', 'Ship to my state?', 'Setup included?'].map((q) => (
            <button key={q} className="chip" onClick={() => setBody(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Conversation">
        <ul className="space-y-2">
          {data.animal?.slug ? (
            <li>
              <Link href={`/animals/${String(data.animal.slug)}`} className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] p-3.5 text-[14px]">
                Open the listing <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
              </Link>
            </li>
          ) : null}
          {other.slug ? (
            <li>
              <Link href={`/breeders/${String(other.slug)}`} className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] p-3.5 text-[14px]">
                Breeder storefront <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
              </Link>
            </li>
          ) : null}
          <li>
            <Link href="/report" className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] p-3.5 text-[14px]">
              Report this conversation <Icon name="flag" size={16} className="text-[var(--muted)]" />
            </Link>
          </li>
          <li>
            <button className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] p-3.5 text-left text-[14px] text-[var(--error)]" onClick={block}>
              Block this user <Icon name="ban" size={16} />
            </button>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
