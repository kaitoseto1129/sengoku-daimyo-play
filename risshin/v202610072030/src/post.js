import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { S } from './settings.js';

// 時刻・天気ごとの露出の目当て（world.js が 2 秒ほどかけて寄せる。夜・嵐は暗く、夕暮れは少し落とす）
// 周辺減光は画面の側（#vignette）にもあるので、ここの減光は薄くして重ねすぎない
// S.filmFx が false なら、減光と粒を切る（設定の釦は画面の係へ頼む）
export const POST = { exp: 1, heat: 0, drops: 0, smoke: 0, dark: 0 };

// 強い一撃（鉄砲など）で視界の端が暗くすぼまる覆い。画面の仕上げではなく HTML の覆い（放射の暈し）で描くので、どの画質でも効く
// POST.dark（0〜1）を毎コマ edgeDark(dt) で減らしながら不透明度に移す（player.js の視点の更新から呼ぶ）
let edgeEl = null;
export function edgeDark(dt) {
  POST.dark = Math.max(0, (POST.dark || 0) - dt * 0.85);
  if (!edgeEl) {
    if (!POST.dark || typeof document === 'undefined') return;
    edgeEl = document.createElement('div');
    edgeEl.id = 'edgedark';
    edgeEl.setAttribute('aria-hidden', 'true');
    edgeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 30%, rgba(8,2,2,.55) 62%, rgba(4,0,0,.95) 100%)';
    // 画面の札（#hud）より下、3D の絵より上に置く
    const hud = document.getElementById('hud');
    if (hud && hud.parentNode) hud.parentNode.insertBefore(edgeEl, hud); else document.body.appendChild(edgeEl);
  }
  const o = Math.min(1, POST.dark).toFixed(3);
  if (edgeEl.style.opacity !== o) edgeEl.style.opacity = o;
}

// 戦を抜ける時に呼ぶ：深手・疲れで暗くなった縁を必ず消す（edgeDark は戦の絵の更新中しか呼ばれないので、評価・城下の画面に暗みが残らないように）
export function clearEdgeDark() {
  POST.dark = 0;
  if (edgeEl) edgeEl.style.opacity = '0';
}

// 画面の仕上げ（画質「中」「高」）：実写の合戦映画のような画にする
// ・明暗順応：画面の明るさをならして、目が慣れるようにゆっくり露出を合わせる（逆光で暗く、曇りで明るく）
// ・接地の影（画質「高」）：深さの絵から、物と物が触れ合う所・足もと・草の根元を暗くする
// ・被写界深度（画質「高」）：画面の真ん中に焦点を合わせ、ずっと遠くをわずかにぼかす
// ・動きのぶれ（画質「高」）：視点を速く振った時だけ、振った向きに少し流れる
// ・色：わずかに褪せた色、影は青緑・明るい所は暖かく、S 字の階調。赤（家の色）だけは褪せさせない
// ・周辺減光・ごく弱い色収差・フィルムの粒

// 明暗順応：画面を 12×8 か所で読み、明るさの対数の平均を出して、前の値へゆっくり寄せる（1×1 の絵を二枚で交互に）
// 同時に、画面の真ん中の遠さ（焦点）も同じ絵の g に貯める
const AdaptShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tPrev: { value: null }, uK: { value: 1 }, uNear: { value: 0.1 }, uFar: { value: 600 }, uHasDepth: { value: 0 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tPrev; uniform float uK, uNear, uFar, uHasDepth, uNight; varying vec2 vUv;
    float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
    void main() {
      float s = 0.0, w = 0.0;
      for (int j = 0; j < 8; j++) for (int i = 0; i < 12; i++) {
        vec2 p = vec2((float(i) + 0.5) / 12.0, (float(j) + 0.5) / 8.0);
        // 真ん中ほど重く（人の目は見ている所に合わせる）。空の上端は軽く
        float k = 1.0 - 0.6 * length((p - 0.5) * vec2(1.2, 1.6)) - 0.3 * step(0.8, p.y);
        // 夜は、別描画で見える空よりも足もとと兵に目を合わせる。
        k *= 1.0 - uNight * 0.75 * smoothstep(0.55, 0.85, p.y);
        vec3 c = texture2D(tDiffuse, p).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        s += log(max(l, 1e-4)) * k; w += k;
      }
      float lum = exp(s / w);
      // 壊れた値（NaN・無限）が一つでも混ざると露出がずっと狂うので、その時は仮の明るさにする
      if (!(lum >= 0.0 && lum < 1e5)) lum = 0.24;
      // 焦点：真ん中の少しの範囲の近い方
      float f = 30.0;
      if (uHasDepth > 0.5) {
        f = 1e4;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          float d = texture2D(tDepth, vec2(0.5, 0.47) + vec2(float(i) * 0.035, float(j) * 0.05)).x;
          f = min(f, -viewZ(d));
        }
        f = clamp(f, 1.5, 400.0);
      }
      vec4 prev = texture2D(tPrev, vec2(0.5));
      if (!(prev.r >= 0.0 && prev.r < 1e5) || !(prev.g >= 0.0 && prev.g < 1e5)) prev = vec4(0.0);
      if (prev.a < 0.5) { gl_FragColor = vec4(lum, f, 0.0, 1.0); return; }
      // 明るさは対数でならす。焦点は近づく時は速く、遠のく時はゆっくり
      float nl = exp(mix(log(max(prev.r, 1e-4)), log(lum), uK));
      float fk = f < prev.g ? min(1.0, uK * 4.0) : uK * 2.0;
      gl_FragColor = vec4(nl, mix(prev.g, f, fk), 0.0, 1.0);
    }`,
};

// 仕上げの本体
const FinishShader = {
  defines: { USE_DEPTH: 0 },
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, tAdapt: { value: null },
    toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uGrade: { value: 1 }, uVig: { value: 1 }, uGrain: { value: 1 }, uAuto: { value: 1 }, uNight: { value: 0 }, uExpK: { value: 1 }, uHeat: { value: 0 }, uDrops: { value: 0 }, uSmoke: { value: 0 }, uDark: { value: 0 },
    uAO: { value: 0 }, uDof: { value: 0 }, uBlur: { value: 0 }, uCA: { value: 1 },
    uNear: { value: 0.1 }, uFar: { value: 600 }, uProjInv: { value: new THREE.Matrix4() }, uReproj: { value: new THREE.Matrix4() },
    uFogCol: { value: new THREE.Color(0.6, 0.65, 0.7) }, uPScale: { value: 1 },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunK: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tAdapt;
    uniform float toneMappingExposure, uExpK, uHeat, uDrops, uSmoke, uDark, uTime, uGrade, uVig, uGrain, uAuto, uNight, uAO, uDof, uBlur, uCA, uNear, uFar;
    uniform vec2 uRes; uniform mat4 uProjInv, uReproj; uniform vec3 uFogCol; uniform float uPScale;
    uniform vec2 uSunUV; uniform float uSunK; uniform vec3 uSunCol;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color) {
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color = O * RRTAndODTFit(I * (color / 0.6));
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    #if USE_DEPTH
    float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
    float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    #endif
    void main() {
      vec2 uv = vUv;
      vec2 dc = uv - 0.5;
      // ごく弱い色収差：画面の端ほど赤と青がわずかにずれる
      vec2 ca = dc * dot(dc, dc) * 0.006 * uCA;
      vec3 col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      // 一人称の雨：画面の端に雨粒が付いて、ゆっくり流れ落ちる（粒の中は景色が少し歪んで明るい）。真ん中は空けておく
      if (uDrops > 0.01) {
        vec2 gs = vec2(uRes.x / uRes.y, 1.0) * 7.0;
        vec2 p = uv * gs;
        float sp = hash(vec2(floor(p.x), 3.1));
        p.y += uTime * (0.08 + sp * 0.2);
        vec2 id = floor(p), f = fract(p) - 0.5;
        if (hash(id) > 0.6) {
          vec2 c = vec2(hash(id + 1.3) - 0.5, hash(id + 2.7) - 0.5) * 0.45;
          vec2 dd = (f - c) * vec2(1.0, 0.75);
          float r = 0.1 + 0.1 * hash(id + 4.1);
          float m = smoothstep(r, r * 0.55, length(dd));
          float edge = smoothstep(0.28, 0.6, length(dc * vec2(1.25, 1.0)));
          col = mix(col, texture2D(tDiffuse, uv - dd * 0.09).rgb * 1.1, m * edge * uDrops);
        }
      }
      float ao = 1.0;
      #if USE_DEPTH
      float d0 = depthAt(uv);
      bool sky = d0 > 0.99999;
      vec3 P = viewPos(uv, d0);
      float dist = -P.z;
      // 面の向き（深さの傾きから。分かれ道の外で求める）
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      // 陽炎：夏の昼、百数十 m より遠い地面近くの景色が細かく揺らぐ（空はゆらさない）
      if (uHeat > 0.01 && !sky && dist > 90.0) {
        float hk = uHeat * smoothstep(90.0, 220.0, dist) * (1.0 - smoothstep(0.35, 0.75, uv.y));
        vec2 hv = vec2(sin(uv.y * 420.0 + uTime * 9.0) + 0.5 * sin(uv.y * 910.0 - uTime * 13.0), 0.0) * hk * 0.0011;
        col = texture2D(tDiffuse, uv + hv).rgb;
      }
      // 動きのぶれ：この画素の場所が前のコマで画面のどこにあったか（視点が動いた分だけ）
      if (uBlur > 0.0) {
        vec4 pp = uReproj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
        vec2 puv = pp.xy / pp.w * 0.5 + 0.5;
        vec2 mv = (uv - puv);
        float ml = length(mv);
        // 速く振った時だけ（ゆっくり歩く・見回すくらいでは流さない）
        float k = smoothstep(0.012, 0.05, ml) * uBlur * step(ml, 0.2);   // 場面の切り替え（大きな飛び）では流さない
        if (k > 0.001) {
          mv = mv / max(ml, 1e-5) * min(ml, 0.04) * k;
          vec3 acc = col;
          for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, uv - mv * (float(i) / 6.0 - 0.3)).rgb;
          col = acc / 7.0;
        }
      }
      // 被写界深度：焦点より十分遠い所だけ、少しぼける（近くの乱戦はくっきり）
      if (uDof > 0.0) {
        float focus = texture2D(tAdapt, vec2(0.5)).g;
        float coc = clamp((dist - focus * 2.2) / (focus * 6.0 + 20.0), 0.0, 1.0) * uDof;
        if (sky) coc = uDof * 0.8;
        float r = coc * 2.6;
        if (r > 0.35) {
          vec2 px = r / uRes;
          vec3 acc = col; float wsum = 1.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398 + 0.39;
            vec2 o = vec2(cos(a), sin(a)) * px * (i < 4 ? 0.55 : 1.0);
            vec2 su = uv + o;
            // 手前の物（焦点に近い物）がにじみ出ないよう、奥の画素だけを混ぜる
            float sd = -viewZ(depthAt(su));
            float w = step(focus * 1.6, sd) + (sky ? 1.0 : 0.0);
            acc += texture2D(tDiffuse, su).rgb * w; wsum += w;
          }
          col = acc / wsum;
        }
      }
      // 接地の影：近くの深さをいくつか読み、覆いかぶさる物があれば暗くする（足もと・物の合わせ目・草の根元）
      // 深さが隣の画素と大きく飛ぶ所（草の葉・槍の柄など細い物の上）は、面の向きが求まらないので影を付けない
      float dEdge = fwidth(dist) / max(dist, 0.1);
      if (uAO > 0.0 && !sky && dist < 60.0 && dEdge < 0.02) {
        float rad = 0.45;
        float rs = rad / max(dist, 0.5) * uPScale;
        float occ = 0.0;
        float rnd = hash(gl_FragCoord.xy) * 6.2831;
        for (int i = 0; i < 8; i++) {
          float t = (float(i) + 0.6) / 8.0;
          float a = rnd + float(i) * 2.39996;
          vec2 su = uv + vec2(cos(a), sin(a)) * rs * t * vec2(uRes.y / uRes.x, 1.0);
          vec3 v = viewPos(su, depthAt(su)) - P;
          float vl = length(v);
          // 手前へ大きく飛び出した物（草の葉・槍の柄など細い物）は覆いとみなさない（草むらが黒く潰れないように）
          float thin = 1.0 - smoothstep(0.18, 0.4, v.z);
          occ += max(0.0, dot(v, N) / (vl + 1e-4) - 0.15) * (1.0 - smoothstep(rad * 0.6, rad * 2.2, vl)) * thin;
        }
        ao = clamp(1.0 - occ / 8.0 * 1.0, 0.55, 1.0);
        ao = mix(1.0, ao, uAO * (1.0 - smoothstep(25.0, 60.0, dist)));
        col *= ao;
      }
      // 光の筋（逆光の時だけ）：日のある方へ向かって、空と遠い山（遠い所）の明るさを集め、手前の物の間から漏れる光にする
      if (uSunK > 0.001) {
        vec2 dir = uSunUV - uv;
        float jit = hash(gl_FragCoord.xy + 0.37);
        float acc = 0.0;
        for (int i = 0; i < 12; i++) {
          float t = (float(i) + jit) / 12.0;
          vec2 su = clamp(uv + dir * t * 0.85, vec2(0.001), vec2(0.999));
          float sd = -viewZ(depthAt(su));
          acc += smoothstep(180.0, 320.0, sd) * (1.0 - t * 0.4);
          // 硝煙が濃い時は、煙そのものが日を受けて光る：手前の人や柵の隙間から、煙の中へ日の筋が差し込む
          acc += uSmoke * 0.55 * smoothstep(12.0, 40.0, sd) * (1.0 - t * 0.5);
        }
        acc /= 12.0;
        vec2 ds = (uv - uSunUV) * vec2(uRes.x / uRes.y, 1.0);
        float fall = exp(-length(ds) * 2.4);
        col += uSunCol * acc * fall * uSunK * (0.3 + uSmoke * 0.25);
      }
      #endif
      // 明暗順応：暗い場面は少し明るく、まぶしい場面は少し絞る（効きすぎないよう、半分だけ合わせる）
      float ex = toneMappingExposure * uExpK;
      if (uAuto > 0.0) {
        float avg = max(texture2D(tAdapt, vec2(0.5)).r, 1e-3);
        // 夜は空や火が明るくても近景を絞らず、暗い時の順応を少し広げる。
        float target = mix(0.24, 0.18, uNight);
        ex *= mix(1.0, clamp(pow(target / avg, 0.45), mix(0.8, 1.0, uNight), mix(1.3, 1.6, uNight)), uAuto);
      }
      col = toSRGB(aces(col * ex));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 色：家の色（赤・朱）は残し、ほかは少し褪せる
      float red = smoothstep(0.03, 0.16, col.r - max(col.g, col.b)) * smoothstep(0.06, 0.2, col.r);
      col = mix(vec3(l), col, mix(1.0, mix(0.9, 1.08, red), uGrade));
      // 草木の緑は少し黄へ寄せる（青みのある薄荷色の草を、夏の野の黄みを帯びた緑に）
      float grn = clamp((col.g - max(col.r, col.b)) * 6.0, 0.0, 1.0);
      col.r += (col.g - col.r) * 0.22 * grn * uGrade;
      col.b -= col.b * 0.12 * grn * uGrade;
      // 影は青緑、明るい所は日の暖かさ（日なたと日陰の色の差で奥行きを出す）
      vec3 tint = mix(vec3(0.9, 0.975, 1.04), vec3(1.06, 1.0, 0.9), smoothstep(0.1, 0.72, l));
      col *= mix(vec3(1.0), tint, uGrade * (1.0 - uNight));
      // S 字の階調と、わずかに浮いた黒・丸めた白（褪せすぎて灰色に濁らないよう、黒の浮きは控えめ）
      col = mix(col, col * col * (3.0 - 2.0 * col), mix(0.3, 0.12, uNight) * uGrade);
      col = col * (1.0 - 0.05 * uGrade) + vec3(0.018, 0.02, 0.024) * uGrade;
      // 周辺減光
      vec2 d = dc; d.x *= uRes.x / uRes.y;
      col *= 1.0 - smoothstep(0.45, 1.2, length(d)) * 0.16 * uVig;
      // フィルムの粒（暗い所ほど目立つ）
      float n = hash(floor(vUv * uRes) + fract(uTime * vec2(0.618, 0.382)) * 311.0) - 0.5;
      col += n * 0.02 * uGrain * (1.0 - l * 0.7);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// 明暗順応の一段（1×1 の絵に書く。画面には何も描かない）
export class AdaptPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    const o = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.rts = [new THREE.WebGLRenderTarget(1, 1, o), new THREE.WebGLRenderTarget(1, 1, o)];
    this.cur = 0;
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AdaptShader.uniforms), vertexShader: AdaptShader.vertexShader, fragmentShader: AdaptShader.fragmentShader, depthTest: false, depthWrite: false });
    this.fsq = new FullScreenQuad(this.mat);
    this.dt = 1 / 60;
    this.fresh = true;
  }
  get texture() { return this.rts[this.cur].texture; }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.mat.uniforms;
    const prev = this.rts[this.cur], next = this.rts[1 - this.cur];
    U.tDiffuse.value = readBuffer.texture;
    U.tDepth.value = readBuffer.depthTexture || null;
    U.uHasDepth.value = readBuffer.depthTexture ? 1 : 0;
    U.tPrev.value = prev.texture;
    // 目の慣れ：おおよそ 1.5 秒で七割
    U.uK.value = this.fresh ? 1 : 1 - Math.exp(-this.dt / 1.3);
    if (this.fresh) {
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(prev); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.setClearColor(cc, ca);
    }
    this.fresh = false;
    renderer.setRenderTarget(next);
    this.fsq.render(renderer);
    this.cur = 1 - this.cur;
  }
  dispose() { this.rts.forEach((r) => r.dispose()); this.mat.dispose(); this.fsq.dispose(); }
}

// 仕上げの一段
export class FinishPass extends Pass {
  constructor(useDepth) {
    super();
    this.mat = new THREE.ShaderMaterial({
      defines: { USE_DEPTH: useDepth ? 1 : 0 },
      uniforms: THREE.UniformsUtils.clone(FinishShader.uniforms),
      vertexShader: FinishShader.vertexShader, fragmentShader: FinishShader.fragmentShader,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    // 色の変換はこの中でするので、画面へ描く時に three の変換を重ねない
    this.mat.extensions = { derivatives: true };
    this.uniforms = this.mat.uniforms;
    this.fsq = new FullScreenQuad(this.mat);
    this.prevVP = null;
  }
  // 視点の行列から、前のコマへの写し（動きのぶれ用）と、深さから場所へ戻す行列を作る
  setCamera(cam) {
    const U = this.uniforms;
    U.uNear.value = cam.near; U.uFar.value = cam.far;
    U.uProjInv.value.copy(cam.projectionMatrixInverse);
    U.uPScale.value = cam.projectionMatrix.elements[5] * 0.5;
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const inv = vp.clone().invert();
    if (this.prevVP) U.uReproj.value.multiplyMatrices(this.prevVP, inv);
    else U.uReproj.value.identity();
    this.prevVP = vp;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uExpK.value = POST.exp;
    this.uniforms.uHeat.value = S.reduceMotion ? 0 : POST.heat;
    this.uniforms.uSmoke.value = POST.smoke;
    this.uniforms.uDrops.value = S.reduceMotion || S.rainScreen === false ? 0 : POST.drops;
    const fx = S.filmFx === false ? 0 : 1;
    this.uniforms.uVig.value = fx; this.uniforms.uGrain.value = S.reduceMotion ? 0 : fx;
    if (readBuffer.depthTexture) this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsq.render(renderer);
  }
  dispose() { this.mat.dispose(); this.fsq.dispose(); }
}
