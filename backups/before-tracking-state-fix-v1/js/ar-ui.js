// 展示用AR画面のオーバーレイUI制御。
// spawn.jsは編集せず、同じマーカー要素のmarkerFound/markerLostを
// このファイル側でも独立して監視する（spawn.jsの5秒タイマーは複製しない）。

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var sceneEl = document.querySelector('a-scene');
    var markerEl = document.querySelector('#debug-custom-marker');

    var backButton = document.querySelector('#ar-back-button');
    var helpButton = document.querySelector('#ar-help-button');
    var helpModal = document.querySelector('#ar-help-modal');
    var helpBackdrop = document.querySelector('#ar-help-backdrop');
    var helpCloseButton = document.querySelector('#ar-help-close');

    var statusPrimary = document.querySelector('#ar-status-primary');
    var statusSecondary = document.querySelector('#ar-status-secondary');

    var errorPanel = document.querySelector('#ar-error');
    var retryButton = document.querySelector('#ar-retry-button');

    if (!sceneEl || !markerEl || !statusPrimary || !statusSecondary) {
      console.error('ar-ui: 必須要素が見つかりません（a-scene / marker / ar-status）');
      return;
    }

    // ---- このファイルで使用するタイマーは以下の3種類のみ ----
    var DETECT_FLASH_MS = 900; // 認識表示（てんこう2を検出）を切り替えるタイマー
    var LOST_GUIDANCE_MS = 1000; // markerLost後の案内を出すタイマー
    var CAMERA_STARTUP_TIMEOUT_MS = 12000; // カメラ起動失敗を検出する起動確認タイマー
    var QUICK_RECOVERY_MS = 5000; // spawn.js側の5秒しきい値と同じ値（タイマーではなく時刻比較で判定）

    var detectFlashTimerId = null;
    var lostGuidanceTimerId = null;
    var cameraStartupTimerId = null;

    var hasEverFound = false;
    var lastLostAt = null;
    var cameraReady = false;
    var cameraFailed = false;

    // ---- ステータス表示 ----

    function replayFade(el) {
      el.classList.remove('ar-fade');
      // 強制リフローでアニメーションを再生させる
      void el.offsetWidth;
      el.classList.add('ar-fade');
    }

    function setStatusText(primaryText, secondaryText) {
      statusPrimary.textContent = primaryText;
      statusSecondary.textContent = secondaryText || '';
      replayFade(statusPrimary);
      replayFade(statusSecondary);
    }

    function showInitializing() {
      setStatusText('ARを準備しています', 'カメラの使用を許可してください');
    }

    function showCameraStarting() {
      setStatusText('カメラを起動しています', '');
    }

    function showAwaitingMarker() {
      setStatusText('マーカー全体を\nカメラに映してください', '');
    }

    function showDetected() {
      setStatusText('てんこう2を検出', '');
    }

    function showTracking() {
      statusPrimary.textContent = 'てんこう2';
      statusSecondary.textContent = '';
      var badge = document.createElement('span');
      badge.className = 'ar-status__badge';
      badge.textContent = '実寸大 1:1';
      statusSecondary.appendChild(badge);
      replayFade(statusPrimary);
      replayFade(statusSecondary);
    }

    function showLostGuidance() {
      setStatusText('マーカーを\nもう一度映してください', '');
    }

    // ---- カメラエラー ----

    function clearAllTimers() {
      if (detectFlashTimerId !== null) {
        clearTimeout(detectFlashTimerId);
        detectFlashTimerId = null;
      }
      if (lostGuidanceTimerId !== null) {
        clearTimeout(lostGuidanceTimerId);
        lostGuidanceTimerId = null;
      }
      if (cameraStartupTimerId !== null) {
        clearTimeout(cameraStartupTimerId);
        cameraStartupTimerId = null;
      }
    }

    function showError(reason) {
      if (cameraFailed) {
        return;
      }
      cameraFailed = true;
      clearAllTimers();
      if (errorPanel) {
        errorPanel.hidden = false;
      }
      console.error('ar-ui: カメラエラー', reason);
    }

    function isVideoPlayable(video) {
      // readyState 2 (HAVE_CURRENT_DATA) 以上、かつ実際の映像サイズが確定していることを確認する
      return (
        !!video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      );
    }

    function startCameraStartupWatch() {
      cameraStartupTimerId = window.setTimeout(function () {
        cameraStartupTimerId = null;
        if (cameraFailed || cameraReady) {
          return;
        }
        var video = document.querySelector('video');
        if (!isVideoPlayable(video)) {
          showError('カメラ映像の起動をタイムアウトまでに確認できませんでした');
        }
      }, CAMERA_STARTUP_TIMEOUT_MS);
    }

    function handleCameraReady() {
      if (cameraReady || cameraFailed) {
        return;
      }
      cameraReady = true;
      if (cameraStartupTimerId !== null) {
        clearTimeout(cameraStartupTimerId);
        cameraStartupTimerId = null;
      }
      if (!hasEverFound) {
        showAwaitingMarker();
      }
    }

    // ---- 初期表示 ----

    showInitializing();

    if (sceneEl.hasLoaded) {
      showCameraStarting();
    } else {
      sceneEl.addEventListener('loaded', function () {
        if (!cameraReady && !cameraFailed) {
          showCameraStarting();
        }
      }, { once: true });
    }

    // スクリプト実行時点ですでにvideoが再生可能になっている場合に備える
    var existingVideo = document.querySelector('video');
    if (isVideoPlayable(existingVideo)) {
      handleCameraReady();
    } else {
      startCameraStartupWatch();
    }

    sceneEl.addEventListener('arjs-video-loaded', function () {
      handleCameraReady();
    });

    sceneEl.addEventListener('camera-error', function (evt) {
      var detail = evt && evt.detail;
      var reason =
        (detail && detail.error && detail.error.message) ||
        (detail && detail.message) ||
        'カメラを起動できませんでした';
      showError(reason);
    });

    // ---- マーカー認識イベント（spawn.jsとは独立して監視） ----

    markerEl.addEventListener('markerFound', function () {
      if (cameraFailed) {
        return;
      }

      if (lostGuidanceTimerId !== null) {
        clearTimeout(lostGuidanceTimerId);
        lostGuidanceTimerId = null;
      }
      if (detectFlashTimerId !== null) {
        clearTimeout(detectFlashTimerId);
        detectFlashTimerId = null;
      }

      var isQuickRecovery =
        hasEverFound && lastLostAt !== null && Date.now() - lastLostAt < QUICK_RECOVERY_MS;

      if (isQuickRecovery) {
        showTracking();
      } else {
        showDetected();
        detectFlashTimerId = window.setTimeout(function () {
          detectFlashTimerId = null;
          showTracking();
        }, DETECT_FLASH_MS);
      }

      hasEverFound = true;
    });

    markerEl.addEventListener('markerLost', function () {
      if (cameraFailed) {
        return;
      }

      lastLostAt = Date.now();

      if (detectFlashTimerId !== null) {
        clearTimeout(detectFlashTimerId);
        detectFlashTimerId = null;
      }
      if (lostGuidanceTimerId !== null) {
        clearTimeout(lostGuidanceTimerId);
      }
      lostGuidanceTimerId = window.setTimeout(function () {
        lostGuidanceTimerId = null;
        showLostGuidance();
      }, LOST_GUIDANCE_MS);
    });

    // ---- 使い方モーダル ----

    function onHelpKeydown(evt) {
      if (evt.key === 'Escape' || evt.key === 'Esc') {
        closeHelpModal();
      }
    }

    function openHelpModal() {
      if (!helpModal) {
        return;
      }
      helpModal.hidden = false;
      document.addEventListener('keydown', onHelpKeydown);
      if (helpCloseButton) {
        helpCloseButton.focus();
      }
    }

    function closeHelpModal() {
      if (!helpModal) {
        return;
      }
      helpModal.hidden = true;
      document.removeEventListener('keydown', onHelpKeydown);
      if (helpButton) {
        helpButton.focus();
      }
    }

    if (helpButton) {
      helpButton.addEventListener('click', openHelpModal);
    }
    if (helpCloseButton) {
      helpCloseButton.addEventListener('click', closeHelpModal);
    }
    if (helpBackdrop) {
      helpBackdrop.addEventListener('click', closeHelpModal);
    }

    // ---- 戻る / 再読み込み ----
    // 戻るボタンは通常のa要素（href="./index.html"）のため、JavaScriptでの遷移処理は不要

    if (retryButton) {
      retryButton.addEventListener('click', function () {
        window.location.reload();
      });
    }
  });
})();
