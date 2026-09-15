import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  beginLoginChallenge,
  changePassword,
  completeLoginWithCode,
  createSession,
  destroySession,
  EXPERIENCE_COOKIE,
  readSession,
  signIn,
  signUp,
  SESSION_COOKIE,
  beginPasswordReset,
  completePasswordReset,
  verifyLogin,
} from '@/domain/auth';
import { HttpError, audit, rateLimit } from '@/domain/rbac';
import { id, nowIso } from '@/domain/util';
import * as catalog from '@/repo/catalog';
import * as cart from '@/repo/cart';
import * as orders from '@/repo/orders';
import * as messaging from '@/repo/messaging';
import * as seller from '@/repo/seller';
import * as admin from '@/repo/admin';
import * as account from '@/repo/account';
import { assistant, parseQuery, recommend } from '@/domain/ai';
import { openReport, checkMultiAccount } from '@/domain/fraud';
import { list as listNotifications, markRead, unreadCount } from '@/domain/notify';
import { verifyDocToken, privatePathFor } from '@/domain/media';
import { subscriptionPrice } from '@/domain/commerce';
import { getDb } from '@/db';
import { insert } from '@/db/kit';
import type { FilterState, OrderStatus, Role, SessionUser, ShippingMethod, ListingStatus } from '@/domain/types';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * API gateway.
 *
 * A single typed route table (instead of ~40 near-identical route.ts files)
 * keeps auth, RBAC, rate limiting, session-scoped row checks and audit logging
 * in one place — one choke point, one set of guarantees. Handlers are plain
 * functions so the test harness in tests/run.ts can drive them directly.
 */

export interface Ctx {
  req: NextRequest;
  user: SessionUser | null;
  body: Record<string, unknown>;
  params: Record<string, string>;
  url: URL;
  surface: 'mobile' | 'desktop';
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

const ROUTES: Record<string, Handler> = {
  /* ------------------------------------------------------------------ auth */
  'POST auth/signup': async (ctx) => {
    const rl = rateLimit(`signup:${ip(ctx.req)}`, 5, 60_000);
    if (!rl.ok) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
    let token = '';
    let userId = '';
    try {
      const signed = signUp({
      email: str(ctx.body.email),
      password: str(ctx.body.password),
      firstName: str(ctx.body.firstName),
      lastName: str(ctx.body.lastName),
      role: (ctx.body.role as Role) || 'BUYER',
      jurisdictionCode: ctx.body.state ? String(ctx.body.state).toUpperCase() : null,
      city: ctx.body.city ? str(ctx.body.city) : null,
      phone: ctx.body.phone ? str(ctx.body.phone) : null,
        dateOfBirth: ctx.body.dateOfBirth ? str(ctx.body.dateOfBirth) : null,
      });
      token = signed.token;
      userId = signed.userId;
    } catch (e) {
      throw new HttpError(400, (e as Error).message, 'SIGNUP_INVALID');
    }
    audit(
      { id: userId, role: 'BUYER', email: str(ctx.body.email), firstName: '', lastName: '', currency: 'USD', locale: 'en', jurisdictionCode: null, avatarPath: null },
      'AUTH_SIGNUP',
      'USER',
      userId,
      {},
      ctx.surface,
    );
    checkMultiAccount(userId, `${ua(ctx.req)}|${ip(ctx.req)}`);
    return authResponse({ ok: true, userId, user: readSession(token) }, token);
  },

  'POST auth/login': async (ctx) => {
    const rl = rateLimit(`login:${ip(ctx.req)}`, 10, 60_000);
    if (!rl.ok) throw new HttpError(429, 'Too many sign-in attempts. Wait a minute.');
    let token = '';
    let session: SessionUser | null = null;
    try {
      const check = verifyLogin(str(ctx.body.email), str(ctx.body.password));
      if (check.twoFactor) {
        const code = beginLoginChallenge(check.userId);
        return NextResponse.json({
          twoFactorRequired: true,
          message: 'A six-digit code was sent to the email on this account.',
          devCode: process.env.NODE_ENV !== 'production' ? code : undefined,
        });
      }
      token = createSession(check.userId, ua(ctx.req));
      session = readSession(token);
    } catch (e) {
      throw new HttpError(401, (e as Error).message, 'BAD_CREDENTIALS');
    }
    audit(session, 'AUTH_LOGIN', 'USER', session!.id, {}, ctx.surface);
    return authResponse({ ok: true, user: session }, token);
  },

  'POST auth/2fa/complete': (ctx) => {
    const rl = rateLimit(`2fa:${ip(ctx.req)}`, 8, 60_000);
    if (!rl.ok) throw new HttpError(429, 'Too many code attempts. Wait a minute.');
    let token = '';
    try {
      const signed = completeLoginWithCode(str(ctx.body.email), str(ctx.body.code), ua(ctx.req));
      token = signed.token;
    } catch (e) {
      throw new HttpError(401, (e as Error).message, 'BAD_CODE');
    }
    const session = readSession(token);
    audit(session, 'AUTH_LOGIN_2FA', 'USER', session!.id, {}, ctx.surface);
    return authResponse({ ok: true, user: session }, token);
  },

  'POST auth/reset/request': (ctx) => {
    const rl = rateLimit(`reset:${ip(ctx.req)}`, 4, 300_000);
    if (!rl.ok) throw new HttpError(429, 'Too many reset requests. Try again shortly.');
    const res = beginPasswordReset(str(ctx.body.email));
    return {
      ok: true,
      message: 'If that address has a FAUNAL account, a six-digit reset code is on its way.',
      devCode: process.env.NODE_ENV !== 'production' ? res.code : undefined,
    };
  },
  'POST auth/reset/confirm': (ctx) => {
    const rl = rateLimit(`reset-confirm:${ip(ctx.req)}`, 8, 300_000);
    if (!rl.ok) throw new HttpError(429, 'Too many attempts. Try again shortly.');
    try {
      completePasswordReset(str(ctx.body.email), str(ctx.body.code), str(ctx.body.password));
    } catch (e) {
      throw new HttpError(400, (e as Error).message, 'RESET_INVALID');
    }
    return { ok: true, message: 'Password updated. Sign in with the new one.' };
  },

  'POST auth/logout': async (ctx) => {
    destroySession(ctx.req.cookies.get(SESSION_COOKIE)?.value ?? '');
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' });
    return res;
  },

  'POST auth/password': (ctx) => {
    const user = requireUser(ctx);
    changePassword(user.id, str(ctx.body.currentPassword), str(ctx.body.newPassword));
    return { ok: true, message: 'Password updated. Other devices were signed out.' };
  },

  'POST auth/2fa/request': (ctx) => {
    const user = requireUser(ctx);
    const { sentTo, code } = account.requestTwoFactorCode(user);
    return { ok: true, sentTo, devCode: process.env.NODE_ENV !== 'production' ? code : undefined };
  },
  'POST auth/2fa/verify': (ctx) => {
    const user = requireUser(ctx);
    return account.enableTwoFactor(user, str(ctx.body.code));
  },
  'POST auth/2fa/disable': (ctx) => account.disableTwoFactor(requireUser(ctx)),

  /* --------------------------------------------------------------- account */
  'PATCH profile': (ctx) => account.updateProfile(requireUser(ctx), ctx.body as never),
  'POST profile/age': (ctx) => account.confirmAge(requireUser(ctx)),
  'PATCH profile/settings': (ctx) => account.updateSettings(requireUser(ctx), ctx.body as never),
  'GET account/overview': (ctx) => {
    const user = requireUser(ctx);
    return {
      profile: account.profileOf(user),
      addresses: account.listAddresses(user),
      paymentMethods: account.listPaymentMethods(user),
      documents: account.myDocuments(user),
      sessions: account.listSessions(user),
      notificationPreferences: account.notificationPreferences(user),
      favorites: cart.favoriteAnimalCards(user),
      unreadNotifications: unreadCount(user.id),
    };
  },
  'POST addresses': (ctx) => ({ addresses: account.saveAddress(requireUser(ctx), ctx.body as never) }),
  'DELETE addresses/:id': (ctx) => ({ addresses: account.deleteAddress(requireUser(ctx), ctx.params.id) }),
  'POST payment-methods': (ctx) => ({ methods: account.addPaymentMethod(requireUser(ctx), ctx.body as never) }),
  'DELETE payment-methods/:id': (ctx) => ({ methods: account.removePaymentMethod(requireUser(ctx), ctx.params.id) }),
  'POST account/sessions/revoke': (ctx) => ({ sessions: account.revokeSession(requireUser(ctx), str(ctx.body.sessionId)) }),
  'POST account/delete': (ctx) => {
    const user = requireUser(ctx);
    const res = account.deleteAccount(user, str(ctx.body.password));
    destroySession(userToken(ctx));
    return { ...res, redirect: '/' };
  },

  /* ------------------------------------------------------------ documents */
  'POST documents': async (ctx) => {
    const user = requireUser(ctx);
    const file = await fileFrom(ctx);
    if (!file) throw new HttpError(400, 'Attach a PDF or image file.');
    return account.uploadOwnDocument(user, ctx.body.doc_type as never, file, ctx.body.expires_at ? str(ctx.body.expires_at) : undefined);
  },
  'GET documents/:id': async (ctx) => {
    const user = requireUser(ctx);
    const token = ctx.url.searchParams.get('token');
    const access = seller.verifyDocumentAccess(user, ctx.params.id);
    if (!access.ok) throw new HttpError(403, `You are not permitted to view this document (${access.reason}).`, 'FORBIDDEN');
    if (token && !verifyDocToken(ctx.params.id, user.id, token)) throw new HttpError(403, 'This link has expired.');
    const row = access.row!;
    const abs = privatePathFor(row.storage_path as string);
    const buf = await fs.readFile(abs);
    audit(user, 'DOCUMENT_VIEW', 'DOCUMENT', ctx.params.id, { animal: row.animal_id }, ctx.surface);
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': ext === '.pdf' ? 'application/pdf' : 'image/jpeg',
        'Content-Disposition': `inline; filename="${row.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },

  /* -------------------------------------------------------------- catalog */
  'GET meta/states': () => ({ states: catalog.onboardedStates() }),

  'POST search': (ctx) => {
    const query = str(ctx.body.q);
    const nl = parseQuery(query);
    const filters: FilterState = { ...(nl.filters as FilterState), ...(typeof ctx.body.filters === 'object' && ctx.body.filters ? (ctx.body.filters as FilterState) : {}) };
    if (typeof ctx.body.sort === 'string') filters.sort = ctx.body.sort as FilterState['sort'];
    const result = catalog.searchAnimals(filters, Number(ctx.body.limit ?? 48), Number(ctx.body.page ?? 1) * 48 - 48);
    cart.recordSearch(ctx.user?.id ?? null, query, filters, result.total);
    if (ctx.user) catalog.trackEvent(ctx.user.id, 'SEARCH', null, 0.4);
    return { total: result.total, cards: result.cards, interpreted: nl.interpreted, filters };
  },
  'POST assistant': (ctx) => {
    const answer = assistant(str(ctx.body.prompt), {
      userId: ctx.user?.id ?? null,
      destinationState: ctx.user?.jurisdictionCode ?? (ctx.body.state ? str(ctx.body.state) : null),
    });
    const ids = answer.animalIds;
    return { ...answer, cards: catalog.cardsByIds(ids) };
  },
  'POST recommendations': (ctx) => {
    const scored = recommend(ctx.user?.id ?? null, ctx.user?.jurisdictionCode ?? null, Number(ctx.body.limit ?? 8));
    return { cards: catalog.cardsByIds(scored.map((s) => s.id)), scores: scored };
  },
  'POST events': (ctx) => {
    if (!ctx.user) return { ok: true, anonymous: true };
    catalog.trackEvent(ctx.user.id, str(ctx.body.kind), ctx.body.entityId ? str(ctx.body.entityId) : null, Number(ctx.body.weight ?? 1));
    return { ok: true };
  },
  'POST animals/:id/view': (ctx) => {
    catalog.bumpViews(ctx.params.id);
    if (ctx.user) catalog.trackEvent(ctx.user.id, 'VIEW_ANIMAL', ctx.params.id, 1);
    return { ok: true };
  },

  /* ------------------------------------------------------------ favorites */
  'POST favorites': (ctx) => cart.toggleFavorite(requireUser(ctx), str(ctx.body.animalId)),
  'POST follows': (ctx) => cart.toggleFollowBreeder(requireUser(ctx), str(ctx.body.breederId)),

  /* ------------------------------------------------------------------ cart */
  'POST cart': (ctx) => cart.addToCart(requireUser(ctx), str(ctx.body.animalId), (ctx.body.method as ShippingMethod) ?? 'SPECIALIZED_SHIPPING'),
  'PATCH cart/:id': (ctx) => ({ cart: cart.updateCartItem(requireUser(ctx), ctx.params.id, ctx.body as never) }),
  'DELETE cart/:id': (ctx) => ({ cart: cart.removeFromCart(requireUser(ctx), ctx.params.id) }),

  /* -------------------------------------------------------------- checkout */
  'POST checkout/preview': (ctx) => orders.checkoutPreview(requireUser(ctx), ctx.body as never),
  'POST checkout': (ctx) => {
    const user = requireUser(ctx);
    const rl = rateLimit(`checkout:${user.id}`, 12, 60_000);
    if (!rl.ok) throw new HttpError(429, 'Too many checkout attempts. Pause a moment.');
    return orders.placeOrder(user, {
      fulfillment: (ctx.body.fulfillment as never) ?? 'SHIPPING',
      method: (ctx.body.method as ShippingMethod) ?? 'SPECIALIZED_SHIPPING',
      addressId: ctx.body.addressId ? str(ctx.body.addressId) : null,
      pickupDate: ctx.body.pickupDate ? str(ctx.body.pickupDate) : null,
      paymentToken: str(ctx.body.paymentToken) || `tok_${id('t').slice(2)}`,
      paymentMethodId: ctx.body.paymentMethodId ? str(ctx.body.paymentMethodId) : null,
      buyerNote: ctx.body.buyerNote ? str(ctx.body.buyerNote) : null,
      firstName: str(ctx.body.firstName),
      lastName: str(ctx.body.lastName),
      email: str(ctx.body.email),
      phone: str(ctx.body.phone),
    });
  },
  'POST orders/:id/advance': (ctx) =>
    orders.advanceOrder(requireUser(ctx), ctx.params.id, str(ctx.body.status) as OrderStatus, {
      note: ctx.body.note ? str(ctx.body.note) : undefined,
      trackingNumber: ctx.body.trackingNumber ? str(ctx.body.trackingNumber) : undefined,
    }),
  'POST orders/:id/review': (ctx) => orders.submitReview(requireUser(ctx), ctx.params.id, ctx.body as never),

  /* ------------------------------------------------------------- messages */
  'POST conversations': async (ctx) => {
    const user = requireUser(ctx);
    let sellerUserId = ctx.body.sellerUserId ? str(ctx.body.sellerUserId) : '';
    if (!sellerUserId && ctx.body.animalId) {
      const row = getDb().prepare(`SELECT b.user_id FROM animals a JOIN breeders b ON b.id = a.breeder_id WHERE a.id = ?`).get(str(ctx.body.animalId)) as
        | { user_id: string }
        | undefined;
      if (!row) throw new HttpError(404, 'Listing not found.');
      sellerUserId = row.user_id;
    }
    if (!sellerUserId) throw new HttpError(400, 'Missing seller.');
    const seed = ctx.body.seed ? str(ctx.body.seed) : ctx.body.animalId ? `Hi, I'm interested in "${listingName(str(ctx.body.animalId))}". Is it still available for ${destinationLabel(user)}?` : '';
    return messaging.openConversation(user, sellerUserId, ctx.body.animalId ? str(ctx.body.animalId) : null, seed);
  },
  'POST messages': (ctx) => {
    const user = requireUser(ctx);
    return messaging.appendMessage(str(ctx.body.conversationId), user.id, str(ctx.body.body));
  },
  'POST blocks': (ctx) => messaging.blockUser(requireUser(ctx), str(ctx.body.userId)),

  /* --------------------------------------------------------------- reports */
  'POST reports': (ctx) => {
    const user = requireUser(ctx);
    const idValue = openReport({
      reporterId: user.id,
      targetType: (ctx.body.targetType as never) ?? 'ANIMAL',
      targetId: resolveTarget(str(ctx.body.targetType) || 'ANIMAL', str(ctx.body.targetId)),
      reason: str(ctx.body.reason).toUpperCase(),
      details: ctx.body.details ? str(ctx.body.details) : undefined,
    });
    audit(user, 'REPORT_CREATE', 'REPORT', idValue, { reason: str(ctx.body.reason) }, ctx.surface);
    return { ok: true, reportId: idValue, message: 'Report received. Our trust & safety team reviews within 24h.' };
  },

  /* --------------------------------------------------------- notifications */
  'POST notifications/read': (ctx) => {
    const user = requireUser(ctx);
    markRead(user.id, ctx.body.id ? str(ctx.body.id) : undefined);
    return { ok: true, unread: 0, items: listNotifications(user.id) };
  },
  'GET notifications': (ctx) => {
    const user = requireUser(ctx);
    return { items: listNotifications(user.id), unread: unreadCount(user.id) };
  },

  /* --------------------------------------------------------------- seller */
  'POST seller/listings': (ctx) => {
    const user = requireUser(ctx);
    return seller.saveListing(user, ctx.body as never, ctx.body.action === 'submit' ? 'submit' : 'draft');
  },
  'PATCH seller/listings/:id': (ctx) => {
    const user = requireUser(ctx);
    if (ctx.body.status) return seller.setListingStatus(user, ctx.params.id, str(ctx.body.status) as ListingStatus);
    if (ctx.body.price !== undefined) return seller.updatePrice(user, ctx.params.id, Number(ctx.body.price));
    return seller.saveListing(user, { ...(ctx.body as Record<string, unknown>), id: ctx.params.id } as never, 'draft');
  },
  'POST seller/listings/:id/images': async (ctx) => {
    const user = requireUser(ctx);
    const form = await ctx.req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) throw new HttpError(400, 'No image received.');
    return seller.attachImages(user, ctx.params.id, files);
  },
  'POST seller/documents': async (ctx) => {
    const user = requireUser(ctx);
    const file = await fileFrom(ctx);
    if (!file) throw new HttpError(400, 'Attach a file.');
    return seller.attachDocument(user, ctx.body.animal_id ? str(ctx.body.animal_id) : null, str(ctx.body.doc_type) as never, file, ctx.body.expires_at ? str(ctx.body.expires_at) : null);
  },
  'POST seller/apply': (ctx) => seller.applyForBreeder(requireUser(ctx), ctx.body as never),
  'POST seller/plan': (ctx) => {
    const user = requireUser(ctx);
    if (!user.breederId) throw new HttpError(403, 'Breeder account required.');
    const plan = (str(ctx.body.plan) || 'FREE').toUpperCase() as 'FREE' | 'PRO' | 'PREMIUM';
    const price = subscriptionPrice(plan).cents;
    const db = getDb();
    db.prepare(`UPDATE breeders SET storefront_plan = ?, updated_at = ? WHERE id = ?`).run(plan, nowIso(), user.breederId);
    insert('subscriptions', {
      id: id('sub'),
      breeder_id: user.breederId,
      plan,
      price_cents_month: price,
      status: 'ACTIVE',
      started_at: nowIso(),
      renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    audit(user, 'PLAN_CHANGE', 'BREEDER', user.breederId, { plan }, ctx.surface);
    return { ok: true, plan, price_cents_month: price };
  },

  /* ---------------------------------------------------------------- admin */
  'POST admin/listings': (ctx) => admin.decideListing(requireUser(ctx), str(ctx.body.animalId), str(ctx.body.decision) as never, ctx.body.note ? str(ctx.body.note) : undefined),
  'POST admin/verification': (ctx) => admin.decideVerification(requireUser(ctx), str(ctx.body.verificationId), str(ctx.body.decision) as never, ctx.body.note ? str(ctx.body.note) : undefined),
  'POST admin/tier': (ctx) => admin.grantTier(requireUser(ctx), str(ctx.body.breederId), str(ctx.body.tier) as Role),
  'POST admin/users/status': (ctx) => admin.setUserStatus(requireUser(ctx), str(ctx.body.userId), str(ctx.body.status) as never, ctx.body.reason ? str(ctx.body.reason) : undefined),
  'POST admin/reports': (ctx) => admin.decideReport(requireUser(ctx), str(ctx.body.reportId), str(ctx.body.decision) as never, ctx.body.note ? str(ctx.body.note) : undefined),
  'POST admin/flags': (ctx) => admin.clearFlag(requireUser(ctx), str(ctx.body.flagId), str(ctx.body.status) as never, ctx.body.note ? str(ctx.body.note) : undefined),
  'POST admin/rules': (ctx) => admin.upsertRestriction(requireUser(ctx), ctx.body as never),
  'POST admin/documents': (ctx) => admin.reviewDocument(requireUser(ctx), str(ctx.body.documentId), str(ctx.body.decision) as never, ctx.body.note ? str(ctx.body.note) : undefined),
  'POST admin/orders': (ctx) => orders.advanceOrder(requireUser(ctx), str(ctx.body.orderId), str(ctx.body.status) as OrderStatus, { note: ctx.body.note ? str(ctx.body.note) : undefined }),

  /* ------------------------------------------------------- preferences */
  'POST experience': (ctx) => {
    const value = ctx.body.experience === 'mobile' ? 'mobile' : 'desktop';
    const res = NextResponse.json({ ok: true, experience: value });
    res.cookies.set(EXPERIENCE_COOKIE, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: false });
    return res;
  },
  'POST i18n': (ctx) => {
    const user = requireUser(ctx);
    return account.updateSettings(user, { locale: ctx.body.locale ? str(ctx.body.locale) : undefined, currency: ctx.body.currency ? str(ctx.body.currency) : undefined } as never);
  },
};

/* ------------------------------------------------------------- dispatcher */

export async function handle(method: string, segments: string[], req: NextRequest): Promise<NextResponse> {
  const key = `${method} ${segments.join('/')}`;
  const matched = matchRoute(method, segments);
  if (!matched) {
    return NextResponse.json({ error: { message: `No API route for ${key}`, code: 'NOT_FOUND' } }, { status: 404 });
  }
  const { handler, params } = matched;
  const cookieStore = cookies();
  const user = readSession(cookieStore.get(SESSION_COOKIE)?.value);
  const surface: 'mobile' | 'desktop' = cookieStore.get(EXPERIENCE_COOKIE)?.value === 'mobile' ? 'mobile' : 'desktop';

  let body: Record<string, unknown> = {};
  if (!['GET', 'DELETE'].includes(method)) {
    const ctype = req.headers.get('content-type') ?? '';
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      form.forEach((v, k) => {
        if (!(v instanceof File)) body[k] = v;
      });
    } else if (ctype.includes('application/json')) {
      try {
        body = ((await req.json()) ?? {}) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: { message: 'Invalid JSON body.', code: 'BAD_JSON' } }, { status: 400 });
      }
    }
  }

  try {
    const result = await handler({ req, user, body, params, url: new URL(req.url), surface });
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    const err = e as HttpError & { code?: string; status?: number };
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(`[api] ${key} →`, e);
    return NextResponse.json({ error: { message: err.message || 'Something went wrong.', code: err.code ?? 'SERVER_ERROR' } }, { status });
  }
}

function matchRoute(method: string, segments: string[]): { handler: Handler; params: Record<string, string> } | null {
  for (const [pattern, handler] of Object.entries(ROUTES)) {
    const [patMethod, ...rest] = pattern.split(' ');
    if (patMethod !== method) continue;
    const patSegments = rest.join('/').split('/');
    if (patSegments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < patSegments.length; i++) {
      const p = patSegments[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segments[i]);
      else if (p !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler, params };
  }
  return null;
}

export const routeTable = () => Object.keys(ROUTES).sort();

/* --------------------------------------------------------------- helpers */

function requireUser(ctx: Ctx): SessionUser {
  if (!ctx.user) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');
  return ctx.user;
}

function userToken(ctx: Ctx) {
  return ctx.req.cookies.get(SESSION_COOKIE)?.value ?? '';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function ip(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
}

function ua(req: NextRequest) {
  return req.headers.get('user-agent') ?? '';
}

async function fileFrom(ctx: Ctx): Promise<File | null> {
  const form = await ctx.req.formData().catch(() => null);
  if (!form) return null;
  const direct = form.get('file');
  if (direct instanceof File) return direct;
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  return files[0] ?? null;
}

/** Reports arrive with a slug, an email or an id — normalise to the row id. */
function resolveTarget(type: string, value: string): string {
  if (!value) throw new HttpError(400, 'Tell us what you are reporting (a listing link, breeder name or user id).');
  if (/^(anm|brd|usr|msg)_/.test(value)) return value;
  const db = getDb();
  const row =
    type === 'ANIMAL'
      ? (db.prepare(`SELECT id FROM animals WHERE slug = ? OR id = ?`).get(value, value) as { id: string } | undefined)
      : type === 'BREEDER'
        ? (db.prepare(`SELECT id FROM breeders WHERE slug = ? OR business_name LIKE ?`).get(value, `%${value}%`) as { id: string } | undefined)
        : type === 'MESSAGE'
          ? (db.prepare(`SELECT id FROM messages WHERE id = ?`).get(value) as { id: string } | undefined)
          : (db.prepare(`SELECT id FROM users WHERE email = ? OR id = ?`).get(value.toLowerCase(), value) as { id: string } | undefined);
  if (!row) throw new HttpError(404, `We could not find that ${type.toLowerCase()} — paste the link from your browser instead.`);
  return row.id;
}

function listingName(animalId: string): string {
  const row = getDb().prepare(`SELECT name FROM animals WHERE id = ?`).get(animalId) as { name: string } | undefined;
  return row?.name ?? 'your listing';
}

function destinationLabel(user: SessionUser): string {
  return user.jurisdictionCode ? `${user.jurisdictionCode}` : 'my state';
}

export function authResponse(payload: Record<string, unknown>, token: string) {
  const res = NextResponse.json(payload);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
