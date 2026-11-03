-- Add activation state to message templates without replacing existing templates.
alter table public.message_templates
  add column if not exists is_active boolean not null default true;
create index if not exists message_templates_active_idx
  on public.message_templates(user_id,is_active,created_at);
