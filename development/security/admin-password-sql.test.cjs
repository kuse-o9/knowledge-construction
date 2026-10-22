const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');const db=new PGlite({extensions:{pgcrypto}});await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema study_private;
create table auth.sessions(id uuid primary key,user_id uuid);create table study_private.settings(singleton boolean,owner_id uuid);create table study_private.admin_members(user_id uuid);create table public.study_profiles(id uuid,nickname text);alter table public.study_profiles enable row level security;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function study_private.active_account(id uuid) returns boolean language sql stable as $$select id is not null and id<>'00000000-0000-4000-8000-000000000004'::uuid$$;
create function public.study_account_access() returns boolean language sql stable security definer as $$select study_private.active_account(auth.uid())$$;
create function public.study_admin_summary() returns jsonb language plpgsql security definer as $$begin if not exists(select 1 from study_private.admin_members where user_id=auth.uid()) then raise insufficient_privilege;end if;return '{}'::jsonb;end$$;
create function public.study_game_admin(p_action text default 'list',p_id text default null,p_published boolean default null,p_note text default '',p_revision bigint default null) returns jsonb language plpgsql security definer as $$begin if not exists(select 1 from study_private.admin_members where user_id=auth.uid()) then raise insufficient_privilege;end if;return '[]'::jsonb;end$$;
create policy study_read_own_profile on public.study_profiles for select to authenticated using(public.study_account_access() and auth.uid()=id);`);
const ids=[1,2,3,4].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')),sid='10000000-0000-4000-8000-000000000001',sid2='10000000-0000-4000-8000-000000000002';await db.query('insert into study_private.settings values(true,$1)',[ids[0]]);for(const i of [0,1,3])await db.query('insert into study_private.admin_members values($1)',[ids[i]]);await db.query('insert into auth.sessions values($1,$2),($3,$4)',[sid,ids[0],sid2,ids[1]]);
await db.exec(fs.readFileSync(require('node:path').join(__dirname,'study-security.sql'),'utf8'));
const migration=fs.readFileSync(require('node:path').join(__dirname,'admin-password.sql'),'utf8');await db.exec(migration);await db.exec(migration);let checks=0;
const pass='TEST-ONLY-Admin-Passphrase-A',pass2='TEST-ONLY-Admin-Passphrase-B';
async function status(actor,session){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,session_id:session})]);return (await db.query('select public.study_security_status() as s')).rows[0].s;}
async function reject(fn){let ok=false;try{await fn()}catch{ok=true}assert(ok);checks++;}
async function op(action,actor,session,pw,rev=null){return (await db.query('select public.study_admin_password_service($1,$2,$3,$4,$5) as s',[action,actor,session,pw,rev])).rows[0].s;}
assert(!(await status(ids[0],sid)).adminPasswordConfigured);checks++;
await db.query('insert into study_private.admin_verified_sessions(session_id,actor) values($1,$2)',[sid,ids[0]]);assert(!(await status(ids[0],sid)).adminVerified);checks++;
await reject(()=>db.query("select public.study_security_service('unlock',$1,$2)",[ids[0],sid]));
assert(!(await op('verify',ids[0],sid,pass)).verified);checks++;
await reject(()=>op('set',ids[1],sid2,pass,0));await reject(()=>op('set',ids[2],sid,pass,0));await reject(()=>op('set',ids[0],sid2,pass,0));
assert(!(await op('set',ids[0],sid,'short',0)).verified);checks++;
assert((await op('set',ids[0],sid,pass,0)).verified);assert((await status(ids[0],sid)).adminVerified);checks++;
assert(!(await op('verify',ids[1],sid2,'wrong-but-long-enough')).verified);checks++;
assert((await op('verify',ids[1],sid2,pass)).verified);assert((await status(ids[1],sid2)).adminVerified);checks++;
const hash=(await db.query('select password_hash from study_private.admin_password_settings')).rows[0].password_hash;assert(hash!==pass&&hash.startsWith('$2a$12$'));checks++;
await reject(()=>op('set',ids[0],sid,pass2,0));
assert((await op('set',ids[0],sid,pass2,1)).verified);assert(!(await status(ids[1],sid2)).adminVerified);checks++;
assert(!(await op('verify',ids[1],sid2,pass)).verified);checks++;
assert((await op('verify',ids[1],sid2,pass2)).verified);checks++;
await db.query("update study_private.admin_verified_sessions set expires_at=now()-interval '1 second'");assert(!(await status(ids[1],sid2)).adminVerified);checks++;
await db.query('delete from study_private.admin_members where user_id=$1',[ids[1]]);await reject(()=>op('verify',ids[1],sid2,pass2));
for(const role of ['anon','authenticated']){assert(!(await db.query("select has_function_privilege($1,'public.study_admin_password_service(text,uuid,uuid,text,bigint)','execute') as ok",[role])).rows[0].ok);assert(!(await db.query("select has_table_privilege($1,'study_private.admin_password_settings','select') as ok",[role])).rows[0].ok);checks++;}
console.log(JSON.stringify({pass:true,checks,idempotent:true}));await db.close();})().catch(e=>{console.error(e);process.exit(1)});
