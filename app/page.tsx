import Link from 'next/link';
import { redirect } from 'next/navigation';
import { appData } from '@/lib/ui/server';
import { featured, categories, verifiedBreeders, guides, recentlyViewed, homeStats, byCategory } from '@/repo/catalog';
import { cardsByIds } from '@/repo/catalog';
import { recommend } from '@/domain/ai';
import { DesktopHome } from '@/components/desktop/home';
import { MobileHome } from '@/components/mobile/home';
import type { AnimalCard } from '@/repo/catalog';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const { user, experience, badges } = appData();
  const stats = homeStats();
  const cats = (categories(true) as { slug: string; name: string; icon: string | null; animal_count: number }[]).map((c) => ({
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    animal_count: Number(c.animal_count),
  }));
  const featuredCards = featured(experience === 'mobile' ? 6 : 8);
  const recIds = recommend(user?.id ?? null, user?.jurisdictionCode ?? null, experience === 'mobile' ? 8 : 4).map((r) => r.id);
  const recommended: AnimalCard[] = cardsByIds(recIds);
  const breeders = verifiedBreeders(experience === 'mobile' ? 4 : 6);
  const gd = guides();
  const recent = recentlyViewed(user?.id ?? null, 8);

  if (experience === 'mobile') {
    return (
      <MobileHome
        firstName={user?.firstName ?? 'there'}
        city={user?.jurisdictionCode === 'NY' ? 'New York, NY' : user?.jurisdictionCode ? `${user.jurisdictionCode}` : 'New York, NY'}
        categories={cats}
        featured={featuredCards}
        recommended={recommended}
        breeders={breeders}
        guides={gd}
        recentlyViewed={recent}
        unread={badges.unreadNotifications}
        destinationState={user?.jurisdictionCode ?? null}
      />
    );
  }

  return (
    <DesktopHome
      firstName={user?.firstName ?? null}
      categories={cats}
      featured={featuredCards}
      recommended={recommended}
      breeders={breeders}
      guides={gd}
      stats={{
        animals: stats.animals,
        breeders: stats.breeders,
        verified: stats.verified,
        completed_orders: stats.completed_orders,
        species: stats.species,
      }}
      recentlyViewed={recent}
      destinationState={user?.jurisdictionCode ?? null}
    />
  );
}
