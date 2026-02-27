import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SearchBar from '@/components/SearchBar'
import CategoryGrid from '@/components/CategoryGrid'

export const metadata: Metadata = {
  title: 'HireLocalServices | Australia\'s Local Business Directory',
  description:
    'Search and discover local service providers across Australia. HireLocalServices connects customers with plumbers, electricians, cleaners, gardeners, and more.',
  openGraph: {
    title: 'HireLocalServices | Australia\'s Local Business Directory',
    description:
      'Search and discover local service providers across Australia. HireLocalServices connects customers with plumbers, electricians, cleaners, gardeners, and more.',
    type: 'website',
  },
}

const steps = [
  {
    number: '1',
    title: 'Search',
    description:
      'Enter your suburb or postcode and choose a service category to find local professionals near you.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Compare',
    description:
      'Browse profiles, read testimonials, view photos, and compare service providers side by side.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Contact',
    description:
      'Get in touch directly with the service provider by phone, email, or through their website.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
        />
      </svg>
    ),
  },
]

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch top categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .is('parent_id', null)
    .order('name', { ascending: true })
    .limit(12)

  return (
    <>
      {/* Hero Section */}
      <section data-testid="hero-section" className="relative bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
        <div className="absolute inset-0 opacity-10 bg-[length:40px_40px] bg-[image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 data-testid="hero-heading" className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Welcome to HireLocalServices — Australia&apos;s Local Business Directory
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-brand-100 leading-relaxed">
              HireLocalServices connects individuals and businesses with trusted
              local service providers across Australia. From plumbers and
              electricians to cleaners, gardeners, removalists, and more —
              discover reliable professionals in your area.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <SearchBar variant="hero" />
          </div>
        </div>
      </section>

      {/* Built to Connect Local Communities */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Built to Connect Local Communities
          </h2>
          <p className="mt-4 text-lg text-gray-600 leading-relaxed">
            HireLocalServices is an independent Australian directory platform
            designed to make finding and managing local services simple and
            transparent.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Comprehensive service categories across Australia',
              icon: (
                <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
                </svg>
              ),
            },
            {
              label: 'Verified claim process for business owners',
              icon: (
                <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              ),
            },
            {
              label: 'Clear business profile management tools',
              icon: (
                <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              ),
            },
            {
              label: 'Transparent listing policies',
              icon: (
                <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
              <p className="text-sm font-medium text-gray-700">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-gray-600 leading-relaxed">
          Our platform is structured to support both customers searching for
          services and business owners seeking visibility.
        </p>
      </section>

      {/* Popular Categories */}
      <section data-testid="categories-section" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Popular Categories
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Browse services by category to find exactly what you need
          </p>
        </div>
        <div className="mt-10">
          <CategoryGrid categories={categories ?? []} />
        </div>
      </section>

      {/* How It Works */}
      <section data-testid="how-it-works-section" className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              How It Works
            </h2>
            <p className="mt-3 text-lg text-gray-600">
              Finding a local service provider is easy
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative rounded-2xl bg-white p-8 shadow-sm border border-gray-100 text-center"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                  {step.icon}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">
                  {step.title}
                </h3>
                <p className="mt-3 text-gray-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Use HireLocalServices? */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Why Use HireLocalServices?
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
          {/* For Customers */}
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900">
              For Customers
            </h3>
            <ul className="mt-5 space-y-3">
              {[
                'Quickly search by service and location',
                'Compare providers in your area',
                'Directly contact businesses',
                'Transparent business information',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-600">
                  <svg className="h-5 w-5 flex-shrink-0 text-brand-600 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {/* For Business Owners */}
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900">
              For Business Owners
            </h3>
            <ul className="mt-5 space-y-3">
              {[
                'Claim and manage your listing',
                'Keep business details accurate',
                'Increase visibility to local customers',
                'Affordable subscription options',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-600">
                  <svg className="h-5 w-5 flex-shrink-0 text-brand-600 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* List Your Business CTA */}
      <section data-testid="cta-section" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 px-8 py-14 sm:px-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            List Your Business on HireLocalServices
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100 leading-relaxed">
            Gain visibility in your local area and manage your business profile
            with ease.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login?redirect=/dashboard"
              data-testid="cta-get-started-link"
              className="rounded-lg bg-white px-8 py-3 text-base font-semibold text-brand-700 shadow-sm hover:bg-brand-50 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border-2 border-white/30 px-8 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Governance Confidence Line */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <p className="text-center text-sm text-gray-500 leading-relaxed">
          HireLocalServices operates as an independent Australian online
          directory platform. We do not guarantee or endorse listed service
          providers. Users should conduct independent due diligence before
          engaging any business.
        </p>
      </section>
    </>
  )
}
