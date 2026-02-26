'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ViewPublicProfileCardProps {
  businesses: { name: string; slug: string }[]
}

export default function ViewPublicProfileCard({ businesses }: ViewPublicProfileCardProps) {
  const [open, setOpen] = useState(false)

  if (businesses.length === 1) {
    return (
      <Link
        href={`/business/${businesses[0].slug}`}
        className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
          <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">View Public Profile</p>
          <p className="text-xs text-gray-500">See how customers see you</p>
        </div>
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100">
          <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">View Public Profile</p>
          <p className="text-xs text-gray-500">Choose a listing to view</p>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
          {businesses.map((b) => (
            <Link
              key={b.slug}
              href={`/business/${b.slug}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="font-medium text-gray-900">{b.name}</span>
              <span className="text-xs font-medium text-brand-600">View</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
