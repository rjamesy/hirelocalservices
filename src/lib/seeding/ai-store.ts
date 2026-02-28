/**
 * DB functions for AI description columns on seed_candidates
 * and seed_ai_runs logging table.
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── seed_candidates AI columns ─────────────────────────────────────

export interface CandidateAIUpdate {
  place_id: string
  description: string
  description_source: 'openai' | 'fallback'
  description_prompt_version: string
  ai_validation_status: 'pending' | 'approved' | 'rejected'
  ai_validation_reason: string | null
  ai_processed_at: string
}

/** Update AI description fields on a single candidate */
export async function updateCandidateDescription(update: CandidateAIUpdate): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('seed_candidates')
    .update({
      description: update.description,
      description_source: update.description_source,
      description_prompt_version: update.description_prompt_version,
      ai_validation_status: update.ai_validation_status,
      ai_validation_reason: update.ai_validation_reason,
      ai_processed_at: update.ai_processed_at,
      updated_at: new Date().toISOString(),
    })
    .eq('place_id', update.place_id)
}

/** Batch update AI description fields */
export async function updateCandidateDescriptionsBatch(updates: CandidateAIUpdate[]): Promise<void> {
  // Supabase doesn't support batch update natively, so we do individual updates
  // But we chunk to avoid overwhelming the connection
  for (const update of updates) {
    await updateCandidateDescription(update)
  }
}

/** Load candidates that need AI description */
export async function getCandidatesForAI(filters?: {
  region?: string
  category?: string
  limit?: number
  force?: boolean
}): Promise<Array<{
  place_id: string
  name: string
  suburb: string
  state: string
  postcode: string
  categories: string[]
  rating: number | null
  user_ratings_total: number | null
  phone_e164: string | null
  website_url: string | null
  description: string | null
}>> {
  const supabase = getSupabase()
  const results: any[] = []
  let from = 0
  const pageSize = 500

  while (true) {
    let query = supabase
      .from('seed_candidates')
      .select('place_id, name, suburb, state, postcode, categories, rating, user_ratings_total, phone_e164, website_url, description')
      .eq('status', 'ready_for_ai')

    if (!filters?.force) {
      query = query.is('description', null)
    }

    if (filters?.region) query = query.eq('source_region', filters.region)
    if (filters?.category) query = query.eq('source_category', filters.category)

    query = query.range(from, from + pageSize - 1)

    const { data } = await query
    if (!data || data.length === 0) break

    results.push(...data)

    if (filters?.limit && results.length >= filters.limit) {
      return results.slice(0, filters.limit)
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return results
}

// ─── seed_ai_runs ───────────────────────────────────────────────────

export interface AIRunLog {
  id?: string
  region: string | null
  category: string | null
  model: string
  prompt_version: string
  candidates_processed: number
  descriptions_generated: number
  validations_approved: number
  validations_rejected: number
  fallbacks_used: number
  api_errors: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
}

/** Create a new AI run entry (at start) */
export async function createAIRun(run: Omit<AIRunLog, 'id'>): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('seed_ai_runs')
    .insert({
      run_started_at: new Date().toISOString(),
      region: run.region,
      category: run.category,
      model: run.model,
      prompt_version: run.prompt_version,
      candidates_processed: run.candidates_processed,
      descriptions_generated: run.descriptions_generated,
      validations_approved: run.validations_approved,
      validations_rejected: run.validations_rejected,
      fallbacks_used: run.fallbacks_used,
      api_errors: run.api_errors,
      prompt_tokens: run.prompt_tokens,
      completion_tokens: run.completion_tokens,
      total_tokens: run.total_tokens,
      estimated_cost_usd: run.estimated_cost_usd,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create AI run: ${error.message}`)
  return data.id
}

/** Finalize an AI run with stats */
export async function finalizeAIRun(runId: string, stats: Omit<AIRunLog, 'id' | 'region' | 'category' | 'model' | 'prompt_version'>): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('seed_ai_runs')
    .update({
      run_finished_at: new Date().toISOString(),
      candidates_processed: stats.candidates_processed,
      descriptions_generated: stats.descriptions_generated,
      validations_approved: stats.validations_approved,
      validations_rejected: stats.validations_rejected,
      fallbacks_used: stats.fallbacks_used,
      api_errors: stats.api_errors,
      prompt_tokens: stats.prompt_tokens,
      completion_tokens: stats.completion_tokens,
      total_tokens: stats.total_tokens,
      estimated_cost_usd: stats.estimated_cost_usd,
    })
    .eq('id', runId)
}
