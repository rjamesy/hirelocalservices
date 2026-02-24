import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About | HireLocalServices',
  description:
    'HireLocalServices is Australia\'s local services directory, connecting homeowners with trusted tradespeople and service providers.',
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">About HireLocalServices</h1>
      <p className="mt-4 text-lg text-gray-600">
        Australia&apos;s local services directory, connecting homeowners with trusted tradespeople
        and service providers in their area.
      </p>

      <div className="mt-10 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Our Mission</h2>
          <p className="mt-1 text-gray-600">
            Finding reliable local tradespeople shouldn&apos;t be hard. HireLocalServices makes it
            simple to discover, compare, and contact verified service providers near you &mdash;
            from plumbers and electricians to cleaners and gardeners.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">For Homeowners</h2>
          <p className="mt-1 text-gray-600">
            Search by category, suburb, or business name to find local professionals. Browse
            ratings, read testimonials, and contact providers directly &mdash; all for free.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">For Businesses</h2>
          <p className="mt-1 text-gray-600">
            Claim your free listing to manage your business profile, showcase your work with photos,
            and collect customer testimonials. Affordable plans start from just $4/month.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href="/pricing"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              View pricing
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Australian Owned</h2>
          <p className="mt-1 text-gray-600">
            HireLocalServices is proudly Australian owned and operated, built specifically for the
            Australian market with nationwide coverage across all states and territories.
          </p>
        </div>
      </div>

      <div className="mt-12 rounded-lg bg-gray-50 border border-gray-200 p-6 text-center">
        <p className="text-gray-600">
          Have questions or feedback?{' '}
          <Link
            href="/contact"
            className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Get in touch
          </Link>
        </p>
      </div>
    </div>
  )
}
