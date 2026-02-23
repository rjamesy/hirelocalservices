# HireLocalServices

Australian local services directory where micro businesses can create a profile and be discoverable by users searching by location, category, and radius.

**Live domain:** hirelocalservices.com.au

## Tech Stack

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend:** Supabase (Auth, Postgres, Storage), PostGIS
- **Payments:** Stripe (subscriptions)
- **Deployment:** Vercel (or self-hosted on AWS EC2)

## Project Structure

```
src/
├── app/
│   ├── actions/          # Server actions (business, search, photos, testimonials, report, admin)
│   ├── api/
│   │   ├── stripe/       # Stripe checkout, webhook, portal routes
│   │   └── sitemap.xml/  # Dynamic sitemap
│   ├── admin/            # Admin dashboard, listings, reports
│   ├── auth/             # Auth callback, signout
│   ├── business/[slug]/  # Public business profile
│   ├── dashboard/        # Business owner portal (listing, photos, testimonials, billing)
│   ├── [state]/[category]/ # SEO landing pages
│   ├── login/            # Login page
│   ├── signup/           # Signup page
│   ├── search/           # Search results
│   ├── pricing/          # Pricing page
│   ├── terms/            # Terms of Service
│   ├── privacy/          # Privacy Policy
│   └── disclaimer/       # Disclaimer
├── components/           # Shared UI components
├── lib/
│   ├── supabase/         # Supabase clients (browser, server, admin, middleware)
│   ├── stripe.ts         # Stripe client
│   ├── types.ts          # TypeScript types
│   ├── validations.ts    # Zod schemas
│   ├── constants.ts      # App constants
│   └── utils.ts          # Utility functions
└── middleware.ts          # Auth middleware
supabase/
└── migrations/           # SQL migrations (PostGIS, tables, RLS, seeds, functions)
```

## Environment Variables

Create a `.env.local` file (see `.env.example`):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=HireLocalServices
```

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy your URL and keys
3. Fill in `.env.local` with your Supabase credentials
4. Run the SQL migrations in order in the **SQL Editor**:
   - `supabase/migrations/00001_enable_postgis.sql`
   - `supabase/migrations/00002_create_tables.sql`
   - `supabase/migrations/00003_rls_policies.sql`
   - `supabase/migrations/00004_seed_categories.sql`
   - `supabase/migrations/00005_seed_postcodes.sql`
   - `supabase/migrations/00006_search_function.sql`
   - `supabase/migrations/00007_auth_trigger.sql`
5. Create a **Storage bucket** named `photos` (public bucket)
6. Enable **PostGIS** extension in Database > Extensions (should be done by migration 00001)

### 3. Set up Stripe

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create a Product with a recurring price of $4/month
3. Copy the Price ID (starts with `price_`)
4. Set up a webhook endpoint (for local dev, use Stripe CLI):
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
5. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Create an admin user

1. Sign up via the app
2. In Supabase SQL Editor, run:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set all environment variables
4. Deploy

Set `NEXT_PUBLIC_APP_URL` to your production domain.

### AWS EC2 (Self-hosted)

Server: `54.153.199.73` (Ubuntu)

```bash
# SSH in
ssh -i hirelocalservices.pem ubuntu@54.153.199.73

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone <your-repo> /opt/hirelocalservices
cd /opt/hirelocalservices
npm install
npm run build

# Run with PM2
sudo npm install -g pm2
pm2 start npm --name "hls" -- start
pm2 save
pm2 startup

# Set up Nginx reverse proxy (optional)
sudo apt install nginx
# Configure /etc/nginx/sites-available/default to proxy_pass to localhost:3000
```

### Stripe Webhook (Production)

Set up webhook endpoint in Stripe Dashboard:
- URL: `https://hirelocalservices.com.au/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Full AU Postcodes

The seed data includes ~70 major postcodes. For production, import the full Australian postcode dataset:
1. Download from [Australia Post](https://auspost.com.au) or [Matthew Proctor's dataset](https://www.matthewproctor.com/australian_postcodes)
2. Import into the `postcodes` table with columns: postcode, suburb, state, lat, lng

## Key Features

- **Public Directory:** Search by category, location (suburb/postcode), radius (5-50km), keyword
- **Business Profiles:** Description, services, photos (up to 10), testimonials, contact info
- **Subscription Billing:** $4/month via Stripe, listing visible only while subscription active
- **Geo Search:** PostGIS-powered radius queries with ST_DWithin, ordered by distance
- **SEO Pages:** Server-rendered `/[state]/[category]` and `/[state]/[category]/[location]` pages
- **Admin Dashboard:** View listings, manage reports, suspend/unsuspend businesses
- **Content Moderation:** Spam detection, report system, rate limiting

## Phase 2 Roadmap

- [ ] **Verified Reviews:** Allow real customers to leave verified reviews (email verification)
- [ ] **Business Verification:** ABN lookup verification, identity verification
- [ ] **In-app Messaging:** Secure messaging between customers and businesses
- [ ] **Lead Notifications:** Email/SMS notifications when customers contact a business
- [ ] **Quote Requests:** Allow customers to request quotes from multiple businesses
- [ ] **Enhanced Analytics:** Dashboard analytics (profile views, clicks, search impressions)
- [ ] **Multiple Locations:** Support businesses with multiple service locations
- [ ] **Premium Plans:** Tiered plans with featured listings, priority placement
- [ ] **Photo Verification:** AI-powered photo moderation
- [ ] **Mobile App:** React Native or PWA mobile app
- [ ] **Social Proof:** Integration with Google Reviews, Facebook ratings
- [ ] **Service Area Maps:** Visual map showing service coverage
- [ ] **Availability Calendar:** Business availability/booking calendar
- [ ] **Invoice Generation:** Simple invoice generation for businesses
- [ ] **Referral Program:** Business referral rewards
