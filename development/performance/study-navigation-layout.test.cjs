'use strict';
// DOM-only regression checks: no credentials, API requests or production writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {parseHTML}=require(process.env.LINKEDOM_MODULE||'linkedom');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'study-navigation.js'),'utf8');
const files=fs.readdirSync(root).filter(p=>p.endsWith('.html')&&fs.readFileSync(path.join(root,p),'utf8').includes('study-design.css?v=20261107'));
for(const file of files){
 const html=fs.readFileSync(path.join(root,file),'utf8'),{window}=parseHTML(html),doc=window.document;
 const header=doc.querySelector('body > header');if(!header?.querySelector('nav'))continue;
 const ids=[...doc.querySelectorAll('main [id]')].map(n=>n.id),main=doc.querySelector('main'),game=doc.getElementById('game-room-launch');let gameClicks=0;game?.addEventListener('click',()=>gameClicks++);
 const href='https://example.test/study/'+file;const context={document:doc,location:{href},URL,console};
 vm.runInNewContext(source,context);
 assert.ok(doc.querySelector('.sn-navigation'),file);assert.equal(doc.querySelectorAll('.sn-brand').length,1,file);
 for(const id of ids)assert.ok(doc.getElementById(id),file+' retains '+id);
 assert.equal(doc.querySelector('main'),main,'forms/main are not replaced');
 const link=doc.querySelector('.sn-navigation a[href="decks.html"]');assert.ok(link);
 assert.ok(doc.querySelector('.sn-skip'));
 if(game){assert.equal(doc.getElementById('game-room-launch'),game);game.dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(gameClicks,1,'game handler retained after regrouping');}
 assert.equal(doc.querySelectorAll('form').length,parseHTML(html).document.querySelectorAll('form').length);
}
// Reordering a permitted admin menu must retain forms, node identities and handlers.
const {window}=parseHTML('<html><body><div id="root"><form id="editor"><input value="draft"></form><section class="card" data-admin-tool="notices"><button id="action">open</button></section><section class="card" data-admin-tool="games"></section></div></body></html>');
const doc=window.document,r=doc.getElementById('root'),form=doc.getElementById('editor'),button=doc.getElementById('action');let called=0;button.addEventListener('click',()=>called++);
const c={document:doc,globalThis:null};c.globalThis=c;vm.runInNewContext(fs.readFileSync(path.join(root,'admin-layout.js'),'utf8'),c);c.StudyAdminLayout.organize(r);c.StudyAdminLayout.organize(r);
assert.equal(doc.querySelectorAll('.sn-admin-dashboard').length,1);assert.equal(doc.getElementById('editor'),form);assert.equal(doc.querySelector('input').value,'draft');assert.equal(doc.getElementById('action'),button);button.dispatchEvent(new window.Event('click'));assert.equal(called,1);assert.equal(doc.querySelector('[data-admin-tool="maintenance"]'),null,'no owner-only menu invented');
console.log('PASS '+files.length+' study pages: grouped navigation preserves main/forms/game handlers; admin dashboard preserves drafts/handlers and creates no owner privileges (DOM only)');
