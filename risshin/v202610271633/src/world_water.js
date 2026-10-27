import { macroTex } from './nature.js';
import { S as SETTINGS } from './settings.js';
import { WIND } from './world_weather.js';
import * as THREE from 'three';
import { SEG, NO_STREAMS, distToPolyline, fordLift, rng } from './world_common.js';
import { liteMat } from './world_vegetation_materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 水面のさざ波：流れに沿って動く二枚の濃淡から面の向きを揺らし、空の映り込みを細かく砕く（のっぺりした一枚の板に見えないように）
export function rippleWater(mat, fx, fz, amt = 3.5, sky = null, localFlow = false, banks = null, fireReflections = null, sediment = false, lake = false) {
  // 濁った川は水面で深さを書き、浸かった脚を水の線で隠す。
  mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
  const lowWater = false;
  // 流れの向きごとに別の作り（同じ字面の関数だと、先の川の向きが使い回される）
  mat.customProgramCacheKey = () => `ripple|${fx.toFixed(3)}|${fz.toFixed(3)}|${amt}|${localFlow}|${!!banks}|${lowWater}|${!!fireReflections}|${sediment}|${lake}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tMacro = { value: macroTex() };
    sh.uniforms.uTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } };
    sh.uniforms.uWaterSky = { value: sky || new THREE.Color(0x71838b) };
    if (banks) sh.uniforms.uWaterBanks = { value: banks };
    if (fireReflections) sh.uniforms.uWaterFires = { value: fireReflections };
    sh.vertexShader = 'varying vec3 vWPw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (localFlow) sh.vertexShader = 'attribute vec2 waterFlow; varying vec2 vWaterFlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterFlow = waterFlow;');
    sh.fragmentShader = 'uniform sampler2D tMacro; uniform float uTime; uniform vec3 uWaterSky; varying vec3 vWPw;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 fl = ${localFlow ? 'normalize(vWaterFlow + vec2(0.00001))' : `vec2(${fx.toFixed(3)}, ${fz.toFixed(3)})`};
        vec2 q1 = vWPw.xz * vec2(0.3, 0.3) - fl * uTime * 0.09;
        vec2 q2 = vWPw.xz * vec2(0.8, 0.8) - (${sediment ? 'fl * uTime * 0.18' : 'fl.yx * uTime * 0.03 + fl * uTime * 0.15'});
        float e = 0.02;
        float h0 = texture2D(tMacro, q1).r ${lowWater ? '' : '+ texture2D(tMacro, q2).r * 0.5'};
        float hx = texture2D(tMacro, q1 + vec2(e, 0.0)).r ${lowWater ? '' : '+ texture2D(tMacro, q2 + vec2(e, 0.0)).r * 0.5'};
        float hz = texture2D(tMacro, q1 + vec2(0.0, e)).r ${lowWater ? '' : '+ texture2D(tMacro, q2 + vec2(0.0, e)).r * 0.5'};
        vec3 bw = vec3(-(hx - h0), 0.0, -(hz - h0)) * ${amt.toFixed(2)};
        normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
      }`).replace('#include <map_fragment>', `#include <map_fragment>
      ${lake ? '' : `// 川筋に沿う長い明暗。湖面では使わず、風波と空の映りを残す。
      vec2 streamDir = ${localFlow ? 'normalize(vWaterFlow + vec2(0.00001))' : `vec2(${fx.toFixed(3)}, ${fz.toFixed(3)})`};
      float streamAlong = dot(vWPw.xz, streamDir);
      float streamAcross = dot(vWPw.xz, vec2(-streamDir.y, streamDir.x));
      float streamLines = sin(streamAcross * 4.8 + sin(streamAlong * 0.22 - uTime * 0.8) * 0.7);
      float streamNear = 1.0 - smoothstep(25.0, 85.0, length(vWPw - cameraPosition));
      diffuseColor.rgb *= 1.0 + streamLines * streamNear * 0.065;`}
      `).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      ${mat.isMeshLambertMaterial ? `// 携帯でも空の色と雲の濃淡を水面へ映す。描き直しは足さない。
      vec3 waterView = normalize(cameraPosition - vWPw);
      float waterEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      // 波で変えた面の向きで空を砕く。軽い材質は頂点で照らすため、法線を揺らすだけでは波が見えない。
      vec3 waveNormal = transpose(mat3(viewMatrix)) * normal;
      vec2 skyUV = vWPw.xz * 0.018 + waterView.xz * 0.6 + waveNormal.xz * 0.45;
      float skyCloud = texture2D(tMacro, skyUV).r;
      reflectedLight.indirectDiffuse += uWaterSky * (0.08 + waterEdge * 0.3) * (0.7 + skyCloud * 0.3);` : ''}`);
    if (fireReflections) {
      // 水面自身へ火を映す。三つの入れ物を使い回し、板や描画を増やさない。
      sh.fragmentShader = 'uniform vec4 uWaterFires[3];\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        for (int i = 0; i < 3; i++) {
          vec4 fire = uWaterFires[i];
          vec2 delta = vWPw.xz - fire.xy;
          vec2 axis = normalize(cameraPosition.xz - fire.xy + vec2(0.0001));
          float along = dot(delta, axis);
          float across = dot(delta, vec2(-axis.y, axis.x));
          float wave = sin(vWPw.z * 10.0 + vWPw.x * 3.0 - uTime * 2.0);
          float stripe = exp(-across * across / 5.0 - along * along / 85.0);
          stripe *= 1.0 - smoothstep(12.0, 18.0, length(delta));
          reflectedLight.indirectDiffuse += vec3(1.0, 0.254, 0.042) * stripe * fire.z * (0.55 + 0.45 * wave * wave);
        }`);
    }
    if (sediment) {
      sh.vertexShader = 'attribute vec2 waterBed; varying vec2 vWaterBed;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterBed = waterBed;');
      sh.fragmentShader = 'varying vec2 vWaterBed;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        // 実際の川床から測った深さで砂の透けと雪解けの濁りを分ける。
        float bedNoise = texture2D(tMacro, vWPw.xz * 0.7).r;
        float bedDepth = max(0.0, vWaterBed.x);
        vec3 sand = vec3(0.55, 0.50, 0.40) * (0.82 + bedNoise * 0.24);
        diffuseColor.rgb = mix(sand, vec3(0.25, 0.33, 0.28), smoothstep(0.2, 0.6, bedDepth));
        // 両岸一メートルの泡。川幅方向は符号を残し、中央へ泡を広げない。
        float bankDistance = ${sediment.toFixed(2)} - abs(vWaterBed.y);
        float foamNoise = texture2D(tMacro, vWPw.xz * 0.6 - normalize(vWaterFlow + vec2(0.00001)) * uTime * 0.22).r;
        float foam = (1.0 - smoothstep(0.05, 1.0, bankDistance)) * smoothstep(0.32, 0.72, foamNoise);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.84, 0.75), foam * 0.65);
      `);
    }
    if (localFlow) sh.fragmentShader = 'varying vec2 vWaterFlow;\n' + sh.fragmentShader;
    if (banks) {
      // 別の直線の泥板を重ねず、水面自身に岸の濁りと入り江のむらを付ける。
      sh.fragmentShader = 'uniform vec2 uWaterBanks;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float bankNoise = texture2D(tMacro, vWPw.xz * 0.065).r;
        float bankDist = min(vWPw.x - uWaterBanks.x, uWaterBanks.y - vWPw.x);
        float bankEdge = bankDist + (bankNoise - 0.5) * 2.6;
        float shallow = 1.0 - smoothstep(0.0, 7.0, bankEdge);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.16, 0.095), shallow * 0.55);
        if (bankEdge < 0.0) discard;`);
    }
  };
  return mat;
}


export class WorldWater {
  splatIdx(x, z) {
    const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
    if (i < 0 || j < 0 || i > SEG || j > SEG) return -1;
    return j * (SEG + 1) + i;
  }


  // (x, z) が水の中か（小川・川・水田）
  inWaterAt(x, z, y) {
    if (y != null) return this.waterFootDepthAt(x, z, y) > 0.02;
    const d = this.def;
    for (const st of d.streams || NO_STREAMS) if (st.pts && distToPolyline(x, z, st.pts) < st.w && this.waterDepthAt(x, z) > 0.02) return true;
    const W = d.water;
    if (W && x > W.x && x < (W.x2 ?? 1e9) && this.heightAt(x, z) < (W.level ?? -99) + 0.3) return true;
    return (this.field.wet && !!(d.paddy && d.paddy(x, z) > 0.55)) || this.villageWaterDepthAt(x, z) > 0.02;
  }

  villageWaterDepthAt(x, z) {
    let depth = 0;
    for (const f of this.villageFields) {
      if (!f.wet) continue;
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx * f.c - dz * f.s) < f.w / 2 && Math.abs(dx * f.s + dz * f.c) < f.d / 2) depth = Math.max(depth, f.y - this.heightAt(x, z));
    }
    return Math.max(0, depth);
  }

  // 描いている水面から川床までの深さ。水田は浅い水として扱う。
  streamLevelAt(st, x, z, nx, nz) {
    // 広い川で水面の勾配を定めた時は、浅瀬の川床に水面を引き下げない。
    if (st.levelAt) return st.levelAt(x, z);
    const bed = this.heightAt(x, z);
    let level = Math.min(bed - fordLift(st, x) + st.depth - (st.surfaceDrop ?? 0.15),
      this.heightAt(x + nx * st.w, z + nz * st.w) - 0.15,
      this.heightAt(x - nx * st.w, z - nz * st.w) - 0.15);
    // 細い川と浅瀬は、中央だけでなく渡る帯の低い川床でも膝以下にする。
    const shallow = st.depth <= 0.5 || (st.fords && st.fords.some(f => Math.abs(x - f.x) <= f.w - 4));
    if (shallow) for (let k = -5; k <= 5; k++) {
      const off = st.w * k / 6;
      level = Math.min(level, this.heightAt(x + nx * off, z + nz * off) + 0.35);
    }
    return level;
  }


  waterDepthAt(x, z) {
    let depth = 0;
    const ground = this.heightAt(x, z);
    for (const st of this.def.streams || NO_STREAMS) {
      if (!st.pts) continue;
      // 川の囲い（点の最小・最大に幅を足した箱）の外なら、線分ごとの距離を測らない（答えは同じ。兵ごとに毎コマ呼ばれるので。10/21）
      let bb = st._bb;
      if (!bb || bb.n !== st.pts.length || bb.w !== st.w) {
        bb = st._bb = { n: st.pts.length, w: st.w, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
        for (const p of st.pts) { if (p[0] < bb.x0) bb.x0 = p[0]; if (p[0] > bb.x1) bb.x1 = p[0]; if (p[1] < bb.z0) bb.z0 = p[1]; if (p[1] > bb.z1) bb.z1 = p[1]; }
        bb.x0 -= st.w; bb.x1 += st.w; bb.z0 -= st.w; bb.z1 += st.w;
      }
      if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
      let best = Infinity, cx = 0, cz = 0, bestSegment = 0, bestT = 0;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; cx = px; cz = pz; bestSegment = i; bestT = t; }
      }
      if (best >= st.w * st.w) continue;
      let level;
      const surface = st.surface;
      if (surface && surface.length >= 6 && st.surfaceSteps[bestSegment]) {
        const f = bestT * st.surfaceSteps[bestSegment], step = Math.min(Math.floor(f), st.surfaceSteps[bestSegment] - 1);
        const i = (st.surfaceStarts[bestSegment] + step) * 3, t = f - step;
        level = surface[i + 2] + (surface[i + 5] - surface[i + 2]) * t;
      } else {
        const a = st.pts[bestSegment], b = st.pts[bestSegment + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        level = this.streamLevelAt(st, cx, cz, -(b[1] - a[1]) / len, (b[0] - a[0]) / len);
      }
      depth = Math.max(depth, level + (st.mesh ? st.mesh.position.y : 0) - ground);
    }
    const w = this.def.water;
    if (w && x > w.x && x < (w.x2 ?? Infinity)) depth = Math.max(depth, (w.level ?? -99) - ground);
    if (this.field.wet && this.def.paddy && this.def.paddy(x, z) > 0.55) depth = Math.max(depth, 0.12);
    depth = Math.max(depth, this.villageWaterDepthAt(x, z));
    return Math.max(0, depth);
  }

  // 水面を描く深さと、足が浸かる深さを分ける。橋の下の川では濡らさない。
  waterFootDepthAt(x, z, y) {
    const depth = this.waterDepthAt(x, z);
    if (depth <= 0) return 0;
    const bed = this.heightAt(x, z);
    return Math.max(0, bed + depth - (y ?? bed));
  }

  // 遊び手も兵も同じ浅瀬の減速を使う。数だけ返し、入れ物を増やさない。
  waterSpeedAt(x, z, mounted, y) {
    const depth = this.waterFootDepthAt(x, z, y);
    if (depth <= 0.02) return 1;
    const d = Math.min(0.85, depth);
    return mounted ? Math.max(0.3, 0.6 - d * 0.35) : Math.max(0.5, 0.85 - d * 0.4,
      depth <= .85 ? this.def.fordWalkSpeed?.(x, z) || 0 : 0);
  }


  buildWater(w) {
    // 川は地図の外（遠景）まで続ける
    const wide = w.x2 ? w.x2 - w.x + 6 : 700;
    const geo = new THREE.PlaneGeometry(wide, 700);
    geo.rotateX(-Math.PI / 2);
    // 湖では長い流れ筋を描かず、短い波頭を散らす。同じ一枚の模様と水面を使う。
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#40545a'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 65; i++) {
      const x = Math.random() * 64, y = Math.random() * 256;
      g.strokeStyle = `rgba(160,182,185,${0.025 + Math.random() * 0.035})`; g.lineWidth = 0.5 + Math.random();
      g.beginPath();
      if (w.lake) g.ellipse(x, y, 1 + Math.random() * 2, 2 + Math.random() * 3, 0, 0, Math.PI);
      else { g.moveTo(x, y); g.quadraticCurveTo(x + 2, y + 4, x - 1, y + 7 + Math.random() * 8); }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w.x2 ? (w.x2 - w.x) / 16 : 40, 12);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex = tex;
    // 川面：空を映す（粗さを低く）。流れの筋が動く
    const mat = liteMat({ map: tex, color: 0x7e8c88, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false, envMapIntensity: 0.8 });
    // 湖の風波は旗・煙と同じ設定の風向へ。支度時だけ向きを決め、毎コマの計算を増やさない。
    const wind = this.def.wind, windLength = w.lake && wind ? Math.hypot(wind[0], wind[1]) : 0;
    const fx = windLength ? wind[0] / windLength : 0, fz = windLength ? wind[1] / windLength : 1;
    rippleWater(mat, fx, fz, 3.5, this.hemi.color, false, new THREE.Vector2(w.x, w.x2 ?? w.x + wide), null, false, !!w.lake);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(w.x2 ? (w.x + w.x2) / 2 : w.x + wide / 2, w.level, 0);
    this.scene.add(m);
    m.receiveShadow = true;
    // 岸の泥は水の材質へまとめた。透明な板の追加描画と白い直線の縁をなくす。
  }


  // 小川：掘った溝に水の帯を流す
  buildStream(st) {
    const pts = st.pts;
    const posA = [], flowA = [], colorA = [], bedA = [], idx = [], surface = [], surfaceStarts = [], surfaceSteps = [];
    const cross = st.sedimentWater ? [-1, -0.92, 0, 0.92, 1] : [1, -1];
    const columns = cross.length;
    const shallowColor = new THREE.Color(0x68796b), deepColor = new THREE.Color(0x283d3b);
    const seg = 4;
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), steps = Math.ceil(L / seg);
      if (L < 0.001) continue;
      surfaceStarts[i] = n > 0 ? n - 1 : 0; surfaceSteps[i] = steps;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let k = 0; k <= steps; k++) {
        if (n > 0 && k === 0) continue;
        const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        let y = this.streamLevelAt(st, x, z, nx, nz);
        // 頂点の間の低い岸でも水が土の上へ載らないよう、隣の半歩も調べる。
        for (const sd of [-1, 1]) {
          const tt = Math.max(0, Math.min(1, t + sd / (steps * 2)));
          y = Math.min(y, this.streamLevelAt(st, ax + (bx - ax) * tt, az + (bz - az) * tt, nx, nz));
        }
        surface.push(x, z, y);
        for (const off of cross) {
          const px = x + nx * st.w * off, pz = z + nz * st.w * off;
          posA.push(px, y, pz);
          const depth = Math.max(0, y - this.heightAt(px, pz));
          const c = (st.sedimentWater ? depth : y - this.heightAt(x, z)) <= 0.5 ? shallowColor : deepColor;
          colorA.push(c.r, c.g, c.b);
          bedA.push(depth, off * st.w);
          // 川の点の順に流す。風向きとは結び付けない。
          flowA.push((bx - ax) / L, (bz - az) / L);
        }
        if (n > 0) for (let j = 0; j < columns - 1; j++) {
          const a = (n - 1) * columns + j, b = a + columns;
          if (st.sedimentWater) idx.push(a, a + 1, b, a + 1, b + 1, b);
          else idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
        n++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute('waterFlow', new THREE.Float32BufferAttribute(flowA, 2));
    if (st.sedimentWater) g.setAttribute('waterBed', new THREE.Float32BufferAttribute(bedA, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colorA, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 小川：濁った流れ。空は映すが、白い帯に見えないよう照り返しを抑える
    // 各頂点の川筋に沿って波が動く（端どうしを結ぶ向きは予備）。
    const f0 = pts[0], f1 = pts[pts.length - 1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) || 1;
    const m = new THREE.Mesh(g, rippleWater(liteMat({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.6 }), (f1[0] - f0[0]) / fl, (f1[1] - f0[1]) / fl, 2.2, this.hemi.color, true, null, st.fireReflection ? this.waterFireReflections : null, st.sedimentWater ? st.w : false));
    m.receiveShadow = true;
    this.scene.add(m);
    st.surfaceStarts = surfaceStarts; st.surfaceSteps = surfaceSteps;
    st.surface = new Float32Array(surface);   // 描いた水面を深さの判定にも使う
    st.mesh = m;   // 増水など、戦が水面の高さを動かす時に使う（b_tedorigawa.js）
    // 岸の泥：流れの両の縁は、草が薄く土と泥が出ている（踏み荒らしの印を岸に沿って付ける）
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let t = 0; t < L; t += 2.2) {
        const x = ax + (bx - ax) * (t / L), z = az + (bz - az) * (t / L), j = Math.sin(t * 0.7 + i) * 0.4;
        for (const sd of [1, -1]) this.stampWear(x + nx * sd * (st.w * 1.05 + j), z + nz * sd * (st.w * 1.05 + j), 1.3 + Math.abs(j), 70);
      }
    }
    // 川石は厚みのある丸石。白い平面の輪を石ごとに並べない。
    const R = rng((this.def.seed || 1) * 17 + pts.length), stones = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let k = 0; k < L / 7; k++) {
        const t = R(), side = R(), off = st.sedimentWater ? (side < 0.5 ? -1 : 1) * st.w * (0.88 + Math.abs(side - 0.5) * 0.4) : (side - 0.5) * st.w * 1.3;
        const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
        if (Math.abs(x) > this.half - 2 || Math.abs(z) > this.half - 2) continue;
        if (st.sedimentWater && stones.length >= 24) continue;
        const r = 0.25 + R() * 0.5, bed = this.heightAt(x, z);
        const depth = this.waterDepthAt(x, z);
        if (depth > r * 0.6) continue;
        const y = bed + r * 0.45;
        const sg = new THREE.SphereGeometry(r, 8, 5), sp = sg.attributes.position;
        const phase = R() * 6;
        for (let q = 0; q < sp.count; q++) {
          const px = sp.getX(q), py = sp.getY(q), pz = sp.getZ(q);
          const bulge = 1 + Math.sin(px * 4 + pz * 3 + phase) * 0.12;
          sp.setXYZ(q, px * bulge, py * bulge, pz * bulge);
        }
        sg.computeVertexNormals(); sg.scale(1.2, 0.82, 1); sg.rotateY(R() * 6); sg.translate(x, y - r * 0.15, z);
        stones.push(sg.toNonIndexed()); sg.dispose();
      }
    }
    if (stones.length) {
      const sm = new THREE.Mesh(mergeGeometries(stones), liteMat({ color: 0x6e6a62, roughness: 0.6 }));
      sm.castShadow = sm.receiveShadow = true; this.scene.add(sm);
      st.rockMesh = sm; // 戦ごとの岸の補修で、川石だけを扱えるようにする。
      for (const stone of stones) stone.dispose();
    }
  }
}
