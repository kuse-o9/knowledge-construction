create table if not exists study_private.study_music (
 id uuid primary key,actor uuid references auth.users(id) on delete set null,title text not null check(length(title)between 1 and 80),
 path text not null unique,seconds integer not null check(seconds between 1 and 600),active boolean not null default true,created_at timestamptz not null default now()
);
create index if not exists study_music_actor on study_private.study_music(actor);
create table if not exists study_private.study_music_history(id bigint generated always as identity primary key,track uuid not null references study_private.study_music(id),actor uuid references auth.users(id)on delete set null,action text not null,created_at timestamptz not null default now());
create index if not exists study_music_history_track on study_private.study_music_history(track,id desc);
create index if not exists study_music_history_actor on study_private.study_music_history(actor);
alter table study_private.study_music_history enable row level security;
revoke all on study_private.study_music_history from public,anon,authenticated;
revoke all on sequence study_private.study_music_history_id_seq from public,anon,authenticated;
alter table study_private.study_music enable row level security;
revoke all on study_private.study_music from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('study-music','study-music',false,5242880,array['audio/mpeg','audio/wav','audio/ogg'])on conflict(id)do nothing;
create or replace function public.study_music_access(p_name text,p_write boolean default false)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$declare s jsonb;is_admin boolean;begin
 if p_name is null or p_name!~'^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|wav|ogg)$'then return false;end if;
 s:=public.study_security_status();if not coalesce((s->>'allowed')::boolean,false)then return false;end if;
 is_admin:=coalesce((s->>'admin')::boolean,false)and coalesce((s->>'adminVerified')::boolean,false)and public.study_live_account();
 if not p_write then return is_admin or exists(select 1 from study_private.study_music where path=p_name and active);end if;
 if not is_admin or split_part(p_name,'/',1)<>auth.uid()::text then return false;end if;
 if not pg_try_advisory_xact_lock(185728,1)then return false;end if;
 return (select count(*)from storage.objects where bucket_id='study-music')<20 and
  (select coalesce(sum(case when metadata->>'size'~'^[0-9]+$'then(metadata->>'size')::bigint else 0 end),0)from storage.objects where bucket_id='study-music')<=47185920 and pg_database_size(current_database())<419430400;
end $$;
revoke all on function public.study_music_access(text,boolean)from public,anon,authenticated;
grant execute on function public.study_music_access(text,boolean)to anon,authenticated;
do $$begin if not exists(select 1 from pg_policies where schemaname='storage'and tablename='objects'and policyname='study_music_read')then create policy study_music_read on storage.objects for select to anon,authenticated using(bucket_id='study-music'and public.study_music_access(name,false));end if;end $$;
do $$begin if not exists(select 1 from pg_policies where schemaname='storage'and tablename='objects'and policyname='study_music_insert')then create policy study_music_insert on storage.objects for insert to authenticated with check(bucket_id='study-music'and owner_id=auth.uid()::text and public.study_music_access(name,true));end if;end $$;
create or replace function public.study_music(p_action text default 'list',p_id uuid default null,p_title text default '',p_path text default '',p_seconds integer default 0,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;is_admin boolean;result jsonb;t study_private.study_music;
begin
 s:=public.study_security_status();if not coalesce((s->>'allowed')::boolean,false)then raise exception 'メンテナンス中です。'using errcode='42501';end if;
 is_admin:=coalesce((s->>'admin')::boolean,false)and coalesce((s->>'adminVerified')::boolean,false)and public.study_live_account();
 if p_action='list'then
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]')into result from(select created_at,jsonb_build_object('id',id,'title',title,'path',path,'seconds',seconds)item from study_private.study_music where active order by created_at desc limit 20)x;
  return jsonb_build_object('tracks',result);
 end if;
 if not is_admin then raise exception '確認済み管理者専用です。'using errcode='42501';end if;
 if p_action='admin_list'then
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]')into result from(select created_at,jsonb_build_object('id',id,'title',title,'path',path,'seconds',seconds,'active',active)item from study_private.study_music order by created_at desc limit 20)x;
  return jsonb_build_object('tracks',result,'owner',coalesce((s->>'owner')::boolean,false),'unregistered',(select coalesce(jsonb_agg(name),'[]')from storage.objects o where bucket_id='study-music'and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from study_private.study_music m where m.path=o.name)));
 end if;
 if p_action='history'then
  if not coalesce((s->>'owner')::boolean,false)then raise exception '履歴はオーナー専用です。'using errcode='42501';end if;
  select coalesce(jsonb_agg(x.item order by x.id desc),'[]')into result from(select h.id,jsonb_build_object('action',h.action,'created_at',h.created_at,'by',case when h.actor=(select owner_id from study_private.settings where singleton)then 'オーナー'else '管理者'end)item from study_private.study_music_history h where h.track=p_id order by h.id desc limit 20)x;
  return jsonb_build_object('items',result);
 end if;
 if p_action is null or p_action not in ('register','archive','restore')then raise exception '操作を確認してください。'using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(185728,1)then raise sqlstate 'PT429'using message='操作が集中しています。少し待ってください。';end if;
 if(select count(*)from study_private.study_music_history)>=5000 or pg_database_size(current_database())>419430400 then raise exception '履歴の保護上限です。'using errcode='54000';end if;
 if p_action='register'then
  if p_id is null or p_title is null or length(trim(p_title))not between 1 and 80 or p_seconds is null or p_seconds not between 1 and 600 or not coalesce(p_confirm,false)then raise exception '曲名・10分以内の長さ・共有する権利を確認してください。'using errcode='22023';end if;
  if p_path is null or p_path!~('^'||auth.uid()::text||'/'||p_id::text||'\.(mp3|wav|ogg)$')then raise exception 'アップロード先を確認してください。'using errcode='22023';end if;
  select * into t from study_private.study_music where id=p_id;
  if found then if t.actor=auth.uid()and t.path=p_path then return jsonb_build_object('id',t.id);end if;raise exception '登録番号が使われています。'using errcode='22023';end if;
  if(select count(*)from study_private.study_music)>=20 then raise exception '共有曲は20件までです。既存の曲を利用してください。'using errcode='54000';end if;
  if not exists(select 1 from storage.objects where bucket_id='study-music'and name=p_path and(metadata->>'size')::bigint between 1 and 5242880)then raise exception 'アップロードした音声を確認できませんでした。'using errcode='22023';end if;
  insert into study_private.study_music(id,actor,title,path,seconds)values(p_id,auth.uid(),trim(p_title),p_path,p_seconds);insert into study_private.study_music_history(track,actor,action)values(p_id,auth.uid(),'register');return jsonb_build_object('id',p_id);
 end if;
 if p_id is null then raise exception '曲を選んでください。'using errcode='22023';end if;
 update study_private.study_music set active=p_action='restore'where id=p_id and active is distinct from(p_action='restore');
 if not found then if exists(select 1 from study_private.study_music where id=p_id)then return jsonb_build_object('done',true);end if;raise exception '曲が見つかりません。'using errcode='22023';end if;insert into study_private.study_music_history(track,actor,action)values(p_id,auth.uid(),p_action);
 return jsonb_build_object('done',true);
end $$;
revoke all on function public.study_music(text,uuid,text,text,integer,boolean)from public,anon,authenticated;
grant execute on function public.study_music(text,uuid,text,text,integer,boolean)to anon,authenticated;
