export function parseSRT(text){const blocks=text.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/),result=[];const seconds=s=>{const m=s.match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/);if(!m||+m[2]>59||+m[3]>59)throw Error('字幕の時刻が正しくありません。');return +m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000;};for(const block of blocks){const lines=block.split('\n');if(/^\d+$/.test(lines[0]))lines.shift();const match=lines.shift()?.match(/^(\S+)\s+-->\s+(\S+)$/);if(!match)throw Error('SRT字幕の形式を確認してください。');const start=seconds(match[1]),finish=seconds(match[2]),text=lines.join('\n');if(finish<=start||!text||text.length>1000)throw Error('字幕の長さを確認してください。');result.push({start,duration:finish-start,text});if(result.length>5000)throw Error('字幕は5000件以内にしてください。');}return result;}
export function writeSRT(clips){const stamp=t=>{const ms=Math.round(t*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return clips.filter(c=>c.track==='text').sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.text}\n`).join('\n');}
export function clipAppearance(c,time){
 const local=Math.max(0,time-c.start),remaining=c.duration-local,t=Math.max(0,Math.min(1,local/c.duration));
 const tween=(key,fallback)=>{const value=Number(c[key]??fallback);return c.motion===1?value+(Number(c['end'+key[0].toUpperCase()+key.slice(1)]??value)-value)*t:value;};
 const fadeIn=Math.max(0,Number(c.fadeIn)||0),fadeOut=Math.max(0,Number(c.fadeOut)||0);
 return {alpha:Math.max(0,Math.min(1,tween('opacity',100)/100))*Math.max(0,Math.min(1,fadeIn?local/fadeIn:1,fadeOut?remaining/fadeOut:1)),x:tween('x',0),y:tween('y',0),scale:Math.max(.1,Math.min(5,tween('scale',100)/100)),rotation:tween('rotation',0)*Math.PI/180};
}
export function validateEnhancements(c){for(const[k,min,max]of[['opacity',0,100],['scale',10,500],['x',-200,200],['y',-200,200],['rotation',-180,180],['fadeIn',0,60],['fadeOut',0,60],['bass',-12,12],['mid',-12,12],['treble',-12,12],['highpass',0,250],['compress',0,1],['cropLeft',0,95],['cropRight',0,95],['cropTop',0,95],['cropBottom',0,95],['motion',0,1],['endX',-200,200],['endY',-200,200],['endScale',10,500],['endRotation',-180,180],['endOpacity',0,100]])if(c[k]!==undefined&&(!Number.isFinite(c[k])||c[k]<min||c[k]>max))throw Error('映像調整の値を確認してください。');if((c.cropLeft||0)+(c.cropRight||0)>=100||(c.cropTop||0)+(c.cropBottom||0)>=100)throw Error('切り抜き後の映像が残るようにしてください。');}

// Validate everything before the editor disconnects any current media.
export function parseProject(text){
 const d=JSON.parse(text),fail=()=>{throw Error('有効なプロジェクトJSONを選んでください。');};
 const id=x=>typeof x==='string'&&x.length>0&&x.length<=128;
 if(!d||d.version!==1||typeof d.name!=='string'||d.name.length>1000||!Array.isArray(d.assets)||!Array.isArray(d.clips)||d.assets.length>1000||d.clips.length>10000||!['1920,1080','1080,1920','1080,1080','3840,2160','2160,3840'].includes(d.size))fail();
 const assets=new Map(),ids=new Set();
 for(const a of d.assets){
  if(!a||!id(a.id)||assets.has(a.id)||typeof a.name!=='string'||a.name.length>1000||!['video','audio','image'].includes(a.kind)||!Number.isFinite(a.duration)||a.duration<=0||a.duration>86400)fail();
  assets.set(a.id,a);
 }
 for(const c of d.clips){
  if(!c||!id(c.id)||ids.has(c.id)||!['video','overlay','audio','text'].includes(c.track)||!Number.isFinite(c.duration)||c.duration<=0||c.duration>86400||!Number.isFinite(c.start)||c.start<0||c.start>86400)fail();
  ids.add(c.id);validateEnhancements(c);
  if(c.track==='text'){
   if(typeof c.text!=='string'||c.text.length>1000||!Number.isFinite(c.size)||c.size<12||c.size>200||!/^#[0-9a-f]{6}$/i.test(c.color))fail();
  }else{
   const a=assets.get(c.asset);
   if(!a||!Number.isFinite(c.trim)||c.trim<0||!Number.isFinite(c.speed)||c.speed<.25||c.speed>4||!Number.isFinite(c.volume)||c.volume<0||c.volume>2)fail();
   if(c.track==='audio'?a.kind!=='audio':a.kind==='audio')fail();
   if(a.kind!=='image'&&c.trim+c.duration*c.speed>a.duration+.02)fail();
   if(['video','overlay'].includes(c.track)&&['brightness','contrast','saturation'].some(k=>!Number.isFinite(c[k])||c[k]<0||c[k]>200))fail();
  }
 }
 return d;
}
