-- Run once in the Supabase SQL editor. No service-role key is used in FretHub.
create table if not exists public.user_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":2,"favorites":{},"notes":{},"lessons":{},"progressions":{}}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.user_libraries alter column data set default '{"version":2,"favorites":{},"notes":{},"lessons":{},"progressions":{}}'::jsonb;
alter table public.user_libraries enable row level security;
revoke all on public.user_libraries from anon, authenticated;
grant select, insert, update on public.user_libraries to authenticated;

drop policy if exists "Users read their own library" on public.user_libraries;
create policy "Users read their own library" on public.user_libraries
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own library" on public.user_libraries;
create policy "Users create their own library" on public.user_libraries
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own library" on public.user_libraries;
create policy "Users update their own library" on public.user_libraries
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Optional proof of access to the current mailbox. Autoconfirmed auth.users
-- rows are NOT proof; only the server-side RPC can write these records.
create table if not exists public.user_email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_at timestamptz not null default now()
);
alter table public.user_email_verifications enable row level security;
revoke all on public.user_email_verifications from public, anon, authenticated;

-- Compare against the current Auth address on the server, so changing the
-- email immediately invalidates an old proof even if a JWT is stale.
create or replace function public.email_verification_status()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'verified', coalesce(v.email = u.email, false),
    'verified_at', case when v.email = u.email then v.verified_at else null end
  )
  from auth.users as u
  left join public.user_email_verifications as v on v.user_id = u.id
  where u.id = auth.uid()
$$;

-- PostgREST supplies auth.jwt() from a verified signed access token. Never
-- accept verification flags from user-editable metadata or from the client.
-- A fresh PKCE magic link or recovery link proves access to the mailbox,
-- not that the mailbox/account is exclusively controlled by one person.
create or replace function public.record_email_verification()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  current_email text;
begin
  if account_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select u.email into current_email from auth.users as u where u.id = account_id;
  if current_email is null or current_email is distinct from claims ->> 'email' then
    raise exception 'Current email could not be confirmed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(claims -> 'amr') = 'array'
        then claims -> 'amr' else '[]'::jsonb end
    ) as proof
    where proof ->> 'method' in ('magiclink', 'recovery')
      and case when (proof ->> 'timestamp') ~ '^[0-9]{1,12}$'
        then pg_catalog.to_timestamp((proof ->> 'timestamp')::double precision)
          between pg_catalog.now() - interval '15 minutes' and pg_catalog.now() + interval '1 minute'
        else false end
  ) then
    raise exception 'A recent email link is required' using errcode = '42501';
  end if;
  insert into public.user_email_verifications as v (user_id, email, verified_at)
    values (account_id, current_email, pg_catalog.now())
    on conflict (user_id) do update set email = excluded.email, verified_at = excluded.verified_at;
end;
$$;
revoke all on function public.email_verification_status() from public, anon, authenticated;
revoke all on function public.record_email_verification() from public, anon, authenticated;
grant execute on function public.email_verification_status() to authenticated;
grant execute on function public.record_email_verification() to authenticated;
