-- Recurring RLS check, supporting function. Protocol Section 4's closing line asks for the
-- two-account test to become "a recurring scheduled check, per Part 0's any-recurring-check-must-
-- fail-gracefully rule, not a one-time sweep". Task 06 ran it once and passed; this is the
-- repeatable version's discovery half.
--
-- WHY THIS EXISTS AT ALL. Section 4 point 4 says to repeat the check for "every other table added
-- since the last time anyone looked, not just the tables that existed when RLS was last
-- discussed". A hardcoded table list cannot do that, it goes stale the moment someone adds a
-- table, which is exactly the failure the instruction is written against. Dynamic discovery via
-- PostgREST's own OpenAPI root was tried first and returns 401 to the anon key, which is good
-- posture (that introspection surface is one protocol Section 3 names as an abuse vector) but
-- means discovery has to come from the database side instead.
--
-- IT ALSO RETURNS TRUE ROW COUNTS, and that is not incidental. Task 06's sweep found 0 rows from
-- anon on all 13 sensitive tables, but that result only MEANS anything for the 4 that actually
-- held data; the other 9 were empty, so 0 rows proved nothing about them. C3L-06 records that
-- caveat explicitly. Without the real count the recurring check would report the same vacuous
-- pass forever, including for `collection_waitlist` and `card_price_alerts`, the two the task
-- singles out. With it, the check can say "meaningful" or "vacuous" per table and start genuinely
-- testing those two the moment they gain a single row.
--
-- SECURITY. SECURITY DEFINER, so it can read pg_class and information_schema regardless of the
-- caller's own grants, which means access has to be closed deliberately rather than by default.
-- EXECUTE is revoked from PUBLIC *and* from anon and authenticated by name: revoking only from
-- PUBLIC leaves a role-level grant in place and the function stays reachable, which is a trap
-- this project has hit before. Only service_role can call it, and the recurring check runs with
-- the service key. It returns table names and row counts, never any row contents.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.rls_audit_targets();
-- Nothing depends on it except the recurring check script, which fails loudly if it is missing.

CREATE OR REPLACE FUNCTION public.rls_audit_targets()
 RETURNS TABLE(table_name text, rls_enabled boolean, policy_count bigint, row_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r      RECORD;
  v_cnt  BIGINT;
BEGIN
  FOR r IN
    -- A table is in scope if it carries any column that could hold user-identifying data.
    -- Column-shape based, not a name list, so a new table is picked up automatically.
    SELECT DISTINCT t.tablename AS tname, t.rowsecurity AS rls
    FROM pg_tables t
    JOIN information_schema.columns c
      ON c.table_name = t.tablename AND c.table_schema = 'public'
    WHERE t.schemaname = 'public'
      AND (c.column_name ILIKE '%email%'
        OR c.column_name ILIKE '%user_id%'
        OR c.column_name ILIKE '%token%'
        OR c.column_name ILIKE '%password%'
        OR c.column_name ILIKE '%stripe%'
        OR c.column_name ILIKE '%ip_address%')
    ORDER BY t.tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tname) INTO v_cnt;
    table_name   := r.tname;
    rls_enabled  := r.rls;
    policy_count := (SELECT count(*) FROM pg_policies p
                     WHERE p.schemaname = 'public' AND p.tablename = r.tname);
    row_count    := v_cnt;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- Fail closed. Both revokes are required, not one or the other.
REVOKE ALL ON FUNCTION public.rls_audit_targets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_audit_targets() FROM anon;
REVOKE ALL ON FUNCTION public.rls_audit_targets() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rls_audit_targets() TO service_role;
