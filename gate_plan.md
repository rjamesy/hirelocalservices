# Checkout Gate Plan

## Data Model Confirmation

- `businesses` table = single table for all listings (draft, published, paused, suspended)
- `businesses.status` CHECK: `('draft', 'published', 'suspended', 'paused')`
- `businesses.deleted_at` — soft delete (NULL = active)
- `businesses.is_seed` — excludes seeded/imported data
- `PlanTier = 'basic' | 'premium' | 'premium_annual'` — matches `PLANS[]` in `constants.ts` and Stripe price mapping

## Canonical Function

**File:** `src/lib/required-plan.ts` (replace existing contents)

### `computeCheckoutGate(supabase, userId, listingId)`

**Queries (all 3 run in parallel):**

1. **Other listings count** — `businesses` WHERE `owner_id = userId` AND `id != listingId` AND `is_seed = false` AND `deleted_at IS NULL`
```sql
SELECT COUNT(*) FROM businesses
WHERE owner_id = :userId
  AND id != :listingId
  AND is_seed = false
  AND deleted_at IS NULL
```
Result: `otherListingsCount`

2. **Photos** — `photos` WHERE `business_id = listingId` AND `status != 'pending_delete'`
```sql
SELECT COUNT(*) FROM photos
WHERE business_id = :listingId
  AND status != 'pending_delete'
```
Result: `photoCount`

3. **Testimonials** — `testimonials` WHERE `business_id = listingId` AND `status != 'pending_delete'`
```sql
SELECT COUNT(*) FROM testimonials
WHERE business_id = :listingId
  AND status != 'pending_delete'
```
Result: `testimonialCount`

**Computation:**
```
needsPremium   = (photoCount > 0) OR (testimonialCount > 0)
multiListing   = (otherListingsCount >= 1)   // i.e. total listings >= 2

IF multiListing OR needsPremium:
  allowedPlans = ['premium', 'premium_annual']
  minimumPlan  = 'premium'
ELSE:
  allowedPlans = ['basic', 'premium', 'premium_annual']
  minimumPlan  = 'basic'

reasons = []
IF multiListing:  reasons.push('multiple_listings')
IF needsPremium:  reasons.push('photos_or_testimonials')
```

**Return type:**
```typescript
type CheckoutGateResult = {
  allowedPlans: PlanTier[]
  minimumPlan: 'basic' | 'premium'
  reasons: ('multiple_listings' | 'photos_or_testimonials')[]
  otherListingsCount: number
  photoCount: number
  testimonialCount: number
  returnTo: string  // `/dashboard/listing?bid=${listingId}&step=preview`
}
```

### `checkPlanSufficiency(currentPlan, gateResult)` — pure, no I/O

Returns `null` if plan is sufficient, or:
```typescript
type PlanGatingError = {
  code: 'SUBSCRIPTION_REQUIRED' | 'UPGRADE_REQUIRED'
  minimumPlan: 'basic' | 'premium'
  currentPlan: PlanTier | null
  allowedPlans: PlanTier[]
  reasons: string[]
}
```

Logic:
- `currentPlan === null` → `SUBSCRIPTION_REQUIRED`
- `currentPlan === 'basic'` AND `minimumPlan === 'premium'` → `UPGRADE_REQUIRED`
- Otherwise → `null` (sufficient)

---

## Files to Change

| Phase | File | Action |
|-------|------|--------|
| 1 | `src/lib/required-plan.ts` | **REWRITE** — `computeCheckoutGate()`, `checkPlanSufficiency()`, types |
| 1 | `src/lib/__tests__/required-plan.test.ts` | **REWRITE** — Updated unit tests |
| 2 | `src/app/actions/business.ts` | **MODIFY** — Replace ~18 lines in `publishChanges()` to use `computeCheckoutGate` + `checkPlanSufficiency`; return full `gating` in error |
| 3 | `src/app/api/stripe/checkout/route.ts` | **MODIFY** — Accept `listingId`, call `computeCheckoutGate`, validate chosen plan is in `allowedPlans`, use gate's `returnTo` for success/cancel URLs |
| 4 | `src/app/dashboard/listing/page.tsx` | **MODIFY** — Remove client-side gate logic; on server `subscription_required`/`upgrade_required` error, redirect to `/dashboard/billing?upgrade=1&listingId=<id>` |
| 4 | `src/app/dashboard/billing/page.tsx` | **MODIFY** — Read `listingId` from params, fetch gate result from server, render only `allowedPlans`, show reason messages, pass `listingId` to checkout |

---

## New Server Endpoint (Phase 4)

**`GET /api/checkout-gate?listingId=xxx`** (or server action `getCheckoutGate(listingId)`)

- Authenticates user
- Verifies user owns the listing
- Calls `computeCheckoutGate(supabase, userId, listingId)`
- Returns JSON `CheckoutGateResult`
- Used by billing page to render correct plans + messages

---

## Test Cases

### Unsubscribed user
1. L=1 (otherListingsCount=0), 0 photos, 0 testimonials → 3 plans, minimumPlan='basic'
2. L=1 (otherListingsCount=0), 1+ photos or testimonials → 2 plans, minimumPlan='premium'
3. L=2+ (otherListingsCount>=1), any content → 2 plans, minimumPlan='premium'

### Subscribed Basic
4. L=1, 0 content → submit allowed (null)
5. L=1, 1+ photos or testimonials → UPGRADE_REQUIRED, 2 plans
6. L=2+ (otherListingsCount>=1) → UPGRADE_REQUIRED, 2 plans

### Subscribed Premium/Annual
7. Any L, any content → submit allowed (null)

### Security
8. Client sends `planId=basic` to checkout when gate says 2 plans only → 400 rejected
9. Client forges query params → ignored, server recomputes from `listingId`

### Edge cases
10. L=1 (otherListingsCount=0), only pending_delete photos → 3 plans (pending_delete excluded)
11. listingId not owned by user → error (ownership check)
