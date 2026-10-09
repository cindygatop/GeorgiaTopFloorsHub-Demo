-- Georgia Top Floors Hub — production database starter
-- Target: Supabase Postgres. This is a starter schema, not a migration already applied.
-- Multi-tenant rule: every business-owned record carries organization_id.

create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','admin','office','manager','crew','client');
create type public.project_status as enum ('lead','scheduled','otw','arrived','in_progress','waiting','problem','completed','cancelled');
create type public.document_status as enum ('draft','sent','signature_needed','signed','active','expired','missing','review_due','archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/New_York',
  phone text,
  review_url text,
  logo_path text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  company_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  do_not_contact boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Links a login to a customer record. One customer can have more than one portal user.
create table public.customer_portal_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (organization_id, customer_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  project_number text not null,
  service text not null,
  address text not null,
  square_feet numeric,
  stain text,
  finish text,
  materials text,
  internal_notes text,
  status public.project_status not null default 'scheduled',
  urgency smallint not null default 1 check (urgency between 1 and 3),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_number)
);

create table public.project_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_role text not null default 'crew',
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  status text not null default 'Draft',
  total numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  number text not null,
  status text not null default 'Draft',
  scope jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  field_notes text,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  number text not null,
  status text not null default 'Open',
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  due_at timestamptz,
  external_payment_id text,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  assigned_user_id uuid references public.profiles(id),
  google_calendar_id text,
  google_event_id text,
  google_etag text,
  sync_source text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null, -- employee, subcontractor, project, organization
  subject_id uuid,
  document_group text not null, -- e.g. Certificate of Insurance (COI)
  document_type text not null,  -- e.g. General Liability, Workers Compensation, W-9
  status public.document_status not null default 'missing',
  effective_date date,
  expiration_date date,
  review_date date,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  document_version text not null,
  provider text,
  provider_document_id text,
  status public.document_status not null default 'signature_needed',
  signed_at timestamptz,
  signed_pdf_path text,
  audit_certificate_path text,
  created_at timestamptz not null default now()
);

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  agreement_id uuid references public.customer_agreements(id),
  status text not null default 'locked',
  starts_at date,
  ends_at date,
  document_path text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  channel text not null, -- in_app, sms, email
  kind text not null,
  title text not null,
  body text,
  status text not null default 'queued',
  external_message_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, -- google_calendar, quo, stripe, esign
  status text not null default 'disconnected',
  account_label text,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

-- Never store provider API keys directly in browser-readable rows. Keep secrets in
-- server-only environment variables or a secure secret store / vault.

create table public.user_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  smart_shortcuts jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.activity_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- ---------- Authorization helpers ----------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.is_active
  );
$$;

create or replace function public.has_org_role(org uuid, allowed public.app_role[])
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.is_active and m.role = any(allowed)
  );
$$;

create or replace function public.is_project_crew(project uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.project_assignments a
    where a.project_id = project and a.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_client(project uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.projects p
    join public.customer_portal_users c on c.customer_id = p.customer_id and c.organization_id = p.organization_id
    where p.id = project and c.user_id = auth.uid()
  );
$$;

-- ---------- RLS ----------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.customer_portal_users enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.estimates enable row level security;
alter table public.work_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.appointments enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.customer_agreements enable row level security;
alter table public.warranties enable row level security;
alter table public.notifications enable row level security;
alter table public.integration_connections enable row level security;
alter table public.user_preferences enable row level security;
alter table public.activity_events enable row level security;

create policy "org members read organization" on public.organizations
for select using (public.is_org_member(id));

create policy "users read own profile" on public.profiles
for select using (id = auth.uid());
create policy "users update own profile" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members read membership" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "office reads customers" on public.customers
for select using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));
create policy "office manages customers" on public.customers
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "project role read" on public.projects
for select using (
  public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
  or public.is_project_crew(id)
  or public.is_project_client(id)
);
create policy "office manages projects" on public.projects
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "office reads assignments" on public.project_assignments
for select using (public.is_org_member(organization_id));
create policy "office manages assignments" on public.project_assignments
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "office/client read estimates" on public.estimates
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or public.is_project_client(project_id)
);
create policy "office manages estimates" on public.estimates
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "office/assigned crew read work orders" on public.work_orders
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or public.is_project_crew(project_id)
);
create policy "office manages work orders" on public.work_orders
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));
create policy "assigned crew updates work orders" on public.work_orders
for update using (public.is_project_crew(project_id)) with check (public.is_project_crew(project_id));

create policy "office/client read invoices" on public.invoices
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or public.is_project_client(project_id)
);
create policy "office manages invoices" on public.invoices
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "project participants read appointments" on public.appointments
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or assigned_user_id = auth.uid()
 or public.is_project_client(project_id)
);
create policy "office manages appointments" on public.appointments
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "office reads compliance" on public.compliance_documents
for select using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));
create policy "office manages compliance" on public.compliance_documents
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "project client reads agreement" on public.customer_agreements
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or public.is_project_client(project_id)
);
create policy "office manages agreements" on public.customer_agreements
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "project client reads warranty" on public.warranties
for select using (
 public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[])
 or public.is_project_client(project_id)
);
create policy "office manages warranties" on public.warranties
for all using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "users read own notifications" on public.notifications
for select using (recipient_user_id = auth.uid() or public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "office reads integrations" on public.integration_connections
for select using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

create policy "users manage own preferences" on public.user_preferences
for all using (user_id = auth.uid() and public.is_org_member(organization_id))
with check (user_id = auth.uid() and public.is_org_member(organization_id));

create policy "office reads activity" on public.activity_events
for select using (public.has_org_role(organization_id, array['owner','admin','office','manager']::public.app_role[]));

-- The server/service-role layer should perform provider webhooks, SMS sends,
-- payment writes, e-signature callbacks and Google Calendar synchronization.
