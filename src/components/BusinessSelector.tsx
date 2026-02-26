'use client'

import { cn } from '@/lib/utils'
import type { QualityResult } from '@/lib/listing-quality'

interface BusinessItem {
  id: string
  name: string
  status: string
  quality?: QualityResult
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
          const statusBadge = statusColors[b.status] || 'bg-gray-100 text-gray-800'
          const q = b.quality

          return (
            <div
              key={b.id}
              className="rounded-lg border border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{b.name}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        statusBadge
                      )}
                    >
                      {b.status}
                    </span>
                    {q && q.flag !== 'complete' && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          q.colorClass
                        )}
                      >
                        {q.label}
                      </span>
                    )}
                  </div>
                  {q && q.flag !== 'complete' && (
                    <p className="mt-1 text-xs text-gray-500">{q.hint}</p>
                  )}
                </div>
                <svg
                  className="h-5 w-5 flex-shrink-0 text-gray-400 ml-3"
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
              {q && q.fixStep !== null && (
                <div className="border-t border-gray-100 px-4 py-2">
                  <a
                    href={`/dashboard/listing?bid=${b.id}&step=${q.fixStep}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Fix now &rarr;
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
