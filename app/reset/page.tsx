import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { onboardedStates } from '@/repo/catalog';
import { DesktopAuth } from '@/components/desktop/auth';
import { MobileAuth } from '@/components/mobile/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'reset',
  robots: { index: false, follow: true },
};

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { user, experience } = appData();
  const next = typeof searchParams.next === 'string' ? searchParams.next : '';
  if (user) redirect(next || '/');
  const states = onboardedStates();
  return experience === 'mobile' ? <MobileAuth mode="reset" states={states} /> : <DesktopAuth mode="reset" states={states} />;
}
