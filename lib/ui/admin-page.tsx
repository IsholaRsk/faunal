import { redirect } from 'next/navigation';
import { appData } from '@/lib/ui/server';
import { getDb } from '@/db';
import * as admin from '@/repo/admin';
import { DesktopAdmin } from '@/components/desktop/admin';
import { MobileAdmin } from '@/components/mobile/admin';
import type { AdminBundle } from '@/components/desktop/admin';

/** Builds the console payload once and hands it to the matching surface. */
export function adminScreen(section: string, query: string = '') {
  const { user, experience } = appData();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') redirect('/');

  const db = getDb();
  const overview = admin.overview();
  const data: AdminBundle = {
    kpis: overview.kpis as unknown as Record<string, number>,
    days: overview.days,
    byCategory: overview.byCategory,
    states: overview.states,
    queue: admin.moderationQueue('PENDING_REVIEW') as never,
    verifications: admin.verificationQueue() as never,
    documents: admin.documentsQueue().filter((d) => d.status === 'PENDING') as never,
    reports: admin.reports('OPEN') as never,
    flags: admin.fraudQueue() as never,
    users: admin.users(query, 40) as never,
    orders: admin.ordersTable('ALL') as never,
    rules: admin.rulesFor() as never,
    audit: admin.recentAudit(60) as never,
    analytics: admin.analytics() as never,
    species: db.prepare(`SELECT id, common_name FROM species ORDER BY common_name`).all() as { id: string; common_name: string }[],
    jurisdictions: db.prepare(`SELECT code, name FROM jurisdictions WHERE level IN ('STATE','CITY') ORDER BY code`).all() as { code: string; name: string }[],
  };

  return experience === 'mobile' ? (
    <MobileAdmin section={section} data={data} role={user.role} />
  ) : (
    <DesktopAdmin section={section} data={data} role={user.role} />
  );
}
