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
import { nobori, hut, kabukimon, yagura, tawara, campfire, palisade, village, ishigaki, sakamogi, kagaribi, dorui } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { camp } from './b_mid.js';
import { demDetail } from './dem.js';
import { yamaLift, benchRoads } from './yamalift.js';
import { distToPolyline } from './world.js';

// 実測地形（国土地理院 標高タイル下ごしらえ）：金華山の本当の尾根・谷の形に混ぜる（城の部品の位置はそのまま）。
// いつも使う（quality-upgrade-plan 束2。DEM_ON の分かれはやめた）。最初の画面を軽くするため遅れて読む（他の戦と同じやり方）
let DEM = null;
import('./asset_dem_inabayama.js').then((m) => { DEM = m.default; }).catch(() => {});
import { reset as flReset } from './floors.js';
import { monomi, goten, hyorogura, nagaya } from './castle_parts.js';
import { heightOf, buildCastlePlan, garrisonKuruwa, makeLordKeep } from './castle_plan.js';
import { makeRockTraps } from './siege_rocks.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance } from './taketaba.js';
import { makeButai, adoptGroup, butaiTick, lightClash } from './butai.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeNawabari } from './nawabari.js';
import { makeDefenseAI } from './siege_ai.js';
import { HON, NI, TSUKE, OTE, GAP_A, ROAD, KARA, TOWER, INABAYAMA_PLAN, HYAKU, FUNA, HON_GATE_OUT, IRI, NAKA, NIMON, LAYERS, INABAYAMA_HIST } from './castles/inabayama.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：藤吉郎の手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ZUI = { x: 112, z: -30 };           // 瑞龍寺山（信長の本陣）
// 竹束の置き場（搦手の登り口。抱えて登れば、落石・矢を前から 7 割防ぐ。castle-design 7-3）
const TABA_PILE = { x: KARA[0][0] + 4, z: KARA[0][1] + 4 };

// ---------------- 軍議の三つの作戦（七曲り・百曲り・水の手）と、部隊の道 ----------------
// 各手は山道と門の口を通る。足軽一人が入るまで全軍を止める扱いはしない。
const HON_IN = [[HON_GATE_OUT.x, HON_GATE_OUT.z], [KARA[5][0], KARA[5][1]]];
const R_NANA = [...ROAD.slice(4, -2), [OTE.x, OTE.z, 'ote'], [0, -96, 'ote'], ...HON_IN];
const R_HYAKU = [...HYAKU.slice(0, 5), [12, -100, 'hon'], [0, -96, 'hon'], ...HON_IN];
// 腰曲輪の既存の出口を抜けてから二の丸へ。喰違いの柵を横切らない。
const NI_ROAD = [KARA[3], [NI.x, NI.z], KARA[4]];
const R_MIZU = [KARA[0], KARA[1], [KARA[2][0], KARA[2][1], 'koshi1'], [KARA[3][0], KARA[3][1], 'koshi1'], [NI.x, NI.z, 'ni'], KARA[4], ...HON_IN];
export const STRATS = {
  nanamagari: { name: '七曲り（大手）から攻め上る', short: '七曲り' },
  hyakumagari: { name: '百曲り（東の細道）から本丸の脇を突く', short: '百曲り' },
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
const HOUSES = [[24, 80, 0.1], [4, 64, -0.2], [30, 54, 0.3], [-10, 44, 0.05], [44, 78, -0.1], [-18, 70, 0.2], [16, 38, 0.15], [42, 44, -0.25], [-4, 86, 0.1], [8, 100, -0.1]];
const MINE = 5;
const NEED = 3;                            // 自分で火を放つ数

const ODA = { flag: 'oda' };

// 夜明けの色（鳶ヶ巣山砦夜襲・強右衛門と同じ作り）。のちに setTime('morning') で朝へ移ろう
const DAWN = { sky: 0x7e7a88, fog: 0x6e6c7a, sun: 0xffbe86, sunI: 1.05, hs: 0xa4a0b4, hg: 0x362e26, hI: 1.0, top: 0x46506c, glow: 0.24, dir: [1, 0.08, 0.3], mount: 0x262624 };
// env：空の映り込み（PMREM）を作り直すか。重いので、少しずつ移ろう間は false にし、最後に一度だけ作る
export function applyLook(rt, L, env = true) {
  const W = rt.world;
  // 既に夕暮れの扱いなら setTime は呼ばない（呼ぶたびに空の映り込みを作り直して重い）
  if (W.timeKey !== 'dusk') W.setTime('dusk');
  // 戦の途中で呼ぶと setTime が夕暮れへの移ろいを始めて、下の色を上書きしてしまうので止める
  W.fade = null;
  // 夜の色（NIGHT）を渡した時は、画質「低」でも月明かりが見えるよう main.js の描画で露出を少し上げる（timeKey は夕暮れのままなので、印を別に立てる）
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
// 町に火を放つ間に、夜明けの空が少しずつ明るむ（DAWN → DAWN2）
const DAWN2 = { sky: 0xa6a2a8, fog: 0x96929e, sun: 0xffc896, sunI: 1.3, hs: 0xb4b0bc, hg: 0x3e362c, hI: 1.1, top: 0x5a6888, glow: 0.3, dir: [1, 0.14, 0.3], mount: 0x2c2c2a };
function mixLook(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    if (Array.isArray(a[key])) o[key] = a[key].map((v, i) => v + (b[key][i] - v) * k);
    else if (key === 'sunI' || key === 'hI' || key === 'glow') o[key] = a[key] + (b[key] - a[key]) * k;
    else o[key] = new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k).getHex();
  }
  return o;
}

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
export function setInabayamaBase(fn) { baseOverride = fn; }
function base(x, z) {
  const b = (baseOverride || proceduralBase)(x, z);
  // 実測の尾根・谷の凹凸だけを足す（DEM の原点＝本丸に合わせる。前は原点がずれて、道の途中に山頂が出ていた）
  return DEM ? b + demDetail(DEM, x, z, { xy: 1.5, ox: HON.x, oz: HON.z, win: 40, scale: 0.3 }) : b;
}

// 城の縄張り（曲輪）は castles/inabayama.js（docs/castle-design.md 6章・siege-plan 7章「稲葉山」）。
// 七曲りの大手道・竪堀・搦手の腰曲輪の段を、そこの INABAYAMA_PLAN に持つ。level は base() から取る
// ＝下地を差し替えても段が追随する。ここでは、その縄張りに合わせて高さの関数を作るだけ
let CASTLE_HEIGHT = null;
function height(x, z) {
  if (!CASTLE_HEIGHT) CASTLE_HEIGHT = heightOf(INABAYAMA_PLAN, base, 5);
  if (!BENCHED) BENCHED = benchRoads((px, pz) => CASTLE_HEIGHT(px, pz) + yamaLift(px, pz, LIFT), [ROAD, KARA, HYAKU, NI_ROAD]);
  return BENCHED(x, z);
}
let BENCHED = null;
// 山城の高さ（kaito 10/3）：金華山は比高約300m。麓の井口（z>26）から本丸まで、道の外は登れない山にする（本丸の高さ 約130）
const LIFT = { x: HON.x, z: HON.z, tx: 0, tz: -47, w: 68, R: 75, rise: 100 };

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
    const wall = h.m.children[0], tilt = Math.random() < 0.5 ? -1 : 1;
    for (let i = 1; i <= 14; i++) rt.after(i * 0.07, () => {
      for (const r of [roof, h.m.children[2]]) if (r) { r.position.y -= 0.16; r.rotation.z = tilt * 0.025 * i; r.rotation.x = 0.012 * i; }
      if (wall && i > 8) wall.scale.y = Math.max(0.35, 1 - (i - 8) * 0.11);
    });
    rt.army.play('wood', { x: h.x, z: h.z }, 1.2);
    rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 1, h.z, 0, 0);
  });
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
  return u?.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12 ? '木下藤吉郎' : '組頭';
}

// 山道を歩く間は縦列。下り切ってから槍をそろえ、打って出る。
function march(g, path, next = 'hold') {
  if (gone(g)) return;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.speed = 2.4;
  g.onArrive = (q) => { q.anchor = { x: path[path.length - 1][0], z: path[path.length - 1][1] }; q.formation = 'yari'; q.order = next; q.aggro = 12; q.seekRange = 24; };
}

const inabayama = {
  jinkei: INABAYAMA_JIN,
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  noWake: true,   // 城の部隊が本物の兵を受け持ち、遠景から重ねて増やさない。
  spawn: { x: 34, z: 110, heading: Math.PI + 0.3 },
  world: {
    seed: 1567,
    terrainTags: true,
    wind: [0.5, 0.86],   // 放火の日は強風と信長公記にある。風向きは復元。
    windStrength: 1.6,   // 強風の強さは遊びのための復元値。
    time: 'dusk',
    muddy: 0.2,
    paths: [ROAD, KARA, HYAKU, NI_ROAD],
    height,
    tint(x, z, h, c) {
      // 城下の土の道と町の庭
      if (z > 30 && z < 108 && x > -30 && x < 56) c.lerp({ r: 0.5, g: 0.45, b: 0.36 }, 0.35);
      // 金華山の杉と岩は暗く
      else if (h > 12) c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.8);
    },
    clear: (x, z) => (z > 26 && z < 112 && x > -34 && x < 60) || Math.hypot(x - HON.x, z - HON.z) < 24 || Math.hypot(x - ZUI.x, z - ZUI.z) < 26 ||
      (Math.abs(x) < 14 && z < 30 && z > -100) || Math.hypot(x - OTE.x, z - OTE.z) < 20 || distToPolyline(x, z, HYAKU) < 4 || distToPolyline(x, z, NI_ROAD) < 4,
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-150, -190], [-118, -110], [-112, -30], [-124, 60], [-150, 170]], w: 9, depth: 1.4 }],
    trees: 560,
    rocks: 520,   // 金華山の岩場（斜面ほど多く出る）
    tufts: 3800,
    treeDensity: (x, z) => (z > 20 ? 0.25 : 1),
    groves: [{ x: -40, z: 10, r: 14, n: 20 }, { x: 60, z: 10, r: 12, n: 16 }, { x: 72, z: 120, r: 12, n: 14 }],
    // 崩れた斎藤の兵は、山の奥（北）で消す
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -90 && Math.abs(x) > 40)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.entered = {}; F.layer = null; F.layerSeen = {};
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...INABAYAMA_HIST, honjinOda: 'HIST_A', honjinSaito: 'HIST_B' };
    rt.banner('城を囲む', '自分は藤吉郎の手。ほかの備は山のまわりを固める');
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
    // 本丸・三の丸は今の手置きの柵（ringWall・kabukimon）がすでにあるので、地形の段だけ重ねて塀は作らない
    F.castle = buildCastlePlan(rt, INABAYAMA_PLAN, { ladders: true, baseHeight: base, edgeW: 5, skipWalls: ['hon', 'ote', 'ni'] });
    const noT2 = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT2(F.castle.walls);
    F.koshiGuard = garrisonKuruwa(rt, enemyGroup, F.castle, 'koshi1', 'saito', [{ type: 'ashigaru', n: 3 }], { name: '腰曲輪の喰違いの守り', width: 4, aggro: 10 });
    // ---- 落石・丸太（castle-design 7-1）：腰曲輪の守りが生きている間、搦手の坂を落ちてくる ----
    F.rocks = makeRockTraps(rt, {
      posts: [{
        id: 'koshi1', team: 1, stock: 7, interval: [18, 28],
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
    rt.after(8, () => { if (!rt.over) rt.bark('七曲りは長く緩やか。百曲りは短いが急じゃ', true); });   // A056
    // 搦手の山道の両脇に切岸（土の壁）：登る道の感じ（A050）。山頂には高い幟（A051）
    for (let i = 0; i + 1 < KARA.length; i++) {
      const [ax, az] = KARA[i], [bx, bz] = KARA[i + 1], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (const s of [1, -1]) rt.scene.add(dorui(W, [ax + nx * 4 * s, az + nz * 4 * s, bx + nx * 4 * s, bz + nz * 4 * s], nx * s, nz * s, { w: 2.4, h: 1.5 }));
    }
    for (const [x, z] of [[HON.x - 8, HON.z + 4], [HON.x + 8, HON.z + 4], [HON.x, HON.z - 2]]) rt.scene.add(nobori(W, x, z, 'saito', 14));
    // ---- 大手の木戸（七曲りの道を切る柵。口は開いている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-26, OTE.z + 6], [-4, OTE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[4, OTE.z], [26, OTE.z + 6]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    rt.scene.add(kabukimon(W, OTE.x, OTE.z, 7.4, 0));
    // ---- 主郭（本丸）：柵の囲い。口は西（搦手・中枢曲輪の側）に一つ。口には冠木門を構え、門の幅だけ開ける ----
    F.hwall = noT(ringWall(rt, HON.x, HON.z, 15, { gapAt: GAP_A, gapW: 0.6, team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 }));
    {
      // ringWall の口は 5m 刻みの点で切るので広い（14m ほど）。口の両端から門柱まで柵を足し、門の幅（5m）だけ開ける
      const n = Math.max(6, Math.round((2 * Math.PI * 15) / 5));
      const P = (i) => { const a = (((i % n) + n) % n) / n * Math.PI * 2; return [HON.x + Math.sin(a) * 15, HON.z + Math.cos(a) * 15]; };
      const kept = (i) => { const a = (((i % n) + n) % n) / n * Math.PI * 2; return Math.abs(((a - GAP_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) >= 0.3; };
      let iA = Math.round(GAP_A / (Math.PI * 2) * n); while (!kept(iA)) iA--; let iB = iA + 1; while (!kept(iB)) iB++;
      const A = P(iA), B = P(iB), gc = { x: (A[0] + B[0]) / 2, z: (A[1] + B[1]) / 2 };
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
      const pA = [gc.x - ux * 2.5, gc.z - uz * 2.5], pB = [gc.x + ux * 2.5, gc.z + uz * 2.5];
      F.hwall.push(...noT(wallLine(rt, [A, pA], { team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 })), ...noT(wallLine(rt, [pB, B], { team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 })));
      rt.scene.add(kabukimon(W, gc.x, gc.z, 5.2, Math.atan2(-uz, ux)));
      F.honGate = { x: gc.x, z: gc.z, seg: [pA[0], pA[1], pB[0], pB[1]] };
      // 柵の口の脇の小さな石積みは保つ。
      const out = (p, k) => [HON.x + (p[0] - HON.x) * k, HON.z + (p[1] - HON.z) * k];
      rt.scene.add(ishigaki(W, [out(A, 1.12), out(P(iA - 1), 1.12)], { top: 1.0, minH: 1.4, maxH: 2.0, lean: 0.14 }));
      rt.scene.add(ishigaki(W, [out(B, 1.12), out(P(iB + 1), 1.12)], { top: 1.0, minH: 1.4, maxH: 2.0, lean: 0.14 }));
    }
    // 絵図の小曲輪の東側だけに約一丈（3m）の石垣。西の攻め口と山道を塞がない。
    rt.scene.add(ishigaki(W, [[TSUKE.x + TSUKE.half, TSUKE.z + TSUKE.half], [TSUKE.x + TSUKE.half, TSUKE.z - TSUKE.half]], { topY: W.heightAt(TSUKE.x, TSUKE.z), minH: 3, maxH: 3, lean: 0.14 }));
    // 主殿（板葺きの木造。天守・二重櫓は置かない）と、物見の櫓（木造）
    // 主殿は縄張り（castles/inabayama.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に龍興（kaito 10/2）
    // 山頂の曲輪：主殿のほかに、遠侍（板葺きの御殿）・兵糧蔵・長屋を構えて、御殿と蔵と詰所のある城らしくする（kaito 10/2 の見回り）
    goten(rt, HON.x + 12, HON.z + 7, { w: 9, d: 5.5, rot: -0.2, tile: false, team: 1, name: '遠侍', hp: 600 });
    hyorogura(rt, HON.x - 12, HON.z - 5, 5, 4, 0.3, { team: 1 });
    nagaya(rt, HON.x - 4, HON.z + 14, 10, 4, 0.1, { team: 1 });
    rt.scene.add(yagura(W, HON.x - 6, HON.z + 9), yagura(W, HON.x + 10, HON.z - 12));
    rt.scene.add(yagura(W, OTE.x + 12, OTE.z - 6));
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
        dress([{ type: 'samurai', n: 3 }, { type: 'gun', n: 2 }], { flag: 'saito' }));
      // 城主は居所の隊の頭。馬廻は別の組頭が指揮する。
    }
    for (const [x, z] of [[HON.x - 4, HON.z + 10], [HON.x + 10, HON.z + 2], [OTE.x - 8, OTE.z - 6], [OTE.x + 8, OTE.z - 6], [-30, -120]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    // 山の上の小屋（二の丸・三の丸の見え）
    for (const [x, z, r] of [[-26, -96, 0.4], [22, -92, -0.3], [34, -120, 0.2], [-10, -84, 0.1]]) rt.scene.add(hut(W, x, z, 6, 4, r, { wall: 0x6a5238 }));
    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、柴田勝家の手、丹羽長秀の手 ----
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: 28, z: 104 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.shiba = allyGroup(rt, { fixed: true, name: '柴田勝家の手', anchor: { x: 52, z: 96 }, facing: Math.PI, width: 14, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }], ODA));
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: 8, z: 116 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], ODA));
    F.oda = [F.kino, F.shiba, F.niwa];
    for (const g of F.oda) { g.formation = 'yari'; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 36, z: 114 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 町に残る斎藤の番の兵 ----
    F.town = enemyGroup(rt, { fixed: true, faction: 'saito', name: '町の番の兵', anchor: { x: 8, z: 50 }, facing: 0, width: 10, aggro: 12, morale: 80, fleeDir: { x: 0, z: -1 } },
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
    // 後続・物見・伏兵・旗本は初めから同じ場所で守る。段の切り替えで兵を増やさない。
    F.town2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '城から下りた斎藤勢', anchor: { x: OTE.x, z: OTE.z + 3 }, facing: 0, order: 'hold', aggro: 14, width: 7, morale: 85, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }]);
    F.ote = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の斎藤勢', anchor: { x: OTE.x, z: OTE.z - 8 }, facing: 0, order: 'hold', aggro: 12, width: 8, morale: 95, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 24 }, { type: 'bow', n: 5 }, { type: 'gun', n: 2 }]);
    F.ote2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の新手', anchor: { x: OTE.x, z: OTE.z - 18 }, facing: 0, order: 'hold', aggro: 14, width: 7, morale: 90, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 2 }]);
    F.kguard = enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の守り', anchor: { x: -30, z: -118 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 13 }, { type: 'gun', n: 2 }]);
    F.scout = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤の物見', anchor: { x: KARA[2][0] + 4, z: KARA[2][1] - 10 }, facing: 0.4, order: 'hold', aggro: 10, width: 2, morale: 70, fleeDir: { x: 0.4, z: -1 } },
        [{ type: 'ashigaru', n: 2 }]);
    F.ambush = enemyGroup(rt, { fixed: true, faction: 'saito', name: '岩陰の伏兵', ambush: true, anchor: { x: KARA[3][0] + 6, z: KARA[3][1] - 6 }, facing: 0.6, order: 'hold', aggro: 12, width: 3, morale: 80, fleeDir: { x: 0.5, z: -1 }, formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
    F.ambushGun = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の段の鉄砲', anchor: { x: KARA[4][0] - 4, z: KARA[4][1] - 8 }, facing: 0.3, order: 'hold', aggro: 30, width: 2, morale: 70, fleeDir: { x: 0.5, z: -1 } },
          [{ type: 'gun', n: 2 }]);
    F.hata = [enemyGroup(rt, { fixed: true, faction: 'saito', name: '本丸の旗本', anchor: { x: HON.x - 8, z: HON.z + 3 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 8, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11 }]), enemyGroup(rt, { fixed: true, faction: 'saito', name: '御殿前の控え', anchor: { x: HON.x + 8, z: HON.z + 1 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 6, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }])];
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
    const SAI_B = { team: 1, faction: 'saito', armor: 0x3a3a30, flag: 'saito' };
    F.oteB = mkB({ ...SAI_B, name: '大手の備（日根野弘就）', kind: 'ashigaru', nominal: 100, real: 4, maxReal: 4, at: { x: OTE.x, z: OTE.z - 6 }, facing: 0 });
    F.hyakuB = mkB({ ...SAI_B, armor: 0x35382c, name: '百曲りの備（長井道利）', kind: 'bow', nominal: 80, real: 4, maxReal: 4, at: { x: HYAKU[3][0], z: HYAKU[3][1] }, facing: 0.6 });
    F.koshiB = mkB({ ...SAI_B, name: '水の手の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: -60, z: -84 }, facing: 0.4 });
    F.niB = mkB({ ...SAI_B, armor: 0x35382c, name: '二の丸の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: NI.x, z: NI.z - 2 }, facing: Math.PI / 2 });
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
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: { x: HON.x, z: HON.z }, need: 5, hold: 24, honmaru: true },
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
    for (const [x, z] of [[46, 110], [60, 104]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の手の一隊を率い、井口の町へ入れ' : '藤吉郎のそばで松明を用意し、町へ入る下知を待て', 'main');
    rt.say(officer(rt), `${nm(rt)}、来たか。夜の明けぬうちに、城下の井口の町に火をかける`, 4.5);
    rt.say(officer(rt), '城下を焼き、囲みの支度をする。……松明を用意せい', 4);
    // 印の藤吉郎に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎（話を聞く）', {});
    rt.addInteract('talk', { x: 28, z: 104 }, '藤吉郎の話を聞く', () => {
      rt.uninteract('talk');
      rt.say(officer(rt), 'よし、行くぞ。わしの手から離れるな', 2.5);
      rt.after(2.5, () => this.burnStart(rt));
    }, { r: 5 });
    rt.after(16, () => this.burnStart(rt));
    buildBattleJin(rt);
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('burn');
    sfx('horagai', 0.9);
    rt.unmark('kino'); rt.uninteract('talk');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    // 信長で遊ぶ時：火付けは足軽の役目。当主は町の番の兵を払わせ、焼き働きを見届ける
    rt.obj('main', rt.G.lord ? `足軽に町を焼かせ、町の番の兵を払え（${NEED}軒）` : `印の家の前で「家に火を放つ」を長く押せ（${NEED}軒）`, 'main');
    rt.obj('side', '手向かわぬ町の者は討たない', 'side');
    rt.say(officer(rt), '印の家を頼む。ほかの家は仲間が焼く。手向かう者だけを相手にせよ', 3.5);
    if (!rt.G.lord) rt.after(9, () => { if (!rt.over) rt.say('足軽', '逃げ遅れた町の者がおる。刃を向けるな', 3.5); });   // 焼く迷い（A054）
    // 家の印は近い二軒だけ（残りは近づくと出る。update の markHouses）
    if (rt.G.lord) { for (const h of F.houses) if (h.mine) this.sendTorch(rt, h); }
    else for (const h of F.houses.filter((q) => q.mine)) rt.addInteract('h' + h.i, { x: h.x, z: h.z + 3 }, '家に火を放つ', () => this.light(rt, h), { r: 4, hold: 1.4 });
    this.markHouses(rt);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; }; };
    go(F.kino, 22, 76); go(F.shiba, 40, 62); go(F.niwa, 0, 90);
    rt.marker('town', centerOf(F.town), '町の番の兵', { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    // 松明を持った足軽が家に寄ってから火が上がる
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(14 + k * 9, () => this.sendTorch(rt, h)));
    rt.after(40, () => { if (F.ending || rt.over) return; for (const [x, z, sz] of [[34, 146, 2.6], [-26, 128, 2.4]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: sz }); });
    for (const c of F.civ) { c.routed = true; c.order = 'flee'; for (const u of c.units) u.fleeing = true; }
    // 木戸の控えが、七曲りを下って町へ加勢する。
    rt.after(30, () => {
      if (F.step !== 1) return;
      F.town2.sent = true;
      march(F.town2, [...ROAD.slice(3, -1).reverse(), [2, 6]], 'attack');
      rt.army.play('eshout', { x: 2, z: 10 }, 1.5);
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
    for (const q of want) if (q && !rt.markers.some((m) => m.id === 'h' + q.i)) rt.marker('h' + q.i, { x: q.x, z: q.z }, '自分の担当（家に火を放つ）', { h: 3 });
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
    if (h.mine && F.lit < NEED) this.light(rt, h, false); else burnHouse(rt, h);
    F.torchHouse = null; F.torchHold = 0;
  },
  // 一つの任務札の段が済んだ事を二秒見せてから、次の札に替える
  nextObj(rt, text) {
    const step = rt.flags.step;
    rt.objDone('main');
    rt.after(2, () => { if (!rt.over && !rt.flags.ending && rt.flags.step === step) rt.obj('main', text, 'main'); });
  },

  light(rt, h, own = true) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1) return;
    burnHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    if (own && !rt.G.lord) rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit === NEED) {
      rt.objDone('main');
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); this.sendTorch(rt, q); }
      rt.say(officer(rt), '町は燃えた。……残る斎藤勢を追い払え！', 3.5);
      // 町の斎藤の兵を追い払うまで、次の攻めへ進まない。
      F.clearT = rt.t;
      rt.after(2, () => { if (!rt.over && !F.ending && F.step === 1) rt.obj('main', '町に残る斎藤の兵を追い払え', 'main'); });
    } else {
      this.markHouses(rt);
      rt.objProgress('main', `${F.lit}／${NEED}軒・次は印の家へ。ほかは仲間の担当`);
      if (own) rt.say('足軽', 'ここは火が付いた。次は印の家じゃ。ほかはわしらが引き受ける', 3);
    }
  },

  // ② 大手口から打って出た斎藤勢を退ける
  sally(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('ote');
    rt.unmark('town'); rt.unmark('town2');
    for (const q of [F.town, F.town2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 20); }
    rt.world.setTime('morning');
    sfx('taiko', 1);
    rt.banner('翌日、城を囲む', '城のまわりに鹿垣を結う');
    this.nextObj(rt, '鹿垣を結い、城兵の打って出に備えよ');
    // 足軽が鹿垣（木の枝を組んだ低い柵）を一間ずつ結っていく
    for (let i = 0; i < 8; i++) rt.after(3 + i * 1.6, () => {
      if (F.step !== 2) return;
      const x = -30 + i * 7.5;
      rt.scene.add(palisade(rt.world, [x, -26 + Math.sin(i) * 1.2, x + 7, -26 + Math.sin(i + 1) * 1.2], { h: 1.5 }));
      rt.army.play('knock', { x: x + 3.5, z: -26 }, 0.6);
    });
    F.ote.order = 'hold';
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 14; }; };
    go(F.kino, -4, -18); go(F.shiba, 14, -24); go(F.niwa, -18, -12);
    // 大手の寄せ手の部隊も、鹿垣の線まで詰める（軍議の作戦は、打って出を退けてから）
    // （それまでは軽い大軍だけ。物語より先に本物の兵が町や山の備と斬り合わないように。ここから本物が出る）
    for (const [b, x] of [[F.oteYose1, -24], [F.oteYose2, 24]]) { b.order({ id: 'move', to: { x, z: -30 } }); rt.after(3, () => b.order({ id: 'move', to: { x, z: -30 } })); }
    // 麓で待っていた鉄砲衆も、徒歩で囲みへ寄せる。
    go(F.nGun, 4, -20);
    // 竹束の寄せ（taketaba.js）：大手へ寄せる組は竹束を押し立て、終いの 30m はゆっくり鹿垣の線まで寄せ、陰から撃ち合う
    F.TA = makeTabaAdvance(rt, {
      near: 30, holdRanged: 20, holdMelee: 8,
      items: [{ g: F.kino, yose: { x: -4, z: -18 } }, { g: F.shiba, yose: { x: 14, z: -24 } }, { g: F.niwa, yose: { x: -18, z: -12 } }, { g: F.nGun, yose: { x: 4, z: -20 } }],
      avoid: [rt.player.u.pos && { x: rt.player.u.pos.x, z: rt.player.u.pos.z }],
    });
    rt.obj('main', '藤吉郎の旗と鹿垣の内へ進み、大手口から下る城兵に備えよ', 'main');
    rt.say(officer(rt), '麓で鹿垣を結うぞ。斎藤の兵が打って出てくる、受け止めよ！', 4);
    rt.after(6, () => { if (F.step === 2) rt.say('丹羽長秀', '鹿垣の内から出るな。寄せた所を鉄砲で崩す。崩れてから突け', 4); });
    rt.after(16, () => {
      if (F.step !== 2) return;
      march(F.ote, [...ROAD.slice(7, -1).reverse(), [-4, -18]], 'attack');
      rt.obj('main', '鹿垣の内で藤吉郎の旗に並び、大手口から下る城兵を押し返せ', 'main');
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.6);
      rt.say('斎藤方の侍', '町を焼いた織田の者どもを追い落とせ！', 3);
      rt.marker('ote', centerOf(F.ote), '大手の斎藤勢', { red: true, group: F.ote });
    });
    // 木戸の内から新手（前の勢が崩れて 5 秒後か、40 秒たった時。11分→4〜7分に収めるため早めた。kaito 10/1）
    rt.after(35, () => this.oteWarn(rt));
    rt.after(40, () => this.ote2(rt));
  },
  oteWarn(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step !== 2 || F.ote2.sent || F.oteWarned) return;
    F.oteWarned = true;
    rt.say('足軽', '木戸の内で旗が動いた！　鹿垣の内で新手に備えよ', 3);
  },
  ote2(rt) {
    const F = rt.flags;
    {
      if (F.step !== 2 || F.ote2.sent) return;
      F.ote2.sent = true;
      march(F.ote2, [...ROAD.slice(7, -1).reverse(), [4, -18]], 'attack');
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.4);
      rt.say('足軽', '木戸から新手が出てくるぞ！', 3);
      rt.marker('ote2', centerOf(F.ote2), '大手の新手', { red: true, group: F.ote2 });
    }
  },

  // ③ 搦手の道を登る
  karamete(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('karamete');
    rt.unmark('ote'); rt.unmark('ote2');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.banner('搦手へ', '山の裏の道を、藤吉郎の手が登る');
    rt.say(officer(rt), '大手は固い。……じゃが、山の裏に細い道があると、この辺りの者に聞いた', 4.5);
    rt.say(officer(rt), `${nm(rt)}、ついて来い。わしらは裏から登って、本丸の脇に火をつける`, 4);
    this.nextObj(rt, '藤吉郎の手に続き、山の裏道から搦手の木戸へ');
    const K = F.kino;
    K.order = 'path'; K.path = KARA.slice(0, -1); K.pathIdx = 0; K.speed = 2.5; K.formation = 'column'; K.colW = 2; K.aggro = 6;
    K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'line'; g.aggro = 14; };
    // 印は進み具合と同じ的（搦手の木戸）に。藤吉郎の名札は頭の上に出る
    rt.marker('kido', { x: -30, z: -118 }, '搦手の木戸', { h: 3 });
    F.climbSpots = 0;
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 10 : -10, z: -30 }; }
    // 軍議で決めた作戦で、外の部隊が動き出す（七曲り・百曲り・水の手）
    this.runStrategy(rt);
    // 搦手の木戸の守り
    F.kguard.order = 'hold';
  },

  // 搦手の登りの途中の出来事：岩場の足止め、藤吉郎の小声、物見との小競り合い
  climbEvents(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const near = (i, r) => Math.hypot(p.x - KARA[i][0], p.z - KARA[i][1]) < r;
    if (F.climbSpots === 0 && near(1, 9)) {
      F.climbSpots = 1;
      rt.say(officer(rt), '（小声で）ここから岩場じゃ。細い道を歩き、藤吉郎の旗を離れるな', 3.5);
      F.kino.speed = 1.3; rt.after(10, () => { if (F.kino) F.kino.speed = 2.5; });
      rt.army.play('knock', { x: KARA[1][0], z: KARA[1][1] }, 0.5);
    } else if (F.climbSpots === 1 && near(2, 12)) {
      F.climbSpots = 2;
      // 斎藤の物見が二人。見つかれば声を上げられる前に討て
      F.scout.order = 'attack';
      rt.say('足軽', '物見じゃ！　声を上げさせるな！', 2.5);
      rt.marker('scout', centerOf(F.scout), '物見', { red: true, group: F.scout });
    } else if (F.climbSpots === 2 && near(3, 10)) {
      F.climbSpots = 3;
      rt.unmark('scout');
      rt.say(officer(rt), '（小声で）あの木戸を抜ければ本丸の裏じゃ。……一気に行くぞ', 3.5);
      // 曲がり角の伏兵（GAME_C）：岩陰に槍が潜み、上の段から鉄砲が二挺。細い道なので一度に当たれる数は少ない
      rt.after(3, () => {
        if (F.ending || F.guardOn) return;
        F.ambush.order = 'attack';
        F.ambushGun.order = 'hold';
        rt.army.play('eshout', { x: KARA[3][0], z: KARA[3][1] }, 1.2);
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
    F.kino.order = 'attack'; F.kino.seekRange = 40;
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
    rt.say(officer(rt), '入ったぞ！　本丸の旗本を退けて、脇の小屋に火を放て。瑞龍寺山の殿への合図じゃ', 4);
    this.nextObj(rt, '仲間と本丸の旗本を退けよ。城主を討つ任務ではない');
    march(F.kino, [[HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]], 'attack');
    for (const g of F.hata) if (!gone(g)) { g.order = 'hold'; g.aggro = 10; }
  },
  // 主殿への到達だけでは開城や城主の討死にしない。
  reachTatsu(rt) {
    const F = rt.flags;
    if (F.ending || F.step < 4) return;
    F.reachedTatsu = true;
    if (F.keep.lord) F.keep.lord.noTarget = true;
    rt.bark('主殿の奥まで来た。組へ戻り、下知を待て');
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig || F.step !== 4 || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本', '二の丸から上がった斎藤勢']) rt.unmark(n2);
    const S = { x: HON.x + 8, z: HON.z + 12 };
    F.sig = S; F.sigT = rt.t;
    this.nextObj(rt, '本丸の脇の小屋に火を放ち、瑞龍寺山の殿へ合図を送れ');
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
    if (id === 'ote' && F.step < 4 && sightPoint(rt, OTE)) rt.say('柴田勝家', '大手の木戸を取ったぞ！　城兵は本丸へ退いた', 3);
    // 舟着きの占拠だけでは城主の退路全体を断ったと判断しない。
  },

  // 囲みの部隊と山の曲輪の備の押し合い（遠くの数の戦い）。一番乗りで待っている所・着いた所で、近い備と削り合う
  siegeClash(rt, dt) {
    const F = rt.flags;
    for (const a of F.attackers) {
      if (a.aliveNominal() <= 0 || !a._done) continue;
      for (const d of F.defenders) {
        if (d === F.honB || d.aliveNominal() <= 0) continue;
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
    rt.after(11, () => rt.say('', '――信長は井口を「岐阜」と改め、この山の城を新しい居城とした', 4));
    rt.player.u.invuln = true;
    rt.finish({}, 16);
  },

  update(rt, dt) {
    const F = rt.flags;
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
        const nearDefender = b.team === 1 && Math.hypot(b.pos.x - rt.player.u.pos.x, b.pos.z - rt.player.u.pos.z) < 35;
        const target = F.ending ? have : nearDefender ? 12 : F.attackers.includes(b) ? (F.step >= 3 || (F.step === 2 && (b === F.oteYose1 || b === F.oteYose2)) ? 4 : 0) : (b === F.oteB || b === F.hyakuB ? 4 : 0);
        b.maxReal = Math.min(target, have + room); room -= Math.max(0, b.maxReal - have);
      }
    }
    butaiTick(rt, dt);
    if (F.step >= 3) tickRoutes(F.attackers, F, dt);
    if (rt.t >= (F.torchTickAt || 0)) { F.torchTickAt = rt.t + 0.5; this.torchTick(rt); }
    if (rt.over || F.ending || !rt.player.u.alive) return;
    if (F.SZ) F.SZ.tick(dt);
    if (F.keep && F.step >= 4) { F.keep.tick(); if (F.keep.lord) F.keep.lord.noTarget = true; }
    if (F.ending || rt.over) return;
    if (!F.woundAdvice && rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.55) {
      F.woundAdvice = true;
      rt.say(officer(rt), F.step === 2 ? '深手じゃ。敵を向いて構え、鹿垣の内の藤吉郎の旗へ退け。矢には竹束を盾にせよ' : '深手じゃ。敵に向いて構え、味方のそばへ退け。矢には柵を盾にせよ', 4);
    }
    // 層（Z0〜Z5）：自分が新しい層へ入ったら一度だけ知らせる（金華山を下から上へ登っている手応え）
    { const p = rt.player.u.pos, L = LAYERS.find((q) => q.test(p.x, p.z)); if (L && L.id !== F.layer) { const first = !F.layerSeen[L.id]; F.layer = L.id; F.layerSeen[L.id] = true; if (first && L.id !== 'Z0') rt.bark(L.name); } }
    if (F.DA) F.DA.tick(dt);
    if (F.K) F.K.tick(dt);
    F.clashSeconds = F.step >= 3 ? (F.clashSeconds || 0) + dt : 0;
    if (F.step >= 3 && F.clashSeconds >= 1) { this.siegeClash(rt, F.clashSeconds); F.clashSeconds = 0; }
    if (rt.t >= 600 || gone(F.kino) || F.kinoU.woundOut) {
      F.ending = true; rt.tracker.main = false; rt.objFail('main');
      for (const id of ['sig', 'ote', 'ote2', 'ote3', 'town', 'town2', 'kguard', 'kino', 'karaGuide']) { rt.unmark(id); rt.unzone(id); }
      rt.uninteract('sig'); rt.uninteract('talk');
      rt.obj('retreat', '組を連れ、山の道を下れ', 'main');
      rt.banner('攻めを止め、山を下る', gone(F.kino) || F.kinoU.woundOut ? '藤吉郎の手が戦い続けられぬ。残る組と退け' : '攻めが長引いた。囲みを続ける味方へ退け');
      rt.say('組頭', gone(F.kino) || F.kinoU.woundOut ? '藤吉郎の手が崩れた。残る者を集め、味方のいる麓へ退け' : '攻めが長引いた。残る者を集め、囲みの味方へ退け', 4);
      rt.finish({}, 8); return;
    }
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
      if (rt.t > (F.dawnT || 0) && !F.dawnDone) { F.dawnT = rt.t + 4; const k = Math.min(1, (rt.t - F.stepT) / 100); applyLook(rt, mixLook(DAWN, DAWN2, k), k >= 1); if (k >= 1) F.dawnDone = true; }
      // 火を放ちに来ない時は、藤吉郎がやり方を言う（一度だけ）
      if (rt.t - F.stepT > 45 && F.lit < NEED && !F.burnCall) { F.burnCall = true; rt.say(officer(rt), `${nm(rt)}、印の家の前で「家に火を放つ」を長く押せ。松明はもう持っておる`, 4); }
    }
    if (F.step === 2) {
      const qs = [F.ote, F.ote2].filter(Boolean);
      rt.objProgress('main', gone(F.ote) && !F.ote2.sent ? '初めの寄せは退いた。木戸の新手に備えよ' : '仲間と並び、打って出た兵を押し返せ');
      // 前の勢が崩れたら、5 秒後に新手
      if (!F.oteVolley && F.nGun.count && qs.some((q) => !gone(q) && Math.hypot(q.center().x - F.nGun.anchor.x, q.center().z - F.nGun.anchor.z) < 26)) { F.oteVolley = true; F.nGun.fire = true; if (sightPoint(rt, F.nGun.anchor)) rt.say('鉄砲頭', '引きつけた……放て！', 2.5); }
      if (gone(F.ote) && !F.ote2.sent && !F.ote2Q) { F.ote2Q = true; this.oteWarn(rt); rt.after(5, () => this.ote2(rt)); }
      if (F.ote2.sent && qs.every(gone)) {
        rt.unmark('ote'); rt.unmark('ote2');
          rt.objDone('main');
        this.karamete(rt);
      }
    }
    if (F.step === 3) {
      const p = rt.player.u.pos;
      const kd = Math.hypot(p.x + 30, p.z + 118);
      if (!F.guardOn && rt.t >= (F.karaGuideAt || 0)) {
        F.karaGuideAt = rt.t + 1;
        let distance = Infinity, next = 1;
        for (let i = 1; i < KARA.length - 1; i++) {
          const a = KARA[i - 1], b = KARA[i], dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
          if (d < distance) { distance = d; next = i; }
        }
        if (Math.hypot(p.x - KARA[next][0], p.z - KARA[next][1]) < 4) next = Math.min(KARA.length - 2, next + 1);
        const q = F.karaGuide || (F.karaGuide = { x: 0, z: 0 });
        q.x = KARA[next][0]; q.z = KARA[next][1];
        if (!F.karaGuideMarked) { F.karaGuideMarked = true; rt.marker('karaGuide', () => F.karaGuide, '裏道の次の曲がり角'); }
        rt.objProgress('main', `裏道の次の曲がり角まで ${Math.max(0, Math.round(Math.hypot(p.x - q.x, p.z - q.z)))}歩ほど・藤吉郎の旗に続け`);
      }
      else if (F.guardOn) { rt.unmark('karaGuide'); F.karaGuideMarked = false; rt.objProgress('main', '仲間と槍をそろえ、木戸の守りを退けよ'); }
      const kc = F.kino.center();
      if (!F.guardOn) this.climbEvents(rt);
      if (!F.guardOn && (kd < 30 || Math.hypot(kc.x + 30, kc.z + 118) < 26)) this.guardFight(rt);
      if (F.guardOn && gone(F.kguard)) { rt.unmark('kguard'); this.signal(rt); }
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
      if (!F.sig && F.hata.every(gone) && gone(F.tatsu) && gone(F.keep.guard)) this.lightSig(rt);
      // 合図は本人が実際に火を付けるまで待つ。
      if (F.sig && rt.t - F.sigT > 20 && !F.sigCall) { F.sigCall = true; rt.say(officer(rt), `${nm(rt)}、印の小屋じゃ！　前に立って「小屋に火を放つ」を長く押せ`, 4); }
    }
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
inabayama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };

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
      { name: '長良川の舟着き', x: FUNA.x, z: FUNA.z, info: '川沿いの舟着き。ほかの退路は不明' },
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
inabayama.history = '永禄十年（1567）八月、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。織田信長はすぐに兵を出して稲葉山城の東の瑞龍寺山に陣を取り、城下の井口の町を焼き払って城を裸にし、まわりに鹿垣を結って囲んだ。城主の斎藤龍興は半月ほどで城を明け渡し、長良川を舟で下って伊勢長島へ逃れた。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏の道を案内されて搦手から攻め上ったという話は、のちの『太閤記』などに見える伝えで、確かな記録にはない。この戦では、放火の日と翌日の囲みを分け、八月十五日の開城は後日談で描く。搦手での局地戦と合図は遊びの補いで、これだけで城が降ったとはしない。総勢と各備の人数は仮の目安で、確定した兵数ではない。';
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
const BOT_KARA = [...KARA.slice(0, -1), [HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]];
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
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  // 退避と手当ては共通の survive に任せる。敵の前で上役へ背を向けたり、
  // 手当てのできない位置で傷が戻るのを待ったりしない。
  b.botRest = false;
  const c = F.kino.center();
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
  const e = attacker || (pending && !pending.isStruct && !pending.group?.civ ? pending : null) || b.army.nearestEnemy(u, F.step === 1 ? 7 : 12, (o) => !o.fleeing && !o.noTarget && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false) && !(o.group && o.group.civ) &&
    (F.step !== 2 || (o.pos.z >= -28 && Math.hypot(o.pos.x + 4, o.pos.z + 18) < 18)));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 振りかぶりを見ただけで止まると、敵の槍だけが届く所に居残る。
    // 振り出す前は構えて詰める。突進や振っている刃には踏み込まない。
    if (d > reach * 0.85 && !(attacker && (attacker.charging || (attacker.swing && !attacker.swing.done)))) {
      goTo(p, inp, e.pos.x, F.step === 2 ? Math.max(-24, e.pos.z) : e.pos.z, reach * 0.85);
    }
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
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
    const t = [F.town, F.town2].find((x) => x && !gone(x));
    if (t) { const cc = t.center(); goTo(p, inp, cc.x, cc.z, 2); return; }
  }
  if (F.step === 2) {
    // 打って出る敵を鹿垣の内で迎える。山上の控えへ登って待たない。
    goTo(p, inp, -4, -18, 3); return;
  }
  if (F.step === 3) {
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 2)) return;
    if (F.guardOn && !gone(F.kguard)) { const t = F.kguard.center(); goTo(p, inp, t.x, t.z, 2); return; }
    return;
  }
  if (F.step === 4) {
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 1)) return;
    const hq = (F.hata || []).find((q) => !gone(q));
    if (hq) { const t = hq.center(); goTo(p, inp, t.x, t.z, 2); return; }
    const q = nearIt(b, 'sig');
    if (q) {
      if (b.nearestInteract() === q.it) inp.k.add('KeyE'); else goTo(p, inp, q.it.pos.x, q.it.pos.z, Math.min(1.2, q.it.r * 0.8));
    }
    return;
  }
  goTo(p, inp, c.x + 3, c.z + 4, 3);
};

inabayama.rts = true;
export { inabayama };
