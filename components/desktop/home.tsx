import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopAnimalCard, CategoryPill, BreederCard } from '@/components/ui/cards';
import { Media, Money, Section, Stars, VerifiedMark, Badge } from '@/components/ui/primitives';
import type { AnimalCard } from '@/repo/catalog';

/**
 * DESKTOP home — an editorial marketplace front: oversized hero, wide 4-column
 * grids, generous white space, hairline separators (spec §4 / §27 / §50).
 */
export function DesktopHome({
  firstName,
  categories,
  featured,
  recommended,
  breeders,
  guides,
  stats,
  recentlyViewed,
  destinationState,
}: {
  firstName: string | null;
  categories: { slug: string; name: string; icon: string | null; animal_count: number }[];
  featured: AnimalCard[];
  recommended: AnimalCard[];
  breeders: Record<string, string | number | null>[];
  guides: Record<string, string | number | null>[];
  stats: { animals: number; breeders: number; verified: number; completed_orders: number; species: number };
  recentlyViewed: AnimalCard[];
  destinationState: string | null;
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="shell grid grid-cols-[1.05fr_1fr] items-stretch gap-12 py-14">
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <Badge tone="ok" icon="shield">
                {stats.animals} listings cleared for sale
              </Badge>
              <Badge icon="scale">50-state rulebook</Badge>
            </div>
            <h1 className="h1 mt-5">
              Exotic animals,
              <br />
              sold the legal way.
            </h1>
            <p className="lede mt-5 max-w-[54ch]">
              FAUNAL is the American marketplace for responsibly bred reptiles, birds, amphibians, fish and invertebrates.
              Every listing is checked against federal, state and city wildlife law for <em>your</em> address before a dollar moves.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <Link href="/animals" className="btn btn-lg">
                Browse {stats.animals} animals <Icon name="chevronRight" size={17} />
              </Link>
              <Link href="/become-a-breeder" className="btn btn-quiet btn-lg">
                Sell as a breeder
              </Link>
            </div>
            <dl className="mt-10 grid grid-cols-4 gap-6 border-t border-[var(--line)] pt-6">
              {[
                ['Verified breeders', stats.verified],
                ['Species covered', stats.species],
                ['Completed handoffs', stats.completed_orders],
                ['Avg. breeder rating', '4.91'],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="eyebrow">{label}</dt>
                  <dd className="mt-1.5 font-display text-[26px] leading-none tracking-[-0.02em]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="card-media h-full" style={{ aspectRatio: '4 / 3.4' }}>
              <Media
                media={{ path_large: '/img/derived/hero-terrarium-large.webp', path_medium: '/img/derived/hero-terrarium-medium.webp', path_small: '/img/derived/hero-terrarium-small.webp', width: 1400, height: 1050 }}
                alt="A bioactive terrarium in a New York living room"
                ratio="4 / 3.4"
                sizes="46vw"
                priority
              />
            </div>
            <div className="absolute -bottom-6 -left-6 w-[300px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lift">
              <div className="eyebrow flex items-center gap-1.5">
                <Icon name="scale" size={13} /> Live compliance check
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                {destinationState ? (
                  <>
                    Shipping to <b className="text-[var(--ink)]">{destinationState}</b> is evaluated for species, origin, permits,
                    transport and seller status.
                  </>
                ) : (
                  <>
                    Set your state to filter the catalogue to what you can legally keep —{' '}
                    <Link href="/compliance" className="link">
                      see how
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="shell">
        <section className="py-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="h3">Shop by category</h2>
            <Link href="/animals" className="text-[13.5px] text-[var(--muted)] hover:text-[var(--ink)]">
              All listings →
            </Link>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {categories.map((c) => (
              <Link key={c.slug} href={`/categories/${c.slug}`} className="card hoverable flex flex-col gap-2 p-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-2)]">
                  <Icon name={(c.icon as never) || 'leaf'} size={17} />
                </span>
                <span className="text-[14px] font-semibold">{c.name}</span>
                <span className="text-[12px] text-[var(--muted)]">{c.animal_count} available</span>
              </Link>
            ))}
          </div>
        </section>

        <Section
          title="Featured this week"
          lead="Hand-selected by our breeding desk for paperwork quality, temperament and transparency on lineage."
          action={<Link href="/animals?sort=newest" className="btn btn-quiet btn-sm">See all</Link>}
        >
          <div className="grid-products">{featured.map((a, i) => <DesktopAnimalCard key={a.id} animal={a} index={i} />)}</div>
        </Section>

        {recommended.length ? (
          <Section title="Recommended for you" lead="Scored from what you browse, favorite and budget — then re-filtered through your state's rules.">
            <div className="grid-products">{recommended.map((a, i) => <DesktopAnimalCard key={a.id} animal={a} index={i} />)}</div>
          </Section>
        ) : null}

        <section className="my-14 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--ink)] text-[#F2F2EF]">
          <div className="grid grid-cols-[1.1fr_1fr] gap-10 p-10">
            <div>
              <span className="eyebrow text-[#9C9C95]">The FAUNAL standard</span>
              <h2 className="mt-3 font-display text-[34px] leading-[1.08] tracking-[-0.02em]">
                Four gates between a listing and your door.
              </h2>
              <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-[#C9C9C2]">
                We are not a classifieds board. A listing only becomes purchasable when species law, seller credentials,
                animal documentation and the transport route all clear — and the platform holds payment until you confirm the animal arrived.
              </p>
              <Link href="/compliance" className="btn mt-6 bg-white text-[var(--ink)]" style={{ borderColor: '#fff' }}>
                Read the compliance method
              </Link>
            </div>
            <ol className="grid grid-cols-2 gap-5">
              {[
                ['01', 'Species × jurisdiction', 'Federal CITES, the state list and city ordinances (NYC is stricter than New York State).'],
                ['02', 'Seller credentials', 'License numbers, breeding facility evidence and a verification tier that gates sensitive species.'],
                ['03', 'Documentation', 'Proof of captive origin, health certificate, permits, CITES — verified by a human before sale.'],
                ['04', 'Transport route', 'Method-level rules: what may move, how far, in what container, with what paperwork.'],
              ].map(([n, title, body]) => (
                <li key={n} className="rounded-2xl border border-[#2E2E2C] bg-[#1C1C1A] p-4">
                  <div className="mono text-[#8A8A83]">{n}</div>
                  <div className="mt-2 text-[14.5px] font-semibold">{title}</div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#B4B4AD]">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Section title="Verified breeders" lead="Independent breeders who passed license, facility and paperwork review." action={<Link href="/breeders" className="btn btn-quiet btn-sm">All breeders</Link>}>
          <div className="grid grid-cols-2 gap-4">
            {breeders.slice(0, 6).map((b) => (
              <BreederCard key={String(b.id)} breeder={b} />
            ))}
          </div>
        </Section>

        <Section title="Care guides from the desk" lead="Husbandry written by our reptile and avian specialists, not scraped from forums." action={<Link href="/guides" className="btn btn-quiet btn-sm">All guides</Link>}>
          <div className="grid grid-cols-3 gap-6">
            {guides.slice(0, 3).map((g) => (
              <Link key={String(g.slug)} href={`/guides/${g.slug}`} className="group block">
                <div className="card-media" style={{ aspectRatio: '3 / 2' }}>
                  <Media
                    media={{ path_medium: String(g.cover_path ?? '/img/derived/guide-care-medium.webp'), path_small: '/img/derived/guide-care-small.webp' }}
                    alt={String(g.title)}
                    ratio="3 / 2"
                    sizes="30vw"
                  />
                </div>
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    <span>{g.difficulty as string}</span>
                    <span className="text-[var(--line)]">·</span>
                    <span>{g.reading_minutes as number} min read</span>
                  </div>
                  <h3 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] group-hover:underline underline-offset-4">{g.title as string}</h3>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{g.excerpt as string}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {recentlyViewed.length ? (
          <Section title="Recently viewed">
            <div className="grid grid-cols-6 gap-4">
              {recentlyViewed.slice(0, 6).map((a) => (
                <DesktopAnimalCard key={a.id} animal={a} />
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}
