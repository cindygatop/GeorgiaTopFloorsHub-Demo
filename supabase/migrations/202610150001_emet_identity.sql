-- Emet identity foundation. Apply to a NEW reviewed Supabase project first.
-- This migration is independent of the un-applied legacy supabase-schema.sql.
-- It does not migrate, authorize, or expose the current browser demo's business data.
begin;

create table public.emet_organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  timezone text not null default 'America/New_York', created_at timestamptz not null default now()
);
create table public.emet_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 100), avatar_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (avatar_path is null or avatar_path ~ ('^' || user_id::text || '/[a-f0-9-]{36}\.(jpg|png|webp)$'))
);
create table public.emet_memberships (
  organization_id uuid not null references public.emet_organizations(id) on delete cascade,
  user_id uuid not null references public.emet_profiles(user_id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','office','crew','client')),
  status text not null default 'pending_approval' check (status in ('pending_approval','pending_email','active','rejected','revoked')),
  approved_at timestamptz, approved_by uuid references auth.users(id), revoked_at timestamptz,
  created_at timestamptz not null default now(), primary key (organization_id,user_id),
  check (status <> 'active' or (approved_at is not null and revoked_at is null))
);
create table public.emet_projects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.emet_organizations(id) on delete cascade,
  title text not null check (length(title) between 1 and 150),
  created_at timestamptz not null default now(), unique (organization_id,id)
);
create table public.emet_invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.emet_organizations(id) on delete cascade,
  email text not null check (email=lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check (role in ('admin','manager','office','crew','client')),
  project_id uuid, token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  expires_at timestamptz not null, consumed_at timestamptz, consumed_by uuid references auth.users(id), revoked_at timestamptz,
  foreign key (organization_id,project_id) references public.emet_projects(organization_id,id) on delete cascade,
  check ((role='client')=(project_id is not null)),
  check (expires_at>created_at and expires_at<=created_at+interval '7 days'),
  check ((consumed_at is null)=(consumed_by is null)), unique (organization_id,id)
);
create table public.emet_access_requests (
  id uuid primary key references public.emet_invitations(id) on delete cascade,
  organization_id uuid not null, user_id uuid not null references public.emet_profiles(user_id) on delete cascade,
  role text not null check (role in ('admin','manager','office','crew','client')), project_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
  foreign key (organization_id,id) references public.emet_invitations(organization_id,id) on delete cascade,
  foreign key (organization_id,project_id) references public.emet_projects(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.emet_memberships(organization_id,user_id) on delete cascade,
  check ((role='client')=(project_id is not null)), unique (organization_id,id)
);
create table public.emet_project_access (
  organization_id uuid not null, project_id uuid not null, user_id uuid not null,
  request_id uuid not null, approved_at timestamptz, revoked_at timestamptz,
  primary key (organization_id,project_id,user_id),
  foreign key (organization_id,project_id) references public.emet_projects(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.emet_memberships(organization_id,user_id) on delete cascade,
  foreign key (organization_id,request_id) references public.emet_access_requests(organization_id,id) on delete cascade
);
create table public.emet_email_outbox (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  request_id uuid not null, kind text not null check (kind in ('verification','approval')),
  recipient_user_id uuid not null references auth.users(id),
  status text not null default 'queued' check (status in ('queued','sending','accepted','failed')),
  attempts integer not null default 0, provider_message_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (request_id,kind),
  foreign key (organization_id,request_id) references public.emet_access_requests(organization_id,id) on delete cascade
);
create table public.emet_rate_limits (
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'), window_seconds integer not null,
  window_start timestamptz not null, attempts integer not null, primary key (key_hash,window_seconds,window_start)
);
create index emet_memberships_user on public.emet_memberships(user_id,organization_id);
create index emet_invitations_manager on public.emet_invitations(organization_id,invited_by,expires_at);
create index emet_access_requests_pending on public.emet_access_requests(organization_id,status,created_at);
create index emet_email_outbox_status on public.emet_email_outbox(status,created_at);

create function public.emet_has_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.emet_memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.status='active'
      and m.revoked_at is null and m.approved_at is not null and m.role=any(p_roles)
      and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()));
$$;
create function public.emet_can_grant(p_organization_id uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select (p_role in ('admin','manager','office','crew','client') and public.emet_has_role(p_organization_id,array['owner']))
    or (p_role in ('manager','office','crew','client') and public.emet_has_role(p_organization_id,array['admin']))
    or (p_role in ('office','crew','client') and public.emet_has_role(p_organization_id,array['manager']));
$$;
-- Explicit actor variant is SERVICE ONLY. Never grant it or consumption to authenticated/anon.
create function public.emet_actor_can_grant(p_actor uuid,p_organization_id uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.emet_memberships m join auth.users u on u.id=m.user_id
    where m.user_id=p_actor and m.organization_id=p_organization_id and m.status='active' and m.revoked_at is null
      and m.approved_at is not null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
      and ((m.role='owner' and p_role in ('admin','manager','office','crew','client'))
        or (m.role='admin' and p_role in ('manager','office','crew','client'))
        or (m.role='manager' and p_role in ('office','crew','client'))));
$$;
create function public.emet_can_read_project(p_organization_id uuid,p_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.emet_has_role(p_organization_id,array['owner','admin','manager','office']) or (
    public.emet_has_role(p_organization_id,array['client']) and exists(select 1 from public.emet_project_access a
      where a.organization_id=p_organization_id and a.project_id=p_project_id and a.user_id=auth.uid()
      and a.approved_at is not null and a.revoked_at is null));
$$;

alter table public.emet_organizations enable row level security;
alter table public.emet_profiles enable row level security;
alter table public.emet_memberships enable row level security;
alter table public.emet_projects enable row level security;
alter table public.emet_invitations enable row level security;
alter table public.emet_access_requests enable row level security;
alter table public.emet_project_access enable row level security;
alter table public.emet_email_outbox enable row level security;
alter table public.emet_rate_limits enable row level security;

-- All authorization mutations occur only in the checked SECURITY DEFINER RPCs below.
revoke all on public.emet_organizations,public.emet_profiles,public.emet_memberships,public.emet_projects,
  public.emet_invitations,public.emet_access_requests,public.emet_project_access,public.emet_email_outbox,public.emet_rate_limits from anon,authenticated;
grant all on public.emet_organizations,public.emet_profiles,public.emet_memberships,public.emet_projects,
  public.emet_invitations,public.emet_access_requests,public.emet_project_access,public.emet_email_outbox,public.emet_rate_limits to service_role;
grant select on public.emet_organizations,public.emet_profiles,public.emet_memberships,public.emet_projects,public.emet_project_access to authenticated;
create policy emet_profile_self_read on public.emet_profiles for select to authenticated using(user_id=auth.uid());
create policy emet_membership_self_read on public.emet_memberships for select to authenticated using(user_id=auth.uid());
create policy emet_organization_member_read on public.emet_organizations for select to authenticated
  using(public.emet_has_role(id,array['owner','admin','manager','office','crew','client']));
create policy emet_project_scoped_read on public.emet_projects for select to authenticated using(public.emet_can_read_project(organization_id,id));
create policy emet_project_access_self_read on public.emet_project_access for select to authenticated
  using(user_id=auth.uid() and public.emet_has_role(organization_id,array['client']) and approved_at is not null and revoked_at is null);

create function public.emet_create_invitation(p_organization_id uuid,p_email text,p_role text,p_project_id uuid,p_token_hash text,p_expires_hours integer default 48)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.emet_invitations;
begin
  if not public.emet_can_grant(p_organization_id,p_role) then raise exception using errcode='EM403',message='not authorized'; end if;
  if p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email not like '%@%.%'
    or p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_hours not between 1 and 168
    or ((p_role='client')<>(p_project_id is not null)) then raise exception using errcode='EM400',message='invalid invitation'; end if;
  if p_project_id is not null and not exists(select 1 from public.emet_projects p where p.id=p_project_id and p.organization_id=p_organization_id)
    then raise exception using errcode='EM403',message='project not authorized'; end if;
  insert into public.emet_invitations(organization_id,email,role,project_id,token_hash,invited_by,expires_at)
    values(p_organization_id,p_email,p_role,p_project_id,p_token_hash,auth.uid(),now()+make_interval(hours=>p_expires_hours)) returning * into result;
  return jsonb_build_object('id',result.id,'organizationId',result.organization_id,'email',result.email,'role',result.role,
    'projectId',result.project_id,'expiresAt',result.expires_at);
end;
$$;

create function public.emet_invitation_preview(p_token_hash text,p_email text,p_client_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.emet_invitations; result jsonb;
begin
  select * into i from public.emet_invitations where token_hash=p_token_hash and email=lower(btrim(p_email));
  if not found or i.consumed_at is not null or i.revoked_at is not null or i.expires_at<=now()
    or (p_client_only and i.role<>'client') or not public.emet_actor_can_grant(i.invited_by,i.organization_id,i.role)
    then raise exception using errcode='EM409',message='invitation unavailable'; end if;
  select jsonb_build_object('invitation_id',i.id,'organization_id',i.organization_id,'organization_name',o.name,
    'role',i.role,'project_id',i.project_id,'project_title',p.title,'expires_at',i.expires_at,
    'existing_user_id',(select u.id from auth.users u where lower(u.email)=i.email limit 1)) into result
    from public.emet_organizations o left join public.emet_projects p on p.id=i.project_id and p.organization_id=i.organization_id where o.id=i.organization_id;
  return result;
end;
$$;

create function public.emet_consume_invitation(p_token_hash text,p_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.emet_invitations; u auth.users; m public.emet_memberships;
begin
  -- A row lock makes simultaneous consumption of the same code exactly-once.
  select * into i from public.emet_invitations where token_hash=p_token_hash for update;
  select * into u from auth.users where id=p_user_id;
  if i.id is null or u.id is null or i.email<>lower(u.email) or i.consumed_at is not null or i.revoked_at is not null or i.expires_at<=now()
    or not public.emet_actor_can_grant(i.invited_by,i.organization_id,i.role)
    then raise exception using errcode='EM409',message='invitation unavailable'; end if;
  -- Serialize distinct invites for the same user/org too; a code never changes an existing role.
  perform pg_advisory_xact_lock(hashtextextended(i.organization_id::text||':'||p_user_id::text,0));
  select * into m from public.emet_memberships where organization_id=i.organization_id and user_id=p_user_id for update;
  if found and (m.role<>i.role or m.status in ('revoked','rejected') or (m.role<>'client'))
    then raise exception using errcode='EM409',message='existing membership requires manager review'; end if;
  if m.user_id is null then
    insert into public.emet_memberships(organization_id,user_id,role) values(i.organization_id,p_user_id,i.role);
  end if;
  insert into public.emet_access_requests(id,organization_id,user_id,role,project_id) values(i.id,i.organization_id,p_user_id,i.role,i.project_id);
  if i.project_id is not null then
    insert into public.emet_project_access(organization_id,project_id,user_id,request_id) values(i.organization_id,i.project_id,p_user_id,i.id);
  end if;
  update public.emet_invitations set consumed_at=now(),consumed_by=p_user_id where id=i.id;
  insert into public.emet_email_outbox(organization_id,request_id,kind,recipient_user_id) values
    (i.organization_id,i.id,'verification',p_user_id),(i.organization_id,i.id,'approval',i.invited_by);
  return i.id;
end;
$$;

create function public.emet_auth_user_created()
returns trigger language plpgsql security definer set search_path='' as $$
declare digest text;
begin
  insert into public.emet_profiles(user_id,display_name) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Emet user'),100));
  -- Only a trusted Auth Admin call can set app_metadata; public signup metadata is insufficient.
  if new.raw_app_meta_data->>'emet_bootstrap'='true' then return new; end if;
  digest:=new.raw_app_meta_data->>'emet_invitation_hash';
  if digest is null or digest !~ '^[a-f0-9]{64}$' then raise exception using errcode='EM403',message='invitation required'; end if;
  perform public.emet_consume_invitation(digest,new.id);
  return new;
end;
$$;
create trigger emet_auth_user_created after insert on auth.users for each row execute function public.emet_auth_user_created();

create function public.emet_auth_email_verified()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.email_confirmed_at is not null then
    update public.emet_memberships set status='active' where user_id=new.id and status='pending_email' and approved_at is not null and revoked_at is null;
  end if;
  return new;
end;
$$;
create trigger emet_auth_email_verified after update of email_confirmed_at on auth.users for each row execute function public.emet_auth_email_verified();

create function public.emet_pending_approvals(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.emet_has_role(p_organization_id,array['owner','admin','manager']) then raise exception using errcode='EM403',message='not authorized'; end if;
  select coalesce(jsonb_agg(data),'[]'::jsonb) into result from (
    select jsonb_build_object('requestId',r.id,'organizationId',r.organization_id,'userId',r.user_id,'displayName',p.display_name,
      'email',u.email,'role',r.role,'projectId',r.project_id,'projectTitle',j.title,'emailVerified',u.email_confirmed_at is not null,'status',r.status) data
    from public.emet_access_requests r join public.emet_profiles p on p.user_id=r.user_id join auth.users u on u.id=r.user_id
      left join public.emet_projects j on j.id=r.project_id and j.organization_id=r.organization_id
    where r.organization_id=p_organization_id and r.status='pending' and public.emet_can_grant(r.organization_id,r.role)
    order by r.created_at limit 100
  ) q;
  return result;
end;
$$;

create function public.emet_review_access(p_organization_id uuid,p_user_id uuid,p_request_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.emet_access_requests; verified boolean; state text;
begin
  if p_request_id is null or p_decision is null or p_decision not in ('approve','reject') or p_user_id=auth.uid() then raise exception using errcode='EM403',message='not authorized'; end if;
  if not public.emet_has_role(p_organization_id,array['owner','admin','manager']) then raise exception using errcode='EM403',message='not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_user_id::text,0));
  select * into r from public.emet_access_requests where organization_id=p_organization_id and user_id=p_user_id
    and id=p_request_id and status='pending' for update;
  if not found or not public.emet_can_grant(p_organization_id,r.role) then raise exception using errcode='EM403',message='not authorized'; end if;
  select email_confirmed_at is not null into verified from auth.users where id=p_user_id;
  update public.emet_access_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
  if p_decision='approve' then
    update public.emet_memberships set approved_by=coalesce(approved_by,auth.uid()),approved_at=coalesce(approved_at,now()),
      status=case when verified then 'active' else 'pending_email' end
      where organization_id=p_organization_id and user_id=p_user_id and revoked_at is null and status<>'revoked';
    update public.emet_project_access set approved_at=now() where organization_id=p_organization_id and request_id=r.id and revoked_at is null;
  elsif not exists(select 1 from public.emet_access_requests a where a.organization_id=p_organization_id and a.user_id=p_user_id and a.status='approved') then
    update public.emet_memberships set status=case when exists(select 1 from public.emet_access_requests a where a.organization_id=p_organization_id and a.user_id=p_user_id and a.status='pending')
      then 'pending_approval' else 'rejected' end where organization_id=p_organization_id and user_id=p_user_id and revoked_at is null;
  end if;
  select status into state from public.emet_memberships where organization_id=p_organization_id and user_id=p_user_id;
  return jsonb_build_object('requestId',r.id,'organizationId',p_organization_id,'userId',p_user_id,'projectId',r.project_id,'membershipStatus',state);
end;
$$;

create function public.emet_account_state()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='EM403',message='authentication required'; end if;
  select jsonb_build_object('profile',jsonb_build_object('display_name',p.display_name,'avatar_path',p.avatar_path),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('organizationId',m.organization_id,'organizationName',o.name,'role',m.role,'status',m.status))
      from public.emet_memberships m join public.emet_organizations o on o.id=m.organization_id where m.user_id=auth.uid()),'[]'::jsonb))
    into result from public.emet_profiles p where p.user_id=auth.uid();
  if result is null then raise exception using errcode='EM403',message='Emet profile unavailable'; end if;
  return result;
end;
$$;
create function public.emet_update_profile(p_display_name text,p_avatar_path text,p_set_avatar boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or length(btrim(p_display_name)) not between 1 and 100
    or (p_set_avatar and p_avatar_path is not null and p_avatar_path !~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}\.(jpg|png|webp)$'))
    then raise exception using errcode='EM400',message='invalid profile'; end if;
  update public.emet_profiles set display_name=btrim(p_display_name),avatar_path=case when p_set_avatar then p_avatar_path else avatar_path end,
    updated_at=now() where user_id=auth.uid();
end;
$$;

create function public.emet_delivery_context(p_user_id uuid,p_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('user_email',u.email,'display_name',p.display_name,'organization_id',i.organization_id,'organization_name',o.name,
    'manager_email',manager.email,'role',i.role,'project_title',j.title,
    'verification',(select jsonb_build_object('id',e.id,'status',e.status) from public.emet_email_outbox e where e.request_id=i.id and e.kind='verification'),
    'approval',(select jsonb_build_object('id',e.id,'status',e.status) from public.emet_email_outbox e where e.request_id=i.id and e.kind='approval'))
    from public.emet_invitations i join auth.users u on u.id=i.consumed_by join public.emet_profiles p on p.user_id=u.id
    join public.emet_organizations o on o.id=i.organization_id join auth.users manager on manager.id=i.invited_by
    left join public.emet_projects j on j.id=i.project_id and j.organization_id=i.organization_id
    where i.id=p_request_id and i.consumed_by=p_user_id;
$$;
create function public.emet_claim_email(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.emet_email_outbox set status='sending',attempts=attempts+1,updated_at=now() where id=p_id and status='queued';
  return found;
end;
$$;
create function public.emet_finish_email(p_id uuid,p_sent boolean,p_provider_id text)
returns void language sql security definer set search_path='' as $$
  update public.emet_email_outbox set status=case when p_sent and p_provider_id is not null then 'accepted' else 'failed' end,
    provider_message_id=case when p_sent then left(p_provider_id,200) else null end,updated_at=now() where id=p_id and status='sending';
$$;
create function public.emet_recovery_user(p_email text)
returns uuid language sql stable security definer set search_path='' as $$
  select u.id from auth.users u join public.emet_profiles p on p.user_id=u.id where lower(u.email)=lower(btrim(p_email)) limit 1;
$$;
create function public.emet_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare stamp timestamptz; hits integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 1000 or p_window_seconds not in (60,900,3600)
    then raise exception using errcode='EM400',message='invalid rate limit'; end if;
  stamp:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  insert into public.emet_rate_limits(key_hash,window_seconds,window_start,attempts) values(p_key,p_window_seconds,stamp,1)
    on conflict(key_hash,window_seconds,window_start) do update set attempts=public.emet_rate_limits.attempts+1 returning attempts into hits;
  return hits<=p_limit;
end;
$$;
create function public.emet_capabilities()
returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('schema_version',1); $$;

-- Default PUBLIC EXECUTE is revoked on EVERY Emet function, including trigger helpers.
do $$ declare routine record; begin
  for routine in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'emet\_%' escape '\'
  loop execute format('revoke all on function %s from public,anon,authenticated',routine.signature);
       execute format('grant execute on function %s to service_role',routine.signature);
  end loop;
end $$;
grant execute on function public.emet_has_role(uuid,text[]),public.emet_can_grant(uuid,text),public.emet_can_read_project(uuid,uuid),
  public.emet_create_invitation(uuid,text,text,uuid,text,integer),public.emet_pending_approvals(uuid),
  public.emet_review_access(uuid,uuid,uuid,text),public.emet_account_state(),public.emet_update_profile(text,text,boolean) to authenticated;

-- Private avatars: owner-only paths, fixed MIME allowlist, 2 MiB limit. No public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('emet-avatars','emet-avatars',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy emet_avatar_owner_read on storage.objects for select to authenticated
  using(bucket_id='emet-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy emet_avatar_owner_insert on storage.objects for insert to authenticated
  with check(bucket_id='emet-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy emet_avatar_owner_delete on storage.objects for delete to authenticated
  using(bucket_id='emet-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

commit;
