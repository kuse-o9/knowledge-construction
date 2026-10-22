const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema study_private;
create table auth.sessions(id uuid primary key,user_id uuid);create table study_private.settings(singleton boolean,owner_id uuid);create table study_private.admin_members(user_id uuid);create table public.study_profiles(id uuid,nickname text);alter table public.study_profiles enable row level security;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function study_private.active_account(id uuid) returns boolean language sql stable as $$select id is not null and id<>'00000000-0000-4000-8000-000000000004'::uuid$$;
create function public.study_account_access() returns boolean language sql stable security definer as $$select study_private.active_account(auth.uid())$$;
create function public.study_admin_summary() returns jsonb language plpgsql security definer as $$begin if not exists(select 1 from study_private.admin_members where user_id=auth.uid()) then raise insufficient_privilege;end if;return '{}'::jsonb;end$$;
create function public.study_game_admin(p_action text default 'list',p_id text default null,p_published boolean default null,p_note text default '',p_revision bigint default null) returns jsonb language plpgsql security definer as $$begin if not exists(select 1 from study_private.admin_members where user_id=auth.uid()) then raise insufficient_privilege;end if;return '[]'::jsonb;end$$;
create policy study_read_own_profile on public.study_profiles for select to authenticated using(public.study_account_access() and auth.uid()=id);`);
const ids=[1,2,3,4].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')),sid='10000000-0000-4000-8000-000000000001',sid2='10000000-0000-4000-8000-000000000002';await db.query('insert into study_private.settings values(true,$1)',[ids[0]]);for(const i of [0,1,3])await db.query('insert into study_private.admin_members values($1)',[ids[i]]);await db.query('insert into auth.sessions values($1,$2),($3,$4)',[sid,ids[0],sid2,ids[1]]);
const sql=fs.readFileSync(require('node:path').join(__dirname,'study-security.sql'),'utf8');await db.exec(sql);await db.exec(sql);let count=0;
async function claims(actor,session){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,session_id:session})]);}
async function status(actor,session){await claims(actor,session);return (await db.query('select public.study_security_status() as s')).rows[0].s;}
async function reject(work){let rejected=false;try{await work()}catch{rejected=true}assert(rejected);count++;}
assert((await status(null,null)).allowed);count++;assert(!(await status(ids[0],sid)).adminVerified);count++;
await reject(()=>db.query('select public.study_security_admin(true,$1,1)',['testing']));
assert(!(await db.query("select has_function_privilege('authenticated','public.study_security_service(text,uuid,uuid)','execute') as ok")).rows[0].ok);count++;
await reject(()=>db.query("select public.study_security_service('unlock',$1,$2)",[ids[2],sid]));await reject(()=>db.query("select public.study_security_service('unlock',$1,$2)",[ids[0],sid2]));
await db.query("select public.study_security_service('unlock',$1,$2)",[ids[0],sid]);assert((await status(ids[0],sid)).adminVerified);count++;
await claims(ids[0],sid);await db.query('select public.study_security_admin(true,$1,1)',['maintenance test']);
for(const a of [null,ids[1],ids[2],ids[3]]){assert(!(await status(a,sid2)).allowed);count++;}assert((await status(ids[0],sid)).allowed);count++;
await claims(ids[1],sid2);await reject(()=>db.query('select public.study_security_admin(false,$1,2)',['test']));await claims(ids[0],sid);await reject(()=>db.query('select public.study_security_admin(false,$1,1)',['stale']));await db.query('select public.study_security_admin(false,$1,2)',['normal']);
await db.query('delete from study_private.admin_members where user_id=$1',[ids[0]]);assert(!(await status(ids[0],sid)).adminVerified);count++;
await reject(()=>db.query("select public.study_security_service('unlock',$1,$2)",[ids[3],sid]));
for(let i=0;i<7;i++){const r=(await db.query("select public.study_security_service('rate',$1,$2) as s",[ids[1],sid2])).rows[0].s;assert.equal(r.allowed,i<6);}count++;
await db.query("select public.study_security_service('unlock',$1,$2)",[ids[1],sid2]);await db.query("update study_private.admin_verified_sessions set expires_at=now()-interval '1 second'");assert(!(await status(ids[1],sid2)).adminVerified);count++;
console.log(JSON.stringify({pass:true,checks:count,idempotent:true}));await db.close();})().catch(e=>{console.error(e);process.exit(1)});
