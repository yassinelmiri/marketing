-- Private personal notes for each authenticated workspace user.
create table if not exists public.user_notes (
  user_id bigint primary key references public.user_profiles(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_notes enable row level security;

drop policy if exists "user_notes_select_own" on public.user_notes;
create policy "user_notes_select_own"
on public.user_notes for select to authenticated
using (user_id = public.my_profile_id());

drop policy if exists "user_notes_insert_own" on public.user_notes;
create policy "user_notes_insert_own"
on public.user_notes for insert to authenticated
with check (user_id = public.my_profile_id());

drop policy if exists "user_notes_update_own" on public.user_notes;
create policy "user_notes_update_own"
on public.user_notes for update to authenticated
using (user_id = public.my_profile_id())
with check (user_id = public.my_profile_id());

grant select, insert, update on public.user_notes to authenticated;
