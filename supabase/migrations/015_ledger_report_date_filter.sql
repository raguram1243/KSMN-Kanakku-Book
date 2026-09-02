-- ============================================
-- Ledger report RPC: optional From/To date range filter
-- Redefines get_ledger_report (CREATE OR REPLACE) so the per-customer
-- "Total Credit Given" / "Total Paid" figures can be constrained to a
-- date window, while "Remaining Outstanding" stays a live, real-time
-- balance regardless of the selected range.
--
-- Params (both default to NULL => all-time, i.e. current behaviour):
--   p_from_date DATE  - inclusive lower bound (UTC date for credit
--                       entries; payment_date for payments)
--   p_to_date   DATE  - inclusive upper bound
-- ============================================
DROP FUNCTION IF EXISTS get_ledger_report();
CREATE OR REPLACE FUNCTION get_ledger_report(
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'customer_id', c.id,
    'customer_code', c.customer_code,
    'name', c.name,
    'phone', c.phone,
    'customer_type', c.customer_type,
    'total_credit', COALESCE(ct.total_credit, 0),
    'total_paid', COALESCE(pt.total_paid, 0)
      + CASE
          -- The live advance balance is a running, not a period, figure,
          -- so it is only folded into "Total Paid" on the all-time report
          -- (no date filter) to preserve the existing default behaviour.
          WHEN p_from_date IS NULL AND p_to_date IS NULL THEN COALESCE(adv.advance_balance, 0)
          ELSE 0
        END,
    'outstanding', COALESCE(o.outstanding, 0)
  ))
  INTO result
  FROM customers c
  -- Total credit given within the date window
  LEFT JOIN (
    SELECT customer_id,
           SUM(total_amount) AS total_credit
    FROM credit_entries
    WHERE (p_from_date IS NULL OR (created_at AT TIME ZONE 'UTC')::date >= p_from_date)
      AND (p_to_date   IS NULL OR (created_at AT TIME ZONE 'UTC')::date <= p_to_date)
    GROUP BY customer_id
  ) ct ON ct.customer_id = c.id
  -- Total paid within the date window (period payments only)
  LEFT JOIN (
    SELECT customer_id,
           SUM(amount) AS total_paid
    FROM payments
    WHERE (p_from_date IS NULL OR payment_date >= p_from_date)
      AND (p_to_date   IS NULL OR payment_date <= p_to_date)
    GROUP BY customer_id
  ) pt ON pt.customer_id = c.id
  -- Live, real-time outstanding balance (never date-filtered)
  LEFT JOIN (
    SELECT customer_id,
           SUM(balance) AS outstanding
    FROM credit_entries
    GROUP BY customer_id
  ) o ON o.customer_id = c.id
  LEFT JOIN customer_advance_balance adv ON adv.customer_id = c.id;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
