-- Remove the team chat feature while preserving shared task notifications.
-- Chat-only data and storage are removed; the shared notifications table remains
-- because it is also used by task assignments and other modules.

begin;

-- Remove chat-only notification records without dropping the shared table.
delete from public.notifications
where type = 'chat_message';

-- Remove chat tables from Supabase Realtime before dropping them.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'team_chat_attachments'
    ) then
      alter publication supabase_realtime drop table public.team_chat_attachments;
    end if;

    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'team_chat_messages'
    ) then
      alter publication supabase_realtime drop table public.team_chat_messages;
    end if;
  end if;
end
$$;

-- Remove private chat files and their storage bucket.
delete from storage.objects
where bucket_id = 'team-chat-private';

delete from storage.buckets
where id = 'team-chat-private';

-- Drop attachments before messages because attachments reference messages.
drop table if exists public.team_chat_attachments;
drop table if exists public.team_chat_messages;

commit;
