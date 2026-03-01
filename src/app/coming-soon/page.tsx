export default function ComingSoonPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
          <svg
            className="h-8 w-8 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.41m6.96 5.96a14.926 14.926 0 01-5.84 2.58m0 0a14.926 14.926 0 01-6.16-2.58m6.16 2.58v4.8m-6.16-7.38a6 6 0 01-.81-10.12m.81 10.12a14.98 14.98 0 006.16-12.12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Coming Soon</h1>
        <p className="text-gray-600 mb-6">
          Hire Local Services is launching soon. We&apos;re putting the finishing touches
          on Australia&apos;s newest local services directory.
        </p>
        <p className="text-sm text-gray-400">
          Check back shortly &mdash; we&apos;ll be live before you know it.
        </p>
      </div>
    </div>
  )
}
