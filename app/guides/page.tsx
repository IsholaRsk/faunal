import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { guides } from '@/repo/catalog';
import { DesktopGuides } from '@/components/desktop/guides';
import { MobileGuides } from '@/components/mobile/guides';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Care guides',
  description: 'Husbandry, setup and paperwork guides from the FAUNAL care desk.',
  path: '/guides',
}) as Metadata;

export default function GuidesPage() {
  const { experience } = appData();
  const rows = guides(true) as never[];
  return experience === 'mobile' ? <MobileGuides rows={rows} /> : <DesktopGuides rows={rows} featured={(rows[0] as never) ?? null} />;
}
