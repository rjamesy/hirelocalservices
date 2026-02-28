'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAdminVerificationQueue, adminApproveVerification, adminRejectVerification } from '@/app/actions/verification'
import { adminSuspendBusiness } from '@/app/actions/admin'
import { EXPLICIT_TERMS } from '@/lib/verification'

// Pre-compiled patterns for client-side safety check
const EXPLICIT_PATTERNS = EXPLICIT_TERMS.map(
  (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
)

function checkTextSafety(texts: string[]): boolean {
  const combined = texts.filter(Boolean).join(' ')
  return EXPLICIT_PATTERNS.some((pattern) => pattern.test(combined))
}

type PendingChanges = {
  name?: string
  description?: string | null
  phone?: string | null
  email_contact?: string | null
  website?: string | null
  abn?: string | null
}

type VerificationRow = {
  id: string
  name: string
  slug: string
  description: string | null
  phone: string | null
  email_contact: string | null
  website: string | null
  abn: string | null
  listing_source: string
  verification_status: string
  created_at: string
  pending_changes: PendingChanges | null
  duplicate_user_choice: string | null
  duplicate_of_business_id: string | null
  duplicate_confidence: number | null
  verification_jobs: {
    id: string
    deterministic_result: any
    ai_result: any
    final_decision: string
    created_at: string
  }[] | null
  photos: {
    id: string
    url: string
    sort_order: number
    status: string
  }[] | null
  testimonials: {
    id: string
    author_name: string
    text: string
    rating: number
    status: string
  }[] | null
}

export default function AdminVerificationPage() {
  const [items, setItems] = useState<VerificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function loadQueue() {
    setLoading(true)
    const result = await getAdminVerificationQueue(1)
    setItems((result.data ?? []) as VerificationRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadQueue()
  }, [])

  async function handleApprove(businessId: string) {
    setActionLoading(businessId)
    const result = await adminApproveVerification(businessId, notes[businessId])
    if ('error' in result) {
      alert(result.error)
    }
    setActionLoading(null)
    loadQueue()
  }

  async function handleReject(businessId: string) {
    setActionLoading(businessId)
    const result = await adminRejectVerification(businessId, notes[businessId])
    if ('error' in result) {
      alert(result.error)
    }
    setActionLoading(null)
    loadQueue()
  }

  async function handleSuspend(businessId: string) {
    if (!confirm('Suspend this business? It will be hidden from search results.')) return
    setActionLoading(businessId)
    const result = await adminSuspendBusiness(businessId, notes[businessId] || 'Suspended during verification review')
    if ('error' in result) {
      alert(result.error)
    }
    setActionLoading(null)
    loadQueue()
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Verification Queue</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Verification Queue</h1>
        <Link
          href="/admin"
          className="text-sm text-brand-600 hover:text-brand-700"
        >
          Back to Dashboard
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No businesses pending verification.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const job = Array.isArray(item.verification_jobs) ? item.verification_jobs[0] : null
            const det = job?.deterministic_result
            const ai = job?.ai_result

            // Content safety checks
            const imageModResult = ai?.image_moderation
            const imageFailed = imageModResult?.decision === 'rejected'
            const textFailed = checkTextSafety([
              item.name,
              item.description || '',
              item.pending_changes?.name || '',
              item.pending_changes?.description || '',
              ...(item.testimonials ?? []).map(t => `${t.author_name} ${t.text}`),
            ])
            const safetyFailed = imageFailed || textFailed

            return (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/business/${item.slug}`}
                      className="text-lg font-semibold text-brand-600 hover:underline"
                      target="_blank"
                    >
                      {item.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {item.listing_source}
                      </span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                {det && (
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-md bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Spam Score</p>
                      <p className={`text-lg font-bold ${det.spam_score >= 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                        {(det.spam_score * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="rounded-md bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Duplicate Score</p>
                      <p className={`text-lg font-bold ${det.duplicate_score >= 0.8 ? 'text-red-600' : 'text-green-600'}`}>
                        {(det.duplicate_score * 100).toFixed(0)}%
                      </p>
                    </div>
                    {ai && (
                      <>
                        <div className="rounded-md bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">AI Real Business</p>
                          <p className={`text-lg font-bold ${ai.real_business >= 0.6 ? 'text-green-600' : 'text-red-600'}`}>
                            {(ai.real_business * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="rounded-md bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">AI Toxicity</p>
                          <p className={`text-lg font-bold ${ai.toxicity < 0.3 ? 'text-green-600' : 'text-red-600'}`}>
                            {(ai.toxicity * 100).toFixed(0)}%
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {ai?.summary && (
                  <p className="mt-3 text-sm text-gray-600 italic">{ai.summary}</p>
                )}

                {/* Content Safety Checks */}
                <div className={`mt-4 rounded-md border p-4 ${safetyFailed ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <h4 className={`text-sm font-semibold mb-2 ${safetyFailed ? 'text-red-800' : 'text-green-800'}`}>
                    Content Safety Checks
                  </h4>
                  <div className="flex gap-6 text-sm">
                    <span className={imageFailed ? 'text-red-700 font-bold' : 'text-green-700'}>
                      Image Safety: {imageFailed ? 'FAIL' : 'PASS'}
                    </span>
                    <span className={textFailed ? 'text-red-700 font-bold' : 'text-green-700'}>
                      Text Safety: {textFailed ? 'FAIL' : 'PASS'}
                    </span>
                  </div>
                  {safetyFailed && (
                    <p className="mt-2 text-xs text-red-700 font-medium">
                      Approve is disabled. This listing contains flagged content.
                    </p>
                  )}
                </div>

                {/* Pending changes diff */}
                {item.pending_changes && (
                  <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Pending Changes</h4>
                    <div className="space-y-1 text-sm">
                      {Object.entries(item.pending_changes).map(([key, newVal]) => {
                        const liveVal = (item as Record<string, unknown>)[key]
                        const changed = newVal !== liveVal
                        if (!changed) return null
                        return (
                          <div key={key} className="grid grid-cols-[120px_1fr_1fr] gap-2">
                            <span className="font-medium text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                            <span className="text-red-600 line-through">{String(liveVal ?? '(empty)')}</span>
                            <span className="text-green-700">{String(newVal ?? '(empty)')}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Pending photo changes */}
                {(() => {
                  const pendingAddPhotos = (item.photos ?? []).filter(p => p.status === 'pending_add')
                  const pendingDeletePhotos = (item.photos ?? []).filter(p => p.status === 'pending_delete')
                  if (pendingAddPhotos.length === 0 && pendingDeletePhotos.length === 0) return null
                  return (
                    <div className="mt-4 rounded-md border border-purple-200 bg-purple-50 p-4">
                      <h4 className="text-sm font-medium text-purple-800 mb-2">Pending Photo Changes</h4>
                      {pendingAddPhotos.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-green-700 font-medium mb-1">+ {pendingAddPhotos.length} new photo{pendingAddPhotos.length !== 1 ? 's' : ''}</p>
                          <div className="flex gap-2 flex-wrap">
                            {pendingAddPhotos.map(p => (
                              <img key={p.id} src={p.url} alt="Pending" className="h-16 w-20 object-cover rounded border border-green-300" />
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingDeletePhotos.length > 0 && (
                        <div>
                          <p className="text-xs text-red-700 font-medium mb-1">- {pendingDeletePhotos.length} photo{pendingDeletePhotos.length !== 1 ? 's' : ''} to remove</p>
                          <div className="flex gap-2 flex-wrap">
                            {pendingDeletePhotos.map(p => (
                              <img key={p.id} src={p.url} alt="To delete" className="h-16 w-20 object-cover rounded border border-red-300 opacity-60" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Pending testimonial changes */}
                {(() => {
                  const pendingAddT = (item.testimonials ?? []).filter(t => t.status === 'pending_add')
                  const pendingDeleteT = (item.testimonials ?? []).filter(t => t.status === 'pending_delete')
                  if (pendingAddT.length === 0 && pendingDeleteT.length === 0) return null
                  return (
                    <div className="mt-4 rounded-md border border-purple-200 bg-purple-50 p-4">
                      <h4 className="text-sm font-medium text-purple-800 mb-2">Pending Testimonial Changes</h4>
                      {pendingAddT.length > 0 && (
                        <div className="mb-2 space-y-1">
                          <p className="text-xs text-green-700 font-medium">+ {pendingAddT.length} new testimonial{pendingAddT.length !== 1 ? 's' : ''}</p>
                          {pendingAddT.map(t => (
                            <div key={t.id} className="text-xs text-gray-700 border-l-2 border-green-400 pl-2">
                              <span className="font-medium">{t.author_name}</span> ({t.rating}/5): {t.text.slice(0, 100)}{t.text.length > 100 ? '...' : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {pendingDeleteT.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-red-700 font-medium">- {pendingDeleteT.length} testimonial{pendingDeleteT.length !== 1 ? 's' : ''} to remove</p>
                          {pendingDeleteT.map(t => (
                            <div key={t.id} className="text-xs text-gray-500 border-l-2 border-red-400 pl-2 line-through">
                              <span className="font-medium">{t.author_name}</span> ({t.rating}/5): {t.text.slice(0, 100)}{t.text.length > 100 ? '...' : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Image moderation results */}
                {(() => {
                  const aiResult = (Array.isArray(item.verification_jobs) ? item.verification_jobs[0] : null)?.ai_result
                  const imageMod = aiResult?.image_moderation
                  if (!imageMod) return null
                  return (
                    <div className={`mt-4 rounded-md border p-4 ${imageMod.decision === 'rejected' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                      <h4 className={`text-sm font-medium mb-1 ${imageMod.decision === 'rejected' ? 'text-red-800' : 'text-green-800'}`}>
                        Image Moderation: {imageMod.decision}
                      </h4>
                      {imageMod.reason && <p className="text-xs text-gray-700">{imageMod.reason}</p>}
                    </div>
                  )
                })()}

                {/* Duplicate match panel */}
                {item.duplicate_user_choice === 'matched' && item.duplicate_of_business_id && (
                  <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-1">
                      Duplicate Match — User confirmed
                    </h4>
                    <p className="text-xs text-gray-700">
                      User identified this as the same business as seed <code className="text-xs bg-blue-100 px-1 rounded">{item.duplicate_of_business_id}</code>
                      {item.duplicate_confidence != null && (
                        <span className="ml-1">({item.duplicate_confidence}% confidence)</span>
                      )}
                    </p>
                    <p className="text-xs text-blue-700 mt-1 font-medium">
                      Approving will soft-delete the matched seed listing.
                    </p>
                  </div>
                )}
                {item.duplicate_user_choice === 'not_matched' && (
                  <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-600">
                      User reviewed potential duplicates and selected <span className="font-medium">Not a match</span>.
                    </p>
                  </div>
                )}

                {/* Notes + Actions */}
                <div className="mt-4 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                    <textarea
                      data-testid="admin-verification-notes"
                      value={notes[item.id] || ''}
                      onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                      rows={2}
                      placeholder="Add notes..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="admin-approve-btn"
                      onClick={() => handleApprove(item.id)}
                      disabled={actionLoading === item.id || safetyFailed}
                      className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                        safetyFailed ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                      }`}
                      title={safetyFailed ? 'Cannot approve: content safety failed' : ''}
                    >
                      Approve
                    </button>
                    <button
                      data-testid="admin-reject-btn"
                      onClick={() => handleReject(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleSuspend(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
