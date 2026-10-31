// 人の処理：衣服と装備。外部向けの入口は humans.js。
import { P as armorPaint, at as armorAt, MK, dequantize, LruMap, iroLaceColor } from './units_model.js';
import { namedKacchu } from './named_kacchu.js';
import { DOMARU, wantsDomaru, crowdDomaru } from './humans_armor.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SRC, limbFit, kusaPlates, plateOf, HEAD, humanLook } from './humans_shared.js';
import { katoGeometry, headEnvelope, IMP_TINT } from './units.js';


// 近距離専用の打ち出しと縅。元の形は変えず、骨へ付ける前に同じ部品へ結合する。
// 遠距離・影の lookParts(false) は打ち出しを重ねない（色の作り分け soldierVariety だけ layParts で掛ける）。形は姿ごとに共有し、描く回数は増やさない。
const nearArmorGeos = new LruMap(320);   // 人ごとの鍵（src.uuid）。人を手放した後も残るので上限つき（10/19）
let armorBox = null;
// ---- 兵の具足の作り分け（共通の差の3「兵が灰・黒の同じ形で単調」。10/31）----
// 身分（足軽・侍）と家ごとに、漆・威糸・脚絆・陣笠の色と形を六通りに分ける。人の鍵（vi%6）は lookParts の形の鍵に入っているので、
//   形の数も材質の数も増えない（頂点の色を塗り替えるだけ。共通の UNIT_MAT のまま）。名のある武将・本人・僧兵・小袖は触らない。
//   色は戦国の実物の具足の色（黒漆・溜塗・茶・錆・朱の褪せ）。青（紺・縹）は使わない（kaito 10/29）。
const VAR_LAC0 = [[null, 0, 1], [0x5a3420, 0.85, 1], [0x6a4c30, 0.8, 1], [0x7a6650, 0.7, 1], [0x5a2a1c, 0.6, 1], [0x141210, 0.7, 1]];
const VAR_LAC1 = [[null, 0, 1], [0x16120f, 0.9, 1], [0x4a2414, 0.85, 1], [0x5e4028, 0.8, 1], [0x6a2a1a, 0.7, 1], [0x4a4642, 0.8, 1]];
const VAR_RED = [[null, 0, 1], [0x6a2216, 0.5, 1], [0x8a3420, 0.45, 1], [0x4a1e14, 0.5, 1], [0x7a3020, 0.4, 1], [0x5a1a12, 0.55, 1]];
const VAR_LACE = [[null, 0], [0x7a4e2a, 0.7], [0x6a6e3a, 0.65], [0x8e3024, 0.65], [0xbcb294, 0.6], [0x5e3450, 0.6]];
const VAR_KYAHAN = [[null, 0], [0x8a7c62, 0.6], [0x2c2622, 0.6], [0x5a4630, 0.5], [0x6e5e48, 0.45], [0x3e3226, 0.5]];
const VAR_PERM = [3, 0, 4, 1, 5, 2];
// 陣笠の漆（黒漆が多め・溜・茶・朱の褪せ）
const VAR_HATC = [[null, 0, 1], [0x5a3420, 0.85, 1], [0x141210, 0.75, 1], [0x6a4c30, 0.8, 1], [0x4e2618, 0.6, 1], [0x1e1a16, 0.6, 1]];
// 陣笠の形（横の広さ・高さ）。平たい笠と尖った笠を混ぜる
const VAR_HAT = [[1, 1], [1.06, 0.88], [0.95, 1.12], [1.02, 0.94], [0.97, 1.06], [1.04, 1.0]];
const varCol = new THREE.Color(), varTmp = new THREE.Color();
function soldierVar(L) {
  if (L.hero || L.sohei || L.kosode || L.nanban || namedKacchu(L) || (L.tier || 0) >= 2 || L.kacchu || typeof L.face === 'string' || L.takedaRed) return null;
  const T = L.tier || 0, vi = (L.vi || 0) % 6;
  let h = 2166136261;
  // 家ごとの並べ替え（同じ家の中では人ごとの鍵 vi だけで決まる）
  for (const ch of String(L.mon || '') + '|' + (L.lace | 0) + '|' + T) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rot = (h >>> 0) % 6, iL = (vi + rot) % 6, iC = VAR_PERM[(vi + rot) % 6], iK = (vi + 2 * rot + 1) % 6;
  const base = new THREE.Color(L.armor ?? 0x24221f), hs = base.getHSL({});
  const red = hs.s > 0.45 && (hs.h < 0.05 || hs.h > 0.95) && hs.l > 0.15;
  const lacT = (red ? VAR_RED : T === 0 ? VAR_LAC0 : VAR_LAC1)[iL];
  return { iL, iC, iK, T, lac: lacT, lace: VAR_LACE[iC], kya: T === 0 ? VAR_KYAHAN[iK] : [null, 0], hat: T === 0 && /^jingasa/.test(L.hat || '') ? VAR_HAT[vi] : null, hatLac: (red ? VAR_RED : VAR_HATC)[(iL + (vi % 2 ? 2 : 0)) % 6] };
}
// 遠い軽い兵の束（world_army.js の makeImpostor）へ渡す、近い兵と同じ作り分けの色（胴の漆・威糸・笠）。
//   同じ soldierVar（同じ種と色の表）から、近い形の塗り替え（nearArmorParts・recolorGeo）と同じ混ぜ方で出す。作り分けの無い者は null
function soldierTint(look0) {
  const L = humanLook(look0), V = soldierVar(L);
  if (L.sohei || L.nanban || L.kosode || L.hero) return null;
  // 作り分けの無い者（名のある具足など）も、近い形と同じ漆・笠の色（humanLook の後の色）にそろえる
  if (!V) return { lac: L.armor ?? 0x24221f, lace: L.lace ?? 0x5a4630, hat: L.hatColor ?? L.armor ?? 0x24221f, i: -1 };
  const armor = L.armor ?? 0x24221f;
  let lac = armor, lace = L.lace ?? 0x5a4630;
  if (V.lac[0] != null) lac = varCol.set(armor).lerp(varTmp.set(V.lac[0]), V.lac[1]).getHex();
  else if (V.iL) lac = varCol.set(armor).multiplyScalar(0.8).getHex();
  if (V.lace[0] != null) lace = varCol.set(lace).lerp(varTmp.set(V.lace[0]), V.lace[1] * (V.T === 0 ? 0.8 : 1)).getHex();
  let hat = lac;
  if (V.hat) {
    const hb = L.hatColor ?? armor, H = V.hatLac;
    hat = H[0] != null ? varCol.set(hb).lerp(varTmp.set(H[0]), H[1]).getHex() : varCol.set(hb).multiplyScalar(0.8).getHex();
  }
  return { lac, lace, hat, i: V.iL };
}
IMP_TINT.fn = soldierTint;
// 塗り替え：元の色 base に近い頂点（同じ色合い・陰の明るさ）だけを、明るさの比を保って target へ寄せる
function remapNear(arr, i, base, bl, target, amt) {
  const r = arr[i], g = arr[i + 1], b = arr[i + 2], l = r * 0.3 + g * 0.59 + b * 0.11;
  if (bl < 1e-4 || l < 1e-4) return false;
  const k = l / bl;
  if (k < 0.55 || k > 1.12) return false;
  const sr = r + g + b, sb = base.r + base.g + base.b;
  if (Math.abs(r / sr - base.r / sb) + Math.abs(g / sr - base.g / sb) + Math.abs(b / sr - base.b / sb) > 0.12) return false;
  arr[i] = r + (target.r * k - r) * amt; arr[i + 1] = g + (target.g * k - g) * amt; arr[i + 2] = b + (target.b * k - b) * amt;
  return true;
}
// 漆の所（陣笠・胴の板・裏の色 col2）は指定の色が所ごとに違うので、漆ならどれも塗る。
//   陰（頂点の明るさ ÷ 形の漆の平均）は保ち、色と明るさは target（×br）にする。target が無い時は元の色を br 倍
function remapLac(arr, i, target, meanL, amt, br) {
  const r = arr[i], g = arr[i + 1], b = arr[i + 2], l = r * 0.3 + g * 0.59 + b * 0.11;
  const sh = target ? Math.min(1.3, Math.max(0.35, l / meanL)) * br : br;
  const tr = target ? target.r * sh : r * sh, tg = target ? target.g * sh : g * sh, tb = target ? target.b * sh : b * sh;
  arr[i] = r + (Math.min(1, tr) - r) * amt; arr[i + 1] = g + (Math.min(1, tg) - g) * amt; arr[i + 2] = b + (Math.min(1, tb) - b) * amt;
}
function recolorGeo(g, L, V, name) {
  const col = g.attributes.color, c2 = g.attributes.col2, mtl = g.attributes.mtl;
  if (!col || !mtl || !col.array || !mtl.array) return false;
  const laceB = new THREE.Color(L.lace ?? 0x5a4630), clothB = new THREE.Color(L.cloth ?? 0x2b2622);
  const lacV = name === 'head' && V.hat ? V.hatLac : V.lac;
  const lacT = lacV[0] == null ? null : new THREE.Color(lacV[0]), lacA = lacV[0] == null ? (V.iL === 0 && lacV === V.lac ? 0 : 1) : lacV[1], lacBr = lacV[0] == null ? 0.8 : lacV[2];
  // 形の漆の平均の明るさ（陰の物差し）
  let lacSum = 0, lacN = 0;
  for (let v = 0; v < col.count; v++) {
    const m = Math.floor(mtl.array[v] + 0.001);
    if (m % 8 === MK.lac) { const i = v * 3, a = col.array; lacSum += a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; lacN++; }
  }
  const meanL = Math.max(1e-4, lacN ? lacSum / lacN : 0.02);
  const laceT = V.lace[0] == null ? null : new THREE.Color(V.lace[0]), laceA = V.lace[1] * (V.T === 0 ? 0.8 : 1);
  const kyaT = V.kya[0] == null ? null : new THREE.Color(V.kya[0]);
  const lC = laceB.r * 0.3 + laceB.g * 0.59 + laceB.b * 0.11, lK = clothB.r * 0.3 + clothB.g * 0.59 + clothB.b * 0.11;
  const legs = /^(leg|thigh)/.test(name);
  let any = false;
  const n = col.count;
  for (let v = 0; v < n; v++) {
    const m = Math.floor(mtl.array[v] + 0.001), k1 = m % 8, k2 = Math.floor(m / 8) % 8;
    for (const [a, kk] of [[col.array, k1], [c2 && c2.array, k2]]) {
      if (!a) continue;
      const i = v * 3;
      if (kk === MK.lac && lacA > 0) { remapLac(a, i, lacT, meanL, lacA, lacBr); any = true; }
      else if (kk === MK.cloth) {
        if (laceT && remapNear(a, i, laceB, lC, laceT, laceA)) any = true;
        else if (legs && kyaT && remapNear(a, i, clothB, lK, kyaT, V.kya[1])) any = true;
      }
    }
  }
  if (any) { col.needsUpdate = true; if (c2) c2.needsUpdate = true; }
  return any;
}
// 塗り替えた形は nearArmorGeos（戦の片付け・gpu_gc の守る表）に入れる。腕・足・腰の刀などは色が変わらないので写さない
// 塗る所の無かった形の鍵（元の形をそのまま使う）
const varSame = new Set();
const VAR_PARTS = new Set(['torso', 'hips', 'head', 'sodeP', 'sodeN', 'thigh', 'leg']);
function soldierVariety(parts) {
  const L = parts.look, V = soldierVar(L);
  if (!V) return parts;
  const out = { ...parts };
  for (const name of Object.keys(parts)) {
    const src = parts[name];
    if (!VAR_PARTS.has(name) || !src || !src.isBufferGeometry || src.userData.soldierVar) continue;
    const key = ['var', name, src.uuid, V.iL, V.iC, V.iK, V.hat ? 'h' : ''].join('|');
    if (varSame.has(key)) continue;
    if (!nearArmorGeos.has(key)) {
      const reshape = name === 'head' && V.hat && (V.hat[0] !== 1 || V.hat[1] !== 1);
      let g = src.clone();
      g.userData = {};   // clone は userData を元の形と共有するので、別にする（元の形の鍵 ck を書き換えない）
      dequantize(g, 'color'); dequantize(g, 'col2');
      let ok = recolorGeo(g, L, V, name);
      if (reshape) {
        g.computeBoundingBox();
        const y0 = g.boundingBox.min.y;
        g.translate(0, -y0, 0); g.scale(V.hat[0], V.hat[1], V.hat[0]); g.translate(0, y0, 0);
        g.computeBoundingSphere(); ok = true;
      }
      if (!ok) { g.dispose(); if (varSame.size > 4000) varSame.clear(); varSame.add(key); continue; }
      g.userData.soldierVar = 1;
      nearArmorGeos.set(key, g);
    }
    out[name] = nearArmorGeos.get(key);
  }
  // 侍の袖：六人に一人は袖を着けない（籠手だけの軽い姿）
  if (V.T === 1 && (L.vi || 0) % 6 === 4) { out.sodeP = null; out.sodeN = null; }
  return out;
}
function nearArmorParts(parts0) {
  const L = parts0.look;
  if (L.sohei || L.kosode || L.nanban || namedKacchu(L)) return parts0;
  // 身分と家ごとの具足の作り分け（色と陣笠の形・袖の有無）。重ねる縁と鋲も同じ漆と糸の色にする
  const parts = soldierVariety(parts0), V = soldierVar(L);
  // 本物の胴丸には段・糸・金具が揃っているので、重ねる形を作らない。
  if (DOMARU.ready && (wantsDomaru(L) || crowdDomaru(L))) return parts;
  const out = { ...parts }, T = L.tier || 0, b = [0.94, 1, 1.05, 1.08][T];
  let lac = L.armor ?? 0x24221f, lace = L.lace ?? 0x5a4630;
  if (V) {
    if (V.lac[0] != null) lac = varCol.set(lac).lerp(varTmp.set(V.lac[0]), V.lac[1]).getHex();
    else if (V.iL) lac = varCol.set(lac).multiplyScalar(0.82).getHex();
    if (V.lace[0] != null) lace = varCol.set(lace).lerp(varTmp.set(V.lace[0]), V.lace[1] * (V.T === 0 ? 0.8 : 1)).getHex();
  }
  if (!armorBox) armorBox = new THREE.BoxGeometry(1, 1, 1);
  const enhance = (name, build) => {
    const src = parts[name];
    if (!src) return;
    const key = [name, src.uuid, lac, lace, T, L.hat, (L.vi || 0) % 6].join('|');
    if (!nearArmorGeos.has(key)) {
      const extra = [];
      const add = (g, col, mk, reg) => extra.push(armorPaint(g, col, { mk, reg, dirt: L.dirt ?? 0.35 }));
      const box = (w, h, d, x, y, z, col, mk, ry = 0, rz = 0) =>
        add(armorAt(armorBox.clone().scale(w, h, d), x, y, z, 0, ry, rz), col, mk, mk === MK.cloth ? 'cord' : 'lacq');
      // 横の縁を、板と板が重なる厚みとして打ち出す。
      const band = (r, y, span, a, squash = 1, x = 0, z = 0) => {
        const g = new THREE.CylinderGeometry(r, r + 0.002, 0.009, Math.max(3, Math.ceil(span * 4)), 1, true, a, span);
        g.scale(1, 1, squash); g.translate(x, y, z);
        add(g, lac, MK.lac, 'lacq');
      };
      build({ add, box, band });
      if (extra.length) {
        // 部品（8 bit の色）は float に戻した写しで束ねる
        const srcF = src.clone(); dequantize(srcF, 'color'); dequantize(srcF, 'col2');
        const g = mergeGeometries([srcF, ...extra]);
        srcF.dispose();
        for (const e of extra) e.dispose();
        nearArmorGeos.set(key, g);
      } else nearArmorGeos.set(key, src);
    }
    out[name] = nearArmorGeos.get(key);
  };
  enhance('torso', ({ box, band }) => {
    // 桶側は縦矧の板を保ち、腹巻・侍は札板の六段を強調する。
    const oke = T === 0 && (L.vi || 0) % 3 !== 2;
    // 足軽の桶側（横矧）は板の段と縁を形に持つので、重ねない
    if (oke && !L.doStyle || L.lacquer != null) return;   // 簡素な貸し具足（体に沿う胴）も重ねない
    const profile = [[0.2, 0.88], [0.205, 0.95], [0.212, 1.05], [0.232, 1.18], [0.248, 1.3], [0.238, 1.38]];
    for (let row = 0; row < (oke ? 2 : 5); row++) {
      const y = oke ? 0.94 + row * 0.37 : 0.977 + row * 0.097;
      let r = 0.248;
      for (let j = 1; j < profile.length; j++) if (y <= profile[j][1]) {
        const [ra, ya] = profile[j - 1], [rb, yb] = profile[j];
        r = ra + (rb - ra) * (y - ya) / (yb - ya); break;
      }
      band(r * b + 0.006, y, Math.PI * 2, 0, 0.8);
      // 鋲頭は小さく、漆の中で鉄だけが鈍く光る。
      for (const a of [-0.65, 0.65, Math.PI - 0.65, Math.PI + 0.65])
        box(0.007, 0.007, 0.004, Math.sin(a) * (r * b + 0.009), y + 0.015, Math.cos(a) * (r * b + 0.009) * 0.8, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('hips', ({ box, band }) => {
    // 足軽にも下二段の重なりを残す。近い姿の同じ束へ結合し、描画回数は増やさない。
    if (L.lacquer != null) return;   // 簡素な貸し具足の短い草摺は段を重ねない
    const np = T === 0 ? 5 : 7, step = Math.PI * 2 / np;
    for (let k = 0; k < np; k++) {
      const a = k * step + (np === 5 ? Math.PI / 5 : 0) + Math.PI;
      for (let row = 0; row < (T === 0 ? 2 : 5); row++) {
        const y = 0.644 + row * 0.048, r = (0.27 - 0.056 * (y - 0.63) / 0.27) * b + 0.01;
        band(r, y, step * 0.94, a - step * 0.47, 0.86);
        // 二列の素懸縅。糸を斜めに交差させ、段をつなぐ。
        const color = T >= 1 && !L.doLaceBands && L.kusazuriColor == null && !L.takedaRed
          ? iroLaceColor(Math.floor(8 - (L.kusazuriLaceRows ?? (T === 1 ? 4 : 5)) * (y + 0.021 - 0.63) / 0.254)) : lace;
        for (const sd of [-1, 1]) {
          const th = a + sd * step * 0.19;
          box(0.006, 0.031, 0.005, Math.sin(th) * (r + 0.004), y + 0.021, Math.cos(th) * (r + 0.004) * 0.86, color, MK.cloth, th, sd * 0.23);
        }
      }
    }
  });
  // 袖の折り返しと縅は共通の板に含める。筒状の帯を二重に足さない。
  if (T >= 1 && (L.vi || 0) % 3 !== 2) enhance('thigh', ({ box }) => {
    // 佩楯は布の上の独立した小札。膝の曲げを妨げない長さ。
    for (let row = 0; row < 3; row++) for (let j = 0; j < 4; j++) {
      const a = (j - 1.5) * 0.32, y = -0.075 - row * 0.069;
      box(0.028 * b, 0.048, 0.006, Math.sin(a) * 0.12 * b, y, Math.cos(a) * 0.12 * b + 0.017, lac, MK.lac, a);
    }
  });
  for (const side of ['P', 'N']) enhance('fore' + side, ({ box }) => {
    // 篠籠手の細い鉄の筋。素肌の腕には部品自体が無いので付けない。
    if (T === 0 || L.hero) return;
    const sd = side === 'P' ? 1 : -1;
    for (const da of [-0.3, 0.3]) {
      const a = sd * Math.PI * 0.65 + da;
      box(0.006, 0.175, 0.006, Math.sin(a) * 0.054 * b, -0.385, Math.cos(a) * 0.054 * b, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('leg', ({ box }) => {
    // 臑当の蝶番を留める鋲。足軽の脚絆だけの者には付けない。
    if (T === 0) return;   // 足軽に臑当は着けない（脚絆だけ）
    for (const y of [-0.065, -0.23]) for (const a of [-0.48, 0.48]) {
      const r = (0.081 - (-y - 0.03) * 0.016 / 0.22) * b;
      box(0.006, 0.007, 0.005, Math.sin(a) * (r + 0.003), y, Math.cos(a) * (r + 0.003) - 0.004, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('head', ({ add }) => {
    if (!(L.hat || '').startsWith('kabuto') || /namazu|suwa|bari/.test(L.hat)) return;
    // 筋兜の鉢は、絵の筋に加えて細い鉄を立てる。頭形は三枚の継ぎ板。
    const zunari = L.hat === 'kabuto' && (L.vi || 0) % 2 === 1, n = zunari ? 3 : 12;
    for (let j = 0; j < n; j++) {
      const g = new THREE.TorusGeometry(0.193, 0.0025, 3, 7, Math.PI / 2 - 0.13);
      g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); g.rotateY(j * Math.PI * 2 / n);
      g.scale(0.84, (zunari ? 0.86 : 0.94) * 0.9, 1.05 * 0.84);
      g.translate(0, 1.654, 0.0016);
      add(g, 0x3a3e42, MK.iron, 'iron');
    }
  });
  return out;
}

// 部品の置き方（本人の組み方と兵のまとめ方で同じ）：put(名, 骨, 形, 行列)
function layParts(P, L, put) {
  // 遠目・束ねた形（lookParts(look, false)）にも同じ作り分けを（近い形から来た部品は済みの印で二度塗らない）
  if (P && P.look && !(L.sohei || L.kosode || L.nanban)) P = soldierVariety(P);
  const R = SRC.rest, RD = SRC.radius;
  const { fitT, fitH } = SRC;
  put('torso', 'Spine1', P.torso, fitT);
  // 鎧下の肩と背の上（胴の上から小袖の肩がのぞく）。見本の体の襟の装備の名残を覆う
  if (!L.sohei && SRC && !(L.tier >= 1 && DOMARU.ready && !L.nanban)) put('yoke', 'Spine2', yokeGeo(L), fitT);
  // 草摺は腰に。陣羽織・母衣・袖は胸に（袖は肩から紐で吊るすので、胴について行き、腕を上げても顔の横へ立たない）
  put('hips', 'Hips', P.hips, fitT);
  put('haori', 'Spine2', P.haori, fitT);
  put('back', 'Spine2', P.back, fitT);
  // 腰の刀は胴の下の骨に（録った動きの腰の骨は大きくひねっているので、腰の骨に付けると刀が横へ突き出る）
  put('koshi', 'Spine1', P.koshi, namedKacchu(L) ? SRC.fitK : fitT);
  // 指物の竿（受筒を支点にしなる。背の旗は竿に付ける）
  put('pole', 'Spine2', P.pole, fitT);
  put('sodeP', 'Spine2', P.sodeP, fitT);
  put('sodeN', 'Spine2', P.sodeN, fitT);
  // 裹頭は実写の顔に合わせて下で作る（units.js の遠目の裹頭は使わない）
  // 僧兵の鉢巻も実写の頭に沿わせて下で作る
  // 鉢巻は誰のも実写の頭に沿わせて下で作る（遠目の形の鉢巻は頭から浮いた白い輪に見える）
  put('hat', 'Head', (L.sohei && L.hat === 'kato') || L.hat === 'hachimaki' ? null : P.head, fitH);
  put('face', 'Head', P.face, fitH);
  // 腕：籠手（二の腕・前腕・手甲）。+x が本編の「右手」（槍を持つ手）
  const rA = (nm, ours) => Math.max(1, ((RD[nm] || { r: ours }).r * 1.12) / ours);
  for (const [sd, side] of [[1, 'Right'], [-1, 'Left']]) {
    const S_ = sd > 0 ? 'P' : 'N';
    put('upper' + S_, side + 'Arm', P['upper' + S_], limbFit(side + 'Arm', side + 'ForeArm', 0.27, rA(side + 'Arm', 0.058)));
    // 籠手の無い腕：小袖の袖（肩山から肘まで、ゆったりした筒）。見本の体の肩当ての名残を覆う
    if (!P['upper' + S_] && !L.sohei && SRC) put('sleeve' + S_, side + 'Arm', sleeveGeo(L), limbFit(side + 'Arm', side + 'ForeArm', 0.27, 1));
    // 本人の前腕の籠手は実の太さ（中の体の前腕は描かない。bodyMaterial の nh）
    put('fore' + S_, side + 'ForeArm', P['fore' + S_], limbFit(side + 'ForeArm', side + 'Hand', 0.23, L.hero ? 1 : rA(side + 'ForeArm', 0.05), 0.27));
    put('hand' + S_, side + 'Hand', P['hand' + S_], limbFit(side + 'Hand', side + 'HandMiddle1', 0, 1, 0.5));
    put('thigh' + S_, side + 'UpLeg', P.thigh, limbFit(side + 'UpLeg', side + 'Leg', 0.4, rA(side + 'UpLeg', 0.11)));
    put('leg' + S_, side + 'Leg', P.leg, limbFit(side + 'Leg', side + 'Foot', 0.3, rA(side + 'Leg', 0.078)));
  }
  // 足：足首を原点に（本編の脛の座標で足首は y=-0.3）
  for (const side of ['Left', 'Right']) {
    const a = R[side + 'Foot'];
    put('foot' + side, side + 'Foot', P.foot, new THREE.Matrix4().makeTranslation(a.x, a.y + 0.3 - 0.02, a.z));
  }
  // 僧兵：裹頭（袈裟と衣は胴まわりの部品に入っている）
  if (L.sohei && L.hat === 'kato') put('kato', 'Head', soheiKato(L), fitH);
  if (L.hat === 'hachimaki') put('kato', 'Head', soheiHachi(L.sohei ? L : { kato: L.hachi || 0x958b77 }), fitH);
}
// 草摺の形を、揺糸の帯と板一枚ずつに分ける（形は元の形ごとに覚える）
const kzSplit = new Map();
function splitKusazuri(h, L) {
  const hp = h.parts.hips, g = hp.geometry;
  if (!kzSplit.has(g.uuid)) {
    const KP = kusaPlates(L), src = g.index ? g.toNonIndexed() : g, pos = src.attributes.position;
    const groups = Array.from({ length: KP.np + 1 }, () => []);
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      groups[plateOf(x, y, z, KP) + 1].push(t);
    }
    const pick = (list) => {
      const o = new THREE.BufferGeometry();
      for (const [nm, at] of Object.entries(src.attributes)) {
        const n = at.itemSize, arr = new at.array.constructor(list.length * 3 * n);
        list.forEach((t, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(j * 3 + v) * n + c] = at.array[(t + v) * n + c]; });
        o.setAttribute(nm, new THREE.BufferAttribute(arr, n, at.normalized));
      }
      o.computeBoundingSphere();
      return o;
    };
    kzSplit.set(g.uuid, groups.map(pick));
  }
  const G = kzSplit.get(g.uuid);
  hp.geometry = G[0];
  h.kzMesh = [];
  for (let k = 1; k < G.length; k++) {
    const m = new THREE.Mesh(G[k], hp.material);
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false;
    hp.add(m); h.kzMesh.push(m);
  }
}

// ---- 名のある武将：本物の胴丸の上に、その人の兜・実写の顔・陣羽織（背に家紋）・母衣・太刀と脇差 ----
// 陣羽織は近くでは着せない：本の写真の具足は陣羽織なしで、胴の上の陣羽織は板の箱に見えた（kaito 10/27「陣羽織なし」・10/28「イラストすぎる」）。
//   遠くの軽い兵（units.js の形）には残す（家の色の目印）
const NAMED_KEEP = new Set(['hat', 'back', 'koshi', 'pole']);
// 兜の形から、鉢・錣・吹返し・眉庇を除き、前立などの飾りだけを残す（三角の中心で選ぶ）
// 残す物：白い毛（諏訪法性の白熊）、眉庇より上で金の物、鉢から離れて立つ物（鹿角・鯰尾・天衝）
const CREST_OFF = { y: -0.033, z: -0.03 };   // y は兜の下げ（HELM_FIT.dy）に合わせる
const crestGeos = new Map();
function crestOnly(g) {
  if (!g) return g;
  if (crestGeos.has(g.uuid)) return crestGeos.get(g.uuid);
  const src = g.index ? g.toNonIndexed() : g, pos = src.attributes.position, col = src.attributes.color, mtl = src.attributes.mtl;
  const keep = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    let x = 0, y = 0, z = 0, r = 0, gg = 0, b = 0, mk = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(i + k) / 3; y += pos.getY(i + k) / 3; z += pos.getZ(i + k) / 3; if (col) { r += col.getX(i + k) / 3; gg += col.getY(i + k) / 3; b += col.getZ(i + k) / 3; } }
    if (mtl) mk = Math.floor(mtl.getX(i)) % 8;
    const fur = col && r > 0.7 && gg > 0.7 && b > 0.62;
    const d = Math.hypot(x, y - 1.654, z - 0.01);
    if (fur || (y > 1.715 && (mk === 4 || d > 0.2))) keep.push(i, i + 1, i + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const nm of Object.keys(src.attributes)) {
    const a = src.attributes[nm], arr = new a.array.constructor(keep.length * a.itemSize);
    keep.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]; });
    out.setAttribute(nm, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  out.computeBoundingSphere();
  crestGeos.set(g.uuid, out);
  return out;
}

// ---- 僧兵の装い：裹頭（白い頭巾で頭と顔を包み、目だけ出す）と袈裟 ----
// 形は units.js の部品と同じ作り（UNIT_MAT の色・素材の値）で、体の座標で作る
const PLAIN_UV = [(1024 + 128) / 2048, 1 - (768 + 128) / 1024];
// 鎧下の肩：胴の上の縁から首の付け根まで、肩と背の上を覆う低い丸み（体の座標）
const yokeGeos = new Map();
function yokeGeo(L) {
  const hex = L.cloth || 0x2b2622, k = hex + '|' + (L.tier || 0);
  if (!yokeGeos.has(k)) {
    const b = [0.94, 1.0, 1.05, 1.08][L.tier || 0];
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    g.scale(0.215 * b, 0.075, 0.155 * b); g.translate(0, 1.41, -0.012);
    yokeGeos.set(k, paintG(g.toNonIndexed(), hex, 0, 0.6));
  }
  return yokeGeos.get(k);
}
// 小袖の袖：肩山の丸みと、肘へ少し細る筒（腕の骨の座標：関節を原点に下 -y へ）
const sleeveGeos = new Map();
function sleeveGeo(L) {
  const hex = L.cloth || 0x2b2622, k = hex + '|' + (L.tier || 0);
  if (!sleeveGeos.has(k)) {
    const tube = new THREE.CylinderGeometry(0.074, 0.066, 0.29, 12, 3, true); tube.translate(0, -0.125, 0);
    // 肩から垂れる布を肘で絞る。同じ頂点で袂と縫い目の襞を作り、筒の輪郭を崩す。
    const tp = tube.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const t = THREE.MathUtils.clamp((.02 - y) / .29, 0, 1), a = Math.atan2(z, x);
      const belly = Math.sin(t * Math.PI);
      const fold = 1 + belly * (.12 + .065 * Math.cos(a * 5 + t * 2));
      tp.setXYZ(i, x * fold, y, z * fold - .018 * belly);
    }
    tube.computeVertexNormals();
    const cap = new THREE.SphereGeometry(0.074, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.5, 1); cap.translate(0, 0.02, 0);
    // 袖口：少し厚みのある折り返し
    const cuff = new THREE.TorusGeometry(0.066, 0.007, 4, 12); cuff.rotateX(Math.PI / 2); cuff.translate(0, -0.27, 0);
    const g = mergeGeometries([tube, cap, cuff].map((x) => { x = x.toNonIndexed(); for (const a of Object.keys(x.attributes)) if (a !== 'position' && a !== 'normal') x.deleteAttribute(a); return x; }));
    sleeveGeos.set(k, paintG(g, hex, 0, (L.tier || 0) === 0 ? 0.8 : 0.5));
  }
  return sleeveGeos.get(k);
}
function paintG(g, hex, mk = 0, dirt = 0.35) {
  if (!g.index) { const n = g.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('col2', new THREE.BufferAttribute(a.slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(n).fill(mk + mk * 8 + dirt * 0.9), 1));
  return g;
}
const soheiCache = new Map();
// 裹頭：袈裟の布で頭を包み、目のまわりだけを細く出す。布は実写の顔と遠目の顔の両方の一回り外に沿う
// （頭の点の群れから包みの下地を作る。鼻と口は布の下、窓からは目元だけ）。色と包み方（窓の高さ・垂れの長さ）は人ごとに少し変える
// 頭の包みの下地（実写の顔と遠目の顔の一回り外）。一度だけ作る
let SOHEI_HEAD = null;
function soheiHead() {
  if (SOHEI_HEAD && SOHEI_HEAD.scan === !!HEAD) return SOHEI_HEAD;
  const C = { x: 0, y: 1.6, z: 0.012 };
  const pts = [];
  // 遠目の顔（units.js の頭）：頭の楕円と鼻、首
  for (let j = 0; j <= 20; j++) for (let i = 0; i < 32; i++) {
    const th = (i / 32) * Math.PI * 2, ph = (j / 20 - 0.5) * Math.PI, c = Math.cos(ph);
    const rz = Math.cos(th) < 0 ? 0.117 * 1.08 : 0.117;
    pts.push(Math.sin(th) * c * 0.104, 1.6 + Math.sin(ph) * 0.135, 0.012 + Math.cos(th) * c * rz);
  }
  for (const dx of [-0.012, 0, 0.012]) pts.push(dx, 1.585, 0.148);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; for (const y of [1.4, 1.46, 1.52]) pts.push(Math.sin(a) * 0.062, y, 0.006 + Math.cos(a) * 0.062); }
  // 実写の顔（顔の幅の作り分けの分だけ横を広げる）
  if (HEAD) {
    const p = HEAD.geo.attributes.position, kk = HEAD.k;
    for (let i = 0; i < p.count; i += 2) if (p.getY(i) > -0.6) pts.push(p.getX(i) * kk * 1.04, 1.568 + kk * (p.getY(i) - 1.2), 0.006 + kk * (p.getZ(i) - 0.1));
  }
  SOHEI_HEAD = { C, R: headEnvelope(pts, C, 48, 28), scan: !!HEAD };
  return SOHEI_HEAD;
}
function soheiKato(L) {
  const vi = (L.vi || 0) % 6;
  const k = (L.kato || 0) + '|' + vi + (HEAD ? '|s' : '');
  if (soheiCache.has(k)) return soheiCache.get(k);
  const { C, R } = soheiHead();
  const g = katoGeometry(R, C, { col: L.kato || 0xe2dccf, vi, hi: true, win: { x: -0.005, y: 1.607, hw: 0.078, hh: 0.038 + 0.002 * (vi % 3) }, drop: [1, 1.15, 0.9, 1.25, 1.05, 0.95][vi] });
  soheiCache.set(k, g);
  return g;
}
// 鉢巻（剃った頭の額に白い布を巻き、後ろで結んで端を垂らす）：頭の形に沿わせる
function soheiHachi(L) {
  const k = 'hachi|' + (L.kato || 0) + (HEAD ? '|s' : '');
  if (soheiCache.has(k)) return soheiCache.get(k);
  const { C, R } = soheiHead();
  const col = L.kato || 0xe2dccf, pr = [];
  const NU = 40, pos = [], idx = [];
  // 額は眉の上、後ろは少し下がる。布の厚みで外と内の二枚
  for (const [lay, off] of [[0, 0.006], [1, 0.001]]) {
    const b0 = pos.length / 3;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= NU; i++) {
      const th = -Math.PI + (i / NU) * Math.PI * 2, bk = (1 - Math.cos(th)) / 2;
      const y = 1.655 - 0.03 * bk + (j ? 0.03 : 0);
      let ph = 0.4; for (let n = 0; n < 4; n++) ph = Math.asin(Math.max(-1, Math.min(1, (y - C.y) / (R(th, ph) + off))));
      const r = R(th, ph) + off + 0.0015 * Math.sin(th * 9);
      pos.push(C.x + Math.sin(th) * Math.cos(ph) * r, C.y + Math.sin(ph) * r, C.z + Math.cos(th) * Math.cos(ph) * r);
    }
    for (let i = 0; i < NU; i++) { const a = b0 + i, b = a + 1, c = a + NU + 1, d = c + 1; if (lay) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  }
  const band = new THREE.BufferGeometry(); band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); band.setIndex(idx); band.computeVertexNormals();
  pr.push(paintG(band, col, 0, 0.45));
  const kr = R(Math.PI, 0.3) + 0.012, kp = [C.x, 1.64, C.z - Math.cos(0.3) * kr];
  const knot = new THREE.SphereGeometry(0.017, 8, 6); knot.scale(1.3, 1, 0.8); knot.translate(...kp);
  pr.push(paintG(knot, col, 0, 0.45));
  for (const sd of [-1, 1]) { const t = new THREE.BoxGeometry(0.026, 0.11, 0.004); t.translate(0, -0.055, 0); t.rotateZ(sd * 0.22); t.rotateX(-0.2); t.translate(kp[0] + sd * 0.01, kp[1] - 0.005, kp[2] - 0.006); pr.push(paintG(t, col, 0, 0.45)); }
  const g = mergeGeometries(pr);
  soheiCache.set(k, g);
  return g;
}
// 薙刀：柄は長さ 2.1m ほど、反りのある刃。槍と同じ握り（右手の所が原点、+z が前）
let NAGINATA = null;
function naginata(u) {
  // 長柄（槍）を持つ僧兵だけ。弓・鉄砲の僧兵はそのまま
  if (!u.wpn || u.lookWeapon !== 'spear' || (u.wpnKind && u.wpnKind !== 'spear') || u.wpn.userData.bow || u.wpn.userData.ram) return;
  if (!NAGINATA) {
    const pr = [];
    const shaft = new THREE.CylinderGeometry(0.019, 0.022, 2.05, 6); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, 0.12);
    pr.push(paintG(shaft, 0x2a1c12, 1));
    const tsuba = new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10); tsuba.rotateX(Math.PI / 2); tsuba.translate(0, 0, 1.16);
    pr.push(paintG(tsuba, 0x2a2622, 3));
    const hab = new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6); hab.rotateX(Math.PI / 2); hab.translate(0, 0, 1.05);
    pr.push(paintG(hab, 0x1b1a18, 0));
    // 刃：反りのある片刃（刃は下、峰は上）
    const s = new THREE.Shape();
    s.moveTo(0, 0.012); s.quadraticCurveTo(0.34, 0.02, 0.6, 0.11); s.quadraticCurveTo(0.42, 0.03, 0.0, -0.028); s.closePath();
    const bl = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 8 });
    bl.translate(0, 0, -0.003); bl.rotateY(-Math.PI / 2); bl.translate(0, 0, 1.17);
    pr.push(paintG(bl, 0xb5b9bb, 3, 0.1));
    const sb = new THREE.CylinderGeometry(0.015, 0.02, 0.06, 6); sb.rotateX(Math.PI / 2); sb.translate(0, 0, -0.93);
    pr.push(paintG(sb, 0x3a3e42, 3));
    NAGINATA = mergeGeometries(pr);
    NAGINATA.computeBoundingSphere();
  }
  // 槍のしなり（units.js）は、長柄の槍の形に入れ替えるので止める
  const F = u.wpn.userData.flex;
  if (F) { if (F.a) F.a.visible = false; u.wpn.userData.flex = null; }
  u.wpn.geometry = NAGINATA;
  u.wpn.userData.tip = 1.8; u.wpn.userData.butt = -0.95;
}

export { soldierTint, soldierVar, nearArmorGeos, nearArmorParts, layParts, kzSplit, splitKusazuri, NAMED_KEEP, CREST_OFF, crestGeos, crestOnly, PLAIN_UV, yokeGeos, sleeveGeos, soheiCache, SOHEI_HEAD, NAGINATA, naginata };
