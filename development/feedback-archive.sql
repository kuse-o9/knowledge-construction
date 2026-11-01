create table if not exists study_private.feedback_admin_archive (
 id uuid primary key references study_private.feedback(id) on delete cascade,
 archived boolean not null default true,updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now()
);
create table if not exists study_private.feedback_archive_history (
 id bigint generated always as identity primary key,feedback uuid not null references study_private.feedback(id) on delete cascade,
 archived boolean not null,actor uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index if not exists feedback_archive_history_feedback on study_private.feedback_archive_history(feedback,id desc);
alter table study_private.feedback_admin_archive enable row level security;
alter table study_private.feedback_archive_history enable row level security;
revoke all on study_private.feedback_admin_archive,study_private.feedback_archive_history from public,anon,authenticated;
revoke all on sequence study_private.feedback_archive_history_id_seq from public,anon,authenticated;
create or replace function public.study_feedback_archive(p_action text default 'flags',p_ids uuid[] default '{}',p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;result jsonb;old boolean;want boolean;
begin
 if not public.study_live_account()then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();if not coalesce((s->>'allowed')::boolean,false)or not coalesce((s->>'admin')::boolean,false)or not coalesce((s->>'adminVerified')::boolean,false)then raise exception '確認済み管理者専用です。' using errcode='42501';end if;
 if p_action='flags'then
  if p_ids is null or cardinality(p_ids)>50 then raise exception '一度に50件までです。' using errcode='22023';end if;
  select coalesce(jsonb_agg(id),'[]')into result from study_private.feedback_admin_archive where id=any(p_ids)and archived;
  return jsonb_build_object('archived',result);
 end if;
 if p_action is null or p_action not in ('archive','restore')or p_id is null then raise exception '操作を確認してください。' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(185727,1)then raise sqlstate 'PT429' using message='更新が集中しています。少し待ってください。';end if;
 if not exists(select 1 from study_private.feedback where id=p_id)then raise exception 'フィードバックが見つかりません。' using errcode='22023';end if;
 want:=p_action='archive';select archived into old from study_private.feedback_admin_archive where id=p_id;
 if coalesce(old,false)=want then return jsonb_build_object('archived',want);end if;
 if(select count(*)from study_private.feedback_archive_history)>=5000 or pg_database_size(current_database())>419430400 then raise exception '操作履歴の保護上限です。' using errcode='54000';end if;
 insert into study_private.feedback_admin_archive(id,archived,updated_by)values(p_id,want,auth.uid())on conflict(id)do update set archived=excluded.archived,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into study_private.feedback_archive_history(feedback,archived,actor)values(p_id,want,auth.uid());
 return jsonb_build_object('archived',want);
end $$;
revoke all on function public.study_feedback_archive(text,uuid[],uuid)from public,anon,authenticated;
grant execute on function public.study_feedback_archive(text,uuid[],uuid)to authenticated;
