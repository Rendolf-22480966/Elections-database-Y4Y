-- 0000: Your live database stored colours as verified / pending / requires_correction.
-- Rename them to green / yellow / red so they match the website code. Safe to run twice.
do $$
declare d text;
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'verification_status' and e.enumlabel = 'verified') then
    alter type public.verification_status rename value 'verified' to 'green';
    alter type public.verification_status rename value 'pending' to 'yellow';
    alter type public.verification_status rename value 'requires_correction' to 'red';
  end if;

  -- Update the dashboard-totals function that still used the old names.
  select pg_get_functiondef('public.get_dashboard_metrics(timestamptz, timestamptz, uuid)'::regprocedure) into d;
  if d ~ '''(verified|pending|requires_correction)''' then
    d := replace(d, '''verified''', '''green''');
    d := replace(d, '''pending''', '''yellow''');
    d := replace(d, '''requires_correction''', '''red''');
    execute d;
  end if;
end;
$$;

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

-- 0003: Load the 99 delegates from Elections_File.xlsx into Supabase
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: people already in the database are skipped.
-- Everyone starts as YELLOW. The campaign manager changes colours afterwards.
--
-- Needs at least one administrator account to exist first (the records
-- must say who created them). If you get "No administrator profile found",
-- create the admin account first, then run this again.

do $$
declare
  v_admin uuid;
  v_missing text;
begin
  select id into v_admin from public.profiles where role = 'administrator' order by created_at limit 1;
  if v_admin is null then
    raise exception 'No administrator profile found. Create the admin account first.';
  end if;

  create temporary table _delegates (full_name text, constituency text, phone_e164 text, position text) on commit drop;
  insert into _delegates values
  ('Abdulai Iddrisu', 'Suhum', '+233593142207', 'Youth Organizer'),
  ('Abubakar Sadique', 'Suhum', '+233240700912', 'Deputy Youth Organizer'),
  ('Stephen Narhbio', 'Suhum', '+233247656296', 'Other Youth Rep'),
  ('Godfred Adome orlando', 'Ayensuano', '+233246310664', 'Youth Organizer'),
  ('Adamtey kekeli foster', 'Ayensuano', '+233547683008', 'Deputy Youth Organizer'),
  ('Millicent agbovi', 'Ayensuano', '+233241469420', 'Other Youth Rep'),
  ('Anaba Abdul Latif', 'Mpraeso', '+233558193769', 'Youth Organizer'),
  ('Kabiru Mohammed', 'Mpraeso', '+233545142222', 'Deputy Youth Organizer'),
  ('Wisdom kofi', 'Mpraeso', '+233542523267', 'Other Youth Rep'),
  ('Baffoe fiifi', 'Achiase', '+233240817421', 'Youth Organizer'),
  ('Abrokwa francis', 'Achiase', '+233555917291', 'Deputy Youth Organizer'),
  ('Ansah Botwe', 'Achiase', '+233547041406', 'Other Youth Rep'),
  ('Issah musah', 'Abuakwa North', '+233547331000', 'Youth Organizer'),
  ('Maswud mohammed', 'Abuakwa North', '+233547708861', 'Deputy Youth Organizer'),
  ('Ebenezer Akyena kodua', 'Abuakwa North', '+233243989608', 'Other Youth Rep'),
  ('Carlos Budu', 'Ofoase-Ayirebi', '+233557231119', 'Youth Organizer'),
  ('Benjamin Andoh', 'Ofoase-Ayirebi', '+233249616350', 'Deputy Youth Organizer'),
  ('Amidatu hawa', 'Ofoase-Ayirebi', '+233592236996', 'Other Youth Rep'),
  ('Dennis mensah akorli', 'New Juaben South', '+233551453504', 'Youth Organizer'),
  ('Abdulai Ayatu', 'New Juaben South', '+233592639149', 'Deputy Youth Organizer'),
  ('Aabuley Aloysius', 'New Juaben South', '+233540954118', 'Other Youth Rep'),
  ('Mathias Putin', 'Abetifi', '+233593104261', 'Youth Organizer'),
  ('Nelson Asonaba', 'Abetifi', '+233240081894', 'Deputy Youth Organizer'),
  ('Patience Obaanaa', 'Abetifi', '+233553726957', 'Other Youth Rep'),
  ('Adu kwabena', 'Akim Swedru', '+233548778850', 'Youth Organizer'),
  ('Mohammed Salauhudeen', 'Akim Swedru', '+233539210041', 'Deputy Youth Organizer'),
  ('Sumaila Halidu', 'Akim Swedru', '+233531709340', 'Other Youth Rep'),
  ('Jonas Asare', 'Akim Oda', '+233557870424', 'Youth Organizer'),
  ('James tetteh', 'Akim Oda', '+233599428592', 'Deputy Youth Organizer'),
  ('Adadey Edem Evans', 'Akim Oda', '+233240595681', 'Other Youth Rep'),
  ('Gyimah Mohammed', 'Afram Plains North', '+233553234917', 'Youth Organizer'),
  ('Dzidefo Toklo', 'Afram Plains North', '+233248058208', 'Deputy Youth Organizer'),
  ('Yohanes Nyamesorto', 'Afram Plains North', '+233249554870', 'Other Youth Rep'),
  ('Mathew Tikaah', 'Afram Plains South', '+233543832537', 'Youth Organizer'),
  ('Naadow joseph', 'Afram Plains South', '+233543397345', 'Deputy Youth Organizer'),
  ('Ali Anif', 'Afram Plains South', '+233536428703', 'Other Youth Rep'),
  ('Tondey Emmanuel', 'Lower West Akim', '+233248272975', 'Youth Organizer'),
  ('Evans Dickman', 'Lower West Akim', '+233241749850', 'Deputy Youth Organizer'),
  ('Enock', 'Lower West Akim', '+233595062725', 'Other Youth Rep'),
  ('Odjeawuo joshua', 'Lower Manya Krobo', '+233546636711', 'Youth Organizer'),
  ('Tetteh Ebenezer kodjo', 'Lower Manya Krobo', '+233558313539', 'Deputy Youth Organizer'),
  ('Rosina Emefa Danso', 'Lower Manya Krobo', '+233249947758', 'Other Youth Rep'),
  ('Amos koranteng oman', 'Yilo Krobo', '+233248388607', 'Youth Organizer'),
  ('Eric Batsa', 'Yilo Krobo', '+233244558649', 'Deputy Youth Organizer'),
  ('Evans Danso', 'Yilo Krobo', '+233244253208', 'Other Youth Rep'),
  ('Anthony Agyei', 'Kade', '+233245540327', 'Youth Organizer'),
  ('Mohamed Salis iddris', 'Kade', '+233246815006', 'Deputy Youth Organizer'),
  ('Emmanuel Acheampong', 'Kade', '+233594449272', 'Other Youth Rep'),
  ('Sagiru mohammed', 'New Juaben North', '+233541368186', 'Youth Organizer'),
  ('Abdul Majid issah', 'New Juaben North', '+233245083356', 'Deputy Youth Organizer'),
  ('Abdul Hamid Abubakar sadick', 'New Juaben North', '+233558759553', 'Other Youth Rep'),
  ('Kanye Ebenezer Kweisah', 'Akuapem South', '+233243784225', 'Youth Organizer'),
  ('Nicholas Obese Snr', 'Akuapem South', '+233244314320', 'Deputy Youth Organizer'),
  ('Kelvin amponsah Addi', 'Akuapem South', '+233551090599', 'Other Youth Rep'),
  ('Ernest Anderson Addo', 'Abuakwa South', '+233241053232', 'Youth Organizer'),
  ('Solomon Nana Frimpong', 'Abuakwa South', '+233592008080', 'Deputy Youth Organizer'),
  ('Enock Amankwa', 'Abuakwa South', '+233547179204', 'Other Youth Rep'),
  ('Lawal Issah', 'Asuogyaman', '+233245864817', 'Youth Organizer'),
  ('Isco Daniel Osei', 'Asuogyaman', '+233245351212', 'Deputy Youth Organizer'),
  ('Akwetey Gameli', 'Asuogyaman', '+233550970260', 'Other Youth Rep'),
  ('Aglago Abraham Coffie', 'Akwatia', '+233247197450', 'Youth Organizer'),
  ('Gyebi bismark', 'Akwatia', '+233243080510', 'Deputy Youth Organizer'),
  ('Nurudeen Rahaman', 'Akwatia', '+233249801306', 'Other Youth Rep'),
  ('Francis Ghartey Anobil', 'Asene Akroso Manso', '+233248457128', 'Youth Organizer'),
  ('Prince Darko', 'Asene Akroso Manso', '+233542828292', 'Deputy Youth Organizer'),
  ('Bismarck Basoah', 'Asene Akroso Manso', '+233249717158', 'Other Youth Rep'),
  ('Elijah kwesi teye', 'Fanteakwa North', '+233240231987', 'Youth Organizer'),
  ('Samuel okyere Ayim', 'Fanteakwa North', '+233242703147', 'Deputy Youth Organizer'),
  ('Adom francis vondee', 'Fanteakwa North', '+233545318131', 'Other Youth Rep'),
  ('Isaac nkansa', 'Atiwa East', '+233246783544', 'Youth Organizer'),
  ('Ibrahim musah', 'Atiwa East', '+233593015487', 'Deputy Youth Organizer'),
  ('Seidu Mohammed', 'Atiwa East', '+233244791986', 'Other Youth Rep'),
  ('Andrews Ayisi Baah', 'Atiwa West', '+233248459541', 'Youth Organizer'),
  ('Moro Abubakar', 'Atiwa West', '+233243667704', 'Deputy Youth Organizer'),
  ('Frimpong Douglas', 'Atiwa West', '+233549701502', 'Other Youth Rep'),
  ('Eric Adjei', 'Fanteakwa South', '+233246327278', 'Youth Organizer'),
  ('Nii Nai Francis', 'Fanteakwa South', '+233544028880', 'Deputy Youth Organizer'),
  ('Somua Elvis Siaw', 'Fanteakwa South', '+233597700740', 'Other Youth Rep'),
  ('Samuel Bossman', 'Upper West Akim', '+233247654072', 'Youth Organizer'),
  ('Gibson Amoah owosu', 'Upper West Akim', '+233246031948', 'Deputy Youth Organizer'),
  ('Azaglo Eric', 'Upper West Akim', '+233247683035', 'Other Youth Rep'),
  ('Gabriel Abodzene', 'Nsawam Adoagyiri', '+233244179281', 'Youth Organizer'),
  ('Farhan Abubakar', 'Nsawam Adoagyiri', '+233244903863', 'Deputy Youth Organizer'),
  ('Stephen Kb Inkum', 'Nsawam Adoagyiri', '+233243616908', 'Other Youth Rep'),
  ('Hayford Baniba Nofeli', 'Akropong', '+233541593867', 'Youth Organizer'),
  ('Ganyo jacob', 'Akropong', '+233271120061', 'Deputy Youth Organizer'),
  ('Kelvin amponsah Addi', 'Akropong', null, 'Other Youth Rep'),
  ('Daniel owusu sekyere', 'Nkawkaw', '+233248202739', 'Youth Organizer'),
  ('Okyere Yakubu', 'Nkawkaw', '+233509095491', 'Deputy Youth Organizer'),
  ('Luckmanul Hakim musa', 'Nkawkaw', '+233594331905', 'Other Youth Rep'),
  ('Sanusi Hamidu', 'Abirem', '+233547224574', 'Youth Organizer'),
  ('Umar Abass sherrif', 'Abirem', '+233536803720', 'Deputy Youth Organizer'),
  ('Patrick Akati', 'Abirem', '+233240158773', 'Other Youth Rep'),
  ('Prince Nana Boateng', 'Okere', '+233247261066', 'Youth Organizer'),
  ('Ishmael Ben Coffie', 'Okere', '+233540743043', 'Deputy Youth Organizer'),
  ('Rebbeca Enyonam', 'Okere', '+233240247268', 'Other Youth Rep'),
  ('Narh Micheal Konotey', 'Upper Manya Krobo', '+233240798471', 'Youth Organizer'),
  ('Salifu Mohammed', 'Upper Manya Krobo', '+233244486465', 'Deputy Youth Organizer'),
  ('Dicka Emmanuel', 'Upper Manya Krobo', '+233542928153', 'Other Youth Rep');

  select string_agg(distinct d.constituency, ', ') into v_missing
  from _delegates d left join public.constituencies c on c.name = d.constituency
  where c.id is null;
  if v_missing is not null then
    raise exception 'These constituencies are missing from the database: %', v_missing;
  end if;

  insert into public.administrative_records
    (full_name, constituency_id, phone_e164, verification_status, admin_note, created_by, updated_by)
  select d.full_name, c.id, d.phone_e164, 'yellow', d.position, v_admin, v_admin
  from _delegates d
  join public.constituencies c on c.name = d.constituency
  where not exists (
    select 1 from public.administrative_records r
    where (d.phone_e164 is not null and r.phone_e164 = d.phone_e164)
       or (lower(r.full_name) = lower(d.full_name) and r.constituency_id = c.id)
  );
end;
$$;


-- Final check: what the database looks like now
select
  (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = 'public.verification_status'::regtype) as colours,
  (select count(*) from public.administrative_records) as delegates,
  (select count(distinct constituency_id) from public.administrative_records) as constituencies_with_delegates,
  (select string_agg(tablename, ', ') from pg_publication_tables where pubname = 'supabase_realtime') as live_update_tables;
