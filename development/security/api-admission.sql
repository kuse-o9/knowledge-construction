-- Admission control for Data API transactions. No user data or counters stored.
create or replace function public.study_api_admission()
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare
 claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 actor uuid; k integer; slot integer; admitted boolean:=false;
begin
 -- Direct SQL maintenance has no API claims; PostgREST always sets a role.
 if not (claims ? 'role') then return;end if;
 actor:=auth.uid();
 -- A reserved owner lane prevents ordinary user saturation locking out recovery.
 if actor is not null and actor=(select owner_id from study_private.settings where singleton)
    and exists(select 1 from auth.sessions where user_id=actor and id=nullif(claims->>'session_id','')::uuid and (not_after is null or not_after>clock_timestamp()))
 then
  if pg_try_advisory_xact_lock(185713,100) then return;end if;
 end if;
 -- Account limits cannot be bypassed by opening more tabs/sessions.
 -- Anonymous requests share a single bounded lane group. Service calls share global capacity.
 k:=case when actor is null then 0 else hashtext(actor::text) end;
 for slot in 1..2 loop
  if pg_try_advisory_xact_lock(185714+slot,k) then admitted:=true;exit;end if;
 end loop;
 if not admitted then
  raise sqlstate 'PT429' using message='同時に実行できる処理の上限です。少し待って再試行してください。';
 end if;
 admitted:=false;
 for slot in 1..6 loop
  if pg_try_advisory_xact_lock(185713,slot) then admitted:=true;exit;end if;
 end loop;
 if not admitted then
  raise sqlstate 'PT429' using message='アクセスが集中しています。少し待って再試行してください。';
 end if;
end $$;
revoke all on function public.study_api_admission() from public,anon,authenticated,service_role;
grant execute on function public.study_api_admission() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='public.study_api_admission';
notify pgrst,'reload config';
