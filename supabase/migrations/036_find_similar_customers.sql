-- Warn before creating a customer who may already exist.
--
-- Two accounts for one person split their balance and hide what they owe.
-- create-customer calls this first and, if anything comes back, asks the user
-- to confirm before it creates the new account.
--
-- A customer is "similar" when
--   * the phone number is the same once spaces, dashes and a +91 / 0 prefix
--     are ignored (compared on the last 10 digits), or
--   * the name is the same ignoring case and extra spaces, or
--   * the names are very alike (pg_trgm similarity of 0.6 or more, which
--     catches "Ramesh Kumar" vs "Ramesh Kumr" but not "Ramesh" vs "Suresh").
-- Phone matches are listed first. At most 5 rows are returned.

CREATE OR REPLACE FUNCTION find_similar_customers(p_name TEXT, p_phone TEXT)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10) AS phone10,
           lower(regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g')) AS name_norm
  ),
  hits AS (
    SELECT c.id, c.name, c.phone, c.customer_code AS code,
           CASE
             WHEN length(q.phone10) >= 7
                  AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = q.phone10
               THEN 'phone'
             ELSE 'name'
           END AS reason
    FROM customers c, q
    WHERE (length(q.phone10) >= 7
           AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = q.phone10)
       OR (q.name_norm <> ''
           AND (lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = q.name_norm
                OR similarity(lower(c.name), q.name_norm) >= 0.6))
    ORDER BY (CASE WHEN length(q.phone10) >= 7
                        AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = q.phone10
                   THEN 0 ELSE 1 END),
             c.name
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(hits)), '[]'::jsonb) FROM hits;
$$;

-- Same lockdown as 032/033/035: only the edge functions (service_role) may call it.
REVOKE EXECUTE ON FUNCTION find_similar_customers(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION find_similar_customers(TEXT, TEXT) TO service_role;
