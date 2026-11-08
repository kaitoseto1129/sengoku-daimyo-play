import * as THREE from 'three';
import { WIND_STATE } from './world_weather.js';
import { EffectSprites } from './effect_sprites.js';
import { S as SETTINGS } from './settings.js';
import { SMOKE_SOOT } from './world_common.js';


export class WorldSmoke {

  // ---------------- 立ち昇る煙（村の炊事・陣の鍋） ----------------
  // 粒は毎秒十五回動かし、描く時は前後の位置を補間する。
  buildSmokeColumns() {
    if (this.smokeCol) return;
    // 近くは二十四層、中景は白煙六層・黒煙十二層、遠くは一枚の煙柱にする。
    const CAP = 48, PER = 24;   // 11/5 十六粒では粒の間が空いて、柱が丸い玉の列に見えた（夜の燃える家）。点の数だけ増え、描く回数は一回のまま
    const pos = new Float32Array(CAP * PER * 3), seed = new Float32Array(CAP * PER * 2), soot = new Float32Array(CAP * PER);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
    geo.setAttribute('soot', new THREE.BufferAttribute(soot, 1));
    const drift = new Float32Array(CAP * PER * 4), lastDrift = new Float32Array(drift.length), lane = new Float32Array(CAP * PER);
    for (let i = 0; i < lane.length; i++) lane[i] = i % PER;
    geo.setAttribute('drift', new THREE.BufferAttribute(drift, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('lastDrift', new THREE.BufferAttribute(lastDrift, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('lane', new THREE.BufferAttribute(lane, 1));
    geo.setDrawRange(0, 0);
    if (!this.puffTex) this.makePuffTex();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.puffTex }, uBlend: { value: 0 }, uNight: { value: 0 }, farStart: { value: 14400 }, color: { value: new THREE.Color(0x9a958c) }, scale: { value: 420 }, wind: { value: new THREE.Vector2(WIND_STATE.dirX, WIND_STATE.dirZ) }, ...this.smokeBook() },
      vertexShader: `attribute vec2 seed; attribute float soot, lane; attribute vec4 drift, lastDrift; uniform float uBlend, scale, farStart; uniform vec2 wind; varying float vA; varying float vSoot; varying float vAge;
        void main(){
          vSoot = soot;
          vec3 delta = position - cameraPosition;
          float distanceSq = dot(delta, delta);
          if(distanceSq >= farStart || (distanceSq >= 2025.0 && soot < 0.5 && mod(lane, 2.0) > 0.5)) {   // 11/8 黒煙は中景でも全粒（間が空いて縦に並ぶ黒い玉に見えた。critic60 長島 四6）
             // 中景は白煙を四粒に一つ・黒煙を二粒に一つ（粒を 24 に増やした分、描く量を前と同じほどに保つ）
            vA = 0.0; gl_PointSize = 1.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
          }
          // 粒が根元へ戻る時は、柱を横切る線を補間しない。
          vec4 pose = mix(lastDrift, drift, lastDrift.w > drift.w ? 1.0 : uBlend);
          float t = pose.w;
          vAge = t;
          vec3 p = position + pose.xyz;
          vA = smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // カメラのすぐ前の粒は消す（目の前に光った綿の塊が貼り付いて人や家を隠さない）
          // 中景は三粒に一つだけ描く。粒の大きさが同じままだと、間の空いた丸い玉の列に見えた（長島の黒煙 10/30）。
          // 残す粒を大きくして重ね、柱の形につなぐ（濃さは重なりで保つ）。
          float midK = distanceSq >= 2025.0 ? (soot < 0.5 ? 1.0 : 0.45) : 0.0;   // 中景で残す粒を大きくして柱につなぐ（黒煙は二粒に一つなので少しだけ）
          vA *= smoothstep(3.0, 12.0, -mv.z) * (1.0 + midK * 0.15);
          // 11/5 根元の粒も上下の間（一粒 1m×太さ）より大きく重ねる。前は 0.8 で、黒煙が間の空いた丸い玉の列に見えた（夜の燃える家）
          gl_PointSize = (2.2 + t * 5.0) * seed.y * scale / -mv.z * (1.0 + midK * 0.8);
          gl_Position = projectionMatrix * mv;
        }`,
      // 煙の連番の絵（world_haze.js の smokeBook）が届いたら、昇るほど膨らんでちぎれるコマを選ぶ
      fragmentShader: `uniform sampler2D map, book; uniform vec3 color; uniform float uBook, uNight; varying float vA; varying float vSoot; varying float vAge;
        void main(){
          float a = texture2D(map, gl_PointCoord).a; float lit = 1.0;
          if (uBook > 0.5) {
            float f = clamp(vAge, 0.0, 1.0) * 15.0, f0 = floor(f), f1 = min(f0 + 1.0, 15.0);
            vec2 pc = gl_PointCoord;
            vec2 lu = clamp(vec2(pc.x, 1.0 - pc.y), 0.02, 0.98) * 0.25;
            vec4 s = mix(texture2D(book, lu + vec2(mod(f0, 4.0), 3.0 - floor(f0 / 4.0)) * 0.25), texture2D(book, lu + vec2(mod(f1, 4.0), 3.0 - floor(f1 / 4.0)) * 0.25), f - f0);
            a = s.a / (1.0 - 0.55 * vAge * vAge) * 0.85; lit = 0.7 + 0.45 * s.r;
          }
          // 夜の火事の黒煙は、根元ほど下の炎に照らされて橙に光る（写真の夜の火事。黒い玉が夜空に浮かない）
          vec3 c = mix(color, vec3(0.065, 0.058, 0.052), vSoot) * lit + vec3(0.2, 0.075, 0.02) * vSoot * uNight * (1.0 - smoothstep(0.02, 0.3, vAge));
          gl_FragColor = vec4(c, a * vA * mix(0.42, 0.62, vSoot) * 0.8); if (gl_FragColor.a < 0.004) discard; }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    // 遠景用の柱は準備時に絵へ重ね焼きし、本番は一枚だけ塗る。
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const t = i / 16, x = 32 + Math.sin(i * 2.4) * t * 9, y = 119 - t * 106, r = 5 + t * 22;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.26 * (1 - t)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 128);
    }
    const far = new EffectSprites(this.scene, new THREE.CanvasTexture(canvas), CAP);
    this.smokeCol = { pts, pos, seed, soot, drift, lastDrift, far, levels: new Uint8Array(CAP).fill(3), acc: 0, clock: 0, n: 0, CAP, PER };
  }

  // 煙の柱を足す（x, y, z は煙の出る所）。o.size で太さ
  addSmokeColumn(x, y, z, o = {}) {
    if (!this.smokeCol) this.buildSmokeColumns();
    const S = this.smokeCol;
    if (S.n >= S.CAP) return null;
    const i0 = S.n * S.PER, ph = Math.random();
    for (let k = 0; k < S.PER; k++) {
      const i = i0 + k;
      S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z;
      S.seed[i * 2] = ph + (k + (Math.random() - .5) * .9) / S.PER; S.seed[i * 2 + 1] = o.size || 1;   // 11/8 等間隔の玉の列にしない
      S.soot[i] = o.black ? 1 : 0;
    }
    const sprite = S.far.add(this.scene);
    sprite.position.set(x, y + 7 * (o.size || 1), z);
    sprite.scale.set(9 * (o.size || 1), 18 * (o.size || 1), 1);
    sprite.userData.color = new THREE.Color();
    S.n++;
    const g = S.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.seed.needsUpdate = true;
    g.attributes.soot.needsUpdate = true;
    g.setDrawRange(0, S.n * S.PER);
    return S.n - 1;
  }

  // 手持ちの小さな煙だけ発生元を追わせる。粒と属性の入れ物は作り直さない。
  moveSmokeColumn(id, x, y, z) {
    const S = this.smokeCol;
    if (!S || id == null || id < 0 || id >= S.n) return;
    for (let k = 0; k < S.PER; k++) {
      const i = (id * S.PER + k) * 3;
      S.pos[i] = x; S.pos[i + 1] = y; S.pos[i + 2] = z;
    }
    S.far.list[id].position.set(x, y + 7 * S.seed[id * S.PER * 2 + 1], z);
    S.pts.geometry.attributes.position.needsUpdate = true;
  }

  // 煙の柱を消す（addSmokeColumn の返り値を渡す）
  removeSmokeColumn(id) {
    const S = this.smokeCol;
    if (!S || id == null) return;
    if (id < 0 || id >= S.n) return;
    S.far.list[id].visible = false;
    for (let k = 0; k < S.PER; k++) S.pos[(id * S.PER + k) * 3 + 1] = -9999;
    S.pts.geometry.attributes.position.needsUpdate = true;
  }


  updateSmokeColumns(dt) {
    const S = this.smokeCol, camera = this.camRef, tick = 1 / 15;
    if (!S.n) return;
    // 熱の兆しがあれば中景の六粒を一枚へ。四十五歩以内の煙と兵の見た目は保つ。
    const farStart = (window.__heatBackgroundLevel || window.__heatLevel || 0) >= 1 ? 2025 : 14400;
    S.pts.material.uniforms.farStart.value = farStart;
    S.acc += dt;
    const steps = Math.floor(S.acc / tick);
    S.acc -= steps * tick;
    if (!SETTINGS.reduceMotion) S.clock += steps * tick;
    S.pts.material.uniforms.uBlend.value = S.acc / tick;
    S.pts.material.uniforms.uNight.value = this.timeKey === 'night' ? 1 : this.timeKey === 'dusk' ? 0.5 : 0;
    let before = 0, after = 0, farCount = 0, changed = false;
    for (let id = 0; id < S.n; id++) {
      const i = id * S.PER, j = i * 3, sp = S.far.list[id];
      const active = S.pos[j + 1] > -9000;
      const d2 = camera ? (S.pos[j] - camera.position.x) ** 2 + (S.pos[j + 1] - camera.position.y) ** 2 + (S.pos[j + 2] - camera.position.z) ** 2 : 0;
      const level = !active || d2 >= farStart ? 2 : d2 >= 2025 ? 1 : 0;
      const switched = level !== S.levels[id]; S.levels[id] = level;
      // 描かない遠景の十六粒は動かさず、中景も残す六粒だけを計算する。
      if (level < 2 && (steps || switched)) {
        for (let k = 0; k < S.PER; k += level && !S.soot[i] ? 2 : 1) {
          const at = i + k, q = at * 4, phase = S.seed[at * 2], size = S.seed[at * 2 + 1];
          // 通常は前回の結果を使い、形の切替時だけ前の刻みも求め直す。
          const both = switched || steps > 1;
          if (!both) for (let c = 0; c < 4; c++) S.lastDrift[q + c] = S.drift[q + c];
          for (let endpoint = both ? 0 : 1; endpoint < 2; endpoint++) {
            const pose = endpoint ? S.drift : S.lastDrift;
            const clock = !endpoint && !SETTINGS.reduceMotion ? Math.max(0, S.clock - tick) : S.clock;
            const t = (clock * 0.045 + phase) % 1;
            pose[q] = WIND_STATE.dirX * WIND_STATE.gust * t * t * 12 * size + Math.sin(t * 9 + phase * 30) * (0.4 + 0.5 * size) * t;
            pose[q + 1] = t * 16 * size;
            pose[q + 2] = WIND_STATE.dirZ * WIND_STATE.gust * t * t * 12 * size + Math.cos(t * 7 + phase * 20) * (0.4 + 0.5 * size) * t;
            pose[q + 3] = t;
          }
        }
        changed = true;
      }
      sp.visible = active && level === 2;
      if (active) { before += S.PER; after += level === 0 ? S.PER : level === 1 ? S.PER / (S.soot[i] ? 1 : 2) : 1; }   // 11/8 critic60 箕作（八1）：白煙も中景で二粒に一つ（四粒に一つでは空に灰色の輪が一列に並んだ）
      if (sp.visible) {
        farCount++;
        sp.userData.color.copy(S.pts.material.uniforms.color.value).lerp(SMOKE_SOOT, S.soot[i]);
        const size = S.seed[i * 2 + 1];
        sp.position.x = S.pos[j] + WIND_STATE.dirX * WIND_STATE.gust * size * 3;
        sp.position.z = S.pos[j + 2] + WIND_STATE.dirZ * WIND_STATE.gust * size * 3;
      }
    }
    if (changed) S.pts.geometry.attributes.drift.needsUpdate = S.pts.geometry.attributes.lastDrift.needsUpdate = true;
    S.pts.visible = after > farCount;
    S.far.mesh.visible = farCount > 0;
    S.pts.userData.layersBefore = before; S.pts.userData.layersAfter = after;
  }
}
