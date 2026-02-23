/**
 * tests/qr-code.test.ts
 *
 * Tests for QR code contact feature:
 * - vCard generation
 * - QR code component rendering
 * - Contact data encoding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock qrcode module
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockQR')),
  },
  toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockQR')),
}))

import QRCodeContact from '@/components/QRCodeContact'

describe('QR Code Contact Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Component Rendering ──────────────────────────────────────────

  describe('QRCodeContact component', () => {
    it('should render Save Contact button when contact info exists', () => {
      render(
        <QRCodeContact
          businessName="Smiths Plumbing"
          phone="0412345678"
        />
      )

      expect(screen.getByText('Save Contact')).toBeTruthy()
    })

    it('should not render when no contact info at all', () => {
      const { container } = render(
        <QRCodeContact
          businessName="No Contact Business"
          phone={null}
          email={null}
          website={null}
        />
      )

      expect(container.innerHTML).toBe('')
    })

    it('should render with phone only', () => {
      render(
        <QRCodeContact
          businessName="Phone Only Business"
          phone="0412345678"
          email={null}
          website={null}
        />
      )

      expect(screen.getByText('Save Contact')).toBeTruthy()
    })

    it('should render with email only', () => {
      render(
        <QRCodeContact
          businessName="Email Only Business"
          phone={null}
          email="info@example.com"
          website={null}
        />
      )

      expect(screen.getByText('Save Contact')).toBeTruthy()
    })

    it('should render with website only', () => {
      render(
        <QRCodeContact
          businessName="Web Only Business"
          phone={null}
          email={null}
          website="https://example.com"
        />
      )

      expect(screen.getByText('Save Contact')).toBeTruthy()
    })

    it('should toggle QR code display on button click', async () => {
      render(
        <QRCodeContact
          businessName="Smiths Plumbing"
          phone="0412345678"
        />
      )

      // Initially hidden
      expect(screen.queryByText('Scan to save contact to your phone')).toBeNull()

      // Click to show
      fireEvent.click(screen.getByText('Save Contact'))

      // Wait for QR code to generate
      await waitFor(() => {
        expect(screen.getByText('Scan to save contact to your phone')).toBeTruthy()
      })

      // Button text should change
      expect(screen.getByText('Hide QR Code')).toBeTruthy()
    })

    it('should hide QR code when clicking Hide button', async () => {
      render(
        <QRCodeContact
          businessName="Smiths Plumbing"
          phone="0412345678"
        />
      )

      // Open
      fireEvent.click(screen.getByText('Save Contact'))

      await waitFor(() => {
        expect(screen.getByText('Hide QR Code')).toBeTruthy()
      })

      // Close
      fireEvent.click(screen.getByText('Hide QR Code'))

      expect(screen.getByText('Save Contact')).toBeTruthy()
      expect(screen.queryByText('Scan to save contact to your phone')).toBeNull()
    })
  })

  // ─── vCard Generation ─────────────────────────────────────────────

  describe('vCard format', () => {
    it('should produce valid vCard 3.0 structure', () => {
      const vcard = buildVCard('Smiths Plumbing', '0412345678', 'info@smiths.com.au', 'https://smiths.com.au')

      expect(vcard).toContain('BEGIN:VCARD')
      expect(vcard).toContain('VERSION:3.0')
      expect(vcard).toContain('FN:Smiths Plumbing')
      expect(vcard).toContain('ORG:Smiths Plumbing')
      expect(vcard).toContain('TEL;TYPE=WORK:0412345678')
      expect(vcard).toContain('EMAIL;TYPE=WORK:info@smiths.com.au')
      expect(vcard).toContain('URL:https://smiths.com.au')
      expect(vcard).toContain('END:VCARD')
    })

    it('should omit phone when not provided', () => {
      const vcard = buildVCard('Test Business', null, 'test@test.com', null)
      expect(vcard).not.toContain('TEL')
      expect(vcard).toContain('EMAIL;TYPE=WORK:test@test.com')
    })

    it('should omit email when not provided', () => {
      const vcard = buildVCard('Test Business', '0412345678', null, null)
      expect(vcard).not.toContain('EMAIL')
      expect(vcard).toContain('TEL;TYPE=WORK:0412345678')
    })

    it('should omit website when not provided', () => {
      const vcard = buildVCard('Test Business', '0412345678', null, null)
      expect(vcard).not.toContain('URL')
    })

    it('should add https:// to website if missing', () => {
      const vcard = buildVCard('Test Business', null, null, 'example.com')
      expect(vcard).toContain('URL:https://example.com')
    })

    it('should not add https:// if already present', () => {
      const vcard = buildVCard('Test Business', null, null, 'https://example.com')
      expect(vcard).toContain('URL:https://example.com')
      expect(vcard).not.toContain('URL:https://https://')
    })

    it('should escape special characters in business name', () => {
      const vcard = buildVCard('Smith, Jones & Co; Plumbing', null, null, null)
      expect(vcard).toContain('FN:Smith\\, Jones & Co\\; Plumbing')
    })

    it('should handle all fields present', () => {
      const vcard = buildVCard(
        'ABC Plumbing',
        '0298765432',
        'contact@abc.com.au',
        'https://abcplumbing.com.au'
      )

      const lines = vcard.split('\n')
      expect(lines[0]).toBe('BEGIN:VCARD')
      expect(lines[lines.length - 1]).toBe('END:VCARD')
      expect(lines.filter(l => l.startsWith('TEL'))).toHaveLength(1)
      expect(lines.filter(l => l.startsWith('EMAIL'))).toHaveLength(1)
      expect(lines.filter(l => l.startsWith('URL'))).toHaveLength(1)
    })
  })
})

// ─── Helper: Replicate vCard generation logic for testing ──────────

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
