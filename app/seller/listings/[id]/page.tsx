import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Edit listing', description: 'Update a draft or live listing.', path: '/seller/listings', noindex: true }) as Metadata;

export default function Page({ params }: { params: { id: string } }) {
  return sellerScreen('wizard', { animalId: params.id, next: `/seller/listings/${params.id}` });
}
