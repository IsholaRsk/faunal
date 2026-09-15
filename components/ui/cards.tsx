import Link from 'next/link';
import { Icon } from './Icon';
import { Media, Money, Stars, VerifiedMark, Badge } from './primitives';
import { ageLabel, sexLabel } from '@/domain/util';
import type { AnimalCard } from '@/repo/catalog';
import { FavoriteButton } from './interactions';

/**
 * Listing cards. Two deliberately different presentations of the same record:
 * the desktop card is an e-commerce product tile, the mobile card is an app
 * tile built for one-handed scanning (spec §48).
 */

export function DesktopAnimalCard({ animal, index = 0 }: { animal: AnimalCard; index?: number }) {
  const morph = animal.morph_name ? `${animal.morph_name} Morph` : animal.scientific_name;
  return (
    <article className="group-card relative flex flex-col anim-up" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
      <Link href={`/animals/${animal.slug}`} className="block">
        <div className="card-media" style={{ aspectRatio: '4 / 5' }}>
          <Media media={{ path_medium: animal.image_medium, path_small: animal.image_small, alt: animal.image_alt }} alt={`${animal.name} — ${animal.species_name}`} sizes="(max-width: 980px) 45vw, 300px" />
          {animal.is_featured ? <span className="absolute left-2.5 top-2.5 badge badge-ink">Featured</span> : null}
          {animal.availability !== 'AVAILABLE' ? (
            <span className="absolute inset-0 grid place-items-center bg-[rgba(247,247,245,0.72)]">
              <span className="badge badge-ink">{animal.availability === 'RESERVED' ? 'Reserved' : 'Sold'}</span>
            </span>
          ) : null}
        </div>
      </Link>
      <div className="absolute right-2 top-2 z-10">
        <FavoriteButton animalId={animal.id} label={animal.name} />
      </div>
      <div className="pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/animals/${animal.slug}`} className="block truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] hover:underline underline-offset-4">
              {animal.name}
            </Link>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--muted)]">{morph}</p>
          </div>
          <Money cents={animal.price_cents} size="base" className="shrink-0" />
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
          <span>{sexLabel(animal.sex)}</span>
          <span className="text-[var(--line)]">·</span>
          <span>{ageLabel(animal.age_months)}</span>
          <span className="text-[var(--line)]">·</span>
          <span className="inline-flex items-center gap-1">
            <Icon name="location" size={11} />
            {animal.state}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-2">
          <Link href={`/breeders/${animal.breeder_slug}`} className="flex min-w-0 items-center gap-1.5 text-[12px] hover:underline underline-offset-4">
            <span className="truncate">{animal.business_name}</span>
            <VerifiedMark tier={animal.breeder_tier} className="text-[11px]" />
          </Link>
          <Stars value={animal.rating_avg} showValue size={11} />
        </div>
      </div>
    </article>
  );
}

export function MobileAnimalCard({ animal, priority = false }: { animal: AnimalCard; priority?: boolean }) {
  return (
    <article className="relative">
      <Link href={`/animals/${animal.slug}`} className="block">
        <div className="card-media" style={{ aspectRatio: '1 / 1' }}>
          <Media
            media={{ path_medium: animal.image_medium, path_small: animal.image_small, alt: animal.image_alt }}
            alt={`${animal.name} — ${animal.species_name}`}
            sizes="46vw"
            priority={priority}
            ratio="1 / 1"
          />
          {animal.availability !== 'AVAILABLE' ? (
            <span className="absolute inset-0 grid place-items-center bg-[rgba(247,247,245,0.7)]">
              <span className="badge badge-ink">{animal.availability === 'RESERVED' ? 'Reserved' : 'Sold'}</span>
            </span>
          ) : null}
        </div>
        <div className="px-0.5 pt-2">
          <div className="truncate text-[13.5px] font-semibold leading-tight">{animal.species_name}</div>
          {animal.morph_name ? <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{animal.morph_name} morph</div> : null}
          <div className="mt-1 truncate text-[11.5px] text-[var(--muted)]">
            {sexLabel(animal.sex)} · {ageLabel(animal.age_months)}
          </div>
          {animal.breeder_tier === 'VERIFIED_BREEDER' ? (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--success)]">
              <Icon name="verified" size={11} /> Verified breeder
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center justify-between">
            <Money cents={animal.price_cents} size="base" />
            <span className="mono text-[10.5px] text-[var(--accent-soft)]">{animal.state}</span>
          </div>
        </div>
      </Link>
      <div className="absolute right-1 top-1 z-10 scale-90">
        <FavoriteButton animalId={animal.id} label={animal.name} />
      </div>
    </article>
  );
}

export function CompactAnimalRow({ animal, href }: { animal: AnimalCard; href?: string }) {
  return (
    <Link href={href ?? `/animals/${animal.slug}`} className="flex items-center gap-3 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--line)]">
        <Media media={{ path_small: animal.image_small ?? animal.image_medium }} alt={animal.name} ratio="1 / 1" sizes="48px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{animal.name}</span>
        <span className="block truncate text-[12px] text-[var(--muted)]">
          {animal.species_name} · {animal.state}
        </span>
      </span>
      <Money cents={animal.price_cents} size="sm" />
    </Link>
  );
}

export function CategoryPill({ slug, name, icon, count }: { slug: string; name: string; icon?: string | null; count?: number }) {
  return (
    <Link href={`/categories/${slug}`} className="chip shrink-0">
      <Icon name={(icon as never) || 'leaf'} size={14} className="text-[var(--muted)]" />
      {name}
      {count !== undefined ? <span className="chip-count">{count}</span> : null}
    </Link>
  );
}

export function BreederCard({ breeder, surface = 'desktop' }: { breeder: Record<string, string | number | null>; surface?: 'desktop' | 'mobile' }) {
  const tier = String(breeder.tier);
  const body = (
    <>
      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
        {breeder.logo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={String(breeder.logo_path)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center font-display text-[18px] text-[var(--muted)]">
            {String(breeder.business_name ?? 'F').slice(0, 1)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold">{breeder.business_name as string}</span>
          {tier === 'VERIFIED_BREEDER' ? <Badge tone="ok" icon="verified">Verified</Badge> : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--muted)]">
          <span>
            {breeder.city as string}, {breeder.state as string}
          </span>
          <span className="text-[var(--line)]">·</span>
          <Stars value={Number(breeder.rating_avg)} size={11} />
          <span className="text-[var(--line)]">·</span>
          <span>{breeder.transactions_count as number} transactions</span>
          {breeder.live_count ? (
            <>
              <span className="text-[var(--line)]">·</span>
              <span>{breeder.live_count as number} live</span>
            </>
          ) : null}
        </span>
      </span>
    </>
  );
  if (surface === 'mobile') {
    return (
      <Link href={`/breeders/${breeder.slug}`} className="flex items-center gap-3 border-b border-[var(--line)] py-3 last:border-0">
        {body}
        <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
      </Link>
    );
  }
  return (
    <Link href={`/breeders/${breeder.slug}`} className="card hoverable flex items-center gap-4 p-4">
      {body}
      <span className="btn btn-quiet btn-sm shrink-0">View store</span>
    </Link>
  );
}
