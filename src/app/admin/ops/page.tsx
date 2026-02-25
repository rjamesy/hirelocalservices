'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSubscriptionMetrics, getListingMetrics, getModerationMetrics } from '@/app/actions/ops-metrics'

type TimePeriod = 7 | 14 | 30 | 90

export default function AdminOpsPage() {
  const [period, setPeriod] = useState<TimePeriod>(30)
  const [loading, setLoading] = useState(true)
  const [subMetrics, setSubMetrics] = useState<any>(null)
  const [listMetrics, setListMetrics] = useState<any>(null)
  const [modMetrics, setModMetrics] = useState<any>(null)

  async function loadMetrics(days: number) {
    setLoading(true)
    const [sub, list, mod] = await Promise.all([
      getSubscriptionMetrics(days),
      getListingMetrics(days),
      getModerationMetrics(days),
    ])
    setSubMetrics(sub)
    setListMetrics(list)
    setModMetrics(mod)
    setLoading(false)
  }

  useEffect(() => {
    loadMetrics(period)
  }, [period])

  function StatCard({ label, value, color = 'gray' }: { label: string; value: number | string; color?: string }) {
    const colors: Record<string, string> = {
      green: 'bg-green-50 border-green-200 text-green-900',
      blue: 'bg-blue-50 border-blue-200 text-blue-900',
      red: 'bg-red-50 border-red-200 text-red-900',
      orange: 'bg-orange-50 border-orange-200 text-orange-900',
      gray: 'bg-gray-50 border-gray-200 text-gray-900',
      purple: 'bg-purple-50 border-purple-200 text-purple-900',
    }
    return (
      <div className={`rounded-lg border p-4 ${colors[color] ?? colors.gray}`}>
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </div>
    )
  }

  function BarChart({ data, maxVal }: { data: Array<{ label: string; value: number }>; maxVal?: number }) {
    const max = maxVal ?? Math.max(...data.map(d => d.value), 1)
    return (
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-20 text-xs text-gray-500 text-right truncate">{d.label}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded transition-all"
                style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span className="w-8 text-xs text-gray-600 text-right">{d.value}</span>
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Operational Reports</h1>
        <p className="text-gray-500">Loading metrics...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Operational Reports</h1>
        <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700">
          Back to Dashboard
        </Link>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {([7, 14, 30, 90] as TimePeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p}d
          </button>
        ))}
      </div>

      {/* Subscriptions Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscriptions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <StatCard label="Active" value={subMetrics?.active_count ?? 0} color="green" />
          <StatCard label="Trials" value={subMetrics?.trial_count ?? 0} color="blue" />
          <StatCard label="Past Due" value={subMetrics?.past_due_count ?? 0} color="orange" />
          <StatCard label="Expiring Trials" value={subMetrics?.expiring_trials ?? 0} color="red" />
        </div>

        {subMetrics?.by_plan && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">By Plan</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(subMetrics.by_plan as any[]).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-sm text-gray-900 capitalize">{row.plan?.replace('_', ' ')}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 text-right">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subMetrics?.new_by_day && (subMetrics.new_by_day as any[]).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">New Subscriptions by Day</h3>
            <BarChart
              data={(subMetrics.new_by_day as any[]).map((d: any) => ({
                label: new Date(d.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                value: d.count,
              }))}
            />
          </div>
        )}
      </section>

      {/* Listings Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Listings</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <StatCard label="Total" value={listMetrics?.total ?? 0} />
          <StatCard label="Published" value={listMetrics?.published ?? 0} color="green" />
          <StatCard label="Draft" value={listMetrics?.draft ?? 0} color="orange" />
          <StatCard label="Suspended" value={listMetrics?.suspended ?? 0} color="red" />
          <StatCard label="Paused" value={listMetrics?.paused ?? 0} color="gray" />
          <StatCard label="Deleted" value={listMetrics?.deleted ?? 0} color="red" />
        </div>

        {listMetrics?.by_state && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Coverage by State</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Listings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(listMetrics.by_state as any[]).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-sm text-gray-900">{row.state}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 text-right">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {listMetrics?.by_category && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Top Categories</h3>
            <BarChart
              data={(listMetrics.by_category as any[]).map((d: any) => ({
                label: d.category,
                value: d.count,
              }))}
            />
          </div>
        )}

        {listMetrics?.new_by_day && (listMetrics.new_by_day as any[]).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">New Listings by Day</h3>
            <BarChart
              data={(listMetrics.new_by_day as any[]).map((d: any) => ({
                label: new Date(d.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                value: d.count,
              }))}
            />
          </div>
        )}
      </section>

      {/* Moderation Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Moderation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <StatCard label="Open Reports" value={modMetrics?.open_reports ?? 0} color="red" />
          <StatCard label="Resolved ({period}d)" value={modMetrics?.resolved_reports ?? 0} color="green" />
          <StatCard label="Pending Claims" value={modMetrics?.pending_claims ?? 0} color="orange" />
          <StatCard label="Pending Verification" value={modMetrics?.pending_verification ?? 0} color="purple" />
        </div>

        {modMetrics?.reports_by_reason && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Reports by Reason</h3>
            <BarChart
              data={(modMetrics.reports_by_reason as any[]).map((d: any) => ({
                label: d.reason,
                value: d.count,
              }))}
            />
          </div>
        )}

        {modMetrics?.verification_decisions && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Verification Decisions ({period}d)</h3>
            <BarChart
              data={(modMetrics.verification_decisions as any[]).map((d: any) => ({
                label: d.decision,
                value: d.count,
              }))}
            />
          </div>
        )}

        {modMetrics?.claims_by_day && (modMetrics.claims_by_day as any[]).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Claims Volume ({period}d)</h3>
            <BarChart
              data={(modMetrics.claims_by_day as any[]).map((d: any) => ({
                label: new Date(d.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                value: d.count,
              }))}
            />
          </div>
        )}
      </section>
    </div>
  )
}
