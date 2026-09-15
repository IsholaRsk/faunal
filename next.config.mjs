/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We ship our own pre-optimized derivative images (AVIF/WebP + 5 sizes) from /public/img.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // The seeded SQLite file and the schema are read at runtime, so they must
    // be traced into the serverless bundle (serverless FS is otherwise read-only
    // and /tmp is used for writes — see lib/db/index.ts).
    outputFileTracingIncludes: {
      '/**': ['./data/faunal.db', './lib/db/schema.sql'],
    },
  },
  async headers() {
    return [
      {
        source: '/img/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
