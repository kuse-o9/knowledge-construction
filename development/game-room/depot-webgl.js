/* Existing depot faces are rendered as actual GPU triangles with a depth buffer.
 * Floors share geometry, but occupy independent 14-unit storeys. Only the
 * current storey is uploaded; unopened operators never receive invented trains.
 */
'use strict';
(async () => {
  const $ = id => document.getElementById(id), canvas = $('depot');
  const BASE = new URL('../../', document.currentScript?.src || new URL('development/game-room/depot-webgl.js', location.href));
  const LINE = {
    'yamanote/index.html': ['yamanote', -20, '#91ba37'],
    'keihin.html': ['keihin', -4, '#4ba9ca'],
    'chuo.html': ['chuo', 4, '#ef842d'],
    'chuo-local.html': ['sobu', 12, '#e4c23a'],
    'sobu.html': ['sobuRapid', 20, '#366da3'],
    'railway/index.html': ['yurikamome', -12, '#56a8c4']
  };
  let gl, program, floors, model, current, geometry, dragging, moving = false, lost = false;
  let yaw = .25, pitch = .12, distance = 68, frame = 0, hovered = null;
  let eye, forward, right, up, elevation = 0, lastWidth = 0, lastHeight = 0;
  const bufferCache = new Map();
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => { const n=Math.hypot(...a); return a.map(v=>v/n); };
  const loadingError = message => { $('loading').hidden=false; $('loading').textContent=message; };
  function shader(type, source) {
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function initGL() {
    gl=canvas.getContext('webgl',{antialias:true,alpha:false});
    if(!gl) throw Error('WebGLを利用できません');
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 position; attribute vec3 color;
      uniform mat4 view; uniform mat4 projection; uniform float elevation;
      varying vec3 shade; varying float depth;
      void main(){vec4 p=view*vec4(position+vec3(0.,elevation,0.),1.);
      gl_Position=projection*p; shade=color; depth=-p.z;}`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision mediump float; varying vec3 shade; varying float depth;
      void main(){float fog=smoothstep(75.,180.,depth)*.55;
      gl_FragColor=vec4(mix(shade,vec3(.20,.28,.24),fog),1.);}`));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clearColor(.19,.27,.23,1);
    // Depth testing handles all occlusion. No painter sorting or 2D context.
  }
  function box(faces,x,y,z,w,h,d,color,game=null) {
    const X=x+w/2,A=x-w/2,Y=y+h/2,B=y-h/2,Z=z+d/2,C=z-d/2;
    [
      [[[A,B,C],[X,B,C],[X,Y,C],[A,Y,C]],[0,0,-1]],
      [[[A,B,Z],[A,Y,Z],[X,Y,Z],[X,B,Z]],[0,0,1]],
      [[[A,B,C],[A,Y,C],[A,Y,Z],[A,B,Z]],[-1,0,0]],
      [[[X,B,C],[X,B,Z],[X,Y,Z],[X,Y,C]],[1,0,0]],
      [[[A,Y,C],[X,Y,C],[X,Y,Z],[A,Y,Z]],[0,1,0]],
      [[[A,B,C],[A,B,Z],[X,B,Z],[X,B,C]],[0,-1,0]]
    ].forEach(([v,n])=>faces.push({v,n,c:color,game}));
  }
  function makeFloor(floor) {
    const faces=[];
    box(faces,0,-.35,-6,54,.7,64,'#626e65');
    box(faces,0,6.1,-37.5,54,12.2,.6,'#879187');
    box(faces,-27,6,-6,.55,12,64,'#7c887e');
    box(faces,27,6,-6,.55,12,64,'#7c887e');
    box(faces,0,12.4,-6,54,.5,64,'#a4afa2');
    for(const z of [-33,-19,-5,9,23]) {
      for(const x of [-25.7,25.7]) box(faces,x,5.9,z,.65,11.8,.8,'#c1cabb');
      box(faces,0,11.5,z,53,.55,.65,'#c6cdbf');
      for(const x of [-17,0,17]) box(faces,x,11.17,z,10,.08,.16,'#f3efc4');
    }
    const agt=floor.floor===23;
    const tracks=agt?[0]:[-20,-12,-4,4,12,20];
    for(const x of tracks) {
      if(agt) {
        // Dedicated concrete AGT guideway, without railway sleepers.
        box(faces,x,-.01,-6,3.25,.16,55,'#a5aca0');
        for(const dx of [-.94,.94]) box(faces,x+dx,.14,-6,.48,.11,55,'#6e7770');
        for(const dx of [-1.55,1.55]) box(faces,x+dx,.32,-6,.1,.35,55,'#a3b1aa');
      } else {
        box(faces,x,.01,-6,3.7,.04,55,'#49534b');
        for(let z=-32;z<22;z+=1.65) box(faces,x,.065,z,3.6,.09,.24,'#90978a');
        for(const dx of [-.94,.94]) box(faces,x+dx,.155,-6,.10,.08,55,'#bfc7bf');
      }
      box(faces,x+2.7,.47,-6,1.6,.94,55,'#a5aa97');
      box(faces,x+1.99,.95,-6,.12,.025,55,'#f3cf59');
      box(faces,x+2.7,.95,22,1.6,.025,.15,'#e9dfb3');
    }
    const ids=new Set(floor.trains.map(t=>LINE[t.path]?.[0]));
    for(const f of model.faces) if(f.game && ids.has(f.game)) {
      // Reuse the original train geometry, windows, bogies and roof equipment.
      faces.push({...f,v:f.v.map(v=>[v[0]+(agt?12:0),v[1],v[2]])});
    }
    // An elevator lobby lies outside the track beds at the front of each floor.
    box(faces,-23,2.3,24.4,4.8,4.6,.55,'#45594e');
    for(const x of [-24,-22]) box(faces,x,2.1,24.75,1.96,4.2,.12,'#aab7ac');
    box(faces,-23,4.55,24.78,3.7,.35,.13,'#263c32');
    const data=[];
    for(const f of faces) {
      const light=.65+.35*Math.max(0,dot(f.n,norm([-.3,1,.8])));
      const rgb=[1,3,5].map(i=>parseInt(f.c.slice(i,i+2),16)/255*light);
      for(let i=1;i<f.v.length-1;i++) for(const v of [f.v[0],f.v[i],f.v[i+1]]) data.push(...v,...rgb);
    }
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    return {faces,buffer,count:data.length/6};
  }
  function basis() {
    const target=[0,3+elevation,-5];
    eye=[Math.sin(yaw)*Math.cos(pitch)*distance,target[1]+Math.min(8.4,Math.sin(pitch)*distance),Math.cos(yaw)*Math.cos(pitch)*distance-5];
    forward=norm(sub(target,eye)); right=norm(cross(forward,[0,1,0])); up=cross(right,forward);
    return new Float32Array([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-dot(right,eye),-dot(up,eye),dot(forward,eye),1]);
  }
  function draw() {
    frame=0; if(!geometry||lost) return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(w!==lastWidth||h!==lastHeight) {canvas.width=w;canvas.height=h;lastWidth=w;lastHeight=h;}
    gl.viewport(0,0,w,h); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const f=1/Math.tan(Math.PI/8),near=.2,far=250,aspect=w/h;
    const p=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
    gl.uniformMatrix4fv(gl.getUniformLocation(program,'view'),false,basis());
    gl.uniformMatrix4fv(gl.getUniformLocation(program,'projection'),false,p);
    gl.uniform1f(gl.getUniformLocation(program,'elevation'),elevation);
    gl.bindBuffer(gl.ARRAY_BUFFER,geometry.buffer);
    for(const [name,offset] of [['position',0],['color',12]]) {
      const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);
    }
    gl.drawArrays(gl.TRIANGLES,0,geometry.count);
    canvas.dataset.floor=String(current.floor);canvas.dataset.elevation=String(elevation);
    canvas.dataset.renderer='webgl';canvas.dataset.glError=String(gl.getError());
  }
  function schedule(){if(!frame&&!lost) frame=requestAnimationFrame(draw);}
  // Nearest ray/triangle intersection includes walls and platforms, so hidden
  // trains cannot be clicked through solid geometry.
  function pick(clientX,clientY) {
    if(!geometry||moving||lost) return null;
    basis();const rect=canvas.getBoundingClientRect(),tan=Math.tan(Math.PI/8);
    const x=((clientX-rect.left)/rect.width*2-1)*rect.width/rect.height*tan;
    const y=(1-(clientY-rect.top)/rect.height*2)*tan;
    const dir=norm(forward.map((v,i)=>v+x*right[i]+y*up[i]));
    const origin=[eye[0],eye[1]-elevation,eye[2]];
    let nearest=Infinity,game=null;
    for(const face of geometry.faces) for(let i=1;i<face.v.length-1;i++) {
      const a=face.v[0],b=face.v[i],c=face.v[i+1],e1=sub(b,a),e2=sub(c,a),p=cross(dir,e2),det=dot(e1,p);
      if(Math.abs(det)<1e-8)continue;
      const s=sub(origin,a),u=dot(s,p)/det;if(u<0||u>1)continue;
      const q=cross(s,e1),v=dot(dir,q)/det;if(v<0||u+v>1)continue;
      const t=dot(e2,q)/det;if(t>.2&&t<nearest){nearest=t;game=face.game;}
    }
    return game;
  }
  function highlight(game) {
    hovered=game;canvas.style.cursor=game?'pointer':dragging?'grabbing':'grab';
    const route=current?.trains.find(t=>LINE[t.path]?.[0]===game);
    $('hover-note').textContent=route?route.name+'で出発 →':current?.trains.length?'車両をクリックして出発':'この会社の運転ゲームは準備中です';
    document.querySelectorAll('.trainlink').forEach(a=>a.classList.toggle('selected',a.dataset.game===game));
  }
  function display(floor) {
    current=floor; elevation=(floor.floor-1)*14;
    if(!bufferCache.has(floor.floor)) bufferCache.set(floor.floor,makeFloor(floor));
    geometry=bufferCache.get(floor.floor);
    $('floor').value=floor.floor;$('floor-number').textContent=floor.floor+'F';$('scene-title').textContent=floor.operator;
    $('train-count').textContent=floor.trains.length?floor.trains.length+'編成 待機中':'車両は準備中・基地見学';
    $('route-count').textContent=floor.trains.length+'路線';$('routes').replaceChildren();
    for(const t of floor.trains) {
      const a=document.createElement('a');a.className='trainlink';a.href=new URL(t.path,BASE).href;
      a.dataset.game=LINE[t.path][0];a.style.setProperty('--line',LINE[t.path][2]);
      a.textContent=t.name;const small=document.createElement('small');small.textContent='この電車で出発 →';a.append(small);$('routes').append(a);
    }
    if(!floor.trains.length) {const p=document.createElement('p');p.className='hint';p.textContent='運転ゲームは現在準備中です。';$('routes').append(p);}
    $('sections').textContent=(floor.sections||[]).join(' ／ ');
    $('down').disabled=floor.floor===1;$('up').disabled=floor.floor===floors.length;
    highlight(null);schedule();
  }
  async function travel(number) {
    if(moving||!current) return;
    const target=floors.find(f=>f.floor===Number(number));if(!target||target===current)return;
    moving=true;highlight(null);$('floor').disabled=true;$('up').disabled=true;$('down').disabled=true;
    const from=current.floor,start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:900;
    $('lift').hidden=false;
    await new Promise(resolve=>{
      function step(now){const t=duration?Math.min(1,(now-start)/duration):1;
        $('lift-number').textContent=Math.round(from+(target.floor-from)*t)+'F';
        if(t<1)requestAnimationFrame(step);else resolve();}
      requestAnimationFrame(step);
    });
    display(target);$('lift').hidden=true;$('floor').disabled=false;moving=false;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||moving)return;dragging={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(dragging){if(Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>5)dragging.moved=true;
      if(dragging.moved){yaw=Math.max(-.85,Math.min(.85,yaw-(e.clientX-dragging.x)*.004));pitch=Math.max(.025,Math.min(.23,pitch+(e.clientY-dragging.y)*.002));schedule();}
      dragging.x=e.clientX;dragging.y=e.clientY;
    }else highlight(pick(e.clientX,e.clientY));
  });
  canvas.addEventListener('pointerup',e=>{
    const click=dragging&&!dragging.moved;dragging=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(click){const game=pick(e.clientX,e.clientY),t=current?.trains.find(t=>LINE[t.path][0]===game);if(t)location.href=new URL(t.path,BASE).href;}
  });
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=null;});
  canvas.addEventListener('pointerleave',()=>{if(!dragging)highlight(null);});
  canvas.addEventListener('wheel',e=>{if(moving)return;e.preventDefault();distance=Math.max(53,Math.min(92,distance+e.deltaY*.035));schedule();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(moving)return;
    if(e.key==='ArrowLeft')yaw=Math.min(.85,yaw+.06);else if(e.key==='ArrowRight')yaw=Math.max(-.85,yaw-.06);
    else if(e.key==='ArrowUp')pitch=Math.min(.23,pitch+.02);else if(e.key==='ArrowDown')pitch=Math.max(.025,pitch-.02);else return;
    e.preventDefault();schedule();
  });
  $('reset').onclick=()=>{yaw=.25;pitch=.12;distance=68;highlight(null);schedule();};
  $('floor').onchange=()=>travel($('floor').value);
  $('up').onclick=()=>travel(current.floor+1);$('down').onclick=()=>travel(current.floor-1);
  addEventListener('resize',schedule);new ResizeObserver(schedule).observe(canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;loadingError('3D表示が一時停止しました。復旧を待つか、路線ボタンから出発できます。');});
  canvas.addEventListener('webglcontextrestored',()=>{
    try{lost=false;bufferCache.clear();initGL();display(current);$('loading').hidden=true;}catch(e){loadingError('3D表示を復旧できませんでした。路線ボタンから出発できます。');}
  });
  try {
    const read=async path=>{const r=await fetch(new URL(path,BASE));if(!r.ok)throw Error(path);return r.json();};
    [floors,model]=await Promise.all([read('development/game-room/operator-floors.json').then(d=>d.floors),read('development/game-room/depot-model.json')]);
    for(const f of floors){const option=document.createElement('option');option.value=f.floor;option.textContent=f.floor+'F　'+f.operator;$('floor').append(option);}
    // Keep accessible route links usable even if GPU initialization fails.
    current=floors.find(f=>f.floor===18);
    try{initGL();display(current);$('loading').hidden=true;$('floor').disabled=false;}
    catch(e){
      $('routes').replaceChildren();for(const f of floors)for(const t of f.trains){const a=document.createElement('a');a.className='trainlink';a.href=new URL(t.path,BASE).href;a.textContent=t.name;$('routes').append(a);}
      loadingError('この環境では3D表示を開始できません。路線ボタンから遊べます。');console.error(e);
    }
  }catch(e){loadingError('車両基地を読み込めませんでした。全フロアの路線一覧から出発できます。');console.error(e);}
})();
