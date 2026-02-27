/**
 * AWS SES email utility.
 *
 * Server-side only. Never import this from client components.
 * Logs send attempts (to, subject, status) but never logs full bodies or secrets.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

// ─── Types ────────────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── Config ───────────────────────────────────────────────────────────

function getSESConfig() {
  const region = process.env.AWS_REGION || 'ap-southeast-2'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const emailFrom = process.env.EMAIL_FROM || 'noreply@hirelocalservices.com.au'

  if (!accessKeyId || !secretAccessKey) {
    return null
  }

  return { region, accessKeyId, secretAccessKey, emailFrom }
}

let sesClient: SESClient | null = null

function getClient(): SESClient | null {
  const config = getSESConfig()
  if (!config) return null

  if (!sesClient) {
    sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }
  return sesClient
}

// ─── Send Email ───────────────────────────────────────────────────────

const MAX_RETRIES = 3
const RETRY_BASE_MS = 500

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const config = getSESConfig()
  if (!config) {
    console.warn('[Email] SES not configured — skipping email send')
    return { success: false, error: 'Email service not configured' }
  }

  const client = getClient()
  if (!client) {
    return { success: false, error: 'Failed to create SES client' }
  }

  const toAddresses = Array.isArray(params.to) ? params.to : [params.to]
  const logTo = toAddresses.join(', ')

  const command = new SendEmailCommand({
    Source: config.emailFrom,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: params.subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: params.html,
          Charset: 'UTF-8',
        },
        ...(params.text
          ? {
              Text: {
                Data: params.text,
                Charset: 'UTF-8',
              },
            }
          : {}),
      },
    },
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await client.send(command)
      const messageId = result.MessageId

      console.log(`[Email] Sent to=${logTo} subject="${params.subject}" messageId=${messageId}`)
      return { success: true, messageId }
    } catch (err: any) {
      const isRetryable =
        err.name === 'Throttling' ||
        err.name === 'ServiceUnavailableException' ||
        err.$retryable

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
        console.warn(
          `[Email] Attempt ${attempt}/${MAX_RETRIES} failed (${err.name}), retrying in ${delay}ms`
        )
        await sleep(delay)
        continue
      }

      console.error(`[Email] Failed to=${logTo} subject="${params.subject}" error=${err.name}: ${err.message}`)
      return { success: false, error: `${err.name}: ${err.message}` }
    }
  }

  return { success: false, error: 'Max retries exceeded' }
}

/**
 * Check if email sending is configured.
 */
export function isEmailConfigured(): boolean {
  return getSESConfig() !== null
}

// ─── Shared Email Footer ─────────────────────────────────────────────

export const EMAIL_FOOTER_HTML = `
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;" />
<table style="width: 100%;">
  <tr>
    <td style="color: #6b7280; font-size: 12px; line-height: 1.6; font-family: Arial, sans-serif;">
      HireLocalServices<br />
      ABN 42 329 061 077<br />
      Queensland, Australia<br />
      <a href="mailto:support@hirelocalservices.com.au" style="color: #2563eb; text-decoration: none;">support@hirelocalservices.com.au</a>
    </td>
  </tr>
</table>
`

export const EMAIL_FOOTER_TEXT = `\n---\nHireLocalServices\nABN 42 329 061 077\nQueensland, Australia\nsupport@hirelocalservices.com.au`
