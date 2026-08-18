-- ============================================
-- Customer search performance indexes
-- ============================================

-- Enable pg_trgm extension for efficient ILIKE %search% queries
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes for fast substring search on name, phone, customer_code
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_customer_code_trgm
  ON customers USING gin (customer_code gin_trgm_ops);
