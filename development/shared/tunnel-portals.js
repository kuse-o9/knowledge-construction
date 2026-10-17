/* Portal opening for game terrain meshes, in local metres.
 * Returns geometry instructions to cut a real opening before placing lining.
 * The rendering engine must perform the actual terrain subtraction.
 */
(function(g){'use strict';
function portal({trackCenter,heading,width=13,height=8,depth=20,groundY,railY}){
 if(!Array.isArray(trackCenter)||trackCenter.length!==2||![...trackCenter,heading,width,height,depth,groundY,railY].every(Number.isFinite))throw Error('坑口の位置/寸法が不正');
 if(width<=0||height<=0||depth<=0)throw Error('坑口の寸法は正数');
 const lateral=[-Math.sin(heading),Math.cos(heading)],forward=[Math.cos(heading),Math.sin(heading)];
 const corners=[];
 for(const side of [-1,1])for(const d of [0,depth])corners.push([trackCenter[0]+lateral[0]*side*width/2+forward[0]*d,trackCenter[1]+lateral[1]*side*width/2+forward[1]*d]);
 return {cutout:{polygon:corners,minimumY:railY-.8,maximumY:Math.max(groundY+1,railY+height+1)},
  lining:{width,height,depth,center:trackCenter,heading},needsTerrainBoolean:true,
  checks:['地面メッシュに穴が空いている','坑口の壁と覆工が地面に接続','線路が途切れない','カメラが地形を貫通しない','明暗変化が自然']};
}
const api=Object.freeze({portal});if(typeof module==='object'&&module.exports)module.exports=api;g.BaylinePortal=api;
})(typeof globalThis==='object'?globalThis:this);
