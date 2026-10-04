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
import { nobori, hut, campfire, tawara } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, rest, hold, depthBot } from './b_depth.js';
import { uS, uA, uB, gunLine } from './b_mid.js';
import { yamaLift, benchRoads } from './yamalift.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeTabaAdvance, tickTabas, tabaInteractTick, patchGunCover } from './taketaba.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { battleEvent, EVENT_RETREAT, EVENT_MESSENGER, EVENT_FIRE_START } from './battle_events.js';
import {
  OKAWACHI_PLAN, OKAWACHI_HIST, GATE, OTE_GATE, MAE_C, JO_C, OTE_HINT, ROAD_KARAMETE, ROAD_OTE,
  HON_C, NISHI_C, NI_C, ONANDO_C, BABA_C, OTE_C,
} from './castles/okawachi.js';

// 上の身分（足軽大将候補より上）：丹羽の手の一手を預かり、退きでは殿を務める
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const CAMP = { x: 4, z: 70 };
const HONJIN = { x: 96, z: -12 }; // 信長公記：信長の本陣は東の山。南の帰陣先とは別。
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
const SIEGE = {
  north: { x: OTE_HINT.x, z: OTE_HINT.z },   // 大手攻め（矢津川の手前）
  east: { x: 100, z: -96 },                  // 阪内川と道の見張り
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
    ['okSouth', '南の封鎖と仕寄り', '丹羽長秀・池田恒興・稲葉一鉄', 15000, SIEGE.south.x, SIEGE.south.z, 'siege.south', 'oda', 'oda', Math.PI],
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
  jinkei: OKAWACHI_JIN,
  // 和睦まで定義が進める。具教を共通処理の討ち取り勝ちに替えない。
  taisho: { b: { def: true } },
  noWake: true, // 閉じた城の守備と囲みは、その場の軽い兵。出撃は下の段で本物を出す。
  botOrders: true, // 閉じた木戸の外の守り・退き口を、性格の突進で上書きしない。
  spawn: { x: -12, z: 50, heading: Math.PI },
  world: {
    seed: 15699,
    wind: [-0.4, 0.9],
    time: 'night',   // 夜攻め・雨の闇（A065）
    nightLift: 1.3,
    muddy: 1,
    terrainTags: true,
    paths: [ROAD_KARAMETE, ROAD_OTE],
    height,
    // 阪内川（東）・矢津川（北）
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [
      { pts: [[122, -300], [116, -180], [126, -60], [120, 40], [128, 180]], w: 10, depth: 1.4 },
      { pts: [[-240, -240], [-120, -244], [0, -238], [80, -242], [120, -236]], w: 7, depth: 1.2 },
    ],
    clear: (x, z) => (Math.abs(x) < 82 && z > -170 && z < 100) || (Math.abs(x) < 26 && z > -232),
    trees: 480,
    tufts: 3200,
    treeDensity: (x, z) => (Math.abs(x) < 82 && z > -170 && z < 100 ? 0.12 : 1),
    groves: [{ x: -50, z: 0, r: 12, n: 16 }, { x: 50, z: 20, r: 12, n: 16 }, { x: -96, z: -112, r: 16, n: 22 }, { x: -64, z: -46, r: 14, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -82,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true; F.day = 1;
    W.setRainTarget(0.9);
    // 雨の闇の篝火と、城の丘に高く立つ北畠の幟（遠くからも城の位置が見える。A064・A065）
    for (const [x, z] of [[-8, 40], [10, 30], [-14, 12], [14, 2]]) W.addFire(x, z, { torch: true, h: 1.5 });
    for (const [x, z] of [[OTE_C.x - 14, OTE_C.z + 10], [OTE_C.x + 14, OTE_C.z + 10], [HON_C.x - 12, HON_C.z + 6], [HON_C.x + 12, HON_C.z + 6], [HON_C.x, HON_C.z + 12]]) rt.scene.add(nobori(W, x, z, 'maru', 12));
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...OKAWACHI_HIST, honjinOda: 'HIST_B', honjinKitabatake: 'HIST_B', kitabatakeAI: 'GAME_C' };
    resetGates();

    // ---- 縄張り（castles/okawachi.js）：北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場。木戸は castle_plan.js に建てさせる ----
    // 夜攻めで城は落ちない。木戸は保ち、戦う場は城外の坂に限る。
    const C = F.C = buildCastlePlan(rt, OKAWACHI_PLAN, { ladders: false, baseHeight: baseWithHori, edgeW: 2.4, buildGates: true, buildTowers: true, team: 1 });
    const maeC = C.kuruwa.mae.centroid, joC = C.kuruwa.jo.centroid;
    F.gates = { karamete: makeGate(rt, C.gateObjs.karamete, { name: GATE.name, guardTeam: 1 }) };
    for (const gate of Object.values(C.gateObjs)) { gate.struct.armor = 1; gate.struct.noTarget = true; }
    // 曲輪の中の木造の建物（板葺き。大きな石垣・天守は無い）。本丸の館に北畠具教
    const roofs = { h: 3.2, wall: 0x6a5a44, roof: 0x3a3430 };
    for (const [x, z, w, d, r] of [[-8, joC.z - 4, 8, 5, 0.1], [10, joC.z + 2, 6, 4, -0.2],
      [NISHI_C.x - 4, NISHI_C.z - 6, 9, 5, 0], [NI_C.x + 4, NI_C.z - 8, 10, 6, 0.1], [NI_C.x - 6, NI_C.z + 8, 7, 5, -0.1],
      [ONANDO_C.x - 6, ONANDO_C.z, 9, 6, 0], [ONANDO_C.x + 7, ONANDO_C.z + 2, 7, 5, 0.1], [BABA_C.x + 16, BABA_C.z - 10, 8, 5, 0.2],
      [OTE_C.x - 6, OTE_C.z - 4, 7, 5, 0]]) rt.scene.add(hut(W, x, z, w, d, r, roofs));
    // 館は縄張り（castles/okawachi.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に具教（kaito 10/2）
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [HON_C.x - 10, HON_C.z + 8], [HON_C.x + 10, HON_C.z + 8], [OTE_C.x - 6, OTE_C.z + 6], [OTE_C.x + 6, OTE_C.z + 6], [NI_C.x, NI_C.z + 12], [NISHI_C.x + 6, NISHI_C.z + 10]]) rt.scene.add(nobori(W, x, z, 'maru', 6));

    // ---- 守り（北畠勢。曲輪ごとの部隊。搦手口だけ本物の兵、ほかは軽い作りで数だけ） ----
    // 搦手口の塀の内から、本物の弓12人がいっぺんに射かけてくる（155秒で潰れる件。kaito 10/1）。同時に射る数を減らす
    F.gateDef = makeButai(rt, { name: '塀の内の北畠勢', team: 1, faction: 'saito', kind: 'bow', nominal: 8, nearReal: 8, maxReal: 8, armor: 0x3a2a44, flag: KITABATAKE.flag, at: { x: joC.x, z: GATE.z - 3 }, facing: 0, real: 8 });
    F.gateDef.order({ id: 'hold' });
    // 三百人のうち、射る八人は塀ぎわ、残りは曲輪の奥。戦う兵と同じ位置に控えを重ねない。
    F.gateReserve = W.addDistantArmy({ x: joC.x, z: joC.z - 6, w: 28, d: 8, count: 292, facing: 0, armor: 0x3a2a44, flag: KITABATAKE.flag, team: 1, kind: 'bow', host: false, seed: 15699 });
    F.gateReserve.army.noWake = true; F.gateReserve.army.keepNear = true;
    // 雨の闇の中の矢：弓は射てるが、ねらいは鈍る（siege_vis.js の夜の当たり）
    // （掛けるのは update。部隊の本物の組は作り直されるため）
    const KB_B = { team: 1, faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, real: 0, maxReal: 0 };
    F.kb = {
      ote: makeButai(rt, { ...KB_B, name: '大手の北畠勢', kind: 'ashigaru', nominal: 220, at: POST.ote, facing: Math.PI }),          // 北の大手へ向く
      hon: makeButai(rt, { ...KB_B, name: '本丸の旗本', kind: 'ashigaru', nominal: 130, at: POST.hon, facing: 0 }),
      nishi: makeButai(rt, { ...KB_B, name: '西ノ丸の守り', kind: 'bow', nominal: 80, at: POST.nishi, facing: -Math.PI / 2 }),   // 谷が守るので少数
      ni: makeButai(rt, { ...KB_B, name: '二ノ丸の守り', kind: 'ashigaru', nominal: 160, at: POST.ni, facing: Math.PI / 2 }),
      onando: makeButai(rt, { ...KB_B, name: '御納戸の番', kind: 'ashigaru', nominal: 40, at: POST.onando, facing: Math.PI / 2 }),
      res: makeButai(rt, { ...KB_B, name: '馬場の予備', kind: 'ashigaru', nominal: 150, at: POST.baba, facing: Math.PI }),
    };
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    F.kbResAt = 'baba';
    // 総大将・北畠具教は本丸の館の中（天守の無い城）。旗本が縁側の上がり口を守り、踏み込むまで討てない
    F.keep = makeLordKeep(rt, {
      name: '北畠具教', spot: { x: HON_C.x, z: HON_C.z - 7 }, mouth: { x: HON_C.x, z: HON_C.z - 1 }, facing: Math.PI, guardN: 6,
      faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, hat: 'kabuto_m', haori: 0x3a2a44,
    });
    if (F.keep.lord) F.keep.lord.noTarget = true;
    F.commander = { alive: true, get real() { return F.keep && F.keep.lord && F.keep.lord.alive ? F.keep.lord : null; } };

    // ---- 丹羽長秀の手（自分の持ち場）、池田・稲葉・滝川の手、竹束を進める組 ----
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 0, z: 40 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.ikeda = allyGroup(rt, { name: '池田恒興の手', anchor: { x: -26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '池田恒興', invuln: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.inaba = allyGroup(rt, { name: '稲葉良通の手', anchor: { x: 26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉良通', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { flag: 'inaba' }));
    F.ram = allyGroup(rt, { name: '竹束を進める組', anchor: { x: 12, z: 54 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: -12, z: 48 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_f', haori: 0x2a2a32 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.niwa, F.ikeda, F.inaba, F.ram, F.taki];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.75; }
    // 雨の夜は射撃を止める。昼の封鎖へ移ったら解く。
    for (const g of [F.niwa, F.taki]) g.holdFire = true;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 50 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：丹羽・池田・稲葉の手は竹束を押し立て、雨の闇をゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    const gateHalf = () => F.step >= 2 || F.gates.karamete.struct.hp < F.gates.karamete.struct.maxHp * 0.5;
    F.TA = makeTabaAdvance(rt, {
      near: 40,
      items: [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]].map(([g, x]) => ({ g, yose: { x, z: GATE.z + 16 }, until: gateHalf })),
      avoid: [this.spawn, { x: 10, z: 50 }],
    });
    // ---- 織田の本陣（南。信長）と、城外の四方の囲みの陣（軽い作り。一つのキャンプに集めない） ----
    F.jinOdaCamp = camp(rt, { x: HONJIN.x, z: HONJIN.z, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', armor: 0x2b3140,
      general: { name: '織田信長', hat: 'kabuto_w', haori: 0x8a1a14 }, guard: 15, reserve: 200, runTo: { x: 0, z: 44 } });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 5));
    const OB = { team: 0, faction: 'oda', armor: 0x2b3140, real: 0, maxReal: 0 };
    F.siege = {
      north: makeButai(rt, { ...OB, name: '北の囲み（坂井政尚・蜂屋頼隆）', kind: 'ashigaru', nominal: 260, at: SIEGE.north, facing: 0, flag: 'oda' }),
      east: makeButai(rt, { ...OB, name: '東の囲み（柴田勝家・森可成）', kind: 'ashigaru', nominal: 150, at: SIEGE.east, facing: -Math.PI / 2, flag: 'eiraku' }),
      west: makeButai(rt, { ...OB, name: '西の囲み（木下藤吉郎・佐久間信盛）', kind: 'bow', nominal: 110, at: SIEGE.west, facing: Math.PI / 2, flag: 'oda' }),
      south: makeButai(rt, { ...OB, name: '搦手の封鎖（丹羽・池田・稲葉）', kind: 'ashigaru', nominal: 200, at: SIEGE.south, facing: Math.PI, flag: 'oda' }),
    };
    F.siegeList = Object.values(F.siege); F.kbList = Object.values(F.kb);
    for (const b of F.siegeList) { b.order({ id: 'hold' }); b._to = null; b.light.army.team = 0; }
    for (const b of F.kbList) { b.light.army.team = 1; b.light.army.noWake = true; b.light.army.keepNear = true; }
    F.gateDef.light.army.team = 1;
    F.gateDef.light.army.noWake = true; F.gateDef.light.army.keepNear = true;
    for (const s of Object.values(SIEGE)) {
      rt.scene.add(nobori(W, s.x - 6, s.z + 6, 'oda', 6), nobori(W, s.x + 6, s.z + 6, 'eiraku', 6));
      rt.scene.add(campfire(W, s.x, s.z + 12)); W.addFire(s.x, s.z + 12);
    }
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 6, 'oda'], [CAMP.x + 8, CAMP.z + 6, 'eiraku'], [-30, 36, 'oda'], [30, 36, 'inaba']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[-16, 62], [20, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    // ---- 区域の網：城外の坂と、閉じた木戸の内側 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'mae', name: '搦手の前', test: C.kuruwa.mae.test, pos: maeC, need: 6, hold: 10, next: 'jo' },
        { id: 'jo', name: '搦手口の曲輪', test: C.kuruwa.jo.test, pos: joC, need: 10, hold: 16, gate: GATE.name },
      ],
      links: [['mae', 'jo']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 140,
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [16, 30],
      winWhen: [], // 城外の保持を落城や夜攻め成功にはしない。
    });
    F.DA = makeDefenseAI(rt, {
      posts: [{ id: 'jo', butai: F.gateDef, at: joC, fallback: { x: joC.x, z: joC.z - 12 } }],
      reserves: [],
      fallback: { x: joC.x, z: joC.z - 12 },
    });

    // ---- 包囲の一日目 → 囲みの紹介→ 十二日目の夜（自分の戦） ----
    rt.setPhase('brief');
    rt.obj('main', '丹羽長秀のもとで、搦手の夜攻めの下知を待て', 'main');
    rt.banner('包囲　一日目', '織田勢が、大河内城を四方から囲む');
    rt.say('丹羽長秀', `${nm(rt)}、見よ。北が大手、わしらの南が搦手じゃ。城は谷と堀切に守られておる`, 5);
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 2.2 }; });
    rt.marker('mkHon', HON_C, '本丸（北畠具教）', { h: 8 });
    rt.after(7, () => { rt.unmark('mkHon'); this.oteDay(rt); });
    rt.after(21, () => this.nightDay(rt));
    buildBattleJin(rt);
  },

  // 囲みの紹介。日付の分からない大手攻めを作らず、四方の封鎖を見せる。
  oteDay(rt) {
    const F = rt.flags;
    if (F.day >= 7) return;
    F.day = 7;
    rt.banner('囲みを固める', '北は大手。東は川。西と南は深い谷');
    rt.say('丹羽長秀', '四方の道を柵でふさぐ。城へ荷を入れるな。夜攻めの下知を待て', 5);
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: OTE_C.x, z: OTE_C.z, t: 2 }; });
  },
  // 十二日目（九月八日）の夜：雨の搦手の夜攻めへ
  nightDay(rt) {
    const F = rt.flags;
    if (F.day >= 12) return;
    F.day = 12;
    rt.banner('包囲　十二日目', '九月八日の夜。雨の中、搦手へ夜攻め');
    rt.say('丹羽長秀', '池田殿・稲葉殿と三手に分かれる。西寄りから搦手へ寄せよ。雨で鉄砲は使えぬ', 4.5);
    rt.after(5, () => rt.say('丹羽長秀', '竹束の後ろから槍で寄せよ。谷へ踏み外すな', 4));
    rt.marker('niwa', F.niwaU.pos, '丹羽長秀', {});
    rt.after(10, () => this.assault(rt));
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
    const say = (t) => { if (rt.t > (F.kbSayT || 0)) { F.kbSayT = rt.t + 8; rt.bark(t); } };
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
        if (d.aliveNominal() > 0 && Math.hypot(a._to.x - dp.x, a._to.z - dp.z) < 46) lightClash(a, d, dt, 0.12);
      }
    }
  },

  // ① 搦手の木戸へ（軍議で選んだ道。無ければ搦手へ真っ直ぐ）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('niwa');
    sfx('horagai', 0.8);
    const lure = F.strategy === 'ote_lure';
    const go = () => {
      rt.banner('夜攻め', '雨の闇の中を、南の搦手の木戸へ');
      rt.obj('main', HI(rt) ? '丹羽の手の一手を預かり、竹束を進める組を守り、搦手の木戸へ寄せよ' : '竹束を進める組を守り、搦手の木戸へ寄せよ', 'main');
      const R = F.ram;
      R.order = 'move'; R.dest = { x: -4, z: GATE.z + 12 }; R.formation = 'column'; R.aggro = 2; R.assault = null; R.onArrive = (q) => { q.order = 'hold'; };
      for (const [g, x] of [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]]) { g.order = 'move'; g.dest = { x, z: GATE.z + 16 }; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
      rt.marker('gate', FRONT, '搦手の坂・竹束を守れ', { h: 4 });
      rt.after(24, () => { if (F.step === 1) rt.say('丹羽長秀', '左右には池田殿・稲葉殿の手がおる。竹束から離れるな。城の弓を受けるぞ', 4); });
      rt.after(8, () => rt.say('足軽', '……鉄砲が、撃てぬ！　火が消える！', 3));
    };
    if (lure) {
      rt.say('丹羽長秀', 'まず大手へ坂井殿の手を寄せ、城方の目を北へ引く。それから搦手じゃ', 4);
      this.siegeMove(rt, 'north', NEAR.ote);
      rt.after(14, () => this.siegeMove(rt, 'north', SIEGE.north));
      // 大手に気を取られ、搦手の守りが薄くなる（夜目も利かぬ雨なので、なおさら気付くのが遅れる）
      F.gateDef.morale = Math.max(40, F.gateDef.morale - 14 * nightAccuracyMult(rt.world));
      rt.after(8, () => { rt.say('丹羽長秀', '今じゃ！　搦手へかかれ！', 3); go(); });
    } else go();
  },

  // ② 城兵の打って出
  pushback(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('push');
    rt.unmark('gate');
    F.ram.assault = null; F.ram.order = 'hold';
    sfx('taiko', 1);
    rt.banner('夜攻めが止まる', '雨で鉄砲が使えず、城の守りが押し返す');
    rt.obj('main', '打って出た北畠の城兵を受け止めよ', 'main');
    rt.say('丹羽長秀', '城の守りは崩れぬ！　木戸へ入るな。坂の上で槍を揃えよ！', 3.5);
    // 木戸は閉じたまま。城外の守りが斜面を下って押し返す。
    F.push = [];
    // 門の口は狭く、両手が一度に湧くと（本物38人ほど）一人で立つ丹羽勢の前へ出た者が潰れる（155秒・大河内。kaito 10/1）
    // 新手は少し遅らせて出す（寄せに段をつけ、一度に受ける数を減らす）。狙う先も遠くまで追わせない（間近の盾＝丹羽・池田・稲葉の手へ向かいやすく）
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: GATE.z + 5 }, facing: 0, order: 'attack', seekRange: 50, aggro: 10, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, dress(cappedList(rt, list), KITABATAKE));
      F.push.push(g);
      rt.marker('p' + F.push.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: GATE.z }, 1.6);
    };
    mk(-12, '斜面を下る北畠勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }]);
    rt.after(4, () => mk(8, '北畠の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.4) }]));
    // 控えは本丸に残す。坂を下る小勢の後ろへ軽い大軍を付けると、斬り合う場所まで入り込む。
    const reserve = rt.world.addDistantArmy({ x: HON_C.x, z: HON_C.z + 7, w: 24, d: 6, count: 90, facing: 0, flag: 'maru', armor: KIT.ARMOR.saito, team: 1, host: false, seed: 71 });
    reserve.army.noWake = true; reserve.army.keepNear = true;
  },

  // 攻めを止めて退路を保つ。任務は常に一つ。
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    for (const q of F.push || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    F.pushDone = true;
    rt.obj('main', '組を集め、坂の退路を保つ下知を待て', 'main');
    depthStart(rt, okCtx(rt), okA(), () => this.retreat(rt));
  },

  // ③ 退く（搦手の前を保ちきれなかった時の、史実どおりの筋）
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending) return;
    rt.objRemove('dp');
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    if (!F.pushDone) rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    sfx('horagai', 0.6);
    rt.banner('退きの下知', '夜攻めは破れた。陣まで退く');
    rt.say('丹羽長秀', '今夜はここまでじゃ。組をまとめ、陣へ退け！', 4);
    rt.obj('main', HI(rt) ? '殿を務め、追ってくる城兵を防ぎながら陣まで退け' : '追ってくる城兵を防ぎながら、陣まで退け', 'main');
    if (HI(rt)) rt.after(1.5, () => rt.say('丹羽長秀', `${nm(rt)}、しんがりを頼む。皆が退いたら、その方も陣へ戻れ`, 4));
    rt.marker('camp', CAMP, '陣', { h: 2 });
    rt.zone('camp', CAMP.x, CAMP.z - 6, 8);
    for (const g of [F.niwa, F.ikeda, F.inaba, F.ram]) { g.order = 'move'; g.dest = { x: g.anchor.x * 0.5, z: CAMP.z - 16 }; g.speed = 2.6; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.chaser = enemyGroup(rt, { faction: 'saito', name: '追ってくる城兵', anchor: { x: -6, z: GATE.z + 20 }, facing: 0, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress(cappedList(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 + more(rt, 0.3) }]), KITABATAKE));
    rt.marker('ch', centerOf(F.chaser), () => `追ってくる城兵・${moraleWord(F.chaser.morale)}`, { red: true, group: F.chaser });
    for (const g of F.oda) { g.noRout = false; g.morale = Math.min(g.morale, 48); }
    battleEvent(rt, EVENT_RETREAT, FRONT, F.niwa, 0, true, '夜攻めをやめ、南の陣へ退く');
    rt.after(5, () => rt.say('丹羽長秀', '陣の旗を目当てに下れ。谷へ入るな。追っ手を槍で止めながら退け', 4));
  },

  // 九月九日以後の兵糧攻め。城外の焼き払いは遠景、封鎖の局地戦は遊びの補い。
  siegeDays(rt) {
    const F = rt.flags;
    if (F.step >= 4 || F.ending) return;
    F.step = 4; F.stepT = rt.t; F.day = 13;
    for (const g of F.oda) g.holdFire = false;
    rt.setPhase('siege');
    rt.unmark('camp'); rt.unzone('camp'); rt.unmark('ch');
    for (const q of F.push || []) { q.noRout = false; q.morale = 0; }
    if (F.chaser) { F.chaser.noRout = false; F.chaser.morale = 0; }
    rt.award((t) => t.side.push('追っ手を防ぎながら陣まで退いた'), '陣まで退いた');
    rt.objRemove('main');
    rt.world.setTime('day'); rt.world.setRainTarget(0.15);
    rt.banner('力攻めから、兵糧攻めへ', '九月九日。四方の道をふさぎ、囲みを保つ');
    rt.say('丹羽長秀', '城へ登るな。南の道をふさげ。城へ入る荷も、城から出る兵も通すな', 5);
    rt.after(8, () => {
      if (F.ending) return;
      // 信長公記の多芸谷の焼き払い。位置は遠景の推定で、城の蔵は燃やさない。
      rt.world.addFire(-160, -190);
      rt.world.addSmokeColumn(-160, rt.world.heightAt(-160, -190) + 2, -190, { size: 3 });
      battleEvent(rt, EVENT_FIRE_START, { x: -160, z: -190 }, null, 0, true, '城外に火の手。兵糧を運ぶ道が断たれる');
    });
    depthStart(rt, okCtx(rt), [hold({ at: SOUTH_BLOCK, dur: 75, r: 18,
      title: '南の道を封鎖', sub: '城は攻め落とさず、囲みを保つ', label: '南の封鎖の陣',
      obj: '南の旗のそばで、城から下る兵を通すな',
      waves: [
        { t: 22, say: ['物見', '搦手の坂に城兵！　道を空けるな！'], foes: () => [{ name: '封鎖へ寄せる城兵', from: NEAR.kara, list: [uS(1), uA(10)], mass: 0 }] },
        { t: 48, foes: () => [{ name: '坂を下る城兵の新手', from: NEAR.kara, list: [uS(1), uA(8)], mass: 0 }] },
      ], reward: '南の道をふさいだ',
    })], () => this.peace(rt));
    rt.after(30, () => {
      F.day = 25;
      for (const b of Object.values(F.kb)) b.morale = Math.max(35, b.morale - 15);
      rt.say('伝令', '囲みは続いております。城へ兵糧は入っておりません', 4);
      battleEvent(rt, EVENT_MESSENGER, SOUTH_BLOCK, null, 0, false, '使番が囲みの様子を伝える');
    });
    rt.after(62, () => { F.day = 40; rt.say('丹羽長秀', '城の旗はまだ立っておる。道を保て。和睦の話が進んでおる', 4); });
  },

  // 和睦（docs 57）：本丸で北畠を討って終わり、にしない。長い囲み＋圧力＋双方の損＋出来事 → 和睦
  peace(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.day = 50;
    rt.setPhase('end');
    for (const k in F.siege) this.siegeMove(rt, k, SIEGE[k]);
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    rt.objDone('dp');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '五十日の囲みを保ち、北畠を和睦に持ち込んだ', pts: 18 }; }, '任務達成・和睦');
    rt.banner('十月四日　和睦', '北畠は茶筅丸を養子に迎え、城を開く。討ち取りでなく、和睦で終わる');
    // 搦手の木戸から、北畠の使いが信長の東の本陣へ下る
    const env = enemyGroup(rt, { faction: 'saito', name: '北畠の使い', anchor: { x: 0, z: GATE.z + 5 }, facing: 0, order: 'move', aggro: 0, width: 3, morale: 100, noRout: true, dmgMult: 0 },
      dress(cappedList(rt, [{ type: 'samurai', n: 1, o: { name: '北畠の使い' } }, { type: 'ashigaru', n: 2 }]), KITABATAKE));
    for (const u of env.units) { u.noTarget = true; u.dmg = 0; }
    env.dest = HONJIN; env.speed = 2;
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: 0, z: GATE.z, t: 2.5 }; });
    sfx('horagai', 0.4);
    rt.say('丹羽長秀', `……城は落ちなんだが、北畠は膝を折った。よう囲みを保った、${nm(rt)}`, 4.5);
    rt.after(5, () => rt.say('', '――十月、信長は次男の茶筅丸（のちの信雄）を北畠の養子とすることで和を結び、伊勢を手に入れた', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
    butaiTick(rt, dt);
    if (F.keep) F.keep.tick();
    // 雨の闇の矢（部隊の本物の組は討たれ尽くすと作り直されるので、新しい組にも掛け直す）
    { const g = F.gateDef && F.gateDef.real; if (g && !g._rain) { g._rain = true; g.dmgMult = (g.dmgMult || 1) * 0.3 * nightAccuracyMult(rt.world); } }
    if (F.ending) return;
    if ((F.kbT = (F.kbT || 0) - dt) <= 0) { F.kbT = 1.5; this.kbThink(rt); }
    this.siegeClash(rt, dt);
    updateGates();
    if (F.TA) { F.TA.tick(dt); tickTabas(rt, dt); tabaInteractTick(rt, { allowPush: true, team: 0 }); }
    if (F.step < 4) {
      if (F.SZ) F.SZ.tick(dt);
      if (F.DA) F.DA.tick(dt);
    }
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if (g.woke && g.team === 1 && !g.wkDm) { g.wkDm = true; g.dmgMult = (g.dmgMult || 1) * (g.units.some((u) => u.type === 'bow') ? 0.22 : 0.55); } }
    // 雨の夜攻めでは射撃を止める。昼の封鎖で元に戻す。
    if ((F.gunT = (F.gunT || 0) - dt) <= 0) {
      F.gunT = 1;
      for (const u of rt.army.units) if (u.alive && u.team === 0 && u.type === 'gun') {
        if (u._okRainDmg === undefined) u._okRainDmg = u.dmg;
        if (F.step < 4) { u.dmg = 0; u.cd = Math.max(u.cd || 0, 3); } else u.dmg = u._okRainDmg;
      }
    }
    depthTick(rt, dt);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `坂まで ${Math.round(Math.hypot(p.x - FRONT.x, p.z - FRONT.z))}メートル・組 ${F.ram.count}人`);
      if (rt.t - F.stepT >= 60 && (Math.hypot(p.x - FRONT.x, p.z - FRONT.z) < 22 || rt.t - F.stepT > 100)) { if (!F.pushStarted) { F.pushStarted = true; this.pushback(rt); } }
    }
    if (F.step === 2) {
      const L = F.push || [];
      let left = 0; for (const q of L) if (!gone(q)) left += q.count;
      rt.objProgress('main', `北畠勢 ${left}人・退路を保て`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 25);
      if ((rt.t - F.stepT >= 45 && L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 90) this.midA(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - CAMP.x, p.z - (CAMP.z - 6));
      rt.objProgress('main', `陣まで ${Math.max(0, Math.round(d))}メートル`);
      if (F.chaser.count < 4 && !gone(F.chaser)) F.chaser.morale = Math.min(F.chaser.morale, 20);
      if ((d < 8 && rt.t - F.stepT > 12) || rt.t - F.stepT > 90) this.siegeDays(rt);
    }

  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0)) return;
    F.routSayT = rt.t + 10; g._routSaid = true;   // 隊ごとに一度（崩れて立て直す隊が、同じ一言を十秒おきに繰り返していた。10/2）
    rt.say('足軽', `${g.name}が城へ退いた`, 2.5);
  },
};

// ---------------- 搦手の前・退き・陣の前の段 ----------------
const FRONT = { x: -8, z: GATE.z + 16 };
const KB = (l) => dress(l, KITABATAKE);
function okCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'maru', armor: KIT.ARMOR.saito, dmg: 0.58, scale: 1,
    look: (list) => KB(cappedList(rt, list)), friends: () => [F.niwa, F.ikeda, F.inaba].filter((g) => g && g.count), routeFight: true, botSteer: wallStop };
}
// 新手を出す時だけ人数を数える。遠景は本物へ替えず、死体も数えない。
function cappedList(rt, list) {
  let room = 227; // 城の弓が本物へ戻る八人ぶんを空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
function wallStop(b, inp) {
  const p = b.player, u = p.u;
  if (inp.k.has('KeyW') && u.pos.z < GATE.z + 3 && Math.cos(p.yaw) < 0) inp.k.delete('KeyW');
}
function okA() {
  return [
    rest({ dur: 8, say: [['丹羽長秀', '夜攻めはここまでじゃ。坂の退路を保て。谷へ追うな']] }),
    hold({ at: FRONT, dur: 80, r: 16, title: '坂の退路を保つ', sub: '閉じた木戸から離れ、槍を並べる', label: '退路の坂',
      obj: '坂の旗のそばで、下ってくる城兵を押し返せ',
      waves: [
        { t: 8, say: ['足軽', '正面の坂から来るぞ！'], foes: () => [{ name: '坂の北畠勢', from: { x: -8, z: GATE.z + 3 }, list: [uS(2), uA(10)], mass: 0 }] },
        { t: 36, say: ['足軽', '西の斜面に弓！　竹束の陰へ！'], foes: () => [bowLine('西の斜面の弓', { x: -26, z: GATE.z + 5 }, FRONT, 6)] },
        { t: 58, say: ['丹羽長秀', '追手を押し返せ！　それから陣へ退くぞ！'], foes: () => [{ name: '斜面の新手', from: { x: 14, z: GATE.z + 5 }, list: [uS(1), uA(9)], mass: 0 }] },
      ], reward: '坂の退路を保った' }),
  ];
}
// 出撃するのは本物の小勢だけ。大軍の控えは城内の持ち場に残す。
const bowLine = (name, from, at, n) => gunLine(name, from, at, n, { list: [uS(1), uB(n)], kind: 'bow', mass: 0 });

// 両軍の総勢（織田 七万余り、大河内城の北畠勢 八千ほど。数には諸説ある）
okawachi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 40), a0: 70000, b: Math.max(0, 8000 - (F.ek || 0) * 20), b0: 8000 };
};
okawachi.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '北畠軍', mon: 'maru' } };
okawachi.date = (rt) => { const d = rt.flags.day || 1; return rt.flags.ending ? '永禄十二年十月四日　城を渡す' : d === 12 ? '永禄十二年九月八日　秋・雨・夜' : d === 13 ? '永禄十二年九月九日　兵糧攻め' : `永禄十二年　秋・囲み${d}日ほど`; };
okawachi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : '');
okawachi.skip = (rt) => { if (rt.phase === 'brief') okawachi.nightDay(rt); };
okawachi.history = '永禄十二年（1569）、信長は大河内城を四方から囲み、東の山に本陣を置いた。『信長公記』巻二は、九月八日の夜、丹羽長秀・池田恒興・稲葉良通が西搦手から三手に分かれて攻め、雨で鉄砲が使えず、多くの者が討たれたと記す。翌九日には滝川一益に多芸谷の焼き払いを命じ、兵糧を断った。十月四日、北畠具教・具房は城を渡して退いた。茶筅丸（のちの信雄）を北畠の養子に迎える和睦であり、城への総攻めで終わった戦ではない。松阪市の説明では、北大手・南搦手で、五十日ほどの籠城とする。ここでは南搦手へ西寄りから進む形に縮め、斜面の押し返し・退路保持・封鎖の新手を遊びとして補った。織田七万・北畠八千ともいうが、信長公記のこの条には総勢の数はなく、表示は参考値である。';
okawachi.lordAt = { ...HONJIN, r: 12, why: '信長公記に記される、城の東の山の本陣' };
okawachi.lordSpawn = { x: HONJIN.x, z: HONJIN.z + 8, heading: -Math.PI / 2 };
okawachi.noWake = true;
okawachi.rts = true;

// 軍議（gungi.js）：搦手の夜攻め（既定・史実）か、大手で引きつけてから搦手へ回るか
okawachi.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: GATE.z + 30 }, dist: 140,
    landmarks: [
      { name: '搦手の木戸', x: GATE.x, z: GATE.z }, { name: '搦手の前', x: MAE_C.x, z: MAE_C.z },
      { name: '搦手口の曲輪', x: JO_C.x, z: JO_C.z }, { name: '大手（北）', x: OTE_GATE.x, z: OTE_GATE.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
    ],
    lines: [{ name: '搦手口の曲輪', owner: '敵' }],
    units: [{ id: 'main', name: '丹羽長秀の手（全軍）', group: () => F.niwa }],
    routes: [
      { id: 'karamete', name: '南の搦手から、まっすぐ夜攻め' },
      { id: 'ote_lure', name: '北の大手で引きつけ、搦手へ寄せる（遊びの補い）' },
    ],
    default: { main: 'karamete' },
    enemy: [
      { name: '塀の内の北畠勢', known: true, count: () => (F.gateDef ? F.gateDef.aliveNominal() : 0) },
    ],
    cinema: { attackers: { x: 0, z: 40 }, gate: { x: GATE.x, z: GATE.z }, defenders: { x: JO_C.x, z: JO_C.z } },
    onStart: (assign) => okawachi.onGungiStart(rt, assign),
  };
  if (window.__okawachiStrategy) { okawachi.onGungiStart(rt, { main: window.__okawachiStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
okawachi.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'karamete'; };

// 素直な遊び手：木戸の組を守り、打って出た城兵と戦い、陣まで退く。その後は城外の道を封鎖する
okawachi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    if (e3 && u.hp > u.maxHp * 0.6) { p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z); if (Math.random() < 0.5) inp.leftPressed = true; return; }
    goTo(p, inp, CAMP.x, CAMP.z - 6, 3);
    return;
  }
  // 深手の退避と手当ては共通の頭に任せる。傷は自然に戻らず、全快待ちは戦へ戻れない。
  // 打って出た後も、閉じた木戸の内の弓や別の高さの兵を追わない。
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
    o.pos.z > GATE.z + 0.8);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) goTo(p, inp, e.pos.x, e.pos.z, 2.6);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { goTo(p, inp, 3, GATE.z + 7, 2); return; }
  if (F.step === 2) { const q = (F.push || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, GATE.z + 3), 2); return; } goTo(p, inp, 0, GATE.z + 8, 2); }
};

export { okawachi };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -150, tx: 0, tz: -35, w: 56, R: 80, rise: 50 };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [ROAD_KARAMETE.slice(0, 7)]);
  return BENCHED(x, z);
}
