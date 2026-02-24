import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/utils'

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
        { error: 'You must be logged in to manage your billing' },
        { status: 401 }
      )
    }

    // Get the user's subscription directly
    const { data: userSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (subError || !userSub?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe first.' },
        { status: 400 }
      )
    }

    const baseUrl = getBaseUrl()

    // Create a Stripe billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userSub.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Stripe portal error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
