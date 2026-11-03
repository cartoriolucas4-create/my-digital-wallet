-- COZY PROSPECT operational history and persistent message assignment.
-- Additive only: never drops legacy or prospect data.
create table if not exists public.prospect_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  city text not null,
  state text,
  source text not null default 'openstreetmap',
  found_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists prospect_searches_user_created_idx on public.prospect_searches(user_id,created_at desc);

create table if not exists public.lead_message_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_id uuid not null references public.message_templates(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique(user_id,lead_id)
);
create index if not exists lead_message_assignments_template_idx on public.lead_message_assignments(user_id,template_id);

create table if not exists public.contact_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null check (event_type in ('message_prepared','whatsapp_opened','message_sent_confirmed','lead_skipped','status_changed','do_not_contact')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists contact_history_lead_idx on public.contact_history(user_id,lead_id,created_at desc);

alter table public.prospect_searches enable row level security;
alter table public.lead_message_assignments enable row level security;
alter table public.contact_history enable row level security;
drop policy if exists cozy_owner_all on public.prospect_searches;
create policy cozy_owner_all on public.prospect_searches for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists cozy_owner_all on public.lead_message_assignments;
create policy cozy_owner_all on public.lead_message_assignments for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists cozy_owner_all on public.contact_history;
create policy cozy_owner_all on public.contact_history for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select,insert,update,delete on public.prospect_searches, public.lead_message_assignments, public.contact_history to authenticated;

-- Keep all existing lead/message rows. Indexes make identity checks cheaper.
create index if not exists leads_user_name_city_idx on public.leads(user_id,lower(name),lower(coalesce(city,'')),lower(coalesce(state,'')));
