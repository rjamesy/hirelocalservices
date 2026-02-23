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
[ ] No application crashes
[ ] No client-side exceptions
[ ] All claim flows complete successfully
[ ] All search flows complete successfully
[ ] All admin flows complete successfully

Listing quality and usefulness
[ ] Seed listings display REAL contact information
[x] No listings display blank contact sections
[x] No fabricated service radius displayed
[x] Listings without known radius display "Service area not specified"

User experience polish
[x] No truncated input fields in search UI
[x] Search layout corrected (search button second row, wider fields)
[x] No misleading validation warning colours
[ ] Button wording consistent and professional ("View Business" not "View Profile")
[ ] Version number visible in footer
[ ] Copyright visible in footer

Admin safety and operational control
[ ] Audit logging enabled for all listing actions
[ ] Claim attempts logged
[ ] Admin suspend functionality operational
[ ] Blacklist enforcement active on listing creation/edit/seed ingestion

Data protection and safety
[ ] Data Reset protected by password confirmation
[ ] Data Reset requires explicit typed confirmation phrase
[ ] Data Reset logged in audit log
[ ] Postcode, categories, and system tables protected from deletion

Deployment readiness
[ ] Production environment variables configured
[ ] Supabase production instance ready
[ ] Backups configured
[ ] Staging environment operational

------------------------------------------------------------
## Launch Blockers (must be resolved before launch)
------------------------------------------------------------

Critical functional blockers
[x] Claim business flow works without error
[x] No blank contact panels on business pages
[ ] No UI elements appearing broken or incomplete
[x] No fabricated service radius displayed
[ ] Search returns accurate location-filtered results

Critical safety blockers
[ ] Data Reset requires password re-authentication
[ ] Audit log recording operational
[ ] Admin suspend listing functionality working

Trust and professionalism blockers
[ ] No placeholder text visible
[ ] No empty UI sections visible
[ ] Footer contains version and copyright

------------------------------------------------------------
## Pre-Launch Polish Fixes (REQUIRED before launch)
------------------------------------------------------------

Search UI improvements
[x] Fix truncated placeholder text
[x] Increase input widths
[x] Move search button to second row
[x] Replace orange validation message with neutral helper text

Business page improvements
[ ] Replace "View Profile" with "View Business"
[x] Hide contact section entirely if no contact exists
[ ] Ensure seed listings display phone where available

Footer improvements
[ ] Add version number display
[ ] Add copyright notice
[ ] Add environment indicator (optional but recommended)

Admin usability improvements
[ ] Add listing type indicator (Seed / Claimed / Premium)
[ ] Add listing confidence score visibility
[ ] Add listing contact completeness indicator

------------------------------------------------------------
## Seeding Tasks
------------------------------------------------------------

Seed coverage requirements
[ ] Minimum 3 listings per suburb per category where businesses exist
[ ] Major cities seeded first
[ ] Regional centres seeded second
[ ] Rural areas seeded third

Seed quality requirements
[ ] Seed listings must have real phone number where available
[ ] Seed listings must never fabricate contact data
[ ] Seed listings must never fabricate service radius
[ ] Seed listings must have confidence score above minimum threshold

Seed management requirements
[ ] Seed listings marked as "Seed"
[ ] Seed listings claimable
[ ] Seed listings remain visible indefinitely
[ ] Seed listings never expire automatically

------------------------------------------------------------
## Database Tasks
------------------------------------------------------------

Supabase production readiness
[ ] Supabase Pro plan activated
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
