'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path'),html=fs.readFileSync(path.resolve(__dirname,'../../game/index.html'),'utf8');
const a=html.indexOf('    let gpuStopped='),b=html.indexOf('    function animate(){',a);assert(a>0&&b>a);const source=html.slice(a,b);
class El{constructor(){this.style={};this.children=[];this.open=false;this.hidden=false;this.textContent='';}append(...x){this.children.push(...x);for(const e of x)if(e.id)nodes.set(e.id,e);}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}}
const nodes=new Map(),events={},saved=[];let persisted=0,lost=true;
const c={renderer:{domElement:{addEventListener:(n,f)=>events[n]=f},getContext:()=>({isContextLost:()=>lost})},active:true,keys:new Set(['w']),saveBlocked:false,resetting:false,SAVE_KEY:'fixture:user',snapshot:()=>({x:42,money:99}),localStorage:{setItem:(k,v)=>saved.push([k,v])},persist:async()=>{persisted++;},clock:{getDelta(){}},location:{reload(){}},document:{getElementById:id=>nodes.get(id),createElement:()=>new El(),body:{append:e=>nodes.set(e.id,e)}}};
vm.runInNewContext(source,c);let prevented=0;events.webglcontextlost({preventDefault(){prevented++;}});events.webglcontextlost({preventDefault(){prevented++;}});
assert.equal(prevented,2);assert.equal(c.active,false);assert.equal(c.keys.size,0);assert.equal(saved.length,1);assert.equal(persisted,1);assert.equal(JSON.parse(saved[0][1]).money,99);assert.match(nodes.get('island-gpu-message').textContent,/保存しました/);
assert.equal(nodes.get('island-gpu-resume').hidden,true);lost=false;events.webglcontextrestored();nodes.get('island-gpu-resume').onclick();assert.equal(c.active,true);assert.equal(nodes.get('island-gpu-error').open,false);
assert(html.includes('requestAnimationFrame(animate);if(gpuStopped){clock.getDelta();return;}'));
console.log('PASS: loss saves once, stops input/render updates, restored context requires explicit resume, original state preserved');
