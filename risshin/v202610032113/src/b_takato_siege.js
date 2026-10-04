// ======================================================================
// 攻城 C7・C9　高遠城の戦い・縄張り版（docs/siege-plan.md C7・C9／siege-spec.md 57・62・69章）
// 天正十年（1582）三月二日。武田の城々が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり降らなかった。
// 織田信忠の手が城を攻め、その日のうちに落ちた。ここは castle_plan.js の縄張り（castles/takato.js）・
// 門（siege_gate.js）・梯子（siege_ladder.js）・区域制圧（siege_zones.js）・城の頭（siege_ai.js）を
// 使った縄張り版（今の b_takato.js は別の一戦として残す）。
// C9：攻め方で結果が変わる【城62】。①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で
//      ④二の丸を取って高い所から本丸を撃つ、の四つ（軍議・window.__takatoStrategy で選ぶ）。
// ======================================================================
import { yamaLift } from './yamalift.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { nm, hpBarSystem, strengthBanner } from './bhelp.js';
import { distToPolyline } from './world.js';
import { demRelief } from './dem.js';
let tkDem = null;
import('./asset_dem_takato.js').then((m) => { tkDem = m.default; }).catch(() => {});
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, makeFirstIn } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeNawabari } from './nawabari.js';
import { placeLadder, startClimb, knockDown, updateLadders, resetLadders } from './siege_ladder.js';
import { makeDefenseAI } from './siege_ai.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance } from './taketaba.js';
import { logEvent } from './senkyo.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_VOLLEY, EVENT_RETREAT, EVENT_REINFORCEMENT } from './battle_events.js';
import { lines, volleyAll, leanAll } from './b_mid.js';
import {
  TAKATO_PLAN, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU,
} from './castles/takato.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
import { jinkeiBuild } from './jinkei.js';
import { flagTexture } from './textures.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記巻十五の大手五将と西の信忠。曲輪別の将の配り・人数は復元。
// 三万対三千は総勢の目安。近い部隊の名目の数とは分け、既存の門兵を動かさない。
const TAKATO_ATTACK = sonaePlan('両口の寄せ', 0, { x: -72, z: 0 }, Math.PI / 2, [
  ['nobutada', '本陣', '織田信忠', 10000, -72, 0, Math.PI / 2, 'oda', 'oda'],
  ['oteSpear', '大手の仕寄り', '森長可', 5000, 78, -38, -Math.PI / 2, 'tsuru', 'tsuru'],
  ['reserve', '大手の控え', '河尻秀隆', 5000, 100, -32, -Math.PI / 2, 'oda', 'none'],
  ['dan', '大手の第二陣', '団忠正（団平八）', 4000, 104, -54, -Math.PI / 2, 'oda', 'none', 64, 12, 8],
  ['mori', '大手の南脇', '毛利河内守', 3000, 100, -10, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
  ['ogasawara', '大手の北脇', '小笠原信嶺', 3000, 80, -66, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
]);
const TAKATO_DEFEND = sonaePlan('曲輪ごとの守り', 1, { x: 0, z: 29 }, Math.PI, [
  ['honGuard', '本丸', '仁科盛信', 900, 0, 22, Math.PI, 'takeda', 'takeda'],
  ['sanSpear', '三の丸と大手', '諏訪勝右衛門', 950, 24, -54, Math.PI / 2, 'takeda', 'takeda'],
  ['niSpear', '二の丸', '小山田昌行', 500, 0, -12, Math.PI, 'takeda', 'takeda'],
  ['hodoinSpear', '西の搦手', '名は伝わらない', 450, -24, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['reserveDef', '二の丸の控え', '名は伝わらない', 200, 12, 2, Math.PI, 'takeda', 'takeda'],
]);
for (const p of [TAKATO_ATTACK, TAKATO_DEFEND]) for (const s of p.sonae) s.bind = (rt) => rt.flags[s.id];

const ODA = { armor: 0x2b3140, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };

// ---------------- 地形：南は崖（三峰川）、西は切岸（梯子が要る）、北から緩く台地へ ----------------
function baseTerrain(x, z) {
  let h = 1 + 5 / (1 + Math.exp(-(z + 90) / 6));   // 南の平地から台地へ（z が増すほど高い）
  h += 0.3 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.045);
  if (z > CLIFF_Z) h -= (z - CLIFF_Z) * 3.2;         // 本丸の裏、三峰川の崖
  if (x < NISHI_X) h -= Math.min(36, (NISHI_X - x) * 1.8) * (1 - Math.exp(-z * z / 28)); // 西の尾根道だけ掘り残す
  if (z < -78) h -= Math.min(32, (-78 - z) * 1.6);  // 北の藤沢川の谷
  if (x > 60) h -= (x - 60) * 0.15;                  // 東（法幢院曲輪の先）へ緩く下る
  return h;
}
// 堀切の窪み（横堀の hori だけ。竪堀は西の切岸そのものが十分に急なので、地形の焼きには混ぜない＝pure）
const HORI_FNS = TAKATO_PLAN.hori.filter((h) => h.kind !== 'tatebori')
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3);
  // 国土地理院の標高：城の外の遠い山肌（藤沢川・三峰川の段丘）にだけ、実際の起伏を足す
  return HEIGHT_FN(x, z) + yamaLift(x, z, LIFT) + (tkDem ? demRelief(tkDem, x, z, { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.1 }) : 0);
}

// 部隊の多点の道：着いたら次の点へ、最後は attack（b_hiei_mtn.js の setRoute・advance・tickRoutes と同じ形）。
// b.assault（下で門ごとに持たせる）があれば、最後は assault にする：塀・門ごしで敵に届かない間、
// 立ち尽くさず（確かめで見つけた「道があるのに20秒動かない兵」）門を打ちに掛かる
function setRoute(b, pts) { b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b.assault ? 'assault' : 'attack' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
}
// 破れていない門をまとめて渡すと、生きている最初の一つを的にする（外の門が破れれば内の門、という順）
function gateAssault(...gates) {
  return () => { for (const g of gates) if (g && g.struct && g.struct.alive && !g.opened) return g.struct; return null; };
}
// 陽動の手：決まった的（門）が無いので、近い城方の塀・柵を的にする（確かめで見つけた「陽動の手が20秒止まる」の直し）
function nearWallAssault(rt) {
  return (u) => {
    let best = null, bd = 45;
    for (const s of rt.army.structs) {
      if (!s.alive || !s.seg || s.team !== 1) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
// 十四部隊を最大十六人ずつ。居所の七人と自分の組を合わせても約二百五十人。
function mkB(rt, o) { return makeButai(rt, { real: Math.min(12, o.nominal), maxReal: 16, nearReal: 16, farReal: 8, ...o }); }
// 搦手の尾根道は幅六メートル。横陣の端や遠景の散らばった位置を持ち場にしない。
function mkKarameteBow(rt, o) {
  const b = mkB(rt, { ...o, real: 0 });
  const canSpawn = b._canSpawn, grow = b.growReal;
  b._canSpawn = (x, z) => canSpawn(x, z) && (x >= NISHI_X - 2 || Math.abs(z) < 1.3);
  b.order({ id: 'hold', form: 'column' });
  b.growReal = (n) => {
    const made = grow.call(b, n);
    // 城攻めの道に従って射る。野戦の頭が隊を切岸の横へ広げないようにする。
    if (b.real) b.real.noAI = true;
    return made;
  };
  b.growReal(12);
  return b;
}
function deadB(b) { return !b || b.aliveNominal() <= 0; }

const takato_siege = {
  jinkei: [TAKATO_ATTACK, TAKATO_DEFEND],
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  noWake: true, // 部隊が本物と遠景を管理する。共通の追加兵を重ねない。
  spawn: { x: 96, z: -38, heading: -Math.PI / 2 },
  world: {
    seed: 15930,
    time: 'day',
    mist: false,
    wind: [0.8, 0.3],
    fogFar: 360,   // 開戦の所から、尾根の上の三の丸・本丸の屋根が霞まずに見える遠さ（携帯の見える遠さを掛けても 250m ほど）
    muddy: 0.1,
    terrainTags: true,     // M1：坂・道の速さ・向き変えを効かせる（西の切岸が本当に登りにくくなる）
    paths: [ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU],
    streams: [
      { pts: [[-110, -25], [-92, -82], [0, -108], [150, -104]], w: 9, depth: 1.6 },
      { pts: [[-110, -25], [-96, 60], [0, 82], [150, 90]], w: 12, depth: 1.8 },
    ],
    height,
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || distToPolyline(x, z, ROAD_KARAMETE) < 12,
    trees: 500,
    tufts: 1800,
    treeDensity: (x, z) => (x < NISHI_X - 6 ? 1.2 : 0.4),
    groves: [{ x: -40, z: 30, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -140,
  },

  setup(rt) {
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', nishinaMorinobu: 'HIST_A', twoFronts: 'HIST_A', nobutadaAdvance: 'HIST_A', oneDay: 'HIST_A', cliffs: 'HIST_B', routes: 'GAME_C', ladders: 'GAME_C', lordJudgement: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true;
    resetGates(); resetLadders(); flReset();
    F.hpBars = hpBarSystem(rt);
    // 兵力の差を数で見せる（長篠城と同じ共通の関数。攻め手は織田の大軍、城はごく少数で持ちこたえる）
    strengthBanner(rt, 30000, 3000);

    // ---- 縄張り：塀・門・櫓を castle_plan.js に建てさせる（C1・C2） ----
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, hodoinC = C.kuruwa.hodoin.centroid, honC = C.kuruwa.hon.centroid;

    // ---- 門（C5）：枡形は一の門・二の門の二つ、それぞれに makeGate。struct.name を一つずつに直す ----
    const G = C.gateObjs;
    G.ote.outer.struct.name = '大手門（一の門）'; G.ote.inner.struct.name = OTE.name;
    G.gate_hon.outer.struct.name = '本丸門（一の門）'; G.gate_hon.inner.struct.name = GATE_HON.name;
    G.gate_ni.struct.name = GATE_NI.name;
    G.karamete.struct.name = KARAMETE.name;
    G.gate_hodoin.struct.name = GATE_HODOIN.name;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    // ---- 本丸の主殿（見た目だけ。飾り） ----
    // 城主の居所（kaito 10/1）：天守の無い戦国期の城なので、仁科盛信は主殿（茅葺・質素な館）の中。
    // 江戸期の御殿にしない（final7-1579-1582-spec 73〜74章）。旗本が北の上がり口を守り、
    // 攻め手が主殿へ上がるまでは討てない。主殿は人が上がれるよう、丸い当たり（solidR）を外す
    // 主殿は縄張り（castles/takato.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に城主（kaito 10/2）

    // ---- 西の切岸の梯子（C3）：足場（ROAD_NISHI の終わり）から、二の丸の西の縁のすぐ内へ ----
    const foot = { x: NISHI_X - 2, z: 8 };
    F.nishiLadder2 = placeLadder(rt.world, { foot, topY: rt.world.heightAt(-22, 6) + 0.2, topX: -22, topZ: 6, hp: 50, team: 0, name: '西の切岸の梯子' });

    // ---- 守り（仁科盛信・2,000）。区域ごとに小さく（butai.js。S1） ----
    // 門の内の口（inner）のすぐそばに立たせる：siege_gate.js は「門兵（guardTeam）が居なくなったら開く」ので、
    // 曲輪の真ん中に置くと（遠すぎて）始めから門兵が居ない事になり、すぐ開いてしまう（確かめで見つけた）
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const karaGP = midOf(F.gates.karamete.struct), honGP = midOf(F.gates.honInner.struct);
    F.sanSpear = mkB(rt, { name: '三の丸の備え（諏訪勝右衛門）', general: '諏訪勝右衛門', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 750, armor: TAKEDA.armor, flag: TAKEDA.flag, at: oteGP, facing: Math.PI / 2 });
    F.sanGun = mkB(rt, { name: '三の丸の鉄砲（塀の上）', team: 1, faction: 'takeda', kind: 'gun', nominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 20, z: -50 }, facing: Math.PI / 2 });
    F.niSpear = mkB(rt, { name: '二の丸の備え（小山田昌行）', general: '小山田昌行', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: niGP, facing: Math.PI });
    F.hodoinSpear = mkB(rt, { name: '西の搦手の備え', team: 1, faction: 'takeda', kind: 'bow', nominal: 450, armor: TAKEDA.armor, flag: TAKEDA.flag, at: karaGP, facing: -Math.PI / 2 });
    F.honGuard = mkB(rt, { name: '本丸の仁科盛信の衆', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: honGP, facing: Math.PI });
    F.reserveDef = mkB(rt, { name: '城方の予備', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: (niGP.x + 24) / 2, z: 2 }, facing: Math.PI });
    F.defenders = [F.sanSpear, F.sanGun, F.niSpear, F.hodoinSpear, F.honGuard, F.reserveDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.keep = makeLordKeep(rt, {
      name: '仁科盛信', spot: C.seat ? C.seat.spot : { x: honC.x, z: honC.z + 8 }, naka: C.seat && C.seat.naka, mouth: { x: honC.x, z: honC.z + 2 }, facing: Math.PI, guardN: 4,
      faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      onReach: () => rt.say('城兵', '本丸の備えを崩すな。門の内で押し返せ', 3),
    });
    F.commander = { alive: true, get real() { return rt.army.units.find((u) => u.alive && u.name === '仁科盛信'); } };
    // castleGarrison（shiro.js・束8）の城主の判断に寄せる：'defend'→'fallback'→'surrender' の記録だけ
    // （盛信は「最後まで刀を取って戦い、城と共に果てた」筋のまま。台詞や降伏は変えず、状態の記録のみ）
    F.lordState = 'defend';

    // ---- 攻め（織田信忠の手・5,000）。小さな部隊（butai.js） ----
    F.oteSpear = mkB(rt, { name: '東の大手先手（森長可）', general: '森長可', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 900, armor: ODA.armor, flag: TAKATO_ATTACK.sonae[1].flag, mon: TAKATO_ATTACK.sonae[1].mon, at: { x: 78, z: -38 }, facing: -Math.PI / 2 });
    F.oteGun = mkB(rt, { name: '大手の先手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 400, armor: ODA.armor, flag: ODA.flag, at: { x: 86, z: -46 }, facing: -Math.PI / 2 });
    F.karameteSpear = mkB(rt, { name: '西の搦手の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 500, armor: ODA.armor, flag: ODA.flag, at: { x: -56, z: 0 }, facing: Math.PI / 2 });
    F.karameteBow = mkKarameteBow(rt, { name: '西の搦手の手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -64, z: 0 }, facing: Math.PI / 2 });
    F.nishiLadder = mkB(rt, { name: '西の切岸の手（梯子）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -50, z: 12 }, facing: Math.PI / 2 });
    F.yodou = mkB(rt, { name: '陽動の手', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 200, armor: ODA.armor, flag: ODA.flag, at: { x: -54, z: -74 }, facing: 0 });
    F.reserve = mkB(rt, { name: '大手の後詰（河尻秀隆）', general: '河尻秀隆', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 100, z: -32 }, facing: -Math.PI / 2 });
    F.nobutada = mkB(rt, { name: '西の織田信忠の旗本', general: '織田信忠', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 1500, armor: ODA.armor, flag: ODA.flag, at: { x: -72, z: 0 }, facing: Math.PI / 2 });
    // 信忠は西の搦手から塀際へ進む。taisho.js の adopt() は invuln 持ちの味方の総大将に
    // 深手（討たれない）の退きを与えるので、ここで立てておく（kaito 10/1。滝川一益の手と同じ作り）
    if (F.nobutada.taishoU) F.nobutada.taishoU.invuln = true;
    F.attackers = [F.oteSpear, F.oteGun, F.karameteSpear, F.karameteBow, F.nishiLadder, F.yodou, F.reserve, F.nobutada];
    F.jinHosts = buildSonae(rt, this.jinkei);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    // 徒歩の槍：道の先が塀・門ごしで敵に届かなければ、立ち尽くさず門を打ちに掛かる（確かめで見つけた「20秒動かない兵」の直し）
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    F.karameteSpear.assault = gateAssault(F.gates.karamete);
    F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    F.nobutada.assault = gateAssault(F.gates.karamete, F.gates.honOuter, F.gates.honInner);
    for (const b of [...F.attackers, ...F.defenders]) b.order({ id: 'hold' });

    // ---- 区域の網（siege_zones.js。F3）：三の丸・法幢院曲輪→二の丸→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 8, hold: 15, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '法幢院曲輪', test: C.kuruwa.hodoin.test, pos: hodoinC, need: 6, hold: 14, gate: KARAMETE.name, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 10, hold: 15, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 12, hold: 18, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // siege_zones.js の兵力比は「今、本物（real）の兵」で数える（butai.js は名目の多くを軽い大軍で持つ）。
      // 名目の 2,000 をそのまま渡すと、本物の枠（235）はいつも遥かに下回り、本丸に一人でも寄っただけで
      // 「降伏」が暴発してしまう（確かめで見つけた）。実際に本物として出せる見込みの数で渡す
      totalDefenders: 1, // 盛信は降伏しない。共通の二割降伏判定を使わない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [20, 40], reserves: [F.reserveDef],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.honTaken(rt),
      onSurrender: () => {},
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・ルートの数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, C, {
      SZ: F.SZ, team: 1, friendTeam: 0,
      gates: {
        ote: [F.gates.oteOuter, F.gates.oteInner], gate_ni: F.gates.gateNi,
        gate_hon: [F.gates.honOuter, F.gates.honInner], karamete: F.gates.karamete, gate_hodoin: F.gates.hodoin,
      },
    });
    // 束12・束31・束32：K を rt にも持たせ、軍議の俯瞰の説明・小地図の曲輪塗り分け・制圧の札に使えるようにする
    rt.nawabari = F.K;

    // ---- 城の頭（siege_ai.js・F4・C8）：守りは持ち場・門・退き・出撃、攻めは道を選ぶ。
    // shiro.js（castleGarrison・束8）の考えに寄せ、城方の予備（F.reserveDef）を持ち場ではなく
    // reserves として渡す（圧されている持ち場へ siege_ai.js が自分で回す。先に posts の一つに
    // 固定で置くより、本丸へ溜め込みすぎず要る所へ回る） ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanSpear, at: oteGP, gate: '大手門（一の門）', next: 'ni', watch: [{ at: { x: 50, z: -38 }, range: 36 }] },
        { id: 'karamete', butai: F.hodoinSpear, at: karaGP, gate: KARAMETE.name, next: 'ni', watch: [{ at: { x: -44, z: 0 }, range: 30 }] },
        { id: 'ni', butai: F.niSpear, at: niC, next: 'hon' },
        { id: 'hon', butai: F.honGuard, at: honC },
      ],
      reserves: [F.reserveDef],
      fallback: { x: honC.x, z: honC.z },
    });
    // 攻めの頭（軍議で作戦を選ばなければ、道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ
    // ＝味方 AI の手も同じ頭で動く【城39】。道の指図そのものは runStrategy の walkRoute に渡す）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 3.2, pathLen: 60, chokeWidth: 4.2 },
      { id: 'karamete', defThickness: 1.6, pathLen: 46, chokeWidth: 4.4 },
    ];

    // ---- 竹束の寄せ（taketaba.js）：大手・搦手の先手は竹束を押し立て、ゆっくり寄せ場まで進んで撃ち合う ----
    const oteOpen = () => F.gates.oteInner.opened, karaOpen = () => F.gates.karamete.opened;
    F.TA = makeTabaAdvance(rt, {
      items: [
        { g: F.oteSpear, yose: { x: 48, z: -38 }, until: oteOpen }, { g: F.oteGun, yose: { x: 50, z: -46 }, until: oteOpen },
        { g: F.karameteSpear, yose: { x: -40, z: 0 }, until: karaOpen }, { g: F.karameteBow, yose: { x: -44, z: 0 }, until: karaOpen },
      ],
      avoid: [this.spawn, { x: 92, z: -34 }],
    });
    // ---- 一番乗り（siege_zones.js）：門が破れても、自分が踏み込むまで味方は門の外で待つ ----
    const K = C.kuruwa;
    F.FI = makeFirstIn(rt, {
      from: this.spawn,
      gates: [
        { gate: F.gates.oteOuter }, { gate: F.gates.oteInner, zone: K.san.test }, { gate: F.gates.gateNi, zone: K.ni.test },
        { gate: F.gates.honOuter }, { gate: F.gates.honInner, zone: K.hon.test },
      ],
    });

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 92, z: -34 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // 壁際の大軍・旗・硝煙は共通の軽い仕掛け。近い兵を増やさない。
    F.lines = lines(rt, [
      { x: 30, z: -51, facing: -Math.PI / 2, w: 16, gap0: 6, seed: 15821, surge: false, gunsA: true, gunsB: true, A: ['oda', ODA.armor, 480, 'oda'], B: ['takeda', TAKEDA.armor, 180, 'takeda'] },
      { x: -26, z: -10, facing: Math.PI / 2, w: 12, gap0: 6, seed: 15822, surge: false, gunsB: true, A: ['oda', ODA.armor, 400, 'oda'], B: ['takeda', TAKEDA.armor, 180, 'takeda'] },
    ]);
    F.stageCheck = 0; F.honHold = 0;
    rt.world.setTime('morning');
    rt.setPhase('brief');
    sfx('siegeDistant', 0.4);
    rt.obj('main', hi(rt) ? '森長可の一隊を率い、東の大手道へ寄せよ' : '森長可の先手で、東の大手道へ寄せよ', 'main');
    // ②降伏の勧め→断る（final7-1579-1582-spec 79章「流れ：1包囲→2降伏の勧め→3攻撃開始…」）。
    // 使者を出す段を一言で見せてから、信忠が攻め掛かりを告げる
    rt.say('森長可', `${nm(rt)}、小笠原の案内で川下を渡った。北と南は川の崖じゃ。東の大手道から寄せる`, 5);
    rt.after(6, () => rt.say('織田信忠', 'こちらは西の尾根から搦手へ寄せる。両口から攻め入れ', 4));
    rt.after(10, () => this.assault(rt));
  },

  // ① 軍議で選んだ作戦（無ければ攻めの頭が自分で選ぶ）に沿って、部隊を動かす（C9）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('assault');
    sfx('horagai', 0.85);
    announceAdvance(rt, '織田信忠');
    F.strategy = window.__takatoStrategy || F.strategy || 'ote';
    this.runStrategy(rt, F.strategy);
    for (const c of F.lines) c.go();
    rt.after(12, () => { if (!F.ending) volleyAll(F.lines, 'B'); });
    rt.after(18, () => {
      if (F.ending || F.sanFell) return;
      F.sallyUntil = rt.t + 42;
      F.reserveDef.order({ id: 'charge', to: { x: 42, z: -38 } });
      rt.obj('main', '大手へ出た城兵を退け、門への道を空けよ', 'main');
      rt.say('森長可', '城兵が打って出た！　道を譲るな。槍をそろえて押し返せ', 4);
      rt.marker('sally', F.reserveDef.pos, '打って出た城兵', { red: true });
    });
    rt.after(45, () => {
      if (F.ending) return;
      setRoute(F.nobutada, ROAD_KARAMETE.slice(1));
      F.signalReady = true;
    });
    // 陽動の手：どの作戦でも、西の切岸の下へ出て塀際を脅す（決まった的が無いまま hold で待ち続けて、
    // 他家の見張りに「道があるのに20秒動かない」と見つかった兵。kaito 10/1）
    F.yodou.assault = nearWallAssault(rt);
    setRoute(F.yodou, [...ROAD_YODOU]);
    rt.marker('san', F.sanSpear.pos, () => `三の丸・${moraleWord(F.sanSpear.morale)}`, { red: true });
    // 本丸の衆と本丸の門の印は、外の曲輪（三の丸・法憧院）か大手の門が済んでから出す（開戦で札が四つ固まって浮かないように。見回り 10/3）
  },

  // C9 の四つの作戦：①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で ④二の丸を取って本丸を撃つ
  runStrategy(rt, strat) {
    const F = rt.flags;
    F.pushVia = strat || 'ote';
    // 自分は大手の先手。選ぶのは支え方で、両口の総攻めは必ず行う。
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    setRoute(F.oteSpear, ROAD_OTE.slice(1, 6));
    setRoute(F.oteGun, ROAD_OTE.slice(1, 2));
    F.oteGun._pin = true;
    setRoute(F.karameteSpear, ROAD_KARAMETE.slice(1));
    setRoute(F.karameteBow, ROAD_KARAMETE.slice(1, 2));
    if (strat === 'karamete') setRoute(F.karameteBow, ROAD_KARAMETE.slice(1));
    if (strat === 'nishi') setRoute(F.nishiLadder, ROAD_NISHI.slice(1));
    rt.obj('main', '東の大手門を破り、三の丸へ踏み込め', 'main');
    rt.say('森長可', '竹束の陰から寄せよ。門を打ち、曲がった口を抜けて三の丸へ入れ', 4);
  },

  // 区域が落ちた（siege_zones.js の onFall）
  // 本丸の備えを崩したら、旗の周りを守って攻め手を通す
  honTaken(rt) {
    const F = rt.flags;
    if (F.honFell || F.ending) return;
    if (!F.niFell || rt.t - F.niT < 65) { F.pendingHon = true; return; }
    F.honFell = true; F.honT = rt.t;
    rt.banner('本丸へ両口の手が合流', '戻し兵を退け、旗の周りを固める');
    rt.obj('main', '本丸の旗のそばで、残る城兵を退けよ', 'main');
    rt.say('森長可', '門を抜けたぞ。広場を取れ！　旗の周りを空けるな', 4);
    rt.unmark('hon'); rt.unmark('gateHon');
    rt.marker('rally', { x: 0, z: 25 }, '本丸の旗を固める');
    for (const b of [F.reserve, F.nobutada])
      if (!deadB(b)) setRoute(b, [[GATE_HON.x, GATE_HON.z], [-8, 18], [-12, 16.6], [-16, 18], [0, 25]]);
  },

  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending) return;
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true; F.sanT = rt.t; F.sallyUntil = 0;
      rt.unmark('san'); rt.unmark('sally');
      rt.obj('main', '二の丸の土橋を押さえ、門の内の反撃を退けよ', 'main');
      rt.say('森長可', '次は二の丸だ。堀へ散るな！　土橋に槍を集めて門を押せ', 4);
      F.oteSpear.assault = gateAssault(F.gates.gateNi);
      setRoute(F.oteSpear, [[4, -38], [GATE_NI.x, GATE_NI.z], [2, 0]]);
      F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi);
      setRoute(F.reserve, ROAD_OTE.slice(1, 8));
      rt.marker('next', GATE_NI, '二の丸の土橋');
      F.reserveDef.order({ id: 'charge', to: { x: GATE_NI.x, z: -24 } });
      battleEvent(rt, EVENT_REINFORCEMENT, F.reserveDef.pos, F.reserveDef.real, 1, true, '二の丸の門から城兵が押し返す');
    } else if (id === 'hodoin') {
      F.hodoinFell = true;
    } else if (id === 'ni' && !F.niFell) {
      if (!F.sanFell || rt.t - F.sanT < 65) { F.pendingNi = true; return; }
      F.niFell = true; F.niT = rt.t;
      rt.unmark('next'); rt.unmark('gateOte');
      rt.obj('main', '本丸の門を破り、城兵の最後の備えを崩せ', 'main');
      rt.say('織田信忠', '両口の手が入った。本丸の土橋へ寄せよ。狭い口で足を止めるな', 4);
      rt.marker('next', GATE_HON, '本丸への土橋');
      const road = [[GATE_HON.x, GATE_HON.z], [-8, 18], [-12, 16.6], [-16, 18], [0, 25]];
      for (const b of [F.oteSpear, F.reserve, F.nobutada, F.karameteSpear]) {
        b.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
        if (!deadB(b)) setRoute(b, road);
      }
      F.oteGun._pin = false;
      F.oteGun.order({ id: 'move', to: F.C.kuruwa.ni.centroid });
      if (F.pushVia === 'ni_bombard') {
        F.bombardUntil = rt.t + 22;
        rt.say('森長可', '二の丸の鉄砲をそろえよ。本丸の門を撃て', 3);
        volleyAll(F.lines, 'A');
        rt.world.gunSmoke(F.oteGun.pos.x, F.oteGun.pos.z);
        battleEvent(rt, EVENT_VOLLEY, F.oteGun.pos, F.oteGun.real, 0);
      }
      F.reserveDef.order({ id: 'move', to: F.C.kuruwa.hon.centroid });
    } else if (id === 'hon') this.honTaken(rt);
  },

  // 名目の兵力比の保険：siege_zones.js の「区域の占有」は、ごく僅かに残った城兵が区域の中で
  // 死にきらないと、いつまでも「争い中」のまま進まない事がある（確かめで見つけた）。守りの部隊が
  // 大きく（7割）減ったら、占有を待たずに次の場へ進ませる（SZ 自身がうまく占有を決められた時は
  // onZoneFall が二重に呼ばれるだけで、どちらも一度しか効かない作りなので壊れない）
  checkAttrition(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 消耗だけで曲輪を飛ばさない。自分が踏み込み、守りを崩した時だけ進む。
    if (F.C.kuruwa.san.test(p.x, p.z) && (F.sanSpear.aliveNominal() <= F.sanSpear.nominal * 0.45 || F.sanSpear.real && F.sanSpear.real.routed)) this.onZoneFall(rt, 'san');
    if (F.C.kuruwa.ni.test(p.x, p.z) && (F.niSpear.aliveNominal() <= F.niSpear.nominal * 0.45 || F.niSpear.real && F.niSpear.real.routed)) this.onZoneFall(rt, 'ni');
    if (F.C.kuruwa.hon.test(p.x, p.z) && (F.honGuard.aliveNominal() <= F.honGuard.nominal * 0.4 || F.honGuard.real && F.honGuard.real.routed)) this.honTaken(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon'); rt.unmark('next'); rt.unmark('rally'); rt.unmark('gateOte'); rt.unmark('gateHon');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城を攻め落とした', pts: 24 }; }, '任務達成・高遠城を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('高遠城、落ちる', '両口の手が本丸を押さえた');
    // 盛信が討たれると、周りの武田兵の士気は崩れる（城の主が果てた知らせは、曲輪ごとの備へ広がる）
    for (const b of F.defenders || []) {
      b.morale = Math.min(b.morale, 5);
      if (b.real) { b.real.noRout = false; b.real.morale = 5; }
    }
    battleEvent(rt, EVENT_RETREAT, F.C.kuruwa.hon.centroid, F.honGuard.real, 1, true, '本丸の備えが崩れた。高遠城、落ちる');
    for (const c of F.lines) c.rout('B');
    if (F.keep && F.keep.down) rt.after(1.5, () => rt.say('足軽', '盛信公が果てられた！　武田の兵が、総崩れじゃ！', 3));
    rt.say('織田信忠', `${nm(rt)}、城は落ちた。……この日のうちに、とはな`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 東の大手は外の冠木門から内の櫓門へ、曲がった広場を通って入る。
  // 枡形（一の門・二の門が近い）は、今打つべき門だけに印と残りの棒を出す。壊れた・開いた門は外し、
  // 奥の門へ切り替える（二つとも済んだら印を消す。確かめで見つけた：両方出ると、どちらを打つか迷う）
  gateMarker(rt, id, pair) {
    const g = pair.find((q) => q.struct.alive && !q.opened);
    if (!g) { rt.unmark(id); return; }
    const mid = { x: (g.struct.seg[0] + g.struct.seg[2]) / 2, z: (g.struct.seg[1] + g.struct.seg[3]) / 2 };
    // 無傷の間は名だけ（「・100%」を並べない）。打ち始めたら残りを添える
    rt.marker(id, mid, () => { const p = Math.round(Math.max(0, g.struct.hp) / g.struct.maxHp * 100); return p >= 100 ? g.name : `${g.name}・${p}%`; }, { h: 4.8 });
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    if (F.ending) return;
    F.stageCheck -= dt;
    F.refresh = F.stageCheck <= 0;
    if (F.refresh) F.stageCheck = 1;
    if (F.gates && F.refresh) {
      if (!F.sanFell) this.gateMarker(rt, 'gateOte', [F.gates.oteOuter, F.gates.oteInner]);
      if (F.niFell && !F.honFell) this.gateMarker(rt, 'gateHon', [F.gates.honOuter, F.gates.honInner]);
      if (F.niFell && !F.honMk && !F.honFell) { F.honMk = true; rt.marker('hon', F.honGuard.pos, () => `本丸・${moraleWord(F.honGuard.morale)}`, { red: true }); }
    }
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    updateGates();
    updateLadders(rt.army, dt);
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 1) { tickRoutes(F.attackers); if (F.refresh) this.checkAttrition(rt); }
    if (F.FI) F.FI.tick();

    // 西の切岸の梯子：着いた兵を一人ずつ登らせ、守りが時おり押し倒す
    if (F.nishiLadder2 && F.nishiLadder2.hp > 0) {
      for (const u of (F.nishiLadder.real ? F.nishiLadder.real.units : [])) {
        if (!u.alive || u.climb) continue;
        if (Math.hypot(u.pos.x - F.nishiLadder2.x, u.pos.z - F.nishiLadder2.z) < 2.2) startClimb(u, F.nishiLadder2);
      }
      F._kdT = (F._kdT || 0) - dt;
      if (F._kdT <= 0 && !deadB(F.niSpear) && Math.random() < 0.4) { F._kdT = 6; knockDown(F.nishiLadder2, rt.army); }
    }
    // 二の丸からの鉄砲の高所撃ち【城74】：本丸を静かに削る（かかった数だけ）
    if (F.bombardUntil && rt.t < F.bombardUntil && !deadB(F.honGuard)) {
      F.honGuard.lost = Math.min(F.honGuard.nominal - 1, F.honGuard.lost + dt * 1.1);
      F.honGuard.morale = Math.max(20, F.honGuard.morale - dt * 0.6);
    } else if (F.bombardUntil && rt.t >= F.bombardUntil && !F.bombardDone) {
      F.bombardDone = true;
      rt.banner('本丸への攻め口が開いた', '予備の手が、本丸へ攻め上る');
      if (F.reserve.aliveNominal() > 0) setRoute(F.reserve, [[GATE_HON.x, GATE_HON.z], [-8, 18], [-12, 16.6], [-16, 18], [0, 25]]);
    }
    // 段の札・残り時間は一秒に一度だけ。毎コマ、道や印を作り直さない。
    if (F.step >= 1 && F.refresh) {
      if (F.signalReady && !F.signalGiven && Math.hypot(F.nobutada.pos.x - KARAMETE.x, F.nobutada.pos.z - KARAMETE.z) < 18) {
        F.signalGiven = true;
        battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobutada.pos, F.nobutada.real, 0, true, '信忠が西の塀際へ出た。両口から押し入れ');
        rt.say('織田信忠', '柵を破れ！　大手も搦手も、一度に乗り入れ！', 4);
        leanAll(F.lines, 'A', 0.55); volleyAll(F.lines, 'A');
      }
      if (F.sallyUntil && rt.t >= F.sallyUntil) {
        F.sallyUntil = 0; rt.unmark('sally');
        F.reserveDef.order({ id: 'move', to: F.C.kuruwa.ni.centroid });
        if (!F.sanFell) rt.obj('main', '東の大手門を破り、三の丸へ踏み込め', 'main');
        battleEvent(rt, EVENT_RETREAT, F.reserveDef.pos, F.reserveDef.real, 1, false, '打って出た城兵が門の内へ退く');
      }
      if (F.pendingNi && F.sanFell && rt.t - F.sanT >= 65) this.onZoneFall(rt, 'ni');
      if (F.pendingHon && F.niFell && rt.t - F.niT >= 65) this.honTaken(rt);
      if (!F.sanFell) rt.objProgress('main', F.sallyUntil ? '城兵を押し返し、門へ進め' : '門を打ち、曲がった口の内へ');
      else if (!F.niFell) rt.objProgress('main', rt.t - F.sanT < 65 ? '土橋を押さえる・あと' + Math.ceil(65 - (rt.t - F.sanT)) + '秒' : '二の丸へ踏み込み、残る備えを崩せ');
      else if (!F.honFell) rt.objProgress('main', rt.t - F.niT < 65 ? '本丸へ手を集める・あと' + Math.ceil(65 - (rt.t - F.niT)) + '秒' : '本丸へ踏み込み、最後の備えを崩せ');
      if (rt.t - F.stepT > 320 && !F.lastPush) {
        F.lastPush = true;
        rt.say('森長可', '後詰を前へ！　今の札の口へ集まり、残る備えを押し崩せ', 4);
        F.reserve.order({ id: 'assault' });
        leanAll(F.lines, 'A', 0.8);
      }
    }
    if (F.keep) F.keep.tick();
    // 時間だけで勝ちにはしない。本丸内で旗を守り、最後の備えを崩して決着。
    if (F.honFell) {
      const p = rt.player.u.pos;
      const near = rt.player.u.alive && Math.hypot(p.x, p.z - 25) < 14;
      let enemy = 0;
      for (const u of rt.army.units)
        if (u.alive && u.team === 1 && !u.fleeing && !u.noTarget && Math.hypot(u.pos.x, u.pos.z - 25) < 14) enemy++;
      if (near && enemy <= 2) F.honHold += dt;
      else F.honHold = Math.max(0, F.honHold - dt);
      if (F.refresh) rt.objProgress('main', enemy > 2 ? '旗の周りの城兵 ' + enemy + '人を退けよ' : '旗のそばを守る・あと' + Math.ceil(Math.max(0, 60 - F.honHold, 240 - rt.t)) + '秒');
      if (F.honHold >= 60 && rt.t >= 240) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 一人の本物が備えの一部を代表する。名目だけが際限なく残るのを防ぐ。
    const b = v.group && v.group.butai;
    if (b && !v.isStruct) b.lost = Math.min(b.nominal, b.lost + b.nominal / (b.maxReal || 16));
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    // 同じ隊が立て直してはまた崩れる。名は一度だけ言う（見回り 10/2：同じ台詞が十数回）
    F.routSaid = F.routSaid || {}; if (F.routSaid[g.name]) return; F.routSaid[g.name] = 1;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

takato_siege.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return { a: Math.round(a / (F.attackTotal || 1) * 30000), a0: 30000, b: Math.round(b / (F.defendTotal || 1) * 3000), b0: 3000 };
};
takato_siege.sides = { a: { name: '織田軍（織田信忠）', mon: 'oda' }, b: { name: '武田軍（仁科盛信）', mon: 'takeda' } };
takato_siege.famous = [
  { name: '小山田昌行', team: 1, g: /二の丸/, loose: 1, line: '武田の小山田昌行なり！　高遠は仁科様と共に果てる！' },
  { name: '諏訪勝右衛門', team: 1, g: /三の丸/, loose: 1, line: '諏訪勝右衛門なり！　大手の口を押し返せ！' },
];
takato_siege.date = (rt) => `天正十年三月二日　春・${rt.flags.step >= 1 ? '攻めの最中' : '夜明け'}`;
takato_siege.history = '信長公記巻十五によれば、天正十年三月二日、森長可・団平八・河尻秀隆・毛利河内守・小笠原信嶺らが大手へ、信忠は尾根続きの搦手へ寄せた。大手では城兵が打って出て数刻戦い、信忠自身も柵を破り塀へ上がって突入を命じた。両口の兵が城内で激しく戦い、盛信らは討たれ、その日のうちに落城した。信濃史料は兼見卿記ほかも挙げて三月二日の落城を記す。織田三万・城兵三千ともいうが、総数は諸説ある。戦国期の大手は東、搦手は西。曲輪の寸法と反撃の時間、竹束・梯子・鉄砲の下知は遊びの補完。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 軍議（gungi.js・C6）：城を回して見て、作戦を一つ選ぶ【城19〜22・68】
takato_siege.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: 0 }, dist: 130,
    // 束31：info を足し、押すと短い札が出るように（俯瞰の説明）
    landmarks: [
      { name: '大手門', x: OTE.x, z: OTE.z, info: '東の正門。森長可の先手が西へ攻める' },
      { name: '搦手門', x: KARAMETE.x, z: KARAMETE.z, info: '西の尾根道。信忠の旗本が東へ攻め入る' },
      { name: '三の丸', x: 0, z: -38, info: '大手門のすぐ内。守備兵が多い' },
      { name: '二の丸', x: 0, z: -2, info: '城の中心。喰い違いの門が続く' },
      { name: '法幢院曲輪', x: 36, z: -1, info: '本丸の南東に続く曲輪' },
      { name: '本丸', x: 0, z: 29, info: '最後の備え。堀と土橋を越えて旗の周りを取る' },
      { name: '西の切岸', x: NISHI_X, z: 8, info: '道が狭い　梯子でしか登れない' },
    ],
    nawabari: F.K,
    lines: [
      { name: '三の丸', owner: '敵' }, { name: '法幢院曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '織田信忠の手（全軍）', group: () => F.nobutada && F.nobutada.real, nominal: () => (F.nobutada ? F.nobutada.aliveNominal() : 0) }],
    routes: [
      { id: 'ote', name: '両口から攻め、大手を厚くする' },
      { id: 'karamete', name: '両口から攻め、信忠の搦手を支える' },
      { id: 'nishi', name: '西の切岸を梯子で登る' },
      { id: 'ni_bombard', name: '二の丸を取り、高所から本丸を撃つ' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '三の丸の備え', known: true, count: () => (F.sanSpear ? F.sanSpear.aliveNominal() : 0) + (F.sanGun ? F.sanGun.aliveNominal() : 0) },
      { name: '法幢院曲輪の備え', known: false },
      { name: '二の丸・本丸の備え', known: false },
    ],
    cinema: { attackers: { x: 96, z: -38 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: F.honGuard ? F.honGuard.pos.x : 0, z: F.honGuard ? F.honGuard.pos.z : 29 } },
    onStart: (assign) => takato_siege.onGungiStart(rt, assign),
  };
  // F9：bot・sim で確かめる時、作戦を渡していれば window.__takatoStrategy で決め打ち。
  // 渡していなければ（AI どうしの確かめ）軍議の札を出さず、攻めの頭（siege_ai.js）に選ばせる
  if (window.__takatoStrategy) { takato_siege.onGungiStart(rt, { main: window.__takatoStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
takato_siege.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'ote'; };

// 素直な遊び手：敵へ向かって戦い、無ければ大手へ
takato_siege.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  b.botFollowingTaba = false;
  if (!u.alive || F.ending) return;
  // 下知の前に単独で門へ走り込まず、味方と同じ寄せの合図を待つ。
  if (F.step < 1) {
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
    return;
  }
  // 大手の先手が竹束を運び、据えて撃ち合う間は、その陰から寄せる。
  // 構えだけでは鉄砲を防げない。目の前の城兵には従来どおり応戦する。
  if (!F.gates.oteOuter.opened && F.gates.oteOuter.struct.alive &&
      !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    const it = F.TA && F.TA.items.find((it) => it.g === F.oteSpear);
    if (it && it.st !== 'free') {
      let tb = null, bd = Infinity;
      for (const t of it.tabas) {
        const d = Math.hypot(t.x - u.pos.x, t.z - u.pos.z);
        if (d < bd) { tb = t; bd = d; }
      }
      if (tb) {
        b.botFollowingTaba = true;
        inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
        goTo(p, inp, tb.x - Math.sin(tb.rot) * 1.4, tb.z - Math.cos(tb.rot) * 1.4, 0.5);
        return;
      }
    }
  }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 櫓・主殿の壁の向こうへ直進せず、共通の回り込みを使って追う。
    if (d > 2.6) goTo(p, inp, e.pos.x, e.pos.z, 2.6);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.honFell) { goTo(p, inp, 0, 25, 3); return; }
  const pair = F.niFell ? [F.gates.honOuter, F.gates.honInner] : F.sanFell ? [F.gates.gateNi] : [F.gates.oteOuter, F.gates.oteInner];
  const gate = pair.find((g) => g.struct.alive && !g.opened);
  if (gate) {
    const t = gate.struct, x = (t.seg[0] + t.seg[2]) / 2 + t.nx * 1.5, z = (t.seg[1] + t.seg[3]) / 2 + t.nz * 1.5;
    goTo(p, inp, x, z, 1.6);
    if (Math.hypot(u.pos.x - x, u.pos.z - z) < 3) inp.leftPressed = true;
    return;
  }
  const tgt = F.C.kuruwa[F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san'].centroid;
  goTo(p, inp, tgt.x, tgt.z, 3);
};

export { takato_siege };

// 山城の高さ（kaito 10/3）：高遠は平山城（三峰川・藤沢川の段丘の上、比高 約30m）。北の麓から台地へ段を一つ高くする（yamalift.js）
const LIFT = { x: 0, z: 30, tx: 0, tz: -62, w: 70, R: 56, rise: 22 };
