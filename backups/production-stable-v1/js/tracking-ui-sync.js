// 画面下部ステータス表示だけを、実際のマーカー追跡状態（marker.object3D.visible）に
// 同期させる専用スクリプト。3Dモデル・spawnアニメーション・A-Frameオブジェクトの
// 状態には一切触れない（読み取り専用でmarker.object3D.visibleを監視する）。

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    // 固定idを推測せず、現在使用中のa-marker要素を取得する
    var markerEl = document.querySelector('a-marker');
    var statusPrimaryEl = document.querySelector('#ar-status-primary');
    var statusSecondaryEl = document.querySelector('#ar-status-secondary');

    if (!markerEl || !statusPrimaryEl || !statusSecondaryEl) {
      console.error('tracking-ui-sync: 必須要素が見つかりません（a-marker / ar-status）');
      return;
    }

    var LOST_GUIDANCE_DELAY_MS = 5000;
    // カメラ起動直後の一瞬のノイズ誤検出でhasEverBeenFoundが立ってしまわないよう、
    // 初回検出だけはこの時間だけvisible=trueが継続することを確認してから確定させる
    var FIRST_FOUND_CONFIRM_MS = 200;

    // ---- このファイルで管理する状態はこの3つだけ ----
    var hasEverBeenFound = false;
    var lostStartedAt = null;
    var currentUiState = 'initial'; // 'initial' | 'tracked' | 'temporarily-lost' | 'long-lost'

    // 初回検出の確認用（hasEverBeenFoundそのものの複製ではなく、確定させる前の一時的な計測にのみ使う）
    var firstFoundSince = null;

    console.log('[tracking-ui] initial');

    // ---- UI更新（既存の#ar-status要素・CSSクラスをそのまま利用する。新規パネルは作らない） ----

    function replayFade(el) {
      el.classList.remove('ar-fade');
      void el.offsetWidth; // 強制リフローでアニメーションを再生させる
      el.classList.add('ar-fade');
    }

    function writeTrackedUI() {
      statusPrimaryEl.textContent = 'てんこう2';
      statusSecondaryEl.textContent = '';
      var badge = document.createElement('span');
      badge.className = 'ar-status__badge';
      badge.textContent = '実寸大 1:1';
      statusSecondaryEl.appendChild(badge);
      replayFade(statusPrimaryEl);
      replayFade(statusSecondaryEl);
    }

    function writeLostGuidanceUI() {
      statusPrimaryEl.textContent = 'マーカーを\nもう一度映してください';
      statusSecondaryEl.textContent = '';
      replayFade(statusPrimaryEl);
      replayFade(statusSecondaryEl);
    }

    // ---- 状態遷移（DOM更新は状態が変わったときだけ行う） ----

    function transitionTo(nextState) {
      var wasLost = currentUiState === 'temporarily-lost' || currentUiState === 'long-lost';
      currentUiState = nextState;

      if (nextState === 'tracked') {
        writeTrackedUI();
        console.log('[tracking-ui] ' + (wasLost ? 'tracked-again' : 'tracked'));
      } else if (nextState === 'temporarily-lost') {
        console.log('[tracking-ui] temporarily-lost');
      } else if (nextState === 'long-lost') {
        writeLostGuidanceUI();
        console.log('[tracking-ui] long-lost');
      }
    }

    // ---- marker.object3D.visibleを毎フレーム読み取る（読み取り専用、書き換えは行わない） ----

    function evaluate() {
      var visibleNow = !!(markerEl.object3D && markerEl.object3D.visible);

      if (visibleNow) {
        if (!hasEverBeenFound) {
          // 初回検出だけは、一瞬のノイズ誤検出を除外するため継続時間を確認する
          if (firstFoundSince === null) {
            firstFoundSince = performance.now();
          } else if (performance.now() - firstFoundSince >= FIRST_FOUND_CONFIRM_MS) {
            firstFoundSince = null;
            hasEverBeenFound = true;
            lostStartedAt = null;
            transitionTo('tracked');
          }
          return;
        }
        if (currentUiState !== 'tracked') {
          lostStartedAt = null;
          transitionTo('tracked');
        }
        return;
      }

      // visibleNow === false
      firstFoundSince = null; // 初回検出待ちが揺らいだ場合は確認をリセットする

      if (!hasEverBeenFound) {
        return; // まだ一度も認識していない：初期案内表示のまま何もしない
      }

      if (currentUiState === 'tracked') {
        lostStartedAt = performance.now();
        transitionTo('temporarily-lost');
        return;
      }

      if (currentUiState === 'temporarily-lost') {
        if (lostStartedAt !== null && performance.now() - lostStartedAt >= LOST_GUIDANCE_DELAY_MS) {
          transitionTo('long-lost');
        }
      }
      // currentUiState === 'long-lost' の間は何もしない（既に案内表示のまま）
    }

    function tick() {
      evaluate();
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  });
})();
