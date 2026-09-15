import type { Metadata } from 'next';
import { sellerScreen } from '@/lib/ui/seller-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta({ title: 'Licences & documents', description: 'Private document vault for your breeder account.', path: '/seller/documents', noindex: true }) as Metadata;

export default function Page() {
  return sellerScreen('documents', { next: '/seller/documents' });
}
