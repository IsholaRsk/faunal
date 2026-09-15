import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({ title: 'Seller desk', description: 'Listings, orders, paperwork and payouts.', path: '/seller', noindex: true }) as Metadata;

export default function SellerHome() {
  return sellerScreen('dashboard', { next: '/seller' });
}
