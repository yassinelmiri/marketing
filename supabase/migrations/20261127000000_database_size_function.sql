-- Returns the current PostgreSQL database size in bytes.
-- Called only from the server using the Supabase service-role client.
create or replace function public.get_database_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.get_database_size_bytes() from public, anon, authenticated;
grant execute on function public.get_database_size_bytes() to service_role;
