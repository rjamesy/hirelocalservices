#!/usr/bin/env npx tsx
/**
 * AI Description Generator (Phase 3)
 *
 * Generates and validates business descriptions for seed_candidates
 * using OpenAI. Falls back to template if AI fails.
 * No business inserts — only updates seed_candidates.
 *
 * Usage:
 *   npx tsx scripts/seed-generate-descriptions.ts --region seq --dry-run
 *   npx tsx scripts/seed-generate-descriptions.ts --region seq --category house-cleaning --max-ai-calls 20
 *   npx tsx scripts/seed-generate-descriptions.ts --region seq --limit 50 --concurrency 5
 *   npx tsx scripts/seed-generate-descriptions.ts --region seq --force
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  generateAIDescription,
  validateDescription,
  generateFallbackDescription,
  estimateCost,
  PROMPT_VERSION,
  MODEL,
} from '../src/lib/seeding/ai-description'
import type { CandidateForAI } from '../src/lib/seeding/ai-description'
import {
  getCandidatesForAI,
  updateCandidateDescription,
  createAIRun,
  finalizeAIRun,
} from '../src/lib/seeding/ai-store'
import type { CandidateAIUpdate } from '../src/lib/seeding/ai-store'

// ─── CLI Args ────────────────────────────────────────────────────────

interface DescOpts {
  region: string
  category: string
  limit: number
  maxAiCalls: number
  maxCostUsd: number
  dryRun: boolean
  force: boolean
  concurrency: number
}

function parseArgs(): DescOpts {
  const args = process.argv.slice(2)
  const opts: DescOpts = {
    region: '',
    category: 'all',
    limit: 0,
    maxAiCalls: 200,
    maxCostUsd: 1.0,
    dryRun: false,
    force: false,
    concurrency: 3,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--region':
        opts.region = args[++i]?.toLowerCase() ?? ''
        break
      case '--category':
        opts.category = args[++i]?.toLowerCase() ?? 'all'
        break
      case '--limit':
        opts.limit = parseInt(args[++i] ?? '0', 10)
        break
      case '--max-ai-calls':
        opts.maxAiCalls = parseInt(args[++i] ?? '200', 10)
        break
      case '--max-cost':
        opts.maxCostUsd = parseFloat(args[++i] ?? '1.0')
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--force':
        opts.force = true
        break
      case '--concurrency':
        opts.concurrency = parseInt(args[++i] ?? '3', 10)
        break
    }
  }

  if (!opts.region) {
    console.error('Usage: npx tsx scripts/seed-generate-descriptions.ts --region <name> [options]')
    console.error('\nOptions:')
    console.error('  --region <name>         Region filter (required)')
    console.error('  --category <slug>       Category filter or "all" (default: all)')
    console.error('  --limit <n>             Max candidates to process (default: unlimited)')
    console.error('  --max-ai-calls <n>      Safety cap on OpenAI API calls (default: 200)')
    console.error('  --max-cost <n>          Abort if est. cost exceeds $N (default: 1.00)')
    console.error('  --dry-run               Show what would happen without API calls')
    console.error('  --force                 Re-generate even if description exists')
    console.error('  --concurrency <n>       Parallel requests (default: 3)')
    process.exit(1)
  }

  return opts
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

let shuttingDown = false

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  console.log('\n\nGraceful shutdown requested...')
})

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!opts.dryRun && !process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY (required unless --dry-run)')
    process.exit(1)
  }

  // Load candidates
  console.log('Loading candidates needing descriptions...')
  const candidates = await getCandidatesForAI({
    region: opts.region,
    category: opts.category !== 'all' ? opts.category : undefined,
    limit: opts.limit > 0 ? opts.limit : undefined,
    force: opts.force,
  })
  console.log(`  ${candidates.length} candidates loaded`)

  if (candidates.length === 0) {
    console.log('No candidates need descriptions. Run seed-normalize.ts first.')
    process.exit(0)
  }

  console.log('='.repeat(60))
  console.log('AI Description Generator')
  console.log(`  Region:         ${opts.region}`)
  console.log(`  Category:       ${opts.category}`)
  console.log(`  Candidates:     ${candidates.length}`)
  console.log(`  Max AI calls:   ${opts.maxAiCalls}`)
  console.log(`  Max cost:       $${opts.maxCostUsd.toFixed(2)}`)
  console.log(`  Model:          ${MODEL}`)
  console.log(`  Prompt version: ${PROMPT_VERSION}`)
  console.log(`  Concurrency:    ${opts.concurrency}`)
  console.log(`  Dry run:        ${opts.dryRun}`)
  console.log(`  Force:          ${opts.force}`)
  console.log('='.repeat(60))

  if (opts.dryRun) {
    // Estimate: 2 AI calls per candidate (generate + validate)
    const estCalls = candidates.length * 2
    // Rough token estimate: ~200 prompt + 50 completion per call
    const estCost = estimateCost(estCalls * 200, estCalls * 50)
    console.log(`\n[DRY RUN] Would process ${candidates.length} candidates`)
    console.log(`[DRY RUN] Est. AI calls: ${estCalls} (${candidates.length} generate + ${candidates.length} validate)`)
    console.log(`[DRY RUN] Est. cost: $${estCost.toFixed(4)}`)
    process.exit(0)
  }

  // Create AI run log
  const runId = await createAIRun({
    region: opts.region,
    category: opts.category !== 'all' ? opts.category : null,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    candidates_processed: 0,
    descriptions_generated: 0,
    validations_approved: 0,
    validations_rejected: 0,
    fallbacks_used: 0,
    api_errors: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  })

  // Counters
  let aiCalls = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let processed = 0
  let generated = 0
  let approved = 0
  let rejected = 0
  let fallbacks = 0
  let errors = 0

  // Process candidates
  for (let i = 0; i < candidates.length; i += opts.concurrency) {
    if (shuttingDown) {
      console.log('\nShutdown: stopping processing')
      break
    }

    const batch = candidates.slice(i, i + opts.concurrency)

    const batchResults = await Promise.allSettled(
      batch.map(async (c) => {
        // Check safety caps
        if (aiCalls >= opts.maxAiCalls) return null
        const currentCost = estimateCost(totalPromptTokens, totalCompletionTokens)
        if (currentCost >= opts.maxCostUsd) return null

        const candidateForAI: CandidateForAI = {
          name: c.name,
          suburb: c.suburb,
          state: c.state,
          postcode: c.postcode,
          categories: c.categories as string[],
          rating: c.rating,
          user_ratings_total: c.user_ratings_total,
          phone_e164: c.phone_e164,
          website_url: c.website_url,
        }

        let description: string
        let source: 'openai' | 'fallback'
        let validationStatus: 'approved' | 'rejected' = 'approved'
        let validationReason: string | null = null
        let promptVersion = PROMPT_VERSION

        try {
          // Step 1: Generate
          aiCalls++
          const genResult = await generateAIDescription(candidateForAI)
          totalPromptTokens += genResult.promptTokens
          totalCompletionTokens += genResult.completionTokens
          description = genResult.description
          source = genResult.source
          promptVersion = genResult.promptVersion
          generated++

          if (!description || description.length === 0) {
            // Empty response, use fallback
            description = generateFallbackDescription(candidateForAI)
            source = 'fallback'
            validationStatus = 'approved'
            validationReason = 'empty_ai_response_fallback'
            fallbacks++
          } else {
            // Step 2: Validate
            aiCalls++
            const valResult = await validateDescription(candidateForAI, description)
            totalPromptTokens += valResult.promptTokens
            totalCompletionTokens += valResult.completionTokens

            if (valResult.approved) {
              validationStatus = 'approved'
              validationReason = 'passed_validation'
              approved++
            } else {
              // Rejected — use fallback instead
              validationStatus = 'approved'
              validationReason = `ai_rejected:${valResult.reason}_used_fallback`
              description = generateFallbackDescription(candidateForAI)
              source = 'fallback'
              rejected++
              fallbacks++
            }
          }
        } catch (err: any) {
          // OpenAI error — use fallback
          description = generateFallbackDescription(candidateForAI)
          source = 'fallback'
          validationStatus = 'approved'
          validationReason = `api_error:${err.message?.slice(0, 100)}`
          errors++
          fallbacks++
        }

        // Update candidate
        const update: CandidateAIUpdate = {
          place_id: c.place_id,
          description,
          description_source: source,
          description_prompt_version: promptVersion,
          ai_validation_status: validationStatus,
          ai_validation_reason: validationReason,
          ai_processed_at: new Date().toISOString(),
        }

        await updateCandidateDescription(update)
        processed++

        return { source, validationStatus }
      })
    )

    // Check if we hit a cap
    const currentCost = estimateCost(totalPromptTokens, totalCompletionTokens)
    if (aiCalls >= opts.maxAiCalls) {
      console.log(`\n  Max AI calls reached (${opts.maxAiCalls}). Stopping.`)
      break
    }
    if (currentCost >= opts.maxCostUsd) {
      console.log(`\n  Max cost reached ($${currentCost.toFixed(4)} >= $${opts.maxCostUsd}). Stopping.`)
      break
    }

    // Progress
    if ((i + opts.concurrency) % 10 === 0 || i === 0) {
      console.log(`  Processed ${Math.min(i + opts.concurrency, candidates.length)}/${candidates.length} ($${currentCost.toFixed(4)})`)
    }
  }

  // Finalize run log
  const totalTokens = totalPromptTokens + totalCompletionTokens
  const totalCost = estimateCost(totalPromptTokens, totalCompletionTokens)

  await finalizeAIRun(runId, {
    candidates_processed: processed,
    descriptions_generated: generated,
    validations_approved: approved,
    validations_rejected: rejected,
    fallbacks_used: fallbacks,
    api_errors: errors,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: totalCost,
  })

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('--- DESCRIPTION GENERATION COMPLETE ---')
  console.log(`  Candidates processed: ${processed}`)
  console.log(`  Descriptions:         ${generated} generated, ${fallbacks} fallback`)
  console.log(`  Validation:           ${approved} approved, ${rejected} rejected (used fallback)`)
  console.log(`  API errors:           ${errors}`)
  console.log(`  AI calls:             ${aiCalls}`)
  console.log(`  Tokens:               ${totalTokens} (${totalPromptTokens} prompt + ${totalCompletionTokens} completion)`)
  console.log(`  Est. cost:            $${totalCost.toFixed(4)}`)
  console.log(`  Run ID:               ${runId}`)
  console.log('='.repeat(60))

  process.exit(errors > 0 && processed === 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
