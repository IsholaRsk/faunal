import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'My listings', description: 'Inventory, status and legality per listing.', path: '/seller/listings', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('listings', { next: '/seller/listings' });
}
