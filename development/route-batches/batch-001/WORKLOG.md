# 100件制作：作業状況

2026-10-21。ユーザーから100件をまとめて、品質を落とさず制作する指示を受領。

## 実施した工程

- あずさ・かいじ・東海道線・東海道新幹線・踊り子を先頭に100のゲーム/運転系統を固定。物理的な線路と列車種別を混同して完成数を増やさない。
- 国土交通省N02・2025年度の全国21,933線路形状、10,234駅形状を取得。597の会社別路線を、座標の簡略化なし・出典付きで圧縮保存。
- 今回の100件を102の共有入力系統に結び付け、3,602の延べ駅候補を100件すべての入力パケットに保存。これは完成したゲームではない。
- あずさの新宿〜松本、かいじの新宿〜竜王の経路を抽出。駅の途中で経路が切れる問題を修正し、始発・終着を含めた。接続のない線路を直線で橋渡ししない。
- 同じPLATEAU地形配信元から、あずさ3,181点、かいじ1,640点の高さを取得。地形の標高はトンネルの線路高度とは別物として保持。
- OpenStreetMapの鉄道トンネル形状987件を取得・照合。あずさ37区間、かいじ29区間を候補化。近傍の別路線かもしれないものは未確定リストに分離。
- E353の車体・先頭部・窓・扉・空調・床下機器を別模型で制作中。E233の色替えではない。模型の寸法・車種別配置は未検証なのでreleaseReady=false。
- 入力パケットのハッシュ、駅順、始終着、接続拒否、模型の面・頂点、地形版の整合をテスト。
- 完成扱いには検査合格、全物理駅、両方向、素材ハッシュ、実際のゲーム入口と検査記録が必要な公開判定を実装。

## 未完了・外部資料の問題

- 100ゲームの完成数・公開数は0。入力データの作成をゲーム完成として数えない。
- 橋梁情報の取得は、2つの公開Overpass配信元でタイムアウト。地形の隆起で代用しない。小区間への分割取得または別の一次資料で確認する。
- メーカーの旧E353技報URLは404。現行のメーカー資料・公式図面で寸法、台車中心、扉位置、各車の機器配置を確認する。
- 先頭2件も車両模型・線路/ホーム・トンネルのレール高さ・信号/周辺列車・日英放送・手動/自動・保存・描画検査は制作中。
- あずさ・かいじの距離は地図形状からの参考値で、営業キロや個々の列車の現行停車駅を確認した値ではない。
- 既存の公開済みゲームのコードとリンクには変更を加えない。完成前の100件を選択可能なゲームとして追加しない。

## 再開

`manifest.json` と `job-inputs/index.json` が100件の台帳。参照元は `sources/provenance.json`。経路・高さ・構造物は `reference-paths/`、E353制作物は `vehicles/`。公開判定は `../release-gate.py`。残作業は承認待ちではなく、引き続き実装する作業。

## 地形取得・運転コアの追加進捗

102の共有系統すべての地形高度を取得し、欠損0・入力版のハッシュ照合を確認。各ジョブへ結び付けたが、地形高度はレール高度ではないため、トンネル/橋梁/ホームの検査を合格にはしない。

開発用コアに車両別最高速度を導入。130・285・320km/hの試験条件で実加速と保存復帰を確認。あずさ64駅候補・かいじ42駅候補を両方向に数値走行した。これは100km/hの診断用全駅停車で、実列車の停車パターン・実時間走行・3D検査とは別。

GitHubの開発ブランチ：railways/batch-001-100-routes、下書きPR #2。完成/公開ゲームは引き続き0件。

## 接続データ・実列車の停車パターン・編成描画

100件が共有する102系統の線路ネットワークを作成。元の全線分を保存し、駅候補2,974件を線上に対応づけた（100m以内の候補欠落0）。地形高度を各点に結び付けたが、これは測量済みの走行線・ホーム・レール高度を意味しない。元データで分離している信越線・根室線等の区間に架空の接続線を足していない。元データで節点化された交差部の立体交差・分岐判定は別途確認する。

JR東日本の2026年10月の平日時刻表から、あずさ13号/54号、かいじ47号/2号を選択。停車時刻・停車駅・掲載番線を転記し、通過駅候補も残す。かいじ2本は東京発着の列車から新宿〜竜王を切り出した範囲であり、東京区間まで実装した扱いにはしない。実際の編成両数・未掲載の番線・走行速度は未確定。

新宿の手前、松本/竜王の先の元線路を使い、両端350mの余裕を付けた経路を作成。駅候補の位置は元線分上に挿入する。実列車の停車パターン4本で数値走行し、すべて停車・通過と早発を確認した。100km/hは検査用の速度で、実運行速度の調査を済ませた扱いにはしない。

車両ごとの長さ・台車・扉位置・前後方向を受け取る共通編成描画部品を追加。暫定9両E353をあずさ/かいじの両方向、駅候補と中間点の計420か所へ配置し、姿勢の有限性・編成末尾の重なり防止を検査。ソフトウェアWebGL2で4ケースを描画、29/29部品が読込完了・GLエラー0。最初の画像でCesium CSS不足による縮小を発見して修正し、1200×700の描画面を検査に追加した。物理GPU・実時間走行・完成したゲームの検査ではない。

入力/元線分保存/停車・通過/車両模型/検査版照合等の自動検査12項目が合格。全公開ゲートは引き続き未合格、完成・公開ゲームは0/100。既存の公開ゲームは変更していない。

## 2026-10-21：準備できた路線から順次公開する指示

ユーザーから「仕上げることができて、公開準備がおわったら、どんどん公開していって。」と承認済み。100件一括完成を待たず、完成と検査が揃った路線から公開する。毎回の承認確認は不要。品質条件は維持する。

順次公開用の `prepare-publication.py` を実装。必須12条件、検査報告側の合格条件、両方向別の全駅、HTML/素材のハッシュを照合する。合格分のみ公開計画に入り、既存公開分を保持する。新素材は rail-games/ に隔離し、元の公開ゲームのファイルを変更しない。素材改変、検査条件の削除、片方向の駅欠落、不正なパス、壊れた既存公開素材は拒否する。

検査20項目（入力12＋公開処理8）が合格。現データで公開準備処理を実行した結果は、eligibleJobs=[]、catalogChanged=false。公開条件を満たす新路線は引き続き0件のため、新しい公開入口や未完成ゲームは作成していない。公開計画の作成はデプロイとは別で、Pages配信と公開URLのハッシュ確認まで終えて公開済みとする。

E353のメーカー新サイトの記事と公開APIを確認したが、旧技報のPDFは404/タイムアウトで、現行記事は写真のみだった。寸法表・各車機器配置を確認した扱いにせず、該当条件は未合格のまま。周辺/構造物/ホーム/案内と統合ゲームの制作が残る。会話終了後に自動で開発が続く処理は作成していない。

## 2026-10-21：既存ゲームを土台にした実際の運転画面

ユーザーの「前に作ってある鉄道ゲームを参考にしてどんどん作って」に従い、公開済み中央・総武線各駅停車の画面と実行処理を流用して、あずさ・かいじの操作できる開発版を制作。両方向・途中駅の選択・手動/自動・時刻表・戸閉・早発・地図/運転台/車外・音量/警笛・保存・設定・狭幅用UIを残した。物理駅と停車駅を分離し、通過駅は一覧とホーム模型に残す。公開済みゲームは変更しない。

路線パケット・共通人物/街モデル・E353を分離し、パケットのハッシュを照合する。既存の12種の人物模型・街モデルをそのまま保持し、ホームの人数も元と同じ128人とした。線路・枕木・架線柱・ホーム・屋根・ベンチ等は描画窓ごとに生成し、32模型を上限に保持する。駅の配線/寸法・各地の街・橋・トンネル・車両寸法は完成しておらず、仮の構造を正確な再現とは扱わない。速度は検査用100km/hで、実速度調査の完了とはしない。

実際の画面で4ケース（2路線×両方向）を操作し、出発駅選択、手動の加速/ブレーキ/戸閉、定刻前の発車、保存からの再開、音声を使った自動発車を確認。生成したパケット自体で全停車・全通過駅の高速数値走行4本も合格。3Dは地形読込後に2ケースをソフトウェアWebGL2で描画、GLエラー0。物理GPU、耳で聞く音質、スマホ実機、全線実時間検査ではない。

画像確認で、元車両名の表示残り、未読込地形のまま画像を撮る検査、開発中表示と初回パケットハッシュがbody属性の違いで挿入されていない問題を修正。再読み込み時の3D資源を明示的に解放し、地形読込失敗時は運転台/車外ボタンで再試行できるようにした。日本語の画像検査用フォントも検査環境に設定した。

開発版として操作可能なのは2件。完成/公開は引き続き0件。手動/自動/早発と保存の2条件は開発版の検査結果に結び付けたが、最終公開素材で再検査する。トンネル・橋・ホーム配置・車両・周辺列車・案内と全区間の再現確認が公開前に残る。Overpassの現行Private.coffee配信先でも橋梁の小区間取得はタイムアウトし、取得できた扱いにはしていない。

入力12・公開処理8・統合ゲーム6の計26検査が合格。公開計画の再生成でも公開対象は0件で、完成条件を満たさない開発版は公開リストへ追加していない。

## 2026-10-21：橋・トンネルの地図属性取得と照合

国土地理院の地理院地図Vector提供実験（README記載のデータ時点2026-07-01）と属性仕様を確認し、橋/高架・トンネル・地下・雪覆いの分類を取得。独立した小さなMVTリーダーで、152枚すべての取得と復号に成功（失敗0）、2,577線形を出典タイル/属性/ハッシュ付きで保存した。生タイルのURL/バイト数/ハッシュを保持し、抽出データには出典・加工の記載とPDL1.0の参照を付けた。

線路の距離は運転エンジンと同じ緯度補正を使い、固定縮尺の累積距離によるずれを避けた。あずさは橋/高架145・トンネル39・地下2・雪覆い3範囲、かいじは76・32・2・3範囲が候補として一致。共用区間と並行線を含むため件数を足して実物の個数とはしない。37件/28件の曖昧な近傍地物も別記録した。高さ・本線との対応・タイル境界と実際の坑口は未確認で、公開条件は合格にしていない。

既存ゲームから引き継いだ中央線快速へのリンクを正しい相対パスに直し、別ゲームへの移動と分かる文言に変更。車両の資料リンクもE353の公式ページに変更した。変更後に実際のブラウザーで操作4ケース・地形読込後のソフトウェア3D描画2ケースを再検査し、6ケース合格・JS例外0・GLエラー0を確認した。

最終検査は入力12＋公開処理8＋ゲーム統合6＋地図復号/照合6の計32項目が合格。公開計画は今回も対象0件で、公開版への変更はない。開発版2件を完成100件と数えない。


## 2026-10-22 追加確認・案内放送

JR東日本の現行E353紹介（車両最高130km/h）と2017年営業開始資料の量産差分（全車の動揺防止制御・車体間ダンパなし・指定号車の荷物置場）を再確認。車両最高速度を区間別運転速度の証拠に置き換えない。選定列車の公式停車駅ページは6駅の番線を表示しておらず、構内図だけで列車の番線を確定しない。

甲府・小淵沢・岡谷・松本の公式駅時刻表に基づく乗換案内を、両方向の日英の次駅・到着前・到着後の案内へ追加。選定列車の番線と構内図側の左右の双方を確認できる場合だけ出口を案内する。再適用で文が重複しない処理、39の方向別停車駅ケースが成功。元録音は転用せず独自文面と既存読み上げを利用。模型・地形パケットは変更していない。

橋・トンネルの測量高、48通過駅の個別配線、6駅の列車別番線、区間速度、沿線西側の周辺列車などは未完了。新資料だけで公開可能とは判定しない。詳細は sources/followup-review-20261022.json。


## 2026-10-22 公開依頼後のトンネル・放送修正

公開前の全線データ検査で、40mの地図照合閾値により中央本線のトンネル途中が脱落し、深い開削区間のように表示される問題を発見。国土地理院の上下線の線形とMLIT中心線を平面図で個別照合し、9断片ずつを採用した。一般閾値は引き上げず、出典ハッシュ・元タイル・地物番号と未測量の区別をsources/tunnel-fragment-review.jsonに残す。ゲーム位置約48.2km、61.4km、65.6kmの脱落がなくなり、地図上のトンネル外で地表より5m以上低くなる元サンプルは15点から0点へ改善。これは測量済みの坑口/レール高度を意味しない。

公開済み6ゲームと同じ画質のWebGL2起動回復処理を開発2ゲームにも追加し、初期化/描画失敗時の一時停止・保存・再読込を用意。乗客・解像度・模型を削らない。未確認番線を1番線と断定する放送を修正し、番線が分からない場合は番号なしで戸閉を案内。実際の音声処理をmockした2ケースで確認。JR公式の駅別時刻表により新宿・立川・八王子・大月・塩尻の乗換案内を追加し、合計9駅・39方向別停車駅の文面と再適用を検査した。

JR公式の長大トンネル一覧（2013）、新桂川橋梁の施工者報告（1969：全長513m、主径間70+130+70m、最大橋脚高41m）、会社要覧の新宿〜松本最高130km/h（2019年時点）も調査。これらを全区間の現行制限速度、全構造物の測量高、列車別の番線の代用にはしない。茅野の駅別/路線別公式時刻表にも選定列車の番線は掲載されず、未確認表示を保持。

新プロファイルの勾配・共用区間・深い開削の回帰3項目、両方向4本の高速数値運転、39方向別停車駅の案内、2戸閉放送文面が成功。ソフトウェア3D検査は実行環境のフォント不備（Skia SIGTRAP）を修正し、描画負荷を制御して再検査中。最終の描画結果と既存全検査は未確定。48通過駅の個別配線/ホーム、全構造物の高さ/上下線位置、6駅の実番線、区間速度、E353細部、西側の他路線列車が残るため、完成/公開ゲートは未合格。公開リストには追加しない。


## 2026-10-23 通過駅の構内図とホーム側の追加確認

JR東日本の中央本線・中央線快速・中央総武各停の駅情報一覧で実際に掲載されたリンクから、公式構内図を取得して目視確認。構内図は参照用に留め、画像をゲームやリポジトリへ転載しない。公式図面のURL・画像ハッシュ・図面年月・ホーム形状の読み取りを sources/priority-platform-review.json に記録した。従来の停車駅16に加え、通過駅26の快速/本線ホーム側を記録し、ゲーム用のホーム選択と左右を反映。大久保・東中野の2図面は各停側のホームなので別枠とし、特急ホームや快速線の厳密位置を推定した扱いにはしない。合計44駅の図面を確認、未確認図面は20駅。これは全駅の配線・ホーム寸法・模型の再現完了ではない。

元ゲームの音声そのものを保持する既存検査は、未知の番線を省く承認済みの文面修正だけを許す形へ更新。戸閉2ケースと乗換39ケースを再確認。ソフトウェア描画の重い検査と模型生成の検査を分離し、BAYLINE_MODELS_ONLY=1 は駅模型・勾配・キャッシュだけを station-model-diagnostics.json に記録する。描画検査の結果を置き換えたり、描画完了と数えたりしない。

全区間のトンネル・橋描画は未完了。以前のパケットで2箇所のトンネル描画を確認できたが、残りは実行時間内に完了しておらず、新パケットの完全検査証拠には使わない。既存の公開ゲートは閉じたままにする。新しい最終検査結果は対応する診断JSONとgeometry-review-status.jsonを参照。


## 2026-10-23 — rendering and complete station-map inventory

Vehicle depot startup compatibility was separately published on main 012bd96c0c9b4cc38641dbe0967b9c14cb887725. Real software shader/render checks passed forced WebGL2 and WebGL1; the no-context case keeps route links and retry. Public exact readback matched all four files. This is not evidence from the user's physical GPU.

Tunnel clipping now removes only redundant mask vertices within a measured 1 mm bound (RDP on ECEF boundaries). Train/track/roof/wall meshes, resolution and all passengers are retained. Earlier current-turn full 16-case tunnel/bridge rendering completed successfully; final packet binding is being rerun after station fixes.

All 64 physical stations now have visually inspected operator schematics: 62 main/rapid platform records plus 2 local-line-only maps. Added the remaining 20 operator diagrams. A GSI aerial reference inventory of 22 stations is retained as source URL/hash/observation metadata only; operator schematics override all aerial inferences. In particular Yanagawa is an island, contrary to the initial aerial inference. No aerial-only platform choice remains active. Blank platform number boxes remain unnamed. This does not verify exact lengths, current train assignments or surveyed coordinates.

Corrected Okubo/Higashi-Nakano to estimated adjacent local-line islands with both local rails. Kept 128 passengers per generated station. Render the opposite-direction main platforms too, avoiding duplicate local-only islands. At the four newly checked three-track stations (Kai-Yamato, Hinoharu, Fujimi, Aoyagi), draw the island's other face and third track with estimated turnout transitions. Complete station-specific layouts at every other complex station remain unfinished.

Game cap is 130 km/h, based on JR East's published E353 maximum. No curve restrictions; station-boundary profile retained. Do not treat this cap as actual current restrictions in every section. 2013 rapid-service 95→100 km/h document is explicitly not extrapolated to E353. Operating-speed verification remains false.

Four accelerated packet runs, 18,769 speed samples, 39 announcement direction cases and two departure wording cases passed on final packets. Four actual browser control cases + two software startup scenes passed. Final geometry/train/station checks and suite counts are recorded in their bound diagnostic files after completion. These are development updates; no Azusa/Kaiji public release is claimed.

Final verification completed on packets Azusa 06cf82e52915900ffb369fdb3aa11a420f676d4bd05038a4d002fb7913646691 / Kaiji 991ae00cf06495440b2a6da2ff0ae8cbb32149aefe6275aa4280685b04271450: 39/39 unit tests, 16 bridge/tunnel scenes, 11 corrected-station scenes, 212 meshes, 420 consist locations, four controls + two software startup scenes, eight local-platform clearance cases. All bound report hashes were checked. Only representative screenshots listed in geometry-review-status.json are current evidence; other screenshots may be historical. Remaining reproduction and release work is explicitly listed there; this checkpoint is not a new public game.


## 2026-10-24 — side-track topology, solid rails and camera overlay

Six cached official diagrams were re-inspected and hash-matched: Kunitachi island2/3, Higashi-Koganei1/2, Sagamiko2/3, Shiotsu1/2, Sakaori2/3, Shimo-Suwa2/3. Third-track rendering now covers ten passing stations,16 route-direction models. Inward loops connect to the opposite running track; outward loops connect back to their own running track. Cubic endpoints retain tangent continuity; exact turnouts/widths remain estimates. Added complete three-part rail side/cap faces, ballast and wire.

An independent Cesium mesh comparison retained196 station models/passengers and61 sampled track chunks exactly against the saved2026-10-23 renderer. All16 changed rail-profile cases have side and top faces;128 passengers/model and cache32 retained. Sixteen loop/ownership cases passed. Full final verification:39/39 unit tests,4 numerical runs,4 actual controls+2 software startup scenes,212 models,420 consist positions+4 scenes,16 tunnel/bridge and22 corrected-station scenes,8 local-platform clearance cases. JS/GLerrors0. Ten diagnostic input hash bindings checked. No physical-GPU/full-route-real-time claim.

Visual review found cab wipers appearing in chase/map views. Fixed only inline camera-overlay CSS, retained both wipers in cab view, and checked all3views in both games (6cases). Regeneration left all7 packet/runtime/model inputs identical. Fresh controls/startup rendering and39-unit suite passed after the CSS fix; representative screenshots are the final UI captures listed in geometry-review-status.json.

Geometry-source pilot: Overpass request returnedHTTP406; one bounded OSM main-API map read succeeded at Kai-Yamato. Kept20rail way segments (not20tracks) with ODbL attribution and zero platform ways. Reference only; no operating-speed or survey inference, no data wired to gameplay. No mass API fetch.

Study-only bulletin board and chat were appended as unstarted backlog items in main1281fcf87b460c1368c8eee21b6aabf9bfff411f. Pages40055346786 passed and exact public Markdown readback matched. No study UI/backend changes. Railway reproduction/release blockers remain in geometry-review-status.json; these development updates are not an Azusa/Kaiji release.


## 2026-10-24 — Azusa/Kaiji source corrections and isolated release candidate

Reviewed62 directional station choices separately from actual selected-train platform assignments. Added Chino/Kami-Suwa/Okaya third tracks;13 unique stations,19 direction cases. Exact unchanged mesh comparison retained193 station groups/passengers and61 sampled track chunks. E353 manufacturer paper confirms active collectors5/7/10 plus folded spare5, directional passenger-door coordinates,4.054m AC and4.045m cab height. Added detailed original DT81A/DT82A/TR265-family bogies, damping/air springs/brakes/plows; round wheel faces wind outward; chassis no longer buries bogies. Component placement remains scaled, not surveyed. Passenger count128/model, cache32 and full resolution retained.

Final packet checks:45/45 Python tests;4 numerical directions;18,769 speed samples;39 bilingual station-direction checks+5 non-JR assertions;4 browser control cases+2 startup scenes;6 camera overlay cases;212 station models;420 consist positions+4 scenes;16 bridge/tunnel and50 station scenes across both directions;8 local-platform clearances;19 loop/profile cases. Harness now explicitly chooses forward/reverse, fixing an earlier default-direction ambiguity. Software ANGLE only; no physical-GPU/listening/phone/full-route-real-time claim.

Prepared15 isolated candidate assets with latest production publication guard;10 cases passed: visible/hidden/absent/offline/corrupt for both games. No production catalog/database/Pages change. Five gates now have direct evidence; seven remain pending per priority-release-review.json.22 complex/uncounted station layouts including shared Ryuo terminal platform2 need follow-up. No release-ready/public/completed claim.
