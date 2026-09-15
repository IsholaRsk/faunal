import type { Metadata } from 'next';
import Link from 'next/link';
import { appData } from '@/lib/ui/server';
import { checkoutPreview } from '@/repo/orders';
import { listAddresses, listPaymentMethods } from '@/repo/account';
import { get } from '@/lib/db/kit';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopCheckout } from '@/components/desktop/checkout';
import { MobileCheckout } from '@/components/mobile/checkout';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Checkout',
  description: 'Confirm destination legality, transport and payment in escrow.',
  path: '/checkout',
  noindex: true,
}) as Metadata;

export default function CheckoutPage() {
  const { user, experience } = appData();

  if (!user) {
    const body = (
      <div className={experience === 'mobile' ? 'px-4 py-12' : 'shell py-20'}>
        <EmptyState
          icon="lock"
          title="Sign in to check out"
          body="Checkout needs a verified FAUNAL account: the compliance desk has to know who is receiving the animal and where it will live."
          action={
            <div className="flex gap-2">
              <Link href="/login?next=/checkout" className="btn">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-quiet">
                Create an account
              </Link>
            </div>
          }
        />
      </div>
    );
    return experience === 'mobile' ? <div>{body}</div> : body;
  }

  let preview = null as ReturnType<typeof checkoutPreview> | null;
  let error: string | null = null;
  try {
    preview = checkoutPreview(user as never, {});
  } catch (e) {
    error = e instanceof Error ? e.message : 'Checkout could not be prepared.';
  }

  const addresses = listAddresses(user as never) as never;
  const methods = listPaymentMethods(user as never) as never;
  const contact = {
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    email: user.email,
    phone: get<{ phone: string | null }>(`SELECT phone FROM users WHERE id = ?`, [user.id])?.phone ?? '',
  };

  if (error && !preview) {
    return (
      <div className={experience === 'mobile' ? 'px-4 py-12' : 'shell py-20'}>
        <EmptyState
          icon="alert"
          title="Checkout is on hold"
          body={error}
          action={
            <Link href="/cart" className="btn">
              Back to cart
            </Link>
          }
        />
      </div>
    );
  }

  return experience === 'mobile' ? (
    <MobileCheckout initial={preview as never} addresses={addresses} methods={methods} contact={contact} />
  ) : (
    <DesktopCheckout initial={preview as never} addresses={addresses} methods={methods} contact={contact} />
  );
}
