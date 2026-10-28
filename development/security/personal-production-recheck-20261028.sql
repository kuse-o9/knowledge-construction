begin;
do $test$
declare a uuid; b uuid; d uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); r jsonb; denied boolean; i integer; count_decks integer;
begin
 select owner_id into a from study_private.settings where singleton;
 select user_id into b from study_private.admin_members where user_id<>a limit 1;
 if b is null then raise exception 'Second account required';end if;
 r:=public.study_personal(a,'save_deck',jsonb_build_object('id',d,'revision',0,'title','監査専用・全変更ROLLBACK','description','','genre','監査','subject','監査','grade','監査'));
 denied:=false;begin perform public.study_personal(b,'get',jsonb_build_object('id',d));exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'Cross-account personal deck read';end if;
 denied:=false;begin perform public.study_personal(b,'save_deck',jsonb_build_object('id',d,'revision',1,'title','changed','description','','genre','監査','subject','監査','grade','監査'));exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'Cross-account personal deck edit';end if;
 denied:=false;begin perform public.study_personal(b,'delete_deck',jsonb_build_object('id',d,'revision',1,'confirm','削除する','publication_revision',0,'question_versions','[]'::jsonb));exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'Cross-account personal deck delete';end if;
 r:=public.study_personal(a,'save_question',jsonb_build_object('id',q,'deck_id',d,'revision',0,'prompt','監査用 1+1','answer','2','explanation','','hint','','position',0));
 denied:=false;begin perform public.study_personal(b,'save_question',jsonb_build_object('id',gen_random_uuid(),'deck_id',d,'revision',0,'prompt','監査','answer','2','explanation','','hint','','position',1));exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'Cross-account question insertion';end if;
 denied:=false;begin perform public.study_personal(a,'save_deck',jsonb_build_object('id',d,'revision',999,'title','stale','description','','genre','監査','subject','監査','grade','監査'));exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale deck revision accepted';end if;
 insert into study_private.personal_questions(id,deck_id,prompt,answer,explanation,hint,position)
 select gen_random_uuid(),d,'監査上限テスト','2','','',g from generate_series(1,149)g;
 denied:=false;begin perform public.study_personal(a,'save_question',jsonb_build_object('id',gen_random_uuid(),'deck_id',d,'revision',0,'prompt','151問目','answer','2','explanation','','hint','','position',149));exception when sqlstate 'P0001' then denied:=true;end;
 if not denied then raise exception '150 question cap bypass';end if;
 select count(*) into count_decks from study_private.personal_decks where owner_id=a;
 for i in count_decks+1..10 loop
  insert into study_private.personal_decks(id,owner_id,title,description,genre,subject,grade)values(gen_random_uuid(),a,'監査上限テスト','','監査','監査','監査');
 end loop;
 denied:=false;begin perform public.study_personal(a,'save_deck',jsonb_build_object('id',gen_random_uuid(),'revision',0,'title','11個目','description','','genre','監査','subject','監査','grade','監査'));exception when sqlstate 'P0001' then denied:=true;end;
 if not denied then raise exception '10 deck cap bypass';end if;
 if public.study_account(a,'self_info')->>'canDelete' <> 'false' then raise exception 'Owner self-deletion protection failed';end if;
end $test$;
select 'PASS: personal deck create/question save, cross-account read/edit/delete/question denial, stale revision denial, 150-question and 10-deck limits, owner self-deletion protection. ROLLBACK.' as result;
rollback;