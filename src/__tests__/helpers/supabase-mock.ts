import { vi } from 'vitest'

/**
 * Creates a mock Supabase client for testing server actions.
 *
 * Terminal methods (`single`, `maybeSingle`) and chaining methods (`select`,
 * `eq`, `update`, etc.) are all shared spies across `from()` calls, so
 * `mockResolvedValueOnce` / `mockReturnValueOnce` queues results in order.
 *
 * Chaining methods return `chain` by default (for fluent chaining). If a
 * `mockReturnValueOnce` is set on a chaining spy, it returns that value
 * instead (useful for making a chaining method act as a terminal).
 */
export function createMockSupabaseClient() {
  // Terminal method spies — tests configure with mockResolvedValueOnce
  const singleSpy = vi.fn(() => Promise.resolve({ data: null, error: null }))
  const maybeSingleSpy = vi.fn(() => Promise.resolve({ data: null, error: null }))

  // Chaining method spies — return undefined by default (→ chain continues)
  // Use mockReturnValueOnce to override and act as terminal
  const selectSpy = vi.fn()
  const insertSpy = vi.fn()
  const updateSpy = vi.fn()
  const deleteSpy = vi.fn()
  const upsertSpy = vi.fn()
  const eqSpy = vi.fn()
  const neqSpy = vi.fn()
  const gtSpy = vi.fn()
  const gteSpy = vi.fn()
  const ltSpy = vi.fn()
  const lteSpy = vi.fn()
  const ilikeSpy = vi.fn()
  const limitSpy = vi.fn()
  const orderSpy = vi.fn()
  const rangeSpy = vi.fn()

  const chainingSpies: Record<string, ReturnType<typeof vi.fn>> = {
    select: selectSpy, insert: insertSpy, update: updateSpy,
    delete: deleteSpy, upsert: upsertSpy, eq: eqSpy, neq: neqSpy,
    gt: gtSpy, gte: gteSpy, lt: ltSpy, lte: lteSpy,
    ilike: ilikeSpy, limit: limitSpy, order: orderSpy, range: rangeSpy,
  }

  // Spy for direct-await chain results (count queries, deletes, updates without .single())
  const chainResultSpy = vi.fn(() => ({ data: null, error: null }))

  function buildChainable() {
    const chain: Record<string, any> = {}

    chain.single = singleSpy
    chain.maybeSingle = maybeSingleSpy
    chain.then = vi.fn((resolve: (val: unknown) => void) => resolve(chainResultSpy()))

    for (const [name, spy] of Object.entries(chainingSpies)) {
      chain[name] = (...args: any[]) => {
        const result = spy(...args)
        return result !== undefined ? result : chain
      }
    }

    return chain
  }

  const fromSpy = vi.fn(() => buildChainable())
  const rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: null }))

  const storageBucket = {
    createSignedUploadUrl: vi.fn(() =>
      Promise.resolve({ data: { signedUrl: 'https://signed.url', token: 'tok' }, error: null })
    ),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://public.url' } })),
  }

  const client = {
    from: fromSpy,
    rpc: rpcSpy,
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: null }, error: null })
      ),
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    storage: {
      from: vi.fn(() => storageBucket),
    },
  }

  return {
    client,
    /** Spy for `.single()` terminal */
    single: singleSpy,
    /** Spy for `.maybeSingle()` terminal */
    maybeSingle: maybeSingleSpy,
    /** Spy for `.from()` */
    from: fromSpy,
    /** Spy for `.rpc()` */
    rpc: rpcSpy,
    /** Storage bucket mock */
    storageBucket,
    /** Spy for direct-await chain results (count queries, deletes, etc.) */
    chainResult: chainResultSpy,
    // Chaining method spies for assertions and overrides
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
    upsert: upsertSpy,
    eq: eqSpy,
    neq: neqSpy,
    gt: gtSpy,
    gte: gteSpy,
    lt: ltSpy,
    lte: lteSpy,
    ilike: ilikeSpy,
    limit: limitSpy,
    order: orderSpy,
    range: rangeSpy,
  }
}
