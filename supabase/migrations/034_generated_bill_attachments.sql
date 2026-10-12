-- Mark which attachment of a credit entry is the picture/PDF of the bill itself.
--
-- WHY: the "Print Bill" feature renders the saved bill in the browser and
-- uploads it as an attachment of that entry. That file must be told apart from
-- the photos and files people attach by hand, because printing again (or after
-- an admin edit) REPLACES the old generated bill and must never touch the
-- hand-added ones. So each attachment now has a kind:
--
--   'upload'          - added by a person (camera / file picker). The default,
--                       so every existing row becomes 'upload'.
--   'generated_bill'  - the rendered bill. At most ONE per entry, enforced by a
--                       partial unique index, so two prints racing each other
--                       can never leave an entry with two generated bills.
--
-- The 032 lockdown stays as it is: this adds a column to an existing table, it
-- grants nothing to anon/authenticated. Safe to run again.

ALTER TABLE credit_entry_attachments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'upload';

ALTER TABLE credit_entry_attachments
  DROP CONSTRAINT IF EXISTS credit_entry_attachments_kind_check;
ALTER TABLE credit_entry_attachments
  ADD CONSTRAINT credit_entry_attachments_kind_check
  CHECK (kind IN ('upload', 'generated_bill'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_entry_attachments_generated_bill
  ON credit_entry_attachments(credit_entry_id)
  WHERE kind = 'generated_bill';
