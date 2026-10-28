import { rng, distToPolyline, mergeVegetationParts, tuftClumpAt, TUFT_AUTUMN } from './world_common.js';
import { castleInside } from './world_castle.js';
import { leafTex, barkTex, alphaTex, stoneTex } from './nature.js';
import * as THREE from 'three';
import { liteMat, sway, farTreeLit, nearTreeLit, leafLit, treeTriangles, treeCards, scaleTreePart, treeTextureKind, treeCardDepth, treeLeafMap, grassLit, grassAlpha, keepAlpha, riceLit } from './world_vegetation_materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { rockShape, groundRocks } from './rock_shape.js';


// 10/24 kaito：足元の草・田の稲・草むらは全戦で作らない（地面は土と色の絵だけ）
const NO_GRASS = true;

export class WorldVegetation {

  buildVegetation() {
    this.treeCardSavings = 0;
    const R = rng(this.def.seed || 11);
    // 画質「低」（携帯の既定）：作る時間を縮める。木の形の種類・株のためし置き・足もとの草・田の苗・低木を減らす（遠目の見た目は変えない程度に）
    // window.__vegFull を true にすると「低」でも減らさない（前後の見比べ用）
    const lowV = false && !window.__vegFull;
    // 段ごとの作る時間（ミリ秒）を window.__vegTimes に残す（読み込みの重さを調べる係が読む）
    const VT = window.__vegTimes = {}; let vt0 = performance.now();
    const lap = (k) => { const t = performance.now(); VT[k] = Math.round(t - vt0); vt0 = t; };
    const clear = this.def.clear || (() => false);
    const paths = this.def.paths || [];
    const ok = (x, z, pad, rockBand = false) => {
      if (this.castle && castleInside(this.castle, x, z, 8)) return false;   // 曲輪と土塁の上には木を立てない
      if (!rockBand && clear(x, z)) return false;
      for (const p of paths) if (distToPolyline(x, z, p) < pad * (this.def.treePadMul ?? 1)) return false;   // 細い山道は木を道の際まで（def.treePadMul）
      if (this.def.water && x > this.def.water.x - 4 && x < (this.def.water.x2 ?? 1e9) + 3) return false;
      for (const st of this.def.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.6 + pad * 0.3) return false;
      if (this.def.paddy && this.def.paddy(x, z) > 0.3) return false;
      return true;
    };
    // 木：杉は垂れる枝房、松は枝先の房、広葉樹は重なる葉の塊。形は林全体で使い回す。
    let trees = { sugi: [], matsu: [], broad: [], take: [] };
    const treeCount = this.def.trees ?? 520;
    const extra = this.def.groves || [];
    const place = (x, z, inGrove, fixedKind) => {
      const y = this.heightAt(x, z);
      const s = 0.75 + R() * 0.6;
      const r = R();
      const sg = this.def.sugiAt ? this.def.sugiAt(x, z) : 0;   // 杉林（def.sugiAt：0〜1 で杉の割合を上げる）
      // 土地ごとの樹種の割合。同じ形を共有し、本数と乱数の消費は変えない。
      const cedar = this.def.treeMix?.sugi ?? 0.46 + sg * 0.5;
      const pine = this.def.treeMix?.matsu ?? 0.66 + sg * 0.3;
      const kind = fixedKind ?? (this.def.pineOnly ? 'matsu' : inGrove && r < 0.12 && !sg ? 'take' : r < cedar ? 'sugi' : r < pine ? 'matsu' : 'broad');
      trees[kind].push([x, y, z, s, R()]);
    };
    let tries = 0;
    let placed = 0;
    while (placed < treeCount && tries < treeCount * 12) {
      tries++;
      const x = (R() * 2 - 1) * (this.half - 4), z = (R() * 2 - 1) * (this.half - 4);
      if (!ok(x, z, 7)) continue;
      const dens = this.def.treeDensity ? this.def.treeDensity(x, z) : 1;
      if (R() > dens) continue;
      place(x, z, false); placed++;
      // 森らしく、近くにもう一、二本
      const cedarGrove = this.def.sugiAt ? this.def.sugiAt(x, z) : 0;
      if (placed < treeCount && R() < 0.45 + cedarGrove * 0.4) { const a = R() * 6.28, d = 3 + R() * 4 - cedarGrove * 2; const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d; if (ok(x2, z2, 6)) { place(x2, z2, false); placed++; } }
    }
    // 竹林：林の縁のところどころに、竹の藪を固めて置く（竹は一本ずつ散らばらず、藪になって生える）
    if (!this.def.noBamboo) {
      const seeds = Math.round(Math.min(8, treeCount / 70));
      for (let b = 0, tries2 = 0; b < seeds && tries2 < 200; tries2++) {
        const x = (R() * 2 - 1) * (this.half - 10), z = (R() * 2 - 1) * (this.half - 10);
        if (!ok(x, z, 9)) continue;
        b++;
        const n = 5 + Math.floor(R() * 6), sx = 0.7 + R() * 0.8;
        for (let k = 0; k < n; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 6; const x2 = x + Math.cos(a) * d * sx, z2 = z + Math.sin(a) * d / sx; if (ok(x2, z2, 3)) trees.take.push([x2, this.heightAt(x2, z2), z2, 0.8 + R() * 0.4, R()]); }
      }
    }
    for (const g of extra) {
      for (let k = 0; k < g.n; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * g.r;
        // 指定の並木・竹藪も、既存の樹種別の束と遠景の形を共有する。
        const t = (k + .5) / g.n - .5;
        const x = g.line ? g.x + t * g.line[0] + Math.cos(a) * r : g.x + Math.cos(a) * r * (g.sx || 1);
        const z = g.line ? g.z + t * g.line[1] + Math.sin(a) * r : g.z + Math.sin(a) * r * (g.sz || 1);
        // 指定した戦だけ、追加の林にも道・川岸・空地の条件を適用する。
        if (this.def.clearGroves && !ok(x, z, 6)) continue;
        place(x, z, true, g.kind);
      }
    }
    const winter = !!(this.def.winter || this.def.snow);
    const autumn = !!this.def.autumn && !winter;
    // 山麓の色づきは戦ごとの推定値。形と材質は共用する。
    const autumnLeafMix = THREE.MathUtils.clamp(this.def.autumnLeafMix ?? 1, 0, 1);
    const greenLeaf = new THREE.Color().setRGB(.72, .8, .6);
    // 葉：遠くでも葉の塊が痩せて板の形が見えないよう、絵が縮むほど不透明の度合いを上げる。空の映り込みは控えめ（白く浮かないように）
    // 高画質は同じ絵・揺れ・距離の材質を林全体で共有し、型ごとの切り替えを省く。
    const leafMaterials = new Map();
    const lightCedar = true && this.def.lightCedarFoliage;
    // 杉の絵の透明な左右だけを設営時に調べる。縮小時の縁用に八画素残す。
    let cedarLeft = 0, cedarRight = 1;
    if (lightCedar) {
      const { data, width, height } = leafTex('cedar').image;
      let left = width, right = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x); right = Math.max(right, x);
      }
      if (right >= left) {
        cedarLeft = Math.max(0, left - 8) / width;
        cedarRight = Math.min(width, right + 9) / width;
      }
    }
    const leafMat = (kind, tint, amp, far = false, cards = false) => {
      const key = `${kind}|${tint}|${amp}|${far}|${cards}`;
      if (leafMaterials?.has(key)) return leafMaterials.get(key);
      const opts = { map: leafTex(kind), color: tint, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide };
      // 五十五メートル先の杉も枝房・色・透かし・風・受ける影を保ち、艶と環境反射だけ省く。
      const material = lightCedar && far && kind === 'cedar'
        ? new THREE.MeshLambertMaterial(opts)
        : liteMat({ ...opts, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
      const mat = sway(material, amp, 2.5, { after: cards ? far ? farTreeLit : nearTreeLit : leafLit });
      if (leafMaterials) leafMaterials.set(key, mat);
      return mat;
    };
    // 幹：カメラの近くでは網目に抜く。狭い谷では戦の指定で早めに透かす。
    const nearTreeFadeRadius = Math.max(2, this.def.nearTreeFadeRadius ?? 2).toFixed(2);
    const trunkScale = this.def.treeTrunkScale ?? 1;
    const barkMat = (kind) => {
      const m = liteMat({ map: barkTex(kind), vertexColors: true, color: kind === 'bamboo' ? 0xffffff : 0x9b7654, bumpMap: barkTex(kind), bumpScale: 1.5, roughness: 0.95, metalness: 0 });
      m.customProgramCacheKey = () => 'barkNear' + nearTreeFadeRadius;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          { float nd = length(vViewPosition); if (nd < ${nearTreeFadeRadius}) { vec2 q = floor(gl_FragCoord.xy); float th = fract((q.x * 2.0 + q.y * 3.0) * 0.2 + fract(q.y * 0.5) * 0.5); if (smoothstep(0.7, ${nearTreeFadeRadius}, nd) < th) discard; } }`);
      };
      return m;
    };
    // 葉の板：外向きの法線にして、塊が丸く照らされるようにする
    const card = (parts, cx, cy, cz, w, h, ry, rx, ox, oy, oz, fold = false, needle = false, roll = 0) => {
      // 杉は同じ四面を長さ方向へ割り当て、枝先の垂れを作る。
      // 遠景・低画質は従来の二面で、枝先の細まりだけを残す。
      const g = new THREE.PlaneGeometry(w, h, fold ? 2 : 1, 1);
      // 葉房を浅い山形へ折る。横から見ても一枚の線へ消さない。
      // 読込時の共有形だけを変え、材質・描画回数・毎コマの処理は増やさない。
      if (needle) {
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const t = p.getY(k) / h + 0.5;
          const spread = 0.75 - t * 0.2 + Math.sin(t * Math.PI) * 0.35;
          // 根元は枝へ絞り、葉の重なる中央を膨らませ、先を下へ反らす。
          // 左右の葉先を逆へひねり、同じ四面でも横から厚みを残す。
          // 中央の折り目も重ね、軽量化した葉房の厚みを面数を増やさず保つ。
          const ridge = p.getX(k) / (w * 0.5);
          p.setXYZ(k, p.getX(k) * spread + w * 0.06 * t * t,
            p.getY(k), w * (0.32 * t * t
              + ridge * (0.10 + t * 0.12)
              + (fold ? (1 - Math.abs(ridge)) * 0.3 : 0)));
        }
      } else if (fold) {
        const p = g.attributes.position;
        // 同じ六頂点を舟形に曲げる。直線の上下縁と一枚の折り板を葉房の輪郭へ残さない。
        for (let k = 0; k < p.count; k++) {
          const side = p.getX(k) / (w * 0.5), top = p.getY(k) / h;
          p.setXYZ(k, p.getX(k) * (top > 0 ? 0.78 : 1),
            p.getY(k) + h * (side * side * 0.18 + side * 0.08),
            (1 - Math.abs(side)) * w * 0.17 + side * top * w * 0.16);
        }
      }
      if (needle && lightCedar) {
        // 折り目の各段を同じ面の上で切り詰め、絵の座標も合わせる。
        // 葉の幅・反り・面数・影の束は増やさず、透明な余白の画素処理を減らす。
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let k = 0; k < p.count; k++) {
          const u = uv.getX(k), cropped = cedarLeft + u * (cedarRight - cedarLeft);
          const t = p.getY(k) / h + 0.5;
          const spread = 0.75 - t * 0.2 + Math.sin(t * Math.PI) * 0.35;
          // 切り詰めた縁の折り目も同じ場所へ移す。元の幅のままの折れで板を裂かない。
          const ridge = (cropped - 0.5) * 2;
          p.setXYZ(k, (cropped - 0.5) * w * spread + w * 0.06 * t * t, p.getY(k),
            w * (0.32 * t * t + ridge * (0.10 + t * 0.12)
              + (fold ? (1 - Math.abs(ridge)) * 0.3 : 0)));
          uv.setX(k, cropped);
        }
      }
      // 切り詰めた後の縁を湾曲させ、同じ四面で棚板のような水平の切り口を崩す。
      if (needle) {
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let k = 0; k < p.count; k++) {
          const ridge = (uv.getX(k) - .5) * 2, t = uv.getY(k);
          p.setY(k, p.getY(k) + w * ridge * ridge * (.10 + t * .08));
        }
      }
      if (roll) g.rotateZ(roll);
      g.rotateX(rx); g.rotateY(ry); g.translate(cx, cy, cz);
      const n = g.attributes.normal, p = g.attributes.position, shade = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const v = new THREE.Vector3(p.getX(k) - ox, (p.getY(k) - oy) * 0.6, p.getZ(k) - oz).normalize();
        n.setXYZ(k, v.x, Math.max(0.25, v.y + 0.35), v.z);
        // 葉の塊の下側は枝葉の重なりで暗く。遠くでも面の厚みを残す。
        // 杉は枝元の重なりを暗く、外へ伸びる葉先を明るくする。
        // 絵や光源を増やさず、板全体が同じ明るさに見えるのを避ける。
        const light = needle
          ? 0.48 + g.attributes.uv.getY(k) * 0.34 + Math.max(0, v.y) * 0.12
          : 0.58 + Math.max(0, v.y) * 0.32
            + 0.1 * Math.sin(p.getX(k) * 2.3 + p.getZ(k) * 1.7 + cy);
        shade[k * 3] = light * 0.98; shade[k * 3 + 1] = light; shade[k * 3 + 2] = light * 1.02;
      }
      g.normalizeNormals();
      g.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      parts.push(g);
    };
    const T = rng(4242);
    // 幹と枝の筒の、埋まって見えない蓋（地面の下の根元・幹の中の枝の付け根・葉の房の中の端）を形から外す。
    //   置く前の筒（上が +y）で、法線が真上（top）・真下（bottom）の面だけを落とす
    const capless = (g, top, bottom) => {
      const N = g.attributes.normal, I = g.index;
      if (!N || !I) return g;
      const keep = [];
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2), y = N.getY(a);
        if (Math.abs(y) > 0.999 && N.getY(b) === y && N.getY(c) === y && (y > 0 ? top : bottom)) continue;
        keep.push(a, b, c);
      }
      g.setIndex(keep);
      return g;
    };
    const makeVariant = (kind) => {
      const bark = [], leaves = [], farLeaves = [];
      // 共通の杉は透ける枝葉の房で組み、大きな多角形の面を輪郭に出さない。
      // 高遠を含む各戦で共有し、専用の樹冠を指定した戦はその作りを使う。
      const naturalNeedles = kind === 'sugi' && (this.def.cedarBoughs || !this.def.branchFoliage && !this.def.solidFoliage);
      // 松・雑木の共通形も葉房にする。専用の閉じた樹冠を指定した戦は保つ。
      const naturalCrowns = (kind === 'matsu' || kind === 'broad') && !this.def.branchFoliage && !this.def.solidFoliage;
      if (kind === 'sugi') {
        const H = 10 + T() * 7;
        // 細い幹の頂は梢へ尖らせ、平らな切り口を残さない。
        const tr = capless(new THREE.CylinderGeometry(this.def.layeredNeedles ? 0.07 * trunkScale : trunkScale < 1 ? 0 : 0.13, 0.38 * trunkScale, H, this.def.templeNeedles ? 10 : 7), false, true); tr.translate(0, H / 2, 0); bark.push(tr);
        // 下枝から頂まで葉を重ね、低画質でも幹だけの柱にしない。
        const c0 = H * ((naturalNeedles ? 0.18 : 0.22) + T() * 0.06), R0 = 2.2 + T() * 0.7;
        const tiers = lowV ? 4 : 6, step = (H - c0) / tiers;
        for (let k = 0; k < tiers; k++) {
          const broken = !!this.def.brokenNeedleTiers;
          const t = k / (tiers - 1), r = R0 * (1 - t * 0.76) * (broken ? 0.88 + 0.16 * Math.sin(k * 2.7 + H) : 1);
          if (naturalNeedles) {
            const cy = c0 + step * (0.5 + k + 0.16 * Math.sin(k * 2.7 + H)), phase = k * 2.4 + H;
            // 新しく葉房へ替える杉は葉だけの乱数を使う。幹・枝の形と矢の当たりを保つ。
            const F = this.def.raggedNeedles ? T : rng(Math.floor(H * 10000) + k * 97);
            // 葉の根元から先へ向かう軸を、幹から外へ伸びる枝とそろえる。
            // 縦長の板が並ぶ樹冠を避け、斜めに張る枝房の間から幹と空を見せる。
            // 高画質でも一段二十面。形と絵は全ての株で使い回す。
            const count = lowV ? 4 : 5;
            // 指定した戦だけ葉房を起こす。横から薄い切れ端になるのを避ける。
            const pitch = this.def.cedarBoughPitch ?? 1.05;
            const width = this.def.cedarBoughWidth ?? 1;
            for (let j = 0; j < count; j++) {
              const a = phase + j * Math.PI * 2 / count, d = r * (0.3 + F() * 0.2);
              // 輪生する枝も同じ棚の高さへ並べない。追加の乱数を使わず、幹と配置を保つ。
              const stagger = Math.sin(a * 1.73 + k * 2.1) * step * 0.32;
              card(leaves, Math.sin(a) * d, cy + stagger + (F() - 0.5) * step * 0.7, Math.cos(a) * d,
                r * (0.85 + F() * 0.25) * width, Math.max(r * 1.65, step * (1.85 + F() * 0.3)),
                a, pitch + (F() - 0.5) * 0.65, 0, cy, 0, !lowV, true, Math.sin(a * 2.7 + k) * 0.68);
            }
            // 遠景も同じ方向と傾斜。三方向の板だけで枝張りを残す。
            for (let j = 0; j < 3; j++) {
              const a = phase + j * Math.PI * 2 / 3, d = r * 0.4;
              card(farLeaves, Math.sin(a) * d, cy + Math.sin(a * 1.73 + k * 2.1) * step * 0.32, Math.cos(a) * d,
                r * 1.25 * width, Math.max(r * 1.65, step * 2.0), a, (this.def.cedarBoughPitch == null ? pitch : pitch + 0.2) + Math.sin(a + k) * 0.3, 0, cy, 0, false, true, Math.sin(a * 2.7 + k) * 0.48);
            }
            continue;
          }
          if (this.def.branchFoliage) {
            // 杉の枝先を輪生させ、円錐の面を葉の絵で抜いた房へ替える。
            // 房は上下にずらし、段の水平な縁と同心円の輪郭を残さない。
            const cy = c0 + step * 0.5 + k * step;
            // 枝房を幹の同心円から外す。面数は保ち、片側の長枝と欠けた枝先を作る。
            const lean = k * 1.9 + H, offX = Math.cos(lean) * r * 0.22, offZ = Math.sin(lean) * r * 0.22;
            for (let j = 0; j < (lowV ? 6 : 9); j++) {
              const a = j * 2.4 + k * 1.7, d = r * (0.35 + T() * 0.42);
              const branch = 0.76 + 0.24 * Math.cos(a - lean);
              // 本流の不ぞろいな枝張りに、葉房の細まり・反り・枝元の陰影を重ねる。
              card(leaves, offX + Math.cos(a) * d * branch,
                cy + (T() - 0.5) * step * 0.8 - d * 0.18, offZ + Math.sin(a) * d * branch,
                r * (0.85 + T() * 0.5) * branch, step * (1.2 + T() * 0.5),
                // 指定した戦だけ枝房を外へ寝かせる。乱数の回数と面数は従来のまま。
                this.def.slopingNeedleBoughs ? Math.PI / 2 - a : a + 0.4,
                this.def.slopingNeedleBoughs ? 1.25 + (T() - 0.5) * 0.4 : (T() - 0.5) * 1.2,
                offX, cy, offZ, this.def.foldedNeedleCards, true);
            }
            continue;
          }
          // 共通の杉：円錐の水平な裾を閉じた葉房へ替える。面数は従来以下。
          // 近景と遠景を同じ式で作り、距離が変わっても枝の張り・垂れを保つ。
          const needleLayer = (segments, rings) => {
            const layer = new THREE.SphereGeometry(1, segments, rings);
            const lp = layer.attributes.position;
            for (let q = 0; q < lp.count; q++) {
              const x = lp.getX(q), y = lp.getY(q), z = lp.getZ(q);
              const edge = Math.hypot(x, z), a = Math.atan2(z, x);
              // 上を細く、下枝を広く。方位と段ごとに房をずらし、同心円を崩す。
              // 極では変形をゼロにし、重複頂点の継ぎ目を閉じたままにする。
              const branch = Math.sin(a * 3 + k * 1.7 + H);
              // 枝側の段ごとの欠けと垂れを、閉じた葉房にも残す。近景・遠景で式を共有する。
              const ragged = this.def.raggedNeedles ? 0.12 * Math.cos(a * 5 + k * 1.7) + 0.08 * Math.cos(a * 3 - y * 2) : 0;
              const spread = (1 - y * 0.38) * (1 + edge * (branch * 0.22 + 0.1 * Math.cos(a * 2 - k) + ragged));
              const droop = edge * edge * (0.16 + (broken ? 0.16 : 0)) * (0.5 + 0.5 * branch) + Math.abs(ragged) * edge * 0.3;
              const layered = this.def.layeredNeedles ? 1 + edge * 0.12 : 1;
              lp.setXYZ(q, x * r * spread * layered + y * r * 0.1,
                (y - droop) * step * 1.075, z * r * spread * layered);
            }
            layer.computeVertexNormals();
            layer.rotateY(k * 2.4);
            layer.translate(Math.sin(k * 2.4) * r * 0.18,
              c0 + step * 0.55 + k * step + step * 0.14 * Math.sin(k * 2.1 + H),
              Math.cos(k * 2.4) * r * 0.18);
            return layer;
          };
          leaves.push(needleLayer(lowV ? 6 : 9, this.def.raggedNeedles ? 5 : lowV && !this.def.layeredNeedles ? 2 : 3));
          // 五十五メートル先は輪郭を残し、房の内側の細分だけを省く。
          // 枝房を残す戦は中距離も三段にし、上下二つの三角面の折れ目を和らげる。
          farLeaves.push(needleLayer(this.def.nearCedarBranches ? 7 : 5, this.def.nearCedarBranches ? 3 : 2));
        }
        if (this.def.thickTrees || this.def.branchTrees || this.def.templeNeedles) for (let k = 0; k < 6; k++) {
          // 葉房のある段へ短い枝をつなぐ。裸の水平な棒を段違いに並べない。
          const level = naturalNeedles ? k * (tiers - 1) / 5 : k;
          const a = level * 2.4 + (naturalNeedles ? H : 0);
          const y = naturalNeedles ? c0 + step * (0.5 + level + 0.16 * Math.sin(level * 2.7 + H))
            : c0 + (H - c0) * (0.12 + k * 0.1);
          const r = R0 * (0.8 - k * 0.08) * (naturalNeedles ? 0.7 : 1);
          const rise = naturalNeedles ? -r * (0.12 + 0.15 * Math.sin(a)) : 0;
          const br = capless(new THREE.CylinderGeometry(0.05, 0.13, Math.hypot(r, rise), 5), true, false);
          br.rotateZ(Math.PI / 2 + Math.atan2(rise, r)); br.rotateY(-a);
          br.translate(Math.cos(a) * r / 2, y + rise / 2, Math.sin(a) * r / 2); bark.push(br);
        }
      } else if (kind === 'matsu') {
        // 曲がった幹と、枝先の平たい葉の雲
        let x = 0, z = 0, y = 0;
        const lean = T() * 6.28, H = 7 + T() * 4;
        for (let k = 0; k < 4; k++) {
          const nx = x + Math.cos(lean + k * 0.7) * 0.6, nz = z + Math.sin(lean + k * 0.7) * 0.6, ny = y + H / 4;
          const seg = capless(new THREE.CylinderGeometry((k === 3 && trunkScale < 1 ? 0 : 0.2 - k * 0.03) * trunkScale, (0.28 - k * 0.03) * trunkScale, H / 4 + 0.1, 6), false, k === 0);
          const dir = new THREE.Vector3(nx - x, ny - y, nz - z);
          seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
          seg.translate((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
          bark.push(seg);
          x = nx; y = ny; z = nz;
        }
        // 三〜四段に枝を分け、枝先ごとに厚みのある葉の房を置く。
        const tiers = lowV ? 3 : 4;
        for (let c = 0; c < tiers; c++) {
          const cy = H * (0.48 + c / (tiers - 1) * 0.49);
          for (let j = 0; j < 2; j++) {
            const a = c * 2.4 + j * 2.7, d = (1.5 + T() * 0.9) * (1 - c * 0.13);
            // 三方ヶ原の松は左右の枝を同じ高さにそろえず、棚状の段を崩す。
            const branchY = cy + (this.def.raggedPineCrowns || this.def.branchFoliage ? Math.sin(a * 1.7 + H) * H * 0.055 : 0);
            const cx = x * (cy / H) + Math.cos(a) * d, cz = z * (cy / H) + Math.sin(a) * d;
            const rise = this.def.raggedPineCrowns || this.def.branchFoliage ? branchY - cy + 0.2 : 0;
            const br = capless(new THREE.CylinderGeometry(0.05, 0.1, Math.hypot(d, rise), 5), true, true);
            // 高さを散らした葉房へ、幹から枝をつなぐ。水平な黒い切れ端を残さない。
            br.rotateZ(Math.PI / 2 + Math.atan2(rise, d)); br.rotateY(-a);
            br.translate(x * (cy / H) + Math.cos(a) * d / 2, branchY - 0.2 - rise / 2, z * (cy / H) + Math.sin(a) * d / 2); bark.push(br);
            const crown = new THREE.IcosahedronGeometry(1, lowV ? 0 : 1);
            crown.scale(1.5 + T() * 0.5, 0.65 + T() * 0.2, 1.25 + T() * 0.4);
            crown.rotateY(a); crown.translate(cx, branchY, cz); leaves.push(crown);
          }
        }
      } else if (kind === 'broad') {
        const H = 5 + T() * 3;
        const tr = capless(new THREE.CylinderGeometry(0.16 * trunkScale, 0.32 * trunkScale, H, 7), !winter, true); tr.translate(0, H / 2, 0); bark.push(tr);
        for (let k = 0; k < 3; k++) { const a = T() * 6.28; const br = new THREE.CylinderGeometry(0.06, 0.12, 2.2, 5); br.rotateZ(0.8); br.rotateY(a); br.translate(Math.cos(a) * 0.6, H * 0.85, -Math.sin(a) * 0.6); bark.push(br); }
        const cy = H + 1.2, R0 = 2.4 + T() * 0.8;
        // 秋に紅葉する広葉樹は冬に落葉する。杉・松・竹の葉は残す。
        // 細枝は読み込み時に一度作り、裸枝の同じ形を林全体で使い回す。
        if (winter) {
          const twig = (ax, ay, az, bx, by, bz, r) => {
            const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
            const br = new THREE.CylinderGeometry(r * 0.3, r, dir.length(), 4);
            br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
            br.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
            bark.push(br);
          };
          for (let k = 0; k < 3; k++) {
            const a = k * Math.PI * 2 / 3, r = 1.8 + T() * 0.6;
            const bx = Math.cos(a) * r, bz = Math.sin(a) * r, by = H + 0.9;
            twig(0, H * 0.7, 0, bx, by, bz, 0.09);
            for (let j = 0; j < 3; j++) {
              const t = 0.45 + j * 0.2, px = bx * t, pz = bz * t, py = H * 0.7 + (by - H * 0.7) * t;
              const angle = a + (j % 2 ? -0.65 : 0.65);
              twig(px, py, pz, px + Math.cos(angle) * 1.2, py + 0.7, pz + Math.sin(angle) * 1.2, 0.035);
            }
          }
        }
        for (let k = 0; k < (winter ? 0 : 5); k++) {
          const a = k * 2.4, r = k === 4 ? 0 : R0 * 0.52;
          const crown = new THREE.IcosahedronGeometry(1, lowV ? 0 : 1);
          crown.scale(R0 * 0.7, R0 * (0.62 + T() * 0.15), R0 * 0.68);
          crown.translate(Math.cos(a) * r, cy + (k === 4 ? R0 * 0.5 : (T() - 0.5) * 0.8), Math.sin(a) * r);
          leaves.push(crown);
        }
      } else {
        // 竹：細い稈を何本も束ね、上に葉
        for (let k = 0; k < 7; k++) {
          const a = T() * 6.28, d = T() * 1.2, H = 9 + T() * 4;
          const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
          const cul = new THREE.CylinderGeometry(0.05, 0.06, H, 5); cul.translate(cx, H / 2, cz); cul.rotateZ((T() - 0.5) * 0.06); bark.push(cul);
          for (let q = 0; q < (lowV ? 4 : 6); q++) card(leaves, cx + (T() - 0.5) * 1.6, H * (0.6 + T() * 0.4), cz + (T() - 0.5) * 1.6, 1.8, 1.4, T() * 6.28, (T() - 0.5) * 0.8, cx, H * 0.7, cz);
        }
      }
      const leafBoughs = this.def.branchFoliage && (kind === 'matsu' || kind === 'broad');
      if (leafBoughs || naturalCrowns) {
        // 松・雑木は折った枝葉を上下に組む。房の腹にも頂点を置き、平板の縁と一色の塊を崩す。
        const crowns = leaves.splice(0);
        const boughCount = this.def.foldedNeedleCards ? (lowV ? 4 : 6) : (lowV ? 3 : 4);
        for (const g of crowns) {
          g.computeBoundingBox();
          const center = g.boundingBox.getCenter(new THREE.Vector3()), size = g.boundingBox.getSize(new THREE.Vector3());
          if (naturalCrowns) {
            // 房ごとの乱数に閉じ、幹・枝と矢の当たりの形は変えない。
            const raggedPine = kind === 'matsu' && this.def.raggedPineCrowns;
            const F = rng(Math.floor((center.y + size.x) * 10000));
            const count = lowV ? 3 : 5, phase = F() * Math.PI * 2;
            for (let j = 0; j < count; j++) {
              const a = phase + j * 2.4, d = j === 0 ? 0 : 0.2 + F() * 0.13;
              // 少し折った葉房を互い違いに重ねる。球の面を見せず、枝間に空を残す。
              card(leaves, center.x + Math.cos(a) * size.x * d,
                center.y + (F() - 0.5) * size.y * (raggedPine ? 0.9 : 0.5), center.z + Math.sin(a) * size.z * d,
                size.x * ((raggedPine ? 0.5 : 0.8) + F() * 0.15), size.y * ((raggedPine ? 1.8 : 1.1) + F() * 0.2),
                a, (F() - 0.5) * 1.1, center.x, center.y, center.z, !lowV || raggedPine, false,
                raggedPine ? Math.sin(a * 1.7 + phase) * 0.6 : 0);
            }
            // 遠くも三房のまま。房を同じ中心へ重ねず、横長の板の輪郭を分ける。
            for (let j = 0; j < 3; j++) {
              const a = phase + j * Math.PI * 2 / 3;
              card(farLeaves, center.x + (raggedPine ? Math.cos(a) * size.x * 0.2 : 0),
                center.y + (raggedPine ? Math.sin(phase + j * 2.4) * size.y * 0.5 : 0),
                center.z + (raggedPine ? Math.sin(a) * size.z * 0.2 : 0),
                size.x * (raggedPine ? 0.58 : 1.1), size.y * (raggedPine ? 1.9 : 1.3),
                a, raggedPine ? (j % 2 ? -0.7 : 0.65) : 0.15,
                center.x, center.y, center.z, !!raggedPine, false,
                raggedPine ? Math.sin(a * 1.7 + phase) * 0.6 : 0);
            }
            g.dispose();
            continue;
          }
          // 乱数の消費順は保ち、後の幹・枝と矢玉の当たりを変えない。
          for (let j = 0; j < (lowV ? 6 : 9); j++) {
            const d = j === 0 ? 0 : 0.2 + T() * 0.2;
            const lift = T(), width = T(), height = T(), tilt = T();
            if (j >= boughCount) continue;
            const a = j * 2.39996 + center.y * 0.37;
            const cx = center.x + Math.cos(a) * size.x * d;
            const cy = center.y + (j >= 3 ? 0.3 : -0.24) * size.y + (lift - 0.5) * size.y * 0.55;
            const cz = center.z + Math.sin(a) * size.z * d;
            // 縦長の折り板を枝ごとの横に張る葉房へ。枚数と共有材質は増やさない。
            const w = size.x * (0.75 + width * 0.23), h = size.y * (0.78 + height * 0.3);
            const pitch = (j >= 3 ? -0.8 : 0.72) + (tilt - 0.5) * 0.9;
            const roll = Math.sin(a * 1.7 + center.y) * 0.8;
            card(leaves, cx, cy, cz, w, h, a, pitch, center.x, center.y, center.z, true, false, roll);
            // 遠くは同じ三方向の葉房だけ。絵・陰影・枝張りを共有し、細分を増やさない。
            if (j < 3) card(farLeaves, cx, cy, cz, w * 1.08, h * 1.08, a, pitch, center.x, center.y, center.z, true, false, roll);
          }
          g.dispose();
        }
      }
      const fix = (arr) => {
        const parts = arr.map(g => g.index ? g.toNonIndexed() : g);
        const merged = mergeGeometries(parts);
        for (let i = 0; i < parts.length; i++) if (parts[i] !== arr[i]) parts[i].dispose();
        parts.length = 0;
        return merged;
      };
      let leafGeo = null, core = null;
      // 葉房へ替えた共通の木も、従来の太い幹と枝の寸法を保つ。
      if ((naturalNeedles && !this.def.raggedNeedles || naturalCrowns) && this.def.thickTrees) for (const g of bark) g.scale(1.3, 1, 1.3);
      if (kind !== 'take' && !this.def.branchFoliage && !naturalNeedles && !naturalCrowns) {
        // 房の上下と段ごとに濃淡を付ける。形と色は読み込み時に一度だけ作る。
        for (let k = 0; k < leaves.length + farLeaves.length; k++) {
          const g = k < leaves.length ? leaves[k] : farLeaves[k - leaves.length], pos = g.attributes.position;
          // 共通の松・雑木も、刈り込んだ球の輪郭を枝房の凹凸へ替える。
          // 同じ座標には同じ変形を使い、継ぎ目を裂かない。形は林で共用する。
          if (kind === 'matsu' || kind === 'broad') {
            g.computeBoundingBox();
            const center = g.boundingBox.getCenter(new THREE.Vector3());
            for (let q = 0; q < pos.count; q++) {
              const x = pos.getX(q) - center.x, y = pos.getY(q) - center.y, z = pos.getZ(q) - center.z;
              const swell = 1 + 0.17 * Math.sin(x * 2.7 + z * 1.8 + k) + 0.1 * Math.cos(z * 3.1 - y * 2.3);
              pos.setXYZ(q, center.x + x * swell, center.y + y * swell + 0.22 * Math.sin(x * 2 - z * 2.6 + k), center.z + z * swell);
            }
            g.computeVertexNormals();
          }
          g.computeBoundingBox();
          const box = g.boundingBox, height = Math.max(0.01, box.max.y - box.min.y);
          const colors = new Float32Array(pos.count * 3);
          for (let q = 0; q < pos.count; q++) {
            const light = kind === 'sugi'
              ? 0.58 + (pos.getY(q) - box.min.y) / height * 0.3 + (k % 3) * 0.05 + Math.max(0, g.attributes.normal.getY(q)) * 0.08
              : 0.74 + (pos.getY(q) - box.min.y) / height * 0.22 + (k % 3) * 0.025;
            colors[q * 3] = light; colors[q * 3 + 1] = light; colors[q * 3 + 2] = light;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        core = leaves.length ? fix(leaves) : null;
        // 太い木を指定した戦の幹の太さは保つ。
        if (this.def.thickTrees) for (const g of bark) g.scale(this.def.solidFoliage ? 1.65 : 1.3, 1, this.def.solidFoliage ? 1.65 : 1.3);
      } else {
        leafGeo = leaves.length ? fix(leaves) : null;
        if (leafGeo && !this.def.thickTrees && !this.def.branchFoliage && !naturalNeedles && !naturalCrowns) {
          leafGeo.computeBoundingBox();
          const box = leafGeo.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
          const inner = leaves.map((g, i) => {
            g.computeBoundingBox();
            const p = g.boundingBox.getCenter(new THREE.Vector3());
            return { i, d: Math.pow((p.x - center.x) / size.x, 2) + Math.pow((p.y - center.y) / size.y, 2) + Math.pow((p.z - center.z) / size.z, 2) };
          }).sort((a, b) => a.d - b.d);
          // 岩村の杉は四〜六段しかない。全部を抜くと、残るのは八面体だけになる。
          const keepNeedles = this.def.keepNeedleLayers && kind === 'sugi';
          const removed = new Set((keepNeedles ? [] : inner.slice(0, 12)).map((p) => p.i));
          const parts = leaves.filter((g, i) => !removed.has(i));
          for (let k = 0; k < (keepNeedles ? 0 : 3); k++) {
            const g = new THREE.OctahedronGeometry(1, 0);
            const tall = kind === 'sugi' || kind === 'take', width = tall ? 0.32 - k * 0.07 : 0.28;
            g.scale(size.x * width, size.y * (tall ? 0.28 : 0.32), size.z * width);
            g.translate(center.x + (tall ? 0 : (k - 1) * size.x * 0.18), center.y + (tall ? (k - 1) * size.y * 0.22 : (k - 1) * size.y * 0.08), center.z);
            const colors = new Float32Array(g.attributes.position.count * 3); colors.fill(1);
            g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, -1, -1);
            parts.push(g);
          }
          leafGeo.dispose();
          leafGeo = fix(parts);
          // 元の葉と共用しない、補った中心の部品もここで返す。
          for (const g of parts) if (!leaves.includes(g)) g.dispose();
          parts.length = 0;
        }
      }
      // 幹の根元と枝の付け根に陰と苔色。共有頂点色だけで葉との重なりを読ませる。
      for (const g of bark) {
        const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
        g.computeBoundingBox();
        const box = g.boundingBox, height = Math.max(0.01, box.max.y - box.min.y);
        for (let q = 0; q < pos.count; q++) {
          const h = (pos.getY(q) - box.min.y) / height;
          const light = 0.72 + Math.min(1, h * 3) * 0.28;
          const moss = kind === 'take' ? 0 : Math.max(0, 1 - pos.getY(q) / 1.4) * 0.18;
          colors[q * 3] = light * (1 - moss);
          colors[q * 3 + 1] = light;
          colors[q * 3 + 2] = light * (1 - moss * 0.65);
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      // 指定した戦の杉は高画質でも枝房を残す。木全体を一枚の切り紙へ戻さない。
      // 低・中画質と、指定のない戦は従来の形を保つ。
      const cards = true && !leafBoughs && !(this.def.nearCedarBranches && kind === 'sugi'), hadFar = farLeaves.length > 0;
      let savedTriangles = 0;
      if (cards && (leafGeo || core)) {
        const source = leafGeo || core;
        savedTriangles = Math.max(0, Math.min(treeTriangles(source) - 6,
          hadFar ? farLeaves.reduce((sum, g) => sum + treeTriangles(g), 0) - 2 : Infinity));
        source.computeBoundingBox();
        const box = source.boundingBox, size = box.getSize(new THREE.Vector3());
        const width = Math.max(size.x, size.z), height = Math.max(0.1, size.y), cy = (box.min.y + box.max.y) / 2;
        if (leafGeo) leafGeo.dispose();
        if (core) core.dispose();
        for (const g of farLeaves) g.dispose();
        leafGeo = treeCards(width, height, cy); core = null;
        farLeaves.length = 0;
        if (hadFar) farLeaves.push(treeCards(width, height, cy, 1));
      }
      // 幹と枝だけの当たり。葉は弾も矢も止めない。形を作る時に一度だけ用意する。
      if (kind !== 'take' && this.def.treeScale) {
        for (const g of bark) scaleTreePart(g, this.def.treeScale);
        for (const g of [leafGeo, core, ...farLeaves]) if (g) scaleTreePart(g, this.def.treeScale, true);
      }
      const woodBounds = bark.map((g) => { g.computeBoundingBox(); return g.boundingBox.clone(); });
      const result = { bark: fix(bark), leaves: leafGeo, core, farCore: (cards || core || naturalNeedles || naturalCrowns || leafBoughs) && farLeaves.length ? fix(farLeaves) : null, naturalNeedles, naturalCrowns, leafBoughs, cards, savedTriangles, woodBounds };
      for (const parts of [bark, leaves, farLeaves]) {
        for (const g of parts) g.dispose();
        parts.length = 0;
      }
      return result;
    };
    const dummy = new THREE.Object3D();
    const tintOf = {
      sugi: () => new THREE.Color().setRGB(0.55 + R() * 0.1, 0.62 + R() * 0.12, 0.5),
      matsu: () => new THREE.Color().setRGB(0.6 + R() * 0.1, 0.7 + R() * 0.1, 0.55)
        .multiplyScalar(this.def.raggedPineCrowns ? 0.65 : 1),
      broad: () => autumn ? new THREE.Color([0xc9a060, 0xd08040, 0xa8a050, 0xe0b050][Math.floor(R() * 4)]).lerp(greenLeaf, 1 - autumnLeafMix) : new THREE.Color().setRGB(0.72 + R() * 0.15, 0.8 + R() * 0.12, 0.6),
      take: () => new THREE.Color().setRGB(0.85, 0.95, 0.7),
    };
    const barkKind = { sugi: 'cedar', matsu: 'pine', broad: 'cedar', take: 'bamboo' };
    this.treeMeshes = [];
    this.missileWood = [];
    for (const kind of Object.keys(trees)) {
      const list = trees[kind];
      if (!list.length) continue;
      const trunkMat = barkMat(barkKind[kind]);
      const crownMat = kind === 'take' ? null : sway(liteMat({ color: 0x8fa572, vertexColors: true, roughness: 1, envMapIntensity: 0.25 }), 0.02, 2.5);
      let sharedDepth = null;
      const VAR = lowV ? (kind === 'sugi' ? 2 : 1) : kind === 'take' ? 2 : kind === 'matsu' ? 4 : 3;
      for (let v = 0; v < VAR; v++) {
        const mine = list.filter((t, i) => i % VAR === v);
        if (!mine.length) continue;
        const g = makeVariant(kind);
        this.treeCardSavings += g.savedTriangles * mine.length;
        const bm = new THREE.InstancedMesh(g.bark, trunkMat, mine.length);
        const lm = g.leaves ? new THREE.InstancedMesh(g.leaves, leafMat(g.cards ? treeTextureKind[kind] : g.naturalNeedles ? 'cedar' : kind === 'broad' ? 'broad' : kind === 'take' ? 'bamboo' : 'needle', 0xffffff, kind === 'take' ? 0.05 : 0.02, false, g.cards), mine.length) : null;
        if (lm && (g.cards || !this.def.thickTrees || g.naturalNeedles || g.naturalCrowns || g.leafBoughs)) {
          lm.customDepthMaterial = sharedDepth || sway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lm.material.map, alphaTest: 0.42, side: THREE.DoubleSide }), kind === 'take' ? 0.05 : 0.02, 2.5, { after: g.cards ? treeCardDepth : treeLeafMap });
          sharedDepth = lm.customDepthMaterial;
        }
        const cm = g.core ? new THREE.InstancedMesh(g.core, crownMat, mine.length) : null;
        if (cm) cm.userData.treeFoliage = true;
        mine.forEach(([x, y, z, sc, r], i) => {
          dummy.position.set(x, y - 0.25, z);
          dummy.rotation.set((r - 0.5) * 0.06, r * 6.28, (r - 0.5) * 0.06);
          // 松は一本ずつ枝ぶりの広がりを変える（横に張る老松・細く伸びた若松）
          const wide = kind === 'matsu' ? 0.8 + ((r * 7.31) % 1) * 0.55 : 1;
          dummy.scale.set(sc * wide, sc * (0.9 + r * 0.25) / Math.sqrt(wide), sc * wide * (0.85 + ((r * 3.7) % 1) * 0.3));
          dummy.updateMatrix();
          bm.setMatrixAt(i, dummy.matrix);
          for (const bounds of g.woodBounds) {
            const b = bounds.clone().applyMatrix4(dummy.matrix);
            this.missileWood.push({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
          }
          // 葉の枝張りだけを広狭に散らす。幹と矢玉の当たりは元の寸法を保つ。
          if (kind !== 'take') {
            const spread = this.def.unevenCrowns ? 0.72 + ((r * 7.31) % 1) * 0.7 : 0.82 + ((r * 7.31) % 1) * 0.36;
            dummy.scale.x *= spread; dummy.scale.z *= 1.42 - spread * .42;
            dummy.updateMatrix();
          }
          if (lm) lm.setMatrixAt(i, dummy.matrix);
          if (cm) cm.setMatrixAt(i, dummy.matrix);
          if (lm) lm.setColorAt(i, tintOf[kind]());
          else if (cm) cm.setColorAt(i, tintOf[kind]());
        });
        const meshes = lm ? [bm, lm] : [bm];
        if (cm) { if (lm) cm.instanceColor = lm.instanceColor; meshes.push(cm); }
        for (const m of meshes) {
          m.castShadow = true; m.receiveShadow = true; this.scene.add(m); this.treeMeshes.push(m);
          // 木の影の配列と囲みは設営中に用意し、最初の描画へまとめて持ち込まない。
          if (SETTINGS.quality === 'high') {
            m.updateWorldMatrix(true, false);
            m._sceneryCastShadow = true; m.castShadow = false;
          }
        }
        const foliage = cm || lm;
        if (foliage && g.farCore) {
          const farMaterial = g.cards ? leafMat(treeTextureKind[kind], 0xffffff, kind === 'take' ? 0.05 : 0.02, true, true)
            : lightCedar && g.naturalNeedles ? leafMat('cedar', 0xffffff, 0.02, true) : foliage.material;
          const far = new THREE.InstancedMesh(g.farCore, farMaterial, mine.length);
          // 遠景へ替わるコマで色の入れ物を作らず、設営時に用意する。
          if (foliage.instanceColor) far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 3), 3);
          far.count = 0; far.updateMatrix(); far.matrixAutoUpdate = false;
          far.frustumCulled = false; far.receiveShadow = true;
          far.userData.treeFoliage = true; far.userData.noFreeze = true;
          foliage.userData.farFoliage = far;
          this.scene.add(far); this.treeMeshes.push(far);
        }
        this.viewCull(meshes, lowV ? 16 : 40);
      }
    }
    this.treePoints = [];
    for (const list of Object.values(trees)) {
      for (const [x, , z] of list) this.treePoints.push([x, z]);
      list.length = 0;
    }
    trees = null;
    lap('trees');

    // 草むら
    // 草むら：葉の絵を十字に組んだ板（遠目に草原らしく見える）
    const tufts = Math.round((this.def.tufts ?? 5000) * (lowV ? 1 : 1.5));
    // 絵：細く先の尖った葉。葉の間に地肌が見え、根元が黒い房にならないようにする。
    const GS = 256, gc = document.createElement('canvas'); gc.width = GS; gc.height = GS;
    const gg = gc.getContext('2d', { willReadFrequently: true });   // 読み出す（alphaTex）ので読み出しの速いキャンバスに
    const GR = rng(77);
    for (let i = 0; i < 16; i++) {
      // 株は根元が細く、葉先ほど外へ開く扇の形（板の四角い輪郭が見えないように）。真ん中の葉ほど高い
      const x = GS * (0.5 + (GR() + GR() + GR() - 1.5) * 0.13), off = (i / 15 - 0.5);
      // 外側は幅のある短い下葉、中央は背の高い葉。同じ板で株の裾と芯を作る。
      const basal = Math.abs(off) > 0.3;
      const h = GS * (0.38 + Math.pow(GR(), 0.7) * 0.54) * (basal ? 0.58 : 1 - Math.abs(off) * 0.7);
      let lean = off * GS * 1.3 + (GR() - 0.5) * GS * 0.22;
      lean = Math.max(GS * 0.04 - x, Math.min(GS * 0.96 - x, lean));
      // 縮小しても面が残る葉幅。針金状の輪郭ではなく、折り目のある葉として見せる。
      const wdt = GS * (0.014 + GR() * 0.01) * (basal ? 1.25 : 1);
      const v = 165 + GR() * 40, dry = GR() < 0.16;
      // 葉ごとに少し色をずらす（黄みの葉・青みの葉・枯れ葉）。全体の色は置く所で掛ける
      const cr = dry ? 1.08 : 0.96 + GR() * 0.08, cb = dry ? 0.78 : 0.9 + GR() * 0.08;
      // 緑と枯れ色は株の色で付ける。絵まで暗い緑にすると、掛け合わせで炭のように黒くなる。
      // 絵には明るい葉の濃淡だけを残し、根元の陰は弱くする。
      const rgb = (r, g, bl) => `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, bl) | 0})`;
      const lg = gg.createLinearGradient(0, GS, 0, GS - h);
      lg.addColorStop(0, rgb(v * 0.74 * cr, v * 0.76, v * 0.74 * cb)); lg.addColorStop(0.45, rgb(v * 0.92 * cr, v * 0.94, v * 0.92 * cb)); lg.addColorStop(1, rgb(v * cr, v, v * 0.94 * cb));
      gg.fillStyle = lg;
      // 根元から葉先まで連続した弧。折り返す細い輪郭を描かず、葉の面を保つ。
      const bend = GR() < (basal ? 1 : 0.6);
      const tx = x + lean, ty = GS - h;
      const ex = bend ? Math.max(GS * 0.03, Math.min(GS * 0.97, tx + lean * 0.22)) : tx;
      const ey = ty + (bend ? h * (basal ? 0.48 : 0.22) : 0);
      const mx = x + lean * 0.12, my = GS - h * 0.55;
      // 両側と中筋で同じ曲線を使う。中筋も必ず葉の内側に収める。
      const edge = (offset) => gg.bezierCurveTo(mx + offset * 0.85, my, tx + offset * 0.4, ty, ex, ey);
      gg.beginPath(); gg.moveTo(x - wdt, GS); edge(-wdt);
      gg.bezierCurveTo(tx + wdt * 0.4, ty, mx + wdt * 0.85, my, x + wdt, GS);
      gg.closePath(); gg.fill();
      // 葉の片面を暗く塗り、縦の折り目を作る。追加の形・絵・描画は使わない。
      gg.fillStyle = 'rgba(38,48,27,0.22)';
      gg.beginPath(); gg.moveTo(x, GS); edge(0);
      gg.bezierCurveTo(tx + wdt * 0.4, ty, mx + wdt * 0.85, my, x + wdt, GS);
      gg.closePath(); gg.fill();

    }
    // 普通の草に粒状の穂を繰り返さない。背の高い穂は既存の薄の群落に任せる。
    const gtex = alphaTex(gc);
    // 株：四枚の板を少しずつ外へ傾けて組む。光は上から受ける向き（法線を上へ寄せる）にして、板ごとの明暗の差を消す
    const blades = [];
    const bladeCount = lowV ? 2 : 4;
    for (let k = 0; k < bladeCount; k++) {
      const pg = new THREE.PlaneGeometry(0.9, 0.75);
      // 同じ頂点数のまま根元を寄せ、上ほど外へ倒す。板の交差する塊を崩す。
      const gp = pg.attributes.position;
      for (let q = 0; q < gp.count; q++) {
        const top = gp.getY(q) > 0;
        const lean = k % 2 ? 1 : -1;
        // 頂点数を保ったまま葉先の幅・左右の高さ・倒れ方をずらし、四角い上辺を崩す。
        const side = gp.getX(q) > 0 ? 1 : -1;
        gp.setXYZ(q, gp.getX(q) * (top ? 0.62 + k * 0.09 : 0.42) + (top ? lean * (0.08 + k * 0.025) : 0),
          gp.getY(q) * (0.76 + k * 0.08) + (top ? side * lean * (0.045 + k * 0.012) : 0), top ? 0.16 + k * 0.025 : 0);
      }
      if (this.def.templeNeedles) {
        // 同じ房の中でも葉先の高さと開き方を変える。設営時だけ作る。
        const p = pg.attributes.position;
        for (let q = 0; q < p.count; q++) {
          const top = p.getY(q) > 0;
          p.setXYZ(q, p.getX(q) * (.65 + k * .16) + (top ? (k - 1.5) * .08 : 0),
            p.getY(q) * (.6 + k * .17), top ? (k % 2 ? .12 : -.08) : 0);
        }
      }
      pg.translate(0, 0.375 * (0.76 + k * 0.08), 0);
      pg.rotateX((k % 2 ? 1 : -1) * 0.12);
      pg.rotateY((k / bladeCount) * Math.PI + (k % 2) * 0.2);
      const nn = pg.attributes.normal, pp = pg.attributes.position;
      for (let q = 0; q < nn.count; q++) {
        const ox = pp.getX(q), oz = pp.getZ(q), l = Math.hypot(ox, oz) || 1;
        const up = 0.35 + pp.getY(q) * 0.6;
        const v = new THREE.Vector3(ox / l * 0.45, 1.0 + up, oz / l * 0.45).normalize();
        nn.setXYZ(q, v.x, v.y, v.z);
      }
      pg.setAttribute('bladeLayer', new THREE.BufferAttribute(new Float32Array(pg.attributes.position.count).fill(k), 1));
      blades.push(pg);
    }
    const tuftGeo = mergeVegetationParts(blades);
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, sway(liteMat({ color: this.def.tuftTint ?? 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.12, 0, { wear: true, after: grassLit }), tufts);
    tuftMesh.material.defines = { ...tuftMesh.material.defines, TUFT_LAYERS: 1 };
    tuftMesh.userData.layersNear = bladeCount; tuftMesh.userData.layersMiddle = Math.min(2, bladeCount);
    const tc = new THREE.Color();
    let n = 0;
    // 草は群れて生える：半分ほどは直前の株のそばに置き、濃い草むらと地肌の見える所ができるようにする
    let lastX = 0, lastZ = 0;
    // 広い山全体へ株を薄めず、既存の本数の一部を歩く道の肩へ移す。
    // 区間の長さで選び、短い折れ目にだけ草が固まるのを防ぐ。準備時だけ使う。
    const verges = [];
    let vergeLength = 0;
    if (this.def.roadsideGrass) for (const path of paths) {
      const pts = path.pts || path;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (length < .01) continue;
        vergeLength += length;
        verges.push({ a, dx, dz, length, end: vergeLength, width: (path.w ?? this.def.pathWidth ?? 2) * .5 });
      }
    }
    for (let tries = 0; !NO_GRASS && n < tufts && tries < tufts * (lowV ? 6 : 8); tries++) {
      // 道肩へ寄せた草は株同士をつなげ、同じ本数で下草の面を作る。
      const clustered = !!(this.def.roadsideGrass || this.def.undergrowthBands?.length);
      const near = n > 0 && R() < (clustered ? 0.76 : 0.55), ca = R() * 6.28;
      const cd = clustered ? 0.22 + R() * 0.75 : 0.35 + R() * 1.1;
      // 群落の起点を道肩・沢の帯へ寄せる。本数と束は保ち、戦う道は下の判定で空ける。
      const bands = this.def.undergrowthBands;
      const band = !near && bands?.length && tries % 3 !== 2 ? bands[tries % bands.length] : null;
      let x = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastX + Math.cos(ca) * cd)) : band ? band.x + (R() * 2 - 1) * band.w : (R() * 2 - 1) * (this.half - 2);
      let z = near ? Math.max(-(this.half - 2), Math.min(this.half - 2, lastZ + Math.sin(ca) * cd)) : band ? band.z + (R() * 2 - 1) * band.d : (R() * 2 - 1) * (this.half - 2);
      if (!near && !band && vergeLength > 0 && tries % 3 !== 2) {
        const pick = R() * vergeLength;
        const v = verges.find(v => pick < v.end), t = R();
        const offset = (v.width + 1.5 + R() * 7) * (R() < .5 ? -1 : 1);
        x = v.a[0] + v.dx * t - v.dz / v.length * offset;
        z = v.a[1] + v.dz * t + v.dx / v.length * offset;
        if (Math.abs(x) > this.half - 2 || Math.abs(z) > this.half - 2) continue;
      }
      // 踏み固めた土・陣の中には草むらを生やさない（草の割合に合わせて間引く）
      if (R() > this.grassAt(x, z) * 1.15 - 0.05) continue;
      // 草むらは大きな群れにまとまる：ゆるい波の濃い所に多く、薄い所はまばら（上から見て水玉に並ばないように）
      const clump = tuftClumpAt(x, z);
      if (!near && R() > 0.25 + clump * 0.9) continue;
      if (this.def.water && x > this.def.water.x - 2 && x < (this.def.water.x2 ?? 1e9) + 2) continue;
      let onPath = false;
      for (const p of paths) if (distToPolyline(x, z, p) < 2.5) { onPath = true; break; }
      if (onPath) continue;
      if (this.def.paddy && this.def.paddy(x, z) > 0.3) continue;
      let inStream = false;
      for (const st of this.def.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.2) inStream = true;
      if (inStream) continue;
      dummy.position.set(x, this.heightAt(x, z) - 0.1, z);
      const s = (0.32 + Math.pow(R(), 1.6) * 1.25) * (0.7 + clump * 0.6);
      dummy.scale.set(s * (0.8 + R() * 0.4), s * (0.7 + R() * 0.9), s * (0.8 + R() * 0.4));
      if (this.def.tuftHeight) dummy.scale.y *= this.def.tuftHeight(x, z);
      dummy.rotation.set((R() - 0.5) * 0.45, R() * 6.28, (R() - 0.5) * 0.45);
      if (this.def.roundNeedles) {
        const patch = .5 + .5 * Math.sin(x * 1.7 + z * .93);
        dummy.scale.y *= .65 + patch * .65; dummy.scale.x *= .75 + (1 - patch) * .6;
      }
      dummy.updateMatrix();
      tuftMesh.setMatrixAt(n, dummy.matrix);
      // 地面の草の色に合わせ、ところどころ枯れ色
      // 野の広い斑：濃い緑の所と、黄ばんだ所がゆるやかに移り変わる（同じ色の草が一面に並ばないように）
      const fk = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(x * 0.043 + Math.cos(z * 0.031) * 2.1) * Math.cos(z * 0.052 - x * 0.012) + (R() - 0.5) * 0.25));
      tc.setRGB(0.25 + fk * 0.13 + R() * 0.08, 0.35 + fk * 0.05 + R() * 0.09, 0.14 + fk * 0.03 + R() * 0.05);
      // 夏の田舎の草：鮮やかな緑を少し灰と土の色に寄せ、ところどころ土色のまだら
      { const gl = (tc.r + tc.g + tc.b) / 3; tc.setRGB(tc.r * 0.82 + gl * 0.18, tc.g * 0.82 + gl * 0.18, tc.b * 0.82 + gl * 0.18); if (R() < 0.08) tc.lerp(TUFT_AUTUMN, 0.45); }
      if (R() < 0.1 + fk * 0.12 + (this.def.autumn ? 0.2 : 0)) tc.setRGB(0.38 + R() * 0.08, 0.34 + R() * 0.07, 0.2);
      // 季節の色：秋は枯れ色に寄せ、初夏（def.young）は若葉の明るい緑に
      if (this.def.roundNeedles) tc.lerp(TUFT_AUTUMN, .15 + .3 * (.5 + .5 * Math.sin(x * .71 - z * 1.3)));
      if (this.def.autumn) tc.lerp(TUFT_AUTUMN, 0.3);
      else if (this.def.young) tc.setRGB(tc.r * 0.92, tc.g * 1.12, tc.b * 0.95);
      if (this.def.tuftColor) this.def.tuftColor(x, z, tc);
      tuftMesh.setColorAt(n, tc);
      lastX = x; lastZ = z;
      n++;
    }
    tuftMesh.count = n;
    lap('tufts');
    tuftMesh.receiveShadow = true;
    if (!NO_GRASS) this.viewCull([tuftMesh], 0, 52);   // 48mで透け切った草は送らず、遠くの野は地面に任せる
    if (!NO_GRASS) this.scene.add(tuftMesh);   // 10/24：草むらは作らない（全戦）
    // 薄（ススキ）の株と野の花：まとまって生える
    const patch = (kind, count, size, clumps) => {
      if (NO_GRASS) return;   // 10/24：薄・野の花の草むらも作らない
      const susuki = kind === 'susuki', pg = [];
      for (let k = 0; k < 2; k++) {
        const g = new THREE.PlaneGeometry(size, size);
        if (susuki) {
          // 四三角形のまま根元を寄せ、葉先を開く。株の裏も上からの光を受ける。
          const p = g.attributes.position, normal = g.attributes.normal;
          for (let q = 0; q < p.count; q++) {
            const top = p.getY(q) > 0;
            p.setXYZ(q, p.getX(q) * (top ? 1 : 0.48), p.getY(q), top ? size * (k ? -0.1 : 0.12) : 0);
            normal.setXYZ(q, 0, 0.94, 0.34);
          }
        }
        g.translate(0, size / 2, 0); g.rotateY(k * Math.PI / 2); pg.push(g);
      }
      const mesh = new THREE.InstancedMesh(mergeVegetationParts(pg), sway(liteMat({ color: susuki ? (this.def.susukiTint ?? 0xffffff) : 0xffffff, map: leafTex(kind), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4 }), susuki ? 0.09 : 0.05, 0, { wear: true, after: susuki ? grassLit : grassAlpha }), count);
      let m = 0;
      for (let cI = 0; cI < clumps && m < count; cI++) {
        const cx = (R() * 2 - 1) * (this.half - 6), cz = (R() * 2 - 1) * (this.half - 6);
        if (!ok(cx, cz, kind === 'higanbana' ? 2.5 : 4)) continue;
        const per = Math.ceil(count / clumps);
        for (let q = 0; q < per && m < count; q++) {
          const x = cx + (R() - 0.5) * 7, z = cz + (R() - 0.5) * 7;
          if (!ok(x, z, kind === 'higanbana' ? 1.2 : 2) || this.grassAt(x, z) < 0.4) continue;
          dummy.position.set(x, this.heightAt(x, z) - 0.05, z);
          const sc = 0.7 + R() * 0.6; dummy.scale.set(sc, sc * (0.8 + R() * 0.5), sc); dummy.rotation.set(0, R() * 6, 0);
          dummy.updateMatrix(); mesh.setMatrixAt(m++, dummy.matrix);
        }
      }
      mesh.count = m;
      if (m > 0) this.viewCull([mesh], 0, 52);
      this.scene.add(mesh);
    };
    // 石：斜面ほど多く、半分ほど土に埋まる
    {
      // 割れのある形を共用し、暗い絵と頂点色を重ねず灰色の立体として見せる。
      // 高画質の岩も一個80面を共用する（従来180面）。露岩の輪郭・苔色・凹凸の絵は残す。
      // 遠景も同じ軽い形で一束に収め、距離別の束や影の描画回数を増やさない。
      const highRocks = SETTINGS.quality === 'high';
      const rg = rockShape(1, !!(this.def.groundedSlopeRocks || this.def.alluvialRocks), highRocks || (lowV && this.def.lowMaterialBatch) ? 1 : 2);
      const N = Math.round((this.def.rocks ?? 260) * (1));   // 低は地面の石を六割に（草木と同じ扱い）
      const rocks = new THREE.InstancedMesh(rg, liteMat({ color: 0xffffff, vertexColors: true, side: this.def.groundedSlopeRocks ? THREE.DoubleSide : THREE.FrontSide, bumpMap: stoneTex(), bumpScale: this.def.groundedSlopeRocks ? 0.06 : 0.18, roughness: 1, envMapIntensity: 0.15 }), N);
      const rockUp = new THREE.Vector3(0, 1, 0), rockNormal = new THREE.Vector3(), rockTurn = new THREE.Quaternion();
      let m = 0;
      for (let tries = 0; tries < N * 8 && m < N; tries++) {
        // 岩の総数と束は保ち、指定した斜面へ四つに一つを露岩の帯として寄せる。
        // 描く岩だけを移す。歩ける地形・当たり・兵の進路は変えない。
        const bands = this.def.rockBands;
        const band = bands?.length && tries % 4 === 0 ? bands[Math.floor(tries / 4) % bands.length] : null;
        const x = band ? band.x + (R() * 2 - 1) * band.w : (R() * 2 - 1) * (this.half - 3);
        const z = band ? band.z + (R() * 2 - 1) * band.d : (R() * 2 - 1) * (this.half - 3);
        if (!ok(x, z, 3, !!band)) continue;
        const dx = this.heightAt(x + 2, z) - this.heightAt(x - 2, z);
        const dz = this.heightAt(x, z + 2) - this.heightAt(x, z - 2);
        const sl = Math.abs(dx) + Math.abs(dz);
        if (band && sl < 1.6) continue; // 平らな持ち場へ大岩を置かず、山腹の露出だけに使う。
        if (R() > 0.25 + sl * 0.5) continue;
        // 急な山腹の四つに一つは小石でなく露頭にする。既存の岩の数・共用形・材質を保つ。
        // 道の縁と平場を跨がない所だけ使い、指定済みの露岩帯は従来のまま。
        const outcrop = highRocks && !band && !this.def.alluvialRocks && !this.def.slopeRockFaces && tries % 4 === 0
          && Math.hypot(dx, dz) > 2.8 && ok(x, z, 5)
          && !clear(x - 2.5, z) && !clear(x + 2.5, z)
          && !clear(x, z - 2.5) && !clear(x, z + 2.5);
        let sc = band ? 1.2 + R() * 1.8 : outcrop ? 1.05 + R() * 0.55 : 0.18 + Math.pow(R(), 2.5) * 1.3;
        // 沖積地は丸い礫が泥に埋まる。岩の総数と共用形を保ち、平場の大きな板を避ける。
        if (this.def.alluvialRocks && !band) sc = Math.min(.28, sc * .6);
        dummy.position.set(x, this.heightAt(x, z), z);
        dummy.rotation.set(R() * 0.5, R() * 6, R() * 0.5);
        // 形の種類：丸い石・平たい岩・縦に割れた岩
        const kind = R();
        if (kind < 0.3) dummy.scale.set(sc * (1.3 + R() * 0.6), sc * 0.75, sc * (1.1 + R() * 0.5));
        else if (kind < 0.45) dummy.scale.set(sc * 0.7, sc * (1.3 + R() * 0.5), sc * (0.8 + R() * 0.3));
        else dummy.scale.set(sc * (0.8 + R() * 0.6), sc, sc * (0.8 + R() * 0.6));
        if (outcrop) {
          // 薄い割れ面を山肌へ沿わせ、丸石を拡大しただけの形を避ける。
          rockNormal.set(-dx, 4, -dz).normalize();
          rockTurn.setFromUnitVectors(rockUp, rockNormal);
          dummy.rotation.set(0, kind * Math.PI * 2, 0);
          dummy.quaternion.premultiply(rockTurn);
          dummy.scale.set(sc * 1.5, sc * 0.65, sc * 1.1);
        }
        dummy.position.y -= dummy.scale.y * 0.08;
        dummy.updateMatrix();
        // 露頭だけ割れを傾ける。普通の小石まで張り出させて見切れ判定と影を広げない。
        if (outcrop) {
          const e = dummy.matrix.elements, lean = (kind - 0.5) * 0.35;
          e[4] += e[0] * lean; e[5] += e[1] * lean; e[6] += e[2] * lean;
        }
        rocks.setMatrixAt(m++, dummy.matrix);
      }
      rocks.count = m; rocks.castShadow = true; rocks.receiveShadow = true;
      // 設営で地面を細分する戦だけ、その後に岩と根草を接地する。
      if (this.def.deferRockGround) this.deferredGroundRocks = rocks;
      else groundRocks(this, rocks);
      lap('rocks');
      // 接地後に登録する戦では、古い位置を省略用の控えへ写さない。
      if (!this.def.deferRockCull) this.viewCull([rocks], lowV ? 0 : 40);   // 近くの岩は画面外から落ちる影も保つ
      this.scene.add(rocks);
    }
    // 低木：林の縁に葉の塊
    {
      const bushG = [];
      const TB = rng(123);
      // 大きな板を小さな葉群へ分け、中央を曲げて平たい三角の塊を崩す。
      for (let k = 0; k < 14; k++) {
        const g = new THREE.PlaneGeometry(0.65 + TB() * 0.3, 0.55 + TB() * 0.3, 2, 2);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5 + p.getY(i) * 4 + k) * 0.09);
        g.computeVertexNormals();
        g.rotateX((TB() - 0.5) * 1.4); g.rotateY(TB() * 6.28);
        g.translate((TB() - 0.5) * 1.2, 0.35 + TB() * 0.65, (TB() - 0.5) * 1.2);
        bushG.push(g);
      }
      const pts = this.treePoints || [];
      const N = Math.min(lowV ? 200 : 420, pts.length);
      const bush = new THREE.InstancedMesh(mergeVegetationParts(bushG), sway(liteMat({ map: leafTex(this.def.lowBamboo ? 'bamboo' : 'broad'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.1 }), 0.04, 0.3, { after: keepAlpha }), N);
      // 根元の草も既存の形・材質を使い回し、一つの束にまとめる。
      const rootGrass = new THREE.InstancedMesh(tuftGeo, tuftMesh.material, N);
      const col = new THREE.Color();
      let m = 0;
      for (let k = 0; k < N; k++) {
        const [tx, tz] = pts[Math.floor(R() * pts.length)];
        const a = R() * 6.28, d = 2 + R() * 4;
        const bands = this.def.undergrowthBands;
        const band = bands?.length && k % 3 !== 2 ? bands[k % bands.length] : null;
        const x = band ? band.x + (R() * 2 - 1) * band.w : tx + Math.cos(a) * d;
        const z = band ? band.z + (R() * 2 - 1) * band.d : tz + Math.sin(a) * d;
        if (!ok(x, z, 3) || this.grassAt(x, z) < 0.3) continue;
        dummy.position.set(x, this.heightAt(x, z) - 0.18, z); dummy.rotation.set(0, R() * 6, 0);
        const sc = 0.7 + R() * 0.8; dummy.scale.set(sc, sc * (this.def.lowBamboo ? 0.45 : 0.7 + R() * 0.5), sc);
        dummy.updateMatrix(); bush.setMatrixAt(m, dummy.matrix);
        bush.setColorAt(m, this.def.autumn ? col.setRGB(0.43 + R() * 0.1, 0.38 + R() * 0.1, 0.22) : col.setRGB(0.3 + R() * 0.08, 0.4 + R() * 0.08, 0.24));
        dummy.position.set(x, this.heightAt(x, z) - 0.04, z);
        dummy.scale.set(sc * 1.4, sc * 0.6, sc * 1.4); dummy.updateMatrix();
        rootGrass.setMatrixAt(m, dummy.matrix);
        rootGrass.setColorAt(m, this.def.autumn ? col.setRGB(0.4, 0.35, 0.22) : col.setRGB(0.28, 0.36, 0.2));
        m++;
      }
      rootGrass.count = m; rootGrass.receiveShadow = true;
      if (!NO_GRASS) this.viewCull([rootGrass], 0, 52);
      if (!NO_GRASS) this.scene.add(rootGrass);
      bush.count = m; bush.castShadow = true;
      lap('bush');
      this.viewCull([bush], lowV ? 0 : 40);
      this.scene.add(bush);
    }
    if (autumn || this.def.winterGrass) patch('susuki', Math.round(tufts * (lowV ? 0.055 : 0.08)), this.def.susukiSize ?? 1.65, lowV ? 35 : 60);
    // 株数と六三角形は増やさず、周り十五メートルへ寄せて足もとの密度を上げる。
    if (!NO_GRASS) {   // 10/24：足もとの草は作らない（全戦）
      const N = lowV ? 1800 : 4200, G = 15;
      const bg = [];
      // 同じ三枚・六三角形で、立つ葉と横へ伏せる下葉を組む。
      // 背のそろった点の列を避け、根元に低い葉の広がりを残す。
      const widths = [0.23, 0.43, 0.51], heights = [0.52, 0.32, 0.22];
      for (let k = 0; k < 3; k++) {
        // 指定した野では一つの折れで葉の房を曲げ、平たい十字の輪郭を崩す。
        // 草の株数・共用の絵・描く回数は同じ。低画質は元の二三角形を保つ。
        const curved = this.def.curvedNearGrass && !lowV;
        const g = new THREE.PlaneGeometry(widths[k], heights[k], 1, curved ? 2 : 1);
        const p = g.attributes.position;
        for (let q = 0; q < p.count; q++) {
          const top = p.getY(q) > 0;
          const side = p.getX(q) > 0 ? 1 : -1;
          p.setXYZ(q, p.getX(q) * (top ? 0.78 : 0.42) + (top ? (k - 1) * 0.06 : 0),
            p.getY(q) + heights[k] * 0.5 + (top ? side * (k - 1) * 0.035 : 0), top ? 0.09 + k * 0.09 : 0);
        }
        if (curved) for (let q = 0; q < p.count; q++) {
          const rise = Math.max(0, Math.min(1, p.getY(q) / heights[k]));
          // 立つ芯・斜めの下葉・伏せた広葉を同じ三枚で作る。
          p.setXYZ(q, p.getX(q) + Math.sin(rise * Math.PI) * (k - 1) * 0.055,
            p.getY(q) * (1 - rise * (k * 0.1)), p.getZ(q) + rise * rise * (0.08 + k * 0.07));
        }
        g.rotateY(k * Math.PI / 3 + 0.3);
        // 光は上から受ける向きに（板ごとの明暗を消す）
        const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) { const v = new THREE.Vector3(nn.getX(q) * 0.35, 1, nn.getZ(q) * 0.35).normalize(); nn.setXYZ(q, v.x, v.y, v.z); }
        bg.push(g);
      }
      this.nearGrass = new THREE.InstancedMesh(mergeVegetationParts(bg), sway(liteMat({ color: this.def.nearGrassTint ?? 0xffffff, map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.05 }), 0.1, 0, { wear: true, after: grassLit }), N);
      this.nearGrass.frustumCulled = false;
      this.nearGrass.receiveShadow = true;
      this.nearN = N; this.nearG = G;
      this.nearOff = [];
      const RN = rng(2024);
      const col = new THREE.Color();
      let patchX = 0, patchZ = 0, patchSize = 1, patchDry = false;
      for (let i = 0; i < N; i++) {
        // 開けた川原は株を固めず、元の分布で足元までつなぐ。
        // 株数と新しい下葉の形、道端の低い草、踏み跡への反応は保つ。
        if (this.def.scatterNearGrass) {
          this.nearOff.push([RN() * G * 2, RN() * G * 2, 0.5 + Math.pow(RN(), 1.4) * 1.05, RN() * 6.28]);
          col.setRGB(0.24 + RN() * 0.1, 0.33 + RN() * 0.1, 0.12 + RN() * 0.05);
          if (RN() < 0.12) col.setRGB(0.38 + RN() * 0.08, 0.34 + RN() * 0.07, 0.2);
          if (this.def.autumn) col.lerp(TUFT_AUTUMN, 0.3);
          else if (this.def.young) col.setRGB(col.r * 0.92, col.g * 1.12, col.b * 0.95);
          this.nearGrass.setColorAt(i, col);
          continue;
        }
        // 五株で一つの群落。中心は高く、周りは低く広がる。同じ株数のまま裸地を挟む。
        if (i % 5 === 0) {
          patchX = RN() * G * 2; patchZ = RN() * G * 2;
          patchSize = 0.75 + RN() * 0.55; patchDry = RN() < 0.12;
        }
        const angle = RN() * Math.PI * 2, radius = i % 5 === 0 ? 0 : 0.3 + RN() * 0.65;
        const sc = patchSize * (i % 5 === 0 ? 1.35 : 0.55 + RN() * 0.45);
        this.nearOff.push([patchX + Math.cos(angle) * radius, patchZ + Math.sin(angle) * radius, sc, RN() * 6.28]);
        col.setRGB(0.24 + RN() * 0.1, 0.33 + RN() * 0.1, 0.12 + RN() * 0.05);
        if (patchDry) col.setRGB(0.38 + RN() * 0.08, 0.34 + RN() * 0.07, 0.2);
        if (this.def.autumn) col.lerp(TUFT_AUTUMN, 0.3);
        else if (this.def.young) col.setRGB(col.r * 0.92, col.g * 1.12, col.b * 0.95);
        this.nearGrass.setColorAt(i, col);
      }
      this.nearCell = null;
      this.nearM = new Float32Array(N * 16); this.nearShow = new Uint8Array(N);
      this.nearC = this.nearGrass.instanceColor ? this.nearGrass.instanceColor.array.slice() : null;
      // 足元も遠い株と同じ地表の色へ。巻き戻す前の色へ重ね掛けしない。
      if (this.def.tuftColor && this.nearC) this.nearBaseC = this.nearC.slice();
      this.nearGrass.count = 0;
      this.scene.add(this.nearGrass);
      lap('susuki+near');
    }
    // 田植えを終えたばかりの苗：田の中に列をなして並ぶ
    if (!NO_GRASS && this.def.paddy && this.field.height > 0) {   // 10/24：田の稲は作らない（全戦）
      // 苗は草むらの密な絵を使わず、根元から分かれる細い葉だけを描く。田の季節の色は材質で掛ける。
      const rc = document.createElement('canvas'); rc.width = rc.height = GS;
      const rg = rc.getContext('2d', { willReadFrequently: true }), RR = rng(177);
      for (let i = 0; i < 10; i++) {
        const root = GS * (0.46 + RR() * 0.08), tip = GS * (0.08 + i * 0.084);
        const h = GS * (0.48 + RR() * 0.48), w = GS * (0.004 + RR() * 0.003);
        const mx = root + (tip - root) * 0.2;
        const lg = rg.createLinearGradient(0, GS, 0, GS - h);
        lg.addColorStop(0, '#b8b8b8'); lg.addColorStop(0.45, '#dedede'); lg.addColorStop(1, '#eeeeee');
        rg.fillStyle = lg; rg.beginPath(); rg.moveTo(root - w, GS);
        rg.quadraticCurveTo(mx - w, GS - h * 0.55, tip, GS - h);
        rg.quadraticCurveTo(mx + w, GS - h * 0.55, root + w, GS);
        rg.closePath(); rg.fill();
      }
      const riceTex = alphaTex(rc);
      const rows = [];
      const pz = lowV ? 1.35 : 0.9, px = lowV ? 1.2 : 0.8, psc = lowV ? 1.25 : 1;
      for (let z = -this.half + 2; z < this.half - 2; z += pz) for (let x = -this.half + 2; x < this.half - 2; x += px) if (this.def.paddy(x, z) > 0.6) rows.push([x, z]);
      const sg = []; for (let k = 0; k < 2; k++) { const g = new THREE.PlaneGeometry(0.28, this.field.height); g.translate(0, this.field.height / 2, 0); g.rotateY(k * Math.PI / 2); sg.push(g); }
      // 両面の板の裏から見ると、曇りや雨の暗い光で苗が黒い点の群れに見えた（10/5 桶狭間）。草の株と同じく法線を上へ向ける
      for (const g of sg) { const nn = g.attributes.normal; for (let q = 0; q < nn.count; q++) nn.setXYZ(q, 0, 1, 0); }
      const rice = new THREE.InstancedMesh(mergeVegetationParts(sg), sway(liteMat({ color: this.field.color, map: riceTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), 0.06, 0, { after: riceLit }), rows.length);
      rows.forEach(([x, z], i) => { dummy.position.set(x + (R() - 0.5) * 0.1, this.heightAt(x, z) - 0.02, z + (R() - 0.5) * 0.1); dummy.rotation.set(0, R() * 3, 0); const sc = (0.8 + R() * 0.4) * psc; dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); rice.setMatrixAt(i, dummy.matrix); });
      rows.length = 0;
      this.scene.add(rice);
      this.viewCull([rice], 0);   // 苗も、見えている株だけを同じ束へ残す。
    }
    lap('paddy');
    if (!this.def.snow && !this.def.winter) patch(autumn ? 'higanbana' : 'flower', Math.round(tufts * (lowV ? 0.025 : 0.05)), autumn ? 0.85 : 0.7, lowV ? 28 : 50);
    lap('flower');
  }
}
