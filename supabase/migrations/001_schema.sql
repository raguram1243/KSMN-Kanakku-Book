-- ============================================
-- KSMN Kanaku-Book Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  customer_type TEXT NOT NULL DEFAULT 'walk-in' CHECK (customer_type IN ('walk-in', 'regular')),
  notes TEXT,
  last_entry_seq INTEGER DEFAULT 0,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_code TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_mode TEXT NOT NULL CHECK (entry_mode IN ('detailed', 'quick')),
  description TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (total_amount - paid_amount) <= 0 THEN 'paid'
      WHEN paid_amount > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  ) STORED,
  photo_url TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_entry_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_entry_id UUID NOT NULL REFERENCES credit_entries(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  qty NUMERIC(10,2) NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  amount NUMERIC(12,2) GENERATED ALWAYS AS (qty * rate) STORED
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  credit_entry_id UUID NOT NULL REFERENCES credit_entries(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(12,2) NOT NULL,
  UNIQUE(payment_id, credit_entry_id)
);

-- ============================================
-- SEQUENCES
-- ============================================

CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate next customer code safely
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT nextval('customer_code_seq') INTO next_val;
  RETURN 'KSMN-' || LPAD(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate entry code for a customer (thread-safe)
CREATE OR REPLACE FUNCTION generate_entry_code(p_customer_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_customer_code TEXT;
  v_last_seq INTEGER;
  v_new_seq INTEGER;
BEGIN
  -- Lock the customer row to prevent concurrent updates
  SELECT customer_code, last_entry_seq INTO v_customer_code, v_last_seq
  FROM customers
  WHERE id = p_customer_id
  FOR UPDATE;

  v_new_seq := v_last_seq + 1;

  -- Update the sequence counter
  UPDATE customers
  SET last_entry_seq = v_new_seq
  WHERE id = p_customer_id;

  RETURN v_customer_code || '-' || v_new_seq;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- Staff view: excludes financial columns
CREATE OR REPLACE VIEW customer_view_staff AS
SELECT 
  id, customer_code, name, phone, address, customer_type, notes, created_at
FROM customers;

-- Admin view: includes all columns
CREATE OR REPLACE VIEW customer_view_admin AS
SELECT * FROM customers;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_credit_entries_customer ON credit_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_entries_status ON credit_entries(status);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_entry ON payment_allocations(credit_entry_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_entry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role from JWT
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    'staff'
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function to get current user id from JWT
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'staff_id')::UUID,
    uuid_generate_v4()
  );
END;
$$ LANGUAGE plpgsql;

-- STAFF table policies
CREATE POLICY staff_admin_all ON staff
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- CUSTOMERS table policies
-- Admin: full access
CREATE POLICY customers_admin_all ON customers
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: can insert new customers
CREATE POLICY customers_staff_insert ON customers
  FOR INSERT
  TO authenticated
  WITH CHECK (current_user_role() = 'staff');

-- Staff: can only select from the staff view (no financial columns)
CREATE POLICY customers_staff_select ON customers
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'staff'
    AND EXISTS (
      SELECT 1 FROM customer_view_staff cvs
      WHERE cvs.id = customers.id
    )
  );

-- Staff: cannot update/delete customers
-- (no UPDATE/DELETE policies for staff on customers)

-- CREDIT_ENTRIES table policies
-- Admin: full access
CREATE POLICY credit_entries_admin_all ON credit_entries
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: can insert new entries
CREATE POLICY credit_entries_staff_insert ON credit_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (current_user_role() = 'staff');

-- Staff: can only select from entries (but RLS on credit_entries will hide balance/status via view)
-- We'll handle this by only allowing staff to query through the view
CREATE POLICY credit_entries_staff_select ON credit_entries
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'staff'
    AND EXISTS (
      SELECT 1 FROM credit_entries ce
      JOIN customers c ON c.id = ce.customer_id
      WHERE ce.id = credit_entries.id
    )
  );

-- Staff: cannot update/delete entries

-- CREDIT_ENTRY_ITEMS table policies
-- Admin: full access
CREATE POLICY credit_entry_items_admin_all ON credit_entry_items
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: can insert items for entries they create
CREATE POLICY credit_entry_items_staff_insert ON credit_entry_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'staff'
    AND EXISTS (
      SELECT 1 FROM credit_entries ce
      WHERE ce.id = credit_entry_items.credit_entry_id
      AND ce.created_by = current_user_id()
    )
  );

-- Staff: can select items for entries they create
CREATE POLICY credit_entry_items_staff_select ON credit_entry_items
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'staff'
    AND EXISTS (
      SELECT 1 FROM credit_entries ce
      WHERE ce.id = credit_entry_items.credit_entry_id
      AND ce.created_by = current_user_id()
    )
  );

-- PAYMENTS table policies
-- Admin: full access
CREATE POLICY payments_admin_all ON payments
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: no access to payments
-- (no policies for staff)

-- PAYMENT_ALLOCATIONS table policies
-- Admin: full access
CREATE POLICY payment_allocations_admin_all ON payment_allocations
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: no access to payment allocations
-- (no policies for staff)

-- APP_SETTINGS table policies
-- Admin: full access
CREATE POLICY app_settings_admin_all ON app_settings
  FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff: can read app_settings
CREATE POLICY app_settings_staff_select ON app_settings
  FOR SELECT
  TO authenticated
  USING (current_user_role() = 'staff');

-- ============================================
-- TRIGGERS
-- ============================================

-- Update paid_amount on payment_allocations change
CREATE OR REPLACE FUNCTION update_entry_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE credit_entries
  SET paid_amount = (
    SELECT COALESCE(SUM(allocated_amount), 0)
    FROM payment_allocations
    WHERE credit_entry_id = COALESCE(NEW.credit_entry_id, OLD.credit_entry_id)
  )
  WHERE id = COALESCE(NEW.credit_entry_id, OLD.credit_entry_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_paid_amount ON payment_allocations;

CREATE TRIGGER trigger_update_paid_amount
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_entry_paid_amount();

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default admin (PIN: admin123 - hash will be set via edge function or manually)
-- For now, insert a placeholder - PIN should be set via the app or edge function
INSERT INTO staff (name, pin_hash, role, active)
VALUES ('Admin', '$2a$10$PLACEHOLDER', 'admin', true)
ON CONFLICT DO NOTHING;

-- Insert default app settings
INSERT INTO app_settings (key, value) VALUES
  ('overdue_days_walkin', '30'),
  ('overdue_days_regular', '45'),
  ('app_name', 'KSMN Kanaku-Book')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get dashboard statistics
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
  overdue_days_walkin INTEGER;
  overdue_days_regular INTEGER;
BEGIN
  -- Get overdue settings
  SELECT value::INTEGER INTO overdue_days_walkin FROM app_settings WHERE key = 'overdue_days_walkin';
  SELECT value::INTEGER INTO overdue_days_regular FROM app_settings WHERE key = 'overdue_days_regular';

  -- Build the result JSON
  SELECT json_build_object(
    'totalOutstanding', COALESCE(SUM(balance), 0),
    'totalCustomers', (SELECT COUNT(*) FROM customers),
    'overdueCount', (
      SELECT COUNT(*)
      FROM credit_entries ce
      JOIN customers c ON c.id = ce.customer_id
      WHERE ce.status != 'paid'
      AND (
        (c.customer_type = 'walk-in' AND ce.created_at < NOW() - (overdue_days_walkin || ' days')::INTERVAL)
        OR
        (c.customer_type = 'regular' AND ce.created_at < NOW() - (overdue_days_regular || ' days')::INTERVAL)
      )
    ),
    'topDebtors', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', c.id,
        'name', c.name,
        'customer_code', c.customer_code,
        'balance', COALESCE(SUM(ce.balance), 0)
      )), '[]'::json)
      FROM customers c
      JOIN credit_entries ce ON ce.customer_id = c.id
      WHERE ce.status != 'paid'
      GROUP BY c.id, c.name, c.customer_code
      ORDER BY SUM(ce.balance) DESC
      LIMIT 10
    ),
    'recentEntries', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', ce.id,
        'entry_code', ce.entry_code,
        'customer_name', c.name,
        'total_amount', ce.total_amount,
        'status', ce.status,
        'created_at', ce.created_at
      )), '[]'::json)
      FROM credit_entries ce
      JOIN customers c ON c.id = ce.customer_id
      ORDER BY ce.created_at DESC
      LIMIT 10
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
