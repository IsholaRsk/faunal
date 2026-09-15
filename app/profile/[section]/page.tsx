import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { accountData, appData } from '@/lib/ui/server';
import { DesktopAccount } from '@/components/desktop/profile';
import { MobileAccount } from '@/components/mobile/profile';
import type { SessionUser } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account settings', robots: { index: false } };

const SECTIONS = ['settings', 'security', 'addresses', 'payment', 'documents'];

export default function AccountSectionPage({ params }: { params: { section: string } }) {
  const { user, experience } = appData();
  if (!user) notFound();
  if (!SECTIONS.includes(params.section)) notFound();
  const section = params.section === 'settings' ? 'profile' : params.section;
  const data = accountData(user as SessionUser);
  return experience === 'mobile' ? (
    <MobileAccount section={section} data={data as never} />
  ) : (
    <DesktopAccount section={section} data={data as never} />
  );
}
