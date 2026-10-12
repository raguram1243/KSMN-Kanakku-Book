-- Lock the public schema down for good: nothing for anon/authenticated,
-- everything for service_role, and the same for whatever is created later.
--
-- WHY: the app never talks to Postgres from the browser - every request goes
-- through an edge function that uses the service-role key. But the anon key
-- ships inside the web bundle, and Supabase/Postgres hand new objects default
-- grants. 002 and 025 revoked access object by object, and 025 exists because
-- objects created after 002 had silently become readable through the anon key
-- (customer_advance_balance and payment_unallocated returned real amounts).
-- Doing it object by object will keep missing things, so this migration does
-- it for the whole schema:
--
--   1. RLS ON for every table in public, with no policies. anon/authenticated
--      get no rows even if a grant slips back in; service_role has BYPASSRLS
--      and the table owner (postgres) is not subject to RLS, so the edge
--      functions and SQL functions are unaffected. (follow_ups keeps its
--      "USING (false)" policy from 019; it means the same thing.)
--   2. REVOKE every table/view/sequence privilege from anon, authenticated.
--      Views run with their owner's rights, so for views the REVOKE is the
--      real protection, not RLS.
--   3. REVOKE EXECUTE on every function from PUBLIC, anon, authenticated, and
--      GRANT it to service_role. Postgres grants EXECUTE to PUBLIC by default,
--      and anon inherits PUBLIC, so revoking from anon alone is not enough.
--      If pg_trgm (013) was installed into public its functions are covered
--      too; service_role keeps them through the blanket GRANT.
--   4. Default privileges for objects postgres creates later: nothing for
--      anon/authenticated in public, no EXECUTE for PUBLIC, and service_role
--      gets what it needs. (The PUBLIC/EXECUTE default can only be removed
--      globally, not per schema, so that line has no IN SCHEMA; the matching
--      global GRANT keeps service_role able to call functions postgres creates
--      anywhere, e.g. a future extension.)
--
-- Runs after 031 so the functions created there are covered. Writes no row.

-- 1. RLS on every table in public (catches tables added since 002 too).
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END;
$$;

-- 2. Tables, views, sequences.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3. Functions.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 4. Future objects created by postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO service_role;
