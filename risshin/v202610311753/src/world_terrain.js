import { SEG, rng, distToPolyline, NO_STREAMS } from './world_common.js';
import * as THREE from 'three';
import { liteMat } from './world_vegetation_materials.js';
import { dirtTex, grassTex, bankTex, mudTex, stoneTex, macroTex, gravelTex, groundDetailTex } from './nature.js';
import { S as SETTINGS } from './settings.js';
import { WIND, WIND_STATE } from './world_weather.js';
import { terrainView } from './terrain_view.js';
import { castleMaskBlank } from './castle_mask.js';
import { groundDetailPack, battleGroundTex, groundGrade } from './ground_photo.js';
// soilTones：雨後の野（wetFieldRuts）の草・土・泥の暗い側と明るい側の色を戦ごとに替える（{ grass:[[r,g,b],[r,g,b]], dirt, mud }）。
// 組み立て時の定数だけで、絵の読み出しと描く回数は増やさない（10/30 長島）。
const soilTone = (def, k, i, d) => def.soilTones && def.soilTones[k] ? 'vec3(' + def.soilTones[k][i].map((v) => Number(v).toFixed(3)).join(', ') + ')' : d;


export class WorldTerrain {

  // 地面：草・踏み固めた土・泥・岩肌を場所ごとに混ぜる（頂点に混ぜる割合を持たせ、絵は世界の座標で貼る）
  buildTerrain() {
    // 通常は描く格子だけ減らす。急な切岸の戦は指定により足場とそろえる。
    const segments = false && !this.def.keepTerrainGrid ? 96 : SEG;
    const geo = new THREE.PlaneGeometry(this.half * 2, this.half * 2, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const splat = new Float32Array(pos.count * 3);
    const water = new Float32Array(pos.count);
    const cover = new Float32Array(pos.count * 2);
    const slopeTint = this.def.slopeForestTint ? new Float32Array(pos.count * 3) : null;
    const c = new THREE.Color();
    const R = rng(7);
    const paths = this.def.paths || [];
    const muddy = this.def.muddy ?? 0.35;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + this.half) / this.step), j = Math.round((z + this.half) / this.step);
      const h = segments === SEG ? this.grid[j * (SEG + 1) + i] : this.heightAt(x, z);
      pos.setY(k, h);
      const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + (R() - 0.5) * 0.35;
      c.setRGB(0.26 + n * 0.05, 0.33 + n * 0.06, 0.17 + n * 0.03);
      let pd = Infinity;
      for (const p of paths) pd = Math.min(pd, distToPolyline(x, z, p) * 2 / (p.w ?? this.def.pathWidth ?? 2));
      if (this.def.softPathSoil) {
        // 雨の川原は土と草を連続して混ぜ、格子ごとの色の段を作らない。
        const t = THREE.MathUtils.smoothstep(pd, 1, 3);
        c.setRGB(THREE.MathUtils.lerp(0.36 + n * 0.04, c.r, t),
          THREE.MathUtils.lerp(0.30 + n * 0.03, c.g, t), THREE.MathUtils.lerp(0.21, c.b, t));
      }
      else if (pd < 2) c.setRGB(0.36 + n * 0.04, 0.30 + n * 0.03, 0.21);
      else if (pd < 3) c.lerp(new THREE.Color(0.34, 0.31, 0.21), 0.5);
      if (this.def.tint) this.def.tint(x, z, h, c);
      if (slopeTint) { slopeTint[k * 3] = c.r; slopeTint[k * 3 + 1] = c.g; slopeTint[k * 3 + 2] = c.b; }
      // 色から、草・土・泥の割合を読む（緑が勝つほど草）
      let grass = Math.max(0, Math.min(1, (c.g - (c.r + c.b) / 2 - 0.02) / 0.08));
      // 夜の土色へ寄せても草まで消さない。配分だけを指定し、地形と歩行は保つ。
      if (this.def.grassMix) grass = Math.max(0, Math.min(1, this.def.grassMix(x, z, pd)));
      // 道の縁は草がまばらに残る
      if (pd >= 1.4 && pd < 3) grass = Math.max(grass, Math.min(1, (pd - 1.4) / 1.6) * (0.6 + R() * 0.4));
      grass *= this.groundCoverAt(x, z);
      let dirt = 1 - grass;
      // 泥：道の真ん中と、低い所の水はけの悪い所
      const wetSpot = Math.max(0, Math.sin(x * 0.09 + 1.3) * Math.cos(z * 0.11) - 0.55) * 2.2;
      const pathMud = this.def.softPathSoil ? 0.8 * (1 - THREE.MathUtils.smoothstep(pd, 1, 2.6)) : pd < 1.8 ? 0.8 : 0;
      const wetSoil = this.def.softPathSoil ? 0.5 + 0.5 * THREE.MathUtils.smoothstep(dirt, 0.3, 0.7) : dirt > 0.5 ? 1 : 0.5;
      let mud = Math.min(1, pathMud * muddy + wetSpot * muddy * wetSoil);
      dirt *= 1 - mud * 0.8; grass *= 1 - mud * 0.6;
      // 小川の岸は泥と土
      for (const st of this.def.streams || []) { const d = distToPolyline(x, z, st.pts); if (d < st.w * 1.8) { const b = 1 - d / (st.w * 1.8); mud = Math.max(mud, b * 0.8); grass *= 1 - b; } }
      const t = grass + dirt + mud || 1;
      splat[k * 3] = grass / t; splat[k * 3 + 1] = dirt / t; splat[k * 3 + 2] = mud / t;
      // 水を張った田
      water[k] = this.field.wet && this.def.paddy ? this.def.paddy(x, z) : 0;
      // puddles：踏み荒らした窪みの水たまり（見た目だけ。田の歩みや足の遅れには入れない）
      if (this.def.puddles) water[k] = Math.max(water[k], this.def.puddles(x, z));
      // 岸の濡れは雨が止んでも残る。植生のない道・田には林床を置かない。
      let bank = 0;
      for (const st of this.def.streams || NO_STREAMS) {
        const d = distToPolyline(x, z, st.pts);
        bank = Math.max(bank, Math.max(0, 1 - Math.abs(d - st.w) / 3));
      }
      const W = this.def.water;
      if (W) bank = Math.max(bank, Math.max(0, 1 - Math.abs(x - W.x) / 3), W.x2 == null ? 0 : Math.max(0, 1 - Math.abs(x - W.x2) / 3));
      cover[k * 2] = bank;
      const forest = this.def.treeDensity ? Math.max(0, Math.min(1, this.def.treeDensity(x, z))) : 0.5;
      cover[k * 2 + 1] = (this.def.trees === 0 || this.def.clear?.(x, z) || water[k] > 0.3 || pd < 3) ? 0 : forest;
    }
    if (slopeTint) geo.setAttribute('slopeTint', new THREE.BufferAttribute(slopeTint, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
    this.splat = splat; this.waterW = water;
    geo.setAttribute('water', new THREE.BufferAttribute(water, 1));
    geo.setAttribute('groundCover', new THREE.BufferAttribute(cover, 2));
    geo.computeVertexNormals();
    // 地表の絵を材質にも登録する。独自の混合処理の準備中も白い無地にせず、
    // 共用の土の絵を使う。混合後は世界座標で読むので二重には掛けない。
    // groundPhoto：戦ごとの土の写真（10/30。金ヶ崎・長島・箕作）。共用の土の写真と入れ替えるだけで絵の口は増やさない。
    // scale：土の写真の縮尺（一枚が 1/scale m。離れても草の根や小石が見える大きさに）。
    // contrast：写真の明暗をならした色のまわりで強める量（画質「高」の時だけ）。
    // mudFromSoil：泥にも同じ写真を使い、共用の泥の写真を読まない（絵の数を前と同じに保つ）。
    const soilPhoto = this.def.groundPhoto && this.def.groundPhoto.dirt ? battleGroundTex(this.def.groundPhoto.dirt) : null;
    const mat = liteMat({ color: 0xffffff, map: soilPhoto || dirtTex(), roughness: 0.95, metalness: 0, envMapIntensity: this.def.wetFieldRuts ? 0.2 : 0.55 });
    // 坂は本人の足より高くても地面。屋根・柱を抜く処理へ渡すと、
    // 手前の山肌が画面中央の四角い範囲で消え、空の色が露出する。
    mat.userData.camNearSolid = true;
    // 道肩の湿乾差・草の斑・濡れた踏み溝は、それぞれの指定に合う描き方を使う。
    mat.customProgramCacheKey = () => `ground|${!!(this.def.patchyGround || this.def.roadsideGrass)}|${!!this.def.slopeForestTint}|${this.half}|${!!this.def.autumn}|${this.def.autumnLeafMix ?? 1}|${!!this.def.winter}|${!!this.def.snow}|${SETTINGS.quality}|${!!this.def.springSnowPatch}|${JSON.stringify(this.def.gravelCourt || null)}|${!!this.def.softEarthCrust}|${!!this.def.stableSlopeGrain}|${!!this.def.subtleMudRelief}|${!!this.def.churnedMud}|${!!this.def.sparseEarthCrust}|${!!this.def.stableCliffGrain}|${!!this.def.stableRockProjection}|${!!this.def.patchyGround}|${this.def.wetFieldRuts || false}|${JSON.stringify(this.def.trampledField || null)}|${this.def.cliffTurf || 0}|${this.def.muddyCastleFloor || 0}|${(this.def.dirtTint || []).join(',')}|${JSON.stringify(this.def.soilTones || null)}${this.def.photoSoilMix == null ? '' : '|psm' + this.def.photoSoilMix}${this.def.groundPhoto ? '|gp' + JSON.stringify(this.def.groundPhoto) : ''}`;
    // 通行の跡を持つ戦は無地の泥を使う。窪みと足形を残す指定の戦だけ従来の絵へ戻す。
    this.groundU = { tGrass: { value: grassTex(!!this.def.plainGrassGround) }, tDirt: { value: soilPhoto || dirtTex() }, tBank: { value: bankTex() }, tMud: { value: soilPhoto && this.def.groundPhoto.mudFromSoil ? soilPhoto : mudTex(this.def.wetFieldRuts === 'wear' && !this.def.mudImprints) }, tStone: { value: stoneTex() }, tMacro: { value: macroTex() }, uWet: { value: 0 }, uForest: { value: this.def.slopeForest ?? 0 }, uRock: { value: this.def.cliffRock ?? 0 }, uNight: this.nightU, uSoilRain: { value: 0 }, tWear: { value: this.wearTex }, uTime: { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } }, uSoilSky: { value: this.hemi.color }, tCastle: { value: castleMaskBlank() }, uCastle: { value: new THREE.Vector4(0, 0, 0, 0) } };
    if (SETTINGS.quality !== 'high') {
      const grassPhoto = groundDetailTex('grass'), dirtPhoto = groundDetailTex('dirt');
      this.groundU.tGrassPhoto = { value: grassPhoto };
      this.groundU.tDirtPhoto = { value: dirtPhoto };
      this.groundU.uGrassPhotoReady = grassPhoto.userData.photoReady;
      this.groundU.uDirtPhotoReady = dirtPhoto.userData.photoReady;
    }
    if (this.def.gravelCourt) this.groundU.tCourt = { value: gravelTex() };
    // 手本の写真の地面の色（重ね塗りで使う）。地面の uniform へそのまま写さないよう、数えない持ち物にする。
    Object.defineProperty(this.groundU, 'groundGrade', { value: groundGrade(this.def.battleKey, !!this.def.groundPhoto), enumerable: false });
    {
      // 野の混ぜ塗り（10/28 leap_ground）：高さ・日の向き・季節・朝夕の霜を、絵や面を足さずに uniform で渡す。
      // 値は戦ごとに違うので、描き方の文には焼き込まない（同じ描き方を別の戦で使い回しても崩れない）。
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); if (y < lo) lo = y; if (y > hi) hi = y; }
      const t = this.def.time, cold = t === 'morning' || t === 'night' || t === 'dawn';
      const snowy = !!this.def.snow;
      const winter = !!this.def.winter && !snowy, autumn = !!this.def.autumn && !winter && !snowy;
      // x：枯れ色へ寄せる量　y：霜　z：低い所の湿り　w：高さの効き（平らな戦は 0）
      this.groundU.uLandSeason = { value: new THREE.Vector4(winter ? 0.55 : autumn ? 0.3 : 0.0,
        winter ? (cold ? 0.55 : 0.22) : autumn && cold ? 0.1 : 0.0, this.def.wetFieldRuts ? 0.25 : 0.45, hi - lo > 3 ? 1 : 0) };
      this.groundU.uLandHeight = { value: new THREE.Vector2(lo, Math.max(1, hi - lo)) };
      const self = this, sunFallback = new THREE.Vector3(0.5, 1, 0.6);
      this.groundU.uLandSun = { get value() { return self.sunOffset && self.sunOffset.lengthSq() > 0 ? self.sunOffset : sunFallback; } };
    }
    {
      // 野の重ね塗り（10/28 leap_ground2）：戦ごとに地面の描き方を差し替えても（金ヶ崎など）、
      // 最後に一度だけ「斑・踏み跡・轍・湿った窪み」を重ねる。差し替えの中から前の描き方を呼ぶ戦もあるので、
      // 呼ばれた深さを数え、一番外の呼び出しの終わりにだけ足す。
      const U = this.groundU;
      let depth = 0;
      const wrap = (f) => function (sh, renderer) {
        depth++;
        try { if (f) f.call(this, sh, renderer); } finally { depth--; }
        if (depth === 0) landOverlay(sh, U);
      };
      let current = wrap(null);
      Object.defineProperty(mat, 'onBeforeCompile', { configurable: true, get: () => current, set: (f) => { current = wrap(f); } });
    }
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.groundU);
      if (SETTINGS.quality !== 'high') sh.fragmentShader = 'uniform sampler2D tGrassPhoto, tDirtPhoto; uniform float uGrassPhotoReady, uDirtPhotoReady;\n' + sh.fragmentShader;
      sh.fragmentShader = 'uniform vec4 uLandSeason; uniform vec2 uLandHeight; uniform vec3 uLandSun;\n' + sh.fragmentShader;
      sh.vertexShader = 'attribute vec3 splat;\nattribute float water;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWater = water;\n vSplat = splat;\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.vertexShader = 'attribute vec2 groundCover; varying vec2 vGroundCover;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGroundCover = groundCover;');
      if (SETTINGS.quality === 'high') {
        // 512角の最小段は一画素。模様を割る平均値は、画素ごとに二度読まず頂点へ渡す。
        // 同じ絵の最小段なので、読み込み後の差し替えにもそのまま追従する。
        sh.vertexShader = '#if __VERSION__ >= 300\n#define soilTextureLod textureLod\n#else\n#define soilTextureLod texture2DLod\n#endif\nuniform sampler2D tGrass, tDirt, tMud; varying vec3 vSoilMean;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vSoilMean = vec3(dot(soilTextureLod(tGrass, vec2(0.5), 9.0).rgb, vec3(1.0)),
            dot(soilTextureLod(tDirt, vec2(0.5), 9.0).rgb, vec3(1.0)),
            dot(soilTextureLod(tMud, vec2(0.5), 9.0).rgb, vec3(1.0)));`);
        sh.fragmentShader = 'varying vec3 vSoilMean;\n' + sh.fragmentShader;
      }
      if (slopeTint) {
        sh.vertexShader = 'attribute vec3 slopeTint; varying vec3 vSlopeTint;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSlopeTint = slopeTint;');
        sh.fragmentShader = 'varying vec3 vSlopeTint;\n' + sh.fragmentShader;
      }
      sh.fragmentShader = 'varying vec2 vGroundCover;\n' + 'uniform sampler2D tGrass, tDirt, tBank, tMud, tStone, tMacro, tWear, tCourt, tCastle;\nuniform vec4 uCastle;\nuniform float uWet, uTime, uSoilRain, uNight, uForest, uRock;\nuniform vec3 uSoilSky;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          float surfaceWater = vWater;
          vec2 wuv = vWP.xz;
          // 貼る向きは三角の本当の向き（頂点の法線は格子でならされ、高い切岸でも上向きが残って絵が縦に伸びる）
          vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));
          // 近くでは縦に引き伸ばした遠目の筋（沢・雨筋・樹冠の塗り）を弱め、岩と土の細かな絵を見せる
          float soilViewDistance = length(vWP - cameraPosition);
          float farK = smoothstep(22.0, 85.0, soilViewDistance);
          float macro = texture2D(tMacro, wuv * 0.006).r;
          float macro2 = texture2D(tMacro, wuv * 0.023 + 0.37).r;
          // 同じ絵の繰り返しが見えないよう、向きと縮尺を変えたもう一枚を、大きな斑に合わせて混ぜる
          vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * wuv;
          float mixK = smoothstep(0.35, 0.65, macro2);
          // 写真の主の繰り返しは約2.2〜2.4m。平地・坂・切岸で縮尺をそろえる。
          vec3 grass = mix(texture2D(tGrass, wuv * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb, texture2D(tGrass, ruv * ${SETTINGS.quality === 'high' ? '0.26' : '0.13'} + 0.31).rgb, mixK * 0.7) * mix(0.8, 1.2, texture2D(tGrass, wuv * 0.037).g * 1.6);
          grass = mix(grass, grass * vec3(1.12, 1.02, 0.8), smoothstep(0.55, 0.8, macro2));   // 枯れ色の斑
          ${this.def.autumn && !this.def.winter && !this.def.snow ? `
          // 秋は草の株ごとに灰緑と枯草を混ぜる。土と苔の斑や、雪のある戦はそのまま。
          grass *= mix(vec3(1.02, 0.94, 0.78), vec3(1.18, 0.9, 0.65), smoothstep(0.35, 0.75, macro2));
          ` : ''}
          vec3 dirt = mix(texture2D(tDirt, wuv * ${this.def.groundPhoto?.scale ? this.def.groundPhoto.scale.toFixed(3) : SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb, texture2D(tDirt, ruv * ${this.def.groundPhoto?.scale ? (this.def.groundPhoto.scale * 0.48).toFixed(3) : SETTINGS.quality === 'high' ? '0.22' : '0.11'} + 0.57).rgb, mixK * 0.6) * mix(0.85, 1.12, macro2);
          ${this.def.groundPhoto?.contrast && SETTINGS.quality === 'high' ? `dirt = max(vec3(0.0), vSoilMean.y * 0.333 + (dirt - vSoilMean.y * 0.333) * ${this.def.groundPhoto.contrast.toFixed(2)});   // groundPhoto.contrast：離れると薄れる写真の土の粒と塊の明暗を強める（10/30）` : ''}
          ${this.def.dirtTint ? `dirt *= vec3(${this.def.dirtTint.map((v) => Number(v).toFixed(3)).join(', ')});   // dirtTint：戦ごとの土の色（稲生は砂色でなく黒みの土。10/28）` : ''}
          ${this.def.patchyGround || this.def.roadsideGrass ? `
          // 広い裸地にも湿乾差をつなぐ。既存の大小の斑だけを使い、絵の読み出しは増やさない。
          float dampSoil = smoothstep(0.38, 0.68, macro) * (1.0 - smoothstep(0.35, 0.72, macro2));
          dirt *= mix(vec3(1.06, 1.03, 0.96), vec3(0.61, 0.68, 0.62), dampSoil);
          ` : ''}
          // 足もとは細かく：近くだけ、もっと細かな縮尺の絵を重ねて、ぼやけた地面にしない
          float nearK = 1.0 - smoothstep(6.0, 15.0, soilViewDistance);
          ${SETTINGS.quality !== 'high' ? `if (nearK > 0.0) {
            // 足元だけ写真の濃淡を重ねる。色は既存の季節・土の色を残す。
            // 平均は同梱画像の線形値。従来の低画質の四回の参照を二回に減らす。
            float gf = dot(texture2D(tGrassPhoto, ruv * 0.9).rgb, vec3(0.333333)) / 0.07053749;
            float df = dot(texture2D(tDirtPhoto, ruv * 0.85).rgb, vec3(0.333333)) / 0.22738816;
            grass *= mix(1.0, clamp(gf, 0.4, 1.8), nearK * 0.5 * uGrassPhotoReady);
            dirt *= mix(1.0, clamp(df, 0.4, 1.8), nearK * 0.55 * uDirtPhotoReady);
          }` : `if (nearK > 0.0) {
            // 細かな絵の明るさを、その絵のならした明るさで割って（平均が 1 になる濃淡だけを掛ける）
            float gf = dot(texture2D(tGrass, ruv * 0.9).rgb, vec3(1.0)) / max(${SETTINGS.quality === 'high' ? 'vSoilMean.x' : 'dot(texture2D(tGrass, ruv * 0.9, 9.0).rgb, vec3(1.0))'}, 1e-3);
            float df = dot(texture2D(tDirt, ruv * 0.85).rgb, vec3(1.0)) / max(${SETTINGS.quality === 'high' ? 'vSoilMean.y' : 'dot(texture2D(tDirt, ruv * 0.85, 9.0).rgb, vec3(1.0))'}, 1e-3);
            grass *= mix(1.0, clamp(gf, 0.4, 1.8), nearK * 0.5);
            dirt *= mix(1.0, clamp(df, 0.4, 1.8), nearK * 0.55);
          }`}
          // 中くらいの坂（山道の脇・土手）も、真上から貼った草と土は坂の向きに伸びる。坂の所だけ横からも貼って混ぜる
          float slopeK = smoothstep(0.14, 0.4, 1.0 - abs(gN.y));
          if (slopeK > 0.0) {
            vec3 tw = abs(gN); tw = tw * tw; tw /= max(1e-3, tw.x + tw.y + tw.z);
            vec3 gS = (texture2D(tGrass, vWP.zy * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * tw.x + texture2D(tGrass, vWP.xy * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * tw.z) * mix(0.85, 1.12, macro2);
            vec3 dS = (texture2D(tDirt, vWP.zy * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb * tw.x + texture2D(tDirt, vWP.xy * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb * tw.z) * mix(0.85, 1.12, macro2);
            grass = mix(grass, gS + grass * tw.y, slopeK);
            dirt = mix(dirt, dS + dirt * tw.y, slopeK);
          }
          // 既に読んだ大小の斑で泥の座標を曲げ、等間隔の模様を崩す。読み出し数は保つ。
          vec3 mud = texture2D(tMud, wuv * 0.26 ${this.def.wetFieldRuts === 'wear' ? '+ vec2(macro, macro2) * 0.7' : ''}).rgb;
          ${this.def.wetFieldRuts ? `
          // 雨の野でも地肌を空の灰色へ寄せない。共用の絵の粒を残し、
          // 湿った沖積土と乾いた肩の色を大小の斑で分ける。
          // 暗い素材を固定の明るさで割ると濃淡が全て下限へ張り付く。
          // 高画質は実際の最小段の平均で割り、同じ土の粒を地肌と法線へ残す。
          float loamWave = 0.5 + 0.5 * sin(wuv.x * 0.21 + sin(wuv.y * 0.13) * 1.8)
            * cos(wuv.y * 0.17 - wuv.x * 0.06);
          float loamPatch = smoothstep(0.28, 0.72, mix(macro2 + (macro - 0.5) * 0.6, loamWave, 0.55));
          float dirtGrain = clamp(dot(dirt, vec3(0.333)) / max(0.003, ${SETTINGS.quality === 'high' ? 'vSoilMean.y * 0.333' : '0.14'}), 0.4, 1.8);
          float clayGrain = clamp(dot(mud, vec3(0.333)) / max(0.003, ${SETTINGS.quality === 'high' ? 'vSoilMean.z * 0.333' : '0.055'}), 0.45, 1.7);
          // 草の下地も雨後の土と同じ明るさの範囲へ収める。
          // 素材の明るい枯草が灰白色の面を作らず、既存の粒と群落の境を残す。
          float fieldGrassGrain = clamp(dot(grass, vec3(0.333)) / max(0.003, ${SETTINGS.quality === 'high' ? 'vSoilMean.x * 0.333' : '0.12'}), 0.5, 1.65);
          grass = mix(grass, mix(${soilTone(this.def, 'grass', 0, 'vec3(0.075, 0.095, 0.038)')}, ${soilTone(this.def, 'grass', 1, 'vec3(0.115, 0.14, 0.062)')}, loamPatch)
            * fieldGrassGrain, 0.72);
          // 土色への補正で元の粒まで塗り潰さない。近景から中景へ写真の濃淡を残す。
          dirt = mix(dirt * ${this.def.groundPhoto ? 'vec3(0.92, 0.9, 0.86)' : 'vec3(0.9, 0.81, 0.66)'},   // 戦ごとの土の写真は橙へ寄せない
            mix(${soilTone(this.def, 'dirt', 0, 'vec3(0.125, 0.095, 0.06)')}, ${soilTone(this.def, 'dirt', 1, 'vec3(0.18, 0.14, 0.085)')}, loamPatch) * dirtGrain, ${(this.def.photoSoilMix ?? (this.def.groundPhoto ? 0.3 : 0.8)).toFixed(2)});   // photoSoilMix：戦ごとの土の写真（groundPhoto）の色を残す量（10/30 長島）
          mud = mix(mud * ${this.def.groundPhoto ? 'vec3(0.62, 0.6, 0.56)' : 'vec3(0.78, 0.69, 0.55)'},
            mix(${soilTone(this.def, 'mud', 0, 'vec3(0.085, 0.065, 0.043)')}, ${soilTone(this.def, 'mud', 1, 'vec3(0.125, 0.095, 0.06)')}, loamPatch) * clayGrain, 0.8);
          ` : ''}
          // 粘土の細かな塊を近景だけ重ねる。泥の広い色むらと別の縮尺にする。
          ${`
          if (nearK > 0.0) {
            float mudGrain = dot(texture2D(tMud, ruv * 1.7).rgb, vec3(0.333));
            mud *= mix(1.0, clamp(mudGrain / max(0.015, dot(mud, vec3(0.333))), 0.65, 1.35), nearK * 0.45);
          }
          `}
          vec3 stone = texture2D(tStone, wuv * 0.12).rgb;
          // 崖・切岸の岩肌：真上から貼った絵は立った面で縦に伸びて「灰色の板」に見えるので、立った面は横から貼る。
          // 風化した岩塊と、割れ目の暗がり・苔の斑を足す（全画質で効く。絵の読みは三回だけ）
          {
            vec3 an = abs(normalize(vWN)); an = mix(an, abs(gN), 0.85);
            float side = smoothstep(0.35, 0.75, 1.0 - an.y);
            if (side > 0.0) {
              // 法線で座標を混ぜると、原点から離れた曲面ほど模様が圧縮される。
              // 全ての戦で二方向の色を混ぜる。同じ三回の読み出しで斑も使い回す。
              vec3 sst = (texture2D(tStone, vWP.zy * vec2(0.11, 0.16)).rgb * an.x
                + texture2D(tStone, vWP.xy * vec2(0.11, 0.16)).rgb * an.z) / max(0.001, an.x + an.z);
              float strata = mix(macro2, macro, 0.35);
              float crack = texture2D(tMacro, vec2(vWP.x * 0.033 + vWP.z * 0.041, vWP.y * 0.052) + 0.21).r;
              sst *= mix(0.72, 1.18, strata) * mix(0.62, 1.05, smoothstep(0.25, 0.55, crack));
              sst = mix(sst, sst * vec3(0.78, 0.92, 0.62), smoothstep(0.55, 0.8, macro2) * 0.6);
              stone = mix(stone, sst * vec3(1.04, 0.98, 0.9), side);
            }
          }
          vec3 w = vSplat;
          // 境目を絵の濃淡でぎざぎざにする
          float edge = texture2D(tMacro, wuv * 0.09).r;
          // 会戦の帯だけ水膜を破り、踏まれた泥と根を残す。田の粗い格子が足元まで水面を広げない。
          // 既存の斑を使うので絵の読み出し・面・毎コマの作成は増えず、歩行判定も保つ。
          ${this.def.trampledField ? `
          vec2 fieldUV = abs(wuv - vec2(${this.def.trampledField[0].toFixed(2)}, ${this.def.trampledField[1].toFixed(2)}))
            / vec2(${this.def.trampledField[2].toFixed(2)}, ${this.def.trampledField[3].toFixed(2)});
          float fieldTrample = (1.0 - smoothstep(0.72, 1.0, max(fieldUV.x, fieldUV.y) + (macro2 - 0.5) * 0.12))
            * (0.78 + macro2 * 0.22);
          surfaceWater *= 1.0 - fieldTrample;
          // 会戦帯の指定だけで全ての根を剥がさない。実際の通行跡で下の草を倒す。
          float fieldRoots = w.x * fieldTrample * 0.42;
          w.x -= fieldRoots; w.y += fieldRoots * 0.55; w.z += fieldRoots * 0.45;
          ` : 'float fieldTrample = 0.0;'}
          w.x = clamp(w.x + (edge - 0.5) * 0.6 * w.x * (1.0 - w.x) * 4.0, 0.0, 1.0);
          // 草一色の平場にも株間の地肌を残す。既存の斑を使い、絵の読み出しは増やさない。
          float bareSoil = smoothstep(0.44, 0.72, macro2) * 0.38 * w.x;
          w.x -= bareSoil; w.y += bareSoil;
          ${this.def.patchyGround ? `
          // 株と同じ群落を画素で読み直す。粗い格子の間も草際が直線にならない。
          // 斑の変数名は描画言語の予約語を避ける。予約語だと地面全体が描けない。
          float groundPatch = 0.5 + 0.5 * sin(vWP.x * 0.18 + sin(vWP.z * 0.11) * 2.4)
            * cos(vWP.z * 0.16 - sin(vWP.x * 0.09) * 1.8);
          float cover = clamp((groundPatch - 0.28) * 2.2, 0.08, 1.0);
          float exposedSoil = max(0.0, w.x - cover);
          w.x -= exposedSoil;
          w.y += exposedSoil * (1.0 - uWet * 0.6);
          w.z += exposedSoil * uWet * 0.6;
          ` : ''}
          // 踏み荒らされた所：草が倒れて土が出て、濡れていれば泥になる（縁は絵の濃淡でばらつかせる）
          vec2 wearMarks = texture2D(tWear, (vWP.xz + ${this.half.toFixed(1)}) / ${(this.half * 2).toFixed(1)}).rg;
          float wear = max(wearMarks.r, fieldTrample * 0.32);
          wear = smoothstep(0.05, 0.75, wear * (0.75 + edge * 0.5));
          float trod = wear * (1.0 - smoothstep(0.3, 0.8, surfaceWater));
          w.y += w.x * trod * (0.75 - uWet * 0.35);
          w.z += (w.x + w.y * 0.4) * trod * (0.25 + uWet * 0.45);
          w.x *= 1.0 - trod * 0.85;
          ${this.def.wetFieldRuts ? `
          // 十歩刻みの頂点だけで配分すると泥が薄く一様になる。
          // 既存の踏み跡と斑で、濡れた窪みを画素ごとに土から分ける。
          float fieldMud = smoothstep(0.35, 0.68, edge + (macro2 - 0.5) * 0.45)
            * uWet * (0.3 + trod * 0.55) * w.y * (1.0 - smoothstep(0.15, 0.5, surfaceWater));
          w.y -= fieldMud; w.z += fieldMud;
          ` : ''}
          // 草の盛り上がりと土塊の高さで境を選ぶ。単なる半透明の混色を避ける。
          // 既に読んだ絵だけを使い、草一色・土一色の場所はそのまま保つ。
          vec3 relief = vec3(dot(grass, vec3(0.333)), dot(dirt, vec3(0.333)), dot(mud, vec3(0.333)));
          vec3 blendHeight = w + relief * 0.32;
          float blendTop = max(blendHeight.x, max(blendHeight.y, blendHeight.z));
          w *= max(vec3(0.0), blendHeight - vec3(blendTop - 0.28));
          w /= max(0.001, w.x + w.y + w.z);
          // 裸地の数十センチ〜数メートルの浅い窪み。細粒と広い色むらの間に、土の厚みをつなぐ。
          // 既存の斑を使い、色・照明・粗さで同じ窪みを共有する。面も絵の読み出しも増やさない。
          float earthLevel = edge + (macro2 - 0.5) * 0.38;
          float earthBasin = 1.0 - smoothstep(0.32, 0.56, earthLevel);
          float earthShoulder = smoothstep(0.42, 0.58, earthLevel)
            * (1.0 - smoothstep(0.58, 0.76, earthLevel));
          // 湿った道の法面にも浅い侵食を残す。既存の濃淡と法線だけで表し、足場は変えない。
          float earthK = (w.y + w.z * 0.7) * (1.0 - slopeK * ${this.def.softPathSoil ? '0.65' : '1.0'})
            * (1.0 - smoothstep(0.2, 0.65, surfaceWater))
            * (1.0 - smoothstep(${this.def.wetFieldRuts ? '28.0, 85.0' : '18.0, 65.0'}, soilViewDistance));
          // 窪みの底は湿った灰褐色、崩れた縁は乾いた土色。黒い輪や一様な砂模様にしない。
          dirt *= mix(vec3(1.0), vec3(0.79, 0.82, 0.80), earthBasin * earthK)
            * (1.0 + earthShoulder * earthK * 0.10);
          mud *= 1.0 - earthBasin * earthK * 0.14;
          // 踏み荒れは窪みに湿った土、肩に乾いた粒。既存の斑を使い灰色一色を避ける。
          float churnSoil = earthK * mix(0.3, 1.0, trod);
          dirt *= mix(vec3(1.0), vec3(0.78, 0.69, 0.57), earthBasin * churnSoil * 0.45);
          dirt *= 1.0 + earthShoulder * churnSoil * 0.14;
          float earthRelief = (earthShoulder * 0.045 - earthBasin * 0.075) * earthK;
          ${this.def.wetFieldRuts ? `
          // 濡れた野の中景にも、泥の窪みと草の残った肩を残す。
          // 既に読んだ斑を使い、土の色・法線・濡れを同じ場所へそろえる。
          float fieldWet = (1.0 - smoothstep(0.34, 0.63, edge + (macro2 - 0.5) * 0.6))
            * (w.y + w.z) * (1.0 - slopeK) * (1.0 - smoothstep(0.15, 0.5, surfaceWater));
          dirt *= mix(vec3(1.08, 1.01, 0.88), vec3(0.59, 0.57, 0.49), fieldWet * uWet);
          mud *= mix(vec3(1.16, 1.05, 0.91), vec3(0.62, 0.65, 0.61), fieldWet);
          // 中景の起伏も濡れた窪みと同じ輪郭へ。物理の坂や兵の足場は変えない。
          earthRelief += (earthShoulder * 0.085 - fieldWet * 0.19) * earthK;
          ` : ''}
          ${this.def.wetFieldRuts === 'wear' ? `
          // 開戦時に焼いた荷車の筋と、既に読んだ窪みを共用する。溝の座標や微分を読み直さない。
          float rutShade = trod * earthBasin * earthK;
          earthRelief -= rutShade * 0.055;
          dirt *= 1.0 - rutShade * 0.16;
          mud *= 1.0 - rutShade * 0.12;
          ` : this.def.wetFieldRuts ? `
          // 長い踏み溝を濡れた裸地の斑へ限る。既存の斑で曲げ、途中で途切れさせる。
          float rutAcross = abs(fract((vWP.x + vWP.z * 0.18 + (edge - 0.5) * 2.4) / 7.0) - 0.5) * 7.0;
          float rutDistance = abs(rutAcross - 0.65);
          float rutAA = max(0.035, fwidth(rutDistance));
          float rut = 1.0 - smoothstep(0.07, 0.21 + rutAA, rutDistance);
          float rutK = earthK * smoothstep(0.4, 0.7, macro2) * max(trod, w.z * 0.7);
          float rutWet = rut * rutK * smoothstep(0.35, 0.8, uWet);
          earthRelief -= rut * rutK * 0.055;
          dirt *= 1.0 - rut * rutK * 0.16;
          mud *= 1.0 - rut * rutK * 0.12;
          ` : ''}
          // 土の窪みを全ての升に並べない。既存の斑で位置を曲げ、踏み荒れた所へまとめる。
          // 色・法線・粗さで同じ形を使う。絵の読み出しや面、毎コマの処理は足さない。
          vec2 clodUv = ruv * vec2(1.6, 2.4) + vec2(edge, macro2) * 1.7;
          vec2 clodCell = floor(clodUv);
          float clodSeed = fract(sin(dot(clodCell, vec2(127.1, 311.7))) * 43758.5453);
          vec2 clodP = fract(clodUv) - 0.5 - vec2(clodSeed - 0.5, fract(clodSeed * 7.3) - 0.5) * 0.36;
          vec2 clodAxis = normalize(vec2(clodSeed - 0.5, fract(clodSeed * 13.7) - 0.5) + vec2(0.001));
          vec2 clodLocal = vec2(dot(clodP, clodAxis), dot(clodP, vec2(-clodAxis.y, clodAxis.x)));
          // 左右で崩れ方を変えた土塊。閉じた楕円の輪を敷き詰める見え方を避ける。
          float clodRadius = length(clodLocal * vec2(1.0, mix(1.15, 2.2, clodSeed)))
            * (1.0 + clamp(clodLocal.x * clodLocal.y * 18.0, -0.2, 0.3));
          ${`
          // 乾いた土塊は丸い窪みと分け、割れた角と不ぞろいな側面を持たせる。
          vec2 clodFacet = abs(clodLocal * vec2(1.0, mix(1.15, 2.2, clodSeed)));
          float angularClod = max(max(clodFacet.x, clodFacet.y), (clodFacet.x + clodFacet.y) * 0.76)
            * (1.0 + clamp(clodLocal.x * clodLocal.y * 18.0, -0.2, 0.3));
          clodRadius = mix(clodRadius, angularClod, 0.75);
          `}
          float clodSize = mix(0.10, 0.25, fract(clodSeed * 5.3));
          float clod = 1.0 - smoothstep(clodSize * 0.18, clodSize, clodRadius);
          float clodFilter = 1.0 - smoothstep(0.12, 0.45, length(fwidth(clodUv)));
          float churn = smoothstep(0.32, 0.68, edge + (macro2 - 0.5) * 0.6);
          float clodK = (w.y * 0.55 + w.z) * mix(0.18, 1.0, max(churn, trod))
            * step(mix(0.72, 0.30, max(churn, trod)), fract(clodSeed * 19.3)) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.3, 0.8, surfaceWater)) * clodFilter
            * (1.0 - smoothstep(8.0, 32.0, soilViewDistance));
          ${this.def.subtleMudRelief ? `// 指定した戦の泥は踏まれた所だけ。窪みの色・照り・凹凸を一緒に薄める。
          clodK *= smoothstep(0.55, 0.86, clodSeed) * smoothstep(0.15, 0.65, trod) * ${this.def.churnedMud ? '0.72' : '0.28'};` : ''}
          float clodHollow = smoothstep(0.3, 0.9, clod);
          float clodRim = smoothstep(0.05, 0.24, clod) * (1.0 - smoothstep(0.3, 0.6, clod))
            * smoothstep(-0.12, 0.12, clodLocal.x + clodLocal.y * 0.5 + (clodSeed - 0.5) * 0.2);
          ${`
          // 裸地には盛り上がった土塊、踏まれた泥には窪み。同じ形を色・法線で共有する。
          // 草地・水面・切岸を避け、近景と画素より大きい粒だけに効かせる。
          float crustK = w.y * (1.0 - trod * 0.85) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.3, 0.8, surfaceWater)) * clodFilter * (1.0 - farK);
          ${this.def.sparseEarthCrust ? `
          // 既存の斑と升の乱数で乾いた土塊を間引く。色・高さ・粗さを一緒に抑える。
          crustK *= smoothstep(0.60, 0.90, clodSeed) * mix(0.12, 0.40, churn);
          ` : ''}
          float crustTop = smoothstep(0.08, 0.78, clod);
          float crustCrease = (1.0 - smoothstep(0.0, 0.18, clod)) * smoothstep(0.18, 0.5, clodSeed);
          ${this.def.softEarthCrust ? `
          // 升ごとの乱数が境で飛ぶ陰を、土塊の周りだけに限る。
          // 色・高さ・粗さをまとめて弱め、法線にも升の継ぎ目を残さない。
          vec2 crustEdge = min(fract(clodUv), 1.0 - fract(clodUv));
          crustK *= smoothstep(0.0, 0.16, min(crustEdge.x, crustEdge.y));
          crustCrease *= smoothstep(0.0, 0.16, clod);
          ` : ''}
          float crustHeight = (crustTop * mix(0.035, 0.085, clodSeed) - crustCrease * 0.018) * crustK;
          dirt *= 1.0 + (crustTop * 0.14 - crustCrease * 0.32) * crustK;
          `}
          // 雨の量だけで裸地全体を同じ濡れ方にしない。低い所と踏み跡に湿りを残し、
          // 土塊の頭と崩れた肩は乾かす。既存の窪みを使い、色・凹凸・粗さをそろえる。
          // 広い湿乾の斑は遠方も保ち、細かな土塊だけ既存の距離・画素幅で消す。
          float soilWet = max(uWet, vGroundCover.x * 0.7)
            * clamp(0.24 + earthBasin * 0.62 + trod * 0.22 - earthShoulder * 0.16, 0.12, 1.0);
          soilWet *= 1.0 - crustTop * crustK * 0.35;
          float groundWet = mix(max(uWet, vGroundCover.x * 0.7), soilWet,
            (w.y + w.z) * (1.0 - slopeK));
          // 湿った地肌は灰褐色へ寄せる。盛り上がった乾いた土は元の色を残す。
          dirt = mix(dirt, dirt * vec3(0.84, 0.89, 0.91), soilWet * (1.0 - slopeK));
          dirt *= 1.0 + (clodRim * 0.22 - clodHollow * 0.18) * clodK;
          mud *= 1.0 + (clodRim * 0.28 - clodHollow * 0.3) * clodK;
          ${mat.isMeshLambertMaterial ? '' : `
          // 踏まれた土に、前足と踵の圧痕。土塊の升・向き・乱数を使い回す。
          // 草・水面・坂・遠景には出さず、足跡を格子いっぱいに並べない。
          // 会戦帯の指定だけでは足跡を敷かない。実際に兵が通った濃い筋だけへ残す。
          float soleK = smoothstep(0.22, 0.7, wearMarks.r) * (w.y + w.z) * (1.0 - slopeK)
            * (1.0 - smoothstep(0.1, 0.4, surfaceWater)) * clodFilter
            * smoothstep(0.48, 0.72, clodSeed)
            * (1.0 - smoothstep(10.0, 18.0, soilViewDistance));
          // 升の境で圧痕が切れないよう、端の足跡だけを消す。
          vec2 soleEdge = min(fract(clodUv), 1.0 - fract(clodUv));
          soleK *= smoothstep(0.0, 0.12, min(soleEdge.x, soleEdge.y));
          // 前足と踵の形を保ち、乱数で足裏の長さを変える。
          vec2 soleLocal = clodLocal / vec2(1.0, mix(0.88, 1.12, clodSeed));
          vec2 soleToe = (soleLocal - vec2(0.012, 0.08)) / vec2(0.115, 0.145);
          vec2 soleHeel = (soleLocal - vec2(-0.012, -0.145)) / vec2(0.075, 0.09);
          float soleD = min(dot(soleToe, soleToe), dot(soleHeel, soleHeel));
          // 画素幅で縁をならす。分岐の外で傾きを求め、遠目のちらつきを抑える。
          float soleAA = max(0.06, fwidth(soleD));
          float solePress = 1.0 - smoothstep(0.45, 1.0 + soleAA, soleD);
          // 踏み出す側にだけ土を押し出し、閉じた黒い輪を避ける。
          float soleLip = smoothstep(0.7 - soleAA, 1.0, soleD) * (1.0 - smoothstep(1.0, 1.45 + soleAA, soleD))
            * smoothstep(-0.06, 0.18, clodLocal.y + clodLocal.x * 0.4);
          float soleRelief = (soleLip * 0.008 - solePress * mix(0.016, ${this.def.churnedMud ? '0.052' : '0.035'}, max(uWet, w.z))) * soleK;
          dirt *= 1.0 + (soleLip * 0.10 - solePress * (0.13 + uWet * 0.08)) * soleK;
          mud *= 1.0 + (soleLip * 0.12 - solePress * 0.20) * soleK;
          `}
          // 倒れた草は色が褪せて黄ばむ
          grass = mix(grass, grass * vec3(1.05, 0.95, 0.72), trod);
          vec3 col = grass * w.x + dirt * w.y + mud * w.z;
          ${this.def.patchyGround ? `
          // 通った列は草の色だけでなく、押し固めた湿土へ移す。既存の踏み跡と斑を共用する。
          float pressedSoil = trod * (1.0 - slopeK) * (1.0 - smoothstep(0.15, 0.5, surfaceWater));
          col = mix(col, dirt * vec3(0.72, 0.74, 0.68), pressedSoil * (0.18 + dampSoil * 0.22));
          ` : ''}
          // 踏まれた草地の剥がれた根と土。土塊の輪郭を再利用して色と段差をそろえる。
          // 水面・遠景には足さず、絵の読み出しと地面の頂点数を保つ。
          float tornTurf = w.x * trod * clodFilter * (1.0 - slopeK)
            * (1.0 - smoothstep(0.1, 0.5, surfaceWater)) * (1.0 - farK);
          col = mix(col, mix(dirt, mud, uWet * 0.55), tornTurf * clodHollow * 0.65);
          float turfRelief = tornTurf * (clodRim * 0.045 - clodHollow * 0.028);
          // 林床の苔と落ち葉。既存の斑と土の絵を使い、面も絵の読みも増やさない。
          float floorK = vGroundCover.y * smoothstep(0.42, 0.7, macro) * (1.0 - trod) * w.x;
          float mossK = floorK * smoothstep(0.45, 0.7, macro2) * (0.3 + uWet * 0.4 + vGroundCover.x * 0.3);
          col = mix(col, dirt * vec3(0.58, 0.78, 0.38), mossK * 0.6);
          // 落ち葉を一面の等間隔の金粒にしない。林床と草際の数メートルの吹き溜まりへ寄せる。
          // 土塊で求めた乱数・向き・升を共用し、面・画像・絵の読み出しは増やさない。
          float litterPatch = smoothstep(0.37, 0.62, macro) * (1.0 - smoothstep(0.4, 0.64, macro2));
          float litterK = clamp((vGroundCover.y * 0.85 + w.x * 0.16) * litterPatch
            * (1.0 - slopeK) * (1.0 - trod) * (1.0 - smoothstep(0.1, 0.5, surfaceWater))
            * ${this.def.leafLitter ? Number(this.def.leafLitter).toFixed(2) : this.def.templeNeedles ? '1.6' : this.def.autumn && !this.def.winter && !this.def.snow ? '0.85' : '0.4'}, 0.0, 0.85);
          float leafSeed = fract(clodSeed * 37.1);
          vec2 leafP = clodP - vec2(fract(clodSeed * 17.3), fract(clodSeed * 23.7)) * 0.4 + 0.2;
          vec2 leafLocal = vec2(dot(leafP, clodAxis), dot(leafP, vec2(-clodAxis.y, clodAxis.x)));
          vec2 leafSize = vec2(mix(0.13, 0.25, leafSeed), mix(0.05, 0.10, fract(clodSeed * 11.7)));
          ${this.def.templeNeedles ? 'leafSize *= vec2(1.35, 0.28);' : ''}
          vec2 leafShape = leafLocal / leafSize;
          // 先端を尖らせた葉。中央の折れと反った縁を照明へ渡し、貼った丸い点にしない。
          float leafEdge = abs(leafShape.y) + pow(abs(leafShape.x), 1.4);
          float leafAA = max(0.04, fwidth(leafEdge));
          float leafMask = (1.0 - smoothstep(1.0 - leafAA, 1.0 + leafAA, leafEdge))
            * smoothstep(leafSeed - 0.06, leafSeed + 0.06, litterK);
          float leafNear = clodFilter * (1.0 - smoothstep(12.0, 38.0, soilViewDistance));
          // 遠くは葉を一枚ずつ残さず、占める面積に応じた暗い腐葉土の斑へ戻す。
          float litterCover = mix(litterK * 0.035, leafMask, leafNear);
          float leafWet = max(uWet, vGroundCover.x * 0.7);
          vec3 leafColor = dirt * mix(vec3(0.7, 0.53, 0.34), vec3(1.08, 0.83, 0.46), fract(clodSeed * 7.3));
          leafColor *= 1.0 - leafWet * 0.35;
          col = mix(col, leafColor, litterCover * 0.85);
          float leafRelief = leafMask * leafNear * (0.004 * (1.0 - clamp(abs(leafShape.y), 0.0, 1.0))
            + 0.002 * smoothstep(0.55, 1.0, leafEdge)) * (1.0 - leafWet * 0.7);
          // 砂利は乾いた道の縁の斑に。轍・足跡は土の絵と既存の歩いた跡を保つ。
          col = mix(col, stone * vec3(1.04, 0.98, 0.85), w.y * smoothstep(0.62, 0.8, macro2) * (1.0 - uWet) * 0.35);
          // 土の間の小石。世界座標の粒と既存の岩色を使い、面と絵の読みを増やさない。
          // 小石も全ての窪みへ置かず、乾いた斑にまばらに残す。遠い粒は平均色へ消す。
          vec2 pebbleCell = clodP;
          float pebbleRadius = mix(0.025, 0.085, fract(clodSeed * 11.7));
          float pebble = (1.0 - smoothstep(pebbleRadius * 0.55, pebbleRadius, clodRadius)) * clodFilter
            * step(0.76, fract(clodSeed * 23.1)) * smoothstep(0.38, 0.65, macro2);
          col = mix(col, stone * (1.15 + pebbleCell.y), pebble * (w.y + bareSoil) * (1.0 - slopeK) * 0.65);
          ${this.def.gravelCourt ? `
          // 掃いた境内の細かな砂利。既存の土・石の絵を使い、草や藁の柄を持ち込まない。
          vec2 courtLo = vWP.xz - vec2(${Number(this.def.gravelCourt.x0).toFixed(2)}, ${Number(this.def.gravelCourt.z0).toFixed(2)});
          vec2 courtHi = vec2(${Number(this.def.gravelCourt.x1).toFixed(2)}, ${Number(this.def.gravelCourt.z1).toFixed(2)}) - vWP.xz;
          float courtEdge = min(min(courtLo.x, courtLo.y), min(courtHi.x, courtHi.y));
          float courtK = smoothstep(0.0, 0.45, courtEdge) * (1.0 - slopeK);
          // 等間隔の丸い粒は遠くで縞になる。既存の石の絵の縮小表示を使い、
          // 画素より細かな砂利は平均の色へなじませる。
          vec2 gravelUv = ruv * 0.8 + vec2(edge, macro2) * 0.15;
          float gravelFootprint = length(dFdx(gravelUv)) + length(dFdy(gravelUv));
          float gravelNear = (1.0 - smoothstep(22.0, 30.0, soilViewDistance))
            * (1.0 - smoothstep(0.08, 0.35, gravelFootprint));
          float grain = 0.35;
          if (gravelNear > 0.001) grain = mix(grain, dot(texture2D(tCourt, gravelUv).rgb, vec3(0.3333)), gravelNear);
          vec3 court = vec3(${(this.def.gravelCourt.color || [0.72, 0.70, 0.64]).map(c => Number(c).toFixed(2)).join(', ')}) * mix(0.85, 1.05, macro2);
          court *= clamp(0.58 + grain * 1.2, 0.65, 1.3) * mix(0.86, 1.1, edge);
          // 掃き筋を並べず、歩く道の幅と縁を既存の斑で崩す。戦うほど跡が増す。
          float worn = exp(-pow((vWP.z - ${Number(this.def.gravelCourt.pathZ).toFixed(2)} + (edge - 0.5) * 1.4)
            / (${Number(this.def.gravelCourt.pathWidth).toFixed(2)} * mix(0.75, 1.3, macro2)), 2.0))
            * smoothstep(${Number(this.def.gravelCourt.pathX).toFixed(2)}, ${(Number(this.def.gravelCourt.pathX) + 2).toFixed(2)}, vWP.x);
          float scuffed = max(trod, worn * 0.8) * mix(0.6, 1.0, edge);
          court = mix(court, dirt * vec3(1.05, 0.97, 0.83), scuffed * 0.8);
          // 掃いた砂利にも土の染みと掻き寄せた粒が残る。既存の斑と粒を共用する。
          float courtDamp = smoothstep(0.36, 0.68, macro2) * (1.0 - smoothstep(0.35, 0.72, edge));
          court *= mix(vec3(1.03, 1.0, 0.94), vec3(0.69, 0.72, 0.66), courtDamp * 0.7);
          court = mix(court, dirt * vec3(0.91, 0.86, 0.74), trod * (0.28 + courtDamp * 0.28));
          court = mix(court, stone * vec3(1.08, 1.02, 0.9), pebble * (1.0 - scuffed * 0.7) * 0.38);
          float rimMoss = (1.0 - smoothstep(0.25, 1.6, courtEdge)) * smoothstep(0.35, 0.7, macro2);
          court = mix(court, court * vec3(0.6, 0.73, 0.43), rimMoss * 0.65);
          // 矩形の石畳と目地。既存の一枚の地面で描き、面を増やさない。
          float paveBand = max(
            (1.0 - smoothstep(${(Number(this.def.gravelCourt.pathWidth) - 0.08).toFixed(2)}, ${Number(this.def.gravelCourt.pathWidth).toFixed(2)}, abs(vWP.z - ${Number(this.def.gravelCourt.pathZ).toFixed(2)}))) * step(${Number(this.def.gravelCourt.pathX).toFixed(2)}, vWP.x),
            (1.0 - smoothstep(${(Number(this.def.gravelCourt.pathWidth) - 0.08).toFixed(2)}, ${Number(this.def.gravelCourt.pathWidth).toFixed(2)}, abs(vWP.x - ${Number(this.def.gravelCourt.pathX).toFixed(2)}))) * step(38.0, vWP.z) * step(vWP.z, 80.0));
          vec2 paveUv = vec2(vWP.x / 1.25 + mod(floor(vWP.z / 0.8), 2.0) * 0.5, vWP.z / 0.8);
          vec2 jointD = min(fract(paveUv), 1.0 - fract(paveUv));
          vec2 jointAA = max(fwidth(paveUv), vec2(0.003));
          float paveFace = smoothstep(0.025, 0.025 + jointAA.x, jointD.x) * smoothstep(0.035, 0.035 + jointAA.y, jointD.y);
          float paveSeed = fract(sin(dot(floor(paveUv), vec2(127.1, 311.7))) * 43758.5453);
          vec3 paveColor = mix(vec3(0.16, 0.145, 0.12), vec3(0.43, 0.42, 0.38) * mix(0.83, 1.12, paveSeed), paveFace);
          paveColor *= mix(0.88, 1.08, edge);
          float buildingD = 1000.0;
          ${(this.def.gravelCourt.buildings || []).map((b) => `buildingD = min(buildingD, max(max(${Number(b[0]).toFixed(2)} - vWP.x, vWP.x - ${Number(b[1]).toFixed(2)}), max(${Number(b[2]).toFixed(2)} - vWP.z, vWP.z - ${Number(b[3]).toFixed(2)})));`).join('\n          ')}
          float buildingSoil = 1.0 - smoothstep(1.25, 1.5, buildingD);
          court = mix(court, dirt * vec3(1.05, 0.85, 0.61), buildingSoil);
          float courtLeaf = (1.0 - smoothstep(1.0 - leafAA, 1.0 + leafAA, leafEdge)) * step(0.72, leafSeed) * buildingSoil;
          court = mix(court, leafColor, courtLeaf * leafNear * 0.85);
          ${this.def.gravelCourt.garden ? `
          float gardenD = length(vWP.xz - vec2(${Number(this.def.gravelCourt.garden.x).toFixed(2)}, ${Number(this.def.gravelCourt.garden.z).toFixed(2)}));
          float gardenMoss = (1.0 - smoothstep(${Number(this.def.gravelCourt.garden.r).toFixed(2)}, ${(Number(this.def.gravelCourt.garden.r) + 2).toFixed(2)}, gardenD + (edge - 0.5) * 1.5));
          court = mix(court, vec3(0.25, 0.32, 0.15) * mix(0.7, 1.1, macro2) * mix(0.9, 1.1, grain), gardenMoss * 0.85);
          ` : ''}
          court = mix(court, paveColor * (1.0 - trod * 0.18), paveBand);
          col = mix(col, court, courtK);
          // 色と同じ砂利・踏み窪みを照明にも渡す。新しい絵や面は作らない。
          float courtRelief = courtK * ((grain - 0.35) * 0.07 * (1.0 - scuffed * 0.65) * (1.0 - paveBand)
            + (clodRim * 0.018 - clodHollow * 0.032) * scuffed * clodFilter * (1.0 - paveBand)
            + paveFace * 0.015 * paveBand);
          ` : ''}
          // 緩い山腹から切岸までつなぐ。道や平場には侵食を載せない。
          float slopeGrade = 1.0 - mix(abs(normalize(vWN).y), abs(gN.y), 0.65);
          float steep = smoothstep(0.10, 0.46, slopeGrade);
          float slopeRelief = 0.0;
          // 緩い土手は崖の処理がほぼ効かず、草色の一枚板になっていた。
          // 世界に固定した斑で雨溝を作り、溝底の土と根の張った草の縁を分ける。
          // 共通の絵を一回だけ追加で読み、面・材質・歩く高さは増やさない。
          float turfRange = 1.0 - smoothstep(45.0, 110.0, soilViewDistance);
          float turfSlope = smoothstep(0.018, 0.085, slopeGrade) * (1.0 - steep)
            * (1.0 - smoothstep(0.3, 0.8, surfaceWater)) * (1.0 - trod * 0.85) * turfRange;
          if (turfSlope > 0.001) {
            // 山道の細かな起伏で法線が回っても、模様の座標は連続させる。
            // 大きな世界座標と変化する法線の内積は、細い縞へ圧縮される。
            vec2 bankUv = vec2(vWP.x * 0.096 + vWP.z * 0.072,
              vWP.y * 0.035 + vWP.z * 0.024) + vec2(macro2, macro) * 0.12;
            float drainage = texture2D(tMacro, bankUv).r;
            float channel = 1.0 - smoothstep(0.36, 0.53, drainage);
            // 草の縁は大小の斑で欠けさせ、等間隔の縞や全面の茶色にしない。
            float sod = smoothstep(0.43, 0.59, drainage + (edge - 0.5) * 0.3);
            float torn = (1.0 - sod) * (0.35 + channel * 0.65);
            vec3 exposed = mix(dirt * vec3(0.92, 0.86, 0.73), mud * 0.85,
              channel * (0.25 + uWet * 0.35));
            vec3 turf = mix(grass * mix(0.76, 1.03, sod), exposed, torn);
            col = mix(col, turf, turfSlope * w.x * 0.85);
            // 草の根元の段差と浅い雨溝を実際の光へ渡す。遠くでは色だけに戻す。
            slopeRelief = (sod * 0.065 - channel * 0.16) * turfSlope * w.x
              * (1.0 - smoothstep(24.0, 65.0, soilViewDistance));
          }
          if (steep > 0.001) {
            // 急な面（山城の切岸・崖）：上から貼った絵は縦に伸びて筋になる。横から（xy・zy）貼り直し、
            // 風化した土と粘土の斑、雨溝に削り残された岩肌を描く
            vec3 an = mix(abs(normalize(vWN)), abs(gN), 0.85); an = an * an; an /= max(1e-3, an.x + an.y + an.z);
            vec2 uX = vWP.zy, uZ = vWP.xy;
            vec3 stT = texture2D(tStone, uX * 0.12).rgb * an.x + texture2D(tStone, uZ * 0.12).rgb * an.z + stone * an.y;
            vec3 dtT = texture2D(tBank, uX * 0.21).rgb * an.x + texture2D(tBank, uZ * 0.21).rgb * an.z + dirt * an.y;
            // 高さを一定間隔で折り返すと谷全体に横縞が走る。
            // 岩の向きごとに斑を読み、既存の大小の斑で歪めて連続した露頭にする。
            vec2 weatherWarp = vec2(macro2 - 0.5, macro - 0.5) * 0.65;
            float lay = (texture2D(tMacro, uX * vec2(0.047, 0.031) + weatherWarp).r * an.x
              + texture2D(tMacro, uZ * vec2(0.039, 0.041) - weatherWarp + 0.37).r * an.z)
              / max(0.001, an.x + an.z);
            float clay = smoothstep(0.48, 0.68, lay * 0.65 + macro2 * 0.35);
            vec3 loam = mix(vec3(0.38, 0.26, 0.18), vec3(0.52, 0.39, 0.26), smoothstep(0.25, 0.75, lay));
            loam = mix(loam, vec3(0.57, 0.47, 0.32), clay * 0.55);
            loam *= mix(0.86, 1.10, lay);
            float lum = dot(dtT, vec3(0.333)) / max(1e-3, dot(texture2D(tBank, uZ * 0.21, 9.0).rgb, vec3(0.333)));
            loam = mix(loam, vec3(dot(loam, vec3(0.333))) * vec3(1.02, 0.95, 0.86), uRock * 0.55);   // 岩山の土は赤すぎない灰褐色
            vec3 earth = loam * clamp(lum, 0.55, 1.5);
            // 縦へ数十ｍ伸びていた雨筋を、数ｍごとに崩れる土の肩と窪みにする。
            // 横からの二方向の投影を保ち、高さでも斑を変えて引き伸ばした壁を避ける。
            float runoffWarp = (lay - 0.5) * 0.32 + (macro2 - 0.5) * 0.18;
            vec2 runoff = vec2(
              texture2D(tMacro, vec2(vWP.z * 0.06 + runoffWarp, vWP.y * 0.035 + 0.17)).r,
              texture2D(tMacro, vec2(vWP.x * 0.06 + runoffWarp, vWP.y * 0.035 + 0.43)).r);
            float rill = dot(runoff, an.xz) / max(0.001, an.x + an.z);
            float hollow = 1.0 - smoothstep(0.34, 0.50, rill);
            float shoulder = smoothstep(0.50, 0.66, rill);
            float tributary = (1.0 - smoothstep(0.035, 0.12, abs(edge - 0.48)))
              * (1.0 - shoulder) * (0.4 + hollow * 0.6);
            earth *= 1.0 - hollow * 0.26 - tributary * 0.12 + shoulder * 0.10;
            earth = mix(earth, dtT * vec3(0.82, 0.79, 0.70), hollow * 0.32);
            float clastRelief = 0.0;
            ${`
            // 近い切岸は、大きな斑の拡大ではなく共用の土肌から土塊・根・割れを読む。
            // 二方向それぞれで読む回数は同じ。遠くは従来の大きな侵食だけに戻す。
            float clastRange = 1.0 - smoothstep(12.0, 38.0, soilViewDistance);
            if (clastRange > 0.0) {
              vec2 clastUvX = uX * 0.95 + vec2(runoff.x * 0.12, lay * 0.08);
              vec2 clastUvZ = uZ * 0.95 + vec2(runoff.y * 0.12, lay * 0.08);
              vec3 bankGrain = (texture2D(tBank, clastUvX).rgb * an.x
                + texture2D(tBank, clastUvZ + 0.37).rgb * an.z) / max(0.001, an.x + an.z);
              // 土の色むらを高さへ直結させず、広い土肌との比で乾いた塊と暗い割れを分ける。
              float bankLuma = dot(bankGrain, vec3(0.333));
              float bankBase = max(0.06, dot(dtT, vec3(0.333)));
              float clastNoise = clamp(bankLuma / bankBase * 0.5, 0.0, 1.0);
              // 画素より細かくなる割れはならし、移動時のちらつきを抑える。
              float clastWidth = max(0.025, fwidth(clastNoise));
              float clast = smoothstep(0.47 - clastWidth, 0.57 + clastWidth, clastNoise);
              float seam = 1.0 - smoothstep(0.39 - clastWidth, 0.48 + clastWidth, clastNoise);
              float clastK = clastRange * (0.65 + hollow * 0.35);
              float grainFade = 1.0 - smoothstep(0.08, 0.3, clastWidth);
              clastK *= grainFade;
              earth *= mix(1.0, clamp(bankLuma / bankBase, 0.78, 1.18), clastK * 0.55);
              earth *= 1.0 + (clast * 0.08 - seam * 0.16) * clastK;
              // 土塊の丸い表と深い割れの両方へ光を当てる。数センチの起伏に抑え、溶けた岩にしない。
              clastRelief = ((clastNoise - 0.5) * 0.035 + clast * 0.018 - seam * 0.028) * clastK;
            }
            `}
            // 岩棚は削り残された塊ごとに張り出す。標高で反復する段は作らない。
            float bed = smoothstep(0.30, 0.72, lay * 0.6 + rill * 0.4);
            stT *= mix(0.74, 1.12, bed) * (1.0 - tributary * 0.18);
            stT = mix(stT, stT * vec3(0.92, 0.86, 0.8), uRock * 0.5);
            // 近くの岩肌は細かな粒と割れを重ねる（八歩ごとの大きな絵だけではぼやける）
            if (farK < 1.0) {
              float sd = dot(texture2D(tStone, uX * 0.53 + 0.31).rgb * an.x + texture2D(tStone, uZ * 0.53 + 0.31).rgb * an.z, vec3(0.333)) / max(0.05, an.x + an.z);
              stT *= mix(1.0, clamp(sd / 0.45, 0.55, 1.45), (1.0 - farK) * 0.7 * (an.x + an.z));
            }
            // 岩：尾根の高い所と、大きな斑のある所だけ（山城の土の切岸を岩だらけにしない）
            float rockK = smoothstep(0.52, 0.74, mix(macro2, rill, 0.5) + slopeGrade * 0.24
              + uRock * 0.22 + shoulder * 0.13 - hollow * 0.12);
            vec3 cliff = mix(earth, stT, rockK);
            // 天端の縁は草が垂れ下がる（崖の上の端だけ緑が残る）
            float lip = smoothstep(0.28, 0.4, 1.0 - normalize(vWN).y) * (1.0 - smoothstep(0.4, 0.62, 1.0 - normalize(vWN).y));
            // 草も横から貼る（真上から貼った草は急な面で斜めの筋に伸びる）
            vec3 grassT = texture2D(tGrass, uX * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * an.x + texture2D(tGrass, uZ * ${SETTINGS.quality === 'high' ? '0.42' : '0.21'}).rgb * an.z + grass * an.y;
            cliff = mix(cliff, grassT * 0.85, lip * 0.45 * w.x);
            // 斜面にしがみつく笹と苔の斑（崖の中ほどまで。真っ直ぐな面ほど少ない）
            // 座標を法線で混ぜると、曲がる切岸では遠い原点からの距離まで
            // 拡大され、草と苔が細い縞になる。全ての戦で連続した座標を使う。
            float veg = smoothstep(0.44, 0.64, texture2D(tMacro,
              vec2(vWP.x * 0.031 + vWP.z * 0.033, vWP.y * 0.045) + 0.21).r)
              * (1.0 - smoothstep(0.48, 0.75, slopeGrade)) * (1.0 - rockK * 0.8);
            // 草は削れた溝底を避け、苔は湿った溝の脇へ寄せる。
            cliff = mix(cliff, grassT * vec3(0.62, 0.7, 0.55), veg * (1.0 - hollow) * 0.7);
            ${this.def.cliffTurf ? `
            // 草に覆われた山城の切岸（春日山の CG）：急な面にも草を斑に残し、雨溝と岩だけ土を見せる（def.cliffTurf。10/28 志賀・比叡山）
            float cTurf = smoothstep(0.36, 0.6, texture2D(tMacro, vec2(vWP.x * 0.05 + vWP.z * 0.047, vWP.y * 0.06) + 0.63).r + (1.0 - hollow) * 0.25)
              * (1.0 - rockK * 0.7) * ${Number(this.def.cliffTurf).toFixed(2)};
            cliff = mix(cliff, grassT * vec3(0.66, 0.72, 0.5) * mix(0.8, 1.05, lay), cTurf);
            ` : ''}
            float mossEdge = smoothstep(0.3, 0.4, rill) * (1.0 - smoothstep(0.46, 0.55, rill));
            cliff = mix(cliff, grassT * vec3(0.48, 0.58, 0.36), mossEdge * veg * 0.35);
            // 中距離も沢の両側へ光が回る。細い支流と岩棚だけ先に粗くし、遠くは色へ戻す。
            // 色と同じ岩塊を照明へ渡す。細部は距離で薄め、遠景のちらつきを抑える。
            float ledge = bed * (0.65 + shoulder * 0.35);
            float reliefFar = 1.0 - smoothstep(55.0, 170.0, soilViewDistance);
            float reliefFine = 1.0 - smoothstep(16.0, 60.0, soilViewDistance);
            slopeRelief += ((shoulder * 0.30 - hollow * 0.42) * reliefFar
              + ((ledge - 0.5) * rockK * 0.12 - tributary * 0.09) * reliefFine
              + clastRelief * (1.0 - rockK)) * steep;
            col = mix(col, cliff, steep);
          }
          // 山の杉林（def.slopeForest）：斜面に杉の樹冠の濃い緑と、木の間の黒い土・ところどころの岩肌・笹の明るい斑を置く。
          // 遠い一枚岩の壁にしない。細かい斑は世界の座標から（霞の中でも粒が見える）
          if (uForest > 0.0) {
            float hill = smoothstep(0.02, 0.12, 1.0 - normalize(vWN).y) * smoothstep(0.3, 1.5, vWP.y);
            // 三方向から貼って混ぜる（上から貼ると立った面で縦の筋に伸びる。面ごとの向きの違いでも継ぎ目が出ない）
            vec3 fw = pow(mix(abs(normalize(vWN)), abs(gN), 0.85), vec3(4.0)); fw /= (fw.x + fw.y + fw.z);
            #define FTRI(sc, off) (texture2D(tMacro, vWP.zy * (sc) + (off)).r * fw.x + texture2D(tMacro, vWP.xy * (sc) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (sc) + (off)).r * fw.y)
            #define FTRA(a, b, off) (texture2D(tMacro, vec2(vWP.z * (a), vWP.y * (b)) + (off)).r * fw.x + texture2D(tMacro, vec2(vWP.x * (a), vWP.y * (b)) + (off)).r * fw.z + texture2D(tMacro, vWP.xz * (a) + (off)).r * fw.y)
            float k1 = FTRI(0.17, 0.13), k2 = FTRI(0.43, 0.51), k3 = FTRI(1.3, 0.0);
            float crown = smoothstep(0.0, 1.0, (k1 * 0.45 + k2 * 0.35 + k3 * 0.25 - 0.5) * 4.2 + 0.5);
            vec3 sugi = mix(vec3(0.045, 0.075, 0.045), vec3(0.11, 0.17, 0.085), smoothstep(0.3, 0.9, k3));
            ${this.def.autumn && !this.def.winter && !this.def.snow ? `
            // 遠い雑木と同じ赤茶・黄を杉の濃緑に混ぜる。既存の絵の大小の斑を使い、読み出しを増やさない。
            float broadPatch = smoothstep(0.38, 0.62, k1 * 0.7 + macro2 * 0.3);
            vec3 autumnCrown = mix(vec3(0.28, 0.085, 0.025), vec3(0.43, 0.29, 0.055), smoothstep(0.36, 0.65, k2));
            autumnCrown = mix(vec3(0.13, 0.22, 0.085), autumnCrown, ${THREE.MathUtils.clamp(this.def.autumnLeafMix ?? 1, 0, 1).toFixed(3)});
            sugi = mix(sugi, autumnCrown * mix(0.7, 1.1, k3), broadPatch);
            ` : ''}
            vec3 floor0 = vec3(0.085, 0.062, 0.045) * (0.7 + 0.6 * k2);
            vec3 forest = mix(floor0, sugi, crown);
            // 遠目の山肌：杉の大きな塊・縦に走る沢と尾根・岩場の帯。細かな粒が霞で消えても、一枚の壁にならない
            float bigK = FTRI(0.031, 0.7);
            float gully = FTRA(0.06, 0.006, 0.3);
            forest *= mix(0.5, 1.5, smoothstep(0.3, 0.7, bigK)) * mix(1.0, mix(0.55, 1.25, smoothstep(0.35, 0.65, gully)), farK);
            forest = mix(forest, forest * vec3(1.5, 1.25, 0.9) + vec3(0.02, 0.015, 0.0), smoothstep(0.62, 0.8, bigK) * (1.0 - crown) * 0.6);   // 明るい落葉・地肌の斑
            // 岩肌：大きな斑のある所だけ、割れた岩の灰褐色
            float rband = FTRA(0.02, 0.017, 0.45);
            float rk = smoothstep(0.56, 0.7, rband * 0.7 + k1 * 0.3 + macro2 * 0.2) * smoothstep(0.1, 0.3, 1.0 - normalize(vWN).y);
            vec3 rockc = stone * vec3(0.95, 0.86, 0.74) * mix(0.55, 1.1, k3);
            forest = mix(forest, rockc, rk * ${this.def.slopeForestTint ? 'min(0.85, uRock * 3.5)' : '0.85'});
            // 笹と明るい広葉の斑
            forest = mix(forest, vec3(0.2, 0.26, 0.1), smoothstep(0.64, 0.78, k2) * (1.0 - rk) * 0.5);
            ${this.def.slopeForestTint ? `
            // 基本の緑褐色と、地形と一致する沢の陰。青い空気遠近は遠山専用のまま。
            col = mix(col, vSlopeTint, hill * 0.65);
            forest *= clamp(dot(vSlopeTint, vec3(0.333333)) / 0.213333, 0.4, 1.2);
            ` : ''}
            col = mix(col, forest, hill * uForest * (1.0 - smoothstep(0.0, 1.0, wear) * 0.9) * mix(1.0 - 0.85 * steep, 1.0, farK));
            #undef FTRI
            #undef FTRA
          }
          ${this.def.erodedSlopes ? `
          // 谷筋は縦に流れ、尾根には砂礫を残す。足場を削らず既存の土と岩の絵を使う。
          float erosionSlope = smoothstep(0.035, 0.24, 1.0 - abs(gN.y));
          float erosionPhase = (vWP.x + vWP.z * 0.37) * 0.38
            + sin(vWP.y * 0.18 + macro2 * 2.0) * 1.4 + macro * 2.0;
          // 溝の間隔と幅を既存の土の斑で崩し、等間隔の縞を避ける。
          float erosionGully = pow(0.5 + 0.5 * sin(erosionPhase + (edge - 0.5) * 2.2), 6.0)
            * smoothstep(0.25, 0.65, macro2);
          float erosionRock = smoothstep(0.48, 0.72, macro2) * erosionSlope;
          vec3 erosionSoil = mix(dirt * vec3(0.87, 0.80, 0.68), stone * vec3(0.92, 0.90, 0.82), erosionRock);
          col = mix(col, erosionSoil, erosionSlope * (0.16 + erosionGully * 0.48)
            * (1.0 - smoothstep(0.2, 0.6, surfaceWater)));
          col *= 1.0 - erosionGully * erosionSlope * 0.15;
          ` : ''}
          ${this.def.springSnowPatch ? `
          // 早春の残雪は高い日陰の草土に小さく残す。道・川・屋敷と立った岩面は覆わない。
          float snowShade = smoothstep(18.0, 30.0, vWP.y - (vWP.x + 200.0) * 0.05)
            * (1.0 - smoothstep(-12.0, 0.0, vWP.z)) * smoothstep(0.68, 0.84, macro2)
            * smoothstep(0.45, 0.8, normalize(vWN).y);
          col = mix(col, vec3(0.55, 0.56, 0.51), snowShade * 0.65);
          ` : ''}
          {
            // 野の混ぜ塗り：十数〜数十mの斑で、青草・枯れ草・湿った草・黒土・黄土・砂利を混ぜる。
            // 高い所と日の当たる坂は乾いて枯れ色と砂利、低い所と岸と日陰は湿って濃い。季節と雨で寄せ方を替える。
            // 近くは写真の粒を残して弱く、遠いほど強く（遠くは色だけ）。絵の読みは一回だけ足す。
            float lsM = texture2D(tMacro, wuv * 0.061 + vec2(macro2, macro) * 0.25 + 0.13).r;
            // 斑の絵は 0.5 の前後に寄っているので、差を三倍に広げてから使う（暗い戦でも斑が見える）
            float lsA = clamp((lsM * 0.6 + macro2 * 0.4 - 0.5) * 3.2 + 0.5, 0.0, 1.0);
            float lsB = clamp((macro * 0.55 + lsM * 0.45 - 0.5) * 3.2 + 0.5, 0.0, 1.0);
            float lsH = clamp((vWP.y - uLandHeight.x) / uLandHeight.y, 0.0, 1.0);
            float lsHi = smoothstep(0.55, 1.0, lsH) * uLandSeason.w;
            float lsLo = (1.0 - smoothstep(0.0, 0.3, lsH)) * uLandSeason.w;
            vec2 lsSun = normalize(uLandSun.xz + vec2(1e-4));
            float lsAsp = dot(normalize(gN.xz + vec2(1e-4)), lsSun) * smoothstep(0.03, 0.25, 1.0 - gN.y);
            float lsDamp = clamp(vGroundCover.x * 0.8 + lsLo * uLandSeason.z + uWet * 0.45 - lsAsp * 0.25
              + smoothstep(0.55, 0.85, 1.0 - lsA) * 0.35, 0.0, 1.0);
            float lsDry = clamp(smoothstep(0.46, 0.72, lsA) * 0.9 + lsHi * 0.45 + lsAsp * 0.3 + uLandSeason.x
              - uWet * 0.55 - vGroundCover.x * 0.4, 0.0, 1.0);
            float lsK = mix(0.88, 1.0, smoothstep(8.0, 40.0, soilViewDistance))
              * (1.0 - steep * 0.8) * (1.0 - smoothstep(0.3, 0.8, surfaceWater));
            ${this.def.gravelCourt ? 'lsK *= 1.0 - courtK;' : ''}
            // 草：青草・枯れ草（季節で寄る）・湿った濃い草。明るさの平均はほぼ 1 に保つ。
            // 数mの株の塊（絵を読まず、斑で曲げた波で）：低いカメラの足元から先も一色にしない。
            float lsClump = 0.5 + 0.5 * sin(vWP.x * 0.83 + sin(vWP.z * 0.61 + lsM * 4.0) * 1.7)
              * sin(vWP.z * 0.71 - sin(vWP.x * 0.47 + macro2 * 3.0) * 1.5);
            vec3 gT = mix(vec3(0.84, 1.08, 0.74), vec3(1.7, 1.26, 0.56), lsDry);
            gT = mix(gT, vec3(0.5, 0.7, 0.56), lsDamp * (1.0 - lsDry * 0.6));
            gT = mix(gT, gT * vec3(1.25, 1.12, 0.8), smoothstep(0.62, 0.9, lsClump) * 0.6);
            gT *= mix(0.6, 1.32, lsB) * mix(0.84, 1.1, lsClump);
            // 土：黄土の乾いた肩と黒い湿土。高く乾いた斑は砂利まじり。
            vec3 sT = mix(vec3(1.1, 1.0, 0.84), vec3(0.7, 0.66, 0.62), lsDamp) * mix(0.84, 1.14, lsA);
            col *= mix(vec3(1.0), gT, w.x * lsK);
            col *= mix(vec3(1.0), sT, (w.y + w.z * 0.6) * lsK);
            float lsGravel = smoothstep(0.62, 0.84, lsB) * (0.35 + lsHi * 0.65) * (1.0 - uWet * 0.6)
              * w.y * (1.0 - trod * 0.5);
            col = mix(col, stone * vec3(1.0, 0.96, 0.88) * mix(0.82, 1.08, lsM), lsGravel * lsK * 0.7);
            // 霜：冬の朝夜は平らな日陰の草と土に薄い霜の斑。踏んだ所と日向は溶ける。
            // 白い一色へ寄せると夜の明るさ上げで地面が真っ白に飛ぶ（有岡 10/29）。下の色を少し明るく青白くするだけにし、
            // 斑の外には置かず、効きも 0.45 までに抑える（戦ごとの土の暗さ dirtTint を消さない）。
            float lsFrost = uLandSeason.y * smoothstep(0.75, 0.95, gN.y) * (1.0 - trod * 0.9)
              * smoothstep(0.45, 0.8, 1.0 - lsA) * clamp(1.0 - lsAsp * 0.6, 0.0, 1.0)
              * (1.0 - uWet * 0.7) * (1.0 - smoothstep(0.3, 0.8, surfaceWater));
            vec3 lsFrostC = min(col * vec3(1.45, 1.52, 1.62) + vec3(0.015, 0.018, 0.022), vec3(0.34, 0.36, 0.38));
            col = mix(col, lsFrostC * mix(0.9, 1.05, lsM), min(lsFrost, 0.45));
          }
          col *= mix(0.94, 1.3, macro);
          // 雨で濡れると暗く
          // 城の地面を確定
          float castleCover = 0.0;   // 城の平場・法の効き（後から岩肌や道を重ねる戦が、城の地面を消さないため）
          ${this.def.snow ? '' : `
          // 城の曲輪（castle_plan.js の setCastleMask が縄張りから描く）：本の CG（岡崎・躑躅ヶ崎・小田原・春日山）に寄せ、
          // 平場は踏み固めた土と白っぽい砂利、縁と切岸・土塁の法は草に覆われた土。絵は一枚を一回読むだけ（面と描く回数は同じ）
          if (uCastle.w > 0.5) {
            vec2 castleUv = (vWP.xz - uCastle.xy) * uCastle.z;
            if (castleUv.x > 0.0 && castleUv.y > 0.0 && castleUv.x < 1.0 && castleUv.y < 1.0) {
              vec2 cm = texture2D(tCastle, castleUv).rg;
              float flatK = 1.0 - smoothstep(0.05, 0.2, 1.0 - abs(gN.y));
              float floorK = cm.r * flatK * (1.0 - smoothstep(0.3, 0.8, vWater));
              float grit = mix(0.9, 1.1, edge);   // 粒の濃淡は既にある斑で（絵を読み足さない）
              // 土の絵の粒だけを使い、橙の土色から白っぽい砂利を分ける。
              // 本の平場はむらの少ない白っぽい砂利。戦ごとの橙の土は混ぜず、踏み跡も灰褐の砂利で示す。
              float stoneGrain = clamp(dot(dirt, vec3(0.333)) / 0.23, 0.82, 1.16);
              // 夜は月に白く浮いて雪に見えないよう、砂利だけ少し沈める
              vec3 grav = vec3(0.6, 0.58, 0.53) * stoneGrain * mix(0.95, 1.04, macro2) * grit * (1.0 - uNight * 0.5);
              grav = mix(grav, vec3(0.47, 0.44, 0.39) * stoneGrain, clamp(trod * 0.45, 0.0, 0.45));
              ${this.def.muddyCastleFloor ? `// 雪解けや雨の後の城：白い砂利でなく、湿って黒ずんだ土の平場に（雪の一枚に見せない）
              grav = mix(grav, dirt * vec3(0.74, 0.68, 0.58) * mix(0.85, 1.05, macro2), ${Number(this.def.muddyCastleFloor).toFixed(2)});` : ''}
              float rim = 1.0 - smoothstep(0.6, 0.97, cm.r);
              // 草は既存の粒を共用。秋・早春は枯れ色、ほかは濃い緑（本の土手の深い緑）。
              float turfGrain = clamp(dot(grass, vec3(0.333)) / 0.08, 0.7, 1.3);
              vec3 turfC = ${this.def.autumn || this.def.winter ? 'vec3(0.12, 0.112, 0.058)' : 'vec3(0.058, 0.1, 0.03)'}
                * turfGrain * mix(0.84, 1.02, macro2);
              turfC = mix(turfC, vec3(0.2, 0.17, 0.12), smoothstep(0.7, 0.9, edge + macro * 0.1) * 0.15);
              grav = mix(grav, turfC, clamp(rim * 1.3 * smoothstep(0.3, 0.65, macro2 + edge * 0.3), 0.0, 1.0) * 0.9);
              // 平場の残り草は薄く（暗い斑の丸にしない）
              grav = mix(grav, mix(grav, turfC, 0.45), smoothstep(0.78, 0.9, macro2 + edge * 0.1) * (1.0 - trod) * 0.3);
              // 戦ごとに地面の材質へ掛けた土色（長島・大河内・三木の橙褐）を城の地面からは外す（既定の白では何も変わらない）
              vec3 castleUntint = 1.0 / max(diffuse, vec3(0.35));
              col = mix(col, grav * castleUntint, floorK);
              float bankK = cm.g * (1.0 - flatK) * (1.0 - smoothstep(0.3, 0.8, vWater));
              // 切岸では戦専用の橙の土より草を優先する。薄く重ねて土色を残さない。
              col = mix(col, turfC * castleUntint, bankK);
              castleCover = max(floorK, bankK);
            }
          }
          `}
          // 夜は濡れによる黒つぶれを抑え、泥と草の濃淡を残す。
          // 雨の野戦は窪み側で既に沈めた色を、全面の濡れで二重に黒くしない。
          col *= 1.0 - groundWet * (${this.def.wetFieldRuts ? '0.16 + w.z * 0.09' : '0.28 + w.z * 0.15'}) * (1.0 - uNight * 0.55);
          // 夜も土の茶・草と苔の灰緑を残す。青い灰色への置き換えを弱め、明るさだけを沈める。
          col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(1.02, 0.98, 0.88), uNight * 0.16) * (1.0 - uNight * 0.2);
          // 田の水面：濁った水の色。空は映すが、ぎらつかせない（照り返しは下で弱める）
          float wat = smoothstep(0.3, 0.8, surfaceWater);
          // 田の水は浅い（10/30 共通の水）：水際は泥と株が透け、中ほどほど濁りで沈む。水際の外は濡れて暗い土。
          vec3 watBody = mix(mud * vec3(0.6, 0.56, 0.47) + grass * 0.04, vec3(0.075, 0.08, 0.06) + mud * 0.22 + grass * 0.05,
            0.4 + smoothstep(0.55, 0.95, surfaceWater) * 0.6);
          col = mix(col, watBody, wat * 0.92);
          col *= 1.0 - smoothstep(0.1, 0.3, surfaceWater) * (1.0 - wat) * 0.32;
          // 踏み荒らされた窪みに、雨の強さ（濡れ具合）で水が溜まる。雨が上がっても乾くまで残る
          // 泥の暗いくぼみや踏み固めた道にも水が残る。斜面には溜めない
          float hollow = 1.0 - smoothstep(0.035, 0.075, dot(mud, vec3(0.333)));
          // 踏まれた面の全体を鏡にしない。水は既存の窪みだけへ残す。
          float pool = max(smoothstep(0.55, 0.95, wear) * earthBasin, w.z * hollow + w.y * hollow * 0.3)
            * (1.0 - smoothstep(0.3, 0.55, edge)) * smoothstep(0.35, 0.8, uWet) * (1.0 - wat) * (1.0 - steep);
          // 近い泥では窪みの底だけに水を張り、盛り上がった縁のざらつきと照りを分ける。
          // 遠くは従来の広い濡れ斑へ戻す。画素より細かい窪みも同じ係数で消す。
          float clodPool = smoothstep(0.65, 0.96, clod) * smoothstep(0.35, 0.8, uWet);
          pool = mix(pool, clodPool, clamp(clodK * (0.4 + trod * 0.6), 0.0, 1.0));          ${this.def.wetFieldRuts ? `
          // 雨の裸地は轍以外の浅い窪みにも水を残す。斜面・草の肩・田は避ける。
          // 土の色と同じ大小の斑を使い、一定間隔の水玉にはしない。
          float fieldPool = smoothstep(0.38, 0.72, macro2) * earthBasin
            * (w.y + w.z) * groundWet * (1.0 - steep) * (1.0 - wat);
          // 踏まれた窪みほど泥水を残し、通っていない土塊とは艶で分ける。
          // 既存の踏み跡と斑だけを読み、反射用の面・絵は増やさない。
          pool = max(pool, fieldPool * mix(0.58, 0.88, trod));
          // 暗い泥の絵だけで全面を水膜にしない。水は低い窪みへ集め、
          // 土塊の肩と草の根には地肌を残す。既存の斑・高さを共用する。
          pool *= smoothstep(0.25, 0.8, earthBasin);
          ${this.def.wetFieldRuts !== 'wear' ? 'pool = max(pool, rutWet * 0.65);' : ''}
          col = mix(col, mud * vec3(0.84, 0.78, 0.67),
            groundWet * (w.y + w.z) * earthBasin * 0.32);
          ` : ''}
          // 浅い泥水は空の灰色と沈んだ土色。黒い穴にせず縁の土塊との段差を読む。
          col = mix(col, ${this.def.wetFieldRuts ? 'vec3(0.10, 0.105, 0.095) + mud * 0.26' : 'vec3(0.06, 0.065, 0.06) + mud * 0.18'}, pool * 0.85);
          ${this.def.wetFieldRuts ? `
          // 草の房と同じ群落を土にも残す。孤立した草を無地の灰色へ置かない。
          // 既存の斑と配色だけを使い、濡れた窪み・踏み跡は泥のまま保つ。
          float sodClump = 0.5 + 0.5 * sin(wuv.x * 0.18 + sin(wuv.y * 0.11) * 2.4)
            * cos(wuv.y * 0.16 - sin(wuv.x * 0.09) * 1.8);
          float sodRoot = smoothstep(0.42, 0.68, sodClump) * w.x * (1.0 - trod)
            * (1.0 - max(wat, pool));
          col *= mix(vec3(1.0), vec3(0.62, 0.72, 0.48), sodRoot * 0.65);
          ` : ''}
          // 血の跡：黒ずんだ赤茶の染み（縁は絵の濃淡でまだらに。雨の水溜りでは薄まる）
          float bld = wearMarks.g;
          bld = smoothstep(0.08, 0.7, bld * (0.6 + edge * 0.8)) * (1.0 - wat) * (1.0 - pool * 0.6);
          col = mix(col, col * vec3(0.55, 0.3, 0.26) + vec3(0.05, 0.008, 0.004), bld * 0.75);
          // 同じ面の中で風のさざ波を作る（絵の読み出しや描画を足さない）
          vec2 waveSlope = vec2(0.0);
          // 轍と土の窪みは泥に波が吸われる。色と艶は残し、田だけで波紋を計算する。
          // 裸地の水斑を増やしても、遠景まで三角関数と雨の輪の対象を広げない。
          if (${this.def.wetFieldRuts ? 'wat' : 'max(wat, pool)'} > 0.001) {
            vec2 waterDir = vec2(${WIND_STATE.dirX}, ${WIND_STATE.dirZ});
            vec2 waveAxis = vec2(-waterDir.y, waterDir.x);
            // 風下へ流れる雑音の波（川・堀と同じ考え）。決まった間の縞にしない。絵の読みは三回だけ。
            vec2 waveQ = vec2(dot(wuv, waveAxis) * 0.16, dot(wuv, waterDir) * 0.24) - vec2(0.0, uTime * 0.045);
            float waveH = texture2D(tMacro, waveQ).r;
            vec2 waveG = vec2(texture2D(tMacro, waveQ + vec2(0.012, 0.0)).r - waveH, texture2D(tMacro, waveQ + vec2(0.0, 0.012)).r - waveH) * 2.6;
            waveSlope = clamp(waveAxis * waveG.x + waterDir * waveG.y, vec2(-0.06), vec2(0.06));
            col *= 1.0 + (waveH - 0.5) * 0.06 * max(wat, pool);
            // 雨粒の輪は近くの田と水たまりだけ。升を二つずらして並びを崩す。雨が止めば消える。
            float rainNear = 1.0 - smoothstep(10.0, 42.0, soilViewDistance);
            if (uSoilRain > 0.03 && rainNear > 0.0) {
              for (int k = 0; k < 2; k++) {
                vec2 rainP = wuv * 1.4 + vec2(float(k) * 0.5, float(k) * 0.37);
                vec2 rainCell = floor(rainP);
                float rainSeed = fract(sin(dot(rainCell, vec2(127.1, 311.7))) * 43758.5453);
                vec2 drop = fract(rainP) - vec2(0.25 + rainSeed * 0.5, 0.65 - rainSeed * 0.3);
                float age = fract(uTime * 1.3 + rainSeed * 7.0);
                float radius = length(drop);
                float ring = sin((radius - age * 0.5) * 48.0) * exp(-abs(radius - age * 0.5) * 28.0) * (1.0 - age)
                  * step(rainSeed, uSoilRain * 1.2) * rainNear;
                waveSlope += drop / max(0.02, radius) * ring * 0.045 * uSoilRain;
                col *= 1.0 + ring * 0.035 * uSoilRain * max(wat, pool);
              }
            }
          }
          diffuseColor.rgb *= col;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // 細かな凹凸：絵の明るさを高さとみなし、その傾きで法線を傾ける（小石・轍・草の株）
          {
            float wt = smoothstep(0.3, 0.8, surfaceWater);
            ${mat.isMeshLambertMaterial ? `// 軽い材質の土は頂点で照らす。効かない凹凸用の六回の絵の読みを省く。
            vec3 bw = vec3(0.0);` : `
            vec3 bw = vec3(0.0);
            // 色を混ぜた後の草・土・泥から細部を読む。隣の画素を六回読み直す処理を省く。
            float soilRelief = dot(grass, vec3(0.333)) * w.x * 0.035
              + (dot(dirt, vec3(0.333)) * w.y * 0.06 + dot(mud, vec3(0.333)) * w.z * 0.045)
                * mix(1.0, 0.65, soilWet);
            ${this.def.gravelCourt ? 'soilRelief = soilRelief * (1.0 - courtK) + courtRelief;' : ''}
            // 泥の窪みと縁を保ち、斜面の雨溝・露岩の段差も照明に重ねる。
            float trodHeight = (soilRelief + leafRelief + turfRelief + (clodRim * 0.016 - clodHollow * 0.035) * clodK
              ${`+ crustHeight + pebble * mix(0.018, 0.045, clodSeed) * crustK`}
              + (earthRelief + soleRelief) ${this.def.gravelCourt ? '* (1.0 - courtK)' : ''})
              * (1.0 - smoothstep(14.0, 48.0, soilViewDistance)) + slopeRelief;
            vec3 soilDx = dFdx(-vViewPosition), soilDy = dFdy(-vViewPosition);
            vec3 soilR1 = cross(soilDy, normal), soilR2 = cross(normal, soilDx);
            float soilDet = dot(soilDx, soilR1) * faceDirection;
            normal = normalize(abs(soilDet) * normal - sign(soilDet)
              * (dFdx(trodHeight) * soilR1 + dFdy(trodHeight) * soilR2) * (1.0 - max(wt, pool)));
            `}
            // 水面の小さなさざ波（風で揺れる）
            bw += vec3(waveSlope.x, 0.0, waveSlope.y) * max(wt, pool);
            normal = normalize(normal + (viewMatrix * vec4(bw, 0.0)).xyz);
          }`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          // 泥の粒と草の根は粗さを残す。滑らかな反射は下段の水たまりへ限る。
          roughnessFactor = mix(roughnessFactor, 0.82, max(w.z * 0.7, vGroundCover.x * 0.65));
          // 濡れた窪みだけ空や火を鈍く映す。乾いた肩まで一様な艶で覆わない。
          // 土の水膜は粗い粒を残す。水たまりだけ後段で滑らかな水面へ移す。
          roughnessFactor = mix(roughnessFactor, 0.76 + w.x * 0.10, groundWet * (0.55 + w.z * 0.45));
          // 乾いた縁はざらつかせ、雨の時だけ窪みの底の照りを強める。
          roughnessFactor += (earthShoulder * 0.08 - earthBasin * uWet * 0.12) * earthK;
          // 踏み締めた底だけ艶を持ち、押し出した土は乾いた粒を残す。
          roughnessFactor += (soleLip * 0.06 - solePress * (0.08 + uWet * 0.12)) * soleK ${this.def.gravelCourt ? '* (1.0 - courtK)' : ''};
          // 押し出された土の縁はざらつき、湿った窪みだけが滑らかに光る。
          roughnessFactor = clamp(roughnessFactor + clodK * (clodRim * 0.2 - clodHollow * uWet * 0.18), 0.18, 1.0);
          ${`
          // 土塊の頂部は乾いてざらつき、割れ目の底は湿りを残す。
          roughnessFactor = mix(roughnessFactor, 0.98, crustTop * crustK * 0.7);
          roughnessFactor = mix(roughnessFactor, 0.48, crustCrease * crustK * uWet * 0.55);
          `}
          roughnessFactor = mix(roughnessFactor, mix(0.92, 0.52, leafWet), litterCover);
          roughnessFactor = mix(roughnessFactor, 0.42, smoothstep(0.3, 0.8, surfaceWater));
          // 泥の浅い水膜は田の水面より荒い。空を白く映しきらず土粒を残す。
          roughnessFactor = mix(roughnessFactor, 0.26, pool);`)
        // 田の照り返しは空の半分ほどに（白く光りすぎないように）
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // 夜や影でも土・葉・砂利の色を残す。水面は既存の空の照り返しを使う。
          // 曇天の回り込みにも土塊・落ち葉の重なりを残す。既に求めた窪みを共用する。
          float soilCavity = (earthBasin * earthK * 0.22 + clodHollow * clodK * 0.18
            + litterCover * 0.16) * (1.0 - max(wat, pool));
          ${this.def.wetFieldRuts ? `
          // 空から回る光にも窪みの接地を残す。既存の土塊と轍を共用し、描画を増やさない。
          soilCavity += earthBasin * earthK * (0.12 + trod * 0.12) * (1.0 - wat);
          ` : ''}
          reflectedLight.indirectDiffuse *= 1.0 - soilCavity;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * (0.06 + uNight * 0.12) * (1.0 - max(wat, pool) * 0.7);
          // 遠くの田は浅い角度で空を映しきって白い紙のようになるので、遠いほど照り返しを抑える
          float watFar = smoothstep(40.0, 160.0, soilViewDistance);
          ${mat.isMeshLambertMaterial ? `// 低・中でも、空の色と見る角度で田・泥の艶を残す
          vec3 soilView = normalize(cameraPosition - vWP);
          vec3 waterNormal = normalize(vec3(waveSlope.x, 1.0, waveSlope.y));
          float grazing = 1.0 - clamp(dot(soilView, waterNormal), 0.0, 1.0);
          float sheen = (wat * 0.24 + pool * 0.2 + w.z * uWet * 0.035 * (1.0 - steep))
            * (0.25 + grazing * grazing * 0.75) * (1.0 - watFar * 0.5) * (1.0 - bld * 0.6);
          // 空の雲を、波で曲げた向きで映す。寝た向き（遠くの畦・木立の映り）は暗く沈める。描き直しはしない。
          vec3 watRefl = reflect(-soilView, waterNormal);
          float reflectedCloud = (0.55 + 0.6 * texture2D(tMacro, watRefl.xz / (max(watRefl.y, 0.0) + 0.15) * 0.03 + vec2(uTime * 0.002, 0.0)).r)
            * mix(0.55, 1.0, smoothstep(0.02, 0.25, watRefl.y));
          reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud;` : ''}
          reflectedLight.indirectSpecular *= 1.0 - wat * (0.5 + watFar * 0.3) - pool * watFar * 0.4;
          // 濡れた土の粒は水面ほど空を映さない。泥一面が白くなる照りを抑え、窪みの艶は残す。
          reflectedLight.indirectSpecular *= 1.0 - groundWet * (1.0 - max(wat, pool)) * (w.y + w.z) * 0.45;
          ${this.def.wetFieldRuts ? `
          // 雨空の反射が地肌を灰色一色に覆わないよう、泥の水膜だけ照りを抑える。
          // 田の水面は残す。濡れ斑・轍の艶の差は同じ粗さで表す。
          float soilFilm = groundWet * (w.y + w.z) * (1.0 - wat);
          reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular,
            min(reflectedLight.indirectSpecular, diffuseColor.rgb * (0.12 + pool * 0.55) + vec3(0.003 + pool * 0.025)), soilFilm);
          reflectedLight.directSpecular *= 1.0 - soilFilm * (0.35 + pool * 0.25);
          ` : ''}
          reflectedLight.directSpecular *= 1.0 - wat * 0.6;`)
        .replace('#include <opaque_fragment>', `${this.def.wetFieldRuts ? `
          // 雲の環境光が土の色を白灰色へ覆わない。水面の照りは窪みだけへ残す。
          // 光を追加せず、既存の泥・根・足跡の濃淡を最終の照りにも保つ。
          // 雨上がりも空の反射が残る。乾き具合に関係なく土の肩の色を守り、
          // 水の窪みだけ明るい照りを許す。既存の配色と窪みを使う。
          vec3 soilLightLimit = diffuseColor.rgb * 1.9 + vec3(0.004 + pool * 0.055);
          outgoingLight = mix(outgoingLight, min(outgoingLight, soilLightLimit), (1.0 - wat) * 0.96);
          ` : ''}
          #include <opaque_fragment>`);
      this.staticLight.compile(sh);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
    mat.userData.fragmentGroundFire = !!this.def.smoothGroundFire;
    terrainView(mesh, this.def.terrainCullCell, this.scene, this.def.terrainClipCells, this.def.terrainBackfaceCull);
  }
}

// 野の重ね塗り（10/28 leap_ground2）。地面の色が決まった後（color_fragment の後）に、世界座標だけで重ねる。
// 絵は共用の斑と土を読むだけ（2〜3回）。同じ名前の uniform を二度宣言しないよう、別名で同じ値を渡す。
// 自前の地面を持つ戦（志賀・天王寺・越前）が、描き方の最後に同じ重ね塗りをつなぐ（overlay_link）。anchor は重ねる場所の目印。
export function linkLandOverlay(mat, U, anchor) {
  const f = mat.onBeforeCompile;
  mat.onBeforeCompile = function (sh, renderer) { f.call(this, sh, renderer); landOverlay(sh, U, anchor); };
}
export function landOverlay(sh, U, anchor = '#include <color_fragment>') {
  const fs = sh.fragmentShader;
  if (!fs.includes(anchor) || fs.includes('vLsP') || !sh.vertexShader.includes('#include <project_vertex>')) return;
  const tint = !fs.includes('uLandSeason') && !fs.includes('LS_PHOTO_SOIL');   // LS_PHOTO_SOIL：土の写真の色をそのまま見せる戦（10/30 金ヶ崎）は黄緑の掛け色をしない   // 共通の描き方には斑の塗りが既にある。差し替えた戦だけ斑も足す
  Object.assign(sh.uniforms, {
    tLsMacro: U.tMacro, uLsWet: U.uWet, uLsNight: U.uNight, tLsCastle: U.tCastle, uLsCastle: U.uCastle,
    uLsSeason: U.uLandSeason || { value: new THREE.Vector4() }, uLsHeight: U.uLandHeight || { value: new THREE.Vector2(0, 1) },
    tLsDetail: { value: groundDetailPack() },
  }, U.groundGrade || groundGrade(null));
  sh.vertexShader = 'varying vec3 vLsP;\n' + sh.vertexShader.replace('#include <project_vertex>',
    'vLsP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
  let out = 'varying vec3 vLsP;\nuniform sampler2D tLsMacro, tLsCastle, tLsDetail;\nuniform float uLsWet, uLsNight;\nuniform vec4 uLsCastle, uLsSeason, uLsGrade;\nuniform vec3 uLsGradeG0, uLsGradeG1, uLsGradeS0, uLsGradeS1;\nuniform vec2 uLsHeight;\n'
    + fs.replace(anchor, `${anchor}
    // 近くの土の肌（10/30 ground2_c）：小石・足跡・粒の高さと、濡れの照りを、後の凹凸と粗さへ渡す
    float lsHgt = 0.0, lsGloss = 0.0;
    {
      vec3 lsP = vLsP;
      vec3 lsN = normalize(cross(dFdx(lsP), dFdy(lsP)));
      float lsDist = length(lsP - cameraPosition);
      // 斑の絵は 0.5 の前後に寄っているので、差を三倍に広げてから使う
      float lsM1 = clamp((texture2D(tLsMacro, lsP.xz * 0.061 + 0.13).r - 0.5) * 3.2 + 0.5, 0.0, 1.0);
      float lsM2 = clamp((texture2D(tLsMacro, lsP.xz * 0.017 + 0.71).r - 0.5) * 3.2 + 0.5, 0.0, 1.0);
      vec3 lsC = diffuseColor.rgb;
      float lsLum = dot(lsC, vec3(0.3, 0.59, 0.11));
      // 草か土かは色で見分ける（差し替えた戦も同じ式で効く）
      float lsGreen = clamp((lsC.g - max(lsC.r, lsC.b)) / max(lsLum, 1e-4) * 3.0, 0.0, 1.0);
      float lsFlat = smoothstep(0.9, 0.98, abs(lsN.y));
      float lsOn = 1.0;
      if (uLsCastle.w > 0.5) {
        vec2 cuv = (lsP.xz - uLsCastle.xy) * uLsCastle.z;
        if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) lsOn = 1.0 - smoothstep(0.1, 0.5, texture2D(tLsCastle, cuv).r);
      }
      float lsH = clamp((lsP.y - uLsHeight.x) / uLsHeight.y, 0.0, 1.0);
      float lsLo = (1.0 - smoothstep(0.0, 0.3, lsH)) * uLsSeason.w;
      float lsDry = clamp(smoothstep(0.42, 0.75, lsM2 * 0.6 + lsM1 * 0.4) + uLsSeason.x - uLsWet * 0.5, 0.0, 1.0);
      float lsDamp = clamp(smoothstep(0.5, 0.85, 1.0 - (lsM2 * 0.5 + lsM1 * 0.5)) + lsLo * 0.4 + uLsWet * 0.4 - lsDry * 0.5, 0.0, 1.0);
      if (uLsGrade.x > 0.0) {
        // 手本の写真の地面の色へ寄せる（10/30 top5_ground）。草か土かは赤に対する緑の比で分ける（枯れ草も草に入れる）。
        // 茶の土の所は大きな斑で草の色へ変え（cover）、草と土それぞれ数十mの斑で二色を混ぜる。
        // 色味は手本、明るさは今の画素と手本の間（細かな濃淡は残す）。雪・夜・城の平場・切岸は弱める。
        float lsGr = smoothstep(0.78, 0.96, lsC.g / max(lsC.r, 1e-4));
        float lsCov = smoothstep(0.42, 0.68, lsM2 * 0.75 + lsM1 * 0.25) * uLsGrade.y;
        lsGr = max(lsGr, lsCov);
        float lsTwo = smoothstep(0.3, 0.7, lsM1 * 0.6 + lsM2 * 0.4);
        vec3 lsTg = mix(mix(uLsGradeS0, uLsGradeS1, lsTwo), mix(uLsGradeG0, uLsGradeG1, 1.0 - lsTwo), lsGr);
        float lsTl = dot(lsTg, vec3(0.3, 0.59, 0.11));
        vec3 lsRe = lsTg * pow(max(lsLum, 1e-4) / max(lsTl, 1e-4), mix(0.65, 1.0, uLsNight));
        float lsSn = smoothstep(0.35, 0.6, lsLum) * (1.0 - smoothstep(0.06, 0.18, (max(lsC.r, max(lsC.g, lsC.b)) - min(lsC.r, min(lsC.g, lsC.b))) / max(lsLum, 1e-4)));
        lsC = mix(lsC, lsRe, uLsGrade.x * mix(uLsGrade.z, 1.0, lsGr) * lsOn * (1.0 - lsSn) * mix(0.35, 1.0, smoothstep(0.6, 0.9, abs(lsN.y))));
        lsLum = dot(lsC, vec3(0.3, 0.59, 0.11));
        lsGreen = clamp((lsC.g - max(lsC.r, lsC.b)) / max(lsLum, 1e-4) * 3.0, 0.0, 1.0);
      }
      ${tint ? `
      // 差し替えた戦の地面にも、数十mの青草・枯れ草・湿った草の斑と、土の明暗を。
      float lsClump = 0.5 + 0.5 * sin(lsP.x * 0.83 + sin(lsP.z * 0.61 + lsM1 * 4.0) * 1.7) * sin(lsP.z * 0.71 - sin(lsP.x * 0.47 + lsM2 * 3.0) * 1.5);
      vec3 lsT = mix(vec3(0.84, 1.08, 0.74), vec3(1.75, 1.3, 0.56), lsDry);
      lsT = mix(lsT, vec3(0.5, 0.7, 0.56), lsDamp * (1.0 - lsDry * 0.6));
      lsT *= mix(0.52, 1.45, lsM1) * mix(0.82, 1.14, lsClump);
      lsC *= mix(vec3(1.0), lsT, lsGreen * lsOn * mix(0.6, 1.0, lsFlat));
      lsC *= mix(1.0, mix(0.72, 1.18, lsM2) * mix(0.88, 1.1, lsM1), (1.0 - lsGreen) * lsOn);
      ` : ''}
      // 踏み跡と轍：野を横切る細い道を二つの向きで、曲げて途切れさせて引く。一部は荷車の二本の轍（溝は湿って黒く、間に草）。
      float lsPw = 0.5 + lsM1 * 0.4 + lsDist * 0.005;
      float lsFoot = 0.0, lsRut = 0.0, lsLane = 0.0;
      for (int k = 0; k < 2; k++) {
        vec2 pdir = k == 0 ? vec2(0.8, 0.6) : vec2(0.28, -0.96);
        float pcell = k == 0 ? 31.0 : 53.0;
        float pq = dot(lsP.xz, pdir), pp = dot(lsP.xz, vec2(-pdir.y, pdir.x));
        float poff = sin(pq * 0.027 + float(k) * 2.3) * 9.0 + sin(pq * 0.071 + lsM2 * 3.0) * 2.5 + (lsM1 - 0.5) * 2.0;
        float pc = (pp + poff) / pcell, pid = floor(pc + 0.5);
        float pd = abs(pc - pid) * pcell;
        float ph = fract(sin((pid + 0.37) * 12.9898 + float(k) * 7.13) * 43758.5);
        float pon = smoothstep(-0.55, -0.25, sin(pq * 0.019 + ph * 6.28)) * step(0.08, ph);
        float cart = step(0.55, ph);
        lsFoot = max(lsFoot, (1.0 - smoothstep(lsPw * 0.5, lsPw, pd)) * pon * (1.0 - cart));
        lsRut = max(lsRut, (1.0 - smoothstep(0.14, 0.3 + lsDist * 0.004, abs(pd - 0.78))) * pon * cart);
        lsLane = max(lsLane, (1.0 - smoothstep(0.9, 1.5, pd)) * pon * cart);
      }
      float lsK = lsFlat * lsOn;
      lsFoot *= lsK; lsRut *= lsK; lsLane *= lsK;
      // 粒の写真（砂利・土・草・霜の濃淡を四つの段に詰めた一枚）を、向きと縮尺を変えて二回読む。
      // 近くは 2.4m の繰り返し、中ほど（〜110m）は 9m の繰り返しで、坂の上から見下ろす戦でも一色にしない。
      // 遠くで粒の繰り返しが並んで見えないよう、大きな斑で読む所をゆっくりずらす（斑は数十mなので歪みは見えない）
      // 前は強めた斑（lsM1・lsM2）でずらしていた。斑の細かな傾きが粒の縮尺を超え、粒の写真が渦の縞に引き伸ばされた
      // （伊賀の道。10/31）。ずらしは百m級の斑を粗い段（mipmap）で一回読んだなめらかな値から取り、傾きを粒の縮尺より十分小さく保つ。
      float lsWm = texture2D(tLsMacro, lsP.xz * 0.0071 + 0.29, 4.0).r;
      vec2 lsW = vec2(0.8, 0.6) * (lsWm - 0.5) * 2.0;
      // 低い目線（高さ2〜5m）では20m先から画素が奥へ長く伸び、粒の写真は細かい段（mipmap）へ落ちて濃淡が消える
      // （草の写真の濃淡は段4で元の15%、土で22%）。読んだ段を微分から見積もり、消えた分だけ濃淡を戻す（10/30 c_ground3）。
      // 異方性4を見込む：長い向きの幅を4で割り、短い向きと大きい方を取る。読み出しは増やさない。
      vec2 lsQx = dFdx(lsP.xz), lsQy = dFdy(lsP.xz);
      float lsQa = dot(lsQx, lsQx), lsQb = dot(lsQy, lsQy);
      float lsLod0 = 0.5 * log2(max(max(lsQa, lsQb) / 16.0, min(lsQa, lsQb)) + 1e-8);
      float lsGainA = min(3.2, exp2(0.62 * clamp(lsLod0 + 7.71, 0.0, 6.0)));   // 512×0.41
      float lsGainB = min(3.2, exp2(0.62 * clamp(lsLod0 + 5.82, 0.0, 6.0)));   // 512×0.11
      vec4 lsDA = vec4(0.0);
      float lsNearA = 1.0 - smoothstep(14.0, 50.0, lsDist), lsNearB = 1.0 - smoothstep(70.0, 150.0, lsDist);
      if (lsNearA > 0.001) lsDA = texture2D(tLsDetail, lsP.xz * 0.41 + lsW) - 0.5;
      vec4 lsDB = (texture2D(tLsDetail, vec2(lsP.z, -lsP.x) * 0.11 + 0.37 - lsW * 0.25) - 0.5) * mix(0.55, 1.3, lsM1);
      vec4 lsD = lsDA * lsNearA * 0.7 + lsDB * lsNearB * mix(0.6, 0.4, lsNearA);
      // 見える濃淡（色だけ）。凹凸は元のまま（遠くの凹凸を強めるとちらつく）
      vec4 lsDv = lsDA * (lsNearA * 0.7 * lsGainA) + lsDB * (lsNearB * mix(0.6, 0.4, lsNearA) * lsGainB);
      // 数mの株と裸地のむら：大きな斑（数十m）と粒（数十cm）の間の段。20〜60m 先で草の斑・土の色むらに見える縮尺
      float lsM3 = clamp((texture2D(tLsMacro, vec2(lsP.x + lsP.z * 0.35, lsP.z - lsP.x * 0.35) * 0.19 + 0.53).r - 0.5) * 3.4 + 0.5, 0.0, 1.0);
      // 土の色は共用の土の写真の平均に、土の粒の濃淡を掛ける（土の絵を読み足さない）
      vec3 lsSoil = vec3(0.31, 0.21, 0.115) * (1.0 + lsD.g * 1.6) * vec3(1.0, 0.9, 0.74) * mix(0.8, 1.12, lsM1) * (1.0 - lsDamp * 0.3);
      lsC = mix(lsC, lsSoil, lsFoot * 0.85);
      lsC = mix(lsC, mix(lsC, lsSoil * vec3(0.95, 1.0, 0.85), 0.72), lsLane * (1.0 - lsRut));
      float lsRutWet = clamp(0.35 + uLsWet * 0.5 + lsDamp * 0.4, 0.0, 1.0);
      lsC = mix(lsC, lsSoil * mix(0.7, 0.36, lsRutWet), lsRut * 0.9);
      // 湿った窪み：低い所と斑の湿った所は黒く濡れた土（青草の上にも出す）
      float lsPool = smoothstep(0.72, 0.92, 1.0 - lsM1 * 0.6 - lsM2 * 0.4) * clamp(0.3 + lsLo + uLsWet + lsDamp * 0.4, 0.0, 1.0) * lsK;
      lsC = mix(lsC, lsSoil * 0.42 * (1.0 - uLsNight * 0.3), lsPool * 0.65);
      // 近くの粒（10/28 leap_ground3）：草は草の粒、土は土の粒、乾いた高みと城の平場は砂利、白い雪は霜の粒。
      // 夜は差を少し強く（暗い戦でも一色に見せない）。
      float lsNear = mix(0.55, 1.0, smoothstep(0.35, 0.8, abs(lsN.y)));
      float lsSat = (max(lsC.r, max(lsC.g, lsC.b)) - min(lsC.r, min(lsC.g, lsC.b))) / max(max(lsC.r, max(lsC.g, lsC.b)), 1e-4);
      float lsSnow = smoothstep(0.38, 0.62, lsLum) * (1.0 - smoothstep(0.08, 0.2, lsSat));
      float lsGv = clamp(max(1.0 - lsOn, (1.0 - lsGreen) * smoothstep(0.55, 0.85, lsDry + lsH * 0.3) * 0.8), 0.0, 1.0);
      float lsDet = lsDv.b * lsGreen + lsDv.g * (1.0 - lsGreen) * (1.0 - lsGv) + lsDv.r * lsGv;
      lsDet = mix(lsDet, lsDv.a, lsSnow);
      lsDet -= lsRut * lsDv.g * 0.5;
      {
        // 株と裸地のむら：草は濃い株・枯れた株・地の見える所、土は湿り乾きの明暗。足元から遠くまで同じ縮尺で、遠くは薄く
        float lsMidK = lsK * (1.0 - smoothstep(110.0, 190.0, lsDist)) * (1.0 - lsSnow);
        float lsTuft = smoothstep(0.15, 0.85, lsM3);
        lsC *= mix(1.0, mix(0.74, 1.16, lsTuft), lsMidK * lsGreen);
        lsC = mix(lsC, lsC * vec3(1.16, 1.04, 0.78), smoothstep(0.62, 0.9, lsM3 * 0.7 + lsDry * 0.3) * lsGreen * lsMidK * 0.6);
        lsC = mix(lsC, lsSoil * mix(0.85, 1.05, lsM1), (1.0 - smoothstep(0.04, 0.2, lsM3)) * lsGreen * lsMidK * 0.55 * (1.0 - lsPool));
        lsC *= mix(1.0, mix(0.8, 1.14, lsM3), lsMidK * (1.0 - lsGreen));
      }
      {
        // 1〜3mの大きな斑（10/31 c_ground_read）：写真の粒は 844×390 の画面では数画素に潰れ、平均の一色に見える
        // （金ヶ崎・志賀で 16画素の塊の明るさの散らばりは粒全体の半分ほど）。草の島・乾いた裸地・湿った黒い土を
        // 縁のはっきりした塊で写真の上に置き、20〜60m 先でも塊として読ませる。坂にも置く（金ヶ崎の斜面）。
        // 色は今の画素からの掛け算と、手本の色のある戦はその草の色（戦ごとの色合わせは残す）。絵の読み出しは一つだけ足す。
        float lsBk = smoothstep(0.55, 0.8, abs(lsN.y)) * lsOn * (1.0 - smoothstep(80.0, 180.0, lsDist)) * (1.0 - lsSnow)
          * (1.0 - lsPool) * (1.0 - max(lsFoot, lsRut));
        vec2 lsBq = vec2(lsP.x * 0.92 - lsP.z * 0.39, lsP.z * 0.92 + lsP.x * 0.39) * 0.1 + lsW * 0.08 + 0.61;
        float lsB = clamp((texture2D(tLsMacro, lsBq).r - 0.5) * 3.4 + 0.5, 0.0, 1.0);
        // 遠く（40m〜）は数mの斑（lsM1）へ移し、塊が一画素より細かくならないように
        lsB = mix(lsB, lsM1, smoothstep(30.0, 80.0, lsDist));
        float lsE = mix(0.04, 0.13, smoothstep(5.0, 70.0, lsDist));   // 縁の幅（遠くは柔らかく、ちらつき止め）
        float lsDryB = smoothstep(0.4, 0.62, lsM3 * 0.55 + lsDry * 0.45);
        float lsIsle = smoothstep(0.64 - lsE, 0.64 + lsE, lsB) * lsBk;
        float lsBare = smoothstep(0.38 + lsE, 0.38 - lsE, lsB) * lsDryB * lsBk;
        float lsMuck = smoothstep(0.34 + lsE, 0.34 - lsE, lsB) * (1.0 - lsDryB) * lsBk;
        float lsLumB = dot(lsC, vec3(0.3, 0.59, 0.11));
        vec3 lsIsleC = uLsGrade.x > 0.0 ? mix(uLsGradeG0, uLsGradeG1, lsM3) : mix(vec3(0.33, 0.35, 0.08), vec3(0.44, 0.39, 0.1), lsM3);
        lsIsleC = mix(lsIsleC, lsIsleC * vec3(1.3, 1.02, 0.72), uLsSeason.x);   // 秋冬は枯れた株
        lsIsleC *= lsLumB * 0.7 / max(dot(lsIsleC, vec3(0.3, 0.59, 0.11)), 1e-4);
        lsC = mix(lsC, mix(lsIsleC, lsC * vec3(0.66, 0.76, 0.42), lsGreen), lsIsle * 0.82);
        vec3 lsBareC = lsSoil * vec3(1.12, 1.06, 0.98);
        lsBareC *= max(lsLumB, 0.06) * 1.22 / max(dot(lsBareC, vec3(0.3, 0.59, 0.11)), 1e-4);
        lsC = mix(lsC, mix(lsC * vec3(1.3, 1.2, 1.02), lsBareC, lsGreen), lsBare * 0.75);
        lsC = mix(lsC, mix(lsC * vec3(0.42, 0.37, 0.32), lsSoil * 0.42, lsGreen * 0.6), lsMuck * 0.75);
        lsGloss = max(lsGloss, lsMuck * 0.35 * lsFlat);
      }
      lsC *= max(0.25, 1.0 + lsDet * lsNear * (1.7 + uLsNight * 0.9));
      // 霜：冬の朝夜は平らな所に写真の霜の斑（踏み跡と轍は溶ける）
      float lsFr = uLsSeason.y * lsFlat * smoothstep(-0.05, 0.2, lsD.a) * (1.0 - max(lsFoot, lsRut)) * (1.0 - uLsWet);
      lsC = mix(lsC, vec3(0.6, 0.64, 0.68) * (1.0 - uLsNight * 0.35), lsFr * mix(0.35, 0.7, lsNearA));
      // 遠くの土と草にも数十mの明暗を薄く（同じ絵の並びを割る）
      lsC *= mix(1.0, mix(0.9, 1.08, lsM1) * mix(0.95, 1.04, lsM2), smoothstep(35.0, 140.0, lsDist));
      // 濡れ：雨・湿った斑・水溜まり・湿った轍は暗く照る（草の上は弱く）
      float lsSoilK = (1.0 - lsGreen) * (1.0 - lsSnow);
      lsGloss = clamp(uLsWet * 0.55 + lsDamp * 0.25 + lsPool * 0.9 + lsRut * lsRutWet * 0.6, 0.0, 1.0) * mix(0.3, 1.0, lsSoilK) * lsFlat;
      // 近くだけ（〜22m）：土の粒・小石・足跡・草の根元の暗さ。遠くの画素は読まずに飛ばす。
      float lsCl = (1.0 - smoothstep(6.0, 22.0, lsDist)) * lsNear;
      vec2 lsPq = lsP.xz * 2.6;
      float lsPa = 1.0 - smoothstep(0.12, 0.3, length(fwidth(lsPq)));   // 小石が一画素より細かい所は描かない（ちらつき止め）
      vec2 lsFq = lsP.xz * 1.15;
      float lsFa = 1.0 - smoothstep(0.1, 0.25, length(fwidth(lsFq)));
      if (lsCl > 0.001) {
        // 土の粒：粒の写真をもう一段細かく（約0.6m の繰り返し）。草は根元の影、土は粒の凹凸。
        vec4 lsDC = texture2D(tLsDetail, vec2(-lsP.z, lsP.x) * 1.63 + lsW * 3.0 + 0.21) - 0.5;
        float lsGrain = lsDC.g * (1.0 - lsGv) + lsDC.r * lsGv;
        lsC *= 1.0 + lsGrain * lsSoilK * lsCl * 1.2;
        lsHgt += (lsGrain * 0.5 + lsD.g * 0.5) * 0.012 * lsSoilK;
        // 草の根元：株の間の暗がりと、土との際の影
        float lsRoot = 1.0 - smoothstep(-0.3, 0.15, lsD.b + lsDC.b * 0.6);
        lsC *= 1.0 - (lsRoot * 0.38 * lsGreen + lsGreen * (1.0 - lsGreen) * 0.9) * lsCl * (1.0 - lsSnow);
        // 小石：38cm の升に一つ置くかどうかを決め、向きと大きさを変えた楕円の丸み（縁に接地の影）
        vec2 lsPc = floor(lsPq), lsPf = fract(lsPq) - 0.5;
        vec3 lsPh = fract(sin(vec3(dot(lsPc, vec2(127.1, 311.7)), dot(lsPc, vec2(269.5, 183.3)), dot(lsPc, vec2(419.2, 371.9)))) * 43758.5453);
        float lsPden = clamp(0.2 + lsGv * 0.45 + lsDry * 0.15 + lsFoot * 0.15 - lsDamp * 0.15 - lsPool * 0.5, 0.0, 0.8) * lsSoilK;
        vec2 lsPo = lsPf - (lsPh.xy - 0.5) * 0.36;
        float lsPan = lsPh.y * 6.283;
        lsPo = mat2(cos(lsPan), sin(lsPan), -sin(lsPan), cos(lsPan)) * lsPo;
        float lsPr = mix(0.08, 0.24, lsPh.z * lsPh.z);
        float lsPd = length(lsPo * vec2(1.0, 1.55)) / lsPr;
        float lsPon = step(1.0 - lsPden, fract(lsPh.x * 7.31)) * lsPa * lsCl;
        float lsStone = (1.0 - smoothstep(0.85, 1.0, lsPd)) * lsPon;
        vec3 lsStC = mix(vec3(dot(lsC, vec3(0.333))), lsC, 0.35) * mix(0.95, 1.75, fract(lsPh.z * 13.7)) * vec3(1.0, 0.98, 0.95) * mix(1.2, 0.65, lsPd * lsPd);
        lsC *= 1.0 - (1.0 - smoothstep(1.0, 1.45, lsPd)) * (1.0 - lsStone) * lsPon * 0.5;
        lsC = mix(lsC, lsStC, lsStone);
        lsHgt += sqrt(max(0.0, 1.0 - lsPd * lsPd)) * lsPr * 0.12 * lsPon;
        lsGloss = mix(lsGloss, lsGloss * 0.6 + uLsWet * 0.35, lsStone);
        // 足跡：踏み跡と土の所に、0.87m の升ごとに草鞋の跡（へこみと盛り上がった縁）。濡れると水が溜まって照る。
        vec2 lsFc = floor(lsFq), lsFf = fract(lsFq) - 0.5;
        vec3 lsFh = fract(sin(vec3(dot(lsFc, vec2(41.3, 289.1)), dot(lsFc, vec2(173.9, 61.7)), dot(lsFc, vec2(97.1, 211.3)))) * 23421.631);
        float lsFan = lsFh.x * 6.283;
        vec2 lsFo = mat2(cos(lsFan), sin(lsFan), -sin(lsFan), cos(lsFan)) * (lsFf - (lsFh.yz - 0.5) * 0.4) / 1.15;
        float lsFd = length(lsFo / vec2(0.055, 0.13));
        float lsFon = step(1.0 - clamp(lsFoot * 0.9 + lsLane * 0.4 + lsSoilK * 0.25, 0.0, 0.85), lsFh.z) * lsSoilK * lsFa * lsCl;
        float lsPit = (1.0 - smoothstep(0.7, 1.0, lsFd)) * lsFon;
        float lsLip = smoothstep(0.85, 1.05, lsFd) * (1.0 - smoothstep(1.05, 1.4, lsFd)) * lsFon;
        lsC *= 1.0 - lsPit * 0.3 + lsLip * 0.12;
        lsHgt += (lsLip * 0.006 - lsPit * 0.014) * (1.0 - lsStone);
        lsGloss = max(lsGloss, lsPit * clamp(uLsWet * 1.2 + lsDamp * 0.4, 0.0, 1.0));
      }
      // 濡れた土は暗い（照りは粗さで出す）
      lsC *= 1.0 - lsGloss * 0.12 * lsSoilK;
      diffuseColor.rgb = lsC;
    }`);
  // 小石・足跡・粒の凹凸を照らし（傾きは画面の上の差で取る）、濡れた所の粗さを下げる
  if (out.includes('#include <normal_fragment_maps>')) out = out.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    {
      vec3 lsDx = dFdx(-vViewPosition), lsDy = dFdy(-vViewPosition);
      vec3 lsR1 = cross(lsDy, normal), lsR2 = cross(normal, lsDx);
      float lsDt = dot(lsDx, lsR1) * faceDirection;
      normal = normalize(abs(lsDt) * normal - sign(lsDt) * (dFdx(lsHgt) * lsR1 + dFdy(lsHgt) * lsR2));
    }`);
  if (out.includes('#include <metalnessmap_fragment>')) out = out.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
    roughnessFactor = mix(roughnessFactor, 0.28, lsGloss * 0.75);`);
  sh.fragmentShader = out;
}
