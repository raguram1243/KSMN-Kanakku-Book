-- Fix the day-book window: it was midnight-to-midnight UTC, not IST.
--
-- 021_day_book.sql built the window for p_day as
--
--   (p_day::TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
--
-- with AT TIME ZONE applied twice. The first application is the right one:
-- on a naive TIMESTAMP it reads the value as Indian wall-clock time and
-- returns the matching TIMESTAMPTZ (2026-10-11 00:00 IST = 2026-10-10 18:30
-- UTC). The second application goes the other way: on a TIMESTAMPTZ it
-- returns the naive wall-clock time in Asia/Kolkata, which is exactly the
-- naive value we started with. The two conversions cancel.
--
-- The result is then assigned to a TIMESTAMPTZ variable, so Postgres casts
-- that naive value using the session timezone, which is UTC on Supabase. The
-- window therefore became 00:00 UTC to 00:00 UTC, which is 05:30 IST to
-- 05:30 IST the next morning. Anything recorded between 00:00 and 05:30 IST
-- was counted in the PREVIOUS day's book, and the book for day D wrongly
-- included the first 5.5 hours of D+1. Evening IST activity was already on
-- the right day; the misfiled rows are the ones after midnight IST.
--
-- This replaces get_day_book_stats with a single conversion, so the window is
-- 00:00 IST to 00:00 IST the next day regardless of the session timezone.
--
-- What changes for the reader: figures for past days will shift. Entries
-- recorded between 00:00 and 05:30 IST that used to show in the previous
-- day's book now show on the day they actually happened. Totals across a long range are unchanged; only
-- the day boundaries move. Do not compare a day's figure from before this
-- migration with the same day after it.
--
-- Deliberate, unchanged: the day-book counts a payment on the day it was
-- RECORDED (payments.created_at), not on payments.payment_date, which the
-- admin can edit. The owner reconciles the cash drawer against this book, and
-- the drawer received the money on the day it was recorded. Credit entries
-- likewise use created_at. Do not "fix" this to payment_date.
--
-- Everything else about the function (signature, return shape, JSON keys,
-- aggregates, ordering) is exactly as in 021.

CREATE OR REPLACE FUNCTION get_day_book_stats(p_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start TIMESTAMPTZ := (p_day::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_end   TIMESTAMPTZ := ((p_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_credit_total NUMERIC := 0;
  v_credit_count INTEGER := 0;
  v_coll_total NUMERIC := 0;
  v_coll_count INTEGER := 0;
  v_by_method JSONB := '[]'::JSONB;
  v_by_staff JSONB := '[]'::JSONB;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_credit_total, v_credit_count
    FROM credit_entries
    WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_coll_total, v_coll_count
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_method
  FROM (
    SELECT COALESCE(payment_method, 'unknown') AS method,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE created_at >= v_start AND created_at < v_end
    GROUP BY 1
    ORDER BY total DESC
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_by_staff
  FROM (
    SELECT s.name AS staff_name,
           COUNT(*) AS entries,
           COALESCE(SUM(e.total_amount), 0) AS credit_given
    FROM credit_entries e
    LEFT JOIN staff s ON s.id = e.created_by
    WHERE e.created_at >= v_start AND e.created_at < v_end
    GROUP BY s.name
    ORDER BY credit_given DESC
  ) t;

  RETURN jsonb_build_object(
    'day', p_day,
    'credit_total', v_credit_total,
    'credit_count', v_credit_count,
    'collection_total', v_coll_total,
    'collection_count', v_coll_count,
    'net', v_credit_total - v_coll_total,
    'by_method', v_by_method,
    'by_staff', v_by_staff
  );
END;
$$;
