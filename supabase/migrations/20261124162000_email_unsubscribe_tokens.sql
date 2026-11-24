create table if not exists public.email_unsubscribe_tokens (
 token uuid primary key default gen_random_uuid(),
 email text not null,
 campaign_id bigint references public.email_campaigns(id) on delete cascade,
 created_at timestamptz not null default now(),
 used_at timestamptz,
 unique(email,campaign_id)
);
alter table public.email_unsubscribe_tokens enable row level security;
drop policy if exists "email_unsubscribe_tokens_no_direct_access" on public.email_unsubscribe_tokens;
create policy "email_unsubscribe_tokens_no_direct_access" on public.email_unsubscribe_tokens for all to authenticated using(false) with check(false);
