-- Mailbox (UPN of gedeelde mailbox) waarvan de Microsoft 365-agenda in het
-- directie-werkblad wordt getoond/beheerd (edge graph-agenda, app-only Graph).
alter table public.organizations
  add column if not exists agenda_mailbox text;
