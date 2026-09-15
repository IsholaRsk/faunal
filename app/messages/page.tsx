import type { Metadata } from 'next';
import Link from 'next/link';
import { appData } from '@/lib/ui/server';
import { listConversations } from '@/repo/messaging';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopInbox } from '@/components/desktop/inbox';
import { MobileInbox } from '@/components/mobile/inbox';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Messages',
  description: 'Talk to breeders about animals, paperwork and handoffs — inside the protected marketplace.',
  path: '/messages',
  noindex: true,
}) as Metadata;

export default function MessagesPage() {
  const { user, experience } = appData();
  if (!user) {
    return (
      <div className={experience === 'mobile' ? 'px-4 py-10' : 'shell py-20'}>
        <EmptyState
          icon="chat"
          title="Sign in to message breeders"
          body="Chat is tied to your account so that disputes, paperwork and buyer protection have an audit trail."
          action={
            <Link href="/login?next=/messages" className="btn">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }
  const rows = listConversations(user as never);
  return experience === 'mobile' ? <MobileInbox conversations={rows as never} /> : <DesktopInbox conversations={rows as never} />;
}
