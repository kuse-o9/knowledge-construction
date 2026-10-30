'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function fn(name){let a=source.indexOf('function '+name+'('),b=source.indexOf('{',a),n=1,i=b+1;for(;n;i++){if(source[i]==='{')n++;else if(source[i]==='}')n--;}return source.slice(a,i);}
const handler=source.match(/canvas.addEventListener\('pointermove', event => \{([\s\S]*?)\n\}\);/)[1];
const frames=new Map(),paint=[];let id=0;
const ctx=new Proxy({},{get:(o,key)=>typeof o[key]==='function'?o[key]:(...args)=>paint.push([key,...args]),set:(o,key,value)=>(o[key]=value,true)});
const c=vm.createContext({ctx,$:()=>({}),requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:id=>frames.delete(id),position:e=>({x:e.x,y:e.y})});
vm.runInContext('let notePaint=0;let strokes=[];let active={pointer:1,mode:"pen",color:"#123456",width:3,points:[{x:0,y:0}]};'+fn('scheduleNoteRender')+'\n'+fn('render')+'\nfunction move(event){'+handler+'}',c);
for(let i=1;i<=100;i++)c.move({pointerId:1,x:i,y:i*2});
assert.equal(frames.size,1,'Moves should share a paint');assert.equal(vm.runInContext('active.points.length',c),101);
const draw=frames.values().next().value;frames.clear();draw();const scheduled=JSON.stringify(paint);paint.length=0;c.render();assert.equal(JSON.stringify(paint),scheduled,'Painted paths changed');
c.move({pointerId:1,x:101,y:202});assert.equal(frames.size,1);c.render();assert.equal(frames.size,0,'Synchronous completion must cancel pending paint');
assert.equal(vm.runInContext('active.points.at(-1).y',c),202);
console.log('PASS: 100 moves -> 1 scheduled repaint, 101 points retained, identical draw commands, final flush cancels stale frame');
