import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　稲葉山城の戦い（永禄十年八月）
// 美濃三人衆が織田方につき、信長はすぐに兵を出して稲葉山城（金華山）を囲んだ。
// 足軽は木下藤吉郎の手。①夜明け、城下の井口の町に火を放つ ②大手口から打って出た斎藤勢を退ける
// ③藤吉郎について、山の裏の道（搦手）を登り、木戸の守りを破る ④本丸の脇に火を放って、大手の味方へ合図を送る
// 放火の日と翌日以後の囲みを分け、八月十五日の開城は後日談で描く
// 向き：北（-z）が金華山と本丸。南（+z）が井口の町。東（+x）の瑞龍寺山に信長の本陣。西の外を長良川が流れる
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, kabukimon, yagura, tawara, campfire, palisade, village, ishigaki, sakamogi, kagaribi, dorui, dobei, kuruwaBldg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch, solidSeg, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { stoneTex, barkTex } from './nature.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { reduceMotion } from './settings.js';
import { sightPoint } from './battle_sight.js';
import { makeTownWay } from './inabayama_town_way.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, wallLine } from './bhelp.js';
import { camp } from './b_mid.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { pressureTick } from './battle_pressure.js';
import { demDetail } from './dem.js';
import { yamaLift } from './yamalift.js';
import { distToPolyline } from './world.js';

// 実測地形（国土地理院 標高タイル下ごしらえ）：金華山の本当の尾根・谷の形に混ぜる（城の部品の位置はそのまま）。
// いつも使う（quality-upgrade-plan 束2。DEM_ON の分かれはやめた）。最初の画面を軽くするため遅れて読む（他の戦と同じやり方）
let DEM = null;
import('./asset_dem_inabayama.js').then((m) => { DEM = m.default; }).catch(() => {});
import { reset as flReset, addRamp } from './floors.js';
import { monomi, goten, horiboriHeight } from './castle_parts.js';
import { heightOf, inPoly, buildCastlePlan, garrisonKuruwa, makeLordKeep } from './castle_plan.js';
import { makeRockTraps } from './siege_rocks.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance } from './taketaba.js';
import { makeButai, adoptGroup, butaiTick, lightClash } from './butai.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeNawabari } from './nawabari.js';
import { makeDefenseAI } from './siege_ai.js';
import { HON, NI, TSUKE, OTE, ROAD, KARA, TOWER, INABAYAMA_PLAN as INABAYAMA_BASE_PLAN, HYAKU, FUNA, HON_GATE_OUT, IRI, NAKA, NIMON, LAYERS, INABAYAMA_HIST, MATSU, DEMARU, UMAYA, YAKATA, NI_ROAD, TOP_ROAD, CASTLE_PATHS } from './castles/inabayama.js';


// 曲輪と物見の位置は保ち、下の急坂だけを西へ折り返す。この戦だけの道。
const KARA_LEGS = [
  [KARA[0], [-68, -34], [-26, -46], KARA[1]],
  [KARA[1], [-92, -64], [-51, -77], KARA[2]],
  [KARA[2], [-88, -110], KARA[3]],
  [KARA[3], [-48, -136], KARA[4]], [KARA[4], KARA[5]],
];
const KARA_TRAIL = KARA_LEGS.flatMap((p, i) => i ? p.slice(1) : p);
const INABA_PATHS = CASTLE_PATHS.map((p) => p === KARA ? KARA_TRAIL : p);
// 新しい折れが腰曲輪の柵を横切る口も、この戦の縄張りだけに足す。
const INABAYAMA_PLAN = { ...INABAYAMA_BASE_PLAN, paths: INABA_PATHS.map((pts) => ({ pts })),
  kuruwa: INABAYAMA_BASE_PLAN.kuruwa.map((k) => {
    const gaps = (k.gapAt || []).map((p) => { const q = [...p]; q.edge = p.edge; return q; });
    for (let j = 1; j < KARA_TRAIL.length; j++) {
      const a = KARA_TRAIL[j - 1], b = KARA_TRAIL[j], dx = b[0] - a[0], dz = b[1] - a[1];
      for (let i = 0; i < k.poly.length; i++) {
        const c = k.poly[i], e = k.poly[(i + 1) % k.poly.length], ex = e[0] - c[0], ez = e[1] - c[1], cross = dx * ez - dz * ex;
        if (Math.abs(cross) < 0.00001) continue;
        const qx = c[0] - a[0], qz = c[1] - a[1], t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = a[0] + dx * t, z = a[1] + dz * t;
        const near = gaps.find((p) => p.edge === i && Math.hypot(p[0] - x, p[1] - z) < 6);
        if (near) { near[0] = (near[0] + x) / 2; near[1] = (near[1] + z) / 2; }
        else { const mouth = [x, z]; mouth.edge = i; gaps.push(mouth); }
      }
    }
    return { ...k, gapAt: gaps.length ? gaps : null };
  }),
};
let KARA_GRADES = [];
// 戻り値と区間は使い回す。道の左右を水平にし、横向きの貼り付きも防ぐ。
const KARA_SAMPLE = { y: 0, d: Infinity, grade: 0, dx: 0, dz: 0 };
function karaSample(x, z) {
  const out = KARA_SAMPLE; out.d = Infinity;
  for (const q of KARA_GRADES) {
    if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < out.d) { out.d = d; out.y = q.ya + (q.yb - q.ya) * t; out.grade = (q.yb - q.ya) / q.len; out.dx = q.dx / q.len; out.dz = q.dz / q.len; }
  }
  return out;
}

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：藤吉郎の手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ZUI = { x: 112, z: -30 };           // 瑞龍寺山（信長の本陣）
// 竹束の置き場（搦手の登り口。抱えて登れば、落石・矢を前から 7 割防ぐ。castle-design 7-3）
const TABA_PILE = { x: KARA[0][0] - 3, z: KARA[0][1] + 1 };

// ---------------- 軍議の三つの作戦（七曲り・百曲り・水の手）と、部隊の道 ----------------
// 各手は山道と門の口を通る。足軽一人が入るまで全軍を止める扱いはしない。
const HON_IN = [[HON_GATE_OUT.x, HON_GATE_OUT.z], [KARA[5][0], KARA[5][1]]];
const R_NANA = [...ROAD.slice(4, -2), [OTE.x, OTE.z, 'ote'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
const R_HYAKU = [...HYAKU.slice(0, 5), [24, -94, 'hon'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
// 腰曲輪の既存の出口を抜けてから二の丸へ。喰違いの柵を横切らない。
const R_MIZU = [...KARA_TRAIL.slice(0, KARA_TRAIL.indexOf(KARA[3]) + 1), [NI.x, NI.z, 'ni'], KARA[4], ...HON_IN];
export const STRATS = {
  nanamagari: { name: '七曲り（大手）から攻め上る', short: '七曲り' },
  hyakumagari: { name: '百曲りから本丸の脇を突く', short: '百曲り' },
  mizunote: { name: '水の手（搦手）へ大勢を回す', short: '水の手' },
};
function setRoute(b, pts, F) { b._route = pts; b._i = 0; b._wait = null; b._legT = 0; advance(b, F); }
function advance(b, F) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: 'attack' }); b._route = null; b._wait = null; b._done = true; return; }
  const p = b._route[b._i];
  b._i++; b._wait = null; b._legT = 0;
  b.order({ id: 'move', to: { x: p[0], z: p[1] } });
}
function tickRoutes(list, F, dt) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    b._legT += dt;
    // 道に詰まっても、時間だけで次の折れへ飛ばさない。
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 4) advance(b, F);
  }
}
// 軽い大軍どうしの押し合い（butai.js の lightClash）。減った数だけ、軽い大軍の兵も隠す（名目＝本物＋軽い を崩さない）
function clash(a, d, dt, k) {
  const la = a.lost, ld = d.lost;
  lightClash(a, d, dt, k);
  for (const [b, l0] of [[a, la], [d, ld]]) {
    b._cl = (b._cl || 0) + (b.lost - l0);
    if (b._cl >= 1 && b.light) { const n = Math.floor(b._cl); b._cl -= n; b.light.take(b.pos.x, b.pos.z, n); }
  }
}
// 持ち運ぶ竹束の見た目（b_nodafukushima.js と同じ軽い作り。props.js の takataba は当たりを置きっぱなしにするので、
// 動かす物には使わない）
const TAKE_MAT = { cane: new THREE.MeshStandardMaterial({ color: 0x6f7a44, roughness: 0.8 }), rope: new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 1 }) };
function tabaMesh(W, x, z, rot = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.2, 6), TAKE_MAT.cane);
    c.position.set(-0.8 + i * 0.16, 1.1, (i % 2) * 0.1);
    c.castShadow = true;
    g.add(c);
  }
  for (const y of [0.5, 1.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.26), TAKE_MAT.rope); r.position.y = y; g.add(r); }
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), TAKE_MAT.rope);
  s.position.set(0, 0.8, 0.55); s.rotation.x = -0.6; g.add(s);
  g.rotation.set(-0.12, rot, 0);
  g.position.set(x, W.heightAt(x, z), z);
  return g;
}
// 井口の町の家（x, z, 向き）。はじめの五つが自分で火を放つ候補
// 町の中央（東西二十七歩ほど）の通りを空ける。高床の家の脚へ突き当てない。
const HOUSES = [[24, 80, 0.1], [4, 64, -0.2], [38, 54, 0.3], [-10, 44, 0.05], [44, 78, -0.1], [-18, 70, 0.2], [16, 38, 0.15], [42, 44, -0.25], [-4, 86, 0.1], [8, 100, -0.1]];
const MINE = 5;
const NEED = 3;                            // 自分で火を放つ数
// 翌日の鹿垣：町の北の端（山の麓。z 26 から北は金華山の斜面）に東西に結う。三か所は打って出る口
const SHIKA_Z = 33, SHIKA_X0 = -34, SHIKA_W = 8.5, SHIKA_GAPS = [1, 3, 5];
// 搦手の段の始まり：裏道の登り口の少し下（登り口の守りの手前）
const KARA_FOOT = { x: KARA[0][0] - 4, z: KARA[0][1] };
// 短い暗転（場面の移り。動きを減らす設定では、すぐ切り替える）
function blackCut(rt, mid) {
  const still = reduceMotion();
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:1;transition:opacity ${still ? 0 : 0.6}s`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '1'; });
  setTimeout(() => d.remove(), 6000);   // 戦が先に終わっても黒い幕を残さない
  rt.after(still ? 0.1 : 0.8, () => { mid(); d.style.opacity = '0'; rt.after(1.2, () => d.remove()); });
}

const ODA = { flag: 'oda' };

// 夜明けの色（鳶ヶ巣山砦夜襲・強右衛門と同じ作り）。のちに setTime('morning') で朝へ移ろう
const DAWN = { sky: 0x7e7a88, fog: 0x6e6c7a, sun: 0xffbe86, sunI: 1.05, hs: 0xa4a0b4, hg: 0x362e26, hI: 1.0, top: 0x46506c, glow: 0.24, dir: [1, 0.08, 0.3], mount: 0x262624 };
// env：空の映り込み（PMREM）を作り直すか。重いので、少しずつ移ろう間は false にし、最後に一度だけ作る
export function applyLook(rt, L, env = true) {
  const W = rt.world;
  // 同じ時間帯なら空の映り込みを作り直さない。夜は遠景の見通しも夜にそろえる。
  const time = L === NIGHT ? 'night' : 'dusk';
  if (W.timeKey !== time) W.setTime(time);
  // 戦の途中で呼ぶと setTime が夕暮れへの移ろいを始めて、下の色を上書きしてしまうので止める
  W.fade = null;
  // 夜の色を渡した時は、画質「低」でも月明かりが見えるよう描画側へ知らせる。
  W.lookDark = L === NIGHT;
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  if (env) W.updateEnv();
}

// 夜の色（箕作城の夜攻め・本能寺で使う）
export const NIGHT = { sky: 0x2a3446, fog: 0x283244, sun: 0x9eb0d0, sunI: 0.7, hs: 0x8494b4, hg: 0x2a2a2c, hI: 1.25, top: 0x151c2e, glow: 0.05, dir: [0.8, 0.16, -0.4], mount: 0x13171e };
export { DAWN };
// この戦だけ、夜明け前は青く暗くする。他の戦が使う DAWN は替えない。
const INABA_DAWN = { ...DAWN, sky: 0x39465d, fog: 0x3c4657, sunI: 0.65, hs: 0x8997b4, top: 0x243553, glow: 0.1, dir: [1, 0.035, 0.3] };

// textures.js に無い家の紋・字の旗：flagTexture の無地の布に、ここで描き足す（一度だけ。兵の指物・幟・遠くの大軍が同じ布を使う）
// draw(g) は 128×256 の布の上に描く（紋の真ん中はおよそ (64, 82)、半径 43）。すでに紋が描かれている布なら何もしない
export function customFlag(key, draw, bg) {
  const t = flagTexture(key);
  if (t.userData.custom) return t;
  t.userData.custom = true;
  const g = t.image.getContext('2d');
  // 布の絵は 128×256 で描いた頃の座標で描く（今の布が倍の細かさなら、その分だけ拡げる）
  const k = (t.image.width || 128) / 128;
  const d = g.getImageData(24 * k, 40 * k, 80 * k, 84 * k).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 16 * k * k) if (d[i] + d[i + 1] + d[i + 2] < 240) ink++;
  if (ink > 40) return t;
  if (bg) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = bg; g.fillRect(0, 0, 128 * k, 256 * k); g.restore(); }
  g.save(); g.scale(k, k); g.fillStyle = g.strokeStyle = '#17130f'; draw(g); g.restore();
  t.needsUpdate = true;
  return t;
}
// 縦書きの字（字の旗）
export function flagColumn(g, text, x, y0, y1, size) {
  g.font = `bold ${Math.round(size)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cs = [...text], step = (y1 - y0) / cs.length;
  cs.forEach((ch, i) => { g.globalAlpha = 0.35; g.fillText(ch, x + 0.8, y0 + step * (i + 0.5) + 0.6); g.globalAlpha = 1; g.fillText(ch, x, y0 + step * (i + 0.5)); });
}
export const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
export const gone = (g) => !g || g.count === 0 || g.routed;
// 自分の組が大きいほど、敵を厚くする（組の人数の k 倍を足す）
export const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);
// 味方の鉄砲の一斉射：敵の隊が鉄砲の組へ寄せた所で一度だけ「放て」。当たった隊の士気を落として崩れやすくする
// o = { guns: () => 組, foes: () => [隊], r: 寄せの距離, who, line, sub, drop: 士気の落ち }。update で毎コマ呼ぶ
export function volleyWatch(rt, key, o) {
  const F = rt.flags, k = 'vw_' + key;
  if (F[k]) return;
  const g = o.guns && o.guns();
  if (gone(g)) return;
  const c = g.center(), r = o.r || 30;
  const near = (o.foes() || []).filter((q) => { if (gone(q)) return false; const d = q.center(); return Math.hypot(d.x - c.x, d.z - c.z) < r; });
  if (!near.length) return;
  F[k] = true;
  g.fire = true;
  rt.say(o.who || '鉄砲頭', o.line || '引きつけた……放て！', 2.5);
  rt.banner('放て！', o.sub || '鉄砲の一斉射');
  sfx('volley', 1);
  rt.after(1.4, () => {
    for (const q of near) if (!gone(q)) { q.morale = Math.max(0, q.morale - (o.drop || 30)); }
    rt.bark('敵の前が崩れた。今こそ突け', false);
  });
}

function proceduralBase(x, z) {
  let h = 0.6 * Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 金華山：本丸の峰と、西の肩（搦手の道が通る）
  h += 44 * gauss(x, z, HON.x, HON.z - 4, 2600) + 14 * gauss(x, z, -40, -130, 1800) + 20 * gauss(x, z, 40, -150, 2600);
  // 瑞龍寺山
  h += 20 * gauss(x, z, ZUI.x, ZUI.z, 1500);
  // 北と西の山並み
  h += Math.max(0, -z - 170) * 0.3 + Math.max(0, x - 150) * 0.2;
  // 西は長良川の川べりへ下がる
  if (x < -90) h -= Math.min(3, (-90 - x) * 0.08);
  return h;
}
// 地形の下地は差し替えられる形にしておく（国土地理院の標高などに替える係のための口）。
// 既定は上の proceduralBase。setInabayamaBase(fn) を呼べば、以後の height() がそちらを使う
let baseOverride = null;
export function setInabayamaBase(fn) { baseOverride = fn; CASTLE_HEIGHT = null; BENCHED = null; LIFT.rise = null; }
const DEM_DETAIL = { xy: 1.5, ox: HON.x, oz: HON.z, win: 40, scale: 0.3 };
function base(x, z) {
  const b = (baseOverride || proceduralBase)(x, z);
  // 実測の尾根・谷の凹凸だけを足す（DEM の原点＝本丸に合わせる。前は原点がずれて、道の途中に山頂が出ていた）
  return DEM ? b + demDetail(DEM, x, z, DEM_DETAIL) : b;
}

// 城の縄張り（曲輪）は castles/inabayama.js（docs/castle-design.md 6章・siege-plan 7章「稲葉山」）。
// 七曲りの大手道・竪堀・搦手の腰曲輪の段を、そこの INABAYAMA_PLAN に持つ。level は base() から取る
// ＝下地を差し替えても段が追随する。ここでは、その縄張りに合わせて高さの関数を作るだけ
let CASTLE_HEIGHT = null;
const CLEAR_BOUNDS = INABAYAMA_PLAN.kuruwa.map((k) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of k.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2, poly: k.poly };
});
function height(x, z) {
  if (!CASTLE_HEIGHT) {
    // 山を持ち上げてから平場を切る。曲輪の床と土塁が斜めにならない。
    const ditches = INABAYAMA_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w, closed: h.closed }));
    const withHori = (px, pz) => {
      let h = liftedBase(px, pz);
      for (const f of ditches) h += f(px, pz);
      return h;
    };
    CASTLE_HEIGHT = heightOf(INABAYAMA_PLAN, withHori, 5);
  }
  if (!BENCHED) BENCHED = gradeInabayamaRoads(CASTLE_HEIGHT);
  return BENCHED(x, z);
}
let BENCHED = null;
// 金華山の比高約300mを縮めない。山麓館を基準に、本丸の下地との差を初回だけ求める。
// 高い肩を山頂側へ戻し、裾は従来と同じ z=28 で終える。町・館・川は持ち上げない。
const LIFT = { x: HON.x, z: HON.z, tx: HON.x, tz: -90, w: 68, R: 118, rise: null };
function liftedBase(x, z) {
  if (LIFT.rise == null) LIFT.rise = 300 + base(YAKATA.x, YAKATA.z) - base(HON.x, HON.z);
  let lift = yamaLift(x, z, LIFT);
  if (lift > 0) {
    const r = lift / LIFT.rise;
    // 裾は町へ向かって緩く寝かせる（一直線の崖の壁にしない）。裾の長さを東西で揺らし、尾根と谷の出入りを付ける
    const toe = 0.15 * (0.75 + 0.3 * Math.sin(x * 0.043 + 0.7) + 0.15 * Math.sin(x * 0.11 + 2.1));
    if (r < toe) { const k = r / toe; lift *= k * k * (3 - 2 * k); }
    // 中腹の山肌に、上から下へ走る小さな尾根と沢（平らな板の斜面にしない）
    lift += LIFT.rise * 0.03 * Math.sin(x * 0.09 + z * 0.025) * Math.sin(Math.PI * Math.min(1, r * 1.6));
  }
  return base(x, z) + lift;
}

// 焼けた家：屋根を焦がし、炎と煙を上げる
export function burnHouse(rt, h) {
  if (h.burnt) return;
  h.burnt = true;
  const W = rt.world;
  const roof = h.m.children[1];
  if (roof && roof.material) { roof.material = roof.material.clone(); roof.material.color.setRGB(0.18, 0.15, 0.12); }
  // 一軒に炎は一つ（大きめ）。煙の柱は炎が上げる（数を絞って重くしない）
  h.fires = [W.addFire(h.x + 0.6, h.z - 0.4, { h: 1.6, size: 2.2 })];
  rt.army.play('wood', { x: h.x, z: h.z }, 0.8);
  // 燃え続けた家は、屋根から崩れ落ちる（少しずつ傾き、沈み、最後に壁が潰れる）
  rt.after(30 + Math.random() * 25, () => {
    if (h.collapsed) return;
    h.collapsed = true;
    const wall = h.m.children[0], tilt = Math.random() < 0.5 ? -1 : 1;
    for (let i = 1; i <= 14; i++) rt.after(i * 0.07, () => {
      for (const r of [roof, h.m.children[2]]) if (r) { r.position.y -= 0.16; r.rotation.z = tilt * 0.025 * i; r.rotation.x = 0.012 * i; }
      if (wall && i > 8) wall.scale.y = Math.max(0.35, 1 - (i - 8) * 0.11);
    });
    rt.army.play('wood', { x: h.x, z: h.z }, 1.2);
    rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 1, h.z, 0, 0);
  });
}

// 町の焼け跡は、箱を傾けず黒い柱と落ちた梁で示す。形と材質は十軒で共用する。
const CHAR_GEO = new THREE.BoxGeometry(1, 1, 1);
const CHAR_MAT = new THREE.MeshStandardMaterial({ color: 0x211c18, roughness: 1 });
function townRuin(h) {
  if (h.ruin) return;
  h.ruin = true; h.collapsed = true;
  for (const c of h.m.children) c.visible = false;
  const w = 6 + h.i % 3, d = 4.5;
  const beam = (x, y, z, sx, sy, sz, tilt = 0) => {
    const m = new THREE.Mesh(CHAR_GEO, CHAR_MAT);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = tilt;
    h.m.add(m);
  };
  beam(0, 0.06, 0, w, 0.12, d);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) beam(x, 1.1, z, 0.18, 2.2, 0.18);
  beam(0, 2.15, -d / 2, w, 0.18, 0.18);
  beam(0, 0.3, d / 3, w, 0.2, 0.22, 0.04);
  beam(w / 4, 0.22, 0, 0.25, 0.22, d);
}
function burnTownHouse(rt, h) {
  // 共用の焼け方は替えず、この町だけ箱の倒壊を止める。
  h.collapsed = true;
  burnHouse(rt, h);
  rt.after(35 + h.i * 2, () => { if (!rt.over) townRuin(h); });
}
function charHouse(rt, h) {
  for (const f of h.fires || []) rt.world.removeFire(f);
  h.fires = null; h.burnt = true;
  townRuin(h);
}

// 松明は火付けの者だけに渡す。炎は共用の軽い作り、柄は全員で共用する。
const TORCH_GEO = new THREE.CylinderGeometry(0.035, 0.045, 0.8, 5);
const TORCH_MAT = new THREE.MeshStandardMaterial({ color: 0x55402c, roughness: 1 });
function townTorches(rt) {
  const units = [...rt.flags.torchG.units];
  if (!rt.G.lord) units.push(rt.player.u);
  const start = rt.world.fires.length, rods = [];
  const flames = carryTorches(rt.world, units);
  const fires = rt.world.fires.slice(start);
  for (const u of units) {
    const m = new THREE.Mesh(TORCH_GEO, TORCH_MAT);
    m.position.set(0.35, 1.7, 0); u.mesh.add(m); rods.push(m);
  }
  return { update: () => flames.update(), stop() {
    for (const f of fires) rt.world.removeFire(f);
    for (const m of rods) m.removeFromParent();
  } };
}

// 道の左右だけでなく、段の縁の急な高さの変化もならす。曲輪に入る点は同じ床の高さ。
function gradeInabayamaRoads(terrain) {
  const segments = [];
  KARA_GRADES = [];
  for (const pts of KARA_LEGS) {
    const first = pts[0], last = pts[pts.length - 1];
    const ya = terrain(first[0], first[1]), yb = terrain(last[0], last[1]);
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], dx = pts[i][0] - ax, dz = pts[i][1] - az, len = Math.hypot(dx, dz);
      KARA_GRADES.push({ ax, az, dx, dz, len, l2: len * len, ya: ya + (yb - ya) * walked / length, yb: ya + (yb - ya) * (walked + len) / length,
        x0: Math.min(ax, ax + dx) - 8.5, x1: Math.max(ax, ax + dx) + 8.5, z0: Math.min(az, az + dz) - 8.5, z1: Math.max(az, az + dz) + 8.5 });
      walked += len;
    }
  }
  for (const pts of CASTLE_PATHS.filter((p) => p !== KARA)) for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
    // 曲輪の縁で分ける。麓から曲輪の中心まで一線で均すと、平場の中まで斜面になる。
    // 交点は初回だけ求め、毎コマは作っておいた区間を読むだけ。
    const cuts = [0, 1];
    for (const k of INABAYAMA_PLAN.kuruwa) for (let j = 0; j < k.poly.length; j++) {
      const a = k.poly[j], b = k.poly[(j + 1) % k.poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 0.00001) continue;
      const qx = a[0] - ax, qz = a[1] - az;
      const t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
      if (t > 0 && t < 1 && u >= 0 && u <= 1 && !cuts.some((q) => Math.abs(q - t) < 0.00001)) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const x0 = ax + dx * cuts[j], z0 = az + dz * cuts[j], x1 = ax + dx * cuts[j + 1], z1 = az + dz * cuts[j + 1];
      const sx = x1 - x0, sz = z1 - z0;
      // 縁の一点は切岸側と判定されることがある。口は内側の床までつなぎ、段差を残さない。
      const e = 0.01 / (Math.hypot(sx, sz) || 1), ex = sx * e, ez = sz * e;
      const ya = Math.max(terrain(x0, z0), terrain(x0 - ex, z0 - ez), terrain(x0 + ex, z0 + ez));
      const yb = Math.max(terrain(x1, z1), terrain(x1 - ex, z1 - ez), terrain(x1 + ex, z1 + ez));
      segments.push({ ax: x0, az: z0, dx: sx, dz: sz, l2: sx * sx + sz * sz || 1, ya, yb,
        x0: Math.min(x0, x1) - 8.5, x1: Math.max(x0, x1) + 8.5, z0: Math.min(z0, z1) - 8.5, z1: Math.max(z0, z1) + 8.5 });
    }
  }
  return (x, z) => {
    const h = terrain(x, z), trail = karaSample(x, z);
    // 幅四歩の道は切り通し。曲輪へ入る口まで、同じ勾配でつなぐ。
    if (trail.d <= 2.4) return trail.y;
    if (trail.d < 8.5) { const t = (8.5 - trail.d) / 6.1; return h + (trail.y - h) * t * t * (3 - 2 * t); }
    // 重なる腰曲輪では高い段が優先される。口の中はその床と土塁の高さを保つ。
    for (const q of CLEAR_BOUNDS) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inPoly(q.poly, x, z)) return h;
    let best = 8.5 * 8.5, road = h;
    for (const q of segments) {
      // 道から遠い区間は距離の計算を省く。範囲は初回だけ作り、高さと門の段差は変えない。
      if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const dx = x - q.ax - q.dx * t, dz = z - q.az - q.dz * t, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; road = q.ya + (q.yb - q.ya) * t; }
    }
    const d = Math.sqrt(best), t = Math.max(0, Math.min(1, (8.5 - d) / 5.7));
    return h + (road - h) * t * t * (3 - 2 * t);
  };
}

// 搦手の山道：踏み固めた土の道に、丸太の段（土留め）と、道の縁の低い杭柵。形は使い回しの instancing 二つだけ
function buildKaraRoadWorks(rt) {
  const W = rt.world;
  const logs = [], posts = [], rails = [];
  for (let i = 0; i + 1 < KARA_TRAIL.length; i++) {
    const [ax, az] = KARA_TRAIL[i], [bx, bz] = KARA_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
    for (let d = 1.0; d < L; d += 2.3) {
      const x = ax + dx * d, z = az + dz * d, ya = W.heightAt(x - dx * 0.6, z - dz * 0.6), yb = W.heightAt(x + dx * 0.6, z + dz * 0.6);
      // 登りの急な所にだけ段を置く（平らな所は踏み固めた土のまま）
      if ((yb - ya) / 1.2 > 0.12) logs.push({ x, z, y: Math.min(ya, yb) + 0.06, rot: Math.atan2(nx, nz), len: 3.2 + ((i * 7 + Math.round(d)) % 3) * 0.2 });
    }
    // 道の縁の杭柵（登りの外側＝谷側だけ。口は十分に開ける）
    for (let d = 1.2; d < L; d += 1.9) {
      for (const sd of [1]) {
        const x = ax + dx * d + nx * 2.7 * sd, z = az + dz * d + nz * 2.7 * sd;
        posts.push({ x, z, y: W.heightAt(x, z), h: 0.8 + ((i + Math.round(d)) % 3) * 0.12 });
        const x2 = x + dx * 1.9, z2 = z + dz * 1.9;
        rails.push({ x: (x + x2) / 2, z: (z + z2) / 2, y: (W.heightAt(x, z) + W.heightAt(x2, z2)) / 2 + 0.55, rot: Math.atan2(dx, dz), len: 1.95 });
      }
    }
  }
  const mkI = (geo, color, list, place) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), list.length);
    const o = new THREE.Object3D();
    list.forEach((q, i) => { place(o, q); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
    rt.scene.add(m);
  };
  const logG = new THREE.CylinderGeometry(0.13, 0.15, 1, 6); logG.rotateZ(Math.PI / 2);
  mkI(logG, 0x7a5e3e, logs, (o, q) => { o.position.set(q.x, q.y + 0.1, q.z); o.rotation.set(0, q.rot, 0); o.scale.set(q.len, 1, 1); });
  const postG = new THREE.CylinderGeometry(0.05, 0.07, 1, 5); postG.translate(0, 0.5, 0);
  mkI(postG, 0x6a5640, posts, (o, q) => { o.position.set(q.x, q.y - 0.1, q.z); o.rotation.set(0, 0, 0); o.scale.set(1, q.h + 0.1, 1); });
  const railG = new THREE.BoxGeometry(0.07, 0.07, 1);
  mkI(railG, 0x76603f, rails, (o, q) => { o.position.set(q.x, q.y, q.z); o.rotation.set(0, q.rot, 0); o.scale.set(1, 1, q.len); });
}

// 虎口の石段。段の上面を歩く高さにも登録し、形と材質を一つずつ使い回す。
function buildInabayamaSteps(rt) {
  const W = rt.world, runs = [
    [[-26, -114], [-20, -114]],
    [[KARA[3][0] + (NI.x - KARA[3][0]) * 0.48, KARA[3][1] + (NI.z - KARA[3][1]) * 0.48], [KARA[3][0] + (NI.x - KARA[3][0]) * 0.8, KARA[3][1] + (NI.z - KARA[3][1]) * 0.8]],
    [[DEMARU.x, DEMARU.z - 14], [DEMARU.x, DEMARU.z - 6]],
  ];
  const steps = [];
  for (const [a, b] of runs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), n = Math.max(4, Math.ceil(len / 0.45));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ax = a[0] + dx * t0, az = a[1] + dz * t0, bx = a[0] + dx * t1, bz = a[1] + dz * t1;
      const y = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + 0.08;
      addRamp({ ax, az, bx, bz, w: 3.4, ya: y, yb: y, step: true });
      steps.push({ x: (ax + bx) / 2, z: (az + bz) / 2, y, len: len / n, rot: Math.atan2(dx, dz) });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x827f70 }), steps.length);
  const dummy = new THREE.Object3D();
  steps.forEach((q, i) => {
    dummy.position.set(q.x, q.y - 0.12, q.z); dummy.rotation.set(0, q.rot, 0); dummy.scale.set(3.4, 0.24, q.len);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  rt.scene.add(mesh);
}

// 瑞龍寺山の本陣・大手と裏手の寄せ。曲輪ごとの将と人数は確かな図がなく推定。
const INABAYAMA_JIN = [
  battleJin('山麓の囲み', 0, ZUI, Math.PI, [
    ['ibNobu', '本陣', '織田信長', 3000, ZUI.x, ZUI.z, 'odaCamp', 'eiraku', 'oda'],
    ['ibKino', '裏手の仕寄り', '木下藤吉郎', 1500, 28, 104, 'kino', 'oda'],
    ['ibShiba', '大手の仕寄り', '柴田勝家', 2000, 52, 96, 'shiba', 'oda', 'kari'],
    ['ibNiwa', '大手の控え', '丹羽長秀', 1500, 8, 116, 'niwa', 'oda', 'sujikai'],
    ['ibMori', '大手左の囲み', '森可成', 1200, -40, 8, 'oteYose1', 'oda', 'tsuru'],
    ['ibSakai', '大手右の囲み', '坂井政尚', 1000, 40, 4, 'oteYose2', 'eiraku', 'oda'],
    ['ibSaku', '南の控え', '佐久間信盛', 1500, 80, 60, 'sakuma', 'oda'],
    ['ibIkeda', '東の囲み', '池田恒興', 1000, 70, -86, 'ikeda', 'oda', 'ageha'],
    ['ibMino', '西の囲み', '稲葉一鉄・氏家卜全・安藤守就', 2300, -64, 40, 'sannin', 'inaba'],
  ], '織田一万五千を仮の総数とする。長期の付城は断定せず山麓の陣とする。'),
  battleJin('曲輪の守り', 1, HON, 0, [
    ['ibHineno', '大手の曲輪', '日根野弘就', 1000, OTE.x, OTE.z - 6, 'ote', 'saito'],
    ['ibNagai', '百曲りの守り', '長井道利', 800, 22, -92, 'hyakuB', 'saito'],
    ['ibWater', '水の手の曲輪', '名は伝わらない', 400, -60, -84, 'koshiB', 'saito'],
    ['ibNi', '二の丸', '名は伝わらない', 600, NI.x, NI.z - 2, 'niB', 'saito'],
    ['ibTatsu', '本陣', '斎藤龍興', 1200, HON.x + 2, HON.z - 4, 'keep', 'saito'],
  ], '城兵四千を仮の総数とする。守り所への将の割り振りは復元。'),
];

function officer(rt) {
  const u = rt.flags.kinoU, p = rt.player.u.pos;
  return u?.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12 ? '木下藤吉郎' : '藤吉郎の使番';
}

// 稲葉山だけの露岩帯。高低ではなく、尾根と沢に沿った斑で林床・岩場を分ける。
function inabaRockBand(x, z) {
  return Math.max(0, Math.min(1, (Math.sin(x * 0.095 + z * 0.027 + 0.8)
    + Math.sin(x * 0.037 - z * 0.063) * 0.55 - 0.15) * 1.25));
}
function inabaPathDistance(x, z) {
  let d = Infinity;
  for (const pts of INABA_PATHS) d = Math.min(d, distToPolyline(x, z, pts));
  return d;
}
function inabaClearing(x, z, pad = 0) {
  return CLEAR_BOUNDS.some((q) => x >= q.x0 - pad && x <= q.x1 + pad && z >= q.z0 - pad && z <= q.z1 + pad);
}

// 設営時に一度だけ作る。共通地形を替えず、この山の材質に露岩と細い土の道筋を足す。
function buildInabaMountain(rt) {
  const W = rt.world, geo = W.terrain.geometry, pos = geo.attributes.position;
  const bands = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    bands[i] = z < 28 && z > -170 && Math.abs(x) < 100 && !inabaClearing(x, z) ? inabaRockBand(x, z) : 0;
  }
  geo.setAttribute('inabaRock', new THREE.BufferAttribute(bands, 1));
  // 格子より細い道も残す。一枚の小さな絵に全ての九十九折を描き、毎コマ描き直さない。
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), scale = 512 / (W.half * 2);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#fff'; ctx.lineCap = ctx.lineJoin = 'round';
  for (const pts of INABA_PATHS) {
    ctx.lineWidth = (pts === KARA_TRAIL || pts === HYAKU ? 1.7 : 2.1) * scale;
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const u = (x + W.half) * scale, v = (W.half - z) * scale; if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); });
    ctx.stroke();
  }
  const trail = new THREE.CanvasTexture(canvas);
  const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => cacheKey + '|inaba-mountain';
  mat.onBeforeCompile = (sh) => {
    compile(sh);
    sh.uniforms.inabaTrail = { value: trail };
    sh.vertexShader = 'attribute float inabaRock;\nvarying float vInabaRock;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInabaRock = inabaRock;');
    sh.fragmentShader = 'uniform sampler2D inabaTrail;\nvarying float vInabaRock;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
      // チャートの薄い層と斜めの割れ目。緑の樹冠の絵の上にも灰褐色の露岩を残す。
      float ibLayer = sin(vWP.y * 2.8 + vWP.x * 0.28 + vWP.z * 0.17);
      float ibCrack = smoothstep(0.88, 0.99, sin(vWP.x * 0.7 - vWP.z * 0.43 + vWP.y * 0.22));
      vec3 ibStone = stone * vec3(0.83, 0.76, 0.69) * (0.87 + ibLayer * 0.13) * (1.0 - ibCrack * 0.38);
      col = mix(col, ibStone, vInabaRock * smoothstep(0.08, 0.38, 1.0 - vWN.y) * 0.85);
      float ibTrail = texture2D(inabaTrail, (vWP.xz + ${W.half.toFixed(1)}) / ${(W.half * 2).toFixed(1)}).r;
      col = mix(col, dirt * vec3(0.92, 0.83, 0.72), ibTrail * 0.94);
      diffuseColor.rgb *= col;`);
  };
  mat.needsUpdate = true;
  mat.addEventListener('dispose', () => trail.dispose());

  // 丸石を増やす代わりに、道の外へ薄い岩の段を集める。割れ目は二枚の隙間で表す。
  const rockGeo = new THREE.BoxGeometry(1, 1, 1), rp = rockGeo.attributes.position;
  // 上下の層をずらし、四角い箱の輪郭を割れた板岩の輪郭にする。形は全て共用。
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    rp.setXYZ(i, x + y * 0.24 + z * 0.12, y * (0.88 + x * 0.2), z + y * 0.16);
  }
  rockGeo.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeo,
    new THREE.MeshLambertMaterial({ map: stoneTex(), color: 0x938477 }), 160);
  const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.13, 1, 5),
    new THREE.MeshLambertMaterial({ map: barkTex('broad'), color: 0x756044 }), 80);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), end = new THREE.Vector3(), across = new THREE.Vector3(), color = new THREE.Color();
  let nr = 0, nt = 0;
  for (const pts of [ROAD, KARA_TRAIL, HYAKU]) for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    for (let d = 3; d < length; d += 7) {
      const side = (i + Math.floor(d / 7)) % 2 ? 1 : -1;
      const x = ax + dx * d - dz * side * 7, z = az + dz * d + dx * side * 7;
      if (z > 24 || z < -145 || inabaClearing(x, z, 2) || inabaPathDistance(x, z) < 5.5) continue;
      const gx = (W.heightAt(x + 1, z) - W.heightAt(x - 1, z)) / 2;
      const gz = (W.heightAt(x, z + 1) - W.heightAt(x, z - 1)) / 2;
      normal.set(-gx, 1, -gz).normalize();
      if (inabaRockBand(x, z) > 0.22 && nr + 2 <= rocks.instanceMatrix.count) {
        dummy.quaternion.setFromUnitVectors(up, normal); dummy.rotateY(0.25 + i * 0.13);
        across.set(1, 0, 0).applyQuaternion(dummy.quaternion);
        for (let split = 0; split < 2; split++) {
          const offset = (split ? 1 : -1) * 1.2, rx = x + across.x * offset, rz = z + across.z * offset;
          dummy.position.set(rx, W.heightAt(rx, rz) + 0.12, rz);
          dummy.scale.set(1.8, 0.65 + (i % 3) * 0.18, 2.5 + (Math.floor(d) % 3));
          dummy.updateMatrix(); rocks.setMatrixAt(nr, dummy.matrix);
          color.setHex((nr % 3) === 0 ? 0x84906a : (nr % 3) === 1 ? 0xb4a496 : 0x887e76); rocks.setColorAt(nr++, color);
        }
      }
      // 根は道を塞がず、林床から沢側へ這わせる。上下端を山肌の高さに合わせる。
      if (nt < roots.instanceMatrix.count) {
        const rx = x + dx * 1.7 - dz * side, rz = z + dz * 1.7 + dx * side;
        const y = W.heightAt(x, z) + 0.12, ry = W.heightAt(rx, rz) + 0.12;
        end.set(rx - x, ry - y, rz - z); const len = end.length();
        dummy.position.set((x + rx) / 2, (y + ry) / 2, (z + rz) / 2);
        dummy.quaternion.setFromUnitVectors(up, end.normalize()); dummy.scale.set(1, len, 1);
        dummy.updateMatrix(); roots.setMatrixAt(nt++, dummy.matrix);
      }
    }
  }
  rocks.count = nr; roots.count = nt;
  for (const mesh of [rocks, roots]) { mesh.receiveShadow = true; W.viewCull([mesh], 0); rt.scene.add(mesh); }
}

// 山道を歩く間は縦列。下り切ってから槍をそろえ、打って出る。
function march(g, path, next = 'hold') {
  if (gone(g)) return;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.speed = 2.4;
  g.onArrive = (q) => { q.anchor = { x: path[path.length - 1][0], z: path[path.length - 1][1] }; q.formation = 'yari'; q.order = next; q.aggro = 12; q.seekRange = 24; };
}


// 共通の台詞と視点を、この戦の間だけ差し替える。次の戦へ持ち越さない。
function installInabaPresentation(rt) {
  const F = rt.flags, player = rt.player, hud = rt.hud;
  const say = rt.say, bark = rt.bark, updateCamera = player.updateCamera, dispose = rt.dispose;
  const clean = (text) => /討死|討ち死|討たれ|戦死/.test(text) ? text.replace(/佐久間信盛/g, '味方の組頭') : text;
  const pass = (text) => {
    if (!/使番が.*本陣へ走った/.test(text)) return true;
    if (rt.t < (F.honjinRunnerAt ?? -Infinity) + 30) return false;
    F.honjinRunnerAt = rt.t; return true;
  };
  rt.say = function (who, text, dur) { text = clean(String(text)); if (pass(text)) return say.call(this, who, text, dur); };
  rt.bark = function (text, warn) { text = clean(String(text)); if (pass(text)) return bark.call(this, text, warn); };
  const style = document.createElement('style');
  style.textContent = '#hud #subtitle, #hud #subtitle span, #hud #subtitle em, #hud #subtitle i { font-style: normal; }';
  hud.root.appendChild(style);
  const look = new THREE.Vector3(), eye = new THREE.Vector3(), safe = new THREE.Vector3(), box = new THREE.Box3();
  const blocks = [];
  F.downCamera = () => {
    const p = player.u.pos;
    if (!F.downCameraReady) {
      F.downCameraReady = true; blocks.length = 0;
      rt.scene.updateMatrixWorld(true);
      rt.scene.traverse((o) => { if (o.isMesh && o.userData.camBlock) blocks.push(o); });
      // 焼けて傾いた屋根や板も含める。柵の当たりだけでは倒壊材を拾えない。
      for (const h of F.houses || []) h.m.traverse((o) => { if (o.isMesh && !blocks.includes(o)) blocks.push(o); });
      look.set(p.x, p.y + 0.7, p.z);
      let best = -Infinity;
      for (let i = 0; i < 8; i++) {
        const angle = player.yaw + i * Math.PI / 4, x = p.x + Math.sin(angle) * 4, z = p.z + Math.cos(angle) * 4;
        let y = Math.max(p.y, rt.world.heightAt(x, z)) + 4;
        for (const o of blocks) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
          if (x > box.min.x - 0.8 && x < box.max.x + 0.8 && z > box.min.z - 0.8 && z < box.max.z + 0.8) y = Math.max(y, box.max.y + 2);
        }
        eye.set(x, y, z);
        const hit = player.camBlockHit(eye, look), score = hit === null ? 2 : hit;
        if (score > best) { best = score; safe.copy(eye); }
      }
    }
    rt.camera.position.copy(safe); player.camPos.copy(safe);
    rt.camera.lookAt(look); rt.camera.updateMatrixWorld();
  };
  player.updateCamera = function (dt, camera) {
    updateCamera.call(this, dt, camera);
    // 足元は水平に切った細道。体は横へ倒さず、進む坂に合わせて前へ折る。
    for (const u of rt.army.units) {
      if (!u.alive || u.mounted || u.isStruct || u.naka) continue;
      const q = F.step === 3 ? karaSample(u.pos.x, u.pos.z) : null, on = q && q.d <= 2.2 && Math.abs(u.pos.y - q.y) < 1;
      if (on || u._inabaLean) {
        const uphill = on ? q.grade * (q.dx * Math.sin(u.heading) + q.dz * Math.cos(u.heading)) : 0;
        u._inabaLean = on;
        u.mesh.rotation.set(Math.max(-0.12, Math.min(0.24, Math.atan(uphill) * 0.4)), u.heading, 0, 'YXZ');
      }
    }
    if (!this.u.alive || rt.result?.down) F.downCamera();
    else F.downCameraReady = false;
  };
  rt.dispose = function () {
    style.remove(); F.karaMesh?.geometry.dispose(); F.karaMesh?.material.dispose(); this.say = say; this.bark = bark; player.updateCamera = updateCamera; this.dispose = dispose;
    return dispose.call(this);
  };
}

// 細道は格子の補間で崖へ戻さない。土の帯も同じ高さで一度だけ作る。
function buildKaraTrail(rt) {
  const W = rt.world, oldHeight = W.heightAt;
  const ground = W.terrain.geometry, pos = ground.attributes.position, row = Math.round(W.half * 2 / W.step) + 1;
  // 細道の下の粗い格子を少し下げ、土の帯に山肌が突き出すのを防ぐ。
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), q = karaSample(x, z);
    if (q.d > 5) continue;
    const y = q.y - 0.15;
    pos.setY(i, y);
    const gx = Math.round((x + W.half) / W.step), gz = Math.round((z + W.half) / W.step);
    W.grid[gz * row + gx] = y;
  }
  pos.needsUpdate = true; ground.computeVertexNormals(); ground.computeBoundingSphere();
  W.heightAt = function (x, z) { const q = karaSample(x, z); return q.d <= 2.4 ? q.y : oldHeight.call(this, x, z); };
  const vertices = [];
  for (const q of KARA_GRADES) {
    const nx = -q.dz / q.len * 2.4, nz = q.dx / q.len * 2.4, n = Math.ceil(q.len);
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const ax = q.ax + q.dx * a, az = q.az + q.dz * a, ay = q.ya + (q.yb - q.ya) * a + 0.03;
      const bx = q.ax + q.dx * b, bz = q.az + q.dz * b, by = q.ya + (q.yb - q.ya) * b + 0.03;
      vertices.push(ax - nx, ay, az - nz, ax + nx, ay, az + nz, bx + nx, by, bz + nz,
        ax - nx, ay, az - nz, bx + nx, by, bz + nz, bx - nx, by, bz - nz);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x776044, side: THREE.DoubleSide }));
  mesh.receiveShadow = true; rt.scene.add(mesh); rt.flags.karaMesh = mesh;
}

const inabayama = {
  jinkei: INABAYAMA_JIN,
  battleVoices: { lines: { ally: { order: ['組頭「藤吉郎の旗に続け。列を離れるな」', '組頭「道を確かめ、前の仲間と並べ」'] } } },
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  noWake: true,   // 城の部隊が本物の兵を受け持ち、遠景から重ねて増やさない。
  // 斎藤勢が瑞龍寺山の信長の本陣を突いた記録はない。町の焼き討ちの最中に本陣の守りへ呼び戻さない。
  noTaishoRaid: true,
  uchisute: true, // 火付けと攻城を急ぐ。首を集める札を出さない。
  // 普通・易では、槍が重なっても満身から十八秒以上は退く余地を残す。
  meleeGrace: { rate: 0.05, burst: 0.08, interval: 0.85 },
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: 44, z: 112, heading: Math.atan2(28 - 44, 104 - 112) },
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    if (F.step === 0 || F.regroup) return 'kino';
    if (F.step === 1 && F.lit < NEED) return F.houseTargets?.[0] ? 'h' + F.houseTargets[0].i : 'kino';
    if (F.step === 3 && !F.guardOn) return F.karaGuideMarked ? 'karaGuide' : 'kino';
    if (F.step === 3 && F.guardOn) return 'kguard';
    if (F.step === 4) return F.sig ? 'sig' : 'honGuard';
    return 'kino';
  },
  world: {
    // この戦の間、表示済みの台詞・知らせは再掲しない。任務と印は常に残る。
    noticeRepeatGap: Infinity,
    blockedHint: () => '家の間を通れ。藤吉郎の旗へ寄り、町の道を北へ進め',
    seed: 1567,
    terrainTags: true,
    wind: [0.5, 0.86],   // 放火の日は強風と信長公記にある。風向きは復元。
    windStrength: 1.6,   // 強風の強さは遊びのための復元値。
    time: 'dusk',
    muddy: 0.2,
    paths: INABA_PATHS,
    moveWay: makeTownWay(HOUSES),
    height,
    tint(x, z, h, c) {
      // 城下の土の道と町の庭
      if (z > 30 && z < 108 && x > -30 && x < 56) c.lerp({ r: 0.5, g: 0.45, b: 0.36 }, 0.35);
      else if (z < 28 && h > 4) {
        const d = inabaPathDistance(x, z), rock = inabaRockBand(x, z);
        const litter = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.09);
        // 色の差を草・土の割合にも渡す。高い所を一様に緑のまま暗くしない。
        if (d < 1.4 || inabaClearing(x, z)) c.setRGB(0.36, 0.29, 0.20);
        else if (rock > 0.45) c.setRGB(0.33, 0.30, 0.27);
        else c.setRGB(0.20 + litter * 0.06, 0.23 + litter * 0.03, 0.13 + litter * 0.04);
      }
    },
    clear: (x, z) => (z > 26 && z < 112 && x > -34 && x < 60) || Math.hypot(x - HON.x, z - HON.z) < 24 || Math.hypot(x - ZUI.x, z - ZUI.z) < 26 ||
      inabaClearing(x, z) || inabaPathDistance(x, z) < 2.3,
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-150, -190], [-118, -110], [-112, -30], [-124, 60], [-150, 170]], w: 9, depth: 1.4 }],
    slopeForest: 0.65,   // 林床と露岩を残し、斜面全体を樹冠の緑で覆い切らない。
    trees: 700,
    treePadMul: 0.5,
    rocks: 360,   // 減らした丸石の分を、道沿いの割れた岩の段へ回す。
    tufts: 3800,
    sugiAt: (x, z) => (z < 28 ? 0.12 + Math.max(0, Math.sin(x * 0.06 + z * 0.035)) * 0.42 : 0),
    treeDensity: (x, z) => (z > 28 ? 0.10 : z > -145 && Math.abs(x) < 95 ? 1 - inabaRockBand(x, z) * 0.72 : 0.22),
    // 木の総数を増やさず、露岩の間と登り口へ林を寄せる。竹の固まりは山肌に置かない。
    noBamboo: true,
    groves: [],
    // 崩れた斎藤の兵は、山の奥（北）で消す
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -90 && Math.abs(x) > 40)),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    installInabaPresentation(rt);
    buildKaraTrail(rt);
    buildInabaMountain(rt);
    // 名のある敵に寄っただけで、周りの兵を止める一騎打ちへ移さない。
    rt.army.hooks.canDuel = () => false;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.entered = {}; F.layer = null; F.layerSeen = {};
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...INABAYAMA_HIST, honjinOda: 'HIST_A', honjinSaito: 'HIST_B' };
    rt.banner('井口の町', '夜明け前。藤吉郎の手で、城下に火をかける');
    // ---- 床の層（floors.js）を作り直す。搦手の物見櫓はここへ床・梯子を登録する ----
    flReset();
    F.tower = monomi(rt, TOWER.x, TOWER.z, { name: '水手道の物見櫓' });
    rt.scene.add(F.tower.mesh);
    F.towerArchers = enemyGroup(rt, { fixed: true, faction: 'saito', name: '物見櫓の射手', anchor: { x: TOWER.x, z: TOWER.z }, facing: 0, order: 'hold', aggro: 10, width: 2, morale: 80 },
      [{ type: 'bow', n: 2 }]);
    // 射手を物見櫓の床の高さに乗せる（floors.js の床の上に立つ扱い。以後は groundAt が高さを保つ）
    for (const u of F.towerArchers.units) { u.pos.y = F.tower.topY; if (u.mesh) u.mesh.position.y = F.tower.topY; }
    // 登り降りは登録済みの梯子を伝って行う。上下へ瞬間移動する札は置かない。
    // ---- 城の縄張り（曲輪）：本丸・大手の三の丸・二の丸を段に、腰曲輪は喰違いの柵で囲う ----
    // 本丸から出丸まで縁に土塁と柵。三の丸の大手だけ既存の喰違いの柵を使う。
    F.castle = buildCastlePlan(rt, INABAYAMA_PLAN, { life: false, ladders: true, baseHeight: liftedBase, edgeW: 5, skipWalls: ['ote'] });
    const noT2 = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT2(F.castle.walls);
    F.koshiGuard = garrisonKuruwa(rt, enemyGroup, F.castle, 'koshi1', 'saito', [{ type: 'ashigaru', n: 3 }], { name: '腰曲輪の喰違いの守り', width: 4, aggro: 10 });
    // ---- 落石・丸太（castle-design 7-1）：腰曲輪の守りが生きている間、搦手の坂を落ちてくる ----
    F.rocks = makeRockTraps(rt, {
      posts: [{
        id: 'koshi1', team: 1, stock: 2, interval: [26, 36],
        lane: [[KARA[2][0] + 2, KARA[2][1] + 12], [(KARA[1][0] + KARA[2][0]) / 2, (KARA[1][1] + KARA[2][1]) / 2], [KARA[1][0] - 3, KARA[1][1] + 6]],
        active: () => F.step === 3 && !F.guardOn && !gone(F.koshiGuard),
      }],
    });
    // ---- 竹束の置き場（castle-design 7-3）：搦手の登り口。抱えて登れば、前から来る石・矢を 7 割防ぐ ----
    F.tabaPile = tabaMesh(W, TABA_PILE.x, TABA_PILE.z, Math.PI);
    rt.scene.add(F.tabaPile);
    rt.addInteract('tabaPile', TABA_PILE, '竹束を担ぐ', () => this.tabaTake(rt), { r: 3, hold: 1 });
    // ---- 井口の町 ----
    F.houses = HOUSES.map(([x, z, r], i) => {
      const m = hut(W, x, z, 6 + (i % 3), 4.5, r, { wall: i % 2 ? 0x7b6448 : 0x6e5a40 });
      rt.scene.add(m);
      return { x, z, m, i, mine: i < MINE };
    });
    rt.scene.add(tawara(W, 12, 72, 0.3, 5), tawara(W, -2, 52, -0.4, 4));
    rt.after(8, () => { if (!rt.over) rt.bark('七曲りは緩い。百曲りは急じゃ', true); });   // A056
    // 搦手の山道の両脇に切岸（土の壁）：登る道の感じ（A050）。山頂には高い幟（A051）
    const bankBatch = makeSimpleBatch();
    for (let i = 0; i + 1 < KARA_TRAIL.length; i++) {
      const [ax, az] = KARA_TRAIL[i], [bx, bz] = KARA_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (const s of [1, -1]) dorui(W, [ax + nx * 5 * s, az + nz * 5 * s, bx + nx * 5 * s, bz + nz * 5 * s], nx * s, nz * s, { w: 1.5, h: 0.3, batch: bankBatch });
    }
    finalizeSimpleBatch(rt, bankBatch);
    for (const [x, z] of [[HON.x - 8, HON.z + 4], [HON.x + 8, HON.z + 4], [HON.x, HON.z - 2]]) rt.scene.add(nobori(W, x, z, 'saito', 14));
    // ---- 大手の木戸（七曲りの道を切る柵。口は開いている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-26, OTE.z + 6], [-4, OTE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[4, OTE.z], [26, OTE.z + 6]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    rt.scene.add(kabukimon(W, OTE.x, OTE.z, 7.4, 0));
    // 西の虎口。曲輪の縁と当たりを同じ縄張りから作り、門幅だけを空ける。
    rt.scene.add(kabukimon(W, -20, -116, 7, Math.PI / 2));
    rt.scene.add(kabukimon(W, DEMARU.x, DEMARU.z - 10, 6, 0));
    rt.scene.add(kabukimon(W, YAKATA.x + 17, YAKATA.z, 6, Math.PI / 2, { yakui: true }));   // 館の表門は薬医門
    // 絵図の小曲輪の東側だけに約一丈（3m）の石垣。西の攻め口と山道を塞がない。
    rt.scene.add(ishigaki(W, [[TSUKE.x + TSUKE.half, TSUKE.z + TSUKE.half], [TSUKE.x + TSUKE.half, TSUKE.z - TSUKE.half]], { topY: W.heightAt(TSUKE.x, TSUKE.z), minH: 3, maxH: 3, lean: 0.14 }));
    // 主殿（板葺きの木造。天守・二重櫓は置かない）と、物見の櫓（木造）
    // 主殿は縄張り（castles/inabayama.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に龍興（kaito 10/2）
    // 山頂の曲輪：主殿のほかに、遠侍（板葺きの御殿）・兵糧蔵・長屋を構えて、御殿と蔵と詰所のある城らしくする（kaito 10/2 の見回り）
    goten(rt, HON.x + 12, HON.z + 6, { w: 7, d: 5, tile: false, team: 1, name: '遠侍', hp: 600, naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, HON.x - 12, HON.z - 6, { w: 5, d: 4, tile: false, team: 1, name: '兵糧蔵', kind: 'yagura', oku: 0, naka: true, profile: 'inabayama', noTarget: true });
    const rice = tawara(W, HON.x - 10.7, HON.z - 7.1, 0, 3);
    rice.position.y += 0.55; rt.scene.add(rice);
    goten(rt, HON.x - 6, HON.z + 10, { w: 9, d: 4, tile: false, team: 1, name: '兵の長屋', kind: 'nagaya', naka: true, profile: 'inabayama', noTarget: true });
    // 番所・厩・小祠・山麓館は斎藤期の美濃から推定。信長の庭園や天守を先取りしない。
    goten(rt, NI.x - 5, NI.z + 2, { w: 5, d: 4, tile: false, team: 1, name: '二の丸の番所', kind: 'nagaya', naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, MATSU.x + 6, MATSU.z - 5, { w: 4, d: 3, tile: false, team: 1, name: '小さな祠', kind: 'shrine', naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, DEMARU.x - 6, DEMARU.z + 3, { w: 5, d: 4, tile: false, team: 1, name: '出丸の番所', kind: 'nagaya', naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, YAKATA.x - 2, YAKATA.z - 5, { w: 12, d: 7, tile: false, team: 1, name: '斎藤の山麓館', naka: true, profile: 'inabayama', noTarget: true });
    const lifeBatch = makeKitBatch();
    const stable = kuruwaBldg(W, 'umaya', UMAYA.x - 8, UMAYA.z, 0, { batch: lifeBatch });
    if (!stable.isBatchedPart) rt.scene.add(stable);
    finalizeKitBatch(rt, lifeBatch);
    monomi(rt, HON.x + 10, HON.z - 14, { name: '本丸の井楼' });
    monomi(rt, OTE.x + 12, OTE.z - 6, { name: '大手の井楼' });
    monomi(rt, DEMARU.x + 7, DEMARU.z + 4, { name: '出丸の物見櫓' });
    // 野面積みの上は板を笠にした土塀。小曲輪の南北は柵、西は本丸からの通り口。
    const edgeBatch = makeKitBatch();
    const eastX = TSUKE.x + TSUKE.half;
    dobei(W, [eastX, TSUKE.z + TSUKE.half, eastX, TSUKE.z - TSUKE.half], { baseY: W.heightAt(TSUKE.x, TSUKE.z), ita: true, batch: edgeBatch });
    finalizeKitBatch(rt, edgeBatch);
    Object.assign(solidSeg(eastX, TSUKE.z - TSUKE.half, eastX, TSUKE.z + TSUKE.half, 0.25), { missileH: 2.3, missileType: 'wood' });
    noT(wallLine(rt, [[20, TSUKE.z - TSUKE.half], [eastX, TSUKE.z - TSUKE.half]], { team: 1, hp: 1e9, name: '小曲輪の柵' }));
    noT(wallLine(rt, [[20, TSUKE.z + TSUKE.half], [eastX, TSUKE.z + TSUKE.half]], { team: 1, hp: 1e9, name: '小曲輪の柵' }));
    buildInabayamaSteps(rt);
    buildKaraRoadWorks(rt);
    // 山頂の小曲輪：入口曲輪（七曲りと百曲りが合う所）→ 二ノ門 → 中枢曲輪（本丸の口の前）
    rt.scene.add(kabukimon(W, NIMON.x, NIMON.z, 4.2, Math.atan2(-(NAKA.z - IRI.z), NAKA.x - IRI.x) + Math.PI / 2));
    for (const [x, z] of [[NIMON.x - 2.6, NIMON.z + 1.6], [NIMON.x + 2.6, NIMON.z - 1.6]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.2 }); }
    rt.scene.add(nobori(W, IRI.x + 5, IRI.z - 3, 'saito', 6), nobori(W, NAKA.x - 4, NAKA.z + 3, 'saito', 6));
    // 城の見栄え：大手の前に逆茂木、木戸に篝火
    {
      rt.scene.add(sakamogi(W, OTE.x - 13, OTE.z + 9, 0.2, 7), sakamogi(W, OTE.x + 13, OTE.z + 9, -0.2, 7));
      for (const [x, z] of [[OTE.x - 5.5, OTE.z + 2], [OTE.x + 5.5, OTE.z + 2]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
      // 本丸の守備は主殿前・馬廻・控えの実兵で示す。別の大軍を重ねない。
      // 総大将・斎藤龍興は主殿の中（天守の無い城。高遠の盛信と同じ作り）。旗本が縁側の上がり口を守り、踏み込むまで討てない
      F.keep = makeLordKeep(rt, {
        name: '斎藤龍興', spot: { x: HON.x + 2, z: HON.z - 6 }, mouth: { x: HON.x + 2, z: HON.z - 0.5 }, facing: Math.PI, guardN: 5,
        faction: 'saito', flag: 'saito', hat: 'kabuto_w', haori: 0x2e3a2a,
        onReach: () => this.reachTatsu(rt),
      });
      if (F.keep.lord) { F.keep.lord.mustLive = true; F.keep.lord.noTarget = true; }
      F.keep.guard.noRout = false; F.keep.guard.formation = 'yari';
      for (const g of F.keep.kin) g.noRout = false;
      // 主殿の前の馬廻（見上げに来れば旗が見える。寄り過ぎなければ打って出ない）
      F.tatsu = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤龍興の馬廻', anchor: { x: HON.x - 3, z: HON.z + 2 }, facing: -Math.PI / 2, order: 'hold', aggro: 3, width: 6, morale: 100, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 2 }], { flag: 'saito' }));
      // 城主は居所の隊の頭。馬廻は別の組頭が指揮する。
    }
    for (const [x, z] of [[HON.x - 4, HON.z + 10], [HON.x + 10, HON.z + 2], [OTE.x - 8, OTE.z - 6], [OTE.x + 8, OTE.z - 6], [-30, -120]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    // 中枢曲輪の道の上の小屋は置かず、番所は平場の脇へ寄せる。
    rt.scene.add(hut(W, 22, -84, 6, 4, -0.3, { wall: 0x6a5238 }));
    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、柴田勝家の手、丹羽長秀の手 ----
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: 28, z: 104 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.shiba = allyGroup(rt, { fixed: true, name: '柴田勝家の手', anchor: { x: 52, z: 96 }, facing: Math.PI, width: 14, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }], ODA));
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: 8, z: 116 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], ODA));
    F.oda = [F.kino, F.shiba, F.niwa];
    // 藤吉郎の手は崩れても旗の下へ戻る（手が崩れただけで攻めを打ち切らない）
    F.kino.noRout = true;
    for (const g of F.oda) { g.formation = 'yari'; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 36, z: 114 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 町に残る斎藤の番の兵 ----
    // 既存の十八人が出陣口へ斬り込む。味方の遠い隊を追って町を空けない。
    F.town = enemyGroup(rt, { fixed: true, faction: 'saito', name: '町の番の兵', anchor: { x: 40, z: 88 }, facing: 0, order: 'hold', seekRange: 80, width: 8, aggro: 9, morale: 80, fleeDir: { x: 0, z: -1 } },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 17 }]);
    // 町の者が逃げていく（戦わない。討てば下知違反）
    F.civ = [];
    const civ = (x, z, n2) => {
      const c = enemyGroup(rt, { fixed: true, faction: 'saito', name: '逃げる町の者', anchor: { x, z }, facing: 0, width: 4, aggro: 0, morale: 70, fleeDir: { x: -0.6, z: 0.8 }, speed: 2.6 },
        // 町の者：色のある小袖の女・子、荷を背負った男（兵の暗い具足の色にしない）
        [{ type: 'porter', n: n2, o: { flag: null, hat: 'none', armor: [0x7a4a3c, 0x5a5a7a, 0x8a7050, 0x6a4a5a][n2 % 4], lace: 0x9a8a70, cloth: [0x9a6a58, 0x6e7896, 0xa08a60, 0x86607a][(n2 + 1) % 4], haori: null, mon: null } }]);
      c.civ = true;
      for (const u of c.units) { u.noTarget = true; u.dmg = 0; }
      F.civ.push(c);
    };
    civ(-4, 60, 4); civ(20, 46, 3);
    // 後続はすでに町の通りまで下りている。山道の移動で斬り合いを長く途切れさせない。
    // 物見・伏兵・旗本は持ち場を守る。段の切り替えで兵を増やさない。
    F.town2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '城から下りた斎藤勢', anchor: { x: 32, z: 36 }, facing: 0, order: 'hold', aggro: 10, width: 7, morale: 85, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }]);
    // 打って出る兵は七曲りの一番下の坂で待ち、鹿垣の開いた口まで縦列で下る。
    F.ote = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の斎藤勢', anchor: { x: -20, z: 25 }, facing: 0, order: 'hold', aggro: 0, fire: false, noAI: true, historicalOrders: true, width: 8, morale: 72, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }, { type: 'gun', n: 1 }]);
    F.ote2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の新手', anchor: { x: -24, z: 21 }, facing: 0, order: 'hold', aggro: 0, fire: false, noAI: true, historicalOrders: true, width: 7, morale: 66, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }]);
    // 木戸の槍兵八人を登り口と下の段へ分ける。総人数を増やさず、道の上で迎える。
    F.climbGuards = [0, 0.5].map((t, i) => enemyGroup(rt, { fixed: true, faction: 'saito',
      name: i ? '裏道の下の段の守り' : '裏道の登り口の守り',
      anchor: { x: KARA_TRAIL[0][0] + (KARA_TRAIL[1][0] - KARA_TRAIL[0][0]) * (t + 0.15), z: KARA_TRAIL[0][1] },
      facing: 0.8, order: 'hold', aggro: 0, width: 2, morale: 85, noAI: true, historicalOrders: true }, [{ type: 'ashigaru', n: 5 }]));
    // 物見の後ろの見回りの組。細い道の上で列の頭とぶつかる（裏道の一番の斬り合い）
    F.patrol = enemyGroup(rt, { fixed: true, faction: 'saito', name: '裏道の見回りの組', anchor: { x: KARA[1][0] - 4, z: KARA[1][1] - 8 }, facing: 0.5, order: 'hold', aggro: 0, width: 3, morale: 75, noAI: true, historicalOrders: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { flag: 'saito' }));
    F.kguard = enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の守り', anchor: { x: -30, z: -118 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }]);
    F.scout = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤の物見', anchor: { x: KARA[1][0], z: KARA[1][1] }, facing: 0.4, order: 'hold', aggro: 10, width: 2, morale: 70, fleeDir: { x: 0.4, z: -1 } },
        [{ type: 'ashigaru', n: 2 }]);
    F.ambush = enemyGroup(rt, { fixed: true, faction: 'saito', name: '岩陰の伏兵', ambush: true, anchor: { x: KARA[2][0], z: KARA[2][1] }, facing: 0.6, order: 'hold', aggro: 12, width: 3, morale: 80, fleeDir: { x: 0.5, z: -1 }, formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
    F.ambushGun = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の段の鉄砲', anchor: { x: KARA[4][0] - 4, z: KARA[4][1] - 8 }, facing: 0.3, order: 'hold', aggro: 30, width: 2, morale: 70, fleeDir: { x: 0.5, z: -1 } },
          [{ type: 'gun', n: 2 }]);
    F.hata = [enemyGroup(rt, { fixed: true, faction: 'saito', name: '本丸の旗本', anchor: { x: HON.x - 8, z: HON.z + 3 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 8, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]), enemyGroup(rt, { fixed: true, faction: 'saito', name: '御殿前の控え', anchor: { x: HON.x + 8, z: HON.z + 1 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 6, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }])];
    // 合図の前に退ける守りを一度だけ束ね、任務と印と自動操作で共有する。
    F.honGuards = [...F.hata, F.tatsu, F.keep.guard];
    F.nGun = allyGroup(rt, { fixed: true, name: '丹羽の鉄砲衆', anchor: { x: 2, z: 112 }, facing: Math.PI, width: 8, aggro: 4, formation: 'line' }, dress([{ type: 'gun', n: 4 }], ODA));
    F.torchG = allyGroup(rt, { fixed: true, name: '火付けの足軽', anchor: { x: 26, z: 110 }, facing: Math.PI, width: 2, aggro: 0 }, dress([{ type: 'ashigaru', n: 2, o: { weapon: 'none' } }], ODA)); F.torchQueue = [];
    for (const g of [F.town2, F.ote, F.ote2, F.kguard, F.scout, F.ambush, F.ambushGun]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); g.aggro = Math.min(g.aggro, 10); }
    for (const g of [F.town, ...F.hata, F.tatsu]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); }
    F.town2.sent = false; F.ote2.sent = false;
    rt.scene.add(hut(W, HON.x + 8, HON.z + 12, 3, 2, 0));
    // ---- 大軍（軽い作り）：瑞龍寺山の信長の本陣、美濃三人衆、城を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    // 瑞龍寺山の本陣：信長と旗本（控えは周りの大軍。信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: ZUI.x, z: ZUI.z, facing: Math.atan2(HON.x - ZUI.x, HON.z - ZUI.z), team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: 70, z: 20 } });
    for (const [x, z, k] of [[ZUI.x - 10, ZUI.z + 8, 'oda'], [ZUI.x - 4, ZUI.z + 9, 'eiraku'], [ZUI.x + 4, ZUI.z + 9, 'oda'], [ZUI.x + 10, ZUI.z + 8, 'eiraku']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    DA(ZUI.x - 16, ZUI.z + 20, 26, 12, 220, -Math.PI * 0.75, 0x2b3140, 'oda', 15671);
    DA(ZUI.x + 14, ZUI.z - 12, 24, 10, 160, -Math.PI * 0.7, 0x2b3140, 'eiraku', 15672);
    for (const [x, z] of [[-58, 26], [-70, 30]]) rt.scene.add(nobori(W, x, z, 'inaba', 6));
    // ---- 部隊（butai.js）：囲む織田の備と、山の曲輪に籠もる斎藤の備。名目の数を持ち、近い所だけ本物の兵になる ----
    // （物語の組＝藤吉郎・柴田・丹羽の手はそのまま。部隊は、その外の大きな流れ＝軍議の作戦で動く手）
    const mkB = (o) => makeButai(rt, { real: 0, ...o });
    const ODA_B = { team: 0, faction: 'oda', armor: 0x2b3140 };
    F.oteYose1 = mkB({ ...ODA_B, name: '森可成の手', general: '森可成', kind: 'ashigaru', nominal: 180, maxReal: 0, at: { x: -40, z: 8 }, facing: Math.PI, flag: 'oda' });
    F.oteYose2 = mkB({ ...ODA_B, name: '坂井政尚の手', general: '坂井政尚', kind: 'ashigaru', nominal: 180, maxReal: 0, at: { x: 40, z: 4 }, facing: Math.PI, flag: 'eiraku' });
    F.sakuma = mkB({ ...ODA_B, name: '佐久間信盛の手', general: '佐久間信盛', kind: 'ashigaru', nominal: 220, maxReal: 0, at: { x: 80, z: 60 }, facing: Math.PI * 1.2, flag: 'oda' });
    F.ikeda = mkB({ ...ODA_B, name: '池田恒興の手', general: '池田恒興', kind: 'bow', nominal: 160, maxReal: 0, at: { x: 70, z: -86 }, facing: -Math.PI / 2, flag: 'oda' });
    F.sannin = mkB({ ...ODA_B, armor: 0x33302a, name: '美濃三人衆（稲葉一鉄の手）', kind: 'ashigaru', nominal: 240, maxReal: 0, at: { x: -64, z: 40 }, facing: Math.PI * 0.85, flag: 'inaba' });
    F.attackers = [F.oteYose1, F.oteYose2, F.sakuma, F.ikeda, F.sannin];
    const SAI_B = { team: 1, faction: 'saito', armor: 0x5a6682, flag: 'saito' };   // 暗い具足は影で黒い筒に見える。紺の胴に明るい威糸で、遠目にも腕と笠が分かれる
    F.oteB = mkB({ ...SAI_B, name: '大手の備（日根野弘就）', kind: 'ashigaru', nominal: 100, real: 4, maxReal: 4, at: { x: OTE.x, z: OTE.z - 6 }, facing: 0 });
    F.hyakuB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '百曲りの備（長井道利）', kind: 'bow', nominal: 80, real: 4, maxReal: 4, at: { x: HYAKU[3][0], z: HYAKU[3][1] }, facing: 0.6 });
    F.koshiB = mkB({ ...SAI_B, name: '水の手の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: -60, z: -84 }, facing: 0.4 });
    F.niB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '二の丸の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: NI.x, z: NI.z - 2 }, facing: Math.PI / 2 });
    F.honB = adoptGroup(mkB({ ...SAI_B, name: '主殿前の旗本', nominal: F.keep.guard.count, maxReal: 0, at: F.keep.guard.anchor }), F.keep.guard);
    F.defenders = [F.oteB, F.hyakuB, F.koshiB, F.niB, F.honB];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of [...F.attackers, ...F.defenders]) b.order({ id: 'hold' });
    // ---- 区域（siege_zones.js）：大手（三の丸）・腰曲輪・二の丸・本丸、と長良川の舟着き（龍興の退路） ----
    // 本丸は、自分が合図の段（step 4）に入るまで数えない（物語より先に味方が本丸を取ってしまわないように）
    const C = F.castle;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'ote', name: '大手（三の丸）', test: C.kuruwa.ote.test, pos: C.kuruwa.ote.centroid, need: 4, hold: 10, next: 'hon' },
        { id: 'koshi', name: '腰曲輪', test: (x, z) => C.kuruwa.koshi1.test(x, z) || C.kuruwa.koshi2.test(x, z), pos: C.kuruwa.koshi1.centroid, need: 3, hold: 8, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: C.kuruwa.ni.centroid, need: 4, hold: 10, next: 'hon' },
        // kaito 10/1：本丸の hold を 40→24 に詰めた（遊んで10分ほどかかる戦を4〜7分に。ここが一番長い待ちだった）
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: { x: HON.x, z: HON.z }, need: 5, hold: 24 },
        { id: 'funa', name: '長良川の舟着き', test: (x, z) => Math.hypot(x - FUNA.x, z - FUNA.z) < 12, pos: FUNA, need: 3, hold: 8, start: ZONE_STATE.NEUTRAL },
      ],
      links: [['ote', 'hon'], ['koshi', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 60,
      commander: () => F.keep && F.keep.lord,
      noReinforce: () => true,
      escape: { zoneId: 'funa', rally: FUNA },
      quietRange: [15, 25],
      onFall: (id) => this.onZoneFall(rt, id),
      // 曲輪の占拠は局地の働き。城全体の開城は合図の後の包囲で描く。
    });
    // ---- 城の頭（siege_ai.js）：持ち場・圧された時に退く・攻め手が乱れたら打って出る ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'ote', butai: F.oteB, at: { x: OTE.x, z: OTE.z - 4 }, next: 'hon', watch: [{ at: { x: 0, z: -40 }, range: 30 }] },
        { id: 'hyaku', butai: F.hyakuB, at: { x: HYAKU[3][0], z: HYAKU[3][1] }, next: 'hon', watch: [{ at: { x: HYAKU[2][0], z: HYAKU[2][1] }, range: 26 }] },
        { id: 'koshi', butai: F.koshiB, at: { x: -60, z: -84 }, next: 'ni' },
        { id: 'ni', butai: F.niB, at: { x: NI.x, z: NI.z - 2 }, next: 'hon' },
        { id: 'hon', butai: F.honB, at: { x: HON.x + 2, z: HON.z - 4 } },
      ],
      reserves: [],
      fallback: { x: HON.x, z: HON.z - 6 },
    });
    // 束33：縄張りの今の様子（nawabari.js・束19）を rt にも持たせる（軍議の俯瞰の説明・小地図・制圧の札）
    F.K = makeNawabari(rt, F.castle, { SZ: F.SZ, team: 1, friendTeam: 0 });
    rt.nawabari = F.K;
    F.keep.guard.formation = 'yari';
    for (const [x, z] of [[-24, -90], [22, -86], [OTE.x - 14, OTE.z - 12], [36, -116]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    // 井口の町の奥へ続く家並み（遠景）。焼き討ちが進むと、こちらにも煙が上がる
    F.farTown = [village(W, 40, 142, { n: 7, r: 26, rot: Math.PI, fields: 4, seed: 67, smoke: 0 }), village(W, -30, 130, { n: 6, r: 22, rot: Math.PI, fields: 4, seed: 68, smoke: 0 })];
    for (const v of F.farTown) rt.scene.add(v);
    for (const [x, z] of [[60, 120], [68, 110]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, INABA_DAWN);
    // 放火の場面は夜明け前で固定。夕暮れの自動処理へ渡さない。
    W.timeKey = 'night'; W.lookDark = true;
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '藤吉郎の旗へ寄り、下知を聞いて一隊を町へ進め' : '藤吉郎の旗へ寄れ。下知を聞いて町へ進め', 'main', true);
    rt.say(officer(rt), `${nm(rt)}、来たか。夜が白んできた。城下の井口の町に火をかける`, 4.5);
    rt.say(officer(rt), '城下を焼き、囲みの支度をする。……松明を用意せい', 4);
    // 話を聞くまでは旗を動かさず、町の敵の手前で下知を渡す。
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の旗（話を聞く）', { group: F.kino, guideAlways: true });
    rt.addInteract('talk', { x: 28, z: 104 }, '藤吉郎の話を聞く', () => {
      rt.uninteract('talk');
      rt.say(officer(rt), 'よし、行くぞ。わしの手から離れるな', 2.5);
      rt.after(2.5, () => this.burnStart(rt));
    }, { r: 5 });
    rt.after(35, () => {
      if (F.step !== 0 || F.ending || rt.over) return;
      rt.say('使番', '藤吉郎の下知じゃ。印の家に火をかけよ。離れた者は旗へ戻れ', 4);
      this.burnStart(rt);
    });
    buildBattleJin(rt);
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    F.torches = townTorches(rt);
    rt.setPhase('burn');
    sfx('horagai', 0.9);
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の旗', { group: F.kino, guideAlways: true });
    rt.uninteract('talk');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    // 信長で遊ぶ時：火付けは足軽の役目。当主は町の番の兵を払わせ、焼き働きを見届ける
    rt.obj('main', rt.G.lord ? `足軽に町を焼かせ、町の番の兵を払え（${NEED}軒）` : `松明で印の家に火を放て（${NEED}軒）`, 'main', true);
    rt.obj('side', '手向かわぬ町の者は討たない', 'side');
    rt.say(officer(rt), '印の家を頼む。ほかの家は仲間が焼く。手向かう者だけを相手にせよ', 3.5);
    if (!rt.G.lord) rt.after(9, () => { if (!rt.over) rt.say('足軽', '逃げ遅れた町の者がおる。刃を向けるな', 3.5); });   // 焼く迷い（A054）
    // 家の印は近い二軒だけ（残りは近づくと出る。update の markHouses）
    if (rt.G.lord) { for (const h of F.houses) if (h.mine) this.sendTorch(rt, h); }
    else for (const h of F.houses.filter((q) => q.mine)) rt.addInteract('h' + h.i, { x: h.x, z: h.z + 3 }, '家に火を放つ', () => this.light(rt, h), { r: 4, hold: 1.4 });
    this.markHouses(rt);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; }; };
    // 藤吉郎の旗は町の後ろ。先手と控えの間を退き道にする。
    go(F.kino, 32, 90); go(F.shiba, 40, 62); go(F.niwa, 0, 90);
    // 火の手を見た町の番の兵が、松明の組へ斬りかかってくる
    F.town.order = 'attack'; F.town.seekRange = 60; F.town.aggro = 16;
    rt.army.play('eshout', F.town.anchor, 1.3);
    rt.after(2, () => { if (!rt.over && F.step === 1) rt.say('斎藤方の足軽', '織田じゃ！　火付けじゃ、斬れ、斬れい！', 3); });
    rt.marker('town', centerOf(F.town), '町の番の兵', { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    // 松明を持った足軽が家に寄ってから火が上がる
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(14 + k * 9, () => this.sendTorch(rt, h)));
    rt.after(40, () => { if (F.ending || rt.over) return; for (const [x, z, sz] of [[34, 146, 2.6], [-26, 128, 2.4]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: sz }); });
    for (const c of F.civ) { c.routed = true; c.order = 'flee'; for (const u of c.units) u.fleeing = true; }
    // 家に火が付くのを待たず、町の後続も斬り込む。
    rt.after(12, () => {
      if (F.step !== 1) return;
      F.town2.sent = true;
      F.town2.order = 'attack'; F.town2.seekRange = 70;
      rt.army.play('eshout', F.town2.anchor, 1.5);
      rt.say('足軽', '城から斎藤勢じゃ！　一人で出るな、仲間と並べ！', 3.5);
      rt.marker('town2', centerOf(F.town2), '城から下りた斎藤勢', { red: true, group: F.town2 });
    });
  },

  markHouses(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 今の目当ては八歩ほど優先する。等距離の家の間で印を揺らさない。
    const want = F.houseTargets || (F.houseTargets = [null, null]);
    const old0 = want[0], old1 = want[1];
    let first = null, second = null, d1 = Infinity, d2 = Infinity;
    if (F.lit < NEED) for (const q of F.houses) {
      if (!q.mine || q.burnt) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) - (q === old0 || q === old1 ? 8 : 0);
      if (d < d1 || (d === d1 && q.i < first.i)) { second = first; d2 = d1; first = q; d1 = d; }
      else if (d < d2 || (d === d2 && q.i < second.i)) { second = q; d2 = d; }
    }
    want[0] = first; want[1] = second;
    for (const q of F.houses) if (q.mine && !want.includes(q)) rt.unmark('h' + q.i);
    for (let i = 0; i < want.length; i++) {
      const q = want[i];
      if (!q) continue;
      const label = i === 0 ? '火を放つ家' : '次に焼く家';
      const marker = rt.markers.find((m) => m.id === 'h' + q.i);
      if (marker) marker.label = label;
      else rt.marker('h' + q.i, { x: q.x, z: q.z + 3 }, label, { h: 3, guideAlways: true });
    }
  },
  // 味方の足軽が松明を持って家に寄り、着いてから火が上がる
  sendTorch(rt, h) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1 || F.torchHouse === h || F.torchQueue.includes(h)) return;
    F.torchQueue.push(h);
  },
  torchTick(rt) {
    const F = rt.flags, g = F.torchG;
    if (F.ending || gone(g) || g.woundOut) return;
    if (!F.torchHouse) {
      while (F.torchQueue.length && F.torchQueue[0].burnt) F.torchQueue.shift();
      if (!F.torchQueue.length) return;
      F.torchHouse = F.torchQueue.shift();
      const h = F.torchHouse;
      g.order = 'move'; g.dest = { x: h.x + 2, z: h.z + 3 }; g.speed = 2.4;
      g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = gg.dest; };
    }
    const h = F.torchHouse, c = g.center();
    if (Math.hypot(c.x - h.x - 2, c.z - h.z - 3) > 3) { F.torchHold = 0; return; }
    F.torchHold = (F.torchHold || 0) + 0.5;
    if (F.torchHold < 1.5) return;
    if (h.mine && F.lit < NEED) this.light(rt, h, false); else burnTownHouse(rt, h);
    F.torchHouse = null; F.torchHold = 0;
  },
  // そばの組頭の下知は即座に出す。達成札や遠い使番で次の行動を隠さない。
  nextObj(rt, text) {
    if (!rt.over && !rt.flags.ending) rt.obj('main', text, 'main', true);
  },

  light(rt, h, own = true) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1) return;
    burnTownHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    if (own && !rt.G.lord) rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit === NEED) {
      this.nextObj(rt, '町の出口で仲間と並び、残る斎藤の兵を追い払え');
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); this.sendTorch(rt, q); }
      rt.say(officer(rt), '町は燃えた。……残る斎藤勢を追い払え！', 3.5);
      // 町の斎藤の兵を追い払うまで、次の攻めへ進まない。
      F.clearT = rt.t;
    } else {
      this.markHouses(rt);
      rt.objProgress('main', `${F.lit}／${NEED}軒・次は印の家へ。ほかは仲間の担当`);
      if (own) rt.say('足軽', F.lit === 1 ? '火が付いた。次は印の家じゃ' : 'あと一軒じゃ。ほかの家はわしらが焼く', 3);
    }
  },

  // ② 翌日：山の麓に鹿垣を結い、大手の坂を駆け下りる斎藤勢を受け止める
  // （信長公記：町を焼いた翌日、四方に鹿垣を結い廻して取り籠めた。鹿垣は麓に結う。山の中腹には置かない）
  sally(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    if (F.torches) { F.torches.stop(); F.torches = null; }
    rt.setPhase('ote');
    rt.unmark('town'); rt.unmark('town2');
    for (const q of [F.town, F.town2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 20); }
    // 日をまたぐ移動は暗転で区切り、味方と一緒に翌朝の持ち場から再開する。
    blackCut(rt, () => {
      if (rt.over || F.ending || F.step !== 2) return;
      const W = rt.world;
      W.lookDark = false; W.setTime('morning');
      if (W.fade) { W.fade = null; W.applyLook(W.lookOf('morning')); W.updateEnv(); }
      for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) {
        const x = g === F.kino ? -4 : g === F.shiba ? 13 : g === F.niwa ? -21 : -12;
        placeGroup(rt, g, x, SHIKA_Z + (g === F.nGun ? 3 : 5));
        g.aggro = 12; g.facing = Math.PI;
      }
      placePlayer(rt, 2, SHIKA_Z + 7, Math.PI);
      let row = 0;
      for (const q of rt.squadGroups || []) placeGroup(rt, q, 4 + row++ * 3, SHIKA_Z + 12);
      rt.banner('翌朝、城を取り籠める', '藤吉郎の手と鹿垣の内で城兵を迎える');
    });
    sfx('taiko', 1);
    // 一夜明けて、町は焼け跡。火は落ち、煙だけが残る
    for (const h of F.houses) charHouse(rt, h);
    for (const [x, z, sz] of [[10, 70, 2.4], [-6, 50, 2], [38, 52, 2.2]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 4, z, { size: sz });
    rt.banner('翌日、城を取り籠める', '焼け跡の先、山の麓に鹿垣を結う');
    this.nextObj(rt, '藤吉郎の旗の下へ。鹿垣の内で、坂を下る城兵を受け止めよ');
    // 足軽が鹿垣（枝を組んだ低い垣）を一間ずつ結っていく。二か所は打って出る口に空けておく
    for (let i = 0; i < 8; i++) rt.after(2 + i * 1.5, () => {
      if (F.step !== 2 || SHIKA_GAPS.includes(i)) return;
      const x = SHIKA_X0 + i * SHIKA_W, z0 = SHIKA_Z + Math.sin(i) * 1.2, z1 = SHIKA_Z + Math.sin(i + 1) * 1.2;
      const seg = wallLine(rt, [[x, z0], [x + SHIKA_W, z1]], { team: 0, hp: 260, name: '鹿垣', segLen: SHIKA_W, meshOpt: { h: 1.4 } });
      for (const q of seg) q.noTarget = true;
      rt.army.play('knock', { x: x + SHIKA_W / 2, z: z0 }, 0.6);
    });
    F.ote.order = 'hold';
    // 鹿垣の内の組は藤吉郎・柴田・丹羽がその場で下知する（瑞龍寺山からの使番を待たない。待つと列が揃わず、搦手へも出られない）
    for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) g.siegeAI = true;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.facing = Math.PI; gg.aggro = 12; }; };
    go(F.kino, -4, SHIKA_Z + 5); go(F.shiba, 13, SHIKA_Z + 5); go(F.niwa, -21, SHIKA_Z + 5); go(F.nGun, -12, SHIKA_Z + 3);
    // 森・坂井の手は大手の坂の下で城兵を引き付けたまま（本物の兵に替えない。鹿垣の内は物語の組が受け持つ）
    // 美濃三人衆は西の端の後ろに控える（下の軽い合戦と重ねない）
    F.sannin.order({ id: 'move', to: { x: -66, z: 58 } });
    // 竹束（taketaba.js）：鉄砲衆の前に竹束を押し立て、陰から撃つ
    F.TA = makeTabaAdvance(rt, {
      near: 30, holdRanged: 20, holdMelee: 8,
      items: [{ g: F.nGun, yose: { x: -12, z: SHIKA_Z + 3 } }],
      avoid: [rt.player.u.pos && { x: rt.player.u.pos.x, z: rt.player.u.pos.z }],
    });
    // 麓の左右でも、囲みの手と打って出た城兵がぶつかる（軽い大軍の合戦。兵力には数えない）
    const side = (flag, armor, count, team, faction) => ({ flagTex: flagTexture(flag), armor, count, team, faction });
    const lc = (o) => rt.world.addClash({ rt, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), ...o });
    F.footClash = [
      lc({ x: -68, z: 30, facing: Math.PI, w: 34, gap0: 18, closeSpeed: 2.6, seed: 15673, noRout: true, killRate: 0.1, A: side('inaba', 0x33302a, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
      lc({ x: 62, z: 28, facing: Math.PI, w: 32, gap0: 18, closeSpeed: 2.6, seed: 15674, noRout: true, killRate: 0.1, A: side('oda', 0x2b3140, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
    ];
    rt.say(officer(rt), '町は焼けた。今日は麓に鹿垣を結い、城を取り籠める', 3.5);
    rt.after(4, () => { if (F.step === 2) rt.say(officer(rt), '城兵が坂を下ってくるぞ。鹿垣の内で槍をそろえ、受け止めよ！', 3.5); });
    rt.after(9, () => { if (F.step === 2) rt.say('鉄砲頭', '鉄砲は引きつけてから放つ。崩れてから突け', 3.5); });
    // 山の上で法螺と太鼓。坂の上に旗が並び、鬨の声とともに駆け下りてくる
    rt.after(12, () => {
      if (F.step !== 2) return;
      sfx('horagai', 0.7);
      rt.army.play('jindaiko', F.ote.anchor, 1.3);
      rt.say('足軽', '山の上で法螺じゃ……大手の坂に旗が並んだ！', 3);
    });
    rt.after(16, () => {
      if (F.step !== 2 || gone(F.ote)) return;
      F.ote.noAI = false; F.ote.siegeAI = true; F.ote.fire = true;
      march(F.ote, [[-20, 25], [-20, 31], [-21, SHIKA_Z + 5]], 'attack');
      rt.army.play('eshout', F.ote.anchor, 1.7);
      rt.army.play('toki', F.ote.anchor, 1.3);
      rt.say('斎藤方の侍', '町を焼いた織田の者どもを追い落とせ！', 3);
      rt.marker('ote', centerOf(F.ote), '大手の斎藤勢', { red: true, group: F.ote });
      for (const C of F.footClash) C.go();
    });
    // 新手は初めの勢が崩れたら五秒後、遅くとも四十五秒で下りてくる
    rt.after(36, () => this.oteWarn(rt));
    rt.after(45, () => this.ote2(rt));
  },
  oteWarn(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step !== 2 || F.ote2.sent || F.oteWarned) return;
    F.oteWarned = true;
    rt.say('足軽', '大手の控えが動いた！　仲間と並んで新手に備えよ', 3);
  },
  ote2(rt) {
    const F = rt.flags;
    {
      if (F.step !== 2 || F.ote2.sent) return;
      F.ote2.sent = true; F.ote2T = rt.t;
      F.ote2.noAI = false; F.ote2.siegeAI = true; F.ote2.fire = true;
      march(F.ote2, [[-24, 21], [-20, 28], [-20, 31], [-21, SHIKA_Z + 5]], 'attack');
      rt.army.play('eshout', F.ote2.anchor, 1.4);
      rt.say('足軽', '坂の上から新手じゃ！　鹿垣を破らせるな！', 3);
      // 麓の左右の城兵も新手に合わせて押し出す
      for (const C of F.footClash || []) C.push('A', 0.35);
      rt.marker('ote2', centerOf(F.ote2), '大手の新手', { red: true, group: F.ote2 });
    }
  },

  // ③ 搦手の道を登る
  // 麓から金華山の急な斜面を組ごと登らせると列が詰まって動かない。大手で城兵を引き付ける間に、
  // 藤吉郎の手は裏道の登り口まで回った所から始める（傷・組の数・身分はそのまま）
  karamete(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('karamete');
    rt.unmark('ote'); rt.unmark('ote2');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.say(officer(rt), '大手は固い。……じゃが、山の裏に細い道があると、この辺りの者に聞いた', 3.5);
    const K = F.kino;
    // 暗転の間に、裏道の登り口へ回る
    blackCut(rt, () => {
      if (rt.over || F.ending) return;
      // 麓の軽い合戦は山の裏からは見えない。描く物と毎コマの計算を外す（形は合戦ごとの複製なので捨ててよい）
      if (F.footClash) {
        const W = rt.world;
        W.clashes = (W.clashes || []).filter((c) => !F.footClash.includes(c));
        for (const C of F.footClash) { C.mesh.removeFromParent(); C.mesh.traverse((o) => o.geometry?.dispose()); }
        F.footClash = null;
      }
      K.formation = 'column'; K.colW = 2; K.facing = -Math.PI / 2;
      placeGroup(rt, K, KARA_FOOT.x, KARA_FOOT.z);
      placePlayer(rt, KARA_FOOT.x + 3, KARA_FOOT.z, -Math.PI / 2);
      let row = 0;
      for (const q of rt.squadGroups || []) { q.formation = 'column'; q.colW = 2; q.facing = -Math.PI / 2; placeGroup(rt, q, KARA_FOOT.x - 12 - row++ * 6, KARA_FOOT.z); }
      // 蜂須賀小六の手が列の後ろに付く（搦手の一番乗りに藤吉郎の古参が加わった伝え。細い道の列を厚くする）
      if (!F.hachi) {
        F.hachi = allyGroup(rt, { fixed: true, name: '蜂須賀小六の手', anchor: { x: KARA_FOOT.x - 9, z: KARA_FOOT.z }, facing: -Math.PI / 2, width: 2, aggro: 10 },
          dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀小六' } }, { type: 'ashigaru', n: 7 }], ODA));
        F.hachi.siegeAI = true; F.hachi.noRout = true;
        march(F.hachi, KARA_TRAIL.slice(0, -1), 'attack');
      }
      rt.banner('搦手へ', '土地の者の案内で、藤吉郎の手が山の裏の細道を登る');
      rt.say('', '――大手で城兵を引き付ける間に、藤吉郎の手は山の西の裏道へ回った', 4);
      rt.after(4, () => { if (!rt.over && !F.ending) rt.say(officer(rt), `${nm(rt)}、ついて来い。わしらは裏から登って、本丸の脇に火をつける`, 4); });
      K.order = 'path'; K.path = KARA_TRAIL.slice(0, -1); K.pathIdx = 0; K.speed = 2.5; K.formation = 'column'; K.colW = 2; K.roadColumn = true; K.aggro = 6; K.holdFire = true; K.fire = false;   // 細道を登る間は鉄砲を撃たず列に付いて歩く
      K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'yari'; g.aggro = 14; g.seekRange = 24; if (F.guardOn) g.order = 'attack'; };
      F.climbFriends = [K, F.hachi];
      F.climbFoes = [...F.climbGuards, F.scout, F.patrol, F.ambush, F.koshiGuard, F.kguard];
    });
    this.nextObj(rt, '藤吉郎の手に続き、山の裏道から搦手の木戸へ');
    // 印は進み具合と同じ的（搦手の木戸）に。藤吉郎の名札は頭の上に出る
    rt.marker('kido', { x: -30, z: -118 }, '搦手の木戸', { h: 3, guideAlways: true });
    F.climbSpots = 0; F.karaNext = 0;
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 20 : -16, z: SHIKA_Z + 6 }; }
    // 軍議で決めた作戦で、外の部隊が動き出す（七曲り・百曲り・水の手）
    this.runStrategy(rt);
    // 搦手の木戸の守り
    F.kguard.order = 'hold';
  },

  // 搦手の登りの途中の出来事：岩場の足止め、藤吉郎の小声、物見との小競り合い
  climbEvents(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const lead = F.kinoU.pos;
    const near = (i, r) => Math.min(Math.hypot(p.x - KARA[i][0], p.z - KARA[i][1]), Math.hypot(lead.x - KARA[i][0], lead.z - KARA[i][1])) < r;
    if (F.climbSpots === 0 && near(1, 9)) {
      F.climbSpots = 1;
      rt.say(officer(rt), '（小声で）ここから岩場じゃ。細い道を歩き、藤吉郎の旗を離れるな', 3.5);
      // 足止めのために隊の歩みを半分にしない。岩場でも同じ道を進む。
      rt.army.play('knock', { x: KARA[1][0], z: KARA[1][1] }, 0.5);
    } else if (F.climbSpots === 1 && near(1, 14)) {
      F.climbSpots = 2;
      // 斎藤の物見が二人。見つかれば声を上げられる前に討て
      F.scout.order = 'attack';
      rt.say('足軽', '物見じゃ！　声を上げさせるな！', 2.5);
      rt.marker('scout', centerOf(F.scout), '物見', { red: true, group: F.scout });
      // 物見の声で、見回りの組が細道を駆け下りてくる。列の頭と槍がぶつかる
      rt.after(2, () => {
        if (F.ending || F.guardOn || gone(F.patrol)) return;
        F.patrol.order = 'attack'; F.patrol.noAI = false; F.patrol.seekRange = 30; F.patrol.aggro = 14;
        rt.army.play('eshout', F.patrol.anchor, 1.3);
        rt.say('斎藤方の侍', '裏から織田じゃ！　ここで止めよ、通すな！', 3);
        rt.marker('patrol', centerOf(F.patrol), '見回りの組', { red: true, group: F.patrol });
        F.kino.aggro = 14; F.kino.seekRange = 18;
      });
    } else if (F.climbSpots === 2 && near(2, 14)) {
      F.climbSpots = 3;
      rt.unmark('scout');
      rt.say(officer(rt), '（小声で）あの木戸を抜ければ本丸の裏じゃ。……一気に行くぞ', 3.5);
      // 曲がり角の伏兵（GAME_C）：岩陰に槍が潜み、上の段から鉄砲が二挺。細い道なので一度に当たれる数は少ない
      rt.after(3, () => {
        if (F.ending || F.guardOn) return;
        F.ambush.order = 'attack';
        // 列の藤吉郎の手も槍を返して伏兵に当たる（自分ひとりに伏兵を受けさせない）
        F.kino.aggro = 14; F.kino.seekRange = 18;
        F.ambushGun.order = 'hold';
        rt.army.play('eshout', F.ambush.anchor, 1.2);
        rt.say('足軽', '岩陰じゃ！　曲がり角に伏せておった！', 2.5);
        rt.marker('ambush', centerOf(F.ambush), '岩陰の伏兵', { red: true, group: F.ambush });
      });
    }
    // 物見櫓：搦手の岩場を過ぎた辺りで気付く（任務ではない。登って射手を討てば手柄）
    if (!F.towerSeen && F.climbSpots >= 1 && Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < 22) {
      F.towerSeen = true;
      rt.say(officer(rt), '（小声で）物見櫓じゃ。射手が気付く前に、登って黙らせられればよいが……', 3.5);
      rt.marker('tower', { x: TOWER.x, z: TOWER.z }, () => gone(F.towerArchers) ? null : '物見櫓の射手', { red: true, group: F.towerArchers });
    }
  },
  // 竹束を抱える／据える（castle-design 7-3）：抱えている間は速さ 6 割・突けない（player.js の flags.carry）。
  // 落石・矢を前から 7 割防ぐ（siege_rocks.js の guarded・army_ranged.js の竹束の陰と同じ考え）
  tabaBack(rt, on) {
    const F = rt.flags;
    if (on && !F.tabaBackMesh) {
      const m = tabaMesh(rt.world, 0, 0, 0);
      m.position.set(0, 0.2, -0.35); m.rotation.set(0.25, 0, 0); m.scale.setScalar(0.62);
      rt.player.u.mesh.add(m);
      F.tabaBackMesh = m;
    } else if (!on && F.tabaBackMesh) { rt.player.u.mesh.remove(F.tabaBackMesh); F.tabaBackMesh = null; }
  },
  tabaTake(rt) {
    const F = rt.flags;
    if (F.carry) return;
    F.carry = true;
    F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
    this.tabaBack(rt, true);
    rt.uninteract('tabaPile'); rt.scene.remove(F.tabaPile);
    rt.addInteract('tabaSet', rt.player.u.pos, '竹束を据える', () => this.tabaSet(rt), { r: 3, hold: 1 });
    rt.obj('carry', '竹束を担いでいる。歩みが遅い。「竹束を据える」で置く', 'order');
    rt.bark('竹束を担いだ。歩みが遅くなる。「竹束を据える」を長く押すと置ける', true);
  },
  tabaSet(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (!F.carry) return;
    F.carry = false; F.carryPrev = null; rt.objRemove('carry');
    this.tabaBack(rt, false);
    rt.uninteract('tabaSet');
    const m = tabaMesh(rt.world, p.x, p.z, rt.player.yaw || 0);
    rt.scene.add(m);
    F.tabaPile = m;
    rt.addInteract('tabaPile', { x: p.x, z: p.z }, '竹束を担ぐ', () => this.tabaTake(rt), { r: 3, hold: 1 });
  },
  // 搦手の守りとぶつかる
  guardFight(rt) {
    const F = rt.flags;
    if (F.guardOn) return;
    F.guardOn = true; F.guardT = rt.t;
    rt.unmark('kido');
    this.nextObj(rt, '搦手の守りを破れ');
    F.kguard.order = 'hold'; F.kguard.aggro = 12;
    // 曲がり角の手前で縦列を解くと柵へ直進する。木戸まで道をたどってから槍をそろえる。
    if (F.kino.order !== 'path') { F.kino.order = 'attack'; F.kino.formation = 'yari'; }
    F.kino.seekRange = 24; F.kino.holdFire = false; F.kino.fire = true;
    if (F.hachi && !gone(F.hachi) && F.hachi.order !== 'path') { F.hachi.order = 'attack'; F.hachi.seekRange = 24; }
    rt.army.play('eshout', { x: -30, z: -118 }, 1.4);
    rt.say('斎藤方の足軽', '裏から来たぞ！　こんな所まで……！', 3);
    rt.marker('kguard', centerOf(F.kguard), '搦手の守り', { red: true, group: F.kguard });
  },

  // ④ 本丸の脇に火を放つ
  signal(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.unmark('kguard');
    rt.award((t) => t.side.push('搦手の木戸を破った'), '搦手の守りを破った');
    rt.say(officer(rt), '本丸の守りを退け、小屋に火を放て。瑞龍寺山の本陣への合図じゃ', 4);
    this.nextObj(rt, '仲間と本丸の旗本を退けよ。城主を討つ任務ではない');
    march(F.kino, [[HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]], 'attack');
    // 木戸が破れ、裏道に残った鉄砲・射手も本丸の奥へ退く（背中から撃ち続けさせない）
    for (const g of [F.kguard, F.ambushGun, F.towerArchers, F.ambush, F.koshiGuard, F.scout, F.patrol, ...F.climbGuards]) if (g && !gone(g)) { g.noRout = false; g.morale = 0; }
    // 櫓の上の射手は降りられない。弓を下ろして黙る
    if (F.towerArchers) { F.towerArchers.fire = false; F.towerArchers.holdFire = true; F.towerArchers.aggro = 0; }
    if (F.hachi && !gone(F.hachi)) march(F.hachi, [[HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]], 'attack');
    // 搦手の騒ぎで本丸の守りが割れた所へ、七曲りを押し上げた大手の寄せ手の先手が本丸の口へ上がってくる（遊びの補い）。
    // 旗本を表と裏から挟み、本丸の前が入り乱れる。城主を討つ役ではない
    if (!F.oteUp) {
      rt.after(8, () => {
        if (rt.over || F.ending || F.step !== 4) return;
        F.oteUp = allyGroup(rt, { fixed: true, name: '大手から上がった寄せ手', anchor: { x: NIMON.x + 4, z: NIMON.z + 4 }, facing: Math.atan2(HON.x - NIMON.x, HON.z - NIMON.z), width: 4, aggro: 14, seekRange: 30, order: 'attack', formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }], ODA));
        F.oteUp.noRout = true;
        rt.army.play('eshout', NIMON, 1.6);
        rt.say('足軽', '二ノ門から味方じゃ！　大手の衆が上がってきたぞ！', 3);
      });
    }
    // 裏から破られた本丸の守りは浮き足立つ（三人衆の寝返りの後で、もともと士気が低い）
    for (const g of [...F.hata, F.tatsu]) if (!gone(g)) { g.order = 'hold'; g.aggro = 10; g.morale = Math.min(g.morale, 60); }
    this.guideHon(rt);
  },
  // 次に退ける守りを一組だけ指す。主殿の奥へ城主を追わせない。
  guideHon(rt) {
    const F = rt.flags;
    let target = null, left = 0;
    for (const g of F.honGuards) if (!gone(g)) { if (!target) target = g; left++; }
    if (!target) return;
    if (F.honTarget !== target) {
      F.honTarget = target;
      rt.marker('honGuard', () => {
        for (const u of target.units) if (u.alive && !u.fleeing) return u.pos;
        return null;
      }, target.name, { red: true, group: target });
    }
    rt.objProgress('main', `${target.name}を仲間と退けよ。残る守りは${left}組`);
  },
  // 主殿への到達だけでは開城や城主の討死にしない。
  reachTatsu(rt) {
    const F = rt.flags;
    if (F.ending || F.step < 4) return;
    F.reachedTatsu = true;
    if (F.keep.lord) {
      const u = F.keep.lord, g = u.group;
      u.noTarget = true;
      g.order = 'move'; g.dest = { x: F.keep.spot.x, z: F.keep.spot.z - 1.5 };
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; };
    }
    rt.bark('近習が城主を守り、奥で退く支度をしている。組へ戻り、合図の火を守れ');
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig || F.step !== 4 || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本', '二の丸から上がった斎藤勢']) rt.unmark(n2);
    rt.unmark('honGuard');
    const S = { x: HON.x + 8, z: HON.z + 12 };
    F.sig = S; F.sigT = rt.t;
    this.nextObj(rt, '本丸の脇の小屋に火を放ち、瑞龍寺山の本陣へ合図を送れ');
    rt.say(officer(rt), '今じゃ、火を放て！', 2.5);
    rt.marker('sig', S, '火を放つ', { h: 3 });
    rt.addInteract('sig', { x: S.x - 4, z: S.z }, '小屋に火を放つ（合図）', () => this.win(rt), { r: 4, hold: 1.6 });
  },

  // 軍議の作戦（七曲り・百曲り・水の手）で、外の部隊を動かす。自分の筋（藤吉郎の手と搦手）はそのまま
  runStrategy(rt) {
    const F = rt.flags;
    if (F.stratRun) return;
    F.stratRun = true;
    const requested = window.__inabaStrategy || F.strategy;
    const s = F.strategy = STRATS[requested] ? requested : 'nanamagari';
    const pin = (b, x) => b.order({ id: 'move', to: { x, z: -30 } });
    // （本物が出るのを待って、道の下知を出し直す。軽い大軍だけの間に出した下知は、新しく出た本物の組へ届かない）
    rt.after(3, () => { for (const b of F.attackers) if (b._route && !b._wait && b._i > 0) { const p = b._route[b._i - 1]; b.order({ id: 'move', to: { x: p[0], z: p[1] } }); } });
    if (s === 'hyakumagari') {
      // 大手は鹿垣で構えて引き付け、佐久間・池田が東の百曲りを登って本丸の脇へ
      setRoute(F.sakuma, R_HYAKU, F); setRoute(F.ikeda, R_HYAKU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('柴田勝家', '佐久間と池田が百曲りを登る。大手は引き付けておくだけでよい', 3.5));
    } else if (s === 'mizunote') {
      // 大勢を水の手へ。池田と美濃三人衆が藤吉郎の手の後ろから登る（大手は手薄になる）
      setRoute(F.ikeda, R_MIZU, F); setRoute(F.sannin, R_MIZU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('稲葉一鉄', '水の手へは、わしらも続く。藤吉郎が先じゃ、わしらはその後ろを固める', 3.5));
    } else {
      // 七曲り（史実の既定）：大手の寄せ手が七曲りを押し上げ、大手の木戸の前で城兵を引き付ける
      setRoute(F.oteYose1, R_NANA, F); setRoute(F.oteYose2, R_NANA, F); setRoute(F.sakuma, R_NANA, F);
      rt.after(5, () => rt.say('柴田勝家', '森と坂井が七曲りを押し上げる。木戸の前で城兵を引き付けるぞ', 3.5));
    }
    rt.bark(`下知：${STRATS[s].short}へ寄せる`);
  },

  // 区域が落ちた（siege_zones の onFall）：知らせだけ。勝ち負けは筋（合図の火）と本丸で決める
  onZoneFall(rt, id) {
    const F = rt.flags;
    F.fell = F.fell || {};
    if (F.fell[id]) return;
    F.fell[id] = true;
    if (id === 'hon') rt.bark('本丸の持ち場を確保した。旗本を退け、脇の小屋の合図を忘れるな');
    if (id === 'ote' && F.step < 4 && sightPoint(rt, OTE)) rt.say('柴田勝家', '大手の木戸を取ったぞ！　城兵は本丸へ退いた', 3);
    // 舟着きの占拠だけでは城主の退路全体を断ったと判断しない。
  },

  // 囲みの部隊と山の曲輪の備の押し合い（遠くの数の戦い）。一番乗りで待っている所・着いた所で、近い備と削り合う
  siegeClash(rt, dt) {
    const F = rt.flags;
    for (const a of F.attackers) {
      // 近くの戦いと本物の兵の損害は、槍・矢の当たりで決める。
      if (a.aliveNominal() <= 0 || !a._done || a.realCount() > 0 || Math.hypot(a.pos.x - rt.player.u.pos.x, a.pos.z - rt.player.u.pos.z) < 35) continue;
      for (const d of F.defenders) {
        if (d === F.honB || d.aliveNominal() <= 0 || d.realCount() > 0 || Math.hypot(d.pos.x - rt.player.u.pos.x, d.pos.z - rt.player.u.pos.z) < 35) continue;
        if (Math.hypot(a.pos.x - d.pos.x, a.pos.z - d.pos.z) < 14 && Math.abs(rt.world.heightAt(a.pos.x, a.pos.z) - rt.world.heightAt(d.pos.x, d.pos.z)) < 3 && !rt.army.wallBetween(a.pos, -1, d.pos, false)) clash(a, d, dt, 0.12);
      }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 4 || !F.sig || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    F.ending = true; F.win = true; F.endT = rt.t;
    rt.setPhase('end');
    rt.uninteract('sig'); rt.unmark('sig');
    const S = F.sig;
    rt.world.addFire(S.x, S.z, { h: 1.6 });
    rt.world.addSmokeColumn(S.x, rt.world.heightAt(S.x, S.z) + 6, S.z, { size: 3 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '搦手から本丸に火を放った', pts: 20 }; }, '任務達成・本丸に合図の火');
    if (!F.civHurt && !F.civDone) { F.civDone = true; rt.objDone('side'); rt.award((t) => t.side.push('町の者を討たなかった'), '副任務：町の者を討たなかった'); }
    rt.unzone('ote'); rt.unmark('ote3');
    // 合図だけで、まだ別の曲輪にいる守兵まで崩さない。
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('合図の火が上がる', '組をまとめ、持ち場を守れ。囲みはまだ続く');
    rt.after(5, () => {
      rt.banner('八月十五日、城が開く', '囲みの末、龍興は舟で長島へ退いた');
      rt.say('', '――町への放火と翌日の囲みから、半月ほどが過ぎた。城は織田方へ渡った', 5);
    });
    // 合図の後も各備は持ち場を保つ。
    for (const b of F.attackers) b.order({ id: 'hold' });
    rt.army.play('eshout', { x: OTE.x, z: OTE.z + 20 }, 2);
    rt.after(2, () => { if (F.kinoU.alive) rt.say(officer(rt), '聞こえるか、麓の鬨じゃ。瑞龍寺山の殿にも、この火は見えておる', 3); });
    rt.after(11, () => rt.say('', '――信長は井口を「岐阜」と改め、「天下布武」の印を使い始めた', 4));
    rt.after(15.5, () => rt.say('', '――翌年九月。京へ上る道を、近江の六角が箕作城で塞ぐ', 4));
    rt.player.u.invuln = true;
    // 戦固有の終幕（開城・岐阜・箕作城への一行）を最後まで見せる。共通の追撃に替えて時計を消さない
    rt.finish({ scriptedEnd: true }, 20);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.torches) {
      if (F.step === 1 && !F.ending && !rt.over && rt.player.u.alive) F.torches.update();
      else { F.torches.stop(); F.torches = null; }
    }
    // 旗から離れた時は任務と同じ矢印で戻り道を伝える。距離に余裕を持たせ、札を揺らさない。
    if (rt.t >= (F.regroupAt || 0)) {
      F.regroupAt = rt.t + 1;
      const p = rt.player.u.pos, q = F.kinoU.pos;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      F.regroup = d > (F.regroup ? 24 : 40);
      if (F.regroup && !F.ending && !F.regroupSaid) {
        F.regroupSaid = true;
        rt.bark('味方から離れた。矢印の先の藤吉郎の旗へ戻れ', true);
      }
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 固有の守兵・供も含めた実兵枠。部隊だけの枠に任せて二百五十人を越さない。
    if (rt.t >= (F.budgetAt || 0)) {
      F.budgetAt = rt.t + 1;
      let live = 0;
      for (const u of rt.army.units) if (u.alive && !u.isStruct) live++;
      let room = Math.max(0, 235 - live);
      for (const b of rt.butai || []) {
        if (b.noSwitch) continue;
        const have = b.realCount();
        const near = Math.hypot(b.pos.x - rt.player.u.pos.x, b.pos.z - rt.player.u.pos.z) < 35;
        const target = F.ending ? have : near ? (F.defenders.includes(b) ? (F.step === 3 && (b === F.koshiB || b === F.niB) ? 0 : 4) : Math.max(12, have)) : F.attackers.includes(b) ? (F.step >= 3 ? 4 : 0) : (b === F.oteB || b === F.hyakuB ? 4 : 0);
        b.maxReal = Math.min(target, have + room); room -= Math.max(0, b.maxReal - have);
        // 囲みの備は一万五千の内の一手。近くで本物になった数人が崩れて「崩れました」を重ねない
        if (b.real && F.attackers.includes(b)) b.real.noRout = true;
      }
    }
    butaiTick(rt, dt);
    if (F.step >= 3) tickRoutes(F.attackers, F, dt);
    if (rt.t >= (F.torchTickAt || 0)) { F.torchTickAt = rt.t + 0.5; this.torchTick(rt); }
    if (rt.over || F.ending || !rt.player.u.alive) return;
    if (F.SZ) F.SZ.tick(dt);
    if (F.keep && F.step >= 4) { F.keep.tick(); if (F.keep.lord) F.keep.lord.noTarget = true; }
    if (F.ending || rt.over) return;
    if (!F.woundAdvice && rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.75) {
      F.woundAdvice = true;
      F.woundAdviceAt = rt.t;
      rt.bark(F.step === 2 ? '傷が深い。下がれ！　鹿垣の内の味方へ退け' : '傷が深い。下がれ！　来た道から味方の後ろへ退け', true);
    }
    if (F.woundAdvice && !F.deepWoundAdvice && rt.t - F.woundAdviceAt >= 8 && rt.player.u.hp < rt.player.u.maxHp * 0.4) {
      F.deepWoundAdvice = true;
      rt.bark('このままでは倒れる。敵を追わず、味方の後ろへ退け！', true);
    }
    // 層（Z0〜Z5）：自分が新しい層へ入ったら一度だけ知らせる（金華山を下から上へ登っている手応え）
    { const p = rt.player.u.pos, L = LAYERS.find((q) => q.test(p.x, p.z)); if (L && L.id !== F.layer) { const first = !F.layerSeen[L.id]; F.layer = L.id; F.layerSeen[L.id] = true; if (first && L.id !== 'Z0') rt.bark(L.name); } }
    if (F.DA) F.DA.tick(dt);
    if (F.K) F.K.tick(dt);
    F.clashSeconds = F.step >= 3 ? (F.clashSeconds || 0) + dt : 0;
    if (F.step >= 3 && F.clashSeconds >= 1) { this.siegeClash(rt, F.clashSeconds); F.clashSeconds = 0; }
    // 合図を放つか本人が倒れるまで続く。歩行時間だけで任務を失敗にしない。
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    if (F.rocks) F.rocks.tick(dt);
    // 竹束を抱えている間は、重くて速く歩けない（前の足どりの六割に。castle-design 7-3）
    if (F.carry && F.carryPrev) {
      const u = rt.player.u;
      u.pos.x = F.carryPrev.x + (u.pos.x - F.carryPrev.x) * 0.6;
      u.pos.z = F.carryPrev.z + (u.pos.z - F.carryPrev.z) * 0.6;
      if (!u.naka) u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.mesh.position.copy(u.pos);
    }
    if (F.carryPrev) { F.carryPrev.x = rt.player.u.pos.x; F.carryPrev.z = rt.player.u.pos.z; }
    if (F.step === 1) {
      if (F.lit < NEED) rt.objProgress('main', `${F.lit}／${NEED}軒・印の家は自分、ほかは仲間が焼く`);
      if (rt.t > (F.mhT || 0)) { F.mhT = rt.t + 1; if (F.lit < NEED) this.markHouses(rt); }
      // 火を放ちに来ない時は、藤吉郎がやり方を言う（一度だけ）
      if (rt.t - F.stepT > 45 && F.lit < NEED && !F.burnCall) { F.burnCall = true; rt.say(officer(rt), `${nm(rt)}、松明を軒へ寄せよ。印の家に火をかけるのじゃ`, 4); }
    }
    if (F.step === 2) {
      const qs = [F.ote, F.ote2].filter(Boolean);
      if (rt.t - F.stepT > 3) rt.objProgress('main', rt.t - F.stepT < 16 ? '鹿垣を結う間に、藤吉郎の旗の横へ並べ' : gone(F.ote) && !F.ote2.sent ? '初めの寄せは退いた。坂の上の新手に備えよ' : '鹿垣の内で槍をそろえ、坂を下る城兵を押し返せ');
      // 引きつけて一斉に放つ。麓の左右の鉄砲も同時に鳴る
      if (!F.oteVolley && F.nGun.count && qs.some((q) => !gone(q) && Math.hypot(q.center().x - F.nGun.anchor.x, q.center().z - F.nGun.anchor.z) < 26)) {
        F.oteVolley = true; F.nGun.fire = true;
        rt.say('鉄砲頭', '引きつけた……放て！', 2.5);
        rt.army.play('volley', F.nGun.anchor, 1.4);
        for (const C of F.footClash || []) C.volley('A');
        for (const q of qs) if (!gone(q)) q.morale = Math.max(0, q.morale - 15);
      }
      if (gone(F.ote) && !F.ote2.sent && !F.ote2Q) { F.ote2Q = true; this.oteWarn(rt); rt.after(5, () => this.ote2(rt)); }
      // 坂の上に残って矢玉を放つだけの数人を、いつまでも追わせない。新手が下りて七十秒か、残りが三人ずつ以下なら山へ退く
      if (F.ote2.sent && !qs.every(gone) && (rt.t - F.ote2T > 70 || qs.every((q) => gone(q) || q.count <= 3))) for (const q of qs) if (!gone(q)) { q.noRout = false; q.morale = 0; }
      if (F.ote2.sent && qs.every(gone)) {
        rt.unmark('ote'); rt.unmark('ote2');
        rt.objDone('main');
        // 坂の城兵が崩れ、麓の左右の城兵も山へ逃げ上る
        for (const C of F.footClash || []) C.rout('B', { from: 0, minFight: 0 });
        this.karamete(rt);
      }
    }
    if (F.step === 3) {
      if (F.climbFriends && rt.t >= (F.pressureAt || 0)) pressureTick(rt, '裏道', F.climbFoes, F.climbFriends, '藤吉郎の列と次の曲がり角へ進め。近い守兵を仲間と退けよ');
      const p = rt.player.u.pos;
      const kd = Math.hypot(p.x + 30, p.z + 118);
      if (!F.guardOn && rt.t >= (F.karaGuideAt || 0)) {
        F.karaGuideAt = rt.t + 1;
        // 登り口から順に案内し、近くの別の折れへ印を戻さない。
        let next = F.karaNext;
        if (next < KARA_TRAIL.length - 2 && Math.hypot(p.x - KARA_TRAIL[next][0], p.z - KARA_TRAIL[next][1]) < 6 && Math.abs(p.y - rt.world.heightAt(KARA_TRAIL[next][0], KARA_TRAIL[next][1])) < 4) next++;
        F.karaNext = next;
        const q = F.karaGuide || (F.karaGuide = { x: 0, z: 0 });
        q.x = KARA_TRAIL[next][0]; q.z = KARA_TRAIL[next][1];
        if (!F.karaGuideMarked) { F.karaGuideMarked = true; rt.marker('karaGuide', () => F.karaGuide, '裏道の次の曲がり角', { guideAlways: true, h: 2 }); }
        rt.objProgress('main', `裏道の次の曲がり角まで ${Math.max(0, Math.round(Math.hypot(p.x - q.x, p.z - q.z)))}歩ほど・藤吉郎の旗に続け`);
      }
      else if (F.guardOn) { rt.unmark('karaGuide'); F.karaGuideMarked = false; rt.objProgress('main', '仲間と槍をそろえ、木戸の守りを退けよ'); }
      const kc = F.kino.center();
      // 藤吉郎の列が腰曲輪を抜けると、背を取られた腰曲輪・物見櫓・伏兵は山上へ退く（細道で足を止めた者を囲み続けない）
      // 列が十五秒進まない時（腰曲輪の喰違いで詰まる等）は、藤吉郎の手が槍を入れて道の守りを崩す
      if (F.kino.order === 'path' && rt.t >= (F.kinoMoveAt || 0)) {
        const a = F.kino.anchor, m = F.kinoMoved || (F.kinoMoved = { x: a.x, z: a.z, t: rt.t });
        F.kinoMoveAt = rt.t + 1;
        if (Math.hypot(a.x - m.x, a.z - m.z) > 2) { m.x = a.x; m.z = a.z; m.t = rt.t; }
        else if (rt.t - m.t > 15) {
          m.t = rt.t;
          const kc2 = F.kino.center();
          let broke = false;
          for (const g of [F.koshiGuard, F.ambush, F.ambushGun, F.towerArchers, F.scout, F.patrol, ...F.climbGuards]) {
            if (!g || gone(g)) continue;
            const c = g.center();
            if (Math.hypot(c.x - kc2.x, c.z - kc2.z) < 30) { g.noRout = false; g.morale = 0; broke = true; }
          }
          if (broke) rt.bark('藤吉郎の手が槍を入れた。道の守りが崩れて山上へ退く', true);
          for (const u of F.kino.units) if (u.alive && !u.atk) { u.target = null; u.moveTo = null; u.aiT = 0; }
        }
      }
      if (!F.koshiBroke && F.kino.order === 'path' && F.kino.pathIdx >= KARA_TRAIL.indexOf(KARA[4])) {
        F.koshiBroke = true;
        for (const g of [F.ambush, F.ambushGun, F.koshiGuard, F.towerArchers, F.scout]) if (g && !gone(g)) { g.noRout = false; g.morale = 0; }
        rt.bark('腰曲輪の守りが背を取られて退いた。藤吉郎の旗を追い、木戸へ急げ', true);
      }
      // 縦列で登る間、遅れた一人（遠い的を狙う鉄砲など）を待ち続けて列が止まらないよう、的を外して列へ戻す
      if (F.kino.order === 'path' && (F.kino._waitT || 0) > 8) for (const u of F.kino.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - F.kino.anchor.x, u.pos.z - F.kino.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      for (const g of F.climbGuards) if (!g.sent && !gone(g) && Math.hypot(p.x - g.anchor.x, p.z - g.anchor.z) < 16 && Math.abs(p.y - rt.world.heightAt(g.anchor.x, g.anchor.z)) < 8) {
        g.sent = true; g.order = 'attack'; g.focus = rt.player.u; g.seekRange = 24; g.aggro = 12;
        rt.marker(g.name, centerOf(g), g.name, { red: true, group: g });
      }
      if (!F.guardOn) this.climbEvents(rt);
      if (!F.guardOn && (kd < 30 || Math.hypot(kc.x + 30, kc.z + 118) < 26)) this.guardFight(rt);
      // 木戸の守りと五十秒斬り合えば、裏を取られた守りは本丸へ退く（切岸の上に残る数人を探し続けさせない）
      if (F.guardOn && !gone(F.kguard) && rt.t - F.guardT > 50 && !F.kguardBroke) { F.kguardBroke = true; F.kguard.noRout = false; F.kguard.morale = 0; rt.bark('搦手の守りが崩れた。本丸の旗本へ退いていく', true); }
      if (F.guardOn && gone(F.kguard)) {
        // 先に守りが崩れても、藤吉郎の縦列は最後の曲がり角を通す。
        if (F.kino.order !== 'path' || Math.hypot(kc.x + 30, kc.z + 118) < 10 || rt.t - F.guardT > 20) this.signal(rt);
        else rt.objProgress('main', '木戸の守りは退いた。藤吉郎と裏道を登り切れ');
      }
    }
    if (F.step === 1 && F.clearT !== undefined) {
      const qs = [F.town, F.town2].filter(Boolean);
      rt.objProgress('main', gone(F.town) && !F.town2.sent ? '城兵が下りてくる。町の出口を仲間と固めよ' : '町の出口で、残る城兵を仲間と退けよ');
      if (F.town2.sent && qs.every(gone)) {
        F.clearT = undefined; F.step = 1.5;
        rt.unmark('town'); rt.unmark('town2');
          rt.objDone('main');
        this.sally(rt);
      }
    }
    if (F.step === 4 && F.hata) {
      // 本丸の口へ歩く列も、遅れた一人を待ち続けない
      for (const K2 of [F.kino, F.hachi]) if (K2 && K2.order === 'path' && (K2._waitT || 0) > 8) for (const u of K2.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - K2.anchor.x, u.pos.z - K2.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      if (!F.sig && rt.t >= (F.honGuideAt || 0)) { F.honGuideAt = rt.t + 1; this.guideHon(rt); }
      // 表と裏から挟まれて百秒、残る旗本も主殿の奥へ退く（合図の火を放てないまま囲みの時間切れにしない）
      if (!F.sig && !F.honBroke && rt.t - F.stepT > 100) { F.honBroke = true; for (const g of F.honGuards) if (!gone(g)) { g.noRout = false; g.morale = 0; } }
      if (!F.sig && F.hata.every(gone) && gone(F.tatsu) && gone(F.keep.guard)) this.lightSig(rt);
      // 合図は本人が実際に火を付けるまで待つ。
      if (F.sig && rt.t - F.sigT > 20 && !F.sigCall) { F.sigCall = true; rt.say(officer(rt), `${nm(rt)}、印の小屋じゃ！　軒へ火を移し、殿に知らせよ`, 4); }
    }
  },

  onFinish(rt, info) {
    const F = rt.flags;
    if (info?.down) F.downCamera();
    if (F.torches) { F.torches.stop(); F.torches = null; }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && (k.isPlayer || k.isSub) && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('side');
        rt.violation('逃げる町の者を討った', ['木下藤吉郎', '町の者に手を出すな！　焼くのは家じゃ、人ではない']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (!sightPoint(rt, g.center()) || g.team !== 1 || g.civ || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 9; g._routSaid = true;   // 隊ごとに一度（崩れて立て直す隊が、同じ一言を繰り返していた）
    rt.say('足軽', `${g.name}が山へ逃げていく！`, 2.5);
  },
};

// 両軍の総勢（織田 一万五千を仮置き、斎藤 四千を仮置き。数には諸説ある）
inabayama.force = () => ({ a: 15000, a0: 15000, b: 4000, b0: 4000 });
inabayama.sides = { a: { name: '織田軍（出陣時の目安）', mon: 'oda' }, b: { name: '斎藤軍（出陣時の目安）', mon: 'saito' } };

// 軍議（gungi.js）：金華山を回して見て、外の部隊の攻め口を三つから選ぶ（史実の既定は七曲り）。
// 自分（藤吉郎の手）は、どの作戦でも町を焼いてから搦手を登る。作戦で変わるのは、外の部隊の道・本丸の守りの厚さ・大手の手薄さ
inabayama.gungi = (rt) => {
  if (!rt.G.lord) return null;
  const F = rt.flags;
  const nom = (b) => (b ? Math.round(b.aliveNominal()) : 0);
  const G = {
    center: { x: 0, z: -60 }, dist: 170,
    // 束31：info を足す（俯瞰の説明）
    landmarks: [
      { name: '本丸', x: HON.x, z: HON.z, info: '最後の守り。東に低い石垣' },
      { name: '大手の木戸', x: OTE.x, z: OTE.z, info: '正面の口　守備兵が多い' },
      { name: '二の丸', x: NI.x, z: NI.z, info: '腰曲輪の先。道が狭い' },
      { name: '七曲り', x: 16, z: -14, info: '長く緩やか。大手へ続く' },
      { name: '百曲り', x: HYAKU[2][0], z: HYAKU[2][1], info: '短い急坂。守りの様子は不明' },
      { name: '水の手', x: KARA[2][0], z: KARA[2][1], info: '搦手の水汲み道。守りの様子は不明' },
      { name: '井口の町', x: 16, z: 70, info: '城下の町' },
      { name: '長良川の舟着き', x: FUNA.x, z: FUNA.z, info: '舟着きの場所は推定。ほかの退路は不明' },
    ],
    nawabari: F.K,
    lines: [
      { name: '大手（三の丸）', owner: '敵' }, { name: '腰曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '囲みの部隊（森・坂井・佐久間・池田・美濃三人衆）', group: () => F.oteYose1 && F.oteYose1.real, nominal: () => (F.attackers || []).reduce((s, b) => s + nom(b), 0) }],
    routes: Object.entries(STRATS).map(([id, s]) => ({ id, name: s.name })),
    default: { main: 'nanamagari' },
    enemy: [
      { name: '大手の備（日根野弘就）', known: false },
      { name: '百曲りの備（長井道利）', known: false },
      { name: '水の手・二の丸の備', known: false },
      { name: '本丸の旗本（斎藤龍興）', known: false },
    ],
    cinema: { attackers: { x: 0, z: -26 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: HON.x, z: HON.z } },
    onStart: (assign) => inabayama.onGungiStart(rt, assign),
  };
  // bot・sim の確かめ：window.__inabaStrategy で決め打ち。?bot なら軍議を出さず、史実の七曲りで
  if (window.__inabaStrategy) { inabayama.onGungiStart(rt, { main: window.__inabaStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
inabayama.onGungiStart = (rt, assign) => { rt.flags.strategy = STRATS[assign?.main] ? assign.main : 'nanamagari'; };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
inabayama.famous = [
  { name: '稲葉良通', team: 0, g: /稲葉/, line: '稲葉一鉄じゃ。今日よりは織田の者として働く！' },
  { name: '日根野弘就', g: /大手/, loose: 1, line: '日根野弘就なり！　稲葉山は落ちぬ。下がれ下がれ！' },
];
inabayama.date = (rt) => rt.flags.win && rt.t - rt.flags.endT >= 5 ? '永禄十年八月十五日　城が開く' : rt.flags.step >= 2 ? '永禄十年八月二日以後　囲み' : '永禄十年八月一日　井口の町';
inabayama.canSkip = () => '';
inabayama.history = '永禄十年（1567）八月、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。織田信長はすぐに兵を出して稲葉山城の東の瑞龍寺山に陣を取り、城下の井口の町を焼き払って城を裸にし、まわりに鹿垣を結って囲んだ。城主の斎藤龍興は半月ほどで城を明け渡し、長良川を舟で下って伊勢長島へ逃れた。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏の道を案内されて搦手から攻め上ったという話は、のちの『太閤記』などに見える伝えで、確かな記録にはない。この戦では、放火の日と翌日の囲みを分け、八月十五日の開城は後日談で描く。搦手での局地戦と合図は遊びの補いで、これだけで城が降ったとはしない。総勢と各備の人数は仮の目安で、確定した兵数ではない。曲輪の広さ、出丸と厩の位置、土塁・木戸・井楼・建物・小祠と斎藤期の山麓館は、絵図と同時代の美濃の土の城からの推定である。東の小曲輪と石垣は後世の絵図を手掛かりにし、斎藤期の細かな姿まで確かとはしない。百曲りと水の手の向き、川の幅と流れ、舟着きの場所は遊びの補いで、当時の道や川を確かに再現したものではない。山の比高は約三百メートルを保つが、登山道の長さは実距離に達していない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
inabayama.lordAt = { x: 112, z: -24, r: 14, why: '瑞龍寺山の本陣（信長は瑞龍寺山に陣を取り、井口の町を焼かせた）' };
inabayama.lordSpawn = { x: 112, z: -16, heading: -0.55 };

// 素直な遊び手：印の家に火を放ち、大手では斎藤勢と戦い、藤吉郎について搦手を登り、本丸の小屋に火を放つ
const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
// 山の上の隊へ直進すると切岸で止まる。折れと木戸の口を順に通る。
const BOT_KARA = [...KARA_TRAIL.slice(0, -1), [HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]];
function botRoad(b, inp, goTo, path, end) {
  const p = b.player, u = p.u;
  if (b.botRoadPath !== path) {
    b.botRoadPath = path; b.botRoadIndex = 0;
    let best = Infinity;
    for (let i = 0; i <= end; i++) {
      const w = path[i], score = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) + Math.abs(b.world.heightAt(w[0], w[1]) - u.pos.y) * 4;
      if (score < best) { best = score; b.botRoadIndex = i; }
    }
  }
  while (b.botRoadIndex <= end) {
    const w = path[b.botRoadIndex];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) >= 2) { goTo(p, inp, w[0], w[1], 1); return true; }
    b.botRoadIndex++;
  }
  return false;
}
inabayama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  // 退避と手当ては共通の survive に任せる。敵の前で上役へ背を向けたり、
  // 手当てのできない位置で傷が戻るのを待ったりしない。
  b.botRest = false;
  const c = F.kino.center();
  if (F.step === 0) {
    const q = nearIt(b, 'talk');
    if (q) {
      if (b.nearestInteract() === q.it) inp.e.add('KeyE');
      else goTo(p, inp, q.it.pos.x, q.it.pos.z, 2);
    }
    return;
  }
  // 構えは正面だけに効く。近い兵より、実際に打ち込む兵へ向く。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 敵の槍が低い柵を越えて届く時も、打ち手へ向いて受ける。
    const over = (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (b.army.wallBetween(o.pos, -1, u.pos, over)) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  // 構えを解く半秒の間は相手を保つ。近い兵へ替え続けると反撃が出ない。
  const pending = p.botStrikeUntil > p.time ? strikeTarget(b, 0) : null;
  const e = attacker || (pending && !pending.isStruct && !pending.group?.civ ? pending : null) || b.army.nearestEnemy(u, F.step === 1 || F.step === 3 ? 7 : 12, (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2.8) && !(o.group && o.group.civ) &&
    (F.step !== 2 || o.pos.z >= SHIKA_Z - 14));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 振りかぶりを見ただけで止まると、敵の槍だけが届く所に居残る。
    // 振り出す前は構えて詰める。突進や振っている刃には踏み込まない。
    let walkYaw = p.yaw, walking = false;
    if (d > reach * 0.85 && !(attacker && (attacker.charging || (attacker.swing && !attacker.swing.done)))) {
      // 鹿垣の折れに沿った内側まで寄る。止まる半径を敵ではなく
      // 内側の行き先にも付けると、槍の届かない二歩手前で止まってしまう。
      let z = e.pos.z;
      if (F.step === 2) {
        const at = Math.max(0, Math.min(7.999, (e.pos.x - SHIKA_X0) / SHIKA_W));
        const i = Math.floor(at), t = at - i;
        const fenceZ = SHIKA_Z + Math.sin(i) * 1.2 * (1 - t) + Math.sin(i + 1) * 1.2 * t;
        z = Math.max(fenceZ + 0.6, z);
      }
      goTo(p, inp, e.pos.x, z, z !== e.pos.z ? 0.15 : reach * 0.85);
      walkYaw = p.yaw; walking = inp.k.has('KeyW');
    }
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵へ向き直しても、内側へ寄る足や障害物を回る足の向きは保つ。
    if (walking) {
      const da = walkYaw - p.yaw;
      inp.k.delete('KeyW');
      if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
    }
    // 振りかぶりから受け、打ち終えた隙に構えを解いて突き返す。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (p.lock) inp.e.add('KeyQ');
  if (F.step === 1) {
    const q = nearIt(b, 'h');
    // 操作できる家の前で止まる。札が届いているのに戸口へ詰め続けない。
    if (q) { if (b.nearestInteract() === q.it) inp.k.add('KeyE'); else goTo(p, inp, q.it.pos.x, q.it.pos.z, Math.min(1.2, q.it.r * 0.8)); return; }
    // 散った隊の中心は家の中や誰もいない所にもなる。残る兵本人へ寄る。
    let t = null, td = Infinity;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? F.town : F.town2;
      if (!g || gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.noTarget || o.invuln) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < td) { t = o; td = d; }
      }
    }
    // 下りてくる城兵を山の斜面へ直線で追わず、町の出口で迎える。
    if (t) { goTo(p, inp, t.pos.z < 30 ? 2 : t.pos.x, t.pos.z < 30 ? 34 : t.pos.z, 2); return; }
  }
  if (F.step === 2) {
    // 打って出る敵を鹿垣の内で迎える。山上の控えへ登って待たない。
    goTo(p, inp, 2, SHIKA_Z + 5, 3); return;
  }
  if (F.step === 3) {
    // 細道は藤吉郎の旗に付いて登る（旗が道を知っている。近道へ外れて崖で止まらない）
    if (F.kinoU.alive && Math.hypot(F.kinoU.pos.x - u.pos.x, F.kinoU.pos.z - u.pos.z) > 5) { goTo(p, inp, F.kinoU.pos.x, F.kinoU.pos.z, 3); return; }
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 2)) return;
    if (F.guardOn && !gone(F.kguard)) { const t = F.kguard.center(); goTo(p, inp, t.x, t.z, 2); return; }
    return;
  }
  if (F.step === 4) {
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 1)) return;
    // 任務で要る馬廻と主殿前の旗本も相手にする。倒れた隊の中心で待たない。
    let target = null, distance = Infinity;
    for (const g of F.honGuards) {
      if (gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.noTarget || o.invuln) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < distance) { target = o; distance = d; }
      }
    }
    if (target) { goTo(p, inp, target.pos.x, target.pos.z, 2); return; }
    const q = nearIt(b, 'sig');
    if (q) {
      if (b.nearestInteract() === q.it) inp.k.add('KeyE'); else goTo(p, inp, q.it.pos.x, q.it.pos.z, Math.min(1.2, q.it.r * 0.8));
    }
    return;
  }
  goTo(p, inp, c.x + 3, c.z + 4, 3);
};

// 焼き討ちと城攻めは討ち捨て（首を取りに止まらせない。信長は城攻めでたびたび討ち捨てを命じた）
inabayama.uchisute = true;
inabayama.rts = true;
export { inabayama };
