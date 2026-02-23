import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CategoryGrid from '../CategoryGrid'

const categories = [
  { name: 'Plumbing', slug: 'plumbing', count: 5 },
  { name: 'Electrical', slug: 'electrical', count: 1 },
  { name: 'Cleaning', slug: 'cleaning', count: 0 },
]

describe('CategoryGrid', () => {
  it('renders category names', () => {
    render(<CategoryGrid categories={categories} />)
    expect(screen.getByText('Plumbing')).toBeInTheDocument()
    expect(screen.getByText('Electrical')).toBeInTheDocument()
    expect(screen.getByText('Cleaning')).toBeInTheDocument()
  })

  it('renders links with correct href', () => {
    render(<CategoryGrid categories={categories} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/search?category=plumbing')
    expect(links[1]).toHaveAttribute('href', '/search?category=electrical')
  })

  it('renders listing counts', () => {
    render(<CategoryGrid categories={categories} />)
    expect(screen.getByText('5 listings')).toBeInTheDocument()
  })

  it('uses singular "listing" for count of 1', () => {
    render(<CategoryGrid categories={categories} />)
    expect(screen.getByText('1 listing')).toBeInTheDocument()
  })

  it('uses plural "listings" for count of 0', () => {
    render(<CategoryGrid categories={categories} />)
    expect(screen.getByText('0 listings')).toBeInTheDocument()
  })

  it('does not render count when undefined', () => {
    render(<CategoryGrid categories={[{ name: 'Test', slug: 'test' }]} />)
    expect(screen.queryByText(/listing/)).not.toBeInTheDocument()
  })

  it('renders nothing for empty categories array', () => {
    const { container } = render(<CategoryGrid categories={[]} />)
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(0)
  })
})
