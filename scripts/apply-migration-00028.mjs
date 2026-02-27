#!/usr/bin/env node

/**
 * Applies migration 00028_ranking_subscription_fix.sql to production
 * via the Supabase Management API.
 *
 * Usage: node scripts/apply-migration-00028.mjs
 *
 * Requires:
 *   SUPABASE_PROJECT_REF - Supabase project reference
 *   SUPABASE_ACCESS_TOKEN - Supabase access token (sbp_...)
 *
 * Or pass them as CLI args:
 *   node scripts/apply-migration-00028.mjs --ref=hqaeezfsetzyubcmbwbv --token=sbp_xxx
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse CLI args or env vars
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v]
  })
)

const projectRef = args.ref || process.env.SUPABASE_PROJECT_REF
const accessToken = args.token || process.env.SUPABASE_ACCESS_TOKEN

if (!projectRef || !accessToken) {
  console.error('Missing required: SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN')
  console.error('Usage: node scripts/apply-migration-00028.mjs --ref=<ref> --token=<token>')
  process.exit(1)
}

const migrationPath = resolve(__dirname, '../supabase/migrations/00028_ranking_subscription_fix.sql')
const sql = readFileSync(migrationPath, 'utf-8')

console.log(`Applying migration 00028 to project ${projectRef}...`)
console.log(`SQL length: ${sql.length} chars`)

async function applyMigration() {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Migration failed (HTTP ${response.status}):`)
    console.error(text)
    process.exit(1)
  }

  const result = await response.json()
  console.log('Migration applied successfully!')
  console.log('Result:', JSON.stringify(result, null, 2))
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
