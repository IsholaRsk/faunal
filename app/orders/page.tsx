import type { Metadata } from 'next';
import Link from 'next/link';
import { appData } from '@/lib/ui/server';
import { myOrders } from '@/repo/orders';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopOrders } from '@/components/desktop/account';
import { MobileOrders } from '@/components/mobile/account';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'My orders',
  description: 'Track transport legs, escrow state and paperwork for every FAUNAL order.',
  path: '/orders',
  noindex: true,
}) as Metadata;

export default function OrdersPage({ searchParams }: { searchParams: { scope?: string } }) {
  const { user, experience } = appData();
  if (!user) {
    const body = (
      <div className={experience === 'mobile' ? 'px-4 py-10' : 'shell py-20'}>
        <EmptyState
          icon="box"
          title="Sign in to see your orders"
          body="Order tracking, escrow state, transport legs and reviews live on your account."
          action={
            <Link href="/login?next=/orders" className="btn">
              Sign in
            </Link>
          }
        />
      </div>
    );
    return body;
  }
  const scope = (['active', 'completed', 'cancelled', 'all'] as const).includes(searchParams.scope as never)
    ? (searchParams.scope as 'active' | 'completed' | 'cancelled' | 'all')
    : 'active';
  const rows = myOrders(user as never, scope);
  return experience === 'mobile' ? (
    <MobileOrders rows={rows as never} scope={scope} />
  ) : (
    <DesktopOrders rows={rows as never} scope={scope} />
  );
}
