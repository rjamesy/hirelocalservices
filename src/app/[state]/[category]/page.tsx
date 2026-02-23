import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AU_STATES, ITEMS_PER_PAGE } from '@/lib/constants'
import BusinessCard from '@/components/BusinessCard'
import Pagination from '@/components/Pagination'

interface StateCategoryPageProps {
  params: Promise<{ state: string; category: string }>
  searchParams: Promise<{ page?: string }>
}

const STATE_SLUG_MAP: Record<string, { code: string; label: string }> = {
  qld: { code: 'QLD', label: 'Queensland' },
  nsw: { code: 'NSW', label: 'New South Wales' },
  vic: { code: 'VIC', label: 'Victoria' },
  sa: { code: 'SA', label: 'South Australia' },
  wa: { code: 'WA', label: 'Western Australia' },
  tas: { code: 'TAS', label: 'Tasmania' },
  nt: { code: 'NT', label: 'Northern Territory' },
  act: { code: 'ACT', label: 'Australian Capital Territory' },
}

export async function generateMetadata({
  params,
}: StateCategoryPageProps): Promise<Metadata> {
  const { state, category } = await params

  const stateInfo = STATE_SLUG_MAP[state.toLowerCase()]
  if (!stateInfo) return { title: 'Not Found | HireLocalServices' }

  const supabase = await createClient()
  const { data: categoryData } = await supabase
    .from('categories')
    .select('name')
    .eq('slug', category)
    .maybeSingle()

  const categoryName = categoryData?.name || category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    title: `Find ${categoryName} Services in ${stateInfo.label} | HireLocalServices`,
    description: `Browse and compare ${categoryName.toLowerCase()} service providers in ${stateInfo.label}, Australia. Read reviews, view photos, and get in touch with local professionals.`,
    openGraph: {
      title: `${categoryName} Services in ${stateInfo.label}`,
      description: `Browse and compare ${categoryName.toLowerCase()} service providers in ${stateInfo.label}, Australia.`,
    },
  }
}

export default async function StateCategoryPage({
  params,
  searchParams,
}: StateCategoryPageProps) {
  const { state, category } = await params
  const { page: pageParam } = await searchParams
  const page = pageParam ? parseInt(pageParam, 10) : 1

  // Validate state
  const stateInfo = STATE_SLUG_MAP[state.toLowerCase()]
  if (!stateInfo) {
    notFound()
  }

  // Validate category
  const supabase = await createClient()
  const { data: categoryData } = await supabase
    .from('categories')
    .select('name, slug')
    .eq('slug', category)
    .maybeSingle()

  if (!categoryData) {
    notFound()
  }

  // Query the search RPC directly for SEO pages (bypasses user search validation)
  const offset = (page - 1) * ITEMS_PER_PAGE
  const { data: searchData, error: searchError } = await supabase.rpc('search_businesses', {
    p_category_slug: categoryData.slug,
    p_lat: null,
    p_lng: null,
    p_radius_km: 25,
    p_keyword: null,
    p_limit: ITEMS_PER_PAGE,
    p_offset: offset,
  })

  const allResults = (searchData ?? []) as Array<{
    id: string; name: string; slug: string; phone: string | null; website: string | null
    description: string | null; listing_source: string; is_claimed: boolean
    suburb: string | null; state: string | null; postcode: string | null
    service_radius_km: number | null; distance_m: number | null
    category_names: string[]; avg_rating: number | null; review_count: number
    photo_url: string | null; total_count: number
  }>
  const totalCount = allResults.length > 0 ? Number(allResults[0].total_count) : 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Filter by state
  const filteredResults = allResults.filter(
    (b) => b.state?.toUpperCase() === stateInfo.code
  )

  const baseUrl = `/${state}/${category}`

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 flex-wrap">
          <li>
            <Link href="/" className="hover:text-brand-600 transition-colors">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </li>
          <li>
            <Link
              href={`/search?category=${categoryData.slug}`}
              className="hover:text-brand-600 transition-colors"
            >
              {categoryData.name}
            </Link>
          </li>
          <li aria-hidden="true">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </li>
          <li className="text-gray-900 font-medium" aria-current="page">
            {stateInfo.label}
          </li>
        </ol>
      </nav>

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          {categoryData.name} in {stateInfo.label}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {filteredResults.length} business
          {filteredResults.length !== 1 ? 'es' : ''} found
        </p>
      </div>

      {/* Results */}
      {filteredResults.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResults.map((business) => (
              <BusinessCard
                key={business.id}
                name={business.name}
                slug={business.slug}
                suburb={business.suburb ?? ''}
                state={business.state ?? ''}
                distance_m={business.distance_m ?? undefined}
                category_names={business.category_names}
                description={business.description ?? ''}
                avg_rating={business.avg_rating ?? undefined}
                review_count={business.review_count}
                phone={business.phone ?? undefined}
                website={business.website ?? undefined}
                photo_url={business.photo_url ?? undefined}

              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-10">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                baseUrl={baseUrl}
              />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 px-8 py-16 text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
            />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            No {categoryData.name.toLowerCase()} businesses found in{' '}
            {stateInfo.label}
          </h2>
          <p className="mt-2 text-gray-600 max-w-md mx-auto">
            There are currently no listed {categoryData.name.toLowerCase()}{' '}
            providers in {stateInfo.label}. Try searching a different state or
            category.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/search?category=${categoryData.slug}`}
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Search All States
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      )}

      {/* SEO: Browse other states */}
      <section className="mt-16 border-t border-gray-200 pt-10">
        <h2 className="text-xl font-semibold text-gray-900">
          {categoryData.name} in Other States
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {AU_STATES.filter(
            (s) => s.value.toLowerCase() !== stateInfo.code.toLowerCase()
          ).map((s) => (
            <Link
              key={s.value}
              href={`/${s.value.toLowerCase()}/${categoryData.slug}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-600 transition-colors"
            >
              {categoryData.name} in {s.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
