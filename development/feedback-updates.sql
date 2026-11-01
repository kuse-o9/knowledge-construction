alter table study_private.feedback add column if not exists status_changed_at timestamptz;
create index if not exists feedback_sender_status_changed on study_private.feedback(sender,status_changed_at desc nulls last);
create or replace function study_private.feedback_status_timestamp()
returns trigger language plpgsql set search_path=pg_catalog as $$begin
 if new.status is distinct from old.status then new.status_changed_at:=clock_timestamp();end if;return new;
end $$;
revoke all on function study_private.feedback_status_timestamp()from public,anon,authenticated;
create or replace trigger feedback_status_timestamp before update of status on study_private.feedback for each row execute function study_private.feedback_status_timestamp();
create or replace function public.study_feedback_updates()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare result jsonb;s jsonb;begin
 if not public.study_live_account()then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();if not coalesce((s->>'allowed')::boolean,false)then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 select coalesce(jsonb_agg(x.item order by x.changed desc,x.id),'[]')into result from(
  select id,coalesce(status_changed_at,created_at)changed,jsonb_build_object('id',id,'status',status,'revision',revision,'created_at',created_at)item
  from study_private.feedback where sender=auth.uid()and status in ('checking','done')order by coalesce(status_changed_at,created_at)desc,id limit 20
 )x;return jsonb_build_object('items',result);
end $$;
revoke all on function public.study_feedback_updates()from public,anon,authenticated;
grant execute on function public.study_feedback_updates()to authenticated;
