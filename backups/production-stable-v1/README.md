# てんこう2 WebAR Production Stable Version

## 状態

- GitHub Pages公開版で正常動作確認済み
- スマートフォン実機で正常動作確認済み
- オープニング演出正常
- トップページ正常
- モーションセンサー許可画面を日本語化済み
- カメラアクセス正常
- カメラ起動後に使い方画像を表示
- 「はじめる」でAR体験開始
- 右上「？」から使い方を再確認可能
- カスタムマーカー認識正常
- tenkoh2.glb表示正常
- 実寸表示正常
- モデルの高さ正常
- 20度の傾き正常
- 20秒回転正常
- 出現アニメーション正常
- 初回未認識時は「マーカーを映してください」
- 一度認識後、5秒以上ロストした場合は「もう一度マーカーを映してください」
- 再認識正常
- 戻るボタン正常

## 既知事項

- マーカー認識は照明条件の影響を受ける
- カメラのピントは端末や撮影距離の影響を受ける
- Androidのカメラ表示については別途テストページあり
- 本番で重大な動作不具合は確認されていない

## 含まれるファイル

```
index.html
ar.html
css/landing.css
css/opening-intro.css
css/ar-ui.css
css/permission-ui-ja.css
css/ar-guide.css
js/opening-intro.js
js/spawn.js
js/ar-ui.js
js/tracking-ui-sync.js
js/ar-guide.js
assets/models/tenkoh2.glb
assets/markers/tenkoh2-marker.patt
assets/images/tenkoh2-logo.svg
assets/images/cosmic-campus-logo.svg
assets/images/cst-logo.svg
assets/images/art-logo.svg
assets/images/ar-guide.png
```

本番ページ（`index.html`・`ar.html`）が実際に読み込んでいるローカルファイルのみを対象としており、
診断用ページ（`debug-*.html`、`ar-camera-android-test.html`、`ar-camera-fit-test.html`、
`ar-camera-quality-test.html`、`ar-model-test.html`等）や、それらが使用するCSS/JS
（`css/android-camera-fit.css`、`js/android-camera-fit.js`、`js/android-camera-diagnostic.js`、
`js/camera-quality-test.js`等）は含めていません。

## 復元方法

この`backups/production-stable-v1/`フォルダ内のファイルを、同じフォルダ構成のまま
プロジェクトルート（このバックアップの一つ上の`backups/`のさらに上の階層）へ
上書きコピーすれば、この安定版の状態へ復元できます。

例（プロジェクトルートで実行）：

```bash
cp -R backups/production-stable-v1/index.html ./index.html
cp -R backups/production-stable-v1/ar.html ./ar.html
cp -R backups/production-stable-v1/css/. ./css/
cp -R backups/production-stable-v1/js/. ./js/
cp -R backups/production-stable-v1/assets/. ./assets/
```
