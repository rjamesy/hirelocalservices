# PROJECT_MEMORY.md

Permanent architectural decisions and platform policies for HireLocalServices.

## Platform Purpose

HireLocalServices is a national directory of local service businesses in Australia. The primary goal is to allow users to quickly find real, contactable businesses in their local area. The platform must always prioritise usefulness to the user.

## Seed Listing Policy

Seed listings are permitted and required to ensure directory usefulness. Seed listings MUST display real contact information such as business name, suburb, and phone number where available. Seed listings must never fabricate contact data.

## Seed Coverage Policy

The platform must ensure minimum coverage across all Australian suburbs. Target minimum is 3 listings per suburb per major service category where businesses exist.

## Confidence Scoring Policy

Seed listings must be selected based on confidence score derived from data reliability. Only listings above minimum confidence threshold may be seeded.

## Claim and Ownership Policy

Seed listings may be claimed by legitimate business owners. Claiming assigns ownership and unlocks enhanced listing features.

## Subscription and Listing Limits Policy

Accounts may have listing limits enforced by subscription tier. Duplicate listings for the same business must be prevented.

## Contact Information Policy

Seed listings must display real contact information if publicly available. Contact information must never be fabricated or guessed.

## Service Radius Policy

Service radius must not be fabricated. If unknown, display "Service area not specified."

## Moderation and AI Verification Policy

All listings must pass AI moderation and validation to prevent spam, abuse, and prohibited content.

## Admin Control Requirements

Admin must have full ability to suspend, edit, or remove listings and view audit history.

## Database and Supabase Requirements

Production deployment requires Supabase Pro plan or higher to support required data volume and reliability.

## Seeding Rollout Plan (Australia)

Seeding must be performed in priority order: major cities, regional centres, then rural areas.

## Launch Quality Standard

The platform must present as professional, trustworthy, and fully functional. No broken UI, blank data areas, or incomplete user flows may exist at launch.
