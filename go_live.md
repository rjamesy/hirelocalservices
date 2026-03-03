# HireLocalServices — Master Go-Live Plan & Audit

**Created:** 2 March 2026
**Last Updated:** 3 March 2026
**Author:** Claude (work instruction for implementation)
**Sign-off Required:** Richard

---

## A. Scope and Non-Scope

### In-Scope (Must Be Complete Before Launch)

- Subscription gating correctness end-to-end (all tiers, all content types)
- Listing workflow correctness (create, edit, submit, approve/reject, publish/unpublish)
- Subscription lifecycle: cancellation → period end → listings paused; payment failure → retry → final failure → listings paused; paying restores
- Settings page: delete account, cancel subscription, plan details (date subscribed, renewal date, subscription change date)
- Password flows: forgot password, reset password
- Metrics for premium/annual users (impressions, page views, contact clicks via click-to-reveal)
- Admin tools operational: verification queue, account management, seed tools
- Blacklist expansion: phone, website, ABN, ACN match at publish time → account suspension
- Mobile-friendly: all pages must work on mobile phone browsers
- Per-plan test scripts and E2E tests for each subscription tier
- Production deployment readiness (env vars, Stripe live mode, DNS, SSL)
- UA checklist signed off by Richard

### Out-of-Scope (Post Go-Live)

- Email templates and transactional email setup (SES)
- Deep UI polish beyond functional correctness
- "Nice-to-have" features (messaging, featured listings, API keys)
- Production data seeding (5,000 Google Places listings)
- JSON-LD structured data for SEO

---

## B. Business Logic Summary (Authoritative Rules)

### B1. Listings & Drafts (P / W Model)

- **P** = Published listing (live, public-facing)
- **W** = Working listing (draft or amendment, never public)
- Creating a listing always creates a W
- Editing a P creates a W (amendment)
- W never auto-publishes — publishing always requires explicit user action
- W → `pending` (admin review) only when user clicks Publish
- Admin never sees raw W drafts — admin only sees listings in `pending` review status
- Delete in edit mode deletes W only (the amendment)
- Delete on live P soft-deletes P (irreversible to user, removed from public permanently)
- If P + W exists, Delete removes W first (user must delete W before they can delete P)
- W amendments do NOT count as additional listings

### B2. Subscription Rules

**Plan limits:**
- Basic ($4/mo, 30-day trial) = max 1 published (P) listing
- Premium ($10/mo, 30-day trial) = multiple P listings (up to cap, currently 10)
- Annual Premium ($99/yr, no trial) = multiple P listings (up to cap, currently 10)
- Drafts (W) do NOT consume publish entitlement (only published P listings count toward publish limit)
- Basic users can create drafts freely (publish limit is 1 P, but drafts don't count toward publish limit)
- Hard cap: total non-deleted businesses (drafts + published) limited by `maxListings` (prevents creating 500 drafts)
- Add Listing button always visible (upsell opportunity) — hidden only if hard cap reached (total drafts + published = `maxListings`)
- Publishing beyond plan limit triggers upgrade prompt
- Subscription enables publishing, not auto-submission
- Subscribing does NOT auto-send drafts to admin — user must explicitly publish each W
- **Users cannot downgrade subscription** — they must cancel and resubscribe to a different plan

**Subscription cancelled (user action):**
- Stripe sets `cancel_at_period_end = true`
- `billing_status` stays `active`, listings stay live until end of current billing period
- UI shows "Cancels on [date]" badge during this period
- At period end → Stripe fires `customer.subscription.deleted` webhook → all listings set to `paused_subscription_expired`
- Do NOT prematurely pause before webhook fires
- User can resubscribe to restore listings

**Payment fails:**
- During Stripe retry period → listings remain live (status: `past_due`)
- On final payment failure → all listings set to `paused_payment_failed`
- Paying (successful retry or manual payment) restores listings to live

**Admin suspends account:**
- Subscription cancelled immediately (Stripe API call)
- All listings hidden from public
- Account locked permanently — cannot perform any actions
- Suspended account can still log in (sees suspension notice) but cannot take any actions
- Blacklisted email blocks future sign-up attempts
- Blacklist match at publish (phone, website, ABN, ACN) → immediate account suspension + subscription cancelled

**Blacklist normalization rules (for matching):**
- Phone → strip spaces, dashes, country code → exact match on normalized digits
- Website → lowercase, strip protocol (`http://`/`https://`), strip `www.` → exact match
- ABN/ACN → digits only → exact match
- Do NOT use fuzzy matching for phone/ABN/ACN (false positives = legal risk)
- Business names → keep existing contains/starts_with matching

**Blacklist population:**
- Admin manual entries
- Auto-populated on account suspension: email, phone, website, ABN, ACN all added to blacklist automatically

**Current implementation vs required:**
- Currently `billing_status = 'billing_suspended'` covers all expiry/failure cases as one status
- **NEW:** Need granular pause reasons: `paused_subscription_expired`, `paused_payment_failed` (schema change required)
- Currently blacklist only checks business names — **NEW:** must expand to phone, website, ABN, ACN at publish time with normalized exact matching

### B3. Publish Flow

- User can create a listing without any subscription
- On Publish:
  - If no active subscription → listing set to `awaiting_subscription`, redirect to plans page
  - If subscription active but insufficient plan (e.g. Basic with photos) → `upgrade_required` error, redirect to plans
  - If subscription active and plan sufficient → submit for review
- After successful subscription checkout:
  - User redirected to My Listings dashboard
  - Listing does NOT auto-publish — user must explicitly click Publish again
- Only valid, complete listings can be submitted
- At least one contact method required (phone, email, or website)

**Current implementation vs required:**
- Currently returns `subscription_required` error but does NOT set an `awaiting_subscription` status on the listing — **NEW:** need `awaiting_subscription` listing status
- Currently redirects post-checkout to `/dashboard/listing` (the wizard) — **CHANGE:** should redirect to My Listings dashboard
- Contact method validation exists in `business_contacts` table (`has_contact` generated column) — verify enforced at publish time

### B4. Admin Review

- Only listings in `pending` status go to admin queue
- Admin approves → W becomes new P (published, live)
- Admin rejects → W status becomes `changes_required` (user can re-edit and resubmit)
- Admin suspends listing → P hidden from public, user may submit amendment W to address issues
- Suspension is listing-level, not account-level (unless admin suspends the account itself)

### B5. Deletion

- Delete W → removes amendment only (reversible, user can create new W)
- Delete P → soft delete, removed from public permanently (irreversible to user)
- Delete account (self-service):
  - Cancel subscription immediately (Stripe API)
  - Soft delete all P listings
  - Delete all W listings
  - Blacklist email + identifiers (phone, website, ABN, ACN)
  - User cannot reuse same email to sign up again

### B6. AI Moderation

- Description checked on Save and on Publish (server-side)
- Defamatory content → blocked
- Marketing puffery → allowed (legitimate business promotion is fine)
- Blacklist check runs on Publish (business name, phone, website, ABN, ACN)
- AI moderation failure blocks the submission, not the account (unless blacklist match triggers suspension)

**Current implementation vs required:**
- AI review runs at publish time in `publishChanges()` — ✅ exists
- Blacklist currently name-only — **NEW:** must expand to phone/website/ABN/ACN
- Description checked at save time — verify `updateBusiness()` also runs content checks

### B7. Limits & UI

Two-tier limit system:
- **Publish entitlement:** Only published (P) listings count. Basic = max 1 published, Premium/Annual = max 10 published. Enforced at publish time.
- **Hard cap (Add Listing):** ALL non-deleted businesses (drafts + published) count. Prevents creating 500 drafts. Add Listing button hidden when total reaches `maxListings`.

Other rules:
- Amendment W does not consume a listing slot (shadows existing business row)
- Basic users see Add Listing button (upsell opportunity) until hard cap reached
- Publishing beyond publish limit triggers upgrade prompt

**Current implementation vs required:**
- `canClaimMore` in `src/lib/entitlements.ts` currently counts ALL non-seed, non-deleted businesses (drafts + published) for both creation AND publishing — **CHANGE NEEDED:** Split into two checks: (1) `canCreateMore` = total count < maxListings (for Add Listing button), (2) `canPublishMore` = published count < plan publish limit (for publish gate)

### Subscription Limits Table

| Feature | Basic ($4/mo) | Premium ($10/mo) | Annual ($99/yr) |
|---------|---------------|-------------------|-----------------|
| Published listings | 1 | 10 | 10 |
| Photos | 0 | 10 | 10 |
| Testimonials | 0 | 20 | 20 |
| Description limit | 500 chars | 1,500 chars | 2,500 chars |
| Metrics dashboard | No | Yes | Yes |
| Trial | 30 days | 30 days | None |

### Metrics (Premium + Annual Only)

**Visitor metrics:**
- Search impressions: how many times the listing appeared in search results
- Profile views: how many times the listing detail page was viewed

**Contact metrics:**
- Contact details use "click to reveal" — phone, email, website hidden behind button
- Each reveal/click tracked separately (phone_clicks, email_clicks, website_clicks)

**Stats timeframe:**
- All time
- Current month

**Gating:** Basic subscription does NOT get metrics. Premium and Annual only.

**Dashboard:** Owner-facing metrics page at `/dashboard/metrics`

### Admin

Admin must have tools to operate the website effectively:
- Review queue: view pending listings, approve/reject/suspend with comments
- Account management: suspend/unsuspend accounts, change plans, view audit trail
- Seed management: visibility controls, expiry, confidence filtering, source toggles
- Duplicate handling: detection at submit time, admin merge on approval
- Blacklist: business name + phone + website + ABN + ACN (exact, contains, starts_with)
- System flags: registrations, listings, payments, claims, maintenance mode, CAPTCHA
- Operational reports: subscription, listing, moderation metrics by time period

### Seed -> Claim -> De-dupe

- Seed production data from Google Places AFTER go-live readiness achieved: target 5,000 listings
- Claim workflow:
  1. Public listing shows "Is this your business?" button if `claim_status='unclaimed'`
  2. User submits claim with business details (name, phone, website, postcode, email)
  3. System calculates match score (name similarity, phone match, website match, postcode match)
  4. Auto-approve if score >= 0.75, admin review if 0.40-0.75, reject if < 0.40
  5. On admin approval: seed is soft-deleted, user listing becomes canonical, `merged_seed_business_id` set
- De-dupe at submit: `publishChanges()` runs duplicate detection against nearby businesses with similar names
  - User presented with potential matches, must confirm "matched" or "not matched"
  - If matched and approved, admin soft-deletes the seed

### Settings UI Requirements

**Subscribed user settings page must include:**
- Delete account (self-service with confirmation dialog)
- Cancel subscription (link to Stripe Billing Portal)
- Current plan details: plan name, price, status, `subscribed_at` (date first subscribed), renewal date (`current_period_end`), `plan_changed_at` (last plan change date)

**DB columns needed on `user_subscriptions`:**
- `subscribed_at timestamptz NOT NULL DEFAULT now()` — set on first subscription creation
- `plan_changed_at timestamptz NOT NULL DEFAULT now()` — updated on: new subscription, plan upgrade, resubscribe after cancellation

**Password flows:**
- Forgot password (from login page)
- Reset password (from email link callback)

### Mobile-Friendly Requirement

- All pages must be mobile phone friendly (responsive design)
- Dashboard, billing, listing wizard, search, detail pages — all must work on mobile browsers
- This is an in-scope launch requirement, not post-launch polish

---

## C. Go-Live Readiness Requirements

All of the following must be true before launch:

1. Subscription gating correct end-to-end (all 3 tiers enforce limits at submit, upload, and display)
2. Listing workflow stable (create -> edit -> submit -> verify -> approve/reject -> publish)
3. Subscription lifecycle correct: cancellation → live until period end → `paused_subscription_expired`; payment failure → retry → `paused_payment_failed`; paying restores
4. Post-checkout redirect works correctly (return to My Listings, subscription reconciled)
5. Settings page functional (delete account, cancel subscription, plan details with dates, password reset)
6. Forgot/reset password flow works
7. Metrics working for premium/annual users (impressions + page views + contact clicks via click-to-reveal + dashboard)
8. No in-app downgrade — user must cancel subscription and resubscribe to change plans
9. Blacklist expanded: phone, website, ABN, ACN checked at publish time → account suspension on match
10. Drafts do not consume subscription entitlement (unlimited drafts, publish gated)
11. Admin tools functional and tested (verification queue, account mgmt, seed tools)
12. All pages mobile-friendly (responsive on phone browsers)
13. Per-plan test scripts and E2E tests passing for Basic, Premium, and Annual tiers
14. Production environment configured (Stripe live keys, Supabase prod, DNS, SSL)
15. UA checklist complete and signed off by Richard

---

## D. Implementation Plan in Phases

---

### Phase 1: Settings Page + Password Flows

**Goal:** Users can manage their account: delete account, view plan details, change/reset password.

**Deliverables:**
1. Settings page redesign with sections: Account, Subscription, Security
2. Self-service delete account (with confirmation dialog + Stripe subscription cancellation)
3. Plan details display: plan name, price, status, date subscribed, renewal date, cancel status
4. Forgot password page (`/forgot-password`)
5. Reset password page (`/reset-password`) — handles Supabase auth callback for password reset
6. Change password from settings (optional — Supabase `updateUser({ password })`)

**Recommended Code Changes:**

| File | Change |
|------|--------|
| `src/app/dashboard/settings/page.tsx` | Rebuild: add account deletion, plan details, change password sections |
| `src/app/forgot-password/page.tsx` | **CREATE** — form that calls `supabase.auth.resetPasswordForEmail()` |
| `src/app/reset-password/page.tsx` | **CREATE** — form that calls `supabase.auth.updateUser({ password })` after token exchange |
| `src/app/auth/callback/route.ts` | Ensure password reset token exchange is handled (may already work via `code` param) |
| `src/app/actions/account.ts` | **CREATE** — `deleteMyAccount()` server action: cancel Stripe sub, soft-delete all P listings, delete all W listings, blacklist email + identifiers (phone/website/ABN/ACN), suspend profile |
| `src/app/login/page.tsx` | Add "Forgot password?" link |
| `src/app/dashboard/billing/page.tsx` | Ensure "Manage Subscription" button is prominent for cancel flow |

**Risks:**
- Supabase password reset email requires SMTP configured (or Supabase's default email)
- Delete account must cancel Stripe subscription immediately to prevent orphan charges
- Delete account must blacklist email + identifiers so user cannot re-register with same email

**Dependencies:** None (can start immediately)

**Test Plan:**
- Unit: `deleteMyAccount()` cancels Stripe, soft-deletes businesses, suspends profile
- E2E: Register -> Forgot password -> Email link -> Reset password -> Login with new password
- E2E: Settings -> Delete account -> Confirm -> Logged out -> Cannot login
- E2E: Settings -> View plan details -> Correct plan/dates shown
- E2E: Settings -> Change password -> Logout -> Login with new password

**UA Steps:**
1. Navigate to Settings as subscribed user
2. Verify plan name, price, renewal date are correct
3. Click "Forgot Password" from login page, receive email, reset password, login works
4. Click "Delete Account" from settings, confirm, verify logged out and cannot re-login

**Sign-off:** Richard must UA test and approve before Phase 2.

---

### Phase 2: Metrics System (Premium/Annual)

**Goal:** Premium and Annual subscribers see listing performance metrics.

**Deliverables:**
1. Metrics dashboard page at `/dashboard/metrics`
2. Wire up search impression tracking (function exists but never called)
3. Implement contact click-to-reveal tracking
4. Timeframe filtering: all time vs current month
5. Premium/annual gating on metrics access

**Recommended Code Changes:**

| File | Change |
|------|--------|
| `src/app/dashboard/metrics/page.tsx` | **CREATE** — metrics dashboard with impression, view, contact click stats per listing |
| `src/app/actions/metrics.ts` | Add `trackContactClick(businessId, type)`, add `getBusinessMetrics()` with timeframe param, add premium gating |
| `src/components/SearchImpressionTracker.tsx` | **CREATE** — Client component using `useEffect` to call `trackSearchImpressions(businessIds)`. Excludes bots (client-side only, requires JS). |
| `src/app/search/page.tsx` | Render `<SearchImpressionTracker businessIds={...} />` client component after results |
| `src/app/[state]/[category]/page.tsx` | Same — render `<SearchImpressionTracker />` |
| `src/app/[state]/[category]/[location]/page.tsx` | Same |
| `src/app/business/[slug]/page.tsx` | Replace direct contact links with click-to-reveal components that track clicks |
| `src/components/ContactReveal.tsx` | **CREATE** — "Click to view phone/email/website" component with tracking |
| `supabase/migrations/00046_contact_clicks.sql` | **CREATE** — add `contact_clicks` column to `business_metrics` OR create separate tracking, add `increment_contact_click()` RPC |
| `src/lib/entitlements.ts` | Add `canViewMetrics` field to entitlements (true for premium/annual) |

**DB Schema Addition:**
```sql
-- Option A: Add columns to business_metrics
ALTER TABLE business_metrics
  ADD COLUMN phone_clicks int NOT NULL DEFAULT 0,
  ADD COLUMN email_clicks int NOT NULL DEFAULT 0,
  ADD COLUMN website_clicks int NOT NULL DEFAULT 0;

-- RPC: increment_contact_click(business_id, click_type)
```

**Risks:**
- Search impression tracking uses client-side `useEffect` to exclude bots — if JS disabled, impressions won't count (acceptable trade-off per Richard's decision)
- Contact click-to-reveal changes public listing page UI significantly — must ensure mobile touch targets are adequate
- Click-to-reveal must work well on mobile (touch targets, responsive layout)

**Dependencies:** None (can run parallel with Phase 1)

**Test Plan:**
- Unit: `trackSearchImpressions()` increments correctly, `trackContactClick()` works
- Unit: `getBusinessMetrics()` returns correct aggregates for time ranges
- Unit: Entitlements `canViewMetrics` = false for basic, true for premium/annual
- E2E: Search for listings -> impressions increment in DB
- E2E: View listing detail -> profile_views increment
- E2E: Click phone reveal -> phone_clicks increment
- E2E: Premium user sees metrics dashboard with stats
- E2E: Basic user sees "upgrade to see metrics" or no metrics nav item

**UA Steps:**
1. As premium user, view metrics dashboard
2. Verify impressions, views, clicks are tracking
3. Switch between "All Time" and "Current Month"
4. As basic user, verify metrics are inaccessible

**Sign-off:** Richard must UA test and approve before Phase 3.

---

### Phase 3: Subscription Lifecycle + Blacklist Expansion + Listing Count Fix

**Goal:** Subscription cancellation, payment failure, and restoration work correctly. Blacklist expanded beyond business names. Listing count only counts published listings (drafts free).

**Deliverables:**
1. New listing/billing statuses: `awaiting_subscription`, `paused_subscription_expired`, `paused_payment_failed` (DB migration)
2. Subscription cancelled → listings live until period end → `paused_subscription_expired` at period end
3. Payment failure → listings live during retry → `paused_payment_failed` on final failure → paying restores to live
4. No in-app plan downgrade — remove any downgrade UI from billing page; user must cancel and resubscribe via Stripe Portal
5. `awaiting_subscription` status set on listing when user tries to publish without subscription
6. Post-checkout redirect changed: return to My Listings dashboard (not listing wizard)
7. Blacklist expansion: phone, website, ABN, ACN checked at publish time → match triggers immediate account suspension + subscription cancellation
8. Split listing limits into two checks: `canCreateMore` (total count < maxListings hard cap) and `canPublishMore` (published count < plan publish limit)
9. Add `subscribed_at` and `plan_changed_at` columns to `user_subscriptions`
10. Verify `computeCheckoutGate()` + `checkPlanSufficiency()` still correct
11. Verify `publishChanges()` gate blocks Basic users with premium content

**Recommended Code Changes:**

| File | Change |
|------|--------|
| `supabase/migrations/00047_subscription_lifecycle.sql` | **CREATE** — Add new status values to `billing_status` enum: `paused_subscription_expired`, `paused_payment_failed`. Add `awaiting_subscription` to `businesses.status` enum or create `publish_status` column. |
| `src/app/api/stripe/webhook/route.ts` | `customer.subscription.deleted`: set `paused_subscription_expired` (not generic `billing_suspended`). `invoice.payment_failed` (final): set `paused_payment_failed`. `invoice.payment_succeeded`: restore from any paused state to `active`. |
| `src/app/actions/business.ts` | In `publishChanges()`: when `subscription_required`, set listing to `awaiting_subscription` status. Add blacklist check for phone/website/ABN/ACN — on match, call `adminSuspendAccount()` + cancel Stripe subscription. |
| `src/lib/blacklist.ts` | Expand to accept phone, website, ABN, ACN fields. Add normalization functions (phone: strip spaces/dashes/country code; website: lowercase, strip protocol+www; ABN/ACN: digits only). Exact match on normalized values. |
| `src/lib/entitlements.ts` | Split `canClaimMore` into two: `canCreateMore` (total non-deleted < maxListings hard cap) and `canPublishMore` (published count < plan publish limit). |
| `supabase/migrations/00048_subscription_dates.sql` | **CREATE** — Add `subscribed_at timestamptz NOT NULL DEFAULT now()` and `plan_changed_at timestamptz NOT NULL DEFAULT now()` to `user_subscriptions`. |
| `src/app/dashboard/billing/page.tsx` | Remove any in-app downgrade/plan-switch UI. Cancel goes via Stripe Portal. Subscribing to a different plan requires cancel + new checkout. |
| `src/app/api/stripe/checkout/route.ts` | Change `success_url` default from `/dashboard/listing` to `/dashboard` (My Listings). |
| `src/lib/required-plan.ts` | Verify all edge cases (already has unit tests) |

**Risks:**
- Schema migration with new enum values — must be backwards compatible
- Stripe Portal may still show plan change options — consider disabling in Stripe Dashboard billing portal settings
- Blacklist matching on phone/website/ABN/ACN needs exact-match or fuzzy — define matching rules
- Changing listing count to published-only may allow users to create many draft businesses — MAX hard cap still applies

**Dependencies:** Phase 1 (settings page needed for cancel flow context)

**Test Plan:**
- Unit: Webhook sets `paused_subscription_expired` on subscription deletion
- Unit: Webhook sets `paused_payment_failed` on final invoice failure
- Unit: Webhook restores to `active` on successful payment
- Unit: `publishChanges()` sets `awaiting_subscription` when no subscription
- Unit: Blacklist check matches phone/website/ABN/ACN and triggers suspension
- Unit: `canCreateMore` counts total (drafts + published) against hard cap
- Unit: `canPublishMore` counts only published listings against plan publish limit
- E2E: Cancel subscription → listings live until period end → paused after
- E2E: Simulate payment failure → listings paused → pay → restored
- E2E: Basic user publishes beyond limit → upgrade prompt
- E2E: Basic user creates multiple drafts → succeeds (up to hard cap)
- E2E: Blacklist phone match at publish → account suspended
- E2E: Post-checkout → lands on My Listings dashboard

**UA Steps:**
1. Cancel subscription, verify listings stay live for remainder of period
2. Verify listings pause after period ends
3. Resubscribe, verify listings restored
4. As Basic user, create multiple draft listings (should succeed)
5. Try to publish 2nd listing as Basic → upgrade prompt
6. Complete full checkout flow end-to-end, verify redirect to My Listings

**Sign-off:** Richard must UA test and approve before Phase 4.

---

### Phase 4: Admin Queue Hardening + Subscription Warning

**Goal:** Admin tools are production-ready with subscription status visibility.

**Deliverables:**
1. Add subscription warning badge to admin verification queue
2. Verify admin approve/reject/suspend all work correctly
3. Verify seed merge on approval works
4. Verify claim queue works
5. Test all admin system settings toggles

**Recommended Code Changes:**

| File | Change |
|------|--------|
| `src/app/actions/verification.ts` | In `getAdminVerificationQueue()`: add `owner_id` to query, batch-fetch entitlements, compute `subscriptionWarning` per row |
| `src/app/admin/verification/page.tsx` | Render warning badge: "No subscription" (red), "Plan insufficient" (orange), "Subscription inactive" (yellow) |

**Risks:**
- N+1 query risk if entitlements fetched per listing (use `getBatchUserEntitlements()`)
- Admin may approve a listing whose owner has no subscription — listing publishes but won't appear in search (existing behavior via `is_search_eligible()`)

**Dependencies:** Phase 3 (subscription gating must be correct)

**Test Plan:**
- Unit: Queue returns correct `subscriptionWarning` per listing
- E2E: Admin sees warning badge on listing where owner has no subscription
- E2E: Admin approves listing -> listing status correct
- E2E: Admin rejects listing -> pending changes reverted
- E2E: Admin suspends listing -> removed from search

**UA Steps:**
1. As admin, open verification queue
2. Verify subscription warnings shown correctly
3. Approve a listing, verify it goes live
4. Reject a listing, verify owner can re-edit
5. Suspend a listing, verify removed from search

**Sign-off:** Richard must UA test and approve before Phase 5.

---

### Phase 5: Production Deployment

**Goal:** Deploy to production and verify everything works with live Stripe.

**Deliverables:**
1. Stripe live mode keys configured
2. Stripe webhook endpoint registered for production URL
3. Supabase production database migrated (all 45+ migrations)
4. Environment variables set on production server
5. DNS + SSL verified
6. Smoke test all critical flows

**Recommended Steps:**

| Step | Detail |
|------|--------|
| Stripe configuration | Create live products/prices matching dev (Basic $4, Premium $10, Annual $99). Set webhook URL to `https://hirelocalservices.com.au/api/stripe/webhook` |
| Supabase prod | Apply all migrations via `supabase db push` (targeting prod ref `hqaeezfsetzyubcmbwbv`) |
| Environment vars | Set all `STRIPE_*`, `NEXT_PUBLIC_SUPABASE_*`, `OPENAI_API_KEY`, `AWS_*` vars on production |
| Build + deploy | `npm run build` on production or via Vercel |
| DNS | Verify `hirelocalservices.com.au` resolves to production |
| SSL | Verify HTTPS working (Let's Encrypt or AWS Certificate Manager) |

**Risks:**
- Stripe live mode prices have different IDs than test mode — must update env vars
- Supabase prod may have schema differences if manual changes were made
- First-time webhook registration may miss events during transition

**Dependencies:** Phases 1-4 all signed off

**Test Plan:**
- Smoke: Register account -> verify email -> login -> create listing -> subscribe (real card or Stripe test card if still in test mode) -> submit -> admin approve -> verify live in search
- Smoke: Forgot password -> email received -> reset works
- Smoke: Delete account -> cannot login
- Smoke: Admin queue -> approve/reject -> correct behavior

**UA Steps:**
1. Full end-to-end as a new user (Richard creates real account)
2. Subscribe with real payment method
3. Create and publish a listing
4. Verify listing appears in search
5. Test all critical flows from UA checklist

**Sign-off:** Richard must complete full UA checklist.

---

### Phase 6 (Post Go-Live): Seeding + Email + Polish

**Goal:** Populate production data and set up email.

**Deliverables:**
1. Seed 5,000 listings from Google Places
2. Configure AWS SES transactional emails
3. Email templates: welcome, verification, claim, password reset, subscription events
4. UI polish (non-functional improvements)
5. JSON-LD structured data for SEO

---

## E. Test Strategy

### Automated Tests per Phase

| Phase | New Tests Required |
|-------|-------------------|
| Phase 1 | `deleteMyAccount()` unit tests (incl. blacklisting), password reset integration tests |
| Phase 2 | Metrics tracking unit tests, entitlements `canViewMetrics` tests, contact click RPC tests, click-to-reveal component tests |
| Phase 3 | Subscription lifecycle tests (cancellation, payment failure, restoration), blacklist expansion tests, listing count fix tests, `awaiting_subscription` status tests |
| Phase 4 | Queue `subscriptionWarning` tests, batch entitlements tests |
| Phase 5 | No new unit tests (smoke tests only) |

### Per-Plan Test Scripts

Each subscription tier must have dedicated test scripts covering the full user journey for that plan:

**Basic Plan Test Script:**
- [ ] Subscribe to Basic ($4/mo) with 30-day trial
- [ ] Create draft listing (text only, no photos/testimonials)
- [ ] Create multiple draft listings (should succeed — drafts unlimited up to hard cap)
- [ ] Publish 1st listing → succeeds (within Basic limit)
- [ ] Attempt to publish 2nd listing → upgrade prompt (Basic max = 1 published)
- [ ] Attempt to add photos → blocked (Basic: 0 photos)
- [ ] Attempt to add testimonials → blocked (Basic: 0 testimonials)
- [ ] Description limited to 500 chars
- [ ] Metrics page → inaccessible (Basic: no metrics)
- [ ] Cancel subscription → listing live until period end → paused after
- [ ] Resubscribe → listing restored
- [ ] Verify on mobile browser

**Premium Plan Test Script:**
- [ ] Subscribe to Premium ($10/mo) with 30-day trial
- [ ] Create listing with photos (up to 10) and testimonials (up to 20)
- [ ] Publish listing → succeeds
- [ ] Create and publish up to 10 listings → all succeed
- [ ] Attempt 11th publish → blocked (Premium max = 10 published)
- [ ] Description limited to 1,500 chars
- [ ] Metrics page → accessible with impressions, views, contact clicks
- [ ] Click-to-reveal tracking works for phone/email/website
- [ ] Timeframe toggle: all time / current month
- [ ] Cancel subscription → listings live until period end → all paused after
- [ ] Resubscribe → listings restored
- [ ] Verify on mobile browser

**Annual Premium Plan Test Script:**
- [ ] Subscribe to Annual Premium ($99/yr) — no trial
- [ ] Create listing with photos (up to 10) and testimonials (up to 20)
- [ ] Publish listing → succeeds
- [ ] Create and publish up to 10 listings → all succeed
- [ ] Description limited to 2,500 chars
- [ ] Metrics page → accessible
- [ ] Cancel subscription → listings live until period end → all paused after
- [ ] Resubscribe → listings restored
- [ ] Verify on mobile browser

**Unsubscribed User Test Script:**
- [ ] Create draft listing → succeeds (no subscription needed for drafts)
- [ ] Attempt publish → `subscription_required` → listing set to `awaiting_subscription`
- [ ] Redirect to plans page
- [ ] Subscribe → redirect to My Listings
- [ ] Explicitly publish listing → submits for review
- [ ] Verify listing does NOT auto-publish after subscribing

### E2E Checklist per Phase

**Phase 1 E2E:**
- [ ] Register new account with email/password
- [ ] Verify email
- [ ] Login
- [ ] Navigate to settings, see plan details (plan name, date subscribed, renewal date)
- [ ] Forgot password from login page
- [ ] Reset password via email link
- [ ] Login with new password
- [ ] Delete account from settings → subscription cancelled, listings deleted, email blacklisted
- [ ] Verify cannot login after deletion
- [ ] Verify cannot re-register with same email

**Phase 2 E2E:**
- [ ] As Premium user, search for listings -> impressions tracked
- [ ] View listing detail -> page view tracked
- [ ] Click to reveal phone -> click tracked
- [ ] Click to reveal email -> click tracked
- [ ] Click to reveal website -> click tracked
- [ ] Navigate to metrics dashboard -> see stats
- [ ] Toggle timeframe (all time / current month)
- [ ] As Basic user -> metrics page inaccessible or upgrade prompt
- [ ] All metric pages render correctly on mobile

**Phase 3 E2E:**
- [ ] Unsubscribed user creates text-only listing → publish → `awaiting_subscription` → subscribe Basic → redirect to My Listings → publish → succeeds
- [ ] Unsubscribed user creates listing with photos → publish → `subscription_required` → billing shows Premium/Annual → subscribe Premium → publish succeeds
- [ ] Basic subscriber creates listing with photos → publish → `upgrade_required` → cancel + resubscribe to Premium → publish succeeds
- [ ] Basic subscriber creates text-only listing → publish → succeeds
- [ ] Basic subscriber creates multiple draft listings → succeeds (drafts don't count toward limit)
- [ ] Cancel subscription → listings live until period end → `paused_subscription_expired` after
- [ ] Payment failure simulation → listings stay live during retry → final failure → `paused_payment_failed`
- [ ] Successful payment after failure → listings restored to live
- [ ] Blacklist phone match at publish → account suspended, subscription cancelled
- [ ] Post-checkout redirect → lands on My Listings dashboard (not listing wizard)
- [ ] Verify no in-app downgrade option — user must cancel to change plans

**Phase 4 E2E:**
- [ ] Admin opens verification queue -> subscription warnings visible
- [ ] Admin approves listing -> goes live
- [ ] Admin rejects listing -> owner can re-edit and resubmit (status: `changes_required`)
- [ ] Admin suspends listing -> removed from search, user can submit amendment
- [ ] Admin unsuspends listing -> returns to search
- [ ] Admin suspends account -> subscription cancelled, all listings hidden, email blacklisted
- [ ] Admin approves claim -> seed soft-deleted, user listing canonical

**Phase 5 E2E (Production Smoke):**
- [ ] Full user journey on production URL
- [ ] Stripe payment with real/test card
- [ ] Email delivery working
- [ ] All pages load correctly on mobile browser

### Final Full UA Checklist

**Authentication:**
- [ ] Register with email/password
- [ ] Verify email link works
- [ ] Login with email/password
- [ ] Login with magic link
- [ ] Forgot password flow
- [ ] Reset password flow
- [ ] Logout
- [ ] Deleted account cannot re-register with same email

**Listing Management (P/W Model):**
- [ ] Create new listing (all 6 steps) — creates W
- [ ] Edit existing draft W listing
- [ ] Add photos (Premium only)
- [ ] Add testimonials (Premium only)
- [ ] Reorder photos
- [ ] Delete photos/testimonials
- [ ] Submit W for review → status `pending`
- [ ] View "under review" state (edits blocked)
- [ ] Admin rejects → status `changes_required` → user re-edits W
- [ ] Re-submit after rejection
- [ ] Admin approves → W becomes P (live)
- [ ] Edit published P listing → creates amendment W
- [ ] Delete W (amendment) → only W removed
- [ ] Delete P → soft-deleted, removed from public permanently
- [ ] Pause published P listing
- [ ] Unpause published P listing

**Subscription & Billing:**
- [ ] Subscribe to Basic plan (30-day trial)
- [ ] Subscribe to Premium plan (30-day trial)
- [ ] Subscribe to Annual plan (no trial)
- [ ] View billing page with current plan details (date subscribed, renewal date, subscription change date)
- [ ] Manage subscription (Stripe portal)
- [ ] Cancel subscription → listings live until period end
- [ ] After period end → listings `paused_subscription_expired`
- [ ] Resubscribe → listings restored to live
- [ ] No in-app downgrade option available (must cancel + resubscribe)
- [ ] Trial period shown correctly
- [ ] At least one contact method required to publish (phone, email, or website)

**Search & Public:**
- [ ] Homepage loads with categories
- [ ] Search by category
- [ ] Search by location (suburb/postcode)
- [ ] Search by keyword
- [ ] Search with radius filter
- [ ] Listing detail page displays correctly
- [ ] Photos gallery works
- [ ] Testimonials display
- [ ] Contact info behind click-to-reveal
- [ ] "Claim This Business" button on unclaimed listings
- [ ] All search/public pages work on mobile

**Metrics (Premium/Annual Only):**
- [ ] Metrics dashboard loads
- [ ] Impressions count correct
- [ ] Page views count correct
- [ ] Contact clicks count correct (phone, email, website separate)
- [ ] Timeframe toggle works (all time / current month)
- [ ] Basic user cannot access metrics
- [ ] Metrics page works on mobile

**Settings:**
- [ ] Settings page shows correct info
- [ ] Delete account works (cancels subscription, blacklists email, soft-deletes listings)
- [ ] Cancel subscription link works
- [ ] Plan details correct (date subscribed, renewal date, subscription change date)

**Admin:**
- [ ] Verification queue loads with subscription warning badges
- [ ] Approve listing → W becomes P
- [ ] Reject listing with reason → status `changes_required`
- [ ] Suspend listing → P hidden, user can submit amendment W
- [ ] Suspend account → subscription cancelled, all listings hidden, email blacklisted
- [ ] Claim queue works
- [ ] System settings toggles work
- [ ] Blacklist management works (business name + phone + website + ABN + ACN)

**Mobile:**
- [ ] Dashboard pages render correctly on mobile
- [ ] Listing wizard works on mobile (all 6 steps)
- [ ] Billing page works on mobile
- [ ] Search page works on mobile
- [ ] Listing detail page works on mobile
- [ ] Settings page works on mobile
- [ ] Login/signup pages work on mobile

---

## F. Remaining Minor Tasks (Allowed Post Go-Live)

1. **Email templates and email setup** — AWS SES configuration, transactional email templates (welcome, verification, claim, password reset)
2. **UI polish** — Non-functional visual improvements beyond launch baseline
3. **Production data seeding** — 5,000 Google Places listings via seeding pipeline
4. **JSON-LD structured data** — Schema.org markup for better SEO

---

## G. Post Go-Live Roadmap

1. Seed 5,000 production listings from Google Places
2. AWS SES email templates and delivery
3. Advanced SEO (JSON-LD, location-specific landing pages)
4. Performance optimization (search index tuning, caching)
5. Advanced analytics and reporting

---

## H. Codebase Audit Findings

### 1. Subscription + Stripe Integration

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Checkout session creation | ✅ Implemented | `src/app/api/stripe/checkout/route.ts` | Accepts planId/priceId, trial handling, customer creation, returnTo redirect |
| Webhook processing | ✅ Implemented | `src/app/api/stripe/webhook/route.ts` | Handles: checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_succeeded, invoice.payment_failed |
| Reconciliation into DB | 🟡 Partial | Webhook route + `src/lib/entitlements.ts` | Two implementations of `syncBusinessBillingStatus()` exist (webhook-local + entitlements). Should consolidate to one. |
| Billing UI and redirects | ✅ Implemented | `src/app/dashboard/billing/page.tsx` | Plan selection, current plan display, Stripe portal link, upgrade prompt, FAQ. Post-checkout redirect recently fixed. |
| Entitlements | ✅ Implemented | `src/lib/entitlements.ts` | `getUserEntitlements()` returns plan, limits, flags. `getBatchUserEntitlements()` for admin. 15 unit tests. |
| Portal route | ✅ Implemented | `src/app/api/stripe/portal/route.ts` | Creates Stripe billing portal session. 5 unit tests. |
| Plan constants | ✅ Implemented | `src/lib/constants.ts:46-111` | Basic ($4/mo), Premium ($10/mo), Annual ($99/yr). Trial days, feature flags per plan. |
| Plan change handling | 🟡 Needs change | Billing page + Stripe Portal | **No in-app downgrade.** Users must cancel and resubscribe. Need to remove any plan-switch UI and optionally disable plan switching in Stripe Portal config. |

**What's needed to complete:**
- Consolidate `syncBusinessBillingStatus()` to single implementation
- Add granular pause statuses: `paused_subscription_expired` (on subscription deletion at period end), `paused_payment_failed` (on final payment failure)
- Payment restoration logic: successful payment restores from any paused state to active
- Remove/disable in-app plan downgrade UI — user must cancel and resubscribe to change plans
- Configure Stripe Portal to disable plan switching (optional, prevents accidental downgrades via portal)

### 2. Listing Workflow (W/P + Statuses)

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Create listing flow | ✅ Implemented | `src/app/actions/business.ts:63-183` | Full validation, blacklist check, slug generation, P/W dual-write |
| Submit flow | ✅ Implemented | `src/app/actions/business.ts:534-904` | Full pipeline: guards -> deterministic checks -> AI review -> image moderation -> text safety -> decision |
| Awaiting subscription / pending | 🟡 Partial | `publishChanges()` line 556-558 | Returns `subscription_required` error but does NOT set `awaiting_subscription` status on listing. Returns `upgrade_required` if plan insufficient. **NEW:** need `awaiting_subscription` listing status. |
| Admin approve/reject/suspend | ✅ Implemented | `src/app/actions/verification.ts`, `src/app/actions/admin.ts` | Approve with safety re-check, reject with reason, suspend/unsuspend |
| Add listing behavior | 🟡 Needs change | `src/lib/entitlements.ts` | `canClaimMore` counts ALL non-deleted businesses (incl. drafts). **CHANGE:** should only count published (P) listings to allow unlimited drafts. |
| MAX enforcement | 🟡 Needs change | `createBusinessDraft()` | Currently blocks draft creation at limit. **CHANGE:** should allow unlimited drafts; enforce limit only at publish time. |
| Edit guard | ✅ Implemented | `src/lib/pw-service.ts:578-614` | Blocks all edits when `review_status='pending'` |
| Photo/testimonial workflow | ✅ Implemented | `src/app/actions/photos.ts`, `testimonials.ts` | Pending statuses (pending_add/pending_delete), cleanup on approve/reject |
| Pause/unpause | ✅ Implemented | `src/app/actions/business.ts` | Owner-controlled visibility toggle, P visibility sync |

**What's needed to complete:**
- Split `canClaimMore` into `canCreateMore` (total < hard cap) and `canPublishMore` (published < plan limit)
- Add `awaiting_subscription` listing status for publish-without-subscription flow
- Change post-checkout redirect from `/dashboard/listing` to `/dashboard` (My Listings)
- Verify at least one contact method enforced at publish time

### 3. Settings UI

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Settings page exists | 🟡 Minimal | `src/app/dashboard/settings/page.tsx` | Currently only shows email + quick links. Needs full rebuild. |
| Delete account (user-facing) | ❌ Missing | — | Admin has `adminSoftDeleteAccount()` but no self-service UI. Need `deleteMyAccount()` server action + UI. |
| Cancel subscription | 🟡 Partial | `src/app/dashboard/billing/page.tsx` | "Manage Subscription" button goes to Stripe Portal. No in-app cancel. |
| Plan details page | 🟡 Partial | `src/app/dashboard/billing/page.tsx` | Shows: plan name, price, status badge, period end, trial end. **Missing:** `subscribed_at` and `plan_changed_at` (need new DB columns). |
| Downgrade approach | 🟡 Needs change | — | Users cannot downgrade in-app. Must cancel subscription and resubscribe to different plan. Remove any downgrade UI. |
| Change password | ❌ Missing | — | No UI anywhere to change password. |

**What's needed to complete:**
- Rebuild settings page with Account/Subscription/Security sections
- Create `deleteMyAccount()` server action (cancel Stripe, soft-delete P, delete W, blacklist identifiers)
- Add `subscribed_at` and `plan_changed_at` columns to `user_subscriptions` (migration)
- Display `subscribed_at`, `plan_changed_at`, `current_period_end` on billing/settings page
- Add change password UI (calls `supabase.auth.updateUser({ password })`)

### 4. Auth

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Login (password + magic link) | ✅ Implemented | `src/app/login/page.tsx` | Dual mode, CAPTCHA, rate limiting |
| Sign up | ✅ Implemented | `src/app/signup/page.tsx` | Email verification, protection checks |
| Auth callback | ✅ Implemented | `src/app/auth/callback/route.ts` | Code exchange, profile creation fallback |
| Sign out | ✅ Implemented | `src/app/auth/signout/route.ts` | POST endpoint, redirect to home |
| Middleware | ✅ Implemented | `src/middleware.ts` | Protects /dashboard/*, /admin/* |
| Forgot password | ❌ Missing | — | No page exists. Need `/forgot-password` page. |
| Reset password | ❌ Missing | — | No page exists. Need `/reset-password` page + callback handling. |

**What's needed to complete:**
- Create `/forgot-password` page (form -> `supabase.auth.resetPasswordForEmail()`)
- Create `/reset-password` page (form -> `supabase.auth.updateUser({ password })`)
- Add "Forgot password?" link on login page
- Verify Supabase email templates are configured for password reset

### 5. Metrics

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Impressions tracking (DB + RPC) | ✅ Schema exists | `supabase/migrations/00015_business_metrics.sql` | `increment_search_impressions()` RPC exists |
| Impressions tracking (wired up) | ❌ Never called | `src/app/actions/metrics.ts` | `trackSearchImpressions()` exists but never invoked from search pages |
| Page views tracking | ✅ Implemented | `src/app/business/[slug]/page.tsx` | Fire-and-forget `trackProfileView()` on detail page |
| Contact click tracking | ❌ Missing | — | No click-to-reveal UI. Contact info displayed directly. No tracking. No DB columns. |
| Metrics dashboard | ❌ Missing | — | No `/dashboard/metrics` page. `getBusinessMetrics()` function exists but unused. |
| Premium/annual gating | ❌ Missing | — | No `canViewMetrics` in entitlements. No plan check on metrics. |
| Timeframe filtering | 🟡 Backend only | `src/app/actions/metrics.ts` | `getBusinessMetrics(id, days)` supports N-day lookback. No UI. |

**What's needed to complete:**
- Create `/dashboard/metrics` page
- Wire `trackSearchImpressions()` into search result pages
- Create `ContactReveal` component + `trackContactClick()` action
- Add `contact_clicks` columns to `business_metrics` table (migration)
- Add `canViewMetrics` to entitlements (Premium/Annual only)
- Build timeframe toggle UI (all time vs current month)

### 6. Admin Tools

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Verification queue | ✅ Implemented | `src/app/admin/verification/page.tsx` | Paginated, AI/deterministic scores, diff view, approve/reject/suspend |
| Queue + comment linkage | ✅ Implemented | `admin_reviews` table | Notes stored per review action |
| Account suspension | ✅ Implemented | `src/app/admin/accounts/[userId]/page.tsx` | Suspend/unsuspend, suspend all listings, admin notes |
| Blacklist (business names) | ✅ Implemented | `src/app/admin/system/page.tsx` | exact/contains/starts_with matching. Seeded with adult terms. |
| Seed management | ✅ Implemented | `src/app/admin/system/page.tsx` | Visibility, expiry, confidence, source toggles, statistics |
| Claim tooling | ✅ Implemented | `src/app/admin/claims/page.tsx` | Match scoring, approve/reject, comparison panels |
| Duplicate handling | ✅ Implemented | `publishChanges()` + admin verification | At-submit detection + admin merge on approval |
| System settings | ✅ Implemented | `src/app/admin/system/page.tsx` | All flags, AI settings, ranking weights, seed controls |
| Admin dashboard | ✅ Implemented | `src/app/admin/page.tsx` | Overview stats: businesses, subscriptions, reports, claims, seeds |
| Operational reports | ✅ Implemented | `src/app/admin/ops/page.tsx` | Subscription, listing, moderation metrics by period |
| Seed match/reconciliation | ✅ Implemented | Admin approval flow | `merged_seed_business_id` set, seed soft-deleted on approve |
| Blacklist (phone/website/ABN/ACN) | ❌ Missing | — | Only business names in blacklist table. **IN-SCOPE:** Must expand to phone, website, ABN, ACN. Match at publish → account suspension + subscription cancellation. |
| Subscription warning badge in queue | ❌ Missing | — | Queue doesn't show owner subscription status. |

**What's needed to complete:**
- Add subscription warning badge to verification queue (Phase 4 deliverable)
- Expand blacklist to include phone, website, ABN, ACN (Phase 3 deliverable — in-scope for go-live)

### 7. Public Pages + Search

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| Homepage | ✅ Implemented | `src/app/page.tsx` | Hero, search bar, categories, how it works, CTAs |
| Search page | ✅ Implemented | `src/app/search/page.tsx` | Category, location, keyword, radius filtering. Pagination. |
| Listing detail page | 🟡 Needs change | `src/app/business/[slug]/page.tsx` | Photos, testimonials, map, claim button all OK. **CHANGE:** Contact info must change from direct display to click-to-reveal for metrics tracking. |
| Category browse | ✅ Implemented | `src/app/[state]/[category]/page.tsx` | State+category pages with pagination |
| Location search | ✅ Implemented | `src/app/[state]/[category]/[location]/page.tsx` | Suburb/postcode resolution + geo search |
| Search index | ✅ Implemented | `business_search_index` table + triggers | Full-text + PostGIS + category filtering |
| SEO/Sitemap | ✅ Implemented | `src/app/api/sitemap.xml/route.ts` | Dynamic sitemap, Open Graph metadata |
| Marketing pages | ✅ Implemented | `/about`, `/pricing`, `/contact`, `/terms`, `/privacy`, `/disclaimer` | Full content |
| Claim button | ✅ Implemented | `src/app/business/[slug]/page.tsx` | "Is this your business?" for unclaimed listings |

**What's needed to complete:**
- Change contact info on listing detail page to click-to-reveal (for metrics tracking)
- Verify all public pages are mobile-friendly

### 8. Database Schema

| Table | Status | Notes |
|-------|--------|-------|
| profiles | ✅ | With suspended_at, admin_notes |
| businesses | 🟡 | Status fields exist but needs: `awaiting_subscription` status. Billing status needs: `paused_subscription_expired`, `paused_payment_failed`. |
| business_locations | ✅ | PostGIS geometry |
| business_contacts | ✅ | With has_contact generated column |
| categories | ✅ | Hierarchical with parent_id |
| business_categories | ✅ | With is_primary, category group enforcement |
| photos | ✅ | With status (live/pending_add/pending_delete) |
| testimonials | ✅ | With status |
| user_subscriptions | 🟡 | Per-user, not per-business. **Missing:** `subscribed_at` and `plan_changed_at` columns. |
| published_listings | ✅ | Immutable snapshots with amendment history |
| working_listings | ✅ | Editable drafts with review lifecycle |
| business_search_index | ✅ | Full-text + PostGIS + auto-refresh triggers |
| business_metrics | 🟡 | Schema exists, impressions/views columns, but no contact_clicks |
| verification_jobs | ✅ | AI + deterministic results |
| admin_reviews | ✅ | Per-review records |
| business_claims | ✅ | With match scoring |
| blacklist | 🟡 | Business names only. **Needs expansion:** phone, website, ABN, ACN. |
| system_settings | ✅ | All admin settings |
| system_flags | ✅ | All operational flags |
| audit_log | ✅ | Immutable trail |
| user_notifications | ✅ | In-app notifications |
| abuse_events | ✅ | Security incident tracking |
| payment_events | ✅ | Stripe event logging |
| reports | ✅ | User abuse reports |
| postcodes | ✅ | AU postcode lookup |

**Migrations needed:**
- `00046_contact_clicks.sql` — add `phone_clicks`, `email_clicks`, `website_clicks` columns to `business_metrics` + `increment_contact_click()` RPC
- `00047_subscription_lifecycle.sql` — add `awaiting_subscription` to `businesses.status` enum, add `paused_subscription_expired` and `paused_payment_failed` to `billing_status` enum
- `00048_subscription_dates.sql` — add `subscribed_at timestamptz NOT NULL DEFAULT now()` and `plan_changed_at timestamptz NOT NULL DEFAULT now()` to `user_subscriptions`
- `00049_blacklist_expansion.sql` — expand blacklist table to support `field_type` (name/phone/website/abn/acn), add normalization functions

---

## I. Questions for Richard — ALL ANSWERED

All questions have been answered. Decisions recorded here for reference.

1. **Password reset email:** ✅ Use Supabase built-in email for go-live. SES later. Volume low, secure, production-grade.

2. **Subscription change date:** ✅ Add explicit `plan_changed_at` column to `user_subscriptions`. Also add `subscribed_at` column. Do NOT derive from `payment_events`. Update on: new subscription, plan upgrade, resubscribe after cancellation.

3. **Search impressions tracking:** ✅ Track client-side via `useEffect`. Excludes bots, more accurate. Accuracy matters — we are selling visibility. If JS disabled, impressions don't count (acceptable).

4. **Blacklist matching strategy:** ✅ Normalized exact matching (not fuzzy). Normalize: phone → strip spaces/dashes/country code; website → lowercase, strip protocol + www; ABN/ACN → digits only. No fuzzy for phone/ABN/ACN (false positives = lawsuits). Populated by: (a) admin manual entries, (b) auto-populated on account suspension (email, phone, website, ABN, ACN all added to blacklist).

5. **Stripe Portal plan switching:** ✅ Hard-disable plan switching in Stripe Billing Portal configuration. Portal shows only: cancel subscription, update payment method, view invoices. Do NOT rely on server-side rejection.

6. **Subscription cancellation timing:** ✅ Only set `paused_subscription_expired` when Stripe `customer.subscription.deleted` webhook fires (at period end). Before that: `billing_status` stays `active`, listings stay live, UI shows "Cancels on [date]" badge. Do NOT prematurely pause.

7. **Redirect after checkout:** ✅ Redirect to `/dashboard`. Shows listings overview. Allows explicit publish click. Fits rule: "Subscribing does not auto-publish."

---

## J. Assumptions — ALL VERIFIED

All assumptions have been confirmed or corrected by Richard.

1. ✅ **CONFIRMED:** Users cannot downgrade plans in-app. Must cancel subscription and resubscribe to a different plan. Stripe Portal hard-disabled for plan switching — only cancel, update payment, view invoices.
2. ❌ **CORRECTED:** Do NOT derive "date subscribed" from `created_at`. Add explicit columns: `subscribed_at` and `plan_changed_at` on `user_subscriptions`. Single source of truth.
3. ✅ **CONFIRMED:** Supabase's built-in password reset email is acceptable for go-live. SES email is post go-live.
4. ✅ **CONFIRMED:** Self-service account deletion: cancel subscription, soft-delete all P listings, delete all W listings, blacklist email + identifiers (phone, website, ABN, ACN). User cannot re-register with same email.
5. ✅ **CONFIRMED:** Annual Premium same feature limits as monthly Premium. Differences: price, billing period, description limit (2500 vs 1500), no trial.
6. ✅ **CONFIRMED:** Basic users CAN create unlimited draft (W) listings but can only PUBLISH 1. Drafts do not consume publish entitlement. BUT total listings (drafts + published) still subject to hard cap (see #12).
7. ✅ **CONFIRMED:** "Metrics" tab in dashboard nav hidden entirely for Basic users. Not disabled, not teaser — completely hidden.
8. ✅ **CONFIRMED:** Contact details use click-to-reveal UI. Phone, email, website hidden behind buttons. Each click tracked separately for metrics.
9. ✅ **CONFIRMED:** All pages must be mobile phone friendly — this is a launch requirement, not post-launch.
10. ✅ **CONFIRMED:** Suspended account can log in → immediately routed to SuspensionNotice screen. Dashboard inaccessible, all actions disabled, settings locked, billing locked.
11. ✅ **CONFIRMED:** Blacklist check at publish time only (not draft save). Checked during `publishChanges()`. Match → immediate account suspension via `adminSuspendAccount()` flow + subscription cancellation.
12. ❌ **CORRECTED:** Two separate limits:
    - **Publish entitlement** = count of published (P) listings only → Basic max 1, Premium/Annual max 10
    - **Hard cap (Add Listing visibility)** = count of ALL non-deleted businesses (drafts + published) → prevents creating 500 drafts
    - Add Listing button hidden when total (draft + published) count reaches `maxListings` hard cap

---

## K. Acceptance Checklist (Pre-Launch)

**Settings & Auth:**
- [ ] Settings page: delete account, cancel subscription, plan details (dates) — all functional
- [ ] Delete account: cancels subscription, soft-deletes P listings, deletes W listings, blacklists email + identifiers
- [ ] Forgot password / reset password flow works end-to-end
- [ ] Deleted account cannot re-register with same email

**Metrics:**
- [ ] Metrics dashboard shows impressions, views, contact clicks for Premium/Annual
- [ ] Metrics gated — Basic users cannot access
- [ ] Search impressions wired up and incrementing
- [ ] Contact click-to-reveal implemented (phone, email, website hidden behind buttons)
- [ ] Contact click tracking works (phone_clicks, email_clicks, website_clicks)
- [ ] Timeframe toggle: all time / current month

**Subscription Lifecycle:**
- [ ] `publishChanges()` blocks unsubscribed users → listing set to `awaiting_subscription`
- [ ] `publishChanges()` blocks Basic users with premium content → `upgrade_required`
- [ ] Post-checkout redirect returns to My Listings dashboard
- [ ] Subscribing does NOT auto-publish drafts — user must explicitly publish
- [ ] No in-app plan downgrade — user must cancel and resubscribe
- [ ] Subscription cancelled → listings live until period end → `paused_subscription_expired`
- [ ] Payment failure → listings live during retry → `paused_payment_failed` on final failure
- [ ] Successful payment restores paused listings to live
- [ ] Drafts (W) do NOT consume publish entitlement
- [ ] Two-tier limit: `canCreateMore` (total < hard cap) and `canPublishMore` (published < plan limit)
- [ ] UI shows "Cancels on [date]" badge when `cancel_at_period_end = true`
- [ ] `paused_subscription_expired` only set when `customer.subscription.deleted` webhook fires (not prematurely)

**Blacklist:**
- [ ] Blacklist expanded: phone, website, ABN, ACN checked at publish time
- [ ] Blacklist uses normalized exact matching (phone: digits only; website: lowercase, no protocol/www; ABN/ACN: digits only)
- [ ] Blacklist match at publish → immediate account suspension + subscription cancellation
- [ ] Blacklist auto-populated on account suspension (email, phone, website, ABN, ACN)
- [ ] Suspended account: can log in, routed to SuspensionNotice screen, all actions disabled
- [ ] Blacklisted email blocks future sign-up

**Admin:**
- [ ] Admin verification queue shows subscription warning badges
- [ ] Admin approve → W becomes P (live)
- [ ] Admin reject → W becomes `changes_required`
- [ ] Admin suspend listing → P hidden, user can submit amendment W
- [ ] Admin suspend account → subscription cancelled, all listings hidden, email blacklisted
- [ ] Claim workflow works end-to-end

**Per-Plan Tests:**
- [ ] Basic plan test script passes (all items in E2E checklist)
- [ ] Premium plan test script passes (all items in E2E checklist)
- [ ] Annual plan test script passes (all items in E2E checklist)
- [ ] Unsubscribed user test script passes

**Mobile:**
- [ ] All dashboard pages mobile-friendly
- [ ] Listing wizard mobile-friendly
- [ ] Search and public pages mobile-friendly
- [ ] Billing page mobile-friendly

**Subscription Dates & Portal:**
- [ ] `subscribed_at` and `plan_changed_at` columns exist on `user_subscriptions`
- [ ] Plan details display: plan name, price, `subscribed_at`, renewal date, `plan_changed_at`
- [ ] Stripe Portal configured: plan switching disabled, only cancel + update payment + view invoices
- [ ] Search impressions tracked client-side via `useEffect` (excludes bots)

**Technical:**
- [ ] All existing tests pass (`npx vitest run`)
- [ ] Build succeeds (`npm run build`)
- [ ] Production env vars configured
- [ ] Stripe live mode tested
- [ ] Full UA checklist signed off by Richard
