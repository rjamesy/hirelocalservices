import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SearchBar from '@/components/SearchBar'
import CategoryGrid from '@/components/CategoryGrid'

export const metadata: Metadata = {
  title: 'HireLocalServices - Find Local Services Across Australia',
  description:
    'Find and hire trusted local service professionals across Australia. Browse cleaners, plumbers, electricians, gardeners, and more in your area.',
  openGraph: {
    title: 'HireLocalServices - Find Local Services Across Australia',
    description:
      'Find and hire trusted local service professionals across Australia. Browse cleaners, plumbers, electricians, gardeners, and more in your area.',
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
      <section className="relative bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
        <div className="absolute inset-0 opacity-10 bg-[length:40px_40px] bg-[image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Find Local Services Across Australia
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-brand-100 leading-relaxed">
              Connect with trusted local professionals in your area. From
              plumbers to cleaners, electricians to gardeners — find the right
              service provider for every job.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <SearchBar variant="hero" />
          </div>
        </div>
      </section>

      {/* Popular Categories */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
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
      <section className="bg-gray-50 py-16 sm:py-20">
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

      {/* List Your Business CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 px-8 py-14 sm:px-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            List Your Business
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100 leading-relaxed">
            Get your business in front of local customers searching for your
            services. Create your profile, add photos, and start receiving
            enquiries — all for just $4/month.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/pricing"
              className="rounded-lg bg-white px-8 py-3 text-base font-semibold text-brand-700 shadow-sm hover:bg-brand-50 transition-colors"
            >
              View Pricing
            </Link>
            <Link
              href="/login?redirect=/dashboard"
              className="rounded-lg border-2 border-white/30 px-8 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
