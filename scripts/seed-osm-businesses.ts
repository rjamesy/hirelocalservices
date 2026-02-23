/**
 * seed-osm-businesses.ts
 *
 * Fetches real Australian business data from OpenStreetMap via the Overpass API,
 * maps them to our category system, and inserts them into Supabase as seed listings.
 *
 * Usage:
 *   npx tsx scripts/seed-osm-businesses.ts
 *
 * Requires env vars (reads from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
config({ path: '.env.local' })

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const BATCH_SIZE = 50
const TARGET_TOTAL = 1000
// Admin user ID used as owner_id for seed listings
let ADMIN_USER_ID: string

// City-level bounding boxes [south, west, north, east] — smaller areas for reliable Overpass queries
type CityRegion = { name: string; state: string; bbox: [number, number, number, number]; target: number }

const CITY_REGIONS: CityRegion[] = [
  // NSW
  { name: 'Sydney CBD',     state: 'NSW', bbox: [-33.92, 151.14, -33.82, 151.25], target: 70 },
  { name: 'Sydney West',    state: 'NSW', bbox: [-33.88, 150.90, -33.76, 151.05], target: 50 },
  { name: 'Sydney North',   state: 'NSW', bbox: [-33.78, 151.15, -33.68, 151.29], target: 40 },
  { name: 'Newcastle',      state: 'NSW', bbox: [-32.97, 151.70, -32.87, 151.82], target: 30 },
  { name: 'Wollongong',     state: 'NSW', bbox: [-34.48, 150.85, -34.38, 150.95], target: 20 },
  { name: 'Sydney South',   state: 'NSW', bbox: [-34.05, 151.05, -33.93, 151.20], target: 40 },
  // VIC
  { name: 'Melbourne CBD',  state: 'VIC', bbox: [-37.85, 144.92, -37.78, 145.00], target: 60 },
  { name: 'Melbourne East', state: 'VIC', bbox: [-37.83, 145.00, -37.73, 145.15], target: 50 },
  { name: 'Melbourne West', state: 'VIC', bbox: [-37.83, 144.78, -37.75, 144.92], target: 40 },
  { name: 'Geelong',        state: 'VIC', bbox: [-38.20, 144.30, -38.10, 144.40], target: 25 },
  { name: 'Melbourne North',state: 'VIC', bbox: [-37.72, 144.95, -37.63, 145.10], target: 25 },
  // QLD
  { name: 'Brisbane CBD',   state: 'QLD', bbox: [-27.50, 152.98, -27.43, 153.06], target: 50 },
  { name: 'Brisbane South', state: 'QLD', bbox: [-27.58, 152.98, -27.50, 153.10], target: 35 },
  { name: 'Brisbane North', state: 'QLD', bbox: [-27.40, 152.95, -27.32, 153.08], target: 25 },
  { name: 'Gold Coast',     state: 'QLD', bbox: [-28.10, 153.38, -27.95, 153.48], target: 35 },
  { name: 'Sunshine Coast', state: 'QLD', bbox: [-26.72, 153.05, -26.62, 153.15], target: 15 },
  { name: 'Townsville',     state: 'QLD', bbox: [-19.32, 146.74, -19.24, 146.82], target: 15 },
  // SA
  { name: 'Adelaide CBD',   state: 'SA',  bbox: [-34.96, 138.56, -34.88, 138.64], target: 40 },
  { name: 'Adelaide North', state: 'SA',  bbox: [-34.85, 138.58, -34.78, 138.70], target: 20 },
  { name: 'Adelaide South', state: 'SA',  bbox: [-35.05, 138.50, -34.97, 138.62], target: 15 },
  // WA
  { name: 'Perth CBD',      state: 'WA',  bbox: [-31.98, 115.82, -31.90, 115.90], target: 40 },
  { name: 'Perth North',    state: 'WA',  bbox: [-31.88, 115.78, -31.80, 115.90], target: 30 },
  { name: 'Perth South',    state: 'WA',  bbox: [-32.10, 115.80, -32.00, 115.90], target: 20 },
  { name: 'Fremantle',      state: 'WA',  bbox: [-32.08, 115.72, -32.02, 115.80], target: 10 },
  // TAS
  { name: 'Hobart',         state: 'TAS', bbox: [-42.92, 147.28, -42.84, 147.38], target: 25 },
  { name: 'Launceston',     state: 'TAS', bbox: [-41.48, 147.10, -41.40, 147.20], target: 25 },
  // NT
  { name: 'Darwin',         state: 'NT',  bbox: [-12.50, 130.82, -12.40, 130.92], target: 25 },
  { name: 'Alice Springs',  state: 'NT',  bbox: [-23.74, 133.82, -23.68, 133.90], target: 25 },
  // ACT
  { name: 'Canberra',       state: 'ACT', bbox: [-35.35, 149.05, -35.22, 149.20], target: 70 },
  { name: 'Belconnen',      state: 'ACT', bbox: [-35.25, 149.04, -35.20, 149.10], target: 30 },
]

// ---------------------------------------------------------------------------
// OSM tag → category slug mapping
// ---------------------------------------------------------------------------

type CategoryMapping = {
  osmTags: Record<string, string | string[]>
  categorySlug: string
}

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  // Cleaning
  { osmTags: { shop: 'dry_cleaning' }, categorySlug: 'house-cleaning' },
  { osmTags: { shop: 'laundry' }, categorySlug: 'house-cleaning' },

  // Home Maintenance
  { osmTags: { craft: 'plumber' }, categorySlug: 'plumbing' },
  { osmTags: { craft: 'electrician' }, categorySlug: 'electrical' },
  { osmTags: { craft: 'painter' }, categorySlug: 'painting' },
  { osmTags: { craft: 'carpenter' }, categorySlug: 'carpentry' },
  { osmTags: { craft: 'roofer' }, categorySlug: 'roofing' },
  { osmTags: { shop: 'hardware' }, categorySlug: 'handyman' },
  { osmTags: { craft: 'hvac' }, categorySlug: 'aircon-cleaning' },

  // Outdoor
  { osmTags: { shop: 'garden_centre' }, categorySlug: 'gardening' },
  { osmTags: { office: 'landscaping' }, categorySlug: 'landscaping' },
  { osmTags: { shop: 'agrarian' }, categorySlug: 'lawn-mowing' },

  // Automotive
  { osmTags: { shop: 'car_repair' }, categorySlug: 'mobile-mechanic' },
  { osmTags: { shop: 'car' }, categorySlug: 'car-detailing' },
  { osmTags: { shop: 'tyres' }, categorySlug: 'mobile-mechanic' },
  { osmTags: { amenity: 'car_wash' }, categorySlug: 'car-detailing' },

  // Moving & Delivery
  { osmTags: { office: 'moving_company' }, categorySlug: 'removalists' },
  { osmTags: { office: 'courier' }, categorySlug: 'courier' },
  { osmTags: { amenity: 'waste_disposal' }, categorySlug: 'rubbish-removal' },

  // Pest Control
  { osmTags: { office: 'pest_control' }, categorySlug: 'general-pest-control' },

  // Pet Services
  { osmTags: { shop: 'pet_grooming' }, categorySlug: 'pet-grooming' },
  { osmTags: { shop: 'pet' }, categorySlug: 'pet-grooming' },
  { osmTags: { amenity: 'veterinary' }, categorySlug: 'pet-grooming' },

  // Beauty & Wellness
  { osmTags: { shop: 'hairdresser' }, categorySlug: 'mobile-hairdresser' },
  { osmTags: { shop: 'beauty' }, categorySlug: 'mobile-beauty' },
  { osmTags: { shop: 'massage' }, categorySlug: 'massage-therapist' },
  { osmTags: { amenity: 'spa' }, categorySlug: 'massage-therapist' },

  // IT & Tech
  { osmTags: { shop: 'computer' }, categorySlug: 'computer-repair' },
  { osmTags: { shop: 'electronics' }, categorySlug: 'computer-repair' },
  { osmTags: { shop: 'mobile_phone' }, categorySlug: 'phone-repair' },

  // Events
  { osmTags: { amenity: 'events_venue' }, categorySlug: 'party-hire' },
  { osmTags: { shop: 'photo' }, categorySlug: 'photography' },
  { osmTags: { amenity: 'catering' }, categorySlug: 'catering' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface SeedBusiness {
  name: string
  slug: string
  phone: string | null
  website: string | null
  description: string | null
  lat: number
  lng: number
  suburb: string | null
  state: string
  postcode: string | null
  categorySlug: string
  osmId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanPhone(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9+]/g, '')
  // Must look like an Australian phone number
  if (cleaned.match(/^(\+?61|0[2-9])/)) return cleaned
  return null
}

function cleanWebsite(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    return url.toString()
  } catch {
    return null
  }
}

function matchCategory(tags: Record<string, string>): string | null {
  for (const mapping of CATEGORY_MAPPINGS) {
    for (const [key, values] of Object.entries(mapping.osmTags)) {
      const tagValue = tags[key]
      if (!tagValue) continue
      const allowed = Array.isArray(values) ? values : [values]
      if (allowed.includes(tagValue)) {
        return mapping.categorySlug
      }
    }
  }
  return null
}

// State bounding boxes (loose) for coordinate-to-state mapping
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  NSW: [-37.5, 140.9, -28.1, 153.7],
  VIC: [-39.2, 140.9, -33.9, 150.0],
  QLD: [-29.2, 137.9, -10.0, 153.6],
  SA:  [-38.1, 129.0, -25.9, 141.0],
  WA:  [-35.2, 112.9, -13.7, 129.0],
  TAS: [-43.7, 143.8, -39.5, 148.5],
  NT:  [-26.0, 129.0, -10.9, 138.0],
  ACT: [-35.9, 148.7, -35.1, 149.4],
}

function stateFromCoords(lat: number, lng: number): string | null {
  for (const [state, [south, west, north, east]] of Object.entries(STATE_BOUNDS)) {
    if (lat >= south && lat <= north && lng >= west && lng <= east) {
      return state
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Overpass queries
// ---------------------------------------------------------------------------

function buildOverpassQuery(state: string, bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox
  const bboxStr = `${south},${west},${north},${east}`

  // Build a union of all OSM tag queries relevant to our categories
  const tagQueries: string[] = []
  const seenTags = new Set<string>()

  for (const mapping of CATEGORY_MAPPINGS) {
    for (const [key, values] of Object.entries(mapping.osmTags)) {
      const allowed = Array.isArray(values) ? values : [values]
      for (const val of allowed) {
        const tagKey = `${key}=${val}`
        if (seenTags.has(tagKey)) continue
        seenTags.add(tagKey)
        tagQueries.push(`  nwr["${key}"="${val}"]["name"](${bboxStr});`)
      }
    }
  }

  return `
[out:json][timeout:60];
(
${tagQueries.join('\n')}
);
out center tags;
`.trim()
}

async function queryOverpass(query: string): Promise<OsmElement[]> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Overpass API error ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json()
  return json.elements ?? []
}

// ---------------------------------------------------------------------------
// Process OSM elements into seed businesses
// ---------------------------------------------------------------------------

function processElements(elements: OsmElement[], state: string): SeedBusiness[] {
  const results: SeedBusiness[] = []

  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = tags.name
    if (!name || name.length < 3 || name.length > 100) continue

    const categorySlug = matchCategory(tags)
    if (!categorySlug) continue

    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!lat || !lng) continue

    // Determine state from coordinates (more accurate than bbox assumption)
    const detectedState = stateFromCoords(lat, lng) ?? state

    const phone = cleanPhone(tags.phone ?? tags['contact:phone'])
    const website = cleanWebsite(tags.website ?? tags['contact:website'])

    // Build a description from available tags
    const descParts: string[] = []
    if (tags.description) {
      descParts.push(tags.description)
    } else {
      // Generate a basic description
      const catName = categorySlug.replace(/-/g, ' ')
      const suburb = tags['addr:suburb'] ?? tags['addr:city'] ?? ''
      descParts.push(
        `${name} provides ${catName} services${suburb ? ` in ${suburb}` : ''}, ${detectedState}. Contact us for a quote.`
      )
    }

    const description = descParts.join(' ').slice(0, 2000)
    if (description.length < 10) continue

    const osmId = `${el.type}/${el.id}`
    const baseSlug = slugify(name)
    // Add a short hash from osmId to ensure uniqueness
    const hash = Math.abs(el.id).toString(36).slice(0, 4)
    const slug = `${baseSlug}-${hash}`

    results.push({
      name,
      slug,
      phone,
      website,
      description,
      lat,
      lng,
      suburb: tags['addr:suburb'] ?? tags['addr:city'] ?? null,
      state: detectedState,
      postcode: tags['addr:postcode'] ?? null,
      categorySlug,
      osmId,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== OSM Business Seed Script ===\n')

  // 1. Look up admin user
  const { data: adminProfile, error: adminError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (adminError || !adminProfile) {
    console.error('No admin user found. Create one first.')
    process.exit(1)
  }
  ADMIN_USER_ID = adminProfile.id
  console.log(`Admin user: ${ADMIN_USER_ID}`)

  // 2. Fetch all categories (slug → id map)
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, slug')

  if (catError || !categories) {
    console.error('Failed to fetch categories:', catError)
    process.exit(1)
  }

  const categoryMap = new Map<string, string>()
  for (const cat of categories) {
    categoryMap.set(cat.slug, cat.id)
  }
  console.log(`Loaded ${categoryMap.size} categories`)

  // 3. Check existing seed businesses to avoid duplicates
  const { count: existingCount } = await supabase
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('is_seed', true)

  console.log(`Existing seed businesses: ${existingCount ?? 0}`)
  const remaining = TARGET_TOTAL - (existingCount ?? 0)
  if (remaining <= 0) {
    console.log('Target already reached. Exiting.')
    return
  }
  console.log(`Need ${remaining} more businesses\n`)

  // 4. Query each city region via Overpass API
  const allBusinesses: SeedBusiness[] = []
  const seenOsmIds = new Set<string>()
  const seenSlugs = new Set<string>()

  // Also check existing slugs in DB
  const { data: existingSlugs } = await supabase
    .from('businesses')
    .select('slug, seed_source_id')
    .eq('is_seed', true)

  if (existingSlugs) {
    for (const b of existingSlugs) {
      seenSlugs.add(b.slug)
      if (b.seed_source_id) seenOsmIds.add(b.seed_source_id)
    }
  }
  console.log(`Existing slugs cached: ${seenSlugs.size}\n`)

  for (const region of CITY_REGIONS) {
    if (allBusinesses.length >= remaining) {
      console.log(`Reached target of ${remaining}. Stopping queries.`)
      break
    }

    const target = Math.min(region.target, remaining - allBusinesses.length)
    console.log(`Querying ${region.name}, ${region.state} (target: ${target})...`)

    try {
      const query = buildOverpassQuery(region.state, region.bbox)
      const elements = await queryOverpass(query)
      console.log(`  ${region.name}: ${elements.length} raw elements from OSM`)

      const processed = processElements(elements, region.state)

      // Dedup and take what we need
      let added = 0
      for (const biz of processed) {
        if (added >= target) break
        if (seenOsmIds.has(biz.osmId)) continue
        if (seenSlugs.has(biz.slug)) continue

        seenOsmIds.add(biz.osmId)
        seenSlugs.add(biz.slug)

        // Only include if we have the category in our DB
        if (!categoryMap.has(biz.categorySlug)) continue

        allBusinesses.push(biz)
        added++
      }

      console.log(`  ${region.name}: ${added} businesses selected (running total: ${allBusinesses.length})`)
    } catch (err: any) {
      const msg = err.message?.slice(0, 100) || String(err)
      console.error(`  ${region.name}: Overpass query failed: ${msg}`)
      // If rate limited, wait longer
      if (msg.includes('429')) {
        console.log('  Rate limited. Waiting 30s...')
        await delay(30000)
      }
    }

    // Rate limit: wait between queries
    await delay(3000)
  }

  console.log(`\nTotal businesses to insert: ${allBusinesses.length}\n`)
  if (allBusinesses.length === 0) {
    console.log('No businesses to insert.')
    return
  }

  // 5. Insert in batches
  let totalInserted = 0

  for (let i = 0; i < allBusinesses.length; i += BATCH_SIZE) {
    const batch = allBusinesses.slice(i, i + BATCH_SIZE)

    // Insert businesses
    const businessRows = batch.map((biz) => ({
      owner_id: ADMIN_USER_ID,
      name: biz.name,
      slug: biz.slug,
      phone: biz.phone,
      website: biz.website,
      description: biz.description,
      status: 'published' as const,
      is_seed: true,
      claim_status: 'unclaimed' as const,
      seed_source: 'osm',
      seed_source_id: biz.osmId,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('businesses')
      .insert(businessRows)
      .select('id, slug')

    if (insertError) {
      console.error(`Batch ${i / BATCH_SIZE + 1} insert error:`, insertError.message)
      continue
    }

    if (!inserted || inserted.length === 0) continue

    // Build a slug → inserted id map
    const slugToId = new Map<string, string>()
    for (const row of inserted) {
      slugToId.set(row.slug, row.id)
    }

    // Insert locations via upsert_business_location RPC
    for (const biz of batch) {
      const businessId = slugToId.get(biz.slug)
      if (!businessId) continue

      // Try to fill in missing suburb/postcode from our postcodes table
      let suburb = biz.suburb
      let postcode = biz.postcode
      let state = biz.state

      if (!suburb || !postcode) {
        // Find nearest postcode in our database
        // Simple: pick closest by lat/lng from postcodes table
        const { data: nearestPc } = await supabase
          .from('postcodes')
          .select('suburb, postcode, state')
          .gte('lat', biz.lat - 0.1)
          .lte('lat', biz.lat + 0.1)
          .gte('lng', biz.lng - 0.1)
          .lte('lng', biz.lng + 0.1)
          .limit(1)

        if (nearestPc && nearestPc.length > 0) {
          suburb = suburb ?? nearestPc[0].suburb
          postcode = postcode ?? nearestPc[0].postcode
          state = nearestPc[0].state
        }
      }

      await supabase.rpc('upsert_business_location', {
        p_business_id: businessId,
        p_suburb: suburb,
        p_state: state,
        p_postcode: postcode,
        p_lat: biz.lat,
        p_lng: biz.lng,
        p_service_radius_km: 25,
      })
    }

    // Insert business_categories
    const categoryRows: { business_id: string; category_id: string }[] = []
    for (const biz of batch) {
      const businessId = slugToId.get(biz.slug)
      const categoryId = categoryMap.get(biz.categorySlug)
      if (businessId && categoryId) {
        categoryRows.push({ business_id: businessId, category_id: categoryId })
      }
    }

    if (categoryRows.length > 0) {
      const { error: catInsertError } = await supabase
        .from('business_categories')
        .insert(categoryRows)

      if (catInsertError) {
        console.error(`  Category insert error:`, catInsertError.message)
      }
    }

    totalInserted += inserted.length
    console.log(
      `Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${inserted.length} businesses (total: ${totalInserted})`
    )

    // Small delay between batches
    await delay(500)
  }

  console.log(`\n=== Done! Inserted ${totalInserted} seed businesses ===`)

  // 6. Verify counts
  const { count: finalCount } = await supabase
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('is_seed', true)

  console.log(`Total seed businesses in database: ${finalCount}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
