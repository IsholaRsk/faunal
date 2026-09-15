-- ============================================================================
-- FAUNAL — SQLite/Postgres-portable core schema (runtime migrations)
-- Money is always stored as INTEGER cents in the currency column (default USD).
-- All timestamps are ISO-8601 UTC TEXT (Postgres target uses TIMESTAMPTZ).
-- Target production infra (docs/ARCHITECTURE.md §4) is Postgres/Supabase:
-- see docs/schema.postgres.sql for the same model + RLS policies.
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity --
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'BUYER',     -- BUYER|BREEDER|PROFESSIONAL_BREEDER|VERIFIED_BREEDER|MODERATOR|ADMIN
  status            TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE|PENDING|SUSPENDED|BANNED|DELETED
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  phone             TEXT,
  date_of_birth     TEXT,
  avatar_path       TEXT,
  locale            TEXT NOT NULL DEFAULT 'en',        -- en|fr|es
  currency          TEXT NOT NULL DEFAULT 'USD',       -- USD|EUR|GBP|CAD
  jurisdiction_code TEXT,                              -- buyer residence state code, e.g. NY
  city              TEXT,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  tos_accepted_at   TEXT,
  age_confirmed_at  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio          TEXT,
  public_city  TEXT,
  public_state TEXT,
  member_since TEXT NOT NULL,
  show_favorites INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,          -- TWO_FACTOR|PASSWORD_RESET|EMAIL_VERIFY
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

-- ------------------------------------------------------------- catalog ----
CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  icon      TEXT,
  blurb     TEXT,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS species (
  id                     TEXT PRIMARY KEY,
  slug                   TEXT NOT NULL UNIQUE,
  common_name            TEXT NOT NULL,
  scientific_name        TEXT NOT NULL,
  category_id            TEXT NOT NULL REFERENCES categories(id),
  care_difficulty        TEXT NOT NULL,                 -- BEGINNER|INTERMEDIATE|ADVANCED|EXPERT
  expected_lifespan_years INTEGER NOT NULL,
  setup_cost_low_cents   INTEGER NOT NULL,
  setup_cost_high_cents  INTEGER NOT NULL,
  adult_length_cm        INTEGER NOT NULL,
  space_requirement      TEXT NOT NULL,                  -- COMPACT|STANDARD|LARGE|ENCLOSURE_ROOM
  diet_type              TEXT NOT NULL,                  -- INSECTIVORE|HERBIVORE|OMNIVORE|CARNIVORE|PELLET|FRESHwater...
  social_handling        TEXT NOT NULL,                  -- HIGH|MODERATE|OCCASIONAL|DISPLAY_ONLY
  cites_appendix         TEXT,                           -- NULL|II|I
  is_sensitive           INTEGER NOT NULL DEFAULT 0,     -- venomous / CITES / restricted → always admin review
  description            TEXT NOT NULL,
  legal_note             TEXT
);
CREATE INDEX IF NOT EXISTS idx_species_category ON species(category_id);

CREATE TABLE IF NOT EXISTS subspecies (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  species_id TEXT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
  name      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS morphs (
  id         TEXT PRIMARY KEY,
  species_id TEXT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  premium_multiplier INTEGER NOT NULL DEFAULT 100,   -- % of base price (market heuristic)
  UNIQUE (species_id, name)
);

-- ------------------------------------------------------------ legal -----
CREATE TABLE IF NOT EXISTS jurisdictions (
  id       TEXT PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,      -- US|NY| NYC | CA ...
  name     TEXT NOT NULL,
  level    TEXT NOT NULL,             -- COUNTRY|STATE|CITY
  country  TEXT NOT NULL DEFAULT 'US'
);

CREATE TABLE IF NOT EXISTS species_restrictions (
  id                  TEXT PRIMARY KEY,
  species_id          TEXT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
  jurisdiction_id     TEXT NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  status              TEXT NOT NULL,  -- ALLOWED|RESTRICTED|REQUIRES_DOCUMENTATION|REQUIRES_ADMIN_REVIEW|PROHIBITED
  reason              TEXT NOT NULL,
  citation            TEXT,
  permit_class        TEXT,
  max_specimens       INTEGER,
  requires_admin_review INTEGER NOT NULL DEFAULT 0,
  source              TEXT NOT NULL DEFAULT 'FAUNAL_RULEBOOK',  -- ADMIN|FAUNAL_RULEBOOK
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sr_species ON species_restrictions(species_id);
CREATE INDEX IF NOT EXISTS idx_sr_jur     ON species_restrictions(jurisdiction_id);

CREATE TABLE IF NOT EXISTS required_documents (
  id                TEXT PRIMARY KEY,
  species_id        TEXT REFERENCES species(id) ON DELETE CASCADE,   -- NULL = applies to all
  jurisdiction_id   TEXT REFERENCES jurisdictions(id) ON DELETE CASCADE, -- NULL = any
  doc_type          TEXT NOT NULL,   -- PROOF_OF_ORIGIN|HEALTH_CERTIFICATE|PERMIT|CITES|BREEDER_LICENSE|TRANSPORT_MANIFEST
  mandatory         INTEGER NOT NULL DEFAULT 1,
  stage             TEXT NOT NULL DEFAULT 'LISTING',  -- LISTING|CHECKOUT|TRANSPORT
  description       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_restrictions (
  id                 TEXT PRIMARY KEY,
  species_id         TEXT REFERENCES species(id) ON DELETE CASCADE,  -- NULL = all species
  origin_jurisdiction_id  TEXT REFERENCES jurisdictions(id),
  destination_jurisdiction_id TEXT REFERENCES jurisdictions(id),
  method             TEXT NOT NULL,   -- LOCAL_PICKUP|SPECIALIZED_SHIPPING|BREEDER_DELIVERY|INTERNATIONAL
  allowed            INTEGER NOT NULL,
  max_hours_in_transit INTEGER,
  min_temperature_f  INTEGER,
  requires_health_certificate INTEGER NOT NULL DEFAULT 0,
  note               TEXT
);

-- ----------------------------------------------------------- breeders -----
CREATE TABLE IF NOT EXISTS breeders (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL UNIQUE,
  business_name      TEXT NOT NULL,
  legal_name         TEXT,
  tier               TEXT NOT NULL DEFAULT 'BREEDER',   -- BREEDER|PROFESSIONAL_BREEDER|VERIFIED_BREEDER
  status             TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING|APPROVED|SUSPENDED|REJECTED
  license_number     TEXT,
  city               TEXT NOT NULL,
  state              TEXT NOT NULL,
  jurisdiction_id    TEXT NOT NULL REFERENCES jurisdictions(id),
  bio                TEXT,
  years_active       INTEGER NOT NULL DEFAULT 1,
  rating_avg         REAL NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  transactions_count INTEGER NOT NULL DEFAULT 0,
  response_hours      INTEGER NOT NULL DEFAULT 24,
  storefront_plan     TEXT NOT NULL DEFAULT 'FREE',     -- FREE|PRO|PREMIUM
  featured_until      TEXT,
  logo_path           TEXT,
  founded_year        INTEGER,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_breeders_status ON breeders(status);

CREATE TABLE IF NOT EXISTS breeder_verifications (
  id            TEXT PRIMARY KEY,
  breeder_id    TEXT NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
  requested_tier TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING|APPROVED|REJECTED
  documents     TEXT NOT NULL DEFAULT '[]',        -- JSON array of {doc_type, document_id, note}
  submitted_at  TEXT NOT NULL,
  reviewed_at   TEXT,
  reviewer_id   TEXT REFERENCES users(id),
  notes         TEXT
);

-- ----------------------------------------------------------- animals ------
CREATE TABLE IF NOT EXISTS animals (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  breeder_id         TEXT NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
  category_id        TEXT NOT NULL REFERENCES categories(id),
  species_id         TEXT NOT NULL REFERENCES species(id),
  subspecies_id      TEXT REFERENCES subspecies(id),
  morph_id           TEXT REFERENCES morphs(id),
  name               TEXT NOT NULL,
  sex                TEXT NOT NULL,                  -- MALE|FEMALE|UNKNOWN
  age_months         INTEGER NOT NULL,
  date_of_birth      TEXT,
  length_cm          INTEGER,
  weight_g           INTEGER,
  color              TEXT,
  temperament        TEXT,
  experience_level   TEXT NOT NULL,                  -- BEGINNER|INTERMEDIATE|ADVANCED|EXPERT
  origin_jurisdiction_id TEXT NOT NULL REFERENCES jurisdictions(id),
  captive_bred       INTEGER NOT NULL DEFAULT 1,
  availability       TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE|RESERVED|SOLD_OUT|PREORDER
  status             TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT|PENDING_REVIEW|APPROVED|REJECTED|SUSPENDED|SOLD|ARCHIVED
  price_cents        INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  deposit_cents      INTEGER NOT NULL DEFAULT 0,
  city               TEXT NOT NULL,
  state              TEXT NOT NULL,
  jurisdiction_id    TEXT NOT NULL REFERENCES jurisdictions(id),
  is_purchasable     INTEGER NOT NULL DEFAULT 1,
  is_featured        INTEGER NOT NULL DEFAULT 0,
  featured_until     TEXT,
  listing_plan       TEXT NOT NULL DEFAULT 'FREE',   -- FREE|FEATURED|PREMIUM
  description        TEXT NOT NULL,
  -- health (spec §29). medical_notes is *restricted*: never returned to non-owners.
  health_status      TEXT NOT NULL DEFAULT 'CLEAR',  -- CLEAR|UNDER_TREATMENT|QUARANTINE|RECOVERING
  last_health_check  TEXT,
  vaccinations       TEXT NOT NULL DEFAULT '[]',
  treatments         TEXT NOT NULL DEFAULT '[]',
  feeding_schedule   TEXT,
  diet               TEXT,
  habitat            TEXT,
  temperature_f      TEXT,
  humidity_pct       TEXT,
  enclosure_min_cm   INTEGER,
  medical_notes      TEXT,                            -- sensitive (owner + admin only)
  compliance_status  TEXT NOT NULL DEFAULT 'PENDING',
  compliance_notes   TEXT NOT NULL DEFAULT '[]',
  view_count         INTEGER NOT NULL DEFAULT 0,
  publish_lock_reason TEXT,
  submitted_at       TEXT,
  published_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_animals_status   ON animals(status, availability);
CREATE INDEX IF NOT EXISTS idx_animals_species  ON animals(species_id);
CREATE INDEX IF NOT EXISTS idx_animals_breeder  ON animals(breeder_id);
CREATE INDEX IF NOT EXISTS idx_animals_price    ON animals(price_cents);
CREATE INDEX IF NOT EXISTS idx_animals_category ON animals(category_id);

CREATE TABLE IF NOT EXISTS animal_images (
  id         TEXT PRIMARY KEY,
  animal_id  TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  base_path  TEXT NOT NULL,          -- /img/raw/x.jpg
  path_large TEXT NOT NULL,
  path_medium TEXT NOT NULL,
  path_small  TEXT NOT NULL,
  path_thumb  TEXT NOT NULL,
  avif_path  TEXT,
  webp_path  TEXT,
  width      INTEGER NOT NULL DEFAULT 1200,
  height     INTEGER NOT NULL DEFAULT 1200,
  alt        TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  phash      TEXT,                    -- perceptual hash → stolen-image detection
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_animal ON animal_images(animal_id);
CREATE INDEX IF NOT EXISTS idx_images_phash  ON animal_images(phash);

CREATE TABLE IF NOT EXISTS animal_videos (
  id          TEXT PRIMARY KEY,
  animal_id   TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  poster_path TEXT,
  duration_s  INTEGER,
  codec       TEXT NOT NULL DEFAULT 'h264',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS animal_documents (
  id           TEXT PRIMARY KEY,
  animal_id    TEXT REFERENCES animals(id) ON DELETE CASCADE,
  breeder_id   TEXT REFERENCES breeders(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL,      -- PROOF_OF_ORIGIN|HEALTH_CERTIFICATE|PERMIT|CITES|BREEDER_LICENSE|TRANSPORT_MANIFEST
  storage_bucket TEXT NOT NULL DEFAULT 'documents',   -- PRIVATE bucket, signed access only
  storage_path TEXT NOT NULL,
  filename     TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING|VERIFIED|REJECTED|EXPIRED
  expires_at   TEXT,
  visibility   TEXT NOT NULL DEFAULT 'PRIVATE',       -- PRIVATE|ORDER_PARTICIPANTS|PUBLIC_BADGE
  uploaded_at  TEXT NOT NULL,
  reviewed_at  TEXT,
  reviewer_id  TEXT REFERENCES users(id),
  review_note  TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_animal ON animal_documents(animal_id);

-- -------------------------------------------------------------- faves -----
CREATE TABLE IF NOT EXISTS favorites (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  notify_on_price_drop INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, animal_id)
);

CREATE TABLE IF NOT EXISTS followed_breeders (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  breeder_id TEXT NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
  notify_on_new_listing INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, breeder_id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

-- --------------------------------------------------------------- cart -----
CREATE TABLE IF NOT EXISTS cart_items (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  animal_id      TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL DEFAULT 1,
  shipping_method TEXT NOT NULL DEFAULT 'SPECIALIZED_SHIPPING',
  added_at       TEXT NOT NULL,
  UNIQUE (user_id, animal_id)
);

-- ------------------------------------------------------------ commerce ----
CREATE TABLE IF NOT EXISTS addresses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'Home',
  recipient  TEXT NOT NULL,
  line1      TEXT NOT NULL,
  line2      TEXT,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  zip        TEXT NOT NULL,
  country    TEXT NOT NULL DEFAULT 'US',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL DEFAULT 'faunal-pay',
  brand        TEXT NOT NULL,          -- VISA|MASTERCARD|ACH|APPLE_PAY
  last4        TEXT NOT NULL,          -- PAN is never stored, only last4 + token
  token        TEXT NOT NULL,
  expiry_month INTEGER,
  expiry_year  INTEGER,
  billing_address TEXT,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,      -- FNL-2026-000123
  buyer_id          TEXT NOT NULL REFERENCES users(id),
  breeder_id        TEXT NOT NULL REFERENCES breeders(id),
  status            TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
  -- PAYMENT_PENDING|PAID|BREEDER_CONFIRMED|PREPARING|SHIPPED|READY_FOR_PICKUP|DELIVERED|COMPLETED|CANCELLED|REFUNDED|DISPUTED
  fulfillment       TEXT NOT NULL,             -- SHIPPING|PICKUP|BREEDER_DELIVERY
  subtotal_cents    INTEGER NOT NULL,
  shipping_cents    INTEGER NOT NULL DEFAULT 0,
  tax_cents         INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  address_snapshot  TEXT,                       -- JSON
  contact_snapshot  TEXT,                       -- JSON
  compliance_snapshot TEXT,                     -- JSON — the verdict evaluated at checkout
  destination_jurisdiction_id TEXT REFERENCES jurisdictions(id),
  origin_jurisdiction_id TEXT REFERENCES jurisdictions(id),
  estimated_delivery TEXT,
  handoff_window    TEXT,
  escrow_state      TEXT NOT NULL DEFAULT 'HELD',   -- HELD|RELEASED|REFUNDED|DISPUTED
  buyer_note        TEXT,
  placed_at         TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer   ON orders(buyer_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_breeder ON orders(breeder_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  animal_id  TEXT NOT NULL REFERENCES animals(id),
  quantity   INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  snapshot   TEXT NOT NULL      -- JSON listing snapshot at purchase time
);

CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'faunal-pay',
  provider_intent   TEXT NOT NULL,
  method            TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  fee_cents         INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
  -- REQUIRES_CONFIRMATION|AUTHORIZED|PAID|FAILED|EXPIRED
  escrow_account    TEXT NOT NULL DEFAULT 'platform_escrow',
  captured_at       TEXT,
  created_at        TEXT NOT NULL,
  idempotency_key   TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS refunds (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id   TEXT NOT NULL REFERENCES payments(id),
  amount_cents INTEGER NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING|ISSUED|DECLINED
  created_at   TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS payouts (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  breeder_id  TEXT NOT NULL REFERENCES breeders(id),
  gross_cents INTEGER NOT NULL,
  fee_cents   INTEGER NOT NULL,
  net_cents   INTEGER NOT NULL,
  method      TEXT NOT NULL DEFAULT 'ACH',
  status      TEXT NOT NULL DEFAULT 'HELD',       -- HELD|SCHEDULED|PAID|FAILED
  release_at  TEXT,
  released_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipping (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method          TEXT NOT NULL,
  carrier         TEXT,
  service         TEXT,
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  eta_days        INTEGER,
  tracking_number TEXT,
  tracking_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'QUOTED',   -- QUOTED|BOOKED|LABEL_CREATED|IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED|PICKUP_READY|COLLECTED
  legs            TEXT NOT NULL DEFAULT '[]',       -- JSON
  temp_controlled INTEGER NOT NULL DEFAULT 0,
  health_cert_required INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  label      TEXT NOT NULL,
  note       TEXT,
  actor_id   TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events ON order_events(order_id, created_at);

-- ----------------------------------------------------------- messaging ----
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  buyer_id    TEXT NOT NULL REFERENCES users(id),
  seller_user_id TEXT NOT NULL REFERENCES users(id),
  animal_id   TEXT REFERENCES animals(id) ON DELETE SET NULL,
  order_id    TEXT REFERENCES orders(id) ON DELETE SET NULL,
  subject     TEXT,
  last_message_at TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_buyer ON conversations(buyer_id, last_message_at);
CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_user_id, last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  image_path      TEXT,
  attachment_doc_id TEXT,
  flags           TEXT NOT NULL DEFAULT '[]',    -- JSON: detected risk signals
  risk_level      TEXT NOT NULL DEFAULT 'NONE',  -- NONE|LOW|HIGH
  read_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- -------------------------------------------------------------- reviews ---
CREATE TABLE IF NOT EXISTS reviews (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  breeder_id        TEXT NOT NULL REFERENCES breeders(id),
  animal_id         TEXT REFERENCES animals(id) ON DELETE SET NULL,
  author_id         TEXT NOT NULL REFERENCES users(id),
  overall           INTEGER NOT NULL,
  communication     INTEGER NOT NULL,
  listing_accuracy  INTEGER NOT NULL,
  animal_condition  INTEGER NOT NULL,
  shipping          INTEGER NOT NULL,
  experience        INTEGER NOT NULL,
  comment           TEXT,
  reply             TEXT,
  replied_at        TEXT,
  status            TEXT NOT NULL DEFAULT 'PUBLISHED',  -- PUBLISHED|HIDDEN|UNDER_REVIEW
  created_at        TEXT NOT NULL,
  UNIQUE (order_id, author_id)
);

-- ---------------------------------------------------------- engagement ---
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- ORDER_UPDATE|PAYMENT|MESSAGE|FAVORITE_UPDATE|PRICE_DROP|LISTING_AVAILABLE|BREEDER_VERIFICATION|SYSTEM|COMPLIANCE|FRAUD
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  href       TEXT,
  data       TEXT NOT NULL DEFAULT '{}',
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS searches (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  filters    TEXT NOT NULL DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,     -- VIEW_ANIMAL|CLICK_BREEDER|FAVORITE|ADD_TO_CART|SEARCH
  entity_id  TEXT,
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON user_events(user_id, created_at);

-- --------------------------------------------------- trust & safety -------
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id),
  target_type  TEXT NOT NULL,      -- ANIMAL|BREEDER|USER|MESSAGE|LISTING_IMAGE
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,      -- SCAM|ILLEGAL_SPECIES|STOLEN_IMAGES|MISLEADING_LISTING|OFF_PLATFORM_PAYMENT|ABUSE|OTHER
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN|UNDER_REVIEW|RESOLVED|DISMISSED
  resolution   TEXT,
  created_at   TEXT NOT NULL,
  reviewed_at  TEXT,
  reviewer_id  TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,   -- DUPLICATE_IMAGE|DUPLICATE_LISTING|SUSPICIOUS_PRICING|SUSPICIOUS_ACCOUNT|MULTI_ACCOUNT|OFF_PLATFORM_PAYMENT|BEHAVIOR_ANOMALY
  severity    TEXT NOT NULL,   -- LOW|MEDIUM|HIGH
  score       REAL NOT NULL DEFAULT 0,
  entity_type TEXT NOT NULL,   -- ANIMAL|BREEDER|USER|MESSAGE
  entity_id   TEXT NOT NULL,
  signals     TEXT NOT NULL DEFAULT '[]',   -- JSON evidence
  status      TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|REVIEWING|CLEARED|ACTIONED
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_fraud_status ON fraud_flags(status, severity);

CREATE TABLE IF NOT EXISTS compliance_checks (
  id                TEXT PRIMARY KEY,
  entity_type       TEXT NOT NULL,     -- ANIMAL|ORDER|CART|MESSAGE
  entity_id         TEXT NOT NULL,
  species_id        TEXT NOT NULL REFERENCES species(id),
  origin_jurisdiction_id  TEXT REFERENCES jurisdictions(id),
  destination_jurisdiction_id TEXT REFERENCES jurisdictions(id),
  result            TEXT NOT NULL,     -- ALLOWED|RESTRICTED|REQUIRES_DOCUMENTATION|REQUIRES_ADMIN_REVIEW|PROHIBITED
  matched_rules     TEXT NOT NULL DEFAULT '[]',   -- JSON
  required_documents TEXT NOT NULL DEFAULT '[]',
  allowed_methods   TEXT NOT NULL DEFAULT '[]',
  evaluated_at      TEXT NOT NULL,
  reviewer_id       TEXT REFERENCES users(id),
  decision          TEXT,              -- APPROVED|REJECTED|NULL
  decision_note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cc_entity ON compliance_checks(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id),
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  ip          TEXT,
  surface     TEXT NOT NULL DEFAULT 'web',   -- web|mobile|api|admin|system
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ------------------------------------------------------------ business ----
CREATE TABLE IF NOT EXISTS fee_rules (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,     -- COMMISSION|SUBSCRIPTION|FEATURED|SHIPPING_SERVICE|PAYOUT
  plan         TEXT NOT NULL DEFAULT 'FREE',
  rate_bps     INTEGER NOT NULL DEFAULT 0,     -- basis points of order subtotal
  flat_cents   INTEGER NOT NULL DEFAULT 0,
  min_cents    INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  label        TEXT NOT NULL,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id           TEXT PRIMARY KEY,
  breeder_id   TEXT NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL,      -- FREE|PRO|PREMIUM
  price_cents_month INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at   TEXT NOT NULL,
  renews_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guides (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  excerpt     TEXT NOT NULL,
  body        TEXT NOT NULL,      -- markdown-ish blocks, rendered by lib/ui/markdown.ts
  species_id  TEXT REFERENCES species(id),
  category_slug TEXT,
  difficulty  TEXT NOT NULL,
  reading_minutes INTEGER NOT NULL DEFAULT 6,
  cover_path  TEXT,
  author_name TEXT NOT NULL DEFAULT 'FAUNAL Care Desk',
  tags        TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ------------------------------------------------------------- views ------
CREATE VIEW IF NOT EXISTS v_animal_cards AS
SELECT a.id, a.slug, a.name, a.sex, a.age_months, a.price_cents, a.currency,
       a.availability, a.status, a.city, a.state, a.experience_level, a.is_featured,
       a.species_id, a.category_id, a.breeder_id, a.compliance_status,
       a.published_at, a.view_count, a.created_at,
       s.common_name AS species_name, s.scientific_name, s.care_difficulty,
       m.name AS morph_name,
       b.business_name, b.slug AS breeder_slug, b.tier AS breeder_tier,
       b.rating_avg, b.city AS breeder_city, b.state AS breeder_state,
       img.path_medium AS image_medium, img.path_small AS image_small, img.alt AS image_alt
FROM animals a
JOIN species s   ON s.id = a.species_id
JOIN breeders b  ON b.id = a.breeder_id
LEFT JOIN morphs m ON m.id = a.morph_id
LEFT JOIN (
  SELECT animal_id, path_medium, path_small, alt,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY position) AS rn
  FROM animal_images
) img ON img.animal_id = a.id AND img.rn = 1;
