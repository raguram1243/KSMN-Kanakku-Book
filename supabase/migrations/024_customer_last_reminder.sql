-- When did we last remind this customer? One timestamp per customer.
--
-- The shop owner wants to see at a glance when a customer was last sent a
-- WhatsApp payment reminder. Only the latest one matters, so this is a single
-- column that is overwritten each time (by the record-reminder edge function).
-- It is for the owner's own reference and is never shown to the customer.
--
-- The app reads customers through customer_view_staff / customer_view_admin,
-- not the table. Postgres expands SELECT * when a view is created, so a new
-- column does NOT show up in customer_view_admin by itself, and
-- customer_view_staff lists its columns explicitly. Both views are recreated
-- here, in the same DROP/CREATE style as 007_add_customer_types.sql, so the
-- column is visible through them. 007 is the newest definition of both views
-- (no later migration redefines them); the staff column list below is 007's
-- plus last_reminder_at.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

DROP VIEW IF EXISTS customer_view_staff;
CREATE OR REPLACE VIEW customer_view_staff AS
SELECT
  id, customer_code, name, phone, address, customer_type, notes, created_at, custom_overdue_days, last_reminder_at
FROM customers;

DROP VIEW IF EXISTS customer_view_admin;
CREATE OR REPLACE VIEW customer_view_admin AS
SELECT * FROM customers;

-- Dropping a view discards its grants. 002_lockdown_rls.sql revoked all direct
-- access to these views (the app only reaches them via edge functions using
-- the service role), so restate that for the recreated views.
REVOKE ALL ON customer_view_staff FROM anon, authenticated;
REVOKE ALL ON customer_view_admin FROM anon, authenticated;
