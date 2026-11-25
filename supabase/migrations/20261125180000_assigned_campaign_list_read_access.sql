-- Allow assigned campaign members to read only the contact lists linked to their campaigns.
-- This is read-only access; list creation and modification still require listes.read.
begin;

drop policy if exists listes_module_access on public.listes;
create policy listes_module_access on public.listes
  as permissive for select to authenticated
  using (
    public.has_permission('listes.read')
    or exists (
      select 1
      from public.campagne_listes cl
      join public.campagne_membres cm on cm.campagne_id = cl.campagne_id
      join public.user_profiles p on p.id = cm.user_id
      where cl.liste_id = listes.id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists listes_module_write_access on public.listes;
create policy listes_module_write_access on public.listes
  as permissive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));

drop policy if exists listes_module_guard on public.listes;
create policy listes_module_guard on public.listes
  as restrictive for all to authenticated
  using (
    public.has_permission('listes.read')
    or exists (
      select 1
      from public.campagne_listes cl
      join public.campagne_membres cm on cm.campagne_id = cl.campagne_id
      join public.user_profiles p on p.id = cm.user_id
      where cl.liste_id = listes.id
        and p.auth_user_id = auth.uid()
    )
  )
  with check (public.has_permission('listes.read'));

commit;
