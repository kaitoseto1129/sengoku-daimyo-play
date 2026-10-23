import * as THREE from 'three';
import { TIER } from './device_tier.js';
import { HALF } from './world_common.js';
import { POST } from './post.js';

// 時間と天気の見え方。vis は見通し（霞がおよそ八割五分になる距離）、cloud は雲の影の濃さ、top は天頂の色
// morning は「朝」の戦（def.mood が 'morning' か、朝靄の戦）で day の代わりに使う
const TIME = {
  day: { sky: 0xb9c9ce, fog: 0xa4b5bc, sun: 0xfff0d8, sunI: 2.3, hemiSky: 0xbfccd6, hemiGround: 0x4a4432, hemiI: 1.0, sunPos: [70, 72, -50], vis: 900, cloud: 0.5, top: 0x527fa9, cover: 0.15, glowK: 0 },
  morning: { sky: 0xc9bdad, fog: 0xbdb9af, sun: 0xffdcaa, sunI: 2.2, hemiSky: 0xb5c5d5, hemiGround: 0x4a4232, hemiI: 1.1, sunPos: [70, 27, 85], vis: 540, cloud: 0.4, top: 0x718aa7, cover: 0.34, glowK: 0.3, glow: 0xffc39a },
  // 雨は昼の雨（鉛色の雲でも空は明るい灰）。暗い灰の霧と弱い散乱光で、近くの兵まで黒い影になっていた（10/9）
  storm: { sky: 0x8c9496, fog: 0x9ca4a6, sun: 0xd8dcd8, sunI: 1.1, hemiSky: 0xc4cac8, hemiGround: 0x76705f, hemiI: 2.0, sunPos: [30, 120, 20], vis: 200, cloud: 0, top: 0x6a7477, cover: 0.85, glowK: 0 },
  after: { sky: 0x9aa7a8, fog: 0x98a2a0, sun: 0xffe8c8, sunI: 1.7, hemiSky: 0xb3bfc2, hemiGround: 0x423d2e, hemiI: 1.05, sunPos: [-70, 58, 30], vis: 440, cloud: 0.45, top: 0x6b7f92, cover: 0.55, glowK: 0.1, glow: 0xffc890 },
  // 夜：月明かり（青白く弱い光・影は淡く）。見通しは短く、闇の向こうは黒い霞に沈む（その中に敵がいるかもしれない）
  night: { sky: 0x253048, fog: 0x2a3446, sun: 0x9bacce, sunI: 0.32, hemiSky: 0x6a7ca0, hemiGround: 0x34363c, hemiI: 0.22, sunPos: [-60, 70, 40], vis: 145, cloud: 0.3, top: 0x0a1120, cover: 0.3, glowK: 0 },
  dusk: { sky: 0xb29588, fog: 0x9e8c85, sun: 0xffa060, sunI: 1.5, hemiSky: 0x76849e, hemiGround: 0x33302c, hemiI: 0.8, sunPos: [-120, 17, -24], vis: 470, cloud: 0.25, top: 0x596783, cover: 0.45, glowK: 0.62, glow: 0xff996d },
};
// 夕暮れ：日の当たる面だけ朱に、陰は空の青を受けて冷たく（半球光を青に寄せる）
// 日なたと日陰の差：空の映り込み（scene.environment）が日陰を明るくするので、半球光はその分だけ控え、日差しを少し強める
// （半球光と空の映り込みを両方まともに足すと、日陰が日なたの半分ほどの明るさになり、影の薄い平らな絵になる）
const LIGHT_K = { sun: 1.18, hemi: 0.42 };
// 戦の定義に mood が無いときの仮の割り当て（設楽原は夜明けから始まった戦なので朝の光）
const MOOD_BY_SEED = { 57: 'morning' };

// 柔らかい影の参照回数はそのまま、天気に応じて参照の間隔だけ広げる。
// 元の画素の端数を保ち、太陽が動いても粗い格子へ影を吸着させない。
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
  /(#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)\s+vec2 texelSize = )vec2\( 1\.0 \)/,
  '$1vec2( max(1.0, shadowRadius) )');

// ---------------- 空気の遠近と雲の影（全ての材質に効く） ----------------
// 霧：距離で指数的に霞み、低い所ほど濃く（谷の靄）、太陽の方は日の色に明るむ
// 雲の影：流れる雲の下では日差しだけが弱まる（兵・木・地面すべて）
// scene.fog の near と far に値を詰めて渡す（全ての材質に新しい値を配る口が他に無いため）
//   fog.near ＝ 雲の流れた距離、fog.far ＝ 見通し（整数部）＋ 雲の影の濃さ（小数部）
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogOff;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogOff = transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor;
 varying float vFogDepth;
 varying vec3 vFogOff;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear;
  uniform float fogFar;
  float cloudH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cloudN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cloudH(i), cloudH(i + vec2(1.0, 0.0)), f.x), mix(cloudH(i + vec2(0.0, 1.0)), cloudH(i + vec2(1.0, 1.0)), f.x), f.y); }
  // 雲の影（1 ＝ 日なた）。雲は風下へ流れる（硝煙と同じ向き）
  float cloudShade(vec3 wp) {
   float s = fract(fogFar);
   if (s < 0.01) return 1.0;
   vec2 q = (wp.xz - vec2(0.565, 0.825) * fogNear) * 0.0065;
   float n = cloudN(q) * 0.62 + cloudN(q * 2.7 + 7.3) * 0.38;
   return 1.0 - s * smoothstep(0.52, 0.66, n);
  }
 #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
 #else
  float fogD = length(vFogOff);
  float fogVis = max(20.0, floor(fogFar));
  // 終点の高さだけでなく、目から物まで通る空気の平均密度。
  // 坂下を一枚の白膜で覆わず、登りの途中にも薄い霞を残す。
  float fogY = clamp(vFogOff.y, -30.0, 120.0) * 0.024;
  float fogHf = abs(fogY) < 0.01 ? 1.0 - fogY * 0.5 : (1.0 - exp(-fogY)) / fogY;
  // 進む先の兵と旗は暗部を残す。見通しの端と煙による目隠しは保つ。
  float fogPath = fogD * mix(0.04, 1.0, smoothstep(20.0, 100.0, fogD));
  // 遠景の明暗を沈める分も既存の霞へまとめる。画素ごとの別の補間は増やさない。
  // 足元は fogPath で抑え、人数・形・影を変えずに遠くの兵と旗をなじませる。
  // 白い膜で中景を埋めず、遠景だけを十分に霞ませる。
  float fogFactor = max(1.0 - exp(-fogPath / fogVis * 1.45 * fogHf - min(0.1, fogPath * 0.0007)), smoothstep(fogVis * 0.55, fogVis, fogD));
  vec3 fogC = fogColor;
  float fogTowardSun = 0.0;
  #if defined(LIT_PARS) && NUM_DIR_LIGHTS > 0
   // 日の方角の霞は、日の色に明るむ
   vec3 fogSun = normalize(transpose(mat3(viewMatrix)) * directionalLights[0].direction);
   float fogSd = max(dot(vFogOff / max(fogD, 0.001), fogSun), 0.0);
   fogTowardSun = fogSd * fogSd;
   // 日の方は明るむ（強い輪と、広く淡い明るみの二つ。逆光の霞が光る）
   fogC += directionalLights[0].color * (pow(fogSd, 6.0) * 0.04 + pow(fogSd, 2.0) * 0.016);
  #endif
  // 遠いほど空の青を帯びる（遠くの森や村が青く霞む）
  fogC = mix(fogC, fogC * vec3(0.9, 0.97, 1.08), smoothstep(60.0, 380.0, fogD) * (1.0 - fogTowardSun * 0.65));
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
 #endif
#endif`;
THREE.ShaderChunk.lights_pars_begin = '#define LIT_PARS 1\n' + THREE.ShaderChunk.lights_pars_begin;
// 画質「低」（画面の仕上げが無い時）でも、色の作りだけは残す：家の赤は残して他は少し褪せ、影は青緑・明るい所は暖かく、黒を少し浮かす
// 画面へ直に描く時だけ効く（「中」「高」は描く先が絵なので three がトーンマップを付けず、ここは通らない。仕上げは post.js）
THREE.ShaderChunk.tonemapping_fragment = `#if defined( TONE_MAPPING )
 gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
 {
  vec3 gc = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
  float gred = smoothstep(0.01, 0.08, gc.r - max(gc.g, gc.b)) * smoothstep(0.02, 0.1, gc.r);
  gc = mix(vec3(gl), gc, mix(0.8, 1.05, gred));
  // 草木の緑は黄みへ寄せてくすませる（「中」以上の仕上げと同じ向き。薄荷色の草にしない）
  float ggr = clamp((gc.g - max(gc.r, gc.b)) * 6.0, 0.0, 1.0);
  gc.r += (gc.g - gc.r) * 0.2 * ggr; gc.b -= gc.b * 0.12 * ggr;
  gc *= mix(vec3(0.93, 0.99, 1.03), vec3(1.04, 1.0, 0.94), smoothstep(0.02, 0.4, gl));
  // ゆるい S 字の階調（締まった影と、丸めた明るみ）
  gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), 0.25);
  gl_FragColor.rgb = gc * 0.96 + vec3(0.008, 0.0085, 0.01);
 }
#endif`;
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  `getDirectionalLightInfo( directionalLight, directLight );
  #if defined(USE_FOG) && !defined(FOG_EXP2)
   directLight.color *= cloudShade(cameraPosition + vFogOff);
  #endif`);

// 霞の量（霧の式と同じ。遠景の山など、霧を使わない物の色合わせに使う）
export function hazeAt(dist, vis, dy = 0) {
  const y = Math.max(-30, Math.min(120, dy)) * 0.024;
  const hf = Math.abs(y) < 0.01 ? 1 - y * 0.5 : (1 - Math.exp(-y)) / y;
  const k = Math.max(0, Math.min(1, (dist - 6) / 36));
  const path = dist * (0.12 + 0.88 * k * k * (3 - 2 * k));
  const end = Math.max(20, Math.min(140, vis)), t = Math.max(0, Math.min(1, (dist / end - 0.55) / 0.45));
  return Math.max(1 - Math.exp(-path / end * 1.9 * hf - Math.min(0.24846, path * 0.00155)), t * t * (3 - 2 * t));
}

// 風：向きはそろえ、強さはときどき変わる（突風が野を渡る）。旗や草が同じ風を使う
export const WIND_STATE = { t: 0, gust: 1, dirX: 0.565, dirZ: 0.825 };
export const GUST = { value: 1 };
export const WIND_DIR = { value: new THREE.Vector2(0.565, 0.825) };
// 濡れ具合（0〜1）：雨の中の旗は色が濃く、重く垂れる
export const WET = { value: 0 };
const BOLT_COL = new THREE.Color(0xc8d6ff);
const PALL_COL = new THREE.Color(0x9a7c5e);
const SUN_AXIS = new THREE.Vector3(0, 1, 0);

// 風で揺れる草木（頂点をずらす）
// 突風は風下へ波のように野を渡る。草は風下へ傾き、踏み荒らされた所では倒れている
const WIND = { value: 0 };
const WEAR = { value: null };
const WEAR_HALF = { value: HALF };

export class WorldWeather {

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    // 昼用の半球光は空の映り込みを見込んで弱めてある。夜の暗い空では
    // 濡れた土・黒い具足が沈むので、影にも届く散乱光を一つだけ共有する。
    // 標準材質の人・旗と、低・中の地面の材質に同じ光を当てる。影の描き直しは足さない。
    this.nightFill = new THREE.HemisphereLight(0xc0d0ed, 0x8b9bb9, 0);
    this.scene.add(this.nightFill);
    this.nightU = { value: 0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const shadowMap = TIER.weak ? 1024 : 2048;   // 記憶の少ない端末は影の的を 1/4 に（device_tier.js）
    this.sun.shadow.mapSize.set(shadowMap, shadowMap);
    const s = this.sun.shadow.camera;
    s.left = -20; s.right = 20; s.top = 20; s.bottom = -20; s.near = 1; s.far = 300;   // 影は本人の回り 20m（兵の影16m・人の影11mを覆い、近くの影を細かく保つ）
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0xaaaaaa, 40, 140);
  }


  // 時間帯の見え方を一式で作る（戦の途中で変わるときは、しばらくかけて移ろう）
  lookOf(key) {
    let t = key === 'noon' || key === 'afternoon' ? TIME.day : (key === 'day' && this.mood === 'morning') ? TIME.morning : TIME[key];
    if (key === 'storm' && this.def.stormLift) {
      const lift = Math.max(1, Math.min(2, this.def.stormLift));
      t = { ...t, sunI: Math.min(1.65, t.sunI * lift), hemiI: Math.min(2.4, t.hemiI * lift) };
    }
    // 雨の明るさと光の向きを分けて指定する。霧の距離・敵の発見範囲は変えない。
    if (key === 'storm' && this.def.stormLight) t = { ...t, ...this.def.stormLight };
    // 夏の昼（桶狭間・姉川など）：日差しが強く影が濃い、空の青が深い、遠くは陽炎で白っぽく霞む
    // 夜は陰を持ち上げて足もとを見せる。明るさを上げても見通しは伸ばさない。
    // 夜はどの戦も月明かりで兵と道の形が読める所まで上げる（大河内の夜の雨が真っ黒だった）
    if (key === 'night') {
      const L = Math.max(0.5, Math.min(3.8, this.def.nightLift ?? 3.4));
      t = { ...t, sunI: t.sunI * Math.min(1.3, L), hemiI: t.hemiI * L };
    }
    if ((key === 'noon' || key === 'afternoon' || (key === 'day' && this.mood !== 'morning')) && this.summer) t = { ...t, sunI: t.sunI * 1.14, hemiI: t.hemiI * 0.86, top: 0x4a74a6, sky: 0xa9b8c2, vis: t.vis * 0.85, cloud: t.cloud * 0.8, cover: t.cover * 0.8, sunPos: [60, 96, -40] };
    // 日中の空と地面の照り返し。時間の移ろいにも同じ指定を渡す。
    if (this.def.dayBounce && ['day', 'morning', 'noon', 'afternoon'].includes(key)) {
      t = { ...t, hemiI: t.hemiI * this.def.dayBounce, hemiGround: this.def.bounceGround ?? t.hemiGround };
    }
    return {
      sky: new THREE.Color(t.sky), fog: new THREE.Color(t.fog), sun: new THREE.Color(t.sun), sunI: t.sunI,
      hemiSky: new THREE.Color(t.hemiSky), hemiGround: new THREE.Color(t.hemiGround), hemiI: t.hemiI,
      sunDir: new THREE.Vector3(...t.sunPos).normalize(), top: new THREE.Color(t.top), glow: new THREE.Color(t.glow || 0xff9a50),
      glowK: t.glowK, cover: t.cover, cloudDark: key === 'storm' ? 0.4 : 0.1, vis: t.vis, cloud: t.cloud,
      // 山の地の色（霞は別に掛ける）：近い山は濃い杉の緑、遠いほど青い
      mount: key === 'night' ? [0x293442, 0x324152, 0x405168] : key === 'dusk' ? [0x2c2a2c, 0x3a3a44, 0x4a4c5a] : key === 'storm' ? [0x2a302e, 0x384040, 0x464e50] : [0x24332c, 0x33443e, 0x4a5a5e],
    };
  }

  // 今の見え方を読み取る（ほかの戦が直に書き換えた値も拾う）
  currentLook() {
    const U = this.skyMat.uniforms;
    return {
      sky: this.scene.background.clone(), fog: this.scene.fog.color.clone(), sun: this.sun.color.clone(), sunI: this.sun.intensity / LIGHT_K.sun / (this.rainDim || 1),
      hemiSky: this.hemi.color.clone(), hemiGround: this.hemi.groundColor.clone(), hemiI: (this.baseHemi ?? this.hemi.intensity) / LIGHT_K.hemi,
      sunDir: this.sunOffset.clone().normalize(), top: U.top.value.clone(), glow: U.glow.value.clone(), glowK: U.glowK.value, cover: U.cover.value, cloudDark: U.cloudDark.value,
      vis: this.look ? this.look.vis : 500, cloud: this.look ? this.look.cloud : 0.4,
      mount: this.mountMats.map((m) => m.color.getHex()),
    };
  }

  applyLook(L) {
    this.look = L;
    this.scene.background.copy(L.sky);
    this.scene.fog.color.copy(L.fog);
    // 谷の霞へ山肌の色を残す。色の入れ物は初回だけ用意する。
    if (this.def.fogTint != null) this.scene.fog.color.lerp(this.fogTint || (this.fogTint = new THREE.Color(this.def.fogTint)), this.def.fogTintStrength ?? 0.45);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI * LIGHT_K.sun * (this.rainDim || 1);
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI * LIGHT_K.hemi;
    this.baseHemi = this.hemi.intensity;
    this.sunOffset.copy(L.sunDir).multiplyScalar(120);
    const U = this.skyMat.uniforms;
    U.top.value.copy(L.top); U.bottom.value.copy(this.scene.fog.color);
    U.sunDir.value.copy(L.sunDir); U.sunCol.value.copy(L.sun);
    U.cover.value = L.cover; U.cloudDark.value = L.cloudDark;
    U.glow.value.copy(L.glow); U.glowK.value = L.glowK;
    this.mountMats.forEach((m, k) => m.color.set(L.mount[k]));
    // 星と月は夜だけ（空の色が暗い時）
    if (this.stars) { const dark = L.sky.r + L.sky.g + L.sky.b < 0.45; this.stars.visible = dark; this.moon.visible = dark; if (dark) this.moon.position.copy(L.sunDir).multiplyScalar(420); }
  }


  // 独自の夜色と時刻の夜を共通で扱い、夜へ・夜からの移ろいにも合わせる。
  nightAmount() {
    const target = this.timeKey === 'night' || this.lookDark ? 1 : 0;
    if (!this.fade) return target;
    const k = Math.min(1, this.fade.t / this.fade.dur), s = k * k * (3 - 2 * k);
    return (this.fade.fromNight || 0) * (1 - s) + target * s;
  }

  duskAmount() {
    // 時計で動く夕暮れは、段の名前より実際の日の傾きに合わせる。
    const target = this.dayClock && this.dayClock.hours[this.timeKey]
      ? Math.max(0, Math.min(1, (this.dayClock.hour - 14) / 4))
      : this.timeKey === 'dusk' ? 1 : 0;
    if (!this.fade) return target;
    const t = Math.min(1, this.fade.t / this.fade.dur), s = t * t * (3 - 2 * t);
    return (this.fade.fromDusk || 0) * (1 - s) + target * s;
  }

  prepareNight() {
    const k = this.nightAmount();
    this.nightU.value = k;
    // 夕暮れにも既存の散乱光を使い、日陰の具足と旗を浮かせる。
    // 光も影も追加せず、低画質でも共通。遠景は距離の霞を保つ。
    const dusk = this.duskAmount();
    // 雨の散乱光は曇った空の灰青。夜は既存の月の光と影で、
    // 兜・斜面の月に向いた面を読み、背面や軒下には暗がりを残す。
    const rain = Math.max(0, Math.min(1, this.rainLevel || 0));
    // 補助光だけを足すと兵も山肌も同じ灰青になる。既存の月の直射を強め、
    // 兜の縁・肩・具足の受光面と、その裏の陰を分ける。月の向きと影は共通。
    this.sun.intensity = Math.max(this.sun.intensity, (this.def.nightMoonMin ?? 0.95) * k);
    // 晴天の補助光が空の映り込み・半球光と重なると、門の陰も土も白く浮く。
    // 晴れは弱い空の返りだけにし、雲・雨が増えた時だけ従来の散乱光まで戻す。
    // 日差しと遠景の霞は保ち、近い具足の受光面・木戸の陰との明暗差を出す。
    const cover = this.skyMat.uniforms.cover.value;
    const scatter = THREE.MathUtils.smoothstep(Math.max(cover, rain), 0.35, 0.85);
    const dayFill = (0.28 + 0.54 * scatter) * (this.def.overcastFillScale ?? 1);
    // 夜の指定と雨・夕暮れの見やすさは保ち、移ろいの間も連続して変える。
    this.nightFill.intensity = dayFill * (1 - k) + (this.def.nightFill ?? 0.62) * k + (0.4 * dusk + 0.35 * rain * (1 - dusk) * (this.def.overcastFillScale ?? 1)) * (1 - k);
    // 夜の下向きの面は土からの弱い返りだけ。月の冷色と火の暖色を分ける。
    this.nightFill.color.setRGB(0.75 - 0.30 * k, 0.82 - 0.29 * k, 0.93 - 0.25 * k).lerp(this.hemi.color, 0.3 * (1 - k));
    this.nightFill.groundColor.setRGB(0.28 - 0.16 * k, 0.25 - 0.12 * k, 0.21 - 0.05 * k);
    // 晴天は締まった影、低い日・曇天・雨は柔らかい縁。影の枚数は増やさない。
    const height = Math.max(0, this.skyMat.uniforms.sunDir.value.y);
    this.sun.shadow.radius = 1 + cover * 0.8 + rain * 0.55 + (1 - height) * 0.3;
    // 昼の散乱光は頭上の空から。太陽に追従させて木戸の側面まで持ち上げない。
    // 夜は従来の月の向きへ寄せる。既存の光を使い、光源も影の描画も増やさない。
    this.nightFill.position.copy(this.sunOffset).normalize();
    this.nightFill.position.y = Math.max(0.65, this.nightFill.position.y);
    this.nightFill.position.multiplyScalar(k);
    this.nightFill.position.y += 1 - k;
    return k;
  }


  setTime(key) {
    const fromNight = this.nightAmount(), fromDusk = this.duskAmount();
    const prev = this.timeKey;
    this.timeKey = key;
    if (!this.scene.background || !this.scene.background.isColor) this.scene.background = new THREE.Color();
    if (!this.sunOffset) this.sunOffset = new THREE.Vector3();
    // 晴れた戦の朝・昼・夕は、時計が続けて移ろわせる。天気の移ろいは下の既存の作りを使う。
    if (this.dayClock && (key === 'day' || key === 'afternoon' || key === 'dusk')) {
      this.fade = null;
      this.dayClock.tick(0);
      this.fireLightT = 0;
      return;
    }
    const to = this.lookOf(key);
    // 雷雨の頭は石まじり（雹）：最初の十数秒だけ白い粒が混じり、地面で跳ねる（桶狭間の「石まじりの雨」）
    if (key === 'storm' && prev !== 'storm' && this.def.hail) this.hailT = 14;
    // 戦の途中で夕暮れ・雨・雨上がりへ変わるときは、二十秒ほどかけて移ろう（朝や昼へ戻すときは、戦の側が直に値を触ることがあるのですぐ変える）
    if (prev && prev !== key && key !== 'day' && (this.time || 0) > 10) {
      this.fade = { from: this.currentLook(), to, fromNight, fromDusk, t: 0, dur: key === 'storm' ? 12 : key === 'dusk' ? 60 : 24, env: 0 };
    } else {
      this.fade = null;
      this.applyLook(to);
      this.updateEnv();
    }
    this.fireLightT = 0;   // 光の付け替えをすぐやり直す
  }


  // 見え方の移ろい
  updateFade(dt) {
    const F = this.fade;
    if (!F) return;
    F.t += dt;
    const k = Math.min(1, F.t / F.dur), s = k * k * (3 - 2 * k);
    const a = F.from, b = F.to;
    // 作業用の入れ物は一度だけ作って使い回す（移ろっている間、毎コマ色を clone・new しない）
    const L = this._fadeL || (this._fadeL = {
      sky: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
      top: new THREE.Color(), glow: new THREE.Color(), sunDir: new THREE.Vector3(), mount: [], c1: new THREE.Color(), c2: new THREE.Color(),
    });
    const c = (p) => L[p].copy(a[p]).lerp(b[p], s), n = (p) => a[p] + (b[p] - a[p]) * s;
    for (let i = 0; i < a.mount.length; i++) L.mount[i] = L.c1.set(a.mount[i]).lerp(L.c2.set(b.mount[i]), s).getHex();
    L.sky = c('sky'); L.fog = c('fog'); L.sun = c('sun'); L.hemiSky = c('hemiSky'); L.hemiGround = c('hemiGround'); L.top = c('top'); L.glow = c('glow');
    L.sunDir.copy(a.sunDir).lerp(b.sunDir, s).normalize();
    L.sunI = n('sunI'); L.hemiI = n('hemiI'); L.glowK = n('glowK'); L.cover = n('cover'); L.cloudDark = n('cloudDark'); L.vis = n('vis'); L.cloud = n('cloud');
    this.applyLook(L);
    // 映り込みは移ろい終わった時に一度だけ作り直す（途中で何度も焼き直すと、一回ごとにコマが大きく止まる）
    if (k >= 1) this.updateEnv();
    if (k >= 1) this.fade = null;
  }


  // 稲妻の線：遠い山の向こうの空に、ぎざぎざの光の帯（太い芯と淡い光の二重）を一瞬描く。近い雷ほど手前に大きく
  prepareBolt() {
    if (!this.bolt) {
      // 二層の帯を一つの形に束ねる。平らな帯なので裏表を分けて描く必要はない。
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
      const g = new THREE.BufferGeometry();
      // 幹は最大十七節、枝は四節。各節に芯六頂点・淡い光六頂点を並べる。
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 36), 3).setUsage(THREE.DynamicDrawUsage));
      const colors = new Float32Array(21 * 12 * 4), core = new THREE.Color(0xeef2ff), glow = new THREE.Color(0x8ea4ff);
      for (let i = 0; i < 21 * 12; i++) {
        const isCore = i % 12 < 6, c = isCore ? core : glow, at = i * 4;
        colors[at] = c.r; colors[at + 1] = c.g; colors[at + 2] = c.b; colors[at + 3] = isCore ? 0.95 : 0.22;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      g.setDrawRange(0, 0);
      this.bolt = new THREE.Mesh(g, mat);
      this.boltPoints = new Float64Array(18 * 2);
      this.boltBranch = new Float64Array(5 * 2);
      this.bolt.renderOrder = -1;
      this.bolt.frustumCulled = false;
      // 閃光前の色も支度中に用意し、雷が鳴るたびに複製しない。
      this.hemiCol0 = this.hemi.color.clone();
      this.scene.add(this.bolt);
      this.bolt.visible = false;
    }
  }


  showBolt(focus) {
    this.prepareBolt();
    const D = Math.max(300, Math.min(455, 250 + (this.boltD || 900) * 0.1)), a = Math.random() * Math.PI * 2;
    const cx = Math.sin(a), cz = Math.cos(a), rx = cz, rz = -cx;   // 横の向き（見る向きに直角）
    // 幹：上から下へ、横にぎざぎざ。途中から枝が一本
    const pts = this.boltPoints, br = this.boltBranch;
    pts[0] = 0; pts[1] = 230;
    let x = 0, y = 230, count = 1;
    while (y > 0) { y -= 14 + Math.random() * 16; x += (Math.random() - 0.5) * 26; pts[count * 2] = x; pts[count * 2 + 1] = Math.max(-5, y); count++; }
    const bi = 2 + Math.floor(Math.random() * 3);
    let bx = pts[bi * 2], by = pts[bi * 2 + 1];
    br[0] = bx; br[1] = by;
    const bs = Math.random() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 4; k++) { by -= 12 + Math.random() * 10; bx += bs * (8 + Math.random() * 12); br[k * 2] = bx; br[k * 2 + 1] = by; }
    const g = this.bolt.geometry, attr = g.attributes.position, pos = attr.array;
    for (let layer = 0; layer < 2; layer++) {
      const w = layer ? 12 : 2.2;
      let segment = 0;
      for (let branch = 0; branch < 2; branch++) {
        const L = branch ? br : pts, n = branch ? 5 : count;
        for (let i = 0; i < n - 1; i++) {
          const x0 = L[i * 2], y0 = L[i * 2 + 1], x1 = L[i * 2 + 2], y1 = L[i * 2 + 3];
          const ww = w * (i === 0 ? 0.7 : 1) * (branch ? 0.6 : 1);
          let at = segment++ * 36 + layer * 18;
          for (let v = 0; v < 6; v++) {
            const end = v === 2 || v >= 4, px = end ? x1 : x0, py = end ? y1 : y0;
            const offset = v === 0 || v === 3 || v === 5 ? -ww : ww;
            pos[at++] = cx * D + rx * (px + offset); pos[at++] = py; pos[at++] = cz * D + rz * (px + offset);
          }
        }
      }
    }
    g.setDrawRange(0, (count - 1 + 4) * 12); attr.needsUpdate = true;
    this.bolt.position.set(focus.x, 0, focus.z);
    this.bolt.visible = true;
  }


  // 煙の帳：燃える堂・町（大きな火）が多いほど、空が茶色く濁り、霞が煤けて、日差しが弱まる
  // 霧の色と日の強さは、前のコマで足した分を戻してから掛け直す（戦の側が色を変えたら、それを新しい元にする）
  updatePall(dt, focus) {
    let want = 0;
    for (const f of this.fires) if ((f.size || 0) >= 2) want += f.size / 18 * (1 - Math.min(1, Math.hypot(f.x - focus.x, f.z - focus.z) / 260));
    // 比叡山のように戦の側で煙の空へ変える戦もあるので、ここでは薄く重ねるだけ
    want = Math.min(0.45, want);
    this.pall = (this.pall || 0) + (want - (this.pall || 0)) * Math.min(1, dt * 0.08);
    // 覚え書きの入れ物は一度だけ作って使い回す（大火の間、毎コマ色を new しない）。pallOn が立っている間だけ中身が生きている
    const P = this.pallOn ? this.pallSet : null;
    const fog = this.scene.fog.color, sun = this.sun;
    if (P) {
      if (fog.equals(P.fogOut)) fog.copy(P.fog);
      if (Math.abs(sun.intensity - P.sunOut) < 1e-4) sun.intensity = P.sun;
    }
    const k = this.pall;
    this.skyMat.uniforms.pall.value = k;
    if (k < 0.005) { this.pallOn = false; return; }
    const Q = this.pallSet || (this.pallSet = { fog: new THREE.Color(), fogOut: new THREE.Color(), sun: 0, sunOut: 0, hsl: {}, c: new THREE.Color() });
    Q.fog.copy(fog); Q.sun = sun.intensity;
    fog.lerp(Q.c.copy(PALL_COL).multiplyScalar(0.45 + fog.getHSL(Q.hsl).l * 0.8), k * 0.4);
    sun.intensity *= 1 - k * 0.35;
    Q.fogOut.copy(fog); Q.sunOut = sun.intensity; this.pallOn = true;
  }


  // 露出の目当て：空の明るさから決める（昼 1、夕暮れ 0.94、嵐 0.88、夜 0.8 ほど）。雨は少し暗く、夕暮れは朱に寄せる
  // 画面の明暗順応（post.js）は暗い場面を明るく戻そうとするので、夜や嵐が昼のように見えないよう、ここで少し絞る
  // 目が慣れるように 2 秒ほどかけて寄せる
  // 夏と分かった時（戦の始めだけ）に、夏の昼の見え方へ切り替える
  setSummer(on) {
    if (this.summer === !!on) return;
    this.summer = !!on;
    if (this.dayClock) this.dayClock.noon = this.lookOf('noon');
    if (this.timeKey === 'day' && (this.time || 0) < 5 && !this.fade) this.setTime('day');
  }

  updateExposure(dt) {
    const c = this.scene.background;
    if (!c || !c.isColor) return;
    const L = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    let want = 0.72 + 0.43 * Math.sqrt(Math.max(0, L));
    want *= 1 - (this.rainLevel || 0) * 0.08;
    want = Math.max(0.74, Math.min(1.04, want));
    // 夜の近景を持ち上げた後で、空の暗さ・雨を理由に再び絞らない。
    want += (1 - want) * this.nightAmount();
    POST.exp += (want - POST.exp) * Math.min(1, dt / 2);
    // 陽炎：夏の晴れた昼だけ、遠くの景色がゆらぐ（post.js）
    const heat = this.summer && this.timeKey === 'day' && this.mood !== 'morning' ? 1 - (this.rainLevel || 0) : 0;
    POST.heat += (heat - POST.heat) * Math.min(1, dt / 3);
  }
}

export { WIND, WEAR, WEAR_HALF, MOOD_BY_SEED, SUN_AXIS, BOLT_COL, TIME };
