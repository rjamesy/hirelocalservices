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
        Last updated: 22 February 2026
      </p>

      <div className="mt-8 prose prose-gray max-w-none">
        {/* Introduction */}
        <p className="text-gray-600 leading-relaxed">
          HireLocalServices (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to
          protecting your privacy and handling your personal information in accordance with the
          Australian Privacy Principles (APPs) set out in the <em>Privacy Act 1988</em> (Cth).
          This Privacy Policy explains how we collect, use, disclose, and protect your personal
          information when you use our platform.
        </p>

        {/* 1. Information We Collect */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          1. Information We Collect
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We collect personal information that you provide directly to us, as well as information
          collected automatically when you use our platform.
        </p>

        <h3 className="text-lg font-medium text-gray-800 mt-5">
          Information you provide
        </h3>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Account information:</strong> your email address and password when you create
            an account.
          </li>
          <li>
            <strong>Business listing information:</strong> business name, description, phone number,
            email address, website URL, ABN, suburb, state, postcode, service radius, categories,
            photos, and testimonials.
          </li>
          <li>
            <strong>Payment information:</strong> payment details are collected and processed by our
            payment processor, Stripe. We do not store your full credit card number on our servers.
          </li>
          <li>
            <strong>Communications:</strong> any messages or correspondence you send to us via email
            or through the platform.
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-800 mt-5">
          Information collected automatically
        </h3>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Usage data:</strong> pages visited, search queries, time spent on pages, and
            interaction with features.
          </li>
          <li>
            <strong>Device information:</strong> browser type, operating system, device type, and
            screen resolution.
          </li>
          <li>
            <strong>Log data:</strong> IP address, access times, and referring URLs.
          </li>
        </ul>

        {/* 2. How We Use Your Information */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          2. How We Use Your Information
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We use the personal information we collect for the following purposes:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>To create and manage your account and business listing.</li>
          <li>To process payments and manage your subscription.</li>
          <li>To display your business information publicly in search results and on your profile page.</li>
          <li>To communicate with you about your account, subscription, and any changes to our services.</li>
          <li>To improve, personalise, and optimise the platform and user experience.</li>
          <li>To detect, prevent, and address fraud, abuse, and security issues.</li>
          <li>To comply with legal obligations and enforce our Terms of Service.</li>
        </ul>

        {/* 3. Cookies and Tracking */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          3. Cookies and Tracking Technologies
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We use cookies and similar tracking technologies to enhance your experience on our platform.
          Cookies are small text files stored on your device that help us remember your preferences
          and understand how you use our platform.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We use the following types of cookies:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Essential cookies:</strong> required for the platform to function, including
            authentication and session management.
          </li>
          <li>
            <strong>Analytics cookies:</strong> help us understand how visitors interact with our
            platform so we can improve it.
          </li>
        </ul>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You can control cookie preferences through your browser settings. Disabling essential
          cookies may affect your ability to use certain features of the platform.
        </p>

        {/* 4. Third-Party Services */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          4. Third-Party Services
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We use the following third-party services to operate our platform. Each has its own
          privacy policy governing how they handle your information:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Stripe:</strong> processes payments and manages subscriptions. When you subscribe,
            your payment information is handled directly by Stripe in accordance with their{' '}
            <a
              href="https://stripe.com/au/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              Privacy Policy
            </a>.
          </li>
          <li>
            <strong>Supabase:</strong> provides our database, authentication, and file storage
            infrastructure. Data is stored securely in accordance with their{' '}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              Privacy Policy
            </a>.
          </li>
          <li>
            <strong>Vercel:</strong> hosts our web application. Requests are processed in accordance
            with their{' '}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              Privacy Policy
            </a>.
          </li>
        </ul>

        {/* 5. Data Sharing and Disclosure */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          5. Data Sharing and Disclosure
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We do not sell your personal information to third parties. We may share your information
          in the following circumstances:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Public profile:</strong> business listing information (business name, description,
            contact details, photos, testimonials, location) is displayed publicly on the platform.
          </li>
          <li>
            <strong>Service providers:</strong> we share information with third-party service providers
            (Stripe, Supabase, Vercel) who assist us in operating the platform, as described above.
          </li>
          <li>
            <strong>Legal requirements:</strong> we may disclose your information if required by law,
            regulation, legal process, or governmental request.
          </li>
          <li>
            <strong>Safety and enforcement:</strong> we may disclose information to protect the safety
            of our users, enforce our Terms of Service, or respond to fraud or security concerns.
          </li>
        </ul>

        {/* 6. Data Retention */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          6. Data Retention
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We retain your personal information for as long as your account is active or as needed to
          provide you with our services. If you cancel your subscription, your business listing will
          be unpublished but your account data may be retained for a reasonable period to allow you
          to resubscribe.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you request deletion of your account, we will delete your personal information within
          30 days, except where we are required to retain it for legal, regulatory, or legitimate
          business purposes (such as fraud prevention or compliance with financial record-keeping
          obligations).
        </p>

        {/* 7. Data Security */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          7. Data Security
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We take reasonable steps to protect your personal information from unauthorised access,
          use, modification, or disclosure. Our security measures include encryption of data in
          transit (HTTPS/TLS), secure authentication, and access controls. However, no method of
          transmission over the internet or electronic storage is completely secure, and we cannot
          guarantee absolute security.
        </p>

        {/* 8. Your Rights */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          8. Your Rights
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Under the Australian Privacy Principles, you have the following rights regarding your
          personal information:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-2 text-gray-600">
          <li>
            <strong>Access:</strong> you may request access to the personal information we hold
            about you.
          </li>
          <li>
            <strong>Correction:</strong> you may request that we correct any inaccurate or
            incomplete personal information. You can also update most of your information
            directly through your dashboard.
          </li>
          <li>
            <strong>Deletion:</strong> you may request that we delete your personal information,
            subject to any legal obligations we may have to retain it.
          </li>
          <li>
            <strong>Complaint:</strong> if you believe we have breached the Australian Privacy
            Principles, you may lodge a complaint with us or with the Office of the Australian
            Information Commissioner (OAIC) at{' '}
            <a
              href="https://www.oaic.gov.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              www.oaic.gov.au
            </a>.
          </li>
        </ul>

        {/* 9. Children */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          9. Children&apos;s Privacy
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          Our platform is not directed at individuals under the age of 18. We do not knowingly
          collect personal information from children. If we become aware that we have collected
          personal information from a child, we will take steps to delete it promptly.
        </p>

        {/* 10. Changes */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          10. Changes to This Privacy Policy
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          We may update this Privacy Policy from time to time. If we make material changes, we will
          notify you by email or through a notice on the platform. Your continued use of the platform
          after any changes constitutes your acceptance of the revised Privacy Policy.
        </p>

        {/* 11. Contact */}
        <h2 className="text-xl font-semibold text-gray-900 mt-8">
          11. Contact Us
        </h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          If you have any questions about this Privacy Policy or wish to exercise your rights,
          please contact us at{' '}
          <a
            href="mailto:privacy@hirelocalservices.com.au"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            privacy@hirelocalservices.com.au
          </a>.
        </p>
        <p className="mt-3 text-gray-600 leading-relaxed">
          You may also view our{' '}
          <Link href="/terms" className="text-brand-600 hover:text-brand-700 underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/disclaimer" className="text-brand-600 hover:text-brand-700 underline">
            Disclaimer
          </Link>{' '}
          for more information about how we operate.
        </p>
      </div>
    </div>
  )
}
