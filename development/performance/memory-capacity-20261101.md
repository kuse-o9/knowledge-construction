# 追加の3Dメモリー軽量化と容量確認（2026-11-01）

依頼受領08:13JST。勉強用チャットは利用者が正常動作を確認したため、その確認を予定表に反映。無料の既存構成だけを使用。

## 変更

- 山手線、中央快速、中央総武各停、京浜東北・根岸、総武快速、ゆりかもめ、あずさ・かいじの共通Viewerを`scene3DOnly:true`で作成する。もともとCesiumの2D/Columbus表示への切替は使用せず、ゲームの全線マップは別のCanvasで描いている。ゲームの地図・運転席・車外カメラを残し、使用しないCesium用の2D投影属性を作らない。明示的にscene3DOnlyを指定した呼出元の値は優先する。
- 7つの運転プログラムの模型Primitiveに`allowPicking:false`を明示。これらの運転プログラムはScene.pick/drillPickを使用しない。選車やメニューは従来のUIを使用する。クリック選車がある別実装の会社別車両基地にはこの変更を適用しない。
- 画素数、MSAA、透明表現、メッシュの頂点／三角形、遠景距離、乗客数、テクスチャー、信号、ドア、放送、保存形式は変更しない。
- 入口と読み込み処理のバージョンを更新し、共通処理だけ新しく運転プログラムが古いという混在を避ける。

## 確認

- 実際のCesium1.117.0のPrimitivePipelineで同一の箱模型を処理。頂点属性・インデックスの合計は1416→840バイト（模型の例で約41%削減）。インデックス・圧縮法線・batchId一致。地球座標への変換後の最大差は約1.32mmで、ローカル座標／地球座標のFloat32分割符号化の丸め差。ゲーム全体のVRAMが41%減るという意味ではない。
- ブロック時の再接続回数、通常の再試行、保存後の整理、トンネル切抜きの和集合と床・壁・照明、乗客の移動行列、特急ドアの開閉と反対側閉鎖を検査。
- 物理GPUで利用者の白画面が解消したか、長時間走行時のVRAMやFPSは未確認。ブラウザーによりGPUが無効化された状態をアプリから強制解除しない。

## 容量の実測

| 対象 | 取得値 | 意味 |
|---|---:|---|
| GitHub mainの全ファイル | 135,906,190 bytes（約136MB） | Git Trees API、518ファイル。公開ビルド生成物そのものの容量ではない |
| GitHubリポジトリ | 408,033 KiB（約418MB） | GitHub repository APIのsize。履歴込みのサービス側集計で遅延の可能性あり |
| Supabaseデータベース | 15,111,859 bytes（約15.1MB） | pg_database_size。WAL・基盤ディスク・他プロジェクトは含めない |
| Supabase Storage | 363,824 bytes（約0.36MB）、2ファイル | Storageのmetadata.sizeの合計 |

この時点で保存容量の逼迫は見られない。月間の転送量、CPU、ピーク接続数、GitHub Actions保管量はこの計測では未取得。容量不足が原因の白画面と断定しない。不要データの削除や履歴書換え、プラン変更はしていない。

一次資料：
- https://cesium.com/learn/cesiumjs/ref-doc/Scene.html （scene3DOnly）
- https://github.com/CesiumGS/cesium/blob/1.117/packages/engine/Source/Scene/PrimitivePipeline.js
- https://github.com/CesiumGS/cesium/blob/1.117/packages/engine/Source/Scene/Primitive.js （allowPicking）
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits （公開サイト上限1GB）
- https://supabase.com/pricing （Free：DB500MB、Storage1GB）
