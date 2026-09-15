import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adminScreen } from '@/lib/ui/admin-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

const SECTIONS = ['listings', 'verifications', 'documents', 'reports', 'fraud', 'users', 'orders', 'rules', 'analytics', 'audit'];

export const metadata: Metadata = pageMeta({ title: 'Console', description: 'Trust, compliance and commerce controls.', path: '/admin', noindex: true }) as Metadata;

export default function AdminSectionPage({ params, searchParams }: { params: { section: string }; searchParams: { q?: string } }) {
  if (!SECTIONS.includes(params.section)) notFound();
  return adminScreen(params.section, typeof searchParams.q === 'string' ? searchParams.q : '');
}
