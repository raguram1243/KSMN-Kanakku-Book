-- Fix get_ledger_report double-counting advances in "Total Paid".
--
-- 015_ledger_report_date_filter.sql computed, on the all-time report:
--
--   total_paid = SUM(payments.amount) + customer_advance_balance.advance_balance
--
-- SUM(payments.amount) is every rupee the customer paid. The advance balance
-- is the unallocated portion of those very same payments. So any advance was
-- counted twice: once inside the payment total and once again on top of it.
--
-- Worked example: a customer takes 1000 of credit and pays 1500. 1000 clears
-- the bill and 500 sits as advance. The report showed Total Paid = 2000
-- (1500 + 500). The cash book says 1500, which is the correct figure.
--
-- The fix: total_paid is just COALESCE(pt.total_paid, 0). The advance is
-- already inside it. Everything else in the function is identical to 015.
-- The adv join is left in place even though nothing reads it any more; an
-- unused LEFT JOIN on a one-row-per-customer view is harmless.
--
-- *** WARNING: reported collection figures will DROP once this is applied. ***
-- They were overstated, by exactly each customer's advance balance, on the
-- all-time report. Nothing was lost. No payment, credit entry or balance
-- changes: this migration only replaces a function definition and does not
-- touch any table row. Date-filtered reports already excluded the advance and
-- are unchanged.

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
    'total_paid', COALESCE(pt.total_paid, 0),
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
