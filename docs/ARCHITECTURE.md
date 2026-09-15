# FAUNAL architecture

Next.js 14 (App Router) + React 18 + TypeScript + Tailwind, one backend, two
front-end experiences (desktop marketplace, mobile app).

## 1. Layers

```
app/**            routes; server components read the repo layer directly
components/ui/**  shared primitives (both surfaces)
components/desktop/**, components/mobile/**   surface-specific layout only
components/shared/**  state machines shared by both surfaces (explore, checkout, auth)
lib/api/router.ts  the single typed mutation gateway (POST/PATCH/DELETE)
app/api/[...path]  one catch-all route → router table
lib/repo/**        all data access, authorization, state machines
lib/domain/**      pure business rules: compliance, fees, shipping, fraud, ai, auth, rbac
lib/db/**          SQLite handle + schema + query kit
scripts/**         db-reset, db-seed, build-images
tests/run.ts       end-to-end checks against the real modules (npm test)
```

Rule the codebase keeps: **a screen never contains business logic.** Legality,
fees, state transitions and permissions are computed in `lib/domain` +
`lib/repo`, so the desktop page, the mobile screen and the API can never
disagree.

## 2. Two experiences, one product

`app/layout.tsx` reads the `faunal_fx` cookie (plus UA sniffing) and hands the
choice to `ExperienceProvider`. Every page renders `DesktopX` or `MobileX`.
The toggle (`POST experience`) is available in both shells so the difference can
be inspected on any viewport. Mobile gets its own navigation tree (5-tab bottom
nav), sheets, swipe galleries, sticky dual CTAs and safe-area padding; desktop
gets a wide header, sidebar facets, 4-column grids and a multi-column checkout.
Neither is a reflow of the other — they are separate components over shared
state hooks (`components/shared/search-state.ts`, `lib/ui/checkout-core.tsx`,
`components/shared/auth-form.ts`).

## 3. Mutations

Every write goes through the router table in `lib/api/router.ts`
(`'POST cart'`, `'PATCH cart/:id'`, `'POST checkout'`, `'POST admin/rules'`, …)
reached by `app/api/[...path]/route.ts`. The dispatcher resolves the session,
applies RBAC, rate-limits sensitive routes, and returns typed errors
(`{error:{message,code}}` with real HTTP statuses: 401/403/404/409/429/451).
Client components call `post/patch/del` from `lib/ui/api.ts` and then
`router.refresh()`, so the UI always reflects the server-computed state.

## 4. Database

SQLite via `better-sqlite3` (WAL, foreign keys ON, `busy_timeout`), schema in
`lib/db/schema.sql`: 45 tables, view `v_animal_cards` for card reads, plus the
`compliance_checks`, `audit_logs`, `fraud_flags`, `escrow/payout` tables the
trust model needs. `lib/db/kit.ts` provides `insert/update/all/get/first/parse`
and `tx()` wraps transactions.

Money is integer cents everywhere (`*_cents`), formatted only at the edge by
`lib/ui/animal-view.ts#money` — whole dollars print `$450`, fractional print
`$2,499.99`.

Postgres/Supabase is the production target: the relational model maps
one-to-one (`docs/schema.postgres.sql` records the mapping, RLS policies replace
the repo-level RBAC checks, and `lib/repo/*` stays the only data access layer,
so the driver swap is one file). Supabase Storage replaces the local private
bucket for documents.

## 5. Auth & sessions

`scrypt` password hashing, opaque session tokens stored hashed
(`sessions.token_hash`), httpOnly cookie `faunal_session`, 30-day expiry,
per-session user-agent/IP capture, `POST account/sessions/revoke`, remote
logout on password change and on suspension. Optional two-factor: a six-digit
code issued through `auth_challenges` at sign-in (`verifyLogin` →
`beginLoginChallenge` → `completeLoginWithCode`); a used or expired code is
rejected. Password reset uses the same challenge table and never reveals
whether an address exists. There is no mail transport in this environment, so
codes are returned to the caller in non-production only (that is the stub the
queued mailer replaces in production).

## 6. Compliance engine (the heart)

`lib/domain/compliance.ts#evaluateCompliance(subject)` reads nine inputs —
species/morph, origin jurisdiction, destination jurisdiction (state plus city
ordinance), local restriction rows, seller tier and status, verified documents
(animal-level **and** the breeder's account-level paperwork), transport
restrictions, price plausibility and buyer account state — and returns
`ALLOWED | RESTRICTED | REQUIRES_DOCUMENTATION | REQUIRES_ADMIN_REVIEW |
PROHIBITED` with `canPublish`, `canBuy`, `allowedMethods`, `blockedMethods`
(each blocked method carries a reason), `requiredDocuments`,
`missingDocuments`, the matched `rules` with citations, doc lead time and
human-readable notes.

It runs at four choke points: listing submit, add-to-cart, checkout (which
methods are offered and priced) and the admin decision (approving a listing
whose verdict is PROHIBITED is refused with 409). Sensitive and CITES taxa are
forced to `PENDING_REVIEW` at publish. A destination whose rulebook has not
been reviewed yields no self-service verdict: `REQUIRES_ADMIN_REVIEW` and
`canBuy = false` — the marketplace never defaults to "allowed" where it has
not read the law.

`animals.compliance_status` is a cache of that verdict; `npm run db:seed`
re-evaluates every listing after paperwork is loaded, and the same routine can
be re-run after a rulebook edit so badges never go stale.

## 7. Documents, media

`lib/domain/media.ts` writes uploads outside the web root (`data/private`, or
`FAUNAL_PRIVATE_DIR`; `/tmp` on read-only serverless filesystems) with hashed
names, MIME/size validation and image derivative generation through `sharp`
(thumb → 5 sizes, AVIF/WebP in `public/img/derived`). A document is only ever
read through `GET documents/:id`, which calls `seller.verifyDocumentAccess`
(owner, order participant, or staff), writes a `DOCUMENT_VIEW` audit entry and
answers with `Cache-Control: private, no-store`. Listing payloads strip
`storage_path`, and non-owners never receive `medical_notes`.

## 8. Payments, escrow, shipping

`lib/domain/commerce.ts` defines a `PaymentProvider` interface
(`createIntent → confirm → capture → releaseEscrow/refund`) with a local
`FaunalPayProvider` that persists token + brand + last4 only — card numbers and
CVC never reach the database. Checkout captures into `platform_escrow`
(`payments.status = PAID`, `orders.escrow_state = HELD`); arrival confirmation
releases the payout (`payouts`, minus the plan's payout fee), a dispute freezes
it. `lib/domain/shipping.ts` quotes routes and rejects any method the species
or temperature window forbids; `computeFees` returns the buyer total
(subtotal + transport + tax) and the seller-side commission separately, so the
buyer never pays the marketplace fee.

## 9. Serverless notes

The demo deploys to a Next.js host with a read-only filesystem:
`lib/db/index.ts` copies the committed seeded database to `/tmp` on cold start
and `next.config.mjs` traces `data/faunal.db` + `lib/db/schema.sql` into the
bundle (`outputFileTracingIncludes`). Writes are therefore per-instance, which
is correct for a demo and is exactly where the Postgres target takes over for
shared state.

## 10. Anti-fraud, AI, i18n

`lib/domain/fraud.ts` raises `fraud_flags` for duplicate images (pHash
comparison over the actual stored bytes), stolen/foreign images, suspicious
pricing versus species medians, multi-account signals (device + IP overlap) and
off-platform payment requests found in messages; chat keeps the notice attached
to the thread. `lib/domain/ai.ts` provides `parseQuery` (natural language →
`FilterState`) and `assistant` (grounded answers + guidance + a compliance note
that always defers to the engine — it can narrow a search, never clear a
prohibition). `lib/ui/i18n.ts` ships EN with FR/ES string tables and USD default
with EUR/GBP/CAD display conversion, while prices stay priced in USD.
