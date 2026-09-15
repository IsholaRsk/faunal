import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { getDb } from '@/lib/db';
import { DesktopReport } from '@/components/desktop/report';
import { MobileReport } from '@/components/mobile/report';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Report a listing or seller',
  description: 'Flag an illegal, misleading or unsafe listing. A moderator reads every report within 24 hours.',
  path: '/report',
}) as Metadata;

export default function ReportPage() {
  const { experience } = appData();
  const db = getDb();
  const animals = db.prepare(`SELECT slug, name FROM animals WHERE status='APPROVED' ORDER BY published_at DESC LIMIT 60`).all() as { slug: string; name: string }[];
  const breeders = db.prepare(`SELECT slug, business_name FROM breeders WHERE status='APPROVED' ORDER BY business_name LIMIT 60`).all() as { slug: string; business_name: string }[];
  const targets = [
    ...animals.map((a) => ({ kind: 'ANIMAL', label: a.name, value: a.slug })),
    ...breeders.map((b) => ({ kind: 'BREEDER', label: b.business_name, value: b.slug })),
  ];
  return experience === 'mobile' ? <MobileReport targets={targets} /> : <DesktopReport targets={targets} />;
}
