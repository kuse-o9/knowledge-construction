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
  let gl, program, floors, model, current, geometry, dragging, moving = false, lost = false, gpuReady = false;
  let yaw = 0, pitch = 0, distance = 4.5, frame = 0, hovered = null;
  const player={x:-17.3,y:0,z:24.8,angle:Math.PI,walk:0}, keys=new Set();
  let lastTick=0, avatarBuffer, avatarCount=0,liftBuffer,liftScene=null,avatarKey=null,liftKey=null,liftMesh=null,locations;
  const FOV=48*Math.PI/180;
  const tracks=()=>current?.floor===23?[0]:[-20,-12,-4,4,12,20];
  function surface(x,z) {
    for(const track of tracks()) if(Math.abs(x-(track+2.7))<=.8) {
      if(z>=-33.5&&z<=21.5)return .94;
      if(z>21.5&&z<24.5)return .94*(24.5-z)/3;
    }
    return 0;
  }
  function canStand(x,z) {
    if(x < -26.35 || x > 26.35 || z < -36.8 || z > 31.5)return false;
    if(x>-25.5&&x<-20.5&&z>25.5&&!(x>-25.3&&x<-20.7&&z<30.3))return false;
    const height=surface(x,z);
    if(Math.abs(height-player.y)>.18)return false;
    return !geometry?.obstacles.some(b=>x>b.minX-.26&&x<b.maxX+.26&&z>b.minZ-.26&&z<b.maxZ+.26);
  }
  function nearbyTrain() {
    if(!current||player.y<.9)return null;
    return current.trains.find(t=>{
      const x=current.floor===23?0:LINE[t.path][1],b=geometry.obstacles.find(b=>b.game===LINE[t.path][0]);
      return Math.abs(player.x-(x+2.7))<=.81 && b && player.z>b.minZ-1 && player.z<b.maxZ+1;
    });
  }
  function board(game) {
    const t=nearbyTrain();
    if(gpuReady&&!lost&&t&&(!game||LINE[t.path][0]===game))location.href=new URL(t.path,BASE).href;
    else $('hover-note').textContent='スロープからホームに上がり、電車の横で E ／「この電車に乗る」';
  }
  function updateWalkUI() {
    const t=nearbyTrain(),button=$('board');
    button.disabled=!gpuReady||lost||!t||moving;button.textContent=t?t.name+'に乗る（E）':'ホームの電車に近づこう';
    $('hover-note').textContent=t?t.name+'：E または車両クリックで出発':'WASD・矢印で移動 → 手前のスロープからホームへ';
    canvas.dataset.player=JSON.stringify({x:player.x,y:player.y,z:player.z});
    canvas.dataset.nearby=t?.path||'';
  }
  function stopWalking(){keys.clear();lastTick=0;}
  function tick(now) {
    const dt=lastTick?Math.min(.05,(now-lastTick)/1000):0;lastTick=now;
    if(!moving&&!lost&&geometry) {
      let x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      let z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
      const length=Math.hypot(x,z);
      if(length){x/=length;z/=length;const dx=(x*Math.cos(yaw)+z*Math.sin(yaw))*3.2*dt,dz=(-x*Math.sin(yaw)+z*Math.cos(yaw))*3.2*dt;
        // Small bounded steps prevent crossing platform walls and train bodies.
        for(let i=0;i<4;i++){
          if(canStand(player.x+dx/4,player.z)){player.x+=dx/4;player.y=surface(player.x,player.z);}
          if(canStand(player.x,player.z+dz/4)){player.z+=dz/4;player.y=surface(player.x,player.z);}
        }
        player.angle=Math.atan2(dx,dz);player.walk+=dt*9;updateWalkUI();schedule();
      }
    }
    if(keys.size&&!lost)requestAnimationFrame(tick);else lastTick=0;
  }
  let eye, forward, right, up, elevation = 0, lastWidth = 0, lastHeight = 0;
  const bufferCache = new Map();
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => { const n=Math.hypot(...a); return a.map(v=>v/n); };
  const lightDirection=norm([-.3,1,.8]),baseColors=new Map();
  const loadingError = message => { $('loading').hidden=false; $('loading').textContent=message; };
  function shader(type, source) {
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message);}
    return s;
  }
  function attachShader(type,source){const item=shader(type,source);gl.attachShader(program,item);gl.deleteShader(item);}
  let contextFailure='';
  canvas.addEventListener('webglcontextcreationerror',e=>{contextFailure=String(e.statusMessage||'');});
  function initGL() {
    const options={antialias:true,alpha:false,powerPreference:'default',failIfMajorPerformanceCaveat:false};
    gl=canvas.getContext('webgl2',options);
    const modern=!!gl;
    if(!gl)gl=canvas.getContext('webgl',options);
    if(!gl)throw Error('WebGL 2 / WebGL 1を開始できません'+(contextFailure?'（'+contextFailure+'）':''));
    canvas.dataset.contextVersion=modern?'2':'1';
    const vertex=modern?'#version 300 es\n#define attribute in\n#define varying out\n':'';
    const fragment=modern?'#version 300 es\n#define varying in\n#define gl_FragColor depotColor\nprecision mediump float;out vec4 depotColor;\n':'';
    program=gl.createProgram();
    attachShader(gl.VERTEX_SHADER,vertex+`
      attribute vec3 position; attribute vec3 color;
      uniform mat4 view; uniform mat4 projection; uniform float elevation;
      varying vec3 shade; varying float depth;
      void main(){vec4 p=view*vec4(position+vec3(0.,elevation,0.),1.);
      gl_Position=projection*p; shade=color; depth=-p.z;}`);
    attachShader(gl.FRAGMENT_SHADER,fragment+`
      precision mediump float; varying vec3 shade; varying float depth;
      void main(){float fog=smoothstep(75.,180.,depth)*.55;
      gl_FragColor=vec4(mix(shade,vec3(.20,.28,.24),fog),1.);}`);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    locations={};for(const name of ['view','projection','elevation'])locations[name]=gl.getUniformLocation(program,name);for(const name of ['position','color'])locations[name]=gl.getAttribLocation(program,name);
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
    for(const [x,z,w,d]of [[0,-6.25,54,63.5],[-26.25,28.75,1.5,6.5],[3.25,28.75,47.5,6.5]])box(faces,x,-.35,z,w,.7,d,'#626e65');box(faces,-23,-.08,25.75,4.6,.16,.7,'#9caa9c');
    box(faces,0,6.1,-37.5,54,12.2,.6,'#879187');
    box(faces,-27,6,-3,.55,12,70,'#7c887e');
    box(faces,27,6,-3,.55,12,70,'#7c887e');
    for(const [x,z,w,d]of [[0,-6.25,54,63.5],[-26.25,28.75,1.5,6.5],[3.25,28.75,47.5,6.5]])box(faces,x,12.4,z,w,.5,d,'#a4afa2');
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
      // Walkable three-metre ramp joins the lobby to each platform.
      const a=x+1.9,b=x+3.5;
      faces.push({v:[[a,.94,21.5],[b,.94,21.5],[b,0,24.5],[a,0,24.5]],n:[0,1,.313],c:'#c3bda0'});
      for(const edge of [a,b])faces.push({v:[[edge,0,21.5],[edge,.94,21.5],[edge,0,24.5]],n:[edge===a?-1:1,0,0],c:'#939b89'});
    }
    const ids=new Set(floor.trains.map(t=>LINE[t.path]?.[0]));
    for(const f of model.faces) if(f.game && ids.has(f.game)) {
      // Reuse the original train geometry, windows, bogies and roof equipment.
      faces.push({...f,v:f.v.map(v=>[v[0]+(agt?12:0),v[1],v[2]])});
    }
    const obstacles=[];
    for(const game of ids){const vertices=faces.filter(f=>f.game===game).flatMap(f=>f.v);
      if(vertices.length)obstacles.push({game,minX:Math.min(...vertices.map(v=>v[0])),maxX:Math.max(...vertices.map(v=>v[0])),minZ:Math.min(...vertices.map(v=>v[2])),maxZ:Math.max(...vertices.map(v=>v[2]))});}
    obstacles.push({minX:-25.4,maxX:-25.1,minZ:26,maxZ:30.4},{minX:-20.9,maxX:-20.6,minZ:26,maxZ:30.4},{minX:-25.4,maxX:-20.6,minZ:30.2,maxZ:30.5});
    return {...upload(faces),obstacles};
  }
  function upload(faces,existing) {
    const data=[];
    for(const f of faces) {
      const light=.65+.35*Math.max(0,dot(f.n,lightDirection));
      let base=baseColors.get(f.c);if(!base){base=[1,3,5].map(i=>parseInt(f.c.slice(i,i+2),16)/255);baseColors.set(f.c,base);}const rgb=base.map(v=>v*light);
      for(let i=1;i<f.v.length-1;i++) for(const v of [f.v[0],f.v[i],f.v[i+1]]) data.push(...v,...rgb);
    }
    const buffer=existing||gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    return {faces,buffer,count:data.length/6};
  }
  function basis() {
    const target=[player.x,player.y+1.02+elevation,player.z];
    const desired=[player.x+Math.sin(yaw)*distance,player.y+2.05+pitch+elevation,player.z+Math.cos(yaw)*distance];
    // Shorten the boom before a wall, platform or train can obscure the avatar.
    let fraction=1;
    for(let t=.04;t<=1;t+=.04){const x=target[0]+(desired[0]-target[0])*t,z=target[2]+(desired[2]-target[2])*t,y=target[1]+(desired[1]-target[1])*t-elevation;
      if(Math.abs(x)>26.5||z< -37||z>31.65||y<surface(x,z)+.15||geometry.obstacles.some(b=>x>b.minX-.15&&x<b.maxX+.15&&z>b.minZ-.15&&z<b.maxZ+.15)) {fraction=Math.max(.04,t-.04);break;}}
    eye=target.map((v,i)=>v+(desired[i]-v)*fraction);
    forward=norm(sub(target,eye)); right=norm(cross(forward,[0,1,0])); up=cross(right,forward);
    return new Float32Array([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-dot(right,eye),-dot(up,eye),dot(forward,eye),1]);
  }
  function draw() {
    frame=0; if(!geometry||lost) return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(w!==lastWidth||h!==lastHeight) {canvas.width=w;canvas.height=h;lastWidth=w;lastHeight=h;}
    gl.viewport(0,0,w,h); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const f=1/Math.tan(FOV/2),near=.2,far=250,aspect=w/h;
    const p=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
    gl.uniformMatrix4fv(locations.view,false,basis());
    gl.uniformMatrix4fv(locations.projection,false,p);
    gl.uniform1f(locations.elevation,liftScene?liftScene.fromElevation:elevation);
    renderMesh(geometry.buffer,geometry.count);
    if(liftScene){gl.uniform1f(locations.elevation,liftScene.toElevation);renderMesh(liftScene.targetGeometry.buffer,liftScene.targetGeometry.count);}
    gl.uniform1f(locations.elevation,elevation);
    renderLift();
    const swing=keys.size?Math.sin(player.walk)*.13:0,key=[player.x,player.y,player.z,player.angle,swing].join('|');
    if(!avatarBuffer||key!==avatarKey){const faces=[];
    box(faces,0,.8,0,.49,.63,.3,'#e8a35f');
    box(faces,0,1.3,0,.45,.43,.4,'#f1c99d');
    box(faces,0,1.55,0,.56,.13,.51,'#5c9a70');
    box(faces,0,.83,-.23,.3,.4,.15,'#b65e48');
    for(const side of [-1,1]){
      box(faces,side*.15,.26,side*swing,.19,.5,.23,'#354f60');
      box(faces,side*.34,.82,-side*swing,.15,.56,.18,'#f1c99d');
      box(faces,side*.1,1.32,.206,.045,.06,.025,'#283d33');
    }
    const c=Math.cos(player.angle),s=Math.sin(player.angle);
    for(const face of faces){face.v=face.v.map(([x,y,z])=>[player.x+x*c+z*s,player.y+y,player.z-x*s+z*c]);const [x,y,z]=face.n;face.n=[x*c+z*s,y,-x*s+z*c];}
    const avatar=upload(faces,avatarBuffer);avatarBuffer=avatar.buffer;avatarCount=avatar.count;avatarKey=key;}renderMesh(avatarBuffer,avatarCount);
    canvas.dataset.floor=String(current.floor);canvas.dataset.elevation=String(elevation);
    canvas.dataset.renderer='webgl';canvas.dataset.glError=String(gl.getError());
  }
  function renderLift(){
    const door=liftScene?.door??1,key=liftScene?door+'|'+elevation+'|'+floors.length:'idle';
    if(!liftBuffer||key!==liftKey){const faces=[],x=-23,z=28.2;
    // Actual car floor, walls, door leaves and shaft markers share the avatar's elevation.
    box(faces,x,-.08,z,4.6,.16,4.4,'#9caa9c');box(faces,x,3.3,z,4.6,.15,4.4,'#b8c6b2');
    box(faces,x-2.25,1.6,z,.12,3.2,4.4,'#607b6e');box(faces,x+2.25,1.6,z,.12,3.2,4.4,'#607b6e');
    box(faces,x,.55,z+2.15,4.5,1.1,.12,'#698273');
    for(const side of [-1,1]){box(faces,x+side*(.55+door*1.1),1.6,z-2.15,1.1,3.2,.10,'#b3c1b3');box(faces,x+side*2.1,1.65,z-2.15,.18,3.3,.18,'#536b5a');}
    if(liftScene)for(let floor=1;floor<=floors.length;floor++){
      const y=(floor-1)*14-elevation;if(Math.abs(y)>35)continue;
      box(faces,x,.03+y,z-2.6,5,.1,.8,'#ddc369');
      for(const side of [-1,1])box(faces,x+side*2.65,y+6.8,z-2.65,.13,14,.13,'#3c5547');
    }
    const mesh=upload(faces,liftBuffer);liftBuffer=mesh.buffer;liftMesh=mesh;liftKey=key;}renderMesh(liftMesh.buffer,liftMesh.count);
    canvas.dataset.liftPhase=liftScene?.phase||'open';canvas.dataset.liftY=String(elevation);
  }
  function renderMesh(buffer,count){
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const [name,offset] of [['position',0],['color',12]]) {
      const a=locations[name];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);
    }
    gl.drawArrays(gl.TRIANGLES,0,count);
  }
  function schedule(){if(gpuReady&&!frame&&!lost) frame=requestAnimationFrame(draw);}
  // Nearest ray/triangle intersection includes walls and platforms, so hidden
  // trains cannot be clicked through solid geometry.
  function pick(clientX,clientY) {
    if(!geometry||moving||lost) return null;
    basis();const rect=canvas.getBoundingClientRect(),tan=Math.tan(FOV/2);
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
    updateWalkUI();
    document.querySelectorAll('.trainlink').forEach(a=>a.classList.toggle('selected',a.dataset.game===game));
  }
  function floorGeometry(floor) {
    let mesh=bufferCache.get(floor.floor);
    if(mesh)bufferCache.delete(floor.floor);else mesh=makeFloor(floor);
    bufferCache.set(floor.floor,mesh);
    const protectedMeshes=new Set([mesh,geometry,liftScene?.targetGeometry]);
    for(const [id,old] of bufferCache) {
      if(bufferCache.size<=3)break;
      if(protectedMeshes.has(old))continue;
      gl.deleteBuffer(old.buffer);bufferCache.delete(id);
    }
    canvas.dataset.geometryCacheSize=String(bufferCache.size);
    return mesh;
  }
  function display(floor) {
    current=floor; elevation=(floor.floor-1)*14;
    if(gpuReady&&!lost)geometry=floorGeometry(floor);
    stopWalking();player.x=floor.floor===23?2.7:-17.3;player.y=0;player.z=24.8;player.angle=Math.PI;
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
    $('floor').disabled=false;highlight(null);schedule();
  }
  async function travel(number) {
    if(moving||!current) return;
    const target=floors.find(f=>f.floor===Number(number));if(!target||target===current)return;
    if(!gpuReady||lost){display(target);return;}
    const oldCamera={yaw,pitch};moving=true;$('reset').disabled=true;stopWalking();highlight(null);$('floor').disabled=true;$('up').disabled=true;$('down').disabled=true;
    const from=current.floor,start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.min(6500,1800+Math.abs(target.floor-from)*180);
    liftScene={fromElevation:elevation,toElevation:(target.floor-1)*14,targetGeometry:floorGeometry(target),door:1,phase:'closing'};
    player.x=-23;player.y=0;player.z=26.8;player.angle=Math.PI;yaw=0;pitch=.6;updateWalkUI();
    $('lift').hidden=false;
    await new Promise(resolve=>{
      function step(now){if(lost){resolve();return;}const t=duration?Math.min(1,(now-start)/duration):1,travel=Math.max(0,Math.min(1,(t-.15)/.7)),ease=travel*travel*(3-2*travel);
        liftScene.door=t<.15?1-t/.15:t>.85?(t-.85)/.15:0;liftScene.phase=t<.15?'closing':t>.85?'opening':'travelling';
        elevation=liftScene.fromElevation+(liftScene.toElevation-liftScene.fromElevation)*ease;
        $('lift-number').textContent=(1+elevation/14).toFixed(1)+'F';schedule();
        if(t<1)requestAnimationFrame(step);else resolve();}
      requestAnimationFrame(step);
    });
    liftScene=null;yaw=oldCamera.yaw;pitch=oldCamera.pitch;
    display(target);$('lift').hidden=true;$('floor').disabled=false;$('reset').disabled=false;moving=false;updateWalkUI();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||moving||!gpuReady||lost)return;canvas.focus();dragging={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(dragging){if(Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>5)dragging.moved=true;
      if(dragging.moved){yaw-=(e.clientX-dragging.x)*.004;pitch=Math.max(-.6,Math.min(3,pitch+(e.clientY-dragging.y)*.01));schedule();}
      dragging.x=e.clientX;dragging.y=e.clientY;
    }else highlight(pick(e.clientX,e.clientY));
  });
  canvas.addEventListener('pointerup',e=>{
    const click=dragging&&!dragging.moved;dragging=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(click){const game=pick(e.clientX,e.clientY),t=current?.trains.find(t=>LINE[t.path][0]===game);if(t)board(game);}
  });
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=null;});
  canvas.addEventListener('pointerleave',()=>{if(!dragging)highlight(null);});
  canvas.addEventListener('wheel',e=>{if(moving||!gpuReady||lost)return;e.preventDefault();distance=Math.max(2.5,Math.min(7,distance+e.deltaY*.005));schedule();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(key==='e'){e.preventDefault();if(!e.repeat&&!moving)board();return;}
    if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)||moving||lost)return;
    e.preventDefault();const idle=!keys.size;keys.add(key);if(idle)requestAnimationFrame(tick);
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',stopWalking);canvas.addEventListener('blur',stopWalking);
  $('board').onclick=()=>board();
  for(const [id,key] of [['walk-up','w'],['walk-left','a'],['walk-down','s'],['walk-right','d']]){
    const button=$(id);button.addEventListener('pointerdown',e=>{e.preventDefault();if(moving||!gpuReady||lost)return;button.setPointerCapture(e.pointerId);const idle=!keys.size;keys.add(key);if(idle)requestAnimationFrame(tick);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(key));
  }
  $('reset').onclick=()=>{stopWalking();yaw=0;pitch=0;distance=4.5;player.x=current.floor===23?2.7:-17.3;player.y=0;player.z=24.8;highlight(null);schedule();canvas.focus();};
  $('floor').onchange=()=>travel($('floor').value);
  $('up').onclick=()=>travel(current.floor+1);$('down').onclick=()=>travel(current.floor-1);
  addEventListener('resize',schedule);new ResizeObserver(schedule).observe(canvas);
  function showGPUFailure(error) {
    gpuReady=false;lost=true;stopWalking();frame=0;
    $('depot-diagnostics').hidden=false;
    $('depot-error-message').textContent='3Dに接続できません。フロア選択と公開中の路線への移動は使えます。3D機能はそのまま残っています。';
    const reason=String(error?.message||error||contextFailure);
    const disabled=/GL_(?:VENDOR|RENDERER)\s*=\s*Disabled/i.test(reason);
    $('depot-error-detail').textContent=reason;
    $('depot-error-guide').textContent=disabled?'ブラウザーがGPUを無効と報告しています。サイトの再読み込みでは有効にできません。Chromeは chrome://settings/system、Edgeは edge://settings/system でグラフィック アクセラレーションを確認し、ブラウザーを再起動してください。すでにオンなら chrome://gpu または edge://gpu の WebGL2 と Problems Detected を確認してください。組織の制限がある場合は管理者に確認してください。':'GPU接続が一時的に失われた可能性があります。「3Dを再読み込み」で再接続できます。ほかの3Dタブを閉じると改善する場合があります。';
    $('loading').hidden=true;$('depot-retry3d').hidden=false;
    for(const id of ['walk-up','walk-down','walk-left','walk-right','board'])$(id).disabled=true;
    if(current)display(current);
  }
  function retry3D() {
    const button=$('depot-retry3d');button.disabled=true;
    try {
      // Reuse the canvas and selected floor. Never reload the whole Study Note.
      // A genuinely lost context is restored by the browser before reinitializing.
      if(gl?.isContextLost?.()) {gl.getExtension('WEBGL_lose_context')?.restoreContext();return;}
      for(const mesh of bufferCache.values())try{gl?.deleteBuffer(mesh.buffer);}catch{}
      if(avatarBuffer)gl?.deleteBuffer(avatarBuffer);if(liftBuffer)gl?.deleteBuffer(liftBuffer);if(program)gl?.deleteProgram(program);
      bufferCache.clear();avatarBuffer=null;liftBuffer=null;avatarKey=null;liftKey=null;liftMesh=null;geometry=null;program=null;contextFailure='';
      initGL();gpuReady=true;lost=false;display(current);
      $('depot-diagnostics').hidden=true;$('loading').hidden=true;button.hidden=true;
      for(const id of ['walk-up','walk-down','walk-left','walk-right'])$(id).disabled=false;
    }catch(error){showGPUFailure(error);console.error('DEPOT_3D_START',error);}
    finally{button.disabled=false;}
  }
  $('depot-retry3d').onclick=retry3D;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showGPUFailure(new Error('GPU接続が一時的に失われました。ブラウザーによる復旧を待つか、3Dを再読み込みしてください。'));});
  canvas.addEventListener('webglcontextrestored',()=>{
    // Old GPU object handles are invalid after restoration.
    bufferCache.clear();avatarBuffer=null;liftBuffer=null;program=null;gl=null;retry3D();
  });
  try {
    const read=async path=>{const r=await fetch(new URL(path,BASE));if(!r.ok)throw Error(path);return r.json();};
    [floors,model]=await Promise.all([read('development/game-room/operator-floors.json').then(d=>d.floors),read('development/game-room/depot-model.json')]);
    for(const f of floors){const option=document.createElement('option');option.value=f.floor;option.textContent=f.floor+'F　'+f.operator;$('floor').append(option);}
    // Keep accessible route links usable even if GPU initialization fails.
    current=floors.find(f=>f.floor===18);
    retry3D();
  }catch(e){loadingError('車両基地を読み込めませんでした。全フロアの路線一覧から出発できます。');console.error(e);}
})();
