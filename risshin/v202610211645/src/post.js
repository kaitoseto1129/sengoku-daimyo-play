import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { S } from './settings.js';

// 時刻・天気ごとの露出の目当て（world.js が 2 秒ほどかけて寄せる。夜・嵐は暗く、夕暮れは少し落とす）
// 周辺減光は画面の側（#vignette）にもあるので、ここの減光は薄くして重ねすぎない
// S.filmFx が false なら、減光と粒を切る（設定の釦は画面の係へ頼む）
export const POST = { exp: 1, heat: 0, drops: 0, smoke: 0, dark: 0 };

// 強い一撃（鉄砲など）で視界の端が暗くすぼまる覆い。画面の仕上げではなく HTML の覆い（放射の暈し）で描くので、どの画質でも効く
// POST.dark（0〜1）を毎コマ edgeDark(dt) で減らしながら不透明度に移す（player.js の視点の更新から呼ぶ）
let edgeEl = null, edgeDown = false;
export function edgeDark(dt, down = 0) {
  POST.dark = Math.max(down, (POST.dark || 0) - dt * 0.85);
  if (!edgeEl) {
    if (!POST.dark || typeof document === 'undefined') return;
    edgeEl = document.createElement('div');
    edgeEl.id = 'edgedark';
    edgeEl.setAttribute('aria-hidden', 'true');
    edgeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 84%, rgba(8,2,2,.22) 100%)';
    // 画面の札（#hud）より下、3D の絵より上に置く
    const hud = document.getElementById('hud');
    if (hud && hud.parentNode) hud.parentNode.insertBefore(edgeEl, hud); else document.body.appendChild(edgeEl);
  }
  // 終幕は中央にも薄い暗みを重ね、戦場の形が見える濃さで止める。低画質でも同じ。
  if (edgeDown !== (down > 0)) {
    edgeDown = down > 0;
    edgeEl.style.background = edgeDown
      ? 'radial-gradient(ellipse at 50% 50%, rgba(4,2,2,.45) 30%, rgba(8,2,2,.65) 62%, rgba(4,0,0,.95) 100%)'
      : 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 84%, rgba(8,2,2,.22) 100%)';
  }
  const o = Math.min(1, POST.dark).toFixed(3);
  if (edgeEl.style.opacity !== o) edgeEl.style.opacity = o;
  const display = o === '0.000' ? 'none' : '';
  if (edgeEl.style.display !== display) edgeEl.style.display = display;
}

// 馬で駆ける時の流れ：画面の外寄りに、中心から外へ走る細い筋（土埃と風）。一枚の絵を一度だけ描き、毎コマは不透明度と大きさだけ変える
// POST.speed（0〜1）と POST.speedPh（蹄の拍子）は player.js が入れる。動きを減らす設定では 0 のまま
let speedEl = null;
export function speedStreaks() {
  const k = S.reduceMotion ? 0 : Math.min(1, POST.speed || 0);
  if (!speedEl) {
    if (k < 0.01 || typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2, r0 = 150 + rnd() * 70, r1 = r0 + 70 + rnd() * 160, w = 0.6 + rnd() * 1.6;
      const g = x.createLinearGradient(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0, 256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      const warm = rnd() < 0.6;
      g.addColorStop(0, 'rgba(235,222,196,0)');
      g.addColorStop(0.6, warm ? 'rgba(214,196,160,.55)' : 'rgba(250,246,236,.5)');
      g.addColorStop(1, 'rgba(235,222,196,0)');
      x.strokeStyle = g; x.lineWidth = w;
      x.beginPath(); x.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0); x.lineTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1); x.stroke();
    }
    speedEl = document.createElement('div');
    speedEl.id = 'speedstreaks';
    speedEl.setAttribute('aria-hidden', 'true');
    speedEl.style.cssText = `position:fixed;inset:-6%;pointer-events:none;opacity:0;background:url(${c.toDataURL()}) center/100% 100% no-repeat;will-change:opacity,transform`;
    const hud = document.getElementById('hud');
    if (hud && hud.parentNode) hud.parentNode.insertBefore(speedEl, hud); else document.body.appendChild(speedEl);
  }
  const o = (k * 0.4).toFixed(2);
  if (speedEl.style.opacity !== o) speedEl.style.opacity = o;
  const display = o === '0.00' ? 'none' : '';
  if (speedEl.style.display !== display) speedEl.style.display = display;
  if (k > 0.01) {
    // 一完歩ごとに筋が外へ流れて入れ替わる（大きさを少しずつ広げ、拍子で戻す）。左右・上下も拍子ごとに返し、同じ筋が止まって見えないように
    const ph = (POST.speedPh || 0) % 1, n = Math.floor(POST.speedPh || 0), sc = 1 + ph * 0.08;
    const transform = `scale(${((n & 1 ? -1 : 1) * sc).toFixed(3)},${((n & 2 ? -1 : 1) * sc).toFixed(3)})`;
    if (speedEl.style.transform !== transform) speedEl.style.transform = transform;
  }
}

// 戦を抜ける時に呼ぶ：深手・疲れで暗くなった縁を必ず消す（edgeDark は戦の絵の更新中しか呼ばれないので、評価・城下の画面に暗みが残らないように）
export function clearEdgeDark() {
  POST.dark = 0; POST.speed = 0;
  if (edgeEl) { edgeEl.style.opacity = '0'; edgeEl.style.display = 'none'; }
  if (speedEl) { speedEl.style.opacity = '0'; speedEl.style.display = 'none'; }
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
  uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, uBloomK: { value: 0 }, tDepth: { value: null }, tPrev: { value: null }, uK: { value: 1 }, uNear: { value: 0.1 }, uFar: { value: 600 }, uHasDepth: { value: 0 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tBloom, tDepth, tPrev; uniform float uK, uNear, uFar, uHasDepth, uNight, uBloomK; varying vec2 vUv;
    float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
    void main() {
      float s = 0.0, w = 0.0;
      for (int j = 0; j < 8; j++) for (int i = 0; i < 12; i++) {
        vec2 p = vec2((float(i) + 0.5) / 12.0, (float(j) + 0.5) / 8.0);
        // 真ん中ほど重く（人の目は見ている所に合わせる）。空の上端は軽く
        float k = 1.0 - 0.6 * length((p - 0.5) * vec2(1.2, 1.6)) - 0.3 * step(0.8, p.y);
        // 夜は、別描画で見える空よりも足もとと兵に目を合わせる。
        k *= 1.0 - uNight * 0.75 * smoothstep(0.55, 0.85, p.y);
        vec3 c = texture2D(tDiffuse, p).rgb + texture2D(tBloom, p).rgb * uBloomK;   // にじみは景色の的へ重ねず、ここで足す（main.js の bloom の畳み込み）
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

// 接地の影と焦点ぼかしは縦横半分で支度する。半精度は景色の明るさが必要な焦点ぼかしだけ。
// 焦点ぼかしの透明度に中央画素の重みを残し、雨・陽炎・動きのぶれを含む元の色に仕上げで混ぜる。
const PrepareDepth = `
    uniform sampler2D tDiffuse, tDepth, tAdapt;
    uniform float uNear, uFar, uAO, uDof, uPScale;
    uniform vec2 uRes; uniform mat4 uProjInv;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
    float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
`;
const DofFragment = `${PrepareDepth}
    void main() {
      vec2 uv = vUv;
      float d0 = depthAt(uv);
      bool sky = d0 > 0.99999;
      float dist = -viewZ(d0);
      vec4 result = vec4(0.0, 0.0, 0.0, 1.0);
      // 被写界深度：焦点より十分遠い所だけ、少しぼける（近くの乱戦はくっきり）
      if (uDof > 0.0) {
        float focus = texture2D(tAdapt, vec2(0.5)).g;
        float coc = clamp((dist - focus * 2.2) / (focus * 6.0 + 20.0), 0.0, 1.0) * uDof;
        if (sky) coc = uDof * 0.8;
        float r = coc * 2.6;
        if (r > 0.35) {
          vec2 px = r / uRes;
          vec3 acc = vec3(0.0); float wsum = 1.0;
          for (int i = 0; i < 6; i++) {
            float a = float(i) * 2.094395 + (i < 3 ? 0.39 : 1.437198);
            vec2 o = vec2(cos(a), sin(a)) * px * (i < 3 ? 0.55 : 1.0);
            vec2 su = uv + o;
            // 手前の物（焦点に近い物）がにじみ出ないよう、奥の画素だけを混ぜる
            float sd = -viewZ(depthAt(su));
            float w = step(focus * 1.6, sd) + (sky ? 1.0 : 0.0);
            acc += texture2D(tDiffuse, su).rgb * w; wsum += w;
          }
          result = vec4(acc / wsum, 1.0 / wsum);
        }
      }
      gl_FragColor = result;
    }`;
const AOFragment = `${PrepareDepth}
    void main() {
      vec2 uv = vUv;
      float d0 = depthAt(uv);
      bool sky = d0 > 0.99999;
      vec3 P = viewPos(uv, d0);
      float dist = -P.z;
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      float ao = 1.0;
      // 接地の影：近くの深さをいくつか読み、覆いかぶさる物があれば暗くする（足もと・物の合わせ目・草の根元）
      // 深さが隣の画素と大きく飛ぶ所（草の葉・槍の柄など細い物の上）は、面の向きが求まらないので影を付けない
      float dEdge = fwidth(dist) * 0.5 / max(dist, 0.1);
      if (uAO > 0.0 && !sky && dist < 40.0 && dEdge < 0.02) {
        // 足・柱の根元を覆う広さ。近い接触と、その外の柔らかな陰を同じ八点で拾う。
        float rad = 0.65;
        float rs = rad / max(dist, 0.5) * uPScale;
        float occ = 0.0;
        float rnd = hash(gl_FragCoord.xy) * 6.2831;
        for (int i = 0; i < 8; i++) {
          float t = 0.18 + 0.82 * (float(i) + 0.5) / 8.0;
          float a = rnd + float(i) * 2.39996;
          vec2 su = uv + vec2(cos(a), sin(a)) * rs * t * vec2(uRes.y / uRes.x, 1.0);
          vec3 v = viewPos(su, depthAt(su)) - P;
          float vl = length(v);
          // 視線方向の差で除くと、地面を覆う脛や柱まで消えてしまう。
          // 面から浮いた高さと実際の距離で判定し、離れた槍や兵の輪郭に黒い縁を付けない。
          // 二・五センチの余裕で、砂や草の細かな凹凸による黒潰れも抑える。
          float cover = max(0.0, (dot(v, N) - 0.025) / (vl + 1e-4) - 0.06);
          float reach = 1.0 - smoothstep(rad * 0.5, rad * 1.6, vl);
          float inside = step(0.0, su.x) * step(su.x, 1.0) * step(0.0, su.y) * step(su.y, 1.0);
          occ += cover * reach * inside;
        }
        ao = clamp(1.0 - occ / 8.0 * 2.2, 0.58, 1.0);
        ao = mix(1.0, ao, uAO * (1.0 - smoothstep(2.0, 40.0, dist)));
      }
      gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
    }`;

// 仕上げの本体
const FinishShader = {
  defines: { USE_DEPTH: 0 },
  uniforms: {
    tDiffuse: { value: null }, tBloom: { value: null }, uBloomK: { value: 0 }, tDepth: { value: null }, tAdapt: { value: null }, tAO: { value: null }, tDof: { value: null },
    uPreparedAO: { value: 0 }, uPreparedDof: { value: 0 },
    toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uGrade: { value: 1 }, uVig: { value: 1 }, uGrain: { value: 1 }, uAuto: { value: 1 }, uNight: { value: 0 }, uExpK: { value: 1 }, uHeat: { value: 0 }, uDrops: { value: 0 }, uSmoke: { value: 0 }, uDark: { value: 0 },
    uAO: { value: 0 }, uDof: { value: 0 }, uBlur: { value: 0 }, uCA: { value: 1 },
    uNear: { value: 0.1 }, uFar: { value: 600 }, uProjInv: { value: new THREE.Matrix4() }, uReproj: { value: new THREE.Matrix4() },
    uFogCol: { value: new THREE.Color(0.6, 0.65, 0.7) }, uPScale: { value: 1 },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunK: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tBloom, tDepth, tAdapt, tAO, tDof; uniform float uBloomK;
    // 景色＋にじみ：にじみ（半分の大きさの的）は景色の的（MSAA・半精度）へ重ね描きせず、読む時に足す（同じ双一次の拡大なので結果は同じ。重ね描き一回分の的の読み書きが減る）
    vec4 scn4(vec2 p) { return vec4(texture2D(tDiffuse, p).rgb + texture2D(tBloom, p).rgb * uBloomK, 1.0); }
    uniform float uPreparedAO, uPreparedDof;
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
      #ifdef CLEAN_CONTOUR
      vec3 col = scn4(uv).rgb;
      #else
      vec3 col = vec3(scn4(uv + ca).r, scn4(uv).g, scn4(uv - ca).b);
      #endif
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
          col = mix(col, scn4(uv - dd * 0.09).rgb * 1.1, m * edge * uDrops);
        }
      }
      #if USE_DEPTH
      float d0 = depthAt(uv);
      bool sky = d0 > 0.99999;
      vec3 P = viewPos(uv, d0);
      float dist = -P.z;
      // 陽炎：夏の昼、百数十 m より遠い地面近くの景色が細かく揺らぐ（空はゆらさない）
      if (uHeat > 0.01 && !sky && dist > 90.0) {
        float hk = uHeat * smoothstep(90.0, 220.0, dist) * (1.0 - smoothstep(0.35, 0.75, uv.y));
        vec2 hv = vec2(sin(uv.y * 420.0 + uTime * 9.0) + 0.5 * sin(uv.y * 910.0 - uTime * 13.0), 0.0) * hk * 0.0011;
        col = scn4(uv + hv).rgb;
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
          for (int i = 1; i <= 6; i++) acc += scn4(uv - mv * (float(i) / 6.0 - 0.3)).rgb;
          col = acc / 7.0;
        }
      }
      // 支度した半分の絵を引き伸ばす。手前の兵と細い輪郭は元の深さで守る。
      float dEdge = fwidth(dist) / max(dist, 0.1);
      if (uDof > 0.0 && uPreparedDof > 0.5) {
        float focus = texture2D(tAdapt, vec2(0.5)).g;
        float coc = sky ? uDof * 0.8 : clamp((dist - focus * 2.2) / (focus * 6.0 + 20.0), 0.0, 1.0) * uDof;
        if (coc * 2.6 > 0.35) {
          vec4 blur = texture2D(tDof, uv);
          col = col * blur.a + blur.rgb;
        }
      }
      if (uAO > 0.0 && uPreparedAO > 0.5 && !sky && dist < 40.0 && dEdge < 0.02) {
        col *= texture2D(tAO, uv).r;
      }
      // 光の筋（逆光の時だけ）：日のある方へ向かって、空と遠い山（遠い所）の明るさを集め、手前の物の間から漏れる光にする
      if (uSunK > 0.001) {
        vec2 dir = uSunUV - uv;
        float jit = hash(gl_FragCoord.xy + 0.37);
        float acc = 0.0;
        for (int i = 0; i < 8; i++) {
          float t = (float(i) + jit) / 8.0;
          vec2 su = clamp(uv + dir * t * 0.85, vec2(0.001), vec2(0.999));
          float sd = -viewZ(depthAt(su));
          acc += smoothstep(180.0, 320.0, sd) * (1.0 - t * 0.4);
          // 硝煙が濃い時は、煙そのものが日を受けて光る：手前の人や柵の隙間から、煙の中へ日の筋が差し込む
          acc += uSmoke * 0.55 * smoothstep(12.0, 40.0, sd) * (1.0 - t * 0.5);
        }
        acc /= 8.0;
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
        float target = mix(0.21, 0.18, uNight);
        ex *= mix(1.0, clamp(pow(target / avg, 0.45), mix(0.78, 1.0, uNight), mix(1.2, 1.6, uNight)), uAuto);
      }
      col = toSRGB(aces(col * ex));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 色：家の色（赤・朱）は残し、ほかは少し褪せる
      float red = smoothstep(0.03, 0.16, col.r - max(col.g, col.b)) * smoothstep(0.06, 0.2, col.r);
      col = mix(vec3(l), col, mix(1.0, mix(0.86, 1.02, red), uGrade));
      // 草木の緑は少し黄へ寄せる（青みのある薄荷色の草を、夏の野の黄みを帯びた緑に）
      float grn = clamp((col.g - max(col.r, col.b)) * 6.0, 0.0, 1.0);
      col.r += (col.g - col.r) * 0.22 * grn * uGrade;
      col.b -= col.b * 0.12 * grn * uGrade;
      // 影は青緑、明るい所は日の暖かさ（日なたと日陰の色の差で奥行きを出す）
      vec3 tint = mix(vec3(0.94, 0.985, 1.025), vec3(1.025, 1.0, 0.96), smoothstep(0.1, 0.72, l));
      col *= mix(vec3(1.0), tint, uGrade * (1.0 - uNight));
      // S 字の階調と、わずかに浮いた黒・丸めた白（褪せすぎて灰色に濁らないよう、黒の浮きは控えめ）
      col = mix(col, col * col * (3.0 - 2.0 * col), mix(0.18, 0.12, uNight) * uGrade);
      col = col * (1.0 - 0.045 * uGrade) + mix(vec3(0.009, 0.01, 0.012), vec3(0.018, 0.02, 0.024), uNight) * uGrade;
      // 夜：陰には空の青を残し、月を受ける面は具足・布・肌の色と照りを残す。
      // 一律の脱色と減光で、月の直射まで陰と同じ青灰へ潰さない。
      if (uNight > 0.0) {
        float nl = dot(col, vec3(0.299, 0.587, 0.114));
        float warm = smoothstep(0.05, 0.22, col.r - col.b) * smoothstep(0.18, 0.5, col.r);
        float moonFace = smoothstep(0.12, 0.48, nl);
        vec3 moon = vec3(nl) * vec3(0.8, 0.92, 1.14);
        col = mix(col, moon, uNight * mix(0.52, 0.18, moonFace) * (1.0 - warm));
        col *= 1.0 - uNight * 0.08 * (1.0 - moonFace) * (1.0 - warm);
      }
      // 周辺減光
      vec2 d = dc; d.x *= uRes.x / uRes.y;
      col *= 1.0 - smoothstep(0.84, 1.2, length(d)) * 0.06 * uVig;
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
    this.clearColor = new THREE.Color();
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
      const cc = renderer.getClearColor(this.clearColor), ca = renderer.getClearAlpha();
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
      defines: { USE_DEPTH: useDepth ? 1 : 0, ...({ CLEAN_CONTOUR: 1 }) },
      uniforms: THREE.UniformsUtils.clone(FinishShader.uniforms),
      vertexShader: FinishShader.vertexShader, fragmentShader: FinishShader.fragmentShader,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    // 色の変換はこの中でするので、画面へ描く時に three の変換を重ねない
    this.mat.extensions = { derivatives: true };
    this.uniforms = this.mat.uniforms;
    this.fsq = new FullScreenQuad(this.mat);
    // 行列と内部の配列は支度中に作る。毎コマの作成・回収を避ける。
    this.cameraVP = new THREE.Matrix4();
    this.cameraInvVP = new THREE.Matrix4();
    this.cameraPrevVP = new THREE.Matrix4();
    this.prevVP = null;
    this.useDepth = !!useDepth;
    this.aoTarget = null; this.dofTarget = null;
    this.aoMat = null; this.dofMat = null;
    this.prepareQuad = null;
    // 既存の window.__post.finishPass.計測 から数だけ確認できる（画面には出さない）。
    this.計測 = { 仕上げ描画回数: 1, 接地幅: 0, 接地高さ: 0, 焦点幅: 0, 焦点高さ: 0, 深度あり: false };
  }
  prepare(renderer, readBuffer) {
    const U = this.uniforms, M = this.計測;
    U.uPreparedAO.value = 0; U.uPreparedDof.value = 0;
    M.仕上げ描画回数 = 1;
    M.深度あり = this.useDepth && !!readBuffer.depthTexture;
    if (!M.深度あり) return;
    const ao = U.uAO.value > 0, dof = U.uDof.value > 0;
    if (!ao && !dof) return;
    const w = Math.max(1, Math.ceil(readBuffer.width / 2));
    const h = Math.max(1, Math.ceil(readBuffer.height / 2));
    if (!this.prepareQuad) this.prepareQuad = new FullScreenQuad(null);
    if (ao) {
      if (!this.aoTarget) {
        this.aoTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0 });
        this.aoMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FinishShader.vertexShader, fragmentShader: AOFragment, depthTest: false, depthWrite: false, toneMapped: false });
        this.aoMat.extensions = { derivatives: true };
      } else if (this.aoTarget.width !== w || this.aoTarget.height !== h) this.aoTarget.setSize(w, h);
      this.prepareQuad.material = this.aoMat;
      renderer.setRenderTarget(this.aoTarget); this.prepareQuad.render(renderer);
      U.tAO.value = this.aoTarget.texture; U.uPreparedAO.value = 1;
      M.接地幅 = w; M.接地高さ = h; M.仕上げ描画回数++;
    }
    if (dof) {
      if (!this.dofTarget) {
        this.dofTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0 });
        this.dofMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FinishShader.vertexShader, fragmentShader: DofFragment, depthTest: false, depthWrite: false, toneMapped: false });
      } else if (this.dofTarget.width !== w || this.dofTarget.height !== h) this.dofTarget.setSize(w, h);
      this.prepareQuad.material = this.dofMat;
      renderer.setRenderTarget(this.dofTarget); this.prepareQuad.render(renderer);
      U.tDof.value = this.dofTarget.texture; U.uPreparedDof.value = 1;
      M.焦点幅 = w; M.焦点高さ = h; M.仕上げ描画回数++;
    }
  }
  // 視点の行列から、前のコマへの写し（動きのぶれ用）と、深さから場所へ戻す行列を作る
  setCamera(cam) {
    const U = this.uniforms;
    U.uNear.value = cam.near; U.uFar.value = cam.far;
    U.uProjInv.value.copy(cam.projectionMatrixInverse);
    U.uPScale.value = cam.projectionMatrix.elements[5] * 0.5;
    const vp = this.cameraVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const inv = this.cameraInvVP.copy(vp).invert();
    if (this.prevVP) U.uReproj.value.multiplyMatrices(this.prevVP, inv);
    else U.uReproj.value.identity();
    // 前の行列は現在の行列と別の入れ物に保つ。開戦時の null による履歴の破棄も受け付ける。
    this.prevVP = this.cameraPrevVP.copy(vp);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uExpK.value = POST.exp;
    this.uniforms.uHeat.value = S.reduceMotion ? 0 : POST.heat;
    this.uniforms.uSmoke.value = POST.smoke;
    this.uniforms.uDrops.value = S.reduceMotion || S.rainScreen === false ? 0 : POST.drops;
    const fx = S.filmFx === false ? 0 : 1;
    this.uniforms.uVig.value = fx; this.uniforms.uGrain.value = S.reduceMotion ? 0 : fx;
    this.uniforms.tDepth.value = readBuffer.depthTexture || null;
    this.prepare(renderer, readBuffer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsq.render(renderer);
  }
  dispose() {
    if (this.aoTarget) this.aoTarget.dispose();
    if (this.dofTarget) this.dofTarget.dispose();
    if (this.aoMat) this.aoMat.dispose();
    if (this.dofMat) this.dofMat.dispose();
    if (this.prepareQuad) this.prepareQuad.dispose();
    this.mat.dispose(); this.fsq.dispose();
  }
}
