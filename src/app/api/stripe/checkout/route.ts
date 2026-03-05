import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/utils'
import { PLANS, getPlanByPriceId, getValidPriceIds } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to subscribe' },
        { status: 401 }
      )
    }

    // Parse request body — accepts either priceId or planId
    const body = await request.json()
    const { businessId, planId, returnTo } = body
    let { priceId } = body

    // Resolve planId to priceId if needed
    if (!priceId && planId) {
      const planDef = PLANS.find((p) => p.id === planId)
      if (planDef) {
        priceId = process.env[planDef.priceIdEnvVar]
      }
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Please select a plan' },
        { status: 400 }
      )
    }

    // Validate the price ID is one of our known plans
    const validPriceIds = getValidPriceIds()
    if (!validPriceIds.includes(priceId)) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      )
    }

    const plan = getPlanByPriceId(priceId)
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      )
    }

    // Check existing user subscription
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('id, stripe_customer_id, status')
      .eq('user_id', user.id)
      .maybeSingle()

    // If there's already an active paid subscription, don't create another
    if (
      existingSub &&
      ['active', 'past_due'].includes(existingSub.status)
    ) {
      return NextResponse.json(
        { error: 'You already have an active subscription. Manage it from the billing page.' },
        { status: 400 }
      )
    }

    // Get or create a Stripe customer
    let stripeCustomerId = existingSub?.stripe_customer_id

    if (!stripeCustomerId) {
      // Look up the user's profile email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single()

      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })

      stripeCustomerId = customer.id

      // Store the Stripe customer ID in user_subscriptions
      if (existingSub) {
        await supabase
          .from('user_subscriptions')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', existingSub.id)
      } else {
        await supabase.from('user_subscriptions').insert({
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          status: 'incomplete' as const,
          plan: plan.id as any,
          stripe_price_id: priceId,
        })
      }
    }

    const baseUrl = getBaseUrl()

    // Sanitize returnTo: must be a relative path under /dashboard to prevent open redirect
    const ALLOWED_RETURN_PREFIXES = ['/dashboard/']
    const safeReturnTo =
      typeof returnTo === 'string' &&
      ALLOWED_RETURN_PREFIXES.some((p) => returnTo.startsWith(p)) &&
      !returnTo.includes('//') &&
      !returnTo.includes('\\')
        ? returnTo
        : '/dashboard'

    // Stripe-native trial: basic & premium get 30-day trial, annual has no trial
    const trialDays = plan.trialDays

    // Create the Stripe Checkout session (per-user, not per-business)
    const sessionConfig: Record<string, unknown> = {
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${safeReturnTo}`,
      metadata: {
        user_id: user.id,
        plan_tier: plan.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_tier: plan.id,
        },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
    }

    const session = await stripe.checkout.sessions.create(
      sessionConfig as Parameters<typeof stripe.checkout.sessions.create>[0]
    )

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
