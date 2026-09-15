import type { Metadata } from 'next';
import { adminScreen } from '@/lib/ui/admin-page';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({ title: 'Console', description: 'Trust, compliance and commerce controls.', path: '/admin', noindex: true }) as Metadata;

export default function AdminHome() {
  return adminScreen('');
}
