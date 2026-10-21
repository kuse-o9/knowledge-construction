# 次回の未制作100路線：制作設計

2026-10-21：ユーザーから100件まとめて制作する指示を受け、batch-001を開始。対象はbatch-001/manifest.jsonに固定し、入力データ・模型・運転・検査を段階的に実装する。未完成のものを公開ゲームに追加しない。全国候補表530項目の「列車種別」「系統」「物理的な路線」を同じ100件として重複集計しない。

## 画面のイメージ

会社別の23階車両基地 → その会社の制作済み列車を選択 → 行先・種別・始発駅・手動/自動・混雑を選択 → 運転台/車外/地図で運転。未制作の路線は制作待ちの表示とし、運転できるようには見せない。既存の三人称カメラとホームからの乗車を共通導線にする。

快速・特快・特急には、停車駅と物理的に存在する全駅を別々に持たせる。通過するホームを消さない。速度のゲーム設定は駅境界で切り替え、カーブ独自の制限は付けない。信号と停車と車間の制動は全線で有効にする。

## 制作の単位

- `corridorId`：物理的な線路。共用する区間の座標・高さ・ホームは一度だけ制作する。
- `serviceId`：各停・快速・特快・特急などの停車パターン。列車名の追加を新しい線路の完成として数えない。
- `stockId`：軌間・電源・編成・扉・台車・案内を持つ車両。色だけを変えた別形式を精密再現として扱わない。
- `connectionId`：直通・折返し・乗換・分割併合。接続駅・方向・車両適合・会社境界・進路競合を検査する。

通常鉄道・路面電車・新幹線・AGT・モノレール等は走行方式を分ける。今回の既存路線改修では、ゆりかもめとモノレール系を除外する。次回100路線についても、明示的な変更があるまでこの除外を維持する。

## 100路線の進め方

1. 候補表を整理して、既存制作区間・共用区間・休廃止/BRT・特殊方式を照合する。
2. 鉄道事業者の公式資料で現行の区間・全駅・種別・車両・直通・乗換を確認する。位置データの利用条件と取得日も保存する。資料のない速度・配線を公式再現として断定しない。
3. まず同じ会社/走行方式の代表1路線を縦に完成させ、全駅・両方向・車両・地下/高架・UIを検査する。その形式を同種路線へ展開する。
4. 各路線を線形→地形高さ→駅→車両→信号/進路→案内→数値検査→ブラウザ検査の順で制作する。失敗した工程だけ再実行できる状態を保存する。
5. 100件の依頼でも、5〜10路線ずつ検査して保存する。合格した路線のみ公開一覧へ追加する。バッチ全体が終わるまで成果を失う巨大な一括送信は使わない。

## パケットと公開

共通エンジン・共通車両・共用線形を内容ハッシュで再利用し、路線と区間のパケットを個別に取得する。各圧縮片は最大8MiBを目標とする。現在区間・次区間・復路に必要な基幹データだけを保持し、遠い区間の模型を解放する。先読み失敗で現在のセーブを消さない。

公開マニフェストは全素材のハッシュと検査結果を参照する。全素材を先に保存し、最後の1コミットで公開版を切り替える。GitHubへの保存とPagesの配信完了を分け、公開URLからハッシュを再確認する。

## 完成の条件

|検査|判定内容|
|---|---|
|資料/権利|公式出典・利用条件・取得日、未確定項目の明示|
|線路/駅|両方向・全物理駅・停車/通過、接続座標/高さ、ホームと扉|
|運転|最高速度へ実加速、駅境界制限、手動/自動、停車・信号・車間・分岐・単線交換|
|3D|運転台/車外、地下坑口、高架、駅、接続駅、車両と線路の位置|
|入力/案内|PC/狭幅、キーボード/マウス/タッチ相当操作、音のON/OFF/音量、放送文|
|継続性|セーブ復帰、別区間への引継ぎ、取得失敗後の再試行、キャッシュ更新|
|公開|公開URL・素材ハッシュ・検査日・検査方式・未確認範囲|

ブラウザのソフトウェアWebGL検査と、実機GPU/実際の音を聞く検査は別の欄で記録する。100路線の名前やダミーの模型だけを配置して完成とはしない。

`preview-batch.py --count 100` は候補確認用の読取専用コマンド。実際の今回の100件は `batch-001/manifest.json` を使い、名前だけの追加を完成と数えない。

## 現在の制作パイプライン

`batch-001/WORKLOG.md` に実施結果と残作業を記録する。102の共有系統の地形・元線分・駅候補を検査した入力は `terrain-inputs/` と `networks/`。接続が離れた区間は離れたまま保存し、元の線分を消したり架空の線を足したりしない。地表面高度をトンネル内のレール高さとして使わない。

優先2系統の `alignments/` は元線路による前後350mの余裕を持ち、`services/` は選択した2026年10月平日の列車別停車パターンを持つ。`engine/train-scene.js` は車両ごとの長さ・台車・扉・前後向きを受け取る開発用描画部品。E353の寸法と編成は暫定であり、完成車両とは数えない。

入力検査は `python -m unittest discover -s development/route-batches -p test_batch_inputs.py -v`。停車・通過と早発の数値検査は `node development/route-batches/check-priority-services.cjs`。編成のソフトウェアWebGL検査は `check-train-scene.cjs`（PlaywrightとChromiumが必要）。検査記録は使用した入力/部品のハッシュを参照する。検査用100km/hを実際の路線速度に転用しない。`release-gate.py` は未完成のゲームの公開を拒否する。

## 順次公開の承認と手順

2026-10-21のユーザー指示：仕上げと公開準備が終わった路線から順次公開する。100件全体の完了や、その都度の再承認は不要。品質条件は維持する。

`prepare-publication.py --write` は、必須12条件・両方向の全駅・素材の版・検査報告が一致する路線だけの公開カタログとアップロード計画を作る。既存公開分は保持し、未完成の改訂で削除しない。新ゲームの素材は `rail-games/` に置き、既存ゲームのファイルを上書きしない。公開できる路線が0件の場合、空の公開一覧やゲーム入口を作らない。`publication-plan.json` の `uploads` にない試作・調査データを公開版へ混ぜない。

公開用HTML・素材・入口を検査した後、一覧の全素材を同じGitHubコミットに保存し、Pagesの配信完了と公開URLからのハッシュ照合を確認して公開済みと記録する。ローカルの準備完了・GitHubへの保存・公開配信完了を区別する。公開のたびにユーザーへ路線名とURLを報告する。このスクリプトだけではデプロイも、会話終了後の開発継続も実行しない。

## 2026-10-20の追加指示（⑲・㉖）

⑲の周辺列車は今後制作する全路線に必須。実在する並走・交差線の位置、高さ、走行方式、編成を調査し、各列車自身の路線速度と密度で走らせる。未制作の周辺線は未実装として記録し、架空の地上線で置き換えない。

㉖は全駅・両方向・全区間の等速連続走行と物理GPU検査を含む。数値の高速検査、地点を移動した画像検査、ソフトウェアWebGL、スマホ寸法の模擬操作は、それぞれ別種の補助検査。実機の音質・読み上げ・スマホ操作感と代用しない。重複区間は路線・方向・データ版をキーに一度だけ検査し、実測時間・環境・成否を残す。

2026-10-20追記：ユーザーの指示で、物理GPU・耳で聴く音質・スマホ実端末の操作感・全区間の実時間走行は「ユーザー判断による確認終了」として予定上は閉じる。実施した検査と省略した検査の技術記録は変更せず、実施済み・合格という意味に置き換えない。

時刻表は目安として表示し、定刻までの戸閉・発車待ちは撤廃。乗降の完了後、音声を使う場合は発車案内の終了で自動戸閉し、手動・自動とも早発を許可する。音声オフでも定刻待ちは行わない。

### Geometry review checkpoint

The two integrated development games now use a separately estimated rail elevation
profile (`build-priority-elevation.py`). GSI map classifications locate candidate
structures but do not supply surveyed rail heights or portal endpoints. The game
profile's 34 per mille centreline constraint is a modelling constraint, not a
claimed real operating gradient. Kaiji reuses Azusa's overlapping elevation.

`vehicles/e353-source-review.json` records manufacturer 2015 pre-series table and
drawing facts. Direction-specific basic-set cars, passenger doors and pantographs
replace the generic nine-car formation. This does not verify all 2026 production
or service-specific details. The 16 operator map reviews distinguish a platform's
side from the selected train's actual assignment. Passing-station layouts and
all dimensions remain subject to individual review.

`check-priority-geometry.cjs` catches Cesium's internal `scene.renderError` as well
as page/WebGL errors, and exercises repeated tunnel/surface transitions. Regional
photographic imagery is an overlay on a global colour base: a regional base
layer in Cesium 1.117 can reach an undefined clipped rectangle during edge
stretching after underground camera travel. No engine exception is suppressed. A clipping collection is replaced only when its nearby window changes: Cesium 1.117 updates its GPU polygon texture when vertex counts change, so mutating an equal-sized set would retain stale cuts.

See `batch-001/geometry-review-status.json` for the outstanding checks. These
changes do not mark any route completed, playable in the public catalog, or
release-ready. Software rendering is not a physical GPU/phone/audio test.

Validation on the current development packets: 38 unit tests passed, 212 station meshes checked, 420 consist placements checked, four directional control cases plus two station scenes passed, and ten tunnel/bridge diagnostic views passed. Bridge snapshots require settled terrain; Cesium render errors and visible error panels fail the regression. These are software/direct-positioning checks, not surveyed structure approval or real-time full-route testing.
