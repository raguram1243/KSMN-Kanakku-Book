-- Progressive delay for PIN login (brute-force hardening).
--
-- verify-pin had no rate limit, so a short PIN on a guessable name (the seeded
-- account is called "Admin") could be brute-forced in minutes, and a success
-- returns a 24-hour admin token. Edge function isolates are short-lived and
-- reset constantly, so an in-memory counter is useless; the count has to live
-- in the database.
--
-- This table holds, per login name (lower-cased and trimmed by the caller),
-- the number of consecutive failed attempts and the time of the last one.
-- verify-pin waits longer before answering as the count grows (doubling, capped
-- at 8 seconds). It is a DELAY ONLY: nothing here ever blocks a login, there is
-- no maximum number of attempts, and a counter older than 1 hour is ignored.
-- Names that do not exist are tracked the same way so the delay does not reveal
-- which names are real.
--
-- bump_login_throttle() does the read-and-increment in one atomic statement,
-- so a burst of parallel guesses each sees a different count instead of all
-- reading the same zero. An attempt is counted when it starts; a correct PIN
-- deletes the row again.
--
-- Same lockdown as 025: RLS on with no policy, nothing for anon/authenticated.
-- Only the service-role edge function touches this.

CREATE TABLE IF NOT EXISTS login_throttle (
  name_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE login_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_throttle FROM anon, authenticated;
GRANT ALL ON public.login_throttle TO service_role;

-- Registers an attempt for p_key and returns the number of consecutive
-- failures BEFORE this one (0 for a fresh or expired counter).
CREATE OR REPLACE FUNCTION bump_login_throttle(p_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  prev INTEGER;
BEGIN
  INSERT INTO login_throttle AS t (name_key, failures, last_failure_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (name_key) DO UPDATE SET
    failures = CASE
      WHEN t.last_failure_at < now() - INTERVAL '1 hour' THEN 1
      ELSE t.failures + 1
    END,
    last_failure_at = now()
  RETURNING failures - 1 INTO prev;

  RETURN prev;
END;
$$;

REVOKE EXECUTE ON FUNCTION bump_login_throttle(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_login_throttle(TEXT) TO service_role;
