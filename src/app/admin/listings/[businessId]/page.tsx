'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getAdminListingDetail,
  adminSuspendBusiness,
  adminUnsuspendBusiness,
  adminSoftDeleteListing,
  adminRestoreListing,
  adminPauseListing,
  adminTransferOwnership,
  adminForceReverify,
  adminApprovePendingChanges,
  adminRejectPendingChanges,
  type AdminListingDetail,
} from '@/app/actions/admin'

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    paused: 'bg-gray-100 text-gray-800',
    suspended: 'bg-red-100 text-red-800',
    deleted: 'bg-red-200 text-red-900',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  )
}

function TypeBadge({ isSeed, claimStatus }: { isSeed: boolean; claimStatus: string }) {
  if (isSeed && claimStatus === 'claimed') {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
        Claimed
      </span>
    )
  }
  if (isSeed) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        Seed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
      User-Created
    </span>
  )
}

function BillingBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    trial: 'bg-blue-50 text-blue-700',
    billing_suspended: 'bg-red-50 text-red-700',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-50 text-gray-500'}`}
    >
      {status === 'billing_suspended' ? 'Billing Suspended' : status || 'none'}
    </span>
  )
}

function VerificationBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
    suspended: 'bg-red-200 text-red-900',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function PhotoStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    live: 'bg-green-600',
    pending_add: 'bg-yellow-500',
    pending_delete: 'bg-red-500',
  }
  return (
    <span
      className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${styles[status] ?? 'bg-gray-500'}`}
    >
      {status}
    </span>
  )
}

export default function AdminListingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const businessId = params.businessId as string

  const [data, setData] = useState<AdminListingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Action form state
  const [suspendReason, setSuspendReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [transferOwnerId, setTransferOwnerId] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReverifyConfirm, setShowReverifyConfirm] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    const result = await getAdminListingDetail(businessId)
    if ('error' in result) {
      setError(result.error)
    } else {
      setData(result)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (businessId) {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  async function runAction(
    action: () => Promise<{ success?: boolean; error?: string }>,
    successMsg: string
  ) {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const result = await action()
      if ('error' in result && result.error) {
        setActionMessage({ type: 'error', text: result.error })
      } else {
        setActionMessage({ type: 'success', text: successMsg })
        await loadData()
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'An unexpected error occurred' })
    }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-gray-500">Loading listing details...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/listings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Listings
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-sm text-red-700">
          {error || 'Failed to load listing details.'}
        </div>
      </div>
    )
  }

  const { business, owner, location, categories, contacts, reports, claims, photos, testimonials, entitlements, eligibility, listingEligibility, pendingChanges } = data
  const isDeleted = !!business.deleted_at
  const isSuspended = business.status === 'suspended'
  const isPublished = business.status === 'published'

  return (
    <div className="space-y-6">
      {/* Action message banner */}
      {actionMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            actionMessage.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {actionMessage.text}
          <button
            onClick={() => setActionMessage(null)}
            className="ml-3 text-xs font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Deleted banner */}
      {isDeleted && (
        <div className="rounded-lg border border-red-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-900">
          This listing has been deleted (soft-deleted at {formatDate(business.deleted_at)}).
        </div>
      )}

      {/* ──────────── 1. Header ──────────── */}
      <div>
        <Link
          href="/admin/listings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Listings
        </Link>

        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
          <TypeBadge isSeed={business.is_seed} claimStatus={business.claim_status} />
          <StatusBadge status={isDeleted ? 'deleted' : business.status} />
          <BillingBadge status={business.billing_status} />
          <VerificationBadge status={business.verification_status} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span>ID: {business.id}</span>
          <span>Created: {formatDate(business.created_at)}</span>
          {business.slug && (
            <Link
              href={`/business/${business.slug}`}
              target="_blank"
              className="text-brand-600 hover:underline"
            >
              View public page
            </Link>
          )}
        </div>
      </div>

      {/* ──────────── 2. Owner Info ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Owner Information</h2>
        {owner ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">Email:</span>
              <Link
                href={`/admin/accounts/${owner.id}`}
                className="text-brand-600 hover:underline font-medium"
              >
                {owner.email}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">User ID:</span>
              <span className="text-gray-900 font-mono text-xs">{owner.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">Role:</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  owner.role === 'admin'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {owner.role}
              </span>
            </div>
            {owner.suspended_at && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-24 shrink-0">Status:</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Owner Suspended
                  {owner.suspended_reason && ` - ${owner.suspended_reason}`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">Joined:</span>
              <span className="text-gray-700">{formatDate(owner.created_at)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No owner assigned.</p>
        )}
      </div>

      {/* ──────────── 3. Published Snapshot ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Published Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Business Details</h3>
            <dl className="space-y-1.5">
              <div>
                <dt className="text-gray-500 text-xs">Description</dt>
                <dd className="text-gray-900">{business.description || <span className="text-gray-400 italic">None</span>}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Phone</dt>
                <dd className="text-gray-900">{business.phone || <span className="text-gray-400 italic">None</span>}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Email</dt>
                <dd className="text-gray-900">{business.email_contact || <span className="text-gray-400 italic">None</span>}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Website</dt>
                <dd className="text-gray-900">
                  {business.website ? (
                    <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                      {business.website}
                    </a>
                  ) : (
                    <span className="text-gray-400 italic">None</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">ABN</dt>
                <dd className="text-gray-900">{business.abn || <span className="text-gray-400 italic">None</span>}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Listing Source</dt>
                <dd className="text-gray-900">{business.listing_source || <span className="text-gray-400 italic">Unknown</span>}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Location</h3>
            {location ? (
              <dl className="space-y-1.5">
                {location.address_line && (
                  <div>
                    <dt className="text-gray-500 text-xs">Address</dt>
                    <dd className="text-gray-900">{location.address_line}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 text-xs">Suburb</dt>
                  <dd className="text-gray-900">{location.suburb}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">State</dt>
                  <dd className="text-gray-900">{location.state}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Postcode</dt>
                  <dd className="text-gray-900">{location.postcode}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-gray-400 italic text-xs">No location set.</p>
            )}

            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-4">Categories</h3>
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c: any) => (
                  <span
                    key={c.category_id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.is_primary ? 'bg-brand-100 text-brand-800' : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {c.categories?.name || c.category_id}
                    {c.is_primary && (
                      <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                        Primary
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 italic text-xs">No categories assigned.</p>
            )}
          </div>
        </div>
      </div>

      {/* ──────────── 4. Pending Changes Diff ──────────── */}
      {pendingChanges && Object.keys(pendingChanges).length > 0 && (
        <div className="bg-white rounded-lg border border-yellow-300 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Pending Changes</h2>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              Awaiting Review
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Field</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Current Value</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(pendingChanges).map(([field, newValue]) => (
                  <tr key={field}>
                    <td className="px-3 py-2 font-medium text-gray-700">{field}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">
                      {String(business[field] ?? '--')}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-300">
                      <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-medium max-w-[200px] truncate">
                      {String(newValue ?? '--')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
            <button
              onClick={() => runAction(() => adminApprovePendingChanges(businessId), 'Pending changes approved successfully.')}
              disabled={actionLoading}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? 'Processing...' : 'Approve Changes'}
            </button>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rejection reason (optional)</label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="block w-64 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <button
                onClick={() =>
                  runAction(
                    () => adminRejectPendingChanges(businessId, rejectReason || undefined),
                    'Pending changes rejected.'
                  )
                }
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Reject Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────── 5. Entitlements Panel ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Entitlements</h2>
        {entitlements ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium w-48">Plan</td>
                  <td className="py-2 text-gray-900">{entitlements.plan ?? '--'}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium">Subscription Status</td>
                  <td className="py-2 text-gray-900">{entitlements.subscriptionStatus ?? '--'}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium">Effective State</td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        entitlements.effectiveState === 'ok'
                          ? 'bg-green-100 text-green-800'
                          : entitlements.effectiveState === 'limited'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {entitlements.effectiveState}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium">Max Listings</td>
                  <td className="py-2 text-gray-900">{entitlements.maxListings}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium">Current Listing Count</td>
                  <td className="py-2 text-gray-900">{entitlements.currentListingCount}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-500 font-medium">Reason Codes</td>
                  <td className="py-2">
                    {entitlements.reasonCodes && entitlements.reasonCodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {entitlements.reasonCodes.map((code, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">None</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No entitlements data (no owner assigned).</p>
        )}
      </div>

      {/* ──────────── 6. Eligibility Panel ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Search Eligibility</h2>
        {eligibility.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Check Name</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Result</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {eligibility.map((check, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-700 font-medium">{check.check_name}</td>
                    <td className="px-3 py-2 text-center">
                      {check.passed ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Fail
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{check.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No eligibility data available.</p>
        )}
      </div>

      {/* ──────────── 6b. Listing Visibility ──────────── */}
      {listingEligibility && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Listing Visibility</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-xs text-gray-500">Public Visible</span>
              <div className={`text-sm font-medium ${listingEligibility.visiblePublic ? 'text-green-700' : 'text-red-700'}`}>
                {listingEligibility.visiblePublic ? 'Yes' : 'No'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500">In Search</span>
              <div className={`text-sm font-medium ${listingEligibility.visibleInSearch ? 'text-green-700' : 'text-red-700'}`}>
                {listingEligibility.visibleInSearch ? 'Yes' : 'No'}
              </div>
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Check</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(listingEligibility.checks).map(([key, value]) => (
                <tr key={key}>
                  <td className="px-3 py-2 text-gray-700 font-medium">{key}</td>
                  <td className="px-3 py-2 text-center">
                    {typeof value === 'boolean' ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {value ? 'Pass' : 'Fail'}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">{value ?? 'none'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listingEligibility.blockedReasons.length > 0 && (
            <div className="mt-3">
              <span className="text-xs text-gray-500">Blocked Reasons:</span>
              <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                {listingEligibility.blockedReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ──────────── 7. Reports Section ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Reports</h2>
          <span className="text-xs text-gray-500">{reports.length} total</span>
        </div>
        {reports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Reason</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">{report.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2 text-gray-700">{report.reason}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          report.status === 'resolved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {report.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(report.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No reports for this listing.</p>
        )}
      </div>

      {/* ──────────── 8. Photos Grid ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Photos ({photos.length})</h2>
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((photo: any) => (
                <div key={photo.id} className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <PhotoStatusBadge status={photo.status} />
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No photos uploaded.</p>
        )}
      </div>

      {/* ──────────── 9. Testimonials List ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Testimonials ({testimonials.length})</h2>
        {testimonials.length > 0 ? (
          <div className="space-y-3">
            {testimonials.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{t.author_name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        t.status === 'live'
                          ? 'bg-green-100 text-green-800'
                          : t.status === 'pending_add'
                            ? 'bg-yellow-100 text-yellow-800'
                            : t.status === 'pending_delete'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <StarRating rating={t.rating} />
                </div>
                <p className="text-sm text-gray-600">{t.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No testimonials.</p>
        )}
      </div>

      {/* ──────────── 10. Claims Table ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Claims ({claims.length})</h2>
        {claims.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Claimer Email</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map((claim: any) => {
                  const claimerEmail =
                    claim.profiles?.email ??
                    (Array.isArray(claim.profiles) ? claim.profiles[0]?.email : null) ??
                    'Unknown'

                  return (
                    <tr key={claim.id}>
                      <td className="px-3 py-2 text-gray-700">{claimerEmail}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            claim.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : claim.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : claim.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {claim.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{formatDate(claim.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No claims for this listing.</p>
        )}
      </div>

      {/* ──────────── 11. Actions Panel ──────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Admin Actions</h2>
        <div className="space-y-4">
          {/* Suspend / Unsuspend */}
          {!isSuspended && !isDeleted && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Suspend reason (optional)</label>
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Reason for suspension..."
                  className="block w-64 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <button
                onClick={() =>
                  runAction(
                    () => adminSuspendBusiness(businessId, suspendReason || undefined),
                    'Business suspended successfully.'
                  )
                }
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Suspend'}
              </button>
            </div>
          )}

          {isSuspended && !isDeleted && (
            <div>
              {business.suspended_reason && (
                <p className="text-xs text-gray-500 mb-2">
                  Suspended reason: <span className="font-medium text-gray-700">{business.suspended_reason}</span>
                  {business.suspended_at && <span> (at {formatDate(business.suspended_at)})</span>}
                </p>
              )}
              <button
                onClick={() => runAction(() => adminUnsuspendBusiness(businessId), 'Business unsuspended successfully.')}
                disabled={actionLoading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Unsuspend'}
              </button>
            </div>
          )}

          {/* Pause */}
          {isPublished && (
            <div>
              <button
                onClick={() => runAction(() => adminPauseListing(businessId), 'Listing paused successfully.')}
                disabled={actionLoading}
                className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Pause Listing'}
              </button>
            </div>
          )}

          {/* Soft Delete / Restore */}
          {!isDeleted && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deletion reason (optional)</label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Reason for deletion..."
                  className="block w-64 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={actionLoading}
                  className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Soft Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      runAction(
                        () => adminSoftDeleteListing(businessId, deleteReason || undefined),
                        'Listing soft-deleted successfully.'
                      )
                    }}
                    disabled={actionLoading}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Yes, Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {isDeleted && (
            <div>
              <button
                onClick={() => runAction(() => adminRestoreListing(businessId), 'Listing restored successfully.')}
                disabled={actionLoading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Restore Listing'}
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-200 pt-4">
            {/* Transfer Ownership */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">New owner User ID</label>
                <input
                  type="text"
                  value={transferOwnerId}
                  onChange={(e) => setTransferOwnerId(e.target.value)}
                  placeholder="UUID of new owner..."
                  className="block w-80 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={() => {
                  if (!transferOwnerId.trim()) {
                    setActionMessage({ type: 'error', text: 'Please enter a valid User ID.' })
                    return
                  }
                  runAction(
                    () => adminTransferOwnership(businessId, transferOwnerId.trim()),
                    'Ownership transferred successfully.'
                  )
                }}
                disabled={actionLoading || !transferOwnerId.trim()}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Transfer Ownership'}
              </button>
            </div>

            {/* Force Re-verify */}
            <div>
              {!showReverifyConfirm ? (
                <button
                  onClick={() => setShowReverifyConfirm(true)}
                  disabled={actionLoading}
                  className="rounded-md border border-yellow-300 bg-white px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 transition-colors"
                >
                  Force Re-verify
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-700 font-medium">
                    This will reset verification to pending. Continue?
                  </span>
                  <button
                    onClick={() => {
                      setShowReverifyConfirm(false)
                      runAction(
                        () => adminForceReverify(businessId),
                        'Verification reset to pending.'
                      )
                    }}
                    disabled={actionLoading}
                    className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Yes, Re-verify'}
                  </button>
                  <button
                    onClick={() => setShowReverifyConfirm(false)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
