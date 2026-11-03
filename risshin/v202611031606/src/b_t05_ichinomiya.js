// ======================================================================
// 豊臣編⑤　四国征伐／一宮城（天正十三年 1585 六月〜七月・夏）　docs/chapter2_toyotomi.md の「5.」が正
// 羽柴秀長・秀次の大軍が阿波へ渡り、長宗我部方の谷忠澄・江村親俊が守る一宮城を囲んだ。秀長は城の水の手を断ち、
// 城兵は水に苦しんだ。谷忠澄は城を開き、元親に降伏を説いた。
// 自分は秀長の下の部将。水の手を断つ別の手を率いる：
//   1 鮎喰川を渡り、麓の砦を落とす → 2 谷を回り、水の手を守る兵を追い払う → 3 水場を押さえ、取り返しに来る城兵を退ける
//   → 4 搦手の尾根を登り、本丸の前で開城の使者を迎える。負け方：水場を取り返される・六分を過ぎる。
// 座標：南が +z、北が −z。南の河原から北の城山へ攻め上る。城山・西の尾根・川筋は一宮町の形を縮めて置いた推定。
// 縄張り（docs/battle_refs/t05_ichinomiya.md）：城山は東西に延びる尾根。西の頂に本丸、東の峰に明神丸、間を堀切で断つ。
// 本丸の南に小倉丸、明神丸の南に才蔵丸。天正十三年は長宗我部の土の城（切岸・土塁・板塀。天守は無い。本丸の石垣は後の蜂須賀の普請とみる）。
// 鮎喰川は城山の南の河原を東へ流れ、東の麓で北へ曲がる。大手は東の麓から明神丸へ、搦手は西の谷（水の手）から小倉丸へ。
// 国土地理院の標高（asset_dem_ichinomiya.js・tools/dem.mjs の ichinomiya）が読めた時だけ、遠い山肌に実測の凹凸を足す。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { distToPolyline } from './world.js';
import { nobori, hut, yagura, jinmaku, palisade } from './props.js';
import { allyGroup, nm } from './bhelp.js';
import { heightOf, buildCastlePlan, rectPoly, inPoly } from './castle_plan.js';
import { castleBoardFence, ishigaki } from './props.js';
import { RANKS } from './state.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, depthBot, rest, fight, hold, move } from './b_depth.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { toyoClash } from './toyo_mob.js';

// ---------------- 場所 ----------------
const SPAWN = { x: 24, z: 168 };
const HONJIN = { x: 52, z: 176 };               // 秀長の本陣（河原の南）
const HILL = { x: 0, z: -112 };                 // 一宮城山（東西の尾根の真ん中）
// 尾根の背 [x, z, 高さ]：西の頂が本丸、鞍部（堀切）を挟んで東の峰が明神丸、東の麓（大手）へ下る
const SPINE = [[-150, -150, 18], [-72, -124, 34], [-20, -118, 44], [6, -112, 37], [34, -108, 42], [82, -96, 24], [140, -78, 6]];
const RIDGE = { x: -178, z: -50 }, RIDGE_H = 30, RIDGE_R = 104;   // 西の尾根（城山との間が水の手の谷）
const FORT = { x: 30, z: 52 };                  // 麓の砦
const VALLEY = { x: -70, z: 18 };               // 谷の口
const WATER = { x: -86, z: -40 };               // 水の手（湧き水の水場）
const HON_GATE = { x: -16, z: -90 };            // 本丸の前（搦手の口）
// 鮎喰川（西から東へ）。浅瀬が多く、どこでも歩いて渡れる深さにする
// 東の麓で北へ曲がる（一宮の町で鮎喰川は北へ向きを変え、吉野川へ注ぐ）
const RIVER = [[-300, 96], [-200, 108], [-110, 98], [-20, 110], [60, 100], [150, 108], [205, 84], [236, 20], [248, -80], [256, -200], [262, -320]];
const ROAD = [[SPAWN.x, SPAWN.z], [26, 120], [30, 70], [FORT.x, FORT.z]];
const VALLEY_ROAD = [[FORT.x, FORT.z], [-20, 34], [VALLEY.x, VALLEY.z], [WATER.x, WATER.z]];
const KARAMETE = [[WATER.x, WATER.z], [-62, -68], [-36, -86], [HON_GATE.x, HON_GATE.z]];
const OTE = [[150, -50], [104, -70], [74, -88], [56, -106]];   // 大手道（東の麓から明神丸の東の口へ。見せるだけ）
const LIMIT = 360;                               // 段の始めから六分

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
let dem = null;
// 標高の束（tools/dem.mjs の ichinomiya）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t05_ichinomiya = Object.freeze([...assetsForBattle(''), 'dem_ichinomiya']);
useTerrain('dem_ichinomiya', (d) => { dem = d; });
// 折れ線（高さ付き）への最も近い所の距離と背の高さ
function spineAt(x, z) {
  let best = Infinity, bh = 0;
  for (let i = 0; i < SPINE.length - 1; i++) {
    const [ax, az, ah] = SPINE[i], [bx, bz, bh2] = SPINE[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bh = ah + (bh2 - ah) * t; }
  }
  return [best, bh];
}
// 尾根を横に断つ溝（堀切・竪堀）：a→b の線から w/2 の内を、深さ deep の薬研に掘る
const CUTS = [
  { a: [6, -96], b: [6, -130], w: 8, deep: 4.5 },      // 本丸と明神丸の間の堀切
  { a: [-48, -104], b: [-52, -138], w: 7, deep: 3.5 }, // 本丸の西の堀切（尾根続きを断つ）
  { a: [62, -96], b: [74, -62], w: 3.2, deep: 1.6 },   // 明神丸の南東の竪堀
  { a: [14, -96], b: [16, -64], w: 3.2, deep: 1.6 },   // 鞍部から南へ落ちる竪堀
];
function cutAt(x, z) {
  let dip = 0;
  for (const c of CUTS) {
    const [ax, az] = c.a, [bx, bz] = c.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = ((x - ax) * dx + (z - az) * dz) / l2;
    if (t < -0.05 || t > 1.05) continue;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t), hw = c.w / 2;
    if (d < hw) dip = Math.max(dip, c.deep * (1 - d / hw) * sm(Math.min(t + 0.05, 1.05 - t) / 0.15));
  }
  return dip;
}
// 水の手の貯水池（石で囲った四角い溜め。底は 1.3m 下がる）
const POOL = { x0: WATER.x - 5, x1: WATER.x + 5, z0: WATER.z - 3.5, z1: WATER.z + 3.5 };
function base(x, z) {
  let h = 2 + 0.6 * Math.sin(x * 0.02) * Math.cos(z * 0.017);
  // 城山：背から横へ 9m を越えると 0.45 の勾配で麓へ落ちる（尾根の上は細い平らな背）
  const [sd, sh] = spineAt(x, z);
  h = Math.max(h, sh - 0.45 * Math.max(0, sd - 9) + 0.8 * Math.sin(x * 0.07) * Math.cos(z * 0.05));
  h += RIDGE_H * sm(1 - Math.hypot(x - RIDGE.x, z - RIDGE.z) / RIDGE_R);
  // 北と西の外は阿波の山並みへ上がる（東は鮎喰川の谷の向こうで上がる）
  h += Math.max(0, -z - 190) * 0.35 + Math.max(0, -x - 200) * 0.3 + Math.max(0, x - 285) * 0.3;
  h -= cutAt(x, z);
  if (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1) h -= 1.3;
  // 河原は広く平らに
  const rd = distToPolyline(x, z, RIVER);
  if (rd < 30) h -= (1 - rd / 30) * 1.2;
  // 実測の凹凸は、戦う所から離れた山肌だけ
  if (dem) {
    const away = sm((Math.min(Math.hypot(x - HILL.x, z - HILL.z), Math.hypot(x - WATER.x, z - WATER.z), Math.hypot(x - FORT.x, z - FORT.z)) - 120) / 40);
    if (away > 0) h += away * demDetail(dem, x, z, { xy: 1, win: 60, scale: 0.3 });
  }
  return h;
}

// ---------------- 縄張り（castle_plan.js） ----------------
// 曲輪の高さはその所の地形から決める（尾根の背の形を変えても追随する）。塀は狭間を切った板塀、縁は土塁と切岸
const lv = (x, z, up = 0.5) => (b) => b(x, z) + up;
const PLAN = {
  mon: 'chosokabe', name: '一宮城', type: 'yama', year: 1585, gateSlope: 7,
  kuruwa: [
    { id: 'hon', name: '本丸', level: lv(-20, -118), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'hon', poly: rectPoly(-36, -6, -128, -110), gapAt: [[-16, -110]], gapW: 4.4 },
    { id: 'ogura', name: '小倉丸', level: lv(-16, -98), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'ni', poly: rectPoly(-32, 0, -106, -90), gapAt: [[-16, -106], [HON_GATE.x, -90]], gapW: 4.4 },
    { id: 'myojin', name: '明神丸', level: lv(34, -108), wall: 'dobei', wallMesh: castleBoardFence, wallOpt: { h: 2.4 }, kind: 'ni', poly: [[18, -122], [46, -124], [54, -108], [48, -96], [20, -96]], gapAt: [[54, -108], [34, -96]], gapW: 4.4 },
    { id: 'saizo', name: '才蔵丸', level: lv(34, -86, 0.4), wall: 'saku', kind: 'koshi', poly: rectPoly(22, 46, -92, -78), gapAt: [[34, -92]], gapW: 4.4 },
  ],
  koguchi: [
    { id: 'karamete', name: '搦手の門', from: 'out', to: 'ogura', kind: 'hira', gate: 'yagura', at: [HON_GATE.x, -90], rot: 0, w: 4.4 },
    { id: 'hon', name: '本丸の口', from: 'ogura', to: 'hon', kind: 'hira', gate: 'kabuki', at: [-16, -110], rot: 0, w: 4.4 },
    { id: 'ote', name: '大手の門', from: 'out', to: 'myojin', kind: 'hira', gate: 'yagura', at: [54, -108], rot: Math.PI / 2, w: 4.4 },
    { id: 'saizo', name: '才蔵丸の口', from: 'saizo', to: 'myojin', kind: 'hira', at: [34, -96], rot: 0, w: 4.4 },
  ],
  // 横矢：搦手の門の両脇と、大手の門の上に井楼。狭間の板塀と合わせて、門へ寄る者を二方から撃つ
  yagura: [
    { id: 'kara_w', name: '搦手の西の櫓', at: [-29, -93], rot: 0 },
    { id: 'kara_e', name: '搦手の東の櫓', at: [-3, -93], rot: 0 },
    { id: 'hon_n', name: '本丸の櫓', at: [-32, -124], rot: Math.PI },
    { id: 'myo_e', name: '明神丸の櫓', at: [44, -100], rot: Math.PI / 2 },
  ],
  // 天守の無い土の城：本丸の奥に板葺きの主殿（城将の谷忠澄の居所）
  lordSeat: { kind: 'goten', at: [-22, -121], rot: 0, w: 11, d: 6, name: '本丸の主殿', boardRoof: true },
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }
// 曲輪とその縁の m の内（木を生やさない所）
const inCastle = (x, z, m) => PLAN.kuruwa.some((k) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].some(([dx, dz]) => inPoly(k.poly, x + dx, z + dz)));

// 長宗我部方の見た目：七つ片喰の旗と、黒茶の具足（FACTION に無い家なので o で分ける）
const CHOSO = { flag: 'chosokabe', armor: 0x3a3024, lace: 0x5a6a3a, hatColor: 0x2e2a22 };
const look = (list) => list.map((q) => ({ ...q, o: { ...CHOSO, ...(q.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uB = (n) => ({ type: 'bow', n }), uG = (n) => ({ type: 'gun', n });
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// ---------------- 小道具 ----------------
function buildStage(rt) {
  const W = rt.world, S = rt.scene;
  // 麓の砦：柵の輪（南の口を空ける）と井楼、片喰の旗
  const R = 13, N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    if (Math.cos((a0 + a1) / 2) > 0.9) continue;   // 南（+z）の口
    S.add(palisade(W, [FORT.x + Math.sin(a0) * R, FORT.z + Math.cos(a0) * R, FORT.x + Math.sin(a1) * R, FORT.z + Math.cos(a1) * R]));
  }
  S.add(yagura(W, FORT.x - 6, FORT.z - 6, { team: 1, mon: 'chosokabe' }));
  for (const [dx, dz] of [[-9, 8], [9, 8], [0, -11]]) S.add(nobori(W, FORT.x + dx, FORT.z + dz, 'chosokabe', 5));
  // 城：曲輪・切岸・土塁・狭間の板塀・櫓門・井楼・主殿（縄張りは PLAN）
  rt.flags.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, buildGates: true, buildTowers: true, interiorGuards: false });
  // 水の手：湧き水を石で囲って溜めた貯水池と、番小屋
  const P = POOL, ring = [[P.x0, P.z0], [P.x0, P.z1], [P.x1, P.z1], [P.x1, P.z0], [P.x0, P.z0]];
  const rimY = Math.min(...ring.map(([x, z]) => W.heightAt(x, z))) + 0.1;   // 天端は水平に、低い角の地面に揃える（外へ箱のように立たない）
  S.add(ishigaki(W, ring, { out: -1, topY: rimY, maxH: 1.8, minH: 1.2 }));
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0 - 0.4, P.z1 - P.z0 - 0.4), new THREE.MeshLambertMaterial({ color: 0x2c4a44, transparent: true, opacity: 0.9 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(WATER.x, rimY - 0.45, WATER.z);
  S.add(pond, hut(W, WATER.x - 12, WATER.z - 8, 5, 4, 0.3, { h: 2.4 }));
  // 秀長の本陣
  S.add(jinmaku(W, HONJIN.x, HONJIN.z, 14, 10, 6));
  for (const dx of [-8, 0, 8]) S.add(nobori(W, HONJIN.x + dx, HONJIN.z - 7, 'oda', 6));
  // 大軍に見せる：河原を渡る羽柴の大軍、城山の長宗我部勢
  KIT.farHost(rt, 90, 128, 30, 14, 260, Math.PI, KIT.ARMOR.oda, 'oda', 1585, 'spear');
  KIT.farHost(rt, -40, 136, 30, 14, 240, Math.PI, KIT.ARMOR.oda, 'oda', 1586, 'mixed');
  KIT.farHost(rt, 130, 168, 26, 12, 200, Math.PI, KIT.ARMOR.oda, 'oda', 1587, 'spear');
  KIT.farHost(rt, 34, -112, 16, 7, 120, 0, CHOSO.armor, 'chosokabe', 1588, 'spear');   // 明神丸に籠る城兵
  // 鮎喰川の岸で、先に渡りかけた羽柴の先手と、川を越えて押し返す長宗我部の兵が斬り合う（始めの25秒のカメラの右前 45m。川に沿う前線を斜めに見る）
  toyoClash(rt, { x: -32, z: 116, facing: Math.PI + 0.35, w: 40, seed: 1589,
    A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 150 }, B: { flag: 'chosokabe', armor: CHOSO.armor, count: 140 } });
}

// ---------------- 段 ----------------
function ctxOf(rt) {
  const F = rt.flags;
  return { faction: 'oda', flag: 'chosokabe', armor: CHOSO.armor, look, dmg: 0.6, mass: 150, fixedSpawn: true,
    friends: () => F.allies.filter((g) => g && g.count && !g.routed),
    aid: { name: '秀長の手の後続', faction: 'oda', flag: 'oda', list: [uS(1), uA(9)] }, aidSaid: '秀長の手の後続が加わった' };
}
function steps(rt) {
  const F = rt.flags, me = (r) => nm(r);
  return [
    // いくつもの方面から四国へ・総大将は秀長（battle_events_1101）
    rest({ dur: 15, heal: 0, say: [['羽柴秀長', '兄者に代わり、この秀長が総大将じゃ。宇喜多と官兵衛は讃岐、小早川は伊予から入った', 3.4],
      ['羽柴秀長', '力で落とすな。水を断てば城は開く', 3.2], [me, '兵を死なせずに済みますな', 2.6], ['蜂須賀家政', '麓の砦は長宗我部の支城。手強う抗うてきますぞ', 3], ['羽柴秀長', '鮎喰川を渡り、麓の砦から崩せ', 2.6]] }),
    fight({ at: FORT, title: '鮎喰川', sub: '川を渡り、麓の砦へ', obj: (r) => (HI(r) ? '預かった手で鮎喰川を渡り、麓の砦を落とせ' : '鮎喰川を渡り、麓の砦を落とせ'),
      foes: () => [{ name: '麓の砦の守兵', from: { x: FORT.x, z: FORT.z - 4 }, list: [uS(2), uA(10), uG(3)], mass: 120 }],
      later: [{ t: 28, say: ['足軽', '城山から加勢が下りてくる！'], foes: () => [{ name: '砦の加勢', from: { x: FORT.x - 10, z: FORT.z - 30 }, list: [uS(1), uA(8)], mass: 100 }] }],
      max: 85, reward: '麓の砦を落とした', onEnd: () => { F.step = 1; } }),
    move({ to: VALLEY, obj: '谷を回り、水の手へ向かえ', label: '谷の口', r: 10, max: 50,
      say: [['羽柴秀長の使番', '砦は落ちた。西の谷へ回れ。城の水の手はその奥じゃ', 3.5]] }),
    fight({ at: WATER, title: '水の手', sub: '城の水場を守る兵', obj: '水の手を守る兵を追い払え',
      foes: () => [{ name: '水の手の番兵', from: { x: WATER.x + 4, z: WATER.z - 6 }, list: [uS(2), uA(10), uB(3)], mass: 120 }],
      later: [{ t: 24, say: ['足軽', '尾根の陰から伏兵じゃ！'], foes: () => [{ name: '谷の伏兵', from: { x: WATER.x - 26, z: WATER.z + 10 }, list: [uS(1), uA(8)], mass: 80 }] }],
      max: 80, reward: '水の手の番兵を追い払った', onEnd: () => { F.step = 2; } }),
    hold({ at: WATER, dur: 55, r: 14, title: '水場を押さえる', sub: '城兵が水を取り返しに来る', label: '水の手',
      obj: '水場を押さえ、取り返しに来る城兵を退けよ',
      say: [['羽柴秀長の使番', 'ここを渡すな。城の者は水が無ければ持たぬ', 3.5]],
      waves: [
        { t: 4, say: ['足軽', '搦手から城兵が下りてくる！'], foes: () => [{ name: '水を取り返す城兵', from: { x: -50, z: -74 }, list: [uS(2), uA(11)], mass: 140 }] },
        { t: 26, say: ['足軽', '水桶を担いだ者までおる。必死じゃ！'], foes: () => [{ name: '江村親俊の手', from: { x: -40, z: -60 }, list: [uS(2), uA(9), uG(2)], mass: 120 }] },
      ],
      reward: '城の水の手を断った', lost: ['羽柴秀長の使番', '水場を取り返されたか……'],
      onEnd: (r, m, won) => {
        if (!won) { ichinomiya.lose(r, '水場を取り返された'); return; }
        F.step = 3;
        // 讃岐から回ってきた官兵衛の手が水の手に加わる
        F.kanbei = allyGroup(r, { name: '黒田官兵衛の手', anchor: { x: WATER.x + 18, z: WATER.z + 22 }, facing: Math.PI, noRout: true, aggro: 6, seekRange: 12, fullStrength: true },
          [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, flag: 'oda' } }, uS(1), uA(4)]);
      } }),
    rest({ dur: 10, heal: 0.3, say: [['黒田官兵衛', '讃岐から回って参った。植田の城は罠ゆえ捨て置いた', 3.2], ['羽柴秀長の使番', '城の煙が細うなった。水が尽きかけておる', 3], ['羽柴秀長の使番', '搦手の尾根を登り、本丸の前で使者を待て', 3]] }),
    move({ to: HON_GATE, obj: '搦手の尾根を登り、本丸の前へ', label: '本丸の前', r: 10, max: 70,
      ambush: { d: 50, say: ['足軽', '尾根に残った者が槍を向けてくる！'], foes: () => [{ name: '尾根の残り兵', from: { x: -40, z: -82 }, list: [uS(1), uA(6)], mass: 0 }] } }),
  ];
}

export const t05_ichinomiya = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  noReserve: true, noTaishoRaid: true,
  world: {
    seed: 1585, time: 'day', muddy: 0.15,
    paths: [ROAD, VALLEY_ROAD, KARAMETE, OTE],
    height,
    streams: [{ pts: RIVER, w: 8, depth: 0.7 }],
    // 河原は白い砂利、山は夏の濃い緑
    tint(x, z, h, c) {
      const rd = distToPolyline(x, z, RIVER);
      if (rd < 26) { const k = (1 - rd / 26) * 0.75; c.setRGB(c.r * (1 - k) + 0.62 * k, c.g * (1 - k) + 0.6 * k, c.b * (1 - k) + 0.54 * k); }
      else if (h > 10) { const k = Math.min(1, (h - 10) / 20) * 0.45; c.setRGB(c.r * (1 - k) + 0.12 * k, c.g * (1 - k) + 0.26 * k, c.b * (1 - k) + 0.1 * k); }
    },
    clear: (x, z) => Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16 || Math.hypot(x - FORT.x, z - FORT.z) < 18 || Math.hypot(x - WATER.x, z - WATER.z) < 14 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 14 ||
      inCastle(x, z, 6) || distToPolyline(x, z, OTE) < 4 || distToPolyline(x, z, ROAD) < 5 || distToPolyline(x, z, VALLEY_ROAD) < 5 || distToPolyline(x, z, KARAMETE) < 4,
    trees: 900, tufts: 2400,
    treeDensity: (x, z) => (distToPolyline(x, z, RIVER) < 26 ? 0 : height(x, z) > 9 ? 1.3 : 0.25),
    fleeOut: (x, z, team) => team === 1 && z < -170,
  },
  sides: { a: { name: '羽柴秀長の軍', mon: 'oda' }, b: { name: '長宗我部方（一宮城）', mon: 'chosokabe' } },
  date: () => '天正十三年七月　夏・晴れ',

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    buildStage(rt);
    // 味方：秀長の旗本（本陣に残る）と、自分が率いる別の手の二組
    allyGroup(rt, { name: '羽柴秀長の旗本', anchor: { x: HONJIN.x, z: HONJIN.z + 2 }, facing: Math.PI, fixed: true, noRout: true, aggro: 4 },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, flag: 'oda' } }, uS(3)]);
    F.allies = [
      allyGroup(rt, { name: '蜂須賀家政の手', anchor: { x: SPAWN.x - 24, z: SPAWN.z - 4 }, facing: Math.PI, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 },
        [{ type: 'busho', n: 1, o: { name: '蜂須賀家政', invuln: true, horse: true, flag: 'oda' } }, uS(1), uA(8)]),
      allyGroup(rt, { name: '別の手の先手', anchor: { x: SPAWN.x - 8, z: SPAWN.z - 10 }, facing: Math.PI, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 }, [uS(2), uA(16)]),
      allyGroup(rt, { name: '別の手の二陣', anchor: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, facing: Math.PI, noRout: true, aggro: 12, morale: 90, dmgMult: 0.55 }, [uS(1), uA(12), uG(4)]),
    ];
    for (const g of F.allies) KIT.backOf(rt, g, { flag: 'oda', armor: KIT.ARMOR.oda, kind: 'spear', w: 16, depth: 8, count: 120, seed: 1590 + g.count });
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: SPAWN.x + 2, z: SPAWN.z + 4 }, Math.PI, [{ kind: 'spear', n }]);
    rt.after(10, () => { if (!F.ending) F.t0 = rt.t; });
    depthStart(rt, ctxOf(rt), steps(rt), () => ichinomiya.envoy(rt));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    if (!F.ending && F.t0 != null && rt.t - F.t0 > LIMIT && F.step < 3 && rt.canFailMission()) ichinomiya.lose(rt, '日が傾き、水の手を断てなんだ');
  },

  // 本丸の前：谷忠澄が開城の使者として出てくる
  envoy(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    for (const g of rt.army.groups) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    allyGroup(rt, { name: '開城の使者', anchor: { x: HON_GATE.x + 2, z: HON_GATE.z - 8 }, facing: 0, fixed: true, noRout: true, aggro: 0, fullStrength: true },
      [{ type: 'busho', n: 1, o: { ...CHOSO, name: '谷忠澄', invuln: true } }, { type: 'samurai', n: 2, o: { ...CHOSO, keep: true } }]);
    rt.banner('一宮城、開城', '谷忠澄が使者として本丸を出る');
    rt.after(1, () => rt.say('谷忠澄', '水が尽きた。これ以上は兵が死ぬだけじゃ', 3.5));
    rt.after(5, () => rt.say('羽柴秀長', 'よう城を開かせた。元親にも伝えよ', 3.5));
    rt.after(9, () => rt.say(nm(rt), '承知。一人でも多く、生きて帰しましょう', 3));
    rt.after(13, () => rt.say('使番', '小早川隆景様は伊予を、宇喜多秀家様は讃岐を平らげられた由', 3.4));
    rt.after(17, () => rt.say('長宗我部元親', '……忠澄の申す通りじゃ。三方から攻められては土佐も持たぬ。秀長殿に降ろう', 4));
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水の手を断ち、一宮城を開かせた', pts: 15 }; }, '一宮城を開かせた');
    rt.after(3, () => rt.army.celebrate(0));
    rt.finish({}, 22);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.banner('一宮城、落ちず', why);
    rt.finish({ failureReason: why }, 6);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
};
const ichinomiya = t05_ichinomiya;

// 兵数は諸説。秀長・秀次の阿波勢はおよそ四万余、一宮城の城兵はおよそ五千とする
t05_ichinomiya.force = (rt) => {
  const F = rt.flags;
  const b = Math.max(0, 5000 - (F.ek || 0) * 25 - (F.step || 0) * 400);
  return { a: 40000 - (F.ak || 0) * 20, a0: 40000, b: F.ending && rt.tracker.main ? Math.min(b, 3000) : b, b0: 5000 };
};
t05_ichinomiya.history = '天正十三年（1585）六月、羽柴秀吉は弟の秀長を総大将に、甥の秀次らと合わせて大軍を四国へ送った。阿波へ渡った秀長は、長宗我部元親の家臣、谷忠澄・江村親俊らが守る一宮城を囲んだ。\n秀長は城の水の手を断ち、城兵は水に苦しんだと伝わる。七月、谷忠澄は城を開き、元親のもとへ戻って降伏を説いた。元親は降り、土佐一国だけを許された。\n砦・水場・尾根の道の置き場、両軍の人数、台詞は遊びのための推定である。';
t05_ichinomiya.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  depthBot(b, inp, goTo);
};

// 右上の一行（stages.js の作りをそのまま使う。共通の表は直さず、ここで足す）
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES.t05_ichinomiya = [['鮎喰川を渡り、麓の砦を落とす'], ['谷を回り、水の手の兵を追い払う', s(1)], ['水場を押さえ、城兵を退ける', s(2)], ['搦手の尾根を登り、開城の使者を迎える', s(3)]];

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t05_ichinomiya);
