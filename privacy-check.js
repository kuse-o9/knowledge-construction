'use strict';
(function(g){
 const patterns=[['メールアドレス',/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],['電話番号',/(?:\+81[\s-]?)?0\d{1,4}[-ー\s]?\d{1,4}[-ー\s]?\d{3,4}/],['郵便番号',/〒?\d{3}[-ー]\d{4}/],['住所らしい表現',/(?:東京都|北海道|大阪府|京都府|.{2,3}県).{1,30}(?:市|区|町|村).{0,30}(?:丁目|番地|号室)/],['秘密情報らしい表現',/(?:sk-[A-Za-z0-9_-]{16,}|(?:パスワード|password|暗証番号)\s*[:：=]\s*\S{4,})/i]];
 function scan(deck){const results=[],fields=[['デッキ名',deck.title],['説明',deck.description]];for(const [i,q]of (deck.questions||[]).entries())for(const [name,key]of [['問題','prompt'],['答え','answer'],['解説','explanation'],['ヒント','hint']])fields.push([(i+1)+'問目の'+name,q[key]]);for(const [field,text]of fields)for(const [kind,pattern]of patterns)if(typeof text==='string'&&pattern.test(text)){results.push({field,kind});if(results.length>=20)return results;}return results;}
 function confirmPublication(deck){const hits=scan(deck);const text=hits.length?'個人情報・秘密情報かもしれない内容があります。\n'+hits.map(h=>'・'+h.field+'：'+h.kind).join('\n')+'\n\n公開してよい例題などの内容ですか？ 氏名・顔写真・学校名も自分で確認してください。':'自動チェックでは目立つ連絡先などは見つかりませんでした。ただし、氏名・学校名・顔写真などの見逃しがあります。自分で全内容を確認しましたか？';return confirm('保存済みの問題・答え・解説・ヒントは誰でも読める状態になります。\n\n'+text+'\n\n問題がある場合は「キャンセル」で戻って修正してください。');}
 const api={scan,confirmPublication};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyPrivacyCheck=api;
})(globalThis);
