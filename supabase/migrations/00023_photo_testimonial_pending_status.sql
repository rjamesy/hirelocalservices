-- Migration: Add status column to photos and testimonials tables
-- Enables pending workflow for photo/testimonial changes on published listings.
-- Status values: 'live' (visible to public), 'pending_add' (awaiting approval),
-- 'pending_delete' (marked for deletion, pending approval)

-- Add status to photos
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live';

ALTER TABLE photos
  ADD CONSTRAINT photos_status_check
  CHECK (status IN ('live', 'pending_add', 'pending_delete'));

-- Add status to testimonials
ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live';

ALTER TABLE testimonials
  ADD CONSTRAINT testimonials_status_check
  CHECK (status IN ('live', 'pending_add', 'pending_delete'));

-- Index for efficient filtering by status
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos (business_id, status);
CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials (business_id, status);
