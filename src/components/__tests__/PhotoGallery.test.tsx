import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PhotoGallery from '../PhotoGallery'

const photos = [
  { url: '/photo1.jpg', sort_order: 1 },
  { url: '/photo2.jpg', sort_order: 0 },
  { url: '/photo3.jpg', sort_order: 2 },
]

describe('PhotoGallery', () => {
  it('returns null for empty photos array', () => {
    const { container } = render(<PhotoGallery photos={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders thumbnails for each photo', () => {
    render(<PhotoGallery photos={photos} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(3)
  })

  it('sorts photos by sort_order', () => {
    render(<PhotoGallery photos={photos} />)
    const images = screen.getAllByRole('img')
    expect(images[0]).toHaveAttribute('src', '/photo2.jpg')
    expect(images[1]).toHaveAttribute('src', '/photo1.jpg')
    expect(images[2]).toHaveAttribute('src', '/photo3.jpg')
  })

  it('opens lightbox when thumbnail is clicked', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByLabelText('Close lightbox')).toBeInTheDocument()
  })

  it('shows counter in lightbox', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('closes lightbox with close button', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(screen.getByLabelText('Close lightbox'))
    expect(screen.queryByLabelText('Close lightbox')).not.toBeInTheDocument()
  })

  it('navigates to next photo', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(screen.getByLabelText('Next photo'))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('navigates to previous photo', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]) // open second photo
    fireEvent.click(screen.getByLabelText('Previous photo'))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('closes lightbox with Escape key', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByLabelText('Close lightbox')).not.toBeInTheDocument()
  })

  it('navigates with ArrowRight key', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('navigates with ArrowLeft key', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('wraps around from last to first photo', () => {
    render(<PhotoGallery photos={photos} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2]) // open third photo
    fireEvent.click(screen.getByLabelText('Next photo'))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('does not render nav buttons for single photo', () => {
    render(<PhotoGallery photos={[{ url: '/single.jpg', sort_order: 0 }]} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.queryByLabelText('Next photo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Previous photo')).not.toBeInTheDocument()
  })
})
