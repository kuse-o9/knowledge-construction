begin;
do $test$
declare owner_actor uuid; admin_actor uuid; owner_sid uuid:=gen_random_uuid(); admin_sid uuid:=gen_random_uuid(); rev bigint; r jsonb; denied boolean;
begin
 select owner_id into owner_actor from study_private.settings where singleton;
 select user_id into admin_actor from study_private.admin_members where user_id<>owner_actor limit 1;
 select revision into rev from study_private.admin_password_settings where singleton;
 if owner_actor is null or admin_actor is null then raise exception 'Required audit roles missing';end if;
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_actor,now(),now()),(admin_sid,admin_actor,now(),now());
 insert into study_private.admin_verified_sessions(session_id,actor,password_revision,expires_at)
 values(owner_sid,owner_actor,rev,now()+interval '5 minutes'),(admin_sid,admin_actor,rev,now()+interval '5 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'session_id',admin_sid,'role','authenticated')::text,true);
 set local role authenticated;
 if (public.study_security_status()->>'allowed')::boolean then raise exception 'Scheduled maintenance must be active for this regression';end if;
 denied:=false;begin perform public.study_editor_access('status');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Scheduled maintenance status bypass';end if;
 denied:=false;begin perform public.study_editor_access('list');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Scheduled maintenance admin bypass';end if;
 denied:=false;begin perform public.study_editor_access('request',p_reason=>'監査用・残さない');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Scheduled maintenance request bypass';end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_actor,'session_id',owner_sid,'role','authenticated')::text,true);
 set local role authenticated;
 r:=public.study_editor_access('list');
 if r->>'owner'<>'true' or not exists(select 1 from jsonb_array_elements(r->'users') u where u->>'email' is not null) then raise exception 'Owner view failed';end if;
 reset role;
 -- Transaction-only fixture: test the non-owner projection without changing live maintenance.
 update study_private.maintenance_plans set cancelled=true where not cancelled;
 update study_private.maintenance_settings set enabled=false where singleton;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'session_id',admin_sid,'role','authenticated')::text,true);
 set local role authenticated;
 r:=public.study_editor_access('list');
 if r->>'owner'<>'false' or exists(select 1 from jsonb_array_elements(r->'users') u where u->>'email' is not null) then raise exception 'Non-owner email exposure';end if;
 reset role;
 delete from auth.sessions where id=admin_sid;
 set local role authenticated;
 denied:=false;begin perform public.study_editor_access('list');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked editor admin session';end if;
 reset role;
end $test$;
select 'PASS: scheduled maintenance blocks legacy status/request/admin list; owner list works; non-owner projection omits email; revoked session rejected. No account information returned. All changes ROLLBACK.' as result;
rollback;