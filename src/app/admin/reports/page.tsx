'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface AdminReport {
  id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  business_id: string
  business_name: string
  business_slug: string
  reporter_ip_hash: string
}

type ReportStatusFilter = 'open' | 'resolved'

const PAGE_SIZE = 20

export default function AdminReportsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialStatus = (searchParams.get('status') as ReportStatusFilter) || 'open'
  const initialPage = parseInt(searchParams.get('page') || '1', 10)

  const [reports, setReports] = useState<AdminReport[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>(initialStatus)
  const [page, setPage] = useState(initialPage)
  const [totalCount, setTotalCount] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const supabase = createClient()

  const fetchReports = useCallback(async () => {
    setLoading(true)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count, error } = await supabase
      .from('reports')
      .select(
        `
        id,
        reason,
        details,
        status,
        created_at,
        business_id,
        reporter_ip_hash,
        businesses!reports_business_id_fkey ( name, slug )
      `,
        { count: 'exact' }
      )
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error && data) {
      const mapped: AdminReport[] = data.map((r: Record<string, unknown>) => {
        const businesses = r.businesses as { name: string; slug: string } | { name: string; slug: string }[] | null
        const biz = Array.isArray(businesses) ? businesses[0] : businesses

        return {
          id: r.id as string,
          reason: r.reason as string,
          details: r.details as string | null,
          status: r.status as string,
          created_at: r.created_at as string,
          business_id: r.business_id as string,
          reporter_ip_hash: r.reporter_ip_hash as string,
          business_name: biz?.name ?? 'Unknown',
          business_slug: biz?.slug ?? '',
        }
      })
      setReports(mapped)
      setTotalCount(count ?? 0)
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter !== 'open') params.set('status', statusFilter)
    if (page > 1) params.set('page', String(page))
    const qs = params.toString()
    router.replace(`/admin/reports${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [statusFilter, page, router])

  async function handleResolve(reportId: string) {
    setActionLoading(reportId)
    const { error } = await supabase
      .from('reports')
      .update({ status: 'resolved' })
      .eq('id', reportId)

    if (!error) {
      await fetchReports()
    }
    setActionLoading(null)
  }

  async function handleSuspendBusiness(businessId: string, reportId: string) {
    setActionLoading(reportId)

    // Suspend the business
    const { error: suspendError } = await supabase
      .from('businesses')
      .update({ status: 'suspended' })
      .eq('id', businessId)

    if (suspendError) {
      setActionLoading(null)
      return
    }

    // Also resolve the report
    await supabase
      .from('reports')
      .update({ status: 'resolved' })
      .eq('id', reportId)

    await fetchReports()
    setActionLoading(null)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const statusTabs: { label: string; value: ReportStatusFilter }[] = [
    { label: 'Open', value: 'open' },
    { label: 'Resolved', value: 'resolved' },
  ]

  function getReasonLabel(reason: string) {
    const labels: Record<string, string> = {
      spam: 'Spam',
      inappropriate: 'Inappropriate',
      fake: 'Fake Listing',
      other: 'Other',
    }
    return labels[reason] ?? reason
  }

  function getReasonBadge(reason: string) {
    const colors: Record<string, string> = {
      spam: 'bg-purple-100 text-purple-800',
      inappropriate: 'bg-red-100 text-red-800',
      fake: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800',
    }
    const colorClass = colors[reason] ?? 'bg-gray-100 text-gray-800'
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      >
        {getReasonLabel(reason)}
      </span>
    )
  }

  function truncateText(text: string | null, maxLength: number): string {
    if (!text) return '-'
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">{totalCount} total</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value)
              setPage(1)
            }}
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Reporter
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                    {statusFilter === 'open'
                      ? 'No open reports. All clear!'
                      : 'No resolved reports found.'}
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {report.business_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getReasonBadge(report.reason)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                      <span title={report.details ?? undefined}>
                        {truncateText(report.details, 80)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      <span className="font-mono text-xs" title={report.reporter_ip_hash}>
                        {report.reporter_ip_hash.slice(0, 12)}...
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(report.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/business/${report.business_slug}`}
                          target="_blank"
                          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          View Business
                        </Link>
                        {report.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleResolve(report.id)}
                              disabled={actionLoading === report.id}
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === report.id ? 'Working...' : 'Resolve'}
                            </button>
                            <button
                              onClick={() =>
                                handleSuspendBusiness(report.business_id, report.id)
                              }
                              disabled={actionLoading === report.id}
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === report.id ? 'Working...' : 'Suspend Business'}
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
              Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} results
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="flex items-center px-3 text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
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
