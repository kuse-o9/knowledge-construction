// 公開ゲームで使える許可を確認した録音だけを設定します。
// 現在は本物の録音を設定していません。空欄の部分は合成音／読み上げです。
// 例（許可を得た自分のファイルをaudioフォルダーへ入れた後に設定）:
// melody: {url:'audio/departure-melody.mp3',permission:'権利者から公開ゲームでの使用許可',credit:'出典名'},
// departure: {url:'audio/platform-warning.mp3',permission:'同上',credit:'出典名'},
// 'forward:next:U02': {url:'audio/next-shiodome.mp3',permission:'同上',credit:'出典名'},
// 'forward:arrival:U02': {url:'audio/arrival-shiodome.mp3',permission:'同上',credit:'出典名'}
window.RAIL_RECORDINGS = {};
