import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Footer from '../Footer'

describe('Footer', () => {
  it('renders the brand name', () => {
    render(<Footer />)
    expect(screen.getByText('HireLocalServices')).toBeInTheDocument()
  })

  it('renders company links', () => {
    render(<Footer />)
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Terms of Service')).toBeInTheDocument()
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders category links', () => {
    render(<Footer />)
    expect(screen.getByText('Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Plumbing')).toBeInTheDocument()
    expect(screen.getByText('Electrical')).toBeInTheDocument()
  })

  it('renders state links', () => {
    render(<Footer />)
    expect(screen.getByText('QLD')).toBeInTheDocument()
    expect(screen.getByText('NSW')).toBeInTheDocument()
    expect(screen.getByText('VIC')).toBeInTheDocument()
  })

  it('renders copyright with current year', () => {
    render(<Footer />)
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`${currentYear}`))).toBeInTheDocument()
  })

  it('renders footer element', () => {
    const { container } = render(<Footer />)
    expect(container.querySelector('footer')).toBeInTheDocument()
  })

  it('renders version number from package.json', () => {
    render(<Footer />)
    expect(screen.getByTestId('footer-version')).toHaveTextContent(/^v\d+\.\d+\.\d+$/)
  })

  it('renders category links with correct href', () => {
    render(<Footer />)
    const cleaningLink = screen.getByText('Cleaning').closest('a')
    expect(cleaningLink).toHaveAttribute('href', '/search?category=cleaning')
  })
})
