import { createAdminClient } from '@/lib/supabase/admin'

export default async function MaintenancePage() {
  let message = 'System temporarily unavailable. Please try again later.'

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('system_flags')
      .select('maintenance_message')
      .eq('id', 1)
      .single()
    if (data?.maintenance_message) {
      message = data.maintenance_message as string
    }
  } catch {
    // Use default message
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
          <svg
            className="h-8 w-8 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17l-1.06 3.18a1.5 1.5 0 001.42 2.11h.12a1.5 1.5 0 001.42-2.11l-1.06-3.18M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 6v3.75m0 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Under Maintenance</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <p className="text-sm text-gray-400">
          We apologise for the inconvenience. Please check back shortly.
        </p>
      </div>
    </div>
  )
}
