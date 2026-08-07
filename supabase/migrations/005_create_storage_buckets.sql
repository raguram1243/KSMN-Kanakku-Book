-- Create storage buckets for file attachments
-- These buckets are used by the upload-attachment edge function
-- Buckets are public since we generate public URLs via getPublicUrl

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('entry-photos', 'entry-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('entry-docs', 'entry-docs', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Note: No RLS policies needed for these buckets since all uploads go through
-- the upload-attachment edge function using the service role key (bypasses RLS).
-- The buckets are public so generated URLs resolve directly in the app.