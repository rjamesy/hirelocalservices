'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserNotifications, markNotificationRead, deleteNotification, getUnreadCount } from '@/app/actions/notifications'
import type { UserNotification } from '@/lib/types'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(false)

  // Detail overlay state
  const [selected, setSelected] = useState<UserNotification | null>(null)
  const [deleting, setDeleting] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const fetchUnread = useCallback(async () => {
    const count = await getUnreadCount()
    setUnread(count)
  }, [])

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 60000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  async function handleOpen() {
    if (!open) {
      setLoading(true)
      const result = await getUserNotifications(1)
      setNotifications(result.data)
      setLoading(false)
    }
    setOpen(!open)
  }

  async function handleSelect(n: UserNotification) {
    setSelected(n)
    setOpen(false) // close dropdown

    if (!n.read) {
      // Optimistic update
      setNotifications(prev =>
        prev.map(item => (item.id === n.id ? { ...item, read: true } : item))
      )
      setUnread(prev => Math.max(0, prev - 1))

      // Fire-and-forget server update
      markNotificationRead(n.id)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)

    const wasUnread = !selected.read
    const deletedId = selected.id

    // Optimistic: remove from list and close overlay
    setNotifications(prev => prev.filter(n => n.id !== deletedId))
    if (wasUnread) {
      setUnread(prev => Math.max(0, prev - 1))
    }
    setSelected(null)
    setDeleting(false)

    // Fire-and-forget server delete
    deleteNotification(deletedId)
  }

  function getTimeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  function getListingLink(n: UserNotification): string | null {
    const businessId = (n.metadata as Record<string, unknown>)?.businessId as string | undefined
    if (businessId) return `/dashboard/listing?step=6`
    return null
  }

  // ESC to close overlay
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selected) {
        setSelected(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected])

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative rounded-md p-2 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-full mt-2 z-50 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">Loading...</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet.</p>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    className={`w-full text-left border-b border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !n.read ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => handleSelect(n)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {!n.read && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                          <p className={`text-sm truncate ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {n.title}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-gray-400 mt-0.5">{getTimeAgo(n.created_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Detail Overlay */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <div
            ref={overlayRef}
            className="relative w-full max-w-md mx-4 rounded-xl border border-gray-200 bg-white shadow-xl"
            role="dialog"
            aria-label="Notification detail"
          >
            {/* Header */}
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900">{selected.title}</h3>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                <span>{getTimeAgo(selected.created_at)}</span>
                <span>·</span>
                <span>{formatDate(selected.created_at)}</span>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.message}</p>

              {getListingLink(selected) && (
                <a
                  href={getListingLink(selected)!}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  View listing
                </a>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
