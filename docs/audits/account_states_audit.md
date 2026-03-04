# Account States — Verified Matrix

## Matrix Under Test

| Account State | Can Login | Can Edit Draft | Can Publish | Listings Visible | Notes |
|---|---|---|---|---|---|
| Active | ✅ | ✅ | Depends on subscription | Depends on listing state | Normal state |
| Suspended (admin) | ✅ | ❌ | ❌ | ❌ | Redirect to suspension screen |
| Deleted | ❌ | ❌ | ❌ | ❌ | Email blacklisted |

---

## Verified Matrix

| Account State | Can Login | Can Edit Draft | Can Publish | Listings Visible | Notes | Verdict |
|---|---|---|---|---|---|---|
| **Active** | ✅ | ✅ | Depends on subscription | Depends on listing state | Normal state | ✅ |
| **Suspended (admin)** | ✅ | ❌ | ❌ | ❌ | Redirect to suspension screen | ✅ |
| **Deleted** | ❌ | ❌ | ❌ | ❌ | Email blacklisted | ⚠️ |

**Mismatches: 0 ❌ · Ambiguous: 1 ⚠️**

---

## Row-by-Row Verification

### Row 1: Active

| Column | Matrix Says | Code Does | Verdict |
|---|---|---|---|
| Can Login | ✅ | Middleware (`src/middleware.ts:108-114`) requires auth session for `/dashboard`. No suspension check blocks active users. | ✅ |
| Can Edit Draft | ✅ | `updateBusiness()` (`src/app/actions/business.ts:202-339`) checks ownership + edit guard (underReview blocks). No subscription check for editing. `updateBusinessLocation()` (line 341) and `updateBusinessCategories()` (line 487) same pattern. | ✅ |
| Can Publish | Depends on subscription | `publishChanges()` (`src/app/actions/business.ts:582-604`) calls `getUserEntitlements()` → `computeCheckoutGate()` → `checkPlanSufficiency()`. No subscription → `SUBSCRIPTION_REQUIRED`. Wrong tier → `UPGRADE_REQUIRED`. Correct tier → proceeds. | ✅ |
| Listings Visible | Depends on listing state | `getListingEligibility()` (`src/lib/search/eligibility.ts:78-95`) requires: `visibility_status='live'`, P row exists, `billing_status` in `['active','trial','seed']`, `deleted_at IS NULL`, not suspended, and `ownerActive` (subscription active). `is_search_eligible()` RPC (`migration 00049:20-51`) checks `status NOT IN ('suspended','paused')`, `deleted_at IS NULL`, `billing_status` active. | ✅ |
| Notes | Normal state | Correct — no special UI treatment. | ✅ |

### Row 2: Suspended (admin)

| Column | Matrix Says | Code Does | Verdict |
|---|---|---|---|
| Can Login | ✅ | Middleware (`src/middleware.ts:116-129`) checks `profiles.suspended_at`. If set: POST requests → 403, page requests → pass through to layout. Dashboard layout (`src/app/dashboard/layout.tsx:72-118`) renders `SuspensionNotice` instead of dashboard. User CAN authenticate, sees suspension screen. | ✅ |
| Can Edit Draft | ❌ | Middleware returns 403 for all POST requests to `/dashboard/*` when `suspended_at` is set (line 125-126). Server actions (edit, update, etc.) are all POST requests, so they are all blocked. | ✅ |
| Can Publish | ❌ | Double-blocked: (1) Middleware 403 on POST, (2) `publishChanges()` defense-in-depth check (`business.ts:555-562`) queries `profiles.suspended_at` and returns error. | ✅ |
| Listings Visible | ❌ | `internalSuspendAccount()` (`admin-accounts.ts:441-544`) suspends ALL published listings: sets `businesses.status='suspended'`, refreshes search index. `is_search_eligible()` rejects `status IN ('suspended')`. `getListingEligibility()` checks `visibility_status !== 'suspended'`. Also cancels Stripe subscription → `ownerActive=false`. | ✅ |
| Notes | Redirect to suspension screen | Dashboard layout (`layout.tsx:72-118`) renders red warning icon, suspension reason, support email link, and sign-out button. | ✅ |

### Row 3: Deleted

| Column | Matrix Says | Code Does | Verdict |
|---|---|---|---|
| Can Login | ❌ | ⚠️ **AMBIGUOUS** — see TODO #1 below | ⚠️ |
| Can Edit Draft | ❌ | `deleteMyAccount()` (`account.ts:145-159`) sets ALL businesses `status='deleted'`, hard-deletes all working listings. No drafts remain to edit. Middleware 403 blocks POST anyway (profile has `suspended_at`). | ✅ |
| Can Publish | ❌ | No listings exist to publish. Middleware blocks POST. `publishChanges()` suspension check would also block. | ✅ |
| Listings Visible | ❌ | All businesses set to `status='deleted'` + `deleted_at=NOW()`. Search index refreshed per business. `is_search_eligible()` rejects `deleted_at IS NOT NULL`. `getListingEligibility()` checks `notDeleted = biz.deleted_at === null`. | ✅ |
| Notes | Email blacklisted | `deleteMyAccount()` (lines 119-122, 170-175) blacklists email via `blacklist_on_delete()` RPC. `checkRegistrationAllowed()` (`auth.ts:43-58`) calls `is_blacklisted(email, 'email')` → blocks re-registration. Also blacklists phone, website, ABN from all businesses. | ✅ |

---

## TODO #1 (⚠️): Deleted users CAN still authenticate

**What the matrix says:** Deleted → Can Login: ❌

**What the code actually does:**
1. `deleteMyAccount()` (`account.ts:194-195`) calls `supabase.auth.signOut()` — ends current session
2. But the `auth.users` row is NEVER deleted (no `auth.admin.deleteUser()` call anywhere in codebase — verified via grep)
3. `checkLoginAllowed()` (`auth.ts:71-101`) only checks rate limiting + captcha — does NOT check suspension or blacklist
4. A deleted user CAN call `supabase.auth.signInWithPassword()` and authenticate successfully
5. After login, middleware detects `suspended_at` → shows SuspensionNotice (same as admin suspension)

**Net effect:** Deleted users can technically log in and see the suspension screen with reason "Account self-deleted". They cannot do anything beyond that (all POST blocked, no listings exist). Re-registration with a NEW account using the same email IS blocked by the blacklist.

**Risk level:** LOW — The user sees a dead-end suspension screen. No data access, no actions possible. But the matrix says "Can Login: ❌" which is technically inaccurate.

**Two options (for your decision):**

**Option A: Accept as-is** — The behavior is functionally correct (user can't do anything). "Can Login" is effectively ❌ because the suspension screen is all they see. No code change needed.

**Option B: Block authentication for deleted users** — Add an email blacklist check to `checkLoginAllowed()` so deleted users get "This account has been deleted" before the Supabase auth call. This makes the code match the matrix exactly.

```
File: src/app/actions/auth.ts → checkLoginAllowed()
Change: After rate limit check, add: query is_blacklisted(email, 'email') → if blocked, return { allowed: false, error: 'This account has been deleted.' }
Caveat: checkLoginAllowed() currently doesn't receive the email parameter — signature would need to change.
```

---

## Summary

| Metric | Count |
|---|---|
| ✅ Matches code | 14 of 15 cells |
| ❌ Does not match | 0 |
| ⚠️ Ambiguous | 1 (Deleted → Can Login) |
| Launch blockers | 0 (the ⚠️ is low-risk) |

### Code-to-Matrix File Map

| Rule | Primary File(s) | Key Lines |
|---|---|---|
| Login gate | `src/middleware.ts` | 108-130 |
| Suspension screen | `src/app/dashboard/layout.tsx` | 72-118 |
| Edit guard (review) | `src/lib/pw-service.ts` | 589-614 |
| Edit actions | `src/app/actions/business.ts` | 202-339, 341-485, 487-549 |
| Publish guard | `src/app/actions/business.ts` | 551-604 |
| Search eligibility (TS) | `src/lib/search/eligibility.ts` | 78-95 |
| Search eligibility (SQL) | `migrations/00049_subscription_lifecycle.sql` | 20-51 |
| Account deletion | `src/app/actions/account.ts` | 82-199 |
| Email blacklist check | `src/app/actions/auth.ts` | 43-58 |
| Login pre-check | `src/app/actions/auth.ts` | 71-101 |
| Admin suspend | `src/app/actions/admin-accounts.ts` | 441-544 |
| Admin unsuspend | `src/app/actions/admin-accounts.ts` | 549-593 |
