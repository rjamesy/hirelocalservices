/**
 * blacklist.ts
 *
 * Client-side blacklist checking (fast, pre-flight check before DB call).
 * The authoritative check happens in the database via is_blacklisted() RPC.
 */

// These mirror the seeded blacklist entries for fast pre-flight checks
const BLOCKED_TERMS = [
  'escort', 'brothel', 'strip club', 'adult entertainment',
  'erotic', 'massage parlour', 'happy ending', 'sex shop', 'xxx',
]

/**
 * Quick client-side check against known blocked terms.
 * Returns the matched term or null if clean.
 */
export function quickBlacklistCheck(name: string): string | null {
  const lower = name.toLowerCase().trim()
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term)) return term
  }
  return null
}
