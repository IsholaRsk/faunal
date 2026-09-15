import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { verifiedBreeders } from '@/repo/catalog';
import { getDb } from '@/lib/db';
import { DesktopBreeders } from '@/components/desktop/breeders';
import { MobileBreeders } from '@/components/mobile/breeders';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Verified breeders',
  description: 'Licence-checked exotic animal breeders with documents on file.',
  path: '/breeders',
}) as Metadata;

export default function BreedersPage() {
  const { experience } = appData();
  const rows = verifiedBreeders(48) as never[];
  const total = (getDb().prepare(`SELECT COUNT(*) AS n FROM breeders WHERE status='APPROVED'`).get() as { n: number }).n;
  return experience === 'mobile' ? <MobileBreeders rows={rows} total={total} /> : <DesktopBreeders rows={rows} total={total} />;
}
