import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Pin the workspace root to THIS folder. Without it, Next can pick a parent
// directory's lockfile as the root and print a confusing warning — beginners who
// clone this repo on its own never hit that, and this keeps it quiet regardless.
const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: { root: here },
  experimental: {
    // A server action's body is capped at 1 MB by default, and a photo off a
    // phone is 2-5 MB -- so "Count it" on the food diary failed every time
    // (owner, 24 Sep 2026). The page shrinks images before sending, but the
    // limit has to allow the ones that arrive unshrunk.
    serverActions: { bodySizeLimit: '8mb' },
  },
}

export default nextConfig
