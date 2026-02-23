import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmptyState from '../EmptyState'

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No results" />)
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('renders the description when provided', () => {
    render(<EmptyState title="No results" description="Try a different search." />)
    expect(screen.getByText('Try a different search.')).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No results" />)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(0)
  })

  it('renders custom icon when provided', () => {
    render(
      <EmptyState
        title="No results"
        icon={<span data-testid="custom-icon">Icon</span>}
      />
    )
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('renders default icon when no custom icon', () => {
    const { container } = render(<EmptyState title="No results" />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('renders action as link when href is provided', () => {
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Go Home', href: '/' }}
      />
    )
    const link = screen.getByText('Go Home')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders action as button when no href', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Retry', onClick }}
      />
    )
    const button = screen.getByText('Retry')
    expect(button.tagName).toBe('BUTTON')
  })

  it('calls onClick when button action is clicked', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Retry', onClick }}
      />
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
