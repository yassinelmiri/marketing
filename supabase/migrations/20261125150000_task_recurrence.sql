-- Recurring task settings. The next occurrence is generated when the current task is completed.
begin;
alter table public.tasks
  add column if not exists recurrence_frequency text not null default 'none',
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_until date,
  add column if not exists recurrence_series_id bigint references public.tasks(id) on delete cascade;

alter table public.tasks drop constraint if exists tasks_recurrence_frequency_check;
alter table public.tasks add constraint tasks_recurrence_frequency_check
  check (recurrence_frequency in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
alter table public.tasks drop constraint if exists tasks_recurrence_interval_check;
alter table public.tasks add constraint tasks_recurrence_interval_check
  check (recurrence_interval between 1 and 365);

create unique index if not exists tasks_recurring_series_due_date_uidx
  on public.tasks ((coalesce(recurrence_series_id, id)), due_date)
  where recurrence_frequency <> 'none' and due_date is not null;
create index if not exists tasks_due_date_status_idx on public.tasks(due_date, status);
commit;
