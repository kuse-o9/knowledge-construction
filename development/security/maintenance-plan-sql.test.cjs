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
await db.exec(fs.readFileSync(require('node:path').join(__dirname,'maintenance-plan.sql'),'utf8'));await db.exec(fs.readFileSync(require('node:path').join(__dirname,'maintenance-plan.sql'),'utf8'));
await db.exec("update study_private.admin_password_settings set password_hash='test-fixture-only',revision=1");await db.query('insert into study_private.admin_verified_sessions(session_id,actor,password_revision) values($1,$2,1),($3,$4,1)',[sid,ids[0],sid2,ids[1]]);
async function claims(a,s){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:a,session_id:s})]);}
async function reject(fn,code){let e;try{await fn()}catch(x){e=x}assert(e);if(code)assert.equal(e.code,code);checks++;}
await claims(ids[0],sid);const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString(),announce=new Date(Date.now()+1800000).toISOString();
async function save(id=null,rev=null,a=start,b=end,c=announce){return(await db.query("select public.study_maintenance_plan('save',$1,'Test notice','<script>test only</script>',$2,$3,$4,$5) as s",[id,a,b,c,rev])).rows[0].s;}
const created=await save();assert(created.ok);checks++;
async function eff(t){return(await db.query('select study_private.maintenance_effective($1) as s',[t])).rows[0].s;}
assert(!(await eff(announce)).maintenance);assert.equal((await eff(announce)).announcements.length,1);checks++;
assert.equal((await eff(new Date(new Date(announce)-1).toISOString())).announcements.length,0);checks++;
assert(!(await eff(new Date(new Date(start)-1).toISOString())).maintenance);assert((await eff(start)).maintenance);checks++;
assert(!(await eff(end)).maintenance);assert.equal((await eff(end)).announcements.length,0);checks++;
await reject(()=>save(), '23P01');await reject(()=>save(null,null,end,start,announce),'22023');await reject(()=>save(null,null,start,end,end),'22023');
await reject(()=>save(created.id,999),'40001');await save(created.id,1);checks++;
await claims(ids[1],sid2);await reject(()=>db.query('select public.study_maintenance_plan()'),'42501');await claims(ids[2],sid);await reject(()=>db.query('select public.study_maintenance_plan()'),'42501');
await claims(ids[0],sid);await db.query("select public.study_maintenance_plan('cancel',$1,null,null,null,null,null,2)",[created.id]);assert(!(await eff(start)).maintenance);assert.equal((await eff(announce)).announcements.length,0);checks++;
await reject(()=>db.query("select public.study_maintenance_plan('cancel',$1,null,null,null,null,null,2)",[created.id]),'40001');
await db.exec('update study_private.maintenance_settings set enabled=true');assert((await eff(end)).maintenance);checks++;
for(const role of ['anon','authenticated']){assert(!(await db.query("select has_table_privilege($1,'study_private.maintenance_plans','select') as ok",[role])).rows[0].ok);checks++;}
await claims(null,null);const publicStatus=(await db.query('select public.study_security_status() as s')).rows[0].s;assert(publicStatus.maintenance&&!publicStatus.allowed&&!publicStatus.owner);checks++;
console.log(JSON.stringify({pass:true,checks,idempotent:true}));await db.close();})().catch(e=>{console.error(e);process.exit(1)});
