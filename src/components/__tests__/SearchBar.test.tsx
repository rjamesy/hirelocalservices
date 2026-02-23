import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import SearchBar from '../SearchBar'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}))

// Mock fetch for suggestion endpoint
global.fetch = vi.fn()

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Basic Rendering ────────────────────────────────────────────

  it('renders business name input', () => {
    render(<SearchBar />)
    expect(screen.getByPlaceholderText('Business name (optional)')).toBeInTheDocument()
  })

  it('renders category select with "All Categories"', () => {
    render(<SearchBar />)
    expect(screen.getByDisplayValue('All Categories')).toBeInTheDocument()
  })

  it('renders location input with placeholder', () => {
    render(<SearchBar />)
    expect(screen.getByPlaceholderText('Suburb or postcode')).toBeInTheDocument()
  })

  it('renders radius select', () => {
    render(<SearchBar />)
    expect(screen.getByDisplayValue('25 km')).toBeInTheDocument()
  })

  it('renders search button', () => {
    render(<SearchBar />)
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('renders more filters toggle', () => {
    render(<SearchBar />)
    expect(screen.getByText('More filters')).toBeInTheDocument()
  })

  it('shows keyword input when filters toggled', () => {
    render(<SearchBar />)
    fireEvent.click(screen.getByText('More filters'))
    expect(screen.getByPlaceholderText(/emergency/)).toBeInTheDocument()
  })

  it('toggles filter text from More to Fewer', () => {
    render(<SearchBar />)
    fireEvent.click(screen.getByText('More filters'))
    expect(screen.getByText('Fewer filters')).toBeInTheDocument()
  })

  it('renders all default categories', () => {
    render(<SearchBar />)
    const select = screen.getAllByRole('combobox')[0]
    expect(select.querySelectorAll('option')).toHaveLength(11) // "All Categories" + 10
  })

  // ─── Default Values ─────────────────────────────────────────────

  it('applies default category value', () => {
    render(<SearchBar defaultCategory="plumbing" />)
    const select = screen.getAllByRole('combobox')[0]
    expect(select).toHaveValue('plumbing')
  })

  it('applies default location value', () => {
    render(<SearchBar defaultLocation="Brisbane, QLD 4000" />)
    expect(screen.getByDisplayValue('Brisbane, QLD 4000')).toBeInTheDocument()
  })

  it('applies default business name value', () => {
    render(<SearchBar defaultBusinessName="Test Plumbing" />)
    expect(screen.getByDisplayValue('Test Plumbing')).toBeInTheDocument()
  })

  it('applies default radius value when location token is set', () => {
    render(
      <SearchBar
        defaultRadius="10"
        defaultLocationToken={{ suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 }}
      />
    )
    expect(screen.getByDisplayValue('10 km')).toBeInTheDocument()
  })

  // ─── Disabled States (UI Logic) ────────────────────────────────

  it('search button disabled when no business name and no location selected', () => {
    render(<SearchBar />)
    const button = screen.getByText('Search').closest('button')!
    expect(button).toBeDisabled()
  })

  it('search button enabled when business name is provided (no location needed)', () => {
    render(<SearchBar />)
    const input = screen.getByPlaceholderText('Business name (optional)')
    fireEvent.change(input, { target: { value: 'Test Plumbing' } })
    const button = screen.getByText('Search').closest('button')!
    expect(button).not.toBeDisabled()
  })

  it('search button enabled when location token is set (no business name)', () => {
    render(
      <SearchBar
        defaultLocation="Brisbane, QLD 4000"
        defaultLocationToken={{ suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 }}
      />
    )
    const button = screen.getByText('Search').closest('button')!
    expect(button).not.toBeDisabled()
  })

  it('radius select disabled when no location token', () => {
    render(<SearchBar />)
    const selects = screen.getAllByRole('combobox')
    // Radius is the second combobox (after category)
    const radiusSelect = selects[1]
    expect(radiusSelect).toBeDisabled()
  })

  it('radius select enabled when location token is set', () => {
    render(
      <SearchBar
        defaultLocation="Brisbane, QLD 4000"
        defaultLocationToken={{ suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 }}
      />
    )
    const selects = screen.getAllByRole('combobox')
    const radiusSelect = selects[1]
    expect(radiusSelect).not.toBeDisabled()
  })

  // ─── Location Placeholder Changes ──────────────────────────────

  it('keeps same location placeholder regardless of business name', () => {
    render(<SearchBar />)
    const nameInput = screen.getByPlaceholderText('Business name (optional)')
    fireEvent.change(nameInput, { target: { value: 'Test' } })
    expect(screen.getByPlaceholderText('Suburb or postcode')).toBeInTheDocument()
  })

  it('shows location placeholder when business name is empty', () => {
    render(<SearchBar />)
    expect(screen.getByPlaceholderText('Suburb or postcode')).toBeInTheDocument()
  })

  // ─── Helper / Validation Messages ─────────────────────────────

  it('shows neutral helper text on initial render (not error)', () => {
    render(<SearchBar />)
    const msg = screen.getByText('Enter a suburb or postcode, or search by business name.')
    expect(msg).toBeInTheDocument()
    expect(msg).toHaveClass('text-gray-500')
  })

  it('shows error style after invalid submit attempt', () => {
    render(<SearchBar />)
    fireEvent.submit(screen.getByText('Search').closest('form')!)
    const msg = screen.getByText('Enter a suburb or postcode, or search by business name.')
    expect(msg).toHaveClass('text-red-600')
  })

  it('hides helper text when business name is entered', () => {
    render(<SearchBar />)
    const input = screen.getByPlaceholderText('Business name (optional)')
    fireEvent.change(input, { target: { value: 'Test' } })
    expect(screen.queryByText('Enter a suburb or postcode, or search by business name.')).not.toBeInTheDocument()
  })

  // ─── Navigation ────────────────────────────────────────────────

  it('navigates with business name params on submit', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)
    render(<SearchBar />)
    const input = screen.getByPlaceholderText('Business name (optional)')
    fireEvent.change(input, { target: { value: 'Test Plumbing' } })
    fireEvent.submit(screen.getByText('Search').closest('form')!)
    expect(push).toHaveBeenCalledWith(expect.stringContaining('businessName=Test+Plumbing'))
  })

  it('navigates with location params when location token is set', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)
    render(
      <SearchBar
        defaultLocation="Brisbane, QLD 4000"
        defaultLocationToken={{ suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 }}
      />
    )
    fireEvent.submit(screen.getByText('Search').closest('form')!)
    expect(push).toHaveBeenCalledWith(expect.stringContaining('suburb=Brisbane'))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('state=QLD'))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('postcode=4000'))
  })

  it('does not navigate when search button is disabled', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)
    render(<SearchBar />)
    fireEvent.submit(screen.getByText('Search').closest('form')!)
    expect(push).not.toHaveBeenCalled()
  })

  it('does not include radius in URL when using default 25km', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)
    render(
      <SearchBar
        defaultLocation="Brisbane, QLD 4000"
        defaultLocationToken={{ suburb: 'Brisbane', state: 'QLD', postcode: '4000', lat: -27.47, lng: 153.02 }}
      />
    )
    fireEvent.submit(screen.getByText('Search').closest('form')!)
    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('radius='))
  })
})
