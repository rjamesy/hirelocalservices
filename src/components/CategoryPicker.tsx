'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { searchCategories } from '@/lib/category-search'

interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  synonyms?: string[]
  keywords?: string[]
  sort_order?: number
}

interface CategoryPickerProps {
  categories: Category[]
  primaryCategory: string | null
  secondaryCategories: string[]
  onPrimaryChange: (id: string | null) => void
  onSecondaryChange: (ids: string[]) => void
  error?: string | null
}

export default function CategoryPicker({
  categories,
  primaryCategory,
  secondaryCategories,
  onPrimaryChange,
  onSecondaryChange,
  error,
}: CategoryPickerProps) {
  const [primaryQuery, setPrimaryQuery] = useState('')
  const [secondaryQuery, setSecondaryQuery] = useState('')
  const [showPrimaryResults, setShowPrimaryResults] = useState(false)
  const [showSecondaryResults, setShowSecondaryResults] = useState(false)
  const [primaryHighlight, setPrimaryHighlight] = useState(-1)
  const [secondaryHighlight, setSecondaryHighlight] = useState(-1)
  const [showBrowse, setShowBrowse] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const primaryInputRef = useRef<HTMLInputElement>(null)
  const secondaryInputRef = useRef<HTMLInputElement>(null)
  const primaryDropdownRef = useRef<HTMLDivElement>(null)
  const secondaryDropdownRef = useRef<HTMLDivElement>(null)

  // ── Derived data ──────────────────────────────────────────────────

  const groupedCategories = useMemo(() => {
    const parents = categories
      .filter((c) => !c.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return parents.map((parent) => ({
      ...parent,
      children: categories
        .filter((c) => c.parent_id === parent.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    }))
  }, [categories])

  const primaryResults = useMemo(() => {
    if (!primaryQuery.trim() || primaryQuery.length < 2) return []
    return searchCategories(primaryQuery, categories, { limit: 10 })
  }, [primaryQuery, categories])

  const primaryGroupId = useMemo(() => {
    if (!primaryCategory) return null
    return categories.find((c) => c.id === primaryCategory)?.parent_id ?? null
  }, [primaryCategory, categories])

  const primaryGroupName = useMemo(() => {
    if (!primaryGroupId) return ''
    return categories.find((c) => c.id === primaryGroupId)?.name ?? ''
  }, [primaryGroupId, categories])

  const siblings = useMemo(() => {
    if (!primaryGroupId) return []
    return categories
      .filter((c) => c.parent_id === primaryGroupId && c.id !== primaryCategory)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  }, [primaryGroupId, primaryCategory, categories])

  const secondaryResults = useMemo(() => {
    if (!secondaryQuery.trim() || secondaryQuery.length < 2 || !primaryGroupId) return []
    return searchCategories(secondaryQuery, categories, {
      groupId: primaryGroupId,
      excludeIds: [primaryCategory!, ...secondaryCategories],
      limit: 10,
    })
  }, [secondaryQuery, primaryGroupId, primaryCategory, secondaryCategories, categories])

  const getGroupName = useCallback(
    (categoryId: string) => {
      const cat = categories.find((c) => c.id === categoryId)
      if (!cat?.parent_id) return ''
      return categories.find((c) => c.id === cat.parent_id)?.name ?? ''
    },
    [categories]
  )

  const getCategoryName = useCallback(
    (categoryId: string) => categories.find((c) => c.id === categoryId)?.name ?? '',
    [categories]
  )

  // ── Auto-open accordion to selected group ─────────────────────────

  useEffect(() => {
    if (primaryGroupId && showBrowse) {
      setOpenGroup(primaryGroupId)
    }
  }, [primaryGroupId, showBrowse])

  // ── Click outside ─────────────────────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (primaryDropdownRef.current && !primaryDropdownRef.current.contains(e.target as Node) &&
          primaryInputRef.current && !primaryInputRef.current.contains(e.target as Node)) {
        setShowPrimaryResults(false)
      }
      if (secondaryDropdownRef.current && !secondaryDropdownRef.current.contains(e.target as Node) &&
          secondaryInputRef.current && !secondaryInputRef.current.contains(e.target as Node)) {
        setShowSecondaryResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────

  function selectPrimary(id: string) {
    onPrimaryChange(id)
    setPrimaryQuery('')
    setShowPrimaryResults(false)
    setPrimaryHighlight(-1)
  }

  function clearPrimary() {
    onPrimaryChange(null)
    onSecondaryChange([])
    setPrimaryQuery('')
    setSecondaryQuery('')
  }

  function addSecondary(id: string) {
    if (secondaryCategories.length >= 3) return
    onSecondaryChange([...secondaryCategories, id])
    setSecondaryQuery('')
    setShowSecondaryResults(false)
    setSecondaryHighlight(-1)
  }

  function removeSecondary(id: string) {
    onSecondaryChange(secondaryCategories.filter((s) => s !== id))
  }

  function toggleSecondary(id: string) {
    if (secondaryCategories.includes(id)) {
      removeSecondary(id)
    } else {
      addSecondary(id)
    }
  }

  function handlePrimaryKeyDown(e: React.KeyboardEvent) {
    if (!showPrimaryResults || primaryResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPrimaryHighlight((i) => Math.min(i + 1, primaryResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPrimaryHighlight((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && primaryHighlight >= 0) {
      e.preventDefault()
      selectPrimary(primaryResults[primaryHighlight].id)
    } else if (e.key === 'Escape') {
      setShowPrimaryResults(false)
    }
  }

  function handleSecondaryKeyDown(e: React.KeyboardEvent) {
    if (!showSecondaryResults || secondaryResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSecondaryHighlight((i) => Math.min(i + 1, secondaryResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSecondaryHighlight((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && secondaryHighlight >= 0) {
      e.preventDefault()
      addSecondary(secondaryResults[secondaryHighlight].id)
    } else if (e.key === 'Escape') {
      setShowSecondaryResults(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Primary Category ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Primary service <span className="text-red-500">*</span>
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Select the main service your business provides.
        </p>

        {/* Selected primary chip */}
        {primaryCategory && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
              {getCategoryName(primaryCategory)}
              <button
                type="button"
                onClick={clearPrimary}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-brand-600 hover:bg-brand-200 hover:text-brand-800 transition-colors"
                aria-label="Clear primary category"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span className="text-xs text-gray-400">{getGroupName(primaryCategory)}</span>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <input
            ref={primaryInputRef}
            type="text"
            value={primaryQuery}
            onChange={(e) => {
              setPrimaryQuery(e.target.value)
              setShowPrimaryResults(true)
              setPrimaryHighlight(-1)
            }}
            onFocus={() => primaryQuery.length >= 2 && setShowPrimaryResults(true)}
            onKeyDown={handlePrimaryKeyDown}
            placeholder="Search categories..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          {/* Dropdown */}
          {showPrimaryResults && primaryQuery.length >= 2 && (
            <div
              ref={primaryDropdownRef}
              className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto"
            >
              {primaryResults.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400">No matching categories</div>
              ) : (
                primaryResults.map((cat, i) => (
                  <button
                    key={cat.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectPrimary(cat.id)}
                    onMouseEnter={() => setPrimaryHighlight(i)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      i === primaryHighlight ? 'bg-brand-50 text-brand-900' : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <span className="font-medium">{cat.name}</span>
                    <span className="ml-2 text-gray-400">&mdash; {getGroupName(cat.id)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {/* Accordion browse */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowBrowse(!showBrowse)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={cn('h-3.5 w-3.5 transition-transform', showBrowse && 'rotate-90')}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Browse all categories
          </button>

          {showBrowse && (
            <div className="mt-2 rounded-md border border-gray-200 divide-y divide-gray-100">
              {groupedCategories.map((group) =>
                group.children.length > 0 ? (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span>
                        {group.name}{' '}
                        <span className="text-gray-400 font-normal">({group.children.length})</span>
                      </span>
                      <svg
                        className={cn('h-4 w-4 text-gray-400 transition-transform', openGroup === group.id && 'rotate-90')}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                    {openGroup === group.id && (
                      <div className="pb-1">
                        {group.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => selectPrimary(child.id)}
                            className={cn(
                              'w-full text-left pl-6 pr-3 py-1.5 text-sm transition-colors',
                              primaryCategory === child.id
                                ? 'bg-brand-50 text-brand-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            )}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary Categories ── */}
      {primaryCategory && siblings.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Additional services</h3>
          <p className="text-xs text-gray-500 mb-3">
            Optionally select related services from {primaryGroupName} (max 3).
            {secondaryCategories.length > 0 && (
              <span className="ml-1 font-medium text-gray-700">
                {secondaryCategories.length}/3 selected
              </span>
            )}
          </p>

          {/* Secondary chips */}
          {secondaryCategories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {secondaryCategories.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                >
                  {getCategoryName(id)}
                  <button
                    type="button"
                    onClick={() => removeSecondary(id)}
                    className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                    aria-label={`Remove ${getCategoryName(id)}`}
                  >
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Secondary search */}
          <div className="relative mb-3">
            <input
              ref={secondaryInputRef}
              type="text"
              value={secondaryQuery}
              onChange={(e) => {
                setSecondaryQuery(e.target.value)
                setShowSecondaryResults(true)
                setSecondaryHighlight(-1)
              }}
              onFocus={() => secondaryQuery.length >= 2 && setShowSecondaryResults(true)}
              onKeyDown={handleSecondaryKeyDown}
              disabled={secondaryCategories.length >= 3}
              placeholder={
                secondaryCategories.length >= 3
                  ? 'Maximum 3 selected'
                  : `Search in ${primaryGroupName}...`
              }
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
            />

            {showSecondaryResults && secondaryQuery.length >= 2 && (
              <div
                ref={secondaryDropdownRef}
                className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-auto"
              >
                {secondaryResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No matching categories</div>
                ) : (
                  secondaryResults.map((cat, i) => (
                    <button
                      key={cat.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addSecondary(cat.id)}
                      onMouseEnter={() => setSecondaryHighlight(i)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        i === secondaryHighlight ? 'bg-brand-50 text-brand-900' : 'text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      {cat.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Checkbox list of siblings */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {siblings.map((child) => (
              <label
                key={child.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm',
                  secondaryCategories.includes(child.id)
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-gray-200 hover:bg-gray-50',
                  !secondaryCategories.includes(child.id) && secondaryCategories.length >= 3
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                )}
              >
                <input
                  type="checkbox"
                  checked={secondaryCategories.includes(child.id)}
                  onChange={() => toggleSecondary(child.id)}
                  disabled={!secondaryCategories.includes(child.id) && secondaryCategories.length >= 3}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-gray-700">{child.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
