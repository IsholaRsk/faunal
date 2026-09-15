import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { animalBySlug, bumpViews, trackEvent, stateAvailability } from '@/repo/catalog';
import { evaluateCompliance, recordComplianceCheck, jurisdictionFor } from '@/domain/compliance';
import { buildQuotes } from '@/domain/shipping';
import type { DocType, ShippingMethod } from '@/domain/types';
import { get } from '@/lib/db/kit';
import { DesktopAnimal } from '@/components/desktop/animal';
import { MobileAnimal } from '@/components/mobile/animal';
import { SITE, pageMeta, jsonLd } from '@/lib/ui/seo';
import { money, type AnimalView } from '@/lib/ui/animal-view';

export const dynamic = 'force-dynamic';

type Ctx = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

const STATE_NAMES: Record<string, string> = {
  NY: 'New York',
  NYC: 'New York City',
  FL: 'Florida',
  TX: 'Texas',
  CA: 'California',
  AZ: 'Arizona',
  OH: 'Ohio',
  MA: 'Massachusetts',
  NV: 'Nevada',
  PA: 'Pennsylvania',
  GA: 'Georgia',
  IL: 'Illinois',
  NC: 'North Carolina',
};

function destinationFor(user: { jurisdictionCode: string | null; city?: string | null } | null, override: string | null) {
  const code = (override ?? user?.jurisdictionCode ?? 'NY').toUpperCase();
  return { code, label: STATE_NAMES[code] ?? code };
}

function build(slug: string, ctx: Ctx): (AnimalView & { speciesId: string }) | null {
  const { user } = appData();
  const detail = animalBySlug(slug, user as never);
  if (!detail) return null;
  const animal = detail.animal as Record<string, unknown>;
  const species = detail.species as Record<string, unknown>;
  const dest = destinationFor(user, typeof ctx.searchParams.shipTo === 'string' ? ctx.searchParams.shipTo : null);
  const juris = jurisdictionFor({ state: dest.code === 'NYC' ? 'NY' : dest.code, city: dest.code === 'NYC' ? 'New York' : null });
  const destinationId = String(juris.city?.id ?? juris.state?.id ?? '');

  const verifiedDocs = get<{ n: string | null }>(
    `SELECT json_group_array(doc_type) AS n FROM animal_documents WHERE (animal_id = ? OR (breeder_id = ? AND doc_type IN ('BREEDER_LICENSE','PERMIT'))) AND status='VERIFIED'`,
    [String(animal.id), String(animal.breeder_id)],
  );
  const verified = (verifiedDocs?.n ? (JSON.parse(verifiedDocs.n) as string[]) : []) as DocType[];

  const subject = {
    speciesId: String(animal.species_id),
    animalId: String(animal.id),
    breederId: String(animal.breeder_id),
    originJurisdictionId: String(animal.jurisdiction_id),
    destinationJurisdictionId: destinationId || null,
    buyerUserId: user?.id ?? null,
    verifiedDocuments: verified,
  };
  const verdict = evaluateCompliance(subject);
  recordComplianceCheck('ANIMAL', String(animal.id), subject, verdict);

  const quotes = buildQuotes({
    originState: String(animal.state),
    destinationState: dest.code,
    speciesId: String(animal.species_id),
    weightKg: (Number(animal.weight_g ?? 400) || 400) / 1000,
    blockedMethods: verdict.blockedMethods.map((m) => m.method as ShippingMethod),
    requiresHealthCertificate: verdict.requiredDocuments.includes('HEALTH_CERTIFICATE'),
  });

  const favorite = user ? get(`SELECT 1 AS x FROM favorites WHERE user_id = ? AND animal_id = ?`, [user.id, String(animal.id)]) : null;
  const inCart = user ? get<{ quantity: number }>(`SELECT quantity FROM cart_items WHERE user_id = ? AND animal_id = ?`, [user.id, String(animal.id)]) : null;

  const v: AnimalView = {
    animal,
    species,
    images: detail.images as never,
    videos: detail.videos as never,
    breeder: detail.breeder as never,
    documents: detail.documents as never,
    requiredDocuments: detail.requiredDocuments as never,
    reviews: detail.reviews as never,
    similar: detail.similar as never,
    compliance: detail.compliance,
    verdict,
    quotes,
    destination: dest,
    viewer: user ? { id: user.id, firstName: user.firstName, breederId: user.breederId ?? null, role: user.role } : null,
    isFavorite: !!favorite,
    cartQty: inCart?.quantity ?? 0,
  };
  return { ...v, speciesId: String(animal.species_id) };
}

export function generateMetadata({ params, searchParams }: Ctx): Metadata {
  const { user } = appData();
  const detail = animalBySlug(params.slug, user as never);
  if (!detail) return { title: 'Listing not found' } as Metadata;
  const a = detail.animal as Record<string, unknown>;
  const s = detail.species as Record<string, unknown>;
  const dest = destinationFor(user, typeof searchParams.shipTo === 'string' ? searchParams.shipTo : null);
  const desc = `${String(s.common_name)}${a.morph_name ? ` (${String(a.morph_name)})` : ''} — ${String(a.name)}, ${money(Number(a.price_cents))}. Captive bred in ${String(a.city)}, ${String(a.state)}. Legal status for ${dest.label}: checked at listing time.`;
  const image = (detail.images as Record<string, unknown>[])[0]?.path_medium as string | undefined;
  return pageMeta({
    title: `${String(a.name)} · ${String(s.common_name)} — FAUNAL`,
    description: desc,
    path: `/animals/${params.slug}`,
    type: 'product',
    image: image ?? undefined,
  }) as Metadata;
}

export default function AnimalPage({ params, searchParams }: Ctx) {
  const { experience, user } = appData();
  const v = build(params.slug, { params, searchParams });
  if (!v) notFound();

  bumpViews(v.animal.id as string);
  trackEvent(user?.id ?? null, 'VIEW', String(v.animal.id));
  const rules = stateAvailability(v.speciesId);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${String(v.animal.name)} — ${String(v.species.common_name)}${v.animal.morph_name ? ` (${String(v.animal.morph_name)})` : ''}`,
    description: String(v.animal.description),
    image: v.images.map((i) => String(i.path_medium ?? i.base_path)),
    sku: String(v.animal.id).slice(-10).toUpperCase(),
    brand: { '@type': 'Organization', name: String(v.breeder.business_name) },
    offers: {
      '@type': 'Offer',
      price: (Number(v.animal.price_cents) / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: v.animal.availability === 'AVAILABLE' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE.url}/animals/${String(v.animal.slug)}`,
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
      },
    },
    aggregateRating: Number(v.breeder.rating_count)
      ? { '@type': 'AggregateRating', ratingValue: Number(v.breeder.rating_avg).toFixed(2), reviewCount: Number(v.breeder.rating_count) }
      : undefined,
  };

  return (
    <>
      {jsonLd(ld)}
      {experience === 'mobile' ? <MobileAnimal v={v} /> : <DesktopAnimal v={v} />}
      <span className="sr-only">
        Legal status of {String(v.species.common_name)} across {rules.length} reviewed jurisdictions. FAUNAL blocks checkout when the
        destination, species or transport method is not permitted.
      </span>
    </>
  );
}
