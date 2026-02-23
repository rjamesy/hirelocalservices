import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TestimonialForm from '../TestimonialForm'

describe('TestimonialForm', () => {
  const onSubmit = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    onSubmit.mockClear()
  })

  it('renders name input', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument()
  })

  it('renders review textarea', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Your Review')).toBeInTheDocument()
  })

  it('renders rating label', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    expect(screen.getByText('Rating')).toBeInTheDocument()
  })

  it('renders 5 star rating buttons', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(`Rate ${i} star${i !== 1 ? 's' : ''}`)).toBeInTheDocument()
    }
  })

  it('shows character counter', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    expect(screen.getByText('0/1000')).toBeInTheDocument()
  })

  it('updates character counter as user types', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Review'), 'Hello')
    expect(screen.getByText('5/1000')).toBeInTheDocument()
  })

  it('selects rating when star is clicked', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.click(screen.getByLabelText('Rate 4 stars'))
    expect(screen.getByText('4 stars')).toBeInTheDocument()
  })

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'This is a great review text.')
    await user.click(screen.getByText('Submit Review'))
    expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()
  })

  it('shows validation error for no rating', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John')
    await user.type(screen.getByLabelText('Your Review'), 'This is a great review text.')
    await user.click(screen.getByText('Submit Review'))
    expect(screen.getByText('Please select a rating')).toBeInTheDocument()
  })

  it('shows validation error for short review', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John')
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'Short')
    await user.click(screen.getByText('Submit Review'))
    expect(screen.getByText('Review must be at least 10 characters')).toBeInTheDocument()
  })

  it('calls onSubmit with valid data', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John Smith')
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'This is an excellent service.')
    await user.click(screen.getByText('Submit Review'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        author_name: 'John Smith',
        rating: 5,
        text: 'This is an excellent service.',
      })
    })
  })

  it('shows success message after successful submit', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John Smith')
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'This is an excellent service.')
    await user.click(screen.getByText('Submit Review'))

    await waitFor(() => {
      expect(screen.getByText('Thank you for your review!')).toBeInTheDocument()
    })
  })

  it('shows write another review link after success', async () => {
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John Smith')
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'This is an excellent service.')
    await user.click(screen.getByText('Submit Review'))

    await waitFor(() => {
      expect(screen.getByText('Write another review')).toBeInTheDocument()
    })
  })

  it('shows error message when onSubmit throws', async () => {
    const failSubmit = vi.fn(() => Promise.reject(new Error('fail')))
    const user = userEvent.setup()
    render(<TestimonialForm onSubmit={failSubmit} />)
    await user.type(screen.getByLabelText('Your Name'), 'John Smith')
    await user.click(screen.getByLabelText('Rate 5 stars'))
    await user.type(screen.getByLabelText('Your Review'), 'This is an excellent service.')
    await user.click(screen.getByText('Submit Review'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
  })

  it('renders submit button', () => {
    render(<TestimonialForm onSubmit={onSubmit} />)
    expect(screen.getByText('Submit Review')).toBeInTheDocument()
  })
})
