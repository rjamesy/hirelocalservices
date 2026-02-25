import Link from 'next/link'
import { getMyBusiness } from '@/app/actions/business'
import { cn } from '@/lib/utils'
import { DashboardSidebarClient } from './DashboardSidebarClient'
import NotificationBell from '@/components/NotificationBell'

export const metadata = {
  title: 'Dashboard | HireLocalServices',
  description: 'Manage your business listing on HireLocalServices',
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        styles[status] ?? 'bg-gray-100 text-gray-800'
      )}
    >
      {status}
    </span>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

function getNavItems(hasBusiness: boolean): NavItem[] {
  if (!hasBusiness) {
    return [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        ),
      },
      {
        href: '/dashboard/listing',
        label: 'Create Listing',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        ),
      },
    ]
  }

  return [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    },
    {
      href: '/dashboard/listing',
      label: 'My Listing',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.99 2.99 0 00.621-1.82L4.5 3h15l.879 4.529a2.99 2.99 0 00.621 1.82" />
        </svg>
      ),
    },
    {
      href: '/dashboard/billing',
      label: 'Billing',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      ),
    },
  ]
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const business = await getMyBusiness()
  const hasBusiness = !!business
  const navItems = getNavItems(hasBusiness)

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardSidebarClient
        businessName={business?.name ?? null}
        businessStatus={(business as Record<string, unknown>)?.status as string ?? null}
        navItems={navItems.map(({ href, label }) => ({ href, label }))}
        hasBusiness={hasBusiness}
      >
        {/* Desktop sidebar - rendered server-side */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
            {/* Sidebar header */}
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
              <Link href="/dashboard" className="flex items-center gap-2">
                <svg
                  className="h-7 w-7 text-brand-600"
                  viewBox="0 0 32 32"
                  fill="none"
                >
                  <rect width="32" height="32" rx="8" fill="currentColor" />
                  <path
                    d="M8 16L14 22L24 10"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm font-semibold text-gray-900">HireLocalServices</span>
              </Link>
              <NotificationBell />
            </div>

            {/* Business info */}
            {hasBusiness && business ? (
              <div className="border-b border-gray-200 px-4 py-3">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {business.name}
                </p>
                <StatusBadge status={(business as Record<string, unknown>).status as string ?? 'draft'} />
              </div>
            ) : (
              <div className="border-b border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-500">No listing yet</p>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-2 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                >
                  <span className="mr-3 text-gray-400 group-hover:text-brand-500">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Back to site */}
            <div className="border-t border-gray-200 p-4">
              <Link
                href="/"
                className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to site
              </Link>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-64">
          <main className="py-8 px-4 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </DashboardSidebarClient>
    </div>
  )
}
