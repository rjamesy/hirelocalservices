'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAdminVerificationQueue, adminApproveVerification, adminRejectVerification } from '@/app/actions/verification'

type VerificationRow = {
  id: string
  name: string
  slug: string
  listing_source: string
  verification_status: string
  created_at: string
  verification_jobs: {
    id: string
    deterministic_result: any
    ai_result: any
    final_decision: string
    created_at: string
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

                {/* Notes + Actions */}
                <div className="mt-4 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                    <textarea
                      value={notes[item.id] || ''}
                      onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                      rows={2}
                      placeholder="Add notes..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Reject
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
