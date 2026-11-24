-- Remove only the dedicated Team Chat data and storage.
-- Shared notifications are preserved except for legacy chat_message rows.
begin;

delete from public.notifications
where type = 'chat_message';

drop table if exists public.team_chat_attachments cascade;
drop table if exists public.team_chat_messages cascade;
drop table if exists public.team_chat_messages cascade;

-- Remove the dedicated table from Supabase Realtime when it is published.
do $
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat_messages') then
    alter publication supabase_realtime drop table public.team_chat_messages;
  end if;
end $;

-- The bucket is dedicated to Team Chat; remove its objects before the bucket.
delete from storage.objects
where bucket_id = 'team-chat-private';

delete from storage.buckets
where id = 'team-chat-private';

commit;
