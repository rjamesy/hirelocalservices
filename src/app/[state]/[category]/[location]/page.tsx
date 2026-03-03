import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { searchBusinesses, lookupPostcode, lookupSuburb } from '@/app/actions/search'
import BusinessCard from '@/components/BusinessCard'
import Pagination from '@/components/Pagination'
import SearchImpressionTracker from '@/components/SearchImpressionTracker'
import { formatDistance } from '@/lib/utils'
import { AU_STATES } from '@/lib/constants'

interface LocationPageProps {
  params: Promise<{ state: string; category: string; location: string }>
  searchParams: Promise<{ page?: string; radius?: string }>
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

async function resolveLocation(locationSlug: string) {
  const isPostcode = /^\d{4}$/.test(locationSlug)

  if (isPostcode) {
    const result = await lookupPostcode(locationSlug)
    if (result) {
      return { ...result, postcode: locationSlug }
    }
    return null
  }

  // Try suburb name (slugs use hyphens, suburb names use spaces)
  const suburbs = await lookupSuburb(locationSlug.replace(/-/g, ' '))
  if (suburbs && suburbs.length > 0) {
    return suburbs[0]
  }

  return null
}

export async function generateMetadata({
  params,
}: LocationPageProps): Promise<Metadata> {
  const { state, category, location } = await params

  const stateInfo = STATE_SLUG_MAP[state.toLowerCase()]
  if (!stateInfo) return { title: 'Not Found | HireLocalServices' }

  const supabase = await createClient()
  const { data: categoryRow } = await supabase
    .from('categories')
    .select('name')
    .eq('slug', category)
    .maybeSingle()

  const categoryName =
    (categoryRow as { name: string } | null)?.name ||
    category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const locationData = await resolveLocation(location)
  const locationName = locationData
    ? locationData.suburb
    : location.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const title = `${categoryName} in ${locationName}, ${stateInfo.code}`
  const description = `Find ${categoryName.toLowerCase()} services in ${locationName}, ${stateInfo.label}. Browse local professionals, read reviews, and get quotes from trusted providers near you.`

  return {
    title: `${title} | HireLocalServices`,
    description,
    openGraph: {
      title,
      description,
    },
  }
}

export default async function LocationPage({
  params,
  searchParams,
}: LocationPageProps) {
  const { state, category, location } = await params
  const { page: pageParam, radius: radiusParam } = await searchParams
  const page = pageParam ? parseInt(pageParam, 10) : 1
  const radiusKm = radiusParam ? parseInt(radiusParam, 10) : 25

  // Validate state
  const stateInfo = STATE_SLUG_MAP[state.toLowerCase()]
  if (!stateInfo) {
    notFound()
  }

  // Validate category
  const supabase = await createClient()
  const { data: categoryRow } = await supabase
    .from('categories')
    .select('name, slug, description')
    .eq('slug', category)
    .maybeSingle()

  const categoryData = categoryRow as { name: string; slug: string; description: string | null } | null
  if (!categoryData) {
    notFound()
  }

  // Resolve location
  const locationData = await resolveLocation(location)
  if (!locationData) {
    notFound()
  }

  const locationName = locationData.suburb
  const locationDisplay = `${locationName}, ${stateInfo.code}`

  // Search with geo filter
  const { results, totalCount, totalPages } = await searchBusinesses({
    category: categoryData.slug,
    location: {
      suburb: locationData.suburb,
      state: locationData.state,
      postcode: locationData.postcode,
    },
    radius_km: radiusKm,
    page,
  })

  const baseUrl = `/${state}/${category}/${location}`

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
          <li>
            <Link
              href={`/${state}/${category}`}
              className="hover:text-brand-600 transition-colors"
            >
              {stateInfo.label}
            </Link>
          </li>
          <li aria-hidden="true">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </li>
          <li className="text-gray-900 font-medium" aria-current="page">
            {locationName}
          </li>
        </ol>
      </nav>

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          {categoryData.name} in {locationDisplay}
        </h1>
        {categoryData.description && (
          <p className="mt-3 text-lg text-gray-600 max-w-3xl">
            {categoryData.description}
          </p>
        )}
        <p className="mt-2 text-sm text-gray-500">
          {totalCount} result{totalCount !== 1 ? 's' : ''} within {radiusKm} km
          of {locationName}
        </p>
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((business) => (
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

          <SearchImpressionTracker businessIds={results.map(r => r.id)} />

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
              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            No {categoryData.name.toLowerCase()} businesses found near{' '}
            {locationName}
          </h2>
          <p className="mt-2 text-gray-600 max-w-md mx-auto">
            We couldn&apos;t find any {categoryData.name.toLowerCase()}{' '}
            providers within {radiusKm} km of {locationName}. Try expanding
            your search radius or browsing a wider area.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/${state}/${category}`}
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Browse All of {stateInfo.label}
            </Link>
            <Link
              href={`/search?category=${categoryData.slug}&location=${location}`}
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Adjust Search
            </Link>
          </div>
        </div>
      )}

      {/* Nearby locations SEO links */}
      <section className="mt-16 border-t border-gray-200 pt-10">
        <h2 className="text-xl font-semibold text-gray-900">
          {categoryData.name} in {stateInfo.label}
        </h2>
        <p className="mt-2 text-gray-600">
          Can&apos;t find what you need in {locationName}? Browse{' '}
          {categoryData.name.toLowerCase()} providers across{' '}
          {stateInfo.label}.
        </p>
        <div className="mt-4">
          <Link
            href={`/${state}/${category}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            View all {categoryData.name.toLowerCase()} in {stateInfo.label}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
