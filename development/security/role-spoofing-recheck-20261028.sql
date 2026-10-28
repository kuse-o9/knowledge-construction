begin;
do $test$
declare u uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); owner_actor uuid; st jsonb; denied boolean; n bigint;
begin
 select owner_id into owner_actor from study_private.settings where singleton;
 -- Synthetic identity exists only inside this transaction: no password, no email, no browser session.
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
 values(u,'audit-'||u::text||'@example.invalid',now(),'{"nickname":"監査用一時ユーザー","admin":true,"owner":true,"role":"service_role"}','{}');
 insert into auth.sessions(id,user_id,created_at,updated_at)values(sid,u,now(),now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',sid,'role','authenticated','user_metadata',jsonb_build_object('admin',true,'owner',true,'role','service_role'))::text,true);
 set local role authenticated;
 st:=public.study_security_status();
 if (st->>'admin')::boolean or (st->>'owner')::boolean or (st->>'adminVerified')::boolean then raise exception 'User metadata privilege escalation';end if;
 if (st->>'allowed')::boolean then raise exception 'Non-owner maintenance bypass';end if;
 if public.game_admin_is_admin() then raise exception 'Legacy metadata privilege escalation';end if;
 denied:=false;begin perform public.study_admin_summary();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Admin summary unauthorized';end if;
 denied:=false;begin perform public.study_game_admin('list');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Game admin unauthorized';end if;
 denied:=false;begin perform public.study_security_admin(false,'audit',0);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Maintenance owner operation unauthorized';end if;
 denied:=false;begin perform public.study_dispatch(owner_actor,'admin_bootstrap','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Actor spoof into service-only RPC';end if;
 denied:=false;begin perform count(*) from auth.users;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Auth user table readable';end if;
 denied:=false;begin perform count(*) from study_private.admin_password_settings;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Admin password hash readable';end if;
 denied:=false;begin perform count(*) from study_private.feedback;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Private feedback table readable';end if;
 select count(*) into n from public.study_profiles where id<>u;
 if n<>0 then raise exception 'Other profiles visible';end if;
 select count(*) into n from storage.objects where bucket_id in ('study-feedback','study-images');
 if n<>0 then raise exception 'Private media object paths visible';end if;
 reset role;
end $test$;
select 'PASS: synthetic user metadata cannot grant administrator/owner authority, maintenance bypass denied, direct account/hash/feedback/other-profile/private-media reads denied, service actor spoof denied. All fixtures ROLLBACK.' as result;
rollback;