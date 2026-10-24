/* Original game wording, with transfer facts checked against operator timetables. */
(function(g){'use strict';
 const transfers={
  '新宿':{ja:'山手線、埼京線、湘南新宿ライン、中央・総武線各駅停車、中央線快速、京王線、京王新線、小田急線、東京メトロ丸ノ内線、都営新宿線、都営大江戸線は、お乗り換えです。',en:'Change here for the Yamanote, Saikyo, Shonan-Shinjuku, Chuo-Sobu local and Chuo rapid services, the Keio and Keio New lines, the Odakyu Line, the Tokyo Metro Marunouchi Line and the Toei Shinjuku and Oedo lines.',source:'https://timetables.jreast.co.jp/timetable/list0866.html',additionalSources:['https://www.keio.co.jp/train/station/ko01_shinjuku/','https://www.odakyu.jp/station/shinjuku/']},
  '立川':{ja:'青梅線、五日市線方面、南武線は、お乗り換えです。多摩モノレールへは、立川北駅または立川南駅をご利用ください。',en:'Change here for the Ome and Nambu lines and services towards the Itsukaichi Line. For the Tama Monorail, use Tachikawa-Kita or Tachikawa-Minami stations.',source:'https://timetables.jreast.co.jp/timetable/list0958.html',additionalSources:['https://www.tama-monorail.co.jp/monorail/station/tachikawa-kita/','https://www.tama-monorail.co.jp/monorail/station/tachikawa-minami/']},
  '八王子':{ja:'横浜線、八高線は、お乗り換えです。',en:'Change here for the Yokohama and Hachiko lines.',source:'https://timetables.jreast.co.jp/timetable/list1227.html'},
  '大月':{ja:'富士急行線、河口湖方面は、お乗り換えです。',en:'Change here for the Fujikyu Line towards Kawaguchiko.',source:'https://timetables.jreast.co.jp/timetable/list0331.html'},
  '甲府':{ja:'身延線は、お乗り換えです。',en:'Change here for the Minobu Line.',source:'https://timetables.jreast.co.jp/timetable/list0671.html'},
  '小淵沢':{ja:'小海線は、お乗り換えです。',en:'Change here for the Koumi Line.',source:'https://timetables.jreast.co.jp/timetable/list0707.html'},
  '岡谷':{ja:'中央本線、辰野方面は、お乗り換えです。',en:'Change here for the Chuo Line via Tatsuno.',source:'https://timetables.jreast.co.jp/timetable/list0358.html'},
  '松本':{ja:'大糸線、篠ノ井線、アルピコ交通上高地線は、お乗り換えです。',en:'Change here for the Oito and Shinonoi lines and the Alpico Kotsu Kamikochi Line.',source:'https://timetables.jreast.co.jp/timetable/list1444.html',additionalSources:['https://www.alpico.co.jp/traffic/rail/','https://www.alpico.co.jp/traffic/faq/5/']},
  '塩尻':{ja:'中央本線、木曽福島・中津川・名古屋方面と、辰野方面は、お乗り換えです。',en:'Change here for Chuo Line services towards Kiso-Fukushima, Nakatsugawa, Nagoya and Tatsuno.',source:'https://timetables.jreast.co.jp/timetable/list0774.html'}
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
