// マーカー認識イベントを出現アニメーション用のカスタムイベントへ中継する最小スクリプト

document.addEventListener('DOMContentLoaded', function () {
  var marker = document.querySelector('#debug-custom-marker');
  var spawn = document.querySelector('#satellite-spawn');
  var position = document.querySelector('#satellite-position');

  if (!marker || !spawn || !position) {
    console.error('spawn: 必須要素が見つかりません（marker / satellite-spawn / satellite-position）');
    return;
  }

  // マーカーを検出したら、出現（拡大）と上昇のアニメーションを同時に開始する
  marker.addEventListener('markerFound', function () {
    spawn.emit('spawnSatellite');
    position.emit('riseSatellite');
  });

  // マーカーを見失ったら、次に認識したときに最初からアニメーションが
  // 再生されるよう、出現前の初期状態へ即座に戻す
  marker.addEventListener('markerLost', function () {
    spawn.setAttribute('scale', '0.01 0.01 0.01');
    position.setAttribute('position', '0 0.70 0');
  });
});
