'use client'

import { useEffect, useRef } from 'react'
import { trackSearchImpressions } from '@/app/actions/metrics'

/**
 * SearchImpressionTracker — client-side component that fires search impression
 * tracking via useEffect. Only tracks once per render, excludes bots via
 * navigator.webdriver check.
 */
export default function SearchImpressionTracker({
  businessIds,
}: {
  businessIds: string[]
}) {
  const tracked = useRef(false)

  useEffect(() => {
    // Only track once per render
    if (tracked.current) return
    if (businessIds.length === 0) return

    // Exclude bots — navigator.webdriver is true for automated browsers
    if (typeof navigator !== 'undefined' && (navigator as any).webdriver) return

    tracked.current = true
    trackSearchImpressions(businessIds)
  }, [businessIds])

  return null
}
