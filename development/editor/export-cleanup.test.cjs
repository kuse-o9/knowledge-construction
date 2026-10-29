'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('editor/studio.js','utf8'),handler=source.slice(source.indexOf("$('export').onclick="),source.indexOf("$('redo').onclick="));
async function run(mode){
 const nodes={},get=id=>nodes[id]??={value:id==='format'?'webm':'作品',hidden:false,disabled:false};let stopped=0,cleared=0,downloads=0,recorder;
 class Recorder{static isTypeSupported(){return true;}constructor(){if(mode==='constructor')throw Error('Unsupported encoder');recorder=this;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}}
 const context={$:get,clips:[{track:'video',asset:'asset'}],assets:[{id:'asset',el:{}}],canvas:{width:1920,height:1080,captureStream:()=>({addTrack(){},getVideoTracks:()=>[{stop(){stopped++;}}]})},window:{MediaRecorder:Recorder},MediaRecorder:Recorder,audio:async()=>{},mix:{stream:{getAudioTracks:()=>[]}},stop(){},play:async()=>{if(mode==='play')throw Error('Playback denied');},download(){downloads++;},note:s=>get('status').value=s,setInterval:()=>1,clearInterval(){cleared++;},draw(){},Blob,exporting:false,playing:true,activeRecorder:null,cancelledExport:false,time:0};
 vm.runInNewContext(handler,context);await get('export').onclick();
 if(mode==='error'){recorder.onerror();recorder.onstop();}
 if(mode==='success'){recorder.ondataavailable({data:new Blob(['frame'])});recorder.stop();}
 assert.ok(stopped>0);assert.ok(cleared>0);assert.equal(context.exporting,false);assert.equal(context.activeRecorder,null);assert.equal(get('cancel-export').hidden,true);assert.equal(get('export').disabled,false);assert.equal(downloads,mode==='success'?1:0);
}
(async()=>{for(const mode of ['constructor','play','error','success'])await run(mode);console.log(JSON.stringify({pass:true,cases:4,captureTracksReleased:true,failedRecordingNeverDownloaded:true}));})().catch(e=>{console.error(e);process.exit(1);});
