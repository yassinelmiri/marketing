alter table public.email_campaigns
  add column if not exists created_by_name text;

comment on column public.email_campaigns.created_by_name is
  'Display name (snapshot) of the user who created/launched the campaign.';
