'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSettings, updateSetting } from '@/app/actions/system-settings'
import { getBlacklistEntries, addBlacklistEntry, removeBlacklistEntry } from '@/app/actions/blacklist'
import { resetAllData } from '@/app/actions/data-reset'

type Tab = 'seed' | 'ai' | 'email' | 'ranking' | 'listings' | 'reset' | 'blacklist'

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

  // Reset state
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

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

  useEffect(() => {
    loadSettings()
    loadBlacklist()
  }, [])

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
    const result = await resetAllData(resetPhrase, resetConfirm)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'All data has been reset successfully.' })
      setResetPhrase('')
      setResetConfirm(false)
    }
    setResetting(false)
  }

  const tabs: { key: Tab; label: string }[] = [
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
            <h2 className="text-lg font-semibold text-gray-900">Email Template</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={String(settings.email_template_subject ?? '')}
                onChange={(e) => setSettings((s) => ({ ...s, email_template_subject: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Body
              </label>
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
            <h2 className="text-lg font-semibold text-red-600">Data Reset</h2>
            <div className="rounded-md bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-800 font-medium mb-2">
                This action will permanently delete all business data.
              </p>
              <div className="text-sm text-red-700 space-y-1">
                <p><strong>Will be deleted:</strong> businesses, photos, testimonials, categories links, verification jobs, claims, contacts, search index, locations, subscriptions, reports, metrics</p>
                <p><strong>Will NOT be deleted:</strong> profiles, categories, postcodes, system_settings, blacklist, audit_log</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type &quot;danger reset data&quot; to confirm
              </label>
              <input
                type="text"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                placeholder="danger reset data"
                className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-red-600"
              />
              <span className="text-sm font-medium text-gray-700">
                I understand this action is irreversible
              </span>
            </label>

            <button
              onClick={handleReset}
              disabled={resetting || resetPhrase.trim().toLowerCase() !== 'danger reset data' || !resetConfirm}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {resetting ? 'Resetting...' : 'Reset All Data'}
            </button>
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
      </div>
    </div>
  )
}
