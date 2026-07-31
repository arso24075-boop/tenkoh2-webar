// Web起動時のオープニング画面（index.htmlのみ）。
// 既存のトップ画面のイベントリスナーやwindow.onloadには一切触れない。
// setIntervalは使用せず、すべてclearTimeout可能なsetTimeoutで管理する。

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var STORAGE_KEY = 'tenkoh2-opening-intro-shown-v1';
    var TEXT = 'さあ、未来を実行しよう。';

    var introEl = document.getElementById('opening-intro');
    var charsContainer = document.getElementById('opening-intro-chars');

    if (!introEl || !charsContainer) {
      console.error('opening-intro: 必須要素が見つかりません（opening-intro / opening-intro-chars）');
      return;
    }

    var BASE_INTERVAL_MS = 70; // 通常の1文字の表示間隔
    var COMMA_PAUSE_MS = 250; // 「、」の後の追加の間
    var PERIOD_PAUSE_MS = 350; // 「。」の後の追加の間
    var HOLD_MS = 650; // 全文表示後の静止時間
    var FADE_NORMAL_MS = 450; // 通常のフェードアウト時間
    var FADE_SHORT_MS = 250; // スキップ・モーション軽減時の短いフェード時間
    var REDUCED_HOLD_MS = 300; // モーション軽減時の表示時間
    var SKIP_GUARD_MS = 300; // 誤タップ防止のためスキップを無効にする時間
    var SAFETY_FALLBACK_MS = 6000; // JS処理が完了しない場合の安全用フォールバック

    var pendingTimers = [];
    var safetyTimerId = null;
    var isFadingOut = false;
    var isHidden = false;
    var canSkip = false;

    function addTimer(fn, delay) {
      var id = window.setTimeout(fn, delay);
      pendingTimers.push(id);
      return id;
    }

    function clearPendingTimers() {
      for (var i = 0; i < pendingTimers.length; i++) {
        window.clearTimeout(pendingTimers[i]);
      }
      pendingTimers = [];
    }

    function onKeydown(evt) {
      if (evt.key === 'Escape' || evt.key === 'Esc') {
        onSkip();
      }
    }

    function hideIntroImmediately() {
      if (isHidden) {
        return;
      }
      isHidden = true;
      clearPendingTimers();
      if (safetyTimerId !== null) {
        window.clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
      introEl.style.display = 'none';
      introEl.setAttribute('aria-hidden', 'true');
      introEl.removeEventListener('click', onSkip);
      document.removeEventListener('keydown', onKeydown);
    }

    function finishWithFade(durationMs) {
      if (isFadingOut || isHidden) {
        return;
      }
      isFadingOut = true;
      clearPendingTimers();
      introEl.style.setProperty('--opening-fade-ms', durationMs + 'ms');
      introEl.classList.add('opening-intro--fade-out');
      addTimer(function () {
        hideIntroImmediately();
      }, durationMs);
    }

    function onSkip() {
      if (!canSkip || isFadingOut || isHidden) {
        return;
      }
      // 残っている文字表示用タイマーを解除し、残りの文字を即座にすべて表示する
      clearPendingTimers();
      var spans = charsContainer.querySelectorAll('.opening-char');
      for (var i = 0; i < spans.length; i++) {
        spans[i].classList.add('opening-char--visible');
      }
      finishWithFade(FADE_SHORT_MS);
    }

    function prefersReducedMotion() {
      return (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }

    function getCharacters(text) {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        try {
          var segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
          var characters = [];
          var iterator = segmenter.segment(text)[Symbol.iterator]();
          var next = iterator.next();
          while (!next.done) {
            characters.push(next.value.segment);
            next = iterator.next();
          }
          return characters;
        } catch (e) {
          return Array.from(text);
        }
      }
      return Array.from(text);
    }

    function buildCharSpans(characters) {
      charsContainer.textContent = '';
      var spans = [];
      for (var i = 0; i < characters.length; i++) {
        var span = document.createElement('span');
        span.className = 'opening-char';
        span.textContent = characters[i];
        charsContainer.appendChild(span);
        spans.push(span);
      }
      return spans;
    }

    function extraPauseFor(char) {
      if (char === '、') {
        return COMMA_PAUSE_MS;
      }
      if (char === '。') {
        return PERIOD_PAUSE_MS;
      }
      return 0;
    }

    function playReducedMotion(characters) {
      var spans = buildCharSpans(characters);
      for (var i = 0; i < spans.length; i++) {
        spans[i].classList.add('opening-char--visible');
      }
      addTimer(function () {
        finishWithFade(FADE_SHORT_MS);
      }, REDUCED_HOLD_MS);
    }

    function playFullAnimation(characters) {
      var spans = buildCharSpans(characters);
      var delay = 0;
      characters.forEach(function (char, index) {
        addTimer(function () {
          spans[index].classList.add('opening-char--visible');
        }, delay);
        delay += BASE_INTERVAL_MS + extraPauseFor(char);
      });
      addTimer(function () {
        finishWithFade(FADE_NORMAL_MS);
      }, delay + HOLD_MS);
    }

    function startIntro(isForced) {
      if (!isForced) {
        try {
          window.sessionStorage.setItem(STORAGE_KEY, 'true');
        } catch (e) {
          // sessionStorageが使用できない環境では何もしない（再生自体は継続する）
        }
      }

      introEl.addEventListener('click', onSkip);
      document.addEventListener('keydown', onKeydown);
      addTimer(function () {
        canSkip = true;
      }, SKIP_GUARD_MS);

      // 通常のアニメーション時間より十分長い安全用フォールバック。
      // 通常処理が完了（hideIntroImmediately）すれば解除される。
      safetyTimerId = window.setTimeout(function () {
        safetyTimerId = null;
        hideIntroImmediately();
      }, SAFETY_FALLBACK_MS);

      var characters = getCharacters(TEXT);
      if (prefersReducedMotion()) {
        playReducedMotion(characters);
      } else {
        playFullAnimation(characters);
      }
    }

    // ---- 初期判定 ----
    var params = new URLSearchParams(window.location.search);
    var isForced = params.get('intro') === '1';
    var alreadyShown = false;

    if (!isForced) {
      try {
        alreadyShown = window.sessionStorage.getItem(STORAGE_KEY) === 'true';
      } catch (e) {
        alreadyShown = false;
      }
    }

    if (alreadyShown) {
      hideIntroImmediately();
      return;
    }

    startIntro(isForced);
  });
})();
