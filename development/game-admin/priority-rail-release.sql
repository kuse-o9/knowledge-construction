-- Additive registration only; retain every existing game's state and authority.
begin;
insert into study_private.game_publication(id,title,path,published,note) values
 ('azusa','特急あずさ','rail-games/priority/batch-001/games/azusa.html',false,''),
 ('kaiji','特急かいじ','rail-games/priority/batch-001/games/kaiji.html',false,'')
on conflict(id) do nothing;
select id,title,path,published,revision from study_private.game_publication where id in ('azusa','kaiji');
commit;
