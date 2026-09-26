// ============================================
// Follow-ups + credit limits + day-book (A1/A4/A5 backend)
// ============================================
// Frontend-first: FollowUpsPage/CreditLimits/DayBookPage work today on
// localStorage fallbacks + existing APIs. After `supabase db push` (see
// supabase/migrations/019_*.sql, 020_*.sql, 021_*.sql) and deploying the
// follow-ups edge functions, set VITE_FOLLOWUPS_API=1 to use the server.
//
// Tables added by the migrations:
// - follow_ups(id, customer_id, entry_id?, promised_date, note, status,
//              created_by, created_at, updated_at)
// - customers.credit_limit NUMERIC NULL  (warning-only limit, see A4 notes)
// Helpers: get_day_book_stats(p_day DATE) for the Day-book page.
// ============================================

-- Follow-ups: who promised to pay, and when.
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES credit_entries(id) ON DELETE SET NULL,
  promised_date DATE,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_customer ON follow_ups(customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_status_promised ON follow_ups(status, promised_date);
CREATE INDEX IF NOT EXISTS idx_followups_entry ON follow_ups(entry_id);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION touch_follow_ups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_followups_touch ON follow_ups;
CREATE TRIGGER trg_followups_touch
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION touch_follow_ups_updated_at();

-- RLS: locked down like the rest of the ledger (service-role edge functions
-- bypass RLS; no direct client access).
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_ups_no_direct ON follow_ups;
CREATE POLICY follow_ups_no_direct ON follow_ups
  FOR ALL USING (false) WITH CHECK (false);
