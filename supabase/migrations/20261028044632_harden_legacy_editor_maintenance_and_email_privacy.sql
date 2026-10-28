-- Align legacy editor RPC with scheduled maintenance and owner-only account email visibility.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.study_editor_access(text,uuid,boolean,integer,text,uuid)'::regprocedure);
 if position('Legacy editor maintenance gate' in definition)=0 then
  if position('if(select enabled from study_private.maintenance_settings where singleton)and not owner then' in definition)=0 then
   raise exception 'Unexpected legacy editor definition';
  end if;
  definition:=replace(definition,
   'if(select enabled from study_private.maintenance_settings where singleton)and not owner then raise exception ''Maintenance'' using errcode=''42501'';end if;',
   E'-- Legacy editor maintenance gate: includes scheduled plans, not only the manual flag.\n st:=study_private.security_status(actor,nullif(auth.jwt()->>''session_id'','''')::uuid);\n if not coalesce((st->>''allowed'')::boolean,false) then raise exception ''Maintenance'' using errcode=''42501'';end if;');
  definition:=replace(definition,'''email'',u.email','''email'',case when owner then u.email else null end');
  -- g is also a PL/pgSQL row variable; use an unambiguous SQL alias.
  definition:=replace(definition,'coalesce(g.approved,false),''extra'',coalesce(g.extra_daily,0)','coalesce(grants_row.approved,false),''extra'',coalesce(grants_row.extra_daily,0)');
  definition:=replace(definition,'left join study_private.editor_grants g on g.user_id=u.id','left join study_private.editor_grants grants_row on grants_row.user_id=u.id');
  execute definition;
 end if;
end $migration$;
notify pgrst, 'reload schema';