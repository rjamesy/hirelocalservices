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
[ ] Audit logging enabled for all listing actions
[ ] Claim attempts logged
[ ] Admin suspend functionality operational
[ ] Blacklist enforcement active on listing creation/edit/seed ingestion
[x] Admin routes protected (admin-only access enforced)
[x] Admin login redirects correctly back to admin pages

Data protection and safety
[ ] Data Reset protected by password confirmation
[ ] Data Reset requires explicit typed confirmation phrase ("danger reset data")
[ ] Data Reset logged in audit log
[ ] Postcode, categories, and system tables protected from deletion
[ ] Seed listings protected from accidental deletion

Deployment readiness
[ ] Production environment variables configured
[ ] Supabase production instance ready
[ ] Backups configured
[ ] Staging environment operational
[x] Production build completes without errors
[ ] Production server starts successfully

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
[ ] Data Reset requires password re-authentication
[ ] Audit log recording operational
[ ] Admin suspend listing functionality working
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
[ ] Add listing type indicator (Seed / Claimed / Premium)
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
[ ] Seed listings marked as "Seed"
[ ] Seed listings claimable
[ ] Seed listings remain visible indefinitely
[ ] Seed listings never expire automatically

------------------------------------------------------------
## Database Tasks
------------------------------------------------------------

Supabase production readiness
[ ] Supabase Pro plan activated (when required)
[ ] Row-level security policies verified
[ ] Indexes verified for performance
[ ] Backups configured

Performance readiness
[ ] Search queries indexed
[ ] Location lookup indexed
[ ] Listing lookup indexed

Data integrity
[ ] Duplicate listing prevention rules active
[ ] Claim ownership correctly assigns ownership
[ ] Listing status properly tracked

------------------------------------------------------------
## SEO Tasks
------------------------------------------------------------

Technical SEO
[ ] sitemap.xml operational
[ ] robots.txt operational
[ ] canonical URLs implemented

Page SEO
[ ] Each business has unique URL
[ ] Each business has unique title tag
[ ] Each business has meta description

Indexability
[ ] Search pages crawlable
[ ] Business pages crawlable

------------------------------------------------------------
## Deployment Tasks
------------------------------------------------------------

Infrastructure readiness
[ ] Production server provisioned
[ ] Staging server provisioned
[ ] Blue/Green deployment ready

Security readiness
[ ] HTTPS enabled
[ ] Secure environment variables configured
[ ] Supabase keys secured

Operational readiness
[ ] Admin account secured
[ ] Backup procedures documented
[ ] Recovery procedures documented

------------------------------------------------------------
## Test Coverage
------------------------------------------------------------

[x] 1018 unit tests passing (49 test files) — Vitest
[x] 10 E2E smoke tests passing — Playwright
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
