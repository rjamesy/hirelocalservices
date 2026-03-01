// ─── Category Search Utility ────────────────────────────────────────
// Pure functions for client-side category filtering and ranking.
// No React dependencies — easy to unit test.

export interface SearchableCategory {
  id: string
  name: string
  parent_id: string | null
  synonyms?: string[]
  keywords?: string[]
}

/**
 * Bigram (character-pair) similarity between two strings.
 * Returns 0-1 where 1 means identical bigram sets.
 */
export function bigramSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0
  const bigramsA = new Set<string>()
  const bigramsB = new Set<string>()
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2))
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2))
  let intersection = 0
  bigramsA.forEach((bg) => {
    if (bigramsB.has(bg)) intersection++
  })
  const union = bigramsA.size + bigramsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Score how well a query matches a category. Higher = better match.
 * Returns 0 for no match.
 *
 * Tiers:
 *  100 — exact prefix on name
 *   80 — word-start match on name
 *   60 — substring match on name
 *   50 — prefix on a synonym
 *   40 — substring on a synonym
 *   30 — prefix on a keyword
 *   20 — substring on a keyword
 *   10 — bigram similarity > 0.3
 *    0 — no match
 */
export function scoreCategoryMatch(query: string, category: SearchableCategory): number {
  const q = query.toLowerCase().trim()
  if (!q || q.length < 2) return 0

  const name = category.name.toLowerCase()

  // Tier 1: exact prefix on name
  if (name.startsWith(q)) return 100

  // Tier 2: word-start match on name
  const words = name.split(/\s+/)
  if (words.some((w) => w.startsWith(q))) return 80

  // Tier 3: substring match on name
  if (name.includes(q)) return 60

  // Tier 4-5: synonym matching
  const synonyms = (category.synonyms ?? []).map((s) => s.toLowerCase())
  if (synonyms.some((s) => s.startsWith(q))) return 50
  if (synonyms.some((s) => s.includes(q))) return 40

  // Tier 6-7: keyword matching
  const keywords = (category.keywords ?? []).map((k) => k.toLowerCase())
  if (keywords.some((k) => k.startsWith(q))) return 30
  if (keywords.some((k) => k.includes(q))) return 20

  // Tier 8: fuzzy bigram similarity
  if (bigramSimilarity(q, name) > 0.3) return 10

  return 0
}

/**
 * Search categories by query string.
 * Only searches child categories (parent_id !== null).
 * Optionally filter by groupId and exclude specific IDs.
 * Returns top `limit` results sorted by score descending, then name.
 */
export function searchCategories(
  query: string,
  categories: SearchableCategory[],
  options?: { groupId?: string; excludeIds?: string[]; limit?: number }
): SearchableCategory[] {
  const { groupId, excludeIds = [], limit = 10 } = options ?? {}

  // Only search child categories
  let children = categories.filter((c) => c.parent_id !== null)

  // Filter by group if specified
  if (groupId) {
    children = children.filter((c) => c.parent_id === groupId)
  }

  // Exclude specific IDs
  if (excludeIds.length > 0) {
    const excludeSet = new Set(excludeIds)
    children = children.filter((c) => !excludeSet.has(c.id))
  }

  return children
    .map((c) => ({ category: c, score: scoreCategoryMatch(query, c) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name))
    .slice(0, limit)
    .map((r) => r.category)
}
