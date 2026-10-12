-- Staff payments wait for admin approval, and the ledger guards its own sums.
--
-- WHY (owner's rules): staff may add a customer, a bill or a payment, and
-- nothing else. A payment typed in by staff must not move any balance,
-- advance, report or dashboard figure until an admin has looked at it. So a
-- payment now has a status:
--
--   approved  counts everywhere (every existing payment, and anything an
--             admin records directly - same as before this migration)
--   pending   recorded by staff; kept, listed for the admin, counted nowhere,
--             and it can have NO allocations to bills
--   rejected  an admin said no; kept for the record, counted nowhere
--
-- WHY (integrity): until now every balance rule lived in edge functions that
-- read a balance in one HTTP call and wrote allocations in another, with no
-- transaction and no lock between them. Two admins (or one double-tap)
-- applying the same advance could both read "1000 left" and spend it twice,
-- and nothing in the database would object. This migration:
--
--   * moves "create a bill" and "apply advance" into SQL functions that run in
--     one transaction and lock the customer's row first, so every operation
--     that changes one customer's balances runs one at a time;
--   * adds a trigger on payment_allocations that refuses, whoever writes the
--     row, an allocation to a payment that is not approved, more allocated
--     out of a payment than it is worth, or more allocated to a bill than the
--     bill is worth (0.01 tolerance for rounding);
--   * adds CHECK constraints for positive amounts. They are NOT VALID: they
--     apply to every new or updated row, but existing rows are not re-checked,
--     so an odd historical row cannot block this migration. (An UPDATE of such
--     an old row will have to fix it.)
--
-- Every SQL function and view that sums or lists payments now counts only
-- approved ones: payment_unallocated / customer_advance_balance (and so
-- list_customers and the advance figures), get_dashboard_stats_v2,
-- get_day_book_stats and get_ledger_report. Each is copied from its newest
-- migration (022, 027, 029, 008) with only the status filter added.
--
-- staff.sessions_valid_after: a token issued before this time is refused by
-- the edge functions (_shared/auth.ts). Adding the column with DEFAULT now()
-- logs everybody out once when this is deployed - intended, because the new
-- check reads the role from the database instead of trusting the token.
--
-- Storage: the entry-photos / entry-docs buckets become private. The edge
-- functions now hand out 1-hour signed links instead of permanent public URLs.
--
-- The privilege / RLS lockdown that covers the functions created here is in
-- 032_rls_lockdown.sql, which must run after this file.

-- ============================================
-- 1. Schema
-- ============================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reviewed_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES staff(id) ON DELETE SET NULL;

-- The admin's "waiting for approval" list and its nav badge count.
CREATE INDEX IF NOT EXISTS idx_payments_pending
  ON payments(status) WHERE status = 'pending';

ALTER TABLE staff ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMPTZ NOT NULL DEFAULT now();

-- Positive amounts for new and changed rows (see NOT VALID note at the top).
ALTER TABLE credit_entries DROP CONSTRAINT IF EXISTS credit_entries_total_amount_positive;
ALTER TABLE credit_entries ADD CONSTRAINT credit_entries_total_amount_positive
  CHECK (total_amount > 0) NOT VALID;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive
  CHECK (amount > 0) NOT VALID;

ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_amount_positive;
ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_amount_positive
  CHECK (allocated_amount > 0) NOT VALID;

ALTER TABLE credit_entry_items DROP CONSTRAINT IF EXISTS credit_entry_items_qty_rate_valid;
ALTER TABLE credit_entry_items ADD CONSTRAINT credit_entry_items_qty_rate_valid
  CHECK (qty > 0 AND rate >= 0) NOT VALID;

-- ============================================
-- 2. Integrity triggers
-- ============================================

-- payment_allocations: the one rule set every writer has to pass, whether it
-- is one of the SQL functions below or a plain PostgREST insert from an edge
-- function (update-payment still writes allocations that way).
--
-- AFTER ROW, so the sums below already include the row being written; for a
-- multi-row INSERT the AFTER ROW triggers run once the whole statement is in,
-- so every row is checked against the final totals.
--
-- It locks the customer row first, the same lock the SQL functions take, so
-- a direct insert and a function call for the same customer cannot interleave
-- between "add up what is allocated" and "write a new allocation".
CREATE OR REPLACE FUNCTION check_payment_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_entry credit_entries%ROWTYPE;
  v_payment_total NUMERIC;
  v_entry_total NUMERIC;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = NEW.payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That payment no longer exists';
  END IF;

  PERFORM 1 FROM customers WHERE id = v_payment.customer_id FOR UPDATE;

  IF v_payment.status <> 'approved' THEN
    IF v_payment.status = 'pending' THEN
      RAISE EXCEPTION 'This payment is still waiting for admin approval, so it cannot be applied to bills yet';
    ELSE
      RAISE EXCEPTION 'This payment was rejected, so it cannot be applied to bills';
    END IF;
  END IF;

  SELECT * INTO v_entry FROM credit_entries WHERE id = NEW.credit_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That bill no longer exists';
  END IF;

  IF v_entry.customer_id IS DISTINCT FROM v_payment.customer_id THEN
    RAISE EXCEPTION 'Bill % belongs to a different customer than this payment', v_entry.entry_code;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_total
  FROM payment_allocations WHERE payment_id = NEW.payment_id;

  IF v_payment_total > v_payment.amount + 0.01 THEN
    RAISE EXCEPTION 'This payment of ₹% is already fully used: ₹% would be applied to bills in total',
      v_payment.amount, v_payment_total;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_entry_total
  FROM payment_allocations WHERE credit_entry_id = NEW.credit_entry_id;

  IF v_entry_total > v_entry.total_amount + 0.01 THEN
    RAISE EXCEPTION 'Bill % is for ₹% but ₹% would be paid against it; it cannot be paid more than its amount',
      v_entry.entry_code, v_entry.total_amount, v_entry_total;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_allocations_integrity ON payment_allocations;
CREATE TRIGGER trg_payment_allocations_integrity
  AFTER INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION check_payment_allocation();

-- A payment that has been applied to bills cannot quietly drop out of
-- "approved": its allocations would keep bills marked paid by money that no
-- longer counts. (approve_payment / reject_payment only ever move a pending
-- payment, which by the trigger above has no allocations.)
CREATE OR REPLACE FUNCTION check_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW.status <> 'approved'
     AND EXISTS (SELECT 1 FROM payment_allocations WHERE payment_id = NEW.id) THEN
    RAISE EXCEPTION 'This payment is already applied to bills; remove it from the bills before changing its status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_status_guard ON payments;
CREATE TRIGGER trg_payments_status_guard
  BEFORE UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION check_payment_status_change();

-- A bill's amount cannot be edited below what has already been paid on it.
-- update-entry already refuses this (it compares with paid_amount first); this
-- is the backstop for the gap between its read and its write.
CREATE OR REPLACE FUNCTION check_entry_total_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated NUMERIC;
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_allocated
    FROM payment_allocations WHERE credit_entry_id = NEW.id;

    IF NEW.total_amount < v_allocated - 0.01 THEN
      RAISE EXCEPTION 'Bill % cannot be reduced to ₹%: ₹% has already been paid against it',
        NEW.entry_code, NEW.total_amount, v_allocated;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_entries_total_guard ON credit_entries;
CREATE TRIGGER trg_credit_entries_total_guard
  BEFORE UPDATE OF total_amount ON credit_entries
  FOR EACH ROW EXECUTE FUNCTION check_entry_total_change();

-- ============================================
-- 3. Advance views: approved payments only
-- ============================================
-- Same columns as 008, so CREATE OR REPLACE keeps the view in place (and
-- customer_advance_balance, which reads this one, picks the filter up).
-- Allocations only ever exist on approved payments (trigger above), so the
-- filter only has to drop pending/rejected payment rows.

CREATE OR REPLACE VIEW payment_unallocated AS
SELECT
  p.id AS payment_id,
  p.customer_id,
  p.amount,
  p.payment_date,
  p.amount - COALESCE(SUM(pa.allocated_amount), 0) AS unallocated_amount
FROM payments p
LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
WHERE p.status = 'approved'
GROUP BY p.id, p.customer_id, p.amount, p.payment_date;

CREATE OR REPLACE VIEW customer_advance_balance AS
SELECT customer_id, SUM(unallocated_amount) AS advance_balance
FROM payment_unallocated
WHERE unallocated_amount > 0.01
GROUP BY customer_id;

REVOKE ALL ON public.payment_unallocated FROM anon, authenticated;
REVOKE ALL ON public.customer_advance_balance FROM anon, authenticated;

-- ============================================
-- 4. record_payment: + p_status
-- ============================================
-- The 10-argument version from 028 is dropped so PostgREST sees exactly one
-- record_payment. Everything in 028 (idempotency first, then validation, then
-- inserts; under-allocation allowed, over-allocation refused) is unchanged.
-- New:
--   * p_status 'approved' (admin, default) or 'pending' (staff);
--   * a pending payment must come with no allocations;
--   * the customer row is locked before anything is read, so the balances
--     validated below cannot change before the allocations are written.

DROP FUNCTION IF EXISTS record_payment(uuid, numeric, date, text, text, text, uuid, uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION record_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_receipt_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_allocations JSONB DEFAULT '[]'::jsonb,
  p_attachments JSONB DEFAULT '[]'::jsonb,
  p_status TEXT DEFAULT 'approved'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_existing jsonb;
  v_alloc jsonb;
  v_attach jsonb;
  v_entry credit_entries%ROWTYPE;
  v_entry_id UUID;
  v_alloc_amount NUMERIC;
  v_alloc_total NUMERIC := 0;
  v_alloc_count INTEGER := 0;
  v_distinct_entries INTEGER := 0;
BEGIN
  -- Serialize every balance change for this customer.
  PERFORM 1 FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Idempotency check (must stay ahead of validation: a retry of a payment
  -- that is already recorded has to return it, not re-check balances the
  -- first call has already consumed)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT to_jsonb(p.*) INTO v_existing
    FROM payments p
    WHERE p.idempotency_key = p_idempotency_key;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('payment', v_existing, 'duplicate', true);
    END IF;
  END IF;

  -- ============================================
  -- Validation - nothing is inserted until all of this passes
  -- ============================================

  IF p_status IS NULL OR p_status NOT IN ('approved', 'pending') THEN
    RAISE EXCEPTION 'Payment status must be approved or pending';
  END IF;

  IF p_amount IS NULL OR round(p_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0 (received %)',
      COALESCE(p_amount::TEXT, 'no amount');
  END IF;

  IF p_status = 'pending'
     AND jsonb_array_length(COALESCE(p_allocations, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'A payment waiting for approval cannot be applied to bills; the admin chooses the bills when approving it';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_entry_id := (v_alloc->>'credit_entry_id')::UUID;
    v_alloc_amount := (v_alloc->>'allocated_amount')::NUMERIC;

    IF v_entry_id IS NULL THEN
      RAISE EXCEPTION 'Every allocation must name the bill it pays (credit_entry_id was missing)';
    END IF;

    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'Allocation amount must be greater than 0 (bill % received %)',
        v_entry_id, COALESCE(v_alloc_amount::TEXT, 'no amount');
    END IF;

    SELECT * INTO v_entry FROM credit_entries WHERE id = v_entry_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot allocate to bill %: no such credit entry', v_entry_id;
    END IF;

    IF v_entry.customer_id IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION 'Bill % belongs to a different customer than the one this payment is for',
        v_entry.entry_code;
    END IF;

    -- balance is a generated column (total_amount - paid_amount); read it,
    -- never recompute it. 0.01 tolerance absorbs rounding in the caller.
    IF v_alloc_amount > v_entry.balance + 0.01 THEN
      RAISE EXCEPTION 'Allocation of % to bill % is more than its outstanding balance of %',
        v_alloc_amount, v_entry.entry_code, v_entry.balance;
    END IF;

    v_alloc_total := v_alloc_total + v_alloc_amount;
    v_alloc_count := v_alloc_count + 1;
  END LOOP;

  -- Allocating less than the payment is legal (the remainder becomes advance
  -- credit). Allocating more than the payment is not.
  IF v_alloc_total > p_amount + 0.01 THEN
    RAISE EXCEPTION 'Allocations add up to % but the payment is only %',
      v_alloc_total, p_amount;
  END IF;

  -- The same bill twice in one call would trip UNIQUE(payment_id,
  -- credit_entry_id) half way through the insert loop, so reject it up front.
  SELECT COUNT(DISTINCT a->>'credit_entry_id')
  INTO v_distinct_entries
  FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS a;

  IF v_distinct_entries <> v_alloc_count THEN
    RAISE EXCEPTION 'The same bill is listed more than once in this payment; combine it into a single allocation';
  END IF;

  -- Insert payment
  INSERT INTO payments (
    customer_id, amount, payment_date, payment_method, receipt_number, notes, created_by, idempotency_key, status
  ) VALUES (
    p_customer_id, p_amount, p_payment_date, p_payment_method, p_receipt_number, p_notes, p_created_by, p_idempotency_key, p_status
  )
  RETURNING * INTO v_payment;

  -- Insert allocations (if any)
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    INSERT INTO payment_allocations (payment_id, credit_entry_id, allocated_amount)
    VALUES (
      v_payment.id,
      (v_alloc->>'credit_entry_id')::UUID,
      (v_alloc->>'allocated_amount')::NUMERIC
    );
  END LOOP;

  -- Insert attachments (if any)
  FOR v_attach IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO payment_attachments (payment_id, file_url, file_type)
    VALUES (
      v_payment.id,
      v_attach->>'file_url',
      v_attach->>'file_type'
    );
  END LOOP;

  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'duplicate', false);

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent request with the same idempotency key: return the existing payment
    SELECT to_jsonb(p.*) INTO v_existing
    FROM payments p
    WHERE p.idempotency_key = p_idempotency_key;

    IF v_existing IS NULL THEN
      RAISE;
    END IF;

    RETURN jsonb_build_object('payment', v_existing, 'duplicate', true);
END;
$$;

-- ============================================
-- 5. approve_payment / reject_payment
-- ============================================

-- Approve a pending payment and apply it to bills.
--   p_allocations NULL (or JSON null) -> oldest bill first, automatically
--   p_allocations array               -> exactly these, validated like
--                                        record_payment; rows with an amount
--                                        of exactly 0 are skipped (the admin
--                                        screen lists every open bill)
-- Whatever is not allocated stays on the payment as advance.
-- advance_remaining in the result is THIS payment's unallocated amount.
CREATE OR REPLACE FUNCTION approve_payment(
  p_payment_id UUID,
  p_reviewer UUID,
  p_allocations JSONB DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id UUID;
  v_payment payments%ROWTYPE;
  v_entry credit_entries%ROWTYPE;
  v_alloc jsonb;
  v_entry_id UUID;
  v_alloc_amount NUMERIC;
  v_alloc_total NUMERIC := 0;
  v_left NUMERIC;
  v_take NUMERIC;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_result_allocs jsonb;
BEGIN
  SELECT customer_id INTO v_customer_id FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  PERFORM 1 FROM customers WHERE id = v_customer_id FOR UPDATE;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status = 'approved' THEN
    RAISE EXCEPTION 'This payment has already been approved';
  ELSIF v_payment.status = 'rejected' THEN
    RAISE EXCEPTION 'This payment was rejected and cannot be approved';
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'null' THEN
    p_allocations := NULL;
  END IF;

  -- Validate an explicit split before anything is written.
  IF p_allocations IS NOT NULL THEN
    IF jsonb_typeof(p_allocations) <> 'array' THEN
      RAISE EXCEPTION 'Allocations must be a list of bills and amounts';
    END IF;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      BEGIN
        v_entry_id := (v_alloc->>'credit_entry_id')::UUID;
        v_alloc_amount := (v_alloc->>'allocated_amount')::NUMERIC;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Each allocation needs a valid bill and a number for the amount';
      END;

      IF v_entry_id IS NULL THEN
        RAISE EXCEPTION 'Every allocation must name the bill it pays';
      END IF;
      IF v_alloc_amount IS NULL OR v_alloc_amount < 0 THEN
        RAISE EXCEPTION 'Allocation amounts must be 0 or more';
      END IF;
      CONTINUE WHEN v_alloc_amount = 0;

      IF v_entry_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'The same bill is listed more than once; combine it into a single amount';
      END IF;
      v_seen := v_seen || v_entry_id;

      SELECT * INTO v_entry FROM credit_entries WHERE id = v_entry_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'One of the selected bills no longer exists; reload and try again';
      END IF;
      IF v_entry.customer_id IS DISTINCT FROM v_payment.customer_id THEN
        RAISE EXCEPTION 'Bill % belongs to a different customer than this payment', v_entry.entry_code;
      END IF;
      IF v_alloc_amount > v_entry.balance + 0.01 THEN
        RAISE EXCEPTION '₹% for bill % is more than its outstanding balance of ₹%',
          v_alloc_amount, v_entry.entry_code, v_entry.balance;
      END IF;

      v_alloc_total := v_alloc_total + v_alloc_amount;
    END LOOP;

    IF v_alloc_total > v_payment.amount + 0.01 THEN
      RAISE EXCEPTION 'The amounts add up to ₹% but the payment is only ₹%',
        v_alloc_total, v_payment.amount;
    END IF;
  END IF;

  -- Approve first: the allocation trigger only accepts approved payments.
  UPDATE payments
  SET status = 'approved',
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_payment_id;

  IF p_allocations IS NOT NULL THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_alloc_amount := (v_alloc->>'allocated_amount')::NUMERIC;
      CONTINUE WHEN v_alloc_amount = 0;
      INSERT INTO payment_allocations (payment_id, credit_entry_id, allocated_amount)
      VALUES (p_payment_id, (v_alloc->>'credit_entry_id')::UUID, v_alloc_amount);
    END LOOP;
  ELSE
    -- Oldest open bill first, until the payment runs out.
    v_left := v_payment.amount;
    FOR v_entry IN
      SELECT * FROM credit_entries
      WHERE customer_id = v_payment.customer_id AND balance > 0
      ORDER BY created_at, id
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, v_entry.balance);
      INSERT INTO payment_allocations (payment_id, credit_entry_id, allocated_amount)
      VALUES (p_payment_id, v_entry.id, v_take);
      v_left := v_left - v_take;
    END LOOP;
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'credit_entry_id', pa.credit_entry_id,
           'entry_code', ce.entry_code,
           'allocated_amount', pa.allocated_amount
         ) ORDER BY ce.created_at, ce.id), '[]'::jsonb),
         COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_result_allocs, v_alloc_total
  FROM payment_allocations pa
  JOIN credit_entries ce ON ce.id = pa.credit_entry_id
  WHERE pa.payment_id = p_payment_id;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'allocations', v_result_allocs,
    'advance_remaining', v_payment.amount - v_alloc_total
  );
END;
$$;

-- Reject a pending payment. It stays in the records, counted nowhere.
CREATE OR REPLACE FUNCTION reject_payment(
  p_payment_id UUID,
  p_reviewer UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id UUID;
  v_payment payments%ROWTYPE;
BEGIN
  SELECT customer_id INTO v_customer_id FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  PERFORM 1 FROM customers WHERE id = v_customer_id FOR UPDATE;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status = 'approved' THEN
    RAISE EXCEPTION 'This payment has already been approved and cannot be rejected';
  ELSIF v_payment.status = 'rejected' THEN
    RAISE EXCEPTION 'This payment has already been rejected';
  END IF;

  UPDATE payments
  SET status = 'rejected',
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object('payment', to_jsonb(v_payment));
END;
$$;

-- ============================================
-- 6. create_credit_entry
-- ============================================
-- Replaces the five separate calls create-entry used to make (code, entry,
-- attachments, items, advance) with one transaction, so a failure part way
-- can no longer leave a bill without its items, and two bills for the same
-- customer cannot both spend the same advance.
--
--   detailed: p_items [{item_name, qty, rate}] must have at least one usable
--             row; the total is computed here as the sum of round(qty*rate, 2)
--             using qty/rate as stored (2 decimals). p_total_amount is ignored.
--             p_description is the summary the edge function built
--             (summarizeLineItems); if it is empty the same summary is built
--             here.
--   quick:    p_total_amount must be > 0; p_items is ignored.
--
-- Advance: available advance (approved payments only) is applied to THIS
-- bill only, oldest payment first, up to the bill's total - the same rule
-- create-entry used.
CREATE OR REPLACE FUNCTION create_credit_entry(
  p_customer_id UUID,
  p_entry_mode TEXT,
  p_description TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb,
  p_created_by UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_idx INTEGER;
  v_name TEXT;
  v_qty NUMERIC;
  v_rate NUMERIC;
  v_total NUMERIC := 0;
  v_description TEXT;
  v_code TEXT;
  v_entry credit_entries%ROWTYPE;
  v_attach jsonb;
  v_pay RECORD;
  v_left NUMERIC;
  v_take NUMERIC;
  v_applied NUMERIC := 0;
  v_count INTEGER;
BEGIN
  PERFORM 1 FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF p_entry_mode IS NULL OR p_entry_mode NOT IN ('quick', 'detailed') THEN
    RAISE EXCEPTION 'Entry type must be quick or detailed';
  END IF;

  IF p_entry_mode = 'detailed' THEN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'A detailed entry needs at least one item with a name and a quantity above zero';
    END IF;
    IF jsonb_array_length(p_items) > 500 THEN
      RAISE EXCEPTION 'A bill can have at most 500 items';
    END IF;

    FOR v_item, v_idx IN
      SELECT e, (o - 1)::INTEGER FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, o)
    LOOP
      v_name := btrim(COALESCE(v_item->>'item_name', ''));
      IF v_name = '' THEN
        RAISE EXCEPTION 'Item % has no name', v_idx + 1;
      END IF;

      BEGIN
        v_qty := round((v_item->>'qty')::NUMERIC, 2);
        v_rate := round((v_item->>'rate')::NUMERIC, 2);
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Item "%": quantity and rate must be numbers', v_name;
      END;

      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Item "%": quantity must be more than 0', v_name;
      END IF;
      IF v_rate IS NULL OR v_rate < 0 THEN
        RAISE EXCEPTION 'Item "%": rate cannot be negative', v_name;
      END IF;
      IF v_qty >= 100000000 OR v_rate >= 100000000 THEN
        RAISE EXCEPTION 'Item "%": quantity or rate is too large', v_name;
      END IF;

      v_total := v_total + round(v_qty * v_rate, 2);
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'item_name', v_name, 'qty', v_qty, 'rate', v_rate, 'sort_order', v_idx));
    END LOOP;

    v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
    IF v_description IS NULL THEN
      -- Same text as summarizeLineItems() / migration 023.
      SELECT string_agg(x->>'item_name', ', ' ORDER BY (x->>'sort_order')::INTEGER)
      INTO v_description
      FROM jsonb_array_elements(v_items) x
      WHERE (x->>'sort_order')::INTEGER < 3;
      v_count := jsonb_array_length(v_items);
      IF v_count > 3 THEN
        v_description := v_description || ' +' || (v_count - 3) || ' more';
      END IF;
    END IF;
  ELSE
    IF p_total_amount IS NULL OR round(p_total_amount, 2) <= 0 THEN
      RAISE EXCEPTION 'Amount must be greater than 0';
    END IF;
    v_total := round(p_total_amount, 2);
    v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'The bill total must be more than 0';
  END IF;
  IF v_total >= 10000000000 THEN
    RAISE EXCEPTION 'The bill total is too large';
  END IF;

  -- generate_entry_code locks the same customer row again (already ours).
  v_code := generate_entry_code(p_customer_id);

  INSERT INTO credit_entries (
    entry_code, customer_id, entry_mode, description, total_amount, photo_url, notes, created_by
  ) VALUES (
    v_code, p_customer_id, p_entry_mode, v_description, v_total,
    NULLIF(btrim(COALESCE(p_photo_url, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_created_by
  )
  RETURNING * INTO v_entry;

  INSERT INTO credit_entry_items (credit_entry_id, item_name, qty, rate, sort_order)
  SELECT v_entry.id, x->>'item_name', (x->>'qty')::NUMERIC, (x->>'rate')::NUMERIC, (x->>'sort_order')::INTEGER
  FROM jsonb_array_elements(v_items) x;

  IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) = 'array' THEN
    FOR v_attach IN SELECT * FROM jsonb_array_elements(p_attachments)
    LOOP
      CONTINUE WHEN COALESCE(v_attach->>'file_url', '') = '' OR COALESCE(v_attach->>'file_type', '') = '';
      INSERT INTO credit_entry_attachments (credit_entry_id, file_url, file_type)
      VALUES (v_entry.id, v_attach->>'file_url', v_attach->>'file_type');
    END LOOP;
  END IF;

  -- Apply available advance to this bill, oldest payment first.
  v_left := v_total;
  FOR v_pay IN
    SELECT pu.payment_id, pu.unallocated_amount
    FROM payment_unallocated pu
    JOIN payments p ON p.id = pu.payment_id
    WHERE pu.customer_id = p_customer_id
      AND pu.unallocated_amount > 0.01
    ORDER BY p.payment_date, p.created_at, p.id
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_pay.unallocated_amount);
    INSERT INTO payment_allocations (payment_id, credit_entry_id, allocated_amount)
    VALUES (v_pay.payment_id, v_entry.id, v_take);
    v_left := v_left - v_take;
    v_applied := v_applied + v_take;
  END LOOP;

  SELECT * INTO v_entry FROM credit_entries WHERE id = v_entry.id;

  RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'advance_applied', v_applied);
END;
$$;

-- ============================================
-- 7. apply_customer_advance
-- ============================================
-- Port of the apply-advance edge function: the customer's advance (approved
-- payments only), oldest payment first, is spread over their open bills,
-- oldest bill first (created_at, id), until either runs out.
--
-- Difference from the edge function: when a payment already has an
-- allocation on a bill (UNIQUE(payment_id, credit_entry_id)), the old code
-- skipped that pair, which could leave advance unused while the bill stayed
-- open. Here the existing allocation is topped up instead.
CREATE OR REPLACE FUNCTION apply_customer_advance(p_customer_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay RECORD;
  v_entry RECORD;
  v_pay_left NUMERIC;
  v_take NUMERIC;
  v_applied NUMERIC := 0;
  v_before jsonb := '{}'::jsonb;
  v_applied_map jsonb := '{}'::jsonb;
  v_entries jsonb;
  v_remaining NUMERIC;
BEGIN
  PERFORM 1 FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  FOR v_pay IN
    SELECT pu.payment_id, pu.unallocated_amount
    FROM payment_unallocated pu
    JOIN payments p ON p.id = pu.payment_id
    WHERE pu.customer_id = p_customer_id
      AND pu.unallocated_amount > 0.01
    ORDER BY p.payment_date, p.created_at, p.id
  LOOP
    v_pay_left := v_pay.unallocated_amount;

    -- Re-read open bills for every payment: the paid_amount trigger has
    -- already updated the balances touched by the previous payment.
    FOR v_entry IN
      SELECT ce.id, ce.balance
      FROM credit_entries ce
      WHERE ce.customer_id = p_customer_id
        AND ce.balance > 0.01
      ORDER BY ce.created_at, ce.id
    LOOP
      EXIT WHEN v_pay_left <= 0.01;

      IF NOT (v_before ? v_entry.id::TEXT) THEN
        v_before := v_before || jsonb_build_object(v_entry.id::TEXT, v_entry.balance);
      END IF;

      v_take := LEAST(v_pay_left, v_entry.balance);

      INSERT INTO payment_allocations AS pa (payment_id, credit_entry_id, allocated_amount)
      VALUES (v_pay.payment_id, v_entry.id, v_take)
      ON CONFLICT (payment_id, credit_entry_id)
      DO UPDATE SET allocated_amount = pa.allocated_amount + EXCLUDED.allocated_amount;

      v_pay_left := v_pay_left - v_take;
      v_applied := v_applied + v_take;
      v_applied_map := v_applied_map || jsonb_build_object(
        v_entry.id::TEXT,
        COALESCE((v_applied_map->>v_entry.id::TEXT)::NUMERIC, 0) + v_take);
    END LOOP;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entry_id', ce.id,
           'entry_code', ce.entry_code,
           'applied', (v_applied_map->>ce.id::TEXT)::NUMERIC,
           'balance_before', (v_before->>ce.id::TEXT)::NUMERIC,
           'balance_after', ce.balance
         ) ORDER BY ce.created_at, ce.id), '[]'::jsonb)
  INTO v_entries
  FROM credit_entries ce
  WHERE v_applied_map ? ce.id::TEXT;

  SELECT COALESCE(SUM(cab.advance_balance), 0) INTO v_remaining
  FROM customer_advance_balance cab
  WHERE cab.customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'success', true,
    'applied', v_applied,
    'remaining_advance', v_remaining,
    'entries', v_entries
  );
END;
$$;

-- ============================================
-- 8. Reports: approved payments only
-- ============================================

-- get_dashboard_stats_v2: copied from 022, with p.status = 'approved' added
-- to recentPayments, last30Days and totalCollectionLast30. Nothing else
-- changes (outstanding/aging read credit_entries.balance, which only ever
-- moves through allocations, and those only exist on approved payments).
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
    'customerSplit', (
      SELECT json_build_object(
        'total',        COUNT(*),
        'withDues',     COUNT(*) FILTER (WHERE COALESCE(bal, 0) > 0),
        'withoutDues',  COUNT(*) FILTER (WHERE COALESCE(bal, 0) <= 0)
      )
      FROM (
        SELECT c.id AS cid, COALESCE(SUM(ce.balance), 0) AS bal
        FROM customers c
        LEFT JOIN credit_entries ce ON ce.customer_id = c.id
        GROUP BY c.id
      ) cs
    ),
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
        WHERE p.status = 'approved'
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
          AND p.status = 'approved'
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
        AND p.status = 'approved'
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
      'days0to7', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 7
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) <= 7
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days8to14', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 8 AND 14
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 8 AND 14
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days15to21', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 15 AND 21
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 15 AND 21
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days22to30', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 22 AND 30
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 22 AND 30
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days31to40', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 40
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) BETWEEN 31 AND 40
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      ),
      'days41plus', json_build_object(
        'total', COALESCE((
          SELECT SUM(ce.balance) FROM credit_entries ce
          WHERE ce.status <> 'paid'
            AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 40
        ), 0),
        'customers', (
          SELECT COALESCE(json_agg(x ORDER BY x.amount DESC), '[]'::json)
          FROM (
            SELECT c.id AS customer_id, c.name, c.customer_code AS code, SUM(ce.balance) AS amount
            FROM credit_entries ce
            JOIN customers c ON c.id = ce.customer_id
            WHERE ce.status <> 'paid'
              AND floor(EXTRACT(EPOCH FROM (now() - ce.created_at)) / 86400) > 40
            GROUP BY c.id, c.name, c.customer_code
          ) x
        )
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- get_day_book_stats: copied from 027 (IST window, counts a payment on the
-- day it was RECORDED), with status = 'approved' added to both payment
-- queries. A staff payment approved later shows on the day staff recorded it,
-- which is when the cash reached the drawer.
CREATE OR REPLACE FUNCTION get_day_book_stats(p_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start TIMESTAMPTZ := (p_day::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_end   TIMESTAMPTZ := ((p_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_credit_total NUMERIC := 0;
  v_credit_count INTEGER := 0;
  v_coll_total NUMERIC := 0;
  v_coll_count INTEGER := 0;
  v_by_method JSONB := '[]'::JSONB;
  v_by_staff JSONB := '[]'::JSONB;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_credit_total, v_credit_count
    FROM credit_entries
    WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_coll_total, v_coll_count
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end
      AND status = 'approved';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_method
  FROM (
    SELECT COALESCE(payment_method, 'unknown') AS method,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end
      AND status = 'approved'
    GROUP BY 1
    ORDER BY total DESC
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_staff
  FROM (
    SELECT s.name AS staff_name,
           COUNT(*) AS entries,
           COALESCE(SUM(e.total_amount), 0) AS credit_given
    FROM credit_entries e
    LEFT JOIN staff s ON s.id = e.created_by
    WHERE e.created_at >= v_start AND e.created_at < v_end
    GROUP BY s.name
    ORDER BY credit_given DESC
  ) t;

  RETURN jsonb_build_object(
    'day', p_day,
    'credit_total', v_credit_total,
    'credit_count', v_credit_count,
    'collection_total', v_coll_total,
    'collection_count', v_coll_count,
    'net', v_credit_total - v_coll_total,
    'by_method', v_by_method,
    'by_staff', v_by_staff
  );
END;
$$;

-- get_ledger_report: copied from 029, with status = 'approved' added to the
-- "total paid" subquery. (The adv join reads customer_advance_balance, which
-- is approved-only through payment_unallocated above.)
CREATE OR REPLACE FUNCTION get_ledger_report(
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'customer_id', c.id,
    'customer_code', c.customer_code,
    'name', c.name,
    'phone', c.phone,
    'customer_type', c.customer_type,
    'total_credit', COALESCE(ct.total_credit, 0),
    'total_paid', COALESCE(pt.total_paid, 0),
    'outstanding', COALESCE(o.outstanding, 0)
  ))
  INTO result
  FROM customers c
  -- Total credit given within the date window
  LEFT JOIN (
    SELECT customer_id,
           SUM(total_amount) AS total_credit
    FROM credit_entries
    WHERE (p_from_date IS NULL OR (created_at AT TIME ZONE 'UTC')::date >= p_from_date)
      AND (p_to_date   IS NULL OR (created_at AT TIME ZONE 'UTC')::date <= p_to_date)
    GROUP BY customer_id
  ) ct ON ct.customer_id = c.id
  -- Total paid within the date window (period payments only)
  LEFT JOIN (
    SELECT customer_id,
           SUM(amount) AS total_paid
    FROM payments
    WHERE (p_from_date IS NULL OR payment_date >= p_from_date)
      AND (p_to_date   IS NULL OR payment_date <= p_to_date)
      AND status = 'approved'
    GROUP BY customer_id
  ) pt ON pt.customer_id = c.id
  -- Live, real-time outstanding balance (never date-filtered)
  LEFT JOIN (
    SELECT customer_id,
           SUM(balance) AS outstanding
    FROM credit_entries
    GROUP BY customer_id
  ) o ON o.customer_id = c.id
  LEFT JOIN customer_advance_balance adv ON adv.customer_id = c.id;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- list_customers (018) is not re-created: its only payment figure,
-- advance_balance, comes from customer_advance_balance, which is now
-- approved-only.

-- ============================================
-- 9. Private storage buckets
-- ============================================
UPDATE storage.buckets SET public = false WHERE id IN ('entry-photos', 'entry-docs');


-- ============================================
-- Deleting a staff member keeps their records
-- ============================================
-- customers, credit_entries and payments pointed at staff(id) with no ON DELETE
-- rule, so delete-staff with force=true always failed on the foreign key for
-- anyone who had ever recorded anything. The records stay; only the "who
-- created this" link is cleared, the same as follow_ups and reviewed_by.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE credit_entries DROP CONSTRAINT IF EXISTS credit_entries_created_by_fkey;
ALTER TABLE credit_entries ADD CONSTRAINT credit_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL;
