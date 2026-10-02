const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@waypoint/contracts'],
  experimental: {
    // Only for `next build` / standalone. In `next dev` this walks the monorepo
    // (and OneDrive locks) and can leave the UI stuck on "Starting...".
    ...(process.env.NODE_ENV === 'production'
      ? { outputFileTracingRoot: path.join(__dirname, '../../') }
      : {}),
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

module.exports = nextConfig;
