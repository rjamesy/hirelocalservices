# Business Logic — P/W + Amendments Architecture

> **Authoritative spec.** All code, migrations, and UI must conform to this document.
> No code or DB changes until this file is approved.

---

## 1) Purpose

**Problems solved:**
- **Status dead-ends**: Rejected listings currently set `publishDisabled=true` in local React state with no DB-backed recovery path. Users must reload and guess what to do.
- **Ambiguous state combinations**: `status` x `verification_status` x `billing_status` creates a matrix of ~40 theoretical states, many never tested or handled.
- **No audit trail**: When pending_changes are merged into the main row, the previous version is lost. No history of what was published when, or what was changed between versions.
- **Mutable published data**: The same row serves as both the public snapshot and the user's editing workspace, creating race conditions and inconsistent reads.

**Goals:**
- Correctness: every state is reachable AND recoverable. No dead-ends.
- Audit trail: every published version is preserved as an immutable amendment.
- Deterministic transitions: each action has exactly one outcome, defined in code and spec.
- Separation of concerns: what the public sees (P) is never the same row the user edits (W).

---

## 2) Core Concepts

**Published Listing (P)**
An immutable snapshot of a listing's content at the moment an admin approved it. Contains denormalized copies of ALL display data (business details, location, categories, photos, testimonials). Content fields are never modified after creation. The only mutable field is `visibility_status` (live/paused/suspended) which controls public visibility without creating a new amendment. When superseded by a newer amendment, `is_current` is set to FALSE.

**Working Listing (W)**
The user's editable workspace. Created when a user starts a new listing or clicks "Edit" on an existing published listing. Contains ALL mutable listing data: text fields (name, description, phone, email_contact, website, abn), location fields (address, suburb, state, postcode, lat/lng, service_radius), and category fields (primary + secondary). Never publicly visible. Goes through a review lifecycle: `draft -> pending -> [approved | changes_required]`. Archived (soft-deleted) after approval.

**Amendment Numbering**
Each P row has an `amendment` integer starting at 0. When a listing is first published, amendment 0 is created. Each subsequent approval creates amendment N+1. All amendments are preserved for audit. Only one amendment per business can have `is_current = TRUE`.

**"Current/Live" Published Version**
The single P row for a business where `is_current = TRUE`. This is what the public sees. Enforced by a partial unique index: `UNIQUE(business_id) WHERE is_current = TRUE`.

**Business Entity**
The `businesses` table row. Serves as the identity anchor: owns the `id`, `slug`, `owner_id`, `billing_status`, and all FK relationships. Does NOT store listing content or visibility — those live on P and W. The business entity is the FK hub only.

---

## 3) Data Model (Proposed)

### A) `published_listings` (P)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK -> businesses | Owner business |
| `amendment` | INT NOT NULL DEFAULT 0 | 0, 1, 2, ... |
| `is_current` | BOOLEAN NOT NULL DEFAULT TRUE | Partial unique index enforces one per business |
| `visibility_status` | TEXT NOT NULL DEFAULT 'live' | `live | paused | suspended` — controls public visibility |
| **--- Business details ---** | | |
| `name` | TEXT NOT NULL | Snapshot |
| `slug` | TEXT NOT NULL | Snapshot of slug at publish time |
| `description` | TEXT | Snapshot |
| `phone` | TEXT | Snapshot |
| `email_contact` | TEXT | Snapshot |
| `website` | TEXT | Snapshot |
| `abn` | TEXT | Snapshot |
| **--- Location (denormalized) ---** | | |
| `address_text` | TEXT | Snapshot |
| `suburb` | TEXT | Snapshot |
| `state` | TEXT | Snapshot |
| `postcode` | TEXT | Snapshot |
| `lat` | DOUBLE PRECISION | Snapshot |
| `lng` | DOUBLE PRECISION | Snapshot |
| `service_radius_km` | INT | Snapshot |
| **--- Categories (denormalized) ---** | | |
| `category_ids` | UUID[] DEFAULT '{}' | Snapshot |
| `category_names` | TEXT[] DEFAULT '{}' | Denormalized names for display |
| `primary_category_id` | UUID | Snapshot |
| **--- Media (denormalized JSONB) ---** | | |
| `photos_snapshot` | JSONB DEFAULT '[]' | `[{id, url, sort_order}]` |
| `testimonials_snapshot` | JSONB DEFAULT '[]' | `[{id, author_name, text, rating}]` |
| **--- Approval metadata ---** | | |
| `approved_by` | UUID FK -> profiles | Admin who approved |
| `approval_comment` | TEXT | Admin notes on approval |
| `verification_job_id` | UUID FK -> verification_jobs | Link to verification run |
| `approved_at` | TIMESTAMPTZ DEFAULT now() | When approved |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

**`visibility_status` is the ONLY mutable field on P.** All content fields are immutable after creation. Pause/unpause/suspend change `visibility_status` on the current P without creating a new amendment.

**Constraints:**
- `UNIQUE (business_id, amendment)` — no duplicate amendments
- Partial unique index: `UNIQUE (business_id) WHERE is_current = TRUE` — one current per business
- `CHECK (visibility_status IN ('live', 'paused', 'suspended'))`

**Indexes:**
- `(business_id)` — FK lookups
- `(business_id, amendment DESC)` — amendment history queries
- `(business_id) WHERE is_current = TRUE AND visibility_status = 'live'` — public read fast path

### B) `working_listings` (W)

Contains ALL editable listing data. When a user edits any aspect of their listing, it happens here.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK -> businesses | Owner business |
| **--- Business details (editable) ---** | | |
| `name` | TEXT NOT NULL | Editable |
| `description` | TEXT | Editable |
| `phone` | TEXT | Editable |
| `email_contact` | TEXT | Editable |
| `website` | TEXT | Editable |
| `abn` | TEXT | Editable |
| **--- Location (editable) ---** | | |
| `address_text` | TEXT | Editable |
| `suburb` | TEXT | Editable |
| `state` | TEXT | Editable |
| `postcode` | TEXT | Editable |
| `lat` | DOUBLE PRECISION | Editable (geocoded from address) |
| `lng` | DOUBLE PRECISION | Editable |
| `service_radius_km` | INT DEFAULT 25 | Editable |
| **--- Categories (editable) ---** | | |
| `primary_category_id` | UUID | Editable |
| `secondary_category_ids` | UUID[] DEFAULT '{}' | Editable (max 3) |
| **--- Review lifecycle ---** | | |
| `review_status` | TEXT NOT NULL DEFAULT 'draft' | `draft | pending | changes_required` |
| `change_type` | TEXT NOT NULL DEFAULT 'new' | `new | edit` |
| `rejection_reason` | TEXT | Latest admin rejection comment |
| `rejection_count` | INT DEFAULT 0 | How many times rejected |
| `verification_job_id` | UUID FK -> verification_jobs | Link to latest verification run |
| `submitted_at` | TIMESTAMPTZ | When user submitted for review |
| `reviewed_at` | TIMESTAMPTZ | When admin last reviewed |
| `reviewed_by` | UUID FK -> profiles | Admin who last reviewed |
| `archived_at` | TIMESTAMPTZ | Set after approval (soft archive) |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

**Photos and testimonials** are NOT stored on W directly. They continue to use the `photos` and `testimonials` tables with `pending_add`/`pending_delete` status workflow, scoped to the W lifecycle. On approval, they are promoted to live and snapshotted into P.

**Constraints:**
- Partial unique index: `UNIQUE (business_id) WHERE archived_at IS NULL` — at most one active W per business
- `CHECK (review_status IN ('draft', 'pending', 'changes_required'))`
- `CHECK (change_type IN ('new', 'edit'))`

**Indexes:**
- `(business_id)` — FK lookups
- `(review_status) WHERE archived_at IS NULL` — admin queue

### C) `businesses` table modifications

**The `businesses` table becomes a pure identity/ownership hub.** It holds NO listing content and NO visibility state in the final model.

**Keep unchanged:**
- `id`, `owner_id`, `slug` (identity)
- `billing_status` (entity-level billing — affects search eligibility)
- `is_seed`, `claim_status`, `listing_source`, `seed_source`, `seed_source_id`, `seed_confidence`
- `duplicate_*` columns
- `suspended_reason`, `suspended_at`, `deleted_at`
- `created_at`, `updated_at`

**No new columns added to businesses.**

**Eventually remove (Phase 4):**
- `name`, `description`, `phone`, `email_contact`, `website`, `abn` (moved to P/W)
- `status` (replaced by P.visibility_status + P/W existence)
- `verification_status` (replaced by W.review_status)
- `pending_changes` (replaced by W table)

### D) `moderation_events` (Optional — Phase 4+)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK -> businesses | |
| `event_type` | TEXT | `submitted | approved | rejected | suspended | unsuspended | paused | unpaused` |
| `actor_id` | UUID FK -> profiles | User or admin who performed the action |
| `comment` | TEXT | |
| `metadata` | JSONB | Event-specific data |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

---

## 4) Authoritative State Machine

### Working Listing (W) States

| State | User can edit? | User can submit? | Admin can act? |
|-------|---------------|-------------------|----------------|
| `draft` | Yes | Yes (runs AI validation) | No (not in queue) |
| `pending` | No (locked) | No | Yes (approve / reject) |
| `changes_required` | Yes | Yes (resubmit) | No (not in queue) |

### Published Listing (P) Visibility (via `published_listings.visibility_status`)

| P.visibility_status | Publicly visible? | In search? | User actions | Admin actions |
|---------------------|-------------------|------------|--------------|---------------|
| `live` | Yes (if billing OK) | Yes (if billing OK) | Pause, Edit | Suspend |
| `paused` | No | No | Unpause (if no pending W) | Suspend |
| `suspended` | No | No | None | Unsuspend |

**No P exists yet** (new listing): Not visible anywhere. User works through W.

**`visibility_status` lives on the current P row, NOT on `businesses`.** Pausing/unpausing/suspending updates `published_listings.visibility_status` on the current P — this is the ONLY mutable field on P. Content remains immutable.

### Coupling Rules

1. **W is never public.** Public pages ONLY read from `published_listings WHERE is_current = TRUE AND visibility_status = 'live'`.
2. **Admin approval is the only way to create P content.** No user action can write content to P. Users can only change `P.visibility_status` (pause/unpause).
3. **At most one active W per business.** Enforced by partial unique index on `working_listings(business_id) WHERE archived_at IS NULL`.
4. **ALL listing content changes go through W.** This includes text fields, location, categories, photos, and testimonials. Nothing is written "directly" to the live listing.
5. **When W.review_status = 'pending':**
   - User cannot edit W
   - User cannot unpause P
   - User cannot create another W
   - User CAN pause a live P (visibility change only, not content)
6. **When W.review_status = 'changes_required':**
   - User can edit W and resubmit
   - User cannot unpause P (must wait for approval)
7. **Suspended P:** User cannot create/edit W. All user actions blocked except viewing their listing status.

---

## 5) Transition Contracts (Single Source of Truth)

Each operation is defined as a contract: preconditions, effects, and post-state.

### `createWorkingListing_New(business_id)`
- **Preconditions:** No active W exists. No P exists. Business not suspended/deleted.
- **Effects:** Insert W row: `review_status='draft'`, `change_type='new'`. All content fields (text, location, categories) empty/defaults.
- **Post-state:** W(draft), no P.

### `createWorkingListing_FromPublished(business_id)`
- **Preconditions:** No active W exists. Current P exists. P not suspended. Business not deleted.
- **Effects:** Insert W row: `review_status='draft'`, `change_type='edit'`. ALL content fields pre-populated from current P's snapshot: text fields, location (address_text, suburb, state, postcode, lat, lng, service_radius_km), categories (primary_category_id, secondary_category_ids derived from P.category_ids).
- **Post-state:** W(draft), P unchanged.

### `updateWorkingListing(w_id, fields)`
- **Preconditions:** W.review_status IN ('draft', 'changes_required'). W not archived. Business not suspended.
- **Effects:** Update any W columns: text fields (name, description, phone, email_contact, website, abn), location fields (address_text, suburb, state, postcode, lat, lng, service_radius_km), category fields (primary_category_id, secondary_category_ids). Update `updated_at`.
- **Post-state:** W stays in same review_status. P is NOT affected. Location/category changes do NOT touch business_locations or business_categories tables — they live on W until approval.

### `submitWorkingListing(w_id)`
- **Preconditions:** W.review_status IN ('draft', 'changes_required'). Passes completeness validation. Business not suspended.
- **Effects:**
  1. Run AI validation pipeline (deterministic + AI content review + safety checks)
  2. If AI rejects: W stays in current review_status. Set `rejection_reason` with AI failure details. Return error. **No state change.**
  3. If AI passes: Set `W.review_status = 'pending'`, `W.submitted_at = now()`.
- **Post-state:** W(pending) if AI passes, W(unchanged) if AI rejects.

### `adminApproveWorkingListing(w_id, comment)`
- **Preconditions:** W.review_status = 'pending'. Admin authenticated.
- **Effects (ALL steps within a single database transaction):**
  1. **Promote photos:** `pending_add -> status='live'`
  2. **Delete photos:** `pending_delete -> remove from storage + DB`
  3. **Promote testimonials:** `pending_add -> status='live'`, `pending_delete -> remove from DB`
  4. **Create new P amendment snapshot:**
     - Compute next amendment: `max(amendment) + 1` for this business (or 0 if first)
     - Text fields from W (name, description, phone, email_contact, website, abn)
     - Location fields from W (address_text, suburb, state, postcode, lat, lng, service_radius_km)
     - Category fields from W (primary_category_id, secondary_category_ids -> resolved to category_ids + category_names)
     - `photos_snapshot` from `photos` table (now all live, post-promotion)
     - `testimonials_snapshot` from `testimonials` table (now all live, post-promotion)
     - `visibility_status = 'live'`, `approved_by`, `approval_comment`, `approved_at = now()`
  5. **Mark new P as current:** `is_current = TRUE`, `amendment = N`
  6. **Archive previous P:** Set `is_current = FALSE` on all prior P rows for this business
  7. **Archive W:** `archived_at = now()`, `reviewed_at = now()`, `reviewed_by = admin_id`
  --- end transaction ---
  8. Sync `business_locations` from W location fields (for search index PostGIS geom)
  9. Sync `business_categories` from W category fields (for search index category joins)
  10. Sync `business_contacts` from W contact fields
  11. Refresh search index
  12. Create notification: type='listing_approved', include admin comment

**Transaction guarantee:** Steps 1-7 are atomic. If any step fails, all are rolled back. The public view (P snapshots) is never in an inconsistent state — either the old P is current, or the new P is current with fully promoted photos/testimonials.

- **Post-state:** W(archived), new P(current, visibility_status='live'), listing publicly visible (if billing OK).

### `adminRejectWorkingListing(w_id, comment)`
- **Preconditions:** W.review_status = 'pending'. Admin authenticated.
- **Effects:**
  1. Revert photos: `pending_add -> delete from storage + DB` (never went live)
  2. Revert testimonials: `pending_delete -> status = 'live'` (restore)
  3. Set `W.review_status = 'changes_required'`, `W.rejection_reason = comment`, `W.rejection_count += 1`, `W.reviewed_at = now()`, `W.reviewed_by = admin_id`
  4. P unchanged.
  5. Create notification: type='listing_rejected', include admin comment
- **Post-state:** W(changes_required), P unchanged.

### `pausePublished(business_id)`
- **Preconditions:** Current P exists with `visibility_status = 'live'`. Business not deleted.
- **Effects:** Set current P's `visibility_status = 'paused'`. Refresh search index (removed from search).
- **Post-state:** P.visibility_status='paused'. Content unchanged.

### `unpausePublished(business_id)`
- **Preconditions:** Current P exists with `visibility_status = 'paused'`. No active W with `review_status IN ('pending', 'changes_required')`. Billing OK (`businesses.billing_status != 'billing_suspended'`). Business not deleted.
- **Effects:** Set current P's `visibility_status = 'live'`. Refresh search index (re-added).
- **Post-state:** P.visibility_status='live'. Content unchanged.
- **Note:** If an active W exists in `draft` status, unpause IS allowed (user is editing but hasn't submitted yet).

### `adminSuspendPublished(business_id, comment)`
- **Preconditions:** Current P exists, not already suspended. Admin authenticated.
- **Effects:** Set current P's `visibility_status = 'suspended'`. Set `businesses.suspended_reason = comment`, `businesses.suspended_at = now()`. Refresh search index. Create notification.
- **Post-state:** P.visibility_status='suspended'. All user actions blocked. Active W remains but is inaccessible to user.

### `adminUnsuspendPublished(business_id)`
- **Preconditions:** Current P exists with `visibility_status = 'suspended'`. Admin authenticated.
- **Effects:** Set current P's `visibility_status = 'live'`. Clear `businesses.suspended_reason`, `businesses.suspended_at`. Refresh search index.
- **Post-state:** P.visibility_status='live'. User can resume actions.

### `softDeleteBusiness(business_id)`
- **Preconditions:** Business owner authenticated.
- **Effects:** Set `businesses.deleted_at = now()`. Archive any active W. Remove from search index.
- **Post-state:** Business soft-deleted. Not visible anywhere.

---

## 6) AI Validation Rules (Critical)

**When AI validation runs:** On `submitWorkingListing()` — before transitioning W to `pending`.

**What it checks (same pipeline as current `publishChanges`):**
1. Deterministic checks: name format, email validity, location completeness
2. AI content review: spam score, toxicity, real business likelihood
3. Text safety: `checkExplicitContent()` on name, description, all testimonial texts
4. Image moderation: check all `pending_add` photos for adult content / violence

**Critical rule: If AI rejects, NO state transition occurs.**
- W.review_status stays as `draft` or `changes_required`
- `rejection_reason` is set with the AI failure details
- Photos/testimonials are NOT modified
- The user sees the error and can fix their content
- The user can try submitting again after fixing

**This eliminates the current bug where AI rejection could leave the listing in an ambiguous state.**

---

## 7) Public Read Rules

Public endpoints MUST only read from P:
```sql
SELECT pl.*
FROM published_listings pl
JOIN businesses b ON b.id = pl.business_id
WHERE pl.is_current = TRUE
  AND pl.visibility_status = 'live'
  AND b.billing_status != 'billing_suspended'
  AND b.deleted_at IS NULL
```

**Everything from P.** Public pages render:
- Business details: `P.name`, `P.description`, `P.phone`, `P.email_contact`, `P.website`, `P.abn`
- Location: `P.suburb`, `P.state`, `P.postcode`, `P.address_text`, `P.lat`, `P.lng`, `P.service_radius_km`
- Categories: `P.category_names`, `P.primary_category_id`
- Photos: `P.photos_snapshot` (JSONB array — never from `photos` table)
- Testimonials: `P.testimonials_snapshot` (JSONB array — never from `testimonials` table)
- Slug: `P.slug` (or `businesses.slug` — both should match)

**Never show W.** Working listings are invisible to all public pages, search results, and API endpoints.

**Never read from relational tables for public display.** The `photos`, `testimonials`, `business_locations`, `business_categories` tables are *working* data used by the dashboard editor. Public pages use only the denormalized P snapshot.

**Photo/testimonial lifecycle under P/W:**
1. User adds photo while editing -> `photos` table, `status='pending_add'`
2. User deletes live photo while editing -> `photos` table, `status='pending_delete'`
3. User submits W -> AI checks pending_add photos for moderation
4. Admin approves W ->
   - `pending_add` -> `status='live'` (promoted)
   - `pending_delete` -> removed from storage + DB (deleted)
   - Final live set snapshotted into `P.photos_snapshot` and `P.testimonials_snapshot`
5. Admin rejects W ->
   - `pending_add` -> removed from storage + DB (never went live)
   - `pending_delete` -> `status='live'` (restored)
   - P unchanged, P snapshots unchanged

**Key invariant:** Public reads never touch `photos`, `testimonials`, `business_locations`, or `business_categories` tables. They read exclusively from the P snapshot.

The search index (`business_search_index`) is populated from `published_listings WHERE is_current = TRUE`. The `refresh_search_index()` function reads P data only.

---

## 8) Admin Console Rules

**Admin verification queue:**
```sql
SELECT w.*, b.slug, b.owner_id, p.name AS owner_email
FROM working_listings w
JOIN businesses b ON b.id = w.business_id
JOIN profiles p ON p.id = b.owner_id
WHERE w.review_status = 'pending'
  AND w.archived_at IS NULL
ORDER BY w.submitted_at ASC
```

**Admin actions on queue items:** Approve or Reject, both require a comment.

**Admin listing detail page:**
- Shows current P (the published snapshot) if it exists
- Shows active W (pending changes) if it exists
- Shows amendment history (all P rows ordered by amendment DESC)
- Shows diff between W and current P (nice-to-have, not Phase 1)

**Admin comments:** All approve/reject actions require a comment. Comments are:
1. Stored on the P row (approval_comment) or W row (rejection_reason)
2. Included in the notification sent to the business owner
3. Visible in admin listing detail for audit

---

## 9) Migration Strategy (Phased)

This is NOT a big-bang rewrite. Each phase is independently deployable and reversible.

### Phase 1 — Schema + Backfill (No Behavior Change)

**DB changes:**
1. Create `published_listings` table with all columns (incl `visibility_status`), indexes, constraints, RLS
2. Create `working_listings` table with all columns (incl location + category fields), indexes, constraints, RLS
3. Backfill P0 rows from existing published/paused/suspended+approved businesses (see mapping below)
4. Backfill W rows from existing draft + pending_changes businesses (see mapping below)
5. No changes to `businesses` table schema in this phase

**Code changes:** None. Old system runs unchanged. New tables are populated but not read.

**Rollback:** Drop new tables. Zero impact.

#### Backfill Mapping — Old State -> P/W

**What becomes P0 (published_listings, amendment=0, is_current=TRUE):**

| Old State | Becomes P0? | Notes |
|-----------|-------------|-------|
| `status='published'` AND `verification_status='approved'` AND `deleted_at IS NULL` | YES | User-created published listing |
| `status='paused'` AND `verification_status='approved'` AND `deleted_at IS NULL` | YES | Paused listing (was published, user paused) |
| `is_seed=true` AND `status='published'` AND `verification_status='approved'` | YES | Seed listing that was approved |
| `is_seed=true` AND `status NOT IN ('published')` | NO | Unapproved seed — no P yet |
| `status='draft'` | NO | Never published — no P |
| `status='suspended'` AND `verification_status='approved'` | YES | Admin-suspended but was published — P exists, visibility_status='suspended' |
| `status='suspended'` AND `verification_status != 'approved'` | NO | Suspended before ever publishing — no P |
| `deleted_at IS NOT NULL` | NO | Soft-deleted — skip entirely |

**P0 snapshot source:** For each qualifying row:
- Text fields: from `businesses` columns (name, description, phone, email_contact, website, abn)
- Location: from `business_locations` (address_text, suburb, state, postcode, lat, lng, service_radius_km)
- Categories: from `business_categories` + `categories` (category_ids array, category_names array, primary_category_id)
- Photos: from `photos WHERE status='live'` -> JSONB array in `photos_snapshot`
- Testimonials: from `testimonials WHERE status='live'` -> JSONB array in `testimonials_snapshot`
- `visibility_status`: mapped from old `status` (published->'live', paused->'paused', suspended->'suspended')

**What becomes W (working_listings, archived_at=NULL):**

| Old State | Becomes W? | review_status | change_type | Notes |
|-----------|------------|---------------|-------------|-------|
| `status='draft'` AND `verification_status='pending'` | YES | `pending` | `new` | Draft submitted for first review |
| `status='draft'` AND `verification_status='rejected'` | YES | `changes_required` | `new` | Draft rejected, user needs to fix |
| `status='draft'` AND `verification_status NOT IN ('pending','rejected')` | YES | `draft` | `new` | Draft in progress |
| `pending_changes IS NOT NULL` AND `verification_status='pending'` | YES | `pending` | `edit` | Published listing with pending edits under review |
| `pending_changes IS NOT NULL` AND `verification_status='rejected'` | YES | `changes_required` | `edit` | Published listing edits rejected |
| `pending_changes IS NOT NULL` AND `verification_status NOT IN ('pending','rejected')` | YES | `draft` | `edit` | Published listing with unsaved pending changes |
| `status IN ('published','paused')` AND `pending_changes IS NULL` | NO | — | — | Published with no edits — no W needed |
| `deleted_at IS NOT NULL` | NO | — | — | Soft-deleted — skip |

**W field source:** For `change_type='new'`, copy text fields from `businesses` columns, location from `business_locations`, categories from `business_categories`. For `change_type='edit'`, merge `pending_changes` over `businesses` columns for text fields, copy location from `business_locations`, categories from `business_categories`.

**P0 visibility_status backfill (on `published_listings`, not `businesses`):**

| Old State | P0.visibility_status |
|-----------|----------------------|
| `status='published'` AND `verification_status='approved'` | `live` |
| `status='paused'` | `paused` |
| `status='suspended'` AND `verification_status='approved'` | `suspended` |

(Only rows that qualify for P0 get a visibility_status. See P0 criteria above.)

**Verification queries (run after backfill):**
```sql
-- P count should equal published+paused+suspended (where approved and not deleted)
SELECT count(*) FROM published_listings;
SELECT count(*) FROM businesses
  WHERE status IN ('published','paused') AND verification_status = 'approved' AND deleted_at IS NULL;
-- Plus suspended+approved (if any)

-- W count should equal drafts + pending_changes (not deleted)
SELECT count(*) FROM working_listings WHERE archived_at IS NULL;
SELECT count(*) FROM businesses
  WHERE (status = 'draft' OR pending_changes IS NOT NULL) AND deleted_at IS NULL;

-- P visibility_status distribution
SELECT visibility_status, count(*) FROM published_listings WHERE is_current = TRUE GROUP BY visibility_status;

-- Verify no business has both a P0 and active W (shouldn't happen for clean data)
SELECT b.id FROM businesses b
  JOIN published_listings pl ON pl.business_id = b.id AND pl.is_current = TRUE
  JOIN working_listings w ON w.business_id = b.id AND w.archived_at IS NULL
  WHERE w.change_type = 'new';  -- Should return 0 rows
```

### Phase 2 — Dual-Write via Centralized Service

**DB changes:** None.

**Code changes:**

**Critical: All P/W writes go through a single service module `src/lib/pw-service.ts`.**
No action file (business.ts, admin.ts, verification.ts) implements its own P/W copy logic. Every action calls pwService methods. This prevents the scattered-copy problem that created the original bugs.

**`src/lib/pw-service.ts` exports:**
```
pwService.createWorking(supabase, businessId, changeType, initialFields?)  -> W(draft)
pwService.updateWorking(supabase, workingId, fields)                       -> W columns updated (text, location, categories)
pwService.submitWorking(supabase, workingId)                               -> W(pending)
pwService.approveWorking(supabase, workingId, adminId, comment)            -> W archived, P created (snapshots everything from W + live photos/testimonials)
pwService.rejectWorking(supabase, workingId, adminId, comment)             -> W(changes_required)
pwService.archiveWorking(supabase, workingId)                              -> W archived (no P created)
pwService.createSnapshot(supabase, businessId, workingId, adminId, comment) -> P row (internal — builds denormalized snapshot)
pwService.setVisibility(supabase, businessId, status)                      -> current P.visibility_status updated
pwService.getActiveWorking(supabase, businessId)                           -> W | null
pwService.getCurrentPublished(supabase, businessId)                        -> P | null
```

**How existing actions call pwService (dual-write pattern):**
- `createBusinessDraft()` -> does its existing insert, then calls `pwService.createWorking()`
- `updateBusiness()` -> does its existing update, then calls `pwService.updateWorking()` (includes location + categories)
- `updateBusinessLocation()` -> does its existing update, then calls `pwService.updateWorking()` with location fields
- `updateBusinessCategories()` -> does its existing update, then calls `pwService.updateWorking()` with category fields
- `publishChanges()` -> does its existing verification + merge, then calls `pwService.submitWorking()` or `pwService.approveWorking()`
- `adminApproveVerification()` -> does its existing merge, then calls `pwService.approveWorking()`
- `adminRejectVerification()` -> does its existing reject, then calls `pwService.rejectWorking()`
- `pauseBusiness()` -> does its existing status update, then calls `pwService.setVisibility('paused')` (updates current P.visibility_status)
- `adminSuspendBusiness()` -> does its existing suspend, then calls `pwService.setVisibility('suspended')`
- `softDeleteBusiness()` -> does its existing delete, then calls `pwService.archiveWorking()` if active W exists

**Rollback:** Revert code changes. New tables have data but aren't read. Old system works.

**Verification:**
- Run all existing tests — no regressions
- Compare old columns vs P/W data after operations — should be in sync
- New admin queue shows same items as old queue

### Phase 3 — Read Switch + Full Cutover

**Sub-phase 3a: Application code read switch (NO SQL function changes yet)**
- Public listing page reads ALL data from P (text, location, categories, photos_snapshot, testimonials_snapshot)
- Dashboard reads from W for editing (text, location, categories all from W)
- updateBusinessLocation writes to W (not business_locations directly)
- updateBusinessCategories writes to W (not business_categories directly)
- ListingsCommandCenter shows P.visibility_status + W.review_status
- listing-quality.ts derives flags from P.visibility_status + W.review_status
- eligibility.ts uses P.visibility_status instead of businesses.status
- Remove `pending_changes` reliance in all paths
- Unpause guard: block if active W is pending/changes_required
- Admin queue reads from W

**Verification gate for 3a:** All pages render correctly, dashboard editing works (text + location + categories all via W), admin queue works, all tests pass. Old SQL functions still work because old columns are still populated via dual-write.

**Sub-phase 3b: Search SQL migration (AFTER 3a is validated)**
- Migration `00046_pw_search_functions.sql`:
  - Rewrite `is_search_eligible()` to check `published_listings.visibility_status` + P existence + `businesses.billing_status`
  - Rewrite `refresh_search_index()` to read from P instead of businesses columns
  - Rewrite `is_business_visible()` to use `visibility_status`
  - **Backward-compatible:** During transition, these functions FALL BACK to old columns if P row doesn't exist for a business (defensive coding). This handles any edge case where dual-write missed a row.
- Run `refresh_all_search_index()` to rebuild
- Verify search results match before/after

**Rollback:** Revert SQL functions to old versions. Rebuild search index. App code revert if needed.

**Verification:**
- Search returns same results as before migration
- All pages render correctly
- Dashboard editing works end-to-end
- Admin queue works
- All test cases pass (see section 10)

### Phase 4 — Cleanup (Remove Old Columns)

**DB changes:**
- Drop: `businesses.name`, `description`, `phone`, `email_contact`, `website`, `abn`
- Drop: `businesses.status`, `verification_status`, `pending_changes`
- Update operational metrics SQL functions to read from P/W instead of businesses columns

**Code changes:**
- Remove dual-write code
- Remove old type fields from Business type
- Clean up migration-era fallback logic

**Rollback:** Would require re-adding columns and backfilling from P. More complex — only do Phase 4 after Phase 3 is stable for 1+ weeks.

---

## 10) Test Matrix (Must-Pass)

### New Listing Flow
- [ ] Create business -> W(draft, change_type='new') created
- [ ] Edit W -> W columns updated, review_status unchanged
- [ ] Submit W -> AI passes -> W(pending), submitted_at set
- [ ] Admin approves -> P(amendment=0, is_current=TRUE) created, W archived, visibility_status='live'
- [ ] Public page shows P data
- [ ] Search returns the listing

### Edit Published Listing Flow
- [ ] Click "Edit" on published listing -> W(draft, change_type='edit') created with P data
- [ ] Edit W -> W columns updated
- [ ] Submit -> W(pending)
- [ ] Admin rejects with comment -> W(changes_required), rejection_reason set, rejection_count=1
- [ ] User edits W -> W columns updated, review_status stays 'changes_required'
- [ ] User resubmits -> W(pending)
- [ ] Admin approves -> P(amendment=1, is_current=TRUE) created, old P(is_current=FALSE), W archived
- [ ] Public page shows updated P data
- [ ] Old P preserved in amendment history

### Pause + Edit Interaction
- [ ] Pause published listing -> visibility_status='paused', removed from search
- [ ] Start editing (create W) -> W(draft)
- [ ] Submit W -> W(pending)
- [ ] Try to unpause -> BLOCKED ("Cannot unpause while changes are under review")
- [ ] Admin approves -> new P created, W archived
- [ ] Unpause succeeds -> visibility_status='live', in search

### Suspend Flow
- [ ] Admin suspends -> visibility_status='suspended', removed from search
- [ ] User cannot create/edit W
- [ ] Admin unsuspends -> visibility_status='live'
- [ ] User can resume normal operations

### AI Validation
- [ ] Submit with explicit content -> AI rejects -> W stays draft, no state change
- [ ] Submit with bad image -> AI rejects -> W stays draft, photos unchanged
- [ ] Fix content and resubmit -> AI passes -> W(pending)

### Photo/Testimonial Lifecycle
- [ ] Add photo to W -> status='pending_add'
- [ ] Delete live photo from W -> status='pending_delete'
- [ ] Admin approves -> pending_add='live', pending_delete removed, snapshotted in P
- [ ] Admin rejects -> pending_add removed, pending_delete='live' (restored)

### Public Isolation
- [ ] W never appears in public listing page
- [ ] W never appears in search results
- [ ] Only P(is_current=TRUE) with visibility_status='live' shown publicly

### Edge Cases
- [ ] Cannot create two active W for same business (unique index prevents)
- [ ] Deleted business -> W archived, not visible
- [ ] Billing suspended -> listing not in search (even if P exists and visibility_status='live')
- [ ] Amendment history: P rows preserved, queryable by admin

---

## 11) Checklist (Execution Gate)

### Phase 0 — Spec
- [ ] Create `docs/business_logic.md` with full P/W spec
- [ ] Approve spec before any code or DB changes

### Phase 1 — Schema + Backfill
- [ ] Migration: Create `published_listings` table (with `visibility_status` column)
- [ ] Migration: Create `working_listings` table (with location + category columns)
- [ ] Migration: RLS policies for both new tables
- [ ] Migration: Backfill P0 rows from published/paused/suspended+approved businesses (incl location, categories, photos, testimonials snapshots, visibility_status mapped from old status)
- [ ] Migration: Backfill W rows from draft + pending_changes businesses (incl location from business_locations, categories from business_categories)
- [ ] Verify: P count matches expected, W count matches expected
- [ ] Verify: P0 snapshots contain correct location/categories/photos/testimonials
- [ ] Verify: All existing tests pass (no regressions)
- [ ] Push migration to production

### Phase 2 — Dual-Write via Centralized Service
- [ ] Add `PublishedListing`, `WorkingListing` types to types.ts
- [ ] Create `src/lib/pw-service.ts` — single service module for all P/W transitions
- [ ] Wire `pwService.createWorking()` into createBusinessDraft
- [ ] Wire `pwService.updateWorking()` into updateBusiness (text fields)
- [ ] Wire `pwService.updateWorking()` into updateBusinessLocation (location fields)
- [ ] Wire `pwService.updateWorking()` into updateBusinessCategories (category fields)
- [ ] Wire `pwService.submitWorking()` / `pwService.approveWorking()` into publishChanges
- [ ] Wire `pwService.approveWorking()` into adminApproveVerification
- [ ] Wire `pwService.rejectWorking()` into adminRejectVerification
- [ ] Wire `pwService.*` into adminApprovePendingChanges / adminRejectPendingChanges
- [ ] Wire `pwService.setVisibility()` into pauseBusiness / unpauseBusiness (updates current P.visibility_status)
- [ ] Wire `pwService.setVisibility()` into adminSuspendBusiness / adminUnsuspendBusiness
- [ ] Wire `pwService.archiveWorking()` into softDeleteBusiness
- [ ] Write unit tests for pw-service (all transition methods)
- [ ] Write integration tests: create -> edit (text + location + categories) -> submit -> approve -> verify P snapshot
- [ ] Verify: P/W data matches old columns after operations
- [ ] Deploy to production

### Phase 3a — Application Read Switch
- [ ] Update getBusinessBySlug to read from P (ALL public data from P: text, location, categories, photos_snapshot, testimonials_snapshot)
- [ ] Update getMyBusiness to read from W (text, location, categories — all from W)
- [ ] Update getMyBusinesses for command center (P.visibility_status for status badges)
- [ ] Update admin verification queue to read from W
- [ ] Update admin listing detail to show P + W + amendment history
- [ ] Update listing-quality.ts for P/W model (use P.visibility_status, W.review_status)
- [ ] Update eligibility.ts: use P.visibility_status instead of businesses.status
- [ ] Update ListingsCommandCenter.tsx (P.visibility_status for badges, W.review_status for review state)
- [ ] Update dashboard listing page: edit text, location, categories all via W
- [ ] Update updateBusinessLocation to write to W (not business_locations directly)
- [ ] Update updateBusinessCategories to write to W (not business_categories directly)
- [ ] Update photos.ts / testimonials.ts guards: use W.review_status not verification_status
- [ ] Add unpause guard (block if W pending/changes_required)
- [ ] Full regression test suite
- [ ] Deploy to production
- [ ] Validate: all pages render, editing works, admin queue works

### Phase 3b — Search SQL Migration (after 3a validated)
- [ ] Create migration `00046_pw_search_functions.sql` (backward-compatible)
- [ ] Update `is_search_eligible()` — check P.visibility_status + P existence + businesses.billing_status (fall back to old columns if no P)
- [ ] Update `refresh_search_index()` — read ALL data from P (name, description, location, categories, photos) instead of businesses + joins
- [ ] Update `is_business_visible()` — use P.visibility_status
- [ ] Run `refresh_all_search_index()`
- [ ] Verify: search results match before/after
- [ ] Deploy to production
- [ ] Monitor for 1 week

### Phase 4 — Cleanup
- [ ] Migration: Drop old columns from businesses
- [ ] Update Business type in types.ts
- [ ] Remove dual-write code
- [ ] Update operational metrics SQL functions
- [ ] Full regression test suite
- [ ] Deploy to production
