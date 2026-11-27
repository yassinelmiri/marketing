-- Champs complémentaires pour les données importées depuis des APIs hétérogènes.
alter table public.contacts
  add column if not exists age integer,
  add column if not exists pays text;

create index if not exists contacts_pays_idx on public.contacts (pays);
create index if not exists contacts_age_idx on public.contacts (age);

notify pgrst, 'reload schema';
