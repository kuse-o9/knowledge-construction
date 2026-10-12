/* User-provided bilingual announcement script, organized by route and next station.
   Temporary notices are retained separately and disabled by default. */
(function(g){'use strict';
const ja=text=>({lang:'ja-JP',text}),en=text=>({lang:'en-US',text});
const names={U01:['新橋','Shimbashi'],U02:['汐留','Shiodome'],U03:['竹芝','Takeshiba'],U04:['日の出','Hinode'],U05:['芝浦ふ頭','Shibaura-futo'],U06:['お台場海浜公園','Odaiba-kaihinkoen'],U07:['台場','Daiba'],U08:['東京国際クルーズターミナル','Tokyo International Cruise Terminal'],U09:['テレコムセンター','Telecom Center'],U10:['青海','Aomi'],U11:['東京ビッグサイト','Tokyo Big Sight'],U12:['有明','Ariake'],U13:['有明テニスの森','Ariake-tennis-no-mori'],U14:['市場前','Shijo-mae'],U15:['新豊洲','Shin-toyosu'],U16:['豊洲','Toyosu']};
const priority='ゆりかもめでは、ご高齢の方、お身体の不自由な方、妊娠中の方、乳幼児をお連れの方の優先席と、車椅子をご使用の方のスペースを設けております。お客様のご協力をお願いします。優先席付近では、混雑時には携帯電話の電源をお切りください。またそれ以外の場所では、マナーモードに切り替え、通話はご遠慮願います。座席で足を伸ばしたり、組んだりしますと、他のお客様のご迷惑となることがあります。マナー向上にご協力をお願いします。';
const automatic='ゆりかもめは、自動運転中です。緊急の場合、その他お困りの際は、お近くのインターホンでお知らせください。またドアの開閉は自動で行われています。ドアが閉まりかけた場合の駆け込み乗車は、危険ですのでおやめください。';
const assistance='ゆりかもめは自動運転中です。発車の際にはドアが自動で閉まります。ベビーカーのご使用などで、乗り降りに時間が必要なお客様は、ドアの開閉時間を調整いたしますので、お近くのインターホンでお知らせください。';
const assistanceEn='The Yurikamome Line is currently operating automatically. The doors will automatically close before departure. If you are using a baby carriage or require extra time to enter or exit the train, please notify us by the intercom. We will make an adjustment.';
const intercom='ゆりかもめには、車内でインターホンを設置しております。ご乗車の際にあらかじめ位置をお確かめの上、緊急時には呼び出しボタンを押してお知らせいただきますよう、お願いいたします。';
const intercomEn='Thank you for using the Yurikamome Line. All Yurikamome trains have intercoms in each car. We kindly ask all passengers to check their location when you get on. In case of emergency, please notify the staff by pressing the call button.';
const suspicious='車内で不審物を発見された場合は、手を触れず、お近くのインターホンでお知らせください。';
const elevator=[ja('新橋駅ではただいま、エレベータ更新工事を行なっております。ご利用のお客様にはご不便をおかけしておりますが、ご理解、ご協力をお願いいたします。'),en('Elevator renewal work is currently underway at Shimbashi station. We apologize for any inconvenience and thank you for your cooperation.')];
const terminalEn={forward:'The next station is Toyosu, U16, the last stop. Please change here for the Yurakucho Line. Thank you for riding the Yurikamome.',reverse:'The next station is Shimbashi, U01, the last stop. Please change here for the JR Line, the Ginza Line, and the Asakusa Line. Thank you for riding the Yurikamome.'};
const transfers={U02:['大江戸線','Oedo Line'],U12:['りんかい線','Rinkai Line']};
const scripts={forward:{next:{},arrival:{},temporary:{},greeting:[]},reverse:{next:{},arrival:{},temporary:{},greeting:[]}};
for(const dir of ['forward','reverse']){const end=dir==='forward'?'U16':'U01',dest=names[end];scripts[dir].greeting=[ja('本日は、ゆりかもめにご乗車いただき、ありがとうございます。この電車は、'+dest[0]+'ゆきです。'),en('Thank you for riding the Yurikamome. This train is bound for '+dest[1]+'.')];const codes=Object.keys(names).filter(code=>code!==(dir==='forward'?'U01':'U16'));
for(const code of codes){const [name,eng]=names[code],last=code===end,transfer=transfers[code];let japanese=last?'次は終点、'+name+'です。':'次は'+name+'です。';if(transfer)japanese+=transfer[0]+'はお乗り換えです。';let english=last?terminalEn[dir]:'The next station is '+eng+', '+code+'.'+(transfer?' Please change here for the '+transfer[1]+'.':'');if(code==='U11')english+=' The Tokyo International Exhibition Center is on your right.';scripts[dir].next[code]=[ja(japanese),en(english)];let arrive='まもなく'+name+'、'+name+'です。';if(code==='U12')arrive+='りんかい線はお乗り換えです。';if(last)arrive='本日はゆりかもめにご乗車いただき、ありがとうございました。まもなく終点、'+name+'、'+name+'です。'+(dir==='forward'?'有楽町線はお乗り換えです。':'JR線、銀座線、浅草線はお乗り換えです。');arrive+=(code==='U03'?'左':'右')+'側のドアが開きます。'+(last?'お忘れ物のないように、ご注意ください。':'ご注意ください。');scripts[dir].arrival[code]=[ja(arrive)];}}
function add(dir,code,...segments){scripts[dir].next[code].push(...segments);}
scripts.forward.next.U02=[ja('この先揺れますので、ご注意ください。'),ja('お待たせいたしました。この電車は、豊洲ゆきです。次は汐留です。大江戸線はお乗り換えです。'),en('The next station is Shiodome, U02. Please change here for the Oedo Line.')];
scripts.reverse.next.U15=[ja('この先揺れますので、ご注意ください。'),ja('お待たせいたしました。この電車は、新橋ゆきです。次は新豊洲です。'),en('The next station is Shin-toyosu, U15.')];
add('forward','U03',ja(priority),ja(automatic));add('reverse','U10',ja(priority));add('reverse','U09',ja(automatic));
add('forward','U04',ja('東京湾クルーズ、レストランシップ、シンフォニー乗り場へは、こちらが便利です。'));
add('forward','U06',ja(suspicious),ja('ドアが閉まりかけた場合の駆け込み乗車は危険です。お客様のご協力をお願いします。'),ja(assistance),en(assistanceEn),ja('次はお台場海浜公園です。東京ジョイポリス、台場一丁目商店街、お台場たこ焼きミュージアム、レゴランドディスカバリーセンター東京、マダムタッソー東京のあるデックス東京ビーチへは、こちらが便利です。なおヒルトン東京お台場、グランドニッコー東京台場、フジテレビ、アクアシティお台場、ダイバーシティ東京プラザへは、一つ先の台場駅をご利用ください。'));
add('reverse','U05',ja(suspicious),ja(assistance),en(assistanceEn));
for(const dir of ['forward','reverse']){add(dir,'U07',ja('フジテレビ、球体展望室「はちたま」、アクアシティお台場、ダイバーシティ東京プラザへは、こちらが便利です。'));add(dir,'U13',ja('有明ジメックスへは、こちらが便利です。'));add(dir,'U14',ja('ホテルJALシティ東京 豊洲、ラビスタ東京ベイへは、こちらが便利です。'));}
add('forward','U10',ja('車内および駅構内は、終日禁煙になっております。お客様のご協力をお願いします。'));add('forward','U11',ja(intercom),en(intercomEn));add('reverse','U02',ja(intercom),en(intercomEn));
add('forward','U16',ja('豊洲からの折り返し乗車はできませんので、ご注意ください。この先揺れますので、ご注意ください。'));add('reverse','U01',ja('新橋からの折り返し乗車はできませんので、ご注意ください。'),ja('この先揺れますので、ご注意ください。'));
scripts.forward.temporary.U06=[ja('ただいまゆりかもめでは、安全総点検を実施しています。'),...elevator];scripts.reverse.temporary.U05=elevator;
g.RAIL_ANNOUNCEMENTS=scripts;
})(window);
