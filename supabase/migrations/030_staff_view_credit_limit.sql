-- Let staff see the credit limit on customers.
--
-- Staff are the people who add credit entries, so they are who the over-limit
-- warning on the Add Credit Entry screen is for. customer_view_staff did not
-- expose credit_limit, so the warning never appeared for staff. This migration
-- re-creates customer_view_staff with the same columns as 024 plus credit_limit.
--
-- Only the view changes. No table rows are touched. customer_view_admin already
-- exposes credit_limit (it is SELECT * FROM customers), so it is not changed here.
--
-- Dropping a view discards its grants, so the revoke is restated below, the same
-- as 024 does.

DROP VIEW IF EXISTS customer_view_staff;
CREATE OR REPLACE VIEW customer_view_staff AS
SELECT
  id, customer_code, name, phone, address, customer_type, notes, created_at, custom_overdue_days, last_reminder_at, credit_limit
FROM customers;

REVOKE ALL ON customer_view_staff FROM anon, authenticated;
