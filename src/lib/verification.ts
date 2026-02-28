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

// ─── Explicit Content Keyword Blocklist (high-confidence only) ──────
// Fast pre-filter using word-boundary matching. Primary safety comes
// from AI moderation; this catches obvious explicit content instantly.

export const EXPLICIT_TERMS = [
  'porn', 'pornography', 'nude', 'nudes',
  'sexvideo', 'onlyfans',
  'camgirl', 'webcam sex',
  'brothel', 'sexual services',
  'blowjob', 'handjob', 'anal sex',
  'threesome', 'orgy', 'gangbang',
  'dominatrix', 'bdsm',
  'xxx',
]

// Pre-compiled regex patterns for word-boundary matching
const EXPLICIT_PATTERNS = EXPLICIT_TERMS.map(
  (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
)

/**
 * Check if text contains explicit/adult content terms (word-boundary match).
 * Returns the first matched term or null if clean.
 */
export function checkExplicitContent(text: string): { flagged: boolean; term: string | null } {
  for (let i = 0; i < EXPLICIT_PATTERNS.length; i++) {
    if (EXPLICIT_PATTERNS[i].test(text)) {
      return { flagged: true, term: EXPLICIT_TERMS[i] }
    }
  }
  return { flagged: false, term: null }
}

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

// ─── Image Moderation ──────────────────────────────────────────────

export interface ImageModerationResult {
  safe: boolean
  adult_content: number    // 0.0-1.0
  violence: number         // 0.0-1.0
  self_harm: number        // 0.0-1.0
  reason: string | null
  error_type?: 'content_blocked' | 'verification_unavailable'
}

/**
 * Moderate a batch of image URLs using OpenAI Vision API.
 * Downloads images from Supabase storage, converts to base64, and sends
 * inline to OpenAI to avoid URL-fetch timeouts.
 * Returns per-image results with error_type for caller disambiguation.
 */
export async function moderateImages(
  imageUrls: string[]
): Promise<ImageModerationResult[]> {
  if (imageUrls.length === 0) return []

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return imageUrls.map(() => ({
      safe: false,
      adult_content: 0,
      violence: 0,
      self_harm: 0,
      reason: 'Image verification temporarily unavailable. Please try again.',
      error_type: 'verification_unavailable' as const,
    }))
  }

  const results: ImageModerationResult[] = []

  for (const url of imageUrls) {
    try {
      // 1. Download image bytes from public URL (our server can reach Supabase; OpenAI's can't)
      const dlResponse = await fetch(url)
      if (!dlResponse.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[moderateImages] Download failed', { url, status: dlResponse.status })
        }
        results.push({
          safe: false, adult_content: 0, violence: 0, self_harm: 0,
          reason: 'Image verification temporarily unavailable. Please try again.',
          error_type: 'verification_unavailable',
        })
        continue
      }

      // 2. Convert to base64
      const buffer = Buffer.from(await dlResponse.arrayBuffer())
      const base64 = buffer.toString('base64')
      const mime = dlResponse.headers.get('content-type') || 'image/jpeg'
      const dataUrl = `data:${mime};base64,${base64}`

      // 3. Send to OpenAI with base64 inline
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are a content safety moderator. Evaluate this image ONLY for safety policy violations:
- Nudity or sexual content (especially involving minors)
- Explicit pornographic content
- Graphic violence or gore
- Self-harm or suicide
- Illegal or abusive content

Do NOT consider relevance, quality, professionalism, or suitability for any purpose.

Return a JSON object with:
- adult_content: 0.0-1.0 (nudity, sexual content, pornographic material)
- violence: 0.0-1.0 (graphic violence, gore, disturbing imagery)
- self_harm: 0.0-1.0 (self-harm, suicide imagery)
- safe: boolean (true unless a safety violation is present)
- reason: string or null (brief explanation only if safe=false due to safety violation)`,
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 200,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errBody = await response.text().catch(() => '<unreadable>')
        if (process.env.NODE_ENV === 'development') {
          console.log('[moderateImages] API error', { status: response.status, body: errBody, url })
        }
        results.push({
          safe: false, adult_content: 0, violence: 0, self_harm: 0,
          reason: 'Image verification temporarily unavailable. Please try again.',
          error_type: 'verification_unavailable',
        })
        continue
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        results.push({
          safe: false, adult_content: 0, violence: 0, self_harm: 0,
          reason: 'Image verification temporarily unavailable. Please try again.',
          error_type: 'verification_unavailable',
        })
        continue
      }

      const parsed = JSON.parse(content)
      if (process.env.NODE_ENV === 'development') {
        console.log('[moderateImages] Full response', { url, parsed })
      }

      const result: ImageModerationResult = {
        safe: Boolean(parsed.safe),
        adult_content: Number(parsed.adult_content) || 0,
        violence: Number(parsed.violence) || 0,
        self_harm: Number(parsed.self_harm) || 0,
        reason: parsed.reason ? String(parsed.reason) : null,
      }
      // Sanity check: model says unsafe but all scores near zero → relevance rejection, override
      if (!result.safe && result.adult_content < 0.3 && result.violence < 0.3 && result.self_harm < 0.3) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[moderateImages] Overriding relevance-based rejection', { url, parsed })
        }
        result.safe = true
        result.reason = null
      }
      if (!result.safe) {
        result.error_type = 'content_blocked'
      }
      results.push(result)
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[moderateImages] Exception', { url, error: err instanceof Error ? err.message : err })
      }
      results.push({
        safe: false, adult_content: 0, violence: 0, self_harm: 0,
        reason: 'Image verification temporarily unavailable. Please try again.',
        error_type: 'verification_unavailable',
      })
    }
  }

  return results
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

  // AI-informed rejection: spam or toxic (strict threshold for toxicity)
  if (ai.spam_likelihood >= 0.7 || ai.toxicity >= 0.3) {
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

// ─── Combined Safety Check (reusable for admin approval guard) ──────

export interface SafetyResult {
  safe: boolean
  imageSafe: boolean
  textSafe: boolean
  failedImageUrls: string[]
  flaggedTerms: string[]
}

/**
 * Run combined text + image safety checks.
 * Keyword blocklist runs synchronously (instant). Image moderation calls OpenAI.
 */
export async function runSafetyChecks(
  texts: string[],
  imageUrls: string[]
): Promise<SafetyResult> {
  // 1. Keyword check all texts
  const flaggedTerms: string[] = []
  for (const text of texts) {
    const result = checkExplicitContent(text)
    if (result.flagged && result.term) flaggedTerms.push(result.term)
  }
  // Also check BLOCKED_CATEGORIES on combined text
  const combinedText = texts.join(' ')
  const blockedTerm = checkBlockedCategory(combinedText, null)
  if (blockedTerm) flaggedTerms.push(blockedTerm)

  const textSafe = flaggedTerms.length === 0

  // 2. Image moderation
  const failedImageUrls: string[] = []
  if (imageUrls.length > 0) {
    const imageResults = await moderateImages(imageUrls)
    for (let i = 0; i < imageResults.length; i++) {
      const r = imageResults[i]
      if (!r.safe || r.adult_content >= 0.5 || r.violence >= 0.5) {
        failedImageUrls.push(imageUrls[i])
      }
    }
  }
  const imageSafe = failedImageUrls.length === 0

  return {
    safe: textSafe && imageSafe,
    imageSafe,
    textSafe,
    failedImageUrls,
    flaggedTerms: Array.from(new Set(flaggedTerms)),
  }
}
