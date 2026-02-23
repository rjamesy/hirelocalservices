import type { Metadata } from 'next'
import { searchBusinesses } from '@/app/actions/search'
import type { LocationToken } from '@/app/actions/search'
import SearchBar from '@/components/SearchBar'
import BusinessCard from '@/components/BusinessCard'
import Pagination from '@/components/Pagination'
import Link from 'next/link'

interface SearchPageProps {
  searchParams: Promise<{
    category?: string
    businessName?: string
    suburb?: string
    state?: string
    postcode?: string
    radius?: string
    keyword?: string
    page?: string
    // Legacy param for backward compat
    location?: string
  }>
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams
  const parts: string[] = []

  if (params.businessName) {
    parts.push(`"${params.businessName}"`)
  }
  if (params.category) {
    parts.push(params.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
  }
  if (params.suburb) {
    parts.push(`in ${params.suburb}`)
  }

  const titleSuffix = parts.length > 0 ? ` - ${parts.join(' ')}` : ''

  return {
    title: `Search Results${titleSuffix} | HireLocalServices`,
    description: `Find local service providers${titleSuffix}. Browse ratings, reviews, and contact details for trusted professionals in your area.`,
    robots: {
      index: false,
      follow: true,
    },
  }
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams

  const category = params.category || undefined
  const businessName = params.businessName || ''
  const keyword = params.keyword || undefined
  const page = params.page ? parseInt(params.page, 10) : 1
  const radiusKm = params.radius ? parseInt(params.radius, 10) : 25

  // Build location token from URL params (validated on server)
  let locationToken: LocationToken | undefined
  let locationLabel = ''

  if (params.suburb && params.state && params.postcode) {
    locationToken = {
      suburb: params.suburb,
      state: params.state,
      postcode: params.postcode,
    }
    locationLabel = `${params.suburb}, ${params.state} ${params.postcode}`
  }

  // Check if we have enough to search
  const hasBusinessName = businessName.trim().length > 0
  const hasLocation = !!locationToken

  // If nothing to search on, show empty state with guidance
  if (!hasBusinessName && !hasLocation) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <SearchBar
            variant="compact"
            defaultCategory={category}
            defaultBusinessName={businessName}
          />
        </div>
        <div data-testid="search-guidance" className="rounded-2xl border-2 border-dashed border-gray-200 px-8 py-16 text-center">
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
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            Search for local services
          </h2>
          <p className="mt-2 text-gray-600 max-w-md mx-auto">
            Enter a suburb or postcode to find services near you, or search by business name.
          </p>
        </div>
      </div>
    )
  }

  const { results, totalCount, totalPages, error } = await searchBusinesses({
    businessName: hasBusinessName ? businessName : undefined,
    category,
    location: locationToken,
    radius_km: hasLocation ? radiusKm : undefined,
    keyword,
    page,
  })

  // Build the base URL for pagination
  const paginationParams = new URLSearchParams()
  if (category) paginationParams.set('category', category)
  if (businessName) paginationParams.set('businessName', businessName)
  if (locationToken) {
    paginationParams.set('suburb', locationToken.suburb)
    paginationParams.set('state', locationToken.state)
    paginationParams.set('postcode', locationToken.postcode)
  }
  if (params.radius) paginationParams.set('radius', params.radius)
  if (keyword) paginationParams.set('keyword', keyword)
  const baseUrl = `/search?${paginationParams.toString()}`

  // Reconstruct default location token for search bar re-render
  const defaultLocationTokenForBar = locationToken
    ? { ...locationToken, lat: 0, lng: 0 }
    : null

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Bar */}
      <div className="mb-8">
        <SearchBar
          variant="compact"
          defaultCategory={category}
          defaultBusinessName={businessName}
          defaultLocation={locationLabel}
          defaultRadius={params.radius || '25'}
          defaultKeyword={keyword}
          defaultLocationToken={defaultLocationTokenForBar}
        />
      </div>

      {/* Validation Error */}
      {error && (
        <div data-testid="search-error" className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Result Count */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {totalCount > 0 ? (
            <>
              {totalCount} result{totalCount !== 1 ? 's' : ''}
              {businessName && (
                <span className="text-gray-600">
                  {' '}for &ldquo;<span className="text-gray-900">{businessName}</span>&rdquo;
                </span>
              )}
              {category && !businessName && (
                <span className="text-gray-600">
                  {' '}
                  for{' '}
                  <span className="text-gray-900">
                    {category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </span>
              )}
              {locationLabel && (
                <span className="text-gray-600">
                  {' '}
                  near{' '}
                  <span className="text-gray-900">{locationLabel}</span>
                </span>
              )}
            </>
          ) : (
            'Search Results'
          )}
        </h1>
        {keyword && (
          <p className="mt-1 text-sm text-gray-500">
            Keyword: &ldquo;{keyword}&rdquo;
          </p>
        )}
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <>
          <div data-testid="search-results" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

          {/* Pagination */}
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
      ) : !error ? (
        /* Empty State */
        <div data-testid="search-empty" className="rounded-2xl border-2 border-dashed border-gray-200 px-8 py-16 text-center">
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
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            No results found
          </h2>
          <p className="mt-2 text-gray-600 max-w-md mx-auto">
            We couldn&apos;t find any businesses matching your search. Try
            broadening your search criteria, increasing the radius, or
            searching in a different location.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/search"
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Clear Filters
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
