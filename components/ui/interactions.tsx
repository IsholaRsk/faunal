'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { post, patch, ApiError } from '@/lib/ui/api';
import { useApp, requireAuth } from '@/lib/ui/app-provider';

/* --------------------------------------------------------------- toasts -- */
export function Toasts() {
  const { toasts, dismissToast, experience } = useApp();
  if (!toasts.length) return null;
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 ${experience === 'mobile' ? 'bottom-[86px]' : 'bottom-6'}`}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast pointer-events-auto ${t.tone === 'error' ? 'bg-[var(--danger)]' : ''}`}>
          <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'warn' ? 'info' : 'check'} size={15} />
          <span className="flex-1">{t.message}</span>
          {t.actionLabel && t.actionHref ? (
            <Link href={t.actionHref} onClick={() => dismissToast(t.id)} className="font-semibold underline underline-offset-2">
              {t.actionLabel}
            </Link>
          ) : null}
          <button onClick={() => dismissToast(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- favorites -- */
export function FavoriteButton({
  animalId,
  initial = false,
  variant = 'icon',
  label,
}: {
  animalId: string;
  initial?: boolean;
  variant?: 'icon' | 'row';
  label?: string;
}) {
  const { user, favorites, toggleFavorite, toast, refresh } = useApp();
  const isFav = favorites.has(animalId) || initial;
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      requireAuth(user, router);
      toast('Sign in to save favorites.');
      return;
    }
    setBusy(true);
    try {
      const next = await toggleFavorite(animalId);
      toast(next ? 'Saved to favorites' : 'Removed from favorites');
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update favorites', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'row') {
    return (
      <button onClick={onClick} disabled={busy} className="list-row">
        <span className="flex items-center gap-2.5">
          <Icon name="heart" size={17} />
          {isFav ? 'Remove from favorites' : 'Save to favorites'}
        </span>
        <Icon name={isFav ? 'check' : 'chevronRight'} size={15} />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={isFav}
      aria-label={isFav ? `Remove ${label ?? 'animal'} from favorites` : `Save ${label ?? 'animal'} to favorites`}
      className={`icon-btn icon-btn-on-surface ${isFav ? 'text-[var(--danger)]' : ''}`}
    >
      <Icon name="heart" size={18} filled={isFav} />
    </button>
  );
}

/* ---------------------------------------------------------------- cart cta */
export function AddToCartButton({
  animalId,
  className = 'btn btn-block',
  label = 'Add to cart',
  blockedReason,
  onAdded,
}: {
  animalId: string;
  className?: string;
  label?: string;
  blockedReason?: string | null;
  onAdded?: () => void;
}) {
  const { user, toast, refresh, setBadges, badges } = useApp();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function add() {
    if (!requireAuth(user, router)) return;
    setBusy(true);
    try {
      const res = await post<{ cart: { lines: unknown[] } }>('cart', { animalId });
      toast('Added to cart', { actionLabel: 'View cart', actionHref: '/cart' });
      setBadges({ cart: badges.cart + 1 });
      refresh();
      onAdded?.();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not add to cart', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (blockedReason) {
    return (
      <button className={`${className} opacity-60`} disabled title={blockedReason} onClick={() => toast(blockedReason, { tone: 'warn' })}>
        <Icon name="lock" size={15} /> Not available for your state
      </button>
    );
  }
  return (
    <button className={className} onClick={add} disabled={busy}>
      {busy ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="cart" size={16} />}
      {busy ? 'Checking legality…' : label}
    </button>
  );
}

export function ContactBreederButton({ animalId, sellerUserId, price, name, className = 'btn btn-quiet btn-block' }: { animalId: string; sellerUserId: string; price: string; name: string; className?: string }) {
  const { user, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        if (!requireAuth(user, router)) return;
        setBusy(true);
        try {
          const res = await post<{ conversation: { id: string } }>('conversations', { animalId, sellerUserId });
          router.push(`/messages/${res.conversation.id}`);
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Could not open the conversation', { tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="chat" size={16} /> {busy ? 'Opening…' : 'Contact breeder'}
    </button>
  );
}

export function FollowBreederButton({ breederId, initial = false, businessName }: { breederId: string; initial?: boolean; businessName?: string }) {
  const { user, toast, refresh } = useApp();
  const [following, setFollowing] = useState(initial);
  const router = useRouter();
  return (
    <button
      className={following ? 'btn btn-quiet' : 'btn'}
      onClick={async () => {
        if (!requireAuth(user, router)) return;
        try {
          const res = await post<{ following: boolean }>('follows', { breederId });
          setFollowing(res.following);
          toast(res.following ? `You will hear about new ${businessName ?? 'breeder'} listings` : 'Unfollowed');
          refresh();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Could not update follow', { tone: 'error' });
        }
      }}
    >
      <Icon name={following ? 'check' : 'userPlus'} size={15} /> {following ? 'Following' : 'Follow breeder'}
    </button>
  );
}

export function ShareButton({ title, url }: { title: string; url: string }) {
  const { toast, experience } = useApp();
  return (
    <button
      className={experience === 'mobile' ? 'icon-btn icon-btn-on-surface' : 'icon-btn'}
      aria-label="Share listing"
      onClick={async () => {
        const href = url.startsWith('http') ? url : `${window.location.origin}${url}`;
        if (navigator.share) {
          try {
            await navigator.share({ title, url: href });
            return;
          } catch {
            /* user dismissed the sheet */
          }
        }
        try {
          await navigator.clipboard.writeText(href);
          toast('Link copied to clipboard');
        } catch {
          toast(href);
        }
      }}
    >
      <Icon name="share" size={18} />
    </button>
  );
}

/* ------------------------------------------------------------------ report */
const REPORT_REASONS = [
  ['SCAM', 'Scam or fraud attempt'],
  ['ILLEGAL_SPECIES', 'Illegal species or paperwork'],
  ['STOLEN_IMAGES', 'Stolen photographs'],
  ['MISLEADING_LISTING', 'Misleading listing'],
  ['OFF_PLATFORM_PAYMENT', 'Asking to pay outside FAUNAL'],
  ['ABUSE', 'Harassment or abuse'],
  ['OTHER', 'Something else'],
];

export function ReportDialog({ targetType, targetId, children }: { targetType: 'ANIMAL' | 'BREEDER' | 'USER' | 'MESSAGE'; targetId: string; children?: React.ReactNode }) {
  const { toast, experience } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('SCAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        className={experience === 'mobile' ? 'list-row text-[var(--danger)]' : 'btn btn-ghost text-[var(--danger)]'}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Icon name="flag" size={16} /> {children ?? 'Report listing'}
      </button>
      {open ? (
        <Modal title="Report to FAUNAL Trust & Safety" onClose={() => setOpen(false)}>
          <p className="mb-4 text-[13.5px] leading-relaxed text-[var(--muted)]">
            Reports are reviewed within 24 hours. Listings flagged for illegal species or paperwork are automatically hidden while a moderator decides.
          </p>
          <div className="space-y-2">
            {REPORT_REASONS.map(([value, label]) => (
              <label key={value} className="check">
                <input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </div>
          <textarea className="textarea mt-4" placeholder="Add context (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <button
            className="btn btn-block mt-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post('reports', { targetType, targetId, reason, details });
                toast('Report submitted. Thank you.');
                setOpen(false);
              } catch (e) {
                toast(e instanceof ApiError ? e.message : 'Report failed — sign in first?', { tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Submitting…' : 'Submit report'}
          </button>
        </Modal>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------- primitives */
export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`anim-in relative w-full ${wide ? 'max-w-[760px]' : 'max-w-[440px]'} overflow-hidden rounded-2xl bg-[var(--surface)] shadow-lift`}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Bottom sheet on mobile — the primary mobile overlay primitive (spec §12). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </>
  );
}

export function Accordion({ title, icon, children, defaultOpen = false, meta }: { title: string; icon?: IconName; children: React.ReactNode; defaultOpen?: boolean; meta?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="accordion">
      <button className="accordion-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-2.5">
          {icon ? <Icon name={icon} size={17} className="text-[var(--muted)]" /> : null}
          <span className="text-[15px] font-medium tracking-[-0.01em]">{title}</span>
          {meta}
        </span>
        <Icon name="chevronDown" size={17} className={`text-[var(--muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="accordion-body" id={id}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className = '' }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`segmented ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Collapse({ label, children, rows = 4 }: { label: string; children: React.ReactNode; rows?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: rows, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} className="text-[14.5px] leading-[1.62] text-[var(--muted)]">
        {children}
      </div>
      <button onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[13px] font-medium text-[var(--ink)] underline underline-offset-4">
        {open ? 'Show less' : label}
      </button>
    </div>
  );
}

/* Swipeable media gallery — mobile: snap scroll, desktop: thumbs (spec §13). */
export function Gallery({
  items,
  ratio = '1 / 1',
  showThumbs = false,
}: {
  items: { src: string; alt: string; kind?: 'image' | 'video'; poster?: string }[];
  ratio?: string;
  showThumbs?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  useEffect(() => {
    if (!showThumbs) return;
    scroller.current?.scrollTo({ left: index * (scroller.current.clientWidth ?? 0), behavior: 'smooth' });
  }, [index, showThumbs]);

  if (!items.length) return null;

  if (showThumbs) {
    return (
      <div className="flex gap-4">
        <div className="w-[62%]">
          <div className="card-media" style={{ aspectRatio: '4 / 5' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={items[index]?.src} alt={items[index]?.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="mt-2.5 flex gap-2">
            {items.map((it, i) => (
              <button
                key={it.src + i}
                onClick={() => setIndex(i)}
                aria-label={`View image ${i + 1}`}
                className={`h-14 w-14 overflow-hidden rounded-lg border transition ${i === index ? 'border-[var(--ink)]' : 'border-[var(--line)] opacity-70 hover:opacity-100'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.poster ?? it.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 self-end">
          <p className="text-[12.5px] text-[var(--muted)]">
            {index + 1} / {items.length} — {items[index]?.alt}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={scroller} onScroll={onScroll} className="snap-gallery">
        {items.map((it, i) => (
          <div key={i} className="card-media" style={{ aspectRatio: ratio, borderRadius: 0 }}>
            {it.kind === 'video' ? (
              <video src={it.src} poster={it.poster} controls playsInline muted className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.src} alt={it.alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- device switching */
export function ExperienceToggle({ current }: { current: 'mobile' | 'desktop' }) {
  const { refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="chip"
      title="Preview the other product surface. Same data, same session, different experience."
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post('experience', { experience: current === 'mobile' ? 'desktop' : 'mobile' });
          toast(`Switched to ${current === 'mobile' ? 'desktop' : 'mobile'} experience`);
          refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name={current === 'mobile' ? 'grid' : 'compass'} size={14} />
      {current === 'mobile' ? 'Desktop' : 'Mobile app'}
    </button>
  );
}

/* --------------------------------------------------------------- utilities */
export function useDebounced<T>(value: T, ms = 280): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function CopyValue({ value, label }: { value: string; label?: string }) {
  const { toast } = useApp();
  return (
    <button
      className="inline-flex items-center gap-1.5 text-[13px] hover:underline underline-offset-4"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        toast(`${label ?? 'Value'} copied`);
      }}
    >
      <span className="mono">{value}</span>
      <Icon name="copy" size={13} className="text-[var(--muted)]" />
    </button>
  );
}
