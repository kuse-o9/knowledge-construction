begin;
-- Additive migration. Reuses the existing server-side administrator check.
do $$ begin
 if to_regprocedure('public.study_dispatch(uuid,text,jsonb)') is null then
  raise exception 'Existing study_dispatch is required. Do not replace existing account/security migrations.';
 end if;
end $$;
create table if not exists study_private.game_publication (
 id text primary key, title text not null, path text not null unique,
 published boolean not null default true, note text not null default '',
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(), updated_by uuid,
 previous_published boolean, previous_note text,
 check(length(note)<=160)
);
create table if not exists study_private.game_publication_events (
 id bigint generated always as identity primary key,
 game_id text not null references study_private.game_publication(id),
 actor uuid not null, old_published boolean not null, new_published boolean not null,
 old_note text not null,new_note text not null, revision bigint not null,
 created_at timestamptz not null default now()
);
alter table study_private.game_publication enable row level security;
alter table study_private.game_publication_events enable row level security;
revoke all on study_private.game_publication,study_private.game_publication_events from public,anon,authenticated,service_role;
insert into study_private.game_publication(id,title,path) values
 ('island','こもれび島','game/index.html'),
 ('yamanote','山手線','yamanote/index.html'),
 ('keihin','京浜東北・根岸線','keihin.html'),
 ('chuo','中央線快速・接続区間','chuo.html'),
 ('chuo-local','中央・総武線各駅停車','chuo-local.html'),
 ('sobu','総武線快速','sobu.html'),
 ('yurikamome','ゆりかもめ','railway/index.html')
on conflict(id) do nothing;
create or replace function public.study_game_catalog() returns jsonb
language sql stable security definer set search_path=pg_catalog,study_private
as $$ select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'path',path,'published',published,'note',note,'revision',revision,'updated_at',updated_at) order by id),'[]'::jsonb) from study_private.game_publication; $$;
revoke all on function public.study_game_catalog() from public;
grant execute on function public.study_game_catalog() to anon,authenticated;
create or replace function public.study_game_admin(
 p_action text default 'list', p_id text default null,p_published boolean default null,
 p_note text default '',p_revision bigint default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,study_private
as $$
declare actor uuid:=auth.uid(); row study_private.game_publication%rowtype; target boolean; target_note text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 -- Neither caller-provided role nor user_metadata can grant access.
 perform public.study_dispatch(actor,'admin_bootstrap','{}'::jsonb);
 if p_action='list' then
  return public.study_game_catalog();
 end if;
 if p_action not in ('set','undo') or p_id is null or p_revision is null or p_revision<1 then
  raise exception 'Invalid publication input' using errcode='22023';
 end if;
 select * into row from study_private.game_publication where id=p_id for update;
 if not found then raise exception 'Game not found' using errcode='P0002';end if;
 if row.revision<>p_revision then raise exception 'Publication changed; reload' using errcode='40001';end if;
 if p_action='undo' then
  if row.previous_published is null then raise exception 'Nothing to undo' using errcode='22023';end if;
  target:=row.previous_published;target_note:=row.previous_note;
 else
  if p_published is null or p_note is null or length(p_note)>160 then raise exception 'Invalid publication input' using errcode='22023';end if;
  target:=p_published;target_note:=trim(p_note);
 end if;
 if target=row.published and target_note=row.note then return public.study_game_catalog();end if;
 update study_private.game_publication set published=target,note=target_note,
  previous_published=row.published,previous_note=row.note,
  revision=revision+1,updated_at=clock_timestamp(),updated_by=actor where id=p_id;
 insert into study_private.game_publication_events(game_id,actor,old_published,new_published,old_note,new_note,revision)
 values(p_id,actor,row.published,target,row.note,target_note,row.revision+1);
 return public.study_game_catalog();
end $$;
revoke all on function public.study_game_admin(text,text,boolean,text,bigint) from public,anon;
grant execute on function public.study_game_admin(text,text,boolean,text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
