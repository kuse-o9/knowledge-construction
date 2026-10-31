create table study_private.study_board_reports (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references study_private.study_board_posts(id) on delete cascade,
 reporter uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('暴言・誹謗中傷','個人情報','迷惑な連続投稿','勉強に関係のない投稿','その他')),
 reason text not null check(length(reason) between 1 and 500), status text not null default 'open' check(status in ('open','done')),
 revision integer not null default 1, created_at timestamptz not null default now(), resolved_at timestamptz,
 unique(reporter,post_id)
);
create index study_board_reports_status_created on study_private.study_board_reports(status,created_at desc);
create index study_board_reports_reporter_created on study_private.study_board_reports(reporter,created_at desc);
alter table study_private.study_board_reports enable row level security;
revoke all on study_private.study_board_reports from public,anon,authenticated,service_role;
create or replace function public.study_board_report(p_action text default 'report',p_post uuid default null,p_id uuid default null,
 p_category text default 'その他',p_reason text default '',p_page integer default 1,p_status text default 'open',p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();s jsonb;is_admin boolean;post study_private.study_board_posts;root study_private.study_board_posts;
 item study_private.study_board_reports;result jsonb;stamp timestamptz:=clock_timestamp();
begin
 if not public.study_live_account() then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();
 if not coalesce((s->>'allowed')::boolean,false) then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 is_admin:=coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false);
 if p_action='report' then
  if p_post is null or p_reason is null or length(trim(p_reason)) not between 1 and 500
    or p_category is null or p_category not in ('暴言・誹謗中傷','個人情報','迷惑な連続投稿','勉強に関係のない投稿','その他') then
   raise exception '通報理由を500文字以内で記入してください。' using errcode='22023';end if;
  select * into post from study_private.study_board_posts where id=p_post;
  if not found or post.hidden or post.deleted or post.actor=v_actor then raise exception 'この投稿は通報できません。' using errcode='22023';end if;
  if post.parent is not null then
   select * into root from study_private.study_board_posts where id=post.parent;
   if not found or root.hidden then raise exception 'この投稿は通報できません。' using errcode='22023';end if;
  end if;
  if not pg_try_advisory_xact_lock(185721,1) then raise sqlstate 'PT429' using message='通報が集中しています。少し待って再試行してください。';end if;
  if exists(select 1 from study_private.study_board_reports where post_id=p_post and reporter=v_actor) then return jsonb_build_object('received',true,'already',true);end if;
  if exists(select 1 from study_private.study_board_reports where reporter=v_actor and created_at>stamp-interval '15 seconds')
   or (select count(*) from study_private.study_board_reports where reporter=v_actor and created_at>stamp-interval '1 day')>=20 then
   raise sqlstate 'PT429' using message='通報の間隔を空けてください。過去24時間で20件までです。';end if;
  if (select count(*) from study_private.study_board_reports)>=5000 or pg_database_size(current_database())>419430400 then
   raise exception '通報の保存上限です。フィードバックから管理者へ連絡してください。' using errcode='54000';end if;
  insert into study_private.study_board_reports(post_id,reporter,category,reason)values(p_post,v_actor,p_category,trim(p_reason));
  return jsonb_build_object('received',true,'already',false);
 end if;
 if not is_admin then raise exception '管理者の本人確認が必要です。' using errcode='42501';end if;
 if p_action='list' then
  if p_page is null or p_page<1 or p_page>250 or p_status is null or p_status not in ('open','done','all') then raise exception '表示条件を確認してください。' using errcode='22023';end if;
  select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]') into result from (
   select r.id,r.created_at,jsonb_build_object('id',r.id,'post_id',r.post_id,'root_id',coalesce(p.parent,p.id),'title',case when p.parent is null then p.title else t.title end,
    'preview',left(p.body,300),'category',r.category,'reason',r.reason,'status',r.status,'revision',r.revision,'created_at',r.created_at,'resolved_at',r.resolved_at,
    'post_hidden',p.hidden,'thread_hidden',coalesce(t.hidden,false),'post_deleted',p.deleted) as item
   from study_private.study_board_reports r join study_private.study_board_posts p on p.id=r.post_id
   left join study_private.study_board_posts t on t.id=p.parent where p_status='all' or r.status=p_status
   order by r.created_at desc,r.id desc limit 21 offset (p_page-1)*20
  )x;
  return jsonb_build_object('reports',result);
 end if;
 if p_action<>'resolve' then raise exception '対応していない操作です。' using errcode='22023';end if;
 select * into item from study_private.study_board_reports where id=p_id for update;
 if not found then raise exception '通報が見つかりません。' using errcode='22023';end if;
 if p_revision is distinct from item.revision then raise exception '通報が更新されています。再読み込みしてください。' using errcode='40001';end if;
 update study_private.study_board_reports set status='done',resolved_at=stamp,revision=revision+1 where id=p_id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_board_report(text,uuid,uuid,text,text,integer,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.study_board_report(text,uuid,uuid,text,text,integer,text,integer) to authenticated;
notify pgrst,'reload schema';
