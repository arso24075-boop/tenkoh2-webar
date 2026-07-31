// Androidでカメラ映像がズームされて見える問題を調査するための診断スクリプト。
// ar-camera-android-test.htmlでのみ読み込む。
// 新しいgetUserMedia呼び出しは行わず、AR.jsのcamera-initイベント経由で
// 既存のMediaStreamのみを参照する。既存のカメラストリームは停止しない。

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var isDebugEnabled = params.get('cameraDebug') === '1';
  var isZoomFixEnabled = isDebugEnabled && params.get('zoomFix') === '1';

  // ?cameraDebug=1が無い場合は診断パネルを表示せず、何もしない
  if (!isDebugEnabled) {
    return;
  }

  var outputEl = null;
  var statusLineEl = null;

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

  function rectToPlainObject(rect) {
    if (!rect) {
      return 'unsupported';
    }
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom
    };
  }

  function collectScreenInfo() {
    var orientationInfo = 'unsupported';
    if (window.screen && window.screen.orientation) {
      orientationInfo = {
        type: safe(function () { return window.screen.orientation.type; }),
        angle: safe(function () { return window.screen.orientation.angle; })
      };
    }
    return {
      userAgent: navigator.userAgent,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      orientation: orientationInfo,
      isPortrait: window.innerHeight >= window.innerWidth
    };
  }

  function collectVideoInfo(video) {
    if (!video) {
      return 'unsupported';
    }
    var style = window.getComputedStyle(video);
    return {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      boundingClientRect: rectToPlainObject(safe(function () { return video.getBoundingClientRect(); }, null)),
      computedWidth: style.width,
      computedHeight: style.height,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      transform: style.transform
    };
  }

  function collectCanvasInfo(canvas) {
    if (!canvas) {
      return 'unsupported';
    }
    var style = window.getComputedStyle(canvas);
    return {
      width: canvas.width,
      height: canvas.height,
      boundingClientRect: rectToPlainObject(safe(function () { return canvas.getBoundingClientRect(); }, null)),
      computedWidth: style.width,
      computedHeight: style.height,
      transform: style.transform
    };
  }

  var SETTINGS_KEYS = ['width', 'height', 'aspectRatio', 'frameRate', 'facingMode', 'resizeMode', 'deviceId', 'zoom'];
  var CAPABILITIES_KEYS = ['width', 'height', 'aspectRatio', 'frameRate', 'facingMode', 'resizeMode', 'zoom'];

  function collectTrackInfo(track) {
    if (!track) {
      return 'unsupported';
    }

    var settings = safe(function () { return track.getSettings ? track.getSettings() : null; }, null);
    var capabilities = safe(function () {
      return typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
    }, null);
    var constraints = safe(function () { return track.getConstraints ? track.getConstraints() : null; }, null);

    return {
      settings: settings ? pick(settings, SETTINGS_KEYS) : 'unsupported',
      capabilities: capabilities ? pick(capabilities, CAPABILITIES_KEYS) : 'unsupported',
      constraints: constraints || 'unsupported'
    };
  }

  function getVideoEl() {
    return document.querySelector('video');
  }

  function getCanvasEl() {
    return document.querySelector('a-scene canvas') || document.querySelector('canvas');
  }

  function getVideoTrack(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') {
      return null;
    }
    var tracks = stream.getVideoTracks();
    return tracks && tracks.length > 0 ? tracks[0] : null;
  }

  function buildDiagnosticText(diagnostics) {
    return JSON.stringify(diagnostics, null, 2);
  }

  // ---- 診断パネルUI ----

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      '#android-camera-diagnostic-panel{position:fixed;left:12px;' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + 12px);' +
      'width:min(320px,calc(100vw - 24px));max-height:45vh;overflow-y:auto;' +
      'box-sizing:border-box;background:rgba(0,0,0,0.85);color:#fff;' +
      'font-family:monospace;font-size:11px;line-height:1.5;border-radius:10px;' +
      'padding:10px;z-index:99999;pointer-events:auto;}' +
      '#android-camera-diagnostic-panel h3{margin:0 0 6px;font-size:12px;}' +
      '#android-camera-diagnostic-panel pre{white-space:pre-wrap;word-break:break-all;' +
      'margin:6px 0;max-height:28vh;overflow-y:auto;}' +
      '#android-camera-diagnostic-panel textarea{width:100%;box-sizing:border-box;' +
      'height:100px;font-family:monospace;font-size:11px;}' +
      '#android-camera-diagnostic-panel button{margin:4px 4px 0 0;padding:6px 10px;' +
      'font-size:11px;border:none;border-radius:6px;background:#4d6b80;color:#fff;}' +
      '#android-camera-diagnostic-panel .android-camera-diagnostic-status{' +
      'margin-top:6px;opacity:0.9;}';
    document.head.appendChild(style);
  }

  function showFallbackTextarea(text, panel, statusLine) {
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
    panel.insertBefore(textarea, statusLine);
    textarea.focus();
    textarea.select();
    statusLine.textContent =
      'クリップボードが利用できないため、下のテキストを選択してコピーしてください';
  }

  function copyDiagnosticText(text, panel, statusLine) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          statusLine.textContent = 'コピーしました';
        })
        .catch(function () {
          showFallbackTextarea(text, panel, statusLine);
        });
    } else {
      showFallbackTextarea(text, panel, statusLine);
    }
  }

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'android-camera-diagnostic-panel';

    var title = document.createElement('h3');
    title.textContent = 'Android Camera Diagnostic';
    panel.appendChild(title);

    var pre = document.createElement('pre');
    pre.textContent = 'camera-initイベントを待機中...';
    panel.appendChild(pre);

    var statusLine = document.createElement('div');
    statusLine.className = 'android-camera-diagnostic-status';
    statusLine.textContent = isZoomFixEnabled
      ? 'zoomFix: 有効（条件を満たす場合のみ適用）'
      : 'zoomFix: 無効（?zoomFix=1で有効化）';
    panel.appendChild(statusLine);

    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = '情報をコピー';
    copyButton.addEventListener('click', function () {
      copyDiagnosticText(pre.textContent, panel, statusLine);
    });
    panel.appendChild(copyButton);

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'パネルを閉じる';
    closeButton.addEventListener('click', function () {
      panel.style.display = 'none';
    });
    panel.appendChild(closeButton);

    document.body.appendChild(panel);

    outputEl = pre;
    statusLineEl = statusLine;
    return panel;
  }

  // ---- ハードウェアズームを最小値へ戻す試み（zoomFix=1のときだけ） ----

  function tryFixZoom(track) {
    if (!isZoomFixEnabled) {
      return Promise.resolve(null);
    }
    if (!track || typeof track.getCapabilities !== 'function') {
      return Promise.resolve('Hardware zoom unsupported');
    }

    var capabilities = safe(function () { return track.getCapabilities(); }, null);
    var settings = safe(function () { return track.getSettings ? track.getSettings() : null; }, null);

    if (!capabilities || !capabilities.zoom || typeof capabilities.zoom.min !== 'number') {
      return Promise.resolve('Hardware zoom unsupported');
    }
    if (!settings || typeof settings.zoom !== 'number') {
      return Promise.resolve('Hardware zoom unsupported');
    }
    if (!(settings.zoom > capabilities.zoom.min)) {
      return Promise.resolve('Hardware zoom already minimum');
    }

    return track
      .applyConstraints({ advanced: [{ zoom: capabilities.zoom.min }] })
      .then(function () {
        return 'Hardware zoom applied (min=' + capabilities.zoom.min + ')';
      })
      .catch(function (err) {
        return 'applyConstraints failed: ' + (err && err.message ? err.message : String(err));
      });
  }

  // ---- camera-initイベントの処理 ----

  function handleCameraInit(evt) {
    var detail = evt && evt.detail;
    var stream = detail && detail.stream;

    if (!stream) {
      // event.detail.streamが無い場合は、既存video要素のsrcObjectから
      // AR.jsが取得済みの同じMediaStreamを参照する（新規取得はしない）
      var existingVideo = getVideoEl();
      stream = existingVideo ? existingVideo.srcObject : null;
    }

    var track = getVideoTrack(stream);

    var diagnostics = {
      screen: collectScreenInfo(),
      video: collectVideoInfo(getVideoEl()),
      canvas: collectCanvasInfo(getCanvasEl()),
      track: collectTrackInfo(track)
    };

    if (outputEl) {
      outputEl.textContent = buildDiagnosticText(diagnostics);
    }

    tryFixZoom(track)
      .then(function (message) {
        if (message && statusLineEl) {
          statusLineEl.textContent = message;
        }
      })
      .catch(function () {
        if (statusLineEl) {
          statusLineEl.textContent = 'ズーム処理中に予期しないエラーが発生しました';
        }
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    createPanel();
    window.addEventListener('camera-init', handleCameraInit);
  });
})();
