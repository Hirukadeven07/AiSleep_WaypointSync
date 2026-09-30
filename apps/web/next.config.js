const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@waypoint/contracts'],
  experimental: {
    // Trace files from the monorepo root so the standalone build includes workspace packages.
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

module.exports = nextConfig;
