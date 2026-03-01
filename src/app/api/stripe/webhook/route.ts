import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanByPriceId } from '@/lib/constants'
import type { PlanTier } from '@/lib/types'
import type Stripe from 'stripe'
import { logPaymentEvent, getSystemFlagsSafe } from '@/lib/protection'

// Disable Next.js body parsing so we can access the raw body for
// Stripe signature verification.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract user_id from metadata. Falls back to business_id → owner_id lookup.
 */
async function getUserId(
  metadata: Stripe.Metadata | null | undefined,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  if (metadata?.user_id) return metadata.user_id

  // Backward compat: look up via business_id
  const businessId = metadata?.business_id
  if (businessId) {
    const { data } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle()
    return data?.owner_id ?? null
  }

  return null
}

/**
 * Extract the plan_tier from metadata, or infer it from the price ID.
 */
function getPlanTier(
  metadata: Stripe.Metadata | null | undefined,
  priceId?: string | null
): PlanTier {
  const tierFromMeta = metadata?.plan_tier as PlanTier | undefined
  if (tierFromMeta) return tierFromMeta

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

/**
 * Map Stripe subscription status to our status enum.
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'unpaid':
      return 'unpaid'
    default:
      return 'incomplete'
  }
}

/**
 * Update billing_status on all businesses owned by a user.
 */
async function syncBusinessBillingStatus(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  billingStatus: 'active' | 'trial' | 'billing_suspended',
  trialEndsAt?: string | null
) {
  const updateData: Record<string, unknown> = { billing_status: billingStatus }
  if (billingStatus === 'trial' && trialEndsAt) {
    updateData.trial_ends_at = trialEndsAt
  } else if (billingStatus === 'active') {
    updateData.trial_ends_at = null
  }
  await supabase
    .from('businesses')
    .update(updateData)
    .eq('owner_id', userId)
    .eq('is_seed', false)
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
    // Check payments_enabled flag for checkout/subscription events
    const paymentEvents = [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
    ]
    if (paymentEvents.includes(event.type)) {
      const flags = await getSystemFlagsSafe()
      if (!flags.payments_enabled) {
        console.warn(`[webhook] payments_enabled=false, skipping ${event.type}`)
        return NextResponse.json({ received: true }, { status: 200 })
      }
    }

    switch (event.type) {
      // ─── Checkout completed ─────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode !== 'subscription') {
          break
        }

        const userId = await getUserId(session.metadata, supabase)
        if (!userId) {
          console.error('checkout.session.completed: missing user_id in metadata')
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

        // Read trial_end from Stripe subscription
        const trialEndsAt = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null
        const mappedStatus = mapStripeStatus(subscription.status)

        // Upsert into user_subscriptions
        const { error } = await supabase
          .from('user_subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscriptionId,
              status: mappedStatus as any,
              current_period_start: new Date(
                subscription.current_period_start * 1000
              ).toISOString(),
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              plan: planTier,
              stripe_price_id: priceId,
              trial_ends_at: trialEndsAt,
            },
            { onConflict: 'user_id' }
          )

        if (error) {
          console.error(
            'checkout.session.completed: failed to upsert user_subscription:',
            error
          )
        }

        // Sync billing_status on all user's businesses
        if (mappedStatus === 'trialing') {
          await syncBusinessBillingStatus(supabase, userId, 'trial', trialEndsAt)
        } else {
          await syncBusinessBillingStatus(supabase, userId, 'active')
        }

        // Log payment event
        await logPaymentEvent(userId, stripeCustomerId, subscriptionId, 'checkout.session.completed', {
          plan_tier: planTier,
        })

        break
      }

      // ─── Subscription updated ───────────────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeSubscriptionId = subscription.id

        const status = mapStripeStatus(subscription.status)
        const priceId = getSubscriptionPriceId(subscription)
        const planTier = getPlanTier(subscription.metadata, priceId)
        const trialEndsAt = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null

        const updateData: Record<string, unknown> = {
          status,
          current_period_end: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          plan: planTier,
          stripe_price_id: priceId,
          trial_ends_at: trialEndsAt,
        }

        // Update user_subscriptions by stripe_subscription_id
        const { error } = await supabase
          .from('user_subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', stripeSubscriptionId)

        if (error) {
          console.error(
            'customer.subscription.updated: failed to update user_subscription:',
            error
          )
        }

        // Sync billing_status on businesses
        // Find the user who owns this subscription
        const { data: userSub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .maybeSingle()

        if (userSub) {
          if (['canceled', 'unpaid'].includes(status)) {
            await syncBusinessBillingStatus(supabase, userSub.user_id, 'billing_suspended')
          } else if (status === 'trialing') {
            await syncBusinessBillingStatus(supabase, userSub.user_id, 'trial', trialEndsAt)
          } else if (['active', 'past_due'].includes(status)) {
            await syncBusinessBillingStatus(supabase, userSub.user_id, 'active')
          }

          // Log payment event
          await logPaymentEvent(userSub.user_id, null, stripeSubscriptionId, 'customer.subscription.updated', {
            status,
            plan_tier: planTier,
          })
        }

        break
      }

      // ─── Subscription deleted (cancelled) ───────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeSubscriptionId = subscription.id

        // Find user before updating
        const { data: userSub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .maybeSingle()

        const { error } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'canceled' as any,
            cancel_at_period_end: false,
          })
          .eq('stripe_subscription_id', stripeSubscriptionId)

        if (error) {
          console.error(
            'customer.subscription.deleted: failed to update user_subscription:',
            error
          )
        }

        // Suspend all user's businesses
        if (userSub) {
          await syncBusinessBillingStatus(supabase, userSub.user_id, 'billing_suspended')

          // Log payment event
          await logPaymentEvent(userSub.user_id, null, stripeSubscriptionId, 'customer.subscription.deleted')
        }

        break
      }

      // ─── Invoice payment succeeded (recovery from past_due) ─────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id

        if (!subscriptionId) break

        // Recover: set status back to active
        const { error: recoverError } = await supabase
          .from('user_subscriptions')
          .update({ status: 'active' as any })
          .eq('stripe_subscription_id', subscriptionId)

        if (recoverError) {
          console.error(
            'invoice.payment_succeeded: failed to update user_subscription:',
            recoverError
          )
        }

        // Sync billing to active
        const { data: recoveredSub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()
        if (recoveredSub) {
          await syncBusinessBillingStatus(supabase, recoveredSub.user_id, 'active')
          await logPaymentEvent(recoveredSub.user_id, null, subscriptionId, 'invoice.payment_succeeded')
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
          .from('user_subscriptions')
          .update({ status: 'past_due' as any })
          .eq('stripe_subscription_id', subscriptionId)

        if (error) {
          console.error(
            'invoice.payment_failed: failed to update user_subscription:',
            error
          )
        }

        // Log payment event
        const { data: failedSub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()
        if (failedSub) {
          await logPaymentEvent(failedSub.user_id, null, subscriptionId, 'invoice.payment_failed')
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
