-- Remove recursive, expensive RLS lookups from contact reads for assigned campaign members.
begin;

create index if not exists liste_contacts_contact_list_idx
  on public.liste_contacts(contact_id, liste_id);
create index if not exists campagne_listes_list_campaign_idx
  on public.campagne_listes(liste_id, campagne_id);
create index if not exists campagne_membres_user_campaign_idx
  on public.campagne_membres(user_id, campagne_id);
create index if not exists user_profiles_auth_user_id_idx
  on public.user_profiles(auth_user_id);

create or replace function public.can_read_contact_id(target_contact_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $function$
  select public.has_permission('listes.read')
    or exists (
      select 1
      from public.liste_contacts lc
      join public.campagne_listes cl on cl.liste_id = lc.liste_id
      join public.campagne_membres cm on cm.campagne_id = cl.campagne_id
      join public.user_profiles p on p.id = cm.user_id
      where lc.contact_id = target_contact_id
        and p.auth_user_id = auth.uid()
    );
$function$;

grant execute on function public.can_read_contact_id(bigint) to authenticated;

drop policy if exists contacts_module_access on public.contacts;
create policy contacts_module_access on public.contacts
  as permissive for all to authenticated
  using (public.can_read_contact_id(id))
  with check (public.has_permission('listes.read'));

drop policy if exists contacts_module_guard on public.contacts;
create policy contacts_module_guard on public.contacts
  as restrictive for all to authenticated
  using (public.can_read_contact_id(id))
  with check (public.has_permission('listes.read'));

-- Counts are calculated in a trusted function, restricted to lists the current user can read.
create or replace function public.get_contact_list_counts()
returns table(list_id bigint, contact_count bigint)
language sql
stable
security definer
set search_path = public
set row_security = off
as $function$
  select lc.liste_id, count(*)::bigint
  from public.liste_contacts lc
  where public.can_read_contact_list(lc.liste_id)
  group by lc.liste_id;
$function$;

create or replace function public.get_visible_contact_total()
returns bigint
language sql
stable
security definer
set search_path = public
set row_security = off
as $function$
  select case
    when public.has_permission('listes.read') then
      (select count(*)::bigint from public.contacts)
    else
      (select count(distinct lc.contact_id)::bigint
       from public.liste_contacts lc
       where public.can_read_contact_list(lc.liste_id))
  end;
$function$;

grant execute on function public.get_contact_list_counts() to authenticated;
grant execute on function public.get_visible_contact_total() to authenticated;

commit;
