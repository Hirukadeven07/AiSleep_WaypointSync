const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@waypoint/contracts', 'maplibre-gl', 'pmtiles', '@protomaps/basemaps'],
  experimental: {
    // Only for `next build` / standalone. In `next dev` this walks the monorepo
    // (and OneDrive locks) and can leave the UI stuck on "Starting...".
    ...(process.env.NODE_ENV === 'production'
      ? { outputFileTracingRoot: path.join(__dirname, '../../') }
      : {}),
  },
  /**
   * Signed-in pages are never stored: after sign out, Back must not show a cached copy of the
   * app before the sign-in redirect. Only these four route groups; static assets, /maps and the
   * login pages keep their normal caching.
   */
  async headers() {
    const noStore = [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Pragma', value: 'no-cache' },
    ];
    return ['/dispatch', '/dock', '/drive', '/store'].map((base) => ({
      source: `${base}/:path*`,
      headers: noStore,
    }));
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    const rules = [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
    // Hosts with a file size cap (Vercel: 100 MB) serve the basemap from object storage instead of public/.
    if (process.env.BASEMAP_URL) {
      rules.push({ source: '/maps/sri-lanka.pmtiles', destination: process.env.BASEMAP_URL });
    }
    return rules;
  },
};

module.exports = nextConfig;
