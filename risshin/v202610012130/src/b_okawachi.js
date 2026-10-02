// ======================================================================
// 織田家編　大河内城の戦い（永禄十二年・五十日の囲み・縄張り版。docs/first6-1560-1569-spec.md 42〜57）
// 伊勢を平らげようとする信長は、北畠具教・具房の籠もる大河内城を大軍で囲んだ。
// 囲みは五十日ほど。日を進める段（包囲の日）と、抜き出した 3D の戦いを交互に見せる：
//   一日目 囲みの始まり（四方の陣）→ 七日目 大手攻め（北。北畠は大手を厚く守る）→ 十二日目（九月八日の夜）
//   雨の搦手（南）の夜攻め＝自分の 3D の戦い → 退き → 二十五日目 兵糧 → 三十日目 北畠の打って出（囲みが薄い所）
//   → 四十五日目 四方からの総攻め（北畠の頭が予備を回す）→ 五十日目 和睦（城を落とし切らない終わり）
// 足軽は丹羽長秀の手。①雨の夜、南の搦手の木戸へ寄せ、木戸を破る組を守る ②雨で鉄砲の撃てぬ中、打って出た城兵を受け止める
// ③退きの下知。追ってくる城兵を防ぎながら、陣まで退く（搦手の前を夜明けまで保てれば、退かずとも良い＝WIN.timeHeld）
// ②と③の間に段（b_depth.js）：塀の下で囲まれた池田の手（助けるか木戸を保つか）
// castles/okawachi.js の縄張り（北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場）・castle_plan.js・siege_zones.js・butai.js を使う。
// 向き：北（-z）の丘の先に大河内城。南（+z）に織田の搦手の封鎖の陣と信長の本陣。東に阪内川、北に矢津川
// ======================================================================
import { nobori, hut, campfire, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { volleyTick } from './b_sekigahara.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uB, gunLine } from './b_mid.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight, goten } from './castle_parts.js';
import { makeSiegeZones, WIN, makeFirstIn } from './siege_zones.js';
import { makeTabaAdvance, tickTabas, tabaInteractTick, patchGunCover } from './taketaba.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import {
  OKAWACHI_PLAN, OKAWACHI_HIST, GATE, OTE_GATE, MAE_C, JO_C, OTE_HINT, ROAD_KARAMETE, ROAD_OTE,
  HON_C, NISHI_C, NI_C, ONANDO_C, BABA_C, OTE_C,
} from './castles/okawachi.js';

// 上の身分（足軽大将候補より上）：丹羽の手の一手を預かり、退きでは殿を務める
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const CAMP = { x: 4, z: 70 };
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
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(OKAWACHI_PLAN, baseWithHori, 2.4);
  return HEIGHT_FN(x, z);
}

// 北畠の持ち場（曲輪の中の構え所）と、織田の囲みの陣（城外の四方。一つにまとめない）
const POST = {
  ote: { x: OTE_C.x, z: OTE_C.z + 2 }, hon: { x: HON_C.x, z: HON_C.z + 4 }, nishi: { x: NISHI_C.x, z: NISHI_C.z },
  ni: { x: NI_C.x, z: NI_C.z }, onando: { x: ONANDO_C.x, z: ONANDO_C.z }, baba: { x: BABA_C.x, z: BABA_C.z },
};
const SIEGE = {
  north: { x: OTE_HINT.x, z: OTE_HINT.z },   // 大手攻め（矢津川の手前）
  east: { x: 100, z: -96 },                  // 阪内川と道の見張り
  west: { x: -128, z: -112 },                // 西の谷越しの見張り
  south: { x: 34, z: 16 },                   // 搦手の封鎖（丹羽・池田・稲葉の陣の東）
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

const okawachi = {
  spawn: { x: 6, z: 50, heading: Math.PI },
  world: {
    seed: 15699,
    time: 'storm',
    muddy: 1,
    terrainTags: true,
    paths: [ROAD_KARAMETE, ROAD_OTE],
    height,
    // 阪内川（東）・矢津川（北）
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
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...OKAWACHI_HIST, honjinOda: 'HIST_B', honjinKitabatake: 'HIST_B', kitabatakeAI: 'GAME_C' };
    resetGates();

    // ---- 縄張り（castles/okawachi.js）：北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場。木戸は castle_plan.js に建てさせる ----
    // 搦手の木戸だけが破れる門（makeGate）。ほかの木戸は閉じたまま（3D で踏み込むのは搦手の口まで）
    const C = F.C = buildCastlePlan(rt, OKAWACHI_PLAN, { baseHeight: baseWithHori, edgeW: 2.4, buildGates: true, buildTowers: true, team: 1 });
    const maeC = C.kuruwa.mae.centroid, joC = C.kuruwa.jo.centroid;
    F.gates = { karamete: makeGate(rt, C.gateObjs.karamete, { name: GATE.name, guardTeam: 1 }) };
    // 曲輪の中の木造の建物（板葺き。大きな石垣・天守は無い）。本丸の館に北畠具教
    const roofs = { h: 3.2, wall: 0x6a5a44, roof: 0x3a3430 };
    for (const [x, z, w, d, r] of [[-8, joC.z - 4, 8, 5, 0.1], [10, joC.z + 2, 6, 4, -0.2],
      [NISHI_C.x - 4, NISHI_C.z - 6, 9, 5, 0], [NI_C.x + 4, NI_C.z - 8, 10, 6, 0.1], [NI_C.x - 6, NI_C.z + 8, 7, 5, -0.1],
      [ONANDO_C.x - 6, ONANDO_C.z, 9, 6, 0], [ONANDO_C.x + 7, ONANDO_C.z + 2, 7, 5, 0.1], [BABA_C.x + 16, BABA_C.z - 10, 8, 5, 0.2],
      [OTE_C.x - 6, OTE_C.z - 4, 7, 5, 0]]) rt.scene.add(hut(W, x, z, w, d, r, roofs));
    const gt = goten(rt, HON_C.x, HON_C.z - 7, { team: 1, w: 12, d: 7, tile: false });
    gt.struct.solidR = 0;
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [HON_C.x - 10, HON_C.z + 8], [HON_C.x + 10, HON_C.z + 8], [OTE_C.x - 6, OTE_C.z + 6], [OTE_C.x + 6, OTE_C.z + 6], [NI_C.x, NI_C.z + 12], [NISHI_C.x + 6, NISHI_C.z + 10]]) rt.scene.add(nobori(W, x, z, 'maru', 6));

    // ---- 守り（北畠勢。曲輪ごとの部隊。搦手口だけ本物の兵、ほかは軽い作りで数だけ） ----
    F.gateDef = makeButai(rt, { name: '塀の内の北畠勢', team: 1, faction: 'saito', kind: 'bow', nominal: 300, nearReal: 12, maxReal: 12, armor: 0x3a2a44, flag: KITABATAKE.flag, at: { x: joC.x, z: GATE.z - 3 }, facing: 0, real: 12 });
    F.gateDef.order({ id: 'hold' });
    // 雨の闇の中の矢：弓は射てるが、ねらいは鈍る（siege_vis.js の夜の当たり）
    // （掛けるのは update。部隊の本物の組は作り直されるため）
    const KB_B = { team: 1, faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, real: 0, maxReal: 0 };
    F.kb = {
      ote: makeButai(rt, { ...KB_B, name: '大手の北畠勢', kind: 'ashigaru', nominal: 220, at: POST.ote, facing: 0 }),          // 大手は厚く
      hon: makeButai(rt, { ...KB_B, name: '本丸の旗本', kind: 'ashigaru', nominal: 130, at: POST.hon, facing: 0 }),
      nishi: makeButai(rt, { ...KB_B, name: '西ノ丸の守り', kind: 'bow', nominal: 80, at: POST.nishi, facing: -Math.PI / 2 }),   // 谷が守るので少数
      ni: makeButai(rt, { ...KB_B, name: '二ノ丸の守り', kind: 'ashigaru', nominal: 160, at: POST.ni, facing: Math.PI / 2 }),
      onando: makeButai(rt, { ...KB_B, name: '御納戸の番', kind: 'ashigaru', nominal: 40, at: POST.onando, facing: Math.PI / 2 }),
      res: makeButai(rt, { ...KB_B, name: '馬場の予備', kind: 'ashigaru', nominal: 150, at: POST.baba, facing: Math.PI }),
    };
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    F.kbResAt = 'baba';
    // 総大将・北畠具教は本丸の館の中（天守の無い城）。旗本が縁側の上がり口を守り、踏み込むまで討てない
    F.keep = makeLordKeep(rt, {
      name: '北畠具教', spot: { x: HON_C.x, z: HON_C.z - 7 }, mouth: { x: HON_C.x, z: HON_C.z - 1 }, facing: Math.PI, guardN: 6,
      faction: 'saito', armor: 0x3a2a44, flag: KITABATAKE.flag, hat: 'kabuto_m', haori: 0x3a2a44,
    });
    F.commander = { alive: true, get real() { return F.keep && F.keep.lord && F.keep.lord.alive ? F.keep.lord : null; } };

    // ---- 丹羽長秀の手（自分の持ち場）、池田・稲葉・滝川の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 0, z: 40 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.ikeda = allyGroup(rt, { name: '池田恒興の手', anchor: { x: -26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '池田恒興', invuln: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.inaba = allyGroup(rt, { name: '稲葉良通の手', anchor: { x: 26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉良通', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { flag: 'inaba' }));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 12, z: 54 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: -12, z: 48 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_f', haori: 0x2a2a32 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.niwa, F.ikeda, F.inaba, F.ram, F.taki];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.75; }
    // 雨で鉄砲が効かない：鉄砲の兵だけ、ほぼ撃てないくらいに当たりを落とす（史実どおり槍で押すしかない）
    for (const g of [F.niwa, F.taki]) for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.12;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 50 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：丹羽・池田・稲葉の手は竹束を押し立て、雨の闇をゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    const gateHalf = () => F.step >= 2 || F.gates.karamete.struct.hp < F.gates.karamete.struct.maxHp * 0.5;
    F.TA = makeTabaAdvance(rt, {
      near: 40,
      items: [[F.niwa, 0], [F.ikeda, -20], [F.inaba, 20]].map(([g, x]) => ({ g, yose: { x, z: GATE.z + 16 }, until: gateHalf })),
      avoid: [this.spawn, { x: 10, z: 50 }],
    });
    // ---- 一番乗り（siege_zones.js）：木戸が破れても、自分が踏み込むまで味方は木戸の外で待つ ----
    F.FI = makeFirstIn(rt, { from: this.spawn, gates: [{ gate: F.gates.karamete, zone: C.kuruwa.jo.test }] });
    // ---- 織田の本陣（南。信長）と、城外の四方の囲みの陣（軽い作り。一つのキャンプに集めない） ----
    camp(rt, { x: CAMP.x, z: CAMP.z + 14, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', armor: 0x2b3140,
      general: { name: '織田信長', hat: 'kabuto_w', haori: 0x8a1a14 }, guard: 15, reserve: 200, runTo: { x: 0, z: 44 } });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 5));
    const OB = { team: 0, faction: 'oda', armor: 0x2b3140, real: 0, maxReal: 0 };
    F.siege = {
      north: makeButai(rt, { ...OB, name: '大手攻めの手（柴田勝家・森可成）', kind: 'ashigaru', nominal: 260, at: SIEGE.north, facing: Math.PI, flag: 'oda' }),
      east: makeButai(rt, { ...OB, name: '阪内川の見張り（佐久間信盛）', kind: 'ashigaru', nominal: 150, at: SIEGE.east, facing: -Math.PI / 2, flag: 'eiraku' }),
      west: makeButai(rt, { ...OB, name: '谷越しの見張り（蜂屋頼隆）', kind: 'bow', nominal: 110, at: SIEGE.west, facing: Math.PI / 2, flag: 'oda' }),
      south: makeButai(rt, { ...OB, name: '搦手の封鎖（丹羽・池田・稲葉）', kind: 'ashigaru', nominal: 200, at: SIEGE.south, facing: 0, flag: 'oda' }),
    };
    for (const k in F.siege) { const b = F.siege[k]; b.order({ id: 'hold' }); b._to = null; }
    for (const s of Object.values(SIEGE)) {
      rt.scene.add(nobori(W, s.x - 6, s.z + 6, 'oda', 6), nobori(W, s.x + 6, s.z + 6, 'eiraku', 6));
      rt.scene.add(campfire(W, s.x, s.z + 12)); W.addFire(s.x, s.z + 12);
    }
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 6, 'oda'], [CAMP.x + 8, CAMP.z + 6, 'eiraku'], [-30, 36, 'oda'], [30, 36, 'inaba']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[-16, 62], [20, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    // ---- 区域の網（siege_zones.js）：搦手の前（保てば WIN.timeHeld）→搦手口の曲輪 ----
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
      winWhen: [[WIN.timeHeld('mae', 100)]],
      onWin: () => this.holdWin(rt),
    });
    F.DA = makeDefenseAI(rt, {
      posts: [{ id: 'jo', butai: F.gateDef, at: joC, fallback: { x: joC.x, z: joC.z - 12 } }],
      reserves: [],
      fallback: { x: joC.x, z: joC.z - 12 },
    });

    // ---- 包囲の一日目 → 七日目（大手攻め）→ 十二日目の夜（自分の戦） ----
    rt.setPhase('brief');
    rt.obj('main', '丹羽長秀のもとで、搦手の夜攻めの下知を待て', 'main');
    rt.banner('包囲　一日目', '織田勢が、大河内城を四方から囲む');
    rt.say('丹羽長秀', `${nm(rt)}、見よ。北が大手、わしらの南が搦手じゃ。城は谷と堀切に守られておる`, 5);
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 2.2 }; });
    rt.marker('mkHon', HON_C, '本丸（北畠具教）', { h: 8 });
    rt.after(7, () => { rt.unmark('mkHon'); this.oteDay(rt); });
    rt.after(21, () => this.nightDay(rt));
  },

  // 七日目：北の大手攻め。北畠は大手を厚く守り、寄せ手は退く（見せるだけ。日を進める段）
  oteDay(rt) {
    const F = rt.flags;
    if (F.day >= 7) return;
    F.day = 7;
    rt.banner('包囲　七日目', '北の大手に、柴田・森の手が攻めかかる');
    this.siegeMove(rt, 'north', NEAR.ote);
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: OTE_C.x, z: OTE_C.z, t: 2 }; });
    rt.say('丹羽長秀', '大手は北畠の兵が厚い。……あれでは抜けまい', 4);
    rt.after(9, () => { this.siegeMove(rt, 'north', SIEGE.north); rt.bark('大手攻めは押し返された。北畠は大手を厚く守る'); });
  },
  // 十二日目（九月八日）の夜：雨の搦手の夜攻めへ
  nightDay(rt) {
    const F = rt.flags;
    if (F.day >= 12) return;
    F.day = 12;
    rt.banner('包囲　十二日目', '九月八日の夜。雨の中、搦手へ夜攻め');
    rt.say('丹羽長秀', '今夜、池田殿・稲葉殿と南の搦手から攻めかかる。……じゃが、この雨じゃ', 4.5);
    rt.say('丹羽長秀', '火縄が湿って、鉄砲はまず撃てぬ。槍で押すしかない。覚悟せよ', 4);
    rt.marker('niwa', F.niwaU.pos, '丹羽長秀', {});
    rt.after(6, () => this.assault(rt));
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
    const say = (t) => { if (rt.t > (F.kbSayT || 0)) { F.kbSayT = rt.t + 4; rt.bark(t); } };
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
    for (const a of Object.values(F.siege)) {
      if (!a._to || a.aliveNominal() <= 0) continue;
      for (const d of Object.values(F.kb)) {
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
      rt.obj('main', HI(rt) ? '丹羽の手の一手を預かり、木戸を破る組を守って搦手の木戸を破れ' : '木戸を破る組を守り、搦手の木戸を破れ', 'main');
      const R = F.ram;
      R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gates.karamete.struct.alive ? F.gates.karamete.struct : null);
      for (const [g, x] of [[F.niwa, 0], [F.ikeda, -20], [F.inaba, 20]]) { g.order = 'move'; g.dest = { x, z: GATE.z + 16 }; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
      rt.marker('gate', GATE, () => `木戸 ${Math.round(Math.max(0, F.gates.karamete.struct.hp) / F.gates.karamete.struct.maxHp * 100)}%`, { h: 4 });
      rt.after(24, () => { if (F.step === 1) rt.say('丹羽長秀', '左右の塀には池田殿・稲葉殿の手が取り付いた。木戸さえ破れば、中へ入れる', 4); });
      rt.after(8, () => rt.say('足軽', '……鉄砲が、撃てぬ！　火が消える！', 3));
    };
    if (lure) {
      rt.say('丹羽長秀', 'まず大手へ柴田殿の手を寄せ、城方の目を北へ引く。それから搦手じゃ', 4);
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
    rt.banner('木戸が開いた', '……中から、城兵が一斉に打って出てきた');
    rt.obj('main', '打って出た北畠の城兵を受け止めよ', 'main');
    rt.say('丹羽長秀', '破れたのではない、城兵が自ら開けて出てきたのじゃ！　槍を揃えよ！', 3.5);
    if (F.gates.karamete.struct.alive) rt.army.damage(F.gates.karamete.struct, 99999, null);
    F.push = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: GATE.z - 8 }, facing: 0, order: 'attack', seekRange: 80, aggro: 16, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, dress(list, KITABATAKE));
      F.push.push(g);
      rt.marker('p' + F.push.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: GATE.z }, 1.6);
    };
    mk(-6, '打って出た北畠勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }]);
    mk(8, '北畠の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.4) }]);
    KIT.backOf(rt, F.push[0], { flag: 'maru', armor: KIT.ARMOR.saito, kind: 'spear', w: 18, depth: 10, count: 90, seed: 71 });
  },

  // ②の後の段：塀の下の池田の手（助けるか木戸を保つか）→ ③へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    for (const q of F.push || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    F.pushDone = true;
    rt.obj('main', HI(rt) ? '丹羽の手の一手を預かり、搦手の前を保て' : '搦手の前で、城兵を押し返せ', 'main');
    depthStart(rt, okCtx(rt), okA(), () => this.retreat(rt));
  },

  // ③ 退く（搦手の前を保ちきれなかった時の、史実どおりの筋）
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending) return;
    if (F.held) { this.siegeDays(rt); return; }
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    if (!F.pushDone) rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    sfx('horagai', 0.6);
    rt.banner('退きの下知', '夜攻めは破れた。陣まで退く');
    rt.say('丹羽長秀', '退け！　……今夜はここまでじゃ。雨に負けた。組をまとめて退け！', 4);
    rt.obj('main', HI(rt) ? '殿を務め、追ってくる城兵を防ぎながら陣まで退け' : '追ってくる城兵を防ぎながら、陣まで退け', 'main');
    if (HI(rt)) rt.after(1.5, () => rt.say('丹羽長秀', `${nm(rt)}、その方の手が殿じゃ。皆が退くまで追っ手を食い止め、しまいに陣へ入れ`, 4));
    rt.marker('camp', CAMP, '陣', { h: 2 });
    rt.zone('camp', CAMP.x, CAMP.z - 6, 8);
    for (const g of [F.niwa, F.ikeda, F.inaba, F.ram]) { g.order = 'move'; g.dest = { x: g.anchor.x * 0.5, z: CAMP.z - 16 }; g.speed = 2.6; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.chaser = enemyGroup(rt, { faction: 'saito', name: '追ってくる城兵', anchor: { x: -6, z: GATE.z + 20 }, facing: 0, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 + more(rt, 0.3) }], KITABATAKE));
    rt.marker('ch', centerOf(F.chaser), () => `追ってくる城兵・${moraleWord(F.chaser.morale)}`, { red: true, group: F.chaser });
    F.campGun = allyGroup(rt, { name: '陣の鉄砲組', anchor: { x: CAMP.x, z: CAMP.z - 12 }, facing: Math.PI, width: 8, aggro: 30, noRout: true, formation: 'line', order: 'hold' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }], ODA));
    rt.after(3, () => rt.say('丹羽長秀', '陣まで引け！　陣幕の下で火縄を守っておいた鉄砲組がおる。追っ手をそこまで連れてこい', 4.5));
    F.vol = { guns: () => [F.campGun], foe: () => F.chaser, r: 24, max: 80, hit: 40, who: '丹羽長秀',
      wait: '陣の鉄砲組、火蓋を切るな。追っ手が陣の前まで来るのを待て', line: '今じゃ、放てぇっ！', sub: '追ってくる城兵の足が止まる',
      then: (rt) => rt.say('足軽', '撃てた！　雨の中でも撃てたぞ！　追っ手が怯んだ！', 3) };
  },

  // 搦手の前を夜明けまで保ちきった（WIN.timeHeld。退かずに済んだ、もう一つの筋）→ 包囲の日へ
  holdWin(rt) {
    const F = rt.flags;
    if (F.ending || F.step >= 3) return;
    F.held = true;
    rt.unmark('gate'); for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    rt.award((t) => { t.special = { label: '雨の夜攻めで、搦手の前を夜明けまで保った', pts: 22 }; }, '搦手の前を保った');
    rt.banner('夜が明ける', '搦手の前を、ついに保ちきった');
    rt.say('丹羽長秀', `よう持ちこたえた、${nm(rt)}！　……じゃが、殿は力攻めをやめ、囲んで兵糧を断つと仰せじゃ`, 4.5);
    // 段（b_depth.js）の途中なら、段が済んでから包囲の日へ（retreat が F.held を見て退かずに進む）
    if (!(F.dp && F.dp.on)) this.siegeDays(rt);
  },

  // ④ 包囲の日を進める（戦略の段）：兵糧 → 北畠の打って出 → 四方の総攻め（北畠の頭が予備を回す）→ 和睦
  siegeDays(rt) {
    const F = rt.flags;
    if (F.step >= 4 || F.ending) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('siege');
    rt.unmark('camp'); rt.unzone('camp'); rt.unmark('ch');
    for (const q of [...(F.push || []), F.chaser]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (!F.held) rt.award((t) => t.side.push('追っ手を防ぎながら陣まで退いた'), '陣まで退いた');
    rt.objDone('main');
    rt.after(2, () => { if (!F.ending) rt.obj('main', '囲みを保ち、北畠の動きを見よ', 'main'); });
    F.food = 1;
    // 二十五日目：兵糧
    rt.after(3, () => {
      F.day = 25; F.food = 0.5;
      rt.banner('包囲　二十五日目', '城の兵糧が細る。北畠勢の顔に疲れが見える');
      for (const b of Object.values(F.kb)) b.morale = Math.max(30, b.morale - 15);
      rt.say('丹羽長秀', '力で落ちぬ城は、腹で落とす。……殿のお考えじゃ', 4);
    });
    // 三十日目：包囲が薄い所（夜攻めで討たれた搦手の封鎖）から、北畠が打って出る
    rt.after(11, () => {
      F.day = 30;
      const thin = (F.ak || 0) > 10 || F.siege.south.aliveNominal() < 180;
      if (thin) {
        F.siege.south.lost = Math.min(F.siege.south.nominal - 60, F.siege.south.lost + Math.min(60, F.ak || 0));
        rt.banner('包囲　三十日目', '夜攻めで討たれて囲みの薄い南へ、北畠勢が搦手から打って出る');
        this.kbMove(rt, 'res', NEAR.kara); F.kbResAt = 'out';
        F.sallyB = F.kb.res;
        rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: NEAR.kara.x, z: NEAR.kara.z, t: 2 }; });
        rt.say('伝令', '北畠勢が搦手から出て、封鎖の陣の柵を焼いております！', 3.5);
        rt.after(8, () => { this.kbMove(rt, 'res', POST.baba); F.kbResAt = 'baba'; F.sallyB = null; rt.bark('北畠勢は荷を奪って、搦手へ戻った'); });
      } else {
        rt.banner('包囲　三十日目', '囲みは厚い。北畠勢は城から出られない');
      }
    });
    // 四十五日目：四方から総攻め（北・東・西が寄せる。北畠の頭が予備を回すのが見える）
    rt.after(22, () => {
      F.day = 45; F.press = true;
      rt.banner('包囲　四十五日目', '四方から総攻めの構え。北畠の頭が守りを回す');
      sfx('horagai', 0.8); rt.after(1, () => sfx('taiko', 1));
      this.siegeMove(rt, 'north', NEAR.ote);
      rt.after(6, () => { this.siegeMove(rt, 'east', NEAR.ni); if (!rt.player.lock) rt.player.cine = { x: NI_C.x, z: NI_C.z, t: 2.4 }; });
      rt.after(14, () => { this.siegeMove(rt, 'west', NEAR.nishi); if (!rt.player.lock) rt.player.cine = { x: NISHI_C.x, z: NISHI_C.z, t: 2.4 }; });
      // 大手の寄せ手が大手の曲輪へ押し入る（本丸が危うい）
      rt.after(24, () => { this.siegeMove(rt, 'north', { x: OTE_C.x, z: OTE_C.z + 6 }); rt.say('伝令', '大手の木戸が破れました！　北畠勢は本丸へ集まっております', 3.5); });
    });
    // 五十日目：和睦
    rt.after(62, () => this.peace(rt));
  },

  // 和睦（docs 57）：本丸で北畠を討って終わり、にしない。長い囲み＋圧力＋双方の損＋出来事 → 和睦
  peace(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.day = 50;
    rt.setPhase('end');
    for (const k in F.siege) this.siegeMove(rt, k, SIEGE[k]);
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '五十日の囲みを保ち、北畠を和睦に持ち込んだ', pts: 18 }; }, '任務達成・和睦');
    rt.banner('包囲　五十日目　和睦', '北畠は茶筅丸を養子に迎え、城を開く。討ち取りでなく、和睦で終わる');
    // 搦手の木戸から、北畠の使いが白い旗を掲げて信長の本陣へ下る
    const env = enemyGroup(rt, { faction: 'saito', name: '北畠の使い', anchor: { x: 0, z: GATE.z - 4 }, facing: Math.PI, order: 'move', aggro: 0, width: 3, morale: 100, noRout: true, dmgMult: 0 },
      dress([{ type: 'samurai', n: 1, o: { name: '北畠の使い' } }, { type: 'ashigaru', n: 2 }], KITABATAKE));
    for (const u of env.units) { u.noTarget = true; u.dmg = 0; }
    env.dest = { x: CAMP.x, z: CAMP.z + 4 }; env.speed = 2;
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: 0, z: GATE.z, t: 2.5 }; });
    sfx('horagai', 0.4);
    rt.say('丹羽長秀', `……城は落ちなんだが、北畠は膝を折った。よう囲みを保った、${nm(rt)}`, 4.5);
    rt.after(5, () => rt.say('', '――十月、信長は次男の茶筅丸（のちの信雄）を北畠の養子とすることで和を結び、伊勢を手に入れた', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
    butaiTick(rt, dt);
    if (F.keep) F.keep.tick();
    // 雨の闇の矢（部隊の本物の組は討たれ尽くすと作り直されるので、新しい組にも掛け直す）
    { const g = F.gateDef && F.gateDef.real; if (g && !g._rain) { g._rain = true; g.dmgMult = (g.dmgMult || 1) * 0.3 * nightAccuracyMult(rt.world); } }
    if (F.ending) return;
    if ((F.kbT = (F.kbT || 0) - dt) <= 0) { F.kbT = 1.5; this.kbThink(rt); }
    this.siegeClash(rt, dt);
    if (F.sallyB) lightClash(F.sallyB, F.siege.south, dt, 0.15);
    updateGates();
    if (F.TA) { F.TA.tick(dt); tickTabas(rt, dt); tabaInteractTick(rt, { allowPush: true, team: 0 }); }
    if (F.step < 4) {
      if (F.SZ) F.SZ.tick(dt);
      if (F.DA) F.DA.tick(dt);
      if (F.FI) F.FI.tick();
    }
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if (g.woke && g.team === 1 && !g.wkDm) { g.wkDm = true; g.dmgMult = (g.dmgMult || 1) * (g.units.some((u) => u.type === 'bow') ? 0.22 : 0.55); } }
    depthTick(rt, dt);
    volleyTick(rt, dt, F.vol);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gates.karamete.struct.hp) / F.gates.karamete.struct.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.gates.karamete.struct.hp < F.gates.karamete.struct.maxHp * 0.5 || rt.t - F.stepT > 110) { if (!F.pushStarted) { F.pushStarted = true; this.pushback(rt); } }
    }
    if (F.step === 2) {
      const L = F.push || [];
      rt.objProgress('main', `北畠勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 25);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 120) this.midA(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - CAMP.x, p.z - (CAMP.z - 6));
      rt.objProgress('main', `陣まで ${Math.max(0, Math.round(d))}m`);
      if (F.chaser.count < 4 && !gone(F.chaser)) F.chaser.morale = Math.min(F.chaser.morale, 20);
      if (d < 8 || rt.t - F.stepT > 100) this.siegeDays(rt);
    }
    if (F.step === 4) {
      const kbN = Object.values(F.kb).reduce((s, b) => s + b.aliveNominal(), 0);
      rt.objProgress('main', `包囲 ${F.day}日・城の兵糧 ${F.food >= 1 ? 'まだある' : 'わずか'}・北畠勢 ${Math.round(kbN * 25)}人ほど`);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || rt.t < (F.routSayT || 0)) return;
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${g.name}が城へ退いた`, 2.5);
  },
};

// ---------------- 搦手の前・退き・陣の前の段 ----------------
const IKEDA = { x: -30, z: GATE.z + 14 };   // 塀の下の池田の手
const FRONT = { x: 0, z: GATE.z + 16 };     // 搦手の前
const KB = (l) => dress(l, KITABATAKE);
function okCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'maru', armor: KIT.ARMOR.saito, dmg: 0.58, look: KB, friends: () => [F.niwa, F.ikeda, F.inaba].filter((g) => g && g.count), aid: { name: '丹羽の手の一組', list: [uS(1), uA(8)] }, aidSaid: '丹羽の手から一組が加わった', botSteer: wallStop };
}
// bot が塀に突っかからないように：塀の手前では、塀へ向かって歩かない（木戸の口は通す）
function wallStop(b, inp) {
  const p = b.player, u = p.u;
  if (inp.k.has('KeyW') && u.pos.z < GATE.z + 3 && Math.cos(p.yaw) < 0 && (Math.abs(u.pos.x) > 3 || (b.flags.gates && b.flags.gates.karamete.struct.alive))) inp.k.delete('KeyW');
}
const bowLine = (name, from, at, n = 9, x = {}) => gunLine(name, from, at, n, { list: [uS(1), uB(n)], kind: 'spear', ...x });
function okA() {
  return [
    rest({ dur: 8, say: [['足軽', '……雨が強うなった。塀の上から矢が降ってくる'], ['丹羽長秀', '息を整えよ。城兵はまだ出てくるぞ']] }),
    pick({ title: '池田恒興の手が、西の塀の下で城兵に囲まれた。どうする？',
      pre: (rt) => { rt.army.play('eshout', IKEDA, 1.8); rt.say('伝令', '池田殿の手が塀の下で囲まれております！', 3); },
      options: [{ label: '池田の手を助けに走る', note: '池田の手を救えば手柄。塀の下で弓に横から射られる' }, { label: '搦手の前を保つ', note: '木戸の前を渡さずに済む。池田の手は大きく討たれる' }],
      on: (rt, m, i) => { m.okIkeda = i === 0; rt.say('丹羽長秀', i === 0 ? '行け！　塀から離れて横から突け。塀の下に張り付くと、上から射られるぞ' : 'よし、木戸の前を固めよ。ここを渡せば、皆が討たれる', 3.5); } }),
    fight({ skip: (rt, m) => !m.okIkeda, at: IKEDA, max: 150, title: '西の塀の下', sub: '雨の闇の中、池田の手が城兵に囲まれている',
      obj: (rt) => (HI(rt) ? '預かった一手で池田の手を囲む城兵を横から突き崩せ' : '池田の手を囲む城兵を崩せ'),
      foes: () => [{ name: '池田の手を囲む北畠勢', from: { x: -44, z: GATE.z + 4 }, list: [uS(3), uA(14)], mass: 240, noRout: 20 }],
      later: [
        { t: 30, title: '塀の下の弓', sub: '北畠の弓が、塀の下に並んで射る', say: ['足軽', '塀の下に弓が並んだ……！　並ぶ前に突け！'], foes: () => [bowLine('塀の下の北畠の弓', { x: -30, z: GATE.z + 3 }, IKEDA, 10, { off: { x: 0, z: -9 } })] },
        { t: 65, title: '新手', sub: '木戸から、北畠の新手が回ってくる', say: ['足軽', '木戸の方から新手が……挟まれるぞ！'], foes: () => [{ name: '木戸から回った北畠の新手', from: { x: -6, z: GATE.z + 2 }, list: [uS(2), uA(12)], mass: 200 }] },
      ],
      reward: (t) => { t.special = { label: '塀の下で囲まれた池田の手を救った', pts: 15 }; }, rewardLabel: '池田の手を救った' }),
    hold({ skip: (rt, m) => m.okIkeda, at: FRONT, dur: 90, r: 14, title: '搦手の前', sub: '木戸から、城兵が繰り返し打って出る', label: '搦手の前',
      obj: (rt) => (HI(rt) ? '預かった一手を木戸の前に並べ、打って出る城兵を押し返せ' : '木戸の前で、打って出る城兵を押し返せ'),
      waves: [
        { t: 5, say: ['足軽', '木戸からまた出てきた……！'], foes: () => [{ name: '木戸から出た北畠勢', from: { x: 0, z: GATE.z - 2 }, list: [uS(2), uA(16)], mass: 260, noRout: 15 }] },
        { t: 35, say: ['足軽', '木戸の脇に弓が並んだ……！　並ぶ前に突け！'], foes: () => [bowLine('木戸の脇の北畠の弓', { x: 14, z: GATE.z + 3 }, FRONT, 10, { off: { x: 10, z: -10 } })] },
        { t: 62, say: ['足軽', '西から……池田殿の手を破った者どもが来る！'], foes: () => [{ name: '池田の手を破った北畠勢', from: { x: -44, z: GATE.z + 10 }, list: [uS(2), uA(14)], mass: 220 }] },
      ],
      reward: '搦手の前を保った', onEnd: (rt) => rt.say('伝令', '……池田殿の手は、大きく討たれたとのこと', 3.5) }),
  ];
}

// 両軍の総勢（織田 七万余り、大河内城の北畠勢 八千ほど。数には諸説ある）
okawachi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 40), a0: 70000, b: Math.max(0, 8000 - (F.ek || 0) * 20), b0: 8000 };
};
okawachi.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '北畠軍', mon: 'maru' } };
okawachi.famous = [
  { name: '日置大膳', g: /塀の脇|追って|塀の内/, loose: 1, line: '北畠の日置大膳なり！　雨の夜に寄せたのが運の尽きよ！' },
];
okawachi.date = (rt) => { const d = rt.flags.day || 1; return d === 12 ? '永禄十二年九月八日　秋・雨・夜（包囲十二日目）' : `永禄十二年　秋・雨（包囲${d}日目）`; };
okawachi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : rt.phase === 'siege' ? '和睦まで日を進める' : '');
okawachi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
okawachi.history = '永禄十二年（1569）八月、京を押さえた織田信長は、南伊勢の北畠具教・具房の父子を攻め、大河内城を大軍で囲んだ。九月八日の夜、丹羽長秀・池田恒興・稲葉良通らが搦手から攻めかかったが、雨で鉄砲が使えず、城兵に押し返されて多くの者を失ったと『信長公記』は伝える。信長は力攻めをやめて囲みを固め、兵糧を断った。十月、次男の茶筅丸（のちの織田信雄）を具房の養子とすることで和が結ばれ、北畠家は織田に従った。北畠家の紋（笹竜胆）の絵はまだ無いので、ここでは丸の旗で代えている。兵の数には諸説ある。';
okawachi.lordAt = { x: 4, z: 80, r: 12, why: '大河内城を囲む織田の陣（信長は城を大軍で囲んだ）' };
okawachi.lordSpawn = { x: 4, z: 76, heading: Math.PI };
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
      { id: 'ote_lure', name: '北の大手に柴田殿の手を寄せ、引きつけてから搦手へ' },
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

// 素直な遊び手：木戸の組を守り、打って出た城兵と戦い、陣まで退く（または搦手の前を保つ）
okawachi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 5, (o) => !o.fleeing);
    if (e3 && u.hp > u.maxHp * 0.6) { p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z); if (Math.random() < 0.5) inp.leftPressed = true; return; }
    goTo(p, inp, CAMP.x, CAMP.z - 6, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, GATE.z + 40, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step >= 2 || o.pos.z > GATE.z + 0.8));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { goTo(p, inp, 3, GATE.z + 7, 2); return; }
  if (F.step === 2) { const q = (F.push || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, GATE.z + 3), 2); return; } goTo(p, inp, 0, GATE.z + 8, 2); }
};

export { okawachi };
