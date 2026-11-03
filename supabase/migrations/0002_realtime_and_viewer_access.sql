-- 0002: Live dashboard updates + let signed-in viewers read records
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.

-- 1) Turn on Realtime (live updates) for the tables the dashboard shows.
--    Without this, Supabase never sends changes to open dashboards.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'administrative_records'
  ) then
    alter publication supabase_realtime add table public.administrative_records;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'constituencies'
  ) then
    alter publication supabase_realtime add table public.constituencies;
  end if;
end;
$$;

-- 2) Let every signed-in team member (administrator, campaign_manager,
--    executive_viewer) READ records. Before this, only administrators and
--    campaign managers could read them, so executive viewers saw demo data
--    and never got live updates.
--    Writing (insert/update/delete) is still limited to staff by the
--    existing policies; nothing changes there.
drop policy if exists "Staff can read administrative records" on public.administrative_records;
drop policy if exists "Signed-in team can read administrative records" on public.administrative_records;

create policy "Signed-in team can read administrative records"
  on public.administrative_records for select
  to authenticated
  using (public.current_app_role() is not null);

-- 3) Allow roles to be set from the Supabase dashboard (SQL Editor) and from
--    trusted server scripts (service_role key). Before this, the safety rule
--    blocked *every* role change made outside the app, so nobody could ever be
--    made an administrator or campaign manager.
--    Users inside the app still cannot change their own role, and only
--    administrators can change other people's roles.
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then
      if current_user not in ('postgres', 'service_role', 'supabase_admin') then
        raise exception 'Role changes require an authenticated administrator.';
      end if;
    else
      if auth.uid() = new.id then
        raise exception 'Users cannot change their own role.';
      end if;
      if public.current_app_role() is distinct from 'administrator' then
        raise exception 'Only administrators can change roles.';
      end if;
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
