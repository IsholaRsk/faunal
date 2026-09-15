'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, ComplianceBadge, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { useApp } from '@/lib/ui/app-provider';
import { del, patch } from '@/lib/ui/api';
import { titleCase } from '@/domain/util';

/**
 * DESKTOP cart — a wide two-column review table with a sticky summary.
 * Every line shows its own legality verdict because the marketplace forbids a
 * blind "checkout" button (spec §13 / §20).
 */
export function DesktopCart({ signedIn, cart, available = 0 }: { signedIn: boolean; cart?: CartShape; available?: number }) {
  const router = useRouter();
  const { refresh, toast, setBadges } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="shell py-20">
        <EmptyState
          icon="cart"
          title="Sign in to use your cart"
          body="Your cart, favorites, orders and messages live on your FAUNAL account — the same account you use in the mobile app."
          action={
            <div className="flex gap-2">
              <Link href="/login?next=/cart" className="btn">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-quiet">
                Create an account
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const lines = cart?.lines ?? [];
  const blocked = lines.filter((l) => l.listing_blocked || !l.legal.canBuy);

  async function remove(id: string) {
    setBusyId(id);
    try {
      await del(`cart/${id}`);
      setBadges({ cart: Math.max(0, (cart?.lines.length ?? 1) - 1) });
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove that line', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function setMethod(id: string, method: string) {
    setBusyId(id);
    try {
      await patch(`cart/${id}`, { shipping_method: method });
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That method is not permitted here', { tone: 'warn' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="shell py-8">
      <div className="flex items-end justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="eyebrow">Checkout step 1</p>
          <h1 className="h2 mt-1.5">Your cart</h1>
        </div>
        <Link href="/animals" className="btn btn-quiet btn-sm">
          <Icon name="back" size={15} /> Continue browsing
        </Link>
      </div>

      {!lines.length ? (
        <div className="py-16">
          <EmptyState
            icon="cart"
            title="Nothing in your cart yet"
            body="Animals you add stay here across the app and the website. Listings are held for a short window only — each animal is unique."
            action={
              <Link href="/animals" className="btn">
                Browse {available} animals
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-[minmax(0,1fr)_368px] items-start gap-10">
          <div>
            {blocked.length ? (
              <div className="mb-4">
                <ErrorNote tone="warn">
                  {blocked.length} line{blocked.length === 1 ? '' : 's'} in your cart cannot currently be shipped to your destination. They are
                  excluded from the total — resolve the paperwork, change your address, or remove them.
                </ErrorNote>
              </div>
            ) : null}

            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[104px_minmax(0,1fr)_190px_150px] items-start gap-6 py-6">
                  <Link href={`/animals/${l.slug}`} className="block overflow-hidden rounded-lg border border-[var(--line)]">
                    <Media media={{ path_medium: l.image, path_small: l.image, base_path: null }} alt={l.name} ratio="1 / 1" />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link href={`/animals/${l.slug}`} className="h4 hover:underline">
                          {l.name}
                        </Link>
                        <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                          {l.species_name}
                          {l.morph_name ? ` · ${l.morph_name}` : ''} · 1 of 1 — live animals cannot be duplicated
                        </p>
                        <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                          from{' '}
                          <Link href={`/breeders/${l.breeder_slug}`} className="text-[var(--ink)] hover:underline">
                            {l.business_name}
                          </Link>{' '}
                          · {l.state}
                        </p>
                      </div>
                      <div className="text-right">
                        <Money cents={l.line_cents} />
                        <button
                          className="mt-2 flex items-center gap-1 text-[12.5px] text-[var(--muted)] hover:text-[var(--error)]"
                          onClick={() => remove(l.id)}
                          disabled={busyId === l.id}
                        >
                          <Icon name="trash" size={14} /> Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ComplianceBadge verdict={l.legal.verdict} />
                      {l.listing_blocked ? <Badge tone="bad" icon="alert">Listing not purchasable</Badge> : null}
                      {l.legal.missingDocuments.slice(0, 2).map((d) => (
                        <Badge key={d} tone="warn" icon="doc">
                          {titleCase(d)}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-3 rounded-lg bg-[var(--surface-2)] p-2.5">
                      <span className="pl-1 text-[12.5px] text-[var(--muted)]">Transport</span>
                      <select
                        className="select h-9 flex-1 text-[13px]"
                        value={l.shipping_method}
                        disabled={busyId === l.id}
                        onChange={(e) => setMethod(l.id, e.target.value)}
                      >
                        {l.legal.allowedMethods.length ? (
                          l.legal.allowedMethods.map((m) => (
                            <option key={m} value={m}>
                              {titleCase(m)}
                            </option>
                          ))
                        ) : (
                          <option value={l.shipping_method}>No permitted method</option>
                        )}
                      </select>
                      {l.legal.blockedMethods.length ? (
                        <span className="pr-1 text-[11.5px] text-[var(--muted)]">blocked: {l.legal.blockedMethods.map((b) => titleCase(b.method)).join(', ')}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-[12.5px] leading-relaxed text-[var(--muted)]">
                    <p className="label">Paperwork</p>
                    {l.legal.requiredDocuments.length ? (
                      <ul className="mt-1.5 space-y-1">
                        {l.legal.requiredDocuments.map((d) => {
                          const missing = l.legal.missingDocuments.includes(d);
                          return (
                            <li key={d} className="flex items-center gap-1.5">
                              <Icon name={missing ? 'alert' : 'check'} size={13} className={missing ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
                              {titleCase(d)}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1.5">Standard FAUNAL terms only.</p>
                    )}
                  </div>

                  <div className="text-right">
                    <Link href={`/messages?animal=${l.animal_id}`} className="btn btn-quiet btn-sm w-full">
                      <Icon name="chat" size={15} /> Ask the breeder
                    </Link>
                    <Link href={`/animals/${l.slug}`} className="mt-2 block text-[12.5px] text-[var(--muted)] hover:text-[var(--ink)]">
                      View listing
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <aside className="sticky top-[86px] card p-6">
            <p className="label">Summary</p>
            <dl className="mt-3 space-y-2 text-[14px]">
              <Row label={`Animals (${lines.length})`} value={<Money cents={cart?.subtotal_cents ?? 0} />} />
              <Row label="Transport & taxes" value={<span className="text-[13px] text-[var(--muted)]">calculated per breeder at checkout</span>} />
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-[var(--line)] pt-4">
              <span className="text-[13px] text-[var(--muted)]">Estimated total</span>
              <Money cents={cart?.subtotal_cents ?? 0} size="lg" />
            </div>
            <Link
              href={cart?.checkout_ready ? '/checkout' : '/cart'}
              className={`btn btn-block mt-5 ${cart?.checkout_ready ? '' : 'pointer-events-none opacity-50'}`}
              aria-disabled={!cart?.checkout_ready}
            >
              {cart?.checkout_ready ? 'Continue to checkout' : 'Resolve blocked lines first'}
              <Icon name="chevronRight" size={16} />
            </Link>
            {!cart?.checkout_ready ? (
              <button className="mt-2 w-full text-[12.5px] text-[var(--muted)] underline underline-offset-4" onClick={() => router.push('/checkout')}>
                Review the blocked lines
              </button>
            ) : null}
            <ul className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">
              {[
                'Payment is captured but held in escrow until you confirm the animal arrived in condition.',
                'Documentation is verified by the compliance desk before dispatch.',
                'No third-party selling: every counterparty is a verified FAUNAL breeder.',
              ].map((t) => (
                <li key={t} className="flex gap-2 text-[12px] leading-relaxed text-[var(--muted)]">
                  <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export interface CartLineView {
  id: string;
  animal_id: string;
  name: string;
  slug: string;
  species_name: string;
  morph_name: string | null;
  price_cents: number;
  line_cents: number;
  quantity: number;
  image: string | null;
  shipping_method: string;
  state: string;
  breeder_id: string;
  business_name: string;
  breeder_slug: string;
  listing_blocked: boolean;
  legal: {
    verdict: string;
    canBuy: boolean;
    requiredDocuments: string[];
    missingDocuments: string[];
    allowedMethods: string[];
    blockedMethods: { method: string; reason: string }[];
    notes: string[];
  };
}

export interface CartShape {
  lines: CartLineView[];
  subtotal_cents: number;
  blocked_count: number;
  checkout_ready: boolean;
}
