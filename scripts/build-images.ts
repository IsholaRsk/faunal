#!/usr/bin/env -S npx tsx
/**
 * Image derivative pipeline (spec §45).
 * raw/*.jpg → derived/{stem}-{large|medium|small|thumb}.webp + {stem}-original.avif
 * Also emits og-cover.jpg. Run with: npm run db:images
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'img');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'derived');

const SIZES = [
  { key: 'large', width: 1400, quality: 80 },
  { key: 'medium', width: 800, quality: 78 },
  { key: 'small', width: 480, quality: 74 },
  { key: 'thumb', width: 200, quality: 70 },
] as const;

async function main() {
  let sharpMod: typeof import('sharp');
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    console.warn('[images] sharp is not installed — copying originals as a fallback');
    fs.mkdirSync(OUT, { recursive: true });
    for (const f of fs.readdirSync(RAW)) {
      for (const s of SIZES) fs.copyFileSync(path.join(RAW, f), path.join(OUT, `${path.parse(f).name}-${s.key}.webp`));
    }
    return;
  }
  const sharp = sharpMod;
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(RAW).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  let count = 0;
  for (const file of files) {
    const stem = path.parse(file).name;
    const input = path.join(RAW, file);
    for (const size of SIZES) {
      await sharp(input)
        .rotate()
        .resize({ width: size.width, height: size.width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size.quality })
        .toFile(path.join(OUT, `${stem}-${size.key}.webp`));
      count++;
    }
    await sharp(input).rotate().resize({ width: 1400, fit: 'inside' }).avif({ quality: 46 }).toFile(path.join(OUT, `${stem}-original.avif`));
    count++;
    // Square hero crop for Open Graph / cards.
    if (stem === 'hero-terrarium') {
      await sharp(input).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82, progressive: true }).toFile(path.join(ROOT, 'og-cover.jpg'));
    }
  }
  const stats = files.length ? await sharp(path.join(RAW, files[0])).metadata() : null;
  console.log(`[images] ${count} derivatives from ${files.length} originals (first: ${stats?.width}×${stats?.height}) → public/img/derived`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
