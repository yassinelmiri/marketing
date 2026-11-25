-- Allow members to read campaigns assigned to them, even without the global campagne.read permission.
-- Assigned members can also read the list links so they can use the linked contact lists in Email marketing.
begin;

drop policy if exists campagnes_module_access on public.campagnes;
create policy campagnes_module_access on public.campagnes
  as permissive for select to authenticated
  using (
    public.has_permission('campagne.read')
    or exists (
      select 1 from public.campagne_membres cm
      join public.user_profiles p on p.id = cm.user_id
      where cm.campagne_id = campagnes.id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists campagnes_module_guard on public.campagnes;
create policy campagnes_module_guard on public.campagnes
  as restrictive for all to authenticated
  using (
    public.has_permission('campagne.read')
    or exists (
      select 1 from public.campagne_membres cm
      join public.user_profiles p on p.id = cm.user_id
      where cm.campagne_id = campagnes.id and p.auth_user_id = auth.uid()
    )
  )
  with check (public.has_permission('campagne.read'));

drop policy if exists campagne_listes_module_access on public.campagne_listes;
create policy campagne_listes_module_access on public.campagne_listes
  as permissive for select to authenticated
  using (
    public.has_permission('campagne.read')
    or exists (
      select 1 from public.campagne_membres cm
      join public.user_profiles p on p.id = cm.user_id
      where cm.campagne_id = campagne_listes.campagne_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists campagne_listes_module_guard on public.campagne_listes;
create policy campagne_listes_module_guard on public.campagne_listes
  as restrictive for all to authenticated
  using (
    public.has_permission('campagne.read')
    or exists (
      select 1 from public.campagne_membres cm
      join public.user_profiles p on p.id = cm.user_id
      where cm.campagne_id = campagne_listes.campagne_id and p.auth_user_id = auth.uid()
    )
  )
  with check (public.has_permission('campagne.read'));

commit;
