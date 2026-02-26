import Link from 'next/link'

interface ViewPublicProfileCardProps {
  slug?: string
  multi?: boolean
}

export default function ViewPublicProfileCard({ slug, multi }: ViewPublicProfileCardProps) {
  const href = multi ? '/dashboard/public-profile' : `/business/${slug}`
  const subtitle = multi ? 'Choose which listing to view' : 'See how customers see you'

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
        <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">View Public Profile</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </Link>
  )
}
