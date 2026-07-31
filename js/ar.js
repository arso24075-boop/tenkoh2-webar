// マーカー認識状態に応じて、画面下部の案内テキストを切り替える最小スクリプト

document.addEventListener('DOMContentLoaded', function () {
  var marker = document.querySelector('#tenkoh2-marker');
  var guideText = document.querySelector('#guide-text');

  var MESSAGE_DEFAULT = 'カードのマーカー全体を映してください';
  var MESSAGE_FOUND = 'マーカーを認識しました';

  if (!marker || !guideText) {
    console.log('AR: マーカーまたは案内テキストの要素が見つかりません');
    return;
  }

  // マーカーを検出したら案内テキストを切り替える
  marker.addEventListener('markerFound', function () {
    guideText.textContent = MESSAGE_FOUND;
    console.log('AR: markerFound（マーカーを認識しました）');
  });

  // マーカーを見失ったら元の案内テキストに戻す
  marker.addEventListener('markerLost', function () {
    guideText.textContent = MESSAGE_DEFAULT;
    console.log('AR: markerLost（マーカーを見失いました）');
  });
});
