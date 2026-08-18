-- ============================================
-- Payment idempotency + atomic RPC
-- ============================================

-- Column for idempotency key (NULL-safe so existing payments still work)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Partial unique index: prevents duplicate idempotency keys while allowing NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================
-- record_payment(...) atomic RPC
-- Creates payment + allocations + attachments in one transaction.
-- Handles idempotency: if idempotency_key already exists, returns existing payment.
-- ============================================

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
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT to_jsonb(p.*) INTO v_existing
    FROM payments p
    WHERE p.idempotency_key = p_idempotency_key;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('payment', v_existing, 'duplicate', true);
    END IF;
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
