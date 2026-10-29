-- Bounded, private recovery checkpoints. Not a full database/off-site backup.
create table study_private.data_guard_snapshots (
 id uuid primary key default gen_random_uuid(), bucket text not null check(bucket in ('official','personal')),
 deck_id uuid not null, subject_owner uuid, snapshot_day date not null,
 kind text not null check(kind in ('daily','deleted')), body jsonb not null,
 bytes integer not null check(bytes>0), created_at timestamptz not null default clock_timestamp(),
 unique(bucket,deck_id,snapshot_day,kind)
);
alter table study_private.data_guard_snapshots enable row level security;
revoke all on study_private.data_guard_snapshots from public,anon,authenticated,service_role;

create function study_private.data_guard_capture(p_bucket text,p_deck uuid,p_kind text default 'daily') returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare d jsonb; qs jsonb; payload jsonb; own uuid; size integer; day date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 if p_bucket not in ('official','personal') or p_kind not in ('daily','deleted') then raise exception 'Invalid checkpoint';end if;
 perform pg_advisory_xact_lock(185712,2);
 if exists(select 1 from study_private.data_guard_snapshots where bucket=p_bucket and deck_id=p_deck and snapshot_day=day and kind=p_kind) then return;end if;
 if p_bucket='official' then
  select to_jsonb(t) into d from study_private.decks t where id=p_deck;
  select coalesce(jsonb_agg(to_jsonb(t) order by position,id),'[]'::jsonb) into qs from study_private.questions t where deck_id=p_deck;
 else
  select to_jsonb(t),owner_id into d,own from study_private.personal_decks t where id=p_deck;
  select coalesce(jsonb_agg(to_jsonb(t) order by position,id),'[]'::jsonb) into qs from study_private.personal_questions t where deck_id=p_deck;
 end if;
 if d is null then return;end if;
 if p_bucket='personal' and not exists(select 1 from auth.users where id=own) then return;end if;
 payload:=jsonb_build_object('deck',d,'questions',qs);size:=octet_length(payload::text);
 delete from study_private.data_guard_snapshots where created_at<clock_timestamp()-interval '30 days';
 if (select count(*) from study_private.data_guard_snapshots)>=2048
  or coalesce((select sum(bytes) from study_private.data_guard_snapshots),0)+size>67108864
  or pg_database_size(current_database())>419430400 then
  raise exception 'Recovery storage limit: change cancelled to protect recovery data' using errcode='54000';
 end if;
 insert into study_private.data_guard_snapshots(bucket,deck_id,subject_owner,snapshot_day,kind,body,bytes)values(p_bucket,p_deck,own,day,p_kind,payload,size);
end $$;
revoke all on function study_private.data_guard_capture(text,uuid,text) from public,anon,authenticated,service_role;

create function study_private.data_guard_before_change() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare b text; id uuid;
begin
 if current_setting('study.data_guard_restore',true)='on' then
  if tg_op='UPDATE' then return new;end if;return old;
 end if;
 if tg_op='UPDATE' and (to_jsonb(old)-'revision'-'updated_at')=(to_jsonb(new)-'revision'-'updated_at') then return new;end if;
 b:=case when tg_table_name like 'personal_%' then 'personal' else 'official' end;
 if tg_table_name in ('decks','personal_decks') then id:=old.id;else id:=old.deck_id;end if;
 perform study_private.data_guard_capture(b,id,case when tg_op='DELETE' then 'deleted' else 'daily' end);
 if tg_op='UPDATE' then return new;end if;return old;
end $$;
revoke all on function study_private.data_guard_before_change() from public,anon,authenticated,service_role;
create trigger data_guard_before_change before update or delete on study_private.decks for each row execute function study_private.data_guard_before_change();
create trigger data_guard_before_change before update or delete on study_private.questions for each row execute function study_private.data_guard_before_change();
create trigger data_guard_before_change before update or delete on study_private.personal_decks for each row execute function study_private.data_guard_before_change();
create trigger data_guard_before_change before update or delete on study_private.personal_questions for each row execute function study_private.data_guard_before_change();

-- A genuine account erasure must also remove that person's recovery copies.
create function study_private.data_guard_erase_account() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 delete from study_private.data_guard_snapshots where subject_owner=old.id;
 return old;
end $$;
revoke all on function study_private.data_guard_erase_account() from public,anon,authenticated,service_role;
create trigger data_guard_erase_account after delete on auth.users for each row execute function study_private.data_guard_erase_account();

create function public.study_data_guard_admin(p_action text default 'status',p_id uuid default null,p_confirm text default '',p_expected timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s study_private.data_guard_snapshots; d jsonb; stamp timestamptz; present boolean; rev integer; saved_flag text; output jsonb;
begin
 perform study_private.assert_admin_verified();
 if auth.uid() is distinct from (select owner_id from study_private.settings where singleton) then raise exception 'Owner required' using errcode='42501';end if;
 if p_action='status' then
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'bucket',t.bucket,'deck_id',t.deck_id,'created_at',t.created_at,'kind',t.kind,'bytes',t.bytes,'current_stamp',case when t.bucket='official' then od.updated_at else pd.updated_at end) order by t.created_at desc),'[]'::jsonb) into output
  from study_private.data_guard_snapshots t left join study_private.decks od on t.bucket='official' and od.id=t.deck_id left join study_private.personal_decks pd on t.bucket='personal' and pd.id=t.deck_id;
  return jsonb_build_object('snapshots',output,'limit_bytes',67108864,'retention_days',30);
 end if;
 if p_action<>'restore' or p_confirm<>'復元する' then raise exception 'Explicit restore confirmation required' using errcode='22023';end if;
 select * into s from study_private.data_guard_snapshots where id=p_id;
 if not found then raise exception 'Checkpoint not found' using errcode='22023';end if;
 if s.bucket='official' then
  select updated_at,revision into stamp,rev from study_private.decks where id=s.deck_id for update;present:=found;
 else
  perform 1 from auth.users where id=s.subject_owner for update;
  if not found then raise exception 'Account no longer exists' using errcode='22023';end if;
  if exists(select 1 from study_private.personal_decks where id=s.deck_id and owner_id<>s.subject_owner) then raise exception 'Owner mismatch' using errcode='42501';end if;
  select updated_at,revision into stamp,rev from study_private.personal_decks where id=s.deck_id for update;present:=found;
  if not present and (select count(*) from study_private.personal_decks where owner_id=s.subject_owner)>=10 then raise exception 'Personal deck limit reached' using errcode='54000';end if;
 end if;
 if stamp is distinct from p_expected then raise exception 'Deck changed; refresh checkpoints before restoring' using errcode='40001';end if;
 perform study_private.data_guard_capture(s.bucket,s.deck_id,'deleted');
 saved_flag:=current_setting('study.data_guard_restore',true);
 perform set_config('study.data_guard_restore','on',true);
 d:=s.body->'deck';
 d:=d||jsonb_build_object('revision',greatest(coalesce(rev,0),(d->>'revision')::integer)+1,'updated_at',clock_timestamp());
 if s.bucket='official' then
  d:=d||'{"published":false}'::jsonb;
  delete from study_private.questions where deck_id=s.deck_id;
  if present then
   update study_private.decks set title=d->>'title',description=d->>'description',genre=d->>'genre',subject=d->>'subject',grade=d->>'grade',published=false,revision=(d->>'revision')::integer,updated_at=(d->>'updated_at')::timestamptz where id=s.deck_id;
  else insert into study_private.decks select * from jsonb_populate_record(null::study_private.decks,d);end if;
  insert into study_private.questions select * from jsonb_populate_recordset(null::study_private.questions,s.body->'questions');
 else
  delete from study_private.personal_questions where deck_id=s.deck_id;
  if present then
   update study_private.personal_decks set title=d->>'title',description=d->>'description',genre=d->>'genre',subject=d->>'subject',grade=d->>'grade',revision=(d->>'revision')::integer,updated_at=(d->>'updated_at')::timestamptz where id=s.deck_id;
  else insert into study_private.personal_decks select * from jsonb_populate_record(null::study_private.personal_decks,d);end if;
  insert into study_private.personal_questions select * from jsonb_populate_recordset(null::study_private.personal_questions,s.body->'questions');
  update study_private.community_publications set status=case when status='blocked' then 'blocked' else 'unpublished' end,revision=revision+1,updated_at=clock_timestamp() where deck_id=s.deck_id;
 end if;
 perform set_config('study.data_guard_restore',coalesce(saved_flag,''),true);
 insert into study_private.audit_events(actor,action,target,outcome,details,protected)
 values(auth.uid(),'data_guard_restore',s.deck_id,'success',jsonb_build_object('checkpoint',s.id,'bucket',s.bucket),true);
 return jsonb_build_object('restored',true,'deck_id',s.deck_id,'published',false);
end $$;
revoke all on function public.study_data_guard_admin(text,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.study_data_guard_admin(text,uuid,text,timestamptz) to authenticated;

-- Baseline the currently existing decks internally; never return their contents.
do $$declare r record;begin
 for r in select id from study_private.decks loop perform study_private.data_guard_capture('official',r.id);end loop;
 for r in select id from study_private.personal_decks loop perform study_private.data_guard_capture('personal',r.id);end loop;
end $$;
