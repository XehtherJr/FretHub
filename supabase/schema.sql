-- Run once in the Supabase SQL editor. No service-role key is used in FretHub.
create table if not exists public.user_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"favorites":{},"notes":{},"lessons":{}}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

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
