// ============================================
// A5: Day-book RPC — one row per calendar day.
// Credit given vs collection, counts, advances.
// Frontend falls back to get-today-stats + recent-payments client-side
// until this migration is pushed.
// ============================================

CREATE OR REPLACE FUNCTION get_day_book_stats(p_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start TIMESTAMPTZ := (p_day::TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  v_end   TIMESTAMPTZ := ((p_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  v_credit_total NUMERIC := 0;
  v_credit_count INTEGER := 0;
  v_coll_total NUMERIC := 0;
  v_coll_count INTEGER := 0;
  v_by_method JSONB := '[]'::JSONB;
  v_by_staff JSONB := '[]'::JSONB;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_credit_total, v_credit_count
    FROM credit_entries
    WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_coll_total, v_coll_count
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_method
  FROM (
    SELECT COALESCE(payment_method, 'unknown') AS method,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end
    GROUP BY 1
    ORDER BY total DESC
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_staff
  FROM (
    SELECT s.name AS staff_name,
           COUNT(*) AS entries,
           COALESCE(SUM(e.total_amount), 0) AS credit_given
    FROM credit_entries e
    LEFT JOIN staff s ON s.id = e.created_by
    WHERE e.created_at >= v_start AND e.created_at < v_end
    GROUP BY s.name
    ORDER BY credit_given DESC
  ) t;

  RETURN jsonb_build_object(
    'day', p_day,
    'credit_total', v_credit_total,
    'credit_count', v_credit_count,
    'collection_total', v_coll_total,
    'collection_count', v_coll_count,
    'net', v_credit_total - v_coll_total,
    'by_method', v_by_method,
    'by_staff', v_by_staff
  );
END;
$$;
