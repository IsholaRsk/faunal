import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { appData } from '@/lib/ui/server';
import { DOCS } from '@/lib/ui/static-content';
import { rulebookStats, documentStats } from '@/lib/ui/doc-stats';
import { DesktopDoc } from '@/components/desktop/docs';
import { MobileDoc } from '@/components/mobile/docs';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

const DOC_KEYS: Record<string, string> = {
  documents: 'compliance/documents',
  shipping: 'compliance/shipping',
  protection: 'compliance/protection',
};

export function generateMetadata({ params }: { params: { doc: string } }): Metadata {
  const doc = DOCS[DOC_KEYS[params.doc] ?? ''];
  if (!doc) return { title: 'Compliance' };
  return pageMeta({ title: doc.title, description: doc.lede, path: `/compliance/${params.doc}` }) as Metadata;
}

export default function ComplianceSubPage({ params }: { params: { doc: string } }) {
  const key = DOC_KEYS[params.doc];
  const doc = key ? DOCS[key] : undefined;
  if (!doc) notFound();
  const { experience } = appData();
  const stats = doc.stats === 'documents' ? documentStats() : doc.stats === 'rulebook' ? rulebookStats() : null;
  return experience === 'mobile' ? <MobileDoc doc={doc} stats={stats} /> : <DesktopDoc doc={doc} stats={stats} />;
}
