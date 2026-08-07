-- Add notes column to credit_entries table (if not exists)
ALTER TABLE credit_entries ADD COLUMN IF NOT EXISTS notes TEXT;
