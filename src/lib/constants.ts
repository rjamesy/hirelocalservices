// ─── Application ────────────────────────────────────────────────────

export const APP_NAME = 'HireLocalServices'
export const APP_DESCRIPTION = 'Find trusted local services across Australia'

// ─── Australian States & Territories ────────────────────────────────

export const AU_STATES = [
  { value: 'QLD', label: 'Queensland' },
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'ACT', label: 'Australian Capital Territory' },
] as const

// ─── Search & Radius ───────────────────────────────────────────────

export const RADIUS_OPTIONS = [
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
] as const

// ─── Plan Tiers ─────────────────────────────────────────────────────

export type PlanTier = 'free_trial' | 'basic' | 'premium' | 'premium_annual'

export interface PlanDefinition {
  id: PlanTier
  name: string
  price: number
  interval: string
  priceIdEnvVar: string
  features: string[]
  canUploadPhotos: boolean
  canAddTestimonials: boolean
  maxPhotos: number
  maxTestimonials: number
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    price: 0,
    interval: '30 days',
    priceIdEnvVar: 'STRIPE_PRICE_ID_FREE_TRIAL',
    features: [
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
    ],
    canUploadPhotos: false,
    canAddTestimonials: false,
    maxPhotos: 0,
    maxTestimonials: 0,
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 4,
    interval: 'month',
    priceIdEnvVar: 'STRIPE_PRICE_ID_BASIC',
    features: [
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
    ],
    canUploadPhotos: false,
    canAddTestimonials: false,
    maxPhotos: 0,
    maxTestimonials: 0,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 10,
    interval: 'month',
    priceIdEnvVar: 'STRIPE_PRICE_ID_PREMIUM',
    features: [
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
      'Photo gallery (up to 10 photos)',
      'Customer testimonials (up to 20)',
    ],
    canUploadPhotos: true,
    canAddTestimonials: true,
    maxPhotos: 10,
    maxTestimonials: 20,
  },
  {
    id: 'premium_annual',
    name: 'Annual Premium',
    price: 99,
    interval: 'year',
    priceIdEnvVar: 'STRIPE_PRICE_ID_ANNUAL',
    features: [
      'Professional business profile',
      'Appear in search results',
      'Phone, email, and website links',
      'Custom service area radius',
      'SEO-optimised listing',
      'ABN display',
      'Photo gallery (up to 10 photos)',
      'Customer testimonials (up to 20)',
    ],
    canUploadPhotos: true,
    canAddTestimonials: true,
    maxPhotos: 10,
    maxTestimonials: 20,
  },
]

/** Map a Stripe price ID to the corresponding plan tier. */
export function getPlanByPriceId(priceId: string): PlanDefinition | undefined {
  return PLANS.find(
    (plan) => process.env[plan.priceIdEnvVar] === priceId
  )
}

/** Get a plan definition by tier ID. */
export function getPlanById(tier: PlanTier): PlanDefinition {
  return PLANS.find((p) => p.id === tier) ?? PLANS[1] // default to basic
}

/** All known Stripe price IDs. */
export function getValidPriceIds(): string[] {
  return PLANS.map((plan) => process.env[plan.priceIdEnvVar]).filter(
    (id): id is string => !!id
  )
}

// ─── Limits ─────────────────────────────────────────────────────────

export const MAX_PHOTOS = 10
export const MAX_TESTIMONIALS = 20
export const ITEMS_PER_PAGE = 20

// ─── Grace Period ───────────────────────────────────────────────────

export const GRACE_PERIOD_DAYS = 7
