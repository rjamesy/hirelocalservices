import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Disclaimer | HireLocalServices',
  description:
    'Disclaimer for HireLocalServices. Important information about the limitations of our directory service.',
}

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Disclaimer
      </h1>
      <p className="mt-4 text-sm text-gray-500">
        Last updated: 22 February 2026
      </p>

      <div className="mt-8 prose prose-gray max-w-none">
        {/* Important notice */}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5">
          <div className="flex gap-3">
            <svg
              className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm text-yellow-800 leading-relaxed">
              <strong>Important:</strong> HireLocalServices is a directory platform only. We do not
              verify, endorse, or guarantee any business or service listed on our platform. Users
              should exercise their own judgement and conduct appropriate due diligence before
              engaging any service provider.
            </p>
          </div>
        </div>

        {/* 1. No Verification of Businesses */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          1. No Verification of Businesses
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices does not verify the identity, qualifications, licences, insurance,
          or any other credentials of businesses listed on our platform. The information displayed
          in business listings is provided entirely by the business owners themselves.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          While we encourage businesses to provide accurate information and may display an ABN
          where provided, the presence of a listing on HireLocalServices does not constitute an
          endorsement, recommendation, or verification of any kind.
        </p>

        {/* 2. No Guarantee of Service Quality */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          2. No Guarantee of Service Quality
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We do not guarantee the quality, reliability, timeliness, suitability, or safety of any
          services provided by businesses listed on our platform. The testimonials displayed on
          business profiles are submitted by the business owners and may not reflect the experience
          of all customers.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Any ratings, reviews, or testimonials on the platform are provided for informational
          purposes only and should not be the sole basis for your decision to engage a service provider.
        </p>

        {/* 3. Due Diligence */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          3. User Due Diligence
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Before engaging any service provider found through HireLocalServices, we strongly recommend
          that you:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Verify the business&apos;s qualifications, licences, and insurance independently.</li>
          <li>Check whether the business holds any required trade licences for your state or territory.</li>
          <li>Request and verify references from previous customers.</li>
          <li>Obtain multiple quotes before committing to a service provider.</li>
          <li>Ensure that any agreement for services is documented in writing.</li>
          <li>Verify the business&apos;s ABN through the{' '}
            <a
              href="https://abr.business.gov.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              Australian Business Register
            </a>.
          </li>
          <li>Check for any complaints or enforcement actions through relevant consumer protection bodies.</li>
        </ul>

        {/* 4. Not Responsible for Disputes */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          4. Not Responsible for Disputes
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is not a party to any transaction, agreement, or arrangement between
          you and any service provider found through our platform. We are not responsible for and
          have no liability in relation to any disputes, claims, damages, losses, or costs arising
          from your engagement with any service provider.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you have a dispute with a service provider, we recommend:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Attempting to resolve the dispute directly with the service provider.</li>
          <li>Contacting your state or territory&apos;s fair trading or consumer affairs body for assistance.</li>
          <li>Seeking independent legal advice if necessary.</li>
        </ul>

        {/* 5. Accuracy of Information */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          5. Accuracy of Information
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          While we endeavour to ensure that the platform functions correctly, we do not warrant
          that the information provided by businesses on the platform is accurate, complete, or
          current. Business details such as contact information, service areas, and availability
          may change without notice.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you encounter any listing that you believe contains false, misleading, or inappropriate
          content, you may report it using the report function on the business profile page.
        </p>

        {/* 6. Limitation */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          6. Limitation of Liability
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To the maximum extent permitted by Australian law, HireLocalServices disclaims all
          liability for any loss, damage, or injury arising from or in connection with your use
          of the platform or your engagement with any service provider found through the platform.
          This includes but is not limited to direct, indirect, incidental, consequential, and
          punitive damages.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Nothing in this disclaimer limits or excludes any rights you may have under the
          Australian Consumer Law or other applicable legislation that cannot be excluded by
          agreement.
        </p>

        {/* 7. Governing Law */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          7. Governing Law
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          This disclaimer is governed by the laws of Australia. For further information about
          your rights and our obligations, please refer to our{' '}
          <Link href="/terms" className="text-brand-600 hover:text-brand-700 underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
            Privacy Policy
          </Link>.
        </p>

        {/* Contact */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          8. Contact Us
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you have any questions or concerns about this disclaimer, please contact us at{' '}
          <a
            href="mailto:support@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            support@hirelocalservices.com.au
          </a>.
        </p>
      </div>
    </div>
  )
}
