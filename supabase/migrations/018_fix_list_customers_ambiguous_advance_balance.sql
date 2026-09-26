-- ============================================
-- Fix: ambiguous column "advance_balance" in list_customers RPC
-- ============================================
-- Bug: migration 017 defines RETURNS TABLE (..., advance_balance NUMERIC, ...).
-- In PL/pgSQL, RETURNS TABLE columns are visible as output variables everywhere
-- in the function body. The cust_advance CTE referenced the bare name
-- "advance_balance" from the customer_advance_balance view — Postgres could not
-- tell whether this meant the view column or the function's own output variable,
-- raising 'column reference "advance_balance" is ambiguous'.
--
-- Fix: qualify every column with its table alias inside every CTE so no bare
-- name can ever shadow a RETURNS TABLE output column. Only the cust_advance CTE
-- actually needed a change; all others were already qualified. This is a pure
-- bugfix — no logic or behavior change vs. migration 017.
-- ============================================

CREATE OR REPLACE FUNCTION list_customers(
  p_search     TEXT DEFAULT '',
  p_filter     TEXT DEFAULT 'all',
  p_sort       TEXT DEFAULT 'name_asc',
  p_page       INTEGER DEFAULT 1,
  p_page_size  INTEGER DEFAULT 50
)
RETURNS TABLE (
  id                  UUID,
  customer_code       TEXT,
  name                TEXT,
  phone               TEXT,
  address             TEXT,
  customer_type       TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ,
  custom_overdue_days INTEGER,
  balance             NUMERIC,
  advance_balance     NUMERIC,
  oldest_unpaid_date  TIMESTAMPTZ,
  total_count         BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INTEGER;
  v_total  BIGINT;
BEGIN
  -- Clamp page params to sane bounds
  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_page_size < 1 THEN p_page_size := 50; END IF;
  IF p_page_size > 200 THEN p_page_size := 200; END IF;
  v_offset := (p_page - 1) * p_page_size;

  RETURN QUERY
  WITH
  -- Per-customer aggregates computed once, across the full table
  cust_balance AS (
    SELECT
      c.id                         AS cid,
      COALESCE(SUM(ce.balance), 0) AS bal
    FROM customers c
    LEFT JOIN credit_entries ce ON ce.customer_id = c.id
    GROUP BY c.id
  ),
  cust_advance AS (
    SELECT cab.customer_id AS cid, cab.advance_balance AS abal
    FROM customer_advance_balance cab
  ),
  cust_oldest_unpaid AS (
    SELECT DISTINCT ON (ce.customer_id)
      ce.customer_id        AS cid,
      ce.created_at         AS oldest
    FROM credit_entries ce
    WHERE ce.status <> 'paid'
    ORDER BY ce.customer_id, ce.created_at ASC
  ),
  -- Apply search + filter to get the full qualifying set
  filtered AS (
    SELECT
      c.id,
      c.customer_code,
      c.name,
      c.phone,
      c.address,
      c.customer_type,
      c.notes,
      c.created_at,
      c.custom_overdue_days,
      COALESCE(cb.bal, 0)                   AS balance,
      COALESCE(ca.abal, 0)                  AS advance_balance,
      cu.oldest                              AS oldest_unpaid_date
    FROM customers c
    LEFT JOIN cust_balance cb       ON cb.cid = c.id
    LEFT JOIN cust_advance ca       ON ca.cid = c.id
    LEFT JOIN cust_oldest_unpaid cu ON cu.cid = c.id
    WHERE
      -- search
      (p_search = '' OR
       c.name           ILIKE '%' || p_search || '%' OR
       c.phone          ILIKE '%' || p_search || '%' OR
       c.customer_code  ILIKE '%' || p_search || '%')
      AND
      -- filter
      (p_filter = 'all'
       OR (p_filter = 'outstanding' AND COALESCE(cb.bal, 0) > 0)
       OR (p_filter = 'paid'        AND COALESCE(cb.bal, 0) <= 0)
       OR (p_filter = 'advance'     AND COALESCE(ca.abal, 0) > 0.01))
  ),
  counted AS (
    SELECT COUNT(*) AS tc FROM filtered
  )
  SELECT
    f.id,
    f.customer_code,
    f.name,
    f.phone,
    f.address,
    f.customer_type,
    f.notes,
    f.created_at,
    f.custom_overdue_days,
    f.balance,
    f.advance_balance,
    f.oldest_unpaid_date,
    (SELECT tc FROM counted)
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort = 'balance_desc' THEN f.balance      END DESC,
    CASE WHEN p_sort = 'balance_asc'  THEN f.balance      END ASC,
    CASE WHEN p_sort = 'newest'       THEN f.created_at   END DESC,
    CASE WHEN p_sort = 'oldest'       THEN f.created_at   END ASC,
    CASE WHEN p_sort = 'name_asc'     THEN f.name         END ASC,
    -- always fall back to name_asc when p_sort is unrecognised
    CASE WHEN p_sort NOT IN ('balance_desc','balance_asc','newest','oldest','name_asc')
                                         THEN f.name       END ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;