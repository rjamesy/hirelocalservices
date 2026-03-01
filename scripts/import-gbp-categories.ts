/**
 * import-gbp-categories.ts
 *
 * Imports Google Business Profile categories into the categories table.
 * Idempotent: safe to re-run. Uses slug conflict handling for dedup.
 *
 * Usage:
 *   npx tsx scripts/import-gbp-categories.ts [--dry-run] [--verbose]
 *
 * Requires env vars (reads from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  slugify,
  resolveCategory,
  validateMapping,
  type GbpCategory,
  type GbpGroupMapping,
  type ExistingCategory,
} from './lib/gbp-import-utils'

// ─── Config ─────────────────────────────────────────────────────────────────

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const VERBOSE = process.argv.includes('--verbose')
const BATCH_SIZE = 100

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg)
}

function verbose(msg: string) {
  if (VERBOSE) console.log(`  [verbose] ${msg}`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log(`\n=== GBP Category Import${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)

  // 1. Load data files
  const dataDir = resolve(__dirname, '..', 'data')
  const categories: GbpCategory[] = JSON.parse(
    readFileSync(resolve(dataDir, 'gbp-categories.json'), 'utf-8')
  )
  const mapping: GbpGroupMapping = JSON.parse(
    readFileSync(resolve(dataDir, 'gbp-group-mapping.json'), 'utf-8')
  )

  log(`Loaded ${categories.length} GBP categories`)
  log(`Mapping version: ${mapping.meta.version} (${mapping.meta.last_updated})`)
  log(`Groups defined: ${mapping.groups.length}`)
  log(`Active categories: ${mapping.active_categories.length}`)

  // 2. Validate mapping
  const validation = validateMapping(categories, mapping)
  if (validation.errors.length > 0) {
    log('\nValidation ERRORS:')
    validation.errors.forEach((e) => log(`  ERROR: ${e}`))
    process.exit(1)
  }
  if (validation.warnings.length > 0) {
    log(`\n${validation.warnings.length} warnings:`)
    validation.warnings.forEach((w) => verbose(`  WARN: ${w}`))
  }

  // 3. Fetch existing parent groups
  const { data: existingParents, error: parentErr } = await supabase
    .from('categories')
    .select('id, slug, name, source')
    .is('parent_id', null)

  if (parentErr) {
    log(`Error fetching parent groups: ${parentErr.message}`)
    process.exit(1)
  }

  const parentSlugToId = new Map<string, string>()
  existingParents?.forEach((p: any) => parentSlugToId.set(p.slug, p.id))
  log(`\nExisting parent groups: ${existingParents?.length ?? 0}`)

  // 4. Ensure all parent groups exist
  let newGroupsCreated = 0
  for (const group of mapping.groups) {
    if (parentSlugToId.has(group.slug)) {
      verbose(`Group "${group.slug}" exists`)
      continue
    }

    if (DRY_RUN) {
      log(`  [dry-run] Would create group: ${group.name} (${group.slug})`)
      newGroupsCreated++
      continue
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('categories')
      .insert({
        name: group.name,
        slug: group.slug,
        parent_id: null,
        source: 'manual',
        is_active: true,
        sort_order: group.sort_order,
      })
      .select('id')
      .single()

    if (insertErr) {
      log(`Error creating group "${group.slug}": ${insertErr.message}`)
      continue
    }

    parentSlugToId.set(group.slug, inserted.id)
    newGroupsCreated++
    verbose(`Created group: ${group.name} (${group.slug})`)
  }
  log(`New parent groups created: ${newGroupsCreated}`)

  // 5. Fetch all existing child categories
  const { data: existingChildren, error: childErr } = await supabase
    .from('categories')
    .select('id, slug, name, source, synonyms')

  if (childErr) {
    log(`Error fetching existing categories: ${childErr.message}`)
    process.exit(1)
  }

  const existingSlugs = new Map<string, ExistingCategory>()
  existingChildren?.forEach((c: any) => {
    existingSlugs.set(c.slug, {
      id: c.id,
      slug: c.slug,
      name: c.name,
      source: c.source ?? 'manual',
      synonyms: c.synonyms ?? [],
    })
  })

  // 6. Resolve each GBP category
  const inserts: Array<{
    name: string
    slug: string
    parent_id: string
    source: string
    source_ref: string
    is_active: boolean
    sort_order: number
  }> = []

  const merges: Array<{ existingSlug: string; gbpName: string }> = []
  const updates: typeof inserts = []
  let skipped = 0

  for (const cat of categories) {
    const resolution = resolveCategory(cat.name, mapping, existingSlugs)

    switch (resolution.action) {
      case 'insert': {
        const parentId = parentSlugToId.get(resolution.parentSlug)
        if (!parentId) {
          verbose(`Skip "${cat.name}": parent group "${resolution.parentSlug}" not found`)
          skipped++
          break
        }
        inserts.push({
          name: cat.name,
          slug: resolution.slug,
          parent_id: parentId,
          source: 'gbp',
          source_ref: resolution.sourceRef,
          is_active: resolution.isActive,
          sort_order: 0,
        })
        break
      }
      case 'merge':
        merges.push({ existingSlug: resolution.existingSlug, gbpName: resolution.gbpName })
        break
      case 'update': {
        const parentId = parentSlugToId.get(resolution.parentSlug)
        if (!parentId) {
          skipped++
          break
        }
        updates.push({
          name: cat.name,
          slug: resolution.slug,
          parent_id: parentId,
          source: 'gbp',
          source_ref: resolution.sourceRef,
          is_active: resolution.isActive,
          sort_order: 0,
        })
        break
      }
      case 'skip':
        verbose(resolution.reason)
        skipped++
        break
    }
  }

  log(`\nResolution summary:`)
  log(`  Insert: ${inserts.length}`)
  log(`  Merge (into manual): ${merges.length}`)
  log(`  Update (existing GBP): ${updates.length}`)
  log(`  Skipped: ${skipped}`)

  if (DRY_RUN) {
    log('\n[DRY RUN] No database changes made.')
    if (VERBOSE) {
      log('\nSample inserts (first 10):')
      inserts.slice(0, 10).forEach((i) => log(`  + ${i.name} → ${i.slug} (active=${i.is_active})`))
      log('\nMerges:')
      merges.forEach((m) => log(`  ~ "${m.gbpName}" → existing "${m.existingSlug}"`))
    }
    return
  }

  // 7. Execute merges: add source_ref + synonym to existing manual categories
  let mergeCount = 0
  for (const merge of merges) {
    const existing = existingSlugs.get(merge.existingSlug)
    if (!existing) continue

    const updatedSynonyms = existing.synonyms.includes(merge.gbpName)
      ? existing.synonyms
      : [...existing.synonyms, merge.gbpName]

    const { error } = await supabase
      .from('categories')
      .update({
        source_ref: merge.gbpName,
        synonyms: updatedSynonyms,
      })
      .eq('slug', merge.existingSlug)

    if (error) {
      log(`  Merge error for "${merge.existingSlug}": ${error.message}`)
    } else {
      mergeCount++
      verbose(`Merged: "${merge.gbpName}" → "${merge.existingSlug}"`)
    }
  }

  // 8. Execute inserts in batches
  let insertCount = 0
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('categories').upsert(batch, {
      onConflict: 'slug',
      ignoreDuplicates: false,
    })

    if (error) {
      log(`  Insert batch error (offset ${i}): ${error.message}`)
    } else {
      insertCount += batch.length
    }
  }

  // 9. Execute updates in batches
  let updateCount = 0
  for (const upd of updates) {
    const { error } = await supabase
      .from('categories')
      .update({
        name: upd.name,
        parent_id: upd.parent_id,
        source: 'gbp',
        source_ref: upd.source_ref,
        is_active: upd.is_active,
      })
      .eq('slug', upd.slug)

    if (error) {
      log(`  Update error for "${upd.slug}": ${error.message}`)
    } else {
      updateCount++
    }
  }

  // 10. Summary
  log('\n=== Import Complete ===')
  log(`  New categories inserted: ${insertCount}`)
  log(`  Manual categories merged: ${mergeCount}`)
  log(`  GBP categories updated: ${updateCount}`)
  log(`  Skipped: ${skipped}`)
  log(`  New parent groups created: ${newGroupsCreated}`)

  // Quick verification
  const { count: totalCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })

  const { count: activeCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  log(`\n  Total categories in DB: ${totalCount}`)
  log(`  Active categories: ${activeCount}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
