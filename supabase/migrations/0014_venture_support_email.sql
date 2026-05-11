-- 0014_venture_support_email.sql
-- Add inbound support email address per venture.
-- Used by the Resend inbound webhook to route emails to the correct venture.

alter table ventures add column if not exists support_email text unique;

comment on column ventures.support_email is
  'Inbound email address (e.g. support@kounta.mail.solodesk.ai). '
  'Set in venture settings; used by Resend inbound webhook to route '
  'incoming support emails to the correct venture.';
