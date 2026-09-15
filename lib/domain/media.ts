import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { id, nowIso } from './util';

/**
 * Media pipeline (spec §42 / §45).
 *
 * Buckets — mirrored on disk here, mapped 1:1 to Supabase Storage in production:
 *   animal-images  → PUBLIC  (CDN, derivatives + AVIF/WebP)
 *   animal-videos  → PUBLIC  (poster + streamed file)
 *   avatars        → PUBLIC  (128/256 crops)
 *   documents      → PRIVATE (never under /public; streamed through a signed,
 *                             authorization-checked route with a 60s TTL token)
 */

export const PUBLIC_ROOT = path.join(process.cwd(), 'public');
/**
 * Private documents live outside the web root. In a serverless runtime the
 * function's own directory is read-only, so uploads land in /tmp (per instance)
 * unless a real object store is configured — see docs/ARCHITECTURE.md §7.
 */
const SERVERLESS_FS = !!process.env.VERCEL || !!process.env.LAMBDA_TASK_ROOT;
export const PRIVATE_ROOT = process.env.FAUNAL_PRIVATE_DIR
  ? path.resolve(process.env.FAUNAL_PRIVATE_DIR)
  : SERVERLESS_FS
    ? '/tmp/faunal-private'
    : path.join(process.cwd(), 'data', 'private');

export const IMAGE_SIZES = [
  { key: 'large', width: 1400 },
  { key: 'medium', width: 800 },
  { key: 'small', width: 480 },
  { key: 'thumb', width: 200 },
] as const;

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const DOC_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface MediaLimits {
  maxBytes: number;
  allow: string[];
}

export const IMAGE_LIMITS: MediaLimits = { maxBytes: 12 * 1024 * 1024, allow: Object.keys(IMAGE_MIME) };
export const DOC_LIMITS: MediaLimits = { maxBytes: 15 * 1024 * 1024, allow: Object.keys(DOC_MIME) };

/** Upload validation: MIME allow-list + magic bytes + declared size. */
export function validateUpload(file: { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }, limits: MediaLimits) {
  if (!limits.allow.includes(file.type)) {
    throw Object.assign(new Error(`Unsupported file type: ${file.type || 'unknown'}`), { status: 415 });
  }
  if (file.size > limits.maxBytes) {
    throw Object.assign(new Error(`File is larger than ${Math.round(limits.maxBytes / 1024 / 1024)}MB`), { status: 413 });
  }
}

function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'pdf' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.length > 5 && buf.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  return null;
}

export function safeName(original: string, ext: string) {
  const base = path
    .basename(original)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 48);
  return `${base || 'file'}-${id('f').slice(6)}.${ext}`;
}

export interface DerivativePaths {
  base: string;
  large: string;
  medium: string;
  small: string;
  thumb: string;
  avif?: string;
  webp?: string;
  width: number;
  height: number;
}

/**
 * Writes the original + resized derivatives. Uses sharp when installed;
 * otherwise records the original for all sizes so the app still works.
 */
export async function storeAnimalImage(file: File, bucket: 'animal-images' | 'avatars' = 'animal-images'): Promise<DerivativePaths & { phash: string | null }> {
  validateUpload(file, IMAGE_LIMITS);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind || kind === 'pdf') throw Object.assign(new Error('That file is not a valid image.'), { status: 415 });
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const name = safeName(file.name || 'upload', ext);
  const dir = path.join(PUBLIC_ROOT, 'uploads', bucket);
  await fs.mkdir(dir, { recursive: true });
  const baseRel = `/uploads/${bucket}/${name}`;
  await fs.writeFile(path.join(dir, name), buf);

  let sharp: typeof import('sharp') | null = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null;
  }

  const out: DerivativePaths & { phash: string | null } = {
    base: baseRel,
    large: baseRel,
    medium: baseRel,
    small: baseRel,
    thumb: baseRel,
    width: 1200,
    height: 1200,
    phash: null,
  };

  if (sharp) {
    const image = sharp(buf).rotate();
    const meta = await image.metadata();
    out.width = meta.width ?? 1200;
    out.height = meta.height ?? 1200;
    for (const size of IMAGE_SIZES) {
      const target = path.join(dir, `${name.replace(/\.[^.]+$/, '')}-${size.key}.webp`);
      await sharp(buf)
        .rotate()
        .resize({ width: size.width, height: size.width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size.key === 'thumb' ? 70 : 78 })
        .toFile(target);
      out[size.key] = `/uploads/${bucket}/${path.basename(target)}`;
    }
    const avifFile = `${name.replace(/\.[^.]+$/, '')}-avif.avif`;
    try {
      await sharp(buf).rotate().resize({ width: 1400, fit: 'inside', withoutEnlargement: true }).avif({ quality: 45 }).toFile(path.join(dir, avifFile));
      out.avif = `/uploads/${bucket}/${avifFile}`;
    } catch {
      out.avif = undefined;
    }
    const pix = await sharp(buf).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    const { dhashFromGrayscale } = await import('./fraud');
    out.phash = dhashFromGrayscale(new Uint8Array(pix));
  }
  return out;
}

export async function storePrivateDocument(file: File, ownerId: string, docType: string) {
  validateUpload(file, DOC_LIMITS);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) throw Object.assign(new Error('Unrecognised file signature.'), { status: 415 });
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const name = safeName(file.name || 'document', ext);
  const dir = path.join(PRIVATE_ROOT, 'documents', ownerId.slice(0, 8));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  const record = {
    storage_bucket: 'documents',
    storage_path: path.join('documents', ownerId.slice(0, 8), name),
    filename: name,
    size_bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    uploaded_at: nowIso(),
    doc_type: docType,
  };
  return record;
}

/** Signed, single-purpose access tokens for private documents. */
export function signDocToken(documentId: string, userId: string, ttlSeconds = 60): string {
  const secret = process.env.FAUNAL_DOC_SECRET ?? 'faunal-local-document-secret';
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac('sha256', secret).update(`${documentId}.${userId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyDocToken(documentId: string, userId: string, token: string): boolean {
  const [expStr, sig] = (token || '').split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const secret = process.env.FAUNAL_DOC_SECRET ?? 'faunal-local-document-secret';
  const expected = crypto.createHmac('sha256', secret).update(`${documentId}.${userId}.${exp}`).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export function privatePathFor(storagePath: string): string {
  // Defence in depth: never allow traversal out of PRIVATE_ROOT.
  const resolved = path.resolve(PRIVATE_ROOT, storagePath);
  if (!resolved.startsWith(path.resolve(PRIVATE_ROOT))) throw Object.assign(new Error('Invalid path.'), { status: 400 });
  return resolved;
}
