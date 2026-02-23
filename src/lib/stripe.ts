import Stripe from 'stripe'
import { loadStripe, type Stripe as StripeClient } from '@stripe/stripe-js'

/**
 * Server-side Stripe instance.
 * Lazily initialized to avoid errors during build when STRIPE_SECRET_KEY is not set.
 * Only use in Server Components, Server Actions, and API routes.
 */
let _stripe: Stripe | null = null

export function getStripeInstance(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  }
  return _stripe
}

/**
 * Backwards-compatible export. Wraps getStripeInstance() via a Proxy
 * so that Stripe is only instantiated when a property is actually accessed.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeInstance(), prop, receiver)
  },
})

/**
 * Client-side Stripe instance (lazy loaded singleton).
 * Use in client components for Stripe Elements and checkout.
 */
let stripePromise: Promise<StripeClient | null> | null = null

export function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    )
  }
  return stripePromise
}
