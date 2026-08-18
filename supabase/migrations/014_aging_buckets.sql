-- ============================================
-- Aging report: expand the dashboard aging buckets from 3 to 6.
-- Redefines get_dashboard_stats_v2 (CREATE OR REPLACE) so the
-- `aging` JSON now reports six non-overlapping ranges based on
-- days since credit_entries.created_at, using the same
-- floor(EXTRACT(EPOCH FROM (now() - created_at)) / 86400)
-- calculation and `status <> 'paid'` filter already in place.
--
-- Previous buckets: 0-30, 31-60, 60+
-- New buckets:      0-7, 8-14, 15-21, 22-30, 31-40, 41+
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats_v2()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalOutstanding', COALESCE((SELECT SUM(balance) FROM credit_entries), 0),
    'totalCustomers', (SELECT COUNT(*) FROM customers),
    'overdueCount', (
      SELECT COUNT(*)
      FROM credit_entries ce
      JOIN customers c ON c.id = ce.customer_id
      WHERE ce.status <> 'paid'
        AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400)
          > get_overdue_threshold(c.customer_type, c.custom_overdue_days)
    ),
    'topDebtors', (
      SELECT COALESCE(json_agg(x ORDER BY x.balance DESC), '[]'::json)
      FROM (
        SELECT c.id, c.name, c.customer_code, COALESCE(SUM(ce.balance), 0) AS balance
        FROM customers c
        JOIN credit_entries ce ON ce.customer_id = c.id
        WHERE ce.status <> 'paid'
        GROUP BY c.id, c.name, c.customer_code
        ORDER BY SUM(ce.balance) DESC
        LIMIT 10
      ) x
    ),
    'recentEntries', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', ce.id,
        'entry_code', ce.entry_code,
        'customer_id', ce.customer_id,
        'customer_name', ce.name,
        'total_amount', ce.total_amount,
        'status', ce.status,
        'created_at', ce.created_at
      ) ORDER BY ce.created_at DESC), '[]'::json)
      FROM (
        SELECT ce.id, ce.entry_code, ce.customer_id, ce.total_amount, ce.status, ce.created_at, c.name
        FROM credit_entries ce
        JOIN customers c ON c.id = ce.customer_id
        ORDER BY ce.created_at DESC
        LIMIT 4
      ) ce
    ),
    'recentPayments', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id,
        'customer_id', p.customer_id,
        'amount', p.amount,
        'payment_method', p.payment_method,
        'payment_date', p.payment_date,
        'customer_name', p.customer_name
      ) ORDER BY p.payment_date DESC), '[]'::json)
      FROM (
        SELECT p.id, p.customer_id, p.amount, p.payment_method, p.payment_date, c.name AS customer_name
        FROM payments p
        JOIN customers c ON c.id = p.customer_id
        ORDER BY p.payment_date DESC
        LIMIT 4
      ) p
    ),
    'last30Days', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'credit_given', COALESCE(e.credit, 0),
        'collection', COALESCE(p.col, 0)
      ) ORDER BY d.day), '[]'::json)
      FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day') AS d(day)
      LEFT JOIN (
        SELECT to_char(ce.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, SUM(ce.total_amount) AS credit
        FROM credit_entries ce
        WHERE ce.created_at AT TIME ZONE 'UTC' >= (CURRENT_DATE - 29)
        GROUP BY 1
      ) e ON e.day = to_char(d.day, 'YYYY-MM-DD')
      LEFT JOIN (
        SELECT to_char(p.payment_date, 'YYYY-MM-DD') AS day, SUM(p.amount) AS col
        FROM payments p
        WHERE p.payment_date >= (CURRENT_DATE - 29)
        GROUP BY 1
      ) p ON p.day = to_char(d.day, 'YYYY-MM-DD')
    ),
    'totalCreditLast30', COALESCE((
      SELECT SUM(ce.total_amount)
      FROM credit_entries ce
      WHERE ce.created_at AT TIME ZONE 'UTC' >= (CURRENT_DATE - 29)
    ), 0),
    'totalCollectionLast30', COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      WHERE p.payment_date >= (CURRENT_DATE - 29)
    ), 0),
    'alerts', json_build_object(
      'largeOutstanding', (
        SELECT COALESCE(json_agg(x ORDER BY x.balance DESC), '[]'::json)
        FROM (
          SELECT c.id AS customer_id, c.name AS customer_name, c.customer_code,
                 COALESCE(SUM(ce.balance), 0) AS balance
          FROM customers c
          JOIN credit_entries ce ON ce.customer_id = c.id
          GROUP BY c.id, c.name, c.customer_code
          HAVING SUM(ce.balance) > 50000
          ORDER BY SUM(ce.balance) DESC
          LIMIT 10
        ) x
      ),
      'overdueEntries', (
        SELECT COALESCE(json_agg(x ORDER BY x.days_overdue DESC), '[]'::json)
        FROM (
          SELECT ce.id, ce.entry_code, ce.customer_id, c.name AS customer_name,
                 c.phone AS customer_phone, ce.balance, ce.status, ce.created_at,
                 floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400)::INT AS days_overdue
          FROM credit_entries ce
          JOIN customers c ON c.id = ce.customer_id
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400)
              > get_overdue_threshold(c.customer_type, c.custom_overdue_days)
          ORDER BY days_overdue DESC
          LIMIT 10
        ) x
      )
    ),
    'aging', json_build_object(
      'days0to7', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 7
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 7
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days8to14', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 8 AND 14
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 8 AND 14
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days15to21', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 15 AND 21
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 15 AND 21
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days22to30', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 22 AND 30
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 22 AND 30
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days31to40', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 40
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 40
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days41plus', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 40
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 40
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;