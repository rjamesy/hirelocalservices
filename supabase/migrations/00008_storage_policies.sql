-- =============================================================================
-- 00008_storage_policies.sql
-- Storage policies for the 'photos' bucket
-- =============================================================================

-- Anyone can view photos (public bucket)
CREATE POLICY "Public read access on photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- Authenticated users can upload photos
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.role() = 'authenticated');

-- Authenticated users can update their own photos
CREATE POLICY "Authenticated users can update photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.role() = 'authenticated');

-- Authenticated users can delete their own photos
CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.role() = 'authenticated');
