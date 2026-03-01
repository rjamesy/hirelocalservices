# Phase 3a — Read Switch Plan

## Context

Phases 1 (schema + backfill) and 2 (dual-write) are complete. Both old `businesses` columns and new P/W tables exist and are kept in sync. Phase 3a switches **reads** from old columns to P/W tables. Old columns remain populated by dual-write as a safety net. No schema changes. No SQL function changes (those are Phase 3b).

---

## 1. Complete Read Path Inventory

### 1A. `getBusinessBySlug(slug)` — PUBLIC listing page

**File:** `src/app/actions/business.ts:1411`
**Purpose:** Public listing page render (`/business/[slug]`)
**Currently reads:** `businesses.*` + `business_locations(*)` + `business_categories(...)` + `photos(*)` + `testimonials(*)`
**Should read:** P for ALL content; `businesses` for identity only

**New query shape:**
```
businesses.select('id, owner_id, slug, billing_status, deleted_at, is_seed, claim_status, listing_source')
  .eq('slug', slug)

published_listings.select('*')
  .eq('business_id', biz.id)
  .eq('is_current', true)
```

**Content mapping:**
- Text: `P.name`, `P.description`, `P.phone`, `P.email_contact`, `P.website`, `P.abn`
- Location: `P.address_text`, `P.suburb`, `P.state`, `P.postcode`, `P.lat`, `P.lng`, `P.service_radius_km`
- Categories: `P.category_ids`, `P.category_names`, `P.primary_category_id`
- Photos: `P.photos_snapshot` (JSONB array — NOT from `photos` table)
- Testimonials: `P.testimonials_snapshot` (JSONB — NOT from `testimonials` table)
- avgRating: calculated from `P.testimonials_snapshot`

**Visibility gate:**
- P must exist
- Anonymous/non-owner/non-admin: `P.visibility_status = 'live'` AND `businesses.billing_status != 'billing_suspended'` AND `businesses.deleted_at IS NULL` AND owner subscription active (for non-seed)
- Owner: can see P regardless of visibility_status
- Admin: can see everything

**Return shape:** Same as current (backward-compatible) with mapped fields.

---

### 1B. `getMyBusiness(selectedId?)` — Dashboard editing

**File:** `src/app/actions/business.ts:1319`
**Purpose:** Load business for wizard editor + form pre-fill
**Currently reads:** `businesses.*` + all joins, overlays `pending_changes` on form fields
**Should read:** W for editable content (if active W exists), P for read-only fallback

**New query shape:**
```
businesses.select('id, owner_id, slug, billing_status, deleted_at, status, is_seed, claim_status, suspended_reason')
  .eq('id', selectedId).eq('owner_id', user.id)

published_listings.select('*').eq('business_id', id).eq('is_current', true)
working_listings.select('*').eq('business_id', id).is('archived_at', null)

photos.select('*').eq('business_id', id)           -- relational (pending workflow)
testimonials.select('*').eq('business_id', id)      -- relational (pending workflow)
```

**Content source priority:**
1. If W exists → form fields from W (name, description, phone, email_contact, website, abn, location, categories)
2. If no W → form fields from P (read-only mode, "Edit" creates W)
3. If neither → return null

**Categories from W:**
- W has `primary_category_id` + `secondary_category_ids` (UUID arrays)
- Resolve names via `categories.select('*').in('id', allCatIds)`
- Build same shape as current `business_categories` return

**Location from W:**
- W has address_text, suburb, state, postcode, lat, lng, service_radius_km
- Build same shape as current `business_locations` return

**Photos/testimonials:** Still from relational tables (they use `pending_add`/`pending_delete` workflow)

**Key change:** `pending_changes` is always returned as `null`. W IS the working copy — no overlay logic needed.

**New `_pw` metadata added to return:**
```typescript
_pw: {
  hasW: boolean
  hasP: boolean
  reviewStatus: 'draft' | 'pending' | 'changes_required' | null
  changeType: 'new' | 'edit' | null
  rejectionReason: string | null
  visibilityStatus: 'live' | 'paused' | 'suspended' | null
}
```

---

### 1C. `getMyBusinesses()` — Command center

**File:** `src/app/actions/business.ts:1045`
**Purpose:** Dashboard overview, listing cards, quality badges
**Currently reads:** businesses (name, status, verification_status, pending_changes, etc) + business_locations + business_categories
**Should read:** Hybrid P + W + businesses (identity)

**New query shape (batch):**
```
businesses.select('id, slug, billing_status, deleted_at, is_seed, suspended_reason')
  .eq('owner_id', user.id).eq('is_seed', false).is('deleted_at', null)

published_listings.select('*').in('business_id', bizIds).eq('is_current', true)
working_listings.select('*').in('business_id', bizIds).is('archived_at', null)

-- For quality check (still needed):
business_categories.select('business_id, category_id').in('business_id', bizIds)
business_locations.select('business_id, postcode, suburb, state').in('business_id', bizIds)
```

**Status derivation (per business):** Uses `deriveStatus(P, W, biz)` helper (see Step 0).

**Content source for name/description/contacts:** W if exists, else P.

**Quality input mapping:**
- `status` = `derived.effectiveStatus`
- `verification_status` = `derived.effectiveVerification`
- `pending_changes` = `derived.hasPendingChanges ? {} : null`
- Other fields: from content source (W or P)

---

### 1D. `getAdminVerificationQueue()` — Admin review queue

**File:** `src/app/actions/verification.ts:122`
**Purpose:** Queue of listings pending admin review
**Currently reads:** `businesses WHERE verification_status='pending'`
**Should read:** `working_listings WHERE review_status='pending' AND archived_at IS NULL`

**New query shape:**
```
working_listings.select('id, business_id, name, description, phone, email_contact, website, abn,
  review_status, change_type, submitted_at, rejection_reason, rejection_count,
  primary_category_id, secondary_category_ids, created_at')
  .eq('review_status', 'pending')
  .is('archived_at', null)
  .order('submitted_at', { ascending: true })
  .range(from, to)
```

Then enrich each W row with:
- `businesses.select('slug, listing_source, duplicate_*')` — identity/flags
- `verification_jobs` — latest job
- `photos(*)` — including pending_add/pending_delete
- `testimonials(*)` — including pending_add/pending_delete

**Return shape:** backward-compatible with current (id = business_id for UI compat).

---

### 1E. `getAdminListingsEnhanced()` — Admin listings table

**File:** `src/app/actions/admin.ts:582`
**Purpose:** Admin command center with filters
**Currently reads:** businesses with status/verification_status filters

**Change:** The core query stays on `businesses` (for identity, filters, pagination), but the inline "searchable" check switches from old columns to P:

```
-- Batch-fetch P visibility for result set:
published_listings.select('business_id, visibility_status')
  .in('business_id', bizIds).eq('is_current', true)

-- Searchable derivation:
const pVis = pVisMap.get(row.id)
const searchable = pVis === 'live' && row.deleted_at === null && row.billing_status !== 'billing_suspended'
```

**Status/verification filters:** Stay on `businesses` columns during Phase 3a (dual-write keeps them in sync). Full migration of admin filters to P/W deferred to Phase 3b/4.

---

### 1F. `getAdminListingDetail(businessId)` — Admin detail

**File:** `src/app/actions/admin.ts:732`
**Purpose:** Full listing inspection
**Currently reads:** `businesses.*` + all joins

**Change:** Keep existing query (still useful for identity/relations). ADD P/W data to return:

```
-- New additions:
published_listings.select('*').eq('business_id', id).eq('is_current', true)  → publishedListing
working_listings.select('*').eq('business_id', id).is('archived_at', null)    → workingListing
published_listings.select('*').eq('business_id', id).order('amendment DESC')  → amendmentHistory
```

**New return fields:**
- `publishedListing: PublishedListing | null`
- `workingListing: WorkingListing | null`
- `amendmentHistory: PublishedListing[]`

---

### 1G. `getListingEligibility()` — Canonical visibility check

**File:** `src/lib/search/eligibility.ts:47`
**Purpose:** Determines if listing is publicly visible / in search
**Currently reads:** `businesses.status`, `businesses.verification_status`

**New logic:**
```
businesses.select('billing_status, deleted_at, owner_id, is_seed').eq('id', businessId)
published_listings.select('*').eq('business_id', id).eq('is_current', true)  -- via pwService

statusOk       = P exists && P.visibility_status === 'live'    (replaces status='published')
verificationOk = P exists                                       (replaces verification_status='approved')
billingOk       = businesses.billing_status !== 'billing_suspended'  (unchanged)
notDeleted     = businesses.deleted_at === null                      (unchanged)
notSuspended   = !P || P.visibility_status !== 'suspended'          (replaces status!='suspended')
```

---

### 1H. Photos + testimonials guards

**Files:** `src/app/actions/photos.ts:25-43`, `src/app/actions/testimonials.ts:25-43`
**Purpose:** Block edits during review; determine pending_add vs live status

**Guard check (both files):**
```
-- OLD: business.verification_status === 'pending' && business.status !== 'draft'
-- NEW:
const w = await pwService.getActiveWorkingTyped(businessId)
if (w && w.review_status === 'pending') → block edits
```

**Status determination (both files):**
```
-- OLD: isPublishedOrPaused(business.status)
-- NEW:
const p = await pwService.getCurrentPublishedTyped(businessId)
const isLive = p && (p.visibility_status === 'live' || p.visibility_status === 'paused')
const photoStatus = isLive ? 'pending_add' : 'live'
```

---

### 1I. Sitemap API

**File:** `src/app/api/sitemap.xml/route.ts:7`
**Currently reads:** `businesses WHERE status='published' AND billing_status != 'billing_suspended'`

**New query:**
```
published_listings.select('business_id, slug, approved_at')
  .eq('is_current', true).eq('visibility_status', 'live')

businesses.select('id, billing_status').in('id', bizIds)
  .neq('billing_status', 'billing_suspended').is('deleted_at', null)
```

---

### 1J. Pause/unpause guards

**File:** `src/app/actions/business.ts` (pauseBusiness ~892, unpauseBusiness ~941)

**Pause guard:**
```
-- OLD: biz.status !== 'published'
-- NEW: P.visibility_status !== 'live'
```

**Unpause guard:**
```
-- OLD: biz.status !== 'paused' + biz.verification_status !== 'approved'
-- NEW: P.visibility_status !== 'paused'
-- Also add: block if active W has review_status IN ('pending', 'changes_required')
```

---

### 1K. `publishChanges()` — Content source for verification

**File:** `src/app/actions/business.ts:540`
**Currently reads:** businesses content + pending_changes overlay for verification pipeline

**Change:** Read content from W instead of pending_changes:
```
const w = await pwService.getActiveWorkingTyped(businessId)
if (!w) return { error: 'No changes to publish.' }
const contentToValidate = {
  name: w.name, description: w.description,
  phone: w.phone, email_contact: w.email_contact,
  website: w.website, abn: w.abn,
}
```

**Still needs from businesses:** slug, billing_status, duplicate fields (identity/FK hub data).

---

### 1L. Dashboard `listing/page.tsx` — UI state

**File:** `src/app/dashboard/listing/page.tsx`
**Purpose:** Wizard editor, banners, publish button

**Changes driven by `getMyBusiness()` return shape (Step 2):**
- Form pre-fill: content already comes from W (no `pending_changes` overlay needed). The overlay code (`pc?.name ?? biz.name`) becomes a no-op since `pending_changes` is null and `biz.name` comes from W.
- `isUnderReview` check: `business.verification_status === 'pending' && business.status !== 'draft'` still works because `deriveStatus()` maps `W.review_status='pending'` → `effectiveVerification='pending'`.
- Rejected banner: `business.verification_status === 'rejected'` still works because `deriveStatus()` maps `W.review_status='changes_required'` → `effectiveVerification='rejected'`.
- **No changes needed to page.tsx in Phase 3a** — the mapped status values from `getMyBusiness()` preserve backward compat.

---

### 1M. `ListingsCommandCenter.tsx` — Status badges

**File:** `src/components/ListingsCommandCenter.tsx`
**Purpose:** Listing cards with edit/pause/resume/delete buttons

**No changes needed.** Receives mapped data from `getMyBusinesses()` which provides `status` and `verification_status` via `deriveStatus()`. Action rules (edit/pause/resume/delete visibility) work unchanged.

---

### 1N. Other reads (NO changes in Phase 3a)

| Read path | Why no change |
|-----------|--------------|
| `verifyBusinessOwnership()` in business.ts | Reads id + owner_id only (identity — stays on businesses) |
| `findPotentialDuplicates()` | Reads businesses.name + location (search index query, not public display) |
| `publishChanges()` write path | Still writes to old columns via dual-write |
| `adminSuspend/Unsuspend/SoftDelete` | Read businesses for identity/status guards — dual-write keeps old columns valid |
| `claimBusiness()` | Reads seed identity data — stays on businesses |
| `admin-accounts.ts` reads | Reads businesses for admin user detail — keep on businesses for now |
| `reportBusiness()` | Reads `businesses.id` only (existence check) |
| `stripe webhook` | Reads `businesses.owner_id` only (identity) |

---

## 2. Fallback Rules

| Scenario | Content Source | User sees | User can |
|----------|---------------|-----------|----------|
| No W, no P (brand new) | Nothing | Empty wizard | Fill in + publish |
| No W, P exists (published, no edits) | P (read-only) | Published listing data | Click "Edit" → creates W from P |
| W(draft), no P (new listing) | W | Their draft data | Edit + submit |
| W(draft), P exists (editing published) | W (editable) | Working copy with changes | Edit + submit |
| W(pending), P exists | W (locked) | "Changes under review" banner | Wait. Can pause P. Cannot edit. |
| W(pending), no P (first submission) | W (locked) | "Under review" banner | Wait. Cannot edit. |
| W(changes_required), P exists | W (editable) | "Rejected" banner + rejection_reason | Edit + resubmit |
| W(changes_required), no P | W (editable) | "Rejected" banner + rejection_reason | Edit + resubmit |
| P(suspended), no active W | P info | "Suspended" banner + reason | Nothing (all actions blocked) |

**"Create W from P" trigger:** When user clicks "Edit" on a published listing and no active W exists:
1. Already implemented: `pwService.createWorking(businessId, 'edit')` calls `snapshotBusinessState()` to pre-populate W from current business state
2. Phase 3a addition: When `getMyBusiness()` detects no W for edit scenario, the dashboard "Edit" button triggers `createWorking` → then re-fetches

**"Pending review" vs "editable":**
- `W.review_status = 'pending'` → "Under review" banner, ALL editing locked (text, location, categories, photos, testimonials)
- `W.review_status = 'draft'` or `'changes_required'` → Editable. If `changes_required`, also show rejection_reason banner
- No W at all → Not editing. Show published view or empty state.

---

## 3. Step-by-Step Implementation Order

### Step 0: Add Read Helpers to pw-service.ts

**File:** `src/lib/pw-service.ts`

**Add:**
- `getCurrentPublishedTyped(businessId)` → `PublishedListing | null`
- `getActiveWorkingTyped(businessId)` → `WorkingListing | null`
- `getListingState(businessId)` → `{ published, working }`
- `deriveStatus(p, w, biz)` → `{ effectiveStatus, effectiveVerification, hasPendingChanges, visibilityStatus, reviewStatus }`

**Test cases:**
- [ ] `deriveStatus` with P(live) + no W → status=published, verification=approved
- [ ] `deriveStatus` with P(live) + W(pending, edit) → status=published, verification=pending
- [ ] `deriveStatus` with no P + W(draft, new) → status=draft, verification=pending
- [ ] `deriveStatus` with P(paused) + no W → status=paused, verification=approved
- [ ] `deriveStatus` with P(suspended) → status=suspended
- [ ] `deriveStatus` with W(changes_required) → verification=rejected
- [ ] `deriveStatus` with deleted_at set → status=deleted

**Checkpoint:** All existing tests pass. No user-facing changes.

---

### Step 1: Switch `getBusinessBySlug()` — Public Page

**File:** `src/app/actions/business.ts`

**Changes:**
1. Replace `businesses.*` query with `businesses.select('id, owner_id, slug, billing_status, deleted_at, is_seed, claim_status, listing_source')`
2. Fetch P via `pwService.getCurrentPublishedTyped(biz.id)`
3. Visibility gate: check P existence + `P.visibility_status = 'live'` + billing/deleted
4. Return content from P snapshot (photos_snapshot, testimonials_snapshot, text, location, categories)
5. Calculate avgRating from testimonials_snapshot

**Test cases:**
- [ ] Published+live listing returns correct name, description, phone from P
- [ ] Photos come from P.photos_snapshot, not photos table
- [ ] Testimonials come from P.testimonials_snapshot
- [ ] avgRating calculated from snapshot testimonials
- [ ] Location fields from P (suburb, state, postcode, lat, lng)
- [ ] Categories from P (category_ids, category_names)
- [ ] P.visibility_status='paused' → null for anonymous, data for owner
- [ ] No P exists → null for anonymous
- [ ] billing_suspended → null for anonymous
- [ ] deleted business → null for anonymous
- [ ] Owner sees their own listing regardless of visibility
- [ ] Admin sees any listing

**Checkpoint:** Public listing pages render correctly. Verify with 3 real listings.

---

### Step 2: Switch `getMyBusiness()` — Dashboard Editing

**File:** `src/app/actions/business.ts`

**Changes:**
1. Fetch business identity from `businesses` (id, owner_id, slug, billing_status, etc.)
2. Fetch P and W via `pwService.getListingState(businessId)`
3. Content source = W if exists, else P
4. Categories: from W's `primary_category_id`/`secondary_category_ids` (resolve via categories table), or from `business_categories` if no W
5. Location: from W fields, or P fields, or `business_locations` fallback
6. Photos/testimonials: still from relational tables (pending workflow)
7. Return `pending_changes: null` always
8. Add `_pw` metadata to return

**Test cases:**
- [ ] Business with active W → content comes from W (not businesses/P)
- [ ] Business with P only → content comes from P (read-only)
- [ ] Categories resolved from W's category IDs
- [ ] Location from W's location fields
- [ ] Photos still from photos table (includes pending_add/pending_delete)
- [ ] `pending_changes` always null
- [ ] `_pw.reviewStatus` reflects W state
- [ ] `_pw.hasW` and `_pw.hasP` correct
- [ ] No selectedId → picks best business, same logic as before

**Checkpoint:** Dashboard editing works. Open 3 listings in wizard, verify pre-fill.

---

### Step 3: Switch Guard Checks

**Files:** `src/app/actions/photos.ts`, `src/app/actions/testimonials.ts`, `src/app/actions/business.ts`

**Changes in photos.ts + testimonials.ts:**
1. `verifyBusinessOwnership()` → keep businesses read for id/owner_id/slug, but also fetch W for review_status
2. "Under review" guard: `W.review_status === 'pending'` instead of `verification_status === 'pending' && status !== 'draft'`
3. `isPublishedOrPaused` check: `P.visibility_status IN ('live', 'paused')` instead of `business.status`

**Changes in business.ts:**
1. `updateBusiness()` live-vs-draft branch: check `P.visibility_status` instead of `business.status`
2. `publishChanges()` content source: read from W instead of pending_changes overlay

**Test cases:**
- [ ] Photo add blocked when W.review_status='pending'
- [ ] Photo add allowed when W.review_status='draft' or 'changes_required'
- [ ] New photo gets 'pending_add' when P exists (live|paused)
- [ ] New photo gets 'live' when no P (draft)
- [ ] Same rules for testimonials
- [ ] publishChanges reads name/description from W
- [ ] publishChanges returns error if no active W

**Checkpoint:** Add a photo, add a testimonial, edit text on a published listing. Verify pending workflow.

---

### Step 4: Switch `getMyBusinesses()` + Quality

**File:** `src/app/actions/business.ts`

**Changes:**
1. Batch-fetch P and W rows for all user businesses
2. Use `deriveStatus()` for each business
3. Content (name, location) from W if exists, else P
4. Quality computed from mapped fields
5. No changes to `listing-quality.ts` (pure function receives mapped inputs)

**Test cases:**
- [ ] Command center shows correct status badges for each state
- [ ] Quality flag 'under_review' when W pending
- [ ] Quality flag 'rejected' when W changes_required
- [ ] Quality flag 'edited' when active W with change_type='edit' and W is draft
- [ ] Quality flag 'blocked' when P suspended
- [ ] Edit/Pause/Resume/Delete buttons correct per state
- [ ] Name displayed from W if editing, P if published

**Checkpoint:** Command center renders all listings correctly. Check all filter tabs.

---

### Step 5: Switch Admin Reads

**Files:** `src/app/actions/verification.ts`, `src/app/actions/admin.ts`

**Changes:**
- `getAdminVerificationQueue()`: query `working_listings WHERE review_status='pending'` instead of `businesses WHERE verification_status='pending'`
- `getAdminListingsEnhanced()`: batch-fetch P for searchable check
- `getAdminListingDetail()`: add publishedListing, workingListing, amendmentHistory to return

**Test cases:**
- [ ] Verification queue shows W rows with review_status=pending
- [ ] Queue ordered by submitted_at (not created_at)
- [ ] Enhanced listings searchable flag correct from P
- [ ] Detail includes published listing + working listing + amendment history
- [ ] Detail still shows old data (backward compat during transition)

**Checkpoint:** Admin queue shows same items as before. Admin detail shows P/W data.

---

### Step 6: Switch Eligibility + Sitemap

**Files:** `src/lib/search/eligibility.ts`, `src/app/api/sitemap.xml/route.ts`

**Changes:**
- `getListingEligibility()`: statusOk = P exists + P.visibility_status='live'; verificationOk = P exists
- Sitemap: query published_listings for live+current, join businesses for billing filter

**Test cases:**
- [ ] Eligibility returns visiblePublic=true for P(live) + billing ok
- [ ] Eligibility returns false when no P
- [ ] Eligibility returns false when P suspended
- [ ] Sitemap includes only live + billing ok listings
- [ ] Sitemap excludes deleted businesses
- [ ] Sitemap slug comes from P.slug

**Checkpoint:** Eligibility check returns same result as before for 5 test businesses. Sitemap XML valid.

---

### Step 7: Switch Pause/Unpause Guards

**File:** `src/app/actions/business.ts`

**Changes:**
- `pauseBusiness()`: check `P.visibility_status === 'live'` instead of `business.status === 'published'`
- `unpauseBusiness()`: check `P.visibility_status === 'paused'` instead of `business.status === 'paused'`. Add: block if active W has `review_status IN ('pending', 'changes_required')`

**Test cases:**
- [ ] Pause succeeds when P.visibility_status=live
- [ ] Pause fails when P.visibility_status=paused (already paused)
- [ ] Unpause succeeds when P.visibility_status=paused
- [ ] Unpause fails when P.visibility_status=live (not paused)
- [ ] Unpause blocked when active W is pending
- [ ] Unpause blocked when active W is changes_required
- [ ] Unpause allowed when active W is draft

**Checkpoint:** Pause and unpause a listing. Verify search index updates.

---

## 4. Rollback Strategy

### Per-step rollback

Each step's code change is independently revertible. Dual-write keeps old columns populated:

| Step | Rollback action | Data impact |
|------|----------------|-------------|
| 0 | Remove new exports from pw-service.ts | None (no downstream deps yet) |
| 1 | Revert getBusinessBySlug to old query | None — old columns still populated |
| 2 | Revert getMyBusiness to old query | None |
| 3 | Revert guard checks to old status fields | None |
| 4 | Revert getMyBusinesses to old query | None |
| 5 | Revert admin reads to old queries | None |
| 6 | Revert eligibility + sitemap | None |
| 7 | Revert pause/unpause guards | None |

### Global rollback

If Phase 3a causes widespread issues after deploying multiple steps:
1. `git revert` all Phase 3a commits (or revert to Phase 2 commit)
2. All reads revert to old `businesses` columns
3. Old columns are fully populated by dual-write — no data loss
4. P/W tables remain populated but unused for reads
5. No schema changes to revert

### Emergency detection signals

- Public listing page shows blank/missing content → Step 1 broke → revert Step 1
- Dashboard wizard shows wrong data or can't pre-fill → Step 2 broke → revert Step 2
- Photo/testimonial operations fail with errors → Step 3 broke → revert Step 3
- Command center shows wrong statuses → Step 4 broke → revert Step 4
- Admin queue empty or wrong items → Step 5 broke → revert Step 5

### Safety invariants to verify after each step

1. **P content matches old columns:** `SELECT b.name, p.name FROM businesses b JOIN published_listings p ON p.business_id = b.id WHERE p.is_current = TRUE` — all names should match
2. **W content matches pending_changes:** For businesses with pending_changes, W text fields should match the overlay result
3. **No public data from W:** grep for `'working_listings'` in public page rendering — should be zero
4. **Search results unchanged:** Run 5 test searches, verify same results before/after

---

## 5. Files Modified Summary

| File | Steps | Changes |
|------|-------|---------|
| `src/lib/pw-service.ts` | 0 | Add typed read helpers + deriveStatus |
| `src/app/actions/business.ts` | 1,2,3,4,7 | Switch getBusinessBySlug, getMyBusiness, getMyBusinesses, guards, pause/unpause |
| `src/app/actions/photos.ts` | 3 | Switch guard checks to W.review_status + P.visibility_status |
| `src/app/actions/testimonials.ts` | 3 | Switch guard checks to W.review_status + P.visibility_status |
| `src/app/actions/verification.ts` | 5 | Switch verification queue to working_listings |
| `src/app/actions/admin.ts` | 5 | Switch searchable check, add P/W to detail |
| `src/lib/search/eligibility.ts` | 6 | Switch to P for visibility/status checks |
| `src/app/api/sitemap.xml/route.ts` | 6 | Switch to published_listings query |

**Files NOT modified in Phase 3a:**
- `src/lib/listing-quality.ts` — pure function, receives mapped inputs
- `src/components/ListingsCommandCenter.tsx` — receives mapped data from getMyBusinesses
- `src/app/dashboard/listing/page.tsx` — backward-compat via deriveStatus mappings
- `src/app/business/[slug]/page.tsx` — receives same shape from getBusinessBySlug
- SQL functions — deferred to Phase 3b
