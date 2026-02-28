/**
 * AI description generation + validation for seed candidates.
 *
 * Uses OpenAI to generate professional business descriptions,
 * then validates them with a second call to catch fabrication.
 * Falls back to template if OpenAI fails.
 */

import OpenAI from 'openai'
import { CATEGORY_QUERIES } from './normalizer'

const PROMPT_VERSION = 'v1'
const MODEL = 'gpt-4o-mini'

// Pricing per 1M tokens (gpt-4o-mini as of 2025)
const COST_PER_1M_INPUT = 0.15
const COST_PER_1M_OUTPUT = 0.60

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey })
}

export interface CandidateForAI {
  name: string
  suburb: string
  state: string
  postcode: string
  categories: string[]
  rating: number | null
  user_ratings_total: number | null
  phone_e164: string | null
  website_url: string | null
}

export interface GenerateResult {
  description: string
  source: 'openai' | 'fallback'
  promptVersion: string
  promptTokens: number
  completionTokens: number
}

export interface ValidateResult {
  approved: boolean
  reason: string
  promptTokens: number
  completionTokens: number
}

/**
 * Generate a business description using OpenAI.
 * Returns the description text + token usage.
 */
export async function generateAIDescription(
  candidate: CandidateForAI
): Promise<GenerateResult> {
  const openai = getOpenAI()

  const categoryNames = candidate.categories
    .map((slug) => CATEGORY_QUERIES.find((c) => c.slug === slug)?.name ?? slug)
    .join(', ')

  const ratingInfo = candidate.rating !== null && candidate.user_ratings_total !== null && candidate.user_ratings_total >= 3
    ? `Rated ${candidate.rating}/5 from ${candidate.user_ratings_total} reviews.`
    : ''

  const contactInfo = [
    candidate.phone_e164 ? 'Phone available' : '',
    candidate.website_url ? 'Website available' : '',
  ].filter(Boolean).join('. ')

  const prompt = `Write a professional business listing description for an Australian local services directory.

Business: ${candidate.name}
Location: ${candidate.suburb}, ${candidate.state} ${candidate.postcode}
Services: ${categoryNames}
${ratingInfo ? `Reviews: ${ratingInfo}` : ''}
${contactInfo ? `Contact: ${contactInfo}` : ''}

Rules:
- 1-2 sentences, max 200 characters
- Professional, factual tone
- DO NOT fabricate services, qualifications, years of experience, or specific claims
- DO NOT include phone numbers, URLs, or email addresses in the text
- Only mention what is provided above
- Write in third person`

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.3,
  })

  const description = response.choices[0]?.message?.content?.trim() ?? ''
  const usage = response.usage

  return {
    description,
    source: 'openai',
    promptVersion: PROMPT_VERSION,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  }
}

/**
 * Validate a generated description for fabrication or policy violations.
 * Returns approved/rejected + reason + token usage.
 */
export async function validateDescription(
  candidate: CandidateForAI,
  description: string
): Promise<ValidateResult> {
  const openai = getOpenAI()

  const categoryNames = candidate.categories
    .map((slug) => CATEGORY_QUERIES.find((c) => c.slug === slug)?.name ?? slug)
    .join(', ')

  const prompt = `You are a content reviewer for a business directory. Check if this description is accurate and appropriate.

Business: ${candidate.name}
Location: ${candidate.suburb}, ${candidate.state}
Services: ${categoryNames}
Rating: ${candidate.rating ?? 'unknown'}
Reviews: ${candidate.user_ratings_total ?? 'unknown'}

Description to review:
"${description}"

Check for:
1. Fabricated claims (years in business, specific qualifications, awards)
2. Contains phone numbers, emails, or URLs
3. Inappropriate or offensive content
4. Factual contradictions with provided data
5. Exceeds 200 characters

Reply with EXACTLY one line:
APPROVED
or
REJECTED: <brief reason>`

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 50,
    temperature: 0,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? ''
  const usage = response.usage

  if (text.startsWith('APPROVED')) {
    return {
      approved: true,
      reason: 'passed_validation',
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    }
  }

  const reason = text.replace(/^REJECTED:\s*/i, '').trim() || 'validation_failed'
  return {
    approved: false,
    reason,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  }
}

/**
 * Generate a fallback template description (no AI).
 */
export function generateFallbackDescription(candidate: CandidateForAI): string {
  const categoryNames = candidate.categories
    .map((slug) => CATEGORY_QUERIES.find((c) => c.slug === slug)?.name ?? slug)

  const categoryLabel = categoryNames[0]?.toLowerCase() ?? 'service'
  const location = [candidate.suburb, candidate.state].filter(Boolean).join(', ')

  let desc = `${candidate.name} is a ${categoryLabel} provider`
  if (location) desc += ` located in ${location}`
  desc += '.'

  if (candidate.rating !== null && candidate.user_ratings_total !== null && candidate.user_ratings_total >= 3) {
    desc += ` Rated ${candidate.rating}/5 from ${candidate.user_ratings_total} reviews.`
  }

  if (candidate.phone_e164) {
    desc += ' Contact details available.'
  }

  if (desc.length > 200) {
    desc = desc.slice(0, 197) + '...'
  }

  return desc
}

/**
 * Estimate cost in USD from token counts.
 */
export function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens * COST_PER_1M_INPUT + completionTokens * COST_PER_1M_OUTPUT) / 1_000_000
}

export { PROMPT_VERSION, MODEL }
