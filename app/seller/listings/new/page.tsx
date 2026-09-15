import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Add an animal', description: 'Eight-step listing wizard.', path: '/seller/listings/new', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('wizard', { next: '/seller/listings/new' });
}
