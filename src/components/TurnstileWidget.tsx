'use client'

import { Turnstile } from '@marsidev/react-turnstile'

export default function TurnstileWidget({
  onSuccess,
  captchaRequired,
}: {
  onSuccess: (token: string) => void
  captchaRequired: boolean
}) {
  if (!captchaRequired) return null

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!siteKey) return null

  return (
    <div className="mt-4">
      <Turnstile siteKey={siteKey} onSuccess={onSuccess} />
    </div>
  )
}
