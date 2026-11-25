-- Restrict shared CRM contact data to authenticated users with the contacts module permission.
-- Restrictive guards also constrain any older permissive policies left by previous migrations.
begin;

alter table public.contacts enable row level security;
alter table public.listes enable row level security;
alter table public.liste_contacts enable row level security;

drop policy if exists contacts_module_access on public.contacts;
create policy contacts_module_access on public.contacts
  as permissive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));
drop policy if exists contacts_module_guard on public.contacts;
create policy contacts_module_guard on public.contacts
  as restrictive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));

drop policy if exists listes_module_access on public.listes;
create policy listes_module_access on public.listes
  as permissive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));
drop policy if exists listes_module_guard on public.listes;
create policy listes_module_guard on public.listes
  as restrictive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));

drop policy if exists liste_contacts_module_access on public.liste_contacts;
create policy liste_contacts_module_access on public.liste_contacts
  as permissive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));
drop policy if exists liste_contacts_module_guard on public.liste_contacts;
create policy liste_contacts_module_guard on public.liste_contacts
  as restrictive for all to authenticated
  using (public.has_permission('listes.read'))
  with check (public.has_permission('listes.read'));

create index if not exists contacts_date_creation_id_idx on public.contacts(date_creation desc, id desc);
create index if not exists contacts_email_lower_idx on public.contacts(lower(email));
create index if not exists liste_contacts_liste_contact_idx on public.liste_contacts(liste_id, contact_id);

commit;
