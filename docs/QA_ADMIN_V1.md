# QA Checklist: Admin v1 Rebuild

## Pre-deployment

- [ ] `npx vitest run` passes all unit tests
- [ ] `npm run build` completes without errors
- [ ] Migration `00024_admin_v1_normalization.sql` reviewed

## Migration Verification

- [ ] `suspended_reason` and `suspended_at` columns exist on `businesses`
- [ ] `businesses_owner_id_required` CHECK constraint active
- [ ] `idx_user_subscriptions_one_active_per_user` unique index exists
- [ ] `idx_user_subscriptions_stripe_sub_id` unique index exists
- [ ] Duplicate subscriptions repaired (one active per user)
- [ ] `explain_search_eligibility` RPC function works
- [ ] Admin RLS policy on `user_subscriptions` allows admin SELECT

## Admin Dashboard

- [ ] Dashboard loads without errors
- [ ] "Active Subscriptions" stat card queries `user_subscriptions` (not `subscriptions`)
- [ ] "Active Subscriptions" count is correct
- [ ] Clicking "Active Subscriptions" navigates to `/admin/accounts`
- [ ] All other stat cards still work correctly

## Admin Accounts Page

- [ ] `/admin/accounts` loads and displays user list
- [ ] Search by email works
- [ ] Plan column shows correct plan from `getUserEntitlements()`
- [ ] Status column shows active/canceled/etc correctly
- [ ] Period End column shows correct date
- [ ] Business count column is accurate
- [ ] "View Listings" link filters listings by user email
- [ ] Pagination works
- [ ] Accounts link visible in header nav and sidebar

## Admin Listings Page

- [ ] Listings page loads without errors
- [ ] Subscription column shows `billing_status` values (Active/Trial/Billing Suspended)
- [ ] No "No Sub" shown for users with active subscriptions
- [ ] Owner email links to accounts page
- [ ] Suspend/Unsuspend actions work
- [ ] Suspend sets `suspended_reason` and `suspended_at`
- [ ] Unsuspend clears `suspended_reason` and `suspended_at`
- [ ] Status filter tabs work
- [ ] Search works
- [ ] Pagination works

## Admin Reports Page

- [ ] Reports page loads
- [ ] "Resolve" button calls `adminResolveReport()` server action
- [ ] "Suspend Business" button calls `adminSuspendBusiness()` + `adminResolveReport()`
- [ ] Report resolution creates audit log entry
- [ ] Business suspension via report creates audit log entry

## Sitemap

- [ ] `/api/sitemap.xml` generates without errors
- [ ] No `subscriptions!inner` join in query
- [ ] Uses `billing_status` filter instead

## Publish/Approval Flows

- [ ] Publishing a draft listing refreshes search index (appears in search immediately)
- [ ] Admin approving verification refreshes search index
- [ ] Admin approving claim refreshes search index
- [ ] Auto-approved claims refresh search index

## Entitlements

- [ ] `getUserEntitlements()` returns correct values for:
  - [ ] No subscription
  - [ ] Active free trial
  - [ ] Active basic plan
  - [ ] Active premium plan
  - [ ] Canceled subscription (within period)
  - [ ] Canceled subscription (expired)
  - [ ] Past due subscription
- [ ] `syncBusinessBillingStatus()` correctly derives `billing_status`

## Search Eligibility

- [ ] `evaluateSearchEligibility()` returns correct checks
- [ ] `explain_search_eligibility` RPC returns all check rows
- [ ] Owner entitlements check works for non-seed businesses

## Audit Trail

- [ ] `adminResolveReport` creates `report_resolved` audit entry
- [ ] `adminSuspendBusiness` creates `listing_suspended` audit entry
- [ ] `bulkVerifySeeds` creates `verification_completed` audit entry
