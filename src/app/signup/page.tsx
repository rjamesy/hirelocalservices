'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { checkRegistrationAllowed } from '@/app/actions/auth'
import { getPublicProtectionFlags } from '@/app/actions/protection'
import TurnstileWidget from '@/components/TurnstileWidget'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    getPublicProtectionFlags().then((flags) => {
      setCaptchaRequired(flags.captcha_required)
    })
  }, [])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      setLoading(false)
      return
    }

    // Pre-signup protection check
    const check = await checkRegistrationAllowed(
      'client', // IP resolved server-side in production
      captchaToken ?? undefined
    )
    if (!check.allowed) {
      setError(check.error ?? 'Registration not allowed.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div data-testid="signup-success" className="w-full max-w-md bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email to confirm</h2>
          <p className="text-gray-600 mb-6">
            We sent a confirmation link to <span className="font-medium">{email}</span>.
            Please click the link to verify your account and get started.
          </p>
          <Link
            href="/login"
            className="text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-600 mt-1">List your business on Hire Local Services</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {error && (
            <div data-testid="signup-error" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  data-testid="signup-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  data-testid="signup-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:text-sm"
                  placeholder="Minimum 8 characters"
                />
                <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters long</p>
              </div>
            </div>

            <TurnstileWidget
              captchaRequired={captchaRequired}
              onSuccess={(token) => setCaptchaToken(token)}
            />

            <button
              type="submit"
              data-testid="signup-submit"
              disabled={loading || (captchaRequired && !captchaToken)}
              className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" data-testid="signup-login-link" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
