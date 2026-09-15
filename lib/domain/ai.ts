import { getDb } from '@/lib/db';
import { slugify } from './util';
import type { Difficulty, FilterState, Sex } from './types';

/**
 * FAUNAL intelligence layer (spec §37).
 *
 * Deliberately local + deterministic so it ships with zero API keys: a
 * lexicon/grammar parser turns natural language into the *same* filter object
 * the sidebar produces, the recommender is an explicit scoring function over
 * catalog + behaviour, and the assistant answers from live catalog data.
 * `llmAdapter` is where a hosted model plugs in later — and every path runs the
 * compliance engine on its way out, so the assistant can never surface an
 * animal the buyer could not legally receive.
 */

const CATEGORY_WORDS: Record<string, string> = {
  reptile: 'reptiles', reptiles: 'reptiles', snake: 'reptiles', snakes: 'reptiles',
  lizard: 'reptiles', lizards: 'reptiles', turtle: 'reptiles', turtles: 'reptiles',
  tortoise: 'reptiles', gecko: 'reptiles', geckos: 'reptiles', skink: 'reptiles',
  chameleon: 'reptiles', dragon: 'reptiles', 'bearded dragon': 'reptiles',
  bird: 'birds', birds: 'birds', parrot: 'birds', parrots: 'birds', macaw: 'birds',
  cockatoo: 'birds', conure: 'birds',
  fish: 'fish', aquarium: 'fish',
  frog: 'amphibians', frogs: 'amphibians', amphibian: 'amphibians', salamander: 'amphibians',
  axolotl: 'amphibians', newt: 'amphibians', toad: 'amphibians',
  spider: 'arachnids', tarantula: 'arachnids', tarantulas: 'arachnids',
  scorpion: 'arachnids', invertebrate: 'arachnids', insect: 'arachnids',
  mammal: 'mammals', mammals: 'mammals', glider: 'mammals', hedgehog: 'mammals',
  fennec: 'mammals', prairie: 'mammals',
};

const STATE_WORDS: Record<string, string> = {
  newYork: 'NY', ny: 'NY', 'new york': 'NY', florida: 'FL', fl: 'FL', texas: 'TX', tx: 'TX',
  california: 'CA', ca: 'CA', arizona: 'AZ', az: 'AZ', nevada: 'NV', nv: 'NV',
  'north carolina': 'NC', nc: 'NC', ohio: 'OH', oh: 'OH', illinois: 'IL', il: 'IL',
  georgia: 'GA', ga: 'GA', pennsylvania: 'PA', pa: 'PA', colorado: 'CO', co: 'CO',
  washington: 'WA', wa: 'WA', oregon: 'OR', or: 'OR', minnesota: 'MN', mn: 'MN',
  massachusetts: 'MA', ma: 'MA', connecticut: 'CT', ct: 'CT', 'new jersey': 'NJ', nj: 'NJ',
};

export interface ParsedQuery {
  filters: FilterState;
  interpreted: string[];
  confidence: number;
}

/** Natural-language → structured filters. Handles "female ball python under $600 near New York". */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.toLowerCase().trim();
  const filters: FilterState = {};
  const interpreted: string[] = [];
  if (!q) return { filters, interpreted, confidence: 0 };

  const money = q.match(/(?:under|below|less than|max|up to|<)\s*\$?\s*([\d,]+)(?:\s*(k|000))?/);
  if (money) {
    const val = parseInt(money[1].replace(/,/g, ''), 10) * (money[2] ? 1000 : money[1].includes('.') ? 1 : 1);
    filters.maxPrice = val > 100000 ? val : val * (val < 20000 ? 1 : 1);
    filters.maxPrice = Math.round(toCents(money[1], money[2]) / 100);
    interpreted.push(`price under ${money[0].replace(/^(under|below|less than|max|up to|<)\s*/i, '')}`);
  }
  const min = q.match(/(?:over|above|more than|min|at least|>)\s*\$?\s*([\d,]+)/);
  if (min) {
    filters.minPrice = Math.round(Number(min[1].replace(/,/g, '')));
    interpreted.push(`price above $${filters.minPrice}`);
  }
  const range = q.match(/\$\s?([\d,]+)\s*(?:-|–|to)\s*\$?\s?([\d,]+)/);
  if (range) {
    filters.minPrice = Number(range[1].replace(/,/g, ''));
    filters.maxPrice = Number(range[2].replace(/,/g, ''));
    interpreted.push(`price $${filters.minPrice}–$${filters.maxPrice}`);
  }

  if (/\bfemale|hen\b/.test(q)) {
    filters.sex = 'FEMALE';
    interpreted.push('female');
  } else if (/\bmale\b|\bcock\b/.test(q)) {
    filters.sex = 'MALE';
    interpreted.push('male');
  }
  if (/\bpair\b/.test(q)) interpreted.push('pair requested — breeders are asked to quote 2 animals');

  const age = q.match(/(\d+)\s*(?:months?|mo)\b/);
  const ageY = q.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:year|yr)s?\b/);
  if (age) {
    filters.maxAgeMonths = Number(age[1]);
    interpreted.push(`younger than ${age[1]} months`);
  } else if (ageY) {
    filters.maxAgeMonths = Math.round(Number(ageY[1]) * 12);
    interpreted.push(`younger than ${ageY[1]} years`);
  }

  if (/\bbaby|\bjunior|juvenile\b/.test(q)) {
    filters.maxAgeMonths = 12;
    interpreted.push('juvenile or younger');
  }
  if (/\bbeginner|first[- ]time|easy|low maintenance|hardy\b/.test(q)) {
    filters.experience = 'BEGINNER';
    interpreted.push('beginner-friendly care');
  } else if (/\badvanced|experienced\b/.test(q)) {
    filters.experience = 'ADVANCED';
    interpreted.push('for keepers with experience');
  }
  if (/\bsmall\b|tiny|compact|apartment\b|doesn.?t require a huge|little space\b/.test(q)) {
    filters.size = 'SMALL';
    interpreted.push('small footprint');
  } else if (/\blarge\b|big enclosure|huge\b/.test(q)) {
    filters.size = 'LARGE';
    interpreted.push('larger specimen');
  }
  if (/\bdocile|calm|friendly|handle|tame\b/.test(q)) interpreted.push('calm temperament weighted higher');
  if (/\bverified\b|\breputable\b|\btrusted\b/.test(q)) {
    filters.verifiedOnly = true;
    interpreted.push('verified breeders only');
  }
  if (/\bcaptive[- ]bred\b|\bcaptive bred\b/.test(q)) {
    filters.captiveBredOnly = true;
    interpreted.push('captive-bred only');
  }
  if (/\bavailable|in stock|ready\b/.test(q)) {
    filters.availableOnly = true;
    interpreted.push('available now');
  }
  const near = q.match(/(?:near|around|in|to)\s+([a-z .'-]{2,24})/);
  if (near) {
    const token = near[1].split(/[\s,]+/)[0].replace(/[^a-z]/g, '');
    const full = near[1].trim().replace(/\b(state|us|usa)\b/g, '').trim();
    const code =
      STATE_WORDS[full.replace(/\s+/g, ' ')] ??
      STATE_WORDS[token] ??
      STATE_WORDS[full.toLowerCase()] ??
      undefined;
    if (code) {
      filters.state = code;
      interpreted.push(`near ${code}`);
    }
  }

  // Category words + exact species names.
  const speciesHit = findSpecies(q);
  if (speciesHit) {
    filters.species = speciesHit.slug;
    interpreted.push(speciesHit.common_name.toLowerCase());
    if (speciesHit.morph) {
      filters.morph = speciesHit.morph;
      interpreted.push(`${speciesHit.morph} morph`);
    }
  } else {
    for (const [word, cat] of Object.entries(CATEGORY_WORDS)) {
      if (new RegExp(`\\b${word}\\b`).test(q)) {
        filters.category = cat;
        interpreted.push(cat);
        break;
      }
    }
  }

  const confidence = Math.min(1, 0.25 + interpreted.length * 0.22);
  if (!interpreted.length) interpreted.push('text search only');
  return { filters, interpreted, confidence };
}

function toCents(raw: string, kSuffix?: string): number {
  const n = Number(raw.replace(/,/g, ''));
  return Math.round((kSuffix ? n * 1000 : n) * 100);
}

function findSpecies(q: string): { slug: string; common_name: string; morph?: string } | null {
  const db = getDb();
  const rows = db.prepare(`SELECT slug, common_name FROM species`).all() as { slug: string; common_name: string }[];
  let best: { slug: string; common_name: string; len: number } | null = null;
  for (const r of rows) {
    const name = r.common_name.toLowerCase();
    const simple = name.split(' ')[0];
    if (q.includes(name) || (simple.length > 4 && q.includes(name.split(' ')[0]) && q.includes(name.split(' ').slice(1).join(' ')))) {
      const len = name.length;
      if (!best || len > best.len) best = { ...r, len };
    } else if (q.includes(name)) {
      if (!best || name.length > best.len) best = { ...r, len: name.length };
    }
  }
  if (!best) {
    // Fuzzy: "python" → ball python
    for (const r of rows) {
      const parts = r.common_name.toLowerCase().split(' ');
      if (parts.some((p) => p.length > 4 && q.includes(p))) {
        if (!best || r.common_name.length > best.len) best = { ...r, len: r.common_name.length };
      }
    }
  }
  if (!best) return null;
  const morph = q.match(
    /\b(banana|pied|pastel|clown|spider|coral glow|leopard|tiger|albino|snow|tangerine|motley|burnout|dreamkeeper|axanthic|jenday|pineapple|greenop|harlequin|carpet|pallid|lessa|sunglow|wema|super snow|rainbow|blue|albino+pastel)\b/,
  )?.[1];
  return { slug: best.slug, common_name: best.common_name, morph: morph ? titlecase(morph) : undefined };
}

function titlecase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --------------------------------------------------------- recommendations */

export interface BehaviorProfile {
  categoryWeights: Record<string, number>;
  speciesWeights: Record<string, number>;
  priceAvgCents: number;
  experience: Difficulty | null;
}

export function behaviorProfile(userId: string | null): BehaviorProfile {
  const profile: BehaviorProfile = { categoryWeights: {}, speciesWeights: {}, priceAvgCents: 0, experience: null };
  if (!userId) return profile;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.kind, a.category_id, a.species_id, a.price_cents, a.experience_level, e.weight
       FROM user_events e LEFT JOIN animals a ON a.id = e.entity_id
       WHERE e.user_id = ? AND e.created_at > ? ORDER BY e.created_at DESC LIMIT 120`,
    )
    .all(userId, new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString()) as {
    kind: string;
    category_id: string | null;
    species_id: string | null;
    price_cents: number | null;
    experience_level: string | null;
    weight: number;
  }[];
  let priceSum = 0;
  let priceN = 0;
  for (const r of rows) {
    const boost = r.kind === 'FAVORITE' ? 3 : r.kind === 'ADD_TO_CART' ? 4 : r.kind === 'VIEW_ANIMAL' ? 1 : 0.5;
    if (r.category_id) profile.categoryWeights[r.category_id] = (profile.categoryWeights[r.category_id] ?? 0) + boost * r.weight;
    if (r.species_id) profile.speciesWeights[r.species_id] = (profile.speciesWeights[r.species_id] ?? 0) + boost * 1.6 * r.weight;
    if (r.price_cents) {
      priceSum += r.price_cents;
      priceN++;
    }
    if (r.experience_level) profile.experience = r.experience_level as Difficulty;
  }
  profile.priceAvgCents = priceN ? Math.round(priceSum / priceN) : 0;
  return profile;
}

export interface ScoredAnimal {
  id: string;
  score: number;
  reasons: string[];
}

/** Explainable scoring: behavior + budget + legality + seller quality + freshness. */
export function recommend(userId: string | null, destinationState: string | null, limit = 8): ScoredAnimal[] {
  const db = getDb();
  const profile = behaviorProfile(userId);
  const rows = db
    .prepare(
      `SELECT a.id, a.species_id, a.category_id, a.price_cents, a.experience_level, a.breeder_id,
              a.created_at, a.is_featured, b.rating_avg, b.tier
       FROM animals a JOIN breeders b ON b.id = a.breeder_id
       WHERE a.status = 'APPROVED' AND a.availability = 'AVAILABLE'
       ORDER BY a.published_at DESC LIMIT 240`,
    )
    .all() as {
    id: string;
    species_id: string;
    category_id: string;
    price_cents: number;
    experience_level: string;
    breeder_id: string;
    created_at: string;
    is_featured: number;
    rating_avg: number;
    tier: string;
  }[];

  const scored = rows.map<ScoredAnimal>((r) => {
    const reasons: string[] = [];
    let score = 0;
    score += (profile.categoryWeights[r.category_id] ?? 0) * 4;
    if (profile.categoryWeights[r.category_id]) reasons.push('matches what you browse');
    score += (profile.speciesWeights[r.species_id] ?? 0) * 5;
    if (profile.speciesWeights[r.species_id] >= 2) reasons.push('same species you favorited');
    if (profile.priceAvgCents) {
      const delta = Math.abs(r.price_cents - profile.priceAvgCents) / profile.priceAvgCents;
      score += Math.max(0, (1 - delta) * 6);
      if (delta < 0.35) reasons.push('close to your usual budget');
    }
    if (profile.experience && profile.experience === 'BEGINNER' && r.experience_level === 'BEGINNER') {
      score += 5;
      reasons.push('beginner-friendly care');
    }
    score += (r.rating_avg - 4) * 6;
    if (r.rating_avg >= 4.85) reasons.push(`top-rated breeder (${r.rating_avg.toFixed(2)}★)`);
    if (r.tier === 'VERIFIED_BREEDER') score += 3;
    if (r.is_featured) score += 2;
    const ageDays = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
    score += Math.max(0, 4 - ageDays / 12);
    if (ageDays < 14) reasons.push('recently listed');
    if (destinationState && isLegalForState(db, r.id, destinationState)) score += 2;
    return { id: r.id, score: Math.round(score * 10) / 10, reasons };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function isLegalForState(db: ReturnType<typeof getDb>, animalId: string, state: string): boolean {
  const row = db
    .prepare(
      `SELECT a.species_id, a.jurisdiction_id AS dest, j.code
       FROM animals a JOIN jurisdictions j ON j.id = a.jurisdiction_id WHERE a.id = ?`,
    )
    .get(animalId) as { species_id: string; code: string } | undefined;
  if (!row) return false;
  const banned = db
    .prepare(
      `SELECT 1 FROM species_restrictions sr JOIN jurisdictions j ON j.id = sr.jurisdiction_id
       WHERE sr.species_id = ? AND j.code = ? AND sr.status = 'PROHIBITED' LIMIT 1`,
    )
    .get(row.species_id, state.toUpperCase());
  return !banned;
}

/* ------------------------------------------------------------- AI assistant */

export interface AssistantAnswer {
  reply: string;
  filters: FilterState;
  animalIds: string[];
  guidance: string[];
  complianceNote: string | null;
}

export function assistant(prompt: string, ctx: { userId: string | null; destinationState: string | null }): AssistantAnswer {
  const parsed = parseQuery(prompt);
  const db = getDb();
  const filters = parsed.filters;
  if (ctx.destinationState) filters.state = filters.state ?? ctx.destinationState;
  filters.availableOnly = true;

  const ids = queryAnimalIds(filters, 6);
  const rows = ids.length
    ? (db
        .prepare(
          `SELECT a.name, a.price_cents, s.common_name, m.name AS morph, b.business_name, b.rating_avg, a.state, a.experience_level, a.id
           FROM animals a JOIN species s ON s.id = a.species_id JOIN breeders b ON b.id = a.breeder_id
           LEFT JOIN morphs m ON m.id = a.morph_id WHERE a.id IN (${ids.map(() => '?').join(',')})`,
        )
        .all(...ids) as {
        id: string;
        name: string;
        price_cents: number;
        common_name: string;
        morph: string | null;
        business_name: string;
        rating_avg: number;
        state: string;
        experience_level: string;
      }[])
    : [];

  const guidance: string[] = [];
  if (filters.experience === 'BEGINNER') guidance.push('Start with a 40-gallon-ready setup and a 90-day food plan before the animal arrives.');
  if (filters.size === 'SMALL') guidance.push('Ask breeders about enclosure footprint, not just price — hides and thermostats are the real budget.');
  if (/budget|under \$?\d/.test(prompt.toLowerCase())) guidance.push('Reserve ~30% of your budget for the enclosure; the animal is rarely the biggest cost.');

  const destinationLabel = ctx.destinationState ? ctx.destinationState.toUpperCase() : 'your state';
  const reply = rows.length
    ? `Based on your budget, space and ${destinationLabel} rules, ${rows.length} ${rows.length === 1 ? 'listing fits' : 'listings fit'}. My top pick is ${rows[0].common_name}${
        rows[0].morph ? ` (${rows[0].morph})` : ''
      } from ${rows[0].business_name} at $${Math.round(rows[0].price_cents / 100)} — ${rows[0].experience_level.toLowerCase()} care.`
    : `I could not find a legal match for that exact brief in ${destinationLabel}. Widen the price range or tell me which of these you value most: budget, temperament, or small space.`;

  const needsDocs = rows.some((r) => {
    const v = db
      .prepare(
        `SELECT sr.status FROM species_restrictions sr JOIN jurisdictions j ON j.id = sr.jurisdiction_id
         WHERE sr.species_id = (SELECT species_id FROM animals WHERE id = ?) AND j.code = ? AND sr.status != 'ALLOWED' LIMIT 1`,
      )
      .get(r.id, destinationLabel) as { status: string } | undefined;
    return !!v;
  });

  return {
    reply,
    filters,
    animalIds: rows.map((r) => r.id),
    guidance,
    complianceNote: needsDocs
      ? `Some matches carry state conditions in ${destinationLabel}. FAUNAL blocks checkout until the required documents are verified — the rules were never changed to fit the answer.`
      : null,
  };
}

/** Shared filter → SQL compiler used by search, explore, category pages, AI. */
export function queryAnimalIds(filters: FilterState, limit = 60): string[] {
  const db = getDb();
  const where: string[] = [`a.status = 'APPROVED'`];
  const args: (string | number)[] = [];
  if (filters.availableOnly !== false) where.push(`a.availability = 'AVAILABLE'`);
  if (filters.category) {
    where.push(`c.slug = ?`);
    args.push(filters.category);
  }
  if (filters.species) {
    where.push(`s.slug = ?`);
    args.push(filters.species);
  }
  if (filters.morph) {
    where.push(`(m.name LIKE ? OR m.id = ?)`);
    args.push(`%${filters.morph}%`, filters.morph);
  }
  if (filters.sex && filters.sex !== 'UNKNOWN') {
    where.push(`a.sex = ?`);
    args.push(filters.sex);
  }
  if (filters.maxAgeMonths) {
    where.push(`a.age_months <= ?`);
    args.push(filters.maxAgeMonths);
  }
  if (filters.minPrice) {
    where.push(`a.price_cents >= ?`);
    args.push(filters.minPrice * 100);
  }
  if (filters.maxPrice) {
    where.push(`a.price_cents <= ?`);
    args.push(filters.maxPrice * 100);
  }
  if (filters.state) {
    where.push(`a.state = ?`);
    args.push(filters.state.toUpperCase());
  }
  if (filters.experience) {
    where.push(`a.experience_level = ?`);
    args.push(filters.experience);
  }
  if (filters.size === 'SMALL') where.push(`s.adult_length_cm < 45`);
  if (filters.size === 'MEDIUM') where.push(`s.adult_length_cm BETWEEN 45 AND 75`);
  if (filters.size === 'LARGE') where.push(`s.adult_length_cm > 75`);
  if (filters.verifiedOnly) where.push(`b.tier = 'VERIFIED_BREEDER'`);
  if (filters.captiveBredOnly) where.push(`a.captive_bred = 1`);
  if (filters.q && filters.q.trim()) {
    const like = `%${filters.q.trim().replace(/\s+/g, '%')}%`;
    where.push(`(a.name LIKE ? OR s.common_name LIKE ? OR s.scientific_name LIKE ? OR m.name LIKE ? OR b.business_name LIKE ?)`);
    args.push(like, like, like, like, like);
  }
  const sortMap: Record<string, string> = {
    price_asc: 'a.price_cents ASC',
    price_desc: 'a.price_cents DESC',
    newest: 'a.published_at DESC',
    rating: 'b.rating_avg DESC, a.published_at DESC',
    relevance: `a.is_featured DESC, b.rating_avg DESC, a.published_at DESC`,
  };
  const rows = db
    .prepare(
      `SELECT a.id FROM animals a
       JOIN species s ON s.id = a.species_id JOIN breeders b ON b.id = a.breeder_id
       JOIN categories c ON c.id = a.category_id LEFT JOIN morphs m ON m.id = a.morph_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${sortMap[filters.sort ?? 'relevance'] ?? sortMap.relevance}
       LIMIT ?`,
    )
    .all(...args, limit) as { id: string }[];
  return rows.map((r) => r.id);
}

/* ------------------------------------------------- listing anomaly heuristics */

export function pricingAnomaly(input: { speciesId: string; priceCents: number }): { z: number; note: string } {
  const db = getDb();
  const stats = db
    .prepare(
      `SELECT AVG(price_cents) AS m, COUNT(*) AS n FROM animals WHERE species_id = ? AND status IN ('APPROVED','PENDING_REVIEW')`,
    )
    .get(input.speciesId) as { m: number | null; n: number };
  if (!stats.m || stats.n < 3) return { z: 0, note: 'Not enough comparable listings yet.' };
  const vals = (
    db.prepare(`SELECT price_cents FROM animals WHERE species_id = ? AND status IN ('APPROVED','PENDING_REVIEW')`).all(input.speciesId) as {
      price_cents: number;
    }[]
  ).map((r) => r.price_cents);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  const z = (input.priceCents - mean) / sd;
  if (z < -2.2) return { z, note: 'Priced far below the species median — classic bait/scam signature.' };
  if (z > 3) return { z, note: 'Priced far above the species median — verify the morph claim before approval.' };
  return { z, note: 'Within normal market range for this species.' };
}

export function offPlatformRisk(text: string): { level: 'NONE' | 'LOW' | 'HIGH'; signals: string[] } {
  const t = text.toLowerCase();
  const signals: string[] = [];
  if (/(venmo|zelle|cash ?app|paypal|wire|western union|gift ?card|crypto|bitcoin)/.test(t)) signals.push('off-platform payment request');
  if (/(pay (me )?direct|outside (the )?(site|platform|faunal)|send (a )?deposit|cash only)/.test(t)) signals.push('off-platform payment phrasing');
  if (/(\/\s?wa\.me|t\.me\/|whatsapp|telegram|instagram\s?dm|@[a-z0-9._]{3,})/i.test(text)) signals.push('contact details shared in chat');
  if (/(western union|money gram|gift ?card)/.test(t)) return { level: 'HIGH', signals };
  if (signals.length >= 2) return { level: 'HIGH', signals };
  if (signals.length === 1) return { level: 'LOW', signals };
  return { level: 'NONE', signals };
}
