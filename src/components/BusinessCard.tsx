'use client'

import Link from 'next/link';
import Image from 'next/image';
import StarRating from './StarRating';

interface BusinessCardProps {
  name: string;
  slug: string;
  suburb: string;
  state: string;
  distance_m?: number;
  category_names: string[];
  description: string;
  avg_rating?: number;
  review_count: number;
  phone?: string;
  website?: string;
  photo_url?: string;
}

export default function BusinessCard({
  name,
  slug,
  suburb,
  state,
  distance_m,
  category_names,
  description,
  avg_rating,
  review_count,
  phone,
  website,
  photo_url,
}: BusinessCardProps) {
  const truncatedDescription =
    description.length > 150 ? description.slice(0, 150) + '...' : description;

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 overflow-hidden">
      <Link href={`/business/${slug}`} className="absolute inset-0 z-10">
        <span className="sr-only">View {name}</span>
      </Link>

      <div className="flex flex-col sm:flex-row">
        {/* Photo — only render when photo_url exists */}
        {photo_url && (
          <div className="relative h-48 sm:h-auto sm:w-48 lg:w-56 flex-shrink-0 bg-gray-100">
            <Image
              src={photo_url}
              alt={name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 224px"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex-1">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                {name}
              </h3>
            </div>

            {/* Rating */}
            {review_count > 0 && avg_rating != null && (
              <div className="mt-1">
                <StarRating
                  rating={avg_rating}
                  count={review_count}
                  size="sm"
                />
              </div>
            )}

            {/* Categories */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {category_names.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                >
                  {cat}
                </span>
              ))}
              {category_names.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  +{category_names.length - 3}
                </span>
              )}
            </div>

            {/* Description */}
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {truncatedDescription}
            </p>

            {/* Location */}
            <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
              <svg
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
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
              <span>
                {suburb}, {state}
                {distance_m != null && (
                  <span className="ml-1 text-gray-400">
                    ({(distance_m / 1000).toFixed(1)} km away)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex items-center gap-2 relative z-20">
            <Link
              href={`/business/${slug}`}
              className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              View Profile
            </Link>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                  />
                </svg>
                Call
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
                Website
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
