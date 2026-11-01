'use strict';
// Self-assessment schedule only. No question text or account data is stored here.
(function(g){
 const DAY=86400000,intervals=[1,3,7,14,30];
 const day=time=>Math.floor((time+9*3600000)/DAY);
 function valid(r){return r&&Number.isInteger(r.stage)&&r.stage>=0&&r.stage<=5&&Number.isFinite(r.due)&&r.due>=0&&r.due<=4102444800000&&Number.isInteger(r.lastDay)&&r.lastDay>=0&&r.lastDay<=50000;}
 function rate(previous,status,now=Date.now()){
  if(status!=='learned'&&status!=='again')throw Error('Invalid self-assessment');
  const old=valid(previous)?previous:null;
  if(status==='again')return {stage:0,due:now,lastDay:day(now)};
  // Repeated reviews before the due time do not postpone the next review.
  if(old&&old.stage>0&&now<old.due)return {stage:old.stage,due:old.due,lastDay:old.lastDay};
  const stage=Math.min(5,(old?.stage||0)+1);
  return {stage,due:now+intervals[stage-1]*DAY,lastDay:day(now)};
 }
 const api={rate,valid,isDue:(r,now=Date.now())=>!valid(r)||r.due<=now};
 if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyReviewSchedule=api;
})(globalThis);
