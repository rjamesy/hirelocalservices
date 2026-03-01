import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pricing - List Your Business | HireLocalServices',
  description:
    'Choose a plan to list your business on HireLocalServices. Basic from $4/month, Premium from $10/month, or save with Annual Premium at $99/year. All monthly plans include a 30-day free trial.',
  openGraph: {
    title: 'Pricing - List Your Business | HireLocalServices',
    description:
      'Choose a plan to list your business on HireLocalServices. Basic from $4/month, Premium from $10/month, or save with Annual Premium at $99/year. All monthly plans include a 30-day free trial.',
  },
}

const plans = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$4',
    interval: '/month',
    description: 'Get your business visible to local customers. 30-day free trial included.',
    included: [
      '1 listing',
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
      'Up to 500 character description',
      '30-day free trial',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
    badge: null,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$10',
    interval: '/month',
    description: 'Showcase your work with photos and testimonials. 30-day free trial included.',
    included: [
      'Up to 10 listings',
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
      'Up to 1,500 character description',
      'Photo gallery (up to 10 photos)',
      'Customer testimonials (up to 20)',
      '30-day free trial',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    id: 'premium_annual',
    name: 'Annual Premium',
    price: '$99',
    interval: '/year',
    description: 'Save over 17% with annual billing. All premium features.',
    included: [
      'Up to 10 listings',
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
      'Up to 2,500 character description',
      'Photo gallery (up to 10 photos)',
      'Customer testimonials (up to 20)',
    ],
    cta: 'Save with Annual',
    highlighted: false,
    badge: 'Best Value',
  },
]

const faqs = [
  {
    question: 'How does billing work?',
    answer:
      'Monthly plans are billed via Stripe and renew automatically. The Annual Premium plan is billed once per year. All prices are in AUD and include GST.',
  },
  {
    question: 'How does the free trial work?',
    answer:
      'Basic and Premium monthly plans include a 30-day free trial. After the trial, your card is charged automatically. You can cancel anytime before the trial ends to avoid being charged.',
  },
  {
    question: 'Can I upgrade or downgrade at any time?',
    answer:
      'Yes. You can switch between plans from your dashboard at any time. When upgrading, you get immediate access to new features. When downgrading, changes take effect at the end of your current billing period.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Absolutely. You can cancel your subscription at any time from your dashboard. Your listing will remain active until the end of your current billing period.',
  },
  {
    question: 'What\'s the difference between Basic and Premium?',
    answer:
      'Basic gives you a professional listing visible in search results. Premium adds the ability to upload photos to showcase your work and display customer testimonials — great for building trust with potential clients.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards through Stripe, including Visa, Mastercard, and American Express. All payments are processed securely.',
  },
]

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5 text-brand-600'}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  )
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Plans for Every Business
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 leading-relaxed">
          Monthly plans include a 30-day free trial. No hidden fees, cancel anytime.
        </p>
      </div>

      {/* Pricing Grid */}
      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border-2 bg-white shadow-sm overflow-hidden ${
              plan.highlighted
                ? 'border-brand-600 shadow-xl ring-1 ring-brand-600'
                : 'border-gray-200'
            }`}
          >
            {/* Badge */}
            {plan.badge && (
              <div
                className={`absolute top-0 right-0 rounded-bl-lg px-3 py-1 text-xs font-semibold ${
                  plan.highlighted
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-900 text-white'
                }`}
              >
                {plan.badge}
              </div>
            )}

            {/* Card Header */}
            <div className={`px-6 pt-8 pb-6 ${plan.highlighted ? 'bg-brand-50' : ''}`}>
              <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">
                  {plan.price}
                </span>
                <span className="text-sm text-gray-500">{plan.interval}</span>
              </div>
              <p className="mt-3 text-sm text-gray-500">{plan.description}</p>
            </div>

            {/* Features - only included items with checkmarks */}
            <div className="flex-1 px-6 pb-6">
              <ul className="space-y-3">
                {plan.included.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-gray-700"
                  >
                    <CheckIcon className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <div className="px-6 pb-8">
              <Link
                href="/login?redirect=/dashboard/billing"
                className={`block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison note */}
      <div className="mx-auto mt-8 max-w-2xl text-center">
        <p className="text-sm text-gray-500">
          All plans include a professional business profile visible in search results.
          Premium plans add photo galleries and customer testimonials.
        </p>
      </div>

      {/* FAQ Section */}
      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 text-center">
          Frequently Asked Questions
        </h2>
        <div className="mt-8 divide-y divide-gray-200">
          {faqs.map((faq) => (
            <div key={faq.question} className="py-6">
              <h3 className="text-base font-semibold text-gray-900">
                {faq.question}
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-16 text-center">
        <p className="text-gray-600">
          Have more questions?{' '}
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
