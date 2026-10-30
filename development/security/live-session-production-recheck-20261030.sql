begin;
do $$declare actor uuid;st jsonb;denied boolean:=false;begin
select owner_id into actor from study_private.settings where singleton;
perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
st:=public.study_security_status();
if (st->>'owner')::boolean or (st->>'admin')::boolean or (st->>'adminVerified')::boolean then raise exception 'Dead owner session accepted';end if;
if public.study_live_account() or public.study_account_access() then raise exception 'Dead account access';end if;
begin perform public.study_api_admission();exception when sqlstate 'PT401' then denied:=true;end;
if not denied then raise exception 'Dead API access';end if;
if exists(select 1 from public.game_saves where user_id=actor) then raise exception 'Revoked save read';end if;
denied:=false;begin perform public.game_claim_resource_grants();exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Revoked grant claim';end if;
denied:=false;begin perform count(*) from study_private.admin_password_settings;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Password table visible';end if;
denied:=false;begin perform count(*) from auth.users;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Account table visible';end if;
reset role;
end$$;
select 'PASS: nonexistent owner session cannot access owner/admin/account/API' as result;
rollback;
begin;
do $$declare denied boolean:=false;n integer;begin
if not exists(select 1 from public.game_saves) then raise exception 'No save available; test not run';end if;
begin
update public.game_saves set save_data=jsonb_build_object('oversize_test',repeat('x',8388609))
where (user_id,game_id)=(select user_id,game_id from public.game_saves limit 1);
exception when sqlstate '54000' then denied:=true;end;
if not denied then raise exception 'Oversized save accepted; rollback';end if;
end$$;
select 'PASS: oversized save rejected before replacement; transaction rolled back' as result;
rollback;
begin;
do $$declare u uuid;prefix text:=gen_random_uuid()::text;i integer;denied boolean:=false;n integer;begin
select user_id into u from public.game_saves limit 1;
if u is null then raise exception 'No test subject; skipped';end if;
for i in 1..256 loop
 begin
 insert into public.game_saves(user_id,game_id,save_data)values(u,'audit-'||prefix||'-'||i,'{}');
 exception when sqlstate '54000' then denied:=true;exit;end;
end loop;
select count(*) into n from public.game_saves where user_id=u;
if not denied or n<>256 then raise exception 'Save quota bypass';end if;
insert into public.game_saves(user_id,game_id,save_data)
select user_id,game_id,save_data from public.game_saves where user_id=u limit 1
on conflict(user_id,game_id) do update set save_data=excluded.save_data;
end$$;
select 'PASS: new save slots bounded at 256; existing upsert still works; rollback all fixtures' as result;
rollback;