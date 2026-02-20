/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // API-Requests im Dev-Modus zu Backend weiterleiten
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // INTERNAL_API_URL = Docker-interner Service-Name (server-side only, kein build-arg)
        destination: `${process.env.INTERNAL_API_URL || 'http://backend:4000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
