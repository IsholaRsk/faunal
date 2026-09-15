import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { favoriteAnimalCards } from '@/repo/cart';
import { DesktopFavorites } from '@/components/desktop/account';
import { MobileFavorites } from '@/components/mobile/account';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Favorites',
  description: 'Animals you are watching, with their paperwork and price changes.',
  path: '/favorites',
  noindex: true,
}) as Metadata;

export default function FavoritesPage() {
  const { user, experience } = appData();
  const cards = user ? favoriteAnimalCards(user as never) : [];
  return experience === 'mobile' ? (
    <MobileFavorites cards={cards as never} signedIn={!!user} />
  ) : (
    <DesktopFavorites cards={cards as never} signedIn={!!user} />
  );
}
