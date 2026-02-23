'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

interface Category {
  name: string;
  slug: string;
}

interface LocationToken {
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

interface SearchBarProps {
  variant?: 'hero' | 'compact';
  categories?: Category[];
  defaultCategory?: string;
  defaultLocation?: string;
  defaultRadius?: string;
  defaultKeyword?: string;
  defaultBusinessName?: string;
  /** Pre-validated location token from server (for re-rendering with existing search) */
  defaultLocationToken?: LocationToken | null;
}

const defaultCategories: Category[] = [
  { name: 'Cleaning', slug: 'cleaning' },
  { name: 'Plumbing', slug: 'plumbing' },
  { name: 'Electrical', slug: 'electrical' },
  { name: 'Gardening', slug: 'gardening' },
  { name: 'Handyman', slug: 'handyman' },
  { name: 'Pest Control', slug: 'pest-control' },
  { name: 'Painting', slug: 'painting' },
  { name: 'Roofing', slug: 'roofing' },
  { name: 'Locksmith', slug: 'locksmith' },
  { name: 'Moving', slug: 'moving' },
];

const radiusOptions = [
  { label: '5 km', value: '5' },
  { label: '10 km', value: '10' },
  { label: '25 km', value: '25' },
  { label: '50 km', value: '50' },
];

interface Suggestion {
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

export default function SearchBar({
  variant = 'hero',
  categories = defaultCategories,
  defaultCategory = '',
  defaultLocation = '',
  defaultRadius = '25',
  defaultKeyword = '',
  defaultBusinessName = '',
  defaultLocationToken = null,
}: SearchBarProps) {
  const router = useRouter();
  const [category, setCategory] = useState(defaultCategory);
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [locationInput, setLocationInput] = useState(defaultLocation);
  const [locationToken, setLocationToken] = useState<LocationToken | null>(defaultLocationToken);
  const [radius, setRadius] = useState(defaultLocationToken ? defaultRadius : '25');
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [showFilters, setShowFilters] = useState(!!defaultKeyword);

  // Suggestion state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHero = variant === 'hero';

  const hasValidLocation = locationToken !== null;
  const hasBusinessName = businessName.trim().length > 0;
  const canSearch = hasBusinessName || hasValidLocation;

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/locations/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setHighlightedIndex(-1);
      }
    } catch {
      // Ignore fetch errors
    }
  }, []);

  function handleLocationInputChange(val: string) {
    setLocationInput(val);
    // If user is typing, clear the token (they need to re-select)
    if (locationToken) {
      setLocationToken(null);
    }
    // Debounce the suggestion fetch
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200);
  }

  function selectSuggestion(s: Suggestion) {
    const token: LocationToken = {
      suburb: s.suburb,
      state: s.state,
      postcode: s.postcode,
      lat: s.lat,
      lng: s.lng,
    };
    setLocationToken(token);
    setLocationInput(`${s.suburb}, ${s.state} ${s.postcode}`);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  function handleLocationKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;

    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (businessName.trim()) params.set('businessName', businessName.trim());
    if (locationToken) {
      params.set('suburb', locationToken.suburb);
      params.set('state', locationToken.state);
      params.set('postcode', locationToken.postcode);
      if (radius && radius !== '25') params.set('radius', radius);
    }
    if (keyword) params.set('keyword', keyword);

    router.push(`/search?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className={isHero ? 'w-full' : 'w-full'}>
      <div
        className={`
          rounded-xl bg-white shadow-lg border border-gray-200
          ${isHero ? 'p-4 sm:p-6' : 'p-3 sm:p-4'}
        `}
      >
        {/* Row 1: Search fields */}
        <div className="flex flex-wrap gap-3">
          {/* Business Name Input */}
          <div className="min-w-[240px] flex-1 shrink-0">
            {isHero && (
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Business Name
              </label>
            )}
            <input
              type="text"
              data-testid="search-businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Business name (optional)"
              className={`
                w-full rounded-lg border border-gray-300 bg-white text-gray-900
                placeholder:text-gray-400
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                transition-colors
                ${isHero ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
              `}
            />
          </div>

          {/* Category Select */}
          <div className="min-w-[200px] flex-1 shrink-0">
            {isHero && (
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Category
              </label>
            )}
            <select
              data-testid="search-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`
                w-full rounded-lg border border-gray-300 bg-white text-gray-900
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                transition-colors
                ${isHero ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
              `}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Location Input with Typeahead */}
          <div ref={suggestRef} className="relative min-w-[240px] flex-1 shrink-0">
            {isHero && (
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Location
              </label>
            )}
            <div className="relative">
              <svg
                className={`absolute left-3 text-gray-400 pointer-events-none ${isHero ? 'top-3.5 h-5 w-5' : 'top-2.5 h-4 w-4'}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                data-testid="search-location"
                value={locationInput}
                onChange={(e) => handleLocationInputChange(e.target.value)}
                onKeyDown={handleLocationKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Suburb or postcode"
                className={`
                  w-full rounded-lg border bg-white text-gray-900
                  placeholder:text-gray-400
                  focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                  transition-colors
                  ${locationInput && !locationToken ? 'border-amber-400' : 'border-gray-300'}
                  ${isHero ? 'pl-10 pr-4 py-3 text-base' : 'pl-9 pr-3 py-2 text-sm'}
                `}
              />
              {/* Green check when location is valid */}
              {locationToken && (
                <svg
                  className={`absolute right-3 text-green-500 ${isHero ? 'top-3.5 h-5 w-5' : 'top-2.5 h-4 w-4'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>

            {/* Suggestion Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.postcode}-${s.suburb}`}
                    type="button"
                    data-testid="location-suggest-item"
                    onClick={() => selectSuggestion(s)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 transition-colors ${
                      i === highlightedIndex ? 'bg-brand-50 text-brand-700' : 'text-gray-900'
                    }`}
                  >
                    <span className="font-medium">{s.suburb}</span>
                    <span className="text-gray-500">, {s.state} {s.postcode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Radius Select */}
          <div className="min-w-[140px] shrink-0">
            {isHero && (
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Radius
              </label>
            )}
            <select
              data-testid="search-radius"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              disabled={!hasValidLocation}
              className={`
                w-full rounded-lg border border-gray-300 bg-white text-gray-900
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                transition-colors
                disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
                ${isHero ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
              `}
            >
              {radiusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Search Button */}
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            data-testid="search-submit"
            disabled={!canSearch}
            className={`
              min-w-[180px] rounded-lg bg-brand-600 font-medium text-white
              hover:bg-brand-700 active:bg-brand-800
              focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
              transition-colors flex items-center justify-center gap-2
              disabled:bg-gray-300 disabled:cursor-not-allowed
              ${isHero ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'}
            `}
          >
            <svg
              className={isHero ? 'h-5 w-5' : 'h-4 w-4'}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            Search
          </button>
        </div>

        {/* Validation message */}
        {!canSearch && (
          <p className="mt-2 text-xs text-amber-600">
            Please enter a suburb or postcode, or search by business name.
          </p>
        )}

        {/* Location not selected warning */}
        {locationInput && !locationToken && (
          <p className="mt-1 text-xs text-amber-500">
            Please select a location from the dropdown suggestions.
          </p>
        )}

        {/* More Filters Toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
            {showFilters ? 'Fewer filters' : 'More filters'}
          </button>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="max-w-md">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Keyword
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. emergency, 24/7, eco-friendly"
                  className={`
                    w-full rounded-lg border border-gray-300 bg-white text-gray-900
                    placeholder:text-gray-400
                    focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                    transition-colors
                    ${isHero ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
                  `}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
