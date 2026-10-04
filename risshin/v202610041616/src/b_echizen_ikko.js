import { rosterPlan } from './jinkei_roster.js';
// ======================================================================
// 山岳戦　越前一向一揆の山の寺（大滝寺）攻め（late6-1573-1575-spec 80-96。「夜討ち」は GAME_C、焼き討ちは史実）
// 天正三年（1575）八月。信長は大軍で越前へ攻め入り、一向一揆は山々の寺に拠って抗った。
// 大瀧神社の由緒は滝川一益による堂塔の焼失を伝える。夜・霧・局地の兵数と道は遊び用の補い。
// 信長公記巻八の府中龍門寺への夜襲とは別の戦。紙の里は景色で、攻める的にしない。
// 攻め方の作戦四つ（参道・谷の道・森の小道・火攻め）で結果が変わる（木ノ芽峠 b_kinome.js の F9 と同じ仕組み）。
// 比叡山（b_hiei_mtn.js）を手本に、使い回しで作った。
//
// 守る側の山（寄せ手を押し返す、もしもの型）は、同じ縄張り・同じ部品で、同じファイルの中の切り替えで
// 作る（window.__echizenMode==='defend'）。
// b_sunomata.js の「守る砦」と同じ組み合わせ）。lord.js・battles.js には攻め手の一戦だけを登録する。
// ======================================================================
import { hut, tawara, sakamogi, village, scaffold, kagaribi, campfire } from './props.js';
import { hondo, doja, sobo, kura, monomidai, shoro, ishidan } from './temple_parts.js';
import { ringBell } from './temple1571.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, nm, unitPos } from './bhelp.js';
import { sightPoint } from './battle_sight.js';
import { battleEvent, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT } from './battle_events.js';
import { distToPolyline } from './world.js';
import { buildCastlePlan, inPoly } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE, zoneWord } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeDefenseAI } from './siege_ai.js';
import { WIND_STATE } from './world.js';
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
// 外堂の坊（-2, -62）を避ける。惣門から印への直線は家の当たりを横切る。
const OUTER_ROUTE = [...SANDO.slice(1, 4), [8, -74], [8, -52], SANDO[4]];
const INNER_ROUTE = SANDO.slice(5);
const BOT_SOMON_ROUTE = OUTER_ROUTE.slice(0, 3);
const BOT_SANMON_ROUTE = INNER_ROUTE.slice(0, 2);
const OUTER_POS = { x: 2, z: -46 };
const INNER_POS = { x: 0, z: 20 };
const OKU_POS = { x: 0, z: 55 };
// 寺の戦の決まった知らせ（「本丸」「城主」でなく、寺の言葉で）
const TEMPLE_MSG = {
  retreat: (name) => `衆徒が${name}へ退く`,
  honmaruOpen: () => '本堂への道が開いた',
  honmaruFall: () => '本堂に踏み込んだ',
  surrender: () => '衆徒が降った',
  commanderDown: () => '寺の指揮役が討たれた',
  flee: () => '寺の指揮役が奥山へ逃げた',
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
// 寺の平場は山の高さで整地する。縁を十二歩でつなぎ、深い穴・飛び越す段差にしない。
const TERRACES = ECHIZEN_IKKO_PLAN.kuruwa.map((k) => ({
  x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])),
  z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])), y: k.level(baseTerrain),
}));
function height(x, z) {
  let h = baseTerrain(x, z);
  for (const k of TERRACES) {
    const d = Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1));
    if (d === 0) return k.y;
    if (d < 12) { const t = d / 12, w = 1 - t * t * (3 - 2 * t); h += (k.y - h) * w; }
  }
  return h;
}

// 部隊の多点の道。確保する堂では到着後に構え、次の下知まで持ち場を離れない。
function setRoute(b, pts, hold = false) { b._gateWait = false; b._arriveHold = hold; b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b._arriveHold ? 'hold' : 'attack', form: b.kind === 'gun' || b.kind === 'bow' ? 'line' : 'yari' }); b._route = null; b._arriveHold = false; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z }, form: 'column' });
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0 || b.real && (b.real.routed || b.real._pinH)) continue;
    const [x, z] = b._route[b._i - 1];
    // 門の点を通過扱いにして、閉じた門の奥へ行かせない。槍の隊が破ってから先へ進む。
    const gate = b._routeGate;
    if (gate && gate.alive && x === (gate.seg[0] + gate.seg[2]) / 2 && z === (gate.seg[1] + gate.seg[3]) / 2) {
      const order = b.kind === 'gun' || b.kind === 'bow' ? 'hold' : 'assault';
      // 竹束の陰で待つ間は道を進めない。待機が終わったら門攻めの下知を保つ。
      if ((!b._gateWait || b.real && b.real.order !== order) && Math.hypot(b.pos.x - x, b.pos.z - z) < 10) { b._gateWait = true; b.order({ id: order, form: 'column' }); }
      continue;
    }
    if (b._gateWait && gate && !gate.alive) { b._gateWait = false; advance(b); continue; }
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
// 門には城攻めと同じ掛矢を置く。槍だけで延々と削らせず、任務の門を自分でも打てる。
function gateWork(rt, gate, at) {
  rt.uninteract('templeGate');
  if (rt.flags.mode !== 'attack') return;
  rt.addInteract('templeGate', { x: at.x, z: at.z - 2 }, `掛矢で${gate.name}を打つ`, () => {
    if (!gate.alive || rt.flags.ending || rt.over || !rt.player.u.alive) return;
    rt.army.damage(gate, 42, rt.player.u);
    rt.army.play('knock', at, 1.2);
    rt.game.hitstop = 0.05;
  }, { r: 3.4, hold: 0.7, prio: 3 });
}
// 各隊の本物は14人まで。攻めの13隊182人＋自分の組最大30人＋景色10人（供・昇進時の組は共通処理）。残りは既存の軽い軍勢
// 寺の守り：鉢巻と茶の衣、衆徒・薙刀の僧兵は白い裹頭と袈裟（既存の sohei）
function mkB(rt, o) {
  const monk = /衆徒|薙刀|衆|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  const look = monk ? { sohei: 1, hat: 'hachimaki', lace: 0xcfc7b4, cloth: 0xd8d2c2 } : { hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
  const b = makeButai(rt, { real: Math.min(14, o.nominal), maxReal: 14, nearReal: 14, farReal: 14, lightWidth: 10, lightDepth: Math.max(8, Math.ceil(o.nominal / 5) * 1.6), look: { ...(o.faction === 'ikko' ? look : {}), horse: false }, ...o });
  if (b.light) { b.light.army.team = o.team; b.light.army.noWake = true; b.light.army.keepNear = true; }
  if (b.real) { b.real.width = 5; b.real.spacing = 1.6; b.real.noGuard = true; }
  if (b.taishoU) b.taishoU.isLord = true;
  if (b.taishoU && o.general === '滝川一益') { b.taishoU.mustLive = true; b.taishoU.invuln = true; }
  return b;
}

// 大滝寺の焼失は由緒、夜討ち・持ち場・兵数は補完。衆徒の将名と家紋は不明。
// 白山信仰の寺に本願寺の将や紋を置かず、丸の目印を保つ。
function templeJin(defend) {
  const row = (id, role, general, soldiers, x, z, flag, bind) => [id, role, general, soldiers, x, z, flag, flag === 'maru' ? null : flag, 0, { bind }];
  return [
    rosterPlan('参道と谷道の寄せ', defend ? 1 : 0, VILLAGE, 0, defend ? [
      row('main', '参道の仕寄り', '滝川一益の配下（名は不明）', 100, VILLAGE.x, VILLAGE.z + 12, 'takigawa', 'odaMain'),
      row('gun', '参道の鉄砲', '滝川一益の配下（名は不明）', 40, VILLAGE.x + 14, VILLAGE.z, 'takigawa', 'odaGun'),
      row('flank', '谷道の別手', '滝川一益の配下（名は不明）', 90, VILLAGE.x + 30, VILLAGE.z + 12, 'takigawa', 'odaFlank'),
      row('reserve', '麓の陣所と守り', '滝川一益', 30, VILLAGE.x - 16, VILLAGE.z, 'takigawa', 'reserve'),
    ] : [
      row('scout', '参道の物見', '滝川一益の配下（名は不明）', 14, VILLAGE.x, VILLAGE.z + 38, 'takigawa', 'scout'),
      row('main', '参道の仕寄り', '滝川一益の配下（名は不明）', 150, VILLAGE.x, VILLAGE.z + 12, 'takigawa', 'mainSpear'),
      row('gun', '参道の鉄砲', '滝川一益の配下（名は不明）', 50, VILLAGE.x + 14, VILLAGE.z, 'takigawa', 'mainGun'),
      row('flank', '谷道の別手', '滝川一益の配下（名は不明）', 100, VILLAGE.x + 30, VILLAGE.z + 12, 'takigawa', 'flankSpear'),
      row('bow', '谷道の弓', '滝川一益の配下（名は不明）', 40, VILLAGE.x + 44, VILLAGE.z + 12, 'takigawa', 'flankBow'),
      row('reserve', '麓の後備え・陣所', '滝川一益', 60, VILLAGE.x - 16, VILLAGE.z, 'takigawa', 'reserve'),
    ], '大瀧神社の由緒、越前和紙の案内。攻め口と陣所は遊びの復元'),
    rosterPlan('堂と山道の守り', defend ? 0 : 1, INNER_POS, Math.PI, defend ? [
      row('main', '本堂', '寺の指揮役（名は不明）', 70, 0, 6, 'maru', 'ikkoMain'),
      row('gun', '本堂の鉄砲', '寺の指揮役（名は不明）', 20, -10, 24, 'maru', 'ikkoBow'),
      row('valley', '谷道の伏せ勢', '寺の指揮役（名は不明）', 24, 28, -66, 'maru', 'ikkoAmbushD'),
    ] : [
      row('outer', '外堂の薙刀', '寺の指揮役（名は不明）', 46, 0, -58, 'maru', 'ikkoGezanSpear'),
      row('bow', '外堂の弓', '寺の指揮役（名は不明）', 16, 10, -54, 'maru', 'ikkoGezanBow'),
      row('main', '本堂', '寺の指揮役（名は不明）', 60, 0, 4, 'maru', 'ikkoHondoMain'),
      row('gun', '本堂の鉄砲', '寺の指揮役（名は不明）', 16, -10, 24, 'maru', 'ikkoHondoBow'),
      row('oku', '奥の院', '寺の指揮役（名は不明）', 42, 0, 49, 'maru', 'ikkoOkuLast'),
      row('rear', '奥山の退き口', '寺の指揮役（名は不明）', 22, -52, 144, 'maru', 'ikkoCounter'),
      row('valley', '谷道の伏せ勢', '寺の指揮役（名は不明）', 26, 30, -70, 'maru', 'ikkoAmbush'),
    ], '大滝寺の要件と既存の堂の並び。戦う衆徒の数・将・布陣は不明'),
  ];
}
const TEMPLE_JIN = templeJin(false), TEMPLE_DEFEND_JIN = templeJin(true);

const echizen_ikko = {
  get jinkei() { return mode() === 'defend' ? TEMPLE_DEFEND_JIN : TEMPLE_JIN; },
  noDistantBattle: true, // 登録した備え以外の大軍・本陣を自動で足さない。
  noTaisho: true, // 局地の陣所は後備えに結び、全軍の信長をここに置かない。
  noHorse: true,
  noWake: true,
  botOrders: true, // 山道・門・退き口を、性格の突進で上書きしない。
  // 守る側（defend）は本堂の内（castles/echizen_ikko.js の hondo の中ほど）から始める。攻め手は山麓の村から
  get spawn() { return mode() === 'defend' ? { x: 0, z: 10, heading: Math.PI } : { x: VILLAGE.x, z: VILLAGE.z - 2, heading: 0 }; },
  world: {
    seed: 15750,
    blockedHint: () => '里の家は西にある。参道の印へ進み、竹束の陰から惣門へ寄れ',
    moveLim: 220,   // 山麓の村（z≈-200）から始まる。既定の 176 だと村の者と自分が戦場の外の扱いで引き戻されていた（見回り 10/2）
    time: 'night',
    wind: [-0.3, -0.95], // 夜の風向は補完。寺から紙の里へ火の粉が飛ぶ場合がある。
    nightLift: 1.5,   // 夜の補光は共通の上限より抑える。月齢は未確定。
    mist: true,
    muddy: 0.1,
    streams: [{ pts: [[34, -34], [44, -70], [50, -108], [44, -150], [36, -180], [42, -218]], w: 2.2, depth: 0.8 }],   // 谷川（夜の川音）
    terrainTags: true,   // 急斜面・石段・細道・森で速さ・向き変え・疲れ・当たりが変わる（terrain_tags.js）
    paths: [SANDO, VALLEY_ROAD, FOREST_ROAD, OKU_ROAD],
    height,
    tint(x, z, h, c) { if (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z)) c.setRGB(c.r * 0.68, c.g * 0.8, c.b * 0.68); },
    clear: (x, z) => distToPolyline(x, z, SANDO) < 12 || distToPolyline(x, z, VALLEY_ROAD) < 12 || distToPolyline(x, z, FOREST_ROAD) < 12,
    trees: 1500,
    tufts: 2400,
    treeDensity: (x, z) => (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z) ? 1.6 : 0.65),
    groves: [{ x: 32, z: -110, r: 20, n: 24 }, { x: 20, z: -10, r: 16, n: 18 }, { x: -30, z: -100, r: 18, n: 20 }],
    fleeOut: (x, z) => Math.abs(x) > 214 || z < -215 || z > 210,
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
    const templeTeam = F.mode === 'defend' ? 0 : 1;
    const gezanC = C.kuruwa.gezan.centroid, hondoC = C.kuruwa.hondo.centroid, okuC = C.kuruwa.oku.centroid;

    // ---- 寺の部品（temple_parts.js）：外堂（講堂・僧坊）・本堂（中心伽藍）・奥の院 ----
    rt.scene.add(sobo(W, gezanC.x - 6, gezanC.z + 6, 0.25), doja(W, gezanC.x + 9, gezanC.z - 4, -0.2));
    F.gezanKura = kura(W, gezanC.x + 7, gezanC.z + 8, 0.1);
    rt.scene.add(F.gezanKura);
    F.gezanKuraStruct = rt.army.addStruct({ x: gezanC.x + 7, z: gezanC.z + 8, r: 3, solidR: 3, hp: 150, maxHp: 150, armor: 0, team: templeTeam, name: '外堂の倉', moraleOnBurn: 'small', flammable: true });

    F.hondoBldg = hondo(W, hondoC.x - 10, hondoC.z - 8, 0.1);
    rt.scene.add(F.hondoBldg, doja(W, hondoC.x + 11, hondoC.z + 6, -0.25));
    F.hondoStruct = rt.army.addStruct({ x: hondoC.x - 10, z: hondoC.z - 8, r: 5, solidR: 5, hp: 260, maxHp: 260, armor: 0, team: templeTeam, name: '本堂', moraleOnBurn: 'big', flammable: true });
    rt.scene.add(ishidan(W, GATE_SANMON.x, GATE_SANMON.z, hondoC.x, hondoC.z - 4, 3.2));
    // 夜でも寺の形が見えるよう、本堂・外堂のまわりに篝火を置く（B021・B022）
    for (const [x, z] of [[hondoC.x - 18, hondoC.z - 2], [hondoC.x + 2, hondoC.z - 18], [hondoC.x + 16, hondoC.z - 6], [hondoC.x - 4, hondoC.z + 12], [gezanC.x - 14, gezanC.z + 2], [gezanC.x + 14, gezanC.z + 4]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.scene.add(sobo(W, okuC.x - 7, okuC.z + 5, 0.2), hut(W, okuC.x + 7, okuC.z - 6, 5, 4, -0.15));
    // 建物ごとの延焼：僧坊・奥の坊を燃える的にし、外堂の倉→本堂→僧坊→奥の院と火が寺院群へ広がる道を作る（siege_fire.js の燃え移り）
    F.soboStruct = rt.army.addStruct({ x: okuC.x - 7, z: okuC.z + 5, r: 4, solidR: 4, hp: 110, maxHp: 110, armor: 0, team: templeTeam, name: '奥の僧坊', moraleOnBurn: 'small', flammable: true });
    F.okuBoStruct = rt.army.addStruct({ x: okuC.x + 7, z: okuC.z - 6, r: 3, solidR: 3, hp: 90, maxHp: 90, armor: 0, team: templeTeam, name: '奥の坊', moraleOnBurn: 'small', flammable: true });
    F.gezanBoStruct = rt.army.addStruct({ x: gezanC.x - 2, z: gezanC.z - 10, r: 3, solidR: 3, hp: 90, maxHp: 90, armor: 0, team: templeTeam, name: '外堂の坊', moraleOnBurn: 'small', flammable: true });
    // 夜の灯明：本堂の前に灯り（灯りが夜の目印）
    for (const [dx, dz] of [[-6, 4], [6, 4]]) W.addFire(hondoC.x + dx, hondoC.z + dz);
    // 門の篝火（寺の見張りが焚く。夜の山で門の場所が遠くから分かり、門の前が照らされる）
    for (const [x, z] of [[GATE_SOMON.x - 4.5, GATE_SOMON.z + 2.5], [GATE_SOMON.x + 4.5, GATE_SOMON.z + 2.5], [GATE_SANMON.x - 4.5, GATE_SANMON.z + 2.5], [GATE_SANMON.x + 4.5, GATE_SANMON.z + 2.5], [gezanC.x + 6, gezanC.z - 4]]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 });
    }
    rt.scene.add(hut(W, gezanC.x - 2, gezanC.z - 10, 5, 4, 0.1), tawara(W, gezanC.x - 2, gezanC.z - 6, 0, 2));
    rt.scene.add(monomidai(W, MONOMI_R.x, MONOMI_R.z, 0));
    rt.scene.add(monomidai(W, MONOMI_L.x, MONOMI_L.z, Math.PI));
    F.shoroStruct = rt.army.addStruct({ x: SHORO_POS.x, z: SHORO_POS.z, r: 2, solidR: 2, hp: 90, maxHp: 90, armor: 0, team: templeTeam, name: '鐘楼', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(shoro(W, SHORO_POS.x, SHORO_POS.z, 0));
    for (const [x, z, r] of [[GATE_SANMON.x - 8, GATE_SANMON.z - 2, 0.2], [GATE_SANMON.x + 8, GATE_SANMON.z - 2, -0.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 五箇の和紙の里（寺と一体。家屋・紙漉き場・乾燥棚・倉。紙と木の家は火が広がりやすい） ----
    rt.scene.add(village(W, GOKA_MURA.x, GOKA_MURA.z, { n: 5, r: 15, rot: 0, fields: 0, bamboo: 0, smoke: 0, seed: 575 }));
    F.gokaKura = kura(W, GOKA_MURA.x + 14, GOKA_MURA.z - 4, 0.2);
    rt.scene.add(F.gokaKura, hut(W, GOKA_MURA.x - 10, GOKA_MURA.z + 8, 4, 3.4, 0.15), hut(W, GOKA_MURA.x + 2, GOKA_MURA.z + 12, 4, 3, -0.2));
    // 紙漉き場・楮（こうぞ）・乾燥棚：紙と木の家は火が広がりやすい（建物ごとの的にして、延焼の道に並べる）
    rt.scene.add(hut(W, GOKA_MURA.x - 2, GOKA_MURA.z - 8, 5, 3.6, 0.1, { wall: 0x8a7a5a, h: 2.2 }), tawara(W, GOKA_MURA.x + 4, GOKA_MURA.z - 7, 0.3, 4), tawara(W, GOKA_MURA.x - 8, GOKA_MURA.z - 4, 0.1, 3));
    rt.scene.add(scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 10, 0.2), scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 14, 0.2));
    F.kamisukiStruct = rt.army.addStruct({ x: GOKA_MURA.x - 2, z: GOKA_MURA.z - 8, r: 3, solidR: 3, hp: 100, maxHp: 100, armor: 0, team: templeTeam, name: '紙漉き場', noTarget: true, invuln: true, fireProof: false, flammable: true });
    F.kansoStruct = rt.army.addStruct({ x: GOKA_MURA.x - 14, z: GOKA_MURA.z - 12, r: 3, solidR: 3, hp: 70, maxHp: 70, armor: 0, team: templeTeam, name: '紙の乾燥棚', noTarget: true, invuln: true, fireProof: false, flammable: true });
    F.gokaKuraStruct = rt.army.addStruct({ x: GOKA_MURA.x + 14, z: GOKA_MURA.z - 4, r: 3, solidR: 3, hp: 120, maxHp: 120, armor: 0, team: templeTeam, name: '五箇の紙倉', noTarget: true, invuln: true, fireProof: false, flammable: true });

    F.paperWorks = [F.kamisukiStruct, F.kansoStruct, F.gokaKuraStruct];
    F.generalSafe = { x: VILLAGE.x - 16, z: VILLAGE.z - 14 };
    F.withdrawRoad = [...SANDO, [0, 55], ...OKU_ROAD.slice(1)].reverse();
    // ---- 木戸（惣門・山門） ----
    F.gateSomon = kido(rt, GATE_SOMON.x, GATE_SOMON.z, 3.2, 0, { team: templeTeam, hp: 220, name: GATE_SOMON.name, gate: 0 });
    F.gateSanmon = kido(rt, GATE_SANMON.x, GATE_SANMON.z, 3.4, 0, { team: templeTeam, hp: 260, name: GATE_SANMON.name, gate: 1 });

    // ---- 区域の網と退路（siege_zones.js） ----
    const okuyamaTest = (x, z) => Math.hypot(x - OKUYAMA.x, z - OKUYAMA.z) < 22;

    if (F.mode === 'attack') {
      // ===== 攻め手（player＝滝川一益の手）：越前一向一揆の山の寺を攻め落とす =====
      F.ikkoGezanSpear = mkB(rt, { name: '外堂の守り（薙刀）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 46, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x, z: gezanC.z - 6 }, facing: Math.PI });
      F.ikkoGezanBow = mkB(rt, { name: '外堂の守り（弓）', team: 1, faction: 'ikko', kind: 'bow', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x + 10, z: gezanC.z - 2 }, facing: Math.PI });
      F.ikkoHondoMain = mkB(rt, { name: '大滝寺の衆徒', general: '寺の指揮役', mix: { ashigaru: 0.85, samurai: 0.15 }, team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 60, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 10 }, facing: Math.PI });
      F.ikkoHondoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 1, faction: 'ikko', kind: 'gun', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z + 10 }, facing: Math.PI });
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

      F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 14, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 38 }, facing: 0 });
      F.mainSpear = mkB(rt, { name: '滝川一益の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 12 }, facing: 0 });
      F.mainGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 14, z: VILLAGE.z }, facing: 0 });
      F.flankSpear = mkB(rt, { name: '谷筋へ回る手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 30, z: VILLAGE.z + 12 }, facing: 0 });
      F.flankBow = mkB(rt, { name: '谷筋へ回る手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 44, z: VILLAGE.z + 12 }, facing: 0 });
      F.reserve = mkB(rt, { name: '滝川一益の陣所と後備え', general: '滝川一益', mix: { ashigaru: 0.8, samurai: 0.2 }, team: 0, faction: 'oda', kind: 'ashigaru', nominal: 60, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 16, z: VILLAGE.z }, facing: 0 });
      F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG, farInterval: 0.5,
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

      const n = RANKS[rt.G.rank].squad || 0;
      rt.makeSquad({ x: VILLAGE.x - 4, z: VILLAGE.z - 4 }, 0, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', hi(rt) ? '先手の一隊を率い、惣門の前へ進め' : '滝川一益の先手に続き、惣門の前へ進め', 'main');
      F.target = GATE_SOMON;
      rt.say('滝川一益', `${nm(rt)}、先手に続け。まず惣門を破り、外堂へ入れ`, 5);
      rt.say('組頭', '谷は見通せぬ。物見の後に続け', 4);
      rt.marker('main', unitPos(F.mainSpear.real.units[0]), '先手の旗', {});
      rt.banner('大滝寺へ', '焼き討ちは伝承。夜・霧・局地の兵数は遊び用の補い');
      // ---- 竹束の寄せ（taketaba.js）：参道・谷の道の先手は竹束を押し立て、ゆっくり寄せ場まで登って撃ち合う ----
      const SANDO_YOSE = { x: GATE_SOMON.x, z: GATE_SOMON.z - 6 };
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
      rt.after(14, () => this.assault(rt));
    } else {
      // ===== 守る側（defend）：越前一向一揆として、本堂を守り、寄せ手を押し返す（もしも） =====
      F.ikkoMain = mkB(rt, { name: '大滝寺の衆徒', general: '寺の指揮役', mix: { ashigaru: 0.85, samurai: 0.15 }, team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 70, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 8 }, facing: Math.PI });
      F.ikkoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 0, faction: 'ikko', kind: 'gun', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z + 10 }, facing: Math.PI });
      F.ikkoAmbushD = mkB(rt, { name: '衆徒の伏兵（谷筋）', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: { x: 28, z: -66 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoMain, F.ikkoBow, F.ikkoAmbushD];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.odaMain = mkB(rt, { name: '滝川一益の手（槍）', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 12 }, facing: 0 });
      F.odaGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 1, faction: 'oda', kind: 'gun', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 14, z: VILLAGE.z }, facing: 0 });
      F.odaFlank = mkB(rt, { name: '谷筋へ回る手', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 90, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 30, z: VILLAGE.z + 12 }, facing: 0 });
      F.reserve = mkB(rt, { name: '滝川一益の陣所と守り', general: '滝川一益', mix: { ashigaru: 0.8, samurai: 0.2 }, team: 1, faction: 'oda', kind: 'ashigaru', nominal: 30, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 16, z: VILLAGE.z }, facing: 0 });
      F.attackers = [F.odaMain, F.odaGun, F.odaFlank, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG, farInterval: 0.5,
        zones: [{ id: 'hondo', name: '本堂', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 8, start: ZONE_STATE.FRIEND }],
        friendTeam: 0, enemyTeam: 1,
        noReinforce: () => true,
      });
      F.DA = makeDefenseAI(rt, {
        posts: [{ id: 'hondo', butai: F.ikkoMain, at: hondoC, ambush: false }, { id: 'valley', butai: F.ikkoAmbushD, at: { x: 28, z: -66 }, ambush: true, revealRange: 20 * nightAccuracyMult(W) }],
        reserves: [F.ikkoBow],
        fallback: { x: okuC.x, z: okuC.z },
      });
      // 攻め手（村で勢揃いしてから、参道・谷の道を本堂まで歩く＝攻め手の assault() と同じ setRoute／tickRoutes を使う。
      // 門は槍の先手が破る。谷の別手は決めた道から進む。
      rt.after(10, () => {
        if (F.ending) return;
        F.odaMain._routeGate = F.odaGun._routeGate = F.gateSomon.struct;
        F.odaMain.assault = () => F.odaMain._routeGate.alive ? F.odaMain._routeGate : null;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, OUTER_ROUTE, true);
        setRoute(F.odaFlank, [...VALLEY_ROAD]);
      });

      const n = RANKS[rt.G.rank].squad || 0;
      rt.makeSquad({ x: hondoC.x + 4, z: hondoC.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', '本堂を守り、寄せ手を押し返せ（もしも）', 'main');
      rt.say('大滝寺の衆徒', `${nm(rt)}、麓に織田勢じゃ。山門と本堂を守れ。寄せ手を押し返すのじゃ`, 5);
      rt.marker('main', hondoC, '本堂', { red: false });

    }
    // 山道の槍は縦列、鉄砲は横列。攻守を替えても既存の隊と下知を保つ。
    for (const b of F.attackers) b.setForm('column');
    for (const b of F.defenders) b.setForm(b.kind === 'gun' || b.kind === 'bow' ? 'line' : 'yari');
    F.reserve.setForm('yari');
    if (F.mode === 'attack' && !rt.G.lord) {
      const routes = [{ id: 'localFront', x: -4, name: '参道から先手に続く', pts: SANDO }, { id: 'localValley', x: 2, name: '右の谷道から別手に続く', pts: VALLEY_ROAD }, { id: 'localForest', x: 8, name: '左の森道から別手に続く', pts: FOREST_ROAD }];
      for (const route of routes) rt.addInteract(route.id, { x: route.x, z: VILLAGE.z + 2 }, route.name, () => {
        if (F.ending || rt.over || !rt.player.u.alive || F.step > 1) return;
        F.localRoad = route.pts; F.localRoadI = 0; F.localPoint = { x: route.pts[0][0], z: route.pts[0][1] };
        for (const q of routes) rt.uninteract(q.id);
        rt.marker('localRoad', () => F.localPoint, '先手に続く道'); rt.say('組頭', route.name + '。列を離れず、外堂で合流せよ', 4);
      }, { r: 2.8, hold: 1 });
    }
    if (F.ikkoCounter && F.ikkoCounter.real) F.ikkoCounter.real.siegeAI = true;
    const gun = F.ikkoHondoBow || F.ikkoBow;
    if (gun) gun.setForm('line');
  },

  // ① 物見を先に出し、作戦に応じて参道（表）・谷の道に分かれる（木ノ芽峠 b_kinome.js F9 と同じ三択）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.assaultT = rt.t; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.marker('approach', { x: 0, z: -150 }, '里を抜け、参道へ'); F.approachShown = true;
    rt.unmark('main');
    rt.banner('麓から寄せる', '惣門を破り、外堂へ入る');
    rt.say('組頭', '声を抑えて寄せよ。鐘が鳴ったら一気に門を破れ', 4);
    rt.say('組頭', '矢は構えでは防げぬ。先手の竹束の陰から寄せよ', 4);
    rt.obj('main', '惣門を破れ。味方と外堂を押さえ、印へ進め', 'main');
    rt.marker('path', () => F.target, () => F.gateSomon.struct.alive ? '惣門を破る' : '外堂へ', {});
    setRoute(F.scout, [[20, -150], [24, -106]]);
    const strat = F.strategy = F.strategy || 'valley';
    F.mainSpear._routeGate = F.mainGun._routeGate = F.gateSomon.struct;
    F.mainSpear.assault = () => F.mainSpear._routeGate.alive ? F.mainSpear._routeGate : null;
    F.flankSpear.assault = () => F.flankSpear._routeGate?.alive ? F.flankSpear._routeGate : null;
    gateWork(rt, F.gateSomon.struct, GATE_SOMON);
    setRoute(F.mainSpear, OUTER_ROUTE, true);
    setRoute(F.mainGun, [...OUTER_ROUTE.slice(0, -1), [8, -54]], true);
    const flank = strat === 'front' ? OUTER_ROUTE : strat === 'forest' ? FOREST_ROAD.slice(0, 3) : VALLEY_ROAD.slice(0, 3);
    for (const b of [F.flankSpear, F.flankBow]) {
      b._routeGate = strat === 'front' ? F.gateSomon.struct : null;
      setRoute(b, strat === 'front' ? flank : [...flank, [OUTER_POS.x + 8, OUTER_POS.z]], true);
    }
    rt.say('組頭', strat === 'front' ? '参道に槍を集めよ。鉄砲は後ろから門前を押さえよ' : strat === 'forest' ? '別手は左の森へ。外堂の横を突け' : '別手は右の谷へ。物見を先に、外堂の横を突け', 4);
    rt.marker('gezan', OUTER_POS, '外堂の守り', { red: true });
  },

  // 火は到達してから。麓にいるうちに離れた堂を燃やさない。
  burn(rt, id, s) {
    if (!s.alive || s.fireF || rt.__fireZones[id]) return;
    let reached = false;
    for (const u of rt.army.units) {
      if (u.alive && u.team === 0 && !u.fleeing && !u.noTarget && !u.isStruct &&
          Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < (s.solidR || s.r || 3) + 2 &&
          !rt.army.wallBetween(u.pos, -1, s)) { reached = true; break; }
    }
    if (!reached) return;
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
    if (F.ending || rt.over || !rt.player.u.alive || step <= F.step) return;
    F.step = step; F.stepT = rt.t; F.retreatWarned = false;
    rt.unmark('path');
    if (step === 2) {
      this.burn(rt, 'gezan', F.gezanKuraStruct);
      rt.setPhase('sanmon');
      F.target = GATE_SANMON;
      gateWork(rt, F.gateSanmon.struct, GATE_SANMON);
      rt.obj('main', '石段を上れ。山門を破り、味方と本堂を押さえよ', 'main');
      rt.marker('path', () => F.target, () => F.gateSanmon.struct.alive ? '山門を破る' : '本堂へ', {});
      rt.banner('外堂から山門へ', '狭い石段。鉄砲を後ろに、槍を前に');
      rt.say('組頭', '外堂は押さえた。次は石段の上じゃ。組を呼び、山門を破れ', 4);
      F.mainSpear._routeGate = F.mainGun._routeGate = F.gateSanmon.struct;
      setRoute(F.mainSpear, INNER_ROUTE, true);
      setRoute(F.mainGun, [...INNER_ROUTE.slice(0, -1), [0, 8]], true);
      const route = F.strategy === 'front' ? INNER_ROUTE : F.strategy === 'forest' ? FOREST_ROAD.slice(3) : VALLEY_ROAD.slice(3);
      for (const b of [F.flankSpear, F.flankBow]) {
        b._routeGate = F.strategy === 'front' ? F.gateSanmon.struct : null;
        setRoute(b, route, true);
      }
      F.reserve.order({ id: 'hold', form: 'yari' });
      rt.marker('hondo', INNER_POS, '本堂の守り', { red: true });
    } else if (step === 3) {
      rt.setPhase('oku');
      F.target = OKU_POS;
      rt.unmark('hondo');
      rt.obj('main', '火を避け、味方と奥の院を押さえ、印へ進め', 'main');
      rt.marker('path', OKU_POS, '奥の院へ', {});
      rt.banner('奥の院へ進む', '本堂を越え、山上の守りを崩せ');
      rt.say('組頭', 'ここで止まるな。燃える堂から離れ、奥の院を押さえよ', 4);
      this.burn(rt, 'hondo', F.hondoStruct);
      setRoute(F.mainSpear, [[4, 36], [0, 55]], true);
      setRoute(F.mainGun, [[4, 36], [0, 43]], true);
      setRoute(F.flankSpear, [[10, 36], [10, 55]], true);
      setRoute(F.flankBow, [[10, 36], [10, 43]], true);
    } else if (step === 4) {
      rt.setPhase('mountainRoad');
      F.target = OKUYAMA;
      rt.obj('main', '奥山道の印へ進み、道を押さえよ', 'main');
      rt.marker('path', OKUYAMA, '奥山道を押さえる', {});
      rt.say('組頭', '堂は押さえた。奥山道へ進め。山から戻る敵に備えよ', 4);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, OKU_ROAD.slice(1), true);
      for (const b of [F.flankSpear, F.flankBow, F.scout]) { b._route = null; b.order({ id: 'hold' }); }
      rt.say('組頭', '別手と物見は堂に残れ。本隊は奥山道へ。取った堂を空けるな', 4);
      battleEvent(rt, EVENT_RETREAT, OKU_POS, F.ikkoOkuLast.real, 1, true, '寺の守りが山道へ退く');
      F.ikkoCounter.order({ id: 'hold' });
    } else if (step === 5) {
      rt.setPhase('roadHold');
      F.holdT = 0;
      rt.obj('main', '味方三人以上と奥山道を守り、堂を保ちながら九十秒支えよ', 'main');
      rt.banner('山道を押さえる', '山から戻る敵を止める');
      rt.say('組頭', '山道を守れ。戻る敵を止め、手向かわぬ者は追うな', 4);
      for (const b of [F.mainSpear, F.mainGun]) {
        setRoute(b, [[OKUYAMA.x + (b === F.mainGun ? 5 : -3), OKUYAMA.z - (b === F.mainGun ? 7 : 3)]], true);
      }
      // 通常の突撃は敵を探す下知で、指定地点までの行軍にはならない。道へ寄せてから斬り込む。
      setRoute(F.ikkoCounter, [[OKUYAMA.x, OKUYAMA.z]]);
      rt.say('組頭', '先手を集めよ。槍を道に、鉄砲を後ろに置け', 4);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    for (const s of F.paperWorks) { rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name); }
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'gezan', 'hondo', 'path', 'oku', 'road']) rt.unmark(id);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '越前一向一揆の山の寺を攻め落とした', pts: 22 }; }, '任務達成・大滝寺を攻め落とした');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('職人・僧・里の者を討たなかった'), '副任務：職人・僧・里の者を討たなかった'); }
    sfx('kane', 0.5);
    rt.banner('大滝寺の戦い、終わる', '麓から山上まで、道を押さえた');
    rt.say('組頭', `${nm(rt)}、山道は押さえた。隊をまとめ、麓へ戻れ`, 4.5);
    rt.finish({}, 10);
  },

  // 守る側は架空の援軍を出さず、実際に寄せ手を退けた時だけ局地の勝ち。
  defendWin(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'gezan', 'hondo', 'path', 'oku', 'road']) { rt.unmark(id); rt.unzone(id); }
    for (const z of F.SZ.zones) rt.unzone(z.id);
    rt.award((t) => { t.main = true; t.special = { label: 'もしもの局地防衛で、大滝寺の寄せを退けた', pts: 22 }; }, '局地防衛・今の寄せを退けた');
    rt.banner('今の寄せを退けた', 'もしもの戦。越前全体の勝ちを表さない');
    rt.finish({}, 10);
  },

  lose(rt, text) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    for (const s of F.paperWorks) { rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name); }
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'path', 'gezan', 'hondo', 'oku', 'road']) rt.unmark(id);
    rt.banner('退き陣', text);
    rt.say(F.mode === 'attack' ? '組頭' : '大滝寺の衆徒', F.mode === 'attack' ? 'これ以上は寄せられぬ。手負いを連れ、麓へ退け' : 'ここでは支えきれぬ。奥山道へ退け', 4);
    rt.finish({}, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    for (const c of F.civ || []) if (!c.routed) {
      let danger = F.alarmed;
      if (!danger) for (const s of rt.army.burning || []) if (s.fireF && Math.hypot(s.x - c.anchor.x, s.z - c.anchor.z) < 35) { danger = true; break; }
      if (!danger) for (const s of F.paperWorks) if (s.paperWarned && Math.hypot(s.x - c.anchor.x, s.z - c.anchor.z) < 35) { danger = true; break; }
      if (danger) { c.routed = true; c.order = 'flee'; c.noAI = false; c.morale = 0; for (const u of c.units) { u.fleeing = true; u.aiT = 0; } }
    }
    if (F.approachShown && (rt.player.u.pos.z >= -150 || F.step > 1)) { F.approachShown = false; rt.unmark('approach'); }
    if (F.localRoad && rt.t >= (F.localRoadAt || 0)) {
      F.localRoadAt = rt.t + 0.5;
      const p = rt.player.u.pos, road = F.localRoad;
      while (F.localRoadI < road.length && Math.hypot(p.x - road[F.localRoadI][0], p.z - road[F.localRoadI][1]) < 8) F.localRoadI++;
      if (F.localRoadI >= road.length || F.step > 1) { F.localRoad = null; rt.unmark('localRoad'); }
      else { F.localPoint.x = road[F.localRoadI][0]; F.localPoint.z = road[F.localRoadI][1]; }
    }
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
    if (F.mode === 'attack' && F.step === 5) tickRoutes(F.defenders);
    if (F.mode === 'attack') {
      const P = rt.player.u.pos;
      if (F.step >= 1 && !F.alarmed && (P.z > -104 || F.mainSpear.pos.z > -104 || F.flankSpear.pos.z > -104)) this.alarm(rt);
      // 札・区域の読み取りは一秒ごと。位置や配列を毎コマ作らない。
      F.checkT = (F.checkT || 0) - dt;
      if (F.checkT <= 0) {
        F.checkT = 1;
        this.paperFire(rt);
        const reserve = F.reserve;
        if (!F.generalRetired && reserve.taishoU?.alive) {
          let guards = 0, danger = false;
          for (const u of reserve.real?.units || []) if (u !== reserve.taishoU && u.alive && !u.fleeing && !u.woundOut) guards++;
          for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && u.team !== reserve.team && !u.noTarget && !u.isStruct && Math.hypot(u.pos.x - reserve.pos.x, u.pos.z - reserve.pos.z) < 18) danger = true;
          if (guards < 4 || danger) {
            F.generalRetired = true; reserve.order({ id: 'move', to: F.generalSafe, form: 'yari' });
            if (reserve.real) reserve.real.stay = false;
            rt.say('伝令', '後備えが危うい。滝川殿は麓の奥へ退く。先手は列を保て', 4);
          }
        }
        if (!F.woundWarned && rt.player.u.hp < rt.player.u.maxHp * 0.55) {
          F.woundWarned = true;
          rt.say('組頭', '深手じゃ。矢玉は構えで防げぬ。竹束の陰へ退き、傷を縛れ', 4);
        }
        if (F.gezanFell || F.step === 1 && F.strategy === 'fire') this.burn(rt, 'gezan', F.gezanKuraStruct);
        if (F.step >= 3) this.burn(rt, 'hondo', F.hondoStruct);
        const fighting = F.attackers.some((b) => b !== F.reserve && b.real && b.real.count && !b.real.routed);
        const reserveReady = !F.generalRetired && F.reserve.cmd.id !== 'hold' && F.reserve.real && !F.reserve.real.routed && F.reserve.real.units.some((u) => u !== F.reserve.taishoU && u.alive && !u.fleeing && !u.woundOut);
        if (!fighting && !reserveReady && !rt.squad.some((u) => u.alive && !u.fleeing && !u.woundOut)) { this.lose(rt, '先手が崩れ、後備えは陣所の守りを離せない。麓へ退く'); return; }
        const zones = F.SZ.byId;
        const near = (at, r) => Math.hypot(P.x - at.x, P.z - at.z) < r;
        if (F.step === 1) {
          F.target = F.gateSomon.struct.alive ? GATE_SOMON : OUTER_POS;
          if (!F.gateSomon.struct.alive) rt.uninteract('templeGate');
          // 別手が外堂を取っても、惣門の打ち手を置き去りにして次の門へ向かわせない。
          if (!F.gateSomon.struct.alive && zones.gezan.owner === ZONE_STATE.FRIEND && zones.gezan.enemies === 0 && near(OUTER_POS, 28)) this.nextAttack(rt, 2);
          else rt.objProgress('main', F.gateSomon.struct.alive ? '惣門の手前で「掛矢で惣門を打つ」を押し続けよ' : zones.gezan.enemies > 0 ? '外堂の敵を払え。味方五人で十二秒押さえよ' : zones.gezan.owner === ZONE_STATE.FRIEND ? '外堂は押さえた。外堂の印へ進め' : `外堂へ味方を集めよ（${zones.gezan.friends}／${zones.gezan.need}人）。十二秒保て`);
        } else if (F.step === 2) {
          F.target = F.gateSanmon.struct.alive ? GATE_SANMON : INNER_POS;
          if (!F.gateSanmon.struct.alive) rt.uninteract('templeGate');
          if (!F.gateSanmon.struct.alive && zones.hondo.owner === ZONE_STATE.FRIEND && near(INNER_POS, 24)) this.nextAttack(rt, 3);
          else rt.objProgress('main', F.gateSanmon.struct.alive ? '石段を上り、山門の手前で掛矢の札を押し続けよ' : zones.hondo.enemies > 0 ? '本堂の敵を払え。味方七人で十六秒押さえよ' : zones.hondo.owner === ZONE_STATE.FRIEND ? '本堂は押さえた。本堂の印へ進め' : `本堂へ味方を集めよ（${zones.hondo.friends}／${zones.hondo.need}人）。十六秒保て`);
        } else if (F.step === 3) {
          if (zones.oku.owner === ZONE_STATE.FRIEND && near(OKU_POS, 24)) this.nextAttack(rt, 4);
          else rt.objProgress('main', zones.oku.owner === ZONE_STATE.FRIEND ? '奥の院は押さえた。奥の院の印へ進め' : zones.oku.enemies > 0 ? '奥の院の敵を払え。味方四人で十二秒押さえよ' : `奥の院へ味方を集めよ（${zones.oku.friends}／${zones.oku.need}人）。十二秒保て`);
        } else if (F.step === 4) {
          if (near(OKUYAMA, 14)) this.nextAttack(rt, 5);
          else rt.objProgress('main', '奥山道の印へ。味方の槍の列について進め');
        }
        if (F.step === 5) {
          F.roadContested = false;
          let friends = 0, available = 0;
          for (const u of rt.army.units) {
            if (!u.alive || u.noTarget || u.fleeing || u.woundOut || u.isStruct) continue;
            const d = Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z);
            if (u.team === 1 && d < 10) F.roadContested = true;
            if (u.team === 0 && !u.isPlayer) { available++; if (d < 18) friends++; }
          }
          const need = 3;
          // 物見の同じ兵だけを一度送る。将の後備えと、堂を守る別手は動かさない。
          if (friends < need && !F.roadReserveSent && F.scout.aliveNominal() > 0 && !F.scout.real?.routed) {
            F.roadReserveSent = true;
            setRoute(F.scout, [...INNER_ROUTE, [0, 55], ...OKU_ROAD.slice(1)], true);
            rt.say('組頭', '道の列が薄い。物見の組は同じ道を登り、槍の列を補え。別手は堂を守れ', 4);
          }
          F.roadSupported = friends >= need;
          if (!available && !F.attackers.some((b) => b.aliveNominal() > 0)) { this.lose(rt, '山道を守る味方が尽きた'); return; }
          rt.objProgress('main', !near(OKUYAMA, 18) ? '奥山道へ戻り、味方と道を守れ'
            : F.roadContested ? '道の敵を押し返せ'
              : !F.roadSupported ? `組を呼び、味方${Math.max(1, need)}人と道を押さえよ`
                : !F.hallsHeld ? '堂へ敵が戻った。別手と取り返し、道を守り直せ' : F.holdT < ROAD_HOLD ? `道を守る あと${Math.ceil(ROAD_HOLD - F.holdT)}秒`
                  : '道は保った。残る敵を押し返し、堂の守りも保て');
        }

      }
      // 道へ入った兵をその回に数える。堂が奪い返された間も守り直す。
      if (F.step === 5) {
        let friends = 0;
        F.roadContested = false;
        for (const u of rt.army.units) {
          if (!u.alive || u.noTarget || u.fleeing || u.woundOut || u.isStruct) continue;
          const d = Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z);
          if (u.team === 1 && d < 10) F.roadContested = true;
          if (u.team === 0 && !u.isPlayer && d < 18) friends++;
        }
        F.roadSupported = friends >= 3;
        F.hallsHeld = F.SZ.byId.gezan.owner === ZONE_STATE.FRIEND && F.SZ.byId.hondo.owner === ZONE_STATE.FRIEND && F.SZ.byId.oku.owner === ZONE_STATE.FRIEND;
        for (const u of rt.army.units) if (F.hallsHeld && u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 1 &&
            (F.SZ.byId.gezan.test(u.pos.x, u.pos.z) || F.SZ.byId.hondo.test(u.pos.x, u.pos.z) || F.SZ.byId.oku.test(u.pos.x, u.pos.z))) F.hallsHeld = false;
      }
      if (F.step === 5 && F.hallsHeld && F.roadSupported && !F.roadContested && Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) < 18) {
        F.holdT += dt;
        if (F.holdT >= ROAD_HOLD && F.SZ.byId.gezan.owner === ZONE_STATE.FRIEND && F.SZ.byId.hondo.owner === ZONE_STATE.FRIEND && F.SZ.byId.oku.owner === ZONE_STATE.FRIEND && (F.ikkoCounter.real && F.ikkoCounter.real.routed || F.ikkoCounter.aliveNominal() <= F.ikkoCounter.nominal * 0.3)) this.win(rt);
      }
      else if (F.step === 5 && (!F.hallsHeld || F.roadContested || !F.roadSupported || Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) >= 18)) {
        if (F.holdT > 0 && rt.t >= (F.holdResetAt || 0)) {
          F.holdResetAt = rt.t + 8;
          rt.say('組頭', !F.hallsHeld ? '堂の守りが崩れた。取り返し、初めから道を守り直せ' : F.roadContested ? '敵が道へ戻った！　押し返し、初めから道を守り直せ' : Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) >= 18 ? '持ち場を離れた。奥山道の印へ戻り、初めから守り直せ' : '道を守る味方が足りぬ。組を戻し、初めから守り直せ', 4);
        }
        F.holdT = 0;
      }
      // 時間だけで勝たせない。長引いた時は次の仕事を声で伝える。
      if (F.step >= 1 && rt.t - F.stepT > 35 && rt.t >= (F.longAt || 0)) {
        F.longAt = rt.t + 35;
        const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
        const zone = F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'];
        rt.say('組頭', gate?.struct.alive ? '門で止まっておる。竹束の陰から打ち破れ'
          : F.step === 5 ? F.roadContested ? '道の敵を押し返せ。堂の守りも残せ' : !F.roadSupported ? '本隊を道へ集めよ。別手は堂を守れ' : '道を守り続け、残る寄せを押し返せ'
          : F.step === 4 ? '本隊について奥山道へ進め'
          : zone.owner === ZONE_STATE.FRIEND ? '堂は押さえた。組と印へ進め'
          : zone.enemies > 0 ? '堂の中に敵が残る。味方と押し返せ' : '堂を押さえる味方が足りぬ。組を呼べ', 4);
      }
      // 同じ段で動けなくなった時は退き陣。時の経過だけで寺を落とした扱いにはしない。
      if (F.step >= 1 && (rt.t - F.stepT >= 240 || rt.t - F.assaultT >= 360) && !F.retreatWarned) {
        F.retreatWarned = true;
        rt.say('組頭', `寄せを立て直せ。あと${Math.max(0, Math.ceil(Math.min(300 - (rt.t - F.stepT), 420 - (rt.t - F.assaultT))))}秒で退く下知じゃ`, 4);
      }
      if (F.step >= 1 && (rt.t - F.stepT > 300 || rt.t - F.assaultT > 420)) {
        const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
        const zone = F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'];
        this.lose(rt, gate?.struct.alive ? `${gate.struct.name}を破れず、麓へ退く` : F.step >= 4 ? F.roadContested ? '山道の敵を払えず、堂へ退く' : !F.roadSupported ? '山道を守る味方がそろわず退く' : '山道と堂の守りを保てず退く' : zone.enemies > 0 ? `${zone.name}の敵を押し返せず退く` : zone.friends < zone.need ? `${zone.name}を守る味方が足りず退く` : `${zone.name}を保ち、先手と合流できず退く`);
      }
    } else {
      F.checkT = (F.checkT || 0) - dt;
      if (F.checkT > 0) return;
      F.checkT = 1;
      const z = F.SZ.byId.hondo;
      if (!F.defendClimb && !F.gateSomon.struct.alive && Math.hypot(F.odaMain.pos.x - OUTER_POS.x, F.odaMain.pos.z - OUTER_POS.z) < 16) {
        F.defendClimb = true;
        F.odaMain._routeGate = F.odaGun._routeGate = F.gateSanmon.struct;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, INNER_ROUTE);
      }
      rt.objProgress('main', sightPoint(rt, INNER_POS) ? `本堂・${zoneWord(z)}。寄せ手が崩れるまで守れ（退く下知まで${Math.max(0, Math.ceil(420 - rt.t))}秒）` : '本堂へ戻り、守りに加われ');
      if (z.owner !== ZONE_STATE.FRIEND) this.lose(rt, '本堂を失い、山へ退く');
      else if (F.attackers.every((b) => b === F.reserve || b.aliveNominal() <= b.nominal * 0.3 || b.real && b.real.routed)) this.defendWin(rt);
      else if (rt.t > 420) this.lose(rt, '寄せ手を押し返せず、山へ退く');
    }
  },

  // 強い風下へ飛ぶ火の粉は、里へ届くまで予告し、放火とは別の作業にする。
  paperFire(rt) {
    const F = rt.flags, rain = rt.world.rainLevel || 0;
    for (const s of F.paperWorks) {
      if (!s.alive || s.paperDoused || s.fireF) continue;
      let ember = false;
      for (const source of rt.army.burning || []) {
        if (!source.fireF || source === s) continue;
        const dx = s.x - source.x, dz = s.z - source.z, d = Math.hypot(dx, dz);
        if (d < 180 && d > 0 && (dx * WIND_STATE.dirX + dz * WIND_STATE.dirZ) / d > 0.75 && (WIND_STATE.gust || 1) > 1.15 && rain < 0.4) ember = true;
      }
      s.emberT = ember ? (s.emberT || 0) + 1 : Math.max(0, (s.emberT || 0) - 1);
      if (s.emberT >= 5 && !s.paperWarned) {
        s.paperWarned = true;
        rt.marker('paper' + s.name, s, `${s.name}の火の粉を払う`);
        rt.addInteract('paper' + s.name, s, '水を掛け、火の粉を払う', () => {
          if (F.ending || rt.over || !rt.player.u.alive || !s.alive) return;
          s.paperDoused = true; s.emberT = 0; s.burn = 0;
          const burning = rt.army.burning || [], i = burning.indexOf(s); if (i >= 0) burning.splice(i, 1);
          if (s.fireF) { rt.world.removeFire(s.fireF); s.fireF = null; }
          rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name);
        }, { r: 5, hold: 2 });
        if (rt.t >= (F.paperNoticeAt || 0)) { F.paperNoticeAt = rt.t + 8; rt.say('職人', '寺の火の粉が紙の里へ来る！　水を掛け、火の下から離れよ', 4); }
        for (const c of F.civ || []) if (c.name.includes('職人')) { c.fleeDir.x = -0.7; c.fleeDir.z = -0.7; }
      }
      if (s.emberT >= 25) { s.burn = 3; rt.army.igniteStruct(s, s); }
    }
  },

  // 逃げる職人・僧・里の者（戦わない。討てば下知違反）。b_hiei_mtn.js の civ() と同じ作り
  civ(rt, x, z, n2, name, dir) {
    const F = rt.flags;
    const monk = name.includes('僧');
    const c = enemyGroup(rt, { faction: 'ikko', fixed: true, name, anchor: { x, z }, facing: Math.atan2(dir.x, dir.z), width: 4, aggro: 0, morale: 0, fleeDir: dir, speed: 2.5 },
      [{ type: 'porter', n: n2, o: monk ? { sohei: 1, flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    c.routed = false; c.order = 'hold'; c.noAI = true; c.morale = 100;
    for (const u of c.units) { u.fleeing = false; u.noTarget = true; u.dmg = 0; u.aiT = Infinity; }
    c.civ = true;
    (F.civ = F.civ || []).push(c);
    return c;
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && (k.isPlayer || k.isSub || rt.squad.includes(k)) && !F.civHurt) { F.civHurt = true; rt.objFail('civ'); }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && !g.civ && sightPoint(rt, g.anchor)) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, false, '寺の守りが崩れ、山の上へ退く');
    if (g.team !== 1 || g.civ || !sightPoint(rt, g.anchor) || !g.name || rt.t - (F.routSaidT ?? -99) < 8) return;
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
echizen_ikko.date = () => '天正三年（1575）八月ごろ　夜・霧は推定';
echizen_ikko.history = '天正三年（1575）の越前攻め。信長公記巻八は八月十五日の風雨の進軍と、同夜の府中龍門寺への潜入・放火、それに続く一揆勢の退却を記す。大滝寺は府中の東の白山信仰の寺で、龍門寺や豊原寺とは別の場所。大瀧神社の由緒と越前和紙の案内は、滝川一益が堂塔を焼き払ったと伝える。大滝寺での夜討ちの日時・霧・局地の兵数・布陣は確認できず、参道から山上を押さえる遊び用の補いとした。画面の兵数もこの場の仮の数。神社庁の由緒にある六、七百の社僧は鎌倉期の記述で、この戦の兵数には使わない。国交省の古社寺案内では兵火を天正九年ともする。越前攻めでは非戦闘員への殺害も記録されているが、この遊びでは手向かわぬ者を攻撃の的にしない。';

// 軍議（gungi.js と同じ考え方。b_kinome.js F9・b_hiei_mtn.js と同じ作り）：四つの作戦から一つを選ぶ
//   ①front：参道一本で真っ直ぐ本堂へ（早いが、本堂の守りが厚いまま）
//   ②valley（既定）：別手が谷の道から回り込み、本堂を挟み撃つ（伏兵に遭いやすいが崩しやすい）
//   ③fire：先に外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気を削るが、攻め手も見通しが悪くなる）
echizen_ikko.gungi = (rt) => {
  const F = rt.flags;
  if (F.mode !== 'attack' || !rt.G.lord) return null;   // 守る側は作戦を選ばない（AI 任せ。setRoute で参道・谷の道を歩かせる）
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
      { name: '外堂の守り（数は不明）', known: false },
      { name: '大滝寺の衆徒（本堂）', known: false },
      { name: '谷筋の守り（様子は不明）', known: false },
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

// 素直な遊び手：門前でも打ち手に応戦する。退避・傷を縛る判断は playbot の共通処理に任せる。
echizen_ikko.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false;
  if (!u.alive || F.ending) return;
  const squad = b.squadGroups.find((g) => !g.routed && g.units.some((s) => s.alive && !s.fleeing && !s.woundOut && !s.rearWound));
  // 崩れる前に鼓舞する。逃亡・深手の兵へ突撃を繰り返しても戻らない。
  if (squad && squad.morale < 55 && p.rallyCd <= 0) inp.e.add('KeyF');
  const back = F.mode === 'attack' ? (F.target || VILLAGE) : (F.ikkoMain ? F.ikkoMain.pos : { x: u.pos.x, z: u.pos.z });
  // 麓での下知が済むまでは先手を待つ。門だけを目指して一人で走り出さない。
  if (F.mode === 'attack' && !F.step) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  // 先手は竹束を押してゆっくり寄せる。自分だけ門へ直行すると、楯を置き去りにして矢を浴びる。
  if (F.mode === 'attack' && F.step === 1 && F.gateSomon.struct.alive &&
      !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget &&
        o.type !== 'bow' && o.type !== 'gun' && Math.abs(o.pos.y - u.pos.y) < 3 &&
        !b.army.wallBetween(u.pos, -1, o.pos))) {
    const it = F.TA?.items.find((it) => it.g === F.mainSpear);
    const spearNear = F.mainSpear.real?.units.some((mate) => mate.alive && !mate.fleeing && !mate.woundOut && Math.hypot(mate.pos.x - GATE_SOMON.x, mate.pos.z - GATE_SOMON.z) < 10);
    const coverNear = it?.tabas.some((tb) => Math.hypot(tb.x - GATE_SOMON.x, tb.z - GATE_SOMON.z) < 10);
    if (it && it.st !== 'free' && !(spearNear && coverNear && Math.hypot(u.pos.x - GATE_SOMON.x, u.pos.z - GATE_SOMON.z) < 14)) {
      let tb = null, near = Infinity;
      for (const t of it.tabas) {
        const d = Math.hypot(t.x - u.pos.x, t.z - u.pos.z);
        if (d < near) { tb = t; near = d; }
      }
      if (tb) {
        b.botFollowingTaba = true;
        inp.runHeld = false; inp.guardHold = false;
        goTo(p, inp, tb.x - Math.sin(tb.rot) * 1.4, tb.z - Math.cos(tb.rot) * 1.4, 0.5);
        return;
      }
    }
  }
  // 堂を押さえた後は、残敵を追って任務の山道から離れない。道の折れ目を順に歩く。
  if (F.mode === 'attack' && F.step >= 4) {
    inp.guardHold = false;
    if (F.step === 4) {
      if (F.botRoadStep !== F.step) { F.botRoadStep = F.step; F.botRoadI = 0; }
      let at = OKU_ROAD[F.botRoadI];
      if (F.botRoadI < OKU_ROAD.length - 1 && Math.hypot(u.pos.x - at[0], u.pos.z - at[1]) < 5) at = OKU_ROAD[++F.botRoadI];
      goTo(p, inp, at[0], at[1], 3);
      return;
    }
    if (Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z) > 12) { goTo(p, inp, OKUYAMA.x, OKUYAMA.z, 3); return; }
  }
  // 近いだけの敵より、今こちらへ打ち込む敵を受ける。向きと構えを当たるまで保つ。
  const gate = F.mode === 'attack' ? (F.step === 1 ? F.gateSomon.struct : F.step === 2 ? F.gateSanmon.struct : null) : null;
  const gatePos = F.step === 1 ? GATE_SOMON : GATE_SANMON;
  const atGate = gate?.alive && Math.hypot(u.pos.x - gatePos.x, u.pos.z - gatePos.z) < 4;
  // 門前では目前の打ち手に応戦する。遠い守りを追うたび掛矢の長押しを取り消さない。
  let attacker = null, attackDist = atGate ? 4 : 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.type === 'bow' || o.type === 'gun' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow;
    if (!charge && !swing && !atk) continue;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t + 0.2;
    if (d < (atGate ? 4 : 10) && (soon < soonest || soon === soonest && d < attackDist)) { attacker = o; attackDist = d; soonest = soon; }
  }
  // 構えを解く半秒の間は同じ相手を保つ。近い兵への選び直しで突きを取り消さない。
  const candidate = attacker || strikeTarget(b, atGate ? 4 : 12);
  const e = F.step !== 5 || candidate && Math.hypot(candidate.pos.x - OKUYAMA.x, candidate.pos.z - OKUYAMA.z) < 15 ? candidate
    : b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
      Math.hypot(o.pos.x - OKUYAMA.x, o.pos.z - OKUYAMA.z) < 15);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀は槍より短い。槍の間合いで止まると刀が届く前に打たれ続ける。
    const reach = p.weapon === 'sword' ? 1.7 : 2.6;
    if (d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 構えた槍の攻撃は払いになり、突きの三倍の気力を使う。打ち込みを受けてから突く。
    if (attacker) {
      // 溜めの初めから構えると、穂先が届く前に受け流しの間が終わる。
      inp.guardHold = !!e.charging || !!(e.swing && !e.swing.done && soonest <= p.parryWin() * 0.35);
      if (inp.guardHold) p.botStrikeUntil = 0;
      else if (d < reach && soonest > 0.85 && e.atk?.t > 0.65) patientStrike(p, inp, e, d, true);
    } else patientStrike(p, inp, e, d);
    // 四秒以内の同じ号令は取り消しになる。行軍中の突撃も出し直さない。
    if (squad && squad.order !== 'attack' && squad.order !== 'move' && squad.order !== 'assault' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 5; }
    return;
  }
  // 近くの敵を払ってから門を打つ。門だけを向いて横からの槍を浴びない。
  if (atGate) {
    inp.guardHold = false;
    if (p.lock) inp.e.add('KeyQ');
    p.yaw = Math.atan2(gatePos.x - u.pos.x, gatePos.z - u.pos.z);
    // 扉の中心へ歩き続けず、手前で止まって掛矢を打つ。
    goTo(p, inp, gatePos.x, gatePos.z - 2, 1);
    const work = b.interacts.find((it) => it.id === 'templeGate');
    // 札が届く所なら打ち始める。門や柱ぎわで、必要以上に扉へ詰めて止まらない。
    if (work && Math.hypot(u.pos.x - work.pos.x, u.pos.z - work.pos.z) < work.r) {
      inp.k.delete('KeyW'); inp.k.add('KeyE');
    }
    return;
  }
  inp.guardHold = false;
  if (squad && squad.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  // 門の前後で同じ道の折れ目を歩く。印への直行では外堂の坊に突き当たる。
  if (F.mode === 'attack' && (F.step === 1 || F.step === 2)) {
    const road = F.step === 1 ? (gate?.alive ? BOT_SOMON_ROUTE : OUTER_ROUTE)
      : gate?.alive ? BOT_SANMON_ROUTE : INNER_ROUTE;
    if (F.botTempleRoad !== road) {
      F.botTempleRoad = road; F.botTempleI = 0;
      let nearest = Infinity;
      for (let i = 0; i < road.length; i++) {
        const d = Math.hypot(u.pos.x - road[i][0], u.pos.z - road[i][1]);
        if (d < nearest) { nearest = d; F.botTempleI = i; }
      }
    }
    let at = road[F.botTempleI];
    if (F.botTempleI < road.length - 1 && Math.hypot(u.pos.x - at[0], u.pos.z - at[1]) < 4) at = road[++F.botTempleI];
    goTo(p, inp, at[0], at[1], 3);
    return;
  }
  goTo(p, inp, back.x, back.z, 3);
};

echizen_ikko.withdrawRoute = (rt, g) => {
  if (rt.flags.mode !== 'attack' || g.team !== 0) return null;
  const road = rt.flags.withdrawRoad, c = g.center();
  let i = 0, best = Infinity;
  for (let k = 0; k < road.length; k++) { const d = Math.hypot(c.x - road[k][0], c.z - road[k][1]); if (d < best) { best = d; i = k; } }
  return road.slice(i);
};
export { echizen_ikko };
