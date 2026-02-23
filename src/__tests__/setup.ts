import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import React from 'react'

afterEach(() => {
  cleanup()
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  redirect: vi.fn(),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement(
      'a',
      {
        href: props.href as string,
        onClick: props.onClick as (() => void) | undefined,
        className: props.className as string | undefined,
      },
      props.children as React.ReactNode
    ),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, sizes, ...rest } = props
    return React.createElement('img', rest)
  },
}))

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve(
      new Map([
        ['x-forwarded-for', '127.0.0.1'],
      ])
    )
  ),
  cookies: vi.fn(() => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}))
