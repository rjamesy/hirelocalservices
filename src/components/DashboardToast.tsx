'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const TOAST_MESSAGES: Record<string, { message: string; type: 'success' | 'warning' }> = {
  submitted: { message: 'Your listing has been submitted for review!', type: 'success' },
  subscribed: { message: 'Subscription activated! You can now publish your listing.', type: 'success' },
  subscription_pending: { message: 'Subscription is being activated. Please refresh in a moment.', type: 'warning' },
}

export default function DashboardToast() {
  const searchParams = useSearchParams()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null)

  useEffect(() => {
    const toastKey = searchParams.get('toast')
    if (!toastKey || !TOAST_MESSAGES[toastKey]) return

    setToast(TOAST_MESSAGES[toastKey])

    // Clear the toast param from URL
    const url = new URL(window.location.href)
    url.searchParams.delete('toast')
    window.history.replaceState({}, '', url.pathname + url.search)
  }, [searchParams])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  const bgColor = toast.type === 'success' ? 'bg-green-600' : 'bg-yellow-500'

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg ${bgColor} px-4 py-3 text-sm font-medium text-white shadow-lg`}
    >
      {toast.message}
      <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
