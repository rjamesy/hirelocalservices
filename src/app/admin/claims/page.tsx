'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAdminClaims, approveClaim, rejectClaim } from '@/app/actions/claims'

type ClaimRow = {
  id: string
  business_id: string
  claimer_id: string
  status: string
  created_at: string
  claimed_business_name: string | null
  claimed_phone: string | null
  claimed_website: string | null
  claimed_email: string | null
  claimed_postcode: string | null
  match_score: {
    name_score: number
    phone_score: number
    website_score: number
    location_score: number
    weighted_total: number
    signals_used: number
  } | null
  verification_method: string | null
  businesses: { id: string; name: string; slug: string; phone: string | null; website: string | null } | null
  profiles: { id: string; email: string } | null
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function loadClaims() {
    setLoading(true)
    const result = await getAdminClaims(1)
    setClaims(result.data as ClaimRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadClaims()
  }, [])

  async function handleApprove(claimId: string) {
    setActionLoading(claimId)
    const result = await approveClaim(claimId, notes[claimId])
    if (result.error) {
      alert(result.error)
    }
    setActionLoading(null)
    loadClaims()
  }

  async function handleReject(claimId: string) {
    setActionLoading(claimId)
    const result = await rejectClaim(claimId, notes[claimId])
    if (result.error) {
      alert(result.error)
    }
    setActionLoading(null)
    loadClaims()
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Pending Claims</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pending Claims</h1>
        <Link
          href="/admin"
          className="text-sm text-brand-600 hover:text-brand-700"
        >
          Back to Dashboard
        </Link>
      </div>

      {claims.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No pending claims.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div key={claim.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  {claim.businesses ? (
                    <Link
                      href={`/business/${claim.businesses.slug}`}
                      className="text-lg font-semibold text-brand-600 hover:underline"
                      target="_blank"
                    >
                      {claim.businesses.name}
                    </Link>
                  ) : (
                    <span className="text-lg font-semibold text-gray-500">Unknown Business</span>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    <span>Claimer: {claim.profiles?.email ?? 'Unknown'}</span>
                    <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                    {claim.verification_method && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {claim.verification_method}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Side-by-side: Claimed vs Seed Data */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-amber-50 border border-amber-100 p-4">
                  <h4 className="text-xs font-medium text-amber-800 uppercase tracking-wider mb-2">Claimed Data</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Name</dt>
                      <dd className="font-medium text-gray-900">{claim.claimed_business_name || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Phone</dt>
                      <dd className="font-medium text-gray-900">{claim.claimed_phone || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Website</dt>
                      <dd className="font-medium text-gray-900 truncate max-w-[200px]">{claim.claimed_website || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Email</dt>
                      <dd className="font-medium text-gray-900 truncate max-w-[200px]">{claim.claimed_email || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Postcode</dt>
                      <dd className="font-medium text-gray-900">{claim.claimed_postcode || '-'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-md bg-blue-50 border border-blue-100 p-4">
                  <h4 className="text-xs font-medium text-blue-800 uppercase tracking-wider mb-2">Seed Data</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Name</dt>
                      <dd className="font-medium text-gray-900">{claim.businesses?.name || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Phone</dt>
                      <dd className="font-medium text-gray-900">{claim.businesses?.phone || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Website</dt>
                      <dd className="font-medium text-gray-900 truncate max-w-[200px]">{claim.businesses?.website || '-'}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Match Score */}
              {claim.match_score && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700">Match Score:</span>
                    <span className={`text-sm font-bold ${claim.match_score.weighted_total >= 0.75 ? 'text-green-600' : claim.match_score.weighted_total >= 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {(claim.match_score.weighted_total * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded bg-gray-50 px-2 py-1 text-center">
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="text-sm font-medium">{(claim.match_score.name_score * 100).toFixed(0)}%</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1 text-center">
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="text-sm font-medium">{claim.match_score.phone_score === 1 ? '100%' : '0%'}</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1 text-center">
                      <p className="text-xs text-gray-500">Website</p>
                      <p className="text-sm font-medium">{claim.match_score.website_score === 1 ? '100%' : '0%'}</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1 text-center">
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="text-sm font-medium">{(claim.match_score.location_score * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes + Actions */}
              <div className="mt-4 flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                  <textarea
                    value={notes[claim.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [claim.id]: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                    rows={2}
                    placeholder="Add notes..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(claim.id)}
                    disabled={actionLoading === claim.id}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(claim.id)}
                    disabled={actionLoading === claim.id}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
