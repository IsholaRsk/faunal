import type { Metadata } from 'next';
import Link from 'next/link';
import { accountData, appData } from '@/lib/ui/server';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopProfile } from '@/components/desktop/profile';
import { MobileProfile } from '@/components/mobile/profile';
import { pageMeta } from '@/lib/ui/seo';
import type { SessionUser } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Account',
  description: 'Your FAUNAL profile, orders, documents and preferences.',
  path: '/profile',
  noindex: true,
}) as Metadata;

function Gate({ mobile }: { mobile: boolean }) {
  const body = (
    <EmptyState
      icon="user"
      title="Sign in to FAUNAL"
      body="Your profile, saved animals, orders and document vault live on one account — usable on the web and in the app."
      action={
        <Link href="/login?next=/profile" className="btn">
          Sign in
        </Link>
      }
    />
  );
  return mobile ? <div className="px-4 py-10">{body}</div> : <div className="shell py-20">{body}</div>;
}

export default function ProfilePage() {
  const { user, experience } = appData();
  if (!user) return <Gate mobile={experience === 'mobile'} />;
  const data = accountData(user as SessionUser);
  return experience === 'mobile' ? <MobileProfile data={data as never} /> : <DesktopProfile data={data as never} />;
}
