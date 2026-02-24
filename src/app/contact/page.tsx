import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact Us | HireLocalServices',
  description:
    'Get in touch with the HireLocalServices team for support, feedback, or business enquiries.',
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Contact Us</h1>
      <p className="mt-4 text-gray-600">
        Have a question, feedback, or need help with your listing? We&apos;d love to hear from you.
      </p>

      <div className="mt-10 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">General Enquiries</h2>
          <p className="mt-1 text-gray-600">
            Email us at{' '}
            <a
              href="mailto:support@hirelocalservices.com.au"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              support@hirelocalservices.com.au
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Business Listings</h2>
          <p className="mt-1 text-gray-600">
            Need help claiming or managing your business listing? Visit your{' '}
            <Link
              href="/dashboard"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Dashboard
            </Link>{' '}
            or email us for assistance.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Report an Issue</h2>
          <p className="mt-1 text-gray-600">
            Found incorrect information or need to report a listing? Use the report button on any
            business page, or email us with details.
          </p>
        </div>
      </div>

      <div className="mt-12 rounded-lg bg-gray-50 border border-gray-200 p-6">
        <p className="text-sm text-gray-500">
          We aim to respond to all enquiries within 1&ndash;2 business days. For urgent matters,
          please include &ldquo;URGENT&rdquo; in your email subject line.
        </p>
      </div>
    </div>
  )
}
