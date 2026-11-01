create or replace function study_private.guard_admin_deck_card_limit()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Serialize additions to the same deck; keep existing cards and edits intact.
 perform 1 from study_private.decks where id=new.deck_id for update;
 if tg_op='INSERT' and exists(select 1 from study_private.questions where id=new.id)then return new;end if;
 if tg_op='UPDATE' and new.deck_id=old.deck_id then return new;end if;
 if(select count(*)from study_private.questions where deck_id=new.deck_id)>=150 then
  raise exception '管理者のデッキは１デッキ150問までです。既存の問題は変更していません。' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function study_private.guard_admin_deck_card_limit()from public,anon,authenticated;
drop trigger if exists study_admin_deck_card_limit on study_private.questions;
create trigger study_admin_deck_card_limit before insert or update of deck_id on study_private.questions for each row execute function study_private.guard_admin_deck_card_limit();
