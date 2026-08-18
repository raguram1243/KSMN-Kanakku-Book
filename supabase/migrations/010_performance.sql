-- ============================================
-- Performance optimization: indexes + dashboard RPC
-- ============================================

-- Indexes on hot foreign-key / filter / sort columns
CREATE INDEX IF NOT EXISTS idx_credit_entries_customer_id ON credit_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_entries_status ON credit_entries(status) WHERE status <> 'paid';
CREATE INDEX IF NOT EXISTS idx_credit_entries_created_at ON credit_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_entries_customer_id_created_at ON credit_entries(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_entry_items_credit_entry_id ON credit_entry_items(credit_entry_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_credit_entry_id ON payment_allocations(credit_entry_id);
CREATE INDEX IF NOT EXISTS idx_credit_entry_attachments_credit_entry_id ON credit_entry_attachments(credit_entry_id);
CREATE INDEX IF NOT EXISTS idx_payment_attachments_payment_id ON payment_attachments(payment_id);

-- ============================================
-- Overdue threshold helper (mirrors _shared/overdue.ts getOverdueThreshold):
--   custom_overdue_days override  ->  app_settings['overdue_days_<type>']  ->  30
-- ============================================
CREATE OR REPLACE FUNCTION get_overdue_threshold(customer_type TEXT, custom_overdue_days INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    custom_overdue_days,
    (SELECT NULLIF(value, '')::INTEGER FROM app_settings WHERE key = 'overdue_days_' || replace(customer_type, '-', '')),
    30
  );
$$;

-- ============================================
-- Dashboard RPC: single round-trip aggregation, returns the
-- same financial numbers as the original get-dashboard-stats edge function.
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
      'days0to30', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 30
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 30
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days31to60', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 60
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 60
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days60plus', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 60
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 60
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

