# FAUNAL

A premium US marketplace for **legally permitted** exotic-animal sales — built as a
working product, not a mockup. One backend, one account, two genuinely different
experiences: a desktop marketplace and a mobile app.

Launched in New York · market: United States · language: English · currency: USD.

```bash
npm install
npm run db:reset && npm run db:seed && npm run db:images   # ~2 min
npm run dev                                                # http://localhost:3000
npm run typecheck && npm test                              # 54 end-to-end checks
```

Demo accounts (password `Faunal2026!`, one-click on the sign-in screen):
`alex@example.com` (buyer with a saved cart) · `owner@empirereptiles.com` (verified
breeder, 8 listings) · `admin@faunal.market` (compliance desk, full console).

## What is actually wired

| Area | Reality |
| --- | --- |
| Catalogue | 44 seeded animals, 13 species, 53 morphs, real photos + 5 derivative sizes |
| Legality | `evaluateCompliance` per species/origin/destination/jurisdiction/seller/documents/transport → 5 verdicts, enforced at publish, cart (HTTP 451), checkout and admin decision (409) |
| Cart & checkout | Per-line transport choice limited to legal methods, split orders per breeder, escrow capture, tax and commission computed on the server |
| Orders | State machine `PAYMENT_PENDING → … → COMPLETED` with timeline, disputes, escrow HELD/RELEASED, reviews gated on completed orders |
| Sellers | Verification tiers, 8-step listing wizard, image + document upload, pause/resume/price edits, payouts view, plan switch |
| Admin | Listing review queue, breeder verification, document review, reports, fraud flags, user status, escrow overrides, **rulebook editor** (writes the rules the engine reads), analytics, audit log |
| Messaging | Real threads, read receipts, off-platform-payment detection with a safety notice, block, report |
| Account | Address book, tokenised cards (no PAN/CVC ever), private document vault with audited access, sessions, 2FA, notification prefs, currency/locale, soft-delete |
| Search & AI | Natural-language → filters on Browse/Search/Assistant; the assistant can narrow a search but never clear a prohibition |
| SEO & perf | Server-rendered results, per-page metadata, `sitemap.xml` + `robots.txt` generated from the database, pre-optimized images, no-client-waterfall first paint |

No dead buttons: every control calls the API, and every API route is in the
single typed table in [`lib/api/router.ts`](lib/api/router.ts).

## Two experiences, deliberately

* **Desktop** — white space, 1400px shell, horizontal header with mega panel,
  sidebar facets, 4-column grids, editorial detail page, multi-column checkout.
* **Mobile** — an app: splash, fixed 5-tab bottom nav (Home · Explore · Favorites ·
  Cart · Profile), bottom sheets, swipe gallery, accordions, sticky dual CTA
  (“Contact breeder” / “Buy now”), safe areas, 44px targets, minimalist SVG icons.

Same palette on both (`#F7F7F5` canvas, `#151515` ink, `#4F6B55` success …), same
data, same account. Toggle with the control in the header/footer or the
`faunal_fx` cookie. Layout lives in `components/desktop/**` and
`components/mobile/**`; logic is shared (`lib/ui/checkout-core.tsx`,
`components/shared/*`). Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Guardrails

Only legally authorized transactions. A listing that cannot be kept or transported
to a buyer’s address is not buyable there — visible for education, buy button
disabled, checkout blocked. Sensitive and CITES taxa always pass a human review.
Documents are private, access-checked and audited. Card data is never stored. The
AI layer can never override the rulebook, and an unreviewed state never defaults
to “allowed”.

## Layout

```
app/            routes (public, account, seller desk, admin console, api catch-all)
components/     ui/ · desktop/ · mobile/ · shared/ · shell/
lib/db/         schema.sql, SQLite handle, query kit
lib/domain/     compliance · commerce · shipping · fraud · ai · auth · rbac · notify · media
lib/repo/       all data access + state machines (catalog, cart, orders, account, seller, admin, messaging)
lib/api/        the typed mutation gateway
scripts/        db-reset · db-seed · build-images
tests/run.ts    end-to-end checks over the real modules
docs/           ARCHITECTURE.md · schema.postgres.sql
```

`npm test` copies the seeded database to a scratch file, then exercises money
formatting, NL search, compliance verdicts, auth + 2FA replay, rate limiting,
fees and tax, cart blocking (451), checkout, escrow state, order math, document
authorization, the moderation queue and the seller wizard.
