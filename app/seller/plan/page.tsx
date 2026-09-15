import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Plan & fees', description: 'Commission, subscription and featured placement.', path: '/seller/plan', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('plan', { next: '/seller/plan' });
}
