/**
 * verification.ts
 *
 * Verification pipeline: deterministic checks + optional AI content review.
 */

import type { DeterministicResults, AIReviewResults, VerificationStatus } from './types'
import { fuzzyNameScore } from './claim-scoring'

// ─── Reuse spam detection constants ─────────────────────────────────

const SPAM_WORDS = [
  'buy now', 'click here', 'free money', 'act now', 'limited time',
  'no obligation', 'winner', 'congratulations', 'earn extra cash',
  'work from home', 'make money fast', 'double your income',
  'casino', 'viagra', 'crypto airdrop', 'nigerian prince',
  'lottery', 'guaranteed income',
]

const URL_PATTERN = /https?:\/\/|www\./gi

// ─── Blocked Business Categories ────────────────────────────────────

export const BLOCKED_CATEGORIES = [
  'escort', 'escorts', 'adult services', 'adult entertainment',
  'strip club', 'gentleman club', 'gentlemens club',
  'massage parlour', 'happy ending', 'brothel',
  'sex worker', 'sex work', 'erotic', 'xxx',
  'adult shop', 'adult store', 'sex shop',
  'retail only', 'retail store', 'department store',
  'supermarket', 'grocery store', 'convenience store',
  'petrol station', 'gas station', 'bottle shop',
  'liquor store', 'tobacconist', 'vape shop',
]

/**
 * Check if a business name or description contains blocked category terms.
 * Returns the matched term or null if clean.
 */
export function checkBlockedCategory(
  name: string,
  description: string | null
): string | null {
  const text = `${name} ${description || ''}`.toLowerCase()
  for (const term of BLOCKED_CATEGORIES) {
    if (text.includes(term)) return term
  }
  return null
}

// ─── Haversine (inline, same as claim-scoring) ──────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Spam Score ─────────────────────────────────────────────────────

export function calculateSpamScore(
  name: string,
  description: string | null
): number {
  let score = 0
  const text = `${name} ${description || ''}`.toLowerCase()

  // Spam words: +0.15 each
  for (const word of SPAM_WORDS) {
    if (text.includes(word)) score += 0.15
  }

  // URLs beyond 1: +0.1 each
  const urlMatches = (description || '').match(URL_PATTERN)
  if (urlMatches && urlMatches.length > 1) {
    score += (urlMatches.length - 1) * 0.1
  }

  // Short description: +0.2
  if (description && description.length < 20) {
    score += 0.2
  }

  // All caps name: +0.1
  if (name === name.toUpperCase() && name.length > 3) {
    score += 0.1
  }

  return Math.min(score, 1.0)
}

// ─── Duplicate Score ────────────────────────────────────────────────

interface ExistingBusiness {
  name: string
  lat: number | null
  lng: number | null
}

export function calculateDuplicateScore(
  name: string,
  lat: number | null,
  lng: number | null,
  existingBusinesses: ExistingBusiness[]
): number {
  let maxScore = 0

  for (const existing of existingBusinesses) {
    const nameMatch = fuzzyNameScore(name, existing.name)

    let proximityScore = 0
    if (lat != null && lng != null && existing.lat != null && existing.lng != null) {
      const dist = haversineKm(lat, lng, existing.lat, existing.lng)
      proximityScore = dist < 1 ? 1.0 : dist < 5 ? 0.7 : dist < 10 ? 0.3 : 0
    }

    // Combined: high name match + close proximity = likely duplicate
    const combined = nameMatch * 0.6 + proximityScore * 0.4
    maxScore = Math.max(maxScore, combined)
  }

  return maxScore
}

// ─── Format Validation ──────────────────────────────────────────────

const AU_PHONE_REGEX = /^(\+?61|0)[2-478](\s?\d){8}$/

export function validatePhoneFormat(phone: string | null): boolean | null {
  if (!phone) return null
  return AU_PHONE_REGEX.test(phone.trim())
}

export function validateEmailFormat(email: string | null): boolean | null {
  if (!email) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ─── Deterministic Checks ───────────────────────────────────────────

interface BusinessForVerification {
  name: string
  description: string | null
  phone: string | null
  email: string | null
  lat: number | null
  lng: number | null
}

export function runDeterministicChecks(
  business: BusinessForVerification,
  existingBusinesses: ExistingBusiness[]
): DeterministicResults & { pass: boolean } {
  const spamScore = calculateSpamScore(business.name, business.description)
  const duplicateScore = calculateDuplicateScore(
    business.name,
    business.lat,
    business.lng,
    existingBusinesses
  )
  const phoneValid = validatePhoneFormat(business.phone)
  const emailValid = validateEmailFormat(business.email)

  // Check for blocked categories (adult, escort, retail)
  const blockedTerm = checkBlockedCategory(business.name, business.description)

  const pass = spamScore < 0.5 && duplicateScore < 0.8 && !blockedTerm

  return {
    spam_score: Math.round(spamScore * 100) / 100,
    duplicate_score: Math.round(duplicateScore * 100) / 100,
    phone_valid: phoneValid,
    email_valid: emailValid,
    pass,
  }
}

// ─── AI Content Review ──────────────────────────────────────────────

export async function runAIContentReview(
  business: BusinessForVerification
): Promise<AIReviewResults | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const prompt = `You are a content moderation system for an Australian local services directory.
This directory is ONLY for local trade and service businesses (plumbers, electricians, cleaners, builders, landscapers, etc.).

REJECT (set is_blocked_category=true) these types of businesses:
- Adult services, escorts, strip clubs, brothels, erotic services
- Retail-only stores (supermarkets, department stores, bottle shops, petrol stations)
- Any business that is not a local trade or service provider

Analyze this business listing and return a JSON object with:
- spam_likelihood: 0.0-1.0 (how likely this is spam/fake)
- toxicity: 0.0-1.0 (offensive/inappropriate content)
- real_business: 0.0-1.0 (how likely this is a real, legitimate local service business)
- is_blocked_category: boolean (true if adult/escort/retail/non-service business)
- blocked_reason: string or null (reason if blocked)
- summary: one sentence explanation

Business Name: ${business.name}
Description: ${business.description || 'N/A'}
Phone: ${business.phone || 'N/A'}
Email: ${business.email || 'N/A'}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) return null

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    return {
      spam_likelihood: Number(parsed.spam_likelihood) || 0,
      toxicity: Number(parsed.toxicity) || 0,
      real_business: Number(parsed.real_business) || 0.5,
      is_blocked_category: Boolean(parsed.is_blocked_category),
      blocked_reason: parsed.blocked_reason ? String(parsed.blocked_reason) : null,
      summary: String(parsed.summary || ''),
    }
  } catch {
    // Graceful degradation: if call fails, return null
    return null
  }
}

// ─── Decision Engine ────────────────────────────────────────────────

export function makeVerificationDecision(
  deterministic: DeterministicResults,
  ai: AIReviewResults | null,
  businessName?: string,
  businessDescription?: string | null
): Extract<VerificationStatus, 'approved' | 'pending' | 'rejected'> {
  // Hard reject: blocked category (adult, escort, retail)
  if (businessName) {
    const blockedTerm = checkBlockedCategory(businessName, businessDescription ?? null)
    if (blockedTerm) return 'rejected'
  }

  // Hard reject: high spam or near-exact duplicate
  if (deterministic.spam_score >= 0.7 || deterministic.duplicate_score >= 0.9) {
    return 'rejected'
  }

  // No AI available: use deterministic only
  if (!ai) {
    return deterministic.pass ? 'approved' : 'pending'
  }

  // AI-informed rejection: blocked category
  if (ai.is_blocked_category) {
    return 'rejected'
  }

  // AI-informed rejection: spam or toxic
  if (ai.spam_likelihood >= 0.7 || ai.toxicity >= 0.5) {
    return 'rejected'
  }
  if (ai.real_business < 0.3) {
    return 'rejected'
  }

  // All checks pass
  if (deterministic.pass && ai.spam_likelihood < 0.3 && ai.real_business >= 0.6) {
    return 'approved'
  }

  // Edge cases: keep pending for admin review
  return 'pending'
}
