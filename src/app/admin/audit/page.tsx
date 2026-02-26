'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuditLog, getAuditActors, type AuditFilters } from '@/app/actions/audit'
import type { AuditAction, AuditLogEntry } from '@/lib/types'

const ACTION_COLORS: Record<string, string> = {
  listing_created: 'bg-green-100 text-green-800',
  listing_updated: 'bg-blue-100 text-blue-800',
  listing_claimed: 'bg-blue-100 text-blue-800',
  listing_suspended: 'bg-red-100 text-red-800',
  listing_unsuspended: 'bg-green-100 text-green-800',
  listing_unlisted: 'bg-orange-100 text-orange-800',
  listing_claim_submitted: 'bg-indigo-100 text-indigo-800',
  listing_claim_approved: 'bg-green-100 text-green-800',
  listing_claim_rejected: 'bg-red-100 text-red-800',
  seed_ingested: 'bg-sky-100 text-sky-800',
  reset_executed: 'bg-red-100 text-red-800',
  settings_changed: 'bg-purple-100 text-purple-800',
  verification_completed: 'bg-teal-100 text-teal-800',
  listing_deleted: 'bg-red-200 text-red-900',
  listing_restored: 'bg-green-100 text-green-800',
  listing_transferred: 'bg-indigo-100 text-indigo-800',
  listing_paused: 'bg-gray-100 text-gray-800',
  listing_pending_approved: 'bg-green-100 text-green-800',
  listing_pending_rejected: 'bg-red-100 text-red-800',
  account_plan_changed: 'bg-purple-100 text-purple-800',
  account_suspended: 'bg-red-100 text-red-800',
  account_unsuspended: 'bg-green-100 text-green-800',
  account_deleted: 'bg-red-200 text-red-900',
  account_notes_updated: 'bg-gray-100 text-gray-800',
  report_resolved: 'bg-green-100 text-green-800',
  report_revalidated: 'bg-teal-100 text-teal-800',
}

const ALL_ACTIONS: string[] = [
  'listing_created', 'listing_updated', 'listing_claimed', 'listing_suspended',
  'listing_unsuspended', 'listing_unlisted', 'listing_claim_submitted',
  'listing_claim_approved', 'listing_claim_rejected', 'seed_ingested',
  'reset_executed', 'settings_changed', 'verification_completed',
  'listing_deleted', 'listing_restored', 'listing_transferred',
  'listing_paused', 'listing_pending_approved', 'listing_pending_rejected',
  'account_plan_changed', 'account_suspended', 'account_unsuspended',
  'account_deleted', 'account_notes_updated', 'report_resolved', 'report_revalidated',
]

const ENTITY_TYPES = ['listing', 'report', 'account', 'system', 'claim']

export default function AdminAuditPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10))
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actors, setActors] = useState<Array<{ id: string; email: string }>>([])

  // Filters
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '')
  const [actionFilter, setActionFilter] = useState(searchParams.get('action') || '')
  const [actorFilter, setActorFilter] = useState(searchParams.get('actor') || '')
  const [entityTypeFilter, setEntityTypeFilter] = useState(searchParams.get('entity_type') || '')
  const [entityIdFilter, setEntityIdFilter] = useState(searchParams.get('entity_id') || '')

  useEffect(() => {
    getAuditActors().then(setActors)
  }, [])

  const loadPage = useCallback(async () => {
    setLoading(true)
    const filters: AuditFilters = {
      page,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      action: actionFilter || undefined,
      actorId: actorFilter || undefined,
      entityType: entityTypeFilter || undefined,
      entityId: entityIdFilter || undefined,
    }
    const result = await getAuditLog(filters)
    setEntries(result.data)
    setTotalPages(result.totalPages)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [page, dateFrom, dateTo, actionFilter, actorFilter, entityTypeFilter, entityIdFilter])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    if (actionFilter) params.set('action', actionFilter)
    if (actorFilter) params.set('actor', actorFilter)
    if (entityTypeFilter) params.set('entity_type', entityTypeFilter)
    if (entityIdFilter) params.set('entity_id', entityIdFilter)
    const qs = params.toString()
    router.replace(`/admin/audit${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [page, dateFrom, dateTo, actionFilter, actorFilter, entityTypeFilter, entityIdFilter, router])

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setActionFilter('')
    setActorFilter('')
    setEntityTypeFilter('')
    setEntityIdFilter('')
    setPage(1)
  }

  const hasFilters = dateFrom || dateTo || actionFilter || actorFilter || entityTypeFilter || entityIdFilter

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{totalCount} entries</span>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700">
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Actions</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1) }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Actor</label>
            <select
              value={actorFilter}
              onChange={(e) => { setActorFilter(e.target.value); setPage(1) }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Actors</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity ID</label>
            <input
              type="text"
              value={entityIdFilter}
              onChange={(e) => { setEntityIdFilter(e.target.value); setPage(1) }}
              placeholder="UUID..."
              className="w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No audit log entries found.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table data-testid="admin-audit-table" className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entity Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entity ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} data-testid="admin-audit-row" className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(entry.created_at).toLocaleString('en-AU')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-800'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {entry.entity_type ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 font-mono">
                      {entry.entity_id ? (
                        <span title={entry.entity_id}>{entry.entity_id.slice(0, 8)}...</span>
                      ) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 font-mono">
                      {entry.actor_id ? (
                        <Link href={`/admin/accounts/${entry.actor_id}`} className="hover:text-brand-600 hover:underline" title={entry.actor_id}>
                          {entry.actor_id.slice(0, 8)}...
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {entry.details && Object.keys(entry.details).length > 0 ? (
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-xs text-brand-600 hover:text-brand-700"
                        >
                          {expandedId === entry.id ? 'Hide' : 'View'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {expandedId === entry.id && (
                        <pre className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700 overflow-auto max-w-md">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
