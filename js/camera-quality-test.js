// Androidスマートフォンのカメラ画質・ピント改善を検証するテスト用スクリプト。
// ar-camera-quality-test.htmlでのみ読み込む。
// 新しいgetUserMedia呼び出しは行わず、AR.jsのcamera-initイベント経由で
// 既存のMediaStreamのみを参照する。カメラストリームの停止・切り替えは行わない。
// video/canvasの表示CSS、Android用contain処理には一切触れない。

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var isQualityDebugEnabled = params.get('qualityDebug') === '1';

  var matchedVideo = null;
  var matchedTrack = null;
  var focusStatus = '未実行';
  var capabilitiesHasFocusMode = 'unsupported';

  var requestedConfig = window.cameraQualityTestRequestedConfig || null;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback === undefined ? 'unsupported' : fallback;
    }
  }

  function pick(source, keys) {
    var result = {};
    keys.forEach(function (key) {
      if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
        result[key] = source[key];
      } else {
        result[key] = 'unsupported';
      }
    });
    return result;
  }

  var SETTINGS_KEYS = ['width', 'height', 'aspectRatio', 'frameRate', 'facingMode', 'focusMode'];

  // ---- 要素取得（ページ内すべてのvideoへは適用しない） ----

  function findMatchingVideo(stream) {
    var videos = document.querySelectorAll('video');
    if (stream) {
      for (var i = 0; i < videos.length; i++) {
        if (videos[i].srcObject === stream) {
          return videos[i];
        }
      }
    }
    return videos.length === 1 ? videos[0] : null;
  }

  function getVideoTrack(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') {
      return null;
    }
    var tracks = stream.getVideoTracks();
    return tracks && tracks.length > 0 ? tracks[0] : null;
  }

  // ---- 連続オートフォーカス（対応端末のみ、例外は握りつぶしてARを継続） ----

  function tryEnableContinuousFocus(track) {
    if (!track || typeof track.getCapabilities !== 'function') {
      capabilitiesHasFocusMode = 'unsupported';
      focusStatus = '未対応（getCapabilitiesなし）';
      return;
    }

    var capabilities = safe(function () { return track.getCapabilities(); }, null);
    if (!capabilities || !capabilities.focusMode) {
      capabilitiesHasFocusMode = false;
      focusStatus = '未対応（focusModeなし）';
      return;
    }

    capabilitiesHasFocusMode = true;

    if (capabilities.focusMode.indexOf('continuous') === -1) {
      focusStatus = '未対応（continuous非対応）';
      return;
    }

    focusStatus = '適用中...';
    try {
      var result = track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      if (result && typeof result.then === 'function') {
        result
          .then(function () {
            focusStatus = '適用成功';
            updateDebugPanel();
          })
          .catch(function (err) {
            focusStatus = '適用失敗: ' + (err && err.message ? err.message : String(err));
            updateDebugPanel();
          });
      } else {
        focusStatus = '適用成功';
      }
    } catch (e) {
      focusStatus = '適用失敗: ' + (e && e.message ? e.message : String(e));
    }
  }

  // ---- camera-initイベント ----

  function handleCameraInit(evt) {
    var detail = evt && evt.detail;
    var stream = detail && detail.stream;

    matchedVideo = findMatchingVideo(stream);
    if (!stream && matchedVideo) {
      stream = matchedVideo.srcObject;
    }
    matchedTrack = getVideoTrack(stream);

    tryEnableContinuousFocus(matchedTrack);
    updateDebugPanel();
  }

  window.addEventListener('camera-init', handleCameraInit);

  // ---- 簡易FPS計測（requestAnimationFrame、約500msごとに表示更新、setIntervalは未使用） ----

  var fpsFrameCount = 0;
  var fpsLastSampleTime = null;
  var currentFps = 'unsupported';

  function fpsTick(timestamp) {
    if (fpsLastSampleTime === null) {
      fpsLastSampleTime = timestamp;
    }
    fpsFrameCount++;
    var elapsed = timestamp - fpsLastSampleTime;
    if (elapsed >= 500) {
      currentFps = Math.round((fpsFrameCount * 1000) / elapsed);
      fpsFrameCount = 0;
      fpsLastSampleTime = timestamp;
      updateDebugPanel();
    }
    window.requestAnimationFrame(fpsTick);
  }

  if (isQualityDebugEnabled) {
    window.requestAnimationFrame(fpsTick);
  }

  // ---- 診断パネル（?qualityDebug=1のときだけ） ----

  var debugOutputEl = null;

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      '#camera-quality-debug-panel{position:fixed;left:12px;' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + 12px);' +
      'width:min(300px,calc(100vw - 24px));max-height:50vh;overflow-y:auto;' +
      'box-sizing:border-box;background:rgba(0,0,0,0.85);color:#fff;' +
      'font-family:monospace;font-size:10px;line-height:1.5;border-radius:10px;' +
      'padding:10px;z-index:99999;pointer-events:auto;}' +
      '#camera-quality-debug-panel h3{margin:0 0 6px;font-size:11px;}' +
      '#camera-quality-debug-panel pre{white-space:pre-wrap;word-break:break-all;' +
      'margin:6px 0;max-height:32vh;overflow-y:auto;}' +
      '#camera-quality-debug-panel textarea{width:100%;box-sizing:border-box;' +
      'height:90px;font-family:monospace;font-size:10px;}' +
      '#camera-quality-debug-panel button{margin:4px 4px 0 0;padding:6px 10px;' +
      'font-size:11px;border:none;border-radius:6px;background:#4d6b80;color:#fff;}';
    document.head.appendChild(style);
  }

  function buildDebugText() {
    var settings = matchedTrack ? safe(function () { return matchedTrack.getSettings(); }, null) : null;
    var settingsPicked = settings ? pick(settings, SETTINGS_KEYS) : 'unsupported';

    var info = {
      videoWidth: matchedVideo ? matchedVideo.videoWidth : 'unsupported',
      videoHeight: matchedVideo ? matchedVideo.videoHeight : 'unsupported',
      trackSettings: settingsPicked,
      capabilitiesHasFocusMode: capabilitiesHasFocusMode,
      continuousFocusStatus: focusStatus,
      requestedSourceWidth: requestedConfig ? requestedConfig.sourceWidth : 'unsupported',
      requestedSourceHeight: requestedConfig ? requestedConfig.sourceHeight : 'unsupported',
      requestedCanvasWidth: requestedConfig ? requestedConfig.canvasWidth : 'unsupported',
      requestedCanvasHeight: requestedConfig ? requestedConfig.canvasHeight : 'unsupported',
      fps: currentFps,
      userAgent: navigator.userAgent
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
    panel.id = 'camera-quality-debug-panel';

    var title = document.createElement('h3');
    title.textContent = 'Camera Quality Debug';
    panel.appendChild(title);

    var pre = document.createElement('pre');
    pre.textContent = 'camera-initイベントを待機中...';
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
    if (!isQualityDebugEnabled || !debugOutputEl) {
      return;
    }
    debugOutputEl.textContent = buildDebugText();
  }

  if (isQualityDebugEnabled) {
    injectStyles();
    createDebugPanel();
    updateDebugPanel();
  }
})();
