// 展示用AR画面のオーバーレイUI制御（カメラ起動ライフサイクル・使い方モーダル）。
// マーカー追跡状態に応じたステータス表示はjs/tracking-ui-sync.jsが行うため、
// ここではmarkerFound/markerLostを監視しない（表示の二重管理を避けるため）。

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var sceneEl = document.querySelector('a-scene');

    var backButton = document.querySelector('#ar-back-button');
    var helpButton = document.querySelector('#ar-help-button');
    var helpModal = document.querySelector('#ar-help-modal');
    var helpBackdrop = document.querySelector('#ar-help-backdrop');
    var helpCloseButton = document.querySelector('#ar-help-close');

    var statusPrimary = document.querySelector('#ar-status-primary');
    var statusSecondary = document.querySelector('#ar-status-secondary');

    var errorPanel = document.querySelector('#ar-error');
    var retryButton = document.querySelector('#ar-retry-button');

    if (!sceneEl || !statusPrimary || !statusSecondary) {
      console.error('ar-ui: 必須要素が見つかりません（a-scene / ar-status）');
      return;
    }

    var CAMERA_STARTUP_TIMEOUT_MS = 12000; // カメラ起動失敗を検出する起動確認タイマー

    var cameraStartupTimerId = null;

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

    // ---- カメラエラー ----

    function showError(reason) {
      if (cameraFailed) {
        return;
      }
      cameraFailed = true;
      if (cameraStartupTimerId !== null) {
        clearTimeout(cameraStartupTimerId);
        cameraStartupTimerId = null;
      }
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
      showAwaitingMarker();
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
