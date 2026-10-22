/* Original game wording, with transfer facts checked against operator timetables. */
(function(g){'use strict';
 const transfers={
  '甲府':{ja:'身延線は、お乗り換えです。',en:'Change here for the Minobu Line.',source:'https://timetables.jreast.co.jp/timetable/list0671.html'},
  '小淵沢':{ja:'小海線は、お乗り換えです。',en:'Change here for the Koumi Line.',source:'https://timetables.jreast.co.jp/timetable/list0707.html'},
  '岡谷':{ja:'中央本線、辰野方面は、お乗り換えです。',en:'Change here for the Chuo Line via Tatsuno.',source:'https://timetables.jreast.co.jp/timetable/list0358.html'},
  '松本':{ja:'大糸線、篠ノ井線は、お乗り換えです。',en:'Change here for the Oito and Shinonoi lines.',source:'https://timetables.jreast.co.jp/timetable/list1444.html'}
 };
 function apply(data,announcements){for(const [direction,route] of Object.entries(data.routes))for(const stop of route.stops){const transfer=transfers[stop.name];
  for(const kind of ['next','arrival','arrived']){const entries=announcements[direction]?.[kind]?.[stop.code];if(!entries)continue;
   // The official map side is insufficient unless this service's platform is known.
   const exit=stop.platformSideVerified&&stop.reportedPlatform!=null&&kind!=='next';
   for(const e of entries){if(e.reviewedTransfer)continue;const ja=e.lang==='ja-JP';if(exit)e.text+=' '+(ja?'お出口は'+(stop.side>0?'左':'右')+'側です。':'The doors on the '+(stop.side>0?'left':'right')+' will open.');if(transfer)e.text+=' '+(ja?transfer.ja:transfer.en);e.reviewedTransfer=true;}
  }
 }return announcements;}
 g.BaylineReviewedAnnouncements={apply,transfers};
})(window);
