-- RETIRED FEATURE: AI correction was removed at user request on2026-10-26. Historical migration only; do not reintroduce AI access UI or inference.
begin;
create table if not exists study_private.editor_grants(user_id uuid primary key references auth.users(id) on delete cascade,approved boolean not null default false,extra_daily integer not null default 0 check(extra_daily between 0 and 10000));
create table if not exists study_private.editor_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,reason text not null check(length(reason) between 1 and 500),status text not null default 'pending' check(status in('pending','approved','rejected')),created_at timestamptz not null default now());
create unique index if not exists editor_one_pending on study_private.editor_requests(user_id)where status='pending';
create table if not exists study_private.editor_jobs(id uuid primary key,user_id uuid not null references auth.users(id)on delete cascade,day date not null,status text not null check(status in('reserved','completed','failed')),created_at timestamptz not null default now());
alter table study_private.editor_grants enable row level security;
alter table study_private.editor_requests enable row level security;
alter table study_private.editor_jobs enable row level security;
revoke all on study_private.editor_grants,study_private.editor_requests,study_private.editor_jobs from public,anon,authenticated;
create or replace function public.study_editor_access(p_action text default 'status',p_target uuid default null,p_approved boolean default null,p_extra integer default null,p_reason text default '',p_request uuid default null)returns jsonb language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare actor uuid:=auth.uid(); owner boolean; lim integer; n integer; g study_private.editor_grants; users jsonb; target uuid;st jsonb;
begin
 if actor is null or not study_private.active_account(actor)then raise exception 'Sign in required' using errcode='42501';end if;
 owner:=coalesce(actor=(select owner_id from study_private.settings where singleton),false);
 if(select enabled from study_private.maintenance_settings where singleton)and not owner then raise exception 'Maintenance' using errcode='42501';end if;
 if p_action='status' then
 select * into g from study_private.editor_grants where user_id=actor;
 lim:=case when owner then null when coalesce(g.approved,false)then 5 else 1 end+coalesce(g.extra_daily,0);
 select count(*)into n from study_private.editor_jobs where user_id=actor and day=(now()at time zone'Asia/Tokyo')::date and status in('reserved','completed');
 return jsonb_build_object('owner',owner,'approved',coalesce(g.approved,false),'limit',lim,'used',n,'day',(now()at time zone'Asia/Tokyo')::date);
 elsif p_action='request' then
 if length(trim(p_reason))not between 1 and 500 then raise exception 'Reason required';end if;
 insert into study_private.editor_requests(user_id,reason)values(actor,trim(p_reason))on conflict(user_id)where status='pending'do update set reason=excluded.reason;
 return jsonb_build_object('requested',true);
 end if;
 st:=study_private.security_status(actor,nullif(auth.jwt()->>'session_id','')::uuid);
 if not coalesce((st->>'adminVerified')::boolean,false)then raise exception 'Verified administrator required'using errcode='42501';end if;
 perform public.study_dispatch(actor,'admin_bootstrap','{}'::jsonb);
 if p_action='list'then
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'approved',coalesce(g.approved,false),'extra',coalesce(g.extra_daily,0))order by u.created_at),'[]'::jsonb)into users from auth.users u left join study_private.editor_grants g on g.user_id=u.id;
 return jsonb_build_object('owner',owner,'users',users,'requests',(select coalesce(jsonb_agg(to_jsonb(r)order by created_at desc),'[]'::jsonb)from study_private.editor_requests r where status='pending'));
 elsif p_action='approve'then
 if p_target is null or p_approved is null then raise exception 'Invalid grant';end if;
 insert into study_private.editor_grants(user_id,approved)values(p_target,p_approved)on conflict(user_id)do update set approved=excluded.approved;
 elsif p_action='extra'then
 if not owner then raise exception 'Owner required'using errcode='42501';end if;
 if p_extra is null or p_extra not between 0 and 10000 then raise exception 'Invalid allowance';end if;
 select user_id into target from study_private.editor_requests where id=p_request and status='pending'for update;
 if target is null then raise exception 'Pending request required';end if;
 insert into study_private.editor_grants(user_id,extra_daily)values(target,p_extra)on conflict(user_id)do update set extra_daily=excluded.extra_daily;
 update study_private.editor_requests set status=case when p_extra>0 then'approved'else'rejected'end where id=p_request;
 else raise exception 'Invalid action';end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.study_editor_access(text,uuid,boolean,integer,text,uuid)from public,anon;
grant execute on function public.study_editor_access(text,uuid,boolean,integer,text,uuid)to authenticated;
create or replace function public.study_editor_job(p_actor uuid,p_job uuid,p_action text)returns jsonb language plpgsql security definer set search_path=pg_catalog,study_private as $$
declare owner boolean; lim integer; n integer;g study_private.editor_grants;j study_private.editor_jobs;v_day date:=(now()at time zone'Asia/Tokyo')::date;
begin
 if p_actor is null or p_job is null or not study_private.active_account(p_actor)then raise exception 'Active account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,812));
 owner:=coalesce(p_actor=(select owner_id from study_private.settings where singleton),false);
 if(select enabled from study_private.maintenance_settings where singleton)and not owner then raise exception 'Maintenance';end if;
 select * into j from study_private.editor_jobs where id=p_job for update;
 if j.id is not null and j.user_id<>p_actor then raise exception 'Job owner mismatch';end if;
 if p_action='reserve'then
 if j.id is not null then return jsonb_build_object('allowed',false,'reason','duplicate');end if;
 select * into g from study_private.editor_grants where user_id=p_actor;
 lim:=case when owner then null when coalesce(g.approved,false)then 5 else 1 end+coalesce(g.extra_daily,0);
 select count(*)into n from study_private.editor_jobs where user_id=p_actor and editor_jobs.day=v_day and status in('reserved','completed');
 if lim is not null and n>=lim then return jsonb_build_object('allowed',false,'reason','daily_limit');end if;
 insert into study_private.editor_jobs(id,user_id,day,status)values(p_job,p_actor,v_day,'reserved');
 elsif p_action in('complete','fail')then
 if j.id is null then raise exception 'Job not found';end if;
 update study_private.editor_jobs set status=case when p_action='complete'then'completed'else'failed'end where id=p_job and status='reserved';
 else raise exception 'Invalid action';end if;
 return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.study_editor_job(uuid,uuid,text)from public,anon,authenticated;
grant execute on function public.study_editor_job(uuid,uuid,text)to service_role;
notify pgrst,'reload schema';
commit;
