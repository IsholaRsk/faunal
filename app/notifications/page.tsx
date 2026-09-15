import type { Metadata } from 'next';
import Link from 'next/link';
import { appData } from '@/lib/ui/server';
import { list as listNotifications } from '@/domain/notify';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopNotifications } from '@/components/desktop/account';
import { MobileNotifications } from '@/components/mobile/account';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Notifications',
  description: 'Order, listing, compliance and message alerts.',
  path: '/notifications',
  noindex: true,
}) as Metadata;

export default function NotificationsPage() {
  const { user, experience } = appData();
  if (!user) {
    return (
      <div className={experience === 'mobile' ? 'px-4 py-10' : 'shell py-20'}>
        <EmptyState
          icon="bell"
          title="Sign in for alerts"
          body="FAUNAL notifies you when a saved animal changes, an order moves, or the compliance desk needs a document from you."
          action={
            <Link href="/login?next=/notifications" className="btn">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }
  const rows = listNotifications(user.id, 60);
  return experience === 'mobile' ? <MobileNotifications rows={rows as never} /> : <DesktopNotifications rows={rows as never} />;
}
