import StarRating from './StarRating';

interface TestimonialCardProps {
  author_name: string;
  text: string;
  rating: number;
  created_at: string;
}

export default function TestimonialCard({
  author_name,
  text,
  rating,
  created_at,
}: TestimonialCardProps) {
  const formattedDate = new Date(created_at).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Rating */}
      <div className="mb-3">
        <StarRating rating={rating} size="sm" />
      </div>

      {/* Quote */}
      <blockquote className="relative">
        <svg
          className="absolute -top-1 -left-1 h-6 w-6 text-gray-200"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
        </svg>
        <p className="pl-6 text-sm leading-relaxed text-gray-700">{text}</p>
      </blockquote>

      {/* Author and Date */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {author_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-900">
            {author_name}
          </span>
        </div>
        <time className="text-xs text-gray-500" dateTime={created_at}>
          {formattedDate}
        </time>
      </div>
    </div>
  );
}
