'use client'

import { useCallback, useEffect, useState } from 'react'
import { getUserNotifications, markNotificationRead, getUnreadCount } from '@/app/actions/notifications'
import type { UserNotification } from '@/lib/types'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(false)

  const fetchUnread = useCallback(async () => {
    const count = await getUnreadCount()
    setUnread(count)
  }, [])

  useEffect(() => {
    fetchUnread()
    // Poll every 60 seconds
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

  async function handleMarkRead(id: string) {
    await markNotificationRead(id)
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    )
    setUnread(prev => Math.max(0, prev - 1))
  }

  function getTimeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

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

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
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
                  <div
                    key={n.id}
                    className={`border-b border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !n.read ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => !n.read && handleMarkRead(n.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-gray-400">{getTimeAgo(n.created_at)}</span>
                    </div>
                    {!n.read && (
                      <div className="mt-1 flex justify-end">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
