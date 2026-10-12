-- Today's and this month's totals, added up in the database.
--
-- get-today-stats used to fetch every bill created today and every approved
-- payment of the month, then add them up in the edge function. The rows
-- travelled over the network only to be summed. This returns the four numbers
-- directly. "Today" and "this month" are in Asia/Kolkata, as the edge function
-- already computes them (fixed in the security change): a bill saved at
-- 01:00 IST belongs to that IST day, not the previous UTC one.
--
-- Payments: approved only (pending staff payments count after approval, the
-- same rule as every other total since 031). payment_date is a plain DATE the
-- shop picks, so it is compared as is; bills use created_at converted to IST.

CREATE OR REPLACE FUNCTION get_today_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH d AS (
    SELECT today,
           -- the IST day as a timestamptz range, so the created_at index is used
           (today::timestamp AT TIME ZONE 'Asia/Kolkata') AS day_start,
           ((today + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS day_end
    FROM (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today) t
  )
  SELECT jsonb_build_object(
    'todayEntriesCount', (
      SELECT count(*) FROM credit_entries, d
      WHERE created_at >= d.day_start AND created_at < d.day_end
    ),
    'todayEntriesTotalSum', (
      SELECT COALESCE(sum(total_amount), 0) FROM credit_entries, d
      WHERE created_at >= d.day_start AND created_at < d.day_end
    ),
    'todayPaymentsTotalSum', (
      SELECT COALESCE(sum(amount), 0) FROM payments, d
      WHERE status = 'approved' AND payment_date = d.today
    ),
    'monthPaymentsTotalSum', (
      SELECT COALESCE(sum(amount), 0) FROM payments, d
      WHERE status = 'approved'
        AND payment_date >= date_trunc('month', d.today)::date
        AND payment_date <= d.today
    )
  );
$$;

-- Same lockdown as 032: only the edge functions (service_role) may call it.
REVOKE EXECUTE ON FUNCTION get_today_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_today_stats() TO service_role;
