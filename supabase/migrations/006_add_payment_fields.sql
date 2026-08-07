-- Add payment method and receipt number to payments table
-- These fields are required for the Payment History feature

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'card', 'others'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;