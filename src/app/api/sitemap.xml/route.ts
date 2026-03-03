import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils'

export const revalidate = 3600 // Revalidate every hour

export async function GET() {
  const supabase = createAdminClient()
  const baseUrl = getBaseUrl()

  // Fetch all published businesses with active billing
  const { data: businesses } = await supabase
    .from('businesses')
    .select('slug, updated_at')
    .eq('status', 'published')
    .in('billing_status', ['active', 'trial', 'seed'] as any[])

  // Fetch all categories for category pages
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, parent_id')

  // Fetch distinct states from business_locations for state + category pages
  const { data: locations } = await supabase
    .from('business_locations')
    .select('state')

  // Deduplicate states
  const states = Array.from(
    new Set((locations ?? []).map((loc: { state: string | null }) => loc.state).filter(Boolean))
  ) as string[]

  // Build the XML sitemap
  const today = new Date().toISOString().split('T')[0]

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Static pages -->
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/search</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
`

  // Business profile pages
  if (businesses) {
    for (const biz of businesses) {
      const lastmod = biz.updated_at
        ? new Date(biz.updated_at).toISOString().split('T')[0]
        : today

      xml += `  <url>
    <loc>${baseUrl}/business/${biz.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`
    }
  }

  // Category pages
  if (categories) {
    for (const cat of categories) {
      xml += `  <url>
    <loc>${baseUrl}/search?category=${cat.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
`

      // State + category combination pages
      for (const state of states) {
        const stateSlug = state.toLowerCase()
        xml += `  <url>
    <loc>${baseUrl}/${stateSlug}/${cat.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
`
      }
    }
  }

  xml += `</urlset>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
