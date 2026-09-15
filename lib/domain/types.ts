/**
 * FAUNAL domain types — shared by mobile + desktop surfaces (spec §48:
 * "la logique métier doit rester partagée").
 */

export type Role =
  | 'BUYER'
  | 'BREEDER'
  | 'PROFESSIONAL_BREEDER'
  | 'VERIFIED_BREEDER'
  | 'MODERATOR'
  | 'ADMIN';

export type ListingStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'SOLD'
  | 'ARCHIVED';

export type OrderStatus =
  | 'CART'
  | 'CHECKOUT'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'BREEDER_CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'READY_FOR_PICKUP'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'DISPUTED';

export type ComplianceVerdict =
  | 'ALLOWED'
  | 'RESTRICTED'
  | 'PROHIBITED'
  | 'REQUIRES_DOCUMENTATION'
  | 'REQUIRES_ADMIN_REVIEW';

export type ShippingMethod =
  | 'LOCAL_PICKUP'
  | 'SPECIALIZED_SHIPPING'
  | 'BREEDER_DELIVERY'
  | 'INTERNATIONAL';

export type Experience = 'mobile' | 'desktop';
export type Sex = 'MALE' | 'FEMALE' | 'UNKNOWN';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type Availability = 'AVAILABLE' | 'RESERVED' | 'SOLD_OUT' | 'PREORDER';
export type DocType =
  | 'PROOF_OF_ORIGIN'
  | 'HEALTH_CERTIFICATE'
  | 'PERMIT'
  | 'CITES'
  | 'BREEDER_LICENSE'
  | 'TRANSPORT_MANIFEST';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  currency: string;
  locale: string;
  jurisdictionCode: string | null;
  avatarPath: string | null;
  breederId?: string | null;
  breederTier?: string | null;
}

/** Result of the compliance engine for a (species, route, seller, docs) tuple. */
export interface ComplianceResult {
  verdict: ComplianceVerdict;
  canPublish: boolean;
  canBuy: boolean;
  needsAdminReview: boolean;
  requiredDocuments: DocType[];
  missingDocuments: DocType[];
  allowedMethods: ShippingMethod[];
  blockedMethods: { method: ShippingMethod; reason: string }[];
  rules: { id: string; table: string; label: string; detail: string; citation?: string }[];
  notes: string[];
  estimatedDocLeadDays: number;
}

export interface FilterState {
  q?: string;
  category?: string;
  species?: string;
  morph?: string;
  sex?: Sex;
  minAgeMonths?: number;
  maxAgeMonths?: number;
  minPrice?: number;
  maxPrice?: number;
  state?: string;
  experience?: Difficulty;
  size?: 'SMALL' | 'MEDIUM' | 'LARGE';
  verifiedOnly?: boolean;
  availableOnly?: boolean;
  captiveBredOnly?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
  page?: number;
}
