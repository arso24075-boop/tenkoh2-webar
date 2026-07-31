// 衛星出現時にだけ再生する、控えめな光の粒子演出
// THREE.Points + BufferGeometryによる軽量なA-Frameカスタムコンポーネント
// カメラ・video・canvas・MediaStreamには一切アクセスしない

AFRAME.registerComponent('particle-convergence', {
  schema: {},

  init: function () {
    var PARTICLE_COUNT = 32;
    var TARGET = { x: 0, y: 0.90, z: 0 };

    this.particleCount = PARTICLE_COUNT;
    this.durationMs = 800;
    this.isPlaying = false;
    this.elapsedMs = 0;

    // 各粒子の初期位置（マーカー周辺の空間に散らす）と収束先を初期化時に保存する
    this.startPositions = new Float32Array(PARTICLE_COUNT * 3);
    this.targetPositions = new Float32Array(PARTICLE_COUNT * 3);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var idx = i * 3;
      this.startPositions[idx] = randomRange(-1.2, 1.2);
      this.startPositions[idx + 1] = randomRange(0.25, 1.35);
      this.startPositions[idx + 2] = randomRange(-1.0, 1.0);

      // 完全に同じ一点だと不自然に見えるため、収束先にごく小さなランダム差を付ける
      this.targetPositions[idx] = TARGET.x + randomRange(-0.03, 0.03);
      this.targetPositions[idx + 1] = TARGET.y + randomRange(-0.03, 0.03);
      this.targetPositions[idx + 2] = TARGET.z + randomRange(-0.03, 0.03);
    }

    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(this.startPositions);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    var material = new THREE.PointsMaterial({
      color: new THREE.Color(0xcfe8ff), // 白に近い淡い青
      size: 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.geometry = geometry;
    this.material = material;
    this.points = new THREE.Points(geometry, material);
    this.points.visible = false;
    this.el.setObject3D('particles', this.points);

    this.resetVisualState();

    var self = this;
    this.onPlay = function () { self.play(); };
    this.onReset = function () { self.resetVisualState(); };
    this.el.addEventListener('playParticles', this.onPlay);
    this.el.addEventListener('resetParticles', this.onReset);
  },

  play: function () {
    var posAttr = this.geometry.getAttribute('position');
    posAttr.array.set(this.startPositions);
    posAttr.needsUpdate = true;

    this.material.opacity = 0;
    this.points.visible = true;
    this.isPlaying = true;
    this.elapsedMs = 0;
  },

  resetVisualState: function () {
    this.isPlaying = false;
    this.elapsedMs = 0;
    this.points.visible = false;
    this.material.opacity = 0;

    var posAttr = this.geometry.getAttribute('position');
    posAttr.array.set(this.startPositions);
    posAttr.needsUpdate = true;
  },

  tick: function (time, timeDelta) {
    if (!this.isPlaying) {
      return;
    }

    this.elapsedMs += timeDelta;
    var t = this.elapsedMs;

    if (t >= this.durationMs) {
      this.resetVisualState();
      return;
    }

    // 透明度：控えめな最大値までにとどめる
    var MAX_OPACITY = 0.75;
    var opacityRatio;
    if (t < 100) {
      opacityRatio = easeOutCubic(t / 100);
    } else if (t < 500) {
      opacityRatio = 1;
    } else {
      opacityRatio = 1 - easeOutCubic((t - 500) / 300);
    }
    this.material.opacity = clamp(opacityRatio, 0, 1) * MAX_OPACITY;

    // 位置：周囲から衛星中心付近へ収束
    var convergeT = clamp((t - 100) / 500, 0, 1);
    var eased = easeOutCubic(convergeT);
    var posAttr = this.geometry.getAttribute('position');
    var arr = posAttr.array;
    for (var i = 0; i < this.particleCount; i++) {
      var idx = i * 3;
      arr[idx] = lerp(this.startPositions[idx], this.targetPositions[idx], eased);
      arr[idx + 1] = lerp(this.startPositions[idx + 1], this.targetPositions[idx + 1], eased);
      arr[idx + 2] = lerp(this.startPositions[idx + 2], this.targetPositions[idx + 2], eased);
    }
    posAttr.needsUpdate = true;
  },

  remove: function () {
    this.el.removeEventListener('playParticles', this.onPlay);
    this.el.removeEventListener('resetParticles', this.onReset);
    this.el.removeObject3D('particles');
    this.geometry.dispose();
    this.material.dispose();
  }
});

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t) {
  var p = t - 1;
  return p * p * p + 1;
}
