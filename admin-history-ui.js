'use strict';
(function(g){
 const marker="for(const event of result.items){const row=document.createElement('div');row.className='user-row';";
 function withIds(source){return typeof source==='string'?source.replace(marker,marker+'row.dataset.auditId=event.id;'):source;}
 function attach(root){const panel=root.querySelector('#history-panel'),list=root.querySelector('#history-list');if(!panel||!list||panel.dataset.historyTools)return;panel.dataset.historyTools='1';const button=document.createElement('button');button.type='button';button.className='secondary';button.setAttribute('aria-expanded','false');panel.before(button);panel.hidden=true;const mark=document.createElement('button');mark.type='button';mark.className='secondary';mark.textContent='このページを既読にする';panel.prepend(mark);let actor=null,read=new Set();
 const key=()=>'study-audit-seen-v1:'+actor;
 function render(){if(!list.isConnected)return;let fresh=0;for(const row of list.children){const id=row.dataset.auditId;if(typeof id!=='string'||id.length>100)continue;let badge=row.querySelector('.audit-new');if(!badge){badge=document.createElement('strong');badge.className='audit-new';row.prepend(badge);}const unread=!read.has(id);badge.textContent=unread?'new! ':'';if(unread)fresh++;}button.textContent=(panel.hidden?'操作履歴を開く':'操作履歴を閉じる')+(fresh?' ／ new! '+fresh+'件':'');}
 button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));render();};mark.onclick=()=>{if(!actor)return;for(const row of list.children)if(row.dataset.auditId)read.add(row.dataset.auditId);try{const raw=JSON.stringify([...read]);if(read.size<=5000&&raw.length<=200000)localStorage.setItem(key(),raw);}catch{}render();};const observer=new MutationObserver(render);observer.observe(list,{childList:true});render();
 const initial=window.Study?.client?.auth.getSession();if(initial)initial.then(({data})=>{if(!list.isConnected)return;actor=data.session?.user?.id||null;try{const raw=actor&&localStorage.getItem(key());if(raw&&raw.length<=200000){const values=JSON.parse(raw);if(Array.isArray(values)&&values.length<=5000&&values.every(x=>typeof x==='string'&&x.length<=100))read=new Set(values);}}catch{}render();});
 const dispose=()=>{observer.disconnect();list.replaceChildren();read.clear();actor=null;};window.addEventListener('study-admin-cleared',dispose,{once:true});window.addEventListener('pagehide',dispose,{once:true});
 }
 const api={withIds,attach};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyAdminHistory=api;
})(globalThis);
