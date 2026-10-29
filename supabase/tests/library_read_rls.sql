-- Run against a Supabase database that has at least one library row.
-- Read-only: impersonates an existing owner and a random non-owner only for
-- this transaction, and emits no user IDs or library contents.
begin read only;
do $test$
declare
  owner_id uuid;
  owner_rows bigint;
  stranger_rows bigint;
begin
  select user_id into owner_id from public.user_libraries limit 1;
  if owner_id is null then raise exception 'A library row is needed for this read-policy test'; end if;
  if pg_catalog.has_table_privilege('anon', 'public.user_libraries', 'select') then
    raise exception 'Anonymous role unexpectedly has SELECT permission';
  end if;
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', owner_id::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into owner_rows from public.user_libraries;
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', pg_catalog.gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  select count(*) into stranger_rows from public.user_libraries;
  execute 'reset role';
  if owner_rows <> 1 or stranger_rows <> 0 then
    raise exception 'Library read policy failed: owner %, stranger %', owner_rows, stranger_rows;
  end if;
end;
$test$;
rollback;
