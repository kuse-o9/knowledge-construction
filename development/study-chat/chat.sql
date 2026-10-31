alter table study_private.study_board_posts add column channel text not null default 'board' check(channel in ('board','chat'));
alter table study_private.study_board_posts add constraint chat_message_no_parent check(channel<>'chat' or parent is null);
create index study_board_channel_room_cursor on study_private.study_board_posts(channel,category,created_at desc,id desc);
create index study_board_reports_post_status on study_private.study_board_reports(post_id,status);
CREATE OR REPLACE FUNCTION public.study_board(p_action text DEFAULT 'list'::text, p_id uuid DEFAULT NULL::uuid, p_parent uuid DEFAULT NULL::uuid, p_title text DEFAULT ''::text, p_body text DEFAULT ''::text, p_category text DEFAULT 'その他'::text, p_page integer DEFAULT 1, p_query text DEFAULT ''::text, p_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
   from study_private.study_board_posts b where b.parent is null and b.channel='board' and (p_action='moderation' or not b.hidden)
    and (p_query='' or strpos(lower(b.title||' '||b.body),lower(p_query))>0)
   order by b.created_at desc,b.id desc limit 21 offset (p_page-1)*20
  )x;
  return jsonb_build_object('posts',result,'admin',is_admin);
 end if;
 if p_action='get' then
  select * into root from study_private.study_board_posts where id=p_id and parent is null and channel='board';
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
   if row.channel<>'board' then raise exception '投稿番号が使われています。' using errcode='22023';end if;
   if row.actor=v_actor and row.parent is not distinct from p_parent then return jsonb_build_object('id',row.id,'parent',row.parent);end if;
   raise exception '投稿番号が使われています。' using errcode='22023';
  end if;
  if exists(select 1 from study_private.study_board_posts where actor=v_actor and channel='board' and created_at>stamp-interval '10 seconds')
   or (select count(*) from study_private.study_board_posts where actor=v_actor and channel='board' and created_at>stamp-interval '1 day')>=50
   then raise sqlstate 'PT429' using message='投稿間隔を空けてください。投稿は1日50件までです。';end if;
  if (select count(*) from study_private.study_board_posts where channel='board')>=5000 or pg_database_size(current_database())>419430400
   then raise exception '掲示板の保存上限です。既存の投稿は読めます。' using errcode='54000';end if;
  if p_parent is not null then
   select * into root from study_private.study_board_posts where id=p_parent and parent is null and channel='board';
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
end $function$;
CREATE OR REPLACE FUNCTION public.study_board_report(p_action text DEFAULT 'report'::text, p_post uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_category text DEFAULT 'その他'::text, p_reason text DEFAULT ''::text, p_page integer DEFAULT 1, p_status text DEFAULT 'open'::text, p_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
   select r.id,r.created_at,jsonb_build_object('id',r.id,'post_id',r.post_id,'root_id',coalesce(p.parent,p.id),'channel',p.channel,'title',case when p.channel='chat' then '勉強チャット：'||p.category when p.parent is null then p.title else t.title end,
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
end $function$;
create or replace function public.study_chat(p_action text default 'list',p_room text default '勉強法',p_id uuid default null,p_body text default '',p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();s jsonb;is_admin boolean;msg study_private.study_board_posts;result jsonb;label text;stamp timestamptz:=clock_timestamp();
begin
 if not public.study_live_account() then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();
 if not coalesce((s->>'allowed')::boolean,false) then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 is_admin:=coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false);
 if p_room is null or p_room not in ('数学','英語','理科','社会','国語','勉強法','その他') then raise exception '教科を選んでください。' using errcode='22023';end if;
 if p_action='send' then
  if p_id is null or p_body is null or length(trim(p_body)) not between 1 and 1000 then raise exception '1000文字以内で入力してください。' using errcode='22023';end if;
  if not pg_try_advisory_xact_lock(185722,1) then raise sqlstate 'PT429' using message='送信が集中しています。少し待って再試行してください。';end if;
  select * into msg from study_private.study_board_posts where id=p_id;
  if found then
   if msg.actor=v_actor and msg.channel='chat' and msg.category=p_room then return jsonb_build_object('sent',true,'id',msg.id);end if;
   raise exception '送信番号が使われています。' using errcode='22023';
  end if;
  if exists(select 1 from study_private.study_board_posts where actor=v_actor and channel='chat' and created_at>stamp-interval '3 seconds')
   or (select count(*) from study_private.study_board_posts where actor=v_actor and channel='chat' and created_at>stamp-interval '1 day')>=100 then
   raise sqlstate 'PT429' using message='3秒以上間隔を空けてください。過去24時間で100件までです。';end if;
  if pg_database_size(current_database())>419430400 then raise exception '保存領域の保護上限です。' using errcode='54000';end if;
  if (select count(*) from study_private.study_board_posts where channel='chat')>=2000 then raise exception 'チャットの保存上限です。履歴を保持するため新規送信を停止しています。' using errcode='54000';end if;
  label:=case when (s->>'owner')::boolean then 'オーナー' when (s->>'admin')::boolean then '管理者' else '利用者'||upper(substr(md5(v_actor::text),1,6)) end;
  insert into study_private.study_board_posts(id,actor,title,body,category,author_label,channel,created_at)values(p_id,v_actor,'',trim(p_body),p_room,label,'chat',stamp);
  return jsonb_build_object('sent',true,'id',p_id);
 end if;
 if p_action='stamp' then
  select md5(coalesce(string_agg(p.id::text||':'||p.revision::text||':'||p.hidden::text,',' order by p.id),'')) into label
   from study_private.study_board_posts p where p.channel='chat' and p.category=p_room and (not p.hidden or is_admin);
  return jsonb_build_object('stamp',label,'admin',is_admin,'room',p_room);
 end if;
 if p_action not in ('list','focus') then raise exception '対応していない操作です。' using errcode='22023';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception '履歴の位置を確認してください。' using errcode='22023';end if;
 if p_action='focus' then
  select * into msg from study_private.study_board_posts where id=p_id and channel='chat';
  if not found or msg.hidden and not is_admin then raise exception 'メッセージが見つかりません。' using errcode='22023';end if;
  p_room:=msg.category;
 end if;
 select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]') into result from (
  select p.id,p.created_at,jsonb_build_object('id',p.id,'body',p.body,'category',p.category,'author',p.author_label,'mine',p.actor=v_actor,
   'revision',p.revision,'created_at',p.created_at,'hidden',p.hidden,'deleted',p.deleted) as item
  from study_private.study_board_posts p where p.channel='chat' and p.category=p_room and (not p.hidden or is_admin)
   and (p_action<>'focus' or p.id=p_id) and (p_before is null or (p.created_at,p.id)<(p_before,p_before_id))
  order by p.created_at desc,p.id desc limit 51
 )x;
 return jsonb_build_object('messages',result,'admin',is_admin,'room',p_room);
end $$;
revoke all on function public.study_chat(text,text,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.study_chat(text,text,uuid,text,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
