-- ============================================
-- Customer cascade delete (transactional)
-- ============================================
-- Deletes a customer together with every piece of data linked to them,
-- wrapped in a single transaction so it either fully succeeds or fully
-- rolls back (no partial deletes if something fails midway).
--
-- Foreign-key-safe ordering:
--   attachments -> allocations -> line items -> payments -> credit_entries
--   -> customers
--
-- Storage files (entry-photos / entry-docs) referenced by the attachments
-- are NOT removed here — the delete-customer edge function fetches the
-- file URLs and removes the storage objects itself after this RPC succeeds.

CREATE OR REPLACE FUNCTION delete_customer_cascade(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Attachment metadata rows (attached to this customer's entries/payments)
  DELETE FROM credit_entry_attachments
  WHERE credit_entry_id IN (
    SELECT id FROM credit_entries WHERE customer_id = p_customer_id
  );

  DELETE FROM payment_attachments
  WHERE payment_id IN (
    SELECT id FROM payments WHERE customer_id = p_customer_id
  );

  -- 2. Payment allocations referencing this customer's payments OR entries
  DELETE FROM payment_allocations
  WHERE payment_id IN (SELECT id FROM payments WHERE customer_id = p_customer_id)
     OR credit_entry_id IN (SELECT id FROM credit_entries WHERE customer_id = p_customer_id);

  -- 3. Line items of this customer's credit entries
  DELETE FROM credit_entry_items
  WHERE credit_entry_id IN (SELECT id FROM credit_entries WHERE customer_id = p_customer_id);

  -- 4. Top-level transactional records
  DELETE FROM payments        WHERE customer_id = p_customer_id;
  DELETE FROM credit_entries  WHERE customer_id = p_customer_id;

  -- 5. The customer itself
  DELETE FROM customers WHERE id = p_customer_id;

  -- If the customer did not exist the final DELETE matches 0 rows.
  -- Raising an exception rolls the whole transaction back.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found (id: %)', p_customer_id
    USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Ensure the function is executable by the service-role caller.
GRANT EXECUTE ON FUNCTION delete_customer_cascade(uuid) TO service_role, anon, authenticated;