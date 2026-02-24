'use client'

import { cn } from '@/lib/utils'

interface BusinessItem {
  id: string
  name: string
  status: string
  billing_status: string
}

interface BusinessSelectorProps {
  businesses: BusinessItem[]
  onSelect: (id: string) => void
  title?: string
  subtitle?: string
}

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-gray-100 text-gray-800',
  suspended: 'bg-red-100 text-red-800',
}

export default function BusinessSelector({
  businesses,
  onSelect,
  title = 'Select a Business',
  subtitle = 'You have multiple listings. Choose which one to manage.',
}: BusinessSelectorProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>

      <div className="mt-6 space-y-3">
        {businesses.map((b) => {
          const isBillingSuspended = b.billing_status === 'billing_suspended'
          const badgeClass = isBillingSuspended
            ? 'bg-orange-100 text-orange-800'
            : statusColors[b.status] || 'bg-gray-100 text-gray-800'
          const badgeLabel = isBillingSuspended ? 'billing suspended' : b.status

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b.id)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">{b.name}</span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    badgeClass
                  )}
                >
                  {badgeLabel}
                </span>
              </div>
              <svg
                className="h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
