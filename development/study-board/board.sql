create table study_private.study_board_posts (
 id uuid primary key, actor uuid not null references auth.users(id) on delete cascade,
 parent uuid references study_private.study_board_posts(id) on delete cascade,
 title text not null default '' check(length(title)<=100), body text not null check(length(body)<=3000),
 category text not null check(category in ('数学','英語','理科','社会','国語','勉強法','その他')),
 author_label text not null, hidden boolean not null default false, deleted boolean not null default false,
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index study_board_parent_created on study_private.study_board_posts(parent,created_at desc);
create index study_board_actor_created on study_private.study_board_posts(actor,created_at desc);
alter table study_private.study_board_posts enable row level security;
revoke all on study_private.study_board_posts from public,anon,authenticated,service_role;
create or replace function public.study_board(p_action text default 'list',p_id uuid default null,p_parent uuid default null,
 p_title text default '',p_body text default '',p_category text default 'その他',p_page integer default 1,p_query text default '',p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();s jsonb;is_admin boolean;row study_private.study_board_posts;root study_private.study_board_posts;
 result jsonb;label text;stamp timestamptz:=clock_timestamp();
begin
 if not public.study_live_account() then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();
 if not coalesce((s->>'allowed')::boolean,false) then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 is_admin:=coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false);
 if p_page is null or p_page<1 or p_page>250 or p_query is null or length(p_query)>60 then raise exception '検索条件を確認してください。' using errcode='22023';end if;
 if p_action in ('list','moderation') then
  if p_action='moderation' and not is_admin then raise exception '管理者の本人確認が必要です。' using errcode='42501';end if;
  select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]') into result from (
   select b.id,b.created_at,jsonb_build_object('id',b.id,'title',b.title,'category',b.category,'author',b.author_label,'created_at',b.created_at,
    'revision',b.revision,'hidden',b.hidden,'deleted',b.deleted,'mine',b.actor=v_actor,
    'replies',(select count(*) from study_private.study_board_posts r where r.parent=b.id and not r.hidden)) as item
   from study_private.study_board_posts b where b.parent is null and (p_action='moderation' or not b.hidden)
    and (p_query='' or strpos(lower(b.title||' '||b.body),lower(p_query))>0)
   order by b.created_at desc,b.id desc limit 21 offset (p_page-1)*20
  )x;
  return jsonb_build_object('posts',result,'admin',is_admin);
 end if;
 if p_action='get' then
  select * into root from study_private.study_board_posts where id=p_id and parent is null;
  if not found or root.hidden and not is_admin then raise exception '投稿が見つかりません。' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'body',b.body,'category',b.category,'author',b.author_label,
   'created_at',b.created_at,'revision',b.revision,'mine',b.actor=v_actor,'hidden',b.hidden,'deleted',b.deleted,'parent',b.parent)
   order by b.created_at,b.id),'[]') into result from study_private.study_board_posts b
   where (b.id=p_id or b.parent=p_id) and (not b.hidden or is_admin);
  return jsonb_build_object('posts',result,'admin',is_admin);
 end if;
 if p_action='post' then
  if p_id is null or p_body is null or length(trim(p_body)) not between 1 and 3000
   or p_category is null or p_category not in ('数学','英語','理科','社会','国語','勉強法','その他')
   or p_title is null or length(p_title)>100 or (p_parent is null and length(trim(p_title))=0)
   then raise exception '題名・本文・教科を確認してください。' using errcode='22023';end if;
  -- Bounded storage; try-lock rejects contention rather than making a queue.
  if not pg_try_advisory_xact_lock(185720,1) then raise sqlstate 'PT429' using message='投稿が集中しています。少し待って再試行してください。';end if;
  select * into row from study_private.study_board_posts where id=p_id;
  if found then
   if row.actor=v_actor and row.parent is not distinct from p_parent then return jsonb_build_object('id',row.id,'parent',row.parent);end if;
   raise exception '投稿番号が使われています。' using errcode='22023';
  end if;
  if exists(select 1 from study_private.study_board_posts where actor=v_actor and created_at>stamp-interval '10 seconds')
   or (select count(*) from study_private.study_board_posts where actor=v_actor and created_at>stamp-interval '1 day')>=50
   then raise sqlstate 'PT429' using message='投稿間隔を空けてください。投稿は1日50件までです。';end if;
  if (select count(*) from study_private.study_board_posts)>=5000 or pg_database_size(current_database())>419430400
   then raise exception '掲示板の保存上限です。既存の投稿は読めます。' using errcode='54000';end if;
  if p_parent is not null then
   select * into root from study_private.study_board_posts where id=p_parent and parent is null;
   if not found or root.hidden or root.deleted then raise exception '返信できない投稿です。' using errcode='22023';end if;
   if (select count(*) from study_private.study_board_posts where parent=p_parent)>=100 then raise exception '返信は100件までです。' using errcode='54000';end if;
  end if;
  label:=case when (s->>'owner')::boolean then 'オーナー' when (s->>'admin')::boolean then '管理者' else '利用者'||upper(substr(md5(v_actor::text),1,6)) end;
  insert into study_private.study_board_posts(id,actor,parent,title,body,category,author_label)
   values(p_id,v_actor,p_parent,case when p_parent is null then trim(p_title) else '' end,trim(p_body),case when p_parent is null then p_category else root.category end,label);
  return jsonb_build_object('id',p_id,'parent',p_parent);
 end if;
 if p_action not in ('delete','hide','show') then raise exception '対応していない操作です。' using errcode='22023';end if;
 select * into row from study_private.study_board_posts where id=p_id for update;
 if not found then raise exception '投稿が見つかりません。' using errcode='22023';end if;
 if p_action='delete' and row.actor<>v_actor or p_action in ('hide','show') and not is_admin then raise exception '操作する権限がありません。' using errcode='42501';end if;
 if p_revision is distinct from row.revision then raise exception '投稿が更新されています。開き直してください。' using errcode='40001';end if;
 if p_action='delete' then
  update study_private.study_board_posts set title=case when parent is null then '削除済みの投稿' else '' end,body='投稿者が削除しました。',deleted=true,revision=revision+1,updated_at=stamp where id=p_id;
 else update study_private.study_board_posts set hidden=p_action='hide',revision=revision+1,updated_at=stamp where id=p_id;end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_board(text,uuid,uuid,text,text,text,integer,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.study_board(text,uuid,uuid,text,text,text,integer,text,integer) to authenticated;
notify pgrst,'reload schema';
