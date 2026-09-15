import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { DOCS } from '@/lib/ui/static-content';
import { rulebookStats } from '@/lib/ui/doc-stats';
import { DesktopDoc } from '@/components/desktop/docs';
import { MobileDoc } from '@/components/mobile/docs';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'How legality is decided',
  description: DOCS.compliance.lede,
  path: '/compliance',
}) as Metadata;

export default function CompliancePage() {
  const { experience } = appData();
  const stats = rulebookStats();
  return experience === 'mobile' ? <MobileDoc doc={DOCS.compliance} stats={stats} /> : <DesktopDoc doc={DOCS.compliance} stats={stats} />;
}
