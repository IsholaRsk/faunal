import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Orders to fulfil', description: 'Confirm, prepare, ship and hand off.', path: '/seller/orders', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('orders', { next: '/seller/orders' });
}
