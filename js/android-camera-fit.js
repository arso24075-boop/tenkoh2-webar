// Androidでカメラ映像がズームして見える問題を調査するcontain方式テスト用スクリプト。
// ar-camera-fit-test.htmlでのみ読み込む。
// 新しいgetUserMedia呼び出しは行わず、AR.jsのcamera-initイベント経由で
// 既存のMediaStreamのみを参照する。カメラのconstraints/projection matrixは変更しない。
//
// CSSのみでvideoとA-Frame表示Canvasの「画面上の位置・大きさ」を同期させる方式を採用し、
// renderer.setSize()は使用していない。containで計算する長方形はvideoの実解像度の
// アスペクト比をそのまま維持するため、Canvas側の内部描画解像度（drawing buffer）と
// アスペクト比が一致している限り、CSSサイズを合わせるだけで歪みは生じない。
// この方法が最もAR.js内部処理への影響が少ないと判断した。

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  // fitパラメーターが無い、またはcontain以外の値の場合は安全のためcurrent扱いにする
  var fitMode = params.get('fit') === 'contain' ? 'contain' : 'current';
  var isFitDebugEnabled = params.get('fitDebug') === '1';

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  // Android以外の端末では、fit=containが指定されていても何も変更しない
  var shouldApplyContain = fitMode === 'contain' && isAndroid();

  var matchedVideo = null;
  var displayCanvas = null;
  var isActive = false;
  var lastRect = null;

  // ---- 要素取得 ----

  function findMatchingVideo(stream) {
    var videos = document.querySelectorAll('video');
    if (stream) {
      for (var i = 0; i < videos.length; i++) {
        if (videos[i].srcObject === stream) {
          return videos[i];
        }
      }
    }
    // streamと一致する要素が特定できない場合は、video要素が1つだけのときに限り採用する
    // （ページ内すべてのvideoへスタイルを適用することは避ける）
    return videos.length === 1 ? videos[0] : null;
  }

  function findDisplayCanvas() {
    var sceneEl = document.querySelector('a-scene');
    if (!sceneEl) {
      return null;
    }
    // 優先順位: 1) sceneEl.canvas 2) sceneEl.renderer.domElement 3) canvas.a-canvas
    if (sceneEl.canvas) {
      return sceneEl.canvas;
    }
    if (sceneEl.renderer && sceneEl.renderer.domElement) {
      return sceneEl.renderer.domElement;
    }
    return sceneEl.querySelector('canvas.a-canvas');
  }

  // ---- viewport取得 ----

  function getViewportRect() {
    if (window.visualViewport) {
      return {
        width: window.visualViewport.width,
        height: window.visualViewport.height,
        left: window.visualViewport.offsetLeft || 0,
        top: window.visualViewport.offsetTop || 0
      };
    }
    return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
  }

  // ---- containサイズ計算 ----

  function computeContainRect(video, viewport) {
    var sourceAspect = video.videoWidth / video.videoHeight;
    var viewportAspect = viewport.width / viewport.height;
    var rectWidth;
    var rectHeight;

    if (viewportAspect > sourceAspect) {
      // 画面の方が横長 -> 高さを画面に合わせ、幅をアスペクト比から算出する
      rectHeight = viewport.height;
      rectWidth = rectHeight * sourceAspect;
    } else {
      // 画面の方が縦長 -> 幅を画面に合わせ、高さをアスペクト比から算出する
      rectWidth = viewport.width;
      rectHeight = rectWidth / sourceAspect;
    }

    var rectLeft = viewport.left + (viewport.width - rectWidth) / 2;
    var rectTop = viewport.top + (viewport.height - rectHeight) / 2;

    return {
      left: Math.round(rectLeft),
      top: Math.round(rectTop),
      width: Math.round(rectWidth),
      height: Math.round(rectHeight)
    };
  }

  // ---- CSS適用 ----
  // video/canvasの両方へ同一の位置・サイズだけを適用する。
  // z-indexは既存の前後関係を維持するため、ここでは一切設定しない。

  function applyRectTo(el, rect) {
    el.style.position = 'fixed';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    el.style.margin = '0';
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
  }

  function applyDebugFrames() {
    if (!isFitDebugEnabled) {
      return;
    }
    if (matchedVideo) {
      matchedVideo.classList.add('android-camera-fit-debug-video');
    }
    if (displayCanvas) {
      displayCanvas.classList.add('android-camera-fit-debug-canvas');
    }
  }

  function recalcAndApply() {
    applyDebugFrames();

    if (!shouldApplyContain) {
      updateDebugPanel();
      return;
    }
    if (!matchedVideo || matchedVideo.videoWidth === 0 || matchedVideo.videoHeight === 0) {
      updateDebugPanel();
      return;
    }
    if (!displayCanvas) {
      displayCanvas = findDisplayCanvas();
      if (!displayCanvas) {
        updateDebugPanel();
        return;
      }
      applyDebugFrames();
    }

    var viewport = getViewportRect();
    var rect = computeContainRect(matchedVideo, viewport);

    // 映像を歪ませない設定（cover/scale/transform/zoomは使用しない）
    matchedVideo.style.objectFit = 'contain';
    applyRectTo(matchedVideo, rect);
    applyRectTo(displayCanvas, rect);

    if (!isActive) {
      isActive = true;
      document.body.classList.add('android-camera-fit--active');
    }

    lastRect = rect;
    updateDebugPanel();
  }

  // ---- debounce付き再計算（resize/orientationchange/visualViewport用） ----

  var recalcDebounceTimerId = null;
  function scheduleRecalc(delayMs) {
    if (recalcDebounceTimerId !== null) {
      window.clearTimeout(recalcDebounceTimerId);
      recalcDebounceTimerId = null;
    }
    recalcDebounceTimerId = window.setTimeout(function () {
      recalcDebounceTimerId = null;
      recalcAndApply();
    }, delayMs);
  }

  function onVideoReady() {
    scheduleRecalc(0);
  }

  // ---- camera-initイベント ----

  function handleCameraInit(evt) {
    var detail = evt && evt.detail;
    var stream = detail && detail.stream;

    matchedVideo = findMatchingVideo(stream);
    displayCanvas = findDisplayCanvas();

    if (matchedVideo) {
      matchedVideo.addEventListener('loadedmetadata', onVideoReady);
      matchedVideo.addEventListener('canplay', onVideoReady);
    }

    // AR.js側が後からサイズを上書きする場合に備え、camera-init直後だけ
    // 即時・約100ms後・約400ms後の最大3回まで再適用する（常時繰り返す処理にはしない）
    window.setTimeout(recalcAndApply, 0);
    window.setTimeout(recalcAndApply, 100);
    window.setTimeout(recalcAndApply, 400);
  }

  window.addEventListener('camera-init', handleCameraInit);
  window.addEventListener('resize', function () {
    scheduleRecalc(150);
  });
  window.addEventListener('orientationchange', function () {
    scheduleRecalc(200);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      scheduleRecalc(150);
    });
    window.visualViewport.addEventListener('scroll', function () {
      scheduleRecalc(150);
    });
  }

  // ---- デバッグパネル（?fitDebug=1のときだけ） ----

  var debugOutputEl = null;

  function buildDebugText() {
    var viewport = getViewportRect();
    var videoRect = matchedVideo ? matchedVideo.getBoundingClientRect() : null;
    var canvasRect = displayCanvas ? displayCanvas.getBoundingClientRect() : null;

    var sourceAspect =
      matchedVideo && matchedVideo.videoHeight
        ? matchedVideo.videoWidth / matchedVideo.videoHeight
        : 'unsupported';
    var canvasAspect =
      canvasRect && canvasRect.height ? canvasRect.width / canvasRect.height : 'unsupported';
    var aspectDifference =
      typeof sourceAspect === 'number' && typeof canvasAspect === 'number'
        ? Math.abs(sourceAspect - canvasAspect)
        : 'unsupported';
    var positionDifference =
      videoRect && canvasRect
        ? {
            left: Math.round(videoRect.left - canvasRect.left),
            top: Math.round(videoRect.top - canvasRect.top)
          }
        : 'unsupported';

    var info = {
      isAndroid: isAndroid(),
      fitMode: fitMode,
      shouldApplyContain: shouldApplyContain,
      videoWidth: matchedVideo ? matchedVideo.videoWidth : 'unsupported',
      videoHeight: matchedVideo ? matchedVideo.videoHeight : 'unsupported',
      sourceAspect: sourceAspect,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      rectLeft: lastRect ? lastRect.left : 'unsupported',
      rectTop: lastRect ? lastRect.top : 'unsupported',
      rectWidth: lastRect ? lastRect.width : 'unsupported',
      rectHeight: lastRect ? lastRect.height : 'unsupported',
      videoBoundingClientRect: videoRect
        ? { left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height }
        : 'unsupported',
      canvasBoundingClientRect: canvasRect
        ? { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height }
        : 'unsupported',
      aspectDifference: aspectDifference,
      positionDifference: positionDifference
    };

    return JSON.stringify(info, null, 2);
  }

  function showFallbackTextarea(text, panel, afterEl) {
    var existing = panel.querySelector('textarea');
    if (existing) {
      existing.value = text;
      existing.focus();
      existing.select();
      return;
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    panel.insertBefore(textarea, afterEl);
    textarea.focus();
    textarea.select();
  }

  function copyDebugText(text, panel, afterEl) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(function () {
        showFallbackTextarea(text, panel, afterEl);
      });
    } else {
      showFallbackTextarea(text, panel, afterEl);
    }
  }

  function createDebugPanel() {
    var panel = document.createElement('div');
    panel.id = 'android-camera-fit-debug-panel';

    var title = document.createElement('h3');
    title.textContent = 'Camera Fit Debug';
    panel.appendChild(title);

    var pre = document.createElement('pre');
    pre.textContent = '計算待機中...';
    panel.appendChild(pre);

    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = '情報をコピー';
    copyButton.addEventListener('click', function () {
      copyDebugText(pre.textContent, panel, copyButton);
    });
    panel.appendChild(copyButton);

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '閉じる';
    closeButton.addEventListener('click', function () {
      panel.style.display = 'none';
    });
    panel.appendChild(closeButton);

    document.body.appendChild(panel);
    debugOutputEl = pre;
  }

  function updateDebugPanel() {
    if (!isFitDebugEnabled || !debugOutputEl) {
      return;
    }
    debugOutputEl.textContent = buildDebugText();
  }

  if (isFitDebugEnabled) {
    createDebugPanel();
    updateDebugPanel();
  }
})();
