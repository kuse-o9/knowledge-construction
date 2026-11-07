'use strict';
(function(g){
 function organize(root){
  if(!root||root.querySelector('.sn-admin-dashboard'))return;
  const groups=[['交流とお知らせ','community',['notices','updates','board','chat']],['教材とコンテンツ','content',['music','games']],['運営・オーナー設定','operations',['maintenance']]];
  const dashboard=document.createElement('section');dashboard.className='sn-admin-dashboard';dashboard.setAttribute('aria-label','管理メニュー');
  for(const [title,category,keys]of groups){const tools=keys.map(key=>root.querySelector('[data-admin-tool="'+key+'"]')).filter(Boolean);if(!tools.length)continue;const section=document.createElement('section'),h=document.createElement('h2'),grid=document.createElement('div');h.className='sn-admin-group-title';h.textContent=title;grid.className='sn-admin-tool-grid';grid.dataset.category=category;for(const tool of tools){tool.classList.add('sn-admin-tool');grid.append(tool);}section.append(h,grid);dashboard.append(section);}
  if(!dashboard.children.length)return;
  const remaining=[...root.children].filter(x=>x!==dashboard);
  root.prepend(dashboard);
  if(remaining.length){const h=document.createElement('h2');h.className='sn-admin-divider';h.textContent='教材・アカウントの管理';dashboard.after(h);}
 }
 const api={organize};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyAdminLayout=api;
})(globalThis);
