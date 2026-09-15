#!/usr/bin/env -S npx tsx
/**
 * FAUNAL seeder. Creates the reference rulebook (species × jurisdiction),
 * breeders, listings with real derivative images + perceptual hashes,
 * documents, orders, reviews, messages and trust-and-safety data.
 *
 * Legal data note: restriction entries are a *reference rulebook* (v0) written
 * for this build. They are stored in editable tables, not code, and the admin
 * console labels them as needing verification against official sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../lib/db';
import {insert, update, all } from '../lib/db/kit';
import { hashPassword } from '../lib/domain/auth';
import { id, nowIso, slugify, uniqueSlug, ageLabel } from '../lib/domain/util';
import { evaluateCompliance, recordComplianceCheck } from '../lib/domain/compliance';
import { dhashFromGrayscale } from '../lib/domain/fraud';
import { makePdf } from './lib/pdf';

const PW = 'Faunal2026!';
const RAW = path.join(process.cwd(), 'public', 'img', 'raw');
const DERIVED = path.join(process.cwd(), 'public', 'img', 'derived');
const PRIVATE = path.join(process.cwd(), 'data', 'private');

let sharp: typeof import('sharp') | null = null;

const T = nowIso();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

async function main() {
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null;
    console.warn('[seed] sharp unavailable — listing images will reference raw files');
  }
  if (!fs.existsSync(path.join(DERIVED, 'ball-python-banana-medium.webp'))) {
    console.log('[seed] derivatives missing — run npm run db:images first (continuing with raw fallback)');
  }

  const db = getDb();
  const TABLES = [
    'user_events', 'searches', 'notifications', 'messages', 'conversations', 'reviews', 'order_events', 'order_items', 'orders',
    'payments', 'refunds', 'payouts', 'shipping', 'cart_items', 'favorites', 'followed_breeders', 'blocked_users', 'animal_documents',
    'animal_videos', 'animal_images', 'animals', 'breeder_verifications', 'breeders', 'compliance_checks', 'fraud_flags', 'reports',
    'audit_logs', 'addresses', 'payment_methods', 'subscriptions', 'fees_placeholder', 'guides', 'morphs', 'subspecies', 'species_restrictions',
    'required_documents', 'transport_restrictions', 'species', 'categories', 'jurisdictions', 'fee_rules', 'profiles', 'sessions', 'auth_challenges', 'users',
    'settings', 'account_signals', 'rate_limits',
  ];
  db.pragma('foreign_keys = OFF');
  for (const t of TABLES) {
    try {
      db.exec(`DROP TABLE IF EXISTS ${t}`);
    } catch {
      /* table may legitimately not exist yet */
    }
  }
  const schema = fs.readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  db.pragma('foreign_keys = ON');

  /* ------------------------------------------------------------ jurisdictions */
  const JUR: [string, string, string][] = [
    ['US', 'United States', 'COUNTRY'],
    ['NY', 'New York', 'STATE'],
    ['NYC', 'New York City', 'CITY'],
    ['NJ', 'New Jersey', 'STATE'],
    ['CT', 'Connecticut', 'STATE'],
    ['PA', 'Pennsylvania', 'STATE'],
    ['MA', 'Massachusetts', 'STATE'],
    ['FL', 'Florida', 'STATE'],
    ['GA', 'Georgia', 'STATE'],
    ['NC', 'North Carolina', 'STATE'],
    ['TX', 'Texas', 'STATE'],
    ['CA', 'California', 'STATE'],
    ['AZ', 'Arizona', 'STATE'],
    ['OH', 'Ohio', 'STATE'],
    ['WA', 'Washington', 'STATE'],
    ['CO', 'Colorado', 'STATE'],
  ];
  const jur: Record<string, string> = {};
  for (const [code, name, level] of JUR) {
    jur[code] = id('jur');
    insert('jurisdictions', { id: jur[code], code, name, level, country: 'US' });
  }

  /* -------------------------------------------------------------- categories */
  const CATS: [string, string, string, string][] = [
    ['reptiles', 'Reptiles', 'paw', 'Snakes, geckos, lizards, turtles and other permitted reptiles'],
    ['birds', 'Birds', 'leaf', 'Parrots, exotic birds and other permitted species'],
    ['arachnids', 'Arachnids & Invertebrates', 'bug', 'Tarantulas, scorpions and permitted invertebrates'],
    ['amphibians', 'Amphibians', 'drop', 'Tree frogs, dart frogs, salamanders and newts'],
    ['fish', 'Fish', 'scale', 'Rare and exotic freshwater fish'],
    ['mammals', 'Small mammals', 'paw', 'Legally permitted exotic mammals'],
  ];
  const cat: Record<string, string> = {};
  CATS.forEach(([slug, name, icon, blurb], i) => {
    cat[slug] = id('cat');
    insert('categories', { id: cat[slug], slug, name, icon, blurb, sort: i });
  });

  /* ----------------------------------------------------------------- species */
  type Sp = {
    key: string; name: string; sci: string; cat: string; diff: string; life: number; setup: [number, number];
    len: number; space: string; diet: string; handling: string; cites?: 'I' | 'II'; sensitive?: number; desc: string; legal?: string;
  };
  const SPECIES: Sp[] = [
    sp('ball-python', 'Ball Python', 'Python regius', 'reptiles', 'BEGINNER', 25, [450, 1200], 120, 'COMPACT', 'CARNIVORE', 'HIGH',
      'The most popular pet snake in North America: docile, thrifty feeders and undemanding in a well-managed 40-gallon rack or enclosure.'),
    sp('leopard-gecko', 'Leopard Gecko', 'Eublepharis macularius', 'reptiles', 'BEGINNER', 18, [300, 700], 25, 'COMPACT', 'INSECTIVORE', 'HIGH',
      'Ground-dwelling, easy to handle and quiet — the classic first reptile, with a huge morph market.'),
    sp('bearded-dragon', 'Bearded Dragon', 'Pogona vitticeps', 'reptiles', 'BEGINNER', 10, [500, 1100], 55, 'LARGE', 'OMNIVORE', 'HIGH',
      'Bold, diurnal and famously tolerant of handling. Needs a big enclosure, strong UVB and precise heat gradients.'),
    sp('crested-gecko', 'Crested Gecko', 'Correlophus ciliatus', 'reptiles', 'BEGINNER', 18, [280, 650], 20, 'STANDARD', 'OMNIVORE', 'MODERATE',
      'A hardy arboreal gecko that thrives on powder diet and a planted vertical vivarium. Great for apartments.'),
    sp('panther-chameleon', 'Panther Chameleon', 'Furcifer pardalis', 'reptiles', 'ADVANCED', 8, [900, 2200], 50, 'LARGE', 'INSECTIVORE', 'DISPLAY_ONLY', 'II', 1,
      'Locality-bred colour champions. Requires airflow, misting cycles, UVB and stable husbandry — not a beginner species.',
      'CITES Appendix II: captive-bred documentation with legible parentage is required for every transfer.'),
    sp('ornate-box-turtle', 'Ornate Box Turtle', 'Terrapene ornata', 'reptiles', 'INTERMEDIATE', 40, [400, 950], 15, 'STANDARD', 'OMNIVORE', 'OCCASIONAL', 'II', 0,
      'Long-lived grazing turtle needing outdoor-style space or a large tortoise-table. Native-species paperwork applies in several states.',
      'Listed in CITES Appendix II; some states additionally require proof of captive origin.'),
    sp('green-cheek-conure', 'Green-cheeked Conure', 'Pyrrhura molinae', 'birds', 'BEGINNER', 25, [600, 1500], 26, 'STANDARD', 'PELLET', 'HIGH',
      'Small, sturdy, quieter parrots with a clownish temperament. Need daily out-of-cage time and foraging enrichment.'),
    sp('green-bottle-blue-tarantula', 'Green Bottle Blue Tarantula', 'Chromatopelma cyryopelma', 'arachnids', 'BEGINNER', 18, [120, 320], 16, 'COMPACT', 'INSECTIVORE', 'DISPLAY_ONLY', undefined, 0,
      'Spectacular blue-green webbing arboreal. Fast, display-first animals — handling is not recommended for anyone.'),
    sp('blue-dart-frog', 'Blue Poison Dart Frog', 'Dendrobates tinctorius "azureus"', 'amphibians', 'INTERMEDIATE', 12, [500, 1400], 4, 'COMPACT', 'INSECTIVORE', 'DISPLAY_ONLY', undefined, 0,
      'Captive-bred azureus are non-toxic and showy in a bioactive paludarium with leaf litter and fruit fly cultures.',
      'Live amphibian movement is federally restricted; a health certificate is required on every route.'),
    sp('betta', 'Betta', 'Betta splendens', 'fish', 'BEGINNER', 4, [120, 400], 7, 'COMPACT', 'PELLET', 'DISPLAY_ONLY', undefined, 0,
      'Line-bred halfmoon and plakat males with genetics worth documenting. Needs heated, filtered, aged water — not a bowl.'),
    sp('axolotl', 'Axolotl', 'Ambystoma mexicanum', 'amphibians', 'INTERMEDIATE', 14, [350, 900], 28, 'STANDARD', 'CARNIVORE', 'OCCASIONAL', undefined, 0,
      'Neotenic salamander needing cold, still, aged water. Prohibited as a pet in several states.',
      'Prohibited for private possession in California; FAUNAL blocks those checkouts automatically.'),
    sp('sugar-glider', 'Sugar Glider', 'Petaurus breviceps', 'mammals', 'ADVANCED', 12, [700, 1800], 30, 'LARGE', 'OMNIVORE', 'HIGH', undefined, 1,
      'Social, nocturnal marsupials that need a bonded pair, tall enclosures and a carefully balanced diet.',
      'Illegal as a pet in California and a number of other states; FAUNAL also routes these through manual review.'),
    sp('burmese-python', 'Burmese Python', 'Python bivittatus', 'reptiles', 'EXPERT', 25, [2000, 6000], 400, 'ENCLOSURE_ROOM', 'CARNIVORE', 'OCCASIONAL', undefined, 1,
      'A large constrictor subject to U.S. federal injurious-species rules and several state bans.',
      'Interstate transport of this species is prohibited by federal rule; NYC additionally bans it outright.'),
  ];
  function sp(
    key: string, name: string, sci: string, category: string, diff: string, life: number, setup: [number, number], len: number,
    space: string, diet: string, handling: string, ...rest: (string | number | undefined)[]
  ): Sp {
    const citesRaw = rest.find((r) => r === 'I' || r === 'II') as 'I' | 'II' | undefined;
    const sensitiveRaw = rest.find((r) => typeof r === 'number') as number | undefined;
    const strings = rest.filter((r) => typeof r === 'string' && r !== 'I' && r !== 'II') as string[];
    return {
      key, name, sci, cat: category, diff, life, setup, len, space, diet, handling,
      cites: citesRaw, sensitive: sensitiveRaw ?? 0, desc: strings[0] ?? name, legal: strings[1],
    };
  }
  const species: Record<string, string> = {};
  for (const s of SPECIES) {
    species[s.key] = id('spc');
    insert('species', {
      id: species[s.key],
      slug: s.key,
      common_name: s.name,
      scientific_name: s.sci,
      category_id: cat[s.cat],
      care_difficulty: s.diff,
      expected_lifespan_years: s.life,
      setup_cost_low_cents: s.setup[0] * 100,
      setup_cost_high_cents: s.setup[1] * 100,
      adult_length_cm: s.len,
      space_requirement: s.space,
      diet_type: s.diet,
      social_handling: s.handling,
      cites_appendix: s.cites ?? null,
      is_sensitive: s.sensitive ?? 0,
      description: s.desc,
      legal_note: s.legal ?? null,
    });
  }

  const MORPHS: Record<string, string[]> = {
    'ball-python': ['Banana', 'Pied', 'Pastel', 'Banana Pied', 'Spider', 'Clown', 'Lessa', 'Coral Glow', 'Bumblebee'],
    'leopard-gecko': ['Tangerine', 'Super Snow', 'Eclipse', 'Diablito', 'Albino Bell', 'Sunglow'],
    'bearded-dragon': ['Citrus', 'Leatherback', 'Hypo Trans', 'Sandfire', 'Permanently Trans'],
    'crested-gecko': ['Harlequin', 'Lily White', 'Dalmatian', 'Red Fog', 'Pinstripe'],
    'panther-chameleon': ['Ambia', 'Anaamba', 'Ambato', 'Tamatave', 'Nosy Be'],
    'green-cheek-conure': ['Pineapple', 'Blue-edged', 'Dark-eyed Clear', 'Mystic', 'Jade'],
    betta: ['Halfmoon', 'Plakat', 'Rosetail', 'Koi', 'Alien'],
    'blue-dart-frog': ['Azureus', 'Fluorescens', 'Regista'],
    'ornate-box-turtle': [],
    'green-bottle-blue-tarantula': [],
    axolotl: ['Leucistic', 'Wild Type', 'Melanoid', 'Axanthic'],
    'sugar-glider': ['Classic Grey', 'Leucistic', 'Mosaic'],
    'burmese-python': ['Albino', 'Labyrinth', 'Graphite'],
  };
  const morph: Record<string, Record<string, string>> = {};
  for (const [spKey, names] of Object.entries(MORPHS)) {
    morph[spKey] = {};
    for (const name of names) {
      const mid = id('mor');
      morph[spKey][name] = mid;
      insert('morphs', { id: mid, species_id: species[spKey], name, premium_multiplier: 100 + Math.round(Math.random() * 240) });
    }
  }

  /* ------------------------------------------------------ rulebook (v0) ---- */
  const RULESET = 'FAUNAL_RULEBOOK_v0';
  const RULES: [string, string, string, string, string?, number?, string?][] = [
    // species, jurisdiction, status, reason, citation, adminReview, permitClass
    ['ball-python', 'FL', 'REQUIRES_DOCUMENTATION', 'Florida classifies this constrictor under its restricted-species rules; a FWC permit copy must be on file before transfer.', 'FL Admin Code 68A-4.012 (reference)', undefined, 'PERMIT'],
    ['ball-python', 'NY', 'ALLOWED', 'Not listed as a restricted or invasive reptile in New York.', 'NY 6 NYCRR Part 554 (reference)'],
    ['ball-python', 'CA', 'ALLOWED', 'Legal for private possession in California.', 'CA FGC §2118 (reference)'],
    ['leopard-gecko', 'US', 'ALLOWED', 'Widely bred, not CITES-listed, no federal import restriction.', undefined],
    ['bearded-dragon', 'US', 'RESTRICTED', 'Adelaide/Impoundment rules apply in a handful of municipalities; FAUNAL requires captive-bred proof.', undefined],
    ['panther-chameleon', 'US', 'REQUIRES_DOCUMENTATION', 'CITES Appendix II: every transfer needs captive-breeding documentation and, for imported lines, export permits.', 'CITES App. II listing for Chamaeleonidae', undefined, 'CITES'],
    ['panther-chameleon', 'FL', 'REQUIRES_DOCUMENTATION', 'Florida requires proof of legal source for CITES-listed reptiles.', 'FL Admin Code 68A-4.012 (reference)'],
    ['panther-chameleon', 'TX', 'REQUIRES_DOCUMENTATION', 'Texas requires CITES documentation on file for Appendix II reptiles.', 'TPWD exotic species rules (reference)'],
    ['ornate-box-turtle', 'NY', 'REQUIRES_DOCUMENTATION', 'Native reptile: proof of captive origin is mandatory for sale in New York.', 'NY EPTL §11-0535 (reference)', undefined, 'PROOF_OF_ORIGIN'],
    ['ornate-box-turtle', 'MA', 'RESTRICTED', 'Massachusetts limits possession of native turtles to a small number of specimens with documentation.', 'MA 321 CMR 10.08 (reference)'],
    ['ornate-box-turtle', 'OH', 'RESTRICTED', 'Ohio requires a wildlife permit for native reptiles held indoors long term.', 'Ohio ORC 1531.19 (reference)'],
    ['ornate-box-turtle', 'CA', 'PROHIBITED', 'California prohibits private possession of this native-near species under its wildlife list.', 'CA FGC §671 (reference)'],
    ['axolotl', 'CA', 'PROHIBITED', 'Axolotls are banned as pets in California to protect native salamander populations.', 'CA FGC §671(c)'],
    ['axolotl', 'NJ', 'RESTRICTED', 'New Jersey requires a permit to possess captive-bred axolotls.', 'NJ N.J.A.C. 7:25-6.8 (reference)'],
    ['axolotl', 'NY', 'ALLOWED', 'Legal for private possession in New York.', 'NY EPTL (reference)'],
    ['blue-dart-frog', 'US', 'REQUIRES_DOCUMENTATION', 'CDC regulation restricts interstate movement of live amphibians without a health certificate.', '42 CFR 31 (CDC amphibian import rule)', undefined, 'HEALTH_CERTIFICATE'],
    ['blue-dart-frog', 'FL', 'RESTRICTED', 'Florida requires an amphibian movement permit.', 'FL Admin Code 68A-11.004 (reference)'],
    ['sugar-glider', 'CA', 'PROHIBITED', 'Sugar gliders are prohibited as pets in California.', 'CA FGC §2118(e)'],
    ['sugar-glider', 'NY', 'ALLOWED', 'Permitted in New York State; some municipalities restrict them.', 'NY EPTL (reference)'],
    ['sugar-glider', 'NYC', 'PROHIBITED', 'New York City prohibits marsupials and other non-domesticated mammals in residential housing.', 'NYC Admin Code §17-302 (reference)'],
    ['burmese-python', 'US', 'PROHIBITED', 'Listed as an injurious species under the Lacey Act: interstate transport and sale are prohibited.', '50 CFR 16.10 (Lacey Act injurious listing)'],
    ['burmese-python', 'NYC', 'PROHIBITED', 'New York City bans this constrictor outright.', 'NYC Admin Code §17-302'],
    ['green-cheek-conure', 'US', 'ALLOWED', 'Not CITES-listed; no federal restriction on domestic-bred lines.'],
    ['green-bottle-blue-tarantula', 'US', 'ALLOWED', 'No federal listing. Venomous-arthropod bans apply only in a few municipalities.'],
    ['betta', 'US', 'ALLOWED', 'No restrictions on domestically bred Betta splendens.'],
    ['crested-gecko', 'US', 'ALLOWED', 'Captive-bred lines are unrestricted in all 50 states.'],
  ];
  for (const [spKey, jurCode, status, reason, citation, adminReview, permitClass] of RULES) {
    insert('species_restrictions', {
      id: id('rul'),
      species_id: species[spKey],
      jurisdiction_id: jur[jurCode],
      status,
      reason,
      citation: citation ?? null,
      permit_class: permitClass ?? null,
      max_specimens: status === 'RESTRICTED' && jurCode === 'MA' ? 3 : null,
      requires_admin_review: adminReview ?? (status === 'PROHIBITED' || status === 'REQUIRES_ADMIN_REVIEW' ? 1 : 0),
      source: RULESET,
      updated_at: T,
    });
  }

  const REQ_DOCS: [string | null, string | null, string, number, string, string][] = [
    ['panther-chameleon', null, 'CITES', 1, 'LISTING', 'Captive-bred CITES paperwork covering this clutch, or the import permits of the parentage line.'],
    ['ornate-box-turtle', 'NY', 'PROOF_OF_ORIGIN', 1, 'LISTING', 'Breeding record or hatch declaration proving the animal was born in captivity in the U.S.'],
    ['blue-dart-frog', null, 'HEALTH_CERTIFICATE', 1, 'TRANSPORT', 'Veterinary certificate issued within 10 days of movement.'],
    ['axolotl', null, 'HEALTH_CERTIFICATE', 1, 'TRANSPORT', 'Herd health statement plus individual cert for cold-water transport.'],
    ['sugar-glider', null, 'PROOF_OF_ORIGIN', 1, 'LISTING', 'Source colony documentation — required in every state that allows the species.'],
    ['burmese-python', null, 'PERMIT', 1, 'LISTING', 'Class III / injurious-species permit where applicable.'],
    [null, 'NYC', 'PERMIT', 1, 'CHECKOUT', 'NYC wildlife permit, where the species is permitted at all.'],
    [null, null, 'BREEDER_LICENSE', 1, 'LISTING', 'State breeder or dealer licence for sellers with more than 10 active listings.'],
  ];
  for (const [spKey, jurCode, doc, mandatory, stage, desc] of REQ_DOCS) {
    insert('required_documents', {
      id: id('rdq'),
      species_id: spKey ? species[spKey] : null,
      jurisdiction_id: jurCode ? jur[jurCode] : null,
      doc_type: doc,
      mandatory,
      stage,
      description: desc,
    });
  }

  const TRANSPORT: [string | null, string | null, string | null, string, number, number, string][] = [
    // species, origin, destination, method, allowed, requiresHealthCert, note
    [null, null, null, 'INTERNATIONAL', 0, 0, 'FAUNAL operates domestic U.S. routes only in v1.'],
    ['burmese-python', null, null, 'SPECIALIZED_SHIPPING', 0, 0, 'Federal injurious-species rule prohibits moving this animal across state lines.'],
    ['burmese-python', null, null, 'BREEDER_DELIVERY', 0, 0, 'Interstate transport prohibited; intrastate only where local law allows.'],
    ['blue-dart-frog', null, null, 'SPECIALIZED_SHIPPING', 1, 1, 'Amphibian shipments require a health certificate and double-bagged oxygenated transport.'],
    ['panther-chameleon', null, null, 'BREEDER_DELIVERY', 0, 0, 'Chameleons must travel in climate-controlled air cargo; road delivery voids welfare checks.'],
    ['ornate-box-turtle', 'NY', 'MA', 'SPECIALIZED_SHIPPING', 1, 1, 'Turtle movement between these two states requires proof of origin in the crate.'],
    ['axolotl', null, 'CA', 'SPECIALIZED_SHIPPING', 0, 0, 'Destination state prohibits the species; no transport option is legal.'],
    ['sugar-glider', null, 'CA', 'SPECIALIZED_SHIPPING', 0, 0, 'Destination state prohibits the species.'],
    ['ball-python', 'FL', null, 'SPECIALIZED_SHIPPING', 1, 1, 'Allowed with FWC permit copy and heat pack in winter months.'],
    ['green-bottle-blue-tarantula', null, null, 'LOCAL_PICKUP', 1, 0, 'Tarantulas travel best in person; shipping is allowed but risk-disclosed.'],
  ];
  for (const [spKey, origin, dest, method, allowed, cert, note] of TRANSPORT) {
    insert('transport_restrictions', {
      id: id('trr'),
      species_id: spKey ? species[spKey] : null,
      origin_jurisdiction_id: origin ? jur[origin] : null,
      destination_jurisdiction_id: dest ? jur[dest] : null,
      method,
      allowed,
      max_hours_in_transit: method === 'SPECIALIZED_SHIPPING' ? 30 : null,
      min_temperature_f: method === 'SPECIALIZED_SHIPPING' ? 60 : null,
      requires_health_certificate: cert,
      note,
    });
  }

  /* ------------------------------------------------------- fee & business */
  const FEES: [string, string, number, number, number, string, string][] = [
    ['COMMISSION', 'FREE', 800, 0, 1500, 'Marketplace commission', '8% of the listing subtotal on the free plan.'],
    ['COMMISSION', 'PRO', 650, 0, 1200, 'Marketplace commission (Pro)', '6.5% with subscription.'],
    ['COMMISSION', 'PREMIUM', 450, 0, 900, 'Marketplace commission (Premium)', '4.5% with premium storefront.'],
    ['SUBSCRIPTION', 'PRO', 0, 4900, 0, 'Pro plan', '$49/month, 40 listings, analytics.'],
    ['SUBSCRIPTION', 'PREMIUM', 0, 14900, 0, 'Premium plan', '$149/month, unlimited listings, themed storefront.'],
    ['FEATURED', 'FREE', 0, 7900, 0, 'Featured placement', '$79 per listing per week across home + search.'],
    ['SHIPPING_SERVICE', 'FREE', 700, 0, 900, 'Live-freight service margin', '7% on the booked freight cost.'],
    ['PAYOUT', 'FREE', 90, 0, 25, 'Payout fee', '0.9% + $0.25 when escrow is released.'],
  ];
  for (const [kind, plan, bps, flat, min, label, desc] of FEES) {
    insert('fee_rules', { id: id('fee'), kind, plan, rate_bps: bps, flat_cents: flat, min_cents: min, active: 1, label, description: desc });
  }

  /* ------------------------------------------------------------------ users */
  const mkUser = (input: {
    email: string; first: string; last: string; role?: string; state?: string; city?: string;
    dob?: string; phone?: string; bio?: string;
  }) => {
    const uid = id('usr');
    insert('users', {
      id: uid,
      email: input.email,
      password_hash: hashPassword(PW),
      role: input.role ?? 'BUYER',
      status: 'ACTIVE',
      first_name: input.first,
      last_name: input.last,
      phone: input.phone ?? null,
      date_of_birth: input.dob ?? '1990-04-12',
      locale: 'en',
      currency: 'USD',
      jurisdiction_code: input.state ?? 'NY',
      city: input.city ?? null,
      tos_accepted_at: T,
      age_confirmed_at: T,
      created_at: daysAgo(200),
      updated_at: T,
    });
    insert('profiles', {
      user_id: uid,
      display_name: `${input.first} ${input.last}`,
      bio: input.bio ?? null,
      public_city: input.city ?? null,
      public_state: input.state ?? 'NY',
      member_since: daysAgo(200),
      show_favorites: 0,
    });
    return uid;
  };

  const alex = mkUser({ email: 'alex@example.com', first: 'Alex', last: 'Rivera', city: 'Brooklyn', state: 'NY', bio: 'Third-year keeper, rack-built ball python room.' });
  const dana = mkUser({ email: 'dana@example.com', first: 'Dana', last: 'Whitfield', city: 'Oakland', state: 'CA', bio: 'Looking for a first reptile with calm temperament.' });
  const priya = mkUser({ email: 'priya@example.com', first: 'Priya', last: 'Raman', city: 'Austin', state: 'TX' });
  const admin = mkUser({ email: 'admin@faunal.market', first: 'Nora', last: 'Achebe', role: 'ADMIN', city: 'New York', state: 'NY', bio: 'Head of trust, safety and compliance.' });
  const mod = mkUser({ email: 'mod@faunal.market', first: 'Theo', last: 'Marchetti', role: 'MODERATOR', city: 'New York', state: 'NY' });

  const mkBreeder = (u: {
    user: string; business: string; owner: string; tier: string; status?: string; city: string; state: string;
    license?: string; years: number; bio: string; rating: number; ratingCount: number; txns: number; plan?: string; response?: number; founded?: number;
  }) => {
    const taken = new Set((db.prepare(`SELECT slug FROM breeders`).all() as { slug: string }[]).map((r) => r.slug));
    const bid = id('brd');
    insert('breeders', {
      id: bid,
      user_id: u.user,
      slug: uniqueSlug(slugify(u.business), taken),
      business_name: u.business,
      legal_name: u.owner,
      tier: u.tier,
      status: u.status ?? 'APPROVED',
      license_number: u.license ?? null,
      city: u.city,
      state: u.state,
      jurisdiction_id: jur[u.state],
      bio: u.bio,
      years_active: u.years,
      rating_avg: u.rating,
      rating_count: u.ratingCount,
      transactions_count: u.txns,
      response_hours: u.response ?? 4,
      storefront_plan: u.plan ?? 'FREE',
      founded_year: u.founded ?? 2016,
      created_at: daysAgo(400),
      updated_at: T,
    });
    insert('breeder_verifications', {
      id: id('vrf'),
      breeder_id: bid,
      requested_tier: u.tier,
      status: u.status === 'PENDING' ? 'PENDING' : 'APPROVED',
      documents: [{ doc_type: 'BREEDER_LICENSE', note: `${u.license ?? 'no state licence required'} uploaded at application` }],
      submitted_at: daysAgo(380),
      reviewed_at: u.status === 'PENDING' ? null : daysAgo(375),
      reviewer_id: admin,
      notes: u.status === 'PENDING' ? null : 'Facility photos, licence and husbandry questionnaire verified.',
    });
    if (u.plan && u.plan !== 'FREE') {
      insert('subscriptions', {
        id: id('sub'),
        breeder_id: bid,
        plan: u.plan,
        price_cents_month: u.plan === 'PRO' ? 4900 : 14900,
        status: 'ACTIVE',
        started_at: daysAgo(120),
        renews_at: daysAgo(-24),
      });
    }
    return bid;
  };

  const b = {
    empire: mkBreeder({
      user: mkUser({ email: 'owner@empirereptiles.com', first: 'Marcus', last: 'Vela', role: 'VERIFIED_BREEDER', city: 'New York', state: 'NY' }),
      business: 'Empire Reptile Works', owner: 'Empire Reptile Works LLC', tier: 'VERIFIED_BREEDER', city: 'Queens', state: 'NY',
      license: 'NY-DW-2291', years: 11, plan: 'PREMIUM', rating: 4.92, ratingCount: 214, txns: 418, founded: 2015,
      bio: 'Brooklyn/Queens breeding room specialising in ball pythons and crested geckos. Every hatchling is snake-safe fed, quarantined 30 days and shipped with a written health guarantee.',
    }),
    hudson: mkBreeder({
      user: mkUser({ email: 'owner@hudsonconures.com', first: 'Elena', last: 'Kovács', role: 'VERIFIED_BREEDER', city: 'Albany', state: 'NY' }),
      business: 'Hudson Valley Avian', owner: 'Hudson Valley Avian LLC', tier: 'VERIFIED_BREEDER', city: 'Cohoes', state: 'NY',
      license: 'NY-DW-4410', years: 8, plan: 'PRO', rating: 4.88, ratingCount: 96, txns: 163, founded: 2018,
      bio: 'Family aviary breeding green-cheeked conures on a hand-raised, weaned-before-pickup schedule with a 14-page starter dossier for every bird.',
    }),
    gulf: mkBreeder({
      user: mkUser({ email: 'owner@gulfcoatherps.com', first: 'Darius', last: 'Nunez', role: 'PROFESSIONAL_BREEDER', city: 'Tampa', state: 'FL' }),
      business: 'Gulf Coast Herps', owner: 'Gulf Coast Herps Inc', tier: 'PROFESSIONAL_BREEDER', city: 'Tampa', state: 'FL',
      license: 'FL-FWC-CIII-882', years: 14, plan: 'PRO', rating: 4.79, ratingCount: 141, txns: 306, founded: 2012,
      bio: 'Large-scale Florida breeding facility for chameleons, dart frogs and geckos with an in-house quarantine and parasite protocol.',
    }),
    lone: mkBreeder({
      user: mkUser({ email: 'owner@lonestarranch.com', first: 'Cassidy', last: 'Boyd', role: 'VERIFIED_BREEDER', city: 'Austin', state: 'TX' }),
      business: 'Lone Star Turtle & Tortoise', owner: 'Lone Star Herpetoculture LLC', tier: 'VERIFIED_BREEDER', city: 'San Marcos', state: 'TX',
      license: 'TX-PWD-EX-1190', years: 16, plan: 'FREE', rating: 4.95, ratingCount: 77, txns: 127, founded: 2009,
      bio: 'Captive-hatched box turtles and testudines with full lineage records and outdoor-grazed rearing — no wild-caught animals, ever.',
    }),
    lakeside: mkBreeder({
      user: mkUser({ email: 'owner@lakesideamphibian.com', first: 'Wren', last: 'Okafor', role: 'PROFESSIONAL_BREEDER', city: 'Columbus', state: 'OH' }),
      business: 'Lakeside Amphibian Lab', owner: 'Lakeside Amphibian Lab LLC', tier: 'PROFESSIONAL_BREEDER', city: 'Columbus', state: 'OH',
      license: 'OH-DNR-1140', years: 6, plan: 'FREE', rating: 4.71, ratingCount: 48, txns: 88, founded: 2020,
      bio: 'Dart frog and axolotl breeding group with a certified disease-free protocol and PCR testing on every cohort.',
    }),
    sierra: mkBreeder({
      user: mkUser({ email: 'owner@sierrageckos.com', first: 'Owen', last: 'Castellanos', role: 'PROFESSIONAL_BREEDER', city: 'Sacramento', state: 'CA' }),
      business: 'Sierra Gecko Studio', owner: 'Sierra Gecko Studio', tier: 'PROFESSIONAL_BREEDER', city: 'Sacramento', state: 'CA',
      license: 'CA-CDFW-FALP-771', years: 9, plan: 'PRO', rating: 4.83, ratingCount: 132, txns: 251, founded: 2017,
      bio: 'West-coast leopard gecko and bearded dragon breeding with a genetic line registry. Ships intrastate only; complies with state wildlife lists.',
    }),
    arizona: mkBreeder({
      user: mkUser({ email: 'owner@desertarthropods.com', first: 'Nadia', last: 'Frost', role: 'VERIFIED_BREEDER', city: 'Tucson', state: 'AZ' }),
      business: 'Desert Arthropod Co', owner: 'Desert Arthropod Co', tier: 'VERIFIED_BREEDER', city: 'Tucson', state: 'AZ',
      years: 7, plan: 'FREE', rating: 4.86, ratingCount: 61, txns: 119, founded: 2019,
      bio: 'Tarantulas and scorpions bred in Arizona with species-accurate husbandry sheets and no wild-caught stock.',
    }),
    pending: mkBreeder({
      user: mkUser({ email: 'owner@newworldexotics.com', first: 'Silas', last: 'Vann', role: 'BREEDER', city: 'Phoenix', state: 'AZ' }),
      business: 'New World Exotics', owner: 'Silas Vann', tier: 'BREEDER', status: 'PENDING', city: 'Phoenix', state: 'AZ',
      years: 3, rating: 0, ratingCount: 0, txns: 4, founded: 2023,
      bio: 'Applying for professional status. Facility photos submitted; state licence pending renewal.',
    }),
  };

  /* ---------------------------------------------------------------- animals */
  type A = {
    sp: string; morph?: string; name: string; sex: 'MALE' | 'FEMALE' | 'UNKNOWN'; age: number; price: number; breeder: string;
    city: string; state: string; status?: string; availability?: string; featured?: boolean; temperament: string;
    desc: string; photo: string; weight: number; length: number; color: string; feed?: string;
  };
  const mk = (
    sp: string, morph: string, name: string, sex: 'MALE' | 'FEMALE' | 'UNKNOWN', age: number, price: number,
    breeder: string, city: string, state: string, photo: string, weight: number, length: number, color: string,
    temperament: string, desc: string, extra: Partial<A> = {},
  ): A => ({ sp, morph: morph || undefined, name, sex, age, price, breeder, city, state, photo, weight, length, color, temperament, desc, ...extra });

  const ANIMALS: A[] = [
    // ---- Ball pythons — Empire Reptile Works, Queens NY ----
    mk('ball-python', 'Banana', 'Sunbeam', 'FEMALE', 14, 2499, 'empire', 'Queens', 'NY', 'ball-python-banana', 640, 118,
      'Bright yellow with clean white blotching', 'Calm; feeds on frozen-thawed with no strike response',
      'Captive hatched this season and raised on frozen-thawed rats. Comes with a written health guarantee, shedding log and a 30-day quarantine record. Weight trends up every fortnight.',
      { featured: true }),
    mk('ball-python', 'Pied', 'Crescent', 'MALE', 22, 2299.99, 'empire', 'Queens', 'NY', 'ball-python-banana', 690, 121,
      'Yellow with a bold split-side pied pattern', 'Confident; tolerant of weekly handling',
      'Full pied pattern with no tail dominance. Sired by our line male, dam on site. Documented feed chart since hatch.'),
    mk('ball-python', 'Banana', 'Butter', 'FEMALE', 14, 450, 'empire', 'Queens', 'NY', 'ball-python-banana', 620, 116,
      'Soft yellow, slightly muted pattern', 'Shy at first, settled quickly in a rack',
      'Starter-quality Banana from a proven pairing. Excellent feeder response; ideal first snake for an apartment setup.'),
    mk('ball-python', 'Banana Pied', 'Marigold', 'FEMALE', 30, 3899, 'empire', 'Queens', 'NY', 'ball-python-banana', 700, 122,
      'High white with clean yellow splits', 'Very calm; feeds eagerly on rats',
      'Adult-quality Banana Pied, cleared for breeding age, sold as a pet with full paperwork and parentage.'),
    mk('ball-python', 'Pastel', 'Pebble', 'MALE', 9, 379, 'empire', 'Queens', 'NY', 'ball-python-banana', 540, 108,
      'Pale pastel glow with broken pattern', 'Curious; explores during night checks',
      'Young male Pastel, hatched in spring, feeding every five days on small rats.'),
    mk('ball-python', 'Spider', 'Lumen', 'MALE', 18, 1899, 'empire', 'Queens', 'NY', 'ball-python-banana', 660, 120,
      'High contrast with clean keyhole markings', 'Steady; no wobble beyond mild bowing',
      'Documented Spider with honest disclosure of the known wobble trait. Our vet exam is attached.'),
    mk('ball-python', 'Bumblebee', 'Ombre', 'FEMALE', 26, 2750, 'empire', 'Queens', 'NY', 'ball-python-banana', 680, 121,
      'Yellow with black bumblebee speckling', 'Handles well; tape-tolerant',
      'Clean Bumblebee female with strong contrast and a full laying history we are transparent about.'),

    // ---- Leopard geckos — Sierra Gecko Studio, Sacramento CA ----
    mk('leopard-gecko', 'Tangerine', 'Tangerine Dream', 'FEMALE', 16, 289, 'sierra', 'Sacramento', 'CA', 'leopard-gecko', 62, 21,
      'Deep orange banding without freckling', 'Tame; steps onto an open hand',
      'Bred from our proven tangerine line. Never had a shed or growth issue; gutloaded dubia and calcium-dusted daily.'),
    mk('leopard-gecko', 'Super Snow', 'Frost', 'MALE', 11, 420, 'sierra', 'Sacramento', 'CA', 'leopard-gecko', 55, 20,
      'Clean white with faint grey spots', 'Active at dusk; no tail-waving',
      'Full Super Snow male with two clear parent morph records and a 30-day quarantine certificate.'),
    mk('leopard-gecko', 'Eclipse', 'Umbra', 'MALE', 20, 355, 'sierra', 'Sacramento', 'CA', 'leopard-gecko', 68, 22,
      'Solid eclipse eyes, dark banding', 'Bold; feeds on tongs readily',
      'Solid eclipse with complete eye coverage. Ships within California only under state rules.'),
    mk('leopard-gecko', 'Diablito', 'Cabo', 'FEMALE', 8, 640, 'sierra', 'Sacramento', 'CA', 'leopard-gecko', 41, 17,
      'Minimal spotting on warm yellow', 'Juvenile; curious, quick',
      'Young Diablito female from a select pairing, with growth projections and a written husbandry sheet.'),
    mk('leopard-gecko', 'Albino Bell', 'Snowdrift', 'FEMALE', 24, 310, 'empire', 'Queens', 'NY', 'leopard-gecko', 71, 23,
      'Pale pink-white with lavender eyes', 'Very tame; handles daily',
      'Adult Bell albino retired from our breeding room and sold as a pet with complete veterinary history.'),

    // ---- Bearded dragons ----
    mk('bearded-dragon', 'Citrus', 'Solar', 'MALE', 18, 220, 'lone', 'San Marcos', 'TX', 'bearded-dragon', 380, 46,
      'Even citrus with clean belly', 'Beard-free on approach; eats greens readily',
      'UVB and heat cycles are logged and shipped with the enclosure spec. Parents on site and twice-tested for coccidia.'),
    mk('bearded-dragon', 'Leatherback', 'Dune', 'FEMALE', 12, 265, 'lone', 'San Marcos', 'TX', 'bearded-dragon', 340, 44,
      'Soft-scale leatherback, sandy tone', 'Mellow; tolerates handling',
      'Leatherback female with documented lineage and a full shedding history from hatch.'),
    mk('bearded-dragon', 'Sandfire', 'Ember', 'MALE', 9, 340, 'sierra', 'Sacramento', 'CA', 'bearded-dragon', 290, 40,
      'Warm red-gold with no banding', 'Active; basks under 100F',
      'Young Sandfire male raised under T5 UVB with a supplement schedule you can copy directly.'),
    mk('bearded-dragon', 'Hypo Trans', 'Ash', 'FEMALE', 15, 189, 'empire', 'Queens', 'NY', 'bearded-dragon', 360, 45,
      'Reduced scales with translucent edges', 'Calm feeder; no arm reflex',
      'Hypo trans female, health-checked, with clear eyes and full appetite. Sold with a 14-day adjustment plan.'),

    // ---- Crested geckos — Empire ----
    mk('crested-gecko', 'Harlequin', 'Harleigh', 'FEMALE', 14, 260, 'empire', 'Queens', 'NY', 'crested-gecko', 42, 19,
      'Copper and cream with clean lid spots', 'Nocturnal; active during misting',
      'Feeding on a verified CGM blend with live pinhead fruit flies. Complete tail, clear eyes, indoor bioactive room.'),
    mk('crested-gecko', 'Lily White', 'Lily', 'FEMALE', 22, 480, 'empire', 'Queens', 'NY', 'crested-gecko', 48, 20,
      'Solid white with pink lash tips', 'Confident; rides a branch to hand',
      'Lily White female with two prior clutches documented; sold as a pet with full laying history disclosed.'),
    mk('crested-gecko', 'Dalmatian', 'Dalmat', 'MALE', 10, 315, 'empire', 'Queens', 'NY', 'crested-gecko', 36, 18,
      'Cream with dense dalmatian spots', 'Juvenile; bold at night',
      'Young male with spot count and placement recorded in the listing folder for future breeding use.'),
    mk('crested-gecko', 'Red Fog', 'Foggy', 'UNKNOWN', 7, 235, 'empire', 'Queens', 'NY', 'crested-gecko', 28, 15,
      'Soft red wash over cream', 'Not yet handled beyond health checks',
      'Unsexed juvenile from this year\'s clutches; we ship after a second feeding confirmation window.'),

    // ---- Panther chameleons — Gulf Coast Herps, Tampa FL (CITES II) ----
    mk('panther-chameleon', 'Ambia', 'Ambia Sunrise', 'MALE', 14, 1450, 'gulf', 'Tampa', 'FL', 'panther-chameleon', 78, 44,
      'Turquoise with coral head and white striping', 'Display animal; strong feeding response',
      'F2 captive-hatched from our Florida group with CITES paperwork on file and parentage documented. Vet cleared within 10 days.'),
    mk('panther-chameleon', 'Nosy Be', 'Nosy', 'FEMALE', 20, 1250, 'gulf', 'Tampa', 'FL', 'panther-chameleon', 88, 48,
      'Deep red with cream stripes', 'Display animal; tolerant of misting routine',
      'Nosy Be female, captive-hatched, with misting and fan cycles specified in the dossier. CITES documents verified.'),
    mk('panther-chameleon', 'Ambato', 'Ambato Gold', 'MALE', 11, 1895, 'gulf', 'Tampa', 'FL', 'panther-chameleon', 66, 41,
      'Gold body with white eye turrets', 'Young; still filling out colour',
      'High-line Ambato male. Appendix II paperwork attached; the compliance desk reviews each transfer individually.'),
    mk('panther-chameleon', 'Tamatave', 'Tama', 'MALE', 26, 1120, 'gulf', 'Tampa', 'FL', 'panther-chameleon', 92, 52,
      'Blue-green with pink joints', 'Established adult; consistent feeder',
      'Adult male with a full health and supplementation record. Held for review while an updated CITES certificate is issued.',
      { status: 'PENDING_REVIEW' }),

    // ---- Ornate box turtles — Lone Star, San Marcos TX ----
    mk('ornate-box-turtle', '', 'Ornate Star', 'FEMALE', 14, 890, 'lone', 'San Marcos', 'TX', 'box-turtle', 640, 13,
      'High-contrast yellow starburst on dark shell', 'Grazing, active, tolerant of supervised outdoor time',
      'Captive hatched from our own breeding females — never wild-collected. Full growth history, shell measurements and proof of origin attached.'),
    mk('ornate-box-turtle', '', 'Ornate Comet', 'MALE', 22, 760, 'lone', 'San Marcos', 'TX', 'box-turtle', 590, 12,
      'Wide yellow rays, low dome', 'Robust; basks 6 hours daily',
      'Adult male with documented lineage. Massachusetts and Ohio buyers see extra conditions automatically at checkout.'),
    mk('ornate-box-turtle', '', 'Ornate Nova', 'FEMALE', 9, 1080, 'lone', 'San Marcos', 'TX', 'box-turtle', 210, 8,
      'Fresh hatchling pattern, crisp rays', 'Curious; strong righting response',
      'Young female, suspended by the compliance desk while the origin declaration was re-filed — a good example of the audit trail.',
      { status: 'SUSPENDED', availability: 'SOLD_OUT' }),

    // ---- Green-cheeked conures — Hudson Valley Avian, Cohoes NY ----
    mk('green-cheek-conure', 'Pineapple', 'Pineapple Sunshine', 'FEMALE', 11, 649, 'hudson', 'Cohoes', 'NY', 'green-cheek-conure', 68, 26,
      'Maroon chest, pineapple wash on the head', 'Hand-fed twice daily; steps up reliably',
      'Weaned and fully on pellets before pickup. Leg band, DNA sex result, avian vet certificate and a hand-raising log from day three.'),
    mk('green-cheek-conure', 'Blue-edged', 'Blue', 'MALE', 16, 575, 'hudson', 'Cohoes', 'NY', 'green-cheek-conure', 71, 26,
      'Blue flight edges over dark green', 'Quiet contact calls; loves foraging toys',
      'Blue-edged male from our second clutch this year, with a 14-page starter dossier and a weaning chart.'),
    mk('green-cheek-conure', 'Mystic', 'Mystic Mango', 'UNKNOWN', 8, 899, 'hudson', 'Cohoes', 'NY', 'green-cheek-conure', 58, 24,
      'Pale mango with dark primaries', 'Young; still hand-raised daily',
      'Mystic with strong colour promise. DNA sexing booked; the listing updates automatically once the result is in.'),
    mk('green-cheek-conure', 'Jade', 'Jade', 'FEMALE', 21, 520, 'hudson', 'Cohoes', 'NY', 'green-cheek-conure', 74, 27,
      'Even jade with a bright maroon tail', 'Settled; bonded to one person',
      'Adult female retired from the breeding room. Sold with her complete laying record and a same-species introduction guide.'),

    // ---- Tarantulas — Desert Arthropod Co, Tucson AZ ----
    mk('green-bottle-blue-tarantula', '', 'Green bottle blue #28', 'FEMALE', 28, 320, 'arizona', 'Tucson', 'AZ', 'emerald-tarantula', 18, 15,
      'Iridescent blue legs, pink abdomen', 'Display-only; fast, webs heavily',
      'Wild-type colouring raised from sling on a local cricket culture. Ships in a doubled ventilated container with a heat pack below 45F.'),
    mk('green-bottle-blue-tarantula', '', 'Green bottle blue #16', 'MALE', 16, 425, 'arizona', 'Tucson', 'AZ', 'emerald-tarantula', 15, 14,
      'Strong blue sheen with red tibial hairs', 'Display-only; bold in the tube',
      'Male nearing final moult, honestly described — expect a shorter lifespan after maturity and we say so in writing.'),
    mk('green-bottle-blue-tarantula', '', 'Green bottle blue #10', 'UNKNOWN', 10, 265, 'arizona', 'Tucson', 'AZ', 'emerald-tarantula', 9, 11,
      'Juvenile blue-green', 'Calm for a sling; feeds on micro crickets',
      'Sling group with a moult log. Ideal first tarantula for a display shelf, not for handling.'),

    // ---- Dart frogs — Lakeside Amphibian Lab, Columbus OH ----
    mk('blue-dart-frog', 'Azureus', 'Dendrobate Azure', 'UNKNOWN', 9, 495, 'lakeside', 'Columbus', 'OH', 'blue-dart-frog', 3, 3,
      'Electric blue with dense black marbling', 'Display animal; daytime active',
      'Captive-bred F2 from a PCR-tested colony. Fruit fly and springtail culture starter included in the crate.'),
    mk('blue-dart-frog', 'Fluorescens', 'Dendrobate Tinctorius pair', 'UNKNOWN', 14, 940, 'lakeside', 'Columbus', 'OH', 'blue-dart-frog', 4, 4,
      'Fluorescent blue-green with black thighs', 'Calling pair; strong feeding rhythm',
      'Pair held for review while the CDC-compliant health certificate is re-issued — amphibian movement needs current vet paper.',
      { status: 'PENDING_REVIEW' }),

    // ---- Bettas ----
    mk('betta', 'Halfmoon', 'Halfmoon King', 'MALE', 7, 189, 'empire', 'Queens', 'NY', 'betta-fish', 4, 7,
      'Deep navy with iridescent flaking', 'Sane flaring; no fin damage',
      'Show-potential genetics from our line registry. Ships in an oxygenated bag with a temperature box and a five-gallon cycling guide.'),
    mk('betta', 'Plakat', 'Plakat Copper', 'MALE', 9, 95, 'lakeside', 'Columbus', 'OH', 'betta-fish', 5, 6,
      'Copper with dark masking', 'Active; eats micro pellets readily',
      'Short-finned plakat with a robust constitution — the easier betta for a first tank.'),
    mk('betta', 'Koi', 'Koi Sky', 'FEMALE', 6, 265, 'empire', 'Queens', 'NY', 'betta-fish', 3, 5,
      'White with red and blue koi splashes', 'Peaceful; school-compatible in a planted 10',
      'Unpaired female from our koi line with colour projections and a water-parameter sheet from the grow-out room.'),
    mk('betta', 'Rosetail', 'Rose', 'MALE', 11, 145, 'lakeside', 'Columbus', 'OH', 'betta-fish', 4, 7,
      'Rose with heavy fin branch', 'Slower swimmer; needs gentle flow',
      'Rosetail with documented branching. We include a flow-reduction plan because strong filters damage these fins.'),

    // ---- Non-public listings used by the moderation queue ----
    mk('axolotl', 'Leucistic', 'Leucistic axolotl pair', 'UNKNOWN', 8, 380, 'lakeside', 'Columbus', 'OH', '', 90, 18,
      'Pale pink-white with lilac gills', 'Feeds on earthworm and pellet',
      'Cold-water cohort raised at 62-64F. Blocked for California buyers by the compliance engine; photography pending facility audit.',
      { status: 'PENDING_REVIEW' }),
    mk('axolotl', 'Wild Type', 'Wild type juvenile', 'FEMALE', 6, 240, 'lakeside', 'Columbus', 'OH', '', 55, 14,
      'Dark olive with gold flecking', 'Robust feeder',
      'Wild-type juvenile awaiting vet sign-off before it can go live.',
      { status: 'PENDING_REVIEW' }),
    mk('sugar-glider', 'Classic Grey', 'Bonded pair — Maple & Birch', 'UNKNOWN', 16, 780, 'pending', 'Phoenix', 'AZ', '', 130, 20,
      'Soft grey with a black dorsal stripe', 'Nocturnal; bonded pair',
      'Bonded pair from a colony screened for parasites. Blocked for California and for New York City addresses.',
      { status: 'PENDING_REVIEW' }),
    mk('burmese-python', 'Albino', 'Albino Burmese — 2nd clutch', 'MALE', 30, 1450, 'gulf', 'Tampa', 'FL', '', 4200, 210,
      'White with tan blotching', 'Defensive when approached from above',
      'Rejected by the compliance engine: this species is federally injurious, so interstate transport and sale are prohibited.',
      { status: 'REJECTED' }),
  ];

  const takenSlugs = new Set((db.prepare(`SELECT slug FROM animals`).all() as { slug: string }[]).map((r) => r.slug));
  const animalIds: string[] = [];
  let index = 0;
  for (const a of ANIMALS) {
    index++;
    const spId = species[a.sp];
    const spRow = db.prepare(`SELECT * FROM species WHERE id = ?`).get(spId) as Record<string, string | number | null>;
    const breederKey = a.breeder in b ? (b as Record<string, string>)[a.breeder] : (b as Record<string, string>).empire;
    const breederRow = db.prepare(`SELECT * FROM breeders WHERE id = ?`).get(breederKey) as Record<string, string | null>;
    const animalId = id('anm');
    const slug = uniqueSlug(slugify(`${a.name}-${spRow.common_name}`), takenSlugs);
    const status = a.status ?? 'APPROVED';
    const priceCents = Math.round(a.price * 100);

    const verdict = evaluateCompliance({
      speciesId: spId,
      animalId,
      breederId: breederKey,
      originJurisdictionId: jur[a.state],
      destinationJurisdictionId: jur[a.state],
      method: 'SPECIALIZED_SHIPPING',
    });

    insert('animals', {
      id: animalId,
      slug,
      breeder_id: breederKey,
      category_id: spRow.category_id as string,
      species_id: spId,
      morph_id: a.morph && morph[a.sp]?.[a.morph] ? morph[a.sp][a.morph] : null,
      name: a.name,
      sex: a.sex,
      age_months: a.age,
      date_of_birth: daysAgo(Math.round(a.age * 30.4)),
      length_cm: a.length,
      weight_g: a.weight,
      color: a.color,
      temperament: a.temperament,
      experience_level: spRow.care_difficulty as string,
      origin_jurisdiction_id: jur[a.state],
      captive_bred: 1,
      availability: status === 'SUSPENDED' ? 'SOLD_OUT' : a.availability ?? 'AVAILABLE',
      status,
      price_cents: priceCents,
      currency: 'USD',
      city: a.city,
      state: a.state,
      jurisdiction_id: jur[a.state],
      is_purchasable: 1,
      is_featured: a.featured ? 1 : 0,
      listing_plan: index % 5 === 0 ? 'FEATURED' : 'FREE',
      description: a.desc,
      health_status: 'CLEAR',
      last_health_check: daysAgo(3 + (index % 5)),
      vaccinations: JSON.stringify(spRow.category_id === cat.birds ? ['Polyomavirus (2 doses)', 'PDV — not applicable'] : []),
      treatments: JSON.stringify(index % 3 === 0 ? ['Fenbendazole 50 mg/kg × 2, 14 days apart', 'Protozal clearance confirmed by float'] : []),
      feeding_schedule: (a.feed as string) ?? 'Every 5 days (frozen/thawed)',
      diet: String(spRow.diet_type),
      habitat: bioactiveHint(String(a.sp)),
      temperature_f: tempHint(String(a.sp)),
      humidity_pct: humHint(String(a.sp)),
      enclosure_min_cm: enclosureHint(String(a.sp)),
      medical_notes: index % 4 === 0 ? 'Vet note (restricted): slight residual shed around tail tip, monitoring; no intervention needed.' : null,
      compliance_status: verdict.verdict,
      compliance_notes: JSON.stringify(verdict.notes),
      view_count: 40 + ((index * 37) % 400),
      submitted_at: daysAgo(12 - (index % 9)),
      published_at: status === 'APPROVED' ? daysAgo(11 - (index % 9)) : null,
      created_at: daysAgo(14 - (index % 10)),
      updated_at: T,
    });
    recordComplianceCheck('ANIMAL', animalId, {
      speciesId: spId,
      animalId,
      breederId: breederKey,
      originJurisdictionId: jur[a.state],
      destinationJurisdictionId: jur[a.state],
      method: 'SPECIALIZED_SHIPPING',
    }, verdict);
    animalIds.push(animalId);

    /* images: one primary per animal, derived from the species photo with a
       deterministic crop so every listing has its own perceptual signature. */
    const rawFile = a.photo ? path.join(RAW, `${a.photo}.jpg`) : null;
    const stem = a.photo || 'placeholder';
    if (rawFile && fs.existsSync(rawFile)) {
      const dirs = { large: 1400, medium: 800, small: 480, thumb: 200 } as const;
      let phash: string | null = null;
      if (sharp) {
        const meta = await sharp(rawFile).metadata();
        const w = meta.width ?? 1200;
        const h = meta.height ?? 1200;
        const offset = (index * 53) % Math.max(1, Math.floor(w * 0.12));
        const cropW = Math.max(400, w - offset * 2);
        const cropH = Math.max(400, h - offset);
        const base = path.join(DERIVED, `${stem}-a${index}`);
        for (const [key, width] of Object.entries(dirs)) {
          await sharp(rawFile)
            .extract({ left: Math.min(offset, w - cropW), top: 0, width: cropW, height: Math.min(cropH, h) })
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: key === 'thumb' ? 68 : 78 })
            .toFile(`${base}-${key}.webp`);
        }
        await sharp(rawFile).resize({ width: 1400, fit: 'inside' }).avif({ quality: 45 }).toFile(`${base}-avif.avif`);
        const px = await sharp(rawFile)
          .extract({ left: Math.min(offset, w - cropW), top: 0, width: cropW, height: Math.min(cropH, h) })
          .grayscale()
          .resize(9, 8, { fit: 'fill' })
          .raw()
          .toBuffer();
        phash = dhashFromGrayscale(new Uint8Array(px));
      }
      insert('animal_images', {
        id: id('img'),
        animal_id: animalId,
        base_path: sharp ? `/img/derived/${stem}-a${index}-large.webp` : `/img/raw/${a.photo}.jpg`,
        path_large: sharp ? `/img/derived/${stem}-a${index}-large.webp` : `/img/derived/${stem}-large.webp`,
        path_medium: sharp ? `/img/derived/${stem}-a${index}-medium.webp` : `/img/derived/${stem}-medium.webp`,
        path_small: sharp ? `/img/derived/${stem}-a${index}-small.webp` : `/img/derived/${stem}-small.webp`,
        path_thumb: sharp ? `/img/derived/${stem}-a${index}-thumb.webp` : `/img/derived/${stem}-thumb.webp`,
        avif_path: sharp ? `/img/derived/${stem}-a${index}-avif.avif` : null,
        webp_path: `/img/derived/${stem}-medium.webp`,
        width: 1200,
        height: 1200,
        alt: `${a.name} — ${spRow.common_name}${a.morph ? ` (${a.morph} morph)` : ''}`,
        position: 0,
        phash,
        created_at: daysAgo(12),
      });
      if (index % 3 === 0) {
        insert('animal_images', {
          id: id('img'),
          animal_id: animalId,
          base_path: `/img/derived/${stem}-medium.webp`,
          path_large: `/img/derived/${stem}-large.webp`,
          path_medium: `/img/derived/${stem}-medium.webp`,
          path_small: `/img/derived/${stem}-small.webp`,
          path_thumb: `/img/derived/${stem}-thumb.webp`,
          avif_path: `/img/derived/${stem}-original.avif`,
          webp_path: `/img/derived/${stem}-medium.webp`,
          width: 1200,
          height: 1200,
          alt: `${spRow.common_name} husbandry reference — same enclosure set-up`,
          position: 1,
          phash: null,
          created_at: daysAgo(12),
        });
      }
      if (index % 5 === 0) {
        insert('animal_videos', {
          id: id('vid'),
          animal_id: animalId,
          path: `/video/feeding-${slug}.mp4`,
          poster_path: `/img/derived/${stem}-medium.webp`,
          duration_s: 18 + (index % 12),
          codec: 'h264',
          position: 0,
          created_at: daysAgo(11),
        });
      }
    }

    /* documents (private) */
    const docTypes: [string, string][] = [
      ['HEALTH_CERTIFICATE', 'VERIFIED'],
      ['PROOF_OF_ORIGIN', 'VERIFIED'],
    ];
    if (spRow.cites_appendix) docTypes.push(['CITES', index % 2 ? 'PENDING' : 'VERIFIED']);
    docTypes.forEach(([type, docStatus], di) => {
      const filename = `${slug}-${type.toLowerCase()}.pdf`;
      const rel = path.join('documents', breederKey.slice(0, 8));
      fs.mkdirSync(path.join(PRIVATE, rel), { recursive: true });
      fs.writeFileSync(
        path.join(PRIVATE, rel, filename),
        makePdf(`FAUNAL document — ${type.replace(/_/g, ' ')}`, [
          `Animal: ${a.name} (${spRow.common_name}${a.morph ? `, ${a.morph}` : ''})`,
          `Breeder: ${breederRow.business_name}, ${breederRow.city}, ${breederRow.state}`,
          `Permit/licence: ${breederRow.license_number ?? 'not required for this class'}`,
          `Issued: ${daysAgo(6).slice(0, 10)} · Expires: ${new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)}`,
          '',
          'This is reference data generated for the FAUNAL demo environment.',
          'In production this file is an issuer-signed document stored in the private',
          'bucket and verified by the compliance desk before any transfer.',
        ]),
      );
      insert('animal_documents', {
        id: id('doc'),
        animal_id: animalId,
        breeder_id: breederKey,
        owner_user_id: breederRow.user_id,
        doc_type: type,
        storage_bucket: 'documents',
        storage_path: path.join(rel, filename),
        filename,
        size_bytes: 1200 + di * 90,
        status: docStatus,
        expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
        visibility: 'PRIVATE',
        uploaded_at: daysAgo(9 - di),
        reviewed_at: docStatus === 'VERIFIED' ? daysAgo(7) : null,
        reviewer_id: docStatus === 'VERIFIED' ? admin : null,
        review_note: docStatus === 'VERIFIED' ? 'Checked against licence registry.' : null,
      });
    });
  }

  /* ------------------------------------------------- breeder-level documents
   * Seller-side paperwork: the compliance engine requires a verified breeder
   * licence (and a species permit for sensitive/CITES taxa) before a listing
   * can be bought in the jurisdictions that ask for them. The pending breeder
   * is deliberately left without a verified licence so the queue has substance.
   */
  const breederRows = all<Record<string, unknown>>(
    `SELECT b.*,
            EXISTS(SELECT 1 FROM animals a JOIN species s ON s.id = a.species_id
                   WHERE a.breeder_id = b.id AND s.is_sensitive = 1) AS sells_sensitive,
            EXISTS(SELECT 1 FROM animals a JOIN species s ON s.id = a.species_id
                   WHERE a.breeder_id = b.id AND s.cites_appendix IS NOT NULL) AS sells_cites
     FROM breeders b`,
  );
  for (const br of breederRows) {
    const approved = String(br.status) === 'APPROVED';
    const specs: [string, string][] = [['BREEDER_LICENSE', approved ? 'VERIFIED' : 'PENDING']];
    if (Number(br.sells_sensitive)) specs.push(['PERMIT', approved ? 'VERIFIED' : 'PENDING']);
    if (Number(br.sells_cites)) specs.push(['CITES', 'VERIFIED']);
    if (String(br.state) === 'NY') specs.push(['TRANSPORT_MANIFEST', 'VERIFIED']);
    for (const [type, docStatus] of specs) {
      const filename = `breeder-${String(br.slug)}-${type.toLowerCase()}.pdf`;
      const rel = path.join('documents', String(br.id).slice(0, 12));
      fs.mkdirSync(path.join(PRIVATE, rel), { recursive: true });
      fs.writeFileSync(
        path.join(PRIVATE, rel, filename),
        makePdf(`FAUNAL document — ${type.replace(/_/g, ' ')}`, [
          `Holder: ${String(br.business_name)} (${String(br.city)}, ${String(br.state)})`,
          `Licence number: ${String(br.license_number ?? 'filed — awaiting registry match')}`,
          `Legal entity: ${String(br.legal_name ?? br.business_name)}`,
          `Issued: ${daysAgo(120).slice(0, 10)} · Expires: ${new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10)}`,
          '',
          'Reference document for the FAUNAL demo environment. In production this is',
          'the issuer-signed file held in the private bucket and matched against the',
          'state wildlife registry by the compliance desk.',
        ]),
      );
      insert('animal_documents', {
        id: id('doc'),
        animal_id: null,
        breeder_id: String(br.id),
        owner_user_id: String(br.user_id),
        doc_type: type,
        storage_bucket: 'documents',
        storage_path: path.join(rel, filename),
        filename,
        size_bytes: 1500,
        status: docStatus,
        expires_at: new Date(Date.now() + 300 * 86400000).toISOString(),
        visibility: 'PRIVATE',
        uploaded_at: daysAgo(118),
        reviewed_at: docStatus === 'VERIFIED' ? daysAgo(110) : null,
        reviewer_id: docStatus === 'VERIFIED' ? admin : null,
        review_note: docStatus === 'VERIFIED' ? 'Matched against the state registry; conditions read into the listing.' : null,
      });
    }
  }

  function bioactiveHint(spKey: string) {
    return (
      {
        'ball-python': '40-gallon rack or tub, hides at both ends, 24-hour light cycle off',
        'leopard-gecko': '20-gallon long, sand-free substrate, three hides, low humidity zone',
        'bearded-dragon': '4×2×2 ft enclosure, 10.0 UVB over 24 inches of depth',
        'crested-gecko': '18×18×36 planted vivarium with misting twice daily',
        'panther-chameleon': '36×24×36 screened enclosure, fan + misting cycle, live plants',
        'ornate-box-turtle': '4×6 ft tortoise table or outdoor pen with 6-inch substrate',
        'green-cheek-conure': '36×24×30 flight cage plus 2 hours of supervised out-of-cage time',
        'green-bottle-blue-tarantula': '12×12×12 arboreal tube with dense webbing substrate',
        'blue-dart-frog': '24×18×24 bioactive paludarium, leaf litter, springtail cleanup crew',
        betta: '5-gallon filtered, heated, aged, with almond leaf and dim light',
        axolotl: '40-gallon minimum, chilled 61-64°F, bare bottom, no strong flow',
        'sugar-glider': '36×24×60 mesh enclosure for a bonded pair, nocturnal lighting',
        'burmese-python': 'Room or 8×4 pen with anchor points — enclosure-room species',
      }[spKey] ?? 'Species-specific enclosure with thermal gradient'
    );
  }
  function tempHint(spKey: string) {
    return (
      {
        'ball-python': '78–82°F ambient, 88–90°F basking hide',
        'leopard-gecko': '78–88°F hot spot, 72°F cool end',
        'bearded-dragon': '95–105°F basking, 78–85°F ambient',
        'crested-gecko': '72–78°F — never above 82°F',
        'panther-chameleon': '75–82°F, basking 88°F, night drop to 65°F',
        'ornate-box-turtle': '75–85°F with a 90°F basking pocket',
        'green-cheek-conure': '70–80°F, no drafts',
        'green-bottle-blue-tarantula': '72–80°F, tolerant and hardy',
        'blue-dart-frog': '70–76°F — heat above 82°F is lethal',
        betta: '76–80°F, ±1°F stability',
        axolotl: '61–64°F chilled',
        'sugar-glider': '75–82°F, avoid drafts',
        'burmese-python': '82–88°F with a 90°F basking site',
      }[spKey] ?? '72–82°F'
    );
  }
  function humHint(spKey: string) {
    return (
      {
        'ball-python': '55–60%, 65–70% in shed',
        'leopard-gecko': '30–40% with a moist hide',
        'bearded-dragon': '30–40%',
        'crested-gecko': '60–80% with drying cycles',
        'panther-chameleon': '50–70% daytime, misting 3×/day',
        'ornate-box-turtle': '45–65% with a soak pan',
        'green-cheek-conure': '45–60%',
        'green-bottle-blue-tarantula': '60–70% on one side only',
        'blue-dart-frog': '75–90%',
        betta: 'n/a (aquatic)',
        axolotl: 'n/a (aquatic, 6-inch water column)',
        'sugar-glider': '40–60%',
        'burmese-python': '55–65%',
      }[spKey] ?? 'Species-specific'
    );
  }
  function enclosureHint(spKey: string) {
    return { 'ball-python': 120, 'leopard-gecko': 60, 'bearded-dragon': 120, 'crested-gecko': 45, 'panther-chameleon': 90, 'ornate-box-turtle': 120, 'green-cheek-conure': 90, 'green-bottle-blue-tarantula': 30, 'blue-dart-frog': 60, betta: 25, axolotl: 90, 'sugar-glider': 90, 'burmese-python': 240 }[spKey] ?? 60;
  }

  /* ------------------------------------------------------------ engagement */
  const favAnimals = animalIds.slice(0, 4);
  for (const fid of favAnimals) {
    insert('favorites', { id: id('fav'), user_id: alex, animal_id: fid, notify_on_price_drop: 1, created_at: daysAgo(4) });
  }
  insert('favorites', { id: id('fav'), user_id: dana, animal_id: animalIds[8], notify_on_price_drop: 1, created_at: daysAgo(2) });
  insert('followed_breeders', { user_id: alex, breeder_id: b.empire, notify_on_new_listing: 1, created_at: daysAgo(60) });
  insert('followed_breeders', { user_id: alex, breeder_id: b.hudson, notify_on_new_listing: 1, created_at: daysAgo(22) });
  insert('followed_breeders', { user_id: dana, breeder_id: b.sierra, notify_on_new_listing: 1, created_at: daysAgo(9) });

  for (let i = 0; i < 14; i++) {
    insert('user_events', {
      id: id('evt'),
      user_id: alex,
      kind: i < 8 ? 'VIEW_ANIMAL' : i < 12 ? 'FAVORITE' : 'CLICK_BREEDER',
      entity_id: animalIds[i % animalIds.length],
      weight: 1,
      created_at: daysAgo(i * 2),
    });
  }
  for (const q of ['ball python under $600', 'female ball python near New York', 'leopard gecko', 'beginner reptile', 'blue dart frog']) {
    insert('searches', { id: id('srh'), user_id: alex, query: q, filters: '{}', result_count: 3 + q.length % 9, created_at: daysAgo(q.length % 6) });
    insert('searches', { id: id('srh'), user_id: dana, query: q, filters: '{}', result_count: 2 + q.length % 5, created_at: daysAgo(1 + (q.length % 4)) });
  }

  insert('addresses', {
    id: id('adr'), user_id: alex, label: 'Brooklyn apartment', recipient: 'Alex Rivera', line1: '515 Myrtle Ave', line2: 'Apt 4C',
    city: 'Brooklyn', state: 'NY', zip: '11205', country: 'US', is_default: 1, created_at: daysAgo(90),
  });
  insert('addresses', {
    id: id('adr'), user_id: alex, label: 'Parents (upstate)', recipient: 'Alex Rivera', line1: '18 Lakeshore Rd', city: 'Hudson', state: 'NY',
    zip: '12534', country: 'US', is_default: 0, created_at: daysAgo(60),
  });
  insert('addresses', {
    id: id('adr'), user_id: dana, label: 'Home', recipient: 'Dana Whitfield', line1: '2447 Telegraph Ave', city: 'Oakland', state: 'CA',
    zip: '94612', country: 'US', is_default: 1, created_at: daysAgo(20),
  });
  insert('payment_methods', {
    id: id('pmt'), user_id: alex, provider: 'faunal-pay', brand: 'VISA', last4: '4242', token: 'tok_demo_visa_4242',
    expiry_month: 8, expiry_year: 2029, is_default: 1, created_at: daysAgo(80),
  });

  /* cart: two animals for Alex, one of them from a different breeder */
  const cartCandidates = animalIds.filter((aid) => {
    const row = db.prepare(`SELECT status, availability, state FROM animals WHERE id = ?`).get(aid) as { status: string; availability: string; state: string };
    return row.status === 'APPROVED' && row.availability === 'AVAILABLE';
  });
  [cartCandidates[0], cartCandidates[5]].forEach((aid, i) => {
    insert('cart_items', { id: id('crt'), user_id: alex, animal_id: aid, quantity: 1, shipping_method: 'SPECIALIZED_SHIPPING', added_at: daysAgo(i) });
  });

  /* ------------------------------------------- orders + reviews + payouts */
  const completedFor = [
    { buyer: alex, animal: cartCandidates[12] ?? animalIds[12], status: 'COMPLETED', age: 26, review: { overall: 5, communication: 5, listing_accuracy: 5, animal_condition: 5, shipping: 4, experience: 5, comment: 'Health certificate was ready, the crate arrived at 74°F and the snake settled within a day. Documentation folder was better than my vet\'s.' } },
    { buyer: alex, animal: animalIds[16], status: 'SHIPPED', age: 4, review: null },
    { buyer: priya, animal: animalIds[19], status: 'COMPLETED', age: 41, review: { overall: 5, communication: 5, listing_accuracy: 4, animal_condition: 5, shipping: 5, experience: 5, comment: 'Breeder drove two hours to hand off in person. Slight colour difference from the photos, otherwise flawless.' } },
    { buyer: dana, animal: animalIds[10], status: 'DELIVERED', age: 1, review: null },
  ];
  let orderSeq = 1041;
  for (const o of completedFor) {
    const animal = db.prepare(`SELECT * FROM animals WHERE id = ?`).get(o.animal) as Record<string, string | number | null>;
    if (!animal) continue;
    const breeder = db.prepare(`SELECT * FROM breeders WHERE id = ?`).get(animal.breeder_id) as Record<string, string | number | null>;
    const orderId = id('ord');
    const number = `FNL-${new Date().getFullYear()}-${orderSeq++}`;
    const price = Number(animal.price_cents);
    const shipping = 18500 + (o.status === 'COMPLETED' ? 4500 : 0);
    const tax = Math.round(price * 0.08875);
    const fee = Math.round(price * 0.065);
    const placed = daysAgo(o.age);
    insert('orders', {
      id: orderId, number, buyer_id: o.buyer, breeder_id: animal.breeder_id, status: o.status,
      fulfillment: 'SHIPPING', subtotal_cents: price, shipping_cents: shipping, tax_cents: tax, platform_fee_cents: fee,
      total_cents: price + shipping + tax, currency: 'USD',
      address_snapshot: { line1: '515 Myrtle Ave', city: 'Brooklyn', state: 'NY', zip: '11205' },
      contact_snapshot: { firstName: 'Alex', lastName: 'Rivera', email: 'alex@example.com' },
      compliance_snapshot: { verdict: 'ALLOWED', notes: ['Seeded order — evaluated at checkout in the live flow.'] },
      destination_jurisdiction_id: jur.NY, origin_jurisdiction_id: animal.jurisdiction_id as string,
      estimated_delivery: daysAgo(o.age - 2), handoff_window: '2-day transit window',
      escrow_state: o.status === 'COMPLETED' ? 'RELEASED' : 'HELD', placed_at: placed, updated_at: daysAgo(Math.max(0, o.age - 1)),
      completed_at: o.status === 'COMPLETED' ? daysAgo(o.age - 3) : null,
    });
    insert('order_items', { id: id('oit'), order_id: orderId, animal_id: animal.id as string, quantity: 1, price_cents: price, snapshot: { name: animal.name, species: 'seeded' } });
    insert('payments', {
      id: id('pay'), order_id: orderId, provider: 'faunal-pay', provider_intent: `pi_${number}`, method: 'VISA ···· 4242',
      amount_cents: price + shipping + tax, fee_cents: Math.round((price + shipping) * 0.029) + 30, status: 'PAID',
      escrow_account: 'platform_escrow', captured_at: placed, created_at: placed, idempotency_key: `${number}_capture`,
    });
    insert('payouts', {
      id: id('pyo'), order_id: orderId, breeder_id: animal.breeder_id as string, gross_cents: price + shipping, fee_cents: fee,
      net_cents: price + shipping - fee, method: 'ACH', status: o.status === 'COMPLETED' ? 'PAID' : 'HELD',
      release_at: daysAgo(o.age - 4), released_at: o.status === 'COMPLETED' ? daysAgo(o.age - 3) : null, created_at: placed,
    });
    insert('shipping', {
      id: id('shp'), order_id: orderId, method: 'SPECIALIZED_SHIPPING', carrier: 'FAUNAL Live Freight', service: 'Temperature-controlled van',
      cost_cents: shipping, eta_days: 2, tracking_number: `FNL${1000000 + orderSeq}`, status: o.status === 'COMPLETED' ? 'DELIVERED' : 'IN_TRANSIT',
      legs: [{ label: 'Booking confirmed', at: placed }, { label: 'Health certificate attached', at: placed }, { label: 'Out for delivery', at: daysAgo(o.age - 1) }],
      temp_controlled: 1, health_cert_required: 1, created_at: placed, updated_at: daysAgo(Math.max(0, o.age - 1)),
    });
    const flow = ['PAYMENT_PENDING', 'PAID', 'BREEDER_CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
    const upto = flow.indexOf(o.status as string);
    flow.slice(0, upto + 1).forEach((st, i) => {
      insert('order_events', {
        id: id('oev'), order_id: orderId, status: st,
        label: { PAYMENT_PENDING: 'Order placed', PAID: 'Payment confirmed', BREEDER_CONFIRMED: 'Breeder confirmed', PREPARING: 'Preparing animal', SHIPPED: 'Shipped', DELIVERED: 'Delivered', COMPLETED: 'Completed' }[st] as string,
        note: st === 'PAID' ? 'Funds held in FAUNAL escrow.' : st === 'BREEDER_CONFIRMED' ? `${breeder.business_name} verified health paperwork.` : null,
        actor_id: o.buyer, created_at: daysAgo(o.age - i),
      });
    });
    if (o.review) {
      insert('reviews', {
        id: id('rev'), order_id: orderId, breeder_id: animal.breeder_id as string, animal_id: animal.id as string, author_id: o.buyer, ...o.review,
        status: 'PUBLISHED', created_at: daysAgo(Math.max(1, o.age - 4)),
      });
      db.prepare(`UPDATE breeders SET transactions_count = transactions_count + 1 WHERE id = ?`).run(animal.breeder_id as string);
    }
  }

  /* --------------------------------------------------------- conversations */
  const empireUser = db.prepare(`SELECT user_id FROM breeders WHERE id = ?`).get(b.empire) as { user_id: string };
  const convId = id('cnv');
  insert('conversations', {
    id: convId, buyer_id: alex, seller_user_id: empireUser.user_id, animal_id: animalIds[2], subject: 'Listing enquiry',
    last_message_at: daysAgo(0.2), created_at: daysAgo(2),
  });
  const convoMessages: [string, string, number][] = [
    [alex, "Hi, I'm interested in \"Butter\". Is she still available, and could she ship to Brooklyn next week?", 2],
    [empireUser.user_id, 'Hi Alex — yes, Butter is available and eating well. She ships Fridays in a heat box. Do you have a rack or a 40-gallon setup?', 1.9],
    [alex, '40-gallon with two hides and a thermostat. Do you include the health certificate for the carrier?', 1.5],
    [empireUser.user_id, 'Always — issued the day before travel and copied into the crate. I will add your CITES-free confirmation too, so the carrier does not stall it.', 0.6],
    [alex, 'Perfect. Can I pay through FAUNAL escrow and pick Friday if the van is already heading north?', 0.3],
  ];
  convoMessages.forEach(([sender, body, ago]) => {
    insert('messages', {
      id: id('msg'), conversation_id: convId, sender_id: sender, body, read_at: ago < 1 ? null : daysAgo(0), risk_level: 'NONE', flags: [],
      created_at: daysAgo(ago),
    });
  });

  /* --------------------------------------------------- reports & anti-fraud */
  insert('reports', {
    id: id('rpt'), reporter_id: dana, target_type: 'ANIMAL', target_id: animalIds[6], reason: 'MISLEADING_LISTING',
    details: 'Photos look brighter than the video and the weight in the description does not match the listing spec.',
    status: 'OPEN', created_at: daysAgo(1.5),
  });
  insert('fraud_flags', {
    id: id('frd'), kind: 'STOLEN_IMAGES_SUSPECTED', severity: 'MEDIUM', score: 0.62, entity_type: 'ANIMAL', entity_id: animalIds[6],
    signals: [{ note: 'Two images on this listing are near-duplicates of another breeder\'s album (pHash distance 4).', distance: 4 }],
    status: 'OPEN', created_at: daysAgo(1.4),
  });
  insert('fraud_flags', {
    id: id('frd'), kind: 'OFF_PLATFORM_PAYMENT', severity: 'HIGH', score: 0.93, entity_type: 'USER', entity_id: (db.prepare(`SELECT user_id FROM breeders WHERE id = ?`).get(b.pending) as { user_id: string }).user_id,
    signals: [{ note: 'Draft message mentioned a Zelle deposit outside the platform. Blocked before send.' }],
    status: 'OPEN', created_at: daysAgo(3),
  });

  /* --------------------------------------------------------- notifications */
  const notes: [string, string, string, string, string | null][] = [
    [alex, 'ORDER_UPDATE', 'Order FNL-2026-1042 shipped', 'The van left the facility at 06:20. Two-day window.', '/orders'],
    [alex, 'PRICE_DROP', 'Price dropped on Sunbeam', 'Now $2,499 — was $2,799.', null],
    [alex, 'MESSAGE', 'New message from Empire Reptile Works', 'Always — Butter ships Fridays in a heat box…', '/messages'],
    [alex, 'LISTING_AVAILABLE', 'Lone Star Turtle & Tortoise listed a new animal', 'Ornate Star is available for New York buyers.', null],
    [empireUser.user_id, 'ORDER_UPDATE', 'New order FNL-2026-1042', 'Payment is in escrow. Confirm paperwork and schedule the handoff.', '/seller/orders'],
    [admin, 'COMPLIANCE', '3 listings need a review decision', 'Two chameleon listings and a turtle are in PENDING_REVIEW.', '/admin/queue'],
    [admin, 'BREEDER_VERIFICATION', 'New breeder application', 'New World Exotics (AZ) is pending licence renewal.', '/admin/verification'],
    [admin, 'FRAUD', 'High-severity trust flag', 'Off-platform payment language detected in a draft message.', '/admin/fraud'],
  ];
  for (const [uid, kind, title, body, href] of notes) {
    insert('notifications', { id: id('ntf'), user_id: uid, kind, title, body, href, data: {}, read_at: kind === 'MESSAGE' ? null : '', created_at: daysAgo(0.5 + Math.random() * 2) });
  }

  /* ---------------------------------------------------------------- guides */
  const GUIDES: [string, string, string, string | null, string, number][] = [
    ['ball-python-beginner', 'Ball Python: your first 90 days', 'Setup, feeding, and the three mistakes that stall most new keepers — from weight logs to hide placement.', 'reptiles', 'BEGINNER', 8],
    ['humidity-without-mould', 'Humidity without mould', 'How to hold 70% in a bioactive enclosure and still keep the room breathable.', 'reptiles', 'INTERMEDIATE', 6],
    ['buying-with-papers', 'Buying an exotic with paperwork', 'What proof of origin, CITES and health certificates actually contain, and what to refuse.', null, 'BEGINNER', 11],
    ['live-shipping-day', 'The day your animal ships', 'Timeline, temperature boxes, what to have ready, and the first 48 hours after arrival.', null, 'BEGINNER', 7],
    ['parrot-light-sleep', 'Light, sleep and screaming in small conures', 'A photoperiod protocol that fixes most contact-call complaints without wing clipping.', 'birds', 'INTERMEDIATE', 5],
    ['dart-frog-cultures', 'Fruit fly cultures for dart frogs', 'Three cultures, one shelf, and a harvest schedule that never runs dry.', 'amphibians', 'INTERMEDIATE', 9],
  ];
  for (const [slugName, title, excerpt, catSlug, difficulty, minutes] of GUIDES) {
    insert('guides', {
      id: id('gd'),
      slug: slugName,
      title,
      excerpt,
      body: guideBody(title),
      category_slug: catSlug,
      difficulty,
      reading_minutes: minutes,
      cover_path: '/img/derived/guide-care-medium.webp',
      author_name: 'FAUNAL Care Desk',
      tags: ['husbandry', 'setup'],
      published_at: daysAgo(6 + title.length % 30),
    });
  }

  /* -------------------------------------------------------------- settings */
  insert('settings', { key: 'rulebook_version', value: 'FAUNAL_RULEBOOK_v0 — reference data, verify against official sources', updated_at: T });
  insert('settings', { key: 'platform', value: JSON.stringify({ country: 'US', currency: 'USD', locale: 'en', state: 'New York', city: 'New York' }), updated_at: T });
  insert('settings', { key: 'escrow_release_days', value: '3', updated_at: T });

  function guideBody(title: string) {
    return [
      `## ${title}`,
      '',
      'Most husbandry failures are not caused by a bad animal. They are caused by a setup that never reached stability in the first three weeks.',
      '',
      '### What to build before the animal arrives',
      '- Thermostat, not a dimmer, on every heat source. Test it for 72 hours with a data logger.',
      '- Two hides: one at the warm end, one at the cool end, both snug enough that the animal touches both walls.',
      '- A digital scale that reads in grams. Weight is the only early-warning system that works.',
      '',
      '> If a seller cannot tell you the feeding history of the parents, that is a husbandry problem in waiting.',
      '',
      '### The first 14 days',
      'Do not handle. Offer food on the schedule the breeder gave you, log every attempt, and leave the enclosure alone. A skipped feed in week one is normal; weight loss over 8% is not.',
      '',
      '### When to escalate',
      'Residual shed, mouth rot signs, or an animal that will not drink after three soaks — call an exotics vet rather than the internet. FAUNAL breeders keep a standing vet relationship and can send records on request.',
    ].join('\n');
  }

  /* --------------------------------------------------- audit + flag sweep */
  const { screenListing } = await import('../lib/domain/fraud');
  let flags = 0;
  for (const aid of animalIds) {
    const row = db.prepare(`SELECT a.*, b.id AS bid FROM animals a JOIN breeders b ON b.id = a.breeder_id WHERE a.id = ?`).get(aid) as Record<string, string | number | null>;
    const res = screenListing({
      animalId: aid,
      breederId: String(row.bid),
      speciesId: String(row.species_id),
      name: String(row.name),
      priceCents: Number(row.price_cents),
      user: null as never,
    });
    flags += res.duplicateImages > 0 ? 1 : 0;
  }

  const counts = TABLES.map((t) => {
    try {
      return `${t}=${(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n}`;
    } catch {
      return null;
    }
  }).filter((c) => c && !c.endsWith('=0'));

  const summary = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM breeders) AS breeders,
              (SELECT COUNT(*) FROM animals) AS animals, (SELECT COUNT(*) FROM animal_images) AS images,
              (SELECT COUNT(*) FROM species_restrictions) AS rules, (SELECT COUNT(*) FROM animal_documents) AS docs,
              (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM fraud_flags) AS flags, (SELECT COUNT(*) FROM messages) AS messages,
              (SELECT COUNT(*) FROM notifications) AS notifications`,
    )
    .get() as Record<string, number>;

  /* ------------------------------------------- recompute stored verdicts
   * animals.compliance_status caches the engine verdict captured when the
   * listing was written — which happens before seller paperwork is inserted.
   * Re-evaluate every listing now so cache and engine agree; otherwise the
   * storefront shows stale "requires documentation" badges and nothing is
   * buyable in the demo.
   */
  const recheck = db
    .prepare(`SELECT id, species_id, breeder_id, jurisdiction_id FROM animals`)
    .all() as { id: string; species_id: string; breeder_id: string; jurisdiction_id: string }[];
  let buyable = 0;
  for (const row of recheck) {
    const v = evaluateCompliance({
      speciesId: row.species_id,
      animalId: row.id,
      breederId: row.breeder_id,
      originJurisdictionId: row.jurisdiction_id,
      destinationJurisdictionId: row.jurisdiction_id,
      method: 'SPECIALIZED_SHIPPING',
    });
    db.prepare(`UPDATE animals SET compliance_status = ?, compliance_notes = ? WHERE id = ?`).run(v.verdict, JSON.stringify(v.notes), row.id);
    if (v.canBuy) buyable += 1;
  }
  console.log(`[seed] re-evaluated ${recheck.length} listings against their paperwork (${buyable} buyable in their own state)`);

  console.log('[seed] done:', summary);
  console.log('[seed] duplicate-image flags raised from real pHash comparison:', flags);
  console.log('[seed] populated tables:', counts.join(' '));
  console.log(`[seed] demo password for all seeded accounts: ${PW}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
