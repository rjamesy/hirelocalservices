import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Claim Your Business Listing | HireLocalServices',
  description:
    'Claim and manage your business listing on HireLocalServices. Verify ownership, update details, and ensure your business information is accurate.',
}

export default function ClaimListingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Claim Your Business Listing
      </h1>

      <div className="mt-8 prose prose-gray max-w-none">
        <p className="text-gray-600 leading-relaxed">
          HireLocalServices (ABN 42 329 061 077) is a Queensland-based
          independent online directory platform. We allow business owners to
          claim and manage their business profile on our platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Some listings on this platform are created using publicly available
          business information. If you are the owner or an authorised
          representative of a business listed on HireLocalServices, you may
          claim your listing to manage and update your information.
        </p>

        {/* Why Claim Your Listing? */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          Why Claim Your Listing?
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Claiming your listing allows you to:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Update your business details</li>
          <li>Add a description, services, and service areas</li>
          <li>Upload images</li>
          <li>Respond to customer enquiries</li>
          <li>Upgrade to a premium subscription (if applicable)</li>
          <li>Ensure your information is accurate and current</li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Unclaimed listings display limited information and may not reflect
          your full service offering.
        </p>

        {/* How the Claim Process Works */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          How the Claim Process Works
        </h2>
        <ol className="mt-3 list-decimal pl-6 space-y-2 text-gray-600">
          <li>Locate your business listing.</li>
          <li>
            Select{' '}
            <span className="font-medium text-gray-900">
              &ldquo;Claim This Listing&rdquo;
            </span>
            .
          </li>
          <li>Provide your business email address.</li>
          <li>Verify ownership via a one-time email verification link or code.</li>
          <li>Complete the ownership declaration.</li>
          <li>Submit for review.</li>
        </ol>
        <p className="mt-3 text-gray-600 leading-relaxed">
          All claims are reviewed to protect business owners and prevent
          fraudulent takeovers.
        </p>

        {/* Ownership Verification */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          Ownership Verification
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To protect the integrity of the platform, we may require:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Verification via an email address associated with your domain</li>
          <li>Additional documentation where necessary</li>
          <li>Manual review by our team</li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Providing false or misleading information during the claim process
          may result in:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Immediate rejection of the claim</li>
          <li>Account suspension or permanent removal from the platform</li>
          <li>Reporting to relevant authorities where appropriate</li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          For details on how we handle your personal information during this
          process, see our{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
            Privacy Policy
          </Link>.
        </p>

        {/* What Happens After Approval? */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          What Happens After Approval?
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Once approved:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>You will gain administrative access to your listing</li>
          <li>You may edit business information</li>
          <li>You may upgrade to a subscription plan</li>
          <li>Your listing will be marked as &ldquo;Claimed&rdquo;</li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Approval times vary depending on verification requirements.
        </p>

        {/* Important Notice About Seed Listings */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          Important Notice About Seed Listings
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Some listings on HireLocalServices are created using publicly
          available business information to help users discover local services.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you are the rightful owner of a listing and would like it removed
          instead of claimed, please contact:{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            support@hirelocalservices.com.au
          </a>
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We respect legitimate removal requests.
        </p>

        {/* Platform Integrity */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          Platform Integrity
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is a directory platform only. We do not guarantee,
          endorse, or certify the licensing, qualifications, or performance of
          any listed service provider.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Users should conduct their own independent due diligence before
          engaging any service provider.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          See our{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
            Privacy Policy
          </Link>
          ,{' '}
          <Link href="/terms" className="text-brand-600 hover:text-brand-700 underline">
            Terms of Service
          </Link>
          , and{' '}
          <Link href="/disclaimer" className="text-brand-600 hover:text-brand-700 underline">
            Disclaimer
          </Link>{' '}
          for more information.
        </p>

        {/* CTA */}
        <div className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Ready to claim your listing?
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Search for your business and select &ldquo;Claim This
            Listing&rdquo; to begin the verification process.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            If you cannot locate your business, please contact{' '}
            <a
              href="mailto:support@hirelocalservices.com.au"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              support@hirelocalservices.com.au
            </a>
          </p>
          <Link
            href="/search"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <svg
              className="h-5 w-5"
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
            Find Your Business
          </Link>
        </div>

        {/* Footer Block */}
        <div className="mt-10 border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-500 leading-relaxed">
            HireLocalServices<br />
            ABN 42 329 061 077<br />
            Queensland, Australia<br />
            <a
              href="mailto:support@hirelocalservices.com.au"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              support@hirelocalservices.com.au
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
