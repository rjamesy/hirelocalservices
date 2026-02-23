import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pagination from '../Pagination'

describe('Pagination', () => {
  it('returns null when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} />
    )
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renders nav with aria-label', () => {
    render(<Pagination currentPage={1} totalPages={5} />)
    expect(screen.getByLabelText('Pagination')).toBeInTheDocument()
  })

  it('disables Previous button on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('enables Previous button on page > 1', () => {
    render(<Pagination currentPage={2} totalPages={5} />)
    expect(screen.getByLabelText('Previous page')).not.toBeDisabled()
  })

  it('disables Next button on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} />)
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('enables Next button when not on last page', () => {
    render(<Pagination currentPage={1} totalPages={5} />)
    expect(screen.getByLabelText('Next page')).not.toBeDisabled()
  })

  it('marks current page with aria-current="page"', () => {
    render(<Pagination currentPage={3} totalPages={5} />)
    const currentButton = screen.getByLabelText('Page 3')
    expect(currentButton).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark other pages with aria-current', () => {
    render(<Pagination currentPage={3} totalPages={5} />)
    const otherButton = screen.getByLabelText('Page 2')
    expect(otherButton).not.toHaveAttribute('aria-current')
  })

  it('renders ellipsis for many pages', () => {
    render(<Pagination currentPage={5} totalPages={20} />)
    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })

  it('calls onPageChange when a page button is clicked', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={onPageChange}
      />
    )
    fireEvent.click(screen.getByLabelText('Page 2'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange when Next is clicked', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={onPageChange}
      />
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange when Previous is clicked', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={onPageChange}
      />
    )
    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('renders all pages when totalPages <= 7', () => {
    render(<Pagination currentPage={1} totalPages={5} />)
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(`Page ${i}`)).toBeInTheDocument()
    }
  })

  it('always shows first and last page for many pages', () => {
    render(<Pagination currentPage={10} totalPages={20} />)
    expect(screen.getByLabelText('Page 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 20')).toBeInTheDocument()
  })
})
