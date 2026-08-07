// マーカー追跡状態・出現アニメーション・モデル表示・関連UIを一元管理するスクリプト。
//
// 背景：markerFound/markerLostイベントだけに頼っていると、AR.js側がまれに
// イベントを取りこぼす（marker.object3D.visibleは正しく切り替わっているのに
// DOMイベントが発火しない）ケースがあり、モデルやUIが実際の追跡状態と
// 食い違ったまま固まってしまう不具合があった。
//
// 対策：markerFound/markerLostイベントに加えてmarker.object3D.visibleを
// 毎フレーム監視し、どちらの経路から来た情報でも同じ状態更新関数
// （handleTrackingChange）を通す。状態はstateオブジェクト1か所だけで管理し、
// UI更新・モデル表示・spawn処理の重複実装を作らない。

document.addEventListener('DOMContentLoaded', function () {
  var markerEl = document.querySelector('#debug-custom-marker');
  var spawnEl = document.querySelector('#satellite-spawn');
  var positionEl = document.querySelector('#satellite-position');
  var modelEl = document.querySelector('#satellite-model');
  var errorMessageEl = document.querySelector('#model-error-message');
  var statusPrimaryEl = document.querySelector('#ar-status-primary');
  var statusSecondaryEl = document.querySelector('#ar-status-secondary');

  if (!markerEl || !spawnEl || !positionEl) {
    console.error('spawn: 必須要素が見つかりません（marker / satellite-spawn / satellite-position）');
    return;
  }

  var SCALE_INITIAL = '0.85 0.85 0.85';
  var SCALE_COMPLETE = '1 1 1';
  var POSITION_INITIAL = '0 0.84 0';
  var POSITION_COMPLETE = '0 0.90 0';
  var RESET_DELAY_MS = 5000; // 5秒以上ロストしたら次回に出現演出を再生する
  var POLL_LOST_CONFIRM_MS = 250; // 1フレームだけの揺らぎでロスト扱いにしないための確認時間
  var BROKEN_STATE_CONFIRM_MS = 300; // モデル表示崩れを確定させるまでの継続時間
  var STATUS_LOST_TEXT = 'マーカーを\nもう一度映してください';

  // ---- 状態はこのオブジェクト1か所だけで管理する ----
  var state = {
    modelReady: false,
    isTracked: false,
    lostStartedAt: null,
    longLost: true, // 初回は「出現演出が必要な状態」として扱う
    spawnCompleted: false,
    lossTimer: null,
    lastMarkerEvent: 'none',
    lastActualVisibility: null,
    lastTransition: 'init',
    foundCount: 0,
    lostCount: 0,
    recoveryCount: 0
  };

  var pollLostConfirmTimerId = null;
  var brokenStateSince = null;

  // ---- ステータスUI更新（既存の#ar-status要素・CSSクラスをそのまま再利用する） ----

  function replayFade(el) {
    if (!el) {
      return;
    }
    el.classList.remove('ar-fade');
    void el.offsetWidth; // 強制リフローでアニメーションを再生させる
    el.classList.add('ar-fade');
  }

  function setStatusTracking() {
    if (!statusPrimaryEl || !statusSecondaryEl) {
      return;
    }
    statusPrimaryEl.textContent = 'てんこう2';
    statusSecondaryEl.textContent = '';
    var badge = document.createElement('span');
    badge.className = 'ar-status__badge';
    badge.textContent = '実寸大 1:1';
    statusSecondaryEl.appendChild(badge);
    replayFade(statusPrimaryEl);
    replayFade(statusSecondaryEl);
  }

  function setStatusLostGuidance() {
    if (!statusPrimaryEl || !statusSecondaryEl) {
      return;
    }
    statusPrimaryEl.textContent = STATUS_LOST_TEXT;
    statusSecondaryEl.textContent = '';
    replayFade(statusPrimaryEl);
    replayFade(statusSecondaryEl);
  }

  // ---- モデル・spawnの表示制御 ----

  function ensureModelVisible() {
    // マーカーのルート要素自体は触らない。子であるspawn/modelだけを保証する
    if (spawnEl.object3D) {
      spawnEl.object3D.visible = true;
    }
    if (modelEl && modelEl.object3D) {
      modelEl.object3D.visible = true;
    }
  }

  function restoreFinalState() {
    spawnEl.setAttribute('scale', SCALE_COMPLETE);
    positionEl.setAttribute('position', POSITION_COMPLETE);
    if (state.modelReady) {
      ensureModelVisible();
    }
    state.spawnCompleted = true;
  }

  function playSpawnAnimation() {
    state.spawnCompleted = false;
    spawnEl.emit('spawnSatellite');
    positionEl.emit('riseSatellite');
    // 出現アニメーション（position側が550msでscale側450msより長い）の完了を待つ
    positionEl.addEventListener('animationcomplete', function onSpawnAnimationComplete() {
      state.spawnCompleted = true;
    }, { once: true });
  }

  // ---- 追跡状態の遷移はこの2関数だけが行う ----

  function onTrackingLost(source) {
    state.lostStartedAt = Date.now();
    state.lastTransition = 'lost(' + source + ')';

    if (state.lossTimer !== null) {
      window.clearTimeout(state.lossTimer);
    }
    state.lossTimer = window.setTimeout(function () {
      state.lossTimer = null;
      if (state.isTracked) {
        // 5秒経過する前に復帰済みだった場合は何もしない
        return;
      }
      state.longLost = true;
      state.spawnCompleted = false;
      setStatusLostGuidance();
      state.lastTransition = 'longLost';
    }, RESET_DELAY_MS);
  }

  function onTrackingRecovered(source) {
    if (state.lossTimer !== null) {
      window.clearTimeout(state.lossTimer);
      state.lossTimer = null;
    }
    state.lostStartedAt = null;

    if (state.longLost) {
      // 5秒以上（または初回）のロストからの復帰：出現演出を1回だけ再生する
      state.longLost = false;
      playSpawnAnimation();
      state.lastTransition = 'longLost-recovered(' + source + ')';
    } else {
      // 5秒未満の短時間ロストからの復帰：演出を繰り返さず最終状態へ即復帰する
      restoreFinalState();
      state.lastTransition = 'quick-recovered(' + source + ')';
    }

    setStatusTracking();
  }

  // markerFoundイベント・markerLostイベント・object3D.visible監視は
  // すべて必ずこの関数を経由する（唯一の入口）。
  function handleTrackingChange(visible, source) {
    if (state.isTracked === visible) {
      return; // 既に同じ状態なら何もしない＝イベントと監視の二重実行を防止する
    }
    state.isTracked = visible;
    if (visible) {
      onTrackingRecovered(source);
    } else {
      onTrackingLost(source);
    }
  }

  // ---- markerFound / markerLostイベント（高速経路） ----

  markerEl.addEventListener('markerFound', function () {
    state.foundCount++;
    state.lastMarkerEvent = 'markerFound';
    handleTrackingChange(true, 'event');
  });

  markerEl.addEventListener('markerLost', function () {
    state.lostCount++;
    state.lastMarkerEvent = 'markerLost';
    handleTrackingChange(false, 'event');
  });

  // ---- marker.object3D.visibleの監視（イベント取りこぼしに対する安全網） ----

  function pollActualVisibility() {
    if (!markerEl.object3D) {
      return;
    }
    var current = markerEl.object3D.visible;
    if (current === state.lastActualVisibility) {
      return;
    }

    if (current === true) {
      state.lastActualVisibility = true;
      if (pollLostConfirmTimerId !== null) {
        window.clearTimeout(pollLostConfirmTimerId);
        pollLostConfirmTimerId = null;
      }
      handleTrackingChange(true, 'poll');
    } else if (pollLostConfirmTimerId === null) {
      // falseになった直後は即断せず、250ms後も継続していたら確定させる
      pollLostConfirmTimerId = window.setTimeout(function () {
        pollLostConfirmTimerId = null;
        if (markerEl.object3D && markerEl.object3D.visible === false) {
          state.lastActualVisibility = false;
          handleTrackingChange(false, 'poll');
        }
      }, POLL_LOST_CONFIRM_MS);
    }
  }

  // ---- モデル表示が崩れたまま固まっていないかの自動復旧 ----

  function checkForBrokenModelState() {
    if (!state.isTracked || !state.modelReady || !state.spawnCompleted) {
      // 出現アニメーション中やモデル未読み込み中は対象外（強制的に飛ばさない）
      brokenStateSince = null;
      return;
    }
    var modelHidden = !modelEl || !modelEl.object3D || modelEl.object3D.visible === false;
    var spawnHidden = !spawnEl.object3D || spawnEl.object3D.visible === false;
    var spawnScale = spawnEl.object3D ? spawnEl.object3D.scale.x : 1;
    var isBroken = modelHidden || spawnHidden || spawnScale < 0.05;

    if (!isBroken) {
      brokenStateSince = null;
      return;
    }
    if (brokenStateSince === null) {
      brokenStateSince = Date.now();
      return;
    }
    if (Date.now() - brokenStateSince >= BROKEN_STATE_CONFIRM_MS) {
      brokenStateSince = null;
      state.recoveryCount++;
      state.lastTransition = 'auto-recovery';
      restoreFinalState();
      setStatusTracking();
    }
  }

  function pollTick() {
    pollActualVisibility();
    checkForBrokenModelState();
    updateDebugPanel();
    window.requestAnimationFrame(pollTick);
  }
  window.requestAnimationFrame(pollTick);

  // ---- model-loaded / model-error ----

  if (modelEl) {
    modelEl.addEventListener('model-loaded', function () {
      state.modelReady = true;
      console.log('spawn: てんこう2モデルの読み込みに成功しました');

      if (!state.isTracked) {
        // マーカーが認識されていない間はモデルを画面上へ強制表示しない
        return;
      }
      if (state.spawnCompleted) {
        ensureModelVisible();
      } else if (state.longLost) {
        // 読み込み完了前にmarkerFoundが発生していた場合はここで出現させる
        state.longLost = false;
        playSpawnAnimation();
      } else {
        restoreFinalState();
      }
    });

    modelEl.addEventListener('model-error', function (evt) {
      console.error('spawn: てんこう2モデルの読み込みに失敗しました', evt.detail);
      if (errorMessageEl) {
        errorMessageEl.style.display = 'block';
      }
    });
  }

  // ---- デバッグパネル（?stateDebug=1のときだけ） ----

  var isStateDebugEnabled = new URLSearchParams(window.location.search).get('stateDebug') === '1';
  var debugPanelEl = null;
  var lastDebugUpdateAt = 0;

  function createDebugPanel() {
    var style = document.createElement('style');
    style.textContent =
      '#tracking-state-debug-panel{position:fixed;left:12px;' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + 12px);' +
      'width:min(300px,calc(100vw - 24px));max-height:50vh;overflow-y:auto;' +
      'box-sizing:border-box;background:rgba(0,0,0,0.85);color:#fff;' +
      'font-family:monospace;font-size:10px;line-height:1.5;border-radius:10px;' +
      'padding:10px;z-index:99999;pointer-events:none;white-space:pre-wrap;}';
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'tracking-state-debug-panel';
    panel.textContent = '状態を計算中...';
    document.body.appendChild(panel);
    debugPanelEl = panel;
  }

  function updateDebugPanel() {
    if (!isStateDebugEnabled || !debugPanelEl) {
      return;
    }
    var now = Date.now();
    if (now - lastDebugUpdateAt < 250) {
      return;
    }
    lastDebugUpdateAt = now;

    var lines = [
      'markerFound回数: ' + state.foundCount,
      'markerLost回数: ' + state.lostCount,
      '最後のマーカーイベント: ' + state.lastMarkerEvent,
      'marker.object3D.visible: ' + (markerEl.object3D ? markerEl.object3D.visible : 'unsupported'),
      'isTracked: ' + state.isTracked,
      'modelReady: ' + state.modelReady,
      'satellite-model.visible: ' + (modelEl && modelEl.object3D ? modelEl.object3D.visible : 'unsupported'),
      'satellite-spawn.visible: ' + (spawnEl.object3D ? spawnEl.object3D.visible : 'unsupported'),
      'satellite-spawn scale: ' + (spawnEl.object3D ? spawnEl.object3D.scale.x.toFixed(3) : 'unsupported'),
      'satellite-position Y: ' + (positionEl.object3D ? positionEl.object3D.position.y.toFixed(3) : 'unsupported'),
      'lostStartedAtからの経過: ' + (state.lostStartedAt ? now - state.lostStartedAt + 'ms' : 'unsupported'),
      'longLost: ' + state.longLost,
      'spawnCompleted: ' + state.spawnCompleted,
      '5秒タイマー: ' + (state.lossTimer !== null ? 'あり' : 'なし'),
      '最後の状態遷移: ' + state.lastTransition,
      '自動復旧の実行回数: ' + state.recoveryCount
    ];
    debugPanelEl.textContent = lines.join('\n');
  }

  if (isStateDebugEnabled) {
    createDebugPanel();
  }
});
