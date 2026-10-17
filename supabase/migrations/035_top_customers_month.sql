-- Top customers by credit given this month, for the admin dashboard.
--
-- Credit given = the total of the bills (credit_entries) created in the
-- current month. "This month" is in Asia/Kolkata, converted once on the
-- timestamp so a bill saved at 01:00 IST on the 1st counts in the new month,
-- the same rule get_today_stats() uses. Returns at most p_limit customers,
-- biggest first, with the number of bills and the month's total for context.

CREATE OR REPLACE FUNCTION get_top_customers_month(p_limit INT DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH d AS (
    SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AS month_start
  ),
  per_customer AS (
    SELECT ce.customer_id,
           sum(ce.total_amount) AS credit_given,
           count(*) AS bills
    FROM credit_entries ce, d
    WHERE ce.created_at >= d.month_start
    GROUP BY ce.customer_id
  )
  SELECT jsonb_build_object(
    'monthTotal', COALESCE((SELECT sum(credit_given) FROM per_customer), 0),
    'customers', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.credit_given DESC)
      FROM (
        SELECT c.id, c.name, c.customer_code AS code, p.credit_given, p.bills
        FROM per_customer p
        JOIN customers c ON c.id = p.customer_id
        ORDER BY p.credit_given DESC, c.name
        LIMIT GREATEST(p_limit, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- Same lockdown as 032/033: only the edge functions (service_role) may call it.
REVOKE EXECUTE ON FUNCTION get_top_customers_month(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_top_customers_month(INT) TO service_role;
