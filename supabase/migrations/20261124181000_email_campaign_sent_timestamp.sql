-- Queue timestamps must distinguish campaign creation from actual delivery.
alter table public.email_campaigns
  alter column sent_at drop not null,
  alter column sent_at drop default;
