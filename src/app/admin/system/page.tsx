'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSettings, updateSetting } from '@/app/actions/system-settings'
import { getBlacklistEntries, addBlacklistEntry, removeBlacklistEntry } from '@/app/actions/blacklist'
import { resetAllData, validateResetState, toggleResetFlag, isProductionEnvironment, getResetFlag } from '@/app/actions/data-reset'
import {
  getAdminProtectionData,
  updateProtectionFlag,
  activateKillSwitch,
  activateMaintenanceMode,
  adminResetCircuitBreaker,
} from '@/app/actions/protection'
import { getSystemAlerts, resolveAlert } from '@/app/actions/alerts'
import {
  getSeedStats,
  getSeedBlacklist,
  addSeedBlacklistEntry,
  removeSeedBlacklistEntry,
} from '@/app/actions/seed-admin'
import type { SystemFlags, SystemAlert } from '@/lib/types'

type Tab = 'seed' | 'ai' | 'email' | 'ranking' | 'listings' | 'reset' | 'blacklist' | 'protection' | 'alerts'

function SeedStatsPanel() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSeedStats().then((s) => { setStats(s); setLoading(false) })
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Loading seed stats...</p>
  if (!stats) return <p className="text-sm text-red-500">Failed to load stats.</p>

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Total Seeds</p>
        <p className="text-lg font-bold text-gray-900">{stats.total}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Avg Confidence</p>
        <p className="text-lg font-bold text-gray-900">{stats.avgConfidence}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">With Phone</p>
        <p className="text-lg font-bold text-gray-900">{stats.withPhone}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Without Phone</p>
        <p className="text-lg font-bold text-gray-900">{stats.withoutPhone}</p>
      </div>
      {Object.entries(stats.sourceCounts as Record<string, number>).map(([src, count]) => (
        <div key={src} className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">{src}</p>
          <p className="text-lg font-bold text-gray-900">{count}</p>
        </div>
      ))}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Confidence &lt;0.3</p>
        <p className="text-lg font-bold text-red-600">{stats.brackets.low}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Confidence 0.3-0.5</p>
        <p className="text-lg font-bold text-yellow-600">{stats.brackets.medium}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Confidence 0.5-0.7</p>
        <p className="text-lg font-bold text-blue-600">{stats.brackets.good}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500">Confidence 0.7+</p>
        <p className="text-lg font-bold text-green-600">{stats.brackets.high}</p>
      </div>
    </div>
  )
}

function SeedBlacklistPanel() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [placeId, setPlaceId] = useState('')
  const [bizName, setBizName] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getSeedBlacklist().then((r) => { setEntries(r.data); setLoading(false) })
  }, [])

  async function handleAdd() {
    setMsg('')
    const result = await addSeedBlacklistEntry(placeId || null, bizName || null, reason)
    if (result.error) {
      setMsg(result.error)
    } else {
      setPlaceId('')
      setBizName('')
      setReason('')
      const refreshed = await getSeedBlacklist()
      setEntries(refreshed.data)
    }
  }

  async function handleRemove(id: string) {
    await removeSeedBlacklistEntry(id)
    const refreshed = await getSeedBlacklist()
    setEntries(refreshed.data)
  }

  if (loading) return <p className="text-sm text-gray-500">Loading blacklist...</p>

  return (
    <div className="space-y-3">
      {/* Add form */}
      <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Google Place ID"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="Business name"
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!reason || (!placeId && !bizName)}
          className="self-start rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Add to Blacklist
        </button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No seed blacklist entries.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">Place ID / Name</th>
                <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e: any) => (
                <tr key={e.id}>
                  <td className="py-2 pr-4 text-gray-700">
                    {e.google_place_id && <span className="font-mono text-xs">{e.google_place_id}</span>}
                    {e.business_name && <span>{e.business_name}</span>}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{e.reason}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRemove(e.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AdminSystemPage() {
  const [tab, setTab] = useState<Tab>('seed')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Blacklist state
  const [blacklistEntries, setBlacklistEntries] = useState<any[]>([])
  const [newTerm, setNewTerm] = useState('')
  const [newMatchType, setNewMatchType] = useState<'exact' | 'contains' | 'starts_with'>('contains')
  const [newReason, setNewReason] = useState('')

  // API key state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyEditing, setApiKeyEditing] = useState(false)

  // Email sub-tab state
  const [emailSubTab, setEmailSubTab] = useState<'seed' | 'claim_approved' | 'claim_rejected'>('seed')

  // Reset state
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetEnabled, setResetEnabled] = useState(false)
  const [resetEnabledLoading, setResetEnabledLoading] = useState(true)
  const [isProduction, setIsProduction] = useState(false)
  const [productionPhrase, setProductionPhrase] = useState('')
  const [resetResult, setResetResult] = useState<any>(null)
  const [dryRunResult, setDryRunResult] = useState<any>(null)
  const [dryRunning, setDryRunning] = useState(false)
  const [validationResult, setValidationResult] = useState<any>(null)
  const [validating, setValidating] = useState(false)

  // Protection state
  const [protectionFlags, setProtectionFlags] = useState<SystemFlags | null>(null)
  const [abuseCounts, setAbuseCounts] = useState<Record<string, number>>({})
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [protectionLoading, setProtectionLoading] = useState(false)

  // Alerts state
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertFilter, setAlertFilter] = useState<'all' | '24h' | '7d' | '30d'>('7d')

  async function loadSettings() {
    setLoading(true)
    const data = await getSettings()
    setSettings(data)
    setLoading(false)
  }

  async function loadBlacklist() {
    const result = await getBlacklistEntries()
    setBlacklistEntries(result.data)
  }

  async function loadProtection() {
    setProtectionLoading(true)
    try {
      const data = await getAdminProtectionData()
      setProtectionFlags(data.flags)
      setAbuseCounts(data.abuseCounts)
      setRecentEvents(data.recentEvents)
    } catch (e) {
      console.error('Failed to load protection data:', e)
    }
    setProtectionLoading(false)
  }

  async function loadAlerts() {
    setAlertsLoading(true)
    try {
      const days = alertFilter === '24h' ? 1 : alertFilter === '7d' ? 7 : alertFilter === '30d' ? 30 : undefined
      const result = await getSystemAlerts({ days })
      setAlerts(result.data)
    } catch (e) {
      console.error('Failed to load alerts:', e)
    }
    setAlertsLoading(false)
  }

  async function loadResetState() {
    setResetEnabledLoading(true)
    try {
      const [flagResult, prodResult] = await Promise.all([getResetFlag(), isProductionEnvironment()])
      setResetEnabled(flagResult.enabled)
      setIsProduction(prodResult.isProduction)
    } catch (e) {
      console.error('Failed to load reset state:', e)
    }
    setResetEnabledLoading(false)
  }

  useEffect(() => {
    loadSettings()
    loadBlacklist()
    loadProtection()
    loadAlerts()
    loadResetState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadAlerts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertFilter])

  async function saveSetting(key: string, value: unknown) {
    setSaving(true)
    setMessage(null)
    const result = await updateSetting(key as any, value)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setSettings((prev) => ({ ...prev, [key]: value }))
      setMessage({ type: 'success', text: `Saved "${key}" successfully.` })
    }
    setSaving(false)
  }

  async function handleAddBlacklist() {
    if (!newTerm.trim()) return
    const result = await addBlacklistEntry(newTerm, newMatchType, newReason || undefined)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setNewTerm('')
      setNewReason('')
      loadBlacklist()
      setMessage({ type: 'success', text: 'Blacklist entry added.' })
    }
  }

  async function handleRemoveBlacklist(id: string) {
    await removeBlacklistEntry(id)
    loadBlacklist()
  }

  async function handleReset() {
    setResetting(true)
    setMessage(null)
    setResetResult(null)
    const result = await resetAllData(
      resetPhrase,
      resetConfirm,
      false,
      isProduction ? productionPhrase : undefined
    )
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setResetResult(result.data)
      setMessage({ type: 'success', text: 'Operational data reset completed successfully.' })
      setResetPhrase('')
      setResetConfirm(false)
      setProductionPhrase('')
      setResetEnabled(false)
    }
    setResetting(false)
  }

  async function handleDryRun() {
    setDryRunning(true)
    setMessage(null)
    setDryRunResult(null)
    const result = await resetAllData('RESET ALL OPERATIONAL DATA', false, true)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setDryRunResult(result.data)
    }
    setDryRunning(false)
  }

  async function handleValidate() {
    setValidating(true)
    setValidationResult(null)
    const result = await validateResetState()
    setValidationResult(result)
    setValidating(false)
  }

  async function handleToggleResetFlag(enabled: boolean) {
    const result = await toggleResetFlag(enabled)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setResetEnabled(enabled)
      setMessage({ type: 'success', text: enabled ? 'Operational reset enabled.' : 'Operational reset disabled.' })
      if (!enabled) {
        setResetResult(null)
        setDryRunResult(null)
        setValidationResult(null)
        setResetPhrase('')
        setResetConfirm(false)
        setProductionPhrase('')
      }
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'protection', label: 'Protection' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'seed', label: 'Seed Controls' },
    { key: 'ai', label: 'AI Verification' },
    { key: 'email', label: 'Email Template' },
    { key: 'ranking', label: 'Ranking' },
    { key: 'listings', label: 'Listings' },
    { key: 'reset', label: 'Data Reset' },
    { key: 'blacklist', label: 'Blacklist' },
  ]

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">System Settings</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700">
          Back to Dashboard
        </Link>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              data-testid={`admin-tab-${t.key}`}
              onClick={() => { setTab(t.key); setMessage(null) }}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        {tab === 'protection' && (
          <div className="space-y-8">
            <h2 className="text-lg font-semibold text-gray-900">Protection Controls</h2>

            {protectionLoading ? (
              <p className="text-gray-500">Loading protection data...</p>
            ) : protectionFlags ? (
              <>
                {/* System Flag Toggles */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">System Flags</h3>
                  {([
                    { key: 'registrations_enabled' as const, label: 'Registrations Enabled' },
                    { key: 'listings_enabled' as const, label: 'Listings Enabled' },
                    { key: 'claims_enabled' as const, label: 'Claims Enabled' },
                    { key: 'payments_enabled' as const, label: 'Payments Enabled' },
                    { key: 'captcha_required' as const, label: 'Captcha Required' },
                    { key: 'listings_require_approval' as const, label: 'Listings Require Approval' },
                    { key: 'soft_launch_mode' as const, label: 'Soft Launch Mode' },
                    { key: 'seed_require_phone' as const, label: 'Seeds Require Phone' },
                  ] as const).map((flag) => (
                    <label key={flag.key} className="flex items-center gap-3">
                      <input
                        data-testid={`admin-flag-toggle-${flag.key}`}
                        type="checkbox"
                        checked={Boolean(protectionFlags[flag.key])}
                        onChange={async (e) => {
                          const newValue = e.target.checked
                          setProtectionFlags((f) => f ? { ...f, [flag.key]: newValue } : f)
                          const result = await updateProtectionFlag(flag.key, newValue)
                          if (result && 'error' in result) {
                            setMessage({ type: 'error', text: result.error ?? 'Failed to update flag' })
                            setProtectionFlags((f) => f ? { ...f, [flag.key]: !newValue } : f)
                          } else {
                            setMessage({ type: 'success', text: `${flag.label} updated.` })
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600"
                      />
                      <span className="text-sm font-medium text-gray-700">{flag.label}</span>
                    </label>
                  ))}

                  {/* Maintenance Mode */}
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(protectionFlags.maintenance_mode)}
                      onChange={async (e) => {
                        const newValue = e.target.checked
                        if (newValue && !confirm('Enable maintenance mode? Non-admin routes will show the maintenance page.')) return
                        setProtectionFlags((f) => f ? { ...f, maintenance_mode: newValue } : f)
                        const result = await updateProtectionFlag('maintenance_mode', newValue)
                        if (result && 'error' in result) {
                          setMessage({ type: 'error', text: result.error ?? 'Failed' })
                          setProtectionFlags((f) => f ? { ...f, maintenance_mode: !newValue } : f)
                        } else {
                          setMessage({ type: 'success', text: `Maintenance mode ${newValue ? 'enabled' : 'disabled'}.` })
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Maintenance Mode</span>
                  </label>

                  {protectionFlags.maintenance_mode && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Message</label>
                      <textarea
                        value={protectionFlags.maintenance_message}
                        onChange={(e) => setProtectionFlags((f) => f ? { ...f, maintenance_message: e.target.value } : f)}
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={async () => {
                          await updateProtectionFlag('maintenance_message', protectionFlags.maintenance_message)
                          setMessage({ type: 'success', text: 'Maintenance message updated.' })
                        }}
                        className="mt-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        Save Message
                      </button>
                    </div>
                  )}
                </div>

                {/* Seed Min Confidence */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Seed Min Confidence: {protectionFlags.seed_min_confidence?.toFixed(2) ?? '0.50'}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={protectionFlags.seed_min_confidence ?? 0.5}
                    onChange={(e) => setProtectionFlags((f) => f ? { ...f, seed_min_confidence: Number(e.target.value) } : f)}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0.00 (all seeds)</span>
                    <span>1.00 (highest only)</span>
                  </div>
                  <button
                    onClick={async () => {
                      await updateProtectionFlag('seed_min_confidence', protectionFlags.seed_min_confidence ?? 0.5)
                      setMessage({ type: 'success', text: 'Seed minimum confidence updated.' })
                    }}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Save
                  </button>
                </div>

                <hr className="border-gray-200" />

                {/* Emergency Kill Switch */}
                <div data-testid="admin-kill-switch" className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-red-800">Emergency Kill Switch</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        if (!confirm('Disable all registrations immediately?')) return
                        await activateKillSwitch()
                        setProtectionFlags((f) => f ? { ...f, registrations_enabled: false } : f)
                        setMessage({ type: 'success', text: 'Registrations disabled.' })
                      }}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Disable All Registrations
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Enable maintenance mode? All non-admin routes will show the maintenance page.')) return
                        await activateMaintenanceMode()
                        setProtectionFlags((f) => f ? { ...f, maintenance_mode: true } : f)
                        setMessage({ type: 'success', text: 'Maintenance mode enabled.' })
                      }}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Enable Maintenance Mode
                    </button>
                  </div>
                </div>

                <hr className="border-gray-200" />

                {/* Circuit Breaker Status */}
                <div data-testid="admin-circuit-breaker" className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-800">Circuit Breaker Status</h3>
                  {protectionFlags.circuit_breaker_triggered_at ? (
                    <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                      <p className="text-sm text-yellow-800 font-medium">
                        Circuit breaker TRIGGERED at{' '}
                        {new Date(protectionFlags.circuit_breaker_triggered_at).toLocaleString()}
                      </p>
                      <button
                        onClick={async () => {
                          await adminResetCircuitBreaker()
                          setProtectionFlags((f) => f ? { ...f, circuit_breaker_triggered_at: null, registrations_enabled: true } : f)
                          setMessage({ type: 'success', text: 'Circuit breaker reset. Registrations re-enabled.' })
                        }}
                        className="mt-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
                      >
                        Reset Circuit Breaker
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-green-700">Circuit breaker is inactive (normal operation).</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Object.entries(abuseCounts).map(([type, count]) => (
                      <div key={type} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500 truncate">{type.replace(/_/g, ' ')}</p>
                        <p className="text-lg font-bold text-gray-900">{count}</p>
                        <p className="text-xs text-gray-400">last 5 min</p>
                      </div>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-200" />

                {/* Recent Abuse Events */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">Recent Abuse Events</h3>
                    <button
                      onClick={loadProtection}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Refresh
                    </button>
                  </div>
                  {recentEvents.length === 0 ? (
                    <p className="text-sm text-gray-500">No recent abuse events.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {recentEvents.map((evt: any) => (
                            <tr key={evt.id}>
                              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                                {new Date(evt.created_at).toLocaleString()}
                              </td>
                              <td className="py-2 pr-4">
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {evt.event_type}
                                </span>
                              </td>
                              <td className="py-2 pr-4 text-gray-500 font-mono text-xs">{evt.ip_address || '—'}</td>
                              <td className="py-2 pr-4 text-gray-500 font-mono text-xs truncate max-w-[120px]">{evt.user_id || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-red-600">Failed to load protection data.</p>
            )}
          </div>
        )}

        {tab === 'seed' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Seed Controls</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Visibility Days (how long seed listings remain visible)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  value={Number(settings.seed_visibility_days ?? 30)}
                  onChange={(e) => setSettings((s) => ({ ...s, seed_visibility_days: Number(e.target.value) }))}
                  className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => saveSetting('seed_visibility_days', Number(settings.seed_visibility_days ?? 30))}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings.mask_seed_phone ?? true)}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, mask_seed_phone: e.target.checked }))
                    saveSetting('mask_seed_phone', e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">Mask seed phone numbers</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seed Exposure Level
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={String(settings.seed_exposure_level ?? 'normal')}
                  onChange={(e) => setSettings((s) => ({ ...s, seed_exposure_level: e.target.value }))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="hidden">Hidden</option>
                  <option value="lowest">Lowest</option>
                  <option value="conditional">Conditional</option>
                  <option value="normal">Normal</option>
                </select>
                <button
                  onClick={() => saveSetting('seed_exposure_level', settings.seed_exposure_level ?? 'normal')}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings.seed_source_osm ?? true)}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, seed_source_osm: e.target.checked }))
                    saveSetting('seed_source_osm', e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">OSM source enabled</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings.seed_source_manual ?? true)}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, seed_source_manual: e.target.checked }))
                    saveSetting('seed_source_manual', e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">Manual source enabled</span>
              </label>
            </div>

            <hr className="border-gray-200" />

            <h3 className="text-sm font-semibold text-gray-800">Seed Expiry</h3>

            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings.seed_expiry_enabled ?? false)}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, seed_expiry_enabled: e.target.checked }))
                    saveSetting('seed_expiry_enabled', e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">Enable seed expiry (auto-unpublish after N days)</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seed Expiry Days
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  value={Number(settings.seed_expiry_days ?? 90)}
                  onChange={(e) => setSettings((s) => ({ ...s, seed_expiry_days: Number(e.target.value) }))}
                  className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  disabled={!Boolean(settings.seed_expiry_enabled)}
                />
                <button
                  onClick={() => saveSetting('seed_expiry_days', Number(settings.seed_expiry_days ?? 90))}
                  disabled={saving || !Boolean(settings.seed_expiry_enabled)}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Seed listings older than this many days will be auto-unpublished.</p>
            </div>

            <hr className="border-gray-200" />

            {/* Seed Stats */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Seed Statistics</h3>
              <SeedStatsPanel />
            </div>

            <hr className="border-gray-200" />

            {/* Seed Blacklist */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Seed Blacklist</h3>
              <SeedBlacklistPanel />
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">AI Verification</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OpenAI API Key
              </label>
              {!apiKeyEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <code className="block w-full max-w-lg rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 font-mono truncate">
                      {settings.openai_api_key
                        ? apiKeyVisible
                          ? String(settings.openai_api_key)
                          : `sk-...${String(settings.openai_api_key).slice(-4)}`
                        : 'Not set'}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    {Boolean(settings.openai_api_key) && (
                      <button
                        onClick={() => setApiKeyVisible((v) => !v)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {apiKeyVisible ? 'Hide Key' : 'Show Key'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setApiKeyInput(String(settings.openai_api_key ?? ''))
                        setApiKeyEditing(true)
                        setApiKeyVisible(false)
                      }}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {settings.openai_api_key ? 'Change Key' : 'Set Key'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full max-w-lg rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        saveSetting('openai_api_key', apiKeyInput)
                        setApiKeyEditing(false)
                        setApiKeyVisible(false)
                      }}
                      disabled={saving || !apiKeyInput.trim()}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setApiKeyEditing(false); setApiKeyInput('') }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings.ai_verification_enabled ?? true)}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      if (!confirm('Are you sure you want to disable AI verification? Only deterministic checks will run.')) return
                    }
                    setSettings((s) => ({ ...s, ai_verification_enabled: e.target.checked }))
                    saveSetting('ai_verification_enabled', e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">AI Verification Enabled</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strictness
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={String(settings.ai_verification_strictness ?? 'normal')}
                  onChange={(e) => setSettings((s) => ({ ...s, ai_verification_strictness: e.target.value }))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="lenient">Lenient</option>
                  <option value="normal">Normal</option>
                  <option value="strict">Strict</option>
                </select>
                <button
                  onClick={() => saveSetting('ai_verification_strictness', settings.ai_verification_strictness ?? 'normal')}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1.5">
                <p><span className="font-semibold text-gray-700">Lenient</span> — Lower threshold for auto-approval. Accepts partial matches on business name and location. Best for growing the directory quickly.</p>
                <p><span className="font-semibold text-gray-700">Normal</span> — Balanced verification. Requires reasonable name match and at least one supporting field (phone, website, or postcode). Recommended for most use cases.</p>
                <p><span className="font-semibold text-gray-700">Strict</span> — Higher threshold. Requires strong name match plus multiple supporting fields. More claims sent to manual review. Best for high-trust directories.</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>

            {/* Email sub-tabs */}
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
              {([
                { key: 'seed' as const, label: 'Seed Notification' },
                { key: 'claim_approved' as const, label: 'Claim Approved' },
                { key: 'claim_rejected' as const, label: 'Claim Rejected' },
              ]).map((st) => (
                <button
                  key={st.key}
                  onClick={() => setEmailSubTab(st.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    emailSubTab === st.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {emailSubTab === 'seed' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={String(settings.email_template_subject ?? '')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_subject: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                  <textarea
                    value={String(settings.email_template_body ?? '')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_body: e.target.value }))}
                    rows={10}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use <code>{'{view_url}'}</code> and <code>{'{unlist_url}'}</code> as placeholders.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const body = String(settings.email_template_body ?? '')
                    if (!body.includes('{view_url}')) {
                      setMessage({ type: 'error', text: 'Email body must contain {view_url} placeholder.' })
                      return
                    }
                    if (!body.includes('{unlist_url}')) {
                      setMessage({ type: 'error', text: 'Email body must contain {unlist_url} placeholder.' })
                      return
                    }
                    saveSetting('email_template_subject', settings.email_template_subject ?? '')
                    saveSetting('email_template_body', settings.email_template_body ?? '')
                  }}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save Template
                </button>
              </>
            )}

            {emailSubTab === 'claim_approved' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={String(settings.email_template_claim_approved_subject ?? 'Your claim has been approved')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_claim_approved_subject: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                  <textarea
                    value={String(settings.email_template_claim_approved_body ?? '')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_claim_approved_body: e.target.value }))}
                    rows={10}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Placeholders: <code>{'{business_name}'}</code>, <code>{'{dashboard_url}'}</code>
                  </p>
                </div>
                <button
                  onClick={() => {
                    saveSetting('email_template_claim_approved_subject', settings.email_template_claim_approved_subject ?? 'Your claim has been approved')
                    saveSetting('email_template_claim_approved_body', settings.email_template_claim_approved_body ?? '')
                  }}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save Template
                </button>
              </>
            )}

            {emailSubTab === 'claim_rejected' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={String(settings.email_template_claim_rejected_subject ?? 'Your claim was not approved')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_claim_rejected_subject: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                  <textarea
                    value={String(settings.email_template_claim_rejected_body ?? '')}
                    onChange={(e) => setSettings((s) => ({ ...s, email_template_claim_rejected_body: e.target.value }))}
                    rows={10}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Placeholders: <code>{'{business_name}'}</code>, <code>{'{reason}'}</code>
                  </p>
                </div>
                <button
                  onClick={() => {
                    saveSetting('email_template_claim_rejected_subject', settings.email_template_claim_rejected_subject ?? 'Your claim was not approved')
                    saveSetting('email_template_claim_rejected_body', settings.email_template_claim_rejected_body ?? '')
                  }}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save Template
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'ranking' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Ranking Weights</h2>

            {[
              { key: 'ranking_weight_premium_annual', label: 'Premium Annual' },
              { key: 'ranking_weight_premium', label: 'Premium' },
              { key: 'ranking_weight_basic', label: 'Basic' },
              { key: 'ranking_weight_trial', label: 'Trial' },
            ].map((tier) => (
              <div key={tier.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tier.label} Weight
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(settings[tier.key] ?? 0)}
                    onChange={(e) => setSettings((s) => ({ ...s, [tier.key]: Number(e.target.value) }))}
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => saveSetting(tier.key, Number(settings[tier.key] ?? 0))}
                    disabled={saving}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Exposure Balance Strength
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={Number(settings.exposure_balance_strength ?? 10)}
                  onChange={(e) => setSettings((s) => ({ ...s, exposure_balance_strength: Number(e.target.value) }))}
                  className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => saveSetting('exposure_balance_strength', Number(settings.exposure_balance_strength ?? 10))}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'listings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Listing Limits</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Premium Listings (per user)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Premium and Annual Premium users can create up to this many listings. Basic and trial users are limited to 1.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(settings.max_premium_listings ?? 10)}
                  onChange={(e) => setSettings((s) => ({ ...s, max_premium_listings: Number(e.target.value) }))}
                  className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => saveSetting('max_premium_listings', Number(settings.max_premium_listings ?? 10))}
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'reset' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-red-600">Operational Data Reset</h2>

            {resetEnabledLoading ? (
              <p className="text-sm text-gray-500">Loading reset state...</p>
            ) : (
              <>
                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={resetEnabled}
                      onChange={(e) => handleToggleResetFlag(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-red-600"
                    />
                    <span className="text-sm font-semibold text-gray-700">Allow Operational Reset</span>
                  </label>
                  {isProduction && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 uppercase tracking-wide">
                      Production
                    </span>
                  )}
                </div>

                {resetEnabled && (
                  <>
                    {/* Warning with table lists */}
                    <div className="rounded-md bg-red-50 border border-red-200 p-4">
                      <p className="text-sm text-red-800 font-medium mb-3">
                        This will permanently TRUNCATE all operational data in a single transaction.
                      </p>
                      <div className="text-xs text-red-700 space-y-2">
                        <div>
                          <p className="font-semibold mb-1">26 tables TRUNCATED:</p>
                          <p className="font-mono leading-relaxed">
                            abuse_events, admin_reviews, business_categories, business_claims,
                            business_contacts, business_locations, business_metrics,
                            business_search_index, businesses, otp_verifications,
                            payment_events, photos, reports, seed_ai_runs, seed_blacklist,
                            seed_candidates, seed_place_details, seed_publish_runs,
                            seed_query_runs, seed_seen_places, subscriptions, system_alerts,
                            testimonials, user_notifications, user_subscriptions, verification_jobs
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">8 tables PRESERVED:</p>
                          <p className="font-mono leading-relaxed">
                            audit_log, blacklist, categories, postcodes, profiles,
                            spatial_ref_sys, system_flags, system_settings
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dry Run */}
                    <div className="space-y-3">
                      <button
                        onClick={handleDryRun}
                        disabled={dryRunning}
                        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {dryRunning ? 'Running dry run...' : 'Dry Run (preview only)'}
                      </button>

                      {dryRunResult && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 space-y-3">
                          <p className="text-sm font-semibold text-amber-800">Dry Run Result (no data deleted)</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {Object.entries(dryRunResult.rows_to_remove || {})
                              .sort(([,a], [,b]) => (b as number) - (a as number))
                              .map(([table, count]) => (
                                <div key={table} className="rounded border border-amber-200 bg-white px-2 py-1.5">
                                  <p className="text-xs text-gray-500 truncate">{table}</p>
                                  <p className="text-sm font-bold text-gray-900">{String(count)}</p>
                                </div>
                              ))}
                          </div>
                          <p className="text-sm font-medium text-amber-800">
                            Total rows to remove: {dryRunResult.total_rows_to_remove?.toLocaleString() ?? 0}
                          </p>
                        </div>
                      )}
                    </div>

                    <hr className="border-gray-200" />

                    {/* Phrase input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Type &quot;RESET ALL OPERATIONAL DATA&quot; to confirm
                      </label>
                      <input
                        type="text"
                        value={resetPhrase}
                        onChange={(e) => setResetPhrase(e.target.value)}
                        placeholder="RESET ALL OPERATIONAL DATA"
                        className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                      />
                    </div>

                    {/* Production second phrase */}
                    {isProduction && (
                      <div>
                        <label className="block text-sm font-medium text-red-700 mb-1">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">PRODUCTION</span>
                            Type &quot;CONFIRM PRODUCTION RESET&quot;
                          </span>
                        </label>
                        <input
                          type="text"
                          value={productionPhrase}
                          onChange={(e) => setProductionPhrase(e.target.value)}
                          placeholder="CONFIRM PRODUCTION RESET"
                          className="w-80 rounded-md border border-red-300 px-3 py-2 text-sm font-mono bg-red-50"
                        />
                      </div>
                    )}

                    {/* Checkbox */}
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={resetConfirm}
                        onChange={(e) => setResetConfirm(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        I understand this is irreversible
                      </span>
                    </label>

                    {/* Execute button */}
                    <button
                      onClick={handleReset}
                      disabled={
                        resetting
                        || resetPhrase !== 'RESET ALL OPERATIONAL DATA'
                        || !resetConfirm
                        || (isProduction && productionPhrase !== 'CONFIRM PRODUCTION RESET')
                      }
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {resetting ? 'Executing Reset...' : 'Execute Reset'}
                    </button>

                    {/* Reset Result */}
                    {resetResult && (
                      <div className="rounded-md bg-green-50 border border-green-200 p-4 space-y-3">
                        <p className="text-sm font-semibold text-green-800">Reset Complete</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {Object.entries(resetResult.rows_removed || {})
                            .sort(([,a], [,b]) => (b as number) - (a as number))
                            .map(([table, count]) => (
                              <div key={table} className="rounded border border-green-200 bg-white px-2 py-1.5">
                                <p className="text-xs text-gray-500 truncate">{table}</p>
                                <p className="text-sm font-bold text-gray-900">{String(count)}</p>
                              </div>
                            ))}
                        </div>
                        <p className="text-sm font-medium text-green-800">
                          Total rows removed: {resetResult.total_rows_removed?.toLocaleString() ?? 0}
                        </p>

                        {/* Validation checks */}
                        {resetResult.validation && (
                          <div className="space-y-1.5 pt-2 border-t border-green-200">
                            <p className="text-xs font-semibold text-green-800">Post-Reset Validation</p>
                            {Object.entries(resetResult.validation)
                              .filter(([k]) => k !== 'all_passed')
                              .map(([key, value]) => (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className={key.includes('categories') || key.includes('postcodes')
                                    ? (Number(value) > 0 ? 'text-green-600' : 'text-red-600')
                                    : (Number(value) === 0 ? 'text-green-600' : 'text-red-600')
                                  }>
                                    {key.includes('categories') || key.includes('postcodes')
                                      ? (Number(value) > 0 ? '\u2713' : '\u2717')
                                      : (Number(value) === 0 ? '\u2713' : '\u2717')
                                    }
                                  </span>
                                  <span className="text-gray-600">{key}: {String(value)}</span>
                                </div>
                              ))}
                            <p className={`text-xs font-semibold ${resetResult.validation.all_passed ? 'text-green-700' : 'text-red-700'}`}>
                              {resetResult.validation.all_passed ? 'All checks passed' : 'Some checks failed'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <hr className="border-gray-200" />

                    {/* Validate Only */}
                    <div className="space-y-3">
                      <button
                        onClick={handleValidate}
                        disabled={validating}
                        className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {validating ? 'Validating...' : 'Validate Only'}
                      </button>

                      {validationResult && (
                        <div className={`rounded-md border p-4 space-y-2 ${
                          validationResult.allPassed
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <p className={`text-sm font-semibold ${validationResult.allPassed ? 'text-green-800' : 'text-red-800'}`}>
                            Validation {validationResult.allPassed ? 'Passed' : 'Failed'}
                          </p>
                          {validationResult.checks?.map((check: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={check.passed ? 'text-green-600' : 'text-red-600'}>
                                {check.passed ? '\u2713' : '\u2717'}
                              </span>
                              <span className="text-gray-700">{check.label}</span>
                              <span className="text-gray-500">expected {check.expected}, actual {check.actual}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'blacklist' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Blacklist Management</h2>

            {/* Add new entry */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
                <input
                  type="text"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="e.g. escort"
                  className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Match Type</label>
                <select
                  value={newMatchType}
                  onChange={(e) => setNewMatchType(e.target.value as any)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact</option>
                  <option value="starts_with">Starts with</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Optional"
                  className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleAddBlacklist}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Add
              </button>
            </div>

            {/* Entries list */}
            {blacklistEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No active blacklist entries.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {blacklistEntries.map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{entry.term}</span>
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {entry.match_type}
                      </span>
                      {entry.reason && (
                        <span className="ml-2 text-xs text-gray-500">{entry.reason}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveBlacklist(entry.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'alerts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">System Alerts</h2>
              <div className="flex items-center gap-2">
                {(['24h', '7d', '30d', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setAlertFilter(f); }}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      alertFilter === f
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
                <button
                  onClick={loadAlerts}
                  className="ml-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Refresh
                </button>
              </div>
            </div>

            {alertsLoading ? (
              <p className="text-sm text-gray-500">Loading alerts...</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-gray-500">No alerts in this time range.</p>
            ) : (
              <div className="space-y-3">
                {/* Unresolved first */}
                {alerts
                  .sort((a, b) => {
                    if (!a.resolved_at && b.resolved_at) return -1
                    if (a.resolved_at && !b.resolved_at) return 1
                    const severityOrder = { critical: 0, warning: 1, info: 2 }
                    if (!a.resolved_at && !b.resolved_at) {
                      const diff = severityOrder[a.severity] - severityOrder[b.severity]
                      if (diff !== 0) return diff
                    }
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  })
                  .map((alert) => {
                    const severityColors = {
                      critical: 'bg-red-50 border-red-200',
                      warning: 'bg-yellow-50 border-yellow-200',
                      info: 'bg-blue-50 border-blue-200',
                    }
                    const badgeColors = {
                      critical: 'bg-red-100 text-red-800',
                      warning: 'bg-yellow-100 text-yellow-800',
                      info: 'bg-blue-100 text-blue-800',
                    }
                    return (
                      <div
                        key={alert.id}
                        className={`rounded-lg border p-4 ${
                          alert.resolved_at ? 'bg-gray-50 border-gray-200 opacity-60' : severityColors[alert.severity]
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeColors[alert.severity]}`}>
                                {alert.severity}
                              </span>
                              {alert.source && (
                                <span className="text-xs text-gray-500">{alert.source}</span>
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(alert.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                            {alert.body && <p className="text-sm text-gray-600">{alert.body}</p>}
                            {alert.resolved_at && (
                              <p className="text-xs text-gray-400">
                                Resolved {new Date(alert.resolved_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          {!alert.resolved_at && (
                            <button
                              onClick={async () => {
                                const result = await resolveAlert(alert.id)
                                if (!result.error) {
                                  setAlerts((prev) =>
                                    prev.map((a) =>
                                      a.id === alert.id
                                        ? { ...a, resolved_at: new Date().toISOString() }
                                        : a
                                    )
                                  )
                                  setMessage({ type: 'success', text: 'Alert resolved.' })
                                }
                              }}
                              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
