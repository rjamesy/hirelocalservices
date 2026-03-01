'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getAdminAccountDetail,
  adminChangePlan,
  adminSetTrialEnd,
  adminSuspendAccount,
  adminUnsuspendAccount,
  adminSuspendAccountListings,
  adminSoftDeleteAccount,
  adminUpdateAccountNotes,
  type AdminAccountDetail,
} from '@/app/actions/admin-accounts'

import type { PlanTier, SubscriptionStatus } from '@/lib/types'

export default function AdminAccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string

  const [account, setAccount] = useState<AdminAccountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Admin notes
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSuccess, setNotesSuccess] = useState(false)

  // Action loading states
  const [changePlanLoading, setChangePlanLoading] = useState(false)
  const [setTrialLoading, setSetTrialLoading] = useState(false)
  const [suspendLoading, setSuspendLoading] = useState(false)
  const [unsuspendLoading, setUnsuspendLoading] = useState(false)
  const [suspendListingsLoading, setSuspendListingsLoading] = useState(false)
  const [softDeleteLoading, setSoftDeleteLoading] = useState(false)

  // Action form state
  const [newPlan, setNewPlan] = useState<PlanTier>('basic')
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>('active')
  const [trialEndDate, setTrialEndDate] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  async function loadAccount() {
    setLoading(true)
    setError(null)
    const result = await getAdminAccountDetail(userId)
    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }
    setAccount(result)
    setNotes(result.adminNotes ?? '')
    setLoading(false)
  }

  useEffect(() => {
    if (userId) {
      loadAccount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function clearFeedback() {
    setActionError(null)
    setActionSuccess(null)
  }

  async function handleSaveNotes() {
    if (!account) return
    setNotesSaving(true)
    setNotesSuccess(false)
    const result = await adminUpdateAccountNotes(account.userId, notes)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setNotesSuccess(true)
      setTimeout(() => setNotesSuccess(false), 3000)
    }
    setNotesSaving(false)
  }

  async function handleChangePlan() {
    if (!account) return
    clearFeedback()
    setChangePlanLoading(true)
    const result = await adminChangePlan(account.userId, newPlan, newStatus)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('Plan changed successfully.')
      await loadAccount()
    }
    setChangePlanLoading(false)
  }

  async function handleSetTrialEnd() {
    if (!account || !trialEndDate) return
    clearFeedback()
    setSetTrialLoading(true)
    const result = await adminSetTrialEnd(account.userId, new Date(trialEndDate).toISOString())
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('Trial end date updated.')
      await loadAccount()
    }
    setSetTrialLoading(false)
  }

  async function handleSuspend() {
    if (!account || !suspendReason.trim()) return
    if (!confirm('Are you sure you want to suspend this account?')) return
    clearFeedback()
    setSuspendLoading(true)
    const result = await adminSuspendAccount(account.userId, suspendReason)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('Account suspended.')
      setSuspendReason('')
      await loadAccount()
    }
    setSuspendLoading(false)
  }

  async function handleUnsuspend() {
    if (!account) return
    if (!confirm('Are you sure you want to unsuspend this account?')) return
    clearFeedback()
    setUnsuspendLoading(true)
    const result = await adminUnsuspendAccount(account.userId)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('Account unsuspended.')
      await loadAccount()
    }
    setUnsuspendLoading(false)
  }

  async function handleSuspendListings() {
    if (!account) return
    if (!confirm('This will suspend ALL published listings for this user. Continue?')) return
    clearFeedback()
    setSuspendListingsLoading(true)
    const result = await adminSuspendAccountListings(account.userId)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('All published listings suspended.')
      await loadAccount()
    }
    setSuspendListingsLoading(false)
  }

  async function handleSoftDelete() {
    if (!account || !deleteReason.trim()) return
    if (
      !confirm(
        'WARNING: This will suspend the account AND soft-delete ALL their listings. This action cannot be easily undone. Are you absolutely sure?'
      )
    )
      return
    clearFeedback()
    setSoftDeleteLoading(true)
    const result = await adminSoftDeleteAccount(account.userId, deleteReason)
    if ('error' in result) {
      setActionError(result.error ?? 'Unknown error')
    } else {
      setActionSuccess('Account soft-deleted.')
      setDeleteReason('')
      await loadAccount()
    }
    setSoftDeleteLoading(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getPlanBadge(plan: string | null) {
    const colors: Record<string, string> = {
      basic: 'bg-green-50 text-green-700',
      premium: 'bg-purple-50 text-purple-700',
      premium_annual: 'bg-indigo-50 text-indigo-700',
      // free_trial removed — trials are now Stripe-native (trialing status)
    }
    const labels: Record<string, string> = {
      basic: 'Basic',
      premium: 'Premium',
      premium_annual: 'Annual Premium',
      // free_trial removed — trials are now Stripe-native
    }
    if (!plan) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
          No Plan
        </span>
      )
    }
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[plan] ?? 'bg-gray-50 text-gray-500'}`}
      >
        {labels[plan] ?? plan}
      </span>
    )
  }

  function getStatusBadge(status: string | null) {
    if (!status) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
          None
        </span>
      )
    }
    const colors: Record<string, string> = {
      active: 'bg-green-50 text-green-700',
      trialing: 'bg-blue-50 text-blue-700',
      past_due: 'bg-yellow-50 text-yellow-700',
      canceled: 'bg-red-50 text-red-700',
      unpaid: 'bg-red-50 text-red-700',
      incomplete: 'bg-gray-50 text-gray-500',
    }
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-50 text-gray-500'}`}
      >
        {status}
      </span>
    )
  }

  function getListingStatusBadge(status: string) {
    const colors: Record<string, string> = {
      published: 'bg-green-100 text-green-800',
      draft: 'bg-yellow-100 text-yellow-800',
      paused: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
      deleted: 'bg-red-100 text-red-800',
    }
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}
      >
        {status}
      </span>
    )
  }

  function getClaimStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}
      >
        {status}
      </span>
    )
  }

  function getRoleBadge(role: string) {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
          Admin
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
        {role}
      </span>
    )
  }

  // ─── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-gray-500">Loading account details...</div>
      </div>
    )
  }

  // ─── Error state ───────────────────────────────────────────────────
  if (error || !account) {
    return (
      <div>
        <Link
          href="/admin/accounts"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 mb-6"
        >
          &larr; Back to Accounts
        </Link>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <p className="text-sm text-red-600">{error ?? 'Account not found.'}</p>
        </div>
      </div>
    )
  }

  const isSuspended = !!account.suspendedAt

  return (
    <div className="space-y-6">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link
        href="/admin/accounts"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        &larr; Back to Accounts
      </Link>

      {/* ── Suspended banner ───────────────────────────────────────── */}
      {isSuspended && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">Account Suspended</p>
          {account.suspendedReason && (
            <p className="mt-1 text-sm text-red-700">Reason: {account.suspendedReason}</p>
          )}
          <p className="mt-1 text-xs text-red-600">
            Suspended at: {formatDate(account.suspendedAt)}
          </p>
        </div>
      )}

      {/* ── Action feedback ────────────────────────────────────────── */}
      {actionError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">{actionSuccess}</p>
        </div>
      )}

      {/* ── Header card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{account.email}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{account.userId}</span>
              <button
                onClick={() => copyToClipboard(account.userId)}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="Copy user ID"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Created: {formatDate(account.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {getRoleBadge(account.role)}
            {isSuspended && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                Suspended
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Subscription panel ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription</h2>
        {account.subscription ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Plan:</span>{' '}
              {getPlanBadge(account.subscription.plan)}
            </div>
            <div>
              <span className="text-gray-500">Status:</span>{' '}
              {getStatusBadge(account.subscription.status)}
            </div>
            <div>
              <span className="text-gray-500">Trial Ends:</span>{' '}
              <span className="text-gray-900">
                {formatDate(account.subscription.trialEndsAt)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Period End:</span>{' '}
              <span className="text-gray-900">
                {formatDate(account.subscription.currentPeriodEnd)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Stripe Customer:</span>{' '}
              <span className="font-mono text-xs text-gray-900">
                {account.subscription.stripeCustomerId ?? '--'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Stripe Subscription:</span>{' '}
              <span className="font-mono text-xs text-gray-900">
                {account.subscription.stripeSubscriptionId ?? '--'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Cancel at Period End:</span>{' '}
              <span className="text-gray-900">
                {account.subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No subscription on record.</p>
        )}
      </div>

      {/* ── Entitlements panel ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Entitlements</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Effective State
                </td>
                <td className="py-2 text-gray-900">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      account.entitlements.effectiveState === 'ok'
                        ? 'bg-green-100 text-green-800'
                        : account.entitlements.effectiveState === 'limited'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {account.entitlements.effectiveState}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Max Listings
                </td>
                <td className="py-2 text-gray-900">{account.entitlements.maxListings}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Current Listing Count
                </td>
                <td className="py-2 text-gray-900">
                  {account.entitlements.currentListingCount}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Can Publish
                </td>
                <td className="py-2">
                  {account.entitlements.canPublish ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-red-600 font-medium">No</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Can Claim More
                </td>
                <td className="py-2">
                  {account.entitlements.canClaimMore ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-red-600 font-medium">No</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Is Active
                </td>
                <td className="py-2">
                  {account.entitlements.isActive ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-red-600 font-medium">No</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Is Trial
                </td>
                <td className="py-2">
                  {account.entitlements.isTrial ? (
                    <span className="text-blue-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Cancel at Period End
                </td>
                <td className="py-2 text-gray-900">
                  {account.entitlements.cancelAtPeriodEnd ? 'Yes' : 'No'}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                  Current Period End
                </td>
                <td className="py-2 text-gray-900">
                  {formatDate(account.entitlements.currentPeriodEnd)}
                </td>
              </tr>
              {account.entitlements.reasonCodes.length > 0 && (
                <tr>
                  <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
                    Reason Codes
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {account.entitlements.reasonCodes.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Admin notes ────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Internal notes about this account..."
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSaveNotes}
            disabled={notesSaving}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {notesSaving ? 'Saving...' : 'Save Notes'}
          </button>
          {notesSuccess && <span className="text-sm text-green-600">Saved.</span>}
        </div>
      </div>

      {/* ── Actions panel ──────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Actions</h2>
        <div className="space-y-6">
          {/* Change Plan */}
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Change Plan</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value as PlanTier)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="premium_annual">Premium Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as SubscriptionStatus)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="canceled">Canceled</option>
                  <option value="past_due">Past Due</option>
                </select>
              </div>
              <button
                onClick={handleChangePlan}
                disabled={changePlanLoading}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {changePlanLoading ? 'Changing...' : 'Change Plan'}
              </button>
            </div>
          </div>

          {/* Set Trial End */}
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Set Trial End Date</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Trial End Date
                </label>
                <input
                  type="date"
                  value={trialEndDate}
                  onChange={(e) => setTrialEndDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={handleSetTrialEnd}
                disabled={setTrialLoading || !trialEndDate}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {setTrialLoading ? 'Setting...' : 'Set Trial End'}
              </button>
            </div>
          </div>

          {/* Suspend / Unsuspend */}
          {!isSuspended ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Suspend Account</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Reason
                  </label>
                  <input
                    type="text"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="Reason for suspension..."
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={handleSuspend}
                  disabled={suspendLoading || !suspendReason.trim()}
                  className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {suspendLoading ? 'Suspending...' : 'Suspend Account'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Unsuspend Account</h3>
              <p className="text-sm text-gray-600 mb-3">
                This account is currently suspended. Click below to lift the suspension.
              </p>
              <button
                onClick={handleUnsuspend}
                disabled={unsuspendLoading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {unsuspendLoading ? 'Unsuspending...' : 'Unsuspend Account'}
              </button>
            </div>
          )}

          {/* Suspend Listings */}
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Apply Suspension to Listings
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Suspends all published listings owned by this user. They will be removed from search
              results.
            </p>
            <button
              onClick={handleSuspendListings}
              disabled={suspendListingsLoading}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {suspendListingsLoading ? 'Suspending Listings...' : 'Suspend All Listings'}
            </button>
          </div>

          {/* Soft Delete */}
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-900 mb-2">Soft Delete Account</h3>
            <p className="text-sm text-red-700 mb-3">
              This will suspend the account AND soft-delete ALL their listings. This action is
              destructive and cannot be easily undone.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-red-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Reason for deletion..."
                  className="block w-full rounded-md border border-red-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <button
                onClick={handleSoftDelete}
                disabled={softDeleteLoading || !deleteReason.trim()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {softDeleteLoading ? 'Deleting...' : 'Soft Delete Account'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Owned Listings table ───────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Owned Listings ({account.ownedListings.length})
        </h2>
        {account.ownedListings.length === 0 ? (
          <p className="text-sm text-gray-500">No listings owned by this user.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Searchable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Billing Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {account.ownedListings.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/admin/listings/${listing.id}`}
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        {listing.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getListingStatusBadge(listing.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {listing.isSearchEligible ? (
                        <span className="inline-flex items-center text-green-600" title="Search eligible">
                          <svg
                            className="h-5 w-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-500" title="Not search eligible">
                          <svg
                            className="h-5 w-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {listing.billingStatus}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {listing.categoryName ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {listing.suburb || listing.state
                        ? [listing.suburb, listing.state].filter(Boolean).join(', ')
                        : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Claims table ───────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Claims ({account.claims.length})
        </h2>
        {account.claims.length === 0 ? (
          <p className="text-sm text-gray-500">No claims by this user.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Business Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {account.claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {claim.businessName ?? '--'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getClaimStatusBadge(claim.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(claim.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
