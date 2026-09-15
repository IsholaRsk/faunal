import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { detail } from '@/repo/messaging';
import { DesktopThread } from '@/components/desktop/inbox';
import { MobileThread } from '@/components/mobile/inbox';
import type { SessionUser } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false } };

export default function ThreadPage({ params }: { params: { id: string } }) {
  const { user, experience } = appData();
  if (!user) notFound();
  const data = detail(user as SessionUser, params.id);
  if (!data) notFound();
  return (
    <Suspense fallback={null}>
      {experience === 'mobile' ? <MobileThread data={data as never} /> : <DesktopThread data={data as never} />}
    </Suspense>
  );
}
