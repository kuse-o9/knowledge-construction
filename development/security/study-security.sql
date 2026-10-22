begin;
create table if not exists study_private.maintenance_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 message text not null default '現在メンテナンス中です。しばらくしてからお試しください。' check(length(message) between 1 and 160),
 revision bigint not null default 1, updated_at timestamptz not null default now()
);
insert into study_private.maintenance_settings(singleton) values(true) on conflict do nothing;
create table if not exists study_private.admin_verified_sessions (
 session_id uuid primary key, actor uuid not null, expires_at timestamptz not null default clock_timestamp()+interval '20 minutes'
);
create table if not exists study_private.admin_verify_rate (
 actor uuid primary key, window_start timestamptz not null, attempts integer not null
);
create table if not exists study_private.maintenance_events (
 id bigint generated always as identity primary key, actor uuid not null, enabled boolean not null,
 note text not null, created_at timestamptz not null default clock_timestamp()
);
alter table study_private.maintenance_settings enable row level security;
alter table study_private.admin_verified_sessions enable row level security;
alter table study_private.admin_verify_rate enable row level security;
alter table study_private.maintenance_events enable row level security;
revoke all on study_private.maintenance_settings,study_private.admin_verified_sessions,study_private.admin_verify_rate,study_private.maintenance_events from public,anon,authenticated,service_role;
create or replace function study_private.security_status(p_actor uuid,p_session uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,study_private as $$
 with roles as (
  select coalesce(p_actor=(select owner_id from study_private.settings where singleton) and study_private.active_account(p_actor),false) as owner,
   coalesce(study_private.active_account(p_actor) and exists(select 1 from study_private.admin_members where user_id=p_actor),false) as admin
 )
 select jsonb_build_object('maintenance',s.enabled,'message',s.message,'revision',s.revision,'owner',r.owner,'admin',r.admin,
 'adminVerified',r.admin and exists(select 1 from study_private.admin_verified_sessions v where v.actor=p_actor and v.session_id=p_session and v.expires_at>now()),
 'allowed',not s.enabled or r.owner)
 from study_private.maintenance_settings s cross join roles r where singleton;
$$;
revoke all on function study_private.security_status(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.study_security_status() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select study_private.security_status(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;
revoke all on function public.study_security_status() from public;
grant execute on function public.study_security_status() to anon,authenticated;
create or replace function study_private.assert_admin_verified() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
declare s jsonb:=public.study_security_status();
begin
 if not (s->>'allowed')::boolean or not (s->>'adminVerified')::boolean then raise exception 'Administrator password verification required' using errcode='42501';end if;
end $$;
revoke all on function study_private.assert_admin_verified() from public,anon,authenticated,service_role;
create or replace function public.study_security_admin(p_enabled boolean,p_message text,p_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare st jsonb;
begin
 perform study_private.assert_admin_verified();st:=public.study_security_status();
 if not (st->>'owner')::boolean then raise exception 'Owner required' using errcode='42501';end if;
 if p_enabled is null or p_message is null or length(trim(p_message)) not between 1 and 160 then raise exception 'Invalid maintenance input' using errcode='22023';end if;
 perform 1 from study_private.maintenance_settings where singleton for update;
 if (select revision from study_private.maintenance_settings where singleton)<>p_revision then raise exception 'Maintenance changed; reload' using errcode='40001';end if;
 update study_private.maintenance_settings set enabled=p_enabled,message=trim(p_message),revision=revision+1,updated_at=clock_timestamp() where singleton;
 insert into study_private.maintenance_events(actor,enabled,note) values(auth.uid(),p_enabled,trim(p_message));
 return public.study_security_status();
end $$;
revoke all on function public.study_security_admin(boolean,text,bigint) from public,anon;
grant execute on function public.study_security_admin(boolean,text,bigint) to authenticated;
create or replace function public.study_security_service(p_action text,p_actor uuid default null,p_session uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare st jsonb; n integer; w timestamptz;
begin
 st:=study_private.security_status(p_actor,p_session);
 if p_action='status' then return st;end if;
 if p_actor is null or not (st->>'allowed')::boolean or not (st->>'admin')::boolean then raise exception 'Administrator required' using errcode='42501';end if;
 if p_action='rate' then
  w:=to_timestamp(floor(extract(epoch from clock_timestamp())/900)*900);
  insert into study_private.admin_verify_rate(actor,window_start,attempts) values(p_actor,w,1)
  on conflict(actor) do update set window_start=excluded.window_start,attempts=case when study_private.admin_verify_rate.window_start=excluded.window_start then study_private.admin_verify_rate.attempts+1 else 1 end returning attempts into n;
  return jsonb_build_object('allowed',n<=6);
 end if;
 if p_action='unlock' then
  if p_session is null or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) then raise exception 'Invalid authenticated session' using errcode='42501';end if;
  delete from study_private.admin_verified_sessions where expires_at<now();
  insert into study_private.admin_verified_sessions(session_id,actor) values(p_session,p_actor)
  on conflict(session_id) do update set actor=excluded.actor,expires_at=clock_timestamp()+interval '20 minutes';
  return study_private.security_status(p_actor,p_session);
 end if;
 raise exception 'Invalid security operation' using errcode='22023';
end $$;
revoke all on function public.study_security_service(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.study_security_service(text,uuid,uuid) to service_role;
-- Keep original functions, preserving existing business authorization.
do $$ begin
 if to_regprocedure('study_private.account_access_before_security()') is null then
  alter function public.study_account_access() set schema study_private;
  alter function study_private.study_account_access() rename to account_access_before_security;
 end if;
 if to_regprocedure('study_private.admin_summary_before_security()') is null then
  alter function public.study_admin_summary() set schema study_private;
  alter function study_private.study_admin_summary() rename to admin_summary_before_security;
 end if;
 if to_regprocedure('study_private.game_admin_before_security(text,text,boolean,text,bigint)') is null then
  alter function public.study_game_admin(text,text,boolean,text,bigint) set schema study_private;
  alter function study_private.study_game_admin(text,text,boolean,text,bigint) rename to game_admin_before_security;
 end if;
end $$;
revoke all on function study_private.account_access_before_security(),study_private.admin_summary_before_security(),study_private.game_admin_before_security(text,text,boolean,text,bigint) from public,anon,authenticated,service_role;
create or replace function public.study_account_access() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select study_private.account_access_before_security() and (public.study_security_status()->>'allowed')::boolean;
$$;
revoke all on function public.study_account_access() from public,anon;
grant execute on function public.study_account_access() to authenticated;
alter policy study_read_own_profile on public.study_profiles using ((select public.study_account_access()) and (select auth.uid())=id);
drop policy if exists study_security_profile_gate on public.study_profiles;
create policy study_security_profile_gate on public.study_profiles as restrictive for all to authenticated using ((select public.study_account_access())) with check ((select public.study_account_access()));
create or replace function public.study_admin_summary() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform study_private.assert_admin_verified();return study_private.admin_summary_before_security();end $$;
revoke all on function public.study_admin_summary() from public,anon;
grant execute on function public.study_admin_summary() to authenticated;
create or replace function public.study_game_admin(p_action text default 'list',p_id text default null,p_published boolean default null,p_note text default '',p_revision bigint default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform study_private.assert_admin_verified();return study_private.game_admin_before_security(p_action,p_id,p_published,p_note,p_revision);end $$;
revoke all on function public.study_game_admin(text,text,boolean,text,bigint) from public,anon;
grant execute on function public.study_game_admin(text,text,boolean,text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
