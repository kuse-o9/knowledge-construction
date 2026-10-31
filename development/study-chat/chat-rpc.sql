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
