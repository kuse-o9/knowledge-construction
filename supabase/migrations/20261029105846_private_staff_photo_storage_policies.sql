insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('study-staff-photos','study-staff-photos',false,262144,array['image/webp']);
create function public.study_staff_photo_access(p_name text,p_write boolean default false) returns boolean language plpgsql stable security definer set search_path=pg_catalog as $access$
declare s jsonb; verified boolean;
begin
 s:=study_private.security_status(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 if not coalesce((s->>'allowed')::boolean,false) then return false;end if;
 verified:=coalesce((s->>'adminVerified')::boolean,false) and coalesce((s->>'admin')::boolean,false);
 if p_write then return verified;end if;
 return exists(select 1 from study_private.staff_updates u where u.images ? p_name);
end $access$;
revoke all on function public.study_staff_photo_access(text,boolean) from public;
grant execute on function public.study_staff_photo_access(text,boolean) to anon,authenticated;
create function public.study_staff_photo_quota() returns boolean language plpgsql security definer set search_path=pg_catalog as $quota$
begin
 if not public.study_staff_photo_access('',true) then return false;end if;
 perform pg_advisory_xact_lock(185712,4);
 return (select coalesce(sum(coalesce((metadata->>'size')::bigint,262144)),0) from storage.objects where bucket_id='study-staff-photos')<=67108864-262144;
end $quota$;
revoke all on function public.study_staff_photo_quota() from public,anon;
grant execute on function public.study_staff_photo_quota() to authenticated;
create policy staff_photos_read on storage.objects for select to anon,authenticated using (
 bucket_id='study-staff-photos' and (public.study_staff_photo_access(name,false) or (public.study_staff_photo_access(name,true) and (owner_id=(select auth.uid())::text or (public.study_security_status()->>'owner')::boolean)))
);
create policy staff_photos_upload on storage.objects for insert to authenticated with check (
 bucket_id='study-staff-photos' and public.study_staff_photo_access(name,true) and public.study_staff_photo_quota() and owner_id=(select auth.uid())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
);
create policy staff_photos_remove on storage.objects for delete to authenticated using (
 bucket_id='study-staff-photos' and public.study_staff_photo_access(name,true) and (owner_id=(select auth.uid())::text or (public.study_security_status()->>'owner')::boolean)
);
