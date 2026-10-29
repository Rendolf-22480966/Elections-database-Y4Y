-- Eastern Region Campaign Data Management schema
-- Apply in the Supabase SQL editor or with the Supabase CLI.

create extension if not exists pgcrypto;

create type public.app_role as enum ('administrator', 'campaign_manager', 'executive_viewer');
create type public.verification_status as enum ('verified', 'pending', 'requires_correction');
create type public.gender_option as enum ('female', 'male', 'other', 'prefer_not_to_say');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null unique,
  role public.app_role not null default 'executive_viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.constituencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  region text not null default 'Eastern Region',
  created_at timestamptz not null default now()
);

create sequence public.administrative_record_serial start 1;

create table public.administrative_records (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null unique,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  constituency_id uuid not null references public.constituencies (id) on delete restrict,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+233[25][0-9]{8}$'),
  gender public.gender_option,
  verification_status public.verification_status not null default 'pending',
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index administrative_records_phone_unique
  on public.administrative_records (phone_e164)
  where phone_e164 is not null;

create index administrative_records_constituency_idx on public.administrative_records (constituency_id);
create index administrative_records_status_idx on public.administrative_records (verification_status);
create index administrative_records_created_at_idx on public.administrative_records (created_at desc);
create index administrative_records_name_idx on public.administrative_records (lower(full_name));

create table public.verification_history (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.administrative_records (id) on delete cascade,
  from_status public.verification_status,
  to_status public.verification_status not null,
  reason text not null check (char_length(trim(reason)) >= 8),
  changed_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index verification_history_record_idx on public.verification_history (record_id, created_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_created_at_idx on public.audit_events (created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger records_set_updated_at
  before update on public.administrative_records
  for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('administrator', 'campaign_manager');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    coalesce(new.email, ''),
    'executive_viewer'
  );
  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (new.id, 'user.signup', 'profile', new.id, jsonb_build_object('email_domain', split_part(coalesce(new.email, ''), '@', 2)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.assign_internal_code()
returns trigger
language plpgsql
as $$
begin
  if new.internal_code is null or btrim(new.internal_code) = '' then
    new.internal_code := 'ER-' || lpad(nextval('public.administrative_record_serial')::text, 7, '0');
  end if;
  return new;
end;
$$;

create trigger records_assign_internal_code
  before insert on public.administrative_records
  for each row execute function public.assign_internal_code();

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then
      raise exception 'Role changes require an authenticated administrator.';
    end if;
    if auth.uid() = new.id then
      raise exception 'Users cannot change their own role.';
    end if;
    if public.current_app_role() is distinct from 'administrator' then
      raise exception 'Only administrators can change roles.';
    end if;
    if old.role = 'administrator' then
      if (select count(*) from public.profiles where role = 'administrator' and id <> old.id) = 0 then
        raise exception 'Cannot remove the last administrator.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

create or replace function public.write_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.assert_write_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select count(*) into v_count
  from public.audit_events
  where actor_id = auth.uid()
    and action in ('record.create', 'record.update', 'record.delete', 'verification.change')
    and created_at > now() - interval '5 minutes';

  if v_count >= 40 then
    raise exception 'Rate limit reached. Wait a few minutes before making more changes.';
  end if;
end;
$$;

create or replace function public.record_is_complete(rec public.administrative_records)
returns boolean
language sql
immutable
as $$
  select rec.full_name is not null
    and length(trim(rec.full_name)) >= 2
    and rec.constituency_id is not null
    and rec.phone_e164 is not null
    and rec.verification_status is not null;
$$;

create or replace function public.get_dashboard_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_constituency_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_from timestamptz;
  v_to timestamptz;
  v_total integer;
  v_verified integer;
  v_pending integer;
  v_correction integer;
  v_complete integer;
  v_constituencies integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'Not authorized.';
  end if;

  v_from := coalesce(p_from, now() - interval '90 days');
  v_to := coalesce(p_to, now());

  with filtered as (
    select *
    from public.administrative_records r
    where r.created_at >= v_from
      and r.created_at <= v_to
      and (p_constituency_id is null or r.constituency_id = p_constituency_id)
  )
  select
    count(*),
    count(*) filter (where verification_status = 'verified'),
    count(*) filter (where verification_status = 'pending'),
    count(*) filter (where verification_status = 'requires_correction'),
    count(*) filter (where phone_e164 is not null and full_name is not null and constituency_id is not null),
    count(distinct constituency_id)
  into v_total, v_verified, v_pending, v_correction, v_complete, v_constituencies
  from filtered;

  return jsonb_build_object(
    'total_records', v_total,
    'verified_records', v_verified,
    'pending_records', v_pending,
    'correction_records', v_correction,
    'constituencies_with_data', v_constituencies,
    'completeness_percent', case when v_total = 0 then 0 else round((v_complete::numeric / v_total) * 1000) / 10 end,
    'created_over_time', coalesce((
      select jsonb_agg(row_to_json(x))
      from (
        select to_char(date_trunc('day', r.created_at), 'YYYY-MM-DD') as date, count(*)::int as count
        from public.administrative_records r
        where r.created_at >= v_from
          and r.created_at <= v_to
          and (p_constituency_id is null or r.constituency_id = p_constituency_id)
        group by 1
        order by 1
      ) x
    ), '[]'::jsonb),
    'verification_distribution', jsonb_build_array(
      jsonb_build_object('status', 'verified', 'count', v_verified),
      jsonb_build_object('status', 'pending', 'count', v_pending),
      jsonb_build_object('status', 'requires_correction', 'count', v_correction)
    ),
    'completeness_by_constituency', coalesce((
      select jsonb_agg(row_to_json(x))
      from (
        select
          c.id as constituency_id,
          c.name as constituency_name,
          count(r.id)::int as total,
          count(r.id) filter (where r.phone_e164 is not null)::int as complete,
          case when count(r.id) = 0 then 0 else round((count(r.id) filter (where r.phone_e164 is not null)::numeric / count(r.id)) * 1000) / 10 end as completeness_percent
        from public.constituencies c
        left join public.administrative_records r
          on r.constituency_id = c.id
         and r.created_at >= v_from
         and r.created_at <= v_to
        group by c.id, c.name
        having count(r.id) > 0
        order by c.name
      ) x
    ), '[]'::jsonb),
    'activity_over_time', coalesce((
      select jsonb_agg(row_to_json(x))
      from (
        select to_char(date_trunc('day', a.created_at), 'YYYY-MM-DD') as date, count(*)::int as count
        from public.audit_events a
        where a.action in ('record.create', 'record.update', 'verification.change')
          and a.created_at >= v_from
          and a.created_at <= v_to
        group by 1
        order by 1
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.find_record_duplicates(
  p_full_name text,
  p_constituency_id uuid,
  p_phone_e164 text,
  p_exclude_id uuid default null
)
returns table (
  id uuid,
  internal_code text,
  full_name text,
  constituency_name text,
  match_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized.';
  end if;

  return query
  select
    r.id,
    r.internal_code,
    r.full_name,
    c.name,
    case
      when p_phone_e164 is not null and r.phone_e164 = p_phone_e164 then 'phone'
      else 'name_constituency'
    end
  from public.administrative_records r
  join public.constituencies c on c.id = r.constituency_id
  where (p_exclude_id is null or r.id <> p_exclude_id)
    and (
      (p_phone_e164 is not null and r.phone_e164 = p_phone_e164)
      or (
        lower(trim(r.full_name)) = lower(trim(p_full_name))
        and r.constituency_id = p_constituency_id
      )
    )
  order by r.created_at desc
  limit 10;
end;
$$;

insert into public.constituencies (name, code, region) values
  ('Abetifi', 'E3101', 'Eastern Region'),
  ('Abirem', 'E2201', 'Eastern Region'),
  ('Abuakwa North', 'E2401', 'Eastern Region'),
  ('Abuakwa South', 'E2301', 'Eastern Region'),
  ('Achiase', 'E1801', 'Eastern Region'),
  ('Afram Plains North', 'E3201', 'Eastern Region'),
  ('Afram Plains South', 'E3301', 'Eastern Region'),
  ('Akim Oda', 'E1501', 'Eastern Region'),
  ('Akim Swedru', 'E1701', 'Eastern Region'),
  ('Akropong', 'E0701', 'Eastern Region'),
  ('Akuapem South', 'E0901', 'Eastern Region'),
  ('Akwatia', 'E2101', 'Eastern Region'),
  ('Asene Akroso Manso', 'E1601', 'Eastern Region'),
  ('Asuogyaman', 'E0101', 'Eastern Region'),
  ('Atiwa East', 'E2601', 'Eastern Region'),
  ('Atiwa West', 'E2501', 'Eastern Region'),
  ('Ayensuano', 'E1201', 'Eastern Region'),
  ('Fanteakwa North', 'E2701', 'Eastern Region'),
  ('Fanteakwa South', 'E2801', 'Eastern Region'),
  ('Kade', 'E2001', 'Eastern Region'),
  ('Lower Manya Krobo', 'E0201', 'Eastern Region'),
  ('Lower West Akim', 'E1301', 'Eastern Region'),
  ('Mpraeso', 'E3001', 'Eastern Region'),
  ('New Juaben North', 'E0601', 'Eastern Region'),
  ('New Juaben South', 'E0501', 'Eastern Region'),
  ('Nkawkaw', 'E2901', 'Eastern Region'),
  ('Nsawam Adoagyiri', 'E1001', 'Eastern Region'),
  ('Ofoase-Ayirebi', 'E1901', 'Eastern Region'),
  ('Okere', 'E0801', 'Eastern Region'),
  ('Suhum', 'E1101', 'Eastern Region'),
  ('Upper Manya Krobo', 'E0301', 'Eastern Region'),
  ('Upper West Akim', 'E1401', 'Eastern Region'),
  ('Yilo Krobo', 'E0401', 'Eastern Region')
on conflict (code) do nothing;

alter table public.profiles enable row level security;
alter table public.constituencies enable row level security;
alter table public.administrative_records enable row level security;
alter table public.verification_history enable row level security;
alter table public.audit_events enable row level security;

create policy "Authenticated users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_app_role() in ('administrator', 'campaign_manager'));

create policy "Users can update own name"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.current_app_role() = 'administrator')
  with check (id = auth.uid() or public.current_app_role() = 'administrator');

create policy "Authenticated users can read constituencies"
  on public.constituencies for select
  to authenticated
  using (true);

create policy "Administrators can manage constituencies"
  on public.constituencies for all
  to authenticated
  using (public.current_app_role() = 'administrator')
  with check (public.current_app_role() = 'administrator');

create policy "Staff can read administrative records"
  on public.administrative_records for select
  to authenticated
  using (public.is_staff());

create policy "Staff can insert administrative records"
  on public.administrative_records for insert
  to authenticated
  with check (public.is_staff() and created_by = auth.uid() and updated_by = auth.uid());

create policy "Staff can update administrative records"
  on public.administrative_records for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff() and updated_by = auth.uid());

create policy "Staff can delete administrative records"
  on public.administrative_records for delete
  to authenticated
  using (public.current_app_role() = 'administrator' or (public.is_staff() and created_by = auth.uid()));

create policy "Staff can read verification history"
  on public.verification_history for select
  to authenticated
  using (public.is_staff());

create policy "Staff can insert verification history"
  on public.verification_history for insert
  to authenticated
  with check (public.is_staff() and changed_by = auth.uid());

create policy "Staff and admins can read audit events"
  on public.audit_events for select
  to authenticated
  using (public.current_app_role() in ('administrator', 'campaign_manager'));

create policy "Authenticated users can insert own audit events"
  on public.audit_events for insert
  to authenticated
  with check (actor_id = auth.uid());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.constituencies to authenticated;
grant select, insert, update, delete on public.administrative_records to authenticated;
grant select, insert on public.verification_history to authenticated;
grant select, insert on public.audit_events to authenticated;
grant usage, select on sequence public.administrative_record_serial to authenticated;
grant execute on function public.get_dashboard_metrics(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.find_record_duplicates(text, uuid, text, uuid) to authenticated;
grant execute on function public.write_audit_event(text, text, uuid, jsonb) to authenticated;
grant execute on function public.assert_write_rate_limit() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
