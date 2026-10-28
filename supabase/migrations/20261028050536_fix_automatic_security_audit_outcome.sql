do $migration$ declare d text;begin
 d:=pg_get_functiondef('public.study_security_guard_signal(uuid,uuid,text)'::regprocedure);
 d:=replace(d,'''security_auto_lock'',''blocked''','''security_auto_lock'',''success''');
 execute d;
end $migration$;