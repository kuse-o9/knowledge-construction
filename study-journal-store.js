'use strict';
(function(g){
 const MAX=366,DAY=86400000;
 const today=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
 function date(value){return typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
 function parse(raw){if(raw===null)return {};if(typeof raw!=='string'||raw.length>1000000)throw Error('学習記録が大きすぎます。');const x=JSON.parse(raw);if(x?.version!==1||!x.days||Array.isArray(x.days)||typeof x.days!=='object'||Object.keys(x.days).length>MAX)throw Error('学習記録の形式を確認してください。');const out={};for(const [key,v]of Object.entries(x.days)){if(!date(key)||!v||!Number.isInteger(v.minutes)||v.minutes<0||v.minutes>1440||typeof v.body!=='string'||v.body.length>1000||!Array.isArray(v.cards)||v.cards.length>200||!v.cards.every(s=>typeof s==='string'&&s.length<=250))throw Error('学習記録の内容を確認してください。');out[key]={minutes:v.minutes,body:v.body,cards:[...new Set(v.cards)]};}return out;}
 function put(days,key,value){if(!date(key))throw Error('日付を確認してください。');if(!Object.hasOwn(days,key)&&Object.keys(days).length>=MAX)throw Error('保存は366日分までです。ファイルに控えてから、不要な日の記録を自分で削除してください。');return {...days,[key]:value};}
 function save(storage,actor,days){if(typeof actor!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(actor))throw Error('ログイン状態を確認してください。');const raw=JSON.stringify({version:1,days});parse(raw);storage.setItem('study-journal-v1:'+actor,raw);}
 const api={today,date,parse,put,save};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyJournalStore=api;
})(globalThis);
