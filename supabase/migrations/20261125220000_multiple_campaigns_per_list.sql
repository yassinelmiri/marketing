-- A list can be associated with multiple campaigns.
drop index if exists public.campagne_listes_one_campaign_per_list_idx;

-- Prevent duplicate links for the same campaign/list pair.
create unique index if not exists campagne_listes_campaign_list_unique_idx
  on public.campagne_listes (campagne_id, liste_id);
