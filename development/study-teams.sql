create table if not exists study_private.study_teams (
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 60),invite_hash text not null unique,
 closed boolean not null default false,created_at timestamptz not null default now()
);
create index if not exists study_teams_owner on study_private.study_teams(owner);
create table if not exists study_private.study_team_members (
 team uuid not null references study_private.study_teams(id) on delete cascade,
 actor uuid not null references auth.users(id) on delete cascade,active boolean not null default true,joined_at timestamptz not null default now(),primary key(team,actor)
);
create index if not exists study_team_members_actor on study_private.study_team_members(actor,team);
create table if not exists study_private.study_team_awards (
 actor uuid not null references auth.users(id) on delete cascade,day date not null,
 team uuid references study_private.study_teams(id) on delete set null,amount integer not null check(amount=10),created_at timestamptz not null default now(),primary key(actor,day)
);
create index if not exists study_team_awards_team on study_private.study_team_awards(team);
alter table study_private.study_teams enable row level security;
alter table study_private.study_team_members enable row level security;
alter table study_private.study_team_awards enable row level security;
revoke all on study_private.study_teams,study_private.study_team_members,study_private.study_team_awards from public,anon,authenticated;
create or replace function public.study_teams(p_action text default 'list',p_id uuid default null,p_title text default '',p_code text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();s jsonb;v_team study_private.study_teams;v_day date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 code text;result jsonb;cards integer;mine integer;v_balance integer;already boolean;
begin
 if not public.study_live_account() then raise exception 'ログインし直してください。' using errcode='42501';end if;
 s:=public.study_security_status();if not coalesce((s->>'allowed')::boolean,false)then raise exception 'メンテナンス中です。' using errcode='42501';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(x.item order by x.created_at),'[]')into result from(
   select grp.created_at,jsonb_build_object('id',grp.id,'title',grp.title,'owner',grp.owner=v_actor,'closed',grp.closed,
    'members',(select count(*)from study_private.study_team_members where team=grp.id and active),
    'cards',(select count(*)from study_private.point_claims c join study_private.study_team_members m on m.actor=c.actor and m.team=grp.id and m.active where c.day=v_day),
    'mine',(select count(*)from study_private.point_claims where point_claims.actor=v_actor and point_claims.day=v_day))item
   from study_private.study_teams grp join study_private.study_team_members m on m.team=grp.id and m.actor=v_actor and m.active order by grp.created_at limit 5
  )x;
  return jsonb_build_object('teams',result,'day',v_day,'claimed',exists(select 1 from study_private.study_team_awards where study_team_awards.actor=v_actor and study_team_awards.day=v_day));
 end if;
 if p_action is null or p_action not in ('create','join','leave','rotate','close','reopen','claim') then raise exception '操作を確認してください。' using errcode='22023';end if;
 -- Same account lock ordering as the existing points/purchase and account-delete APIs.
 perform 1 from auth.users where id=v_actor for update;
 if not public.study_live_account() then raise exception 'アカウント状態が変わりました。' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(185726,1)then raise sqlstate 'PT429' using message='操作が集中しています。少し待ってください。';end if;
 if pg_database_size(current_database())>419430400 then raise exception '保存領域を保護しています。' using errcode='54000';end if;
 if p_action='create' then
  if p_title is null or length(trim(p_title))not between 1 and 60 then raise exception 'チーム名は60文字以内です。' using errcode='22023';end if;
  if (select count(*)from study_private.study_team_members where study_team_members.actor=v_actor and active)>=5 or (select count(*)from study_private.study_teams where owner=v_actor and not closed)>=3 then raise exception '参加は５チーム、作成中は３チームまでです。' using errcode='54000';end if;
  if (select count(*)from study_private.study_team_members)>=5000 or (select count(*)from study_private.study_teams)>=1000 or (select count(*)from study_private.study_teams where not closed)>=100 then raise exception 'チームの保存上限です。' using errcode='54000';end if;
  code:=replace(gen_random_uuid()::text,'-','');insert into study_private.study_teams(owner,title,invite_hash)values(v_actor,trim(p_title),md5(code))returning * into v_team;
  insert into study_private.study_team_members(team,actor)values(v_team.id,v_actor);return jsonb_build_object('id',v_team.id,'code',code);
 elsif p_action='join' then
  if p_code is null or p_code!~'^[a-fA-F0-9]{32}$'then raise exception '招待コードを確認してください。' using errcode='22023';end if;
  select * into v_team from study_private.study_teams where invite_hash=md5(lower(p_code)) and not closed for update;
  if not found then raise exception '参加できるチームが見つかりません。' using errcode='22023';end if;
  if exists(select 1 from study_private.study_team_members where team=v_team.id and study_team_members.actor=v_actor and active)then return jsonb_build_object('id',v_team.id);end if;
  if (select count(*)from study_private.study_team_members where team=v_team.id and active)>=10 or (select count(*)from study_private.study_team_members where study_team_members.actor=v_actor and active)>=5 then raise exception '１チーム10人、参加５チームまでです。' using errcode='54000';end if;
  if not exists(select 1 from study_private.study_team_members where team=v_team.id and study_team_members.actor=v_actor) and (select count(*)from study_private.study_team_members)>=5000 then raise exception '参加記録の保存上限です。' using errcode='54000';end if;insert into study_private.study_team_members(team,actor)values(v_team.id,v_actor)on conflict(team,actor)do update set active=true,joined_at=clock_timestamp();return jsonb_build_object('id',v_team.id);
 end if;
 select * into v_team from study_private.study_teams where id=p_id for update;
 if not found or not exists(select 1 from study_private.study_team_members where team=v_team.id and study_team_members.actor=v_actor and active)then raise exception 'このチームには参加していません。' using errcode='42501';end if;
 if p_action in ('rotate','close','reopen')then
  if v_team.owner<>v_actor then raise exception 'チームを作った人だけが変更できます。' using errcode='42501';end if;
  if p_action='rotate'then code:=replace(gen_random_uuid()::text,'-','');update study_private.study_teams set invite_hash=md5(code)where id=v_team.id;return jsonb_build_object('code',code);end if;
  if p_action='reopen'and(select count(*)from study_private.study_teams where not closed)>=100 then raise exception '再開できるチーム数の上限です。' using errcode='54000';end if;
  update study_private.study_teams set closed=p_action='close'where id=v_team.id;return jsonb_build_object('done',true);
 elsif p_action='leave'then
  if v_team.owner=v_actor then raise exception '作成者は「チームを休止」を使ってください。' using errcode='22023';end if;
  update study_private.study_team_members set active=false where team=v_team.id and study_team_members.actor=v_actor;return jsonb_build_object('done',true);
 end if;
 if v_team.closed then raise exception '休止中のチームです。' using errcode='22023';end if;
 already:=exists(select 1 from study_private.study_team_awards where study_team_awards.actor=v_actor and study_team_awards.day=v_day);
 if already then return jsonb_build_object('awarded',0,'already',true);end if;
 select count(*)into cards from study_private.point_claims c join study_private.study_team_members m on m.actor=c.actor and m.team=v_team.id and m.active where c.day=v_day;
 select count(*)into mine from study_private.point_claims where point_claims.actor=v_actor and point_claims.day=v_day;
 if (select count(*)from study_private.study_team_members where team=v_team.id and active)<2 or cards<20 or mine<1 then raise exception '２人以上で合計20枚、自分も１枚以上取り組むと達成です。' using errcode='22023';end if;
 if(select count(*)from study_private.study_team_awards)>=50000 then raise exception '達成記録の保護上限です。' using errcode='54000';end if;
 insert into study_private.point_wallets(actor)values(v_actor)on conflict(actor)do nothing;
 select point_wallets.balance into v_balance from study_private.point_wallets where point_wallets.actor=v_actor for update;
 if v_balance>10000000-10 then raise exception 'ポイントの保有上限です。交換後にもう一度お試しください。' using errcode='54000';end if;
 insert into study_private.study_team_awards(actor,day,team,amount)values(v_actor,v_day,v_team.id,10);
 update study_private.point_wallets set balance=point_wallets.balance+10,earned=earned+10,revision=revision+1 where point_wallets.actor=v_actor;
 return jsonb_build_object('awarded',10);
end $$;
revoke all on function public.study_teams(text,uuid,text,text)from public,anon,authenticated;
grant execute on function public.study_teams(text,uuid,text,text)to authenticated;
