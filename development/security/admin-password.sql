begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists study_private.admin_password_settings (
 singleton boolean primary key default true check(singleton), password_hash text,
 revision bigint not null default 0, updated_at timestamptz not null default now(), updated_by uuid
);
insert into study_private.admin_password_settings(singleton) values(true) on conflict do nothing;
alter table study_private.admin_password_settings enable row level security;
revoke all on study_private.admin_password_settings from public,anon,authenticated,service_role;
alter table study_private.admin_verified_sessions add column if not exists password_revision bigint not null default 0;
create or replace function study_private.security_status(p_actor uuid,p_session uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,study_private as $$
 with roles as (
  select coalesce(p_actor=(select owner_id from study_private.settings where singleton) and study_private.active_account(p_actor),false) as owner,
   coalesce(study_private.active_account(p_actor) and exists(select 1 from study_private.admin_members where user_id=p_actor),false) as admin
 )
 select jsonb_build_object('maintenance',s.enabled,'message',s.message,'revision',s.revision,'owner',r.owner,'admin',r.admin,
 'adminPasswordConfigured',(select password_hash is not null from study_private.admin_password_settings where singleton),
 'adminPasswordRevision',(select revision from study_private.admin_password_settings where singleton),
 'adminVerified',r.admin and exists(select 1 from study_private.admin_verified_sessions v where v.actor=p_actor and v.session_id=p_session and v.expires_at>now() and v.password_revision=(select revision from study_private.admin_password_settings where singleton and password_hash is not null)),
 'allowed',not s.enabled or r.owner)
 from study_private.maintenance_settings s cross join roles r where singleton;
$$;
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
 raise exception 'Invalid security operation' using errcode='22023';
end $$;
revoke all on function public.study_security_service(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.study_security_service(text,uuid,uuid) to service_role;

-- Only the Edge service, after checking the current account password, may call this.
create or replace function public.study_admin_password_service(p_action text,p_actor uuid,p_session uuid,p_password text,p_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare st jsonb; settings study_private.admin_password_settings; n integer; w timestamptz;
begin
 st:=study_private.security_status(p_actor,p_session);
 if p_actor is null or not (st->>'allowed')::boolean or not (st->>'admin')::boolean then raise exception 'Administrator required' using errcode='42501';end if;
 if p_session is null or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) then raise exception 'Invalid authenticated session' using errcode='42501';end if;
 if p_action not in ('verify','set') or p_action is null then raise exception 'Invalid password operation' using errcode='22023';end if;
 if p_password is null or octet_length(p_password) not between 16 and 64 then return jsonb_build_object('verified',false);end if;
 -- Serialize verification and rotation. A concurrent old password cannot obtain a new-revision grant.
 select * into settings from study_private.admin_password_settings where singleton for update;
 if p_action='set' then
  if not (st->>'owner')::boolean then raise exception 'Owner required' using errcode='42501';end if;
  if p_revision is null or settings.revision<>p_revision then raise exception 'Password changed; reload' using errcode='40001';end if;
  update study_private.admin_password_settings set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),revision=revision+1,updated_at=clock_timestamp(),updated_by=p_actor where singleton returning * into settings;
 else
  if settings.password_hash is null or settings.password_hash<>extensions.crypt(p_password,settings.password_hash) then return jsonb_build_object('verified',false);end if;
 end if;
 insert into study_private.admin_verified_sessions(session_id,actor,password_revision) values(p_session,p_actor,settings.revision)
 on conflict(session_id) do update set actor=excluded.actor,password_revision=excluded.password_revision,expires_at=clock_timestamp()+interval '20 minutes';
 return jsonb_build_object('verified',true,'status',study_private.security_status(p_actor,p_session));
end $$;
revoke all on function public.study_admin_password_service(text,uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.study_admin_password_service(text,uuid,uuid,text,bigint) to service_role;
notify pgrst,'reload schema';
commit;
