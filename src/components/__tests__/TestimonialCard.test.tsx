import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TestimonialCard from '../TestimonialCard'

const defaultProps = {
  author_name: 'Jane Smith',
  text: 'Excellent plumbing service, very professional.',
  rating: 5,
  created_at: '2024-03-15T10:00:00Z',
}

describe('TestimonialCard', () => {
  it('renders the author name', () => {
    render(<TestimonialCard {...defaultProps} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })

  it('renders the review text', () => {
    render(<TestimonialCard {...defaultProps} />)
    expect(screen.getByText('Excellent plumbing service, very professional.')).toBeInTheDocument()
  })

  it('renders star rating', () => {
    render(<TestimonialCard {...defaultProps} />)
    expect(screen.getByLabelText('5 out of 5 stars')).toBeInTheDocument()
  })

  it('renders the formatted date', () => {
    render(<TestimonialCard {...defaultProps} />)
    // en-AU format: 15 Mar 2024
    expect(screen.getByText('15 Mar 2024')).toBeInTheDocument()
  })

  it('renders the author initial as avatar', () => {
    render(<TestimonialCard {...defaultProps} />)
    expect(screen.getByText('J')).toBeInTheDocument()
  })

  it('has a time element with datetime attribute', () => {
    const { container } = render(<TestimonialCard {...defaultProps} />)
    const timeEl = container.querySelector('time')
    expect(timeEl).toHaveAttribute('datetime', '2024-03-15T10:00:00Z')
  })

  it('renders inside a blockquote', () => {
    const { container } = render(<TestimonialCard {...defaultProps} />)
    expect(container.querySelector('blockquote')).toBeInTheDocument()
  })
})
