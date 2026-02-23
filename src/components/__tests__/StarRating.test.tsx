import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StarRating from '../StarRating'

describe('StarRating', () => {
  it('renders 5 star SVGs', () => {
    const { container } = render(<StarRating rating={3} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(5)
  })

  it('renders correct number of full stars for rating 5', () => {
    const { container } = render(<StarRating rating={5} />)
    const amberStars = container.querySelectorAll('svg.text-amber-400')
    expect(amberStars).toHaveLength(5)
  })

  it('renders empty stars for rating 0', () => {
    const { container } = render(<StarRating rating={0} />)
    const grayStars = container.querySelectorAll('svg.text-gray-300')
    expect(grayStars).toHaveLength(5)
  })

  it('renders half star for rating 2.5', () => {
    const { container } = render(<StarRating rating={2.5} />)
    // Should have gradient for half star
    const gradients = container.querySelectorAll('linearGradient')
    expect(gradients.length).toBeGreaterThanOrEqual(1)
  })

  it('displays rating number when rating > 0', () => {
    render(<StarRating rating={4.5} />)
    expect(screen.getByText('4.5')).toBeInTheDocument()
  })

  it('does not display rating number when rating is 0', () => {
    render(<StarRating rating={0} />)
    expect(screen.queryByText('0.0')).not.toBeInTheDocument()
  })

  it('displays count when provided', () => {
    render(<StarRating rating={4} count={12} />)
    expect(screen.getByText('(12)')).toBeInTheDocument()
  })

  it('does not display count when not provided', () => {
    const { container } = render(<StarRating rating={4} />)
    expect(container.textContent).not.toContain('(')
  })

  it('has aria-label with rating out of 5', () => {
    render(<StarRating rating={3.5} />)
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeInTheDocument()
  })

  it('uses sm size classes', () => {
    const { container } = render(<StarRating rating={3} size="sm" />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs[0].getAttribute('class')).toContain('h-4')
  })
})
