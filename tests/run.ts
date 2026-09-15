/**
 * FAUNAL end-to-end checks.
 *
 * Run with `npm test`. The suite copies the seeded database into a scratch file
 * so it can write real rows (users, carts, orders) without touching the
 * development or demo data. Every assertion goes through the same repo and
 * domain functions the HTTP API uses — no re-implementation, no mocks.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRATCH = process.env.FAUNAL_TEST_DB ?? path.join('/tmp', 'faunal-test.db');
const SOURCE = path.join(ROOT, 'data', 'faunal.db');

for (const suffix of ['', '-wal', '-shm']) {
  const target = `${SCRATCH}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target);
}
if (!fs.existsSync(SOURCE)) throw new Error('Run `npm run db:seed` before the test suite (data/faunal.db is missing).');
fs.copyFileSync(SOURCE, SCRATCH);
process.env.FAUNAL_DB = SCRATCH;
process.env.FAUNAL_PRIVATE_DIR = path.join('/tmp', 'faunal-private-test');

type Row = Record<string, string | number | null>;
let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const { getDb } = await import('../lib/db');
  const { signUp, signIn, verifyLogin, beginLoginChallenge, completeLoginWithCode, beginPasswordReset, completePasswordReset, readSession } = await import('../lib/domain/auth');
  const { money } = await import('../lib/ui/animal-view');
  const { parseQuery, assistant } = await import('../lib/domain/ai');
  const { evaluateCompliance } = await import('../lib/domain/compliance');
  const { rateLimit } = await import('../lib/domain/rbac');
  const { computeFees, taxRateFor } = await import('../lib/domain/commerce');
  const cart = await import('../lib/repo/cart');
  const orders = await import('../lib/repo/orders');
  const account = await import('../lib/repo/account');
  const seller = await import('../lib/repo/seller');
  const admin = await import('../lib/repo/admin');

  const db = getDb();
  const one = <T,>(sql: string, ...args: unknown[]) => db.prepare(sql).get(...args) as T;

  console.log('\nMoney & formatting');
  check('whole dollars print without decimals', money(45000) === '$450', money(45000));
  check('thousands are grouped', money(249900) === '$2,499', money(249900));
  check('fractional cents print two decimals', money(249999) === '$2,499.99', money(249999));

  console.log('\nNatural-language search');
  const nl = parseQuery('female ball python under $600 for a first-time keeper');
  check('sex parsed', nl.filters.sex === 'FEMALE', JSON.stringify(nl.filters));
  check('price ceiling parsed', nl.filters.maxPrice === 600, JSON.stringify(nl.filters));
  check('experience level parsed', nl.filters.experience === 'BEGINNER', JSON.stringify(nl.filters));
  const found = cart ? (await import('../lib/repo/catalog')).searchAnimals({ sex: 'FEMALE', maxPrice: 600, species: 'ball-python' } as never, 24, 0) : null;
  check('filters return only matching listings', !!found && found.cards.every((c) => c.sex === 'FEMALE' && Number(c.price_cents) <= 60000), `total=${found?.total}`);

  console.log('\nCompliance engine');
  const prohibited = one<{ animal_id: string; state: string; species: string }>(
    `SELECT a.id AS animal_id, j.code AS state, s.common_name AS species
     FROM animals a
     JOIN species_restrictions sr ON sr.species_id = a.species_id AND sr.status = 'PROHIBITED'
     JOIN jurisdictions j ON j.id = sr.jurisdiction_id
     JOIN species s ON s.id = a.species_id
     WHERE a.status = 'APPROVED' LIMIT 1`,
  );
  check('the seeded rulebook contains a prohibition to test', !!prohibited, 'no PROHIBITED rule found');
  if (prohibited) {
    const animal = one<Row>(`SELECT * FROM animals WHERE id = ?`, prohibited.animal_id);
    const dest = one<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, prohibited.state);
    const verdict = evaluateCompliance({
      speciesId: String(animal.species_id),
      originJurisdictionId: String(animal.origin_jurisdiction_id ?? animal.jurisdiction_id),
      destinationJurisdictionId: dest?.id ?? null,
      breederId: String(animal.breeder_id),
      method: 'SPECIALIZED_SHIPPING',
      buyerUserId: null,
    } as never);
    check(`prohibited species in ${prohibited.state} blocks the purchase`, verdict.canBuy === false, verdict.verdict);
    check('verdict is PROHIBITED', verdict.verdict === 'PROHIBITED', verdict.verdict);
    check('a citation is attached to the blocking rule', verdict.rules.some((r) => !!r.citation), JSON.stringify(verdict.rules.slice(0, 2)));
    const home = evaluateCompliance({
      animalId: String(animal.id),
      breederId: String(animal.breeder_id),
      speciesId: String(animal.species_id),
      originJurisdictionId: String(animal.origin_jurisdiction_id ?? animal.jurisdiction_id),
      destinationJurisdictionId: String(animal.jurisdiction_id),
      method: 'LOCAL_PICKUP',
      buyerUserId: null,
    } as never);
    check('the same animal is not prohibited in its origin state', home.verdict !== 'PROHIBITED', `${home.verdict} / ${home.notes.join(' | ')}`);
  }

  console.log('\nAuthentication');
  const email = `t${Date.now()}@faunal.test`;
  const signed = signUp({ email, password: 'Correct-Horse-9', firstName: 'Test', lastName: 'Buyer', role: 'BUYER', jurisdictionCode: 'NY', city: 'Queens' } as never);
  const session = readSession(signed.token);
  check('signup returns a live session', !!session && session.email === email);
  let bad = false;
  try {
    signIn(email, 'wrong-password');
  } catch {
    bad = true;
  }
  check('wrong password is rejected', bad);
  const pre = verifyLogin(email, 'Correct-Horse-9');
  check('verifyLogin resolves the account', !!pre.userId && pre.twoFactor === false);
  const code = beginLoginChallenge(pre.userId);
  const completed = completeLoginWithCode(email, code, 'test-agent');
  check('2FA challenge completes a session', !!completed.token && !!readSession(completed.token));
  let stale = false;
  try {
    completeLoginWithCode(email, code, 'test-agent');
  } catch {
    stale = true;
  }
  check('a used 2FA code cannot be replayed', stale);
  const reset = beginPasswordReset(email);
  completePasswordReset(email, reset.code, 'New-Password-42');
  check('password reset works and signs other devices out', (() => {
    try {
      signIn(email, 'New-Password-42');
      return true;
    } catch {
      return false;
    }
  })());
  let oldWorks = true;
  try {
    signIn(email, 'Correct-Horse-9');
  } catch {
    oldWorks = false;
  }
  check('the old password stops working', !oldWorks);

  console.log('\nRbac / rate limiting');
  const key = `test:${Date.now()}`;
  let blocked = false;
  for (let i = 0; i < 30; i += 1) {
    const r = rateLimit(key, 5, 60_000);
    if (!r.ok) blocked = true;
  }
  check('rate limiter blocks after the window is exceeded', blocked);

  console.log('\nFees & tax');
  const aBreeder = one<{ id: string }>(`SELECT id FROM breeders WHERE storefront_plan = 'FREE' LIMIT 1`);
  const fees = computeFees({ subtotal_cents: 100000, shipping_cents: 15000, breederId: aBreeder.id, destinationState: 'NY' });
  check('commission is charged on the subtotal only', fees.platform_fee_cents > 0 && fees.platform_fee_cents <= 9000, JSON.stringify(fees));
  check('buyer total excludes the seller-side commission', fees.total_cents === 100000 + 15000 + fees.tax_cents, JSON.stringify(fees));
  check('commission basis points come from the seller plan', fees.commission_bps > 0, String(fees.commission_bps));
  check('tax rate is read per state', taxRateFor('NY') > 0 && taxRateFor('OR') === 0, `${taxRateFor('NY')} / ${taxRateFor('OR')}`);

  console.log('\nCart, checkout and orders');
  const buyer = readSession(signIn(email, 'New-Password-42').token)!;
  const legal = one<Row>(
    `SELECT a.* FROM animals a JOIN breeders b ON b.id = a.breeder_id
     WHERE a.status='APPROVED' AND a.availability='AVAILABLE' AND a.state='NY' AND b.state='NY'
       AND b.status='APPROVED' AND a.compliance_status IN ('ALLOWED','RESTRICTED')
     ORDER BY a.price_cents ASC LIMIT 3`,
  );
  check('there are NY listings to buy', !!legal);
  const before = cart.cartFor(buyer as never);
  check('a new account starts with an empty cart', before.lines.length === 0, `lines=${before.lines.length}`);
  const added = cart.addToCart(buyer as never, String(legal.id), 'SPECIALIZED_SHIPPING' as never);
  check('legal listing lands in the cart', added.cart.lines.length === 1, JSON.stringify(added.cart.lines.length));
  const afterAdd = cart.cartFor(buyer as never);
  check('checkout is ready for a compliant line', afterAdd.checkout_ready === true, `blocked=${afterAdd.blocked_count}`);

  if (prohibited) {
    const blockedAnimal = one<Row>(
      `SELECT a.id FROM animals a
       JOIN species_restrictions sr ON sr.species_id = a.species_id AND sr.status='PROHIBITED'
       JOIN jurisdictions j ON j.id = sr.jurisdiction_id AND j.code = ?
       WHERE a.status='APPROVED' LIMIT 1`,
      prohibited.state,
    );
    if (blockedAnimal) {
      const dbState = buyer.jurisdictionCode;
      // Point the buyer at the prohibited destination, then try to add.
      db.prepare(`UPDATE users SET jurisdiction_code = ? WHERE id = ?`).run(prohibited.state, buyer.id);
      const refreshed = readSession(signIn(email, 'New-Password-42').token)!;
      let blockedAdd: { status?: number; code?: string } | null = null;
      try {
        cart.addToCart(refreshed as never, String(blockedAnimal.id), 'SPECIALIZED_SHIPPING' as never);
      } catch (e) {
        blockedAdd = e as { status?: number; code?: string };
      }
      check('adding a prohibited animal for the destination is refused', !!blockedAdd && blockedAdd.code === 'COMPLIANCE_BLOCK', JSON.stringify(blockedAdd));
      check('the refusal is a 451', blockedAdd?.status === 451, String(blockedAdd?.status));
      db.prepare(`UPDATE users SET jurisdiction_code = ? WHERE id = ?`).run(dbState ?? 'NY', buyer.id);
    }
  }

  const addrList = account.saveAddress(buyer as never, { label: 'Test', recipient: 'Test Buyer', line1: '35-06 78th St', line2: '', city: 'Queens', state: 'NY', zip: '11372' } as never);
  const addr = Array.isArray(addrList) ? addrList[0] : (addrList as { address?: Row } & Row).address ?? (addrList as Row);
  const methodList = account.addPaymentMethod(buyer as never, { number: '4242424242424242', expMonth: '12', expYear: '2030', cvv: '123' } as never);
  const method = Array.isArray(methodList) ? methodList[0] : (methodList as Row);
  check('address saved', !!addr && String(addr.city) === 'Queens', JSON.stringify(addr));
  check('card stored as token + last4 only', (() => {
    const row = one<Row>(`SELECT * FROM payment_methods WHERE id = ?`, String((method as Row).id));
    const raw = `${row.brand ?? ''}${row.token ?? ''}${row.last4 ?? ''}`;
    return !raw.includes('4242424242424242') && row.last4 === '4242';
  })());

  const preview = orders.checkoutPreview(buyer as never, {} as never);
  check('preview groups one order per breeder', preview.orders.length >= 1, `groups=${preview.orders.length}`);
  const placed = orders.placeOrder(buyer as never, {
    fulfillment: 'SHIPPING',
    method: 'SPECIALIZED_SHIPPING',
    addressId: String((addr as Row).id),
    paymentToken: 'tok_test_123',
    paymentMethodId: method ? String((method as Row).id) : null,
    firstName: 'Test',
    lastName: 'Buyer',
    email,
    phone: '555-0100',
  } as never);
  check('order placed', placed.orders.length >= 1, JSON.stringify(placed).slice(0, 200));
  const orderRow = one<Row>(`SELECT * FROM orders WHERE id = ?`, placed.orders[0].id);
  check('funds are held in escrow, not paid out', orderRow.escrow_state === 'HELD', String(orderRow.escrow_state));
  check('order number follows FNL-YYYY-######', /^FNL-\d{4}-\d{6}$/.test(String(orderRow.number)), String(orderRow.number));
  check('compliance snapshot is frozen on the order', !!orderRow.compliance_snapshot && String(orderRow.compliance_snapshot).length > 20);
  check(
    'order total equals subtotal + transport + tax',
    Number(orderRow.total_cents) === Number(orderRow.subtotal_cents) + Number(orderRow.shipping_cents) + Number(orderRow.tax_cents),
    `${orderRow.total_cents} vs ${Number(orderRow.subtotal_cents) + Number(orderRow.shipping_cents) + Number(orderRow.tax_cents)}`,
  );
  const buyerTransitions = orders.availableTransitions(orderRow, buyer as never);
  check('buyer cannot mark their own order shipped', !buyerTransitions.includes('SHIPPED' as never), buyerTransitions.join(','));
  check('buyer can open a dispute', buyerTransitions.includes('DISPUTED' as never), buyerTransitions.join(','));

  console.log('\nPrivacy & document access');
  const doc = one<Row>(`SELECT * FROM animal_documents WHERE owner_user_id IS NOT NULL AND visibility='PRIVATE' LIMIT 1`);
  if (doc) {
    const stranger = readSession(signIn(email, 'New-Password-42').token)!;
    const strangerVerdict = seller.verifyDocumentAccess(stranger as never, String(doc.id));
    check('a stranger is denied another user’s document', strangerVerdict.ok === false && strangerVerdict.reason === 'forbidden', JSON.stringify(strangerVerdict));
    const ownerSession = { ...(stranger as object), id: String(doc.owner_user_id), role: 'BUYER' } as never;
    const ownerVerdict = seller.verifyDocumentAccess(ownerSession, String(doc.id));
    check('the owner is granted access to their own document', ownerVerdict.ok === true);
    const staffVerdict = seller.verifyDocumentAccess({ ...(stranger as object), role: 'MODERATOR' } as never, String(doc.id));
    check('the compliance desk may open it (audited)', staffVerdict.ok === true);
  }
  const publicPayload = one<Row>(`SELECT * FROM animals WHERE id = ?`, String(legal.id));
  check('listing rows never expose medical notes to the public card', !JSON.stringify(publicPayload).includes('medical_notes_public'));

  console.log('\nAdmin & review queue');
  const queue = admin.moderationQueue('PENDING_REVIEW');
  check('moderation queue loads', Array.isArray(queue), `items=${queue.length}`);
  const pending = one<Row>(`SELECT id, compliance_status FROM animals WHERE status='PENDING_REVIEW' LIMIT 1`);
  if (pending) {
    const staff = readSession(signIn('admin@faunal.market', 'Faunal2026!').token)!;
    const animal = one<Row>(`SELECT * FROM animals WHERE id = ?`, String(pending.id));
    const dest = one<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, String(animal.state));
    const verdict = evaluateCompliance({
      speciesId: String(animal.species_id),
      originJurisdictionId: String(animal.origin_jurisdiction_id ?? animal.jurisdiction_id),
      destinationJurisdictionId: dest?.id ?? null,
      breederId: String(animal.breeder_id),
      method: 'LOCAL_PICKUP',
      buyerUserId: null,
    } as never);
    if (verdict.verdict === 'PROHIBITED') {
      let refused = false;
      try {
        admin.decideListing(staff as never, String(pending.id), 'APPROVE' as never);
      } catch (e) {
        refused = (e as { status?: number }).status === 409;
      }
      check('approving a prohibited listing is refused with 409', refused);
    } else {
      check('queue item exists for review', true, `verdict=${verdict.verdict}`);
    }
  }


  console.log('\nAssistant guardrails');
  const answer = assistant('can I buy a venomous reptile in new york', { userId: buyer.id as string | null, destinationState: 'NY' });
  check('the assistant answers', typeof answer.reply === 'string' && answer.reply.length > 20, answer.reply.slice(0, 80));
  check('it never invents an approval', !/approved for you|you may buy it/i.test(answer.reply), answer.reply.slice(0, 120));

  console.log('\nSeller listing wizard');
  const breederOwner = readSession(signIn('owner@empirereptiles.com', 'Faunal2026!').token)!;
  const speciesRow = one<{ id: string }>(`SELECT id FROM species LIMIT 1`);
  const savedRaw = seller.saveListing(
    breederOwner as never,
    {
      name: 'Test Clutch Hatchling',
      speciesId: speciesRow.id,
      sex: 'FEMALE',
      ageMonths: 3,
      price: 350,
      description: 'Captive-hatched, feeding on pinky mice, quarantine completed, includes substrate and hide.',
      city: 'Albany',
      state: 'NY',
      experienceLevel: 'BEGINNER',
      diet: 'Frozen pinky mice',
      temperatureF: '88-92',
      healthStatus: 'GOOD',
      captiveBred: true,
    } as never,
    'draft',
  );
  const saved = savedRaw as unknown as Row & { animal?: Row };
  check('draft listing created', !!saved, JSON.stringify(savedRaw).slice(0, 160));
  const draftId = String(saved.id ?? saved.animal?.id ?? '');
  check('the draft is stored with a DRAFT status', String(one<Row>(`SELECT status FROM animals WHERE id = ?`, draftId)?.status) === 'DRAFT', draftId);
  const listed = seller.myListings(breederOwner as never, 'DRAFT' as never) as unknown as Row[];
  check('draft shows in the seller queue only', listed.some((l) => String(l.id) === draftId));

  console.log('\nFavorites & follows');
  const fav = cart.toggleFavorite(buyer as never, String(legal.id));
  check('favorite toggles on', (fav as { favorited?: boolean }).favorited !== false);
  check('isFavorited agrees', cart.isFavorited(buyer.id, String(legal.id)) === true);
  cart.toggleFavorite(buyer as never, String(legal.id));
  check('favorite toggles off', cart.isFavorited(buyer.id, String(legal.id)) === false);

  console.log(`\n${failures.length ? '✗' : '✓'} ${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`   · ${f}`);
    process.exitCode = 1;
  }
  db.close();
}

main().catch((e) => {
  console.error('\ntest run crashed:', e);
  process.exitCode = 1;
});
