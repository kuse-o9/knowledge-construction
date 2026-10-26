/* Game-specific adaptation of the supplied announcement style and door references. */
(function(g){'use strict';
 const JA='ja-JP',EN='en-US';
 function doorMotion(value){const t=Math.max(0,Math.min(1,Number(value)||0));return {pop:.085*Math.min(1,t/.18),slide:.99*Math.min(1,Math.max(0,(t-.18)/.82))};}
 function chime(key='azusa'){
  // Original motifs, not transcriptions of operator recordings.
  const kaiji=String(key).includes('kaiji');let notes=kaiji?[67,71,74,79,76,74,71,67]:[72,76,79,83,81,79,76,72];
  if(!kaiji&&!String(key).includes('azusa')){let seed=2166136261;for(const c of String(key))seed=Math.imul(seed^c.charCodeAt(0),16777619);const scale=[0,2,4,7,9,12],base=65+((seed>>>0)%7);notes=Array.from({length:8},(_,i)=>{seed=Math.imul(seed^seed>>>13,1597334677);return base+scale[(seed>>>0)%scale.length];});notes[7]=base;}
  return {id:kaiji?'kaiji-valley-original':String(key).includes('azusa')?'azusa-alpine-original':String(key)+'-original',notes,beat:.38,duration:4.12};
 }
 function segments(data,route,index,kind,startIndex=0){
  const stop=route.stops[index];if(!stop)return [];
  const destination=route.stops.at(-1),serviceName=data.name.includes('かいじ')?'Kaiji':'Azusa',number=(route.label.match(/(?:あずさ|かいじ)\s*(\d+)号/)||[])[1],name=data.name+(number?'、'+number+'号':''),enName=serviceName+(number?' '+number:'')+' Limited Express',terminal=index===route.stops.length-1;
  const current=route.stops[Math.max(0,index-1)],remaining=route.stops.slice(index),after=route.stops[index+1];
  const pair=(ja,en)=>[{text:ja,lang:JA},{text:en,lang:EN}],identity=()=>pair('この列車は、'+name+'、'+destination.name+'ゆきです。','Welcome aboard the '+enName+' bound for '+destination.english+'.');
  if(kind==='greeting')return identity();
  if(kind==='next'){
   const full=index===startIndex+1||current.name==='甲府',out=identity();
   if(full){
    const stops=remaining.slice(0,-1);if(stops.length)out.push(...pair('途中、'+stops.map(s=>s.name).join('、')+'に停車いたします。','We will stop at '+stops.map(s=>s.english).join(', ')+', before reaching '+destination.english+'.'));
    out.push(...pair('座席上の赤いランプは空席の目安です。黄色に変わりましたら、この先の区間をご予約のお客様に席をお譲りください。','A red seat lamp indicates a seat without a current reservation. If the lamp turns yellow, please make the seat available for the passenger whose reservation is about to begin.'));
    out.push(...pair('グリーン車は9号車です。トイレは4号車、6号車、8号車、9号車、11号車にあります。','Car 9 is the Green Car. Restrooms are in cars 4, 6, 8, 9 and 11.'));
    out.push(...pair('車内はデッキやトイレを含め、すべて禁煙です。携帯電話での通話は、周囲のお客様にご配慮のうえデッキをご利用ください。','Smoking is not permitted anywhere on this train. Please use the vestibule near the doors for phone calls and be considerate of other passengers.'));
   }
   out.push(...pair('次は、'+(terminal?'終点、':'')+stop.name+'に停車いたします。','The next stop will be '+stop.english+(terminal?', our terminal station.':'.')));return out;
  }
  const out=pair((terminal?'まもなく終点、':'まもなく、')+stop.name+'に到着いたします。','We will soon arrive at '+stop.english+(terminal?', our terminal station.':'.'));
  if(kind==='arrived')return pair(stop.name+'です。'+(terminal?'終点です。お忘れ物にご注意ください。':'ご乗車ありがとうございます。'), 'This is '+stop.english+'.'+(terminal?' This is our terminal. Please take all your belongings with you.':' Thank you for travelling with us.'));
  const transfer=g.BaylineReviewedAnnouncements?.transfers?.[stop.name];if(transfer)out.push(...pair(transfer.ja,transfer.en));
  if(stop.platformSideVerified&&stop.reportedPlatform!=null)out.push(...pair('お出口は'+(stop.side>0?'左':'右')+'側です。','The doors on the '+(stop.side>0?'left':'right')+' will open.'));
  out.push(...pair('お降りの際は、お忘れ物のないようお支度ください。','Please prepare to leave the train and take all your belongings with you.'));
  if(after)out.push(...pair(stop.name+'の次は、'+(index+1===route.stops.length-1?'終点、':'')+after.name+'に停車いたします。','The stop after '+stop.english+' will be '+after.english+'.'));
  else out.push(...pair('本日もご利用くださいまして、ありがとうございました。','Thank you for travelling with us. We hope to welcome you aboard again.'));return out;
 }
 function estimate(parts){return (parts||[]).reduce((n,s)=>n+(s.lang===JA?s.text.length/4.8:s.text.split(/\s+/).length/2.1),0)+4.12;}
 g.BaylineExpressService={doorMotion,chime,segments,estimate};
})(typeof globalThis==='object'?globalThis:window);
