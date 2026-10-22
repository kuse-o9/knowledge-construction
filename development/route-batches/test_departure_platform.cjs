/* Exercise actual departure wording with a mocked WebAudio/speech transport. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
const node=()=>({gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),connect(){},disconnect(){},start(){},stop(){}});
class AudioContext{constructor(){this.currentTime=0;this.sampleRate=8;this.destination={};}createGain(){return node();}createDynamicsCompressor(){return node();}createOscillator(){return node();}createBufferSource(){return node();}createBiquadFilter(){return node();}createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}}
(async()=>{const spoken=[],warnings=[],window={AudioContext,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'ja-JP',localService:true}],speak:u=>{spoken.push(u.text);u.onend();},cancel(){}}};
const context=vm.createContext({window,setTimeout:(fn,ms)=>setTimeout(fn,ms>=10000?5000:0),clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'batch-001/games/rail-audio.js'),'utf8'),context);
const audio=window.RailAudio.create({warn:m=>warnings.push(m)});assert(audio.enable());
assert(await audio.departure(null,{closeDoors:false}));assert.equal(spoken.at(-1),'ドアが閉まります。ご注意ください。');
assert(await audio.departure('9',{closeDoors:false}));assert.equal(spoken.at(-1),'9番線、ドアが閉まります。ご注意ください。');
assert.equal(warnings.length,0);audio.disable();console.log(JSON.stringify({pass:true,cases:2,scope:'Wording only; mocked audio transport, not listening test'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
