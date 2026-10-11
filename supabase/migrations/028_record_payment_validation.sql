-- Validate payment allocations inside record_payment().
--
-- 012_payment_idempotency.sql made payment creation atomic, but it trusts
-- p_allocations completely: it loops the array and inserts every element
-- verbatim. Nothing in the database checked that
--
--   * the payment amount is positive,
--   * each allocated_amount is positive,
--   * the allocations add up to no more than the payment,
--   * each credit_entry_id exists and belongs to the customer being paid for,
--   * each allocated_amount fits inside that bill's remaining balance,
--   * the same bill is not listed twice in one call.
--
-- Why it matters: payment_allocations has an AFTER trigger
-- (update_entry_paid_amount) that recomputes credit_entries.paid_amount from
-- the allocation rows, and balance/status are generated from it. A bad
-- allocation therefore does not just store a wrong row - it silently rewrites
-- a bill's outstanding balance. A negative amount, an over-allocation, or an
-- allocation pointed at another customer's bill would mark that bill paid and
-- make the shop's outstanding total wrong, with nothing in the UI to show why.
-- A bill listed twice in one call is worse than wrong data: the second INSERT
-- trips UNIQUE(payment_id, credit_entry_id) and lands in the existing
-- unique_violation handler, which was written for idempotency-key races and
-- would hand the caller back whatever payment that key finds.
--
-- The browser already performs all of these checks, so normal use was never
-- affected. This is the server-side backstop for anything that reaches the
-- RPC another way (the edge function, psql, a future caller, a replayed or
-- hand-edited request body).
--
-- Deliberately still allowed: under-allocation. Paying more than the listed
-- bills come to is how advance credit is created (see 008_advance_balance.sql
-- and the payment_unallocated view) - the remainder is the point. Only
-- allocations that EXCEED the payment are rejected.
--
-- Validation runs after the idempotency early-return, not before it: a retry
-- of an already-recorded payment must keep returning the stored payment, and
-- re-validating it would fail because the first call already consumed the
-- balances it refers to.
--
-- This migration only replaces a function. It writes to no table and changes
-- no existing row.

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
  p_attachments JSONB DEFAULT '[]'::jsonb
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

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0 (received %)',
      COALESCE(p_amount::TEXT, 'no amount');
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
    customer_id, amount, payment_date, payment_method, receipt_number, notes, created_by, idempotency_key
  ) VALUES (
    p_customer_id, p_amount, p_payment_date, p_payment_method, p_receipt_number, p_notes, p_created_by, p_idempotency_key
  )
  RETURNING * INTO v_payment;

  -- Insert allocations (if any)
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    INSERT INTO payment_allocations (payment_id, credit_entry_id, allocated_amount)
    VALUES (
      v_payment.id,
      (v_alloc->>'credit_entry_id')::UUID,
      (v_alloc->>'allocated_amount')::NUMERIC
    );
  END LOOP;

  -- Insert attachments (if any)
  FOR v_attach IN SELECT * FROM jsonb_array_elements(p_attachments)
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
