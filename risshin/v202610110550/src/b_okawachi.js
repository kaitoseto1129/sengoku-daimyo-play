import * as THREE from 'three';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　大河内城の戦い（永禄十二年・五十日の囲み・縄張り版。docs/first6-1560-1569-spec.md 42〜57）
// 伊勢を平らげようとする信長は、北畠具教・具房の籠もる大河内城を大軍で囲んだ。
// 囲み → 九月八日の三手の夜攻め → 雨中の押し返し → 坂の退路を保つ → 帰陣 → 通路封鎖 → 和睦。
// 自分は丹羽長秀の手。救出や一騎打ちは入れず、攻め口と退路を守る。
// 『信長公記』巻二は西搦手からの夜攻めと記す。現地の南搦手へ、西寄りの斜面から三手で寄せる推定復元。
// 北大手・南搦手、東の阪内川、北の矢津川、南西の谷は現地の並びを使い、距離は約1/2.5。
// 日を飛ばす演出と局地戦の時間は遊びの補い。総攻めで城内へ入る筋にはしない。
// ======================================================================
import { nobori, hut, campfire, tawara, palisade } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { localPoint } from './army_local_way.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { yamaLift, benchRoads } from './yamalift.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { addTaba, makeTabaAdvance, tickTabas, tabaInteractTick, patchGunCover } from './taketaba.js';
import { makeGate, resetGates } from './siege_gate.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { sendOrder } from './denrei.js';
import {
  OKAWACHI_PLAN, OKAWACHI_HIST, GATE, OTE_GATE, MAE_C, JO_C, ROAD_KARAMETE, ROAD_OTE,
  HON_C, NISHI_C, NI_C, ONANDO_C, BABA_C, OTE_C,
} from './castles/okawachi.js';

// 上の身分（足軽大将候補より上）：丹羽の手の一手を預かり、退きでは殿を務める
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const CAMP = { x: 4, z: 70 };
const CAMP_LINE = { x: CAMP.x, z: CAMP.z - 6 };
// 搦手へ登ってきた所から始め、長い道は地形として残す。
const OPEN_PT = ROAD_KARAMETE[5];
const HONJIN = { x: 88, z: -12 }; // 信長公記：信長の本陣は東の山。南の帰陣先とは別。
const ODA = { flag: 'oda' };
const KITABATAKE = { flag: 'maru' };        // 北畠の紋（無いので丸で代える）

// 地形：丘陵の先端（標高 110m 余りを縮める）。西と南西に深い谷、東に阪内川、北に矢津川。
// asset_dem_okawachi.js は格子がほぼ平ら（2〜7m）で丘が写っていないので使わない（手書き。DEM の撮り直し待ち）
function baseRaw(x, z) {
  let h = 0.4 * Math.sin(x * 0.035 + 0.2) * Math.cos(z * 0.03) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  h += 4;
  h += 14 * gauss(x, z, 0, -112, 5200);          // 城の丘
  h += 8 * gauss(x, z, 50, -60, 2400);           // 馬場・御納戸へ続く東南の尾根
  h += 6 * gauss(x, z, 0, -150, 1800);           // 大手の北の尾根
  h -= 13 * gauss(x, z, -94, -112, 1300);        // 西ノ丸の西の深い谷
  h -= 10 * gauss(x, z, -62, -48, 1100);         // 南西の深い谷
  h -= Math.max(0, x - 96) * 0.12;               // 東の阪内川へ下る
  h -= Math.max(0, -z - 214) * 0.14;             // 北の矢津川へ下る
  // 搦手の前へ上がるなだらかな坂（攻め口の段の縁が崖にならないように。南西の谷の肩も均す）
  const ax = Math.max(0, Math.min(1, 1 - (Math.abs(x) - 30) / 14)), rz = Math.max(0, Math.min(1, (-8 - z) / 22)) * (z > -64 ? 1 : 0);
  if (ax * rz > 0 && h < 9.4) h += (9.4 - h) * ax * rz;
  return Math.max(-1, h);
}
const HORI_FNS = OKAWACHI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseRaw(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function heightRaw(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(OKAWACHI_PLAN, baseWithHori, 2.4);
  return HEIGHT_FN(x, z) + yamaLift(x, z, LIFT);
}

// 北畠の持ち場（曲輪の中の構え所）と、織田の囲みの陣（城外の四方。一つにまとめない）
const POST = {
  ote: { x: OTE_C.x, z: OTE_C.z + 2 }, hon: { x: HON_C.x, z: HON_C.z + 4 }, nishi: { x: NISHI_C.x, z: NISHI_C.z },
  ni: { x: NI_C.x, z: NI_C.z }, onando: { x: ONANDO_C.x, z: ONANDO_C.z }, baba: { x: BABA_C.x, z: BABA_C.z },
};
// 本物の兵が坂から下る城兵を受け止める場所。遠景の控えとは分ける。
const SOUTH_BLOCK = { x: 34, z: 16 };
// 坂の東の曲がり角から、二重の柵の口へ続く道。封鎖の兵も、この道を使う。
const SOUTH_ROAD = [ROAD_KARAMETE[3], [34, 10], [SOUTH_BLOCK.x, SOUTH_BLOCK.z], [34, 26], [34, 32], [34, 38]];
// 東の本陣からの使番は、城の馬場と南の柵を避け、封鎖の道へ合流する。
const RUNNER_ROAD = [...SOUTH_ROAD, [58, 38], [HONJIN.x, 38], [HONJIN.x, HONJIN.z]];
// 初めの立ち位置から坂の入口へ。切り通しの縁で足を止めない。
const CAMP_ROAD = [[-12, 50], [-12, 40], [0, 40], ROAD_KARAMETE[1]];
const SIEGE = {
  north: { x: 0, z: -188 },   // 大手攻め（矢津川の手前）
  east: { x: 92, z: -96 },                  // 阪内川と道の見張り
  west: { x: -128, z: -112 },                // 西の谷越しの見張り
  south: { x: 84, z: 54 },                   // 南東の控え。幅約42mの軍勢を、封鎖の持ち場と帰陣の道から離す。
};
const NEAR = { ote: { x: 0, z: -174 }, ni: { x: 78, z: -117 }, nishi: { x: -76, z: -114 }, kara: { x: 40, z: -20 } };

// 軽い作りの部隊を、向きに縛られずに目当ての所まで歩かせる（addDistantArmy の follow。2.6m/秒）
function moveL(b, to) {
  const L = b.light;
  if (!L) return;
  const A = L.army, px = L.position.x + A.cx, pz = L.position.z + A.cz;
  const face = Math.hypot(to.x - px, to.z - pz) > 2 ? Math.atan2(to.x - px, to.z - pz) : A.facing;
  L.halt();
  L.follow(() => ({ x: to.x, z: to.z, facing: face }), { gap: 0 });
  b.pos.x = to.x; b.pos.z = to.z;
}

// 信長公記巻二の四方の囲み。夜攻めは西搦手と伝わる。南搦手の西寄りの既存の道を使う。
const OKAWACHI_JIN = [
  battleJin('四方の囲み', 0, HONJIN, -Math.PI / 2, [
    ['okNobu', '本陣', '織田信長', 10000, HONJIN.x, HONJIN.z, 'jinOdaCamp', 'eiraku', 'oda'],
    ['okNorth', '北大手の陣', '坂井政尚・蜂屋頼隆', 15000, SIEGE.north.x, SIEGE.north.z, 'siege.north', 'oda', 'oda', 0],
    ['okEast', '東の囲み', '柴田勝家・森可成', 15000, SIEGE.east.x, SIEGE.east.z, 'siege.east', 'eiraku', 'oda'],
    ['okWest', '西の囲み', '木下藤吉郎・佐久間信盛', 15000, SIEGE.west.x, SIEGE.west.z, 'siege.west', 'oda', 'oda', Math.PI / 2],
    ['okSouth', '南の封鎖と仕寄り', '丹羽長秀・池田恒興・稲葉良通', 15000, SIEGE.south.x, SIEGE.south.z, 'siege.south', 'oda', 'oda', Math.PI],
  ], '織田七万とも。各方面の割り振りは復元。囲みの陣は付城の名や縄張りを断定しない。'),
  battleJin('曲輪の守り', 1, HON_C, 0, [
    ['okOte', '北大手', '名は伝わらない', 2200, POST.ote.x, POST.ote.z, 'kb.ote', 'maru', 'maru', Math.PI],
    ['okHon', '本陣', '北畠具教・北畠具房', 1300, POST.hon.x, POST.hon.z, 'kb.hon', 'maru'],
    ['okNishi', '西ノ丸', '名は伝わらない', 800, POST.nishi.x, POST.nishi.z, 'kb.nishi', 'maru', 'maru', -Math.PI / 2],
    ['okNi', '二ノ丸', '名は伝わらない', 1600, POST.ni.x, POST.ni.z, 'kb.ni', 'maru', 'maru', Math.PI / 2],
    ['okStore', '御納戸', '名は伝わらない', 400, POST.onando.x, POST.onando.z, 'kb.onando', 'maru'],
    ['okReserve', '馬場の控え', '名は伝わらない', 1700, POST.baba.x, POST.baba.z, 'kb.res', 'maru'],
  ], '北畠八千とも。各曲輪の将は不明。丸の旗は北畠の家紋そのものではなく代わりの印。'),
];

const okawachi = {
  sideTaskAfter: Infinity, // 城内へ踏み込む櫓取りは、この囲みの任務にしない。
  uchisute: true, // 雨の夜攻めと退路守りでは、首取りの案内を出さない。
  noHorse: true, // 搦手の細い坂を竹束で登る夜攻め。徒歩で出る
  jinkei: OKAWACHI_JIN,
  // 和睦まで定義が進める。具教を共通処理の討ち取り勝ちに替えない。
  taisho: { b: { def: true } },
  noWake: true, // 共通の新手は止める。近い兵はこの戦の有限の控えから替える。
  botOrders: true, // 閉じた木戸の外の守り・退き口を、性格の突進で上書きしない。
  botDefendsFort: true, // 城の弓への避け足より先に、坂への道順と城兵への反撃を決める。
  spawn: { x: OPEN_PT[0] + 3, z: OPEN_PT[1], heading: Math.PI },
  world: {
    seed: 15699,
    wind: [-0.4, 0.9],
    time: 'dusk',    // 囲みの紹介は夕暮れ。九月八日の下知から、雨の夜へゆっくり移す。
    nightLift: 4.2,
    fireLightLift: 1.5,
    closeCombatAssist: true, // 坂を進む城兵も、四歩以内の本人へ向き直って槍で応戦する。
    muddy: 1,
    terrainTags: true,
    moveLim: 260,
    moveWay: karameteWay,
    runnerWay: karameteWay,
    paths: [ROAD_KARAMETE, ROAD_OTE, RUNNER_ROAD, CAMP_ROAD,
      ...OKAWACHI_PLAN.koguchi.map(g => {
        const nx = Math.sin(g.rot || 0) * OKAWACHI_PLAN.gateSlope, nz = Math.cos(g.rot || 0) * OKAWACHI_PLAN.gateSlope;
        return [[g.at[0] - nx, g.at[1] - nz], g.at, [g.at[0] + nx, g.at[1] + nz]];
      })],
    pathWidth: 2.8,
    climbTan: 0.70,
    height,
    // 阪内川（東）・矢津川（北）
    riverCross: true, // 深い本流へ徒歩で入らせない。任務はすべて城側の岸。
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [
      { pts: [[122, -300], [116, -180], [126, -60], [120, 40], [128, 180]], w: 10, depth: 1.4 },
      { pts: [[-240, -240], [-120, -244], [0, -238], [80, -242], [120, -236]], w: 7, depth: 1.2, fords: [{ x: -10, w: 10 }] },
    ],
    clear: (x, z) => (Math.abs(x) < 82 && z > -170 && z < 100) || (Math.abs(x) < 26 && z > -232),
    trees: 480,
    tufts: 3200,
    treeDensity: (x, z) => (Math.abs(x) < 82 && z > -170 && z < 100 ? 0.12 : 1),
    groves: [{ x: -50, z: 0, r: 12, n: 16 }, { x: 50, z: 20, r: 12, n: 16 }, { x: -96, z: -112, r: 16, n: 22 }, { x: -64, z: -46, r: 14, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -82,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    okNight(W);
    okLandscape(W);
    rt._rfN = 3; // 持ち場の外から自動で補充する共通の新手を、この戦では使わない。
    // 遅れて届く共通の台詞も、負けの札の後には表示しない。
    const say = rt.say;
    rt.say = function(...args) { return F.failed ? false : say.apply(this, args); };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true; F.day = 1;
    W.setRainTarget(0.1);
    // 雨の闇の篝火と、城の丘に高く立つ北畠の幟（遠くからも城の位置が見える。A064・A065）
    for (const [x, z] of [[-8, 40], [10, 30], [-14, 12], [14, 2], [-18, MAE_C.z], [18, MAE_C.z], [-6, GATE.z - 3], [6, GATE.z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });
    for (const [x, z] of [[OTE_C.x - 14, OTE_C.z + 10], [OTE_C.x + 14, OTE_C.z + 10], [HON_C.x - 12, HON_C.z + 6], [HON_C.x + 12, HON_C.z + 6], [HON_C.x, HON_C.z + 12]]) rt.scene.add(nobori(W, x, z, 'maru', 4));
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...OKAWACHI_HIST, honjinOda: 'HIST_B', honjinKitabatake: 'HIST_B', kitabatakeAI: 'GAME_C' };
    resetGates();

    // ---- 縄張り（castles/okawachi.js）：北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場。木戸は castle_plan.js に建てさせる ----
    // 夜攻めで城は落ちない。木戸は保ち、戦う場は城外の坂に限る。
    const C = F.C = buildCastlePlan(rt, OKAWACHI_PLAN, { ladders: false, baseHeight: baseWithHori, edgeW: 2.4, buildGates: true, buildTowers: true, team: 1 });
    const joC = C.kuruwa.jo.centroid;
    F.gates = { karamete: makeGate(rt, C.gateObjs.karamete, { name: GATE.name, guardTeam: 1 }) };
    okGate(F.gates.karamete);
    for (const gate of Object.values(C.gateObjs)) { gate.struct.armor = 1; gate.struct.noTarget = true; }
    // 曲輪の中の木造の建物（板葺き。大きな石垣・天守は無い）。本丸の館に北畠具教
    const roofs = { h: 3.2, wall: 0x6a5a44, roof: 0x3a3430 };
    for (const [x, z, w, d, r] of [[-12, -77, 5, 4, 0], [12, -70, 5, 4, 0],
      [NISHI_C.x - 4, NISHI_C.z - 6, 9, 5, 0], [NI_C.x + 4, NI_C.z - 8, 10, 6, 0.1], [NI_C.x - 6, NI_C.z + 8, 7, 5, -0.1],
      [ONANDO_C.x - 6, ONANDO_C.z, 9, 6, 0], [ONANDO_C.x + 7, ONANDO_C.z + 2, 7, 5, 0.1], [BABA_C.x + 16, BABA_C.z - 10, 8, 5, 0.2],
      [OTE_C.x - 6, OTE_C.z - 4, 7, 5, 0]]) rt.scene.add(hut(W, x, z, w, d, r, roofs));
    // 館は縄張り（castles/okawachi.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に具教（kaito 10/2）
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [HON_C.x - 10, HON_C.z + 8], [HON_C.x + 10, HON_C.z + 8], [OTE_C.x - 6, OTE_C.z + 6], [OTE_C.x + 6, OTE_C.z + 6], [NI_C.x, NI_C.z + 12], [NISHI_C.x + 6, NISHI_C.z + 10]]) rt.scene.add(nobori(W, x, z, 'maru', 4));

    // ---- 守り（北畠勢。曲輪ごとの部隊。搦手口だけ本物の兵、ほかは軽い作りで数だけ） ----
    // 搦手口には弓八人。撃ち合う人数は小勢に絞るが、威力は弱めない。
    F.gateDef = makeButai(rt, { name: '塀の内の北畠勢', team: 1, faction: 'saito', kind: 'bow', nominal: 8, nearReal: 8, maxReal: 8, armor: 0x3a2a44, flag: KITABATAKE.flag, at: { x: joC.x, z: GATE.z - 3 }, facing: 0, real: 8 });
    F.gateDef.order({ id: 'hold' });
    // 搦手の控えの一部は下の出撃組として初めから城内に置く。二重に数えない。
    F.gateDef.noSwitch = true;
    F.gateReserve = makeButai(rt, { name: '搦手の残る控え', at: { x: 10, z: -87 }, lightWidth: 10, lightDepth: 6, nominal: 60, facing: 0, armor: 0x3a2a44, flag: KITABATAKE.flag, team: 1, faction: 'saito', kind: 'ashigaru', real: 0, noSwitch: true });
    // 弓の狙いは明るさに従う。倒れた弓兵の自動補充はしない。
    const KB_B = { team: 1, faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, real: 0, maxReal: 0 };
    F.kb = {
      ote: makeButai(rt, { ...KB_B, name: '大手の北畠勢', kind: 'ashigaru', nominal: 220, lightWidth: 18, lightDepth: 12, at: POST.ote, facing: Math.PI }),          // 北の大手へ向く
      hon: makeButai(rt, { ...KB_B, name: '本丸の旗本', kind: 'ashigaru', nominal: 130, lightWidth: 24, lightDepth: 14, at: POST.hon, facing: 0 }),
      nishi: makeButai(rt, { ...KB_B, name: '西ノ丸の守り', kind: 'bow', nominal: 80, lightWidth: 20, lightDepth: 22, at: POST.nishi, facing: -Math.PI / 2 }),   // 谷が守るので少数
      ni: makeButai(rt, { ...KB_B, name: '二ノ丸の守り', kind: 'ashigaru', nominal: 160, lightWidth: 24, lightDepth: 20, at: POST.ni, facing: Math.PI / 2 }),
      onando: makeButai(rt, { ...KB_B, name: '御納戸の番', kind: 'ashigaru', nominal: 40, lightWidth: 18, lightDepth: 10, at: POST.onando, facing: Math.PI / 2 }),
      res: makeButai(rt, { ...KB_B, name: '馬場の予備', kind: 'ashigaru', nominal: 150, lightWidth: 38, lightDepth: 18, at: POST.baba, facing: Math.PI }),
    };
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    F.gateDef.real.calm = false;
    for (const u of F.gateDef.real.units) u.noTarget = false;
    F.kbResAt = 'baba';
    // 総大将・北畠具教は本丸の館の中（天守の無い城）。旗本が縁側の上がり口を守り、踏み込むまで討てない
    F.keep = makeLordKeep(rt, {
      name: '北畠具教', spot: { x: HON_C.x, z: HON_C.z - 7 }, mouth: { x: HON_C.x, z: HON_C.z - 1 }, facing: 0, guardN: 6,
      faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, hat: 'kabuto_m', haori: 0x3a2a44,
    });
    if (F.keep.lord) { F.keep.lord.noTarget = true; F.keep.lord.invuln = true; }
    F.tomofusa = enemyGroup(rt, { fixed: true, faction: 'saito', name: '北畠具房の居所', anchor: { x: F.keep.spot.x + 2, z: F.keep.spot.z }, facing: 0, width: 1, aggro: 0, noRout: true },
      KB([{ type: 'busho', n: 1, o: { name: '北畠具房', horse: false, invuln: true } }]));
    for (const u of F.tomofusa.units) { u.pos.y = F.keep.spot.y; u.keep = true; u.noTarget = true; }
    F.tomofusa.calm = true;
    F.commander = { alive: true, get real() { return F.keep && F.keep.lord && F.keep.lord.alive ? F.keep.lord : null; } };

    // ---- 丹羽長秀の手（自分の持ち場）、池田・稲葉・滝川の手、竹束を進める組 ----
    F.niwa = allyGroup(rt, { fixed: true, formation: 'yari', name: '丹羽長秀の手', anchor: { x: 0, z: 40 }, facing: Math.PI, width: 14, aggro: 10, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', x: 0, z: 47, horse: false, invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }, { type: 'bow', n: 2 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.ikeda = allyGroup(rt, { fixed: true, formation: 'yari', name: '池田恒興の手', anchor: { x: -26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '池田恒興', x: -26, z: 51, horse: false, invuln: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.inaba = allyGroup(rt, { fixed: true, formation: 'yari', name: '稲葉良通の手', anchor: { x: 26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉良通', x: 26, z: 51, horse: false, invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { flag: 'inaba' }));
    F.ram = allyGroup(rt, { fixed: true, formation: 'yari', name: '竹束を進める組', anchor: { x: 12, z: 54 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.taki = allyGroup(rt, { fixed: true, formation: 'yari', name: '滝川一益の手', anchor: { x: -36, z: 66 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', x: -36, z: 73, horse: false, invuln: true, hat: 'kabuto_f', haori: 0x2a2a32 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.niwa, F.ikeda, F.inaba, F.ram, F.taki];
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    // 出撃組は木戸の内で待つ。カメラの背後へ生成場所を替えない。
    F.sorties = [
      enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の城兵', anchor: { x: 0, z: -68 }, facing: 0, width: 4, colW: 4, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]))),
      enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の控え', anchor: { x: 0, z: -78 }, facing: 0, width: 4, colW: 4, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]))),
      enemyGroup(rt, { fixed: true, faction: 'saito', name: '封鎖へ寄せる城兵', anchor: { x: -11, z: -86 }, facing: 0, width: 3, colW: 3, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }]))),
    ];
    for (const g of F.sorties) { g.calm = true; for (const u of g.units) u.noTarget = true; }
    // 雨の夜は鉄砲を止める。弓は夕暮れから矢を交わす。昼の封鎖で鉄砲も解く。
    for (const g of [F.niwa, F.taki]) g.holdFire = true;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 3, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    F.lineGroups = rt.squadGroups.length ? rt.squadGroups : [F.niwa];
    F.lineMin = Math.min(3, F.lineGroups.reduce((sum, g) => sum + g.count, 0));
    [F.niwa, F.ikeda, F.inaba, F.ram, F.taki].forEach((g, i) => {
      const at = ROAD_KARAMETE[i === 0 ? 5 : i === 2 ? 3 : 4];
      g.formation = 'column'; g.colW = 2;
      placeGroup(rt, g, at[0], at[1]);
    });
    // ---- 竹束の寄せ（taketaba.js）：丹羽・池田・稲葉の手は竹束を押し立て、雨の闇をゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    const gateHalf = () => F.step >= 2 || F.gates.karamete.struct.hp < F.gates.karamete.struct.maxHp * 0.5;
    F.TA = makeTabaAdvance(rt, {
      near: 40,
      items: [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]].map(([g, x]) => ({ g, yose: { x, z: GATE.z + 16 }, until: gateHalf })),
      avoid: [this.spawn, { x: 10, z: 50 }],
    });
    // 開始時の目の前にも、実際に矢を防ぐ竹束を置く。元の形を使い回す。
    addTaba(rt, this.spawn.x - 2, this.spawn.z - 3, 0, { fixed: true });
    addTaba(rt, this.spawn.x + 2, this.spawn.z - 3, 0, { fixed: true });
    const tabaMaterial = F.tabas[0].m.material.clone();
    tabaMaterial.color.setHex(0xffefbe);
    tabaMaterial.emissive.setHex(0xb8ad70); tabaMaterial.emissiveIntensity = 0.32;
    for (const tb of F.tabas) tb.m.material = tabaMaterial;
    rt.marker('tabaFront', () => F.TA.items[0].tabas[0].m.position, '竹束の陰へ', { h: 2.5 });
    rt.marker('karamete', GATE, '南の搦手の木戸', { h: 5 });
    // ---- 織田の本陣（東の山。信長）と、城外の四方の囲みの陣（軽い作り。一つのキャンプに集めない） ----
    F.jinOdaCamp = camp(rt, { x: HONJIN.x, z: HONJIN.z, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', armor: 0x2b3140,
      general: { name: '織田信長', hat: 'kabuto_w', haori: 0x8a1a14 }, guard: 15, reserve: 0, runTo: { x: 0, z: 44 } });
    F.honjinReserve = makeButai(rt, { name: '信長の本陣の控え', at: { x: 92, z: 16 }, lightWidth: 18, lightDepth: 12, nominal: 120, facing: -Math.PI / 2, team: 0, faction: 'oda', flag: 'oda', armor: 0x2b3140, kind: 'ashigaru', real: 0, noSwitch: true });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 5));
    const OB = { team: 0, faction: 'oda', armor: 0x2b3140, real: 0, maxReal: 0 };
    F.siege = {
      north: makeButai(rt, { ...OB, name: '北の囲み（坂井政尚・蜂屋頼隆）', kind: 'ashigaru', nominal: 520, lightDepth: 18, at: SIEGE.north, facing: 0, flag: 'oda' }),
      east: makeButai(rt, { ...OB, name: '東の囲み（柴田勝家・森可成）', kind: 'ashigaru', nominal: 360, lightWidth: 24, lightDepth: 16, at: SIEGE.east, facing: -Math.PI / 2, flag: 'eiraku' }),
      west: makeButai(rt, { ...OB, name: '西の囲み（木下藤吉郎・佐久間信盛）', kind: 'bow', nominal: 330, lightDepth: 20, at: SIEGE.west, facing: Math.PI / 2, flag: 'oda' }),
      south: makeButai(rt, { ...OB, name: '搦手の封鎖（丹羽・池田・稲葉）', kind: 'ashigaru', nominal: 440, lightWidth: 38, lightDepth: 24, at: SIEGE.south, facing: Math.PI, flag: 'oda' }),
    };
    F.siegeList = Object.values(F.siege); F.kbList = Object.values(F.kb);
    for (const b of F.siegeList) { b.order({ id: 'hold' }); b._to = null; b.light.army.team = 0; }
    for (const b of F.kbList) { b.light.army.team = 1; b.light.army.noWake = true; b.light.army.keepNear = true; }
    F.gateDef.light.army.team = 1;
    F.gateDef.light.army.noWake = true; F.gateDef.light.army.keepNear = true;
    // 将も護衛も初めからいる兵の内数。四方の備えの後ろに徒歩で置く。
    F.officers = [];
    for (const [key, names] of [['north', ['坂井政尚', '蜂屋頼隆']], ['east', ['柴田勝家', '森可成']], ['west', ['木下藤吉郎', '佐久間信盛']]]) {
      const b = F.siege[key], sx = Math.cos(b.facing), sz = -Math.sin(b.facing);
      for (let i = 0; i < names.length; i++) {
        const x = b.pos.x - Math.sin(b.facing) * 12 + sx * (i ? 6 : -6);
        const z = b.pos.z - Math.cos(b.facing) * 12 + sz * (i ? 6 : -6);
        const pts = b.light.take(x, z, 3, 1e9, null, b._canSpawn);
        if (pts.length !== 3) { for (const q of pts) b.light.give(q.i); continue; }
        b.nominal -= 3;
        const g = allyGroup(rt, { fixed: true, name: names[i] + 'の旗本', anchor: { x, z }, facing: b.facing, width: 4, formation: 'yari', aggro: 8, noRout: false },
          dress([{ type: 'busho', n: 1, o: { name: names[i], x, z, horse: false, invuln: true } },
            { type: 'samurai', n: 1, o: { x: x - sx * 2, z: z - sz * 2 } }, { type: 'samurai', n: 1, o: { x: x + sx * 2, z: z + sz * 2 } }], ODA));
        F.officers.push(g);
      }
    }
    F.nearButai = [...F.siegeList, ...F.kbList, F.gateReserve, F.honjinReserve];
    for (const b of F.nearButai) {
      b.noSwitch = true; b.light.army.noWake = true; b.light.army.keepNear = false;
      const canStand = b._canSpawn;
      b._canSpawn = (x, z) => canStand(x, z) && Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) < 24;
    }
    for (const s of Object.values(SIEGE)) {
      rt.scene.add(nobori(W, s.x - 6, s.z + 6, 'oda', 4), nobori(W, s.x + 6, s.z + 6, 'eiraku', 4));
      rt.scene.add(campfire(W, s.x, s.z + 12)); W.addFire(s.x, s.z + 12);
    }
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 6, 'oda'], [CAMP.x + 8, CAMP.z + 6, 'eiraku'], [-30, 36, 'oda'], [30, 36, 'inaba']]) rt.scene.add(nobori(W, x, z, k, 4));
    for (const [x, z] of [[-16, 62], [20, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    // 四方の通路に柵。道の口を残し、そこを兵が守る。位置は縮尺の復元。
    for (const seg of [[-22, -184, -6, -184], [6, -184, 22, -184],
      [80, -114, 80, -102], [80, -90, 80, -78],
      [-112, -130, -112, -120], [-112, -108, -112, -96],
      [18, 18, 28, 18], [40, 18, 50, 18], [18, 21, 28, 21], [40, 21, 50, 21]]) {
      rt.scene.add(palisade(W, seg, { h: 1.8, solid: true, mound: false, noBrace: true }));
    }

    // ---- 包囲の一日目 → 囲みの紹介→ 十二日目の夜（自分の戦） ----
    rt.setPhase('brief');
    rt.obj('main', '丹羽の旗で下知を待て', 'main');
    rt.banner('包囲　一日目', '織田勢が、大河内城を四方から囲む');
    rt.say('組頭', `北が大手、こっちが搦手だで。足元を見よ。谷へ落ちたら戻れんぞ`, 5);
    rt.after(1, () => { if (!rt.over && !rt.flags.ending && rt.phase === 'brief' && !rt.player.lock && !rt.game.noLock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 2.2 }; });
    rt.marker('mkHon', HON_C, '本丸', { h: 8 });
    rt.after(7, () => { rt.unmark('mkHon'); this.oteDay(rt); });
    rt.after(10, () => this.nightDay(rt));
    buildBattleJin(rt);
    okReflect(rt);
  },

  // 囲みの紹介。日付の分からない大手攻めを作らず、四方の封鎖を見せる。
  oteDay(rt) {
    const F = rt.flags;
    if (F.day >= 7 || F.step >= 1 || F.ending || rt.over) return;
    F.day = 7;
    rt.bark('北は大手、東は川。西と南の谷にも囲みの手');
    rt.say(okSpeaker(rt), '柵を二重三重に結べ。兵糧の一俵も城へ入れるな', 5);
    rt.after(1, () => { if (!rt.over && !F.ending && rt.phase === 'brief' && !rt.player.lock && !rt.game.noLock) rt.player.cine = { x: OTE_C.x, z: OTE_C.z, t: 2 }; });
  },
  // 十二日目（九月八日）の夜：雨の搦手の夜攻めへ
  nightDay(rt) {
    const F = rt.flags;
    if (F.day >= 12 || F.ending || rt.over) return;
    F.day = 12; rt.unmark('mkHon'); rt.player.cine = null;
    const duskLook = rt.world.currentLook();
    rt.world.setTime('night'); rt.world.setRainTarget(0.9);
    // 下知を早送りした時も夕暮れから移ろう。光の入れ物は切替時だけ作る。
    if (!rt.world.fade) rt.world.fade = { from: duskLook, to: rt.world.lookOf('night'), fromNight: 0, t: 0, dur: 24, env: 0 };
    rt.bark('九月八日。日が暮れる。三手で雨の搦手へ');
    rt.say(okSpeaker(rt), '今宵は三手でかかるぞ。わしらは竹束を守るのじゃ', 4.5);
    rt.after(5, () => rt.say(okSpeaker(rt), '雨で鉄砲は役に立たぬ。竹束の陰に身を寄せ、槍で詰めよ', 4));
    rt.marker('niwa', F.niwaU.pos, '丹羽長秀', {});
    rt.after(4, () => this.assault(rt));
  },
  // 囲みの部隊を動かす（軽い作り）。_to は北畠の頭が「どこへ寄せられたか」を見る印
  siegeMove(rt, k, to) {
    const b = rt.flags.siege && rt.flags.siege[k];
    if (!b || b.aliveNominal() <= 0) return;
    moveL(b, to);
    b._to = Math.hypot(to.x - SIEGE[k].x, to.z - SIEGE[k].z) < 4 ? null : { x: to.x, z: to.z };
  },
  kbMove(rt, k, to) {
    const b = rt.flags.kb[k];
    if (b && b.aliveNominal() > 0) moveL(b, to);
  },
  // 北畠の頭（docs 55）：大手を厚く守る／敵が東へ→二ノ丸へ増援／西ノ丸が危ない→予備を動かす／
  // 本丸が危ない→予備すべて／包囲が薄い→搦手から打って出る（三十日目の出来事。siegeDays が見る）
  kbThink(rt) {
    const F = rt.flags, S = F.siege, K = F.kb;
    const thr = (pt, r = 40) => Object.values(S).reduce((s, b) => s + (b._to && Math.hypot(b._to.x - pt.x, b._to.z - pt.z) < r ? b.aliveNominal() : 0), 0);
    const hon = thr(HON_C, 36), west = thr(NEAR.nishi), east = thr(NEAR.ni), ote = thr(NEAR.ote);
    const say = () => {}; // 城内の下知は、寄せ手の足軽には聞こえない。
    if (hon > 0 && F.kbResAt !== 'hon') {
      F.kbResAt = 'hon';
      this.kbMove(rt, 'res', POST.hon); this.kbMove(rt, 'onando', { x: POST.hon.x + 6, z: POST.hon.z });
      say('北畠勢：本丸が危うい。予備をすべて本丸へ');
    } else if (west > K.nishi.aliveNominal() * 1.2 && !F.kbWest && F.kbResAt !== 'hon') {
      F.kbWest = true;
      // 馬場の予備がまだ居れば予備を、もう二ノ丸へ回していれば御納戸の番を西ノ丸へ
      if (F.kbResAt === 'baba') { F.kbResAt = 'nishi'; this.kbMove(rt, 'res', { x: POST.nishi.x + 6, z: POST.nishi.z + 6 }); say('北畠勢：西ノ丸が危うい。馬場の予備を西ノ丸へ'); }
      else { this.kbMove(rt, 'onando', { x: POST.nishi.x + 6, z: POST.nishi.z + 6 }); say('北畠勢：西ノ丸が危うい。御納戸の番まで西ノ丸へ回す'); }
    } else if (east > 0 && F.kbResAt === 'baba') {
      F.kbResAt = 'ni';
      this.kbMove(rt, 'res', { x: POST.ni.x, z: POST.ni.z + 8 });
      say('北畠勢：東から寄せた。馬場の予備を二ノ丸へ');
    } else if (ote > K.ote.aliveNominal() * 1.5 && F.kbResAt !== 'hon' && !F.kbOteHelp) {
      F.kbOteHelp = true;
      this.kbMove(rt, 'hon', { x: POST.ote.x, z: POST.ote.z + 8 });
      say('北畠勢：大手へ本丸の旗本を回す');
    }
  },
  // 寄せた囲みの部隊と、近い北畠の部隊を数で削り合わせる（軽い作り同士）
  siegeClash(rt, dt) {
    const F = rt.flags;
    for (const a of F.siegeList) {
      if (!a._to || a.aliveNominal() <= 0) continue;
      for (const d of F.kbList) {
        const dp = d.pos;
        if (d.aliveNominal() > 0 && Math.hypot(a.pos.x - dp.x, a.pos.z - dp.z) < 46) lightClash(a, d, dt, 0.12);
      }
    }
  },

  // ① 搦手の木戸へ（軍議で選んだ道。無ければ搦手へ真っ直ぐ）
  assault(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('niwa');
    sfx('horagai', 0.8);
    const lure = F.strategy === 'ote_lure';
    const go = () => {
      rt.banner('夜攻め', '雨の闇の中を、南の搦手の木戸へ');
      rt.obj('main', HI(rt) ? '一手を率い、竹束と搦手へ進め' : '竹束を守り、搦手へ進め', 'main', true);
      const R = F.ram;
      R.order = 'path'; R.path = [...ROAD_KARAMETE.slice(4, 6), [-4, GATE.z + 12]]; R.pathIdx = 0; R.formation = 'column'; R.colW = 2; R.aggro = 2; R.assault = null; R.onArrive = (q) => { q.order = 'hold'; };
      for (const [g, x] of [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]]) { g.order = 'path'; g.path = [...ROAD_KARAMETE.slice(g === F.niwa ? 5 : g === F.ikeda ? 4 : 3, 6), [x, GATE.z + 16]]; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.aggro = 3; g.speed = 2.2; g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.aggro = 12; }; }
      if (!gone(F.taki)) { F.taki.order = 'path'; F.taki.path = [...ROAD_KARAMETE.slice(4, 6), [-12, FRONT.z + 14]]; F.taki.pathIdx = 0; F.taki.formation = 'column'; F.taki.colW = 2; F.taki.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -12, z: FRONT.z + 14 }; }; }
      rt.marker('gate', FRONT, '搦手の坂・竹束を守れ', { h: 4 });
      rt.after(4, () => { if (F.step === 1) rt.say(okSpeaker(rt), '池田殿も稲葉殿も寄せておるぞ。弓が来る！　竹束の陰を離れるな', 4); });
      rt.after(8, () => rt.say('足軽', '火縄が消えた！　撃てんがや！', 3));
    };
    if (lure) {
      rt.say(okSpeaker(rt), '坂井殿の手を大手へ寄せよ。城方が北を向いたら、搦手へかかるぞ', 4);
      this.siegeMove(rt, 'north', NEAR.ote);
      rt.after(14, () => this.siegeMove(rt, 'north', SIEGE.north));
      // 大手に気を取られ、搦手の守りが薄くなる（夜目も利かぬ雨なので、なおさら気付くのが遅れる）
      F.gateDef.morale = Math.max(40, F.gateDef.morale - 14 * nightAccuracyMult(rt.world));
      rt.after(8, () => { rt.say(okSpeaker(rt), '今じゃ！　搦手へかかれ！', 3); go(); });
    } else go();
  },

  // ② 城兵の打って出
  pushback(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('push');
    rt.unmark('gate');
    rt.unmark('sakamichi'); F.roadGuideMarked = false;
    F.ram.assault = null; F.ram.order = 'hold';
    sfx('taiko', 1);
    rt.banner('夜攻め、敗れる', '鉄砲は役に立たず、城兵が木戸から打って出る');
    rt.obj('main', '坂の旗で槍をそろえ、城兵を止めよ', 'main', true);
    rt.marker('gate', FRONT, '城兵を止める坂の旗', { h: 3 });
    rt.say(okSpeaker(rt), '城兵が出たぞ！　木戸へ突っ込むな。坂の旗に槍をそろえよ！', 3.5);
    // 初めから曲輪で待っていた二組が、木戸を開けて順に坂へ出る。
    F.push = F.sorties.slice(0, 2);
    sendSortie(rt, F.push[0], { x: -6, z: FRONT.z - 5 });
    rt.after(8, () => { if (!F.ending) sendSortie(rt, F.push[1], { x: 6, z: FRONT.z - 5 }); });
  },

  // 攻めを止めて退路を保つ。任務は常に一つ。
  midA(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('tabaFront'); rt.unmark('karamete');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    rt.unmark('gate');

    if ((F.push || []).every(sortieBroken)) rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    F.pushDone = true;
    // 竹束の組が先に陣へ下がり、槍の三手は退路に残る。
    if (!gone(F.ram)) {
      F.ram.assault = null; F.ram.order = 'path';
      F.ram.path = downRoad(F.ram, [12, CAMP.z - 16]);
      F.ram.pathIdx = 0; F.ram.speed = 2.6;
      F.ram.onArrive = (g) => { g.order = 'hold'; };
      rt.marker('backColumn', () => F.ram.count && !F.ram.routed ? F.ram.center() : null, '陣へ下がる竹束の組');
    }
    if (!gone(F.taki)) {
      F.taki.order = 'path'; F.taki.formation = 'column'; F.taki.colW = 2;
      F.taki.path = downRoad(F.taki, [-12, CAMP.z - 16]); F.taki.pathIdx = 0;
      F.taki.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -12, z: CAMP.z - 16 }; };
      rt.marker('backEscort', () => gone(F.taki) ? null : F.taki.center(), '後から退く滝川の組');
    }
    rt.say(okSpeaker(rt), '竹束と滝川殿の手を先に退かせるぞ。坂を固め、追っ手を食い止めよ！', 4);
    rt.objRemove('main');
    depthStart(rt, okCtx(rt), [okHold({ at: FRONT, dur: 80, limit: 120, r: 18, title: '坂の退路を保つ', obj: '坂の旗で、二分間退き口を守れ', groups: F.push, reward: '坂の退路を保った' })], () => this.retreat(rt));
  },

  // ③ 退く（搦手の前を保ちきれなかった時の、史実どおりの筋）
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending) return;
    rt.objRemove('dp'); rt.unmark('backColumn'); rt.unmark('backEscort');
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);

    sfx('horagai', 0.6);
    rt.banner('退きの下知', '夜攻めは破れた。組を崩さず、南の陣へ');
    rt.say(okSpeaker(rt), '退け！　槍を返せ。組を崩さず陣へ戻るぞ！', 4);
    rt.obj('main', HI(rt) ? '殿を務め、追っ手を防いで南の陣へ退け' : '追っ手を防ぎ、陣へ退け', 'main', true);
    if (HI(rt)) rt.after(1.5, () => rt.say(okSpeaker(rt), `${nm(rt)}、殿を務めよ。最後の組を退かせ、その方も戻るのじゃ`, 4));
    rt.marker('camp', { x: CAMP.x, z: CAMP.z - 6 }, '戻る陣の旗', { h: 2 });
    rt.zone('camp', CAMP.x, CAMP.z - 6, 8);
    for (const [i, g] of [F.niwa, F.ikeda, F.inaba].entries()) if (!gone(g)) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.retreatOnly = true; g.focus = null; g.assault = null;
      g.path = downRoad(g, [(i - 1) * 10, CAMP.z - 16]); g.pathIdx = 0; g.speed = 2.6;
      g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.anchor = { x: (i - 1) * 10, z: CAMP.z - 16 }; q.formation = 'yari'; };
    }
    // 生き残りが先に追い、城内の小勢が間をあけて続く。陣の手前で止めない。
    F.chasers = (F.push || []).filter((g) => !sortieBroken(g) && !g._okReturning);
    F.chaseAt = rt.t + 12;
    for (const g of F.chasers) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 10;
      g.path = downRoad(g, [CAMP_LINE.x, CAMP_LINE.z - 10]); g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.width = 8; q.aggro = 18; q.seekRange = 28; };
    }
    battleEvent(rt, EVENT_RETREAT, FRONT, F.niwa, 0, true, '夜攻めをやめ、南の陣へ退く');
    rt.after(5, () => rt.say(okSpeaker(rt), '陣の旗を見失うな。谷へ下りるでない。追っ手が来たら槍を返せ', 4));
  },

  // 九月九日以後の兵糧攻め。別の土地の焼き払いは知らせで伝え、封鎖の局地戦は遊びの補い。
  siegeDays(rt) {
    const F = rt.flags;
    if (F.step >= 4 || F.ending) return;
    F.step = 4; F.stepT = rt.t; F.day = 13;
    for (const g of F.oda) g.holdFire = false;
    rt.setPhase('siege');
    rt.unmark('camp'); rt.unzone('camp'); rt.unmark('ch');
    for (const q of F.chasers || []) if (!gone(q)) returnSortie(q);
    rt.award((t) => t.side.push('追っ手を防ぎながら陣まで退いた'), '陣まで退いた');
    rt.after(2, () => { if (!F.ending && !rt.over) rt.say('組頭', '昨夜の槍仲間が戻らん……。囲みはまだ続くで、気を抜くな', 4); });
    rt.objRemove('main');
    rt.world.setTime('day'); rt.world.setRainTarget(0.15);
    rt.banner('力攻めから、兵糧攻めへ', '九月九日。四方の道をふさぎ、囲みを保つ');
    rt.say(okSpeaker(rt), '今度は兵糧を断つのじゃ。南の道を固めよ。荷も城兵も通すでない', 5);
    rt.after(8, () => {
      if (F.ending || rt.over || F.step !== 4) return;
      sendOrder(rt, F.jinOdaCamp.general || HONJIN, rt.player.u, { id: 'okawachiNews', apply: () => {
        if (!F.ending && F.step === 4) rt.say('使番', '滝川左近殿へ、多芸の御殿を焼き、作物を薙げとの下知にござる', 5);
      } }, { team: 0, faction: 'oda', name: '本陣の知らせ' });
    });
    // 多芸谷は別の土地。城のすぐ裏へ火を置かず、届いた下知で伝える。
    F.blockers = [F.sorties[2]];
    depthStart(rt, okCtx(rt), [okHold({ at: SOUTH_BLOCK, dur: 75, r: 18,
      title: '南の道を封鎖', obj: '南の旗で、城兵と兵糧を止めよ',
      groups: F.blockers, sortie: true, reward: '南の道を保ち、城へ兵糧を通さなかった',
    })], () => { if (!F.ending) this.peace(rt); });
    rt.after(30, () => {
      if (F.ending || rt.over || F.step !== 4 || rt.phase !== 'siege') return;
      rt.say('組頭', 'そこの槍、間を詰めよ。柵の口を抜かれるで', 4);
    });
    rt.after(62, () => { if (F.ending || rt.over || F.step !== 4 || rt.phase !== 'siege') return; rt.say(okSpeaker(rt), '向こうも兵糧が欲しかろう。柵を離れるな。ひと荷も通すでない', 4); });
  },

  // 和睦（docs 57）：本丸で北畠を討って終わり、にしない。長い囲み＋圧力＋双方の損＋出来事 → 和睦
  peace(rt) {
    const F = rt.flags;
    if (F.ending || !F.blockHeld || !rt.player.u.alive) return;
    F.ending = true; F.day = 50;
    rt.setPhase('end');
    for (const k in F.siege) this.siegeMove(rt, k, SIEGE[k]);
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    rt.objDone('dp');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '南の道を保ち、兵糧を止めて和睦まで囲みに加わった', pts: 18 }; }, '任務達成・和睦');
    rt.banner('囲みは続き、十月四日へ', '城には逃れてきた者もいた。飢えが広がる中、和睦に至る');
    rt.after(5, () => rt.banner('十月四日　和睦', '北畠は茶筅丸へ家督を譲ると約し、城を渡す'));
    F.gates.karamete._openNow(false);
    // 和睦の知らせを受ける。閉じた木戸の外へ使者を突然作らない。
    sfx('horagai', 0.4);
    rt.say(okSpeaker(rt), `和睦が成ったぞ。城は滝川殿と津田殿へ渡る。${nm(rt)}、よう守った`, 4.5);
    rt.after(5, () => rt.say('', '茶筅丸（のちの信雄）への家督譲渡を約し、北畠父子は退城した', 4));
    rt.after(9.5, () => rt.say('', '翌年、織田勢は越前へ進む。金ヶ崎では追われる側となった', 3));
    rt.player.u.invuln = true;
    // 和睦の後に共通の追撃を重ねると、近い敵を待って終幕が閉じなくなる。
    rt.finish({ scriptedEnd: true }, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 最後の一人が倒れた場合も、軽い兵へ戻して生き返らせない。
    for (const b of F.nearButai) if (b.real && !b.real.count && b._prevRealAlive) { b.lost = Math.min(b.nominal, b.lost + b._prevRealAlive); b._prevRealAlive = 0; }
    butaiTick(rt, dt);
    if (!F.ending && !rt.over) nearButaiTick(rt);
    if (F.keep) F.keep.tick();
    if (F.keep?.reached) { F.tomofusa.calm = false; for (const u of F.tomofusa.units) u.noTarget = false; }
    // 出撃・帰城する兵が木戸の近くにいる間は開け、通り終えてから閉める。
    let passing = false;
    for (const g of F.sorties) if ((g.order === 'path' || g.order === 'move' || g.routed) && g._sortieSent) {
      for (const u of g.units) if (u.alive && Math.abs(u.pos.x) < 9 && Math.abs(u.pos.z - GATE.z) < 18) { passing = true; break; }
    }
    if (passing && !F.gates.karamete.opened) F.gates.karamete._openNow(false);
    else if (!passing && F.gates.karamete.opened && !F.ending) F.gates.karamete.close();
    // 闇で狙いは鈍る。弓の威力を特別に弱めず、昼になれば明るさの補正を戻す。
    { const g = F.gateDef && F.gateDef.real; if (g && !g._rain) { g._rain = true; g._okBaseDmg = g.dmgMult || 1; }
      if (g) g.dmgMult = g._okBaseDmg * nightAccuracyMult(rt.world); }
    if (F.ending || rt.over) return;
    // やり直しの札と終幕の時間も残し、五百秒を越えて持ち場で待たせない。
    if (rt.t >= 470) {
      this.lose(rt, F.step === 3 ? '陣へ戻れず、退きの下知が出た' : '持ち場を保てず、交代の下知が出た', true);
      return;
    }
    // 崩れた小勢の残兵を坂に置き去りにしない。生きた城兵が道を通って帰る。
    for (const g of F.sorties) if (g._sortieSent && !g._okReturning && !gone(g) && sortieBroken(g)) returnSortie(g);
    if ((F.kbT = (F.kbT || 0) - dt) <= 0) { F.kbT = 1.5; this.kbThink(rt); }
    this.siegeClash(rt, dt);
    // 木戸は出撃と帰城の下知で開閉する。城内の占領で開く共通判定は使わない。
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    // 雨の夜攻めでは射撃を止める。昼の封鎖で元に戻す。
    if ((F.gunT = (F.gunT || 0) - dt) <= 0) {
      F.gunT = 1;
      for (const u of rt.army.units) if (u.alive && u.team === 0 && u.type === 'gun') {
        if (u._okRainDmg === undefined) u._okRainDmg = u.dmg;
        if (F.step < 4) { u.dmg = 0; u.cd = Math.max(u.cd || 0, 3); } else u.dmg = u._okRainDmg;
      }
    }
    depthTick(rt, dt);
    if (F.ending || rt.over) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - FRONT.x, p.z - FRONT.z);
      if (rt.t >= (F.roadGuideAt || 0)) {
        F.roadGuideAt = rt.t + 1;
        if (d > 22) {
          karametePoint(p, WAY_FROM);
          let i = Math.min(KARAMETE_WAY.length - 1, Math.floor(WAY_FROM.s) + 1);
          if (Math.hypot(p.x - KARAMETE_WAY[i][0], p.z - KARAMETE_WAY[i][1]) < 3) i = Math.min(KARAMETE_WAY.length - 1, i + 1);
          if (!F.roadGuide) F.roadGuide = { x: 0, z: 0 };
          if (!F.roadGuideMarked) { F.roadGuideMarked = true; rt.marker('sakamichi', () => F.roadGuide, '坂道の曲がり角', { h: 2.5 }); }
          F.roadGuide.x = WAY_FROM.d > 3 ? WAY_FROM.x : KARAMETE_WAY[i][0];
          F.roadGuide.z = WAY_FROM.d > 3 ? WAY_FROM.z : KARAMETE_WAY[i][1];
        } else if (F.roadGuideMarked) { rt.unmark('sakamichi'); F.roadGuideMarked = false; }
      }
      const el = rt.t - F.stepT, ramAt = F.ram.center();
      const ramReady = gone(F.ram) || Math.hypot(ramAt.x - FRONT.x, ramAt.z - FRONT.z) < 14;
      rt.objProgress('main', d < 22 ? '竹束の後ろで槍をそろえよ' : `曲がり角を登れ。坂まで ${Math.round(d)}歩`);
      // 竹束が寄ったら城兵が応じる。坂で一分間待たせず、遅れた時にも次へ進む。
      if ((d < 22 && el >= 18 && ramReady) || (d < 22 && el >= 28) || el > 45) { if (!F.pushStarted) { F.pushStarted = true; this.pushback(rt);
        if (d >= 22) rt.say(okSpeaker(rt), '城兵が坂へ出ておるぞ。組を旗へ寄せ、退き口を固めよ', 4); } }
    }
    if (F.step === 2) {
      const L = F.push || [];
      rt.objProgress('main', '坂の旗で城兵を押し返せ');
      if ((rt.t - F.stepT >= 12 && L.length >= 2 && L.every(sortieBroken)) || rt.t - F.stepT > 90) this.midA(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - CAMP_LINE.x, p.z - CAMP_LINE.z);
      let alive = 0, arrived = 0;
      for (let i = 0; i < 3; i++) {
        const g = F.oda[i];
        for (const u of g.units) {
          if (!u.alive || u.dying || u.gone || u.woundOut || u.noTarget) continue;
          alive++;
          if (Math.hypot(u.pos.x - CAMP_LINE.x, u.pos.z - CAMP_LINE.z) <= 24) u._okReturned = true;
          if (u._okReturned) arrived++;
        }
      }
      rt.objProgress('main', `帰陣 ${arrived}／${alive}人・陣の旗まで ${Math.max(0, Math.round(d))}歩。旗へ入れ`);
      // 本人が旗に入れば帰陣。遅れた組の割合で足止めしない。
      if (d <= 8 && rt.player.u.alive) this.siegeDays(rt);
      else {
        okChaseWave(rt);
        okLineDanger(rt, F, CAMP_LINE, 30, 'main', dt, '帰陣の列');
      }
    }

  },

  lose(rt, reason, deadline = false) {
    if (!deadline && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; F.failed = true;
    if (F.dp) F.dp.on = false;
    rt.objFail('main'); rt.objFail('dp'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('backColumn'); rt.unmark('backEscort');
    rt.unmark('sakamichi'); rt.unmark('niwa');
    for (const id of ['camp', 'ch', 'gate', 'p1', 'p2']) { rt.unmark(id); rt.unzone(id); }
    rt.objRemove('main'); rt.objRemove('dp');
    rt.unmark('tabaFront'); rt.unmark('karamete');
    okHideSpeech(rt);
    rt.tracker.main = false; rt.banner('持ち場を守れず', reason);
    // しくじった三手を退かせる。総軍が壊滅した負けにはしない。
    for (const g of F.oda) if (!gone(g)) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = downRoad(g, [CAMP.x, CAMP.z - 16]); g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    rt.finish({ scriptedEnd: true, failureReason: reason }, 7);
  },

  onFinish(rt) {
    // 巻物に、この戦で次に取る手を一行添える（戦功は増やさない）。
    const lines = rt.tracker.lines;
    rt.tracker.lines = function() {
      const result = lines.call(this);
      result.push({ label: '次の手：竹束の組を近くで守る', detail: '次への心得', pts: 0, big: true });
      return result;
    };
    if (rt.flags.failed) okHideSpeech(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0)) return;
    F.routSayT = rt.t + 10; g._routSaid = true;   // 隊ごとに一度（崩れて立て直す隊が、同じ一言を十秒おきに繰り返していた。10/2）
    // 敵の敗走先を、目撃なしに知らせない。
  },
};

// 距離や経過時間だけでは列を破らない。実際の死傷・敗走と、持ち場の敵を見る。
function okLineDanger(rt, C, at, radius, id, dt, place) {
  const F = rt.flags, p = rt.player.u.pos;
  let active = 0, foes = 0, support = 0;
  for (const g of F.lineGroups) if (!g.routed) for (const u of g.units) {
    if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.dropped && !u.noTarget) active++;
  }
  rt.army.forNear(at.x, at.z, radius, (u) => {
    if (!u.alive || u.dying || u.gone || u.isStruct || u.fleeing || u.woundOut || u.noTarget || u.dropped) return;
    if (u.team === 1) foes++;
    else if (!u.isPlayer && !u.group?.routed) support++;
  });
  const near = Math.hypot(p.x - at.x, p.z - at.z) <= radius;
  // 援軍と槍をそろえるか、本人が敵を押し返せば、残る兵で持ち直せる。
  const broken = active < F.lineMin && support < 3 && foes > 0;
  if (!broken) {
    if (C.dangerT) rt.bark('列が持ち直した。味方のそばで守れ');
    C.dangerT = 0; return false;
  }
  if (!C.dangerT) rt.bark('危ない！　組が崩れかけた。十秒の間に旗へ戻り、城兵を押し返せ', true);
  C.dangerT = (C.dangerT || 0) + dt;
  rt.objProgress(id, `危ない！　あと${Math.max(0, Math.ceil(10 - C.dangerT))}秒。組のそばで城兵を止めよ`);
  if (near) {
    // 近くで支える間だけ、敗走した生き残りを呼び戻す。死者や深手の者は戻さない。
    for (const g of F.lineGroups) {
      let rallied = false;
      for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.woundOut && !u.dropped && !u.noTarget && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 12) {
        u.fleeing = false; u.routIn = undefined; u.target = null; u.atk = null; u.confused = 0; rallied = true;
      }
      if (rallied) {
        g.routed = false; g.morale = Math.max(35, g.morale);
        g.order = 'hold'; g.focus = null; g.path = null; g.dest = null;
        g.wavered = false; g._routLeft = 0; g.anchor.x = p.x; g.anchor.z = p.z;
      }
    }
    // 呼び戻した兵がそろった時点で猶予を解除する。
    let restored = 0;
    for (const g of F.lineGroups) if (!g.routed) for (const u of g.units) {
      if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.dropped && !u.noTarget) restored++;
    }
    if (restored >= F.lineMin) { C.dangerT = 0; rt.bark('列が持ち直した。味方のそばで守れ'); return false; }
  }
  if (C.dangerT >= 10) { rt.def.lose(rt, `${place}：組が崩れ、城兵を止められなかった`, true); return true; }
  return false;
}

function okHideSpeech(rt) {
  const H = rt.hud;
  H.subQ.length = 0; H.subT = 0; H.shownLine = null; H.shownGoalKey = null;
  for (const line of H.orderLog) line.read = true;
  H.updateLogEntry();
  for (const id of ['subtitle', 'sublog']) {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; if (id === 'sublog') el.hidden = true; }
  }
  window.speechSynthesis?.cancel();
}

// 材質はこの戦の中だけで複製して使い回す。他の戦の旗や木戸へ色を残さない。
function okReflect(rt) {
  const flagMats = new Map(), gateMats = new Map();
  const reflected = (base, cache, color, intensity) => {
    if (!base?.emissive) return base;
    if (!cache.has(base)) {
      const m = base.clone();
      m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
      m.emissive.setHex(color); m.emissiveIntensity = intensity; m.emissiveMap = base.map;
      cache.set(base, m);
    }
    return cache.get(base);
  };
  const flag = (mesh) => { if (mesh) mesh.material = reflected(mesh.material, flagMats, 0x9caec8, 0.24); };
  rt.scene.traverse((obj) => { if (obj.userData.flag?.isMesh) flag(obj.userData.flag); });
  for (const u of rt.army.units) {
    flag(u.flag); flag(u.standardFlag);
    if (u.flag) u.flagMat = u.flag.material;
    if (u.standardFlag) u.standardFlagMat = u.standardFlag.material;
  }
  for (const b of rt.flags.nearButai) {
    const mesh = b.light.army.flags;
    if (mesh) flag(mesh);
  }
  for (const gate of Object.values(rt.flags.C.gateObjs)) {
    for (const root of [gate.mesh, gate.frame]) if (root) root.traverse((obj) => {
      if (obj.isMesh && !Array.isArray(obj.material)) obj.material = reflected(obj.material, gateMats, 0xb8a07a, 0.3);
    });
  }
}

// この戦の山だけを斜面にし、裾を深く重ねる。夜も三段の霞と山肌を残す。
function okLandscape(W) {
  for (const m of W.mountains.children) {
    const p = m.geometry.attributes.position, layer = m.material.uniforms.layer.value;
    for (let i = 0; i < p.count; i++) {
      const f = (i % 6) / 5, x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z);
      const radius = Math.hypot(x, z);
      const slope = 1 + ((1 - f) * -38 + Math.sin(a * 7 + layer) * 10 * f) / radius;
      p.setXYZ(i, x * slope, p.getY(i) - 28 * (1 - f), z * slope);
    }
    p.needsUpdate = true;
    m.geometry.computeBoundingSphere();
    const mat = m.material;
    mat.uniforms.okSky = W.skyMat.uniforms.bottom;
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform vec3 color, hazeCol,', 'uniform vec3 okSky; uniform vec3 color, hazeCol,')
      .replace('gl_FragColor = vec4(mix(c, hc, hz), 1.0);', `
        // 裾は野の霧へ、峰は空へ溶かす。手前の山は濃く、奥の山ほど淡くする。
        float crest = smoothstep(-5.0, 65.0 + layer * 25.0, vP.y);
        hc = mix(hc, okSky, night * crest * (0.25 + layer * 0.12));
        float nh = mix(0.68 + layer * 0.1, 0.96, 1.0 - smoothstep(-25.0, 22.0 + layer * 12.0, vP.y));
        hz = mix(hz, nh, night);
        gl_FragColor = vec4(mix(c, hc, hz), 1.0);`);
    mat.needsUpdate = true;
  }
  // 野と場外の地形の継ぎ目を、起伏のある土手と二列の林で覆う。道と川の中には置かない。
  const edge = W.half, segments = 48, trees = segments * 4 * 2;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 5), new THREE.MeshLambertMaterial({ color: 0x3c3025 }), trees);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(3.5, 9, 7), new THREE.MeshLambertMaterial({ color: 0x283b2b }), trees);
  const d = new THREE.Object3D(), pos = [], idx = [];
  let count = 0;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i <= segments; i++) {
      const t = -edge - 16 + (edge + 16) * 2 * i / segments;
      for (let row = 0; row < 3; row++) {
        const out = edge - 12 + row * 14;
        const x = side === 0 ? out : side === 1 ? -out : t;
        const z = side === 2 ? out : side === 3 ? -out : t;
        const river = x > 106 && x < 142 || z < -224 && z > -255;
        const h = Math.max(Math.abs(x), Math.abs(z)) > edge ? W.farH(x, z) : W.heightAt(x, z);
        const bank = river ? 0 : row === 1 ? 2.8 + Math.sin(t * 0.07 + side) * 1.2 : -0.5;
        pos.push(x, h + bank, z);
        if (i < segments && row < 2) {
          const k = side * (segments + 1) * 3 + i * 3 + row;
          idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4);
        }
        if (i === segments || row === 0 || river) continue;
        const scale = 0.75 + (Math.sin(i * 7 + side * 3 + row) + 1) * 0.22;
        d.rotation.set(0, i * 1.7, 0); d.scale.set(scale, scale, scale);
        d.position.set(x, h + bank + 2 * scale, z); d.updateMatrix(); trunks.setMatrixAt(count, d.matrix);
        d.position.y = h + bank + 7 * scale; d.updateMatrix(); crowns.setMatrixAt(count, d.matrix);
        count++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  W.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x494936, side: THREE.DoubleSide })));
  trunks.count = crowns.count = count;
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  W.scene.add(trunks, crowns);
}

// 雨雲は残すが、月の散乱光の下限を保つ。兵・塀・旗が低画質でも闇に沈まない。
function okNight(W) {
  const lookOf = W.lookOf;
  W.lookOf = function(key) {
    const L = lookOf.call(this, key);
    if (key === 'night') {
      L.sky.setHex(0x253048); L.fog.setHex(0x2a3446); L.top.setHex(0x0a1120);
      L.sunI = Math.max(0.65, L.sunI); L.hemiI = Math.max(1.05, L.hemiI);
      L.cover = 0.85; L.cloud = 0.9; L.vis = 100;
    }
    return L;
  };
  const prepareNight = W.prepareNight;
  W.prepareNight = function() {
    const k = prepareNight.call(this);
    if (this.timeKey === 'night') {
      this.nightFill.intensity = Math.max(this.nightFill.intensity, 1.3 * k);
      if (this.stars) this.stars.visible = false;
      if (this.moon) this.moon.visible = false;
      // 白く太い手前の筋は隠し、細い遠雨と足元の跳ねだけを闇に残す。
      this._okWetNight = true; this.rainNear.visible = false;
      this.rain.material.color.setHex(0x46505a); this.rain.material.opacity = 0.12 * this.rainLevel;
      this.splashPts.material.color.setHex(0x46505a); this.splashPts.material.opacity = 0.12 * this.rainLevel;
      return k;
    }
    if (this._okWetNight) {
      this._okWetNight = false;
      this.rain.material.color.setHex(0xc9d2d6); this.rain.material.opacity = 0.45 * this.rainLevel;
      this.splashPts.material.color.setHex(0xd8e0e4); this.splashPts.material.opacity = 0.5;
    }
    return k;
  };
  // この戦の既存の雨筋だけを短くする。粒や材質は増やさず、昼は元の雨に戻す。
  const update = W.update;
  W.update = function(dt, focus) {
    update.call(this, dt, focus);
    if (this.timeKey !== 'night') {
      if (this._okWetNight) {
        this._okWetNight = false;
        this.rain.material.color.setHex(0xc9d2d6);
        this.splashPts.material.color.setHex(0xd8e0e4); this.splashPts.material.opacity = 0.5;
      }
      return;
    }
    if (!this.rain.visible) return;
    this._okWetNight = true;
    this.rainNear.visible = false;
    this.rain.material.color.setHex(0x46505a); this.rain.material.opacity = 0.12 * this.rainLevel;
    this.splashPts.material.color.setHex(0x46505a); this.splashPts.material.opacity = 0.12 * this.rainLevel;
    const pos = this.rain.geometry.attributes.position;
    this.rain.material.linewidth = 1;
    const count = Math.floor(this.rain.geometry.drawRange.count / 2 * 0.45) * 2;
    this.rain.geometry.setDrawRange(0, count);
    const arr = pos.array, end = Math.min(arr.length, count * 3);
    for (let i = 0; i < end; i += 6) {
      arr[i + 3] = arr[i] + (arr[i + 3] - arr[i]) * 0.35;
      arr[i + 4] = arr[i + 1] + (arr[i + 4] - arr[i + 1]) * 0.35;
      arr[i + 5] = arr[i + 2] + (arr[i + 5] - arr[i + 2]) * 0.35;
    }
    pos.needsUpdate = true;
  };
}
// 木戸を開け直しても知らせは初めの一度だけ。扉と通れる幅は毎回そろえる。
function okGate(gate) {
  const open = gate._openNow;
  gate._openNow = function(byForce) {
    if (this.opened) return;
    if (this._okOpenWidth === undefined) {
      open.call(this, byForce); this._okOpenWidth = this._flowEntry.w;
    } else {
      this.opened = this.struct.opened = true; this._flowEntry.w = this._okOpenWidth;
      if (this.gateObj.open) this.gateObj.open();
    }
  };
}

// ---------------- 搦手の前・退き・陣の前の段 ----------------
const FRONT = { x: -8, z: GATE.z + 16 };
// 九十九折りの横は切岸。組も遊び手も、坂を直線で横切らず道の角を通る。
const KARAMETE_WAY = [...CAMP_ROAD, ...ROAD_KARAMETE.slice(2, 6), [MAE_C.x, MAE_C.z], [FRONT.x, FRONT.z]];
const SOUTH_JOIN = KARAMETE_WAY.indexOf(ROAD_KARAMETE[3]);
const SOUTH_FROM_CAMP = [...KARAMETE_WAY.slice(0, SOUTH_JOIN + 1), ...SOUTH_ROAD.slice(1)];
const SOUTH_FROM_FRONT = [...KARAMETE_WAY.slice(SOUTH_JOIN).reverse(), ...SOUTH_ROAD.slice(1)];
const RUNNER_FROM_CAMP = [...KARAMETE_WAY.slice(0, SOUTH_JOIN + 1), ...RUNNER_ROAD.slice(1)];
const RUNNER_FROM_FRONT = [...KARAMETE_WAY.slice(SOUTH_JOIN).reverse(), ...RUNNER_ROAD.slice(1)];
const WAY_FROM = { x: 0, z: 0, s: 0, d: 0 }, WAY_TO = { x: 0, z: 0, s: 0, d: 0 };
const WAY_SIDE_FROM = { x: 0, z: 0, s: 0, d: 0 }, WAY_SIDE_TO = { x: 0, z: 0, s: 0, d: 0 };
const WAY_TEST = { x: 0, z: 0 };
// 今いる坂の所から下る。下った組を攻め口へ引き戻さず、切岸を横切らない。
function downRoad(g, end) {
  const p = g.center(), q = { x: 0, z: 0, s: 0, d: 0 };
  karametePoint(p, q);
  return [[q.x, q.z], ...KARAMETE_WAY.slice(0, Math.floor(q.s) + 1).reverse(), end];
}
function karameteClear(army, u, a, b) {
  if (army.wallBetween(a, u.team, b, false)) return false;
  // 切り通しの縁を飛ばして調べると、道の角を横切る行き先を返してしまう。
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
  for (let i = 1; i <= n; i++) if (!army.world.walkable(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
  return true;
}
function karametePoint(p, out, army, u, way = KARAMETE_WAY) {
  out.d = Infinity;
  for (let i = 1; i < way.length; i++) {
    const a = way[i - 1], b = way[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d) continue;
    WAY_TEST.x = x; WAY_TEST.z = z;
    if (army && !karameteClear(army, u, p, WAY_TEST)) continue;
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
function karameteWay(army, u, want) {
  // 木戸の内や他方面の囲みには、この坂の道を当てはめない。
  const runner = u.group?.isRunner;
  const limit = runner ? 105 : 55;
  if (u.pos.z < GATE.z + 1 || want.z < GATE.z + 1 || Math.abs(u.pos.x) > limit || Math.abs(want.x) > limit) return want;
  // 道の中央へ寄せる途中で、一歩手前を「到着」と見なして止まらない。
  const q = u._okWay || (u._okWay = { x: 0, z: 0, t: -1, gx: 0, gz: 0, active: false, botRadius: 0.1 });
  if (q.t > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 1 &&
      (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.3; q.gx = want.x; q.gz = want.z; q.active = false;
  if (karameteClear(army, u, u.pos, want)) return want;
  // 枝道へ行く時も、枝道から戻る時も、坂との分かれ道を通る。
  karametePoint(u.pos, WAY_FROM); karametePoint(want, WAY_TO);
  const side = runner ? RUNNER_ROAD : SOUTH_ROAD;
  karametePoint(u.pos, WAY_SIDE_FROM, null, null, side);
  karametePoint(want, WAY_SIDE_TO, null, null, side);
  const fromSouth = WAY_SIDE_FROM.d + 0.5 < WAY_FROM.d, toSouth = WAY_SIDE_TO.d + 0.5 < WAY_TO.d;
  const campWay = runner ? RUNNER_FROM_CAMP : SOUTH_FROM_CAMP;
  const frontWay = runner ? RUNNER_FROM_FRONT : SOUTH_FROM_FRONT;
  const way = fromSouth && toSouth ? side : toSouth ? (WAY_FROM.s <= SOUTH_JOIN ? campWay : frontWay) :
    fromSouth ? (WAY_TO.s <= SOUTH_JOIN ? campWay : frontWay) : KARAMETE_WAY;
  karametePoint(u.pos, WAY_FROM, army, u, way); karametePoint(want, WAY_TO, null, null, way);
  if (WAY_FROM.d > 40 || WAY_TO.d > 40) return want;
  q.active = true;
  // 道幅の縁から次の角へ斜めに出ると、切岸に当たる。先に道の中央へ戻す。
  if (WAY_FROM.d > 0.8) { q.x = WAY_FROM.x; q.z = WAY_FROM.z; return q; }
  const forward = WAY_TO.s > WAY_FROM.s;
  let i = forward ? Math.floor(WAY_FROM.s) + 1 : Math.ceil(WAY_FROM.s) - 1;
  i = Math.max(0, Math.min(way.length - 1, i));
  // 角を手前から飛ばすと、馬が切岸へ斜めに入り、同じ角で止まり続ける。
  if (Math.hypot(way[i][0] - u.pos.x, way[i][1] - u.pos.z) < 0.3) i += forward ? 1 : -1;
  if (i < 0 || i >= way.length || (forward ? i > WAY_TO.s : i < WAY_TO.s)) {
    q.x = WAY_TO.x; q.z = WAY_TO.z;
    // 最後は道の上の印から相手へ寄る。印そのものを行き先にし続けない。
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 0.3) localPoint(army, u, q, want.x, want.z);
  } else { q.x = way[i][0]; q.z = way[i][1]; }
  if (!karameteClear(army, u, u.pos, q) && WAY_FROM.d > 0.2) { q.x = WAY_FROM.x; q.z = WAY_FROM.z; }
  return q;
}
const KB = (l) => dress(l, KITABATAKE);
function okCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'maru', armor: KIT.ARMOR.saito, dmg: 1, scale: 1, fixedSpawn: true,
    look: (list) => KB(cappedList(rt, list)), friends: () => [F.niwa, F.ikeda, F.inaba].filter((g) => g && g.count), routeFight: true, botSteer: wallStop };
}
// 近い控えは同じ場所の軽い兵から替える。任務の出撃組は足さず、死者も戻さない。
function okSpeaker(rt) {
  const u = rt.flags.niwaU, p = rt.player.u.pos;
  return (rt.G.lord || HI(rt)) && u && u.alive && !u.woundOut && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 12 ? '丹羽長秀' : '組頭';
}
function nearButaiTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.nearButaiAt || 0)) return;
  F.nearButaiAt = rt.t + 1;
  const p = rt.player.u.pos;
  let alive = 0;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') alive++;
  // 先に遠い兵を戻す。今の場所と向きを保存し、前の持ち場へ飛ばさない。
  for (const b of F.nearButai) {
    const g = b.real;
    if (!g) continue;
    if (g.routed || g.order === 'flee') { b._okBroken = true; b.light.rout(); continue; }
    for (const u of g.units) if (u.alive && !u.keep && !u.target && !u.fleeing && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 85 &&
      u.wkFrom && u.wkFrom.A === b.light && b.light.give(u.wkFrom.i, u.pos, u.heading)) {
      rt.army.despawn(u); alive--;
    }
    b._prevRealAlive = g.count;
  }
  F.nearButai.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
  for (const b of F.nearButai) {
    if (alive >= 235) break;
    if (b._okBroken || b.aliveNominal() <= 0 || !b.light.left(p.x, p.z, 24)) continue;
    const made = b.growReal(Math.min(6, 235 - alive)); alive += made;
    if (made && b.real) { b.real.formation = b.kind === 'bow' ? 'line' : 'yari'; b.real.width = Math.min(b.lightWidth || 14, 14); }
  }
}
// 新手を出す時だけ人数を数える。死体も数えない。
function cappedList(rt, list) {
  let room = 160; // 後で置く本陣・自分の組・近習の枠を七十五人分空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 二十四秒ごとに小勢を木戸から出す。兵を作るのは波の時だけ、全体で二百三十五人まで。
function okChaseWave(rt) {
  const F = rt.flags;
  if (rt.t < F.chaseAt) return;
  F.chaseAt = rt.t + 24;
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  if (room <= 0) return;
  const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手からの追っ手',
    anchor: { x: 0, z: -68 }, facing: 0, width: 3, colW: 2, spacing: 1.1,
    fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 6 },
  dress([{ type: 'ashigaru', n: Math.min(6, room) }], KITABATAKE));
  g._sortieSent = true; g.march = true; g.order = 'path'; g.speed = 2.8;
  g.path = [[0, -68], [0, -52], [MAE_C.x, MAE_C.z],
    ...KARAMETE_WAY.slice(0, -1).reverse(), [CAMP_LINE.x, CAMP_LINE.z - 10]];
  g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.width = 6; q.aggro = 18; q.seekRange = 28; };
  F.sorties.push(g); F.chasers.push(g);
  F.gates.karamete._openNow(false);
}
function wallStop(b, inp) {
  const p = b.player, u = p.u;
  if (inp.k.has('KeyW') && u.pos.z < GATE.z + 3 && Math.cos(p.yaw) < 0) inp.k.delete('KeyW');
}
function sendSortie(rt, g, to) {
  if (!g || gone(g)) return;
  rt.flags.gates.karamete._openNow(false);
  g._sortieSent = true; g._okReturning = false; g.calm = false; g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 10;
  g.path = to.z > -24 ? [[0, -68], [0, -52], [MAE_C.x, MAE_C.z],
    ...ROAD_KARAMETE.slice(3, 6).reverse(), SOUTH_ROAD[1], [to.x, to.z]] : [[0, -68], [0, -52], [to.x, to.z]];
  g.pathIdx = 0;
  for (const u of g.units) u.noTarget = false;
  g.onArrive = (q) => { q.order = 'attack'; q.anchor = to; q.formation = 'yari'; q.width = 8; q.aggro = 18; q.seekRange = 28; };
}
// 崩れた小勢を一人ずつ探させない。残兵は帰城させる。
function sortieBroken(g) {
  return gone(g) || g.count <= 2 || g.units.every((u) => !u.alive || u.fleeing || u.woundOut);
}
function returnSortie(g) {
  g._okReturning = true; g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 3;
  const p = g.center(), q = { x: 0, z: 0, s: 0, d: 0 };
  const way = p.x > 20 && p.z > -24 ? SOUTH_FROM_FRONT : KARAMETE_WAY;
  karametePoint(p, q, null, null, way);
  const road = way === SOUTH_FROM_FRONT ? way.slice(0, Math.floor(q.s) + 1).reverse() : way.slice(Math.ceil(q.s));
  g.path = p.z < GATE.z + 1 ? [[0, -68], [0, -87]] :
    [[q.x, q.z], ...road, [0, -52], [GATE.x, GATE.z], [0, -68], [0, -87]]; g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; q.aggro = 0; q.calm = true; for (const u of q.units) { u.target = null; u.noTarget = true; } };
}
function okHold(o) {
  return { kind: 'hold', max: Infinity,
    start(rt, C) {
      C.at = C.goal = o.at; C.botRadius = o.r; C.inT = 0; C.dangerT = 0; C.groups = o.groups;
      rt.banner(o.title, '旗の下で槍をそろえよ');
      rt.obj('dp', o.obj, 'main', true); rt.marker('dp', o.at, o.title, { h: 3 }); rt.zone('dp', o.at.x, o.at.z, o.r);
      for (let i = 0; i < 3; i++) {
        const g = [rt.flags.niwa, rt.flags.ikeda, rt.flags.inaba][i];
        if (gone(g)) continue;
        g.calm = false; g.order = 'move';
        // 柵の口は十二歩の幅。横に三手を並べず、道の後ろへ縦に並ぶ。
        g.dest = o.sortie ? { x: 34, z: 26 + i * 6 } : { x: o.at.x + (i - 1) * 10, z: o.at.z + 5 };
        if (o.sortie) { g.formation = 'column'; g.colW = 4; }
        g.facing = Math.PI;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.formation = 'yari'; if (o.sortie) q.width = 8; q.aggro = 12; };
      }
      if (o.sortie) {
        rt.after(14, () => {
          if (rt.over || rt.flags.ending || rt.flags.step !== 4) return;
          const g = o.groups[0];
          if (gone(g)) return;
          g.order = 'move'; g.dest = { x: 0, z: -68 }; g.formation = 'column';
          g.onArrive = (q) => { q.order = 'hold'; };
          if (sightPoint(rt, g.center())) rt.bark('木戸へ城兵の旗！　道を固めよ');
        });
        rt.after(22, () => {
          if (!rt.over && !rt.flags.ending && rt.flags.step === 4) {
            C.sortieReleased = true; sendSortie(rt, o.groups[0], o.at);
          }
        });
      }
    },
    tick(rt, C, m, ctx, el, dt) {
      const p = rt.player.u.pos, near = Math.hypot(p.x - o.at.x, p.z - o.at.z) <= o.r;
      let foes = 0, friends = 0, line = 0;
      rt.army.forNear(o.at.x, o.at.z, o.r, (u) => {
        if (!u.alive || u.isStruct || u.fleeing || u.woundOut || u.noTarget) return;
        if (u.team === 1) foes++; else { friends++;
          if (!u.isPlayer && u.group && !u.group.routed && (u.type === 'ashigaru' || u.type === 'samurai') && (u.group.order === 'hold' || u.group.order === 'attack' || u.group.order === 'move') && (o.sortie ? Math.abs(u.pos.x - 34) < 6 && u.pos.z > 20 && u.pos.z < 44 : Math.hypot(u.pos.x - o.at.x, u.pos.z - o.at.z) <= o.r)) line++;
        }
      });
      const held = near && foes <= friends && friends > 0 && line >= 3;
      if (held) C.inT += dt;
      const clear = o.groups.every(sortieBroken);
      if (o.sortie && foes > 0) C.engaged = true;
      const place = o.sortie ? '南の柵の口の列' : '坂の退き口の列';
      if (okLineDanger(rt, C, o.at, o.r, 'dp', dt, place)) return false;
      if (!C.dangerT) rt.objProgress('dp', !near ? '持ち場の旗へ戻れ' : line < 3 ? '道の口へ味方の槍を集めよ' : foes > friends ? '組を呼び、槍をそろえて城兵を止めよ' : C.inT >= o.dur && o.sortie && !clear ? '味方と残る城兵を押し返せ' : rt.flags.step === 2.5 ? gone(rt.flags.ram) || rt.flags.ram.order === 'hold' ? '坂の旗で城兵を止め、三手の退き口を守れ' : '坂の旗で竹束の組の退きを支えよ' : o.sortie ? '旗で城兵を止め、兵糧の道をふさげ' : '旗の下で味方と道を守れ');
      if (rt.flags.step === 2.5) {
        const F = rt.flags;
        const returned = [F.ram, F.taki].every((g) => {
          if (gone(g)) return true;
          let alive = 0, near = 0;
          for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) {
            alive++; if (Math.hypot(u.pos.x - CAMP.x, u.pos.z - (CAMP.z - 16)) < 24) near++;
          }
          return alive === 0 || near >= Math.ceil(alive * 0.6);
        });
        // 帰陣の道で組が遅れても、同じ札で待たせ続けない。二分で全隊に退きの下知を出す。
        C.returned = returned;
        if (!C.dangerT) {
          const left = Math.max(0, Math.ceil(o.limit - el));
          const order = !near ? '坂の旗へ戻れ' : line < 3 ? '味方の槍を集めよ' : foes > friends ? '城兵を押し返せ' : '退き口を守れ';
          rt.objProgress('dp', `退きの下知まであと${left}秒。${order}`);
        }
        return el >= o.limit || (held && C.inT >= o.dur && returned);
      }
      // 実際に城兵を止め、列を固めたら封鎖完了。新手が来ていない間は早送りしない。
      return held && clear && (!o.sortie || C.sortieReleased) && C.inT >= (o.sortie && C.engaged ? 35 : o.dur);
    },
    end(rt, C) {
      rt.objDone('dp'); rt.unmark('dp'); rt.unzone('dp');
      if (rt.flags.step === 2.5) rt.say('組頭', C.returned ? '竹束と滝川殿の組は陣へ抜けたぞ。われらも退くぞ！' : '先の組は坂を下っておる。われらも槍を返し、南の陣へ退くぞ！', 4);
      if (o.sortie) {
        rt.flags.blockHeld = true;
        for (const g of o.groups) if (!gone(g)) returnSortie(g);
      }
      rt.award((t) => t.side.push(o.reward), o.reward);
    },
  };
}

// 両軍の総勢（織田 七万余り、大河内城の北畠勢 八千ほど。数には諸説ある）
okawachi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 70000 - (F.ak || 0)), a0: 70000, b: Math.max(0, 8000 - (F.ek || 0)), b0: 8000 };
};
okawachi.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '北畠軍', mon: 'maru' } };
okawachi.date = (rt) => { const d = rt.flags.day || 1; return rt.flags.ending && !rt.flags.failed ? '永禄十二年十月四日　城を渡す' : d === 12 ? '永禄十二年九月八日　秋・雨・夜' : d === 13 ? '永禄十二年九月九日　兵糧攻め' : `永禄十二年　秋・囲み${d}日目`; };
okawachi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : '');
okawachi.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) okawachi.nightDay(rt); };
okawachi.history = '永禄十二年（1569）、信長は大河内城を四方から囲み、東の山に本陣を置いた。『信長公記』巻二は、九月八日の夜、丹羽長秀・池田恒興・稲葉良通が西搦手から三手に分かれて攻め、雨で鉄砲が使えず、多くの者が討たれたと記す。翌九日には滝川一益に多芸谷の焼き払いを命じ、兵糧を断った。十月四日、北畠具教・具房は城を渡して退いた。茶筅丸（のちの信雄）へ家督を譲る約束での和睦であり、城への総攻めで終わった戦ではない。松阪市の説明では、北大手・南搦手で、五十日ほどの籠城とする。ここでは南搦手へ西寄りから進む形に縮め、木戸からの小勢の出撃・退路保持・封鎖の局地戦を遊びとして補った。織田七万・北畠八千ともいうが、信長公記のこの条には総勢の数はなく、表示は参考値である。';
okawachi.lordAt = { ...HONJIN, r: 12, why: '信長公記に記される、城の東の山の本陣' };
okawachi.lordSpawn = { x: HONJIN.x, z: HONJIN.z + 8, heading: -Math.PI / 2 };
okawachi.noWake = true;
okawachi.rts = true;

// 軍議（gungi.js）：搦手の夜攻め（既定・史実）か、大手で引きつけてから搦手へ回るか
okawachi.gungi = (rt) => {
  if (!rt.G.lord) return null;
  const F = rt.flags;
  const G = {
    center: { x: 0, z: GATE.z + 30 }, dist: 140,
    landmarks: [
      { name: '搦手の木戸', x: GATE.x, z: GATE.z }, { name: '搦手の前', x: MAE_C.x, z: MAE_C.z },
      { name: '搦手口の曲輪', x: JO_C.x, z: JO_C.z }, { name: '大手（北）', x: OTE_GATE.x, z: OTE_GATE.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
    ],
    lines: [{ name: '搦手口の曲輪', owner: '敵' }],
    units: [{ id: 'main', name: '丹羽長秀の手', group: () => F.niwa }],
    routes: [
      { id: 'karamete', name: '南の搦手から、まっすぐ夜攻め' },
      { id: 'ote_lure', name: '北の大手で引きつけ、搦手へ寄せる（遊びの補い）' },
    ],
    default: { main: 'karamete' },
    enemy: [
      { name: '塀の内の北畠勢', known: false },
    ],
    cinema: { attackers: { x: 0, z: 40 }, gate: { x: GATE.x, z: GATE.z }, defenders: { x: JO_C.x, z: JO_C.z } },
    onStart: (assign) => okawachi.onGungiStart(rt, assign),
  };
  if (window.__okawachiStrategy) { okawachi.onGungiStart(rt, { main: window.__okawachiStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
okawachi.onGungiStart = (rt, assign) => { rt.flags.strategy = rt.G.lord ? (assign.main || 'karamete') : 'karamete'; };

// 素直な遊び手：木戸の組を守り、打って出た城兵と戦い、陣まで退く。その後は城外の道を封鎖する
okawachi.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    if (e3 && u.hp > u.maxHp * 0.6) {
      const d = Math.hypot(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z);
      const reach = p.weapon === 'sword' ? 1.9 : 2.8;
      p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z);
      if (d > reach * 0.85) goTo(p, inp, e3.pos.x, e3.pos.z, reach * 0.85);
      patientStrike(p, inp, e3, d);
      return;
    }
    goTo(p, inp, CAMP.x, CAMP.z - 6, 3);
    return;
  }
  // 深手の退避と手当ては共通の頭に任せる。傷は自然に戻らず、全快待ちは戦へ戻れない。
  // 打って出た後も、木戸の内の弓や別の曲輪の兵を追わない。
  // 坂の上と下では高さが違う。歩いて寄る相手まで高さで除くと、
  // 城兵が坂へ出ても見つけられず、木戸の前で待ち続けてしまう。
  const close = strikeTarget(b, 3);
  const e = (close && close.pos.z > GATE.z + 0.8 ? close : null) || b.army.nearestEnemy(u, 22, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
    !o.isStruct && !b.army.wallBetween(u.pos, -1, o.pos) &&
    o.pos.z > GATE.z + 0.8 && Math.hypot(o.pos.x - FRONT.x, o.pos.z - FRONT.z) <= 18);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    if (Math.abs(e.pos.y - u.pos.y) < 3) patientStrike(p, inp, e, d);
    else { inp.guardHold = false; inp.leftPressed = false; }
    return;
  }
  inp.guardHold = false;
  // 下知の持ち場は木戸より下の坂。出撃前の隊の中心は城内なので追わない。
  if (F.step === 1 || F.step === 2) goTo(p, inp, FRONT.x, FRONT.z, 2);
};

export { okawachi };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -164, tx: 0, tz: -28, w: 82, R: 80, rise: 50 };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [ROAD_KARAMETE, ROAD_OTE, RUNNER_ROAD, CAMP_ROAD]);
  return BENCHED(x, z);
}
