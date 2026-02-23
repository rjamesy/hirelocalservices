'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAuditLog } from '@/app/actions/audit'
import type { AuditLogEntry } from '@/lib/types'

const ACTION_COLORS: Record<string, string> = {
  listing_created: 'bg-green-100 text-green-800',
  listing_claimed: 'bg-blue-100 text-blue-800',
  listing_suspended: 'bg-red-100 text-red-800',
  listing_unlisted: 'bg-orange-100 text-orange-800',
  seed_ingested: 'bg-sky-100 text-sky-800',
  reset_executed: 'bg-red-100 text-red-800',
  settings_changed: 'bg-purple-100 text-purple-800',
  verification_completed: 'bg-teal-100 text-teal-800',
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function loadPage(p: number) {
    setLoading(true)
    const result = await getAuditLog(p)
    setEntries(result.data)
    setTotalPages(result.totalPages)
    setPage(result.page)
    setLoading(false)
  }

  useEffect(() => {
    loadPage(1)
  }, [])

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700">
          Back to Dashboard
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No audit log entries yet.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
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
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(entry.created_at).toLocaleString()}
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
                      {entry.entity_id ? entry.entity_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 font-mono">
                      {entry.actor_id ? entry.actor_id.slice(0, 8) + '...' : '—'}
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
                        <pre className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700 overflow-auto max-w-xs">
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
                onClick={() => loadPage(page - 1)}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => loadPage(page + 1)}
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
