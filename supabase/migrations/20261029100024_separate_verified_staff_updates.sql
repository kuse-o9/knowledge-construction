-- Separate from the user bulletin board; no client access to the private table.
create table study_private.staff_updates (
 id uuid primary key,
 author uuid references auth.users(id) on delete set null,
 author_label text not null check(author_label in ('オーナー','管理者')),
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index staff_updates_created_idx on study_private.staff_updates(created_at desc,id desc);
create index staff_updates_author_idx on study_private.staff_updates(author,created_at desc);
alter table study_private.staff_updates enable row level security;
revoke all on study_private.staff_updates from public,anon,authenticated;

create function public.study_staff_updates(p_action text default 'list',p_page integer default 1,p_id uuid default null,p_body text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare actor uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
 s jsonb; verified boolean; own boolean; result jsonb; affected integer;
begin
 s:=study_private.security_status(actor,sid);
 if not coalesce((s->>'allowed')::boolean,false) then raise exception using errcode='42501',message='メンテナンス中です。';end if;
 verified:=coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false);
 own:=coalesce((s->>'owner')::boolean,false);
 if p_action='list' then
  if p_page is null or p_page<1 or p_page>100 then raise exception using errcode='22023',message='ページ番号を確認してください。';end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into result from (
   select u.id,u.created_at,jsonb_build_object('id',u.id,'body',u.body,'authorLabel',u.author_label,'createdAt',u.created_at,'canDelete',verified and (own or u.author=actor)) item
   from study_private.staff_updates u order by u.created_at desc,u.id desc limit 20 offset (p_page-1)*20
  ) rows;
  return jsonb_build_object('items',result,'canPost',verified,'hasNext',exists(select 1 from study_private.staff_updates offset p_page*20 limit 1));
 end if;
 if not verified then raise exception using errcode='42501',message='管理者の本人確認が必要です。';end if;
 if p_action='post' then
  if p_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then raise exception using errcode='22023',message='本文を１〜1000文字で入力してください。';end if;
  perform pg_advisory_xact_lock(185712,3);
  if exists(select 1 from study_private.staff_updates where id=p_id and author=actor and body=btrim(p_body)) then return jsonb_build_object('posted',true,'id',p_id);end if;
  if exists(select 1 from study_private.staff_updates where author=actor and created_at>now()-interval '10 seconds') then raise exception using errcode='P0001',message='連続投稿を避けるため、10秒ほど待ってください。';end if;
  if (select count(*) from study_private.staff_updates)>=2000 then raise exception using errcode='P0001',message='投稿の保存上限です。不要な投稿を整理してください。';end if;
  insert into study_private.staff_updates(id,author,author_label,body)values(p_id,actor,case when own then 'オーナー' else '管理者' end,btrim(p_body));
  return jsonb_build_object('posted',true,'id',p_id);
 elsif p_action='delete' then
  delete from study_private.staff_updates where id=p_id and (own or author=actor);
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='42501',message='投稿がないか、削除する権限がありません。';end if;
  return jsonb_build_object('deleted',true);
 end if;
 raise exception using errcode='22023',message='操作を確認してください。';
end $fn$;
revoke all on function public.study_staff_updates(text,integer,uuid,text) from public;
grant execute on function public.study_staff_updates(text,integer,uuid,text) to anon,authenticated;
