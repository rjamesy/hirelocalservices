import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Header from '../Header'

const mockUser = { id: 'user-1', email: 'user@test.com' }
const mockLoggedInSession = { user: mockUser }

let authCallback: (event: string, session: unknown) => void = () => {}
let mockSessionValue: unknown = null
const mockSignOut = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: mockSessionValue }, error: null })
      ),
      onAuthStateChange: vi.fn((callback) => {
        authCallback = callback
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        }
      }),
      signOut: mockSignOut,
    },
  }),
}))

function renderLoggedIn() {
  mockSessionValue = mockLoggedInSession
  render(<Header />)
  // Trigger auth state change to set user via onAuthStateChange callback
  act(() => {
    authCallback('SIGNED_IN', mockLoggedInSession)
  })
}

describe('Header', () => {
  beforeEach(() => {
    mockSignOut.mockClear()
    authCallback = () => {}
    mockSessionValue = null
  })

  // --- Logged out state ---

  it('renders the brand name', () => {
    render(<Header />)
    expect(screen.getByText('HireLocalServices')).toBeInTheDocument()
  })

  it('renders Browse link', () => {
    render(<Header />)
    expect(screen.getAllByText('Browse').length).toBeGreaterThan(0)
  })

  it('renders For Business link', () => {
    render(<Header />)
    expect(screen.getAllByText('For Business').length).toBeGreaterThan(0)
  })

  it('shows Login link when logged out', () => {
    render(<Header />)
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0)
  })

  it('shows Sign Up link when logged out', () => {
    render(<Header />)
    expect(screen.getAllByText('Sign Up').length).toBeGreaterThan(0)
  })

  it('links Login to /login', () => {
    render(<Header />)
    const link = screen.getAllByText('Login')[0].closest('a')
    expect(link).toHaveAttribute('href', '/login')
  })

  it('links Sign Up to /signup', () => {
    render(<Header />)
    const link = screen.getAllByText('Sign Up')[0].closest('a')
    expect(link).toHaveAttribute('href', '/signup')
  })

  it('renders mobile menu toggle', () => {
    render(<Header />)
    expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument()
  })

  it('toggles mobile menu when hamburger is clicked', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Toggle menu'))
    const browseLinks = screen.getAllByText('Browse')
    expect(browseLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('renders header element', () => {
    const { container } = render(<Header />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  it('renders the HLS abbreviation for small screens', () => {
    render(<Header />)
    expect(screen.getByText('HLS')).toBeInTheDocument()
  })

  // --- Logged in state ---

  it('shows Dashboard link when logged in', async () => {
    renderLoggedIn()
    await waitFor(() => {
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    })
  })

  it('shows user email when logged in', async () => {
    renderLoggedIn()
    await waitFor(() => {
      expect(screen.getAllByText('user@test.com').length).toBeGreaterThan(0)
    })
  })

  it('hides Login/Sign Up when logged in', async () => {
    renderLoggedIn()
    await waitFor(() => {
      expect(screen.queryAllByText('Login')).toHaveLength(0)
    })
  })

  it('shows Sign Out in dropdown when logged in', async () => {
    renderLoggedIn()
    await waitFor(() => {
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    })
    // Click the dropdown trigger button in the nav
    const nav = document.querySelector('nav')
    const dropdownBtn = nav?.querySelector('button')
    if (dropdownBtn) fireEvent.click(dropdownBtn)
    await waitFor(() => {
      expect(screen.getAllByText('Sign Out').length).toBeGreaterThan(0)
    })
  })

  it('calls signOut when Sign Out button is clicked', async () => {
    renderLoggedIn()
    await waitFor(() => {
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    })
    const nav = document.querySelector('nav')
    const dropdownBtn = nav?.querySelector('button')
    if (dropdownBtn) fireEvent.click(dropdownBtn)
    await waitFor(() => {
      const signOutBtns = screen.getAllByText('Sign Out')
      fireEvent.click(signOutBtns[0])
    })
    expect(mockSignOut).toHaveBeenCalled()
  })
})
