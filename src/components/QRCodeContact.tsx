'use client'

import { useEffect, useState } from 'react'

interface QRCodeContactProps {
  businessName: string
  phone?: string | null
  email?: string | null
  website?: string | null
}

/**
 * Generates a QR code containing business contact info as a vCard.
 * Users can scan to save the contact directly to their phone.
 */
export default function QRCodeContact({
  businessName,
  phone,
  email,
  website,
}: QRCodeContactProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    // Build vCard string
    const vcard = buildVCard(businessName, phone, email, website)

    // Dynamic import to avoid SSR issues
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(vcard, {
        width: 200,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }).then((url) => {
        setQrDataUrl(url)
      }).catch(() => {
        setQrDataUrl(null)
      })
    })
  }, [isOpen, businessName, phone, email, website])

  // Don't show if no contact info at all
  if (!phone && !email && !website) return null

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        {isOpen ? 'Hide QR Code' : 'Save Contact'}
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          {qrDataUrl ? (
            <>
              <img
                src={qrDataUrl}
                alt={`QR code for ${businessName}`}
                className="mx-auto"
                width={200}
                height={200}
              />
              <p className="mt-2 text-xs text-gray-500">
                Scan to save contact to your phone
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Generating QR code...</p>
          )}
        </div>
      )}
    </div>
  )
}

function buildVCard(
  name: string,
  phone?: string | null,
  email?: string | null,
  website?: string | null
): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(name)}`,
    `ORG:${escapeVCard(name)}`,
  ]

  if (phone) {
    lines.push(`TEL;TYPE=WORK:${phone}`)
  }
  if (email) {
    lines.push(`EMAIL;TYPE=WORK:${email}`)
  }
  if (website) {
    const url = website.startsWith('http') ? website : `https://${website}`
    lines.push(`URL:${url}`)
  }

  lines.push('END:VCARD')
  return lines.join('\n')
}

function escapeVCard(str: string): string {
  return str.replace(/[,;\\]/g, (m) => `\\${m}`)
}
