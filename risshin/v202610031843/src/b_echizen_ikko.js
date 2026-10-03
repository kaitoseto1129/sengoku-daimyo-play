// ======================================================================
// 山岳戦　越前一向一揆の山の寺（大滝寺）攻め（late6-1573-1575-spec 80-96。「夜討ち」は GAME_C、焼き討ちは史実）
// 天正三年（1575）八月。信長は大軍で越前へ攻め入り、一向一揆は山々の寺に拠って抗った。
// 大瀧神社の由緒は滝川一益による堂塔の焼失を伝える。夜・霧・局地の兵数と道は遊び用の補い。
// 信長公記巻八の府中龍門寺への夜襲とは別の戦。紙の里は景色で、攻める的にしない。
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
import { enemyGroup, allyGroup, nm, unitPos } from './bhelp.js';
import { volley } from './b_nagashinojo.js';
import { battleEvent, EVENT_MESSENGER, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT, EVENT_REINFORCEMENT } from './battle_events.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE, zoneWord, makeFirstIn } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeDefenseAI } from './siege_ai.js';
import { attachFireSpread } from './siege_fire.js';
import { nightAccuracyMult } from './siege_vis.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance } from './taketaba.js';
import {
  ECHIZEN_IKKO_PLAN, VILLAGE, GOKA_MURA, GATE_SOMON, GATE_SANMON, OKUYAMA,
  FOREST_POLY, FOREST2_POLY, SANDO, VALLEY_ROAD, FOREST_ROAD, OKU_ROAD,
} from './castles/echizen_ikko.js';

// 見張り（山門番・番所・鐘楼・簡易見張り台）。城の物見櫓は置かない（late6-1573-1575-spec 80-96）
const MONOMI_R = { x: 30, z: -34 };   // 右（谷川沿い）を見おろす見張り台
const MONOMI_L = { x: -26, z: -36 };  // 左（森の小道・五箇の里の裏）を見おろす見張り台
const SHORO_POS = { x: 11, z: -50 };  // 外堂の鐘楼（警報の鐘）

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 白山信仰の寺を本願寺の旗で表さない。丸の旗は遊び用の目印。
const IKKO = { armor: 0x2a2622, flag: 'maru' };
const ODA = { armor: 0x2b3140, flag: 'takigawa' };
const ROAD_HOLD = 90;
const OUTER_ROUTE = SANDO.slice(1, 5);
const INNER_ROUTE = SANDO.slice(5);
const OUTER_POS = { x: 2, z: -46 };
const INNER_POS = { x: 0, z: 20 };
const OKU_POS = { x: 0, z: 55 };
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
  h += Math.max(0, z + 205) * 0.38;      // 麓から山上へ。実測の縄張りがないため縮めた斜面（+z が登り）
  const dv = distToPolyline(x, z, VALLEY_ROAD);
  h -= Math.max(0, 14 - dv) * 0.35;      // 谷の道の周りはいくらか窪む（伏兵に向く）
  return h;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(ECHIZEN_IKKO_PLAN, baseTerrain, 3);
  return HEIGHT_FN(x, z);
}

// 部隊の多点の道。確保する堂では到着後に構え、次の下知まで持ち場を離れない。
function setRoute(b, pts, hold = false) { b._arriveHold = hold; b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b._arriveHold ? 'hold' : 'attack' }); b._route = null; b._arriveHold = false; return; }
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
// 各隊の本物は14人まで。13隊182人＋自分の組30人＋景色10人。残りは既存の軽い軍勢
// 寺の守り：鉢巻と茶の衣、衆徒・薙刀の僧兵は白い裹頭と袈裟（既存の sohei）
function mkB(rt, o) {
  const monk = /衆徒|薙刀|衆|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  const look = monk ? { sohei: 1, hat: 'hachimaki', lace: 0xcfc7b4, cloth: 0xd8d2c2 } : { hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
  return makeButai(rt, { real: Math.min(14, o.nominal), maxReal: 14, ...(o.faction === 'ikko' ? { look } : {}), ...o });
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
    fleeOut: (x, z, team) => team === 1 && (x < -70 || z < -215 || z > 155),
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
    rt.scene.add(village(W, GOKA_MURA.x, GOKA_MURA.z, { n: 5, r: 15, rot: 0, fields: 0, bamboo: 0, smoke: 0, seed: 575 }));
    F.gokaKura = kura(W, GOKA_MURA.x + 14, GOKA_MURA.z - 4, 0.2);
    rt.scene.add(F.gokaKura, hut(W, GOKA_MURA.x - 10, GOKA_MURA.z + 8, 4, 3.4, 0.15), hut(W, GOKA_MURA.x + 2, GOKA_MURA.z + 12, 4, 3, -0.2));
    // 紙漉き場・楮（こうぞ）・乾燥棚：紙と木の家は火が広がりやすい（建物ごとの的にして、延焼の道に並べる）
    rt.scene.add(hut(W, GOKA_MURA.x - 2, GOKA_MURA.z - 8, 5, 3.6, 0.1, { wall: 0x8a7a5a, h: 2.2 }), tawara(W, GOKA_MURA.x + 4, GOKA_MURA.z - 7, 0.3, 4), tawara(W, GOKA_MURA.x - 8, GOKA_MURA.z - 4, 0.1, 3));
    rt.scene.add(scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 10, 0.2), scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 14, 0.2));
    F.kamisukiStruct = rt.army.addStruct({ x: GOKA_MURA.x - 2, z: GOKA_MURA.z - 8, r: 3, solidR: 3, hp: 100, maxHp: 100, armor: 0, team: 1, name: '紙漉き場', noTarget: true, invuln: true, fireProof: true });
    F.kansoStruct = rt.army.addStruct({ x: GOKA_MURA.x - 14, z: GOKA_MURA.z - 12, r: 3, solidR: 3, hp: 70, maxHp: 70, armor: 0, team: 1, name: '紙の乾燥棚', noTarget: true, invuln: true, fireProof: true });
    F.gokaKuraStruct = rt.army.addStruct({ x: GOKA_MURA.x + 14, z: GOKA_MURA.z - 4, r: 3, solidR: 3, hp: 120, maxHp: 120, armor: 0, team: 1, name: '五箇の紙倉', noTarget: true, invuln: true, fireProof: true });

    // ---- 木戸（惣門・山門） ----
    F.gateSomon = kido(rt, GATE_SOMON.x, GATE_SOMON.z, 3.2, 0, { team: 1, hp: 220, name: GATE_SOMON.name, gate: 0 });
    F.gateSanmon = kido(rt, GATE_SANMON.x, GATE_SANMON.z, 3.4, 0, { team: 1, hp: 260, name: GATE_SANMON.name, gate: 1 });

    // ---- 区域の網と退路（siege_zones.js） ----
    const okuyamaTest = (x, z) => Math.hypot(x - OKUYAMA.x, z - OKUYAMA.z) < 22;

    if (F.mode === 'attack') {
      // ===== 攻め手（player＝滝川一益の手）：越前一向一揆の山の寺を攻め落とす =====
      F.ikkoGezanSpear = mkB(rt, { name: '外堂の守り（薙刀）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 46, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x, z: gezanC.z - 6 }, facing: Math.PI });
      F.ikkoGezanBow = mkB(rt, { name: '外堂の守り（弓）', team: 1, faction: 'ikko', kind: 'bow', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x + 6, z: gezanC.z - 2 }, facing: Math.PI });
      F.ikkoHondoMain = mkB(rt, { name: '大滝寺の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 60, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 10 }, facing: Math.PI });
      F.ikkoHondoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 1, faction: 'ikko', kind: 'gun', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z - 4 }, facing: Math.PI });
      F.ikkoOkuLast = mkB(rt, { name: '奥の院の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 42, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x, z: okuC.z - 6 }, facing: Math.PI });
      F.ikkoCounter = mkB(rt, { name: '山道の守り', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 22, armor: IKKO.armor, flag: IKKO.flag, at: { x: -52, z: 144 }, facing: Math.PI });
      F.ikkoAmbush = mkB(rt, { name: '谷筋の伏兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 26, armor: IKKO.armor, flag: IKKO.flag, at: { x: 30, z: -70 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoGezanSpear, F.ikkoGezanBow, F.ikkoHondoMain, F.ikkoHondoBow, F.ikkoOkuLast, F.ikkoCounter, F.ikkoAmbush];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      F.civ = [];
      this.civ(rt, GOKA_MURA.x - 6, GOKA_MURA.z + 2, 4, '逃げる和紙の職人', { x: -0.4, z: -1 });
      this.civ(rt, gezanC.x - 6, gezanC.z + 10, 3, '逃げる僧', { x: 0, z: 1 });
      this.civ(rt, okuC.x + 2, okuC.z + 10, 3, '山へ逃れる里の者', { x: 0.2, z: 1 });
      rt.obj('civ', '手向かわない職人・僧・里の者は討つな', 'side');

      F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 14, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 4 }, facing: 0 });
      F.mainSpear = mkB(rt, { name: '滝川一益の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.mainGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.flankSpear = mkB(rt, { name: '谷筋へ回る手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.flankBow = mkB(rt, { name: '谷筋へ回る手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 26, z: VILLAGE.z + 6 }, facing: 0 });
      F.reserve = mkB(rt, { name: '予備', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 60, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 8, z: VILLAGE.z - 10 }, facing: 0 });
      F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG,
        zones: [
          { id: 'gezan', name: '外堂（講堂・僧坊）', test: C.kuruwa.gezan.test, pos: gezanC, need: 5, hold: 12, next: 'hondo' },
          { id: 'hondo', name: '本堂（中心伽藍）', test: C.kuruwa.hondo.test, pos: hondoC, need: 7, hold: 16, gate: GATE_SANMON.name, next: 'oku' },
          { id: 'oku', name: '奥の院', test: C.kuruwa.oku.test, pos: okuC, need: 4, hold: 12, next: 'okuyama' },
          { id: 'okuyama', name: OKUYAMA.name, test: okuyamaTest, pos: OKUYAMA, need: 3, hold: 8 },
        ],
        links: [['gezan', 'hondo'], ['hondo', 'oku'], ['oku', 'okuyama']],
        friendTeam: 0, enemyTeam: 1,
        totalDefenders: F.defendTotal,
        noReinforce: () => true,
        escape: { zoneId: 'okuyama', rally: { x: OKUYAMA.x - 24, z: OKUYAMA.z + 14 } },
        onFall: (id) => this.onZoneFall(rt, id),
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
        // 山道の守りは終盤に動かす。序盤の逆襲には使わない。
      });
      F.FS = attachFireSpread(rt, { onGranary: (r, st) => {
        if (st === F.gezanKuraStruct) r.__fireZones.gezan = true;
        if (st === F.hondoStruct) r.__fireZones.hondo = true;
      } });

      const n = Math.max(RANKS[rt.G.rank].squad || 0, 7);
      rt.makeSquad({ x: VILLAGE.x - 4, z: VILLAGE.z - 4 }, 0, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', hi(rt) ? '先手の一隊を率い、惣門の前へ進め' : '滝川一益の先手に続き、惣門の前へ進め', 'main');
      F.target = GATE_SOMON;
      rt.say('滝川一益', `${nm(rt)}、先手に続け。まず惣門を破り、外堂へ入れ`, 5);
      rt.say('滝川一益', '右の谷に伏兵ぞ。道を外れるな', 4);
      rt.marker('main', unitPos(F.mainSpear.real.units[0]), '先手の旗', {});
      rt.banner('大滝寺へ', '焼き討ちは伝承。夜・霧・局地の兵数は遊び用の補い');
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

      F.odaMain = mkB(rt, { name: '滝川一益の手（槍）', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 130, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.odaGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 1, faction: 'oda', kind: 'gun', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.odaFlank = mkB(rt, { name: '谷筋へ回る手', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 90, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.attackers = [F.odaMain, F.odaGun, F.odaFlank];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG,
        zones: [{ id: 'hondo', name: '本堂', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 8, start: ZONE_STATE.FRIEND }],
        friendTeam: 0, enemyTeam: 1,
        noReinforce: () => true,
        reinforceAt: { zoneId: 'hondo', sec: 240 },
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
      rt.say('大滝寺の衆徒', `${nm(rt)}、麓に織田勢じゃ。加賀の門徒衆が来るまで、本堂を守れ`, 5);
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
    rt.banner('麓から寄せる', '惣門を破り、外堂へ入る');
    rt.say('滝川一益', '声を抑えて寄せよ。鐘が鳴ったら一気に門を破れ', 4);
      rt.obj('main', '惣門を破り、外堂の守りを崩せ', 'main');
    rt.marker('path', () => F.target, () => F.gateSomon.struct.alive ? '惣門を破る' : '外堂へ', {});
    setRoute(F.scout, [[20, -150], [24, -106]]);
    const strat = F.strategy = F.strategy || 'valley';
    for (const b of [F.mainSpear, F.mainGun]) setRoute(b, OUTER_ROUTE, true);
    const flank = strat === 'front' ? OUTER_ROUTE : strat === 'forest' ? FOREST_ROAD.slice(0, 3) : VALLEY_ROAD.slice(0, 3);
    for (const b of [F.flankSpear, F.flankBow]) setRoute(b, flank, true);
    rt.say('滝川一益', strat === 'front' ? '参道に槍を集めよ。鉄砲は後ろから門前を押さえよ' : strat === 'forest' ? '別手は左の森へ。外堂の横を突け' : '別手は右の谷へ。伏兵を払い、外堂の横を突け', 4);
    rt.marker('gezan', OUTER_POS, '外堂の守り', { red: true });
  },

  // 火は到達してから。麓にいるうちに離れた堂を燃やさない。
  burn(rt, id, s) {
    if (!s.alive || s.fireF || rt.__fireZones[id]) return;
    s.burn = Math.max(s.burn || 0, 2);
    rt.army.igniteStruct(s, s);
    if (!s.fireF) return;
    rt.__fireZones[id] = true;
    battleEvent(rt, EVENT_FIRE_START, s, null, 1, true, `${s.name}に火の手。守りが山の上へ退く`);
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

  // 区域の確保だけでは終わらない。自分も次の印へ進む。
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.mode !== 'attack' || F.ending) return;
    const z = F.SZ.byId[id];
    if (!z || z.owner !== ZONE_STATE.FRIEND) return;
    if (id === 'gezan' && !F.gezanFell) {
      F.gezanFell = true;
      rt.unmark('gezan');
    }
  },

  nextAttack(rt, step) {
    const F = rt.flags;
    F.step = step; F.stepT = rt.t;
    rt.unmark('path');
    if (step === 2) {
      this.burn(rt, 'gezan', F.gezanKuraStruct);
      rt.setPhase('sanmon');
      F.target = GATE_SANMON;
      rt.obj('main', '石段を上り、山門を破って本堂へ入れ', 'main');
      rt.marker('path', () => F.target, () => F.gateSanmon.struct.alive ? '山門を破る' : '本堂へ', {});
      rt.banner('外堂から山門へ', '狭い石段。鉄砲を後ろに、槍を前に');
      rt.say('滝川一益', '外堂は押さえた。次は石段の上じゃ。組を呼び、山門を破れ', 4);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, INNER_ROUTE, true);
      const route = F.strategy === 'front' ? INNER_ROUTE : F.strategy === 'forest' ? FOREST_ROAD.slice(3) : VALLEY_ROAD.slice(3);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, route, true);
      setRoute(F.reserve, OUTER_ROUTE, true);
      rt.marker('hondo', INNER_POS, '本堂の守り', { red: true });
    } else if (step === 3) {
      rt.setPhase('oku');
      F.target = OKU_POS;
      rt.unmark('hondo');
      rt.obj('main', '火のそばを避け、奥の院の守りを崩せ', 'main');
      rt.marker('path', OKU_POS, '奥の院へ', {});
      rt.banner('山上に火の手', '本堂を越え、奥の院へ');
      rt.say('滝川一益', 'ここで止まるな。燃える堂から離れ、奥の院を押さえよ', 4);
      this.burn(rt, 'hondo', F.hondoStruct);
      for (const b of F.attackers) setRoute(b, [[4, 36], [0, 55]], true);
    } else if (step === 4) {
      rt.setPhase('mountainRoad');
      F.target = OKUYAMA;
      rt.obj('main', '奥山道の印へ進み、道を押さえよ', 'main');
      rt.marker('path', OKUYAMA, '奥山道を押さえる', {});
      rt.say('滝川一益', '堂は押さえた。奥山道へ進め。山から戻る敵に備えよ', 4);
      for (const b of [F.mainSpear, F.mainGun, F.reserve]) setRoute(b, OKU_ROAD.slice(1), true);
      for (const b of [F.flankSpear, F.flankBow, F.scout]) { b._route = null; b.order({ id: 'hold' }); }
      battleEvent(rt, EVENT_RETREAT, OKU_POS, F.ikkoOkuLast.real, 1, true, '寺の守りが山道へ退く');
      F.ikkoCounter.order({ id: 'hold' });
    } else if (step === 5) {
      rt.setPhase('roadHold');
      F.holdT = 0;
      rt.obj('main', '奥山道の印のそばで、九十秒持ちこたえよ', 'main');
      rt.banner('山道を押さえる', '山から戻る敵を止める');
      rt.say('滝川一益', '山道を守れ。戻る敵を止め、手向かわぬ者は追うな', 4);
      for (const b of [F.mainSpear, F.mainGun, F.reserve]) {
        setRoute(b, [[OKUYAMA.x + (b === F.mainGun ? 5 : -3), OKUYAMA.z - (b === F.mainGun ? 7 : 3)]], true);
      }
      F.ikkoCounter.order({ id: 'charge', to: OKUYAMA });
      battleEvent(rt, EVENT_MESSENGER, OKUYAMA, null, 0, true, '山道を押さえよ。麓の味方が上ってくる');
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gezan'); rt.unmark('hondo'); rt.unmark('path');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '越前一向一揆の山の寺を攻め落とした', pts: 22 }; }, '任務達成・大滝寺を攻め落とした');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('職人・僧・里の者を討たなかった'), '副任務：職人・僧・里の者を討たなかった'); }
    sfx('kane', 0.5);
    rt.banner('大滝寺の戦い、終わる', '麓から山上まで、道を押さえた');
    rt.say('滝川一益', `${nm(rt)}、山道は押さえた。隊をまとめ、麓へ戻れ`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 守る側：加賀門徒の援軍が来た（siege_zones の onReinforce）
  reinforceArrive(rt) {
    const F = rt.flags;
    if (F.ending) return;
    battleEvent(rt, EVENT_REINFORCEMENT, OKUYAMA, null, 0, true, '加賀門徒の援軍が山道へ来た');
    F.ending = true;
    rt.setPhase('end');
    allyGroup(rt, { faction: 'ikko', name: '加賀門徒の援軍', anchor: { x: OKUYAMA.x, z: OKUYAMA.z }, facing: Math.PI }, [{ type: 'ashigaru', n: 8 }]);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '加賀門徒の援軍が来るまで本堂を守りきった', pts: 20 }; }, '任務達成・本堂を守りきった');
    sfx('kane', 0.5);
    rt.banner('加賀門徒、来援', '援軍の旗が、山の下に見える');
    rt.say('大滝寺の衆徒', `${nm(rt)}、加賀の門徒衆が参ったぞ！　よう持ちこたえた`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  lose(rt, text) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    for (const id of ['main', 'path', 'gezan', 'hondo']) rt.unmark(id);
    rt.banner('退き陣', text);
    rt.say(F.mode === 'attack' ? '滝川一益' : '大滝寺の衆徒', F.mode === 'attack' ? 'これ以上は寄せられぬ。手負いを連れ、麓へ退け' : '本堂を失った。奥山道へ退け', 4);
    rt.player.u.invuln = true;
    rt.finish({}, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    if (F.ending) return;
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    if (F.SZ) F.SZ.tick(dt);
    if (F.ending) return;
    if (F.AMB) F.AMB.tick(dt);
    if (F.MD) F.MD.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.FS) F.FS.tick(dt);
    if ((F.mode === 'attack' && F.step >= 1) || F.mode === 'defend') tickRoutes(F.attackers);
    if (F.FI) F.FI.tick();
    if (F.mode === 'attack') {
      const P = rt.player.u.pos;
      if (F.step >= 1 && !F.alarmed && (P.z > -104 || F.mainSpear.pos.z > -104 || F.flankSpear.pos.z > -104)) this.alarm(rt);
      if (F.step === 1 && F.strategy === 'fire' && Math.hypot(P.x - F.gezanKuraStruct.x, P.z - F.gezanKuraStruct.z) < 65) this.burn(rt, 'gezan', F.gezanKuraStruct);
      // 札・区域の読み取りは一秒ごと。位置や配列を毎コマ作らない。
      F.checkT = (F.checkT || 0) - dt;
      if (F.checkT <= 0) {
        F.checkT = 1;
        const zones = F.SZ.byId;
        const near = (at, r) => Math.hypot(P.x - at.x, P.z - at.z) < r;
        if (F.step === 1) {
          F.target = F.gateSomon.struct.alive ? GATE_SOMON : OUTER_POS;
          if (F.gezanFell && near(OUTER_POS, 28)) this.nextAttack(rt, 2);
          else rt.objProgress('main', F.gateSomon.struct.alive ? '惣門を打ち破れ' : '門の先へ進み、外堂の敵を払え');
        } else if (F.step === 2) {
          F.target = F.gateSanmon.struct.alive ? GATE_SANMON : INNER_POS;
          if (zones.hondo.owner === ZONE_STATE.FRIEND && near(INNER_POS, 24)) this.nextAttack(rt, 3);
          else rt.objProgress('main', F.gateSanmon.struct.alive ? '石段の上の山門を打ち破れ' : '山門の先へ進み、本堂の敵を払え');
        } else if (F.step === 3) {
          if (zones.oku.owner === ZONE_STATE.FRIEND && near(OKU_POS, 24)) this.nextAttack(rt, 4);
          else rt.objProgress('main', '本堂の先へ進み、奥の院の敵を払え');
        } else if (F.step === 4 && near(OKUYAMA, 14)) this.nextAttack(rt, 5);
        if (F.step === 5) {
          F.roadContested = false;
          let friends = 0, available = 0;
          for (const u of rt.army.units) {
            if (!u.alive || u.noTarget || u.fleeing) continue;
            const d = Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z);
            if (u.team === 1 && d < 10) F.roadContested = true;
            if (u.team === 0 && !u.isPlayer) { available++; if (d < 18) friends++; }
          }
          const need = Math.min(3, available);
          F.roadSupported = need > 0 && friends >= need;
          if (!available && !F.attackers.some((b) => b.aliveNominal() > 0)) { this.lose(rt, '山道を守る味方が尽きた'); return; }
          rt.objProgress('main', !near(OKUYAMA, 18) ? '奥山道の印へ戻れ・離れると時は進まない'
            : F.roadContested ? `道の敵を押し返せ・残り${Math.ceil(ROAD_HOLD - F.holdT)}秒`
              : !F.roadSupported ? `組を呼び、味方${Math.max(1, need)}人と道を押さえよ`
                : `あと${Math.ceil(ROAD_HOLD - F.holdT)}秒・寄る敵を止めよ`);
        }
        if (F.step === 5 && !F.roadVolley && F.ikkoCounter.real && Math.hypot(F.ikkoCounter.pos.x - P.x, F.ikkoCounter.pos.z - P.z) < 32) {
          F.roadVolley = volley(rt, [F.mainGun.real], { who: '滝川一益', wait: 2, line: '山道へ出たぞ。鉄砲、放て！', r: 38, hit: 16 });
        }
      }
      if (F.step === 5 && F.roadSupported && !F.roadContested && Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) < 18) {
        F.holdT += dt;
        if (F.holdT >= ROAD_HOLD) this.win(rt);
      }
      // 時間だけで勝たせない。長引いた時は次の仕事を声で伝える。
      if (rt.t > 420 && !F.longSaid) {
        F.longSaid = true;
        rt.say('滝川一益', '隊を集め、札の印へ進め。散って戦うな', 4);
      }
      // 同じ段で動けなくなった時は退き陣。時の経過だけで寺を落とした扱いにはしない。
      if (F.step >= 1 && rt.t - F.stepT > 300) this.lose(rt, '道を押さえきれず、麓へ退く');
    } else {
      const z = F.SZ.byId.hondo;
      rt.objProgress('main', `本堂・${zoneWord(z)}／援軍まで${Math.max(0, Math.ceil(240 - z.friendHeldT))}秒`);
      if (z.owner !== ZONE_STATE.FRIEND) this.lose(rt, '援軍を待つ間に、本堂を失った');
      else if (rt.t > 420) this.lose(rt, '援軍が間に合わず、山へ退く');
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
    if (g.team === 1 && !g.civ) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, false, '寺の守りが崩れ、山の上へ退く');
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
echizen_ikko.sides = { a: { name: '織田軍・滝川一益の手', mon: 'takigawa' }, b: { name: '大滝寺の守り', mon: 'maru' } };
echizen_ikko.famous = [
  { name: '滝川一益', team: 0, line: '先手に続け。麓から山上まで道を押さえよ' },
  { name: '大滝寺の衆徒', team: 1, g: /本堂/, loose: 1, line: '山門を守れ！　石段を上らせるな！' },
];
echizen_ikko.date = () => '天正三年（1575）八月　夜・霧';
echizen_ikko.history = '天正三年（1575）の越前攻め。信長公記巻八は八月十五日の風雨の進軍と、同夜の府中龍門寺への潜入・放火、それに続く一揆勢の退却を記す。大滝寺は府中の東の白山信仰の寺で、龍門寺や豊原寺とは別の場所。大瀧神社の由緒と越前和紙の案内は、滝川一益が堂塔を焼き払ったと伝える。大滝寺での夜討ちの日時・霧・局地の兵数・布陣は確認できず、参道から山上を押さえる遊び用の補いとした。画面の兵数もこの場の仮の数。神社庁の由緒にある六、七百の社僧は鎌倉期の記述で、この戦の兵数には使わない。国交省の古社寺案内では兵火を天正九年ともする。越前攻めでは非戦闘員への殺害も記録されているが、この遊びでは手向かわぬ者を攻撃の的にしない。';

// 軍議（gungi.js と同じ考え方。b_kinome.js F9・b_hiei_mtn.js と同じ作り）：四つの作戦から一つを選ぶ
//   ①front：参道一本で真っ直ぐ本堂へ（早いが、本堂の守りが厚いまま）
//   ②valley（既定）：別手が谷の道から回り込み、本堂を挟み撃つ（伏兵に遭いやすいが崩しやすい）
//   ③fire：先に外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気を削るが、攻め手も見通しが悪くなる）
echizen_ikko.gungi = (rt) => {
  const F = rt.flags;
  if (F.mode !== 'attack') return null;   // 守る側は作戦を選ばない（AI 任せ。setRoute で参道・谷の道を歩かせる）
  const G = {
    center: { x: 0, z: -60 }, dist: 110,
    units: [{ id: 'plan', name: '攻め方（滝川一益の手）', group: () => F.mainSpear && F.mainSpear.real, nominal: () => (F.mainSpear ? F.mainSpear.aliveNominal() : 0) }],
    routes: [
      { id: 'front', name: '参道一本で真っ直ぐ本堂へ攻め上る' },
      { id: 'valley', name: '谷の道から回り込み、本堂を挟み撃つ' },
      { id: 'forest', name: '森の小道（五箇の里の裏）から静かに回り込む' },
      { id: 'fire', name: '外堂へ寄って火を放ち、守りを退かせる' },
    ],
    default: { plan: 'valley' },
    enemy: [
      { name: '外堂の守り', known: true, count: () => (F.ikkoGezanSpear ? F.ikkoGezanSpear.aliveNominal() : 0) + (F.ikkoGezanBow ? F.ikkoGezanBow.aliveNominal() : 0) },
      { name: '大滝寺の衆徒（本堂）', known: false },
      { name: '谷筋の伏兵（谷筋の噂）', known: false },
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
  const back = F.mode === 'attack' ? (F.target || VILLAGE) : (F.ikkoMain ? F.ikkoMain.pos : { x: u.pos.x, z: u.pos.z });
  if (u.hp < u.maxHp * 0.45) {
    inp.guardHold = (b.army.threats || []).length > 0;
    goTo(p, inp, back.x, back.z, 4);
    return;
  }
  // 門は兵の検索に含まれない。段の目標の門へ寄って打つ。
  const gate = F.mode === 'attack' ? (F.step === 1 ? F.gateSomon.struct : F.step === 2 ? F.gateSanmon.struct : null) : null;
  const gatePos = F.step === 1 ? GATE_SOMON : GATE_SANMON;
  if (gate && gate.alive && Math.hypot(u.pos.x - gatePos.x, u.pos.z - gatePos.z) < 4) {
    p.yaw = Math.atan2(gatePos.x - u.pos.x, gatePos.z - u.pos.z);
    if (Math.hypot(u.pos.x - gatePos.x, u.pos.z - gatePos.z) > 2) inp.k.add('KeyW');
    inp.leftPressed = true;
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
  goTo(p, inp, back.x, back.z, 3);
};

export { echizen_ikko };
