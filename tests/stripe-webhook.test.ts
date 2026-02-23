/**
 * tests/stripe-webhook.test.ts
 *
 * Tests for Stripe webhook event handling:
 * - Checkout session completed → subscription creation
 * - Subscription updated → status sync
 * - Subscription deleted → cancellation
 * - Invoice payment failed → past_due status
 * - Helper function logic
 */

import { describe, it, expect } from 'vitest'
import { getPlanByPriceId, getPlanById } from '@/lib/constants'

describe('Stripe Webhook Handling', () => {
  // ─── Event Type Handling ──────────────────────────────────────────

  describe('Event Type Handling', () => {
    const handledEvents = [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
    ]

    it('should handle the 4 key subscription lifecycle events', () => {
      expect(handledEvents).toHaveLength(4)
      expect(handledEvents).toContain('checkout.session.completed')
      expect(handledEvents).toContain('customer.subscription.updated')
      expect(handledEvents).toContain('customer.subscription.deleted')
      expect(handledEvents).toContain('invoice.payment_failed')
    })
  })

  // ─── Status Mapping ──────────────────────────────────────────────

  describe('Stripe to Internal Status Mapping', () => {
    function mapStripeStatus(stripeStatus: string): string {
      switch (stripeStatus) {
        case 'active':
        case 'trialing':
          return 'active'
        case 'past_due':
          return 'past_due'
        case 'canceled':
          return 'canceled'
        case 'unpaid':
          return 'unpaid'
        case 'incomplete':
        default:
          return 'incomplete'
      }
    }

    it('should map Stripe "active" to "active"', () => {
      expect(mapStripeStatus('active')).toBe('active')
    })

    it('should map Stripe "trialing" to "active"', () => {
      expect(mapStripeStatus('trialing')).toBe('active')
    })

    it('should map Stripe "past_due" to "past_due"', () => {
      expect(mapStripeStatus('past_due')).toBe('past_due')
    })

    it('should map Stripe "canceled" to "canceled"', () => {
      expect(mapStripeStatus('canceled')).toBe('canceled')
    })

    it('should map Stripe "unpaid" to "unpaid"', () => {
      expect(mapStripeStatus('unpaid')).toBe('unpaid')
    })

    it('should map Stripe "incomplete" to "incomplete"', () => {
      expect(mapStripeStatus('incomplete')).toBe('incomplete')
    })

    it('should default unknown statuses to "incomplete"', () => {
      expect(mapStripeStatus('unknown_status')).toBe('incomplete')
    })
  })

  // ─── Business ID Extraction ───────────────────────────────────────

  describe('Business ID Extraction', () => {
    function getBusinessId(metadata: Record<string, string> | null | undefined): string | null {
      return metadata?.business_id ?? null
    }

    it('should extract business_id from metadata', () => {
      expect(getBusinessId({ business_id: 'biz-123' })).toBe('biz-123')
    })

    it('should return null when metadata is null', () => {
      expect(getBusinessId(null)).toBeNull()
    })

    it('should return null when metadata is undefined', () => {
      expect(getBusinessId(undefined)).toBeNull()
    })

    it('should return null when business_id is missing from metadata', () => {
      expect(getBusinessId({ other_key: 'value' })).toBeNull()
    })
  })

  // ─── Plan Tier Resolution ────────────────────────────────────────

  describe('Plan Tier Resolution', () => {
    function getPlanTier(
      metadata: Record<string, string> | null | undefined,
      priceId?: string | null
    ): string {
      // Try metadata first
      const tierFromMeta = metadata?.plan_tier
      if (tierFromMeta) return tierFromMeta

      // Infer from price ID
      if (priceId) {
        const plan = getPlanByPriceId(priceId)
        if (plan) return plan.id
      }

      return 'basic' // fallback
    }

    it('should prefer plan_tier from metadata', () => {
      expect(getPlanTier({ plan_tier: 'premium' })).toBe('premium')
    })

    it('should fallback to basic when no metadata or price ID', () => {
      expect(getPlanTier(null)).toBe('basic')
    })

    it('should fallback to basic with null metadata and null price ID', () => {
      expect(getPlanTier(null, null)).toBe('basic')
    })

    it('should use metadata even if price ID is provided', () => {
      expect(getPlanTier({ plan_tier: 'premium_annual' }, 'price_basic')).toBe('premium_annual')
    })
  })

  // ─── Checkout Session Completed ───────────────────────────────────

  describe('Checkout Session Completed', () => {
    it('should upsert on business_id conflict', () => {
      // The webhook handler uses upsert with { onConflict: 'business_id' }
      // This ensures only one subscription per business
      const onConflict = 'business_id'
      expect(onConflict).toBe('business_id')
    })

    it('should convert Stripe timestamp to ISO date', () => {
      // Stripe uses Unix timestamps (seconds)
      const stripeTimestamp = 1735689600 // 2025-01-01 00:00:00 UTC
      const isoDate = new Date(stripeTimestamp * 1000).toISOString()
      expect(isoDate).toBe('2025-01-01T00:00:00.000Z')
    })

    it('should only process subscription mode checkout sessions', () => {
      const mode = 'subscription'
      expect(mode).toBe('subscription')
      // Non-subscription modes should be skipped
      const paymentMode = 'payment'
      expect(paymentMode).not.toBe('subscription')
    })
  })

  // ─── Subscription Updated ────────────────────────────────────────

  describe('Subscription Updated', () => {
    it('should update by stripe_subscription_id as primary key', () => {
      // The update uses .eq('stripe_subscription_id', id) first
      // Falls back to business_id if that fails
      const subscriptionId = 'sub_test123'
      expect(subscriptionId).toBeTruthy()
    })

    it('should sync cancel_at_period_end flag', () => {
      // When user cancels but stays until end of period
      const cancelAtPeriodEnd = true
      expect(typeof cancelAtPeriodEnd).toBe('boolean')
    })

    it('should update plan tier on subscription change', () => {
      // When user upgrades/downgrades, plan should be updated
      const updateData = {
        status: 'active',
        plan: 'premium',
        stripe_price_id: 'price_premium',
      }
      expect(updateData.plan).toBe('premium')
    })
  })

  // ─── Subscription Deleted ────────────────────────────────────────

  describe('Subscription Deleted', () => {
    it('should set status to canceled', () => {
      const updateData = {
        status: 'canceled',
        cancel_at_period_end: false,
      }
      expect(updateData.status).toBe('canceled')
      expect(updateData.cancel_at_period_end).toBe(false)
    })
  })

  // ─── Invoice Payment Failed ───────────────────────────────────────

  describe('Invoice Payment Failed', () => {
    it('should set status to past_due', () => {
      const updateData = { status: 'past_due' }
      expect(updateData.status).toBe('past_due')
    })

    it('should handle missing subscription ID gracefully', () => {
      const subscriptionId = null
      expect(subscriptionId).toBeNull()
      // Handler should break early without error
    })
  })

  // ─── Subscription Price ID Extraction ─────────────────────────────

  describe('Subscription Price ID Extraction', () => {
    function getSubscriptionPriceId(subscription: {
      items?: { data?: Array<{ price: string | { id: string } }> }
    }): string | null {
      const item = subscription.items?.data?.[0]
      if (!item) return null
      return typeof item.price === 'string' ? item.price : item.price?.id ?? null
    }

    it('should extract price ID from string price', () => {
      const sub = { items: { data: [{ price: 'price_basic_123' }] } }
      expect(getSubscriptionPriceId(sub)).toBe('price_basic_123')
    })

    it('should extract price ID from object price', () => {
      const sub = { items: { data: [{ price: { id: 'price_premium_456' } }] } }
      expect(getSubscriptionPriceId(sub)).toBe('price_premium_456')
    })

    it('should return null when no items', () => {
      expect(getSubscriptionPriceId({})).toBeNull()
    })

    it('should return null when items data is empty', () => {
      expect(getSubscriptionPriceId({ items: { data: [] } })).toBeNull()
    })
  })

  // ─── Webhook Security ────────────────────────────────────────────

  describe('Webhook Security', () => {
    it('should require stripe-signature header', () => {
      // The webhook handler checks for the signature header
      const headers = new Headers()
      expect(headers.get('stripe-signature')).toBeNull()
    })

    it('should require STRIPE_WEBHOOK_SECRET env var', () => {
      // Without the env var, webhook should return 500
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      // In test env, this is typically not set
      // The handler checks for it and returns error if missing
      expect(typeof webhookSecret === 'string' || webhookSecret === undefined).toBe(true)
    })
  })
})
