/* BAYLINE shared signal model. Game simulation, not real railway safety logic.
 * Distances are metres, increasing in the current route direction.
 * Routes with different coordinate systems must be mapped to a common track first.
 */
(function(root){
'use strict';
function assertFinite(n,label){if(!Number.isFinite(n))throw new TypeError(label+' must be finite');}
function buildBlocks(length, boundaries){
  assertFinite(length,'length');if(length<=0)throw new RangeError('length must be positive');
  const cuts=[0,...(boundaries||[]),length];
  if(cuts.some(x=>!Number.isFinite(x))||cuts.some((x,i)=>i>0&&x<=cuts[i-1]))throw new RangeError('boundaries must increase inside route');
  return cuts.slice(0,-1).map((start,i)=>({id:i,start,end:cuts[i+1]}));
}
function blockAt(blocks,distance){
  assertFinite(distance,'distance');
  if(distance<0||distance>blocks.at(-1).end)return -1;
  if(distance===blocks.at(-1).end)return blocks.length-1;
  let lo=0,hi=blocks.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(blocks[mid].start<=distance)lo=mid+1;else hi=mid;}
  const index=lo-1;return index>=0&&distance<blocks[index].end?index:-1;
}
/* A block is occupied if any part of a train overlaps it, not just its midpoint.
 * Each train: {id, front, length}, with front at the leading end in increasing coordinates.
 * Trains on opposing tracks need separate track IDs and separate block tables.
 */
function occupiedBlocks(blocks,trains,excludeId){
  const occupied=new Set();
  for(const t of trains||[]){
    if(t.id===excludeId)continue;
    assertFinite(t.front,'train.front');assertFinite(t.length,'train.length');
    if(t.length<=0)throw new RangeError('train.length must be positive');
    const rear=t.front-t.length;
    // Ordered blocks: find the first possible overlap, then visit only covered blocks.
    let lo=0,hi=blocks.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(blocks[mid].end<=rear)lo=mid+1;else hi=mid;}
    for(let i=lo;i<blocks.length&&blocks[i].start<t.front;i++)if(rear<blocks[i].end)occupied.add(i);
  }
  return occupied;
}
/* Return a three-aspect game signal: RED stop, YELLOW caution, GREEN proceed.
 * A signal controls the block immediately ahead and reads one block beyond it.
 * For a closed route or an unresolved switch, caller must pass routeAvailable=false.
 */
function aspectAt(blocks,signalBlockIndex,trains,options={}){
  if(!Number.isInteger(signalBlockIndex)||signalBlockIndex<0||signalBlockIndex>=blocks.length)throw new RangeError('invalid signal block index');
  if(options.routeAvailable===false)return 'RED';
  const occupied=occupiedBlocks(blocks,trains,options.excludeId);
  if(occupied.has(signalBlockIndex))return 'RED';
  if(signalBlockIndex+1<blocks.length&&occupied.has(signalBlockIndex+1))return 'YELLOW';
  return 'GREEN';
}
function stopDistance(blocks,signalBlockIndex,aspect){
  if(aspect!=='RED')return Infinity;
  return blocks[signalBlockIndex].start;
}
/* Direction-aware route selection. Only trains on the same physical track may occupy a block.
 * A route request conflicts with another reserved movement when any resource ID overlaps.
 */
function routeClear(request,reservations=[]){
  if(!request||!Array.isArray(request.resources)||!request.resources.length)return false;
  if(request.switchAligned===false||request.enabled===false)return false;
  const own=new Set(request.resources);
  return !reservations.some(other=>other.id!==request.id&&(other.active!==false)&&
    Array.isArray(other.resources)&&other.resources.some(id=>own.has(id)));
}
function signalForRoute(blocks,index,trains,request,reservations=[]){
  return aspectAt(blocks,index,(trains||[]).filter(t=>t.trackId===request.trackId),
    {routeAvailable:routeClear(request,reservations)});
}
const api=Object.freeze({buildBlocks,blockAt,occupiedBlocks,aspectAt,stopDistance,routeClear,signalForRoute});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BaylineSignals=api;
})(typeof globalThis==='object'?globalThis:this);
