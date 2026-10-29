'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('editor/studio.js','utf8');
const handler=source.slice(source.indexOf('async function importFiles('),source.indexOf('\nfunction add(a)'));
async function run(mode,kind='video'){
 const old={id:'saved',name:'source.webm',kind:'video',duration:10},assets=[old],clips=[{asset:'saved',trim:1,duration:4,speed:2}];let revoked=0,created=0,paused=0,cleared=0,status='';
 const context={assets,clips,exporting:mode==='already-exporting',URL:{createObjectURL(){created++;return 'blob:test';},revokeObjectURL(){revoked++;}},uid:()=> 'new',note:s=>status=s,library(){},draw(){},setTimeout(fn){if(mode==='timeout')queueMicrotask(fn);return 1;},clearTimeout(){cleared++;},document:{createElement(tag){const events=new Map();return{duration:mode==='short'?5:10,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n),removeAttribute(){},load(){},pause(){paused++;},set src(_){if(mode==='became-exporting')context.exporting=true;if(mode!=='timeout')queueMicrotask(()=>events.get(mode==='error'?'error':tag==='img'?'load':'loadedmetadata')?.());}};}}};
 vm.runInNewContext(handler+'\nexports.importFiles=importFiles;',Object.assign(context,{exports:{}}));
 const result=await context.exports.importFiles([{name:'source.webm',type:kind+'/webm'}]);
 if(['short','error','timeout','became-exporting','already-exporting'].includes(mode)){
  assert.equal(result.length,0);assert.equal(old.el,undefined);assert.equal(old.duration,10);assert.equal(assets.length,1);
  if(mode!=='already-exporting'){assert.equal(revoked,1);assert.equal(paused,1);assert.ok(cleared>0);assert.ok(status);}
 }else if(mode==='wrong-kind'){
  assert.equal(old.el,undefined);assert.equal(assets.length,2);assert.equal(result[0].kind,'audio');assert.equal(revoked,0);
 }else{assert.equal(result.length,1);assert.equal(result[0],old);assert.ok(old.el);assert.equal(assets.length,1);assert.equal(revoked,0);}
 if(mode==='already-exporting')assert.equal(created,0);
}
(async()=>{for(const mode of ['ok','short','error','timeout','became-exporting','already-exporting'])await run(mode);await run('wrong-kind','audio');console.log(JSON.stringify({pass:true,cases:7,failedImportPreservesProject:true,boundedWait:true,kindMismatchNeverReplacesExistingVideo:true}));})().catch(e=>{console.error(e);process.exit(1);});
