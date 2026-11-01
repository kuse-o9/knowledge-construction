create table if not exists study_private.study_notices (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('admin','customer')),
 title text not null check(length(title) between 1 and 100),body text not null check(length(body) between 1 and 2000),
 state text not null check(state in ('pending','published','rejected','unpublished')),
 approved_title text,approved_body text,approved_at timestamptz,revision integer not null default 1 check(revision>0),
 updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now()
);
create index if not exists study_notices_kind_updated on study_private.study_notices(kind,updated_at desc,id);
create table if not exists study_private.study_notice_history (
 id bigint generated always as identity primary key,notice_id uuid not null references study_private.study_notices(id),
 action text not null,actor uuid references auth.users(id) on delete set null,revision integer not null,snapshot jsonb not null,created_at timestamptz not null default now()
);
create index if not exists study_notice_history_notice on study_private.study_notice_history(notice_id,id desc);
alter table study_private.study_notices enable row level security;
alter table study_private.study_notice_history enable row level security;
revoke all on study_private.study_notices,study_private.study_notice_history from public,anon,authenticated;
revoke all on sequence study_private.study_notice_history_id_seq from public,anon,authenticated;
create or replace function public.study_notices(p_action text default 'customer_list',p_kind text default 'customer',p_id uuid default null,p_title text default '',p_body text default '',p_revision integer default 0,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;is_admin boolean;is_owner boolean;n study_private.study_notices;result jsonb;at timestamptz:=clock_timestamp();
begin
 s:=public.study_security_status();
 if not coalesce((s->>'allowed')::boolean,false) then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 11 then raise exception 'ページを確認してください。' using errcode='22023';end if;
 is_admin:=coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false) and public.study_live_account();
 is_owner:=is_admin and coalesce((s->>'owner')::boolean,false);
 if p_action='customer_list' then
  select coalesce(jsonb_agg(x.item order by x.approved_at desc,x.id),'[]') into result from(
   select id,approved_at,jsonb_build_object('id',id,'title',approved_title,'body',approved_body,'published_at',approved_at,'revision',md5(approved_title||approved_body||approved_at::text)) item
   from study_private.study_notices where kind='customer' and approved_at is not null order by approved_at desc,id limit 21 offset (p_page-1)*20
  )x;return jsonb_build_object('items',result);
 end if;
 if not is_admin then raise exception '管理者の本人確認が必要です。' using errcode='42501';end if;
 if p_action='admin_list' then
  select coalesce(jsonb_agg(x.item order by x.updated_at desc,x.id),'[]') into result from(
   select id,updated_at,jsonb_build_object('id',id,'kind',kind,'title',title,'body',body,'state',state,'revision',revision,'published',approved_at is not null,'updated_at',updated_at,'can_edit',is_owner or kind='customer') item
   from study_private.study_notices order by updated_at desc,id limit 21 offset (p_page-1)*20
  )x;return jsonb_build_object('items',result,'owner',is_owner);
 end if;
 if p_action='history' then
  if not is_owner then raise exception 'オーナー専用です。' using errcode='42501';end if;
  select coalesce(jsonb_agg(x.item order by x.id desc),'[]') into result from(
   select id,jsonb_build_object('action',action,'revision',revision,'created_at',created_at,'snapshot',snapshot) item from study_private.study_notice_history where notice_id=p_id order by id desc limit 20
  )x;return jsonb_build_object('items',result);
 end if;
 if p_action is null or p_action not in ('save','approve','reject','unpublish') then raise exception '操作を確認してください。' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(185724,1) then raise sqlstate 'PT429' using message='更新が集中しています。少し待ってください。';end if;
 if (select count(*) from study_private.study_notice_history)>=2000 or pg_database_size(current_database())>419430400 then raise exception '記録を保護するため新しい更新を停止しています。' using errcode='54000';end if;
 if p_id is not null then
  select * into n from study_private.study_notices where id=p_id for update;
  if not found or n.revision<>p_revision then raise exception '内容が更新されています。開き直してください。' using errcode='40001';end if;
  if n.kind='admin' and not is_owner then raise exception '管理者向け通知はオーナーだけが変更できます。' using errcode='42501';end if;
 end if;
 if p_action='save' then
  if p_kind is null or p_kind not in ('admin','customer') or p_title is null or p_body is null or length(trim(p_title)) not between 1 and 100 or length(trim(p_body)) not between 1 and 2000 then raise exception '件名100文字・本文2000文字以内で入力してください。' using errcode='22023';end if;
  if p_kind='admin' and not is_owner then raise exception '管理者向け通知はオーナーだけが掲載できます。' using errcode='42501';end if;
  if p_id is null then
   if (select count(*) from study_private.study_notices)>=200 then raise exception '通知の保存上限です。既存の通知を編集してください。' using errcode='54000';end if;
   insert into study_private.study_notices(kind,title,body,state,updated_by) values(p_kind,trim(p_title),trim(p_body),case when p_kind='admin' then 'published' else 'pending' end,auth.uid()) returning * into n;
  else
   if n.kind<>p_kind then raise exception '通知の種類は変更できません。' using errcode='22023';end if;
   update study_private.study_notices set title=trim(p_title),body=trim(p_body),state=case when kind='admin' then 'published' else 'pending' end,revision=revision+1,updated_at=at,updated_by=auth.uid() where id=p_id returning * into n;
  end if;
  if n.kind='admin' then update study_private.study_notices set approved_title=n.title,approved_body=n.body,approved_at=at where id=n.id returning * into n;end if;
 else
  if not is_owner or p_id is null then raise exception '承認・却下・公開停止はオーナー専用です。' using errcode='42501';end if;
  if p_action='approve' then
   update study_private.study_notices set approved_title=title,approved_body=body,approved_at=at,state='published',revision=revision+1,updated_at=at,updated_by=auth.uid() where id=p_id returning * into n;
  elsif p_action='reject' then
   update study_private.study_notices set state='rejected',revision=revision+1,updated_at=at,updated_by=auth.uid() where id=p_id returning * into n;
  else
   update study_private.study_notices set approved_title=null,approved_body=null,approved_at=null,state='unpublished',revision=revision+1,updated_at=at,updated_by=auth.uid() where id=p_id returning * into n;
  end if;
 end if;
 insert into study_private.study_notice_history(notice_id,action,actor,revision,snapshot) values(n.id,p_action,auth.uid(),n.revision,jsonb_build_object('kind',n.kind,'title',n.title,'body',n.body,'state',n.state));
 return jsonb_build_object('id',n.id,'revision',n.revision);
end $$;
revoke all on function public.study_notices(text,text,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.study_notices(text,text,uuid,text,text,integer,integer) to anon,authenticated;
