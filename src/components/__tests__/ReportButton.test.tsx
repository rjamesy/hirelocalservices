import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportButton from '../ReportButton'

// Mock the reportBusiness action
vi.mock('@/app/actions/report', () => ({
  reportBusiness: vi.fn(() => Promise.resolve({ success: true })),
}))

import { reportBusiness } from '@/app/actions/report'

describe('ReportButton', () => {
  beforeEach(() => {
    vi.mocked(reportBusiness).mockClear()
    vi.mocked(reportBusiness).mockResolvedValue({ success: true })
  })

  it('renders Report button', () => {
    render(<ReportButton businessId="biz-123" />)
    expect(screen.getByText('Report')).toBeInTheDocument()
  })

  it('opens modal when Report is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    expect(screen.getByText('Report Listing')).toBeInTheDocument()
  })

  it('renders reason select in modal', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
  })

  it('renders details textarea', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    expect(screen.getByLabelText(/Additional Details/)).toBeInTheDocument()
  })

  it('closes modal with Cancel button', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.click(screen.getByText('Cancel'))
    // Modal should be closing
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument()
  })

  it('closes modal with close button', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.click(screen.getByLabelText('Close'))
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument()
  })

  it('closes modal by clicking overlay', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    // Click the overlay (the absolute inset-0 bg-black/50 div)
    const overlay = document.querySelector('.bg-black\\/50')
    if (overlay) fireEvent.click(overlay)
    expect(screen.queryByText('Report Listing')).not.toBeInTheDocument()
  })

  it('submit button is disabled when no reason selected', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    const submitBtn = screen.getByText('Submit Report')
    expect(submitBtn).toBeDisabled()
  })

  it('submits report with reason', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.selectOptions(screen.getByLabelText(/Reason/), 'spam')
    await user.click(screen.getByText('Submit Report'))

    await waitFor(() => {
      expect(reportBusiness).toHaveBeenCalledWith('biz-123', expect.any(FormData))
    })
  })

  it('shows success message after submit', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.selectOptions(screen.getByLabelText(/Reason/), 'spam')
    await user.click(screen.getByText('Submit Report'))

    await waitFor(() => {
      expect(screen.getByText('Report Submitted')).toBeInTheDocument()
    })
  })

  it('shows error when reportBusiness returns error', async () => {
    vi.mocked(reportBusiness).mockResolvedValue({ error: 'Rate limit exceeded' })
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.selectOptions(screen.getByLabelText(/Reason/), 'spam')
    await user.click(screen.getByText('Submit Report'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
  })

  it('shows error when reportBusiness throws', async () => {
    vi.mocked(reportBusiness).mockRejectedValue(new Error('fail'))
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    await user.selectOptions(screen.getByLabelText(/Reason/), 'spam')
    await user.click(screen.getByText('Submit Report'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
  })

  it('has reason options for all report types', async () => {
    const user = userEvent.setup()
    render(<ReportButton businessId="biz-123" />)
    await user.click(screen.getByText('Report'))
    const select = screen.getByLabelText(/Reason/)
    expect(select.querySelectorAll('option')).toHaveLength(5) // placeholder + 4 options
  })
})
