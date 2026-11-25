-- A contact list can belong to one campaign only.
-- Remove duplicate legacy associations, keeping the oldest row.
delete from public.campagne_listes newer
using public.campagne_listes older
where newer.liste_id = older.liste_id
  and newer.id > older.id;

create unique index if not exists campagne_listes_one_campaign_per_list_idx
  on public.campagne_listes (liste_id);
