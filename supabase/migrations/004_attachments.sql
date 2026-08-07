-- ============================================
-- Attachment tables for credit entries and payments
-- ============================================

CREATE TABLE IF NOT EXISTS credit_entry_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_entry_id UUID NOT NULL REFERENCES credit_entries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image' or 'pdf'
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image' or 'pdf'
  uploaded_at TIMESTAMPTZ DEFAULT now()
);