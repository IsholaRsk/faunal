import { notFound, redirect } from 'next/navigation';
import { appData } from '@/lib/ui/server';
import { sellerBundle, wizardData, DOCUMENT_TYPES } from '@/lib/ui/seller-data';
import { getDb } from '@/db';
import { SellerGate, DesktopSellerDashboard, DesktopSellerListings, DesktopSellerOrders, DesktopSellerDocuments, DesktopSellerReviews, DesktopSellerPlan, DesktopListingWizard } from '@/components/desktop/seller';
import { MobileSellerGate, MobileSellerDashboard, MobileSellerListings, MobileSellerOrders, MobileSellerDocuments, MobileSellerReviews, MobileSellerPlan, MobileListingWizard } from '@/components/mobile/seller';

/**
 * One dispatcher for every seller screen: the same data, the same rules, two
 * deliberately different layouts.
 */
export function sellerScreen<K extends keyof typeof SCREENS>(key: K, opts: { animalId?: string; next?: string } = {}) {
  const { user, experience } = appData();
  if (!user) redirect(`/login?next=${encodeURIComponent(opts.next ?? '/seller')}`);
  const mobile = experience === 'mobile';

  const db = getDb();
  const breeder = user.breederId ? (db.prepare(`SELECT status FROM breeders WHERE id = ?`).get(user.breederId) as { status: string } | undefined) : undefined;
  if (!user.breederId || !breeder) {
    return mobile ? <MobileSellerGate kind="access" /> : <SellerGate mobile={mobile} />;
  }
  if (breeder.status !== 'APPROVED') {
    const kind = breeder.status === 'REJECTED' ? 'rejected' : 'pending';
    return mobile ? <MobileSellerGate kind={kind} /> : <SellerGate mobile={mobile} kind={kind} />;
  }

  const data = sellerBundle(user as never) as never;
  return SCREENS[key](mobile, data, opts);
}

const SCREENS = {
  dashboard: (mobile: boolean, data: never) => (mobile ? <MobileSellerDashboard data={data} /> : <DesktopSellerDashboard data={data} />),
  listings: (mobile: boolean, data: { listings: never[] }) => (mobile ? <MobileSellerListings rows={data.listings} /> : <DesktopSellerListings rows={data.listings} />),
  orders: (mobile: boolean, data: { orders: never[] }) => (mobile ? <MobileSellerOrders rows={data.orders} /> : <DesktopSellerOrders rows={data.orders} />),
  documents: (mobile: boolean, data: { documents: never[] }) =>
    mobile ? <MobileSellerDocuments rows={data.documents} types={DOCUMENT_TYPES} /> : <DesktopSellerDocuments rows={data.documents} types={DOCUMENT_TYPES} />,
  reviews: (mobile: boolean, data: { reviews: never[]; dash: { breeder: Record<string, string | number | null> | null } }) => {
    const rating = { avg: Number(data.dash.breeder?.rating_avg ?? 0), count: Number(data.dash.breeder?.rating_count ?? 0) };
    return mobile ? <MobileSellerReviews rows={data.reviews} rating={rating} /> : <DesktopSellerReviews rows={data.reviews} rating={rating} />;
  },
  plan: (mobile: boolean, data: never) => (mobile ? <MobileSellerPlan data={data} /> : <DesktopSellerPlan data={data} />),
  wizard: (mobile: boolean, _data: never, opts: { animalId?: string }) => {
    const data = wizardData(opts.animalId) as never;
    if (opts.animalId) {
      // Only the owner may edit a draft listing — the repo enforces it again on save.
      const owner = getDb().prepare(`SELECT breeder_id FROM animals WHERE id = ?`).get(opts.animalId) as { breeder_id: string } | undefined;
      if (!owner) notFound();
    }
    return mobile ? <MobileListingWizard data={data} /> : <DesktopListingWizard data={data} />;
  },
};
