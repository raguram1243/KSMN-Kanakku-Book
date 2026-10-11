-- Close public access to objects created after the 002 lockdown.
--
-- 002_lockdown_rls.sql revoked anon/authenticated on everything that existed
-- then, but objects added later kept Postgres' default grants. Verified
-- against the live database: the anon key that ships inside the web bundle
-- could read customer_advance_balance and payment_unallocated through
-- PostgREST, returning real customer ids, payment amounts and advance
-- balances to anyone who opened the site. The two attachment tables and
-- follow_ups answered but returned no rows, because RLS is enabled on them —
-- the grants were still wrong, and only RLS was standing in the way.
--
-- Views are the dangerous case: a view runs with its owner's rights, so RLS
-- on the underlying tables does not protect it. Revoking is the fix.
--
-- Nothing in the app depends on this access. The frontend never creates a
-- Supabase client and never calls /rest/v1 (verified by grep over src/); it
-- only calls edge functions, which use the service role key and are not
-- affected by these grants.

REVOKE ALL ON public.customer_advance_balance FROM anon, authenticated;
REVOKE ALL ON public.payment_unallocated FROM anon, authenticated;
REVOKE ALL ON public.credit_entry_attachments FROM anon, authenticated;
REVOKE ALL ON public.payment_attachments FROM anon, authenticated;
REVOKE ALL ON public.follow_ups FROM anon, authenticated;

-- 009 granted EXECUTE on the cascade delete to anon and authenticated. It is
-- SECURITY INVOKER so it would fail anyway, but the grant should not exist.
REVOKE EXECUTE ON FUNCTION delete_customer_cascade(UUID) FROM anon, authenticated;
