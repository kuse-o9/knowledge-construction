/* Game-only through-running validation. No assumption of current timetable. */
(function(g){'use strict';
function validate(from,to,service,train){
 const problems=[];
 if(!from||!to||!service||!train)return {ok:false,problems:['運転データ不足']};
 if(from.endStation!==to.startStation)problems.push('会社境界の接続駅が不一致');
 if(from.endNode!==to.startNode)problems.push('線路の接続ノードが不一致');
 if(!service.allowedOperators?.includes(from.operator)||!service.allowedOperators?.includes(to.operator))problems.push('列車種別の会社別運行許可が不足');
 if(!service.allowedPaths?.includes(from.id+'>'+to.id))problems.push('直通運転経路が未確認');
 if(train.gaugeMm!==from.gaugeMm||train.gaugeMm!==to.gaugeMm)problems.push('軌間が不一致');
 if(!train.supportedPower?.includes(from.power)||!train.supportedPower?.includes(to.power))problems.push('集電・電源方式が不一致');
 if(!train.supportedControl?.includes(from.control)||!train.supportedControl?.includes(to.control))problems.push('保安装置への対応が不足');
 if(!Number.isInteger(train.cars)||!Number.isInteger(to.maxCars)||train.cars>to.maxCars)problems.push('編成両数の制限を超過');
 return {ok:problems.length===0,problems};
}
const api=Object.freeze({validate});if(typeof module==='object'&&module.exports)module.exports=api;g.BaylineThrough=api;
})(typeof globalThis==='object'?globalThis:this);
