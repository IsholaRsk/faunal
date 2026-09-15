'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, Badge, ComplianceBadge, EmptyState } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { useApp } from '@/lib/ui/app-provider';
import { del, patch } from '@/lib/ui/api';
import type { CartShape } from '@/components/desktop/cart';
import { titleCase } from '@/domain/util';

/**
 * MOBILE cart — app list rows, a bottom sheet for the transport choice, and a
 * single sticky CTA. Blocked lines are visually dimmed and excluded from the
 * total, with the reason one tap away (spec §13 / §20).
 */
export function MobileCart({ signedIn, cart, available = 0 }: { signedIn: boolean; cart?: CartShape; available?: number }) {
  const { refresh, toast, setBadges } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div>
        <MobileHeader title="Cart" />
        <div className="px-4 py-10">
          <EmptyState
            icon="cart"
            title="Sign in to see your cart"
            body="Your cart syncs with the FAUNAL website — same account, same animals, same legality."
            action={
              <div className="flex w-full flex-col gap-2">
                <Link href="/login?next=/cart" className="btn btn-block">
                  Sign in
                </Link>
                <Link href="/signup" className="btn btn-quiet btn-block">
                  Create an account
                </Link>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const lines = cart?.lines ?? [];
  const blocked = lines.filter((l) => l.listing_blocked || !l.legal.canBuy);

  async function remove(id: string) {
    setBusyId(id);
    try {
      await del(`cart/${id}`);
      setBadges({ cart: Math.max(0, lines.length - 1) });
      refresh();
      toast('Removed from cart');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function choose(id: string, method: string) {
    setBusyId(id);
    setSheet(null);
    try {
      await patch(`cart/${id}`, { shipping_method: method });
      refresh();
      toast('Transport updated');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Not permitted on this route', { tone: 'warn' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pb-2">
      <MobileHeader title="Cart" subtitle={lines.length ? `${lines.length} animal${lines.length === 1 ? '' : 's'}` : undefined} />

      {!lines.length ? (
        <div className="px-4 py-8">
          <EmptyState
            icon="cart"
            title="Your cart is empty"
            body={`Browse ${available} animals that are legal where you live. Added animals are held briefly — each listing is a single animal.`}
            action={
              <Link href="/explore" className="btn">
                Explore animals
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="px-4">
            {blocked.length ? (
              <div className="mt-3 flex gap-2 rounded-lg border border-[var(--warning)]/35 bg-[rgba(154,123,69,.08)] p-3 text-[12.5px] leading-relaxed">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
                <span>
                  {blocked.length} animal{blocked.length === 1 ? '' : 's'} cannot be shipped to your destination. Fix the paperwork or remove{' '}
                  {blocked.length === 1 ? 'it' : 'them'} — the total excludes {blocked.length === 1 ? 'it' : 'them'}.
                </span>
              </div>
            ) : null}

            <ul className="mt-3 space-y-2.5">
              {lines.map((l) => {
                const isBlocked = l.listing_blocked || !l.legal.canBuy;
                return (
                  <li key={l.id} className={`card p-3 ${isBlocked ? 'opacity-70' : ''}`}>
                    <div className="flex gap-3">
                      <Link href={`/animals/${l.slug}`} className="w-20 shrink-0 overflow-hidden rounded-lg">
                        <Media media={{ path_medium: l.image, path_small: l.image, base_path: null }} alt={l.name} ratio="1 / 1" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/animals/${l.slug}`} className="text-[14.5px] font-medium leading-tight">
                            {l.name}
                          </Link>
                          <Money cents={l.line_cents} />
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                          {l.species_name}
                          {l.morph_name ? ` · ${l.morph_name}` : ''}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                          {l.business_name} · {l.state} · 1 of 1
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <ComplianceBadge verdict={l.legal.verdict} />
                          <button className="icon-btn h-8 w-8" aria-label="Remove" onClick={() => remove(l.id)} disabled={busyId === l.id}>
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-left"
                      onClick={() => setSheet(l.id)}
                    >
                      <span className="text-[12.5px]">
                        <span className="text-[var(--muted)]">Transport · </span>
                        {titleCase(l.shipping_method)}
                      </span>
                      <Icon name="chevronRight" size={15} className="text-[var(--muted)]" />
                    </button>

                    {l.legal.missingDocuments.length ? (
                      <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--warning)]">
                        <Icon name="doc" size={13} className="mt-0.5 shrink-0" />
                        Waiting on {l.legal.missingDocuments.map((d) => titleCase(d)).join(', ')}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
                <span>Animals</span>
                <span>{lines.length}</span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-[13px] text-[var(--muted)]">Subtotal</span>
                <Money cents={cart?.subtotal_cents ?? 0} size="lg" />
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
                Transport, tax and the escrow fee are grouped per breeder at checkout — one order per breeder keeps the paperwork clean.
              </p>
            </div>

            <Link href="/animals" className="mt-3 flex items-center justify-center gap-1.5 py-3 text-[13px] text-[var(--muted)]">
              <Icon name="plus" size={14} /> Keep browsing
            </Link>
          </div>

          <div className="sticky-cta sticky-cta-single mt-2">
            {cart?.checkout_ready ? (
              <Link href="/checkout" className="btn btn-block">
                Checkout · <span className="mono">{`$${((cart?.subtotal_cents ?? 0) / 100).toFixed(cart?.subtotal_cents % 100 ? 2 : 0)}`}</span>
              </Link>
            ) : (
              <button className="btn btn-block" disabled>
                <Icon name="lock" size={15} /> {lines.length ? 'Resolve blocked animals' : 'Nothing to check out'}
              </button>
            )}
          </div>

          <Sheet
            open={!!sheet}
            onClose={() => setSheet(null)}
            title="Transport method"
            footer={
              <button className="btn btn-quiet btn-block" onClick={() => setSheet(null)}>
                Keep current method
              </button>
            }
          >
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              The compliance engine decides which methods are permitted for this species, route and paperwork — a method that is not listed here
              cannot be selected.
            </p>
            <ul className="mt-3 space-y-2">
              {(lines.find((l) => l.id === sheet)?.legal.allowedMethods ?? []).map((m) => (
                <li key={m}>
                  <button
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] p-3.5 text-left"
                    onClick={() => sheet && choose(sheet, m)}
                  >
                    <span className="text-[14px]">{titleCase(m)}</span>
                    <Icon name="check" size={16} className="opacity-0" />
                  </button>
                </li>
              ))}
              {lines.find((l) => l.id === sheet)?.legal.blockedMethods.map((b) => (
                <li key={b.method} className="flex items-start gap-2 rounded-lg bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  <Icon name="ban" size={14} className="mt-0.5 shrink-0 text-[var(--error)]" />
                  <span>
                    <span className="font-medium text-[var(--ink)]">{titleCase(b.method)}</span> blocked — {b.reason}
                  </span>
                </li>
              ))}
            </ul>
          </Sheet>
        </>
      )}
    </div>
  );
}
