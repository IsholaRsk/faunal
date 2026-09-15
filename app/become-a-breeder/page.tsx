import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { appData } from '@/lib/ui/server';
import { onboardedStates } from '@/repo/catalog';
import { DesktopApply } from '@/components/desktop/apply';
import { MobileApply } from '@/components/mobile/apply';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Become a verified breeder',
  description: 'Apply to sell captive-bred, legally permitted exotic animals on FAUNAL.',
  path: '/become-a-breeder',
}) as Metadata;

export default function ApplyPage() {
  const { user, experience } = appData();
  if (!user) redirect('/login?next=/become-a-breeder');
  const db = getDb();
  const account = user ? (db.prepare(`SELECT first_name, last_name, email, city FROM users WHERE id = ?`).get(user.id) as { first_name: string; last_name: string; email: string; city: string | null } | undefined) : undefined;
  const props = {
    states: onboardedStates(),
    city: account?.city ?? '',
    email: account?.email ?? '',
    name: account ? `${account.first_name} ${account.last_name}` : '',
    already: !!user?.breederId,
  };
  return experience === 'mobile' ? <MobileApply {...props} /> : <DesktopApply {...props} />;
}
