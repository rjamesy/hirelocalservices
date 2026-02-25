import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getBusinessBySlug } from '@/app/actions/business'
import { trackProfileView } from '@/app/actions/metrics'
import StarRating from '@/components/StarRating'
import PhotoGallery from '@/components/PhotoGallery'
import TestimonialCard from '@/components/TestimonialCard'
import ReportButton from '@/components/ReportButton'
import QRCodeContact from '@/components/QRCodeContact'
import { formatPhone } from '@/lib/utils'
import type { VerificationStatus } from '@/lib/types'

interface BusinessPageProps {
  params: Promise<{ slug: string }>
}

// ─── Verification Badge ─────────────────────────────────────────────

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    approved: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Verified' },
    review: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', label: 'Under Review' },
    pending: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', label: 'Pending Verification' },
    rejected: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Verification Failed' },
    suspended: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Suspended' },
  }

  const config = configs[status] ?? configs.pending
  const icon = status === 'approved' ? (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      {icon}
      {config.label}
    </span>
  )
}

export async function generateMetadata({
  params,
}: BusinessPageProps): Promise<Metadata> {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)

  if (!business) {
    return { title: 'Business Not Found | HireLocalServices' }
  }

  const categoryNames =
    business.categories
      ?.map((bc: { categories: { name: string } }) => bc.categories?.name)
      .filter(Boolean)
      .join(', ') || 'Services'

  const locationParts = [
    business.location?.suburb,
    business.location?.state,
  ].filter(Boolean)
  const locationStr = locationParts.join(', ')

  const title = `${business.name} - ${categoryNames}${locationStr ? ` in ${locationStr}` : ''}`
  const description =
    business.description?.slice(0, 160) ||
    `${business.name} provides ${categoryNames.toLowerCase()} services${locationStr ? ` in ${locationStr}` : ' across Australia'}.`

  return {
    title: `${title} | HireLocalServices`,
    description,
    alternates: {
      canonical: `/business/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      ...(business.photos?.[0]?.url && {
        images: [{ url: business.photos[0].url }],
      }),
    },
  }
}

export default async function BusinessPage({ params }: BusinessPageProps) {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)

  if (!business) {
    notFound()
  }

  // Track profile view (fire-and-forget)
  trackProfileView(business.id).catch(() => {})

  const location = business.location
  const categories = business.categories ?? []
  const photos = business.photos ?? []
  const testimonials = business.testimonials ?? []
  const avgRating = business.avgRating
  const reviewCount = business.reviewCount ?? 0

  const categoryNames = categories
    .map((bc: { categories: { name: string; slug: string } }) => bc.categories)
    .filter(Boolean)

  const firstCategory = categoryNames[0] || null

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
          {firstCategory && (
            <>
              <li>
                <Link
                  href={`/search?category=${firstCategory.slug}`}
                  className="hover:text-brand-600 transition-colors"
                >
                  {firstCategory.name}
                </Link>
              </li>
              <li aria-hidden="true">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </li>
            </>
          )}
          <li className="text-gray-900 font-medium" aria-current="page">
            {business.name}
          </li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                {business.name}
              </h1>
              {business.verification_status === 'approved' && (
                <VerificationBadge status="approved" />
              )}
            </div>

            {/* Categories */}
            {categoryNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {categoryNames.map(
                  (cat: { name: string; slug: string }) => (
                    <Link
                      key={cat.slug}
                      href={`/search?category=${cat.slug}`}
                      className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      {cat.name}
                    </Link>
                  )
                )}
              </div>
            )}

            {/* Location + Service Radius */}
            {location && (
              <div className="mt-3 flex items-center gap-4 text-gray-600">
                <span className="flex items-center gap-1.5">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {location.suburb ?? ''}{location.suburb && location.state ? ', ' : ''}{location.state ?? ''} {location.postcode ?? ''}
                </span>
                {location.service_radius_km ? (
                  <span className="text-sm text-gray-500">
                    Services within {location.service_radius_km} km
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">
                    Service area not specified
                  </span>
                )}
              </div>
            )}

            {/* Rating Summary */}
            {avgRating !== null && reviewCount > 0 && (
              <div className="mt-3">
                <StarRating rating={avgRating} count={reviewCount} size="lg" />
              </div>
            )}
          </div>

          {/* Description */}
          {business.description && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900">About</h2>
              <div className="mt-3 prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {business.description}
                </p>
              </div>
            </section>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900">Photos</h2>
              <div className="mt-4">
                <PhotoGallery photos={photos} />
              </div>
            </section>
          )}

          {/* Service Area */}
          {location && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900">
                Service Area
              </h2>
              <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-6">
                <div className="flex items-start gap-3">
                  <svg className="h-6 w-6 text-brand-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900">
                      Based in {location.suburb ?? ''}{location.suburb && location.state ? ', ' : ''}{location.state ?? ''}{' '}
                      {location.postcode ?? ''}
                    </p>
                    {location.service_radius_km ? (
                      <p className="mt-1 text-gray-600">
                        Servicing clients within {location.service_radius_km} km
                        of {location.suburb ?? 'this location'}
                      </p>
                    ) : (
                      <p className="mt-1 text-gray-400">
                        Service area not specified
                      </p>
                    )}
                    {location.address_text && (
                      <p className="mt-1 text-sm text-gray-500">
                        {location.address_text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Testimonials */}
          {testimonials.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Testimonials
                </h2>
                {avgRating !== null && (
                  <StarRating
                    rating={avgRating}
                    count={reviewCount}
                    size="sm"
                  />
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {testimonials.map(
                  (testimonial: {
                    id: string
                    author_name: string
                    text: string
                    rating: number
                    created_at: string
                  }) => (
                    <TestimonialCard
                      key={testimonial.id}
                      author_name={testimonial.author_name}
                      text={testimonial.text}
                      rating={testimonial.rating}
                      created_at={testimonial.created_at}
                    />
                  )
                )}
              </div>
            </section>
          )}
        </div>

        {/* Contact Sidebar */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            {business.phone || business.email_contact || business.website ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">
                  Contact {business.name}
                </h3>

                <div className="mt-5 space-y-3">
                  {/* Phone */}
                  {business.phone && (
                    <a
                      href={`tel:${business.phone}`}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      Call {formatPhone(business.phone)}
                    </a>
                  )}

                  {/* Email */}
                  {business.email_contact && (
                    <a
                      href={`mailto:${business.email_contact}`}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      Send Email
                    </a>
                  )}

                  {/* Website */}
                  {business.website && (
                    <a
                      href={
                        business.website.startsWith('http')
                          ? business.website
                          : `https://${business.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                      Visit Website
                    </a>
                  )}
                </div>

                {/* QR Code Contact */}
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <QRCodeContact
                    businessName={business.name}
                    phone={business.phone}
                    email={business.email_contact}
                    website={business.website}
                  />
                </div>

                {/* ABN */}
                {business.abn && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      ABN:{' '}
                      <span className="font-mono text-gray-700">
                        {business.abn}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Contact Information
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Contact details not available for this listing.
                </p>
                {business.claim_status === 'unclaimed' && (
                  <p className="mt-1 text-xs text-gray-400">
                    Business owners can claim this listing to add contact details.
                  </p>
                )}
              </div>
            )}

            {/* Claim this business (for unclaimed listings) */}
            {business.claim_status === 'unclaimed' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <h3 className="text-lg font-semibold text-amber-900">
                  Is this your business?
                </h3>
                <p className="mt-2 text-sm text-amber-700">
                  Claim it to manage your listing, respond to reviews, and
                  appear in search results.
                </p>
                <Link
                  href={`/dashboard/claim/${business.id}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Claim This Business
                </Link>
              </div>
            )}

            {/* Report */}
            <div className="text-center">
              <ReportButton businessId={business.id} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
