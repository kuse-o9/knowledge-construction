'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(root+'/flashcards.js','utf8'),schedule=require('../../review-schedule.js');
function setup(){
 const nodes=[],ids={};class El{constructor(){nodes.push(this);this.hidden=false;this.checked=false;this.value='';this.textContent='';this.classList={toggle(){}};}append(...xs){}after(x){}setAttribute(){}removeAttribute(){}focus(){}}
 for(const id of [...fs.readFileSync(root+'/decks.html','utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]))ids[id]=new El();
 let now=Date.UTC(2026,10,1),perf=0,visibility,fail=false,n=0;const timers=new Map(),store=new Map(),events=[];
 const doc={hidden:false,getElementById:id=>ids[id]||nodes.find(x=>x.id===id),createElement:()=>new El(),createTextNode:t=>t,querySelector:()=>new El(),addEventListener:(e,f)=>visibility=f};
 const DateMock=class extends Date{constructor(...xs){super(...(xs.length?xs:[now]));}static now(){return now;}};
 const win={StudyReviewSchedule:schedule,addEventListener(){},dispatchEvent:e=>events.push(e)};
 vm.runInNewContext(source,{window:win,document:doc,Date:DateMock,performance:{now:()=>perf},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,v);},removeItem:k=>store.delete(k)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},setInterval:f=>{timers.set(++n,f);return n;},clearInterval:n=>timers.delete(n),confirm:()=>true});
 const api=win.StudyFlashcards();const $=id=>doc.getElementById(id);return{api,$,store,events,timers,doc,advance:ms=>{now+=ms;perf+=ms;for(const f of [...timers.values()])f();},hide:b=>{doc.hidden=b;visibility();},fail:()=>fail=true};
}
const deck={id:'d',title:'test',questions:[{id:'q',prompt:'<script>bad</script>',answer:'1'},{id:'q2',prompt:'second',answer:'2'}]},scope='personal:a',key='study-flashcards-v1:'+scope+':d';
const t=setup();t.api.setDeck(deck,scope);assert.equal(t.$('flash-prompt').textContent,deck.questions[0].prompt);t.$('flash-flip').onclick();t.$('flash-learned').onclick();let saved=JSON.parse(t.store.get(key));assert.equal(saved.version,2);assert.equal(saved.items[0].stage,1);assert.equal(t.events.length,1);assert(!t.store.get(key).includes('script'));
t.$('flash-filter').value='due';t.$('flash-start').onclick();assert(t.$('flash-card').hidden,'Not yet due');t.advance(86400000);t.$('flash-start').onclick();assert(!t.$('flash-card').hidden);assert.equal(t.$('flash-prompt').textContent,deck.questions[0].prompt);
// Legacy v1 self-assessment is retained and becomes eligible for a first scheduled review.
t.store.set(key,JSON.stringify({version:1,items:saved.items.map(({id,stamp,status})=>({id,stamp,status}))}));t.api.setDeck(deck,scope);t.$('flash-filter').value='due';t.$('flash-start').onclick();assert(!t.$('flash-card').hidden);t.$('flash-flip').onclick();t.$('flash-again').onclick();assert.equal(JSON.parse(t.store.get(key)).items[0].stage,0);
t.api.rescope('personal:b');t.$('flash-filter').value='due';t.$('flash-start').onclick();assert(t.$('flash-card').hidden,'Another account cannot read prior progress');
t.api.setDeck({...deck,questions:deck.questions.map(q=>({...q,answer:'changed'}))},scope);t.$('flash-filter').value='due';t.$('flash-start').onclick();assert(t.$('flash-card').hidden,'Edited questions invalidate old assessment');
// A five-minute session pauses while hidden and finishes only after current-card assessment.
const u=setup();u.api.setDeck(deck,scope);u.$('flash-five-minutes').checked=true;u.$('flash-start').onclick();u.advance(1000);assert.match(u.$('flash-session').textContent,/4分 59秒/);u.hide(true);u.advance(600000);u.hide(false);assert(!u.$('flash-card').hidden);u.advance(299000);assert.match(u.$('flash-session').textContent,/今のカード/);assert(!u.$('flash-card').hidden);u.$('flash-flip').onclick();u.$('flash-learned').onclick();assert(u.$('flash-card').hidden);assert.equal(u.events.length,1);assert.equal(u.timers.size,0);
u.api.setDeck(deck,scope);u.$('flash-start').onclick();u.api.clear();assert.equal(u.timers.size,0);assert.equal(u.$('flash-prompt').textContent,'');
const v=setup();v.api.setDeck(deck,scope);v.fail();v.$('flash-flip').onclick();v.$('flash-learned').onclick();assert.match(v.$('flash-message').textContent,/保存できません/);
console.log('PASS v1 migration, due filtering, safe text, account and revision isolation, five-minute expiry/current-card completion, hidden pause, cleanup and quota failure');
