-- Serialize the small malicious-request recorder so simultaneous actors cannot overrun retention caps.
do $migration$ declare d text;begin
 d:=pg_get_functiondef('public.study_security_guard_signal(uuid,uuid,text)'::regprocedure);
 if position('pg_advisory_xact_lock' in d)=0 then
  d:=replace(d,'select owner_id into owner_actor from study_private.settings where singleton;',
   E'perform pg_advisory_xact_lock(185712,1);\n select owner_id into owner_actor from study_private.settings where singleton;');
  execute d;
 end if;
end $migration$;