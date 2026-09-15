import { docLabel, titleCase } from '@/domain/util';
import type { ComplianceResult } from '@/domain/types';

/**
 * Pure presentation logic for the animal detail screen. Both surfaces import
 * this so the wording, the husbandry table and the FAQ can never diverge —
 * only the layout does (spec §48: shared logic, separate components).
 */

export type Rec = Record<string, unknown>;

export interface QuoteView {
  method: string;
  label: string;
  blurb: string;
  cost_cents: number;
  eta_days: number;
  temp_controlled: boolean;
  available: boolean;
  unavailable_reason?: string;
}

export interface AnimalView {
  animal: Rec;
  species: Rec;
  images: Rec[];
  videos: Rec[];
  breeder: Rec;
  documents: { doc_type: string; status: string; expires_at: string | null; accessible: boolean }[];
  requiredDocuments: { doc_type: string; mandatory: number; description: string }[];
  reviews: Rec[];
  similar: Rec[];
  compliance: { status: string; notes: string } | null;
  verdict: ComplianceResult;
  quotes: QuoteView[];
  destination: { code: string; label: string };
  viewer: { id: string; firstName: string; breederId: string | null; role: string } | null;
  isFavorite: boolean;
  cartQty: number;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback);

export function money(cents: number): string {
  return cents % 100 === 0 ? `$${Math.round(cents / 100).toLocaleString('en-US')}` : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export function isAvailable(v: AnimalView): boolean {
  return str(v.animal.availability) === 'AVAILABLE' && str(v.animal.status) === 'APPROVED';
}

export function primaryActionLabel(v: AnimalView): { label: string; blockedReason: string | null } {
  if (str(v.animal.availability) === 'SOLD_OUT' || str(v.animal.status) === 'SOLD') return { label: 'Sold', blockedReason: 'This animal has already found a home.' };
  if (str(v.animal.availability) === 'RESERVED') return { label: 'Reserved', blockedReason: 'A deposit is placed; join the waitlist from the breeder.' };
  if (!v.verdict.canBuy) {
    return { label: 'Not available to you', blockedReason: verdictHeadline(v) };
  }
  if (v.verdict.verdict === 'REQUIRES_DOCUMENTATION') {
    return { label: 'Add to cart', blockedReason: null };
  }
  if (v.cartQty > 0) return { label: 'In your cart', blockedReason: null };
  return { label: 'Add to cart', blockedReason: null };
}

export function verdictHeadline(v: AnimalView): string {
  const dest = v.destination.label;
  switch (v.verdict.verdict) {
    case 'ALLOWED':
      return `Clear to keep and ship to ${dest}.`;
    case 'RESTRICTED':
      return v.verdict.notes[0] ?? `Allowed in ${dest} with conditions you must accept at checkout.`;
    case 'REQUIRES_DOCUMENTATION':
      return `${dest} requires ${v.verdict.missingDocuments.map(docLabel).join(' and ')} before this animal can move.`;
    case 'REQUIRES_ADMIN_REVIEW':
      return `This listing is held by the FAUNAL compliance desk while paperwork is confirmed.`;
    case 'PROHIBITED':
      return `${str(v.species.common_name, 'This species')} cannot legally be kept or received in ${dest}.`;
    default:
      return '';
  }
}

export function verdictTone(verdict: string): 'ok' | 'warn' | 'bad' {
  if (verdict === 'ALLOWED') return 'ok';
  if (verdict === 'PROHIBITED') return 'bad';
  return 'warn';
}

export function husbandryRows(v: AnimalView): { label: string; value: string }[] {
  const a = v.animal;
  const s = v.species;
  const setup = JSON.parse(str(s.setup_range_cm, '[24, 36]')) as number[];
  return [
    { label: 'Enclosure (minimum)', value: `${setup[0]}–${setup[1]} cm floor, ${str(a.enclosure_min_cm) ? `listed needs ${num(a.enclosure_min_cm)} cm` : 'vertical if arboreal'}` },
    { label: 'Temperature', value: str(a.temperature_f, str(s.temperature_f, 'gradient per species sheet')) },
    { label: 'Humidity', value: str(a.humidity_pct, str(s.humidity_pct, '40–60% with a humid hide')) },
    { label: 'Diet', value: str(a.diet, str(s.diet, 'Staple prey, dusted with calcium')) },
    { label: 'Feeding rhythm', value: str(a.feeding_schedule, 'Adults every 5–7 days') },
    { label: 'Adult size', value: `${num(s.adult_length_cm)} cm typical` },
    { label: 'Expected lifespan', value: `${num(s.life_expectancy_years)} years in captivity` },
    { label: 'Experience needed', value: titleCase(str(a.experience_level, 'BEGINNER')) },
  ];
}

export function specRows(v: AnimalView): { label: string; value: string }[] {
  const a = v.animal;
  return [
    { label: 'Species', value: `${str(v.species.common_name)} · ${str(v.species.scientific_name)}` },
    { label: 'Morph', value: str(a.morph_name, 'Standard / wild type') },
    { label: 'Subspecies', value: str(a.subspecies_name, '—') },
    { label: 'Sex', value: str(a.sex_label ?? sexLabel(str(a.sex))) },
    { label: 'Age', value: str(a.age_label ?? ageLabel(num(a.age_months))) },
    { label: 'Weight', value: `${num(a.weight_g)} g` },
    { label: 'Total length', value: `${num(a.length_cm)} cm` },
    { label: 'Colour description', value: str(a.color, 'See photography') },
    { label: 'Temperament', value: str(a.temperament, 'Documented in the breeder notes') },
    { label: 'Origin', value: a.captive_bred ? `Captive bred — ${str(a.city)}, ${str(a.state)}` : `Circus collection — ${str(a.city)}, ${str(a.state)}` },
    { label: 'Health status', value: titleCase(str(a.health_status, 'CLEAR')) },
    { label: 'Last vet check', value: str(a.last_health_check).slice(0, 10) || 'Not recorded' },
  ];
}

const sexLabel = (sex: string) => (sex === 'MALE' ? 'Male' : sex === 'FEMALE' ? 'Female' : 'Not sexed');
const ageLabel = (months: number) => (months >= 24 ? `${(months / 12).toFixed(months % 12 ? 1 : 0)} yr` : `${months} mo`);

export function documents(v: AnimalView): { label: string; status: string; expires: string; accessible: boolean; mandatory: boolean; note: string }[] {
  const reqByType = new Map(v.requiredDocuments.map((r) => [r.doc_type, r]));
  const seen = new Set<string>();
  const rows = v.documents.map((d) => {
    seen.add(d.doc_type);
    const req = reqByType.get(d.doc_type);
    return {
      label: docLabel(d.doc_type),
      status: titleCase(d.status),
      expires: d.expires_at ? d.expires_at.slice(0, 10) : 'no expiry',
      accessible: d.accessible,
      mandatory: !!req?.mandatory,
      note: req?.description ?? '',
    };
  });
  for (const r of v.requiredDocuments) {
    if (seen.has(r.doc_type) || rows.some((x) => x.label === docLabel(r.doc_type))) continue;
    rows.push({
      label: docLabel(r.doc_type),
      status: 'Not attached',
      expires: '—',
      accessible: false,
      mandatory: !!r.mandatory,
      note: r.description,
    });
  }
  return rows;
}

export function faq(v: AnimalView): { q: string; a: string }[] {
  const s = v.species;
  const a = v.animal;
  const dest = v.destination.label;
  const out: { q: string; a: string }[] = [
    {
      q: `Is it legal to keep ${str(s.common_name, 'this animal').toLowerCase()} in ${dest}?`,
      a:
        v.verdict.verdict === 'ALLOWED'
          ? `Yes. FAUNAL checked ${str(s.common_name).toLowerCase()} against ${dest} state law, the seller's credentials and the transport route. Verdict: allowed, with our standard terms.`
          : v.verdict.verdict === 'PROHIBITED'
            ? `No. ${str(s.common_name)} is restricted where you are shipping, so checkout stays closed for this destination. Change your shipping state in the header to see what is legal for you.`
            : `Conditional. ${verdictHeadline(v)} The compliance panel above lists exactly which rule applies and which document closes the gap.`,
    },
    {
      q: 'Is this animal captive bred?',
      a: a.captive_bred
        ? `Yes — bred on site at ${str(a.city)}, ${str(a.state)}. Proof of captive origin is filed with the compliance desk and shown as verified on the breeder's page.`
        : 'Not captive bred. FAUNAL only lists captive-bred or legally grandfathered animals with documented provenance; read the origin note on this listing.',
    },
    {
      q: 'How is a live animal shipped?',
      a: `The breeder chooses between local pickup, insured specialized live-animal courier${v.quotes.some((q) => q.method === 'BREEDER_DELIVERY') ? ' or breeder delivery' : ''}. Live air freight is booked on mild days only, in a temperature-boxed container with a heat or cool pack depending on the forecast. ${v.quotes.some((q) => q.temp_controlled) ? 'This species travels in temperature-controlled packaging.' : ''}`,
    },
    {
      q: 'What do I need before it arrives?',
      a: `Enclosure: ${husbandryRows(v)[0].value}. Heat and UVB per the husbandry table above, a digital thermometer/hygrometer, and a quiet 7–10 day break-in period where you do not handle it. ${str(s.care_difficulty) ? `Care level is rated ${titleCase(str(s.care_difficulty))}.` : ''}`,
    },
    {
      q: 'What happens if it arrives poorly?',
      a: 'You have a 48-hour condition window. Photograph the unopened transit container, open a dispute from the order page and the payment stays in escrow while a licensed veterinarian reviews it. If the animal is not fit, the transfer is voided, the refund is released from escrow and the animal goes to a partner rescue instead of back into the mail.',
    },
    {
      q: 'What is in the price?',
      a: `The animal, its documentation pack (${documents(v).filter((d) => d.mandatory).length} required items), a written health guarantee from the breeder and the chosen transport method. Enclosure, lighting and food are not included — ask the breeder in the chat and they will often sell you a starter setup.`,
    },
  ];
  if (str(s.cites_appendix)) {
    out.splice(1, 0, {
      q: 'Does this species need CITES paperwork?',
      a: `Listed on Appendix ${str(s.cites_appendix)}. The seller must attach transfer paperwork before the animal can move; FAUNAL holds the listing until that document is verified, and every transfer is logged for the management-authority audit trail.`,
    });
  }
  return out;
}

export function trustPoints(v: AnimalView): string[] {
  const out = ['Escrowed payment, released 48 h after arrival', 'Health certificate reviewed by our vet desk', 'Legality checked for your exact ZIP before you pay'];
  if (num(v.breeder.transactions_count) > 0) out.push(`${num(v.breeder.transactions_count)} completed transfers on record`);
  if (v.verdict.needsAdminReview) out.push('Held for manual compliance review before dispatch');
  return out;
}

export function methodLabel(m: string): string {
  return titleCase(m);
}
