-- Stable aliases and private, bounded photo uploads for staff posts.
create table study_private.staff_aliases (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ordinal bigint generated always as identity unique not null
);
alter table study_private.staff_aliases enable row level security;
revoke all on study_private.staff_aliases from public,anon,authenticated;
insert into study_private.staff_aliases(user_id) select user_id from study_private.admin_members where user_id<>(select owner_id from study_private.settings where singleton) order by created_at,user_id;
create function study_private.staff_alias(p_actor uuid) returns text language plpgsql security definer set search_path=pg_catalog as $alias$
declare n bigint; letters text:='';
begin
 select ordinal into n from study_private.staff_aliases where user_id=p_actor;
 if n is null then
  insert into study_private.staff_aliases(user_id)values(p_actor)on conflict(user_id)do nothing;
  select ordinal into n from study_private.staff_aliases where user_id=p_actor;
 end if;
 while n>0 loop n:=n-1;letters:=chr(65+(n%26)::integer)||letters;n:=n/26;end loop;
 return '管理者'||letters;
end $alias$;
revoke all on function study_private.staff_alias(uuid) from public,anon,authenticated;
alter table study_private.staff_updates drop constraint staff_updates_author_label_check;
alter table study_private.staff_updates add constraint staff_updates_author_label_check check(author_label ~ '^(オーナー|管理者[A-Z]*)$');
alter table study_private.staff_updates add column images jsonb not null default '[]'::jsonb check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=3);
update study_private.staff_updates set author_label=study_private.staff_alias(author) where author is not null and author<>(select owner_id from study_private.settings where singleton);
