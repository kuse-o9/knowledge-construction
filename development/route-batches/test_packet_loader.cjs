'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),z=require('zlib'),{webcrypto}=require('crypto');
const source=fs.readFileSync(__dirname+'/priority-packet-loader.js','utf8');
async function run(mode){
 const pack=value=>z.gzipSync(JSON.stringify(value)),hash=async b=>Buffer.from(await webcrypto.subtle.digest('SHA-256',b)).toString('hex');
 const common=pack({city:{}}),stock=pack({cars:[]}),route=pack({data:{routes:{}},announcements:{},commonSha256:await hash(common),stockSha256:await hash(stock)}),expected=await hash(route),calls=[],timers=new Set();let mounted=0,reloaded=0;
 const elements=new Map(['scene-status','start'].map(id=>[id,{style:{},setAttribute(k,v){this[k]=v;},insertAdjacentElement(_,v){elements.set(v.id,v);}}]));
 const body={dataset:{packetSha:expected},append(e){elements.set('script',e);}},location={pathname:'/azusa.html',reload(){reloaded++;}};
 const context={window:{BaylineReviewedAnnouncements:{apply(){}},BaylineBatchModels:{initialize(){mounted++;}}},document:{body,getElementById:id=>elements.get(id),createElement:tag=>({tag})},location,crypto:webcrypto,Response,Blob,AbortController,DecompressionStream:mode==='unsupported'?undefined:DecompressionStream,setTimeout(fn){timers.add(fn);if(mode==='timeout')queueMicrotask(fn);return fn;},clearTimeout(id){timers.delete(id);},async fetch(url,options){calls.push({url,options});if(mode==='timeout')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('abort'))));if(mode==='http')return new Response('',{status:503});const bytes=url.startsWith('azusa')?(mode==='corrupt'?Buffer.from('bad'):route):url.startsWith('common')?common:stock;return new Response(bytes);}};
 await vm.runInNewContext(source,context);assert.equal(timers.size,0);assert(calls.every(c=>c.url.includes('?v=')&&c.options.cache==='no-cache'));
 if(mode==='ok'){assert.equal(mounted,1);assert.equal(calls.length,3);assert.equal(elements.get('script').src,'rail.js');elements.get('script').onerror();assert(body.dataset.loadError.includes('運転画面'));}
 else {assert.equal(mounted,0);assert.equal(elements.get('start').disabled,true);assert.equal(elements.get('scene-status').role,'alert');assert(body.dataset.loadError.includes({timeout:'30秒',http:'503',corrupt:'版が一致',unsupported:'展開できません'}[mode]));}
 assert(elements.has('retry-packet-loading'));elements.get('retry-packet-loading').onclick();assert.equal(reloaded,1);
}
(async()=>{for(const mode of ['ok','http','corrupt','unsupported','timeout'])await run(mode);console.log('PASS: success, HTTP failure, corrupt bytes, unsupported decompression, stalled network; retry and timer cleanup');})().catch(e=>{console.error(e);process.exitCode=1;});
