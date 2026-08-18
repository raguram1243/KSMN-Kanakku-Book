-- ============================================
-- Ledger report RPC: per-customer aggregates
-- ============================================
CREATE OR REPLACE FUNCTION get_ledger_report()
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
    'total_paid', COALESCE(pt.total_paid, 0) + COALESCE(adv.advance_balance, 0),
    'outstanding', COALESCE(ct.outstanding, 0)
  ))
  INTO result
  FROM customers c
  LEFT JOIN (
    SELECT customer_id,
           SUM(total_amount) AS total_credit,
           SUM(balance) AS outstanding
    FROM credit_entries
    GROUP BY customer_id
  ) ct ON ct.customer_id = c.id
  LEFT JOIN (
    SELECT customer_id,
           SUM(amount) AS total_paid
    FROM payments
    GROUP BY customer_id
  ) pt ON pt.customer_id = c.id
  LEFT JOIN customer_advance_balance adv ON adv.customer_id = c.id;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
