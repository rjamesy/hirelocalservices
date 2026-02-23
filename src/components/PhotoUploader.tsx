'use client';

import { useCallback, useRef, useState } from 'react';

export interface PhotoUploaderProps {
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
  maxPhotos: number;
  currentCount: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function PhotoUploader({
  onUpload,
  uploading,
  maxPhotos,
  currentCount,
}: PhotoUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const slotsRemaining = maxPhotos - currentCount;
  const canUploadMore = slotsRemaining > 0 && !uploading;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Only JPEG, PNG, and WebP are allowed.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File too large. Maximum size is 5MB.';
    }
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        alert(error);
        return;
      }
      await onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => canUploadMore && fileInputRef.current?.click()}
      className={`
        cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors
        ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        ${dragActive
          ? 'border-brand-500 bg-brand-50'
          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }
      `}
    >
      <svg
        className="mx-auto h-10 w-10 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
        />
      </svg>
      <p className="mt-2 text-sm font-medium text-gray-700">
        {uploading ? 'Uploading...' : 'Drag and drop a photo here, or click to browse'}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        JPEG, PNG, or WebP up to 5MB. {slotsRemaining} slot{slotsRemaining !== 1 ? 's' : ''} remaining.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}
