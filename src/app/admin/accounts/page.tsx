'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAdminAccounts, type AdminAccountItem } from '@/app/actions/admin-accounts'

const PAGE_SIZE = 20

export default function AdminAccountsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialPage = parseInt(searchParams.get('page') || '1', 10)
  const initialSearch = searchParams.get('q') || ''

  const [accounts, setAccounts] = useState<AdminAccountItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [page, setPage] = useState(initialPage)
  const [totalCount, setTotalCount] = useState(0)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    const result = await getAdminAccounts(page, debouncedSearch || undefined)
    setAccounts(result.data)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (debouncedSearch) params.set('q', debouncedSearch)
    const qs = params.toString()
    router.replace(`/admin/accounts${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [page, debouncedSearch, router])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  function getPlanBadge(account: AdminAccountItem) {
    if (!account.plan) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
          No Plan
        </span>
      )
    }
    if (account.isTrial) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Free Trial
        </span>
      )
    }
    const colors: Record<string, string> = {
      basic: 'bg-green-50 text-green-700',
      premium: 'bg-purple-50 text-purple-700',
      premium_annual: 'bg-indigo-50 text-indigo-700',
    }
    const labels: Record<string, string> = {
      basic: 'Basic',
      premium: 'Premium',
      premium_annual: 'Annual Premium',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[account.plan] ?? 'bg-gray-50 text-gray-500'}`}>
        {labels[account.plan] ?? account.plan}
      </span>
    )
  }

  function getStatusBadge(account: AdminAccountItem) {
    if (!account.subscriptionStatus) {
      return <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">None</span>
    }
    if (account.isActive) {
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
          Active{account.cancelAtPeriodEnd ? ' (canceling)' : ''}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        {account.subscriptionStatus}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <p className="text-sm text-gray-500">{totalCount} total</p>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by email, user ID, or business name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full max-w-lg rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Plan + Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Billing</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Listings</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">No accounts found.</td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{account.email}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{account.userId.slice(0, 8)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {getPlanBadge(account)}
                        {getStatusBadge(account)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {account.billingStatus === 'none' ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          No Sub
                        </span>
                      ) : account.billingStatus === 'billing_suspended' ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Suspended
                        </span>
                      ) : account.billingStatus === 'paused_subscription_expired' ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Subscription Expired
                        </span>
                      ) : account.billingStatus === 'paused_payment_failed' ? (
                        <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Payment Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {account.activeListingCount}/{account.businessCount}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/accounts/${account.userId}`}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        View
                      </Link>
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
