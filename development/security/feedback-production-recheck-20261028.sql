begin;
do $test$
declare actor uuid; sender uuid; sid uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); own_id uuid:=gen_random_uuid(); rev bigint; result jsonb; denied boolean;
begin
 select owner_id into actor from study_private.settings where singleton;
 select user_id into sender from study_private.admin_members where user_id<>actor limit 1;
 if sender is null then raise exception 'Distinct fixture sender required';end if;
 insert into study_private.feedback(id,sender,category,body,images,image_bytes,state) values
 (other_id,sender,'bug','監査専用・他人の送信履歴テスト。終了時に取り消し。','[]',0,'ready'),
 (own_id,actor,'bug','監査専用・本人の送信履歴テスト。終了時に取り消し。','[]',0,'ready');
 denied:=false;begin perform public.study_feedback(actor,'detail',jsonb_build_object('id',other_id));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unverified administrator read another sender detail';end if;
 denied:=false;begin perform public.study_feedback(actor,'list',jsonb_build_object('page',1,'admin',true));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unverified administrator listed other senders';end if;
 denied:=false;begin perform public.study_feedback(actor,'stats','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unverified administrator stats bypass';end if;
 result:=public.study_feedback(actor,'detail',jsonb_build_object('id',own_id));
 if result->>'id'<>own_id::text then raise exception 'Own feedback no longer readable';end if;
 result:=public.study_feedback(actor,'list',jsonb_build_object('page',1));
 if exists(select 1 from jsonb_array_elements(result->'items') x where x->>'id'=other_id::text) then raise exception 'Own list contains another sender';end if;
 select revision into rev from study_private.admin_password_settings where singleton;
 insert into auth.sessions(id,user_id,created_at,updated_at)values(sid,actor,now(),now());
 insert into study_private.admin_verified_sessions(session_id,actor,password_revision,expires_at) values(sid,actor,rev,now()+interval '5 minutes');
 result:=public.study_feedback(actor,'detail',jsonb_build_object('id',other_id,'_session',sid));
 if result->>'id'<>other_id::text then raise exception 'Verified administrator cannot read fixture';end if;
 perform public.study_feedback(actor,'list',jsonb_build_object('page',1,'admin',true,'_session',sid));
 perform public.study_feedback(actor,'stats',jsonb_build_object('_session',sid));
 delete from auth.sessions where id=sid;
 denied:=false;begin perform public.study_feedback(actor,'detail',jsonb_build_object('id',other_id,'_session',sid));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked session can read feedback';end if;
end $test$;
select 'PASS: unverified admin detail/list/stats denied; own detail/list preserved; verified admin detail/list/stats accepted; revoked session denied. Fixtures rolled back.' as result;
rollback;