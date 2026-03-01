/**
 * gbp-import-utils.ts
 *
 * Pure utility functions for GBP category import.
 * No side effects — easy to unit test.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GbpCategory {
  gcid: string
  name: string
}

export interface GroupDef {
  slug: string
  name: string
  sort_order: number
}

export interface GbpGroupMapping {
  meta: { version: string; description: string; last_updated: string }
  groups: GroupDef[]
  active_categories: string[]
  mapping: Record<string, string>
  manual_dedup: Record<string, string>
}

export interface ExistingCategory {
  id: string
  slug: string
  name: string
  source: string
  synonyms: string[]
}

export type Resolution =
  | { action: 'insert'; slug: string; parentSlug: string; isActive: boolean; sourceRef: string }
  | { action: 'merge'; existingSlug: string; gbpName: string }
  | { action: 'update'; slug: string; parentSlug: string; isActive: boolean; sourceRef: string }
  | { action: 'skip'; reason: string }

// ─── Slugify ────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a category name.
 *
 * Rules:
 *  - Lowercase
 *  - & → "and"
 *  - Remove apostrophes
 *  - Non-alphanumeric → hyphens
 *  - Collapse consecutive hyphens
 *  - Trim leading/trailing hyphens
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['\u2018\u2019\u201A\u201B]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── Resolve Category ───────────────────────────────────────────────────────

/**
 * Determine what action to take for a GBP category.
 *
 * @param gbpName       — canonical GBP category name
 * @param mapping       — the full group mapping config
 * @param existingSlugs — map of slug → existing category info
 */
export function resolveCategory(
  gbpName: string,
  mapping: GbpGroupMapping,
  existingSlugs: Map<string, ExistingCategory>
): Resolution {
  const groupSlug = mapping.mapping[gbpName]
  if (!groupSlug) {
    return { action: 'skip', reason: `No mapping for "${gbpName}"` }
  }

  const isActive = mapping.active_categories.includes(gbpName)

  // Check manual dedup: GBP name maps to an existing manual category slug
  const dedupSlug = mapping.manual_dedup[gbpName]
  if (dedupSlug) {
    const existing = existingSlugs.get(dedupSlug)
    if (existing) {
      return { action: 'merge', existingSlug: dedupSlug, gbpName }
    }
    // Dedup target doesn't exist — fall through to normal insert
  }

  const slug = slugify(gbpName)

  // Check if slug already exists in DB
  const existing = existingSlugs.get(slug)
  if (existing) {
    if (existing.source === 'manual') {
      // Don't overwrite manual categories — merge instead
      return { action: 'merge', existingSlug: slug, gbpName }
    }
    // Existing GBP category — update (idempotent refresh)
    return { action: 'update', slug, parentSlug: groupSlug, isActive, sourceRef: gbpName }
  }

  return { action: 'insert', slug, parentSlug: groupSlug, isActive, sourceRef: gbpName }
}

// ─── Validate Mapping ───────────────────────────────────────────────────────

export interface ValidationResult {
  warnings: string[]
  errors: string[]
}

/**
 * Validate the mapping file for consistency.
 */
export function validateMapping(
  categories: GbpCategory[],
  mapping: GbpGroupMapping
): ValidationResult {
  const warnings: string[] = []
  const errors: string[] = []

  const groupSlugs = new Set(mapping.groups.map((g) => g.slug))
  const catNames = new Set(categories.map((c) => c.name))

  // Check all mapping entries reference valid groups
  for (const [name, groupSlug] of Object.entries(mapping.mapping)) {
    if (!groupSlugs.has(groupSlug)) {
      errors.push(`Mapping "${name}" references unknown group "${groupSlug}"`)
    }
  }

  // Check all categories have mappings
  for (const cat of categories) {
    if (!mapping.mapping[cat.name]) {
      warnings.push(`Category "${cat.name}" has no mapping — will be skipped`)
    }
  }

  // Check active_categories are all in the category list
  for (const name of mapping.active_categories) {
    if (!catNames.has(name)) {
      warnings.push(`Active category "${name}" not found in category data file`)
    }
  }

  // Check manual_dedup targets are plausible slugs
  for (const [gbpName, targetSlug] of Object.entries(mapping.manual_dedup)) {
    if (!mapping.mapping[gbpName]) {
      warnings.push(`manual_dedup entry "${gbpName}" has no group mapping`)
    }
    if (!targetSlug || targetSlug.includes(' ')) {
      errors.push(`manual_dedup target "${targetSlug}" for "${gbpName}" is not a valid slug`)
    }
  }

  return { warnings, errors }
}
