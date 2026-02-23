'use client';

import { useState } from 'react';
import { reportBusiness } from '@/app/actions/report';

const reportReasons = [
  { value: 'spam', label: 'Spam or fake listing' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'fake', label: 'Fake listing' },
  { value: 'other', label: 'Other' },
];

interface ReportButtonProps {
  businessId: string;
}

export default function ReportButton({
  businessId,
}: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    setStatus('submitting');

    try {
      const formData = new FormData();
      formData.set('reason', reason);
      formData.set('details', details.trim());
      const result = await reportBusiness(businessId, formData);
      if (result && 'error' in result) {
        setStatus('error');
      } else {
        setStatus('success');
      }
    } catch {
      setStatus('error');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(() => {
      setReason('');
      setDetails('');
      setStatus('idle');
    }, 200);
  };

  return (
    <>
      {/* Report Link */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
          />
        </svg>
        Report
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {status === 'success' ? (
              <div className="text-center py-4">
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
                <h3 className="mt-3 text-lg font-semibold text-gray-900">
                  Report Submitted
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Thank you for helping us keep our directory accurate. We will
                  review your report shortly.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900">
                  Report Listing
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Let us know why you are reporting this business listing.
                </p>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* Reason Select */}
                  <div>
                    <label
                      htmlFor="report_reason"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="report_reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-colors"
                    >
                      <option value="">Select a reason</option>
                      {reportReasons.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Details Textarea */}
                  <div>
                    <label
                      htmlFor="report_details"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Additional Details{' '}
                      <span className="text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      id="report_details"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Provide any additional context..."
                      rows={3}
                      maxLength={500}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none resize-none transition-colors"
                    />
                  </div>

                  {/* Error */}
                  {status === 'error' && (
                    <p className="text-sm text-red-600">
                      Something went wrong. Please try again.
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!reason || status === 'submitting'}
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                        'Submit Report'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
