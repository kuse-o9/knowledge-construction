begin;
do $test$
declare a uuid; denied boolean;
begin
 select owner_id into a from study_private.settings where singleton;
 denied:=false;begin perform public.study_personal(a,'get',jsonb_build_object('id',''' OR ''1''=''1'));exception when invalid_text_representation then denied:=true;end;
 if not denied then raise exception 'SQL-like ID was accepted';end if;
 denied:=false;begin perform public.study_personal(a,'get'' OR ''1''=''1',jsonb_build_object('id',gen_random_uuid()));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'SQL-like action was accepted';end if;
end $test$;
select 'PASS: SQL-like input is rejected as invalid data, not executed as a database instruction. ROLLBACK.' as result;
rollback;