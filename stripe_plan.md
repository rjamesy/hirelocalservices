# Stripe Billing Implementation Plan

**Project:** HireLocalServices (hirelocalservices.com.au)
**Date:** 2026-03-02
**Scope:** Sandbox validation through live cutover for Stripe subscription billing

---

## 1. Context — What Exists Now

### Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stripe/checkout` | POST | Creates a Stripe Checkout Session for new subscriptions. Accepts `planId` or `priceId`. Checks for existing active subscription. Uses `subscription` mode with Stripe-native 30-day trial on Basic and Premium (via `trial_period_days`). |
| `/api/stripe/webhook` | POST | Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`. Upserts `user_subscriptions` and syncs `businesses.billing_status`. |
| `/api/stripe/portal` | POST | Creates a Stripe Billing Portal session for managing existing subscriptions. |

### UI

- `/pricing` — Public pricing page with 3 plans (Basic, Premium, Annual Premium). Basic and Premium show "Start Free Trial" CTA.
- `/dashboard/billing` — Shows plan cards for unsubscribed users, current subscription details for active users, upgrade prompts for basic users, trial status banner for trialing users, and a "Manage Subscription" button that opens Stripe Portal.

### Tables

| Table | Role |
|-------|------|
| `user_subscriptions` | Source of truth. One row per user (UNIQUE on `user_id`). Fields: `stripe_customer_id`, `stripe_subscription_id`, `status`, `plan`, `stripe_price_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `trial_ends_at`. |
| `businesses.billing_status` | Derived field (`active`, `trial`, `billing_suspended`). Written by `syncBusinessBillingStatus()` in webhook and `entitlements.ts`. |
| `payment_events` | Audit trail. Logged by `logPaymentEvent()` in `protection.ts`. Fields: `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `event_type`, `metadata`. |

### Key Libraries

- `src/lib/stripe.ts` — Lazy-init server-side Stripe (`apiVersion: '2025-02-24.acacia'`), client-side `loadStripe`.
- `src/lib/constants.ts` — `PLANS` array with `priceIdEnvVar` references and `trialDays` field. `getPlanByPriceId()`, `getPlanById()`, `getValidPriceIds()`.
- `src/lib/entitlements.ts` — `getUserEntitlements()` is the sole authority for subscription state. Trial detection uses `status === 'trialing'`. Has `syncBusinessBillingStatus()` that reads entitlements and writes derived `billing_status`.
- `src/lib/protection.ts` — `getSystemFlagsSafe()` provides `payments_enabled` flag. `logPaymentEvent()` writes to `payment_events`.

### Plans

| ID | Name | Price | Trial | Env Var | Stripe Price ID (test) |
|----|------|-------|-------|---------|----------------------|
| `basic` | Basic | $4/mo | 30 days | `STRIPE_PRICE_ID_BASIC` | `price_1T3alu2VYmgw7ZXKsyHhsmCI` |
| `premium` | Premium | $10/mo | 30 days | `STRIPE_PRICE_ID_PREMIUM` | `price_1T3XUz2VYmgw7ZXK6unoZ78v` |
| `premium_annual` | Annual Premium | $99/yr | None | `STRIPE_PRICE_ID_ANNUAL` | `price_1T3arb2VYmgw7ZXK5g7bbOof` |

### Trial Strategy

**Stripe-native trials** (no separate free_trial product):
- Basic and Premium monthly plans include `trial_period_days: 30` in the Stripe Checkout `subscription_data`.
- Card is captured at signup. Stripe handles trial-to-paid conversion automatically.
- `trial_ends_at` in DB mirrors Stripe's `subscription.trial_end`.
- During trial: `user_subscriptions.status = 'trialing'`, `billing_status = 'trial'`.
- When trial ends: payment succeeds → `status = 'active'`, payment fails → `status = 'past_due'`.
- Premium Annual has no trial (`trialDays: 0`).

### Resolved Gaps

The following gaps from the original audit have been addressed:

1. **~~`STRIPE_WEBHOOK_SECRET=whsec_placeholder`~~** — Must be replaced with real `whsec_...` from Stripe CLI before testing (Phase 0 step).

2. **~~`free_trial` sets `trial_ends_at=null`~~** — RESOLVED. `free_trial` plan removed entirely. Trials are now Stripe-native via `trial_period_days`. The webhook reads `subscription.trial_end` from Stripe and writes it to `trial_ends_at` in the DB.

3. **`payments_enabled` flag can skip all webhook processing** — Still applies. The webhook checks `payments_enabled` for critical events and silently returns `200` if false. Now includes `invoice.payment_succeeded` and `invoice.payment_failed` in the guarded list (both events are consistently handled).

4. **~~Missing `invoice.payment_succeeded` handler~~** — RESOLVED. Handler added. Recovers `past_due` → `active` and syncs `billing_status`.

5. **Upgrade path creates a new subscription (double billing risk)** — Still applies. See Phase 3 for planned resolution.

6. **Abandoned `incomplete` rows remain** — Still applies. See Phase 2 for planned cleanup.

7. **~~No scheduled trial expiry job~~** — RESOLVED. Stripe-native trials handle expiry automatically. Stripe fires `customer.subscription.updated` when the trial ends, transitioning status to `active` (payment succeeded) or `past_due` (payment failed).

8. **~~Duplicate `syncBusinessBillingStatus` implementations~~** — RESOLVED. The webhook now calls the `entitlements.ts` version of `syncBusinessBillingStatus()` which derives status from full entitlement logic. The webhook's inline implementation has been replaced.

---

## 2. Phased Plan

---

### Phase 0 — Baseline & Safety Checks (no functional changes)

**Objective:** Confirm the environment is correctly configured for sandbox testing.

**Changes Required:** None (verification only).

**Steps:**

1. **Confirm env separation (test vs live)**
   - Verify `.env.local` uses `sk_test_*` and `pk_test_*` keys.
   - Verify no production `.env.production` or `.env.production.local` file exists on the dev machine.
   - Verify Stripe Dashboard > Developers is set to "Test mode".
   - Verify all three Price IDs exist in Stripe Test mode and are active.

2. **Confirm webhooks configured in Stripe test mode**
   - Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
   - Record the `whsec_...` secret from the CLI output.
   - Update `STRIPE_WEBHOOK_SECRET` in `.env.local` with the real `whsec_...` value.

3. **Confirm `payments_enabled` behavior**
   - Query: `SELECT payments_enabled FROM system_flags WHERE id = 1;`
   - Verify it is `true`.

4. **Confirm Price IDs mapping**
   - For each plan in `PLANS`, verify `process.env[plan.priceIdEnvVar]` resolves to the correct test Price ID.
   - Cross-reference with Stripe Dashboard > Products > Prices to confirm amounts match ($4, $10, $99).

**Acceptance Criteria:**
- All three Price IDs verified active in Stripe test mode.
- `STRIPE_WEBHOOK_SECRET` updated to a real Stripe CLI secret.
- `payments_enabled = true` confirmed in DB.
- Stripe CLI `stripe listen` successfully forwards to localhost.

---

### Phase 1 — Sandbox End-to-End (must pass before any live work)

**Objective:** Prove the full subscribe/trial/cancel/fail/recover lifecycle works in test mode with real Stripe events.

**Status:** Code changes complete. All handlers implemented. Ready for manual testing.

**Changes Implemented:**
- `invoice.payment_succeeded` handler added to webhook.
- `invoice.payment_succeeded` and `invoice.payment_failed` added to `paymentEvents` guard list.
- `free_trial` plan removed from all code paths.
- Stripe-native trials via `trial_period_days` on Basic and Premium.
- `trialing` status properly mapped and stored in DB.
- `trial_ends_at` populated from Stripe's `subscription.trial_end`.

**Test Scripts:** See TS-1 through TS-5 below.

**Acceptance Criteria:**
- TS-1 through TS-5 pass in sandbox.
- `payment_events` table has audit rows for every event type.
- `user_subscriptions.status` accurately reflects Stripe's state after each event.
- `businesses.billing_status` correctly syncs to `active`, `trial`, or `billing_suspended`.
- Trial subscriptions show `status='trialing'` with `trial_ends_at` set.

**Rollback Plan:**
- Revert webhook secret to `whsec_placeholder` (disables all webhook processing).
- Set `payments_enabled = false` in `system_flags`.

---

### Phase 2 — Lifecycle Hardening

**Objective:** Add idempotency and define cleanup for abandoned rows.

**Changes Required:**

#### 2a. Add Idempotency Key for Checkout Session Creation

| File | Change |
|------|--------|
| `src/app/api/stripe/checkout/route.ts` | Add `idempotency_key` to `stripe.checkout.sessions.create()` call. |

```typescript
const idempotencyKey = `checkout_${user.id}_${plan.id}_${Math.floor(Date.now() / 300000)}`

const session = await stripe.checkout.sessions.create(
  sessionConfig as Parameters<typeof stripe.checkout.sessions.create>[0],
  { idempotencyKey }
)
```

#### 2b. Cleanup Policy for Abandoned `incomplete` Rows

| File | Change |
|------|--------|
| `src/app/api/stripe/checkout/route.ts` | Before creating a new `incomplete` row, clean up any stale `incomplete` rows older than 24 hours. |

**Acceptance Criteria:**
- Double-click on checkout button within 5 minutes returns the same session URL.
- Abandoned `incomplete` rows older than 24 hours are cleaned up on next checkout attempt.
- TS-6 passes.

---

### Phase 3 — Upgrade/Downgrade Without Double Billing

**Objective:** Allow plan changes on an existing subscription without creating a second Stripe subscription.

**Changes Required:**

**Option A (Recommended): Add `/api/stripe/upgrade` route**

Create a new route that:
1. Authenticates the user.
2. Looks up the user's `user_subscriptions` row.
3. Confirms `stripe_subscription_id` exists and `status` is `active`, `trialing`, or `past_due`.
4. Retrieves the subscription from Stripe.
5. Calls `stripe.subscriptions.update()` with new price and `proration_behavior: 'create_prorations'`.
6. Returns success. The webhook handles updating our DB.

**Option B: Use Stripe Portal for upgrades (interim)**

The Stripe Billing Portal already supports plan changes if configured. The existing "Manage Subscription" button opens the portal.

**Recommendation:** B for initial launch (Portal already works), then A when needed for custom UX.

**Acceptance Criteria:**
- Upgrading from basic to premium updates the existing subscription (no new sub created).
- Only one `stripe_subscription_id` exists per user at any time.
- TS-7 passes.

---

### Phase 4 — Live Cutover

**Objective:** Switch from Stripe test mode to live mode and process a real payment.

**Pre-requisites:**
- All test scripts passed in sandbox.
- Stripe account fully activated (identity verified, bank account connected).
- Live products and prices created in Stripe Dashboard.

**Steps:**

1. **Create live products and prices**
   - Create 3 plans (Basic $4/mo, Premium $10/mo, Annual Premium $99/yr) in live mode.
   - Configure Basic and Premium with 30-day trial in Stripe product settings.
   - Record the new `price_live_*` IDs.

2. **Create live webhook endpoint**
   - URL: `https://hirelocalservices.com.au/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
   - Record the `whsec_live_*` signing secret.

3. **Configure Stripe Billing Portal in live mode**
   - Enable: cancel subscription, update payment method, view invoices.

4. **Update production environment variables**
   ```
   STRIPE_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_live_...
   STRIPE_PRICE_ID_BASIC=price_live_...
   STRIPE_PRICE_ID_PREMIUM=price_live_...
   STRIPE_PRICE_ID_ANNUAL=price_live_...
   ```
   **DO NOT** commit live keys to `.env.local` or version control.

5. **Deploy and smoke test**
   - Subscribe to Basic using a real card.
   - Verify subscription, billing_status, and payment_events in DB.
   - Cancel via Portal and verify cancellation flow.

**Acceptance Criteria:**
- Live charge appears in Stripe Dashboard.
- DB reflects correct subscription state.
- Webhook endpoint returns 200 for all events.
- Trial subscriptions show `trialing` status with correct `trial_ends_at`.

---

### Phase 5 — Post-Launch Monitoring

**Objective:** Ensure ongoing health of the billing system after go-live.

#### Drift Detection Queries

```sql
-- Users with active subscription but suspended businesses
SELECT us.user_id, us.status, us.plan, b.billing_status, b.name
FROM user_subscriptions us
JOIN businesses b ON b.owner_id = us.user_id AND b.is_seed = false
WHERE us.status IN ('active', 'trialing')
  AND b.billing_status = 'billing_suspended';

-- Users with canceled subscription but active businesses
SELECT us.user_id, us.status, us.plan, b.billing_status, b.name
FROM user_subscriptions us
JOIN businesses b ON b.owner_id = us.user_id AND b.is_seed = false
WHERE us.status IN ('canceled', 'unpaid')
  AND b.billing_status = 'active';

-- Trial subscriptions nearing expiry
SELECT us.user_id, us.plan, us.trial_ends_at,
  us.trial_ends_at::timestamp - now() as time_remaining
FROM user_subscriptions us
WHERE us.status = 'trialing'
  AND us.trial_ends_at IS NOT NULL
ORDER BY us.trial_ends_at;
```

#### Weekly Stripe Dashboard Checks

- **Payments:** Check for failed payments and retry status.
- **Subscriptions:** Check for `past_due` or `unpaid` subscriptions.
- **Webhooks:** Check for any failed deliveries in the last 7 days.
- **Disputes:** Check for any chargebacks.

---

## 3. Test Scripts

### Preconditions (all tests)

- Dev server running (`npm run dev`).
- Stripe CLI running: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- `STRIPE_WEBHOOK_SECRET` in `.env.local` matches the `whsec_...` from Stripe CLI output.
- `payments_enabled = true` in `system_flags`.
- A test user account exists and is logged in.
- Stripe test card numbers: `4242424242424242` (success), `4000000000000341` (attach succeeds, charge fails).

---

### TS-1: Sandbox — New Subscription (with Trial)

**Phase:** 1

**Steps:**

1. Navigate to `/pricing` or `/dashboard/billing`.
2. Click "Start Free Trial" for Basic ($4/month, 30-day trial).
3. On Stripe Checkout, enter test card `4242 4242 4242 4242`.
4. Complete checkout.

**Expected Results:**

- **Stripe CLI:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`.
- **UI:** Billing page shows "Basic Plan (Trial)" with trial end date.

```sql
SELECT status, plan, trial_ends_at, stripe_subscription_id
FROM user_subscriptions WHERE user_id = '<USER_UUID>';
-- Expected: status='trialing', plan='basic', trial_ends_at IS NOT NULL (30 days from now)

SELECT billing_status FROM businesses
WHERE owner_id = '<USER_UUID>' AND is_seed = false;
-- Expected: billing_status='trial'
```

---

### TS-2: Sandbox — Cancel via Portal

**Phase:** 1

**Preconditions:** TS-1 passed.

**Steps:**

1. Navigate to `/dashboard/billing`.
2. Click "Manage Subscription".
3. Cancel subscription in Stripe Portal.

**Expected Results:**

```sql
SELECT status, cancel_at_period_end FROM user_subscriptions
WHERE user_id = '<USER_UUID>';
-- After cancel at period end: status='trialing' or 'active', cancel_at_period_end=true
-- After immediate cancel: status='canceled'

SELECT billing_status FROM businesses
WHERE owner_id = '<USER_UUID>' AND is_seed = false;
-- After immediate cancel: billing_status='billing_suspended'
```

---

### TS-3: Sandbox — Payment Failure -> past_due

**Phase:** 1

**Steps:**

1. Complete TS-1 with card `4242424242424242`.
2. In Stripe Dashboard, update payment method to `4000000000000341`.
3. Trigger invoice charge (advance clock or wait for trial end).

**Expected Results:**

```sql
SELECT status FROM user_subscriptions WHERE user_id = '<USER_UUID>';
-- Expected: status='past_due'
```

---

### TS-4: Sandbox — Recovery payment_succeeded -> active

**Phase:** 1

**Preconditions:** TS-3 passed.

**Steps:**

1. In Stripe Dashboard, update payment method to `4242424242424242`.
2. Retry the failed invoice.

**Expected Results:**

```sql
SELECT status FROM user_subscriptions WHERE user_id = '<USER_UUID>';
-- Expected: status='active'

SELECT billing_status FROM businesses
WHERE owner_id = '<USER_UUID>' AND is_seed = false;
-- Expected: billing_status='active'
```

---

### TS-5: Sandbox — Annual Plan (No Trial)

**Phase:** 1

**Steps:**

1. Navigate to `/pricing`.
2. Click "Subscribe" for Annual Premium ($99/year).
3. Complete checkout with `4242424242424242`.

**Expected Results:**

```sql
SELECT status, plan, trial_ends_at FROM user_subscriptions
WHERE user_id = '<USER_UUID>';
-- Expected: status='active' (NOT trialing), plan='premium_annual', trial_ends_at IS NULL
```

---

### TS-6: Sandbox — Duplicate Click / Idempotency

**Phase:** 2 (requires idempotency key)

**Steps:** Double-click checkout button, verify same session URL returned.

---

### TS-7: Sandbox — Upgrade Plan

**Phase:** 3 (requires upgrade route)

**Steps:** Upgrade from basic to premium, verify single subscription updated.

---

## 4. Decisions

### Resolved

- **D-3: Trial strategy** — Stripe-native. `trial_period_days: 30` on Basic and Premium. No separate free_trial product. Card captured at signup. Stripe handles trial-to-paid conversion.
- **D-5: Duplicate syncBusinessBillingStatus** — Webhook now uses the `entitlements.ts` version.
- **Free trial plan** — Removed entirely. Replaced by Stripe-native trials on Basic and Premium.

### Pending

- **D-1: Upgrade path** — Recommended: Stripe Portal for initial launch (Option B), then custom `/api/stripe/upgrade` route (Option A) when needed.
- **D-2: past_due entitlement** — Current behavior: `past_due` users remain active with warning banner. Listings stay visible. Only `canceled` (past period end) or `unpaid` blocks the listing.
- **D-4: Cleanup policy** — Recommended: On-checkout cleanup of `incomplete` rows older than 24 hours (Phase 2).

---

## 5. Next Steps

1. **Replace `STRIPE_WEBHOOK_SECRET`** — Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, copy `whsec_...`, paste into `.env.local`. (Phase 0)

2. **Run TS-1 through TS-5** — Validate the full lifecycle in sandbox with Stripe CLI forwarding. (Phase 1)

3. **Implement idempotency + incomplete cleanup** — Phase 2 hardening.
