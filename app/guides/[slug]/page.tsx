import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { guideBySlug, guides } from '@/repo/catalog';
import { DesktopGuide } from '@/components/desktop/guides';
import { MobileGuide } from '@/components/mobile/guides';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const g = guideBySlug(params.slug);
  if (!g) return { title: 'Guide' };
  return pageMeta({
    title: String(g.title),
    description: String(g.excerpt),
    path: `/guides/${g.slug}`,
    image: g.cover_path ? String(g.cover_path) : undefined,
  }) as Metadata;
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const { experience } = appData();
  const guide = guideBySlug(params.slug);
  if (!guide) notFound();
  const related = (guides(true) as Record<string, string | number | null>[]).filter((g) => g.slug !== guide.slug).slice(0, 3);
  return experience === 'mobile' ? (
    <MobileGuide guide={guide as never} related={related as never} />
  ) : (
    <DesktopGuide guide={guide as never} related={related as never} />
  );
}
