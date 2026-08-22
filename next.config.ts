import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite ships WASM; bundling it into the RSC server graph breaks the dev server.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
