import { NextRequest } from 'next/server';
import { handle } from '@/lib/api/router';

export const dynamic = 'force-dynamic';

type Ctx = { params: { path?: string[] } };

const segments = (ctx: Ctx) => (ctx.params?.path ?? []).filter(Boolean);

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle('GET', segments(ctx), req);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle('POST', segments(ctx), req);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle('PATCH', segments(ctx), req);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle('PATCH', segments(ctx), req);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle('DELETE', segments(ctx), req);
}
