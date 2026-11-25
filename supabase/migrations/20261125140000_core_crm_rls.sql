-- Protect core CRM campaign records with permission-aware RLS guards.
begin;

alter table public.campagnes enable row level security;
alter table public.commentaires enable row level security;
alter table public.campagne_listes enable row level security;
alter table public.type_campagnes enable row level security;

drop policy if exists campagnes_module_access on public.campagnes;
create policy campagnes_module_access on public.campagnes
  as permissive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));
drop policy if exists campagnes_module_guard on public.campagnes;
create policy campagnes_module_guard on public.campagnes
  as restrictive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));

drop policy if exists commentaires_module_access on public.commentaires;
create policy commentaires_module_access on public.commentaires
  as permissive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));
drop policy if exists commentaires_module_guard on public.commentaires;
create policy commentaires_module_guard on public.commentaires
  as restrictive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));

drop policy if exists campagne_listes_module_access on public.campagne_listes;
create policy campagne_listes_module_access on public.campagne_listes
  as permissive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));
drop policy if exists campagne_listes_module_guard on public.campagne_listes;
create policy campagne_listes_module_guard on public.campagne_listes
  as restrictive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));

drop policy if exists type_campagnes_module_access on public.type_campagnes;
create policy type_campagnes_module_access on public.type_campagnes
  as permissive for select to authenticated
  using (public.has_permission('campagne.read'));
drop policy if exists type_campagnes_module_guard on public.type_campagnes;
create policy type_campagnes_module_guard on public.type_campagnes
  as restrictive for all to authenticated
  using (public.has_permission('campagne.read'))
  with check (public.has_permission('campagne.read'));

commit;
