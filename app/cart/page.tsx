import { Suspense } from 'react';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { cartFor } from '@/repo/cart';
import { availableCount } from '@/repo/catalog';
import { pageMeta } from '@/lib/ui/seo';
import { DesktopCart } from '@/components/desktop/cart';
import { MobileCart } from '@/components/mobile/cart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Your cart',
  description: 'Review legality, documentation and transport for each animal before checkout.',
  path: '/cart',
  noindex: true,
}) as Metadata;

export default function CartPage() {
  const { user, experience } = appData();
  if (!user) {
    const av = availableCount();
    return experience === 'mobile' ? <MobileCart signedIn={false} available={av} /> : <DesktopCart signedIn={false} available={av} />;
  }
  const cart = cartFor(user as never);
  const available = availableCount();
  const body =
    experience === 'mobile' ? (
      <MobileCart signedIn cart={cart as never} available={available} />
    ) : (
      <DesktopCart signedIn cart={cart as never} available={available} />
    );
  return <Suspense fallback={null}>{body}</Suspense>;
}
