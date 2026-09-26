// ============================================
// A4: per-customer credit limits (warning-only)
// ============================================
// NULL = no limit. The frontend warns (never hard-blocks) when a new
// entry would push balance over the limit, so staff can still sell with
// admin override. list_customers RPC re-created to include credit_limit.
// ============================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC;
