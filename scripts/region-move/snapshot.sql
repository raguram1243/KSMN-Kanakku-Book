-- Counts and money totals, run against Seoul before the move and Mumbai after.
-- The two outputs must be identical (diff them). Read-only.
--   psql "<conn>" -X -A -t -f snapshot.sql > snapshot-<side>.txt

SELECT 'rows.staff',                   count(*) FROM staff
UNION ALL SELECT 'rows.app_settings',            count(*) FROM app_settings
UNION ALL SELECT 'rows.customers',               count(*) FROM customers
UNION ALL SELECT 'rows.credit_entries',          count(*) FROM credit_entries
UNION ALL SELECT 'rows.credit_entry_items',      count(*) FROM credit_entry_items
UNION ALL SELECT 'rows.credit_entry_attachments',count(*) FROM credit_entry_attachments
UNION ALL SELECT 'rows.payments',                count(*) FROM payments
UNION ALL SELECT 'rows.payment_allocations',     count(*) FROM payment_allocations
UNION ALL SELECT 'rows.payment_attachments',     count(*) FROM payment_attachments
UNION ALL SELECT 'rows.follow_ups',              count(*) FROM follow_ups
ORDER BY 1;

SELECT 'money.entries_total',     COALESCE(sum(total_amount), 0) FROM credit_entries
UNION ALL SELECT 'money.entries_paid',      COALESCE(sum(paid_amount), 0)  FROM credit_entries
UNION ALL SELECT 'money.entries_balance',   COALESCE(sum(balance), 0)      FROM credit_entries
UNION ALL SELECT 'money.items_amount',      COALESCE(sum(amount), 0)       FROM credit_entry_items
UNION ALL SELECT 'money.payments_' || status, COALESCE(sum(amount), 0)     FROM payments GROUP BY status
UNION ALL SELECT 'money.allocations',       COALESCE(sum(allocated_amount), 0) FROM payment_allocations
UNION ALL SELECT 'money.advance',           COALESCE(sum(advance_balance), 0)  FROM customer_advance_balance
ORDER BY 1;

-- Next customer code must carry on, not restart at KSMN-0001.
SELECT 'seq.customer_code', last_value, is_called FROM customer_code_seq;

-- Fingerprint of every row's identity, so a count match can't hide a swap.
SELECT 'ids.customers', md5(string_agg(id::text || customer_code, ',' ORDER BY id)) FROM customers
UNION ALL SELECT 'ids.credit_entries', md5(string_agg(id::text || entry_code || total_amount::text || paid_amount::text, ',' ORDER BY id)) FROM credit_entries
UNION ALL SELECT 'ids.payments', md5(string_agg(id::text || amount::text || status, ',' ORDER BY id)) FROM payments
UNION ALL SELECT 'ids.staff', md5(string_agg(id::text || name || role || active::text, ',' ORDER BY id)) FROM staff
ORDER BY 1;

-- Photo links by host (Seoul and Mumbai differ only here, before rewrite-urls.sql).
SELECT 'files.host ' || COALESCE(substring(file_url from '^https?://([^/]+)'), '(none)'), count(*)
FROM (
  SELECT file_url FROM credit_entry_attachments
  UNION ALL SELECT file_url FROM payment_attachments
  UNION ALL SELECT photo_url FROM credit_entries WHERE photo_url IS NOT NULL
) f GROUP BY 1 ORDER BY 1;
