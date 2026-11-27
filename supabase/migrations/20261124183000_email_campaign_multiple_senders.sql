-- Store the selected SMTP sender accounts for each campaign.
alter table public.email_campaigns
  add column if not exists smtp_account_ids jsonb not null default '[]'::jsonb;

update public.email_campaigns
set smtp_account_ids = jsonb_build_array(smtp_account_id)
where smtp_account_id is not null
  and (smtp_account_ids = '[]'::jsonb or smtp_account_ids is null);
