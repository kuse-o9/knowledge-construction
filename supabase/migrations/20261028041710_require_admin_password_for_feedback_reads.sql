-- Require a live dedicated-password receipt for feedback administration.
-- _session is supplied only by study-api after token verification; this RPC is service-role-only.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.study_feedback(uuid,text,jsonb)'::regprocedure);
 if position('nullif(p_input->>''_session''' in definition)=0 then
  if position('v_admin:=exists(select 1 from study_private.admin_members where user_id=p_actor);' in definition)=0 then
   raise exception 'Unexpected feedback definition; review before applying';
  end if;
  definition:=replace(definition,
   'v_admin:=exists(select 1 from study_private.admin_members where user_id=p_actor);',
   'v_admin:=coalesce((study_private.security_status(p_actor,nullif(p_input->>''_session'','''')::uuid)->>''adminVerified'')::boolean,false);');
  execute definition;
 end if;
end $migration$;
notify pgrst, 'reload schema';