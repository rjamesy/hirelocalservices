import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanByPriceId } from '@/lib/constants'
import type { PlanTier } from '@/lib/types'
import type Stripe from 'stripe'

// Disable Next.js body parsing so we can access the raw body for
// Stripe signature verification.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract the business_id from Stripe object metadata.
 */
function getBusinessId(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  return metadata?.business_id ?? null
}

/**
 * Extract the plan_tier from metadata, or infer it from the price ID.
 */
function getPlanTier(
  metadata: Stripe.Metadata | null | undefined,
  priceId?: string | null
): PlanTier {
  // Try metadata first
  const tierFromMeta = metadata?.plan_tier as PlanTier | undefined
  if (tierFromMeta) return tierFromMeta

  // Infer from price ID
  if (priceId) {
    const plan = getPlanByPriceId(priceId)
    if (plan) return plan.id
  }

  return 'basic' // fallback
}

/**
 * Get the first price ID from a Stripe subscription.
 */
function getSubscriptionPriceId(
  subscription: Stripe.Subscription
): string | null {
  const item = subscription.items?.data?.[0]
  if (!item) return null
  return typeof item.price === 'string' ? item.price : item.price?.id ?? null
}

// ─── Webhook Handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text()

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    )
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Webhook configuration error' },
      { status: 500 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    )
  }

  // Use the admin client to bypass RLS for subscription management
  const supabase = createAdminClient()

  try {
    switch (event.type) {
      // ─── Checkout completed ─────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode !== 'subscription') {
          break
        }

        const businessId = getBusinessId(session.metadata)
        if (!businessId) {
          console.error('checkout.session.completed: missing business_id in metadata')
          break
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id

        if (!subscriptionId) {
          console.error('checkout.session.completed: missing subscription ID')
          break
        }

        // Retrieve the full subscription to get period details
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId)

        const stripeCustomerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null

        const priceId = getSubscriptionPriceId(subscription)
        const planTier = getPlanTier(session.metadata, priceId)

        // Upsert the subscription record
        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              business_id: businessId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscriptionId,
              status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'incomplete',
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              plan: planTier,
              stripe_price_id: priceId,
            },
            { onConflict: 'business_id' }
          )

        if (error) {
          console.error(
            'checkout.session.completed: failed to upsert subscription:',
            error
          )
        }

        break
      }

      // ─── Subscription updated ───────────────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription

        const businessId = getBusinessId(subscription.metadata)
        const stripeSubscriptionId = subscription.id

        // Map Stripe status to our status enum
        let status: string
        switch (subscription.status) {
          case 'active':
          case 'trialing':
            status = 'active'
            break
          case 'past_due':
            status = 'past_due'
            break
          case 'canceled':
            status = 'canceled'
            break
          case 'unpaid':
            status = 'unpaid'
            break
          case 'incomplete':
            status = 'incomplete'
            break
          default:
            status = 'incomplete'
        }

        const priceId = getSubscriptionPriceId(subscription)
        const planTier = getPlanTier(subscription.metadata, priceId)

        // Update by stripe_subscription_id (most reliable identifier)
        const updateData: Record<string, unknown> = {
          status,
          current_period_end: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          plan: planTier,
          stripe_price_id: priceId,
        }

        const { error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', stripeSubscriptionId)

        if (error) {
          // Fallback: try updating by business_id if available
          if (businessId) {
            await supabase
              .from('subscriptions')
              .update(updateData)
              .eq('business_id', businessId)
          } else {
            console.error(
              'customer.subscription.updated: failed to update subscription:',
              error
            )
          }
        }

        break
      }

      // ─── Subscription deleted (cancelled) ───────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeSubscriptionId = subscription.id

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: false,
          })
          .eq('stripe_subscription_id', stripeSubscriptionId)

        if (error) {
          // Fallback: try by business_id
          const businessId = getBusinessId(subscription.metadata)
          if (businessId) {
            await supabase
              .from('subscriptions')
              .update({
                status: 'canceled',
                cancel_at_period_end: false,
              })
              .eq('business_id', businessId)
          } else {
            console.error(
              'customer.subscription.deleted: failed to update subscription:',
              error
            )
          }
        }

        break
      }

      // ─── Invoice payment failed ─────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id

        if (!subscriptionId) {
          console.error('invoice.payment_failed: missing subscription ID')
          break
        }

        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId)

        if (error) {
          console.error(
            'invoice.payment_failed: failed to update subscription:',
            error
          )
        }

        break
      }

      default:
        // Unhandled event type -- this is fine, we only process the above.
        break
    }
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error)
    // Return 200 even on processing errors to prevent Stripe from
    // retrying indefinitely. Log the error for investigation.
    return NextResponse.json({ received: true }, { status: 200 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
