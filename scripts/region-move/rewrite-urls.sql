-- Run on the new Mumbai project after the data load. Saved photo links carry
-- the project address; the server only signs links to its own project, so
-- the Seoul address is swapped for the Mumbai one. Only the host part of the
-- link changes; the file path stays identical.
--   psql "<mumbai conn>" -v ON_ERROR_STOP=1 -v old_host=rmuyoderuasqbdirhvpq.supabase.co -v new_host=<ref>.supabase.co -f rewrite-urls.sql

BEGIN;

UPDATE credit_entry_attachments
SET file_url = replace(file_url, 'https://' || :'old_host' || '/', 'https://' || :'new_host' || '/')
WHERE file_url LIKE 'https://' || :'old_host' || '/%';

UPDATE payment_attachments
SET file_url = replace(file_url, 'https://' || :'old_host' || '/', 'https://' || :'new_host' || '/')
WHERE file_url LIKE 'https://' || :'old_host' || '/%';

-- credit_entries has a total guard trigger on total_amount only; photo_url is safe.
UPDATE credit_entries
SET photo_url = replace(photo_url, 'https://' || :'old_host' || '/', 'https://' || :'new_host' || '/')
WHERE photo_url LIKE 'https://' || :'old_host' || '/%';

-- Nothing may still point at Seoul.
DO $$
DECLARE left_over INTEGER;
BEGIN
  SELECT count(*) INTO left_over FROM (
    SELECT file_url FROM credit_entry_attachments
    UNION ALL SELECT file_url FROM payment_attachments
    UNION ALL SELECT photo_url FROM credit_entries WHERE photo_url IS NOT NULL
  ) f WHERE f.file_url LIKE '%rmuyoderuasqbdirhvpq%';
  IF left_over > 0 THEN
    RAISE EXCEPTION '% photo links still point at the Seoul project', left_over;
  END IF;
END $$;

COMMIT;
