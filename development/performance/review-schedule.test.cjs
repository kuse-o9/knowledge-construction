'use strict';
const assert=require('node:assert/strict'),S=require('../../review-schedule.js');
const DAY=86400000;let now=Date.UTC(2026,10,1),r=null;
for(const interval of [1,3,7,14,30,30]){r=S.rate(r,'learned',now);assert.equal(r.due-now,interval*DAY);const repeat=S.rate(r,'learned',now+1000);assert.deepEqual(repeat,r,'Early repetition must not postpone or advance the schedule');now=r.due;}
r=S.rate(r,'again',now);assert.equal(r.stage,0);assert(S.isDue(r,now));r=S.rate(r,'learned',now);assert.equal(r.stage,1);assert.equal(r.due-now,DAY);
for(const x of [null,{}, {stage:99,due:now,lastDay:1},{stage:1,due:NaN,lastDay:1},{stage:1,due:Infinity,lastDay:1}])assert.equal(S.valid(x)||false,false);
assert.equal(S.rate(null,'learned',Date.UTC(2026,10,1,15)).lastDay,S.rate(null,'learned',Date.UTC(2026,10,2,1)).lastDay,'Japanese calendar boundary');
assert.throws(()=>S.rate(null,'fake',now));console.log('PASS review intervals, early-repeat deduplication, lapse reset, malformed records and Japan-day boundary');
