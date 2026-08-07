-- ============================================
-- Add 5 customer types and custom overdue days
-- ============================================

-- 1. Update customer_type check constraint to allow 5 values
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_customer_type_check,
  ADD CONSTRAINT customers_customer_type_check 
    CHECK (customer_type IN ('walk-in', 'regular', 'contractor', 'wholesale', 'corporate'));

-- 2. Add custom_overdue_days column (nullable, allows per-customer override)
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS custom_overdue_days INTEGER;

-- 3. Drop lingering policy that references the view (leftover from before lockdown migration)
DROP POLICY IF EXISTS customers_staff_select ON customers;

-- 4. Update the staff view to include the new column
DROP VIEW IF EXISTS customer_view_staff;
CREATE OR REPLACE VIEW customer_view_staff AS
SELECT 
  id, customer_code, name, phone, address, customer_type, notes, created_at, custom_overdue_days
FROM customers;

-- 5. Update the admin view to include the new column
DROP VIEW IF EXISTS customer_view_admin;
CREATE OR REPLACE VIEW customer_view_admin AS
SELECT * FROM customers;

-- 6. Add 3 new app_settings defaults for the new customer types
INSERT INTO app_settings (key, value) VALUES
  ('overdue_days_contractor', '45'),
  ('overdue_days_wholesale', '30'),
  ('overdue_days_corporate', '45')
ON CONFLICT (key) DO NOTHING;
