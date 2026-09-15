import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { DOCS } from '@/lib/ui/static-content';
import { DesktopDoc } from '@/components/desktop/docs';
import { MobileDoc } from '@/components/mobile/docs';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'About FAUNAL',
  description: DOCS.about.lede,
  path: '/about',
}) as Metadata;

export default function AboutPage() {
  const { experience } = appData();
  return experience === 'mobile' ? <MobileDoc doc={DOCS.about} /> : <DesktopDoc doc={DOCS.about} />;
}
