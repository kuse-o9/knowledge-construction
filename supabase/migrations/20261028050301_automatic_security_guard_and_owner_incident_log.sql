-- Bounded, server-only intrusion signals. No passwords, request bodies or IP addresses stored.
create table if not exists study_private.security_guard_counters(
 actor uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), attempts integer not null default 0,
 signals text[] not null default '{}', updated_at timestamptz not null default now(),
 blocked_until timestamptz);
create table if not exists study_private.security_guard_events(
 id bigint generated always as identity primary key, actor uuid references auth.users(id) on delete set null,
 signal text not null check(signal in ('identity_spoof','id_injection','path_traversal')),
 detected_at timestamptz not null default now(), auto_locked boolean not null default false);
alter table study_private.security_guard_counters enable row level security;
alter table study_private.security_guard_events enable row level security;
revoke all on study_private.security_guard_counters,study_private.security_guard_events from public,anon,authenticated;

create or replace function public.study_security_guard_signal(p_actor uuid,p_session uuid,p_signal text)
returns jsonb language plpgsql security definer set search_path='pg_catalog' as $$
declare c study_private.security_guard_counters; owner_actor uuid; locked boolean:=false; t timestamptz:=clock_timestamp();
begin
 if p_signal is null or p_signal not in ('identity_spoof','id_injection','path_traversal') then raise exception 'Invalid security signal' using errcode='22023';end if;
 if p_actor is null or p_session is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_actor and u.email_confirmed_at is not null and (s.not_after is null or s.not_after>t)) then
  return jsonb_build_object('blocked',true,'recorded',false);
 end if;
 select owner_id into owner_actor from study_private.settings where singleton;
 if exists(select 1 from study_private.security_guard_counters where actor=p_actor and blocked_until>t) then return jsonb_build_object('blocked',true,'recorded',false);end if;
 delete from study_private.security_guard_counters where updated_at<t-interval '7 days' and coalesce(blocked_until,t)<t;
 insert into study_private.security_guard_counters(actor,window_start,attempts,signals,updated_at)
 values(p_actor,t,1,array[p_signal],t)
 on conflict(actor) do update set
  attempts=case when study_private.security_guard_counters.window_start<t-interval '5 minutes' then 1 else least(1000,study_private.security_guard_counters.attempts+1)end,
  signals=case when study_private.security_guard_counters.window_start<t-interval '5 minutes' then array[p_signal] else array(select distinct x from unnest(study_private.security_guard_counters.signals||array[p_signal])x)end,
  window_start=case when study_private.security_guard_counters.window_start<t-interval '5 minutes' then t else study_private.security_guard_counters.window_start end,
  updated_at=t
 returning * into c;
 if c.attempts>=8 and cardinality(c.signals)>=2 then
  perform 1 from study_private.maintenance_settings where singleton for update;
  update study_private.maintenance_settings set enabled=true,message='外部からの不正アクセスがあったため',revision=revision+1,updated_at=t where singleton;
  if p_actor<>owner_actor then update study_private.security_guard_counters set blocked_until=t+interval '24 hours' where actor=p_actor;end if;
  insert into study_private.audit_events(actor,action,outcome,details,protected)
   values(p_actor,'security_auto_lock','blocked',jsonb_build_object('attempts',c.attempts,'signals',to_jsonb(c.signals)),true);
  -- Reset the counting window after triggering; a blocked actor cannot immediately retrigger.
  update study_private.security_guard_counters set attempts=0,signals='{}',window_start=t where actor=p_actor;
  locked:=true;
 end if;
 insert into study_private.security_guard_events(actor,signal,auto_locked)values(p_actor,p_signal,locked);
 delete from study_private.security_guard_events where id in(select id from study_private.security_guard_events order by id desc offset 100);
 return jsonb_build_object('blocked',true,'recorded',true,'locked',locked);
end $$;
revoke all on function public.study_security_guard_signal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.study_security_guard_signal(uuid,uuid,text) to service_role;

-- An attacker with an established account also loses its study RPC access temporarily.
do $migration$ declare d text;begin
 d:=pg_get_functiondef('study_private.active_account(uuid)'::regprocedure);
 if position('security_guard_counters' in d)=0 then
  if position('select p_id is not null' in d)=0 then raise exception 'Unexpected active_account definition';end if;
  d:=replace(d,'select p_id is not null','select not exists(select 1 from study_private.security_guard_counters g where g.actor=p_id and g.blocked_until>now()) and p_id is not null');
  execute d;
 end if;
end $migration$;

create or replace function public.study_security_guard_admin(p_action text default 'status',p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog' as $$
declare st jsonb;begin
 perform study_private.assert_admin_verified();st:=public.study_security_status();
 if not coalesce((st->>'owner')::boolean,false) then raise exception 'Owner required' using errcode='42501';end if;
 if p_action='unblock' then
  if p_actor is null then raise exception 'Account required' using errcode='22023';end if;
  update study_private.security_guard_counters set blocked_until=null,attempts=0,signals='{}',window_start=now() where actor=p_actor;
  insert into study_private.audit_events(actor,action,target,outcome,details,protected) values(auth.uid(),'security_unblock',p_actor,'success','{}',true);
 elsif p_action<>'status' then raise exception 'Invalid security operation' using errcode='22023';end if;
 return jsonb_build_object('enabled',true,'threshold',8,'windowMinutes',5,'requiredSignalTypes',2,
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.detected_at desc) from (
  select g.id,g.actor,u.email,g.signal,g.detected_at,g.auto_locked from study_private.security_guard_events g
  left join auth.users u on u.id=g.actor order by g.id desc limit 100)e),'[]'::jsonb),
 'blocked',coalesce((select jsonb_agg(jsonb_build_object('actor',g.actor,'email',u.email,'until',g.blocked_until)) from study_private.security_guard_counters g join auth.users u on u.id=g.actor where g.blocked_until>now()),'[]'::jsonb));
end $$;
revoke all on function public.study_security_guard_admin(text,uuid) from public,anon;
grant execute on function public.study_security_guard_admin(text,uuid) to authenticated;
notify pgrst,'reload schema';