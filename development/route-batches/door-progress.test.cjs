'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../rail-games/priority/batch-001/games/rail.js'),'utf8'),fn=src.slice(src.indexOf('function stepTrain('),src.indexOf('function currentRailReady('));
let steps=0;const state={running:true,doors:false,elapsed:0,speed:10,notch:3,next:0,message:''},ctx={state,platformOpening:.5,route:{stops:[{name:'岡谷'}]},geo:{},C:{step(){steps++;}}};vm.createContext(ctx);vm.runInContext(fn,ctx);
ctx.stepTrain(.1);assert.equal(steps,0);assert.equal(state.speed,0);assert.equal(state.elapsed,.1);assert.match(state.message,/閉鎖/);
state.running=false;ctx.stepTrain(.1);assert.equal(state.elapsed,.1,'Paused time advanced during door animation');
state.running=true;ctx.platformOpening=0;ctx.stepTrain(.1);assert.equal(steps,1);assert.equal(state.message,'戸閉を確認しました。岡谷へ。');
state.message='先行列車を待っています。';ctx.stepTrain(.1);assert.equal(state.message,'先行列車を待っています。');
console.log('PASS: closing doors prevent movement; pause freezes elapsed time; departure clears stale closing text; other messages preserved');
