import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service | HireLocalServices',
  description:
    'Terms of Service for HireLocalServices. Read about your rights and obligations when using our platform.',
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-4 text-sm text-gray-500">
        Last updated: 22 February 2026
      </p>

      <div className="mt-8 prose prose-gray max-w-none">
        {/* 1. Service Description */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          1. Service Description
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates an online
          directory platform that connects consumers with local service providers across Australia.
          We provide business listing services that allow service providers to create and maintain
          a public profile, upload photos, display testimonials, and appear in search results.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is a directory and advertising platform only. We do not provide, perform,
          or guarantee any of the services listed on our platform. We are not a party to any agreement
          between you and any service provider found through our platform.
        </p>

        {/* 2. User Accounts */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          2. User Accounts
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To list a business on HireLocalServices, you must create an account. You are responsible for
          maintaining the confidentiality of your login credentials and for all activities that occur
          under your account. You must provide accurate and complete information when creating your
          account and keep it up to date.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You must be at least 18 years old and legally able to enter into binding contracts to use
          our services. By creating an account, you represent and warrant that you meet these requirements.
        </p>

        {/* 3. User Obligations */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          3. User Obligations
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          As a user of HireLocalServices, you agree to:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Provide accurate, truthful, and up-to-date information in your business listing.</li>
          <li>Not misrepresent your qualifications, certifications, insurance, or licensing status.</li>
          <li>Comply with all applicable Australian laws, regulations, and industry standards.</li>
          <li>Not use the platform for any unlawful, fraudulent, or harmful purpose.</li>
          <li>Not upload content that is offensive, defamatory, misleading, or infringes on the intellectual property rights of others.</li>
          <li>Not interfere with the operation of the platform or attempt to gain unauthorised access to our systems.</li>
          <li>Maintain any required licences, permits, and insurance for the services you offer.</li>
        </ul>

        {/* 4. Payment Terms */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          4. Payment Terms
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Business listings on HireLocalServices require a paid monthly subscription. Subscription fees
          are charged in Australian Dollars (AUD) via our payment processor, Stripe. By subscribing,
          you authorise us to charge the applicable subscription fee to your designated payment method
          on a recurring monthly basis.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Subscription fees are non-refundable except as required by Australian Consumer Law. You may
          cancel your subscription at any time through your dashboard or the Stripe billing portal.
          Upon cancellation, your listing will remain active until the end of your current billing period,
          after which it will be unpublished.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We reserve the right to change our subscription pricing at any time. If pricing changes affect
          your existing subscription, we will provide you with at least 30 days&apos; notice before the
          new pricing takes effect.
        </p>

        {/* 5. Content Policy */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          5. Content Policy
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You retain ownership of any content you upload to the platform, including business descriptions,
          photos, and testimonials. By uploading content, you grant HireLocalServices a non-exclusive,
          worldwide, royalty-free licence to display, reproduce, and distribute your content for the
          purposes of operating and promoting the platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We reserve the right to remove or modify any content that violates these Terms, our content
          guidelines, or applicable law. We may also suspend or terminate your account if you repeatedly
          violate our content policies.
        </p>

        {/* 6. Termination */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          6. Termination
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Either party may terminate this agreement at any time. You may cancel your account through your
          dashboard settings. We may suspend or terminate your account immediately if you breach these
          Terms or engage in conduct that we determine, in our sole discretion, to be harmful to the
          platform or other users.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Upon termination, your business listing will be unpublished and removed from search results.
          We may retain your data in accordance with our{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
            Privacy Policy
          </Link>.
        </p>

        {/* 7. Limitation of Liability */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          7. Limitation of Liability
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To the maximum extent permitted by law, HireLocalServices shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages arising out of or in connection with
          your use of the platform, including but not limited to loss of profits, data, business
          opportunities, or goodwill.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Our total aggregate liability for any claim arising from or related to these Terms or your use
          of the platform shall not exceed the total amount of subscription fees paid by you in the
          twelve (12) months preceding the claim.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Nothing in these Terms limits or excludes any liability that cannot be limited or excluded under
          applicable law, including liability under the Australian Consumer Law.
        </p>

        {/* 8. Disclaimers */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          8. Disclaimers
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          The platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either
          express or implied. We do not warrant that the platform will be uninterrupted, error-free,
          or free of harmful components. We do not verify, endorse, or guarantee the quality, safety,
          or legality of any services offered by businesses listed on the platform. Please see our{' '}
          <Link href="/disclaimer" className="text-brand-600 hover:text-brand-700 underline">
            Disclaimer
          </Link>{' '}
          for more information.
        </p>

        {/* 9. Governing Law */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          9. Governing Law
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          These Terms are governed by and construed in accordance with the laws of Australia. You agree
          to submit to the exclusive jurisdiction of the courts of Australia for the resolution of any
          disputes arising out of or in connection with these Terms or your use of the platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If any provision of these Terms is found to be invalid or unenforceable, the remaining
          provisions will continue in full force and effect.
        </p>

        {/* 10. Changes */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          10. Changes to These Terms
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We may update these Terms from time to time. If we make material changes, we will notify you
          by email or through a notice on the platform. Your continued use of the platform after any
          changes constitutes your acceptance of the revised Terms.
        </p>

        {/* 11. Contact */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          11. Contact Us
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you have any questions about these Terms, please contact us at{' '}
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
