import Link from 'next/link'
import { getMyBusinesses } from '@/app/actions/business'
import { redirect } from 'next/navigation'
import { cn } from '@/lib/utils'

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-gray-100 text-gray-800',
  suspended: 'bg-red-100 text-red-800',
}

export default async function PublicProfilePickerPage() {
  const businesses = await getMyBusinesses()

  // Any listing that has a live public page (published or paused)
  const live = businesses.filter((b) => b.status === 'published' || b.status === 'paused')

  if (live.length === 0) {
    redirect('/dashboard')
  }

  if (live.length === 1) {
    redirect(`/business/${live[0].slug}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">View Public Profile</h1>
      <p className="mt-1 text-sm text-gray-500">Choose which listing to view as a customer would see it.</p>

      <div className="mt-6 space-y-3">
        {live.map((b) => {
          const q = b.quality
          return (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{b.name}</span>
                  {(b.suburb || b.state) && (
                    <span className="text-xs text-gray-400">
                      {[b.suburb, b.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {/* Lifecycle badge */}
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      statusColors[b.status] || 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {b.status}
                  </span>
                  {/* Quality badge (same logic as My Listings) */}
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
              <Link
                href={`/business/${b.slug}`}
                className="ml-3 flex-shrink-0 inline-flex items-center rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                View
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
