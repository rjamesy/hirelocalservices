'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { changePassword, deleteMyAccount } from '@/app/actions/account'

type SubscriptionInfo = {
  planName: string
  planTier: string | null
  price: number
  interval: string
  status: string
  isTrial: boolean
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  subscribedAt: string | null
  planChangedAt: string | null
}

export function SettingsClient({
  email,
  subscriptionInfo,
}: {
  email: string
  subscriptionInfo: SubscriptionInfo | null
}) {
  const router = useRouter()

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordLoading(true)
    const result = await changePassword(newPassword)

    if (result.error) {
      setPasswordError(result.error)
    } else {
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordLoading(false)
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return

    setDeleteLoading(true)
    setDeleteError(null)

    const result = await deleteMyAccount()

    if (result.error) {
      setDeleteError(result.error)
      setDeleteLoading(false)
      return
    }

    // Redirect to home after deletion
    router.push('/')
    router.refresh()
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  function getStatusBadge(info: SubscriptionInfo) {
    if (info.cancelAtPeriodEnd) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          Cancels on {formatDate(info.currentPeriodEnd)}
        </span>
      )
    }
    if (info.isTrial) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
          Trial until {formatDate(info.trialEndsAt)}
        </span>
      )
    }
    if (info.status === 'active') {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
          Active
        </span>
      )
    }
    if (info.status === 'past_due') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
          Payment Past Due
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
        {info.status}
      </span>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your account, subscription, and security settings.</p>

      {/* Account Section */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Account</h2>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">{email}</p>
          </div>
        </div>
      </div>

      {/* Subscription Section */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
        {subscriptionInfo ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Plan</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {subscriptionInfo.planName} — ${subscriptionInfo.price}/{subscriptionInfo.interval}
                </p>
              </div>
              {getStatusBadge(subscriptionInfo)}
            </div>

            {subscriptionInfo.subscribedAt && (
              <div>
                <p className="text-sm text-gray-500">Subscribed since</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{formatDate(subscriptionInfo.subscribedAt)}</p>
              </div>
            )}

            {subscriptionInfo.currentPeriodEnd && !subscriptionInfo.cancelAtPeriodEnd && (
              <div>
                <p className="text-sm text-gray-500">Next renewal</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{formatDate(subscriptionInfo.currentPeriodEnd)}</p>
              </div>
            )}

            {subscriptionInfo.planChangedAt && (
              <div>
                <p className="text-sm text-gray-500">Plan last changed</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{formatDate(subscriptionInfo.planChangedAt)}</p>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100">
              <Link
                href="/dashboard/billing"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Manage subscription
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-gray-500">You don&apos;t have an active subscription.</p>
            <div className="mt-3">
              <Link
                href="/dashboard/billing"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Choose a plan
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Security Section */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Security</h2>

        <form onSubmit={handleChangePassword} className="mt-4">
          <h3 className="text-sm font-medium text-gray-700">Change password</h3>

          {passwordError && (
            <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="mt-2 rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200">
              Password updated successfully.
            </div>
          )}

          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="new-password" className="block text-sm text-gray-500 mb-1">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                data-testid="settings-new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:text-sm"
                placeholder="At least 8 characters"
                minLength={8}
              />
            </div>
            <div>
              <label htmlFor="confirm-new-password" className="block text-sm text-gray-500 mb-1">
                Confirm new password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                data-testid="settings-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:text-sm"
                placeholder="Confirm your password"
                minLength={8}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={passwordLoading || !newPassword || !confirmPassword}
            data-testid="settings-change-password"
            className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {passwordLoading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="mt-6 rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
        <p className="mt-1 text-sm text-gray-500">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            data-testid="settings-delete-account-btn"
            className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">Are you sure?</p>
            <p className="mt-1 text-sm text-red-700">
              This will permanently delete your account, cancel your subscription, remove all your listings, and blacklist your email. Type <strong>DELETE</strong> to confirm.
            </p>

            {deleteError && (
              <div className="mt-2 rounded-md bg-red-100 p-2 text-sm text-red-800">
                {deleteError}
              </div>
            )}

            <input
              type="text"
              data-testid="settings-delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mt-3 block w-full rounded-md border border-red-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder='Type "DELETE" to confirm'
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                data-testid="settings-delete-confirm-btn"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading ? 'Deleting...' : 'Delete my account permanently'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                  setDeleteError(null)
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
