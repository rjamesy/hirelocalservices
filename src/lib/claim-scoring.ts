/**
 * claim-scoring.ts
 *
 * Pure functions for scoring business claim matches.
 * No external dependencies — Levenshtein + Haversine implemented inline.
 */

import type { ClaimMatchScore } from './types'

// ─── Thresholds ─────────────────────────────────────────────────────

export const AUTO_APPROVE_THRESHOLD = 0.75
export const ADMIN_REVIEW_THRESHOLD = 0.40

// ─── Levenshtein Distance ───────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  )

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[m][n]
}

// ─── Jaccard Token Overlap ──────────────────────────────────────────

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))

  if (tokensA.size === 0 && tokensB.size === 0) return 1
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersection = 0
  tokensA.forEach((t) => {
    if (tokensB.has(t)) intersection++
  })

  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

// ─── Haversine Distance (km) ────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ─── Scoring Functions ──────────────────────────────────────────────

export function fuzzyNameScore(claimed: string, existing: string): number {
  const a = claimed.toLowerCase().trim()
  const b = existing.toLowerCase().trim()

  if (a === b) return 1.0

  // Levenshtein-based similarity
  const maxLen = Math.max(a.length, b.length)
  const levenshteinSim =
    maxLen > 0 ? 1 - levenshteinDistance(a, b) / maxLen : 1

  // Jaccard token overlap
  const jaccard = jaccardSimilarity(a, b)

  // Return the max of both approaches
  return Math.max(levenshteinSim, jaccard)
}

export function phoneMatchScore(
  claimed: string | null | undefined,
  existing: string | null | undefined
): number {
  if (!claimed || !existing) return 0

  // Normalize: strip non-digits, convert +61 to 0
  const normalize = (p: string) => {
    let digits = p.replace(/\D/g, '')
    if (digits.startsWith('61') && digits.length === 11) {
      digits = '0' + digits.slice(2)
    }
    return digits
  }

  return normalize(claimed) === normalize(existing) ? 1 : 0
}

export function websiteDomainScore(
  claimed: string | null | undefined,
  existing: string | null | undefined
): number {
  if (!claimed || !existing) return 0

  const extractDomain = (url: string) => {
    try {
      const withProtocol = url.toLowerCase().startsWith('http') ? url : `https://${url}`
      const hostname = new URL(withProtocol).hostname
      return hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return url.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].toLowerCase()
    }
  }

  return extractDomain(claimed) === extractDomain(existing) ? 1 : 0
}

export function locationProximityScore(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0

  const dist = haversineKm(lat1, lng1, lat2, lng2)

  if (dist < 5) return 1.0
  if (dist <= 25) return 1.0 - ((dist - 5) / 20) * 0.5 // linear 1.0 → 0.5
  if (dist <= 100) return 0.5 - ((dist - 25) / 75) * 0.5 // linear 0.5 → 0
  return 0
}

// ─── Main Scoring Function ──────────────────────────────────────────

interface CalculateMatchParams {
  claimedName: string
  existingName: string
  claimedPhone?: string | null
  existingPhone?: string | null
  claimedWebsite?: string | null
  existingWebsite?: string | null
  claimedLat?: number | null
  claimedLng?: number | null
  existingLat?: number | null
  existingLng?: number | null
}

export function calculateMatchScore(
  params: CalculateMatchParams
): ClaimMatchScore {
  const nameScore = fuzzyNameScore(params.claimedName, params.existingName)
  const phoneScore = phoneMatchScore(params.claimedPhone, params.existingPhone)
  const websiteScore = websiteDomainScore(
    params.claimedWebsite,
    params.existingWebsite
  )
  const locationScore = locationProximityScore(
    params.claimedLat,
    params.claimedLng,
    params.existingLat,
    params.existingLng
  )

  // Weights: name=0.4, location=0.3, phone=0.2, website=0.1
  // Skip null signals (no data for that dimension)
  const signals: { score: number; weight: number }[] = []

  // Name is always available
  signals.push({ score: nameScore, weight: 0.4 })

  // Location: skip if no coordinates provided by claimer
  if (params.claimedLat != null && params.claimedLng != null) {
    signals.push({ score: locationScore, weight: 0.3 })
  }

  // Phone: skip if neither party has phone
  if (params.claimedPhone || params.existingPhone) {
    signals.push({ score: phoneScore, weight: 0.2 })
  }

  // Website: skip if neither party has website
  if (params.claimedWebsite || params.existingWebsite) {
    signals.push({ score: websiteScore, weight: 0.1 })
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  const weightedTotal =
    totalWeight > 0
      ? signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
      : 0

  return {
    name_score: Math.round(nameScore * 100) / 100,
    phone_score: phoneScore,
    website_score: websiteScore,
    location_score: Math.round(locationScore * 100) / 100,
    weighted_total: Math.round(weightedTotal * 100) / 100,
    signals_used: signals.length,
  }
}
