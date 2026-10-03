// ======================================================================
// 山岳戦　越前一向一揆の山の寺（大滝寺）攻め（late6-1573-1575-spec 80-96。「夜討ち」は GAME_C、焼き討ちは史実）
// 天正三年（1575）八月。信長は大軍で越前へ攻め入り、一向一揆は山々の寺に拠って抗った。
// ここは夜と霧の中、柴田勝家の手が山の寺（大滝寺）と、一体の五箇和紙の里を攻める一戦。
// 攻め方の作戦四つ（参道・谷の道・森の小道・火攻め）で結果が変わる（木ノ芽峠 b_kinome.js の F9 と同じ仕組み）。
// 比叡山（b_hiei_mtn.js）を手本に、使い回しで作った。
//
// 守る側の山（援軍まで寺の区域を守る型）は、同じ縄張り・同じ部品で、同じファイルの中の切り替えで
// 作る（window.__echizenMode==='defend'。siege_zones.js の reinforceAt／onReinforce を使う。
// b_sunomata.js の「守る砦」と同じ組み合わせ）。lord.js・battles.js には攻め手の一戦だけを登録する。
// ======================================================================
import { hut, tawara, sakamogi, village, scaffold, kagaribi, campfire } from './props.js';
import { hondo, doja, sobo, kura, monomidai, shoro, ishidan } from './temple_parts.js';
import { ringBell } from './temple1571.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { enemyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE, zoneWord, makeFirstIn } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeDefenseAI } from './siege_ai.js';
import { attachFireSpread } from './siege_fire.js';
import { nightAccuracyMult } from './siege_vis.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance } from './taketaba.js';
import {
  ECHIZEN_IKKO_PLAN, VILLAGE, GOKA_MURA, GATE_SOMON, GATE_SANMON, OKUYAMA,
  FOREST_POLY, FOREST2_POLY, SANDO, VALLEY_ROAD, FOREST_ROAD, OKU_ROAD,
} from './castles/echizen_ikko.js';

// 見張り（山門番・番所・鐘楼・簡易見張り台）。城の物見櫓は置かない（late6-1573-1575-spec 80-96）
const MONOMI_R = { x: 30, z: -34 };   // 右（谷川沿い）を見おろす見張り台
const MONOMI_L = { x: -26, z: -36 };  // 左（森の小道・五箇の里の裏）を見おろす見張り台
const SHORO_POS = { x: 11, z: -50 };  // 外堂の鐘楼（警報の鐘）

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const IKKO = { armor: 0x2a2622, flag: 'namu' };
const ODA = { armor: 0x2b3140, flag: 'oda' };
// 寺の戦の決まった知らせ（「本丸」「城主」でなく、寺の言葉で）
const TEMPLE_MSG = {
  retreat: (name) => `衆徒が${name}へ退く`,
  honmaruOpen: () => '本堂への道が開いた',
  honmaruFall: () => '本堂に踏み込んだ',
  surrender: () => '衆徒が降った',
  commanderDown: () => '寺を率いる坊官が討たれた',
  flee: () => '坊官が奥山へ逃げた',
};

// 守る側（defend）に切り替える時だけ使う（sim・bot の確かめ用。既定は攻め手）
function mode() { return window.__echizenMode === 'defend' ? 'defend' : 'attack'; }

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.05 - 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.045 + x * 0.03);
  h += Math.max(0, z + 205) * 0.38;      // 村から山の寺へ（南→北）、奥へ行くほど高く
  const dv = distToPolyline(x, z, VALLEY_ROAD);
  h -= Math.max(0, 14 - dv) * 0.35;      // 谷の道の周りはいくらか窪む（伏兵に向く）
  return h;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(ECHIZEN_IKKO_PLAN, baseTerrain, 3);
  return HEIGHT_FN(x, z);
}

// 部隊（Butai）の多点の道：着いたら次の点へ。最後まで着いたら attack（b_hiei_mtn.js と同じやり方）
function setRoute(b, pts) { b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: 'attack' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
// 本物の兵の合計は 235 まで（butai.js の枠）。初めの本物は小さく持たせ、butai.js の _autoSwitch が増やす
// 一向宗の姿（B014・B027）：門徒は鉢巻と茶の衣、寺の衆徒・薙刀の僧兵は白い裹頭と袈裟（humans.js の sohei）
function mkB(rt, o) {
  const monk = /衆徒|薙刀|衆|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  const look = monk ? { sohei: 1, hat: 'hachimaki', lace: 0xcfc7b4, cloth: 0xd8d2c2 } : { hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
  return makeButai(rt, { real: Math.min(14, o.nominal), ...(o.faction === 'ikko' ? { look } : {}), ...o });
}

const echizen_ikko = {
  // 守る側（defend）は本堂の内（castles/echizen_ikko.js の hondo の中ほど）から始める。攻め手は山麓の村から
  get spawn() { return mode() === 'defend' ? { x: 0, z: 10, heading: Math.PI } : { x: VILLAGE.x, z: VILLAGE.z - 2, heading: 0 }; },
  world: {
    seed: 15750,
    moveLim: 220,   // 山麓の村（z≈-200）から始まる。既定の 176 だと村の者と自分が戦場の外の扱いで引き戻されていた（見回り 10/2）
    time: 'night',
    nightLift: 4.5,   // 月明かりを強める（林の陰で画面がほぼ黒になっていた）
    mist: true,
    muddy: 0.1,
    streams: [{ pts: [[44, -150], [50, -108], [44, -70], [34, -34]], w: 2.2, depth: 0.8 }],   // 谷川（夜の川音）
    terrainTags: true,   // 急斜面・石段・細道・森で速さ・向き変え・疲れ・当たりが変わる（terrain_tags.js）
    paths: [SANDO, VALLEY_ROAD, FOREST_ROAD, OKU_ROAD],
    height,
    tint(x, z, h, c) { if (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z)) c.setRGB(c.r * 0.68, c.g * 0.8, c.b * 0.68); },
    clear: (x, z) => distToPolyline(x, z, SANDO) < 12 || distToPolyline(x, z, VALLEY_ROAD) < 12 || distToPolyline(x, z, FOREST_ROAD) < 12,
    trees: 1500,
    tufts: 2400,
    treeDensity: (x, z) => (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z) ? 1.6 : 0.65),
    groves: [{ x: 32, z: -110, r: 20, n: 24 }, { x: 20, z: -10, r: 16, n: 18 }, { x: -30, z: -100, r: 18, n: 20 }],
    fleeOut: (x, z, team) => team === 1 && (x < -70 || z < -215),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.fow = true;
    F.mode = mode();
    rt.__fireZones = {};
    flReset();

    const C = F.C = buildCastlePlan(rt, ECHIZEN_IKKO_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['gezan', 'hondo', 'oku'] });
    const gezanC = C.kuruwa.gezan.centroid, hondoC = C.kuruwa.hondo.centroid, okuC = C.kuruwa.oku.centroid;

    // ---- 寺の部品（temple_parts.js）：外堂（講堂・僧坊）・本堂（中心伽藍）・奥の院 ----
    rt.scene.add(sobo(W, gezanC.x - 6, gezanC.z + 6, 0.25), doja(W, gezanC.x + 9, gezanC.z - 4, -0.2));
    F.gezanKura = kura(W, gezanC.x + 7, gezanC.z + 8, 0.1);
    rt.scene.add(F.gezanKura);
    F.gezanKuraStruct = rt.army.addStruct({ x: gezanC.x + 7, z: gezanC.z + 8, r: 3, solidR: 3, hp: 150, maxHp: 150, armor: 0, team: 1, name: '外堂の倉', moraleOnBurn: 'small', flammable: true });

    F.hondoBldg = hondo(W, hondoC.x - 10, hondoC.z - 8, 0.1);
    rt.scene.add(F.hondoBldg, doja(W, hondoC.x + 11, hondoC.z + 6, -0.25));
    F.hondoStruct = rt.army.addStruct({ x: hondoC.x - 10, z: hondoC.z - 8, r: 5, solidR: 5, hp: 260, maxHp: 260, armor: 0, team: 1, name: '本堂', moraleOnBurn: 'big', flammable: true });
    rt.scene.add(ishidan(W, GATE_SANMON.x, GATE_SANMON.z, hondoC.x, hondoC.z - 4, 3.2));
    // 夜でも寺の形が見えるよう、本堂・外堂のまわりに篝火を置く（B021・B022）
    for (const [x, z] of [[hondoC.x - 18, hondoC.z - 2], [hondoC.x + 2, hondoC.z - 18], [hondoC.x + 16, hondoC.z - 6], [hondoC.x - 4, hondoC.z + 12], [gezanC.x - 14, gezanC.z + 2], [gezanC.x + 14, gezanC.z + 4]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.scene.add(sobo(W, okuC.x - 7, okuC.z + 5, 0.2), hut(W, okuC.x + 7, okuC.z - 6, 5, 4, -0.15));
    // 建物ごとの延焼：僧坊・奥の坊を燃える的にし、外堂の倉→本堂→僧坊→奥の院と火が寺院群へ広がる道を作る（siege_fire.js の燃え移り）
    F.soboStruct = rt.army.addStruct({ x: okuC.x - 7, z: okuC.z + 5, r: 4, solidR: 4, hp: 110, maxHp: 110, armor: 0, team: 1, name: '奥の僧坊', moraleOnBurn: 'small', flammable: true });
    F.okuBoStruct = rt.army.addStruct({ x: okuC.x + 7, z: okuC.z - 6, r: 3, solidR: 3, hp: 90, maxHp: 90, armor: 0, team: 1, name: '奥の坊', moraleOnBurn: 'small', flammable: true });
    F.gezanBoStruct = rt.army.addStruct({ x: gezanC.x - 2, z: gezanC.z - 10, r: 3, solidR: 3, hp: 90, maxHp: 90, armor: 0, team: 1, name: '外堂の坊', moraleOnBurn: 'small', flammable: true });
    // 夜の灯明：本堂の前に灯り（灯りが夜の目印）
    for (const [dx, dz] of [[-6, 4], [6, 4]]) W.addFire(hondoC.x + dx, hondoC.z + dz);
    // 門の篝火（寺の見張りが焚く。夜の山で門の場所が遠くから分かり、門の前が照らされる）
    for (const [x, z] of [[GATE_SOMON.x - 4.5, GATE_SOMON.z + 2.5], [GATE_SOMON.x + 4.5, GATE_SOMON.z + 2.5], [GATE_SANMON.x - 4.5, GATE_SANMON.z + 2.5], [GATE_SANMON.x + 4.5, GATE_SANMON.z + 2.5], [gezanC.x + 6, gezanC.z - 4]]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 });
    }
    rt.scene.add(hut(W, gezanC.x - 2, gezanC.z - 10, 5, 4, 0.1), tawara(W, gezanC.x - 2, gezanC.z - 6, 0, 2));
    rt.scene.add(monomidai(W, MONOMI_R.x, MONOMI_R.z, 0));
    rt.scene.add(monomidai(W, MONOMI_L.x, MONOMI_L.z, Math.PI));
    F.shoroStruct = rt.army.addStruct({ x: SHORO_POS.x, z: SHORO_POS.z, r: 2, solidR: 2, hp: 90, maxHp: 90, armor: 0, team: 1, name: '鐘楼', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(shoro(W, SHORO_POS.x, SHORO_POS.z, 0));
    for (const [x, z, r] of [[GATE_SANMON.x - 8, GATE_SANMON.z - 2, 0.2], [GATE_SANMON.x + 8, GATE_SANMON.z - 2, -0.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 五箇の和紙の里（寺と一体。家屋・紙漉き場・乾燥棚・倉。紙と木の家は火が広がりやすい） ----
    rt.scene.add(village(W, GOKA_MURA.x, GOKA_MURA.z, { n: 5, r: 15, rot: 0, fields: 0, bamboo: 0, smoke: 1, seed: 575 }));
    F.gokaKura = kura(W, GOKA_MURA.x + 14, GOKA_MURA.z - 4, 0.2);
    rt.scene.add(F.gokaKura, hut(W, GOKA_MURA.x - 10, GOKA_MURA.z + 8, 4, 3.4, 0.15), hut(W, GOKA_MURA.x + 2, GOKA_MURA.z + 12, 4, 3, -0.2));
    // 紙漉き場・楮（こうぞ）・乾燥棚：紙と木の家は火が広がりやすい（建物ごとの的にして、延焼の道に並べる）
    rt.scene.add(hut(W, GOKA_MURA.x - 2, GOKA_MURA.z - 8, 5, 3.6, 0.1, { wall: 0x8a7a5a, h: 2.2 }), tawara(W, GOKA_MURA.x + 4, GOKA_MURA.z - 7, 0.3, 4), tawara(W, GOKA_MURA.x - 8, GOKA_MURA.z - 4, 0.1, 3));
    rt.scene.add(scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 10, 0.2), scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 14, 0.2));
    F.kamisukiStruct = rt.army.addStruct({ x: GOKA_MURA.x - 2, z: GOKA_MURA.z - 8, r: 3, solidR: 3, hp: 100, maxHp: 100, armor: 0, team: 1, name: '紙漉き場', moraleOnBurn: 'small', flammable: true });
    F.kansoStruct = rt.army.addStruct({ x: GOKA_MURA.x - 14, z: GOKA_MURA.z - 12, r: 3, solidR: 3, hp: 70, maxHp: 70, armor: 0, team: 1, name: '紙の乾燥棚', moraleOnBurn: 'small', flammable: true });
    F.gokaKuraStruct = rt.army.addStruct({ x: GOKA_MURA.x + 14, z: GOKA_MURA.z - 4, r: 3, solidR: 3, hp: 120, maxHp: 120, armor: 0, team: 1, name: '五箇の紙倉', moraleOnBurn: 'small', flammable: true });

    // ---- 木戸（惣門・山門） ----
    F.gateSomon = kido(rt, GATE_SOMON.x, GATE_SOMON.z, 3.2, 0, { team: 1, hp: 220, name: GATE_SOMON.name, gate: 0 });
    F.gateSanmon = kido(rt, GATE_SANMON.x, GATE_SANMON.z, 3.4, 0, { team: 1, hp: 260, name: GATE_SANMON.name, gate: 1 });

    // ---- 区域の網と退路（siege_zones.js） ----
    const okuyamaTest = (x, z) => Math.hypot(x - OKUYAMA.x, z - OKUYAMA.z) < 22;

    if (F.mode === 'attack') {
      // ===== 攻め手（player＝柴田勝家の手）：越前一向一揆の山の寺を攻め落とす =====
      F.ikkoGezanSpear = mkB(rt, { name: '外堂の一揆勢（薙刀）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 46, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x, z: gezanC.z - 6 }, facing: Math.PI });
      F.ikkoGezanBow = mkB(rt, { name: '外堂の一揆勢（弓）', team: 1, faction: 'ikko', kind: 'bow', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x + 6, z: gezanC.z - 2 }, facing: Math.PI });
      F.ikkoHondoMain = mkB(rt, { name: '大滝寺の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 60, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 10 }, facing: Math.PI });
      F.ikkoHondoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 1, faction: 'ikko', kind: 'gun', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z - 4 }, facing: Math.PI });
      F.ikkoOkuLast = mkB(rt, { name: '奥の院の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 42, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x, z: okuC.z - 6 }, facing: Math.PI });
      F.ikkoCounter = mkB(rt, { name: '一揆の逆襲の手', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 22, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x - 4, z: okuC.z + 8 }, facing: Math.PI });
      F.ikkoAmbush = mkB(rt, { name: '一揆の伏兵（谷筋）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 26, armor: IKKO.armor, flag: IKKO.flag, at: { x: 30, z: -70 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoGezanSpear, F.ikkoGezanBow, F.ikkoHondoMain, F.ikkoHondoBow, F.ikkoOkuLast, F.ikkoCounter, F.ikkoAmbush];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      F.commander = { alive: true };   // 一揆の指導者は討たれず加賀へ逃れた扱い
      F.civ = [];
      this.civ(rt, GOKA_MURA.x - 6, GOKA_MURA.z + 2, 4, '逃げる和紙の職人', { x: -0.4, z: -1 });
      this.civ(rt, gezanC.x - 6, gezanC.z + 10, 3, '逃げる僧', { x: 0, z: 1 });
      this.civ(rt, okuC.x + 2, okuC.z + 10, 3, '山へ逃れる里の者', { x: 0.2, z: 1 });
      rt.obj('civ', '手向かわない職人・僧・里の者は討つな', 'side');

      F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 14, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 4 }, facing: 0 });
      F.mainSpear = mkB(rt, { name: '柴田勝家の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.mainGun = mkB(rt, { name: '柴田勝家の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.flankSpear = mkB(rt, { name: '前田利家の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.flankBow = mkB(rt, { name: '佐々成政の手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 26, z: VILLAGE.z + 6 }, facing: 0 });
      F.reserve = mkB(rt, { name: '予備', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 60, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 8, z: VILLAGE.z - 10 }, facing: 0 });
      F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG,
        zones: [
          { id: 'gezan', name: '外堂（講堂・僧坊）', test: C.kuruwa.gezan.test, pos: gezanC, need: 5, hold: 12, next: 'hondo' },
          { id: 'hondo', name: '本堂（中心伽藍）', test: C.kuruwa.hondo.test, pos: hondoC, need: 7, hold: 16, honmaru: true, gate: GATE_SANMON.name, next: 'oku' },
          { id: 'oku', name: '奥の院', test: C.kuruwa.oku.test, pos: okuC, need: 4, hold: 12, next: 'okuyama' },
          { id: 'okuyama', name: OKUYAMA.name, test: okuyamaTest, pos: OKUYAMA, need: 3, hold: 8 },
        ],
        links: [['gezan', 'hondo'], ['hondo', 'oku'], ['oku', 'okuyama']],
        friendTeam: 0, enemyTeam: 1,
        totalDefenders: F.defendTotal,
        commander: () => F.commander,
        noReinforce: () => true,
        escape: { zoneId: 'okuyama', rally: { x: OKUYAMA.x - 24, z: OKUYAMA.z + 14 } },
        onFall: (id) => this.onZoneFall(rt, id),
        onHonmaru: () => this.win(rt),
        onSurrender: () => this.win(rt),
      });

      // 山の頭（siege_ai.js）：夜と霧は伏兵に近付くまで気付きにくい（revealRange を nightAccuracyMult ぶん縮める）
      const nmul = nightAccuracyMult(W);
      F.AMB = makeMountainAmbush(rt, {
        zones: F.SZ,
        posts: [{ id: 'valley', butai: F.ikkoAmbush, at: { x: 28, z: -66 }, cover: '谷筋・霧の中', revealRange: 20 * nmul, routeZoneId: 'gezan', concentrateShare: 0.35, side: 'flank' }],
      });
      F.MD = makeMountainDefense(rt, {
        zones: F.SZ,
        posts: [
          { id: 'gezan_s', butai: F.ikkoGezanSpear, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'gezan_b', butai: F.ikkoGezanBow, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'hondo_s', butai: F.ikkoHondoMain, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'hondo_b', butai: F.ikkoHondoBow, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'oku_s', butai: F.ikkoOkuLast, at: okuC, fireZoneId: 'oku' },
        ],
        counter: { butai: F.ikkoCounter, from: '奥の院', watch: 'gezan_s' },
      });
      F.FS = attachFireSpread(rt, { onGranary: () => { rt.__fireZones.gezan = true; } });

      const n = Math.max(RANKS[rt.G.rank].squad || 0, 7);
      rt.makeSquad({ x: VILLAGE.x - 4, z: VILLAGE.z - 4 }, 0, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', hi(rt) ? '柴田勝家の先手の一隊を預かり、夜討ちで大滝寺を攻め落とせ' : '柴田勝家のもとで、下知を待て', 'main');
      rt.say('柴田勝家', `${nm(rt)}、霧が出ておる。夜の内に外堂を落とし、本堂まで一息に攻め上る`, 5);
      rt.say('柴田勝家', '谷筋には一揆の伏兵がおるとの噂じゃ。油断すな', 4);
      rt.marker('main', unitPos(F.mainSpear.real.units[0]), '柴田勝家', {});
      // ---- 竹束の寄せ（taketaba.js）：参道・谷の道の先手は竹束を押し立て、ゆっくり寄せ場まで登って撃ち合う ----
      const SANDO_YOSE = { x: -2, z: -112 };
      const somonOpen = () => F.gateSomon.struct.hp <= 0, sanmonOpen = () => F.gateSanmon.struct.hp <= 0;
      const flankYose = (dx) => () => (F.strategy === 'front' ? { x: SANDO_YOSE.x + dx, z: SANDO_YOSE.z } : F.strategy === 'forest' ? { x: -20 + dx, z: -34 } : { x: 20 + dx, z: -34 });
      F.TA = makeTabaAdvance(rt, {
        items: [
          { g: F.mainSpear, yose: SANDO_YOSE, until: somonOpen }, { g: F.mainGun, yose: { x: 5, z: -114 }, until: somonOpen },
          { g: F.flankSpear, yose: flankYose(0), until: () => (F.strategy === 'front' ? somonOpen() : sanmonOpen()) },
          { g: F.flankBow, yose: flankYose(6), until: () => (F.strategy === 'front' ? somonOpen() : sanmonOpen()) },
        ],
        avoid: [this.spawn],
      });
      // ---- 一番乗り（siege_zones.js）：惣門・山門が破れても、自分が踏み込むまで味方は門の外で待つ ----
      F.FI = makeFirstIn(rt, { from: this.spawn, gates: [{ gate: F.gateSomon, zone: C.kuruwa.gezan.test }, { gate: F.gateSanmon, zone: C.kuruwa.hondo.test }] });
      rt.after(14, () => this.assault(rt));
    } else {
      // ===== 守る側（defend）：越前一向一揆として、援軍（加賀門徒）が来るまで本堂を守りきる =====
      // siege_zones.js の reinforceAt／onReinforce（b_sunomata.js の「守る砦」と同じ組み合わせ）を使う。
      F.ikkoMain = mkB(rt, { name: '大滝寺の衆徒', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 70, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 8 }, facing: Math.PI });
      F.ikkoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 0, faction: 'ikko', kind: 'gun', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z - 4 }, facing: Math.PI });
      F.ikkoAmbushD = mkB(rt, { name: '衆徒の伏兵（谷筋）', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: { x: 28, z: -66 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoMain, F.ikkoBow, F.ikkoAmbushD];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.odaMain = mkB(rt, { name: '柴田勝家の手（槍）', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 130, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.odaGun = mkB(rt, { name: '柴田勝家の手（鉄砲）', team: 1, faction: 'oda', kind: 'gun', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.odaFlank = mkB(rt, { name: '前田利家の手', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 90, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.attackers = [F.odaMain, F.odaGun, F.odaFlank];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG,
        zones: [{ id: 'hondo', name: '本堂', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 8, start: ZONE_STATE.FRIEND }],
        friendTeam: 0, enemyTeam: 1,
        noReinforce: () => true,
        reinforceAt: { zoneId: 'hondo', sec: 150 },
        onReinforce: () => this.reinforceArrive(rt),
      });
      F.DA = makeDefenseAI(rt, {
        posts: [{ id: 'hondo', butai: F.ikkoMain, at: hondoC, ambush: false }, { id: 'valley', butai: F.ikkoAmbushD, at: { x: 28, z: -66 }, ambush: true, revealRange: 20 * nightAccuracyMult(W) }],
        reserves: [F.ikkoBow],
        fallback: { x: okuC.x, z: okuC.z },
      });
      // 攻め手（村で勢揃いしてから、参道・谷の道を本堂まで歩く＝攻め手の assault() と同じ setRoute／tickRoutes を使う。
      // makeMountainAttack の「入口まで move して hold」だけでは本堂まで進まず、援軍の方が先に来てしまうので使わない
      rt.after(10, () => {
        if (F.ending) return;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, [...SANDO.slice(1)]);
        setRoute(F.odaFlank, [...VALLEY_ROAD]);
      });

      const n = Math.max(RANKS[rt.G.rank].squad || 0, 6);
      rt.makeSquad({ x: hondoC.x + 4, z: hondoC.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', '援軍（加賀門徒）が来るまで、本堂を守りきれ', 'main');
      rt.say('大滝寺の衆徒', `${nm(rt)}、織田の手が麓に押し寄せておる。本堂を枕に、加賀の門徒衆が来るまで持ちこたえよ`, 5);
      rt.marker('main', hondoC, '本堂', { red: false });

    }
  },

  // ① 物見を先に出し、作戦に応じて参道（表）・谷の道に分かれる（木ノ芽峠 b_kinome.js F9 と同じ三択）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('main');
    sfx('horagai', 0.85);
    // 夜討ちは音を立てず忍ぶ戦：竹束の掛け声は出さない（B023）
    rt.banner('夜討ち', '霧に紛れ、音を立てず登る');
    rt.say('柴田勝家', '者ども、声を立てるな。静かに寄せよ', 3);
    rt.obj('main', '外堂を落とし、本堂へ夜討ちをかけよ', 'main');
    setRoute(F.scout, [[20, -150]]);
    rt.after(6, () => { F.scouted = true; rt.bark('物見が戻った。谷筋に人影あり、との事'); });

    const strat = F.strategy = F.strategy || 'valley';
    if (strat === 'front') {
      // ①正面：参道一本で真っ直ぐ本堂を目指す（早いが、外堂で削れぬ分、本堂の守りが厚いまま）
      rt.say('柴田勝家', '谷へは分けぬ。皆、参道より真っ直ぐ本堂を目指せ', 4);
      for (const b of [F.mainSpear, F.mainGun, F.flankSpear, F.flankBow]) setRoute(b, [...SANDO.slice(1)]);
    } else if (strat === 'fire') {
      // ③火攻め：まず外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気は削れるが、攻め手も見通しが悪くなる）
      rt.say('柴田勝家', 'まず外堂に火を放て。煙と霧に紛れて進む', 4);
      rt.after(8, () => {
        if (F.ending) return;
        rt.army.igniteStruct(F.gezanKuraStruct, { x: F.gezanKuraStruct.x, z: F.gezanKuraStruct.z });
        rt.__fireZones.gezan = true;
        rt.banner('外堂に火の手が上がる', '煙が夜霧に混じり、あたりが見えにくくなる');
      });
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...SANDO.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...VALLEY_ROAD]);
    } else if (strat === 'forest') {
      // ④森の小道：前田・佐々の手は左の森の小道（五箇の里の裏）から回る。静かだが谷の道より長い。谷筋の伏兵には会わない
      rt.say('前田利家', '左手、森の小道より回り込み申す。音を立てず参ろう', 3.5);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...SANDO.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...FOREST_ROAD]);
    } else {
      // ②谷から回る（既定・strat==='valley'）：主力は参道、前田・佐々の手は谷の道から回り込み、本堂を挟み撃つ
      rt.say('前田利家', '谷の道から回り込み、本堂の裏を突き申す', 3.5);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...SANDO.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...VALLEY_ROAD]);
    }
    rt.marker('gezan', centerOf(F.ikkoGezanSpear.real), () => `外堂の一揆勢・${moraleWord(F.ikkoGezanSpear.morale)}`, { red: true });
    rt.marker('hondo', centerOf(F.ikkoHondoMain.real), () => `本堂・${moraleWord(F.ikkoHondoMain.morale)}`, { red: true });
  },

  // 見張りに見つかる→鐘（ringBell）→寺内が警戒。潜入から戦いへ変わる一度きりの出来事
  alarm(rt) {
    const F = rt.flags;
    if (F.alarmed) return;
    F.alarmed = true;
    ringBell(rt, F.shoroStruct);
    rt.banner('鐘が鳴る', '見張りに見つかった。寺内が色めき立つ');
    rt.say('大滝寺の衆徒', '者ども、出合え！　敵じゃ！', 3.5);
    for (const b of F.defenders) if (b.real) b.real.morale = Math.min(100, b.real.morale + 8);
  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'gezan' && !F.gezanFell) {
      F.gezanFell = true;
      rt.banner('外堂を落とした', '守りは本堂へ退く');
      if (!rt.__fireZones.gezan) { rt.army.igniteStruct(F.gezanKuraStruct, { x: F.gezanKuraStruct.x, z: F.gezanKuraStruct.z }); rt.__fireZones.gezan = true; }
      rt.unmark('gezan');
      F.scouted = true;
      rt.obj('block', '奥山道（加賀側）をふさげば、なお崩れやすい', 'side');
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gezan'); rt.unmark('hondo');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '越前一向一揆の山の寺を攻め落とした', pts: 22 }; }, '任務達成・大滝寺を攻め落とした');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('職人・僧・里の者を討たなかった'), '副任務：職人・僧・里の者を討たなかった'); }
    sfx('kane', 0.5);
    rt.banner('本堂、落ちる', '一揆の衆徒は討たれ、あるいは加賀へ落ちのびた');
    rt.say('柴田勝家', `${nm(rt)}、山の寺は落ちた。……越前は、これで静まろう`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 守る側：加賀門徒の援軍が来た（siege_zones の onReinforce）
  reinforceArrive(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    const reinforce = enemyGroup(rt, { faction: 'ikko', name: '加賀門徒の援軍', anchor: { x: OKUYAMA.x, z: OKUYAMA.z }, facing: Math.PI }, [{ type: 'ashigaru', n: 40 }]);
    reinforce.team = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '加賀門徒の援軍が来るまで本堂を守りきった', pts: 20 }; }, '任務達成・本堂を守りきった');
    sfx('kane', 0.5);
    rt.banner('加賀門徒、来援', '援軍の旗が、山の下に見える');
    rt.say('大滝寺の衆徒', `${nm(rt)}、加賀の門徒衆が参ったぞ！　よう持ちこたえた`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    butaiTick(rt, dt);
    if (F.ending) return;
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    if (F.SZ) F.SZ.tick(dt);
    if (F.AMB) F.AMB.tick(dt);
    if (F.MD) F.MD.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.FS) F.FS.tick(dt);
    if ((F.mode === 'attack' && F.step >= 1) || F.mode === 'defend') tickRoutes(F.attackers);
    if (F.FI) F.FI.tick();
    if (F.mode === 'attack') {
      // 見張りに見つかる→鐘→寺内が警戒（late6-1573-1575-spec 80-96）。山門番・番所・鐘楼のどれかに近寄ると一度だけ
      if (F.step >= 1 && !F.alarmed && !F.ending) {
        const near = (p) => p && (Math.hypot(p.x - MONOMI_R.x, p.z - MONOMI_R.z) < 28 || Math.hypot(p.x - MONOMI_L.x, p.z - MONOMI_L.z) < 28 || Math.hypot(p.x - SHORO_POS.x, p.z - SHORO_POS.z) < 24);
        if ([F.scout, F.mainSpear, F.flankSpear].some((b) => b && near(b.pos))) this.alarm(rt);
      }
      // 見つからなくても60秒で鐘が鳴る（前半を短くする。B024）
      if (F.step >= 1 && !F.alarmed && rt.t - F.stepT > 60) this.alarm(rt);
      if (F.gezanFell && !F.hondoBurning && rt.t - F.stepT > 60) {
        F.hondoBurning = true;
        rt.army.igniteStruct(F.hondoStruct, { x: F.hondoStruct.x, z: F.hondoStruct.z });
        rt.__fireZones.hondo = true;
        rt.banner('本堂から煙', '山の上から、黒い煙が夜霧に混じって上がる');
      }
      if (F.step >= 1) {
        const st = F.SZ ? F.SZ.stat() : {};
        if (!F.gezanFell) rt.objProgress('main', `外堂・${zoneWord(st.gezan)}`);
        else if (!F.ending) rt.objProgress('main', `本堂・${zoneWord(st.hondo)}`);
      }
      if (rt.t - (F.stepT || 0) > 480 && !F.ending) this.win(rt);
    } else {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.ending) rt.objProgress('main', `本堂・${zoneWord(st.hondo)}`);
      if (rt.t > 420 && !F.ending) this.win(rt);   // 確かめを止めない保険（援軍が間に合わなかった扱い）
    }
  },

  // 逃げる職人・僧・里の者（戦わない。討てば下知違反）。b_hiei_mtn.js の civ() と同じ作り
  civ(rt, x, z, n2, name, dir) {
    const F = rt.flags;
    const monk = name.includes('僧');
    const c = enemyGroup(rt, { faction: 'ikko', name, anchor: { x, z }, facing: Math.atan2(dir.x, dir.z), width: 4, aggro: 0, morale: 0, fleeDir: dir, speed: 2.5 },
      [{ type: 'porter', n: n2, o: monk ? { sohei: 1, flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    c.routed = true; c.order = 'flee';
    for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
    c.civ = true;
    (F.civ = F.civ || []).push(c);
    return c;
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    void k;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) { F.civHurt = true; rt.objFail('civ'); }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    // 同じ隊が立て直してはまた崩れる。名は一度だけ言う（見回り 10/2：同じ台詞が十数回）
    F.routSaid = F.routSaid || {}; if (F.routSaid[g.name]) return; F.routSaid[g.name] = 1;
    F.routSaidT = rt.t;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が崩れた`, 2.5);
  },
};

echizen_ikko.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return F.mode === 'attack' ? { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 } : { a: b, a0: F.defendTotal || 1, b: a, b0: F.attackTotal || 1 };
};
echizen_ikko.sides = { a: { name: '織田軍（柴田勝家・前田利家）', mon: 'oda' }, b: { name: '越前一向一揆・大滝寺の衆徒', mon: 'namu' } };
echizen_ikko.famous = [
  { name: '柴田勝家', team: 0, line: '夜のうちに外堂を落とせ。本堂まで一息じゃ' },
  { name: '前田利家', team: 0, line: '本堂の裏に着き申した。合図を待たれよ' },
  { name: '大滝寺の衆徒', team: 1, g: /本堂/, loose: 1, line: '阿弥陀仏の御山ぞ！　退くな！' },
];
echizen_ikko.date = () => '天正三年（1575）八月　夜・霧';
echizen_ikko.history = '天正三年（1575）八月、信長は大軍で越前へ攻め入り、一向一揆の立て籠もる山々の寺や砦を次々に攻め落とした。柴田勝家・前田利家・佐々成政らの手が各地の山の寺を囲み、多くの衆徒が討たれ、あるいは加賀へ落ちのびた。ここでは夜討ちと霧の中、山の寺（大滝寺）を攻める一戦として、作戦によって結果の変わる仕組みの見本にした。死者の数には諸説ある。';

// 軍議（gungi.js と同じ考え方。b_kinome.js F9・b_hiei_mtn.js と同じ作り）：三つの作戦から一つを選ぶ
//   ①front：参道一本で真っ直ぐ本堂へ（早いが、本堂の守りが厚いまま）
//   ②valley（既定）：前田・佐々の手が谷の道から回り込み、本堂を挟み撃つ（伏兵に遭いやすいが崩しやすい）
//   ③fire：先に外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気を削るが、攻め手も見通しが悪くなる）
echizen_ikko.gungi = (rt) => {
  const F = rt.flags;
  if (F.mode !== 'attack') return null;   // 守る側は作戦を選ばない（AI 任せ。setRoute で参道・谷の道を歩かせる）
  const G = {
    center: { x: 0, z: -60 }, dist: 110,
    units: [{ id: 'plan', name: '攻め方（柴田勝家・前田利家の手）', group: () => F.mainSpear && F.mainSpear.real, nominal: () => (F.mainSpear ? F.mainSpear.aliveNominal() : 0) }],
    routes: [
      { id: 'front', name: '参道一本で真っ直ぐ本堂へ攻め上る' },
      { id: 'valley', name: '谷の道から回り込み、本堂を挟み撃つ' },
      { id: 'forest', name: '森の小道（五箇の里の裏）から静かに回り込む' },
      { id: 'fire', name: '先に外堂へ火を放ち、煙に紛れて進む' },
    ],
    default: { plan: 'valley' },
    enemy: [
      { name: '外堂の一揆勢', known: true, count: () => (F.ikkoGezanSpear ? F.ikkoGezanSpear.aliveNominal() : 0) + (F.ikkoGezanBow ? F.ikkoGezanBow.aliveNominal() : 0) },
      { name: '大滝寺の衆徒（本堂）', known: false },
      { name: '一揆の伏兵（谷筋の噂）', known: false },
    ],
    onStart: (assign) => echizen_ikko.onGungiStart(rt, assign),
  };
  const auto = window.__echizenStrategy || (/[?&]bot/.test(location.search) ? 'valley' : null);
  if (auto) { echizen_ikko.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
echizen_ikko.onGungiStart = (rt, assign) => {
  rt.flags.strategy = (assign && assign.plan) || 'valley';
};

// 素直な遊び手：敵へ向かって戦い、無ければ本堂（攻め手）か持ち場（守り手）へ。深手の時は味方の中へ下がる
echizen_ikko.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const back = F.mode === 'attack' ? (F.mainSpear ? F.mainSpear.pos : { x: u.pos.x, z: u.pos.z - 6 }) : (F.ikkoMain ? F.ikkoMain.pos : { x: u.pos.x, z: u.pos.z });
  if (u.hp < u.maxHp * 0.45) {
    inp.guardHold = (b.army.threats || []).length > 0;
    goTo(p, inp, back.x, back.z, 4);
    return;
  }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    const press = (b.army.threats || []).length;
    inp.guardHold = press > 0 && Math.random() < Math.min(0.95, 0.6 + press * 0.15);
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, back.x, back.z + 4, 3);
};

export { echizen_ikko };
