import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * POST /api/email/test
 *
 * Admin-only endpoint to send a test email.
 * Body: { to: string }
 */
export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Config check
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'Email service not configured. Check AWS SES env vars.' },
      { status: 503 }
    )
  }

  // Parse body
  let body: { to?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const to = body.to?.trim()
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'Valid "to" email address required' }, { status: 400 })
  }

  // Send test email
  const result = await sendEmail({
    to,
    subject: 'HireLocalServices — Test Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a56db;">HireLocalServices</h2>
        <p>This is a test email from your HireLocalServices platform.</p>
        <p>If you received this, your AWS SES email configuration is working correctly.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          Sent at ${new Date().toISOString()} by admin ${user.email}
        </p>
      </div>
    `,
    text: `HireLocalServices — Test Email\n\nThis is a test email from your HireLocalServices platform.\nIf you received this, your AWS SES email configuration is working correctly.\n\nSent at ${new Date().toISOString()} by admin ${user.email}`,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: `Failed to send: ${result.error}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    to,
  })
}
