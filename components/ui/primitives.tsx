import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { money as fmtMoney } from '@/lib/ui/money';
import { Icon, type IconName } from './Icon';

/* Non-interactive building blocks. Safe in server components (no 'use client'). */

export function Money({
  cents,
  currency = 'USD',
  className = '',
  size = 'base',
  strike = false,
}: {
  cents: number;
  currency?: string;
  className?: string;
  size?: 'sm' | 'base' | 'lg' | 'xl';
  strike?: boolean;
}) {
  const sizes = { sm: '12.5px', base: '15px', lg: '19px', xl: 'clamp(22px,2.4vw,30px)' };
  return (
    <span
      className={`price ${className}`}
      style={{ fontSize: sizes[size], textDecoration: strike ? 'line-through' : undefined, opacity: strike ? 0.55 : undefined }}
    >
      {fmtMoney(cents, currency)}
    </span>
  );
}

export function Badge({ tone = 'quiet', children, icon }: { tone?: 'quiet' | 'ok' | 'warn' | 'bad' | 'ink'; children: ReactNode; icon?: IconName }) {
  const cls = { quiet: '', ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad', ink: 'badge-ink' }[tone];
  return (
    <span className={`badge ${cls}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'quiet'> = {
  ALLOWED: 'ok',
  RESTRICTED: 'warn',
  REQUIRES_DOCUMENTATION: 'warn',
  REQUIRES_ADMIN_REVIEW: 'warn',
  PROHIBITED: 'bad',
};

export function ComplianceBadge({ verdict, label }: { verdict: string; label?: string }) {
  const tone = VERDICT_TONE[verdict] ?? 'quiet';
  const text =
    label ??
    {
      ALLOWED: 'Legal in your state',
      RESTRICTED: 'Allowed with conditions',
      REQUIRES_DOCUMENTATION: 'Documents required',
      REQUIRES_ADMIN_REVIEW: 'Under review',
      PROHIBITED: 'Not available in your state',
    }[verdict];
  return (
    <Badge tone={tone} icon={verdict === 'ALLOWED' ? 'shield' : verdict === 'PROHIBITED' ? 'ban' : 'info'}>
      {text ?? verdict}
    </Badge>
  );
}

export function ListingStatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: 'quiet' | 'ok' | 'warn' | 'bad' | 'ink'; label: string }> = {
    DRAFT: { tone: 'quiet', label: 'Draft' },
    PENDING_REVIEW: { tone: 'warn', label: 'Pending review' },
    APPROVED: { tone: 'ok', label: 'Live' },
    REJECTED: { tone: 'bad', label: 'Rejected' },
    SUSPENDED: { tone: 'bad', label: 'Suspended' },
    SOLD: { tone: 'ink', label: 'Sold' },
    ARCHIVED: { tone: 'quiet', label: 'Archived' },
  };
  const it = map[status] ?? { tone: 'quiet' as const, label: status };
  return <Badge tone={it.tone}>{it.label}</Badge>;
}

export function VerifiedMark({ tier, className = '' }: { tier?: string | null; className?: string }) {
  if (tier !== 'VERIFIED_BREEDER' && tier !== 'PROFESSIONAL_BREEDER') return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-medium text-[var(--success)] ${className}`} title={tier === 'VERIFIED_BREEDER' ? 'Documents verified by FAUNAL' : 'Professional breeder'}>
      <Icon name="verified" size={13} />
      {tier === 'VERIFIED_BREEDER' ? 'Verified Breeder' : 'Professional'}
    </span>
  );
}

export function Stars({ value, size = 13, showValue = true, count }: { value: number; size?: number; showValue?: boolean; count?: number }) {
  const rounded = Math.round((Number(value) || 0) * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1" style={{ color: 'var(--ink)' }}>
      <span className="inline-flex" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = rounded >= i + 1;
          const half = !filled && rounded >= i + 0.5;
          return (
            <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ color: filled || half ? 'var(--ink)' : 'var(--line)' }}>
              <path
                d="m12 4.5 2.35 4.9 5.15.72-3.75 3.7.9 5.28L12 16.7l-4.65 2.4.9-5.28-3.75-3.7 5.15-.72z"
                fill={filled ? 'currentColor' : half ? 'url(#half)' : 'none'}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              {half ? (
                <defs>
                  <linearGradient id="half">
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
              ) : null}
            </svg>
          );
        })}
      </span>
      {showValue ? <span className="text-[12.5px] font-medium tabular-nums">{(Number(value) || 0).toFixed(2)}</span> : null}
      {count !== undefined ? <span className="text-[12px] text-[var(--muted)]">({count})</span> : null}
    </span>
  );
}

export interface MediaRef {
  base_path?: string | null;
  path_small?: string | null;
  path_medium?: string | null;
  path_large?: string | null;
  path_thumb?: string | null;
  avif_path?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

/**
 * Performance-aware image (spec §45): derivative srcset, aspect-ratio box so
 * there is no layout shift, lazy below the fold, AVIF/WebP where generated.
 */
export function Media({
  media,
  alt,
  ratio = '1 / 1',
  sizes = '(max-width: 700px) 46vw, (max-width: 1100px) 30vw, 340px',
  priority = false,
  className = '',
  style,
  objectFit = 'cover',
}: {
  media?: MediaRef | null;
  alt: string;
  ratio?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  objectFit?: 'cover' | 'contain';
}) {
  const medium = media?.path_medium ?? media?.base_path ?? null;
  if (!medium) {
    return (
      <span
        className={`grid place-items-center bg-[var(--surface-2)] text-[var(--accent-soft)] ${className}`}
        style={{ aspectRatio: ratio, ...style }}
      >
        <Icon name="image" size={22} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={medium}
      srcSet={`${media?.path_small ? `${media.path_small} 480w, ` : ''}${medium} 800w${media?.path_large ? `, ${media.path_large} 1400w` : ''}`}
      sizes={sizes}
      alt={alt || media?.alt || ''}
      width={media?.width ?? 800}
      height={media?.height ?? 800}
      loading={priority ? 'eager' : 'lazy'}
      // @ts-expect-error - fetchpriority is valid HTML but missing from React types
      fetchpriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
      style={{ aspectRatio: ratio, objectFit, display: 'block', width: '100%', height: '100%', ...style }}
    />
  );
}

export function Avatar({ name, src, size = 40, rounded = true }: { name: string; src?: string | null; size?: number; rounded?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={rounded ? 'rounded-full object-cover' : 'object-cover'}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center bg-[var(--surface-2)] font-medium text-[var(--muted)] ${rounded ? 'rounded-full' : 'rounded-xl'}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials || 'F'}
    </span>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function CardSkeleton({ ratio = '1 / 1' }: { ratio?: string }) {
  return (
    <div className="space-y-3">
      <Skeleton style={{ aspectRatio: ratio, borderRadius: 12 }} />
      <Skeleton style={{ height: 12, width: '60%' }} />
      <Skeleton style={{ height: 12, width: '35%' }} />
    </div>
  );
}

export function EmptyState({
  icon = 'compass',
  title,
  body,
  action,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-14'} anim-in`}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
      {body ? <p className="mx-auto mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-[var(--muted)]">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, tone = 'bad' }: { children: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed ${
        tone === 'bad'
          ? 'border-[rgba(139,75,75,0.25)] bg-[rgba(139,75,75,0.06)] text-[var(--danger)]'
          : 'border-[rgba(154,123,69,0.28)] bg-[rgba(154,123,69,0.07)] text-[var(--warning)]'
      }`}
    >
      <Icon name={tone === 'bad' ? 'alert' : 'info'} size={16} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = '',
  id,
  lead,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  lead?: string;
}) {
  return (
    <section id={id} className={`py-10 ${className}`}>
      <div className="mb-5 flex items-end justify-between gap-6">
        <div>
          <h2 className="h2">{title}</h2>
          {lead ? <p className="mt-1.5 max-w-[54ch] text-[14.5px] leading-relaxed text-[var(--muted)]">{lead}</p> : null}
        </div>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DataRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="text-[13px] text-[var(--muted)]">{label}</span>
      <span className={`text-right text-[14px] font-medium ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-[var(--surface-2)] px-2 py-1 text-[12px] text-[var(--muted)]">{children}</span>;
}

export function StatBlock({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-display text-[26px] leading-none tracking-[-0.02em]" style={tone ? { color: `var(--${tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : 'danger'})` } : undefined}>
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[12.5px] text-[var(--muted)]">{hint}</div> : null}
    </div>
  );
}

export function ProgressSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="px-4 pt-3">
      <div className="steps">
        {steps.map((s, i) => (
          <span key={s} data-done={i <= current} title={s} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-[var(--muted)]">
        <span>
          Step {current + 1} of {steps.length}
        </span>
        <span className="font-medium text-[var(--ink)]">{steps[current]}</span>
      </div>
    </div>
  );
}

export function LinkChevron({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13.5px] font-medium hover:underline underline-offset-4">
      {children}
      <Icon name="chevronRight" size={15} />
    </Link>
  );
}

export function Timeline({ steps, events }: { steps: { key: string; label: string; done: boolean; current: boolean }[]; events?: Record<string, string | number | null>[] }) {
  return (
    <ol className="timeline">
      {steps.map((s) => {
        const at = events?.find((e) => e.status === s.key);
        return (
          <li key={s.key} className="timeline-item" data-done={s.done} data-current={s.current}>
            <span className="timeline-dot">{s.done ? <Icon name="check" size={9} style={{ color: '#fff' }} /> : null}</span>
            <div className="text-[14px] font-medium leading-tight">{s.label}</div>
            {at?.created_at ? (
              <div className="mt-0.5 text-[12px] text-[var(--muted)]">{new Date(String(at.created_at)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            ) : null}
            {at?.note ? <div className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-[var(--muted)]">{at.note}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RiskChip({ level, signals }: { level: string; signals?: string[] }) {
  if (!level || level === 'NONE') return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[rgba(139,75,75,0.08)] px-2 py-1 text-[11.5px] font-medium text-[var(--danger)]" title={(signals ?? []).join(' · ')}>
      <Icon name="shield" size={12} /> {level === 'HIGH' ? 'Off-platform payment detected' : 'Flagged for review'}
    </span>
  );
}

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}
