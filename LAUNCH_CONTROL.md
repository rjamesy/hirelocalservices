# LAUNCH_CONTROL.md

Launch readiness checklist and operational control for HireLocalServices.

This document defines what MUST be completed before production launch and what may be completed post-launch.

Status indicators:
[ ] Not started
[~] In progress
[x] Complete

------------------------------------------------------------
## Go-Live Gates (MUST be complete before launch)
------------------------------------------------------------

Platform stability
[x] No application crashes
[x] No client-side exceptions
[x] All claim flows complete successfully
[x] All search flows complete successfully
[x] All admin flows complete successfully
[x] No blank pages or white-screen errors
[x] Defensive rendering implemented for all listing fields

Listing quality and usefulness
[x] Seed listings display REAL contact information where available
[x] No listings display blank contact sections
[x] Listings without contact info display clear message ("Contact details not available")
[x] No fabricated service radius displayed
[x] Listings without known radius display "Service area not specified"
[x] Search results always display useful information (never useless placeholder entries)

User experience polish
[x] No truncated input fields in search UI
[x] Search layout corrected (search button second row, aligned under radius)
[x] No misleading validation warning colours
[x] Validation colours follow rules:
    - Grey = neutral helper text
    - Amber = incomplete selection
    - Red = validation failure
[x] Button wording consistent and professional ("View Business")
[x] No placeholder text visible anywhere in production UI
[x] No empty or broken UI sections visible
[x] Version number visible in footer (read dynamically from package.json)
[x] Copyright visible in footer
[x] Footer visible on all pages (public, dashboard, admin)

Admin safety and operational control
[x] Audit logging enabled for all listing actions
[x] Claim attempts logged
[x] Admin suspend functionality operational
[x] Blacklist enforcement active on listing creation/edit/seed ingestion
[x] Admin routes protected (admin-only access enforced)
[x] Admin login redirects correctly back to admin pages

Data protection and safety
[x] Data Reset protected by password confirmation
[x] Data Reset requires explicit typed confirmation phrase ("danger reset data")
[x] Data Reset logged in audit log
[x] Postcode, categories, and system tables protected from deletion
[x] Seed listings protected from accidental deletion (soft delete only)

Deployment readiness
[x] Production environment variables configured
[x] Supabase production instance ready
[x] Backups configured (daily pg_dump to EC2, 30-day retention)
[ ] Staging environment operational
[x] Production build completes without errors
[x] Production server starts successfully

------------------------------------------------------------
## Launch Blockers (must be resolved before launch)
------------------------------------------------------------

Critical functional blockers
[x] Claim business flow works without error
[x] No blank contact panels on business pages
[x] No UI elements appearing broken or incomplete
[x] No fabricated service radius displayed
[x] Search returns accurate location-filtered results
[x] Search never returns incorrect geographic results
[x] Location selection validation working correctly

Critical safety blockers
[x] Data Reset requires password re-authentication
[x] Audit log recording operational
[x] Admin suspend listing functionality working
[x] Admin access protection working correctly

Trust and professionalism blockers
[x] No placeholder text visible
[x] No empty UI sections visible
[x] Footer contains version and copyright
[x] Listing cards always display useful information

------------------------------------------------------------
## Pre-Launch Polish Fixes (REQUIRED before launch)
------------------------------------------------------------

Search UI improvements
[x] Fix truncated placeholder text
[x] Increase input widths
[x] Move search button to second row (completed structure)
[x] Align search button under radius field exactly
[x] Replace orange validation message with neutral helper text
[x] Ensure container width balanced and professional

Business page improvements
[x] Replace "View Profile" with "View Business"
[x] Ensure contact section never appears broken
[x] Display contact info where available
[x] Display fallback message when unavailable
[x] Defensive rendering for all listing fields

Footer improvements
[x] Add version number display (dynamic)
[x] Add copyright notice
[x] Ensure footer appears globally

Admin usability improvements
[x] Add listing type indicator (Seed / Claimed / User-Created)
[ ] Add listing confidence score visibility
[ ] Add listing contact completeness indicator
[x] Admin redirect logic working correctly

------------------------------------------------------------
## Seeding Tasks (CRITICAL FOR PLATFORM USEFULNESS)
------------------------------------------------------------

Seed coverage requirements
[ ] Minimum 3 listings per suburb per category where businesses exist
[ ] Major cities seeded first
[ ] Regional centres seeded second
[ ] Rural areas seeded third
[ ] No populated suburb returns empty results where data exists

Seed quality requirements
[ ] Seed listings must have real phone number where available
[ ] Seed listings must never fabricate contact data
[ ] Seed listings must never fabricate service radius
[ ] Seed listings must have confidence score above minimum threshold
[ ] Seed listings must display real useful information

Seed management requirements
[x] Seed listings marked as "Seed"
[x] Seed listings claimable
[x] Seed listings remain visible indefinitely (seed_expiry_enabled defaults to false)
[ ] Seed listings never expire automatically

------------------------------------------------------------
## Database Tasks
------------------------------------------------------------

Supabase production readiness
[ ] Supabase Pro plan activated (when required)
[x] Row-level security policies verified
[x] Indexes verified for performance
[x] Backups configured (daily pg_dump, 30-day retention, restore tested)

Performance readiness
[x] Search queries indexed
[x] Location lookup indexed
[x] Listing lookup indexed

Data integrity
[x] Duplicate listing prevention rules active (unique seed_source index + slug collision handling)
[x] Claim ownership correctly assigns ownership
[x] Listing status properly tracked

------------------------------------------------------------
## SEO Tasks
------------------------------------------------------------

Technical SEO
[x] sitemap.xml operational
[x] robots.txt operational
[x] canonical URLs implemented (metadataBase + alternates.canonical)

Page SEO
[x] Each business has unique URL (/business/[slug])
[x] Each business has unique title tag
[x] Each business has meta description

Indexability
[x] Search pages crawlable
[x] Business pages crawlable

------------------------------------------------------------
## Deployment Tasks
------------------------------------------------------------

Infrastructure readiness
[x] Production server provisioned (AWS EC2)
[ ] Staging server provisioned
[ ] Blue/Green deployment ready

Security readiness
[x] HTTPS enabled (Let's Encrypt SSL)
[x] Secure environment variables configured
[x] Supabase keys secured

Operational readiness
[x] Admin account secured
[x] Backup procedures documented (daily cron at 2am UTC, /home/ubuntu/backups/)
[x] Recovery procedures documented (restore_test.sh, zcat backup.sql.gz | psql)

------------------------------------------------------------
## Phase 4: Operational Hardening
------------------------------------------------------------

Error monitoring
[ ] Sentry DSN configured in production
[ ] Server-side errors captured in Sentry
[ ] Client-side errors captured in Sentry
[x] Global error boundary present (global-error.tsx)
[x] PII scrubbed from error payloads

System alerts
[x] system_alerts table deployed
[x] Circuit breaker creates system_alert on trigger
[x] Admin notified (in-app) when circuit breaker fires
[x] Alerts tab in admin system page

Protection verification
[x] Circuit breaker verified (auto-disables registrations)
[x] Kill switch verified (admin can disable registrations)
[x] Maintenance mode verified (admin never locked out)
[x] Admin can preview public pages during maintenance
[x] /login and /api/auth bypass maintenance mode

Performance and DB
[x] billing_status index added
[x] Search uses materialized index (no N+1)
[x] Core query index usage verified (verify-indexes.sql)

Soft launch mode
[x] soft_launch_mode flag in system_flags
[x] Soft launch forces listings_require_approval
[x] User-facing banner when soft launch active
[x] Admin toggle for soft launch mode

Abuse simulation
[x] Registration flood script (rate limit verified)
[x] Login flood script (rate limit verified)
[x] Invalid upload rejection verified
[x] Abuse simulation Playwright tests created

------------------------------------------------------------
## Test Coverage
------------------------------------------------------------

[x] 1189 unit tests passing (64 test files) — Vitest
[x] 92 E2E tests covering all admin pages — Playwright
[x] Middleware auth/redirect tests verified
[x] Admin route protection tests verified
[x] Search safety input validation tested
[x] Claim flow error handling tested

------------------------------------------------------------
## Launch Quality Standard (NON-NEGOTIABLE)
------------------------------------------------------------

The platform must present as:

- Stable
- Professional
- Trustworthy
- Fully functional
- Useful to users immediately

Launch is permitted ONLY when:

- No broken UI exists
- No incomplete workflows exist
- Seed listings provide real user value
- All critical safety protections are active

No exceptions.
