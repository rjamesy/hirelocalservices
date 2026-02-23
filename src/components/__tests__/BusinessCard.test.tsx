import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BusinessCard from '../BusinessCard'

const defaultProps = {
  name: 'Ace Plumbing',
  slug: 'ace-plumbing',
  suburb: 'Brisbane',
  state: 'QLD',
  category_names: ['Plumbing', 'Gas Fitting'],
  description: 'Professional plumbing services across Brisbane.',
  review_count: 5,
  avg_rating: 4.5,
}

describe('BusinessCard', () => {
  it('renders the business name', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('Ace Plumbing')).toBeInTheDocument()
  })

  it('links to the business profile', () => {
    render(<BusinessCard {...defaultProps} />)
    const link = screen.getByText('View Profile')
    expect(link.closest('a')).toHaveAttribute('href', '/business/ace-plumbing')
  })

  it('renders the description', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('Professional plumbing services across Brisbane.')).toBeInTheDocument()
  })

  it('truncates long descriptions', () => {
    const longDesc = 'A'.repeat(200)
    render(<BusinessCard {...defaultProps} description={longDesc} />)
    expect(screen.getByText(`${'A'.repeat(150)}...`)).toBeInTheDocument()
  })

  it('renders location', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText(/Brisbane, QLD/)).toBeInTheDocument()
  })

  it('renders category badges', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('Plumbing')).toBeInTheDocument()
    expect(screen.getByText('Gas Fitting')).toBeInTheDocument()
  })

  it('limits visible category badges to 3 and shows +N', () => {
    const categories = ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5']
    render(<BusinessCard {...defaultProps} category_names={categories} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders star rating when review_count > 0', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('(5)')).toBeInTheDocument()
  })

  it('does not render rating when review_count is 0', () => {
    render(<BusinessCard {...defaultProps} review_count={0} avg_rating={undefined} />)
    expect(screen.queryByText('(0)')).not.toBeInTheDocument()
  })

  it('renders phone button when phone is provided', () => {
    render(<BusinessCard {...defaultProps} phone="0412345678" />)
    expect(screen.getByText('Call')).toBeInTheDocument()
  })

  it('does not render phone button when phone is not provided', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.queryByText('Call')).not.toBeInTheDocument()
  })

  it('renders website button when website is provided', () => {
    render(<BusinessCard {...defaultProps} website="https://example.com" />)
    expect(screen.getByText('Website')).toBeInTheDocument()
  })

  it('does not render website button when not provided', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.queryByText('Website')).not.toBeInTheDocument()
  })

  it('renders photo when photo_url is provided', () => {
    render(<BusinessCard {...defaultProps} photo_url="/test.jpg" />)
    const img = screen.getByAltText('Ace Plumbing')
    expect(img).toBeInTheDocument()
  })

  it('does not render photo section when no photo', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.queryByAltText('Ace Plumbing')).not.toBeInTheDocument()
  })

  it('shows distance when distance_m is provided', () => {
    render(<BusinessCard {...defaultProps} distance_m={5500} />)
    expect(screen.getByText('(5.5 km away)')).toBeInTheDocument()
  })

  it('does not show distance when distance_m is not provided', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.queryByText(/km away/)).not.toBeInTheDocument()
  })

  it('has a sr-only link text for accessibility', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('View Ace Plumbing')).toBeInTheDocument()
  })

  it('renders view profile link', () => {
    render(<BusinessCard {...defaultProps} />)
    expect(screen.getByText('View Profile')).toBeInTheDocument()
  })
})
