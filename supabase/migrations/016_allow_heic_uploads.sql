-- Allow HEIC/HEIF uploads (iPhone default photo format) in the entry-photos bucket.
-- The bucket was created in 005_create_storage_buckets.sql with a restricted
-- allowed_mime_types list, which caused "mime type image/heic is not supported"
-- errors when users picked photos from their phone gallery.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
]
WHERE id = 'entry-photos';