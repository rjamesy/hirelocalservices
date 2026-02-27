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
        Last updated: 28 February 2026
      </p>

      <div className="mt-8 prose prose-gray max-w-none">
        <p className="text-gray-600 leading-relaxed">
          This platform is operated by HireLocalServices (ABN 42 329 061 077),
          Queensland, Australia. By using hirelocalservices.com.au you agree to
          these terms.
        </p>

        {/* 1. Service Description */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          1. Service Description
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is an online directory that connects consumers with
          local service providers across Australia. We provide business listing
          services that allow service providers to create and maintain a public
          profile, upload photos, display testimonials, and appear in search
          results.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          <strong>
            HireLocalServices is a directory and advertising platform only.
          </strong>{' '}
          We do not provide, perform, or guarantee any of the services listed on
          our platform. We do not endorse, recommend, or verify any service
          provider. We are not a party to any agreement between you and any
          service provider found through our platform.
        </p>

        {/* 2. User Accounts */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          2. User Accounts
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To list a business you must create an account. You are responsible for
          maintaining the confidentiality of your login credentials and for all
          activities under your account. You must provide accurate and complete
          information and keep it up to date.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You must be at least 18 years old and legally able to enter into binding
          contracts. By creating an account you represent and warrant that you meet
          these requirements.
        </p>

        {/* 3. User Obligations */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          3. User Obligations
        </h2>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>Provide accurate, truthful, and up-to-date information in your listing.</li>
          <li>Not misrepresent your qualifications, licences, insurance, or certifications.</li>
          <li>Comply with all applicable Australian laws, regulations, and industry standards.</li>
          <li>Not use the platform for any unlawful, fraudulent, or harmful purpose.</li>
          <li>Not upload content that is offensive, defamatory, misleading, or infringes intellectual property rights.</li>
          <li>Not interfere with the operation of the platform or attempt unauthorised access to our systems.</li>
          <li>Maintain any required licences, permits, and insurance for the services you offer.</li>
        </ul>

        {/* 4. Subscription & Payment */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          4. Subscription &amp; Payment
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Business listings require a paid monthly subscription. Fees are charged
          in Australian Dollars (AUD) via Stripe. By subscribing you authorise us
          to charge the applicable fee to your payment method on a recurring
          monthly basis.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We reserve the right to change pricing at any time. If pricing changes
          affect your existing subscription we will provide at least 30
          days&apos; notice before the new pricing takes effect.
        </p>

        {/* 5. Refund Policy */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          5. Refund Policy
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Subscription fees are non-refundable except as required by Australian
          Consumer Law. You may cancel your subscription at any time through your
          dashboard or the Stripe billing portal. Upon cancellation your listing
          remains active until the end of your current billing period, after which
          it will be unpublished. No pro-rata refunds are given for partial
          billing periods.
        </p>

        {/* 6. Content */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          6. Content
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You retain ownership of content you upload (descriptions, photos,
          testimonials). By uploading content you grant HireLocalServices a
          non-exclusive, worldwide, royalty-free licence to display, reproduce,
          and distribute it for the purposes of operating and promoting the
          platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We reserve the right to remove or modify content that violates these
          terms or applicable law. We may suspend or terminate your account for
          repeated content violations.
        </p>

        {/* 7. No Liability for Third-Party Disputes */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          7. No Liability for Third-Party Disputes
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          HireLocalServices is not a party to any transaction or arrangement
          between users and service providers. We are not responsible for and
          have no liability in relation to any disputes, claims, damages, losses,
          or costs arising from your engagement with any service provider found
          through our platform.
        </p>

        {/* 8. Account Termination */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          8. Account Termination
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Either party may terminate this agreement at any time. You may cancel
          your account through your dashboard settings. We may suspend or
          terminate your account immediately if you breach these terms or engage
          in conduct that we determine, in our sole discretion, to be harmful to
          the platform or other users.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Upon termination your listing will be unpublished and removed from
          search results. Data retention is governed by our{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
            Privacy Policy
          </Link>.
        </p>

        {/* 9. Indemnity */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          9. Indemnity
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You agree to indemnify and hold harmless HireLocalServices, its
          operator, and their respective officers, agents, and employees from and
          against any claims, liabilities, damages, losses, and expenses
          (including reasonable legal fees) arising out of or in connection with
          your use of the platform, your content, your breach of these terms, or
          your violation of any law or third-party rights.
        </p>

        {/* 10. Limitation of Liability */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          10. Limitation of Liability
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          To the maximum extent permitted by law, HireLocalServices shall not be
          liable for any indirect, incidental, special, consequential, or punitive
          damages arising out of or in connection with your use of the platform,
          including but not limited to loss of profits, data, business
          opportunities, or goodwill.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Our total aggregate liability for any claim arising from these terms or
          your use of the platform shall not exceed the total subscription fees
          paid by you in the twelve (12) months preceding the claim.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Nothing in these terms limits or excludes any liability that cannot be
          limited or excluded under applicable law, including liability under the
          Australian Consumer Law.
        </p>

        {/* 11. Disclaimers */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          11. Disclaimers
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          The platform is provided &quot;as is&quot; and &quot;as available&quot;
          without warranties of any kind, either express or implied. We do not
          warrant that the platform will be uninterrupted, error-free, or free of
          harmful components. We do not verify, endorse, or guarantee the quality,
          safety, or legality of any services offered by listed businesses. See
          our{' '}
          <Link href="/disclaimer" className="text-brand-600 hover:text-brand-700 underline">
            Disclaimer
          </Link>{' '}
          for more information.
        </p>

        {/* 12. Governing Law */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          12. Governing Law
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          These terms are governed by and construed in accordance with the laws of
          Queensland, Australia. You agree to submit to the exclusive jurisdiction
          of the courts of Queensland, Australia for the resolution of any
          disputes arising out of or in connection with these terms or your use of
          the platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If any provision of these terms is found to be invalid or unenforceable,
          the remaining provisions will continue in full force and effect.
        </p>

        {/* 13. Modifications */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          13. Modifications
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We may update these terms from time to time. If we make material changes
          we will notify you by email or through a notice on the platform. Your
          continued use of the platform after changes constitutes your acceptance
          of the revised terms.
        </p>

        {/* 14. Contact */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          14. Contact
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
      </div>
    </div>
  )
}
