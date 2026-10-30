create or replace function study_private.live_session(p_actor uuid,p_session uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select p_actor is not null and p_session is not null and exists(
 select 1 from auth.sessions s where s.user_id=p_actor and s.id=p_session
 and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function study_private.live_session(uuid,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION study_private.security_status(p_actor uuid, p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'study_private'
AS $function$
 with roles as (
  select coalesce(p_actor=(select owner_id from study_private.settings where singleton) and (study_private.active_account(p_actor) and study_private.live_session(p_actor,p_session)),false) as owner,
   coalesce((study_private.active_account(p_actor) and study_private.live_session(p_actor,p_session)) and exists(select 1 from study_private.admin_members where user_id=p_actor),false) as admin
 )
 select jsonb_build_object('maintenance',s.enabled,'message',s.message,'revision',s.revision,'owner',r.owner,'admin',r.admin,
 'adminPasswordConfigured',(select password_hash is not null from study_private.admin_password_settings where singleton),
 'adminPasswordRevision',(select revision from study_private.admin_password_settings where singleton),
 'adminVerified',r.admin and exists(select 1 from auth.sessions live where live.id=p_session and live.user_id=p_actor and (live.not_after is null or live.not_after>now())) and exists(select 1 from study_private.admin_verified_sessions v where v.actor=p_actor and v.session_id=p_session and v.expires_at>now() and v.password_revision=(select revision from study_private.admin_password_settings where singleton and password_hash is not null)),
 'allowed',not s.enabled or r.owner) || study_private.maintenance_effective(now()) || jsonb_build_object('allowed',not (study_private.maintenance_effective(now())->>'maintenance')::boolean or r.owner)
 from study_private.maintenance_settings s cross join roles r where singleton;
$function$;

create or replace function public.study_live_account()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select study_private.active_account(auth.uid()) and
 study_private.live_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;
revoke all on function public.study_live_account() from public,anon,authenticated,service_role;
grant execute on function public.study_live_account() to authenticated;
create or replace function public.study_account_access()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select public.study_live_account() and (public.study_security_status()->>'allowed')::boolean;
$$;
create policy study_live_game_save_gate on public.game_saves as restrictive for all to authenticated
 using ((select public.study_live_account())) with check ((select public.study_live_account()));
CREATE OR REPLACE FUNCTION public.game_claim_resource_grants()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_grants jsonb;
  v_data jsonb;
  v_key text;
  v_amount numeric;
  v_current numeric;
begin
  if not public.study_live_account() then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  with picked as (
    select g.id
    from public.game_resource_grants g
    where g.user_id = v_user_id and g.game_id = 'komorebi-island-v1'
    order by g.id
    for update skip locked
  ), deleted as (
    delete from public.game_resource_grants g
    using picked p
    where g.id = p.id
    returning g.resource_key, g.amount
  )
  select coalesce(jsonb_object_agg(d.resource_key, d.total), '{}'::jsonb)
  into v_grants
  from (
    select resource_key, sum(amount) as total
    from deleted
    group by resource_key
  ) d;

  if v_grants = '{}'::jsonb then
    return v_grants;
  end if;

  select gs.save_data into v_data
  from public.game_saves gs
  where gs.user_id = v_user_id and gs.game_id = 'komorebi-island-v1'
  for update;
  if not found then
    raise exception 'ゲームセーブが見つかりません';
  end if;

  for v_key, v_amount in select key, value::text::numeric from jsonb_each(v_grants)
  loop
    if v_key in ('money','bankBalance') then
      v_current := coalesce(nullif(v_data->>v_key, '')::numeric, 0);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(v_current + v_amount), true);
    else
      v_current := coalesce(nullif(v_data->'inventory'->>v_key, '')::numeric, 0);
      v_data := jsonb_set(v_data, array['inventory', v_key], to_jsonb(v_current + v_amount), true);
    end if;
  end loop;

  update public.game_saves
  set save_data = v_data, updated_at = now()
  where user_id = v_user_id and game_id = 'komorebi-island-v1';
  return v_grants;
end;
$function$;

CREATE OR REPLACE FUNCTION public.study_api_admission()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 actor uuid; k integer; slot integer; admitted boolean:=false;
begin
 -- Direct SQL maintenance has no API claims; PostgREST always sets a role.
 if not (claims ? 'role') then return;end if;
 actor:=auth.uid();
 if claims->>'role'='authenticated' and not (
  study_private.active_account(actor) and study_private.live_session(actor,nullif(claims->>'session_id','')::uuid)
 ) then raise sqlstate 'PT401' using message='ログインの有効期限を確認できません。ログインし直してください。';end if;
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
end $function$;

create or replace function study_private.guard_game_save_size()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare bytes integer;
begin
 -- Serialize per-account new slots so concurrent inserts cannot race the quota.
 if tg_op='INSERT' then
  if not pg_try_advisory_xact_lock(185718,hashtext(new.user_id::text)) then
   raise sqlstate 'PT429' using message='保存処理が進行中です。少し待って再試行してください。';
  end if;
  if not exists(select 1 from public.game_saves where user_id=new.user_id and game_id=new.game_id)
  and (select count(*) from public.game_saves where user_id=new.user_id)>=256 then
   raise exception '保存枠の上限です。既存のゲームは引き続き保存できます。' using errcode='54000';
  end if;
 end if;
 bytes:=octet_length(new.save_data::text);
 if bytes>8388608 or length(new.game_id)>128 then
  raise exception 'ゲームの保存データが上限を超えています。現在の保存は変更していません。' using errcode='54000';
 end if;
 -- Existing oversized saves remain readable. Shrinking updates remain possible.
 if (tg_op='INSERT' or bytes>octet_length(old.save_data::text))
 and pg_database_size(current_database())>419430400 then
  raise exception '保存領域の保護上限です。現在の保存は変更していません。' using errcode='54000';
 end if;
 return new;
end $$;
revoke all on function study_private.guard_game_save_size() from public,anon,authenticated,service_role;
create trigger study_game_save_size before insert or update of save_data,game_id on public.game_saves
 for each row execute function study_private.guard_game_save_size();
notify pgrst,'reload schema';
