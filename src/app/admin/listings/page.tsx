'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getAdminListingsEnhanced,
  adminSuspendBusiness,
  adminUnsuspendBusiness,
  adminSoftDeleteListing,
  type AdminListingFilters,
  type EnhancedAdminListingItem,
} from '@/app/actions/admin'

type StatusFilter = 'all' | 'published' | 'draft' | 'paused' | 'suspended' | 'deleted'
type TypeFilter = '' | 'seed' | 'claimed' | 'user'
type VerificationFilter = '' | 'approved' | 'pending' | 'rejected' | 'suspended'

const PAGE_SIZE = 20

const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export default function AdminListingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all'
  const initialPage = parseInt(searchParams.get('page') || '1', 10)
  const initialSearch = searchParams.get('q') || ''
  const initialState = searchParams.get('state') || ''
  const initialType = (searchParams.get('type') as TypeFilter) || ''
  const initialVerification = (searchParams.get('verification') as VerificationFilter) || ''

  const [listings, setListings] = useState<EnhancedAdminListingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [stateFilter, setStateFilter] = useState(initialState)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType)
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>(initialVerification)
  const [page, setPage] = useState(initialPage)
  const [totalCount, setTotalCount] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchListings = useCallback(async () => {
    setLoading(true)
    const filters: AdminListingFilters = {
      page,
      search: debouncedSearch || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      state: stateFilter || undefined,
      type: typeFilter || undefined,
      verificationStatus: verificationFilter || undefined,
    }
    const result = await getAdminListingsEnhanced(filters)
    setListings(result.data)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [page, debouncedSearch, statusFilter, stateFilter, typeFilter, verificationFilter])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (page > 1) params.set('page', String(page))
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (stateFilter) params.set('state', stateFilter)
    if (typeFilter) params.set('type', typeFilter)
    if (verificationFilter) params.set('verification', verificationFilter)
    const qs = params.toString()
    router.replace(`/admin/listings${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [statusFilter, page, debouncedSearch, stateFilter, typeFilter, verificationFilter, router])

  async function handleSuspend(businessId: string) {
    setActionLoading(businessId)
    const result = await adminSuspendBusiness(businessId)
    if (!result.error) await fetchListings()
    setActionLoading(null)
  }

  async function handleUnsuspend(businessId: string) {
    setActionLoading(businessId)
    const result = await adminUnsuspendBusiness(businessId)
    if (!result.error) await fetchListings()
    setActionLoading(null)
  }

  async function handleSoftDelete(businessId: string) {
    if (!confirm('Are you sure you want to soft-delete this listing? It can be restored later.')) return
    setActionLoading(businessId)
    const result = await adminSoftDeleteListing(businessId)
    if (!('error' in result)) await fetchListings()
    setActionLoading(null)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const statusTabs: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Published', value: 'published' },
    { label: 'Draft', value: 'draft' },
    { label: 'Paused', value: 'paused' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Deleted', value: 'deleted' },
  ]

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      published: 'bg-green-100 text-green-800',
      draft: 'bg-yellow-100 text-yellow-800',
      paused: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
      deleted: 'bg-red-200 text-red-900',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    )
  }

  function getTypeBadge(type: string) {
    const colors: Record<string, string> = {
      seed: 'bg-sky-100 text-sky-800',
      claimed: 'bg-indigo-100 text-indigo-800',
      'user-created': 'bg-emerald-100 text-emerald-800',
    }
    const labels: Record<string, string> = {
      seed: 'Seed',
      claimed: 'Claimed',
      'user-created': 'User',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-gray-100 text-gray-800'}`}>
        {labels[type] ?? type}
      </span>
    )
  }

  function clearFilters() {
    setStatusFilter('all')
    setSearchQuery('')
    setDebouncedSearch('')
    setStateFilter('')
    setTypeFilter('')
    setVerificationFilter('')
    setPage(1)
  }

  const hasFilters = statusFilter !== 'all' || debouncedSearch || stateFilter || typeFilter || verificationFilter

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Listings</h1>
        <p className="text-sm text-gray-500">{totalCount} total</p>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by business name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value); setPage(1) }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          <option value="">All States</option>
          {AU_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); setPage(1) }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          <option value="">All Types</option>
          <option value="seed">Seed</option>
          <option value="claimed">Claimed</option>
          <option value="user">User-Created</option>
        </select>
        <select
          value={verificationFilter}
          onChange={(e) => { setVerificationFilter(e.target.value as VerificationFilter); setPage(1) }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          <option value="">All Verification</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1) }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Business</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Searchable</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Reports</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">No listings found.</td>
                </tr>
              ) : (
                listings.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{listing.name}</div>
                      <div className="text-xs text-gray-400">
                        {listing.ownerId ? (
                          <Link
                            href={`/admin/accounts/${listing.ownerId}`}
                            className="hover:text-brand-600 hover:underline"
                          >
                            {listing.ownerEmail ?? 'Unknown'}
                          </Link>
                        ) : (
                          <span>No owner</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getTypeBadge(listing.type)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(listing.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {listing.searchable ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {listing.reportCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {listing.reportCount}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(listing.createdAt).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2 shrink-0">
                        <Link
                          href={`/admin/listings/${listing.id}`}
                          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          Detail
                        </Link>
                        {listing.status === 'deleted' ? null : listing.status === 'suspended' ? (
                          <button
                            onClick={() => handleUnsuspend(listing.id)}
                            disabled={actionLoading === listing.id}
                            className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === listing.id ? '...' : 'Unsuspend'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSuspend(listing.id)}
                              disabled={actionLoading === listing.id}
                              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === listing.id ? '...' : 'Suspend'}
                            </button>
                            <button
                              onClick={() => handleSoftDelete(listing.id)}
                              disabled={actionLoading === listing.id}
                              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === listing.id ? '...' : 'Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="flex items-center px-3 text-sm text-gray-700">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
