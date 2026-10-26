'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../../rail-games/priority/batch-001/games');
async function test(key,cancel=false){
 const events=[],timers=new Map();let sequence=0,time=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}}),node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(){},stop(){},threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()});
 class AC{constructor(){this.sampleRate=16;this.destination={};}get currentTime(){return time/1000;}createGain(){return node();}createDynamicsCompressor(){return node();}createBuffer(ch,n){return{getChannelData(){return new Float32Array(n);}};}createBufferSource(){return node();}createBiquadFilter(){return node();}createOscillator(){const n=node();n.start=t=>events.push(['tone',t]);return n;}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}}
 const ctx={AudioContext:AC,setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,at:time+ms,ms});return id;},clearTimeout(id){timers.delete(id);},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices(){return[{lang:'ja-JP',localService:true},{lang:'en-US',localService:true}];},speak(u){events.push(['speak',u.text,time]);queueMicrotask(()=>u.onend());},cancel(){events.push(['cancel']);}}};ctx.window=ctx;
 for(const p of ['express-service.js','rail-audio.js'])vm.runInNewContext(fs.readFileSync(root+'/'+p,'utf8'),ctx);
 const a=ctx.RailAudio.create({chimeKey:key,notify:t=>events.push(['notify',t])});assert(a.enable());const pending=a.onboard('next','甲府','松本',{segments:[{text:'次は甲府です。',lang:'ja-JP'},{text:'The next stop is Kofu.',lang:'en-US'}]});assert(a.busy);assert(!events.some(e=>e[0]==='speak'));const first=[...timers.values()][0];assert.equal(first.ms,4120);
 if(cancel){a.cancel();assert.equal(await pending,false);assert.equal(timers.size,0);assert(!events.some(e=>e[0]==='speak'));return;}
 let done=false,result;pending.then(r=>{done=true;result=r;});for(let n=0;n<20&&!done;n++){await new Promise(setImmediate);if(done)break;const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert(entry);timers.delete(entry[0]);time=entry[1].at;entry[1].fn();}
 assert(done);assert(result);const speech=events.filter(e=>e[0]==='speak');assert.equal(speech.length,2);assert(speech[0][2]>=4120);assert(!a.busy);assert.equal(timers.size,0);a.disable();
}
(async()=>{await test('azusa');await test('kaiji');await test('azusa',true);console.log(JSON.stringify({pass:true,actualAudioController:true,chimeBeforeJapaneseAndEnglish:true,cancellationClearsTimers:true,hardwareListening:false}));})().catch(e=>{console.error(e);process.exitCode=1;});
