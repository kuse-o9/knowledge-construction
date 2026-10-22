begin;
create table if not exists study_private.maintenance_plans (
 id uuid primary key default gen_random_uuid(),title text not null check(length(trim(title)) between 1 and 100),
 message text not null check(length(trim(message)) between 1 and 500),
 starts_at timestamptz not null,ends_at timestamptz not null,announce_at timestamptz not null,
 cancelled boolean not null default false,revision bigint not null default 1,
 updated_by uuid not null,updated_at timestamptz not null default now(),
 check(ends_at>starts_at),check(announce_at<=starts_at)
);
alter table study_private.maintenance_plans enable row level security;
revoke all on study_private.maintenance_plans from public,anon,authenticated,service_role;
create or replace function study_private.maintenance_effective(p_at timestamptz) returns jsonb
language sql stable security definer set search_path=pg_catalog,study_private as $$
 select jsonb_build_object('maintenance',s.enabled or a.id is not null,'manualMaintenance',s.enabled,'manualMessage',s.message,
 'message',case when s.enabled then s.message else coalesce(a.message,s.message) end,'scheduledEnd',a.ends_at,
 'announcements',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select id,title,message,starts_at,ends_at from study_private.maintenance_plans
  where not cancelled and announce_at<=p_at and ends_at>p_at order by starts_at limit 10
 ) x),'[]'::jsonb))
 from study_private.maintenance_settings s left join lateral (
 select id,message,ends_at from study_private.maintenance_plans where not cancelled and starts_at<=p_at and ends_at>p_at order by starts_at limit 1
 ) a on true where s.singleton;
$$;
revoke all on function study_private.maintenance_effective(timestamptz) from public,anon,authenticated,service_role;
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
 'allowed',not s.enabled or r.owner) || study_private.maintenance_effective(now()) || jsonb_build_object('allowed',not (study_private.maintenance_effective(now())->>'maintenance')::boolean or r.owner)
 from study_private.maintenance_settings s cross join roles r where singleton;
$$;

create or replace function public.study_maintenance_plan(p_action text default 'list',p_id uuid default null,p_title text default null,p_message text default null,p_starts timestamptz default null,p_ends timestamptz default null,p_announce timestamptz default null,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare st jsonb; row_id uuid;
begin
 perform study_private.assert_admin_verified();st:=public.study_security_status();
 if not (st->>'owner')::boolean then raise exception 'Owner required' using errcode='42501';end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x)) from(select id,title,message,starts_at,ends_at,announce_at,cancelled,revision from study_private.maintenance_plans order by starts_at desc limit 100)x),'[]'::jsonb);end if;
 -- Global lock serializes overlap checks and manual changes.
 perform 1 from study_private.maintenance_settings where singleton for update;
 if p_action='cancel' then
  update study_private.maintenance_plans set cancelled=true,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=p_id and revision=p_revision and not cancelled;
  if not found then raise exception 'Plan changed; reload' using errcode='40001';end if;
 elsif p_action='save' then
  if p_title is null or length(trim(p_title)) not between 1 and 100 or p_message is null or length(trim(p_message)) not between 1 and 500 or p_starts is null or p_ends is null or p_announce is null or not isfinite(p_starts) or not isfinite(p_ends) or not isfinite(p_announce) or p_starts>=p_ends or p_announce>p_starts or p_ends<=now() then raise exception 'Invalid plan' using errcode='22023';end if;
  if p_id is not null and not exists(select 1 from study_private.maintenance_plans where id=p_id and revision=p_revision and not cancelled) then raise exception 'Plan changed; reload' using errcode='40001';end if;
  if exists(select 1 from study_private.maintenance_plans where not cancelled and id<>coalesce(p_id,'00000000-0000-0000-0000-000000000000'::uuid) and starts_at<p_ends and ends_at>p_starts) then raise exception 'Overlapping maintenance' using errcode='23P01';end if;
  if p_id is null then
   if (select count(*) from study_private.maintenance_plans where not cancelled and ends_at>now())>=50 then raise exception 'Too many plans' using errcode='54000';end if;
   insert into study_private.maintenance_plans(title,message,starts_at,ends_at,announce_at,updated_by) values(trim(p_title),trim(p_message),p_starts,p_ends,p_announce,auth.uid()) returning id into row_id;
  else
   update study_private.maintenance_plans set title=trim(p_title),message=trim(p_message),starts_at=p_starts,ends_at=p_ends,announce_at=p_announce,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=p_id returning id into row_id;
  end if;
 else raise exception 'Invalid plan operation' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'id',coalesce(row_id,p_id));
end $$;
revoke all on function public.study_maintenance_plan(text,uuid,text,text,timestamptz,timestamptz,timestamptz,bigint) from public,anon;
grant execute on function public.study_maintenance_plan(text,uuid,text,text,timestamptz,timestamptz,timestamptz,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
