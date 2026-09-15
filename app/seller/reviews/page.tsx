import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Seller reviews', description: 'What buyers of your animals reported.', path: '/seller/reviews', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('reviews', { next: '/seller/reviews' });
}
