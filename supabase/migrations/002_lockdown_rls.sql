-- ============================================
-- Lockdown RLS: Revoke all direct access
-- ============================================
-- After migrating to edge-function-only access,
-- this migration revokes all permissions from
-- anon/authenticated roles so the frontend
-- cannot query Postgres directly.

-- Revoke all permissions from anon and authenticated roles
REVOKE ALL ON staff FROM anon, authenticated;
REVOKE ALL ON app_settings FROM anon, authenticated;
REVOKE ALL ON customers FROM anon, authenticated;
REVOKE ALL ON credit_entries FROM anon, authenticated;
REVOKE ALL ON credit_entry_items FROM anon, authenticated;
REVOKE ALL ON payments FROM anon, authenticated;
REVOKE ALL ON payment_allocations FROM anon, authenticated;

-- Revoke permissions on views
REVOKE ALL ON customer_view_staff FROM anon, authenticated;
REVOKE ALL ON customer_view_admin FROM anon, authenticated;

-- Revoke permissions on sequences
REVOKE ALL ON customer_code_seq FROM anon, authenticated;

-- Revoke permissions on functions
REVOKE ALL ON FUNCTION generate_customer_code() FROM anon, authenticated;
REVOKE ALL ON FUNCTION generate_entry_code(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION current_user_role() FROM anon, authenticated;
REVOKE ALL ON FUNCTION current_user_id() FROM anon, authenticated;
REVOKE ALL ON FUNCTION get_dashboard_stats() FROM anon, authenticated;

-- Drop RLS policies (no longer needed since direct access is revoked)
DROP POLICY IF EXISTS staff_admin_all ON staff;
DROP POLICY IF EXISTS customers_admin_all ON customers;
DROP POLICY IF EXISTS customers_staff_insert ON customers;
DROP POLICY IF EXISTS customers_staff_select ON customers;
DROP POLICY IF EXISTS credit_entries_admin_all ON credit_entries;
DROP POLICY IF EXISTS credit_entries_staff_insert ON credit_entries;
DROP POLICY IF EXISTS credit_entries_staff_select ON credit_entries;
DROP POLICY IF EXISTS credit_entry_items_admin_all ON credit_entry_items;
DROP POLICY IF EXISTS credit_entry_items_staff_insert ON credit_entry_items;
DROP POLICY IF EXISTS credit_entry_items_staff_select ON credit_entry_items;
DROP POLICY IF EXISTS payments_admin_all ON payments;
DROP POLICY IF EXISTS payment_allocations_admin_all ON payment_allocations;
DROP POLICY IF EXISTS app_settings_admin_all ON app_settings;
DROP POLICY IF EXISTS app_settings_staff_select ON app_settings;

-- Disable RLS (no longer needed)
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_entry_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations DISABLE ROW LEVEL SECURITY;

-- Drop helper functions (no longer needed)
DROP FUNCTION IF EXISTS current_user_role();
DROP FUNCTION IF EXISTS current_user_id();
DROP FUNCTION IF EXISTS get_dashboard_stats();