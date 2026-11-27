-- Fix the email templates API/UI column naming mismatch.
-- The original suite stored template body in "content"; the API uses "html_content".
begin;
alter table public.email_templates
  add column if not exists html_content text not null default '';
update public.email_templates
  set html_content = content
  where html_content = '' and content is not null;
commit;
