do $migration$ declare d text;begin
 d:=pg_get_functiondef('public.study_security_guard_signal(uuid,uuid,text)'::regprocedure);
 d:=replace(d,'and coalesce(blocked_until,t)<t;','and (blocked_until is null or blocked_until<t);');
 if position('capacity' in d)=0 then
  d:=replace(d,'insert into study_private.security_guard_counters(actor,window_start,attempts,signals,updated_at)',
   E'if not exists(select 1 from study_private.security_guard_counters where actor=p_actor) and (select count(*) from study_private.security_guard_counters)>=1024 then return jsonb_build_object(''blocked'',true,''recorded'',false,''capacity'',true);end if;\n insert into study_private.security_guard_counters(actor,window_start,attempts,signals,updated_at)');
 end if;
 execute d;
end $migration$;