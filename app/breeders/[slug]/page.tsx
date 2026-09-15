import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { breederBySlug } from '@/repo/catalog';
import { isFollowing } from '@/repo/cart';
import { getDb } from '@/lib/db';
import { DesktopBreederStorefront } from '@/components/desktop/breeders';
import { MobileBreederStorefront } from '@/components/mobile/breeders';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = breederBySlug(params.slug);
  if (!data) return { title: 'Breeder' };
  const b = data.breeder as Record<string, string | number | null>;
  return pageMeta({
    title: String(b.business_name),
    description: String(b.bio ?? `Verified breeder in ${b.city}, ${b.state}`).slice(0, 160),
    path: `/breeders/${b.slug}`,
  }) as Metadata;
}

export default function BreederPage({ params }: { params: { slug: string } }) {
  const { user, experience } = appData();
  const data = breederBySlug(params.slug);
  if (!data) notFound();

  const db = getDb();
  const breederId = String((data.breeder as { id: string }).id);
  const specialties = db
    .prepare(
      `SELECT DISTINCT s.common_name FROM animals a JOIN species s ON s.id = a.species_id
       WHERE a.breeder_id = ? AND a.status = 'APPROVED' ORDER BY s.common_name LIMIT 8`,
    )
    .all(breederId) as { common_name: string }[];
  const reviews = data.reviews as Record<string, string | number | null>[];
  const dims = ['animal_health', 'documentation', 'transport', 'communication'] as const;
  const ratingBreakdown = dims
    .map((category) => {
      const scored = reviews.map((r) => Number(r[category])).filter((v) => Number.isFinite(v) && v > 0);
      return { category, avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0, n: scored.length };
    })
    .filter((r) => r.n > 0);

  const view = {
    ...data,
    animals: data.animals as never,
    soldAnimals: data.soldAnimals as never,
    reviews: reviews as never,
    isFollowing: user ? isFollowing(user.id, breederId) : false,
    viewerId: user?.id ?? null,
    specialties: specialties.map((s) => s.common_name),
    ratingBreakdown,
  };

  return experience === 'mobile' ? <MobileBreederStorefront data={view as never} /> : <DesktopBreederStorefront data={view as never} />;
}
