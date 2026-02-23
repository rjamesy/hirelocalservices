'use client';

import { useState } from 'react';
import { z } from 'zod';

const testimonialSchema = z.object({
  author_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be 100 characters or less'),
  rating: z
    .number()
    .min(1, 'Please select a rating')
    .max(5, 'Rating must be between 1 and 5'),
  text: z
    .string()
    .min(10, 'Review must be at least 10 characters')
    .max(1000, 'Review must be 1000 characters or less'),
});

export interface TestimonialFormProps {
  onSubmit: (data: {
    author_name: string;
    rating: number;
    text: string;
  }) => Promise<void>;
  submitting?: boolean;
}

export default function TestimonialForm({
  onSubmit,
  submitting: externalSubmitting,
}: TestimonialFormProps) {
  const [authorName, setAuthorName] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setErrorMessage('');

    const result = testimonialSchema.safeParse({
      author_name: authorName,
      rating,
      text,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setStatus('submitting');

    try {
      await onSubmit({
        author_name: result.data.author_name,
        rating: result.data.rating,
        text: result.data.text,
      });

      setStatus('success');
      setAuthorName('');
      setRating(0);
      setText('');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <svg
          className="mx-auto h-10 w-10 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-3 text-lg font-semibold text-green-900">
          Thank you for your review!
        </h3>
        <p className="mt-1 text-sm text-green-700">
          Your testimonial has been submitted successfully.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700 underline"
        >
          Write another review
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error Banner */}
      {status === 'error' && errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Author Name */}
      <div>
        <label
          htmlFor="author_name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Your Name
        </label>
        <input
          id="author_name"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="John Smith"
          className={`
            w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900
            placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors
            ${errors.author_name
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
              : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500/20'
            }
          `}
        />
        {errors.author_name && (
          <p className="mt-1 text-xs text-red-600">{errors.author_name}</p>
        )}
      </div>

      {/* Star Rating */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5 transition-transform hover:scale-110"
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <svg
                className={`h-8 w-8 transition-colors ${
                  star <= (hoverRating || rating)
                    ? 'text-amber-400'
                    : 'text-gray-300'
                }`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm text-gray-500">
              {rating} star{rating !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {errors.rating && (
          <p className="mt-1 text-xs text-red-600">{errors.rating}</p>
        )}
      </div>

      {/* Review Text */}
      <div>
        <label
          htmlFor="review_text"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Your Review
        </label>
        <textarea
          id="review_text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell others about your experience..."
          rows={4}
          className={`
            w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900
            placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0
            resize-none transition-colors
            ${errors.text
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
              : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500/20'
            }
          `}
        />
        <div className="mt-1 flex justify-between">
          {errors.text ? (
            <p className="text-xs text-red-600">{errors.text}</p>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-400">{text.length}/1000</span>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
          hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'submitting' ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Submitting...
          </span>
        ) : (
          'Submit Review'
        )}
      </button>
    </form>
  );
}
