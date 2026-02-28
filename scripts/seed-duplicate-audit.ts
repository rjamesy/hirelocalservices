#!/usr/bin/env npx tsx
/**
 * Seed Duplicate Audit (Phase 5)
 *
 * Detects duplicate phone numbers, website domains, and suspicious
 * high-frequency patterns in published seed listings.
 * Outputs console report + optional CSV.
 *
 * Usage:
 *   npx tsx scripts/seed-duplicate-audit.ts
 *   npx tsx scripts/seed-duplicate-audit.ts --csv ./duplicates.csv
 *   npx tsx scripts/seed-duplicate-audit.ts --region seq
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface AuditOpts {
  region: string
  csvPath: string
}

function parseArgs(): AuditOpts {
  const args = process.argv.slice(2)
  const opts: AuditOpts = { region: '', csvPath: '' }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--region':
        opts.region = args[++i]?.toLowerCase() ?? ''
        break
      case '--csv':
        opts.csvPath = args[++i] ?? ''
        break
    }
  }
  return opts
}

interface BusinessRow {
  id: string
  name: string
  slug: string
  seed_source_id: string | null
}

interface ContactRow {
  business_id: string
  phone: string | null
  website: string | null
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

async function main() {
  const opts = parseArgs()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = getSupabase()

  console.log('='.repeat(60))
  console.log('SEED DUPLICATE AUDIT')
  if (opts.region) console.log(`  Region filter: ${opts.region}`)
  console.log('='.repeat(60))

  // Load all seed businesses
  console.log('\nLoading seed businesses...')
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug, seed_source_id')
    .eq('is_seed', true)
    .eq('status', 'published')
    .is('deleted_at', null)

  if (!businesses || businesses.length === 0) {
    console.log('No seed businesses found.')
    process.exit(0)
  }

  console.log(`  ${businesses.length} seed businesses loaded`)

  // Load contacts
  console.log('Loading contacts...')
  const bizIds = businesses.map((b) => b.id)
  const contactMap = new Map<string, ContactRow>()

  for (let i = 0; i < bizIds.length; i += 500) {
    const chunk = bizIds.slice(i, i + 500)
    const { data: contacts } = await supabase
      .from('business_contacts')
      .select('business_id, phone, website')
      .in('business_id', chunk)

    for (const c of contacts ?? []) {
      contactMap.set(c.business_id, c)
    }
  }

  const csvRows: string[] = ['type,value,business_id,business_name,slug']
  let totalDupes = 0

  // ─── 1. Duplicate phone numbers ───────────────────────────────────

  console.log('\n--- Duplicate Phone Numbers ---')
  const phoneGroups = new Map<string, Array<{ id: string; name: string; slug: string }>>()

  for (const biz of businesses) {
    const contact = contactMap.get(biz.id)
    if (contact?.phone) {
      const phone = contact.phone.trim()
      if (!phoneGroups.has(phone)) phoneGroups.set(phone, [])
      phoneGroups.get(phone)!.push({ id: biz.id, name: biz.name, slug: biz.slug })
    }
  }

  const dupePhones = [...phoneGroups.entries()].filter(([, biz]) => biz.length > 1)

  if (dupePhones.length === 0) {
    console.log('  No duplicate phone numbers found.')
  } else {
    console.log(`  ${dupePhones.length} phone numbers shared by multiple businesses:`)
    for (const [phone, bizList] of dupePhones.sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${phone} (${bizList.length} businesses):`)
      for (const b of bizList) {
        console.log(`    - ${b.name} (${b.slug})`)
        csvRows.push(`phone,"${phone}",${b.id},"${b.name.replace(/"/g, '""')}",${b.slug}`)
      }
      totalDupes += bizList.length - 1
    }
  }

  // ─── 2. Duplicate website domains ─────────────────────────────────

  console.log('\n--- Duplicate Website Domains ---')
  const domainGroups = new Map<string, Array<{ id: string; name: string; slug: string; website: string }>>()

  for (const biz of businesses) {
    const contact = contactMap.get(biz.id)
    if (contact?.website) {
      const domain = extractDomain(contact.website)
      if (!domainGroups.has(domain)) domainGroups.set(domain, [])
      domainGroups.get(domain)!.push({ id: biz.id, name: biz.name, slug: biz.slug, website: contact.website })
    }
  }

  const dupeDomains = [...domainGroups.entries()].filter(([, biz]) => biz.length > 1)

  if (dupeDomains.length === 0) {
    console.log('  No duplicate website domains found.')
  } else {
    console.log(`  ${dupeDomains.length} domains shared by multiple businesses:`)
    for (const [domain, bizList] of dupeDomains.sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${domain} (${bizList.length} businesses):`)
      for (const b of bizList) {
        console.log(`    - ${b.name} (${b.slug})`)
        csvRows.push(`domain,"${domain}",${b.id},"${b.name.replace(/"/g, '""')}",${b.slug}`)
      }
      totalDupes += bizList.length - 1
    }
  }

  // ─── 3. Suspicious high-frequency patterns ────────────────────────

  console.log('\n--- Suspicious Patterns ---')

  // Check for businesses with identical names
  const nameGroups = new Map<string, Array<{ id: string; slug: string }>>()
  for (const biz of businesses) {
    const normalized = biz.name.toLowerCase().trim()
    if (!nameGroups.has(normalized)) nameGroups.set(normalized, [])
    nameGroups.get(normalized)!.push({ id: biz.id, slug: biz.slug })
  }

  const dupeNames = [...nameGroups.entries()].filter(([, biz]) => biz.length > 1)
  if (dupeNames.length > 0) {
    console.log(`  ${dupeNames.length} business names appear more than once:`)
    for (const [name, bizList] of dupeNames.sort((a, b) => b[1].length - a[1].length).slice(0, 20)) {
      console.log(`  "${name}" × ${bizList.length}`)
      for (const b of bizList) {
        csvRows.push(`name,"${name.replace(/"/g, '""')}",${b.id},"${name.replace(/"/g, '""')}",${b.slug}`)
      }
    }
    if (dupeNames.length > 20) {
      console.log(`  ... and ${dupeNames.length - 20} more`)
    }
  } else {
    console.log('  No duplicate business names found.')
  }

  // Check for high-frequency phone area codes (potential spam)
  const areaCodeCounts = new Map<string, number>()
  for (const contact of contactMap.values()) {
    if (contact.phone) {
      // Extract area code: first 6 digits for AU numbers
      const areaCode = contact.phone.replace(/\D/g, '').slice(0, 6)
      if (areaCode.length >= 6) {
        areaCodeCounts.set(areaCode, (areaCodeCounts.get(areaCode) ?? 0) + 1)
      }
    }
  }

  const suspiciousAreaCodes = [...areaCodeCounts.entries()]
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])

  if (suspiciousAreaCodes.length > 0) {
    console.log(`\n  High-frequency phone prefixes (>= 10 occurrences):`)
    for (const [prefix, count] of suspiciousAreaCodes) {
      console.log(`    +${prefix}...: ${count} businesses`)
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60))
  console.log('--- AUDIT SUMMARY ---')
  console.log(`  Total seed businesses:    ${businesses.length}`)
  console.log(`  Duplicate phones:         ${dupePhones.length} groups`)
  console.log(`  Duplicate domains:        ${dupeDomains.length} groups`)
  console.log(`  Duplicate names:          ${dupeNames.length} groups`)
  console.log(`  Total duplicate entries:   ${totalDupes}`)
  console.log('='.repeat(60))

  // ─── CSV output ───────────────────────────────────────────────────

  if (opts.csvPath && csvRows.length > 1) {
    writeFileSync(opts.csvPath, csvRows.join('\n'), 'utf-8')
    console.log(`\nCSV written to: ${opts.csvPath}`)
  } else if (opts.csvPath) {
    console.log('\nNo duplicates to write to CSV.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
