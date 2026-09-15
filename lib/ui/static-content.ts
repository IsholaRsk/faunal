/**
 * Policy and trust copy for the marketplace. Everything factual that a shopper
 * relies on (rules, fees, shipping, escrow) lives here, in one place, so the
 * screens and the enforcement code can never drift apart silently.
 */
export interface DocSection {
  heading: string;
  body: string;
}

export interface Doc {
  slug: string;
  kind: 'Trust & legality' | 'Legal' | 'Company';
  title: string;
  lede: string;
  updated: string;
  sections: DocSection[];
  /** Set when the page should read live rulebook numbers out of the database. */
  stats?: 'rulebook' | 'documents';
  related?: { href: string; label: string; blurb: string }[];
}

export const DOCS: Record<string, Doc> = {
  compliance: {
    slug: 'compliance',
    kind: 'Trust & legality',
    title: 'How legality is decided',
    lede: 'FAUNAL does not allow a purchase because a seller says it is fine. Every listing is evaluated against recorded law for the species, the origin, the destination and the transport route — before money moves.',
    updated: '2026-09-01',
    stats: 'rulebook',
    sections: [
      {
        heading: 'The seven inputs',
        body: `An evaluation reads exactly seven things, and it reads all of them every time:

1. **Species and morph** — matched to taxonomy in the rulebook, including CITES appendix status.
2. **Origin jurisdiction** — the state the animal was bred in.
3. **Destination jurisdiction** — the buyer's state and, where it exists, the city ordinance on top of it.
4. **Local restrictions** — possession bans, permit-only species, count limits, private-keeper exceptions.
5. **Seller status** — verification tier, licence on file, sanction history.
6. **Required documents** — health certificate, proof of captive origin, CITES paperwork where listed.
7. **Transport rules** — temperature floors and ceilings, maximum containment hours, banned carriers and methods for that species.

Change any input and the verdict is recomputed. That is why your cart re-prices the moment you switch states, and why a listing legal in Texas can be unbuyable in New York while still being visible.',`,
      },
      {
        heading: 'Five verdicts',
        body: `**ALLOWED** — legal to list and to buy for this destination with the documents on file.

**RESTRICTED** — legal with conditions: a permit, an enclosure standard, a count limit, or a specific transport method. Buyable, with the conditions shown to you before you pay.

**REQUIRES_DOCUMENTATION** — legal once the named documents are verified. The listing is visible, the checkout is held.

**REQUIRES_ADMIN_REVIEW** — the rulebook cannot answer confidently (new species, ambiguous ordinance, unreviewed state, sensitive taxon). A human moderator decides; nothing self-serves.

**PROHIBITED** — cannot be kept or transported there. The listing is dimmed, the buy button is disabled, and adding to cart returns HTTP 451.`,
      },
      {
        heading: 'Where the rule is enforced',
        body: `The same evaluation function runs at four choke points, so no surface can drift out of sync:

- listing publication (a prohibited pairing cannot go live),
- add-to-cart (451 with the blocking rule names attached),
- checkout (transport methods are filtered to the legal set for that route),
- the admin review queue (a moderator cannot approve a listing whose verdict is PROHIBITED — the API refuses with 409).

Sensitive taxa and CITES-listed species always land in **PENDING_REVIEW** at publication, even when the automated verdict is clean.`,
      },
      {
        heading: 'What we are not',
        body: `FAUNAL is not a law firm and this is not legal advice. The rulebook is our reading of published state and municipal regulations, refreshed on a documented schedule, with the citation stored next to every rule so you can check it. Where the law is ambiguous we default to the safe answer: no sale.`,
      },
    ],
    related: [
      { href: '/compliance/documents', label: 'Documentation standards', blurb: 'What each accepted document proves.' },
      { href: '/compliance/shipping', label: 'Shipping live animals', blurb: 'Carriers, temperature rules, handoffs.' },
      { href: '/compliance/protection', label: 'Buyer protection', blurb: 'Escrow, arrival window, disputes.' },
    ],
  },

  'compliance/documents': {
    slug: 'compliance/documents',
    kind: 'Trust & legality',
    title: 'Documentation standards',
    lede: 'Documents are the difference between a legal animal and a confiscated one. Each type is checked against a named standard before a listing or an order moves forward.',
    updated: '2026-09-01',
    stats: 'documents',
    sections: [
      {
        heading: 'What we accept, and why',
        body: `**Breeder licence** — the state wildlife permit or commercial licence that authorises keeping and selling the taxa in question. Number, issuing agency, expiry.

**Proof of captive origin** — clutch record, breeder declaration or parentage statement showing the animal was captive-bred, not collected from the wild. This is what keeps CITES-listed taxa lawful.

**Health certificate** — issued by a licensed veterinarian within the window the destination state requires (10 days for most interstate movements), naming the animal and the destination.

**CITES document** — for appendix-listed species, the permit or certificate covering that individual or clutch, plus the import statement where applicable.

**Transport manifest** — carrier, containment specification, temperature plan and handoff times, so the route can be audited.`,
      },
      {
        heading: 'How they are stored',
        body: `Files live in the private object store. A document row keeps the key, the hash and the review state — never a public URL. Access is authorised per request: the owner, the counterparty of an order that needs the document, and the compliance desk. Every read is written to the audit log with the viewer, the target and the timestamp, and served with \`Cache-Control: private, no-store\` so a browser or proxy never keeps a copy.

Nothing in a listing page, chat, API response or search payload ever contains a document path.`,
      },
      {
        heading: 'Expiry',
        body: `A verified document that expires stops supporting a listing on its expiry date: the affected listings are re-evaluated, move back to REQUIRES_DOCUMENTATION, and the seller is notified with a 14-day window. Buyers already in escrow are told before their order can be affected.`,
      },
    ],
    related: [
      { href: '/become-a-breeder', label: 'Apply as a breeder', blurb: 'What to have ready before you start.' },
      { href: '/compliance', label: 'How legality is decided', blurb: 'The seven inputs and five verdicts.' },
    ],
  },

  'compliance/shipping': {
    slug: 'compliance/shipping',
    kind: 'Trust & legality',
    title: 'Shipping live animals',
    lede: 'Transport is where most legal and welfare risk actually sits, so it is decided by rule rather than by preference — including which options you are allowed to choose at checkout.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'Four ways an animal moves',
        body: `**Local pickup** — buyer collects at the breeder's address. No carrier, so the shortest legal exposure; always offered when distance allows.

**Specialized shipping** — a live-animal courier or permitted air cargo service with temperature-managed crates and a documented handoff chain.

**Breeder delivery** — the breeder drives the animal themselves. Cheapest on welfare, slowest to schedule, common for regional pairs.

**International** — disabled on FAUNAL at launch. Import/export permitting, CITES paperwork and quarantine are handled by licensed specialists outside the marketplace.`,
      },
      {
        heading: 'Hard welfare limits',
        body: `- Crates are sized to the species with ventilation on at least two faces, absorbent substrate, and no food or water vessels that can spill in transit.
- **Temperature floors and ceilings** are set per taxon: reptiles and amphibians cannot be tendered when either origin or destination forecast falls outside their band; the booking is refused rather than "held for weather".
- Maximum containment hours are enforced per species group. A route that would exceed them is not offered as an option at checkout.
- A health certificate is mandatory wherever the destination state requires one — the order cannot be marked shipped without it.
- Day-of-week rules apply: no tendering a live animal to a carrier on a Thursday for a route with a weekend risk window.`,
      },
      {
        heading: 'Tracking and proof',
        body: `Every shipment is split into legs with a from/to, a scheduled time and a carrier. Each leg produces an event on the order timeline; the buyer confirms arrival, which is what releases escrow. If an animal arrives in a condition that differs from the pre-shipment photos, that confirmation window is the moment to open a dispute instead of releasing funds.`,
      },
    ],
    related: [
      { href: '/compliance/protection', label: 'Buyer protection', blurb: 'Escrow and the 48-hour arrival window.' },
      { href: '/compliance/documents', label: 'Documentation standards', blurb: 'The manifest and the certificate.' },
    ],
  },

  'compliance/protection': {
    slug: 'compliance/protection',
    kind: 'Trust & legality',
    title: 'Buyer protection & escrow',
    lede: 'Money moves on FAUNAL terms, not on the seller’s. Payment is captured, held, and released only when the animal has arrived as described.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'The hold',
        body: `When you pay, funds are captured to a FaunalPay hold, not sent to the breeder. The order keeps an \`escrow_state\` — HELD, RELEASED or RETURNED — and it is visible on the order screen at every step.

Releasing requires one of two things: your confirmation that the animal arrived in condition, or the expiry of the arrival window with no dispute filed.`,
      },
      {
        heading: 'The 48-hour window',
        body: `Once an order is marked DELIVERED you have 48 hours to inspect the animal against the pre-shipment photos and the health certificate. In that window you can:

- confirm arrival and release payment;
- open a dispute, which freezes the hold and routes the case to the compliance desk;
- message the breeder inside FAUNAL, which keeps the evidence on the record.

If you say nothing, the hold releases at the end of the window. Feeding, settling and photographing the animal takes minutes; doing it on day one protects both sides.`,
      },
      {
        heading: 'What we will not cover',
        body: `Buyer protection only exists for transactions that stay on the platform. If you pay a breeder by wire, cash app, gift card or an off-site link, there is no hold to release or return — and FAUNAL has no record to arbitrate from. Chat detection flags those requests, the seller's risk score goes up, and the notice stays attached to the conversation.

Normal husbandry outcomes — a animal that settles slowly, refuses a first feed, or is not the sex you hoped for within six months — are not defects. Pre-existing illness, misdescribed morph or paperwork that does not exist are.`,
      },
      {
        heading: 'Fees',
        body: `Buyers pay the animal, transport and applicable sales tax. The marketplace commission is charged to the seller, and the payout carries a flat release fee. Nothing about escrow is billed to you at checkout.`,
      },
    ],
    related: [
      { href: '/legal/terms', label: 'Terms of service', blurb: 'The contract in full.' },
      { href: '/compliance/shipping', label: 'Shipping live animals', blurb: 'What “delivered” means.' },
    ],
  },

  legal: {
    slug: 'legal',
    kind: 'Legal',
    title: 'Legal',
    lede: 'The agreements that govern FAUNAL accounts, listings and transactions.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'Documents',
        body: `Read the terms of service and the privacy notice. Both are written to be legible: what we collect, what we never collect, and what happens to a listing when the law changes underneath it.`,
      },
    ],
    related: [
      { href: '/legal/terms', label: 'Terms of service', blurb: 'Accounts, listings, fees, disputes.' },
      { href: '/legal/privacy', label: 'Privacy notice', blurb: 'Data, documents, retention.' },
    ],
  },

  'legal/terms': {
    slug: 'legal/terms',
    kind: 'Legal',
    title: 'Terms of service',
    lede: 'What you agree to when you list, buy or sell on FAUNAL.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'Who may use FAUNAL',
        body: `You must be 18 or older and legally able to keep the animals in question at your address. You must not use FAUNAL where local law forbids possession, sale or transport of a taxon — including federal restrictions such as the Lacey Act's prohibition on importing or shipping listed injurious species.`,
      },
      {
        heading: 'What a listing commits you to',
        body: `A seller warrants that the animal exists as described, was acquired and is held lawfully, that documents offered are genuine and current, that photographs depict the actual animal, and that transport will follow the method FAUNAL permits for that route. Listing an animal that cannot legally be sold to the destination is a breach even if no sale completes.`,
      },
      {
        heading: 'Fees',
        body: `Sellers pay a commission on completed sales that depends on their plan, plus a flat fee per escrow release. Featured placement and subscription tiers are billed monthly. Buyers pay item price, transport and tax. Fees are recomputed at checkout and shown before payment; nothing is charged later without an event on the order.`,
      },
      {
        heading: 'Suspension and takedown',
        body: `FAUNAL can suspend a listing, a seller or an account where a compliance verdict changes, a document is found invalid, an image is reported as stolen, or conduct puts animals or buyers at risk. Suspended sellers keep their payout obligations and their obligations under any escrow already opened.`,
      },
      {
        heading: 'No legal advice',
        body: `Rulebook content is our reading of published regulation, with citations, provided as a service. It is not legal advice, and a clean verdict does not immunise you from enforcement if facts you supplied were wrong.`,
      },
    ],
  },

  'legal/privacy': {
    slug: 'legal/privacy',
    kind: 'Legal',
    title: 'Privacy notice',
    lede: 'What FAUNAL keeps, who can see it, and for how long.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'What we collect',
        body: `Account details (name, email, phone, city and state, date of birth where you supply it), listings and media you upload, compliance documents, order and payment metadata, messages you send inside FAUNAL, and security signals (device, IP, session history) used to detect duplicate and fraudulent accounts.`,
      },
      {
        heading: 'What we never collect',
        body: `Card numbers and CVC codes never reach FAUNAL's database. The payment provider returns a token, a brand and the last four digits; that is all we store. We do not store government ID images beyond what a licence document requires, and we do not sell personal data.`,
      },
      {
        heading: 'Documents are the sensitive part',
        body: `Licences, permits and health certificates are stored in a private bucket with authorisation checked on every read. Only you, the counterparty of an order that needs the document, and our compliance desk can open a file. Every view is audited. Listings expose the fact that a document exists and its verification state — never the file, never its contents.`,
      },
      {
        heading: 'Retention',
        body: `Wildlife sale records, transport manifests and provenance documents are retained for the period wildlife authorities require (six years for interstate records in our launch setup), even if you close your account. Closing an account removes public listings, kills sessions and anonymises your profile; the compliance trail stays, because that is what makes the marketplace auditable.`,
      },
      {
        heading: 'Your controls',
        body: `From your account you can export your data, revoke individual sessions, turn two-factor on or off, change notification and locale settings, and close your account. Requests to correct or delete records that we are lawfully required to keep will be answered with the specific reason we cannot.`,
      },
    ],
  },

  about: {
    slug: 'about',
    kind: 'Company',
    title: 'About FAUNAL',
    lede: 'A marketplace built for people who keep exotic animals legally — and for the breeders whose paperwork proves it.',
    updated: '2026-09-01',
    sections: [
      {
        heading: 'Why it exists',
        body: `Private keepers and small, well-run breeders have been trading in comment sections and group chats: no provenance, no health records, no way to know whether the animal you are buying can be kept at your address. When a shipment gets seized, both sides lose the animal and the money.

FAUNAL puts the paperwork where the buying decision happens. The legality check is not a badge next to the listing; it is the gate that decides whether a buy button exists at all.`,
      },
      {
        heading: 'How we make money',
        body: `Commission on completed sales (charged to the seller), subscription plans that lower that commission and add tools, and paid featured placement. No advertising, no selling buyer data, no lead-generation for off-site brokers. Escrow release fees cover the cost of holding money and arbitrating the arrival window.`,
      },
      {
        heading: 'Where we are',
        body: `Launched in New York, operating across the states whose rulebooks we have read — and we deliberately do not open a state until its regulations, permits and transport rules are recorded and reviewed by a human. The catalogue is in English with USD settlement; a European rollout follows the same rulebook process.`,
      },
      {
        heading: 'The team',
        body: `A small team of keepers, breeders, a compliance counsel and engineers. Every listing that reaches REQUIRES_ADMIN_REVIEW is read by a person who knows the taxon, not a queue of interns.`,
      },
    ],
    related: [
      { href: '/become-a-breeder', label: 'Sell on FAUNAL', blurb: 'Verification takes about ten minutes.' },
      { href: '/compliance', label: 'How legality works', blurb: 'The engine behind the buy button.' },
    ],
  },
};
