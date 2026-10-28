-- A dedicated-password receipt must not outlive the Auth session it belongs to.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('study_private.security_status(uuid,uuid)'::regprocedure);
 if position('from auth.sessions' in definition)=0 then
  if position('''adminVerified'',r.admin and exists' in definition)=0 then
   raise exception 'Unexpected security_status definition; review before applying';
  end if;
  definition:=replace(definition,
   '''adminVerified'',r.admin and exists',
   '''adminVerified'',r.admin and exists(select 1 from auth.sessions live where live.id=p_session and live.user_id=p_actor and (live.not_after is null or live.not_after>now())) and exists');
  execute definition;
 end if;
end $migration$;
notify pgrst, 'reload schema';