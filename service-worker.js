'use strict';
const CACHE='study-note-public-static-v1',base=new URL('./',self.location.href),offline=new URL('offline.html',base).href;
const publicFiles=['offline.html','app-icon.svg','manifest.webmanifest','app-icon-192.png','app-icon-512.png'].map(p=>new URL(p,base).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(publicFiles)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('study-note-public-static-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match(offline)));return;}
 // Never cache page HTML, API responses, auth, signed images, or private records.
 u.search='';if(!publicFiles.includes(u.href))return;
 e.respondWith(fetch(r).then(response=>{if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(u.href,copy)));}return response;}).catch(()=>caches.match(u.href)));
});
