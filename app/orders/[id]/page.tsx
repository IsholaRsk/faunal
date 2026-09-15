import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { orderFor, availableTransitions } from '@/repo/orders';
import { actionFor } from '@/lib/ui/order-actions';
import { DesktopOrderDetail } from '@/components/desktop/account';
import { MobileOrderDetail } from '@/components/mobile/account';
import type { SessionUser } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };

export default function OrderPage({ params }: { params: { id: string } }) {
  const { user, experience } = appData();
  if (!user) notFound();
  const data = orderFor(params.id, user as SessionUser);
  if (!data) notFound();
  const actions = availableTransitions(data.order as never, user as SessionUser).map(actionFor);
  const isBuyer = user.id === (data.order as Record<string, string | null>).buyer_id;
  const props = { data: data as never, actions, isBuyer };
  return experience === 'mobile' ? <MobileOrderDetail {...props} /> : <DesktopOrderDetail {...props} />;
}
