# Claude Goal Checklist — Go-Live Execution

**Created:** 3 March 2026
**Instruction:** Work through entire `go_live.md`. Do not stop until all work is complete, tested, and committed.

---

## Execution Rules

- Start at Phase 1, do not stop until all phases complete
- Every phase must have tests and ALL must pass
- Every phase must have full regression tests (`npx vitest run`) and ALL must pass
- Every phase must be committed and pushed to git with descriptive comments
- All changes must have E2E tests and pass
- Do NOT seed the database from Google Places until Richard approves
- Do NOT deploy to production without Richard's confirmation

---

## Phase 1: Settings Page + Password Flows

- [ ] Rebuild settings page (Account, Subscription, Security sections)
- [ ] Self-service delete account with confirmation dialog
- [ ] `deleteMyAccount()` server action: cancel Stripe, soft-delete P, delete W, blacklist email + identifiers (phone/website/ABN/ACN), suspend profile
- [ ] Plan details display: plan name, price, status, `subscribed_at`, renewal date, `plan_changed_at`
- [ ] DB migration: add `subscribed_at` + `plan_changed_at` to `user_subscriptions`
- [ ] Create `/forgot-password` page (calls `supabase.auth.resetPasswordForEmail()`)
- [ ] Create `/reset-password` page (calls `supabase.auth.updateUser({ password })`)
- [ ] Add "Forgot password?" link on login page
- [ ] Change password from settings
- [ ] Unit tests for `deleteMyAccount()` (incl. blacklisting)
- [ ] E2E: forgot password → reset → login with new password
- [ ] E2E: delete account → logged out → cannot login → cannot re-register with same email
- [ ] E2E: settings shows correct plan details and dates
- [ ] Full regression: `npx vitest run` — ALL PASS
- [ ] `npm run build` — SUCCESS
- [ ] Git commit + push

---

## Phase 2: Metrics System (Premium/Annual)

- [ ] Create `/dashboard/metrics` page (hidden entirely for Basic users)
- [ ] `SearchImpressionTracker` client component using `useEffect` (excludes bots)
- [ ] Wire `SearchImpressionTracker` into `/search`, `/[state]/[category]`, `/[state]/[category]/[location]`
- [ ] `ContactReveal` click-to-reveal component with tracking (phone, email, website)
- [ ] Replace direct contact links on listing detail page with `ContactReveal`
- [ ] DB migration: add `phone_clicks`, `email_clicks`, `website_clicks` to `business_metrics` + `increment_contact_click()` RPC
- [ ] `trackContactClick()` server action
- [ ] `canViewMetrics` entitlement (true for premium/annual, false for basic)
- [ ] Timeframe filtering: all time vs current month
- [ ] Unit tests: `trackSearchImpressions()`, `trackContactClick()`, `getBusinessMetrics()`, `canViewMetrics`
- [ ] E2E: search → impressions increment
- [ ] E2E: view listing → profile_views increment
- [ ] E2E: click-to-reveal phone/email/website → clicks tracked
- [ ] E2E: Premium user sees metrics dashboard
- [ ] E2E: Basic user → metrics hidden entirely
- [ ] E2E: mobile rendering of click-to-reveal and metrics page
- [ ] Full regression: `npx vitest run` — ALL PASS
- [ ] `npm run build` — SUCCESS
- [ ] Git commit + push

---

## Phase 3: Subscription Lifecycle + Blacklist Expansion + Listing Count Fix

- [ ] DB migration: `awaiting_subscription` status, `paused_subscription_expired`, `paused_payment_failed`
- [ ] Webhook: `customer.subscription.deleted` → set `paused_subscription_expired`
- [ ] Webhook: `invoice.payment_failed` (final) → set `paused_payment_failed`
- [ ] Webhook: `invoice.payment_succeeded` → restore from any paused state to `active`
- [ ] `publishChanges()`: set listing to `awaiting_subscription` when no subscription
- [ ] "Cancels on [date]" badge in UI when `cancel_at_period_end = true` (do NOT premature pause)
- [ ] Remove in-app plan downgrade/switch UI from billing page
- [ ] Post-checkout redirect: change from `/dashboard/listing` to `/dashboard`
- [ ] Blacklist expansion: phone, website, ABN, ACN with normalized exact matching
- [ ] Blacklist normalization: phone → digits only; website → lowercase, no protocol/www; ABN/ACN → digits only
- [ ] Blacklist auto-populated on account suspension (email, phone, website, ABN, ACN)
- [ ] Blacklist match at publish → immediate account suspension + subscription cancellation
- [ ] Split `canClaimMore` → `canCreateMore` (total < hard cap) + `canPublishMore` (published < plan limit)
- [ ] DB migration: `subscribed_at` + `plan_changed_at` on `user_subscriptions`
- [ ] Consolidate dual `syncBusinessBillingStatus()` implementations into one
- [ ] Unit tests: webhook lifecycle (expire, fail, restore)
- [ ] Unit tests: blacklist normalization + matching
- [ ] Unit tests: `canCreateMore` vs `canPublishMore`
- [ ] Unit tests: `awaiting_subscription` status
- [ ] E2E: cancel subscription → listings live until period end → `paused_subscription_expired`
- [ ] E2E: payment failure → `paused_payment_failed` → pay → restored
- [ ] E2E: unsubscribed user publish → `awaiting_subscription` → subscribe → redirect to `/dashboard`
- [ ] E2E: Basic user creates multiple drafts → succeeds (up to hard cap)
- [ ] E2E: Basic user publish 2nd listing → upgrade prompt
- [ ] E2E: blacklist phone match at publish → account suspended
- [ ] E2E: no in-app downgrade option visible
- [ ] Full regression: `npx vitest run` — ALL PASS
- [ ] `npm run build` — SUCCESS
- [ ] Git commit + push

---

## Phase 4: Admin Queue Hardening + Subscription Warning

- [ ] Subscription warning badge in admin verification queue (no subscription = red, plan insufficient = orange, inactive = yellow)
- [ ] Use `getBatchUserEntitlements()` to avoid N+1 queries
- [ ] Verify admin approve → W becomes P (live)
- [ ] Verify admin reject → W becomes `changes_required`, user can re-edit
- [ ] Verify admin suspend listing → P hidden, user can submit amendment W
- [ ] Verify admin suspend account → subscription cancelled, all listings hidden, email blacklisted
- [ ] Verify admin unsuspend listing → returns to search
- [ ] Verify claim queue works end-to-end
- [ ] Verify seed merge on approval works
- [ ] Unit tests: `subscriptionWarning` per queue row
- [ ] E2E: admin sees warning badges
- [ ] E2E: admin approve → listing goes live
- [ ] E2E: admin reject → owner re-edits and resubmits
- [ ] E2E: admin suspend listing → removed from search
- [ ] E2E: admin suspend account → full suspension flow
- [ ] Full regression: `npx vitest run` — ALL PASS
- [ ] `npm run build` — SUCCESS
- [ ] Git commit + push

---

## Phase 5: Production Deployment

- [ ] Stripe live mode keys configured
- [ ] Stripe webhook endpoint registered for production URL
- [ ] Stripe Portal configured: plan switching DISABLED (cancel + payment + invoices only)
- [ ] Supabase production database migrated (all migrations)
- [ ] Environment variables set on production
- [ ] DNS + SSL verified
- [ ] Smoke test: full user journey on production
- [ ] Smoke test: Stripe payment
- [ ] Smoke test: password reset email delivery
- [ ] Smoke test: admin approve/reject
- [ ] Smoke test: all pages on mobile browser
- [ ] **DO NOT DEPLOY WITHOUT RICHARD'S CONFIRMATION**
- [ ] Git commit + push

---

## Phase 6: Post Go-Live (PAUSED)

- [ ] **DO NOT SEED DATABASE UNTIL RICHARD APPROVES**
- [ ] Google Places seeding (5,000 listings)
- [ ] AWS SES transactional emails
- [ ] Email templates
- [ ] JSON-LD structured data

---

## Comprehensive E2E Test Matrix

### Per-Plan Subscription Tests
- [ ] Basic: subscribe, create draft, publish 1, block 2nd publish, block photos, block testimonials, 500 char limit, no metrics, cancel → pause → resubscribe → restore
- [ ] Premium: subscribe, photos (up to 10), testimonials (up to 20), publish up to 10, block 11th, 1500 char limit, metrics accessible, click-to-reveal tracking, cancel → pause → restore
- [ ] Annual: subscribe (no trial), photos, testimonials, publish up to 10, 2500 char limit, metrics accessible, cancel → pause → restore
- [ ] Unsubscribed: create draft, publish blocked → `awaiting_subscription`, subscribe → redirect to `/dashboard`, explicit publish required

### P/W Model Tests
- [ ] Create listing → W created (never auto-publishes)
- [ ] Edit draft W → changes saved
- [ ] Edit published P → amendment W created
- [ ] Delete W (in edit mode) → only W removed
- [ ] Delete P → soft-deleted, removed from public permanently
- [ ] P + W exists → delete removes W first
- [ ] W amendments do NOT count as additional listings
- [ ] Submit W → status `pending` (admin review)
- [ ] Admin never sees raw W drafts (only `pending` listings in queue)

### Admin Tests
- [ ] Admin approve → W becomes P (live, public)
- [ ] Admin reject → W becomes `changes_required` → user re-edits → resubmit
- [ ] Admin suspend listing → P hidden, user can submit amendment W
- [ ] Admin suspend account → subscription cancelled, all listings hidden, email blacklisted, can log in but sees SuspensionNotice
- [ ] Admin unsuspend listing → returns to search
- [ ] Claim queue approve → seed soft-deleted, user listing canonical

### Blacklist Tests
- [ ] Blacklist phone match at publish → account suspended + subscription cancelled
- [ ] Blacklist website match at publish → account suspended
- [ ] Blacklist ABN/ACN match at publish → account suspended
- [ ] Auto-populate blacklist on account suspension (email, phone, website, ABN, ACN)
- [ ] Blacklisted email blocks sign-up
- [ ] Normalized matching: phone digits only, website lowercase no protocol/www, ABN/ACN digits only

### Subscription Lifecycle Tests
- [ ] Expired subscription: cancel → live until period end → `paused_subscription_expired` (only on webhook)
- [ ] "Cancels on [date]" badge shown during pending cancellation
- [ ] Payment failure: listings live during retry → final failure → `paused_payment_failed`
- [ ] Payment success after failure → listings restored to live
- [ ] Resubscribe after cancellation → listings restored
- [ ] No in-app downgrade — must cancel + resubscribe
- [ ] Subscribing does NOT auto-publish drafts

### Max Listings Tests
- [ ] `canCreateMore`: total (drafts + published) < hard cap
- [ ] `canPublishMore`: published count < plan publish limit
- [ ] Basic: create multiple drafts OK, publish 1 OK, publish 2nd blocked
- [ ] Premium: publish up to 10 OK, 11th blocked
- [ ] Add Listing button hidden only when hard cap reached

### No-Subscription Tests
- [ ] Unsubscribed user creates listing → succeeds (draft)
- [ ] Unsubscribed user publishes → `awaiting_subscription` → redirect to plans
- [ ] After subscribing → redirect to `/dashboard` → must explicitly publish
- [ ] Listing does NOT auto-publish after subscription checkout

### Settings & Auth Tests
- [ ] Delete account: subscription cancelled, P soft-deleted, W deleted, identifiers blacklisted
- [ ] Deleted account cannot re-register with same email
- [ ] Suspended account can log in → sees SuspensionNotice → cannot access dashboard
- [ ] Forgot password → email → reset → login with new password
- [ ] Change password from settings → works
- [ ] Plan details show `subscribed_at`, renewal date, `plan_changed_at`

### Contact Method & Content Validation Tests
- [ ] At least one contact method required to publish (phone, email, or website)
- [ ] Description length enforced per plan (500/1500/2500)
- [ ] Photo count enforced per plan (0/10/10)
- [ ] Testimonial count enforced per plan (0/20/20)

### Mobile Tests
- [ ] Dashboard pages render on mobile
- [ ] Listing wizard works on mobile (all 6 steps)
- [ ] Billing page works on mobile
- [ ] Search page works on mobile
- [ ] Listing detail + click-to-reveal works on mobile
- [ ] Settings page works on mobile
- [ ] Login/signup pages work on mobile
- [ ] Metrics page works on mobile

---

## Completion Criteria

All of the above must be checked off. When everything is green:
- All unit tests pass
- All E2E tests pass
- All regression tests pass
- All phases committed and pushed
- `npm run build` succeeds
- No database seeding until Richard approves
- No production deployment until Richard confirms

**STOP WORK when all green.**
