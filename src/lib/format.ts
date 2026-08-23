// Number formatting for every user-facing figure on the site.
//
// The locale is pinned deliberately. `toLocaleString()` with no locale uses the
// VIEWER's locale, so the same collective counter rendered "5,528,788,163" in
// one browser and "5,52,87,88,163" (lakh/crore grouping) in another. A headline
// number that changes shape per visitor reads as a rendering fault, so every
// figure here is formatted identically for everyone.
const LOCALE = 'en-US'

/** Dollar amounts: always two decimals, always grouped the same way. */
export function formatUsd(v: number): string {
  return v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Whole counts — tokens, sessions, developers, tools. */
export function formatCount(v: number): string {
  return Math.round(v).toLocaleString(LOCALE)
}

/** Scores shown to one decimal, e.g. the Index. */
export function formatScore(v: number): string {
  return v.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
