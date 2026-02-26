import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your account settings.</p>

      {/* Account section */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Account</h2>
        <div className="mt-4">
          <p className="text-sm text-gray-500">Email</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{user?.email ?? 'Not signed in'}</p>
        </div>
      </div>

      {/* Navigation cards */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/listing"
            className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
              <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.99 2.99 0 00.621-1.82L4.5 3h15l.879 4.529a2.99 2.99 0 00.621 1.82" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">My Listings</p>
              <p className="text-xs text-gray-500">Manage your business listings</p>
            </div>
          </Link>

          <Link
            href="/dashboard/billing"
            className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
              <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Billing</p>
              <p className="text-xs text-gray-500">Manage your subscription</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
