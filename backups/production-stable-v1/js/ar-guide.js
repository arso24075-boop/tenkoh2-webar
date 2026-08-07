// AR画面の「使い方」画像モーダル制御。
// AR.jsのcamera-initイベントが発生した後にだけ自動表示し、
// 新しいgetUserMediaの呼び出しは行わない（AR.jsが取得したカメラをそのまま使う）。
// マーカー追跡・3Dモデル・spawn処理には一切触れない。

(function () {
  'use strict';

  var STORAGE_KEY = 'tenkoh2ArGuideSeen';

  document.addEventListener('DOMContentLoaded', function () {
    var modalEl = document.getElementById('ar-guide-modal');
    var imageEl = document.getElementById('ar-guide-image');
    var fallbackEl = document.getElementById('ar-guide-fallback');
    var closeXButton = document.getElementById('ar-guide-close-x');
    var startButton = document.getElementById('ar-guide-start-button');
    var helpModalEl = document.getElementById('ar-help-modal');
    var openFromHelpButton = document.getElementById('ar-help-open-guide-button');

    if (!modalEl || !imageEl || !fallbackEl || !startButton) {
      console.error('ar-guide: 必須要素が見つかりません');
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var isForced = params.get('guide') === '1';
    var hasAutoTriggered = false;

    function hasSeenThisSession() {
      try {
        return window.sessionStorage.getItem(STORAGE_KEY) === '1';
      } catch (e) {
        return false;
      }
    }

    function markSeen() {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (e) {
        // sessionStorageが使用できない環境では何もしない
      }
    }

    function openGuideModal(showCloseX) {
      if (closeXButton) {
        closeXButton.hidden = !showCloseX;
      }
      modalEl.hidden = false;
    }

    function closeGuideModal() {
      modalEl.hidden = true;
    }

    function onImageError() {
      imageEl.hidden = true;
      fallbackEl.hidden = false;
    }

    startButton.addEventListener('click', function () {
      markSeen();
      closeGuideModal();
    });

    if (closeXButton) {
      closeXButton.addEventListener('click', closeGuideModal);
    }

    imageEl.addEventListener('error', onImageError);
    // DOMContentLoaded時点で既に読み込みに失敗している場合に備える
    if (imageEl.complete && imageEl.naturalWidth === 0) {
      onImageError();
    }

    if (openFromHelpButton) {
      openFromHelpButton.addEventListener('click', function () {
        // 使い方モーダルの裏に重なって見えないよう、先に隠してから画像モーダルを開く
        if (helpModalEl) {
          helpModalEl.hidden = true;
        }
        openGuideModal(true); // 「？」からの再表示のときだけ×ボタンを見せる
      });
    }

    function tryAutoShow() {
      if (hasAutoTriggered) {
        return;
      }
      if (!isForced && hasSeenThisSession()) {
        return;
      }
      hasAutoTriggered = true;
      openGuideModal(false); // カメラ起動後の自動表示には×ボタンを出さない
    }

    window.addEventListener('camera-init', function () {
      tryAutoShow();
    });
  });
})();
