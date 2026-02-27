import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | HireLocalServices',
  description:
    'Privacy Policy for HireLocalServices. Learn how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-4 text-sm text-gray-500">
        Last updated: 28 February 2026
      </p>

      <div className="mt-8 prose prose-gray max-w-none">
        {/* 1. Who We Are */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          1. Who We Are
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is operated by an Australian sole trader
          (ABN 42 329 061 077) based in Queensland, Australia. We run{' '}
          <Link href="/" className="text-brand-600 hover:text-brand-700 underline">
            hirelocalservices.com.au
          </Link>
          , an online directory connecting Australians with local service providers.
        </p>

        {/* 2. What We Collect */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          2. What We Collect
        </h2>

        <h3 className="text-lg font-medium text-gray-800 mt-5">
          Account information
        </h3>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Email address and an optional display name.</li>
          <li>
            Password &mdash; stored as a cryptographic hash, never in plaintext.
            We cannot see or retrieve your password.
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-800 mt-5">
          Business listing information
        </h3>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            Details you provide when creating or editing a listing: business name,
            description, phone, email, website, ABN, suburb, state, postcode,
            service radius, categories, photos, and testimonials.
          </li>
          <li>
            <strong>Seed listings:</strong> some listings are sourced from publicly
            available data (e.g. Google Places) to provide initial directory
            coverage. These contain only business contact details already published
            online.
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-800 mt-5">
          Usage and analytics
        </h3>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            If analytics are enabled: IP address, device/browser type, pages
            viewed, and interaction data.
          </li>
          <li>
            Server logs may record IP addresses and request timestamps for security
            purposes regardless of analytics settings.
          </li>
        </ul>

        {/* 3. Purpose of Processing */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          3. Why We Collect It
        </h2>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Provide and operate the service (display listings, enable search).</li>
          <li>Authenticate you and secure your account.</li>
          <li>Process subscription payments and manage billing.</li>
          <li>Prevent fraud, abuse, and spam.</li>
          <li>Respond to support requests.</li>
          <li>Improve the platform based on usage patterns.</li>
          <li>Comply with legal obligations.</li>
        </ul>

        {/* 4. Sharing & Processors */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          4. Data Processors &amp; Sharing
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We do not sell your personal information. We share data only with the
          following processors, each under their own privacy policies:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>AWS</strong> (Amazon Web Services) &mdash; cloud hosting and
            infrastructure.
          </li>
          <li>
            <strong>Amazon SES</strong> &mdash; transactional emails (e.g. sign-in
            links, subscription confirmations). Only your email address is shared.
          </li>
          <li>
            <strong>Supabase</strong> &mdash; database, authentication, and file
            storage ({' '}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              privacy policy
            </a>
            ).
          </li>
          <li>
            <strong>Stripe</strong> &mdash; payment processing. Your card details
            go directly to Stripe; we never see or store full card numbers ({' '}
            <a
              href="https://stripe.com/au/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              privacy policy
            </a>
            ).
          </li>
          <li>
            <strong>OpenAI</strong> &mdash; content moderation, validation, and
            description generation for business listings. Only listing text and
            media submitted to the platform are sent; unrelated personal data is
            not shared.
          </li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We may also disclose information if required by law, regulation, or legal
          process, or to protect the safety of our users and enforce our Terms of
          Service.
        </p>

        {/* 5. Cookies */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          5. Cookies
        </h2>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Essential cookies:</strong> required for login and session
            management. The site cannot function without these.
          </li>
          <li>
            <strong>Analytics cookies:</strong> optional. Help us understand how
            visitors use the site so we can improve it. You can disable these in
            your browser settings.
          </li>
        </ul>

        {/* 6. Data Retention */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          6. Data Retention
        </h2>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            Account data is retained while your account is active and for 30 days
            after a deletion request, to allow for recovery if needed.
          </li>
          <li>
            If you cancel your subscription, your listing is unpublished but your
            account remains so you can resubscribe later.
          </li>
          <li>
            Database backups are retained for up to 30 days and are automatically
            purged after that window.
          </li>
          <li>
            Payment records may be retained longer to meet financial record-keeping
            obligations.
          </li>
        </ul>

        {/* 7. Account Deletion */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          7. Account Deletion
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You can request deletion of your account and all associated data by
          emailing{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            support@hirelocalservices.com.au
          </a>
          . Upon receiving your request we will:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Cancel any active subscription immediately.</li>
          <li>Unpublish and remove your business listing from search results.</li>
          <li>Delete your account data within 30 days.</li>
          <li>
            Retain only records required by law (e.g. payment history for tax
            compliance).
          </li>
        </ul>

        {/* 8. International Data Transfers */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          8. International Data Transfers
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Some of our processors (AWS, Supabase, Stripe, OpenAI) may store or
          process data outside Australia, including in the United States. Where
          data is transferred internationally, we rely on the privacy commitments
          and safeguards provided by those processors. By using our platform you
          consent to these transfers.
        </p>

        {/* 9. Your Rights */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          9. Your Rights
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Under the Australian Privacy Principles you can:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Access</strong> the personal information we hold about you.
          </li>
          <li>
            <strong>Correct</strong> inaccurate information &mdash; most details
            can be updated directly from your dashboard.
          </li>
          <li>
            <strong>Request deletion</strong> of your account and associated data.
          </li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To exercise any of these rights, email{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            support@hirelocalservices.com.au
          </a>
          . If you believe we have breached the Australian Privacy Principles, you
          may also lodge a complaint with the{' '}
          <a
            href="https://www.oaic.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            Office of the Australian Information Commissioner (OAIC)
          </a>
          .
        </p>

        {/* 10. Security */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          10. Security
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We use reasonable safeguards to protect your data, including:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>TLS/HTTPS encryption for all data in transit.</li>
          <li>Cryptographically hashed passwords (never stored in plaintext).</li>
          <li>Role-based access controls (RBAC) limiting internal data access.</li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          No system is 100% secure. We cannot guarantee absolute security of
          information transmitted or stored online.
        </p>

        {/* 11. Seed Listings */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          11. Seed Listings
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Some listings on our platform are created from publicly available
          business contact details (e.g. Google Places). If you are a business
          owner and want to update or remove a seed listing, you can{' '}
          <Link href="/claim" className="text-brand-600 hover:text-brand-700 underline">
            claim your listing
          </Link>{' '}
          or{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            contact us
          </a>{' '}
          and we will action your request promptly.
        </p>

        {/* 12. Changes */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          12. Changes to This Policy
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We may update this policy from time to time. If we make material changes
          we will notify you by email or through a notice on the platform. Your
          continued use of the platform after changes constitutes acceptance of the
          revised policy.
        </p>

        {/* 13. Contact */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          13. Contact
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices<br />
          ABN 42 329 061 077<br />
          Queensland, Australia<br />
          Email:{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            support@hirelocalservices.com.au
          </a>
        </p>
        <p className="mt-4 text-gray-600 leading-relaxed">
          See also our{' '}
          <Link href="/terms" className="text-brand-600 hover:text-brand-700 underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/disclaimer" className="text-brand-600 hover:text-brand-700 underline">
            Disclaimer
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
