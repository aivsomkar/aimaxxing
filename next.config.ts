import type { NextConfig } from 'next'

// Content-Security-Policy notes:
// - GitHub avatars are hotlinked from avatars.githubusercontent.com (img-src).
// - Next.js App Router injects inline <script> hydration payloads and inline
//   styles, so 'unsafe-inline' is required for both until nonce-based
//   middleware is added.
// - frame-ancestors 'none' doubles as the X-Frame-Options replacement.
// Next's dev server ships eval-based HMR/source maps, so a production-strict
// script-src silently breaks hydration locally: client components render but
// never become interactive, and the only clue is a CSP violation in the
// console. 'unsafe-eval' is added in development ONLY — never in the deployed
// policy.
const scriptSrc =
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  // PGlite ships WASM; bundling it into the RSC server graph breaks the dev server.
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

export default nextConfig
