// ======================================================================
// 越前一向一揆・木ノ芽峠（docs/late6-1573-1575-spec.md 65〜79章。もしも、天正三年八月十五日頃）
// 「砦ひとつ」でなく、尾根ごとに分かれた四つの城を攻める：観音丸城（低い前衛）→木ノ芽峠城（一揆の中核。
// 十数の郭を木戸内・副郭・主郭の三段で表す）→東の大堀切を渡って西光寺丸城／西へ分かれて鉢伏城（最高所・詰の城）。
// どちらを先に攻めるかは軍議で選べる。残した城の守兵は、近くを通る味方へ横から撃ちかける（update の lightClash）。
// IF：史実は織田が突破したが、ここでは時をかけすぎる・押し崩せぬと一揆が守り切る（lose）。地形・城郭は史実のまま。
// B 杉津口（海岸側）は背景の戦い（distantArmy・知らせ）だけで、A 木ノ芽峠口（この地図）が主役。
// castle_plan.js・castle_parts.js・siege_zones.js・siege_ai.js（makeMountainDefense・makeMountainAmbush）・
// butai.js（makeButai。本物⇄軽いの切り替えで兵は自動で 235 人の枠に収まる）を使い回す。
// ======================================================================
import { yamaLift, benchRoads } from './yamalift.js';
import { hut, tawara, sakamogi, lumber, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { kido, monomi } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, zoneWord, makeFirstIn } from './siege_zones.js';
import { makeMountainDefense, makeMountainAmbush } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, announceAdvance, patchGunCover } from './taketaba.js';
import { demBlend } from './dem.js';
import {
  KINOME_PLAN, ROAD, BRANCH_EAST, BRANCH_WEST,
  GATE_KANNON, GATE_KINOME, GATE_SAIKOJI, GATE_HACHIBUSE,
  EXIT_KANNON, EXIT_KINOME, EXIT_SAIKOJI, EXIT_HACHIBUSE,
  CLIFF_X, FOREST_X,
} from './castles/kinome.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const ODA = { armor: 0x2b3140, flag: 'oda' };
const IKKO = { armor: 0x3a342c, flag: 'namu' };
const MIX = { ashigaru: 0.55, samurai: 0.15, gun: 0.15, bow: 0.15 };

// 国土地理院の標高（木ノ芽峠。束0 の asset_dem_kinome.js）。手書きの四城の地形の上に、道から離れた
// 所だけ実測の起伏を薄く足す（道・曲輪の上はいつもどおり手書きのまま）
let kiDem = null;
import('./asset_dem_kinome.js').then((m) => { kiDem = m.default; }).catch(() => {});
const DEM_XY = 6;

function nearestRoadDist(x, z) { return Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, BRANCH_EAST), distToPolyline(x, z, BRANCH_WEST)); }

function baseTerrain(x, z) {
  let h = 0.4 * Math.sin(x * 0.05 + 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.05 - x * 0.03);
  h += Math.max(0, z + 172) * 0.07;         // 南（敦賀側）から峠へ緩く上る
  h += Math.max(0, -x - 10) * 0.07;         // 西（鉢伏）はさらに高く
  h += Math.max(0, x - 20) * 0.06;          // 東（西光寺丸）も尾根なりに高く
  const d = nearestRoadDist(x, z);
  h += Math.min(9, Math.max(0, d - 22) * 0.2);   // 道・曲輪の外は緩く荒れる程度（flank の兵が詰まらない広さを残す）
  if (x < CLIFF_X) h += (CLIFF_X - x) * 2.2;     // 鉢伏のさらに西は崖
  if (kiDem && d > 16) h += demBlend(kiDem, x * DEM_XY, z * DEM_XY, 0, { scale: 0.05, floor: -6 });
  return h;
}
let HEIGHT_FN = null;
function heightRaw(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(KINOME_PLAN, baseTerrain, 3); return HEIGHT_FN(x, z) + yamaLift(x, z, LIFT); }

// 部隊（Butai）の多点の道：着いたら次の点へ。最後まで着いたら attack（b_echizen_ikko.js と同じやり方）
// ・b.assault が立てて（下の gateOf）あれば assault で着く：木戸は誰も打ちに掛からないと開かず詰まる
//   （見つけた問題：観音丸を軽くした後、守兵が尽きても木戸が壊れず進めなくなる事があった）。
//   assault 下知は、近くに敵がいればそちらと斬り合い、いなければ b.assault() の木戸を打つ（army_think.js）
function setRoute(b, pts) { b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: b.assault ? 'assault' : 'attack' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
}
// 寄せ手 b の先に立つ木戸を討つ的にする（木戸が壊れれば null を返し、ふつうの attack に戻る）
function gateOf(gate) { return () => (gate.struct.alive ? gate.struct : null); }
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
// 一向宗の姿（B014・B027）：門徒は鉢巻と茶の衣、寺の衆徒・薙刀の僧兵は白い裹頭と袈裟（humans.js の sohei）
function mkB(rt, o) {
  const monk = /衆徒|薙刀|衆|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  const look = monk ? { sohei: 1, hat: 'hachimaki', lace: 0xcfc7b4, cloth: 0xd8d2c2 } : { hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
  return makeButai(rt, { real: Math.min(14, o.nominal), ...(o.faction === 'ikko' ? { look } : {}), ...o });
}
function bOk(b) { return !!(b && b.aliveNominal() > 0); }
function near(a, b, r) { return bOk(a) && bOk(b) && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < r; }

// 道の区切り（南→北。木戸ごとに歩かせ直す）
const IX = (z) => ROAD.findIndex((p) => p[1] === z);   // 道の点の位置（九十九折りの点が増えても、門の点を探せる）
const ROAD_TO_KANNON = ROAD.slice(1, 3);
const ROAD_TO_JUNCTION = ROAD.slice(1, IX(-60) + 1);
const ROAD_TO_KINOME = ROAD.slice(IX(-96), IX(-30) + 1);
const ROAD_TO_HON = ROAD.slice(IX(-10));
// 東西の別働は、観音丸城が落ちてから（木戸が開いてから）放つ＝必ず junction まで本道を通ってから分かれる
// （観音丸城の塀に斜めから突っかけて動けなくなる事がないように。見つけた問題：行き先があるのに動かない兵）
const BRANCH_EAST_GO = [...ROAD_TO_JUNCTION, ...BRANCH_EAST.slice(1)];
const BRANCH_WEST_GO = [...ROAD_TO_JUNCTION, ...BRANCH_WEST.slice(1)];

const kinome = {
  spawn: { x: 0, z: -160, heading: 0 },
  world: {
    seed: 15901,
    moveLim: 220,   // 後詰・竹束の組は出だしの後ろ（z≈-210）に並ぶ。既定の 176 だと戦場の外へ出た扱いで一息に引き戻されていた（見回り 10/2）
    time: 'day',
    mist: true,
    muddy: 0.25,
    paths: [ROAD, BRANCH_EAST, BRANCH_WEST],
    height,
    tint(x, z, h, c) {
      if (x > FOREST_X) c.setRGB(c.r * 0.78, c.g * 0.88, c.b * 0.78);
      else if (nearestRoadDist(x, z) > 16) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.82);
    },
    clear: (x, z) => nearestRoadDist(x, z) < 14
      || (x > -14 && x < 14 && z > -120 && z < -90)
      || (x > -14 && x < 14 && z > -30 && z < 42)
      || (x > 14 && x < 44 && z > 8 && z < 56)
      || (x > -54 && x < -22 && z > -18 && z < 30),
    trees: 2200,
    tufts: 3200,
    treeDensity: (x, z) => { if (nearestRoadDist(x, z) < 14) return 0.08; if (x > FOREST_X) return 1.5; if (x < CLIFF_X + 10) return 0.5; return 0.9; },
    groves: [{ x: 28, z: -18, r: 16, n: 20 }, { x: 34, z: 40, r: 14, n: 18 }, { x: -40, z: -4, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z > 50 || x < CLIFF_X + 4 || x > 50),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    flReset();

    const C = F.C = buildCastlePlan(rt, KINOME_PLAN, { baseHeight: baseTerrain, edgeW: 3 });
    const kannonC = C.kuruwa.kannon.centroid, souC = C.kuruwa.kinome_sou.centroid, fukuC = C.kuruwa.kinome_fuku.centroid,
      honC = C.kuruwa.kinome_hon.centroid, saiMaeC = C.kuruwa.saikoji_mae.centroid, saiHonC = C.kuruwa.saikoji_hon.centroid,
      hatiMaeC = C.kuruwa.hachibuse_mae.centroid, hatiHonC = C.kuruwa.hachibuse_hon.centroid;

    // ---- 崖（鉢伏城のさらに西。通れない） ----
    for (const s of wallLine(rt, [[CLIFF_X, -70], [CLIFF_X, 50]], { team: 1, hp: 1e9, name: '崖', segLen: 14 })) { s.noTarget = true; s.wall = true; }

    // ---- 木戸（四城の入口。塀は castle_plan が門の幅だけ開けて四方を閉じる。ここに実の破れる戸を据える） ----
    F.gateKannon = kido(rt, GATE_KANNON.x, GATE_KANNON.z, 3, 0, { team: 1, hp: 100, name: GATE_KANNON.name, gate: 0 });
    F.gateKinome = kido(rt, GATE_KINOME.x, GATE_KINOME.z, 3, 0, { team: 1, hp: 120, name: GATE_KINOME.name, gate: 1 });
    F.gateSaikoji = kido(rt, GATE_SAIKOJI.x, GATE_SAIKOJI.z, 3, Math.PI / 2, { team: 1, hp: 260, name: GATE_SAIKOJI.name, gate: 2 });
    F.gateHachibuse = kido(rt, GATE_HACHIBUSE.x, GATE_HACHIBUSE.z, 3, Math.PI / 2, { team: 1, hp: 240, name: GATE_HACHIBUSE.name, gate: 3 });
    // 奥への口（扉の無い冠木門。castles/kinome.js の EXIT_*）
    for (const [x, z] of [EXIT_KANNON, EXIT_KINOME, EXIT_SAIKOJI, EXIT_HACHIBUSE]) rt.scene.add(kabukimon(W, x, z, 5.2, 0, { doors: false }));
    for (const [x, z, r] of [[GATE_KANNON.x - 8, GATE_KANNON.z - 2, 0.2], [GATE_KINOME.x + 8, GATE_KINOME.z - 2, -0.2], [GATE_HACHIBUSE.x, GATE_HACHIBUSE.z - 4, 0]]) rt.scene.add(sakamogi(W, x, z, r, 5));
    // 倒木と逆茂木：峠道の両脇に切り倒した木と尖った枝（道の外側。速さを落とす荷の遅さを見せる）
    for (const [x, z, r] of [[-10, -78, 0.3], [11, -64, -0.4], [-11, -46, 1.2], [-30, -22, 0.2], [-38, -12, -0.5]]) rt.scene.add(lumber(W, x, z, r));
    for (const [x, z, r] of [[-9, -84, 0], [10, -70, 0], [-26, -26, 1.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 物見櫓（木ノ芽峠城・鉢伏城。鉢伏は詰の城で広く見張る） ----
    F.towerKinome = monomi(rt, 10, 16, { name: '木ノ芽峠城の物見櫓' });
    F.towerHachibuse = monomi(rt, hatiHonC.x, hatiHonC.z + 6, { name: '鉢伏城の物見櫓（詰の城）' });

    // ---- 城の中の小屋（見た目） ----
    rt.scene.add(hut(W, kannonC.x - 6, kannonC.z - 4, 5, 4, 0.1, { wall: 0x5a4a38 }));
    rt.scene.add(hut(W, honC.x - 7, honC.z + 4, 7, 5, 0.15, { wall: 0x5a4a38 }), tawara(W, honC.x + 4, honC.z - 2, 0.2, 3));
    rt.scene.add(hut(W, saiHonC.x - 6, saiHonC.z + 4, 6, 4, -0.15, { wall: 0x5a4a38 }));
    rt.scene.add(hut(W, hatiHonC.x - 5, hatiHonC.z + 6, 6, 4, 0.1, { wall: 0x5a4a38 }));

    // ======================================================================
    // 守り（一揆勢300）：観音丸30・木ノ芽峠城（木戸内45・副郭25・主郭＝杉浦玄任の手45）・
    // 西光寺丸城（前郭28・本郭32）・鉢伏城（柵口18・本陣27）・東の尾根の伏兵20
    // ======================================================================
    const D = F.d = {};
    D.kannon = mkB(rt, { name: '観音丸城の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: kannonC, facing: 0 });
    D.kinomeSou = mkB(rt, { name: '木ノ芽峠城・木戸内の一揆勢', team: 1, faction: 'ikko', kind: 'ashigaru', mix: MIX, nominal: 28, armor: IKKO.armor, flag: IKKO.flag, at: souC, facing: 0 });
    D.kinomeFuku = mkB(rt, { name: '木ノ芽峠城・副郭の弓衆', team: 1, faction: 'ikko', kind: 'bow', nominal: 15, armor: IKKO.armor, flag: IKKO.flag, at: fukuC, facing: 0 });
    D.kinomeHon = mkB(rt, { name: '杉浦玄任の手（主郭）', team: 1, faction: 'ikko', kind: 'ashigaru', mix: MIX, general: '杉浦玄任', nominal: 36, armor: IKKO.armor, flag: IKKO.flag, at: honC, facing: 0 });
    D.saikojiMae = mkB(rt, { name: '西光寺丸城・前郭の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 28, armor: IKKO.armor, flag: IKKO.flag, at: saiMaeC, facing: -Math.PI / 2 });
    D.saikojiHon = mkB(rt, { name: '西光寺丸城・本郭の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 32, armor: IKKO.armor, flag: IKKO.flag, at: saiHonC, facing: -Math.PI / 2 });
    D.hachibuseMae = mkB(rt, { name: '鉢伏城・柵口の守兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 18, armor: IKKO.armor, flag: IKKO.flag, at: hatiMaeC, facing: Math.PI / 2 });
    D.hachibuseHon = mkB(rt, { name: '鉢伏城・詰の衆', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 27, armor: IKKO.armor, flag: IKKO.flag, at: hatiHonC, facing: Math.PI / 2 });
    D.ambush = mkB(rt, { name: '一揆の伏兵（東の尾根・森）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: 20, z: -18 }, facing: -Math.PI / 2 });
    F.defenders = Object.values(D);
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ======================================================================
    // 攻め手（明智光秀の手。織田。正面の主力・東西の別働・後備え）
    // ======================================================================
    F.ake = mkB(rt, { name: '明智光秀の手（主力）', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, general: '明智光秀', nominal: 320, armor: ODA.armor, flag: ODA.flag, at: { x: 0, z: -156 }, facing: 0 });
    F.east = mkB(rt, { name: '明智配下・東の別働（羽柴秀吉の手）', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, general: '羽柴秀吉', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: 16, z: -156 }, facing: 0 });
    F.west = mkB(rt, { name: '明智配下・西の別働', team: 0, faction: 'oda', kind: 'ashigaru', mix: MIX, nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: -16, z: -156 }, facing: 0 });
    F.reserve = mkB(rt, { name: '明智配下・後備え', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 120, armor: ODA.armor, flag: ODA.flag, at: { x: 0, z: -166 }, facing: 0 });
    F.attackers = [F.ake, F.east, F.west, F.reserve];
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of F.attackers) b.order({ id: 'hold' });

    // B 杉津口（海岸側。背景の戦いだけ。地図には出さない）
    DA_SUGITSU(rt);

    // ---- 区域の網（siege_zones.js）：観音丸→木ノ芽峠城（木戸内→副郭→主郭＝本丸）。東西の分かれ道は
    // 木ノ芽峠城の木戸内・観音丸から分かれ、西光寺丸城・鉢伏城へ（links）。主郭が落ちれば一揆の中核が崩れ勝ち ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'kannon', name: '観音丸城', test: C.kuruwa.kannon.test, pos: kannonC, need: 3, hold: 7, next: 'kinome_sou' },
        { id: 'kinome_sou', name: '木ノ芽峠城・木戸内', test: C.kuruwa.kinome_sou.test, pos: souC, need: 3, hold: 6, gate: GATE_KINOME.name, next: 'kinome_fuku' },
        { id: 'kinome_fuku', name: '木ノ芽峠城・副郭', test: C.kuruwa.kinome_fuku.test, pos: fukuC, need: 3, hold: 6, next: 'kinome_hon' },
        { id: 'kinome_hon', name: '木ノ芽峠城・主郭', test: C.kuruwa.kinome_hon.test, pos: honC, need: 5, hold: 10, honmaru: true },
        { id: 'saikoji_mae', name: '西光寺丸城・前郭', test: C.kuruwa.saikoji_mae.test, pos: saiMaeC, need: 4, hold: 10, next: 'saikoji_hon' },
        { id: 'saikoji_hon', name: '西光寺丸城・本郭', test: C.kuruwa.saikoji_hon.test, pos: saiHonC, need: 4, hold: 12 },
        { id: 'hachibuse_mae', name: '鉢伏城・柵口', test: C.kuruwa.hachibuse_mae.test, pos: hatiMaeC, need: 3, hold: 10, next: 'hachibuse_hon' },
        { id: 'hachibuse_hon', name: '鉢伏城・本陣（詰の城）', test: C.kuruwa.hachibuse_hon.test, pos: hatiHonC, need: 4, hold: 12 },
      ],
      links: [['kannon', 'kinome_sou'], ['kannon', 'hachibuse_mae'], ['kinome_sou', 'kinome_fuku'], ['kinome_fuku', 'kinome_hon'],
        ['kinome_fuku', 'saikoji_mae'], ['saikoji_mae', 'saikoji_hon'], ['hachibuse_mae', 'hachibuse_hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: F.defendTotal,
      commander: () => F.d.kinomeHon.taishoU,
      noReinforce: () => true,
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.win(rt),
      onSurrender: () => this.win(rt),
    });

    // 一揆の頭（siege_ai.js）：崩れた郭は次の郭へ退く。鎖は fallbackTo（castles/kinome.js）と同じ並び
    F.MD = makeMountainDefense(rt, {
      zones: F.SZ,
      posts: [
        { id: 'kannon', butai: D.kannon, at: kannonC, next: 'kinome_sou' },
        { id: 'kinome_sou', butai: D.kinomeSou, at: souC, next: 'kinome_fuku' },
        { id: 'kinome_fuku', butai: D.kinomeFuku, at: fukuC, next: 'kinome_hon' },
        { id: 'kinome_hon', butai: D.kinomeHon, at: honC },
        { id: 'saikoji_mae', butai: D.saikojiMae, at: saiMaeC, next: 'saikoji_hon' },
        { id: 'saikoji_hon', butai: D.saikojiHon, at: saiHonC },
        { id: 'hachibuse_mae', butai: D.hachibuseMae, at: hatiMaeC, next: 'hachibuse_hon' },
        { id: 'hachibuse_hon', butai: D.hachibuseHon, at: hatiHonC },
      ],
    });
    // 伏兵（東の尾根・森。siege_ai.js）：西光寺丸城へ寄せた手が近付くか、攻め手の力が集まったら横・後ろから出る
    F.AMB = makeMountainAmbush(rt, {
      zones: F.SZ,
      posts: [{ id: 'higashi', butai: D.ambush, at: { x: 26, z: -28 }, cover: '森の中', revealRange: 18, routeZoneId: 'saikoji_mae', concentrateShare: 0.4, side: 'flank' }],
    });

    // ---- 竹束の寄せ（taketaba.js）：それぞれの手は竹束を押し立て、ゆっくり木戸の前まで寄せて撃ち合う ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, {
      items: [
        { g: F.ake, yose: () => (F.kannonFell ? { x: GATE_KINOME.x, z: GATE_KINOME.z - 10 } : { x: GATE_KANNON.x, z: GATE_KANNON.z - 10 }), until: () => (F.kannonFell ? F.gateKinome.struct.hp <= 0 : F.gateKannon.struct.hp <= 0) },
        { g: F.east, yose: () => ({ x: GATE_SAIKOJI.x - 6, z: GATE_SAIKOJI.z - 8 }), until: () => !F.eastGo || F.gateSaikoji.struct.hp <= 0 },
        { g: F.west, yose: () => ({ x: GATE_HACHIBUSE.x, z: GATE_HACHIBUSE.z - 8 }), until: () => !F.westGo || F.gateHachibuse.struct.hp <= 0 },
      ],
      max: 7, avoid: [this.spawn],
    });
    // ---- 一番乗り（siege_zones.js）：木戸が破れても、自分が踏み込むまで味方は木戸の外で待つ ----
    F.FI = makeFirstIn(rt, { from: this.spawn, gates: [{ gate: F.gateKannon }, { gate: F.gateKinome }, { gate: F.gateSaikoji }, { gate: F.gateHachibuse }] });

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 0, z: -150 }, 0, [{ kind: 'spear', n }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '明智光秀の先手の一隊を預かり、木ノ芽峠の城塞群を攻め落とせ' : '明智光秀のもとで、下知を待て', 'main');
    rt.say('明智光秀', `${nm(rt)}、峠には城が四つ、尾根ごとに分かれて構えておる。柴田殿・羽柴殿の手も別の道から上る。わしらはまず観音丸城から崩す`, 5);
    rt.say('明智光秀', '西光寺丸城・鉢伏城は、放っておけば横から撃ちかけてくる。どこから攻めるかは軍議で決める', 4.5);
    rt.marker('ake', unitPos(F.ake.real.units[0]), '明智光秀', {});
    rt.after(14, () => this.assault(rt));
  },

  // ① 観音丸城から攻め上る（軍議の作戦で、東西の別働をいつ放つかが変わる）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('kannon');
    rt.unmark('ake');
    sfx('horagai', 0.85);
    announceAdvance(rt, '明智光秀');
    rt.obj('main', '観音丸城を落とせ', 'main');
    F.ake.assault = gateOf(F.gateKannon);
    setRoute(F.ake, ROAD_TO_KANNON);
    F.strategy = F.strategy || 'kinome_first';
    rt.marker('kannon', centerOf(F.d.kannon.real), () => `観音丸城・${moraleWord(F.d.kannon.morale)}`, { red: true });
  },

  // 東西の別働は、観音丸城の木戸が開いてから（道が一本しかないので、必ずここを通ってから分かれる）
  releaseEast(rt) { const F = rt.flags; if (F.eastGo) return; F.eastGo = true; F.east.assault = gateOf(F.gateSaikoji); setRoute(F.east, BRANCH_EAST_GO); rt.marker('saikoji', centerOf(F.d.saikojiMae.real), () => `西光寺丸城・${moraleWord(F.d.saikojiMae.morale)}`, { red: true }); },
  releaseWest(rt) { const F = rt.flags; if (F.westGo) return; F.westGo = true; F.west.assault = gateOf(F.gateHachibuse); setRoute(F.west, BRANCH_WEST_GO); rt.marker('hachibuse', centerOf(F.d.hachibuseMae.real), () => `鉢伏城・${moraleWord(F.d.hachibuseMae.morale)}`, { red: true }); },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'kannon' && !F.kannonFell) {
      F.kannonFell = true;
      rt.unmark('kannon');
      rt.banner('観音丸城を落とした', '木ノ芽峠城へ道が開く。羽柴殿の手と明智殿の手が、東西に分かれる');
      rt.obj('main', '木ノ芽峠城を落とせ', 'main');
      F.ake.assault = gateOf(F.gateKinome);
      setRoute(F.ake, ROAD_TO_KINOME);
      rt.marker('kinome', centerOf(F.d.kinomeSou.real), () => `木ノ芽峠城・${moraleWord(F.d.kinomeSou.morale)}`, { red: true });
      this.releaseEast(rt); this.releaseWest(rt);
      // 軍議で選んだ先手に、後備えを足す（kinome_first は本隊＝明智の手の後詰のまま）
      if (F.strategy === 'saikoji_first') { rt.say('羽柴秀吉', '手前は先に東の尾根より、西光寺丸城を衝き申す', 3.5); F.reserve.assault = gateOf(F.gateSaikoji); setRoute(F.reserve, BRANCH_EAST_GO); }
      else if (F.strategy === 'hachibuse_first') { rt.say('明智光秀', '先に鉢伏城の高みを押さえよ。西へ回れ', 3.5); F.reserve.assault = gateOf(F.gateHachibuse); setRoute(F.reserve, BRANCH_WEST_GO); }
      else { F.reserve.assault = gateOf(F.gateKinome); setRoute(F.reserve, ROAD_TO_KINOME); }
    } else if (id === 'kinome_sou' && !F.souFell) {
      F.souFell = true;
      rt.unmark('kinome');
      rt.banner('木戸内を破った', '木ノ芽峠城の奥へ攻め入る');
      F.ake.assault = null;
      setRoute(F.ake, ROAD_TO_HON);
    } else if (id === 'saikoji_mae' && !F.saiMaeFell) {
      F.saiMaeFell = true;
      F.east.assault = null; F.reserve.assault = null;
      rt.banner('西光寺丸城・前郭を破った', '本郭へ攻め寄せる');
    } else if (id === 'hachibuse_mae' && !F.hatiMaeFell) {
      F.hatiMaeFell = true;
      F.west.assault = null; F.reserve.assault = null;
      rt.banner('鉢伏城の柵口を破った', '詰の城の本陣へ攻め上る');
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '木ノ芽峠の城塞群を攻め落とした', pts: 24 }; }, '任務達成・木ノ芽峠の城塞群を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('木ノ芽峠城、落城', '一揆の中核は崩れ、城塞群の旗は次々に倒れた');
    rt.say('明智光秀', `${nm(rt)}、峠は越えた。この先、府中・大滝寺へなお道は続く`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // IF：時をかけすぎ、城塞群を崩し切れず退く（一揆が峠を守り切った扱い。地形・城郭は史実のまま、勝ち負けだけ変わる）
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('峠は守り切られた', '日が傾き、これ以上は兵を損じるのみと下知が下る');
    rt.say('明智光秀', 'もう日がない……一度、兵を退く。峠は、一揆がよう守り抜いた', 4.5);
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
    if (F.MD) F.MD.tick(dt);
    if (F.AMB) F.AMB.tick(dt);
    if (F.step >= 1) tickRoutes(F.attackers);
    if (F.FI) F.FI.tick();
    // 放つ前の東西の別働・後備えは、ai.js の「70m内に敵が来たら持ち場から出て戦う」に引っかかって
    // 動かせなくなる（号令：attack のまま動かない）ので、下知がまだ hold の間は g.stay で止めておく
    for (const b of [F.east, F.west, F.reserve]) if (b.real && b.cmd.id === 'hold') b.real.stay = true;

    // 一城を無視すると横から撃たれる：西光寺丸城・鉢伏城の前郭が残っていれば、近くを通る明智の主力へ
    // 遠くからの一撃（lightClash。army_think の aggro 任せにせず、放っておいた城の報いを明に見せる）
    if (near(F.d.saikojiMae, F.ake, 26) && !F.saiMaeFell) lightClash(F.d.saikojiMae, F.ake, dt, 0.4);
    if (near(F.d.hachibuseMae, F.ake, 26) && !F.hatiMaeFell) lightClash(F.d.hachibuseMae, F.ake, dt, 0.4);

    if (F.step >= 1) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.kannonFell) rt.objProgress('main', `観音丸城・${zoneWord(st.kannon)}`);
      else if (!F.souFell) rt.objProgress('main', `木ノ芽峠城・木戸内・${zoneWord(st.kinome_sou)}`);
      else if (!F.ending) rt.objProgress('main', `木ノ芽峠城・主郭・${zoneWord(st.kinome_hon)}`);
    }
    // IF：8分かけても主郭が落ちねば、一揆が守り切った扱いで終える（確かめを止めない保険も兼ねる）
    // 史実の挟み撃ち：海沿いの杉津口を破った羽柴・丹羽の手が、峠の背へ回る。5分半を過ぎても主郭が落ちなければ、
    // 城塞群の守りが背から崩れる（bot の遊び手が 8 分で主郭に届かず「守り切られた」で終わっていた。見回り 10/2）
    if (!F.backHit && F.step >= 1 && rt.t - (F.stepT || 0) > 330 && !F.ending) {
      F.backHit = true;
      rt.banner('杉津口の手、峠の背へ', '海沿いを破った羽柴・丹羽の手が、城塞群の後ろから攻めかかる');
      rt.say('明智光秀', '背の旗が乱れた！　今じゃ、主郭へ押し込め！', 3.5);
      for (const g of rt.army.groups) if (g.team === 1 && g.count > 0 && !g.civ) g.morale = Math.min(g.morale ?? 100, 30);
      for (const b of F.defenders || []) if (b && b.morale != null) b.morale = Math.min(b.morale, 30);
    }
    if (rt.t - (F.stepT || 0) > 480 && !F.ending) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
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

// B 杉津口（海岸側。背景の戦いだけ。遠くの旗・音で、二正面から一揆の線を崩している事を見せる）
function DA_SUGITSU(rt) {
  const W = rt.world;
  W.addDistantArmy({ x: -140, z: 10, w: 24, d: 20, count: 140, facing: Math.PI / 2, armor: 0x2b3140, flagTex: flagTexture('oda'), seed: 15920 });
  W.addDistantArmy({ x: -158, z: -10, w: 18, d: 16, count: 90, facing: -Math.PI / 2, armor: 0x3a342c, team: 1, flagTex: flagTexture('namu'), seed: 15921 });
  // 遠景に狼煙の煙を一本立てる（台詞の「狼煙が見える」に絵を合わせる）
  { const sx = -150, sz = 4; W.addSmokeColumn(sx, W.heightAt(sx, sz) + 6, sz, { size: 3.4 }); }
  // 大軍に見せる：本隊の後ろに続く織田の列（軽い作り）
  W.addDistantArmy({ x: 6, z: -214, w: 22, d: 26, count: 260, facing: 0, armor: 0x2b3140, flagTex: flagTexture('oda'), seed: 15922 });
  rt.after(40, () => { if (!rt.flags.ending) rt.bark('杉津口でも戦いが始まった、との狼煙が見える'); });
  // 峠ならではの出来事：山の上から丸太が転がされる
  rt.after(95, () => { if (!rt.flags.ending) { sfx('wood', 0.9); rt.say('明智光秀', '上から丸太を転がしてくるぞ！　道の脇へ寄れ！', 3); } });
  rt.after(100, () => { if (!rt.flags.ending) sfx('wood', 0.8); });
  rt.after(160, () => { if (!rt.flags.ending) rt.bark('杉津口の手も、海岸の道を押し上げておる由'); });
}

kinome.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 };
};
kinome.sides = { a: { name: '織田軍（明智光秀）', mon: 'oda' }, b: { name: '越前一向一揆・木ノ芽峠の城塞群', mon: 'namu' } };
kinome.famous = [
  { name: '杉浦玄任', g: /主郭|本陣/, loose: 1, line: '杉浦玄任なり！　この峠は、一揆の命の砦ぞ！' },
  { name: '明智光秀', team: 0, line: '尾根ごとに城がある。一つずつ、しかし急げ' },
];
kinome.date = () => '天正三年八月　秋・霧';
kinome.history = '天正三年（1575）八月、信長は大軍で越前へ攻め入った。一向一揆は木ノ芽峠一帯の鉢伏城・木ノ芽峠城・西光寺丸城・観音丸城などに拠って防衛線を敷いた。明智光秀・羽柴秀吉らの手が木ノ芽峠口・杉津口の二方向から攻め、城塞群は次々に落ちた。ここでは尾根ごとに分かれた四つの城を、どこから攻めるか選びながら崩していく一戦とした。曲輪の数・配置の細部は推定（HIST_B）、城塞群の位置・標高・峠道の険しさは史実（HIST_A）による。兵の数には諸説ある。';
kinome.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// 軍議（gungi.js）：四つの城のどれから崩すかの三択（既定＝観音丸城を落としてから東西へ別働を放つ）
kinome.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -140 }, dist: 110,
    units: [{ id: 'plan', name: '明智光秀の手（先手）', group: () => F.ake && F.ake.real, nominal: () => (F.ake ? F.ake.aliveNominal() : 0) }],
    routes: [
      { id: 'kinome_first', name: '観音丸城を落とした後、後備えで木ノ芽峠城を押す' },
      { id: 'saikoji_first', name: '観音丸城を落とした後、後備えで東の尾根（西光寺丸城）を衝く（伏兵に遭いやすい）' },
      { id: 'hachibuse_first', name: '観音丸城を落とした後、後備えで西（鉢伏城）の高みを押さえる' },
    ],
    default: { plan: 'kinome_first' },
    enemy: [
      { name: '観音丸城・木ノ芽峠城', known: true, count: () => ['kannon', 'kinomeSou', 'kinomeFuku', 'kinomeHon'].reduce((s, k) => s + (F.d && F.d[k] ? F.d[k].aliveNominal() : 0), 0) },
      { name: '西光寺丸城・鉢伏城', known: false },
      { name: '東の尾根の伏兵（噂）', known: false },
    ],
    onStart: (assign) => kinome.onGungiStart(rt, assign),
  };
  const auto = window.__kinomeStrategy || (/[?&]bot/.test(location.search) ? 'kinome_first' : null);
  if (auto) { kinome.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
kinome.onGungiStart = (rt, assign) => { rt.flags.strategy = (assign && assign.plan) || 'kinome_first'; };

// 素直な遊び手：敵へ向かって戦い、無ければ明智の手の中ほどへ
kinome.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const c = F.ake ? F.ake.pos : { x: u.pos.x, z: u.pos.z };
  goTo(p, inp, c.x, c.z + 4, 3);
};

export { kinome };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: 31, tx: 0, tz: -30, w: 60, R: 125, rise: 80 };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [ROAD.slice(0, IX(-30) + 1)]);
  return BENCHED(x, z);
}
