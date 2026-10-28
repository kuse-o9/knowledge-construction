-- Require the same dedicated administrator password on legacy game-management RPCs.
create or replace function public.game_admin_is_admin()
returns boolean language sql stable security definer
set search_path = 'pg_catalog'
as $$
 select coalesce((public.study_security_status()->>'allowed')::boolean,false)
 and coalesce((public.study_security_status()->>'adminVerified')::boolean,false)
 and exists(select 1 from auth.sessions s where s.user_id=auth.uid()
   and s.id=nullif(auth.jwt()->>'session_id','')::uuid);
$$;
revoke all on function public.game_admin_is_admin() from public, anon;
grant execute on function public.game_admin_is_admin() to authenticated;
-- RLS continues to isolate each player's save. No browser needs TRUNCATE/DDL privileges.
revoke all on public.game_saves from anon;
revoke truncate, references, trigger on public.game_saves from authenticated;
notify pgrst, 'reload schema';