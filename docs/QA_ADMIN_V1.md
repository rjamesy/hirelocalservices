# Admin V1 — QA Checklist

> Run through each item after deploying migration 00025. Mark pass/fail.

## Prerequisites
- [ ] Migration 00025 applied successfully
- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npx vitest run`)

## Navigation
- [ ] Admin layout shows all nav links: Dashboard, Listings, Accounts, Reports, Verification, System, Audit, Ops
- [ ] Sidebar matches header nav
- [ ] Non-admin users redirected to /dashboard

## Accounts List (/admin/accounts)
- [ ] Page loads with paginated accounts
- [ ] Search by email works
- [ ] Search by user ID (UUID) works
- [ ] Search by business name works
- [ ] Plan badge displays correctly for each plan type
- [ ] Status badge shows active/trialing/canceled
- [ ] Billing status column shows OK/Suspended
- [ ] Listings column shows active/total counts
- [ ] "View" links to account detail page
- [ ] Pagination works

## Account Detail (/admin/accounts/[userId])
- [ ] Page loads with correct user data
- [ ] Subscription panel shows plan, status, trial end, period end, Stripe IDs
- [ ] Entitlements panel shows effectiveState, maxListings, currentListingCount, reasonCodes
- [ ] Admin notes save and persist
- [ ] Change Plan action works (updates plan + billing status)
- [ ] Set Trial End action works
- [ ] Suspend Account action works (shows reason input)
- [ ] Unsuspend Account action works (visible only when suspended)
- [ ] Suspend All Listings action works with confirmation
- [ ] Soft Delete Account action works with confirmation + reason
- [ ] Owned listings table shows correct data with links to listing detail
- [ ] Claims table shows correct data

## Listings List (/admin/listings)
- [ ] Page loads with paginated listings
- [ ] Status tabs work: All, Published, Draft, Paused, Suspended, Deleted
- [ ] Search by name works
- [ ] State filter dropdown works
- [ ] Type filter works (Seed/Claimed/User)
- [ ] Verification status filter works
- [ ] Clear filters button works
- [ ] Type badge shows correctly (Seed/Claimed/User)
- [ ] Status badge shows correctly
- [ ] Searchable badge shows Yes/No
- [ ] Report count shows correctly (red badge for >0)
- [ ] Owner email links to account detail
- [ ] "Detail" links to listing detail page
- [ ] Suspend/Unsuspend actions work
- [ ] Soft Delete action works with confirmation
- [ ] Pagination works

## Listing Detail (/admin/listings/[businessId])
- [ ] Page loads with all sections
- [ ] Header shows name, type badge, status badge, billing badge, verification badge
- [ ] Owner info card shows email (linked to account), user ID, role
- [ ] Published snapshot shows all fields: description, phone, email, website, abn, location, categories
- [ ] Pending changes diff shows old→new values (when applicable)
- [ ] Approve/Reject pending changes works
- [ ] Entitlements panel shows owner's subscription data
- [ ] Eligibility panel shows check_name, pass/fail, detail
- [ ] Reports section shows count and list
- [ ] Photos grid shows with status badges
- [ ] Testimonials list shows with status badges
- [ ] Claims table shows correctly
- [ ] Suspend action works
- [ ] Unsuspend action works (when suspended)
- [ ] Pause action works (when published)
- [ ] Soft Delete action works with confirmation
- [ ] Restore action works (when deleted)
- [ ] Transfer Ownership action works with user ID input
- [ ] Force Re-verify action works with confirmation

## Reports (/admin/reports)
- [ ] Open reports display correctly
- [ ] "AI Re-validate" button appears for open reports
- [ ] AI Re-validate calls adminRevalidateReport and shows result
- [ ] Resolve button works
- [ ] Suspend Business button works
- [ ] Resolved tab shows resolution_outcome badge
- [ ] Pagination works

## Verification (/admin/verification)
- [ ] Queue loads pending items
- [ ] Approve button works
- [ ] Reject button works
- [ ] Suspend button appears and works (new)
- [ ] Score breakdown displays correctly

## Audit Log (/admin/audit)
- [ ] Page loads with entries
- [ ] Date From/To filters work
- [ ] Action dropdown filter works (all action types listed)
- [ ] Entity Type filter works
- [ ] Actor dropdown populates with admin users
- [ ] Entity ID text filter works
- [ ] Clear filters button works
- [ ] Actor ID links to account detail
- [ ] Details expand/collapse works
- [ ] URL params persist filters across reload
- [ ] Pagination works

## System Settings (/admin/system)
- [ ] Seed Controls tab: seed expiry toggle and days input work
- [ ] Email Template tab: sub-tabs (Seed, Claim Approved, Claim Rejected)
- [ ] Claim Approved template saves subject and body with placeholders
- [ ] Claim Rejected template saves subject and body with placeholders
- [ ] All existing settings still work (AI, Ranking, Listings, Reset, Blacklist)

## Ops Reports (/admin/ops)
- [ ] Page loads with metrics
- [ ] Period selector (7/14/30/90 days) works
- [ ] Subscriptions section shows stat cards and charts
- [ ] Listings section shows stat cards, by-state table, by-category chart
- [ ] Moderation section shows stat cards and charts

## Dashboard Notifications
- [ ] NotificationBell appears in dashboard sidebar header
- [ ] Unread count badge shows when there are unread notifications
- [ ] Clicking bell opens dropdown with recent notifications
- [ ] Clicking unread notification marks it as read
- [ ] Polling refreshes unread count every 60s
- [ ] Notifications are created on: claim approved, claim rejected, verification approved, verification rejected, listing suspended

## Soft Delete Behavior
- [ ] Soft-deleted listings have deleted_at set and status='deleted'
- [ ] Soft-deleted listings do not appear in search
- [ ] Soft-deleted listings appear in "Deleted" tab
- [ ] Restore clears deleted_at and restores prior status from audit log
- [ ] Never hard deletes (owner_id, audit history preserved)

## Transfer Ownership
- [ ] Changes owner_id
- [ ] Calls syncBusinessBillingStatus for both old and new owner
- [ ] Refreshes search index
- [ ] Audit logged with before/after state

## Batch Entitlements
- [ ] Accounts list page loads without N+1 queries (check network tab)
- [ ] Entitlements are consistent across account list and detail views
