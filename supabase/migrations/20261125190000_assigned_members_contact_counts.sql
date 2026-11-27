-- Let members assigned to campaigns read contacts only through lists linked to those campaigns.
-- Global listes.read permission keeps its existing full access.
begin;

create or replace function public.can_read_contact_list(target_list_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('listes.read')
    or exists (
      select 1
      from public.campagne_listes cl
      join public.campagne_membres cm on cm.campagne_id = cl.campagne_id
      join public.user_profiles p on p.id = cm.user_id
      where cl.liste_id = target_list_id
        and p.auth_user_id = auth.uid()
    );
$$;

create or replace function public.has_assigned_contact_list_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('listes.read')
    or exists (
      select 1
      from public.campagne_listes cl
      join public.campagne_membres cm on cm.campagne_id = cl.campagne_id
      join public.user_profiles p on p.id = cm.user_id
      where p.auth_user_id = auth.uid()
    );
$$;

grant execute on function public.can_read_contact_list(bigint) to authenticated;
grant execute on function public.has_assigned_contact_list_access() to authenticated;

drop policy if exists contacts_module_access on public.contacts;
create policy contacts_module_access on public.contacts
  as permissive for all to authenticated
  using (
    public.has_permission('listes.read')
    or exists (
      select 1 from public.liste_contacts lc
      where lc.contact_id = contacts.id
        and public.can_read_contact_list(lc.liste_id)
    )
  )
  with check (public.has_permission('listes.read'));

drop policy if exists contacts_module_guard on public.contacts;
create policy contacts_module_guard on public.contacts
  as restrictive for all to authenticated
  using (
    public.has_permission('listes.read')
    or exists (
      select 1 from public.liste_contacts lc
      where lc.contact_id = contacts.id
        and public.can_read_contact_list(lc.liste_id)
    )
  )
  with check (public.has_permission('listes.read'));

drop policy if exists liste_contacts_module_access on public.liste_contacts;
create policy liste_contacts_module_access on public.liste_contacts
  as permissive for all to authenticated
  using (public.can_read_contact_list(liste_id))
  with check (public.has_permission('listes.read'));

drop policy if exists liste_contacts_module_guard on public.liste_contacts;
create policy liste_contacts_module_guard on public.liste_contacts
  as restrictive for all to authenticated
  using (public.can_read_contact_list(liste_id))
  with check (public.has_permission('listes.read'));


-- Recreate the count RPC with valid PostgreSQL dollar quoting.
create or replace function public.get_contact_list_counts()
returns table(list_id bigint, contact_count bigint)
language sql
stable
security invoker
set search_path = public
as $function$
  select lc.liste_id, count(*)::bigint
  from public.liste_contacts lc
  group by lc.liste_id;
$function$;
grant execute on function public.get_contact_list_counts() to authenticated;

commit;
