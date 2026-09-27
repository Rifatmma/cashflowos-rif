// The app's public address, for links Jarvis sends. Vercel sets
// VERCEL_PROJECT_PRODUCTION_URL; APP_URL overrides it. With neither, '' --
// callers then leave the link out rather than send a broken one.
export function appUrl(): string {
  return process.env.APP_URL?.replace(/\/+$/, '') ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
}

/** The correction page for one receipt, or '' when the address isn't known. */
export function fixUrl(recordId: unknown): string {
  const base = appUrl()
  const id = Number(recordId)
  return base && Number.isFinite(id) && id > 0 ? `${base}/cash-out/${id}` : ''
}
