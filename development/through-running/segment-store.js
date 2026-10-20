/* Retain the current/next existing segments. Never navigates or reloads the page. */
(function(g){'use strict';
const cache=new Map(),pending=new Map();
function seed(id,pack){cache.set(id,pack);}
async function load(id){
 if(!['main','west','ome','okutama','fuji','lake'].includes(id))throw Error('未制作の区間です');
 if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
 const task=(async()=>{const response=await fetch('chuo-'+id+'.bin?v=continuous1');if(!response.ok)throw Error('区間を取得できません');const pack=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(pack.segment!==id||!pack.data?.routes||!pack.models?.tracks)throw Error('区間データが一致しません');cache.set(id,pack);return pack;})();
 pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
function retain(ids){for(const id of cache.keys())if(!ids.includes(id))cache.delete(id);}
g.BaylineSegmentStore={seed,load,retain};
})(typeof globalThis==='object'?globalThis:window);
