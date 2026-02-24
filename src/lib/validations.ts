import { z } from 'zod'

// ─── Content Moderation Helpers ─────────────────────────────────────

const SPAM_WORDS = [
  'buy now',
  'click here',
  'free money',
  'act now',
  'limited time',
  'no obligation',
  'winner',
  'congratulations',
  'earn extra cash',
  'work from home',
  'make money fast',
  'double your income',
  'casino',
  'viagra',
  'crypto airdrop',
  'nigerian prince',
  'lottery',
  'guaranteed income',
]

const URL_PATTERN = /https?:\/\/|www\./gi

function containsExcessiveUrls(text: string): boolean {
  const matches = text.match(URL_PATTERN)
  return matches !== null && matches.length > 3
}

function containsSpamWords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return SPAM_WORDS.some((word) => lowerText.includes(word))
}

const moderatedText = (minLen: number, maxLen: number) =>
  z
    .string()
    .min(minLen, `Must be at least ${minLen} characters`)
    .max(maxLen, `Must be at most ${maxLen} characters`)
    .refine((val) => !containsExcessiveUrls(val), {
      message: 'Text contains too many URLs and may be spam',
    })
    .refine((val) => !containsSpamWords(val), {
      message: 'Text contains prohibited content',
    })

// ─── Australian Phone Regex ─────────────────────────────────────────

// Matches: 0X XXXX XXXX, 04XX XXX XXX, (0X) XXXX XXXX, +61 X XXXX XXXX, etc.
const AU_PHONE_REGEX = /^(\+?61|0)[2-478](\s?\d){8}$/

// ─── Australian States ──────────────────────────────────────────────

const AU_STATES = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const

// ─── Schemas ────────────────────────────────────────────────────────

export function createBusinessSchema(maxDescriptionLength: number = 2500) {
  return z.object({
    name: z
      .string()
      .min(2, 'Business name must be at least 2 characters')
      .max(80, 'Business name must be at most 80 characters'),
    phone: z
      .string()
      .regex(AU_PHONE_REGEX, 'Must be a valid Australian phone number')
      .optional()
      .or(z.literal('')),
    website: z
      .string()
      .url('Must be a valid URL')
      .optional()
      .or(z.literal('')),
    email_contact: z
      .string()
      .email('Must be a valid email address')
      .optional()
      .or(z.literal('')),
    description: moderatedText(10, maxDescriptionLength),
    abn: z
      .string()
      .regex(/^\d{11}$/, 'ABN must be exactly 11 digits')
      .optional()
      .or(z.literal('')),
  })
}

export const businessSchema = createBusinessSchema(2500)

export const locationSchema = z.object({
  address_text: z
    .string()
    .max(255, 'Address must be at most 255 characters')
    .optional()
    .or(z.literal('')),
  suburb: z
    .string()
    .min(1, 'Suburb is required')
    .max(100, 'Suburb must be at most 100 characters'),
  state: z.enum(AU_STATES, {
    errorMap: () => ({ message: 'Must be a valid Australian state or territory' }),
  }),
  postcode: z
    .string()
    .regex(/^\d{4}$/, 'Postcode must be exactly 4 digits'),
  service_radius_km: z
    .number()
    .refine((val) => [5, 10, 25, 50].includes(val), {
      message: 'Service radius must be 5, 10, 25, or 50 km',
    })
    .default(25),
})

export const testimonialSchema = z.object({
  author_name: z
    .string()
    .min(2, 'Author name must be at least 2 characters')
    .max(100, 'Author name must be at most 100 characters'),
  text: moderatedText(10, 500),
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
})

export const searchSchema = z.object({
  category: z.string().optional(),
  postcode: z
    .string()
    .regex(/^\d{4}$/, 'Postcode must be exactly 4 digits')
    .optional()
    .or(z.literal('')),
  suburb: z
    .string()
    .max(100)
    .optional()
    .or(z.literal('')),
  radius_km: z
    .number()
    .refine((val) => [5, 10, 25, 50].includes(val), {
      message: 'Radius must be 5, 10, 25, or 50 km',
    })
    .optional()
    .default(25),
  keyword: z
    .string()
    .max(100, 'Search keyword must be at most 100 characters')
    .optional()
    .or(z.literal('')),
  page: z
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .optional(),
})

export const claimSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must be at most 100 characters'),
  phone: z
    .string()
    .regex(AU_PHONE_REGEX, 'Must be a valid Australian phone number')
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  postcode: z
    .string()
    .regex(/^\d{4}$/, 'Postcode must be exactly 4 digits')
    .optional()
    .or(z.literal('')),
})

export const reportSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'fake', 'other'], {
    errorMap: () => ({ message: 'Please select a valid reason' }),
  }),
  details: z
    .string()
    .max(500, 'Details must be at most 500 characters')
    .optional()
    .or(z.literal('')),
})

// ─── Inferred Types ─────────────────────────────────────────────────

export type BusinessFormData = z.infer<typeof businessSchema>
export type LocationFormData = z.infer<typeof locationSchema>
export type TestimonialFormData = z.infer<typeof testimonialSchema>
export type SearchFormData = z.infer<typeof searchSchema>
export type ClaimFormData = z.infer<typeof claimSchema>
export type ReportFormData = z.infer<typeof reportSchema>
