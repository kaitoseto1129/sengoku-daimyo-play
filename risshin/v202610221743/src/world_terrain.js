import { SEG, rng, distToPolyline, NO_STREAMS } from './world_common.js';
import * as THREE from 'three';
import { liteMat } from './world_vegetation_materials.js';
import { dirtTex, grassTex, bankTex, mudTex, stoneTex, macroTex, gravelTex } from './nature.js';
import { S as SETTINGS } from './settings.js';
import { WEAR, WIND, WIND_STATE } from './world_weather.js';
import { terrainView } from './terrain_view.js';


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
    const mat = liteMat({ color: 0xffffff, map: dirtTex(), roughness: 0.95, metalness: 0, envMapIntensity: this.def.wetFieldRuts ? 0.2 : 0.55 });
    // 坂は本人の足より高くても地面。屋根・柱を抜く処理へ渡すと、
    // 手前の山肌が画面中央の四角い範囲で消え、空の色が露出する。
    mat.userData.camNearSolid = true;
    // 道肩の湿乾差・草の斑・濡れた踏み溝は、それぞれの指定に合う描き方を使う。
    mat.customProgramCacheKey = () => `ground|${!!(this.def.patchyGround || this.def.roadsideGrass)}|${!!this.def.slopeForestTint}|${this.half}|${!!this.def.autumn}|${!!this.def.winter}|${!!this.def.snow}|${SETTINGS.quality}|${!!this.def.springSnowPatch}|${JSON.stringify(this.def.gravelCourt || null)}|${!!this.def.softEarthCrust}|${!!this.def.stableSlopeGrain}|${!!this.def.subtleMudRelief}|${!!this.def.churnedMud}|${!!this.def.sparseEarthCrust}|${!!this.def.stableCliffGrain}|${!!this.def.stableRockProjection}|${!!this.def.patchyGround}|${this.def.wetFieldRuts || false}|${JSON.stringify(this.def.trampledField || null)}`;
    // 通行の跡を持つ戦は無地の泥を使う。窪みと足形を残す指定の戦だけ従来の絵へ戻す。
    this.groundU = { tGrass: { value: grassTex(!!this.def.plainGrassGround) }, tDirt: { value: dirtTex() }, tBank: { value: bankTex() }, tMud: { value: mudTex(this.def.wetFieldRuts === 'wear' && !this.def.mudImprints) }, tStone: { value: stoneTex() }, tMacro: { value: macroTex() }, uWet: { value: 0 }, uForest: { value: this.def.slopeForest ?? 0 }, uRock: { value: this.def.cliffRock ?? 0 }, uNight: this.nightU, uSoilRain: { value: 0 }, tWear: WEAR, uTime: { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } }, uSoilSky: { value: this.hemi.color } };
    if (this.def.gravelCourt) this.groundU.tCourt = { value: gravelTex() };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.groundU);
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
      sh.fragmentShader = 'varying vec2 vGroundCover;\n' + 'uniform sampler2D tGrass, tDirt, tBank, tMud, tStone, tMacro, tWear, tCourt;\nuniform float uWet, uTime, uSoilRain, uNight, uForest, uRock;\nuniform vec3 uSoilSky;\nvarying float vWater;\nvarying vec3 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader
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
          vec3 dirt = mix(texture2D(tDirt, wuv * ${SETTINGS.quality === 'high' ? '0.46' : '0.23'}).rgb, texture2D(tDirt, ruv * ${SETTINGS.quality === 'high' ? '0.22' : '0.11'} + 0.57).rgb, mixK * 0.6) * mix(0.85, 1.12, macro2);
          ${this.def.patchyGround || this.def.roadsideGrass ? `
          // 広い裸地にも湿乾差をつなぐ。既存の大小の斑だけを使い、絵の読み出しは増やさない。
          float dampSoil = smoothstep(0.38, 0.68, macro) * (1.0 - smoothstep(0.35, 0.72, macro2));
          dirt *= mix(vec3(1.06, 1.03, 0.96), vec3(0.61, 0.68, 0.62), dampSoil);
          ` : ''}
          // 足もとは細かく：近くだけ、もっと細かな縮尺の絵を重ねて、ぼやけた地面にしない
          float nearK = 1.0 - smoothstep(6.0, 15.0, soilViewDistance);
          ${`if (nearK > 0.0) {
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
          grass = mix(grass, mix(vec3(0.055, 0.075, 0.025), vec3(0.135, 0.155, 0.065), loamPatch)
            * fieldGrassGrain, 0.72);
          // 土色への補正で元の粒まで塗り潰さない。近景から中景へ写真の濃淡を残す。
          dirt = mix(dirt * vec3(0.9, 0.81, 0.66),
            mix(vec3(0.105, 0.075, 0.043), vec3(0.22, 0.165, 0.09), loamPatch) * dirtGrain, 0.8);
          mud = mix(mud * vec3(0.78, 0.69, 0.55),
            mix(vec3(0.065, 0.048, 0.03), vec3(0.145, 0.105, 0.059), loamPatch) * clayGrain, 0.8);
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
            * ${this.def.templeNeedles ? '1.6' : this.def.autumn && !this.def.winter && !this.def.snow ? '0.85' : '0.4'}, 0.0, 0.85);
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
          col *= mix(0.94, 1.3, macro);
          // 雨で濡れると暗く
          // 夜は濡れによる黒つぶれを抑え、泥と草の濃淡を残す。
          // 雨の野戦は窪み側で既に沈めた色を、全面の濡れで二重に黒くしない。
          col *= 1.0 - groundWet * (${this.def.wetFieldRuts ? '0.16 + w.z * 0.09' : '0.28 + w.z * 0.15'}) * (1.0 - uNight * 0.55);
          // 夜も土の茶・草と苔の灰緑を残す。青い灰色への置き換えを弱め、明るさだけを沈める。
          col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(1.02, 0.98, 0.88), uNight * 0.16) * (1.0 - uNight * 0.2);
          // 田の水面：濁った水の色。空は映すが、ぎらつかせない（照り返しは下で弱める）
          float wat = smoothstep(0.3, 0.8, surfaceWater);
          col = mix(col, vec3(0.075, 0.08, 0.06) + mud * 0.22 + grass * 0.05, wat * 0.92);
          // 踏み荒らされた窪みに、雨の強さ（濡れ具合）で水が溜まる。雨が上がっても乾くまで残る
          // 泥の暗いくぼみや踏み固めた道にも水が残る。斜面には溜めない
          float hollow = 1.0 - smoothstep(0.035, 0.075, dot(mud, vec3(0.333)));
          // 踏まれた面の全体を鏡にしない。水は既存の窪みだけへ残す。
          float pool = max(smoothstep(0.55, 0.95, wear) * earthBasin, w.z * hollow + w.y * hollow * 0.3)
            * (1.0 - smoothstep(0.3, 0.55, edge)) * smoothstep(0.35, 0.8, uWet) * (1.0 - wat) * (1.0 - steep);
          // 近い泥では窪みの底だけに水を張り、盛り上がった縁のざらつきと照りを分ける。
          // 遠くは従来の広い濡れ斑へ戻す。画素より細かい窪みも同じ係数で消す。
          float clodPool = smoothstep(0.65, 0.96, clod) * smoothstep(0.35, 0.8, uWet);
          pool = mix(pool, clodPool, clamp(clodK * (0.4 + trod * 0.6), 0.0, 1.0));
          ${this.def.wetFieldRuts ? `
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
            float waveA = dot(wuv, waterDir) * 2.4 - uTime * 1.1;
            float waveB = dot(wuv, waveAxis) * 3.7 - uTime * 0.7;
            waveSlope = waterDir * cos(waveA) * 0.035 + waveAxis * cos(waveB) * 0.018;
            col *= 1.0 + (sin(waveA) * 0.025 + sin(waveB) * 0.015) * max(wat, pool);
            // 雨粒の輪は田と水たまりだけ。粒や面を増やさず、雨が止めば消える。
            if (uSoilRain > 0.03) {
              vec2 rainCell = floor(wuv * 1.4);
              float rainSeed = fract(sin(dot(rainCell, vec2(127.1, 311.7))) * 43758.5453);
              vec2 drop = fract(wuv * 1.4) - vec2(0.25 + rainSeed * 0.5, 0.65 - rainSeed * 0.3);
              float age = fract(uTime * 1.3 + rainSeed);
              float radius = length(drop);
              float ring = sin((radius - age * 0.5) * 48.0) * exp(-abs(radius - age * 0.5) * 28.0) * (1.0 - age);
              waveSlope += drop / max(0.02, radius) * ring * 0.045 * uSoilRain;
              col *= 1.0 + ring * 0.035 * uSoilRain * max(wat, pool);
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
          // 空の大きな雲を映す。鏡用の描き直しをせず、既存の斑を揺らす。
          float reflectedCloud = 0.7 + 0.3 * sin(wuv.x * 0.065 + sin(wuv.y * 0.05 + uTime * 0.025) * 1.8);
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
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
    mat.userData.fragmentGroundFire = !!this.def.smoothGroundFire;
    terrainView(mesh, this.def.terrainCullCell, this.scene, this.def.terrainClipCells, this.def.terrainBackfaceCull);
  }
}
