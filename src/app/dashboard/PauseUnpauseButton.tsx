'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pauseBusiness, unpauseBusiness } from '@/app/actions/business'

export default function PauseUnpauseButton({
  businessId,
  currentStatus,
}: {
  businessId: string
  currentStatus: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    setLoading(true)
    try {
      if (currentStatus === 'published') {
        const result = await pauseBusiness(businessId)
        if (result.error) {
          alert(typeof result.error === 'string' ? result.error : 'Failed to pause listing')
          return
        }
      } else {
        const result = await unpauseBusiness(businessId)
        if (result.error) {
          if (result.error === 'subscription_required') {
            alert('You need an active subscription to unpause your listing.')
            return
          }
          alert(typeof result.error === 'string' ? result.error : 'Failed to unpause listing')
          return
        }
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const isPaused = currentStatus === 'paused'

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
        isPaused
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {loading ? (
        'Working...'
      ) : isPaused ? (
        <>
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
          Unpause Listing
        </>
      ) : (
        <>
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>
          Pause Listing
        </>
      )}
    </button>
  )
}
