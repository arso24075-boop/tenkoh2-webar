// マーカー認識イベントを出現アニメーション用のカスタムイベントへ中継する最小スクリプト
// 5秒以内の短い追跡切れでは出現演出を再生せず、完成状態を維持する

document.addEventListener('DOMContentLoaded', function () {
  var marker = document.querySelector('#debug-custom-marker');
  var spawn = document.querySelector('#satellite-spawn');
  var position = document.querySelector('#satellite-position');
  var particleEffect = document.querySelector('#particle-effect');

  if (!marker || !spawn || !position) {
    console.error('spawn: 必須要素が見つかりません（marker / satellite-spawn / satellite-position）');
    return;
  }

  if (!particleEffect) {
    // 粒子演出は付加的な要素のため、見つからなくても衛星の出現自体は継続する
    console.error('spawn: particle-effect要素が見つかりません（粒子演出はスキップされます）');
  }

  var SCALE_INITIAL = '0.85 0.85 0.85';
  var SCALE_COMPLETE = '1 1 1';
  var POSITION_INITIAL = '0 0.84 0';
  var POSITION_COMPLETE = '0 0.90 0';
  var RESET_DELAY_MS = 5000;

  var resetTimerId = null;
  // true: 次のmarkerFoundで出現演出を再生する（初回、または5秒以上の追跡切れ後）
  var isReadyForSpawnAnimation = true;

  marker.addEventListener('markerFound', function () {
    // 5秒以内の再認識なら、保留していたリセットを取り消す
    if (resetTimerId !== null) {
      window.clearTimeout(resetTimerId);
      resetTimerId = null;
    }

    if (isReadyForSpawnAnimation) {
      spawn.emit('spawnSatellite');
      position.emit('riseSatellite');
      // 完全な出現アニメーションを再生するときだけ、粒子演出も再生する
      if (particleEffect) {
        particleEffect.emit('playParticles');
      }
      isReadyForSpawnAnimation = false;
    } else {
      // 短い追跡切れからの復帰：演出を再生せず完成状態へ即復帰する
      spawn.setAttribute('scale', SCALE_COMPLETE);
      position.setAttribute('position', POSITION_COMPLETE);
    }
  });

  marker.addEventListener('markerLost', function () {
    // 5秒間再認識されなかった場合だけ、次回の出現演出に備えて状態をリセットする
    resetTimerId = window.setTimeout(function () {
      resetTimerId = null;
      isReadyForSpawnAnimation = true;
      spawn.setAttribute('scale', SCALE_INITIAL);
      position.setAttribute('position', POSITION_INITIAL);
      if (particleEffect) {
        particleEffect.emit('resetParticles');
      }
    }, RESET_DELAY_MS);
  });
});
