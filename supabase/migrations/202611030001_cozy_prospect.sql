-- COZY PROSPECT: additive schema. Legacy wallet tables and storage remain untouched.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  phone text,
  normalized_phone text,
  address text,
  city text,
  state text,
  website text,
  instagram text,
  contact_name text,
  source text not null default 'manual' check (source in ('manual','openstreetmap','import')),
  source_id text,
  source_url text,
  status text not null default 'found' check (status in ('found','analyzed','authorized','contacted','interested','demo','subscriber','not_interested','invalid','do_not_contact')),
  consent_status text not null default 'unknown' check (consent_status in ('unknown','authorized','denied')),
  notes text,
  tags text[] not null default '{}',
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_user_status_idx on public.leads(user_id,status,created_at desc);
create index if not exists leads_user_city_idx on public.leads(user_id,city);
create unique index if not exists leads_source_identity_uq on public.leads(user_id,source,source_id) where source_id is not null;
create unique index if not exists leads_phone_identity_uq on public.leads(user_id,normalized_phone) where normalized_phone is not null;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events(user_id,lead_id,created_at desc);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  content text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  is_first_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_user_idx on public.message_templates(user_id,created_at desc);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists media_assets_user_idx on public.media_assets(user_id,created_at desc);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_user_idx on public.campaigns(user_id,created_at desc);

create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_order integer not null,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  template_id uuid references public.message_templates(id) on delete set null,
  content_override text,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(campaign_id,step_order)
);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','opened','sent','replied','failed')),
  created_at timestamptz not null default now()
);
create index if not exists lead_messages_lead_idx on public.lead_messages(user_id,lead_id,created_at desc);

create or replace function public.cozy_set_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads for each row execute function public.cozy_set_updated_at();
drop trigger if exists message_templates_updated_at on public.message_templates;
create trigger message_templates_updated_at before update on public.message_templates for each row execute function public.cozy_set_updated_at();
drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at before update on public.campaigns for each row execute function public.cozy_set_updated_at();

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.message_templates enable row level security;
alter table public.media_assets enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.lead_messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['leads','lead_events','message_templates','media_assets','campaigns','campaign_steps','lead_messages'] loop
    execute format('drop policy if exists cozy_owner_all on public.%I',t);
    execute format('create policy cozy_owner_all on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.insert_prospect_leads(p_leads jsonb)
returns table(inserted_count integer, duplicate_count integer)
language plpgsql
security invoker
set search_path=public
as $$
declare
  item jsonb;
  v_phone text;
  v_source text;
  v_source_id text;
  v_name text;
  v_address text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  inserted_count := 0;
  duplicate_count := 0;
  for item in select value from jsonb_array_elements(coalesce(p_leads,'[]'::jsonb))
  loop
    v_phone := nullif(regexp_replace(coalesce(item->>'phone',''), '\D','','g'),'');
    v_source := coalesce(nullif(item->>'source',''),'openstreetmap');
    v_source_id := nullif(item->>'source_id','');
    v_name := lower(trim(coalesce(item->>'name','')));
    v_address := lower(trim(coalesce(item->>'address','')));
    if v_name = '' then continue; end if;
    if exists (
      select 1 from public.leads l
      where l.user_id = auth.uid()
        and (
          (v_phone is not null and l.normalized_phone = v_phone)
          or (v_source_id is not null and l.source = v_source and l.source_id = v_source_id)
          or (v_address <> '' and lower(l.name) = v_name and lower(coalesce(l.address,'')) = v_address)
        )
    ) then
      duplicate_count := duplicate_count + 1;
    else
      insert into public.leads(user_id,name,phone,normalized_phone,address,city,state,website,instagram,source,source_id,source_url,status,consent_status)
      values (
        auth.uid(),
        trim(item->>'name'),
        nullif(trim(item->>'phone'),''),
        v_phone,
        nullif(trim(item->>'address'),''),
        nullif(trim(item->>'city'),''),
        nullif(trim(item->>'state'),''),
        nullif(trim(item->>'website'),''),
        nullif(trim(item->>'instagram'),''),
        v_source,
        v_source_id,
        nullif(trim(item->>'source_url'),''),
        'found',
        'unknown'
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;
  return next;
end;
$$;
grant execute on function public.insert_prospect_leads(jsonb) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('prospect-media','prospect-media',false,52428800,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/ogg','video/mp4','video/webm'])
on conflict (id) do nothing;

drop policy if exists cozy_media_select on storage.objects;
create policy cozy_media_select on storage.objects for select to authenticated using (bucket_id='prospect-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists cozy_media_insert on storage.objects;
create policy cozy_media_insert on storage.objects for insert to authenticated with check (bucket_id='prospect-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists cozy_media_update on storage.objects;
create policy cozy_media_update on storage.objects for update to authenticated using (bucket_id='prospect-media' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='prospect-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists cozy_media_delete on storage.objects;
create policy cozy_media_delete on storage.objects for delete to authenticated using (bucket_id='prospect-media' and (storage.foldername(name))[1]=auth.uid()::text);
