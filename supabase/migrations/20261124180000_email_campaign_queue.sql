-- Durable campaign queue: campaign creation is fast and delivery runs in cron batches.
begin;

alter table public.email_campaigns
  add column if not exists liste_ids jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_at timestamptz,
  add column if not exists next_batch_at timestamptz,
  add column if not exists recipient_offset integer not null default 0,
  add column if not exists worker_locked_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.email_campaigns
  drop constraint if exists email_campaigns_status_check;

alter table public.email_campaigns
  add constraint email_campaigns_status_check
  check (status in ('pending','scheduled','sending','paused','sent','partial','failed'));

create index if not exists email_campaigns_queue_idx
  on public.email_campaigns(status, next_batch_at, scheduled_at)
  where status in ('pending','scheduled','sending');

commit;
