create table if not exists public.prospection_api_config (
  id boolean primary key default true check (id = true),
  base_url text not null default '',
  auth_type text not null default 'bearer' check (auth_type in ('none','bearer','api_key')),
  auth_header text not null default 'x-api-key',
  encrypted_secret text,
  updated_at timestamptz not null default now(),
  updated_by bigint
);

alter table public.prospection_api_config enable row level security;
revoke all on public.prospection_api_config from anon, authenticated;
