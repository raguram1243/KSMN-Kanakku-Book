-- Detailed credit entries: stable item order + a readable description.
--
-- 1. credit_entry_items had no ordering column, so the rows came back in
--    whatever order Postgres happened to return them. Editing an entry
--    deletes and re-inserts every row, which is exactly when the order drifts.
-- 2. Detailed entries never had a description, so entry lists, the Entries
--    report, statement PDFs and WhatsApp reminders showed a blank where the
--    goods should be. The description is now a generated summary of the items,
--    written by create-entry / update-entry via _shared/entry-items.ts.

ALTER TABLE credit_entry_items
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill the summary for detailed entries that already have items but no
-- description. Must produce the same text as summarizeLineItems(): the first
-- three item names joined by ", ", then " +N more".
-- Existing rows all get sort_order 0 from the DEFAULT above, so the name is
-- the tie-breaker and the result is at least deterministic.
UPDATE credit_entries
SET description =
      (
        SELECT string_agg(top.item_name, ', ' ORDER BY top.sort_order, top.item_name)
        FROM (
          SELECT i.item_name, i.sort_order
          FROM credit_entry_items i
          WHERE i.credit_entry_id = credit_entries.id
          ORDER BY i.sort_order, i.item_name
          LIMIT 3
        ) top
      )
      || CASE
           WHEN (SELECT count(*) FROM credit_entry_items i WHERE i.credit_entry_id = credit_entries.id) > 3
             THEN ' +'
                  || ((SELECT count(*) FROM credit_entry_items i WHERE i.credit_entry_id = credit_entries.id) - 3)
                  || ' more'
           ELSE ''
         END
WHERE credit_entries.entry_mode = 'detailed'
  AND (credit_entries.description IS NULL OR btrim(credit_entries.description) = '')
  AND EXISTS (SELECT 1 FROM credit_entry_items i WHERE i.credit_entry_id = credit_entries.id);
