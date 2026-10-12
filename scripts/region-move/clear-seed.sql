-- Run ONLY on the new Mumbai project, after `supabase db push` and before
-- loading data. Migrations 001/007 seed a placeholder admin and default
-- settings; the real rows come from the Seoul data dump, so these must go or
-- the load fails on duplicate keys.
--
-- Safety: refuses to run if the database already holds real data.

DO $$
BEGIN
  IF (SELECT count(*) FROM customers) > 0 OR (SELECT count(*) FROM credit_entries) > 0 THEN
    RAISE EXCEPTION 'This database already has customers or bills. clear-seed.sql is only for the fresh Mumbai project.';
  END IF;
END $$;

TRUNCATE staff, app_settings, customers, credit_entries, credit_entry_items,
  credit_entry_attachments, payments, payment_allocations, payment_attachments,
  follow_ups, login_throttle
  RESTART IDENTITY CASCADE;
