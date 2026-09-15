import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { DOCS } from '@/lib/ui/static-content';
import { DesktopDoc } from '@/components/desktop/docs';
import { MobileDoc } from '@/components/mobile/docs';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { doc: string } }): Metadata {
  const doc = DOCS[`legal/${params.doc}`];
  if (!doc) return { title: 'Legal' };
  return pageMeta({ title: doc.title, description: doc.lede, path: `/legal/${doc.slug}` }) as Metadata;
}

export default function LegalDocPage({ params }: { params: { doc: string } }) {
  const doc = DOCS[`legal/${params.doc}`];
  if (!doc) notFound();
  const { experience } = appData();
  return experience === 'mobile' ? <MobileDoc doc={doc} /> : <DesktopDoc doc={doc} />;
}
