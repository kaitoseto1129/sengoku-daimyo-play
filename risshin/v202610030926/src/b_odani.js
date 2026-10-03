// ======================================================================
// 織田家編　小谷城の戦い（天正元年八月〜九月）　docs/late6-1573-1575-spec.md 14〜37章
// 刀根坂で朝倉を破った信長は、その足で北近江の小谷城を囲んだ。羽柴秀吉は夜、清水谷から尾根の真ん中の
// 京極丸へ攻め上り、南の本丸（浅井長政）と北の小丸（父の久政）とを切り離した。
// 足軽は羽柴秀吉の手。①清水谷（浅井の居館と屋敷の谷）を登る ②京極丸を取る ③分断：両方からの寄せを受ける
// ④小丸へ攻め上がる（久政の最期） ⑤本丸から出されたお市の方と三人の姫の一行を、谷の織田の陣まで供する
// （長政の最期は史実の文で）。そのあいだ南の大手では、織田の本隊が番所→御茶屋→御馬屋→桜馬場→黒金御門と
// 一段ずつ攻め上がっていく（遠景の合戦）。「本丸を取れば終わり」でなく、城の真ん中を割って崩す戦。
// 縄張りは castles/odani.js（梯郭の曲輪・大堀切・門・櫓・清水谷の道）。大将格（長政・久政）は前線に出さない。
// 向き：主尾根は南北（北 -z が高い）。清水谷は尾根の西（-x）。信長の本陣（虎御前山）は南の遠く。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, campfire, koshi, ishigaki, kagaribi, umatsunagi, dou, kabukimon, dorui, palisade, tawara, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { applyLook, dress, gone, DAWN } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
import { buildCastlePlan, heightOf } from './castle_plan.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeNawabari } from './nawabari.js';
import { reset as flReset } from './floors.js';
import {
  ODANI_PLAN, RIDGE, crestAt, BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, SANNO2,
  UMAARAI, OHORIKIRI, GATE_KURO, GATE_NAKA_KYO, GATE_KYO_KOMA, GATE_WEST, SHIMIZU, SHIMIZU_FLOOR, CLIMB_UP, KYOKAN, TERA, YASHIKI, ROAD_RIDGE,
} from './castles/odani.js';

// 国土地理院の標高（asset_dem_odani）は使わない：格子の中心が城から北西へ数 km ずれていて（比高 68m＝小谷山でない）、
// 混ぜると尾根も曲輪の段もつぶれてしまう（10/2 に見つけた）。地形は縄張りの高さ（castles/odani.js の CREST）から作る
const KC = { x: KYO.x, z: KYO.cz };                       // 京極丸の真ん中
const KOMC = { x: KOM.x, z: KOM.cz };
const HONC = { x: HON.x, z: HON.cz };
const MOUTH = { x: -93, z: 86 };   // 清水谷の中ほど（羽柴の手が集まる所。谷の口から忍んで入った）
const HEAD = { x: SHIMIZU[SHIMIZU.length - 1][0], z: SHIMIZU[SHIMIZU.length - 1][1] };   // 谷の奥
const BELOW = { x: CLIMB_UP[2][0], z: CLIMB_UP[2][1] };   // 京極丸の西の口の下
const ODA_POST = { x: -70, z: 6 };   // 谷に置いた羽柴の陣（お市の方の一行の行き先）
const CLIMB = [...SHIMIZU, ...CLIMB_UP.slice(1)];
// お市の方の一行が下る道：（本丸から大堀切の土橋を渡って来た）中丸 → 京極丸 → 西の口 → 清水谷 → 谷の羽柴の陣
const ESCORT = [[0, NAKAMARU.cz], [0, KYO.cz], [GATE_WEST.x + 3, GATE_WEST.z], ...CLIMB_UP.slice(0, 3).reverse(), [SHIMIZU[4][0], SHIMIZU[4][1]], [ODA_POST.x, ODA_POST.z]];
const ODA = { flag: 'oda' };
const AZAI = { flag: 'azai' };
const AZ_ARMOR = 0x2e2a26, ODA_ARMOR = 0x2b3140;
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { rt.objDone('main'); rt.after(2, () => { if (!rt.flags.ending) rt.obj('main', text, 'main'); }); };
// 羽柴秀吉の見た目（units.js の GENERALS は「木下藤吉郎」の名で持つので、同じ兜・羽織を渡す）
const HIDE = { hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a };
// 未明（夜明け前）の色：夜の青さを残しつつ、尾根と曲輪の形が読める明るさ（真っ暗にしない）
const PREDAWN = { sky: 0x5c647a, fog: 0x555c6e, sun: 0xd2cae2, sunI: 1.4, hs: 0xb4bcd6, hg: 0x44403a, hI: 1.7, top: 0x323c5a, glow: 0.16, dir: [0.9, 0.16, -0.1], mount: 0x22262e };

// ---------------- 地形 ----------------
// 点 (x,z) から折れ線への最短距離と、線の上の位置（0〜1）
function alongLine(pts, x, z) {
  let best = Infinity, bt = 0, acc = 0;
  const lens = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = lens[i - 1] || 1e-6;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l); t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
    if (d < best) { best = d; bt = (acc + t * l) / tot; }
    acc += l;
  }
  return { d: best, t: bt };
}
function floorAt(t) {
  const n = SHIMIZU_FLOOR.length - 1, f = t * n, i = Math.min(n - 1, Math.floor(f));
  return SHIMIZU_FLOOR[i] + (SHIMIZU_FLOOR[i + 1] - SHIMIZU_FLOOR[i]) * (f - i);
}
// 周りの砦（遠景・AI の戦い。中は作らない）：x, z, 平らにする高さ, 旗
const FORTS = [
  { id: 'otake', name: '大嶽', x: -128, z: -160, h: 36, flag: 'oda' },
  { id: 'kingo', name: '金吾丸', x: -66, z: -160, h: 32, flag: 'oda' },
  { id: 'fukuju', name: '福寿丸', x: -150, z: -98, h: 26, flag: 'oda' },
  { id: 'yamazaki', name: '山崎丸', x: -154, z: -36, h: 20, flag: 'oda' },
  { id: 'gessho', name: '月所丸', x: 58, z: -102, h: 16, flag: 'azai' },
];
function baseTerrain(x, z) {
  const crest = crestAt(z);
  // 主尾根：背は曲輪の高さに沿い、東西へ急に下る
  const ax = Math.max(0, Math.abs(x) - 10);
  let h = crest - ax * 0.5;
  // 西の大嶽の尾根（福寿丸・山崎丸が並ぶ。北ほど高い）
  const ax2 = Math.max(0, Math.abs(x + 146) - 10);
  h = Math.max(h, 8 + Math.max(0, Math.min(330, 150 - z)) * 0.085 - ax2 * 0.45);
  // 大嶽から山王丸の北へ回る尾根（金吾丸）
  h = Math.max(h, 30 - Math.max(0, Math.abs(z + 160) - 10) * 0.45);
  // 東の月所丸へ張り出す小尾根
  if (x > 0) h = Math.max(h, crestAt(-100) - 6 - Math.max(0, x - 10) * 0.2 - Math.max(0, Math.abs(z + 100) - 6) * 0.5);
  // 清水谷：谷底は口から奥へ上る。谷の両側は尾根まで上がる（尾根の背は越えない）
  if (x < 4) {
    const L = alongLine(SHIMIZU, x, z), fl = floorAt(L.t);
    const bowl = fl + Math.min(0.0045 * L.d * L.d, 26);
    const cap = crest - 3 - ax * 0.25 + Math.max(0, -x - 60) * 0.6;
    h = Math.max(h, Math.min(bowl, cap));
    // 谷底の道沿いは平らに（屋敷の並ぶ平場）
    if (L.d < 12) h = Math.min(h, fl + L.d * 0.05);
  }
  // 東の谷の向こうの山（虎御前山の方の丘）
  h = Math.max(h, 12 * gauss(x, z, 175, 60, 3000));
  // 周りの砦の平場
  for (const f of FORTS) { const d = Math.hypot(x - f.x, z - f.z); if (d < 12) h = d < 9 ? f.h : h + (f.h - h) * (12 - d) / 3; }
  h += 0.35 * Math.sin(x * 0.07 + 0.3) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 + x * 0.03);
  return Math.max(0, h);
}
// 門の上がり坂：曲輪の切岸は縁で 2.7m ほど切れ落ちるので、口の所だけ下の曲輪から上の曲輪へ坂でつなぐ
const RAMPS = [];
for (let i = 0; i < RIDGE.length - 1; i++) {
  const lo = RIDGE[i], up = RIDGE[i + 1];
  RAMPS.push({ a: [0, lo.z0 + 3], b: [0, up.z1 - 3], w: 2.6 });
}
RAMPS.push({ a: [0, BANSHO.z1 + 10], b: [0, BANSHO.z1 - 3], w: 2.6 });
RAMPS.push({ a: [CLIMB_UP[2][0], CLIMB_UP[2][1]], b: [GATE_WEST.x + 4, GATE_WEST.z], w: 2.8 });
RAMPS.push({ a: [0, SANNO.z0 + 6], b: [0, SANNO2.z1 - 2], w: 2.2 });
// 堀切の窪み（castle_plan.js が C.height に混ぜるのと同じ物を、世界の高さにも混ぜる）
const HORI = ODANI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
const baseWithHori = (x, z) => HORI.reduce((a, f) => a + f(x, z), baseTerrain(x, z));
let H0 = null;
function height(x, z) {
  if (!H0) {
    H0 = heightOf(ODANI_PLAN, baseWithHori, 3);
    for (const r of RAMPS) { r.ha = H0(r.a[0], r.a[1]); r.hb = H0(r.b[0], r.b[1]); r.len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) || 1; }
  }
  let h = H0(x, z);
  for (const r of RAMPS) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
    const t = ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (r.len * r.len);
    if (t < 0 || t > 1) continue;
    const d = Math.abs((x - r.a[0]) * dz - (z - r.a[1]) * dx) / r.len;
    if (d > r.w + 1.5) continue;
    const hr = r.ha + (r.hb - r.ha) * t;
    const k = d <= r.w ? 1 : 1 - (d - r.w) / 1.5;
    h = h + (hr - h) * k;
  }
  return h;
}

const odani = {
  spawn: { x: MOUTH.x + 1, z: MOUTH.z + 6, heading: Math.PI - 0.2 },   // 屋敷（YASHIKI[1]）の軒から 6m 離す（肩越しのカメラの右を軒が塞いでいた。見回り 10/3）
  world: {
    seed: 1573,
    wind: [-0.7, 0.7],
    time: 'dusk',
    muddy: 0.25,
    paths: [CLIMB, ROAD_RIDGE],
    height,
    tint(x, z, h, c) {
      // 尾根の曲輪の土と、清水谷の道沿いの踏み固めた土
      if (Math.abs(x) < 16 && z < 154 && z > -140) c.lerp({ r: 0.46, g: 0.42, b: 0.34 }, 0.42);
      else if (x < -30 && x > -125 && z > -60 && z < 165 && alongLine(SHIMIZU, x, z).d < 9) c.lerp({ r: 0.42, g: 0.38, b: 0.3 }, 0.3);
      else if (h > 12) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x) < 20 && z < 160 && z > -142)
      || (x < -20 && x > -125 && z > -66 && z < 170 && alongLine(CLIMB, x, z).d < 14)
      || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 22 || FORTS.some((f) => Math.hypot(x - f.x, z - f.z) < 13),
    trees: 640,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 24 ? 0.15 : 1),
    // 桜馬場は名の通り、尾根の中でそこだけ桜の群れ
    groves: [{ x: 30, z: -10, r: 12, n: 20 }, { x: 36, z: -60, r: 12, n: 20 }, { x: -28, z: 100, r: 12, n: 18 }, { x: -18, z: SAKURABABA.cz, r: 8, n: 12 }, { x: 18, z: SAKURABABA.cz + 6, r: 8, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && (x > 60 || z < -150 || z > 168),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 30000, 5000);
    // ---- 主尾根の梯郭：塀・門・櫓は castle_plan.js に建てさせる（castles/odani.js の縄張り） ----
    flReset();
    const C = F.C = buildCastlePlan(rt, ODANI_PLAN, { ladders: true, baseHeight: baseTerrain, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    // 塀は壊させない・的にしない（攻め口は門だけ）。門は大手の物も開けておく（夜討ちの前に内から開けた・GAME_C）。
    // 京極丸の西の口だけは閉じていて、蜂須賀の手が塀を越えて内から開ける
    for (const s of C.walls) if (s && s.seg) { s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; }
    for (const [id, g] of Object.entries(C.gateObjs || {})) {
      if (!g || !g.struct) continue;
      g.struct.hp = g.struct.maxHp = 1e9; g.struct.noTarget = true;
      if (id !== 'g_west') { g.struct.opened = true; if (g.open) g.open(); }
    }
    F.westGate = C.gateObjs && C.gateObjs.g_west;
    F.K = makeNawabari(rt, C, { team: 1, friendTeam: 0, enemyTeam: 1 });
    // 画面の制圧の札（rt.nawabari）は渡さない：携帯の横で小地図と重なり、本丸の兵（塀の内の軽い作り）を数えられず
    // 「本丸 空き」と出てしまう。何をするかは任務の札と台詞で示す
    // 野面積みの石垣：山王丸（大きな石垣・HIST_A）と、本丸・大広間・京極丸の正面（HIST_B）。黒金御門の両脇
    {
      const side = (k, which, o = {}) => {
        const x0 = k.x - k.hw - 1.2, x1 = k.x + k.hw + 1.2;
        const pts = which === 's' ? [[x0 + 3, k.z1 + 1.2], [-3.4, k.z1 + 1.2]] : which === 's2' ? [[3.4, k.z1 + 1.2], [x1 - 3, k.z1 + 1.2]]
          : which === 'w' ? [[x0, k.z1 - 3], [x0, k.z0 + 3]] : [[x1, k.z0 + 3], [x1, k.z1 - 3]];
        rt.scene.add(ishigaki(W, pts, { top: 1.1, minH: o.h || 2.4, maxH: (o.h || 2.4) + 0.6, lean: 0.12 }));
      };
      for (const k of [SANNO, HON, OOHIROMA]) { side(k, 's'); side(k, 's2'); }
      side(SANNO, 'w', { h: 3 }); side(SANNO, 'e', { h: 3 });
      side(KYO, 's'); side(KYO, 's2'); side(KOM, 's'); side(KOM, 's2');
      side(SANNO2, 's'); side(SANNO2, 's2');
      rt.scene.add(ishigaki(W, [[-4.2, GATE_KURO.z + 3], [-9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
      rt.scene.add(ishigaki(W, [[4.2, GATE_KURO.z + 3], [9, GATE_KURO.z + 3]], { top: 1.1, minH: 2.4, maxH: 3 }));
    }
    // ---- 曲輪の中の建物 ----
    // 本丸：長政の御殿（天守は無い）。大広間：大きな建物。中丸・京極丸・小丸：陣屋と篝火
    goten(rt, HON.x - 2, HON.cz - 4, { team: 1, w: 12, d: 7, tile: false, name: '本丸の御殿' });
    goten(rt, KOM.x - 4.5, KOM.z0 + 4.5, { team: 1, w: 6.5, d: 4.5, tile: false, name: '小丸の館' });
    rt.scene.add(hut(W, OOHIROMA.x - 3, OOHIROMA.cz - 6, 16, 8, 0, { h: 3.6, wall: 0x6a5238 }), hut(W, OOHIROMA.x + 9, OOHIROMA.cz + 8, 6, 5, 0.1));
    // 京極丸はこの戦の主な戦場なので、真ん中は空け、建物は北東の隅に小さく
    rt.scene.add(hut(W, KYO.x + 9, KYO.z0 + 4, 5, 3.6, 0, { wall: 0x6a5238 }));
    rt.scene.add(hut(W, NAKAMARU.x - 4, NAKAMARU.cz, 6, 4, 0, { wall: 0x5e4a34 }));
    rt.scene.add(hut(W, SANNO.x + 4, SANNO.cz + 6, 8, 5, 0, { wall: 0x5e4a34 }), hut(W, SANNO2.x, SANNO2.cz - 2, 6, 4, 0, { wall: 0x6a5238 }));
    rt.scene.add(hut(W, SAKURABABA.x + 4, SAKURABABA.cz, 7, 5, -0.1), hut(W, ONMAYA.x + 4, ONMAYA.cz - 2, 6, 14, 0, { wall: 0x5a4a34 }), umatsunagi(W, ONMAYA.x - 4, ONMAYA.cz - 6, 0.1, 7));
    rt.scene.add(hut(W, OCHAYA.x, OCHAYA.cz, 6, 5, 0.1, { wall: 0x6a5238 }), hut(W, BANSHO.x + 3, BANSHO.cz, 4.5, 3.6, 0, { wall: 0x4a3a2a }));
    rt.scene.add(tawara(W, KYO.x + 11, KYO.z1 - 3, 0.3, 5), tawara(W, KOM.x + 5, KOM.cz + 3, -0.2, 5));
    { const w = new THREE.Mesh(new THREE.CircleGeometry(UMAARAI.r, 16), new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 }));
      w.rotation.x = -Math.PI / 2; w.position.set(UMAARAI.x, W.heightAt(UMAARAI.x, UMAARAI.z) + 0.03, UMAARAI.z); rt.scene.add(w); }   // 馬洗池
    // 浅井の旗：本丸と小丸に馬印（大将の居場所。長政・久政は建物の奥にいて、前には出ない）
    F.flagsKom = [];
    for (const [x, z, h] of [[HON.x - 9, HON.z1 - 4, 6], [HON.x + 6, HON.cz - 9, 7], [KOM.x - 6, KOM.cz, 6], [KOM.x + 6, KOM.z0 + 3, 7], [SANNO.x - 4, SANNO.cz, 6], [OOHIROMA.x - 10, OOHIROMA.cz, 6], [NAKAMARU.x + 6, NAKAMARU.cz, 5], [KYO.x - 12, KYO.z0 + 2, 6], [KYO.x - 12, KYO.z1 - 2, 6]]) {
      const n2 = nobori(W, x, z, 'azai', h); rt.scene.add(n2);
      if (z < KOM.z1 + 1 && z > KOM.z0 - 1) F.flagsKom.push(n2);
      if (z < KYO.z1 && z > KYO.z0) (F.flagsKyo = F.flagsKyo || []).push(n2);
    }
    for (const [x, z] of [[HON.x + 4, HON.z0 + 3], [KOM.x, KOM.z1 - 2], [KYO.x - 2, KYO.cz + 3], [NAKAMARU.x + 2, NAKAMARU.z1 - 2], [SANNO.x, SANNO.z1 - 4], [OOHIROMA.x - 4, OOHIROMA.z0 + 4]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 城に詰める浅井勢（軽い作り）：本丸の塀の内に外を向いて構える者、大広間・山王丸・中丸の兵 ----
    {
      const crew = [];
      for (let i = 0; i < 18; i++) {
        const t = i / 17, x = HON.x - HON.hw + 1.5 + t * (HON.hw * 2 - 3);
        crew.push({ x, z: HON.z1 - 1.5, k: ['gun', 'spear', 'bow', 'spear'][i % 4], facing: 0 });
        if (i % 3 === 0) crew.push({ x, z: HON.z0 + 1.5, k: ['gun', 'spear'][i % 2], facing: Math.PI });
      }
      const cr = W.addDistantArmy({ people: crew, armor: AZ_ARMOR, team: 1, flagTex: flagTexture('azai'), seed: 15737 });
      if (cr && cr.army) cr.army.noWake = true;   // 塀の内の者は本物に替えない（本丸から湧いて出てこない）
    }
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed, ...(team != null ? { team } : {}) });
    F.azHon = DA(OOHIROMA.x, OOHIROMA.cz, 22, 18, 150, 0, AZ_ARMOR, 'azai', 15736, 1);
    F.azSanno = DA(SANNO.x, SANNO.cz, 16, 14, 60, 0, AZ_ARMOR, 'azai', 15738, 1);
    for (const a of [F.azHon, F.azSanno]) if (a && a.army) a.army.noWake = true;
    // ---- 清水谷（主尾根の西の谷）：浅井の居館・家臣の屋敷・寺・倉・厩。谷底に道、両側に山、上に主尾根の城 ----
    {
      const db = makeSimpleBatch();
      // 居館：土塁で四方を囲み、谷の道へ向いて門（冠木門）。中に主屋と台所・蔵
      const kx = KYOKAN.x, kz = KYOKAN.z, hw = 13, hd = 10;
      const sides = [[kx - hw, kz - hd, kx + hw, kz - hd, 0, -1], [kx + hw, kz - hd, kx + hw, kz + hd, 1, 0], [kx + hw, kz + hd, kx - hw, kz + hd, 0, 1]];
      for (const [ax, az, bx, bz, nx, nz] of sides) { const d = dorui(W, [ax, az, bx, bz], nx, nz, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      for (const [az, bz] of [[kz - hd, kz - 3.4], [kz + 3.4, kz + hd]]) { const d = dorui(W, [kx - hw, az, kx - hw, bz], -1, 0, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      finalizeSimpleBatch(rt, db);
      rt.scene.add(kabukimon(W, kx - hw, kz, 6, Math.PI / 2));
      rt.scene.add(hut(W, kx - 2, kz - 3, 14, 7, 0, { h: 3.4, wall: 0x6a5238 }), hut(W, kx + 8, kz + 3, 5, 4, 0.1, { wall: 0x5e4a34 }), hut(W, kx - 9, kz + 4, 5, 4, -0.1, { wall: 0x5a4a34 }));
      // 寺（谷の口の寺。名は出さない＝GAME_C）
      rt.scene.add(dou(W, TERA.x, TERA.z, 9, 7, Math.PI / 2 + 0.2, { h: 3.4 }), hut(W, TERA.x + 2, TERA.z - 12, 6, 4, 0.2, { wall: 0x7a5a3c }));
      // 家臣の屋敷：道の両側に、塀（柵）の囲いと屋敷
      YASHIKI.forEach(([x, z, r], i) => {
        rt.scene.add(hut(W, x, z, 7 + (i % 3), 5, r, { wall: i % 2 ? 0x5e4a34 : 0x6a5238 }));
        if (i % 2 === 0) rt.scene.add(palisade(W, [x - 6, z + 5, x + 6, z + 5]));
      });
      rt.scene.add(umatsunagi(W, KYOKAN.x - 18, KYOKAN.z - 12, 1.4, 6), tawara(W, KYOKAN.x - 17, KYOKAN.z + 12, 0.4, 6));
      // 前の小競り合いで焼けた屋敷（GAME_C）
      for (const [x, z] of [[YASHIKI[3][0], YASHIKI[3][1]], [YASHIKI[5][0] + 2, YASHIKI[5][1]]]) { W.addFire(x, z, { h: 2 }); W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: 1.6 }); }
    }
    // ---- 周りの砦（遠景）：大嶽・金吾丸・福寿丸・山崎丸は織田が先に取った（朝倉の陣だった砦）。月所丸は浅井 ----
    for (const f of FORTS) {
      const n = 10, r = 8.5, pts = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]); }
      for (let i = 0; i < n; i++) if (i !== 0) rt.scene.add(palisade(W, [pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]));
      rt.scene.add(hut(W, f.x, f.z - 2, 6, 4, 0.2, { wall: 0x5a4a34 }), nobori(W, f.x + 3, f.z + 3, f.flag, 7), nobori(W, f.x - 4, f.z, f.flag, 6));
      W.addFire(f.x + 2, f.z + 5, { torch: true, h: 1.4 });
    }
    // ---- 小谷を囲む織田勢（軽い作り）：谷の口・東の谷・南の山麓。南には虎御前山の信長の本陣 ----
    DA(MOUTH.x - 10, MOUTH.z + 24, 34, 12, 220, Math.PI - 0.2, ODA_ARMOR, 'oda', 15731);
    DA(110, -30, 30, 14, 220, -Math.PI / 2, ODA_ARMOR, 'oda', 15732);
    DA(118, -110, 26, 12, 160, -Math.PI / 2, ODA_ARMOR, 'eiraku', 15733);
    DA(-40, 168, 40, 10, 240, Math.PI, ODA_ARMOR, 'eiraku', 15734);
    KIT.honjin(rt, 70, 160, { mon: 'oda', people: false, fire: true, yoroi: false });
    DA(70, 176, 30, 8, 160, Math.PI, ODA_ARMOR, 'oda', 15735);
    for (const [x, z, k] of [[MOUTH.x + 4, MOUTH.z - 2, 'oda'], [MOUTH.x - 6, MOUTH.z + 4, 'oda'], [62, 152, 'oda'], [78, 152, 'eiraku'], [100, -20, 'oda'], [100, -100, 'oda']]) rt.scene.add(nobori(W, x, z, k, 7));
    for (const [x, z] of [[MOUTH.x - 6, MOUTH.z + 10], [100, -40], [110, -96], [-20, 160]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { torch: true, h: 1.4 }); }
    // ---- 南の大手：織田の本隊が番所に取りついている（遠景の合戦。一段ずつ攻め上がる） ----
    F.front = 0;
    F.clash = clash(rt, { x: 0, z: BANSHO.z1 + 8, facing: Math.PI, w: 26, gap0: 0, seed: 15751, noRout: true, noWake: true,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 260, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 160, team: 1, faction: 'saito', bows: true } });
    // ---- 羽柴秀吉の手（自分の持ち場）と、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: MOUTH.x, z: MOUTH.z }, facing: Math.PI, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, ...HIDE } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '蜂須賀正勝の手', anchor: { x: MOUTH.x + 8, z: MOUTH.z + 4 }, facing: Math.PI, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.hide, F.hachi];
    for (const g of F.oda) { g.defMult = 1.35; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MOUTH.x + 4, z: MOUTH.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 清水谷の浅井勢：居館の番兵と、谷の奥の見張り ----
    F.yakata = enemyGroup(rt, { faction: 'saito', name: '居館の番兵', anchor: { x: KYOKAN.x - 21, z: KYOKAN.z + 2 }, facing: Math.PI / 2 + 0.6, width: 8, aggro: 16, morale: 75, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.62 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    F.watch = enemyGroup(rt, { faction: 'saito', name: '谷の奥の見張り', anchor: { x: HEAD.x - 4, z: HEAD.z + 12 }, facing: 0.4, width: 6, aggro: 14, morale: 70, fleeDir: { x: 0.6, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
    // ---- 京極丸の守り（西の口の門兵と、曲輪の中の守り） ----
    F.kyoGate = enemyGroup(rt, { faction: 'saito', name: '西の口の門兵', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: -Math.PI / 2, width: 6, aggro: 10, morale: 80, fleeDir: { x: 1, z: 0 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }], AZAI));
    F.kyo = enemyGroup(rt, { faction: 'saito', name: '京極丸の守り', anchor: { x: KC.x + 3, z: KC.z }, facing: -Math.PI / 2, width: 10, aggro: 9, morale: 95, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], AZAI));
    // ---- 区域の網：京極丸を取れば、尾根の鎖の上で本丸（長政）と小丸（久政）が切れる ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: C.kuruwa.hon.centroid, need: 10, hold: 20 },
        { id: 'nakamaru', name: '中丸', test: C.kuruwa.nakamaru.test, pos: C.kuruwa.nakamaru.centroid, need: 8, hold: 20 },
        { id: 'kyogoku', name: '京極丸', test: C.kuruwa.kyogoku.test, pos: C.kuruwa.kyogoku.centroid, need: 6, hold: 10 },
        { id: 'koma', name: '小丸', test: C.kuruwa.koma.test, pos: C.kuruwa.koma.centroid, need: 6, hold: 12 },
      ],
      links: [['hon', 'nakamaru'], ['nakamaru', 'kyogoku'], ['kyogoku', 'koma']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => { if (id === 'kyogoku' && F.step === 2) this.cut(rt); },
    });

    applyLook(rt, PREDAWN);
    rt.setPhase('brief');
    rt.obj('main', '秀吉のもとで、夜討ちの下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、ここは清水谷。浅井の館と屋敷の並ぶ谷じゃ。上の尾根に、小谷の曲輪が連なっておる`, 5);
    rt.say('羽柴秀吉', '大手は殿の本隊が番所から攻め上がる。我らは谷を登り、尾根の真ん中の京極丸を取る。長政殿と久政殿を切り離すのじゃ', 5.5);
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉（話を聞く）', {});
    rt.marker('kyoGoal', { x: KC.x, z: KC.z }, '京極丸', { h: 6 });
    rt.addInteract('talk', { x: MOUTH.x, z: MOUTH.z }, '秀吉の話を聞く', () => { rt.uninteract('talk'); rt.say('羽柴秀吉', '（小声で）よし、参るぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 6 });
    rt.after(13, () => this.climb(rt));
  },

  // ① 清水谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk'); rt.unmark('hide');
    rt.obj('main', hi(rt) ? '一隊を率いて清水谷を登れ' : '秀吉について清水谷を登れ', 'main');
    rt.say('羽柴秀吉', '（小声で）松明を消せ。……谷の館の番兵を払えば、あとは登るだけじゃ', 3.5);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(2, -2); H.pathIdx = 0; H.speed = 3; H.formation = 'column'; H.aggro = 12;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x - 4, z: BELOW.z - 2 }; g.formation = 'line'; g.aggro = 12; F.hideAt = rt.t; };
    const Hc = F.hachi;
    Hc.order = 'path'; Hc.path = CLIMB.slice(2, -2); Hc.pathIdx = 0; Hc.speed = 2.9; Hc.formation = 'column';
    Hc.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x - 8, z: BELOW.z + 6 }; };
    rt.after(30, () => { if (F.step <= 2) { rt.bark('南の大手で鬨の声：織田の本隊が番所に取りついた'); sfx('far', 0.6); } });
  },

  // ② 京極丸を取る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('kyogoku');
    rt.unmark('watch'); rt.unmark('yakata'); rt.unmark('kyoGoal');
    if (!gone(F.watch)) F.watch.morale = Math.min(F.watch.morale, 15);
    sfx('horagai', 0.9);
    rt.banner('京極丸へ', '尾根の真ん中の曲輪に攻め入る');
    nextObj(rt, '京極丸に攻め入り、守りを退けよ');
    rt.say('羽柴秀吉', 'かかれ！　京極丸を取れ！', 2.5);
    for (const g of F.oda) { g.order = 'attack'; g.seekRange = 40; g.formation = 'line'; g.anchor = { x: KC.x, z: KC.z }; }
    F.kyoGate.order = 'attack'; F.kyoGate.seekRange = 24;
    F.kyo.seekRange = 22;
    rt.marker('kyo', centerOf(F.kyoGate), () => `西の口の門兵・${moraleWord(F.kyoGate.morale)}`, { red: true, group: F.kyoGate });
    // 閉じた西の口は、蜂須賀の手が塀を越えて内から開ける
    rt.after(22, () => {
      const g = F.westGate;
      if (g && g.struct && !g.struct.opened) { g.struct.opened = true; if (g.open) g.open(); }
      rt.bark('蜂須賀の手が塀を越え、西の口を内から開けた');
    });
    // 中丸から京極丸へ加勢が駆けつける
    rt.after(26, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '中丸からの加勢', anchor: { x: GATE_NAKA_KYO.x, z: GATE_NAKA_KYO.z + 4 }, facing: Math.PI, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 1 }], AZAI));
      F.kyoAid = g;
      KIT.backOf(rt, g, { flag: 'azai', armor: AZ_ARMOR, kind: 'spear', w: 10, depth: 6, count: 50, seed: 15742 });
      rt.army.play('eshout', { x: 0, z: GATE_NAKA_KYO.z }, 1.5);
      rt.say('羽柴秀吉', '南の中丸から加勢が来た！　門の口で止めよ！', 3.5);
      rt.marker('kyoAid', centerOf(g), () => `中丸からの加勢・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // ③ 分断：京極丸を取り、本丸と小丸が切れる
  cut(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cut');
    rt.unmark('kyo'); rt.unmark('kyoAid');
    for (const q of [F.kyo, F.kyoGate, F.kyoAid]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (!late) rt.award((t) => t.side.push('京極丸を取った'), '京極丸を取った');
    rt.objDone('main');
    rt.after(2.5, () => { if (rt.flags.step === 3) rt.objRemove('main'); });
    sfx('kane', 0.6);
    rt.banner('浅井軍、二つに切れる', '南の本丸に長政、北の小丸に久政。もう互いに助けに行けない');
    // 京極丸の浅井の旗を倒し、夜が明けてくる
    (F.flagsKyo || []).forEach((n2, i) => rt.after(0.6 + i * 0.5, () => { n2.rotation.z = 1.3; }));
    applyLook(rt, DAWN);
    // 二つに切れた城を見せる（南の本丸・北の小丸に印を少しの間）
    rt.marker('cutHon', { x: HONC.x, z: HONC.z }, '本丸（浅井長政）', { red: true, h: 6 });
    rt.marker('cutKom', { x: KOMC.x, z: KOMC.z }, '小丸（浅井久政）', { red: true, h: 6 });
    rt.after(12, () => { rt.unmark('cutHon'); rt.unmark('cutKom'); });
    if (!rt.player.lock) rt.player.cine = { x: HONC.x, z: HONC.z, t: 2.4 };
    rt.say('羽柴秀吉', 'よし！　これで長政殿の本丸と、久政殿の小丸は切れた。……じゃが、両方から取り返しに来るぞ！', 4.5);
    rt.after(5, () => { if (!F.ending) rt.say('竹中重治', '本丸との間には大堀切。中丸の門から来る道は細い。そこで受ければ数は関わりませぬ', 4); });
    // 南の大手：織田の本隊が番所・御茶屋を抜き、御馬屋・桜馬場へ攻め上がる
    this.advanceFront(rt, 1);
    // 京極丸の南の門に鉄砲を並べる
    { const c = F.hide.center();
      F.gunH = allyGroup(rt, { name: '羽柴の鉄砲衆', anchor: { x: c.x, z: c.z }, facing: 0, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 5 }], ODA));
      F.gunH.order = 'move'; F.gunH.dest = { x: 3, z: KYO.z1 - 3 }; F.gunH.speed = 2.6; F.gunH.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 3, z: KYO.z1 - 3 }; gg.facing = 0; gg.aggro = 4; }; }
    const ctx = { faction: 'saito', flag: 'azai', armor: AZ_ARMOR, dmg: 0.55, mass: 90, scale: 1.4, look: (l) => dress(l, AZAI),
      friends: () => [F.hide, F.hachi, F.gunH, F.aid].filter((g) => g && g.count && !g.routed) };
    depthStart(rt, ctx, odSteps(), () => this.komaFall(rt));
  },

  // 南の大手の合戦を一段進める（番所→御茶屋・御馬屋→桜馬場・黒金御門）。遠景の戦だけで、本物の兵は出さない
  advanceFront(rt, k) {
    const F = rt.flags;
    if (k <= F.front) return;
    F.front = k;
    const at = [BANSHO.z1 + 8, ONMAYA.z1 + 6, GATE_KURO.z + 6][k];
    const say = ['', '大手の織田勢、番所と御茶屋を抜き、御馬屋へ攻め上がっておりまする', '大手の織田勢、桜馬場を越えて黒金御門に取りつきました'][k];
    if (F.clash) F.clash.rout('B', { from: 0, hideAfter: 10 });
    F.clash = clash(rt, { x: 0, z: at, facing: Math.PI, w: 24, gap0: 12, seed: 15751 + k, noRout: true, noWake: true,
      A: { flag: k === 2 ? 'eiraku' : 'oda', armor: ODA_ARMOR, count: 240, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 150, team: 1, faction: 'saito', guns: k === 2 } });
    rt.after(2, () => { if (F.clash) F.clash.go(); });
    rt.after(4, () => { if (!F.ending) { rt.say('使番', say, 3.5); sfx('far', 0.7); } });
  },

  // ④ 小丸、落ちる（久政の最期）→ お市の方の供へ
  komaFall(rt) {
    const F = rt.flags;
    if (F.komaDown) return;
    F.komaDown = true;
    sfx('kane', 0.5);
    rt.banner('小丸、落ちる', '浅井久政は小丸の館で腹を切った');
    rt.world.addSmokeColumn(KOM.x, rt.world.heightAt(KOM.x, KOM.cz) + 4, KOM.cz, { size: 2.8 });
    rt.world.addFire(KOM.x - 4, KOM.z0 + 6, { h: 1.6 });
    F.flagsKom.forEach((n2, i) => rt.after(1 + i * 0.8, () => { n2.rotation.z = 1.3; n2.position.y += 0.1; }));
    if (F.azSanno && F.azSanno.rout) rt.after(3, () => F.azSanno.rout());
    // 一息つく（手負いを手当てする）
    { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * 0.8); }
    rt.say('羽柴秀吉', '……久政殿、ご自害。山王丸の兵も退いていく。残るは、大堀切の向こうの本丸だけじゃ', 5);
    this.advanceFront(rt, 2);
    rt.after(7, () => this.escort(rt));
  },

  // ⑤ お市の方の一行を供する
  escort(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('escort');
    rt.world.setTime('morning');
    rt.say('羽柴秀吉', '……本丸から、大堀切の土橋を渡って一行が来た。長政殿が、お市様と三人の姫君を、織田へお返しなさると', 5);
    rt.say('羽柴秀吉', `${nm(rt)}、一行の供をせよ。清水谷の我らの陣まで、誰にも指一本触れさせるな`, 4);
    rt.objRemove('dp');
    rt.obj('main', 'お市の方の一行を、谷の陣まで供せよ', 'main');
    // 一行（戦わない。狙われない）。お市の方と姫は塗輿に乗り、担ぎ手と侍女が囲む
    const g = allyGroup(rt, { name: 'お市の方の一行', anchor: { x: 0, z: NAKAMARU.cz }, facing: Math.PI, width: 4, aggro: 0, noRout: true, formation: 'column', speed: 2.6 },
      [{ type: 'samurai', n: 1, o: { name: '藤掛永勝', flag: null, hat: 'none' } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x6a3a4a, lace: 0xb8a070, cloth: 0x8a3a4a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x3a4a6a, lace: 0xb8a070, cloth: 0x4a5a8a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x4a4034, cloth: 0x5a4a3c } }]);
    F.escKoshi = koshi(rt.world, 0, NAKAMARU.cz, Math.PI, { moving: true });
    rt.scene.add(F.escKoshi);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    g.order = 'path'; g.path = ESCORT.slice(); g.pathIdx = 0;
    g.onArrive = () => this.win(rt);
    F.esc = g;
    rt.marker('esc', centerOf(g), 'お市の方の一行', {});
    rt.zone('camp', ODA_POST.x, ODA_POST.z, 7);
    // 羽柴の手は京極丸を守ったまま。谷に羽柴の陣（行き先）
    rt.scene.add(nobori(rt.world, ODA_POST.x - 4, ODA_POST.z + 3, 'oda', 6), nobori(rt.world, ODA_POST.x + 4, ODA_POST.z + 3, 'oda', 6));
    rt.after(3, () => rt.say('藤掛永勝', '織田の方々、お市様と姫君がたを、しかとお頼み申す', 4));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('esc'); rt.unzone('camp'); rt.unmark('ochi');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を取り、お市の方の一行を供した', pts: 20 }; }, '任務達成・お市の方を織田の陣へ');
    sfx('horagai', 0.5);
    rt.banner('小谷城、落ちる', '数日のち九月一日――織田勢は大広間から本丸へ攻め入り、浅井長政は自害した');
    rt.say('羽柴秀吉', '……長政殿は、よい大将じゃった。お市様と姫君は、殿がお預かりなさる', 5);
    rt.after(6, () => rt.say('', '――浅井の旧領、北近江の多くは秀吉に与えられた。秀吉はのちに今浜を長浜と改め、城を築く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    KIT.backTick(rt);
    guardRecover(rt, F.hideU, dt, { line: ['羽柴秀吉', '……退くぞ。手傷じゃ、しばし堪えよ'], backLine: ['羽柴秀吉', 'もう良い、前へ出る'] });
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - BELOW.x, p.z - BELOW.z);
      rt.objProgress('main', `京極丸の下まで ${Math.max(0, Math.round(d))}m`);
      const hc = F.hide.center();
      const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r || Math.hypot(hc.x - q.x, hc.z - q.z) < r - 4;
      const yk = { x: KYOKAN.x - 21, z: KYOKAN.z + 2 };
      if (!F.yakataOn && near(yk, 34)) { F.yakataOn = true; F.yakata.order = 'attack'; F.yakata.seekRange = 34; rt.army.play('eshout', yk, 1.2); rt.say('浅井の番兵', '谷に人がおるぞ！　織田じゃ、館を守れ！', 2.5); rt.marker('yakata', centerOf(F.yakata), () => `居館の番兵・${moraleWord(F.yakata.morale)}`, { red: true, group: F.yakata }); }
      if (F.yakataOn && !gone(F.yakata) && F.hide.order === 'path' && Math.hypot(hc.x - yk.x, hc.z - yk.z) < 26) { F.hidePause = true; F.hide.order = 'attack'; F.hide.seekRange = 30; }
      if (F.hidePause && gone(F.yakata)) { F.hidePause = false; F.hide.order = 'path'; rt.unmark('yakata'); rt.say('羽柴秀吉', '館の番兵は退いた。急げ、夜が明ける前に登りきるぞ', 3); }
      const wt = { x: HEAD.x - 4, z: HEAD.z + 12 };
      if (!F.watchOn && near(wt, 30)) { F.watchOn = true; F.watch.order = 'attack'; F.watch.seekRange = 30; rt.say('浅井の見張り', '谷の奥まで来ておる！　京極丸へ知らせよ！', 2.5); rt.marker('watch', centerOf(F.watch), () => `谷の奥の見張り・${moraleWord(F.watch.morale)}`, { red: true, group: F.watch }); }
      if ((d < 16 && gone(F.watch)) || (F.hideAt && rt.t - F.hideAt > 35) || rt.t - F.stepT > 160) this.assault(rt);
    }
    if (F.step === 2) {
      const qs = [F.kyoGate, F.kyo, F.kyoAid].filter(Boolean);
      const left = qs.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0);
      rt.objProgress('main', `守り ${left}人`);
      for (const q of qs) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 15);
      // 門兵が崩れたら、曲輪の中の守りへ印を移す
      if (gone(F.kyoGate) && !F.kyoMark && !gone(F.kyo)) { F.kyoMark = true; rt.marker('kyo', centerOf(F.kyo), () => `京極丸の守り・${moraleWord(F.kyo.morale)}`, { red: true, group: F.kyo }); F.kyo.order = 'attack'; F.kyo.seekRange = 30; }
      if (rt.t - F.stepT > 22 && qs.every(gone)) this.cut(rt);
      else if (rt.t - F.stepT > 140) this.cut(rt, true);
    }
    if (F.step === 3) depthTick(rt, dt);
    if (F.step === 4) this.escortTick(rt, dt, p);
  },

  escortTick(rt, dt, p) {
    const F = rt.flags;
    const c = F.esc.center();
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    const nx = ESCORT[Math.min(F.esc.pathIdx || 0, ESCORT.length - 1)];
    const ahead = (p.x - c.x) * (nx[0] - c.x) + (p.z - c.z) * (nx[1] - c.z) > 0;
    if (d > 18 && !ahead && F.esc.order === 'path' && !F.escGo) { F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z }; F.escWaitT = rt.t; rt.bark('一行が待っている。そばを離れるな'); }
    else if ((d < 10 || ahead) && F.esc.order === 'hold' && (!F.ochiOn || F.ochiOn === 'done')) F.esc.order = 'path';
    if (F.esc.order === 'hold' && F.escWaitT != null && (!F.ochiOn || F.ochiOn === 'done')) {
      const w = rt.t - F.escWaitT;
      if (w > 18 && !F.escCall) { F.escCall = true; rt.say('藤掛永勝', `${nm(rt)}殿、こちらでござる！　輿の印の方へお越しくだされ`, 3.5); }
      if (w > 36) { F.escGo = true; F.esc.order = 'path'; rt.say('藤掛永勝', '……先に参りまする。どうか後からお追いくだされ', 3); }
    }
    if (F.escKoshi) { F.escKoshi.position.set(c.x, rt.world.heightAt(c.x, c.z) + 0.3, c.z); const q = F.esc.units.find((u) => u.alive); if (q) F.escKoshi.rotation.y = q.heading || 0; }
    // 中丸を出る所：大堀切の向こうの本丸から、長政が見送る
    if (!F.escSay && (F.esc.pathIdx || 0) >= 1) {
      F.escSay = true;
      rt.say('浅井の侍', '……お市様じゃ。道を開けよ。誰も手を出すな', 3);
      rt.after(4, () => { if (!F.ending) rt.say('足軽', '大堀切の向こう、本丸の塀の上に人影が……長政殿が見送っておられる', 3.5); });
      rt.after(9, () => { if (!F.ending) { sfx('kane', 0.4); rt.say('藤掛永勝', '振り返りますな、姫君。……前だけを', 3); } });
    }
    // 谷へ下りた所で、落ち武者の小勢が一度寄ってくる
    if (!F.ochiOn && (F.esc.pathIdx || 0) >= 5) {
      F.ochiOn = true;
      F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z };
      F.ochi = enemyGroup(rt, { faction: 'saito', name: '落ち武者', anchor: { x: c.x - 22, z: c.z + 10 }, facing: Math.PI / 2, order: 'attack', seekRange: 40, aggro: 12, width: 8, morale: 60, fleeDir: { x: -1, z: 0 }, dmgMult: 0.5 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
      rt.say('足軽', '屋敷の陰から落ち武者じゃ！　一行を守れ！', 3);
      rt.choose('屋敷の陰から落ち武者が出た。一行をどうする？', [
        { label: '一行を止め、落ち武者を追い払ってから進む', note: '一行は安心。陣に着くのは遅れる' },
        { label: '一行を先へ急がせ、組の者と後ろを守る', note: '早く陣に着ける。落ち武者を一人で引き受ける' },
      ], (i) => {
        if (i !== 1) return;
        F.ochiOn = 'done'; F.ochiRear = true; F.esc.order = 'path';
        rt.say('藤掛永勝', '承知！　お市様、急ぎまするぞ', 3);
      }, 12);
      rt.marker('ochi', centerOf(F.ochi), () => `落ち武者・${moraleWord(F.ochi.morale)}`, { red: true, group: F.ochi });
    }
    if (F.ochiRear && F.ochi && gone(F.ochi)) { F.ochiRear = false; rt.unmark('ochi'); rt.award((t) => t.side.push('一行を止めずに落ち武者を退けた'), '一行を止めずに落ち武者を退けた'); }
    if (F.ochi && gone(F.ochi) && F.ochiOn !== 'done') { F.ochiOn = 'done'; rt.unmark('ochi'); F.esc.order = 'path'; rt.say('藤掛永勝', 'かたじけない。……参りましょう', 2.5); }
    if (F.ochi && F.ochi.count && F.ochi.count < 4) F.ochi.morale = Math.min(F.ochi.morale, 15);
    rt.objProgress('main', `陣まで ${Math.round(Math.hypot(c.x - ODA_POST.x, c.z - ODA_POST.z))}m`);
    if (rt.t - F.stepT > 120) this.win(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、浅井 五千ほど。数には諸説ある）
odani.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 5000 - (F.ek || 0) * 40 - (F.komaDown ? 900 : 0)), b0: 5000 };
};
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
odani.rts = true;
// 総大将（taisho.js）：長政は本丸の御殿の奥。討ち取りの流れはこの定義が持つ（最期は史実の文で）。
// 味方の殿（信長）は虎御前山の遠くの本陣なので、ここには置かない（殿を狙う一隊も来ない）
odani.taisho = { a: null, b: { name: '浅井長政', def: true } };
odani.noTaishoRaid = true;
// 味方の軽い兵は本物に替えにくく（本物の兵が増えすぎない。京極丸は狭い）
odani.wakeAllyNear = 0.25;
odani.wakeFoeNear = 0.5;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous）。長政・久政は前線に出さない
odani.famous = [
  { name: '竹中重治', team: 0, g: /鉄砲衆/, line: '竹中半兵衛じゃ。京極丸を取れば、本丸と小丸は切れる' },
  { name: '赤尾清綱', g: /赤尾/, near: true, line: '浅井の赤尾清綱なり！　京極丸、返してもらうぞ！' },
];
odani.date = (rt) => `天正元年八月　秋・${rt.flags.step >= 3 ? '夜明け' : '未明'}`;
odani.canSkip = (rt) => {
  const F = rt.flags;
  if (rt.phase === 'brief' && rt.t > 3) return '登りの下知まで待つ';
  if (rt.phase === 'climb' && F.watchOn && gone(F.watch)) return '京極丸の下まで登る';
  if (rt.phase === 'escort' && F.ochiOn === 'done') return '谷の陣まで供をする';
  return '';
};
odani.skip = (rt) => {
  const F = rt.flags;
  const put = (units, x, z) => { for (const u of units) if (u.alive) { u.pos.x = x + (Math.random() - 0.5) * 4; u.pos.z = z + (Math.random() - 0.5) * 4; } };
  if (rt.phase === 'climb') { put([rt.player.u, ...rt.squad, ...F.hide.units], BELOW.x, BELOW.z); return; }
  if (rt.phase === 'escort') { put([rt.player.u, ...rt.squad, ...F.esc.units], ODA_POST.x + 3, ODA_POST.z - 6); F.esc.pathIdx = ESCORT.length - 1; return; }
  for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2);
};
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉義景を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた大きな山城だった。番所・御茶屋・御馬屋・桜馬場・大広間・本丸・中丸・京極丸・小丸・山王丸が並び、本丸の北は大堀切で断たれていた。西の清水谷には浅井氏の居館や家臣の屋敷が並んでいた。南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返した。九月一日、本丸の下の赤尾屋敷で自害したと伝わる（日付・場所には異説がある）。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。秀吉が攻め上った道（清水谷からとも）や、一行を送った者の名には諸説がある。兵の数にも諸説ある。';
// 信長で遊ぶ時：居場所の目安と立つ所（清水谷の口の羽柴の手のそば）
odani.lordAt = { x: MOUTH.x, z: MOUTH.z, r: 16, why: '清水谷の口（羽柴の手が京極丸へ攻め上る支度をしている）' };
odani.lordSpawn = { x: MOUTH.x + 6, z: MOUTH.z + 10, heading: Math.PI - 0.2 };

// 素直な遊び手：秀吉について清水谷を登り、京極丸で戦い、段を戦い、お市の方の一行のそばを歩く
odani.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.step === 3 && F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest && F.step < 4) { inp.guardHold = false; const c = F.hide.center(); goTo(p, inp, c.x + 3, c.z + 3, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget);
  if (e && F.step < 4) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.8;
    return;
  }
  inp.guardHold = false;
  if (F.step <= 1) {
    if (F.step === 0) { const a = F.hideU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3); return; }
    b.botWp = b.botWp || 2;
    const w = CLIMB[Math.min(b.botWp, CLIMB.length - 3)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 4 && b.botWp < CLIMB.length - 3) b.botWp++;
    goTo(p, inp, w[0], w[1], 2);
    return;
  }
  if (F.step === 2) {
    // 西の口の外にいる間は、口の前へ回ってから入る
    if (u.pos.x < GATE_WEST.x - 1) { if (Math.abs(u.pos.z - GATE_WEST.z) > 2.5 || u.pos.x < GATE_WEST.x - 12) { goTo(p, inp, GATE_WEST.x - 5, GATE_WEST.z, 1.5); return; } goTo(p, inp, GATE_WEST.x + 5, GATE_WEST.z, 1); return; }
    const q = [F.kyoGate, F.kyo, F.kyoAid].find((x) => x && !gone(x));
    const t = q ? q.center() : KC;
    goTo(p, inp, t.x, t.z, 2);
    return;
  }
  if (F.step === 3) { goTo(p, inp, KC.x, KC.z, 3); return; }
  if (F.step === 4 && F.esc) { const c = F.esc.center(); goTo(p, inp, c.x + 2, c.z + 2, 3); }
};

// ---- 京極丸を取った後の段（分断の後の寄せ→判断→小丸へ攻め上がる） ----
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
function odSteps() {
  const N = { x: 0, z: GATE_NAKA_KYO.z + 2 }, Kn = { x: 0, z: GATE_KYO_KOMA.z - 3 };
  return [
    hold({ at: { x: KC.x, z: KC.z }, dur: 55, r: 15, title: '南北からの寄せ', sub: '本丸の長政と、小丸の久政が、京極丸を取り返しに来る', label: '京極丸', obj: '京極丸を守れ（南と北から寄せてくる）',
      waves: [
        { t: 5, say: ['足軽', '南の中丸の門から来た！　長政殿の兵じゃ！'], foes: () => [{ name: '長政の手（中丸から）', from: { x: 0, z: NAKAMARU.cz }, list: [uS(2), uA(8), uB(1)], mass: 120, noRout: 15 }] },
        { t: 22, say: ['足軽', '北の小丸からもじゃ！　背を合わせよ！'], foes: () => [{ name: '久政の手（小丸から）', from: { x: 0, z: KOM.cz }, list: [uS(1), uA(7), uG(1)], mass: 100 }] },
        { t: 38, say: ['羽柴秀吉', '本丸の老臣が自ら来たぞ！　門の口で受けよ！'], foes: () => [{ name: '赤尾の手', from: { x: 0, z: NAKAMARU.cz }, list: [uS(2), uA(7)], mass: 110 }] },
      ],
      reward: '京極丸で南北の寄せを受け止めた', lost: ['羽柴秀吉', '押された……じゃが、京極丸はまだ我らのものじゃ！'] }),
    rest({ dur: 6, heal: 0.3, say: [['羽柴秀吉', '退いたな。……小丸の久政殿は、もう本丸から助けが来ぬ'], ['羽柴秀吉', '今のうちに小丸へ攻め上がる。久政殿を追い詰めれば、浅井は崩れる']] }),
    pick({ title: '小丸へ、どこから攻め上がる？',
      options: [{ label: '門から真っすぐ押し上がる', note: '組と一緒に進める。正面の守りは厚い' }, { label: '西の崖の腰曲輪から回り込む', note: '守りの横を突ける。崖の上で数は少ない' }],
      on: (rt, m, i) => {
        m.side = i === 1; rt.say('羽柴秀吉', i === 1 ? 'よし、崖から回れ！　門の守りの横を突け！' : '門を押せ！　小丸へ攻め上がれ！', 3);
        // 清水谷から羽柴の後詰が登ってきて、京極丸の手に加わる（後ろの絵の兵は付けない）
        const F = rt.flags;
        if (!F.aid) {
          F.aid = allyGroup(rt, { name: '羽柴の後詰', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: Math.PI, width: 10, aggro: 12, noRout: true, dmgMult: 0.9 },
            dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
          F.aid.defMult = 1.3;
          rt.bark('清水谷から羽柴の後詰が登ってきた');
        }
      } }),
    fight({ at: (rt, m) => (m.side ? { x: -6, z: KOM.z1 + 2 } : Kn), title: '小丸へ', sub: '狭く高い、久政の曲輪へ攻め上がる', obj: '小丸へ攻め上がり、守りを崩せ',
      foes: (rt, m) => [{ name: '小丸の守り', from: { x: 0, z: KOM.cz }, list: [uS(m.side ? 1 : 2), uA(m.side ? 6 : 8), uB(2)], mass: 110, noRout: m.side ? 6 : 12, morale: m.side ? 70 : 85 }],
      later: [{ t: 34, title: '山王丸から', sub: '北の詰の城から、小丸を救いに下りてくる', say: ['足軽', '山王丸から兵が下りてくる！'], foes: () => [{ name: '山王丸の兵', from: { x: 0, z: SANNO.z1 - 4 }, list: [uS(1), uA(6), uG(1)], mass: 100 }] }],
      max: 110, reward: (t, m) => { t.special = { label: m.side ? '崖から回り込み、小丸の守りを崩した' : '小丸へ攻め上がり、守りを崩した', pts: 20 }; }, rewardLabel: '小丸の守りを崩した' }),
  ];
}

export { odani };
