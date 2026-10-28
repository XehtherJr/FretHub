-- Run against a test/staging Supabase database after schema.sql. All fixture
-- writes and simulated request claims are rolled back; no email is sent.
begin;
do $test$
declare
  test_id uuid := pg_catalog.gen_random_uuid();
  test_email text := test_id::text || '@example.invalid';
  claims jsonb := pg_catalog.jsonb_build_object('sub', test_id::text, 'email', test_email, 'role', 'authenticated');
  rejection boolean;
begin
  insert into auth.users (id, email) values (test_id, test_email);
  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))))::text, true);
  if public.email_verification_status() ->> 'verified' <> 'false' then raise exception 'New account must not be verified'; end if;
  rejection := false;
  begin perform public.record_email_verification(); exception when insufficient_privilege then rejection := true; end;
  if not rejection then raise exception 'Password authentication unexpectedly verified email'; end if;

  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'magiclink', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint))))::text, true);
  rejection := false;
  begin perform public.record_email_verification(); exception when insufficient_privilege then rejection := true; end;
  if not rejection then raise exception 'Stale email proof unexpectedly accepted'; end if;

  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('email', 'different@example.invalid', 'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'magiclink', 'timestamp', extract(epoch from now())::bigint))))::text, true);
  rejection := false;
  begin perform public.record_email_verification(); exception when insufficient_privilege then rejection := true; end;
  if not rejection then raise exception 'Mismatched email unexpectedly accepted'; end if;

  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'magiclink', 'timestamp', 'not-a-timestamp'))))::text, true);
  rejection := false;
  begin perform public.record_email_verification(); exception when insufficient_privilege then rejection := true; end;
  if not rejection then raise exception 'Malformed proof unexpectedly accepted'; end if;

  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'magiclink', 'timestamp', extract(epoch from now())::bigint))))::text, true);
  perform public.record_email_verification();
  if public.email_verification_status() ->> 'verified' <> 'true' then raise exception 'Fresh email proof was not recorded'; end if;
  update auth.users set email = test_id::text || '+changed@example.invalid' where id = test_id;
  if public.email_verification_status() ->> 'verified' <> 'false' then raise exception 'Changed email retained old proof'; end if;
  claims := claims || pg_catalog.jsonb_build_object('email', test_id::text || '+changed@example.invalid');
  perform pg_catalog.set_config('request.jwt.claims', (claims || pg_catalog.jsonb_build_object('amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'recovery', 'timestamp', extract(epoch from now())::bigint))))::text, true);
  perform public.record_email_verification();
  if public.email_verification_status() ->> 'verified' <> 'true' then raise exception 'Fresh recovery proof was not recorded'; end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.user_email_verifications', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_email_verifications', 'select')
    or pg_catalog.has_function_privilege('anon', 'public.record_email_verification()', 'execute') then
    raise exception 'Proof records or RPC have unsafe grants';
  end if;
end;
$test$;
rollback;
