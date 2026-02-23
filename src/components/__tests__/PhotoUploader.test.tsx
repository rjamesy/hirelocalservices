import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PhotoUploader from '../PhotoUploader'

const defaultProps = {
  onUpload: vi.fn(),
  uploading: false,
  maxPhotos: 10,
  currentCount: 3,
}

describe('PhotoUploader', () => {
  it('renders upload prompt', () => {
    render(<PhotoUploader {...defaultProps} />)
    expect(screen.getByText(/Drag and drop a photo here/)).toBeInTheDocument()
  })

  it('shows slots remaining', () => {
    render(<PhotoUploader {...defaultProps} />)
    expect(screen.getByText(/7 slots remaining/)).toBeInTheDocument()
  })

  it('shows singular "slot" for 1 remaining', () => {
    render(<PhotoUploader {...defaultProps} currentCount={9} />)
    expect(screen.getByText(/1 slot remaining/)).toBeInTheDocument()
  })

  it('renders accepted file type info', () => {
    render(<PhotoUploader {...defaultProps} />)
    expect(screen.getByText(/JPEG, PNG, or WebP/)).toBeInTheDocument()
  })

  it('mentions size limit', () => {
    render(<PhotoUploader {...defaultProps} />)
    expect(screen.getByText(/5MB/)).toBeInTheDocument()
  })

  it('has a hidden file input', () => {
    const { container } = render(<PhotoUploader {...defaultProps} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('hidden')
  })

  it('file input accepts correct types', () => {
    const { container } = render(<PhotoUploader {...defaultProps} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('shows uploading text when uploading', () => {
    render(<PhotoUploader {...defaultProps} uploading={true} />)
    expect(screen.getByText('Uploading...')).toBeInTheDocument()
  })

  it('applies opacity class when uploading', () => {
    const { container } = render(<PhotoUploader {...defaultProps} uploading={true} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('opacity-50')
  })

  it('disables file input when uploading', () => {
    const { container } = render(<PhotoUploader {...defaultProps} uploading={true} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeDisabled()
  })

  it('calls onUpload when file is selected via input', async () => {
    const onUpload = vi.fn(() => Promise.resolve())
    const { container } = render(<PhotoUploader {...defaultProps} onUpload={onUpload} />)
    const input = container.querySelector('input[type="file"]')!

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    expect(onUpload).toHaveBeenCalledWith(file)
  })

  it('handles drag over', () => {
    const { container } = render(<PhotoUploader {...defaultProps} />)
    const wrapper = container.firstChild as HTMLElement
    fireEvent.dragOver(wrapper, { preventDefault: () => {} })
    expect(wrapper.className).toContain('border-brand-500')
  })
})
