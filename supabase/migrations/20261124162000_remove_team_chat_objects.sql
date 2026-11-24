-- Remove only the dedicated Team Chat data and storage.
-- Shared notifications are preserved except for legacy chat_message rows.
begin;

delete from public.notifications
where type = 'chat_message';

drop table if exists public.team_chat_attachments cascade;
drop table if exists public.team_chat_messages cascade;

-- The bucket is dedicated to Team Chat; remove its objects before the bucket.
delete from storage.objects
where bucket_id = 'team-chat-private';

delete from storage.buckets
where id = 'team-chat-private';

commit;
