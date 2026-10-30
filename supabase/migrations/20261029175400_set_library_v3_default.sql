-- Align new default rows with the v3 format used by the current client.
-- This changes no existing rows, policies, or explicitly supplied data.
alter table public.user_libraries alter column data set default
  '{"version":3,"favorites":{},"notes":{},"lessons":{},"progressions":{}}'::jsonb;
