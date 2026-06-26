create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  normalized_name text not null,
  phone text not null,
  normalized_phone text not null,
  relation text not null,
  last_seen_at timestamptz not null,
  address text not null,
  age text,
  document_id text,
  notes text,
  status text not null default 'pending',
  has_photos boolean not null default false,
  photos jsonb not null default '[]'::jsonb,
  localized_by_name text,
  localized_by_phone text,
  localized_note text,
  localized_at timestamptz,
  localized_reported_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_normalized_name_idx on public.reports (normalized_name);
create index if not exists reports_normalized_phone_idx on public.reports (normalized_phone);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  action text not null,
  actor_id text,
  source_ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_report_idx on public.audit_logs (report_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
