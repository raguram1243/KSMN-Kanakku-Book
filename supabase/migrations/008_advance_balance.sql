-- Advance balance feature: views to compute unallocated payment amounts per payment and per customer

-- Per-payment unallocated amount (amount not yet allocated to any credit entry)
CREATE OR REPLACE VIEW payment_unallocated AS
SELECT
  p.id AS payment_id,
  p.customer_id,
  p.amount,
  p.payment_date,
  p.amount - COALESCE(SUM(pa.allocated_amount), 0) AS unallocated_amount
FROM payments p
LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
GROUP BY p.id, p.customer_id, p.amount, p.payment_date;

-- Per-customer total advance balance (sum of all unallocated amounts > 0.01)
CREATE OR REPLACE VIEW customer_advance_balance AS
SELECT customer_id, SUM(unallocated_amount) AS advance_balance
FROM payment_unallocated
WHERE unallocated_amount > 0.01
GROUP BY customer_id;