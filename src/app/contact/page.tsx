import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact Us | HireLocalServices',
  description:
    'Get in touch with the HireLocalServices team for support, feedback, or business enquiries.',
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Contact Us
      </h1>
      <p className="mt-4 text-gray-600 leading-relaxed">
        Have a question, feedback, or need help with your listing? We&apos;d
        love to hear from you.
      </p>

      {/* Business identity card */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          HireLocalServices
        </h2>
        <dl className="mt-3 space-y-2 text-sm text-gray-600">
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500 w-16">ABN</dt>
            <dd>42 329 061 077</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500 w-16">Location</dt>
            <dd>Queensland, Australia</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500 w-16">Email</dt>
            <dd>
              <a
                href="mailto:support@hirelocalservices.com.au"
                className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                support@hirelocalservices.com.au
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-10 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            General Enquiries
          </h2>
          <p className="mt-1 text-gray-600">
            For questions about the platform, your account, or anything else,
            email us at{' '}
            <a
              href="mailto:support@hirelocalservices.com.au"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              support@hirelocalservices.com.au
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Business Listings
          </h2>
          <p className="mt-1 text-gray-600">
            Need help claiming or managing your business listing? Visit your{' '}
            <Link
              href="/dashboard"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Dashboard
            </Link>{' '}
            or use the{' '}
            <Link
              href="/claim"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Claim Listing
            </Link>{' '}
            page.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Report an Issue
          </h2>
          <p className="mt-1 text-gray-600">
            Found incorrect information or need to report a listing? Use the
            report button on any business page, or email us with details.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Data &amp; Privacy Requests
          </h2>
          <p className="mt-1 text-gray-600">
            To request access to, correction of, or deletion of your personal
            data, email us. See our{' '}
            <Link
              href="/privacy"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
        </div>
      </div>

      <div className="mt-12 rounded-lg bg-gray-50 border border-gray-200 p-6">
        <p className="text-sm text-gray-500">
          We aim to respond to all enquiries within 1&ndash;2 business days. For
          urgent matters, please include &ldquo;URGENT&rdquo; in your email
          subject line.
        </p>
      </div>
    </div>
  )
}
