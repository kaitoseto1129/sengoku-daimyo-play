// ======================================================================
// 徳川編 8. 大坂冬の陣・木津川口の戦い（慶長十九年十一月十九日の未明・1614）
// 手本と出所：docs/battle_refs/k08_osaka_kizu.md・docs/battle_learn/k08_osaka_kizu.md（Wikipedia・大坂の陣絵巻・城跡の記録）。
// 史実：蜂須賀の物見（森村重）が「砦の炊ぎの煙が少ない」と知らせ、家康の許しを得て、蜂須賀至鎮・浅野長晟・池田忠雄の約三千が
//   明石全登の砦（約八百）を攻めた。出陣は明け六つの約束だったが、蜂須賀勢は午前三時ごろ抜け駆けで出た。
//   舟手（軍船）が木津川から、陸の別手が砦の背へ回って民家に火をかけ、水と陸で挟み撃ちにした。
//   遅れた浅野勢は急いで川を渡り、溺れる者を多く出した。全登は大坂城の評定に出ていて留守で、一族の明石全延が守ったが
//   指図がまとまらず、砦はその日のうちに落ち、守兵は博労淵の方へ退いた。冬の陣の最初の戦。
// 主人公は蜂須賀勢の侍大将。家康・秀忠・秀頼・全登はこの場にいない。大坂城は約六 km 先で、夜の闇では見えない（遠景に置かない）。
// 段（史実の時刻の順。段ごとに夜明けまでの時間の限り）：
//   ①入り江を渡り、岸の鉄砲組を討つ（抜け駆け）②砦の大手門を味方と打ち破る（舟手が川から撃ち、別手が背の民家に火・浅野が遅れて渡る）
//   ③砦の内へ入り、明石の守兵を討つ（挟み撃ち）④砦の北の口で明石全延の組を追い払う ⑤北の口に卍の幟を立てる（守兵は博労淵へ退く）
// 兵の比（一の1）：史実は三千対八百（約四対一）。場の本物の兵は味方約 186 対 豊臣方約 64（約三対一。重さの上限 250 ほど）。見せかけの軍勢は置かない。
//   旗は蜂須賀の卍・浅野・池田の揚羽蝶・豊臣だけ（徳川・織田の旗を立てない）。家康の定め：蜂須賀が追手・浅野が搦手・池田が遊撃。
//   この場の大将の至鎮は入り江の南の陣幕の内で床几に座り、旗本に囲まれて動かない。浅野長晟は馬上で搦手を率いる。
// 地形：大坂の低い平野と木津川の河口を手で復元（平らな低地。川筋・砦の置き場は推定）。
// 座標：南が +z（蜂須賀勢）、北が −z（砦の北の口と博労淵・大坂城）、東が +x（大坂城の方）、西が −x（木津川・大坂湾）。
// ======================================================================
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { siegeStages } from './siege_stages.js';
import { nobori, yagura, kabukimon, yaguramon, tobira, kagaribi, kobune, jinmaku, shogi, hut, takataba, lookoutDeckHeight, castleBoardFence, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { farSight } from './far_sight.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut } from './stages.js';
import { setStages } from './b_k_help.js';
import { makeRam } from './hajo.js';
import * as iriguchi from './k08/iriguchi.js';
import * as engun from './k08/engun.js';   // ④の間：城からの加勢で一時押され、浅野の後備で押し返す   // 大坂城を囲む陣と「これはまだ入口」の締め

const HACHI = { flag: 'hachisuka', armor: 0x1c1b1a };   // 蜂須賀（卍）
const ASANO = { flag: 'asano', armor: 0x1f1e1c };       // 浅野長晟（搦手）
const IKEDA = { flag: 'ageha', armor: 0x1d1c1b };       // 池田忠雄（遊撃。揚羽蝶。忠雄は十三歳で、家老が手を率いる）
const TOYO = { flag: 'toyotomi', armor: 0x22201d };     // 明石の砦の兵（豊臣方）

// 置き場（x=東+、z=南+）
const FORT = { x: 0, z: -34 };                 // 砦の中ほど
const GATE = { x: 0, z: -10 };                 // 南の大手門
const NGATE = { x: 0, z: -58 };                // 北の口（博労淵・城の方へ抜ける口。門扉は無い）
const WALL_X = 24, WALL_N = -58;               // 砦の東西の柵・北の柵
const SPAWN = { x: -4, z: 96 };
const HONJIN = { x: -4, z: 116 };             // 至鎮の本陣（入り江の南。陣幕）
const SEAT = { x: HONJIN.x, z: HONJIN.z - 1.5 };   // 至鎮の床几
const IKEDA_AT = { x: -30, z: 96 };            // 池田の手（遊撃。木津川寄りの南西）
const SHORE = { x: 0, z: 30 };                 // 入り江の北の岸（鉄砲組の持ち場）
const INSIDE = { x: 0, z: -30 };
const VILLAGE = [[-22, -82, 0.1], [-6, -88, 0], [12, -84, -0.08], [30, -78, 0.12]];   // 砦の背の民家（別手が火をかける）
const ASANO_AT = { x: 52, z: 150 };            // 浅野勢（約束の明け六つに出る。抜け駆けを知って急ぐ）
const KIZU = [[-74, -240], [-70, -90], [-66, 40], [-72, 220]];   // 木津川（西の縁）
const BOATS = [[-56, -14, 0.1], [-57, -28, 0.04], [-56, -42, -0.05], [-58, -56, 0.02], [-55, 2, 0.12], [-58, 40, -0.03]];   // 蜂須賀の舟手の軍船。一艘は入り江の口に（渡る先手から見える）
const FLEET = 40;                              // 舟手の軍船（形だけの舟を川に並べる数の元。砦の前と浅い所は飛ばす）
const SHISHA = '至鎮の使番';                   // 本陣の至鎮の下知と、遠くの手の様子を運ぶ（声の届かない所の将に口を利かせない）
const OSAKA ={ x: 260, z: -260 };             // 大坂城の方角（遠く）

const alive = (g) => g && !g.routed && g.count > 0;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// 討てない大将だけの組や退場中の兵を追わず、まだ戦っている兵へ寄せる。
const fightable = (u) => u.alive && !u.noTarget && !u.invuln && !u.fleeing && !u.dying && !u.woundOut && !u.evacuatedWound;
// 組の生存数には手負いの将も残る。目標と行き先は、まだ戦える守兵でそろえる。
const sum = (gs) => {
  let n = 0;
  for (const g of gs) if (alive(g)) for (const u of g.units) if (fightable(u)) n++;
  return n;
};
function fightingTarget(groups, p, north) {
  let best = null, distance = Infinity;
  for (const g of groups) {
    if (!alive(g)) continue;
    for (const u of g.units) {
      if (!fightable(u)) continue;
      if (north && g !== north.engun && !guardsNorth(u)) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < distance) { best = u; distance = d; }
    }
  }
  return best;
}
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる（名のある武将の隊は order の move で動かない）
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
// 東岸の浅野勢は、残る東南の塀へ直進せず、開いた南面か東の切れ目から入る。
// ④へ進んだ時も、まだ外にいる組の経路を消さない。
function holdInside(g, x, z) {
  if (!g || g.routed) return;
  const c = g.center();
  hold(g, x, z);
  if (c.x <= WALL_X) return;
  const entryZ = c.z > GATE.z ? GATE.z + 18 : -30;
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = [[WALL_X + 12, entryZ], [12, entryZ], [x, z]]; g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; };
}
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);
// 北の口の守りに残る数（柵の外へ押し出された者は守りから外れた者として数えない。追えずに④が止まらないように）
const guardsNorth = (u) => fightable(u) && Math.abs(u.pos.x) < WALL_X - 0.5 && u.pos.z < GATE.z && u.pos.z > WALL_N - 4;
// 印と自動操作も達成判定と同じ守兵を追う。北門の外から来る加勢は別に数える。
const northTarget = (F, p) => fightingTarget(F.s4, p, F);
// 北門をまたぐ時は、手当てに下がる場合も開いた門を通る。
function goNorthTo(b, inp, goTo, target, radius) {
  const p = b.player, pos = p.u.pos;
  // 北門の外から横塀の外の敵へ戻る時は、先に北門をくぐる。
  // 横塀の切れ目へ先に向かうと、まだ残る北の塀を斜めに横切って止まる。
  if (pos.z < WALL_N && Math.abs(pos.x) <= WALL_X && target.z >= WALL_N && b.army.wallBetween(pos, -1, target)) {
    goTo(p, inp, NGATE.x, Math.abs(pos.x - NGATE.x) > 2.5 ? WALL_N - 8 : WALL_N + 4, 2);
    return;
  }
  // 東西の塀の外へ押し出された時も、③で開いた切れ目を通る。
  // 北門と同じ側にいるだけでは、北寄りの塀を斜めに横切れない。
  // 北門もまたぐ行き先では、横の塀の切れ目を先に通す。
  // 北門へ先に寄ると、切れ目の無い北寄りの横塀に詰まる。
  if (b.flags.step >= 3 && b.army.wallBetween(pos, -1, target)) {
    for (const side of [-1, 1]) {
      const outside = side * pos.x > WALL_X;
      if (outside === (side * target.x > WALL_X)) continue;
      const approach = side * (WALL_X + (outside ? 4 : -4));
      const through = side * (WALL_X + (outside ? -4 : 4));
      goTo(p, inp, Math.abs(pos.z + 30) > 2.5 ? approach : through, -30, 2);
      return;
    }
  }
  if ((target.z < WALL_N) !== (pos.z < WALL_N) && b.army.wallBetween(pos, -1, target)) {
    const outside = pos.z < WALL_N;
    const approach = outside ? WALL_N - 8 : WALL_N + 4;
    const through = outside ? WALL_N + 4 : WALL_N - 8;
    goTo(p, inp, NGATE.x, Math.abs(pos.x - NGATE.x) > 2.5 ? approach : through, 2);
    return;
  }
  goTo(p, inp, target.x, target.z, radius);
}
const northLeft = (F) => {
  let n = 0;
  // 行き先と同じく、敗走した組・討死処理中・負傷して退場中の者は数えない。
  for (let i = 0; i < 2; i++) {
    const g = i ? F.zen : F.w3;
    if (!alive(g)) continue;
    for (const u of g.units) if (guardsNorth(u)) n++;
  }
  return n;
};
const flee = (g, shore = false) => {
  if (!g || g.count <= 0) return;
  // 岸の組は東の塀の外へ、それ以外は開いた北の口から博労淵へ退く。
  // 向きだけで逃がすと、東西の塀に当たって退き口へ出られない。
  // 既に士気が崩れた組にも退路を渡す。共通処理の fleeSet は退路の指定済みとは限らない。
  if (!g.k08RetreatSet) {
    g.k08RetreatSet = true;
    g.fleeDir = shore ? { x: 1, z: 0 } : { x: 0, z: -1 }; g.fleeSet = true;
    const c = g.center();
    g.fleePath = shore ? [[44, Math.max(4, c.z)], [132, 4]] : c.z < WALL_N - 4
      ? [[0, -164]] : [[NGATE.x, WALL_N + 4], [NGATE.x, WALL_N - 8], [0, -164]];
    // 横の塀の外へ押し出された組も、③で開いた切れ目から北門へ退く。
    // 北門へ直進すると、北寄りの壊れていない塀に突き当たる。
    if (!shore && Math.abs(c.x) > WALL_X && c.z >= WALL_N - 4) {
      const side = Math.sign(c.x);
      g.fleePath.unshift([side * (WALL_X + 4), -30], [side * (WALL_X - 4), -30]);
    }
    for (const u of g.units) { u.perch = null; u.fleePathIdx = 0; }
  }
  g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee';
};

// 低い平野。砦は少し盛り上がった土の上。木津川の東の堤と西の湿地だけ起伏を付ける
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.04);
  h += 1.5 * gauss(x, z, FORT.x, FORT.z - 4, 2600);
  h += 0.9 * Math.exp(-(((x + 50) / 6) ** 2));            // 木津川の東の堤
  h -= 0.7 * Math.max(0, Math.min(1, (-x - 100) / 60));   // 川の西の湿地は低い
  // 砦の外を巡る空堀（11/7 kaito「砦が安っぽい」。真田丸・小谷と同じく、塀の外に堀と土塁）。大手門と北の口の前は土橋で残す
  const ox = Math.max(0, Math.abs(x) - WALL_X), oz = Math.max(0, z - GATE.z, WALL_N - z);
  if (ox > 0 || oz > 0) {
    let k = Math.exp(-(((Math.hypot(ox, oz) - 5.5) / 1.9) ** 2));
    if (ox === 0) k *= Math.max(0, Math.min(1, (Math.abs(x) - 3) / 2));
    h -= 1.8 * k;
  }
  return h;
}

const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, ...o });
const sq = (side, type, n, o) => ({ type, n, o: kit(side, o) });
// 豊臣方の組（明石の砦の兵）
const foe = (rt, name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: at, facing: 0, order: 'hold', aggro: 12, width: 8, ...o }, list);
// 持ち場に控えていた豊臣方の新手を放つ（本物の兵。数える組に足し、倒す数も増やす）
function join(rt, list, key, g) {
  const F = rt.flags;
  if (!alive(g)) return;
  g.noAI = false; g.order = 'attack'; g.aggro = 26; g.seekRange = 60;
  F[list].push(g); F[key] += g.count;
}
// 高い所（櫓・舟の上）に兵を据える
function perch(g, x, y, z, f) {
  g.units.forEach((u, i) => {
    const px = x + (i ? 0.7 : -0.7);
    u.pos.set(px, y, z); u.perch = { x: px, y, z }; u.mesh.position.copy(u.pos);
    u.heading = f; u.mesh.rotation.y = f; u.gunAmmo = 60;
  });
}

import DEPTH_K08 from './k08/depth.js';   // 軍勢の厚み・陣立ての表（army_depth）
const k08_osaka_kizu = {
  depth: DEPTH_K08,
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 見回り 徳川D：既定の強さでは砦の内で bot が倒れた。命懸けの戦場（lethal.js）：流れ弾・突然の負傷と討死・制圧・恐怖・孤立
  foeHit: 0.8,   // 11/9 見回り 徳川D：砦の内と奥で鉄砲・弓を三方から浴び、bot が二度とも倒れた（今福は 0.9）
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを stage1〜5 を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。木津川口：十一月半ば（今の十二月）の夜の湿地。枯れ葦・ぬかるみ・暗い土
  // 抜け駆けの夜襲の始まりで、まだ誰も戦っていない。倒れた槍・陣笠・矢は撒かない（debris・arrows 0）
  timeslip: {
    wet: 0.55, dust: 0.1, trample: 0.2, debris: 0, arrows: 0, reeds: 0.5, mudColor: 0x5e5446, hazeColor: 0x6a6660, poolDim: 0.5, grassLift: 0.12, grassShape: 'blade',
    grass: 0x8c8456, grassTints: [0xffffff, 0xe0d4a8, 0xbcb890], grassH: 1.25, tallGrass: 1, grassCap: 420,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  // 蜂須賀の旗は慶長の阿波の蜂須賀家の丸に卍（墨俣の頃の糸輪の遊びの旗を使わない。11/6 crit・十4）
  // 池田の手の旗持ちは家の旗（ikeda）を持つが、その絵が無く白地に黒い丸だけの旗になっていた（11/6 fixc0823 で描いて見た）。池田家の揚羽蝶に
  flagEra: { hachisuka: 'manji', ikeda: 'ageha' },
  noMiniMap: true,        // 右上の小さな地図を出さない（五の1）
  touchBattleControls: true,   // 拾った鉄砲へ指でも持ち替える（通し確認で武器の丸が出なかった）
  // 敵の兵には一人残らず頭上に赤い▼（九3。11/5 crit：門の内の斬り合いでどれが明石の兵か分からなかった）。④は討てない全延にも付ける
  enemyTriangleSigns: true,
  siegeNoStones: true,   // 土の砦では落石を作らず、門の上からは矢だけを落とす
  enemyTriangleGroup: (rt) => (rt.flags.step === 4 ? rt.flags.zen : null),
  noTravelArrow: true,    // 行き先は真上の▼一つ（足元・端の矢印を描かない。五3）
  nameRange: 45,          // 浅野長晟・明石全延の名を、組が見える所から出す（九3）
  // 「ついて行く大将」の金の▼を出さない。至鎮は百二十歩後ろの陣幕の内で動かないので、門の前で行き先に着くと、その▼が画面の下の端に「蜂須賀至鎮」と貼り付いた（critic 五2・五6。11/6 fixc0823 で描いて遊んで見た）
  noLeaderFollow: true,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  prelude: false,   // 夜襲の下知は setup の会話で行う。共通の十二秒待ちを重ねず、十四・八秒で先手を出す。
  // 見せかけの軍勢・遠くの作り物の戦いは置かない（kaito AA・AF・AV の4）
  noReserve: true, noWake: true, noTaishoRaid: true, noFrontFill: true, noDistantBattle: true, noFarFill: true, noAheadFill: true,
  frontlineDensity: false,   // 見えない所から湧く「味方の小勢・敵の小勢」も出さない（kaito AW の6）
  gateGuideOwnTask: true, // 大手門は先手と寄って打ち破る（update・掛矢の手は残す）。「門を打て（長押し）」の札と案内の字を出さず、②の目標を言い替えない（十1・五1）
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を何人討つ」を足さない。goals5.js）
  noYaguraTask: true,     // 板囲いの櫓を「物見櫓の中へ入り…」の目標にしない（目標は五つの段だけ＝十1）
  // 見出しの札は終わりと討ち取りだけ（「敵の隊が崩れた」が⑤で八秒ごとに四度出た。案内の字＝五1。真田丸・桶狭間と同じ）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  allyReports: false,    // 使番の「〇〇殿の隊は北西で持ち場を守る」を三十秒ごとに出さない（五の1：字を足さない）
  sides: { a: { name: '徳川勢', mon: 'hachisuka', faction: 'hachisuka' }, b: { name: '豊臣勢', mon: 'toyotomi', faction: 'toyotomi' } },
  taisho: { a: { name: '蜂須賀至鎮', def: true }, b: { name: '明石全延', def: true, fate: 'flee', survives: true } },   // 全登は留守。代わりに守った全延は博労淵へ退く（討てない）
  date: () => '慶長十九年（1614）十一月十九日　未明　摂津国 木津川口',
  history: '慶長十九年（1614）、方広寺の鐘の銘をめぐって徳川と豊臣の仲が裂け、豊臣秀頼は浪人を集めて大坂城に籠った。十一月、徳川家康は二十万ほどの大軍で大坂を囲み始めた。豊臣方は城の外に木津川口・博労淵・野田・福島・鴫野・今福などの砦を置いた。\n木津川口の砦は大坂湾から城へ入る舟の道を押さえる砦で、明石全登の兵およそ八百が守っていた。蜂須賀至鎮の物見が「砦の炊ぎの煙が少ない」と知らせ、家康は蜂須賀・浅野長晟・池田忠雄のおよそ三千に攻めを命じた。出陣は明け六つの約束だったが、蜂須賀勢は十九日の午前三時ごろ抜け駆けで出た。\n舟手は木津川から、陸の別手は砦の背へ回って民家に火をかけ、水と陸で挟み撃ちにした。遅れた浅野勢は急いで川を渡り、溺れる者を多く出した。全登は城の評定に出ていて留守で、一族の明石全延が守ったが指図がまとまらず、砦はその日のうちに落ち、守兵は博労淵の方へ退いた。',
  force(rt) {
    const F = rt.flags;
    return { a: Math.max(0, 3000 - (F.ak || 0) * 15), a0: 3000, b: Math.max(0, Math.round(800 - (F.ek || 0) * 800 / (F.e0 || 108))), b0: 800 };
  },
  world: {
    seed: 1614,
    // 矢の雨は戦の直下でなく、地形の設定を読む（arrow_rain.js）。
    arrowRainPerBow: 3,   // 門の内の弓組の一斉射ちを、矢の雨に見せる
    arrowRainGroundCue: false,   // 矢の落ちる所の地面の輪を出さない
    time: 'night',   // 午前三時の抜け駆け。夜の戦は夜に（四の6）
    muddy: 0.35,
    height,
    waterSlow: true,
    farReliefScale: 0.12,   // 木津川の河口は大坂の低い平野。地図の外を丘や山並みにしない
    mountainScale: 0.14, mountainHaze: 0.85,   // 遠くの山（六甲・生駒）は低く霞ませる
    windStrength: 0.35,   // 冬の未明の凪（雲が速く流れすぎた。11/7 kaito）
    nightLift: 1.5, nightFill: 0.4, nightMoonMin: 0.5,   // 午前三時の闇。篝火の輪の外を昼の明るさにしない（有岡・刀根坂と同じ）
    // 11/6 fixc0823：描いて遊ぶと、夜の兵だけ青白く光り、黒漆の具足が白い人形に見えた（critic の「灰色の裸の人形」）。兵だけの補光を止め、月と篝火で照らす（有岡・三方ヶ原と同じ）
    unitNightScale: 0,
    // 冬の未明の月（十九日は寝待月。夜更けに昇り、午前三時は南の空の高い所）。地面を曇りの昼の明るさにしない
    nightLight: { sunI: 0.3, hemiI: 0.2 },
    streams: [{ pts: KIZU, w: 30, depth: 2.6 }, { pts: [[-66, 52], [0, 50], [30, 51]], w: 16, depth: 0.7 }, { pts: [[24, 51], [80, 54], [220, 60]], w: 16, depth: 2.0 }],   // 砦の前を横切る入り江。西は膝までの浅瀬（先手が渡る）、東は胸までの深み（浅野勢が急いで渡り溺れる）
    paths: [[[SPAWN.x, SPAWN.z], [-2, 70], [0, 50], [SHORE.x, SHORE.z], [GATE.x, GATE.z + 4]], [[0, NGATE.z], [2, -100], [6, -150]]],
    tint(x, z, h, c) {
      // 冬（今の暦の十二月末）の河口の低地：田は刈田、湿地は枯れ葦。緑を残さず枯れ草の色に寄せる（鴫野・真田丸と同じ）。西ほど濡れて暗い。砦の土は褐色
      { const k = 0.45; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.38 * k, c.b * (1 - k) + 0.26 * k); }
      const w = Math.max(0, Math.min(1, (-x - 40) / 120));
      c.setRGB(c.r * (1 - 0.3 * w), c.g * (1 - 0.3 * w), c.b * (1 - 0.3 * w));
      const d = Math.hypot(x - FORT.x, (z - FORT.z) * 0.8);
      if (d < 36) { const k = 1 - d / 36; c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.15 * k, c.b * (1 - 0.5 * k) + 0.08 * k); }
      c.multiplyScalar(0.84 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05)));
    },
    clear: (x, z) => (Math.abs(x - FORT.x) < 36 && z > -100 && z < 130) || (x < -30 && x > -60 && z > -50 && z < 0) || (x > 30 && x < 70 && z > -100 && z < 170),
    // 河口の低い葦原と田。山の岩（灰色の丸い大石）は無い。木は村の際にまばらに（影絵の木を砦の前に並べない。11/5 crit・八1）
    rocks: 0,
    trees: 24,
    tufts: 2400,
    treeDensity: (x, z) => (x > 90 || z < -150 ? 0.5 : 0.03),
    fleeOut: (x, z, team) => (team === 1 ? z < -150 || x > 120 : z > 190),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.drown = 0;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const faceN = Math.PI;

    // ---- 砦：柵の囲み・南の大手門・北の口・櫓・篝火 ----
    const fort0 = rt.scene.children.length;
    // 11/7 kaito「砦がとても安っぽい」：丸太の柵だけだった囲みを、狭間を切った板塀と土塁にする（真田丸・高遠の板塀と同じ作り）。
    //   ③で押し倒す門の脇・東西の一間ずつは束に入れず、一間ずつ消せるように別に作る
    const batch = makeSimpleBatch(), boards = { h: 2.6, samaStep: 1.5, boardCap: true, boardSeams: true, groundBoards: true };
    const fence = (a, b, own) => wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の塀', segLen: 6, mesh: castleBoardFence, meshOpt: own ? boards : { ...boards, batch } });
    fence([-WALL_X, GATE.z], [-10, GATE.z], true); fence([-10, GATE.z], [-3.4, GATE.z], true);
    fence([3.4, GATE.z], [10, GATE.z], true); fence([10, GATE.z], [WALL_X, GATE.z], true);
    for (const sx of [-WALL_X, WALL_X]) { fence([sx, GATE.z], [sx, -22]); fence([sx, -22], [sx, -40], true); fence([sx, -40], [sx, WALL_N]); }
    fence([-WALL_X, WALL_N], [-3.4, WALL_N]); fence([3.4, WALL_N], [WALL_X, WALL_N]);
    finalizeSimpleBatch(rt, batch);
    // 土塁は置かない（塀の外へ下る平らな板に見えた。堀の掘り込みと塀だけで足りる）
    // 11/6 fixc1711：門の構えと扉は当たりの線（GATE.z）の上に据える。前は 1.5m 外に出ていて、閉じた扉の内へ入り込み、カメラが門の屋根の下に埋まった
    // 大手門は板壁の渡櫓を載せた櫓門（土の砦の門。冠木門だけでは砦の正面に見えない。11/7 kaito）
    { const m = yaguramon(W, GATE.x, GATE.z, 6.9, 0, { doors: false, earth: true, inside: false, noKit: true }); m.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; }); rt.scene.add(m); }   // カメラは渡櫓の手前で止める（門をくぐる時、渡櫓の内に入って画面が黒く埋まった）
    rt.scene.add(kabukimon(W, NGATE.x, NGATE.z - 1.5, 7, Math.PI, { doors: false }));
    // 北の口にも閂の扉。前は扉が無く、砦の左を回ると北の口から素通りで入れた（11/7 kaito「入れるのは門を破った時だけ」）。④で守兵が打って出る時に開く
    F.ngate = rt.army.addStruct({ seg: [-3.4, WALL_N, 3.4, WALL_N], nx: 0, nz: -1, hp: 1e9, maxHp: 1e9, team: 1, name: '砦の北の口の扉' });
    F.ngateMesh = tobira(W, NGATE.x, WALL_N, 6.9, Math.PI, { h: 3.1 });
    F.ngateMesh.userData.noFreeze = true;
    F.ngateMesh.traverse((o) => { if (o.isMesh) o.userData.noBatch = true; });
    rt.scene.add(F.ngateMesh);
    F.gate = rt.army.addStruct({ seg: [-3.4, GATE.z, 3.4, GATE.z], nx: 0, nz: 1, hp: 1700, maxHp: 1700, team: 1, name: '砦の大手門' });   // 閂を掛けた二枚の扉。丸太の組が打って破る（寄せてすぐには破れない）
    // 扉は板を矧ぎ、貫と乳金物を打った二枚の扉（props の tobira）。破れると内へ倒れる（army の structFall）
    F.gateMesh = tobira(W, GATE.x, GATE.z, 6.9, 0, { h: 3.1 });
    F.gateMesh.userData.noFreeze = true;
    F.gateMesh.traverse((o) => { if (o.isMesh) o.userData.noBatch = true; });
    rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    // 板で囲った櫓（黒い箱の骨組みにしない）。カメラは櫓の板の手前で止める（11/6 fixc0823：北の櫓の脇でカメラが板の内に入り、画面が黒い箱で埋まった＝十一2）
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) { const y = yagura(W, x, z, { mon: 'toyotomi', team: 1, boarded: true }); y.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; }); rt.scene.add(y); }
    // 河口の泥の入り江に灰色の丸い川石を並べない（共通の川石は山の川の物。木津川口は砂と泥の低地。八1）
    for (const st of W.def.streams || []) if (st.rockMesh) st.rockMesh.visible = false;
    // 夜の砦の篝火には火を入れる（空の籠にしない。四の6）
    for (const [x, z] of [[-7, GATE.z - 4], [7, GATE.z - 4], [-14, -30], [14, -30], [-7, WALL_N + 3], [7, WALL_N + 3]]) { try { rt.scene.add(kagaribi(W, x, z)); if (W.addFire) W.addFire(x, z, { h: 1.3, size: 0.7, lightRadius: 16 }); } catch (e) { console.warn(e); } }
    // 砦の幟は豊臣の桐だけ。明石の手の花クルスは冬の陣の木津川口で立てた記録が無いので立てない（11/6 fix61。不確かな物は出さない＝十4）
    for (const [x, z, m] of [[-12, -16, 'toyotomi'], [12, -16, 'toyotomi'], [-14, -48, 'toyotomi'], [14, -48, 'toyotomi'], [-4, WALL_N + 8, 'toyotomi']]) rt.scene.add(nobori(W, x, z, m, 7));
    // 砦の背（北）の民家。②で蜂須賀の別手が火をかける
    for (const [x, z, r] of VILLAGE) { try { rt.scene.add(hut(W, x, z, 7, 5, r, { h: 2.6 })); } catch (e) { console.warn(e); } }
    // 蜂須賀の舟手の軍船（木津川に浮かべ、川から砦を撃つ。同じ形を使い回す）
    for (const [x, z, rot] of BOATS) {
      try { rt.scene.add(kobune(x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.05, z, rot, 7)); } catch (e) { console.warn(e); }
    }
    // 砦と舟は平野の霧に沈めない（入り江の岸から砦の柵・櫓・門が見える）
    farSight(rt.scene.children.slice(fort0), { W, ground: { x: FORT.x, z: FORT.z, r: 48 } });
    // 舟手の残りの軍船（史実は四十艘。鉄砲の乗る六艘のほかは川の上下に連なる。人は乗せず形だけを使い回す。夜の霞に沈める）
    for (let i = 0; i < FLEET; i++) {
      const z = -190 + i * (380 / FLEET) + ((i * 37) % 11) - 5;
      if (Math.abs(z + 20) < 70) continue;   // 砦の前は鉄砲の乗る六艘だけ（柵の前に舟を詰めない）
      const x = -60 - ((i * 53) % 17), d = W.waterDepthAt(x, z);
      if (!(d > 0.6)) continue;
      try { rt.scene.add(kobune(x, W.heightAt(x, z) + d + 0.05, z, ((i * 29) % 9 - 4) * 0.03, 7)); } catch (e) { console.warn(e); }
    }
    // 至鎮の本陣（陣幕の内に至鎮と旗本が本当にいる。kaito AV18・BH1）
    rt.scene.add(jinmaku(W, HONJIN.x, HONJIN.z, 14, 10, 5, { mon: 'hachisuka' }));
    for (const [x, z] of [[HONJIN.x - 10, HONJIN.z + 4], [HONJIN.x, HONJIN.z + 8], [HONJIN.x + 10, HONJIN.z + 4], [HONJIN.x - 10, HONJIN.z - 6], [HONJIN.x + 10, HONJIN.z - 6]]) rt.scene.add(nobori(W, x, z, 'hachisuka', 7));
    rt.scene.add(kagaribi(W, HONJIN.x + 4, HONJIN.z - 7));
    if (W.addFire) W.addFire(HONJIN.x + 4, HONJIN.z - 7, { h: 1.3, size: 0.7, lightRadius: 16 });
    // 浅野勢の幟（約束の刻を待つ陣。南東）
    for (const [x, z] of [[ASANO_AT.x - 8, ASANO_AT.z + 6], [ASANO_AT.x + 8, ASANO_AT.z + 6]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
    // 大坂城は置かない：城は上町台地の上で約 5km 先。午前三時の闇では見えず、場の 400m 先に置くと柵のすぐ向こうに大きく見えた（二1）

    // ---- 味方：至鎮の旗本（陣幕の内）、先手（主人公が率いる）、別手（砦の背へ回る）、舟手（川から撃つ）、浅野の搦手（遅れて渡る） ----
    // この場の大将は陣幕の内の床几に腰を下ろして動かない（kaito AV7）。旗本は陣幕の内と前を固める
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, faceN, { gunbai: true, color: 0x2a2622 }));
    F.seat = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮', anchor: SEAT, facing: faceN, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(HACHI, 'busho', 1, { name: '蜂須賀至鎮', invuln: true, horse: false, keep: true })]);
    F.seat.stay = true; F.seat.noAI = true; F.seat.noFrontline = true;
    for (const u of F.seat.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z - 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };
    }
    F.lord = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮の旗本', fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z - 6 }, facing: faceN, width: 10, aggro: 4, seekRange: 12, order: 'hold', morale: 100, noRout: true, fullStrength: true },
      [sq(HACHI, 'samurai', 10), sq(HACHI, 'cavalry', 2)]);
    F.lord.stay = true; F.lord.noFrontline = true;
    F.saki = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の先手', anchor: { x: SPAWN.x - 2, z: SPAWN.z - 8 }, facing: faceN, width: 12, aggro: 14, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 6), sq(HACHI, 'ashigaru', 22), sq(HACHI, 'gun', 12), sq(HACHI, 'bow', 3)]);
    // 蜂須賀の別手（陸から砦の背へ回り、民家に火をかける）
    F.east = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の別手', anchor: { x: 46, z: 74 }, facing: faceN, width: 10, aggro: 10, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 4), sq(HACHI, 'ashigaru', 8), sq(HACHI, 'gun', 5)]);
    // 浅野長晟の搦手（約束の明け六つまで南東の陣で待つ。②で抜け駆けを知り、入り江を急いで渡る）
    F.asano = allyGroup(rt, { faction: 'asano', name: '浅野長晟の手', anchor: { x: ASANO_AT.x, z: ASANO_AT.z }, facing: faceN, width: 10, aggro: 4, morale: 95, noRout: true, fullStrength: true },
      [sq(ASANO, 'busho', 1, { name: '浅野長晟', invuln: true, horse: true }), sq(ASANO, 'samurai', 6), sq(ASANO, 'ashigaru', 9), sq(ASANO, 'gun', 5)]);
    F.asano.noAI = true;
    // 池田忠雄の手（家康の定めた遊撃。木津川寄りを進み、③で砦の西の柵を破る）
    F.ikeda = allyGroup(rt, { faction: 'ikeda', name: '池田忠雄の手', anchor: IKEDA_AT, facing: faceN, width: 8, aggro: 10, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(IKEDA, 'samurai', 3), sq(IKEDA, 'ashigaru', 8), sq(IKEDA, 'gun', 4)]);
    for (const [x, z] of [[IKEDA_AT.x - 6, IKEDA_AT.z + 5], [IKEDA_AT.x + 6, IKEDA_AT.z + 5]]) rt.scene.add(nobori(W, x, z, 'ageha', 6));
    // 舟手の鉄砲（軍船の上から砦の西の柵を撃つ）
    F.fune = [];
    for (const [x, z, rot] of BOATS) {
      const g = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の舟手', fixed: true, anchor: { x, z }, facing: Math.PI / 2, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100, fullStrength: true },
        [sq(HACHI, 'gun', 2)]);
      g.noFrontline = true;
      perch(g, x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.9, z, Math.PI / 2 + rot);
      F.fune.push(g);
    }
    F.allies = [F.saki, F.east, F.asano, F.ikeda];
    for (const g of [...F.allies, ...F.fune]) g.dmgMult = 0.6;   // 味方だけでは時がかかる（主人公の槍で早まる。何もしなくても段は進む＝二の5）
    for (const g of F.fune) g.dmgMult = 0.35;   // 揺れる舟の上から柵越しに撃つ。当たっても深手は少ない
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z - 3 }, faceN, [{ kind: 'spear', n }]);
    // 丸太の組（11/6 fixc1711）：先手の後ろで大木を担ぐ足軽八人。①は先手について入り江を渡り、②で竹束の間を抜けて大手門を打つ
    //   （「味方と打ち破る」のに、前は門を打つのが主人公一人で、先手は竹束の陰に並んで立つだけだった。根来の丸太の組と同じ hajo.js）
    F.ramG = allyGroup(rt, { faction: 'hachisuka', name: '丸太の組', anchor: { x: SPAWN.x + 4, z: SPAWN.z + 4 }, facing: faceN, width: 3, aggro: 1, seekRange: 1, noRout: true, fixed: true, fullStrength: true },
      [sq(HACHI, 'ashigaru', 8, { keep: true })]);
    F.ramG.stay = true; F.ramG.noAI = true; F.ramG.noFrontline = true;
    // 担ぎ手は討たれない（描いて遊んだ通しで、門の前で櫓と門の内の弓に八人とも倒され、丸太が止まって②が長引き、主人公が門の前で討たれた）。周りの先手は倒れる
    for (const u of F.ramG.units) { u.maxHp *= 4; u.hp = u.maxHp; u.invuln = true; }
    F.ramZ = SPAWN.z - 8;
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.gate, get breached() { return !F.gate.alive; } }, kind: '丸太' });

    // ---- 豊臣方：明石の砦の兵（全登は留守。一族の全延が指図する） ----
    F.front = foe(rt, '入り江の岸の鉄砲組', SHORE, [sq(TOYO, 'samurai', 2), sq(TOYO, 'gun', 26), sq(TOYO, 'ashigaru', 4)], { aggro: 16, width: 30, formation: 'line' });   // 鉄砲組は岸に一列に並んで撃つ（11/7 kaito「鉄砲組が四人ほど。隊と言える数で、並んで撃つ」）
    F.wallG = foe(rt, '大手門の守り', { x: 0, z: GATE.z - 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'bow', 2), sq(TOYO, 'gun', 2), sq(TOYO, 'ashigaru', 2)], { aggro: 14 });
    F.garrison = foe(rt, '明石の守兵', { x: 0, z: -40 }, [sq(TOYO, 'samurai', 3), sq(TOYO, 'ashigaru', 5), sq(TOYO, 'gun', 2), sq(TOYO, 'bow', 1)], { aggro: 3, width: 10 });   // 門が破れるまでは砦の奥に控える
    // 砦の内の組は逃げ場が無く、門が破れる前に崩れない（崩れると③が一瞬で済んでしまう）
    for (const g of [F.wallG, F.garrison]) { g.noFrontline = true; g.noRout = true; }
    F.garrison.noAI = true;   // 門が破れるまで動かない（stage3 で放つ）
    // 砦の奥の小屋に控える明石の新手（③で守兵が半ばまで減ると打って出る。③が一息で済まない。11/5 crit：戦が三分で終わった）
    F.oku = foe(rt, '明石の奥の新手', { x: -8, z: -48 }, [sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 6), sq(TOYO, 'gun', 2)], { aggro: 3, width: 8 });
    F.oku.noFrontline = true; F.oku.noRout = true; F.oku.noAI = true;
    // 門の内の弓と鉄砲（門の奥の土の台に並ぶ。門が破れて寄せ手が入った途端に一斉に射ちかける。11/7 kaito「入った瞬間に鉄砲と弓が雨のように来る怖さに」）
    F.inner = foe(rt, '門の内の弓鉄砲', { x: 0, z: GATE.z - 16 }, [sq(TOYO, 'bow', 10), sq(TOYO, 'gun', 8)], { aggro: 0, width: 18, formation: 'line' });
    F.inner.noFrontline = true; F.inner.noRout = true; F.inner.noAI = true;
    for (const u of F.oku.units) u.noTarget = true;
    // 新手は始めから持ち場にいる（湧かせない。kaito AW の6）。門の前の鉄砲組と、北の口の守兵・全延の組
    F.w1 = foe(rt, '門の前の鉄砲組', { x: 0, z: GATE.z + 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'gun', 3), sq(TOYO, 'ashigaru', 2)], { aggro: 6 });
    F.w3 = foe(rt, '北の口の守兵', { x: 0, z: WALL_N + 6 }, [sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 5), sq(TOYO, 'gun', 3)], { aggro: 3, width: 10 });
    F.zen = foe(rt, '明石全延の組', { x: 4, z: WALL_N + 10 }, [sq(TOYO, 'busho', 1, { name: '明石全延', invuln: true, horse: true }), sq(TOYO, 'samurai', 4), sq(TOYO, 'gun', 1)], { aggro: 0, width: 6, morale: 100 });
    for (const g of [F.w3, F.zen]) { g.noFrontline = true; g.noAI = true; g.noRout = true; }
    // 北の口の守兵は④まで奥に控える。③で砦の内へ流れ込んだ味方に先に討ち尽くされると④が一瞬で済むので、④まで狙わせない
    for (const u of [...F.w3.units, ...F.zen.units]) u.noTarget = true;
    F.foes = [F.front, F.w1, F.wallG, F.garrison, F.w3];
    // 櫓の上の鉄砲・弓（二の3・二の7：砦に近づくほど上から撃たれる）。南の櫓は入り江と大手門、北の櫓は北の道を向く
    F.towers = [];
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) {
      const f = z > FORT.z ? 0 : Math.PI;
      const g = enemyGroup(rt, { fixed: true, name: '砦の櫓の守り', faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: { x, z }, facing: f, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100 },
        [sq(TOYO, 'gun', 1), sq(TOYO, 'bow', 1)]);
      g.noFrontline = true;
      perch(g, x, W.heightAt(x, z) + lookoutDeckHeight() + 0.08, z, f);   // 櫓の床の上に立つ（宙に浮かせない）
      F.towers.push(g);
    }
    F.s1 = [F.front]; F.fN = F.front.count;

    // 戦の前の話（蜂須賀の陣）。家康は住吉の陣（茶臼山へ移るのは十二月六日）、全登は城の評定にいて、この場にはいない
    engun.install(rt, { TOYO, ASANO, ASANO_AT });   // 城からの加勢と浅野の後備（始めから控える。k08/engun.js）
    F.e0 = rt.army.units.filter((u) => u.team === 1 && !u.isStruct).length;   // 櫓と城からの加勢も八百の内に数える
    iriguchi.install(rt, { W });   // 遠くの大坂城と、城を囲む徳川方の陣（k08/iriguchi.js）
    rt.setPhase('brief');
    // 話の間も行き先を出す。出陣の下知が届いたら十五秒以内に先手が動く
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', SHORE, '岸の鉄砲組', { h: 3 });
    rt.after(0.5, () => rt.say('物見の森村重', '昨日の物見では、砦の炊ぎの煙が少のうございました。守りは手薄かと', 4.2));
    rt.after(4.6, () => rt.say('蜂須賀至鎮', '浅野殿との約束は明け六つ。待たぬ。今、出る', 4));
    rt.after(9, () => rt.say('蜂須賀至鎮', '舟手は川から撃て。別手は砦の背へ回り、火をかけよ', 4));
    rt.after(13.4, () => rt.say('蜂須賀至鎮', `${nm(rt)}、先手と共に入り江を渡れ。岸の鉄砲組から払え`, 4));
    rt.after(17.6, () => rt.say(nm(rt), '承知つかまつった', 2.4));
    rt.after(20, () => rt.say('明石全延', '殿は城の評定じゃ。お戻りまで持ちこたえよ', 3.4));
    rt.after(14.8, () => this.stage1(rt));
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：入り江の岸 → 大手門 → 砦の内 → 北の口。
    //   今の段の守りだけが打って出て、奥は持ち場で構えて待つ。門が長く破れなければ使番が知らせる（11章）
    F.stages = siegeStages(rt, [
      { groups: [F.front, F.w1], at: { x: 0, z: GATE.z - 6 }, done: () => F.step >= 2, report: '岸の鉄砲組、まだ退きませぬ！', reportAfter: 80 },
      { gate: F.gate, groups: [F.wallG], at: { x: 0, z: -40 }, report: '大手門、まだ破れず！', reportAfter: 60 },
      { groups: [F.garrison, F.oku], at: { x: 0, z: WALL_N + 6 }, done: () => F.step >= 4 },
      { groups: [F.w3, F.zen], done: () => false },
    ], { runner: '使番' });
  },

  // ① 入り江を渡り、岸の鉄砲組を討つ（午前三時の抜け駆け）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.tS = rt.t;
    rt.setPhase('assault');
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', () => fightingTarget(F.s1, rt.player.u.pos)?.pos || SHORE, '岸の鉄砲組', { red: true, group: F.front });
    hold(F.saki, SHORE.x - 2, SHORE.z + 4); F.saki.aggro = 22;
    hold(F.east, 48, 40);
    hold(F.ikeda, -28, 30);
    F.front.order = 'attack'; F.front.aggro = 20;
    // 岸の鉄砲組は胸まで濡れて上がる先手を岸の上から撃つ。先手だけで一息に払えない（11/5 crit：戦が三分で終わった）
    for (const g of F.allies) g.dmgMult = 0.4;
  },
  // ② 砦の大手門を味方と打ち破る（舟手が川から撃ち、別手が背の民家に火・浅野が遅れて渡る）
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    rt.award((t) => t.side.push('入り江を渡り、岸の鉄砲組を討った'), '岸の鉄砲組を討った');
    rt.unmark('k08');
    // 岸の鉄砲組は砦の塀の外を東（大坂城の方）へ退く。北へ逃がすと閉じた大手門の脇の塀に詰まり、追う別手が塀の前で二十秒立ち尽くした（11/7 bot）
    for (const g of F.s1) flee(g, true);
    rt.obj('main', '砦の大手門を味方と打ち破る', 'main');
    rt.marker('k08', { x: GATE.x, z: GATE.z + 4 }, '砦の大手門', { h: 3, red: true });
    hold(F.saki, GATE.x, GATE.z + 9); F.saki.aggro = 24;
    for (const g of F.allies) g.dmgMult = 0.6;
    hold(F.east, 44, -82); F.east.aggro = 4;   // 東の柵の外を回って砦の背の民家へ
    // 塀の外の堀に沿って東を回る道を辿らせる（まっすぐ行かせると塀の内の守兵に引かれて大手門の東の塀に詰まり、二十秒立ち尽くした。11/7 bot）
    if (!F.east.routed) { F.east.order = 'path'; F.east.path = [[46, 14], [44, -30], [44, -82]]; F.east.pathIdx = 0; F.east.onArrive = (g) => { g.aggro = 10; }; }
    hold(F.ikeda, -32, -30); F.ikeda.aggro = 12;   // 木津川の岸を進み、砦の西の柵の外へ
    // 浅野勢が抜け駆けを知って動き出す（入り江を急いで渡る）
    F.asano.noAI = false; F.asano.aggro = 12;
    hold(F.asano, 42, 20);
    rt.say(SHISHA, '殿の仰せ。丸太を門へ、鉄砲は櫓を撃て、と', 3.4);
    // 先手が門の前に竹束を据える（門の前の鉄砲と櫓の弾を受けて寄る。真ん中は空けて門へ通す）
    if (!F.taba) { F.taba = true; for (const x of [-10.4, -8.2, -6, 6, 8.2, 10.4]) { try { rt.scene.add(takataba(rt.world, x, GATE.z + 15, 0, { fieldBundle: true, fieldTrestle: true })); } catch (e) { console.warn(e); } } }
    rt.after(4, () => { if (F.step === 2) rt.say(SHISHA, '舟手より。樋口の舟五艘を捕らえ、川から砦を撃っておる由', 3.6); });
    rt.after(9, () => { if (F.step === 2) rt.say(SHISHA, '浅野殿の手、抜け駆けを知り、急ぎ入り江を渡っておる由', 3.6); });
  },
  // 砦の背の民家に火（別手が着いた時か、②の四十秒後）
  burn(rt) {
    const F = rt.flags, W = rt.world;
    if (F.burned) return;
    F.burned = true;
    F.blazes = [];
    for (const [x, z, r] of VILLAGE) { try { if (W.addBlaze) F.blazes.push(W.addBlaze(x, z, { w: 7, d: 5, h: 2.6, rot: r })); } catch (e) { console.warn(e); } }
    rt.say(SHISHA, '別手より。砦の背の家に火をかけた由', 3);
    rt.after(3.4, () => rt.say('明石全延', '背に火が！　川からも撃たれる。挟まれたぞ', 3.4));
  },
  // ③ 砦の内の守兵を討つ（挟み撃ち）
  stage3(rt) {
    const F = rt.flags;
    F.step = 3; F.tS = rt.t;
    this.burn(rt);
    rt.award((t) => t.side.push('砦の大手門を破った'), '砦の大手門を破った');
    rt.unmark('k08');
    rt.obj('main', '砦の内へ入り、明石の守兵を討つ', 'main');
    // 門の脇の柵を押し倒し、浅野勢が東の柵を、池田の手が西の柵を破る（味方が詰まらず流れ込む）
    for (const s of rt.army.structs || []) {
      if (s.team !== 1 || !s.seg || s === F.gate) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const southGap = s.seg[1] === GATE.z && s.seg[3] === GATE.z;   // 南の塀は丸ごと押し倒す（門の脇の塀の外に寄っていた鉄砲・弓が塀に詰まり、④まで立ち尽くした。11/7 bot）
      const westGap = s.seg[0] === -WALL_X && s.seg[2] === -WALL_X && mz > -42 && mz < -20;
      const eastGap = s.seg[0] === WALL_X && s.seg[2] === WALL_X && mz > -38 && mz < -20;
      if (southGap || westGap || eastGap) { s.hp = 0; s.alive = false; if (s.mesh) s.mesh.visible = false; }
    }
    hold(F.saki, INSIDE.x + 4, INSIDE.z); F.saki.aggro = 24;
    holdInside(F.asano, INSIDE.x + 12, INSIDE.z - 4); F.asano.aggro = 22;
    hold(F.east, 20, -72);   // 背から北の口を塞ぐ
    // 門が早く破れても、東の外を回る。北寄りの横塀はまだ残っており、
    // ②の経路を消して北の口へ直進させると、その塀に突き当たる。
    if (!F.east.routed) {
      F.east.order = 'path'; F.east.path = [[44, -72], [20, -72]]; F.east.pathIdx = 0;
      F.east.aggro = 4; F.east.onArrive = (g) => { g.order = 'hold'; g.aggro = 18; };
    }
    hold(F.ikeda, INSIDE.x - 12, INSIDE.z - 2); F.ikeda.aggro = 20;
    F.garrison.noAI = false;
    for (const g of [F.wallG, F.garrison]) { g.order = 'attack'; g.aggro = 16; }
    // 門の内の弓鉄砲は持ち場から動かずに一斉に射つ（雨のように）。夜明け前でも門の内は篝火の明かりで当たる
    F.inner.noAI = false; F.inner.order = 'hold'; F.inner.aggro = 40; F.inner.seekRange = 40;
    rt.after(0.6, () => { if (F.step === 3) rt.say('明石全延', '入ってきたぞ。射て、射て！', 2.4); });
    for (const g of F.allies) g.dmgMult = 0.4;   // 逃げ場の無い砦の内の守兵は死に物狂い（③が一息で済まない）
    F.s3 = [F.garrison, F.wallG, F.inner]; F.gN = sum(F.s3);
    rt.marker('k08', () => fightingTarget(F.s3, rt.player.u.pos)?.pos || INSIDE, '明石の守兵', { red: true, group: F.garrison });
    rt.say(SHISHA, '殿の仰せ。門が開いた、内へ攻め入れ、と', 3.2);
    rt.after(3.6, () => { if (F.step === 3) rt.say('浅野長晟', '浅野も着いた。東から挟み込め', 3); });
    rt.after(7.4, () => { if (F.step === 3) rt.say('池田の物頭', '池田の手、西の柵を破った。乗り込め', 3); });
  },
  // ④ 砦の北の口で明石全延の組を追い払う
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('砦の内の明石の守兵を討った'), '砦の守兵を討った');
    rt.unmark('k08');
    // 砦の内を払った後の一息で傷を縛る（共通の段の合間の手当てと同じ。11/9 見回り 徳川D：③の傷を負ったまま④の北の口で侍に囲まれ倒れた）
    rt.player.treatWounds?.(0.5);
    for (const g of [F.front, F.w1, ...F.s3, F.oku]) flee(g);
    // 北の口の扉を内から開けて守兵が打って出る（それまで北の口は閉じている）
    if (F.ngate) { F.ngate.hp = 0; F.ngate.alive = false; F.ngate.opened = true; F.ngateMesh.userData.open?.(); }
    for (const g of F.towers.slice(0, 2)) flee(g);   // 南の櫓の兵は降りて逃げる
    rt.obj('main', '砦の北の口で明石全延の組を追い払う', 'main');
    F.w3.noAI = false; F.zen.noAI = false;
    // 全延の組も北の口の守兵と共に打って出る（目標に書いた敵は必ず来て戦う。九2）。全延は馬上で指図し、討てない
    for (const u of [...F.w3.units, ...F.zen.units]) u.noTarget = !!u.invuln;
    for (const g of [F.w3, F.zen]) { g.order = 'attack'; g.aggro = 18; g.seekRange = 30; }
    F.zen.anchor.x = 2; F.zen.anchor.z = WALL_N + 22;   // 全延は北の口から砦の内へ押し出して指図する
    F.s4 = [F.w3, F.zen]; F.nN = northLeft(F);   // 北の櫓の上の兵は数えない（⑤で降りて逃げる）
    hold(F.saki, NGATE.x + 3, NGATE.z + 10); F.saki.aggro = 24;
    for (const g of F.allies) g.dmgMult = 0.3;   // 退き口を守る全延の組は死に物狂い（④が一息で済まない。11/6 描いた通しで 0.45 では三十七秒で済み、戦が三分で終わった）
    holdInside(F.asano, NGATE.x + 12, NGATE.z + 10); F.asano.aggro = 22;
    hold(F.ikeda, NGATE.x - 10, NGATE.z + 10); F.ikeda.aggro = 22;
    rt.marker('k08', () => northTarget(F, rt.player.u.pos)?.pos || NGATE, '明石全延の組', { red: true, group: F.zen });
    rt.say('明石全延', '北の口を固めよ！　退き口を守れ', 3.2);
    // 午前三時に出て、砦の内を払う頃に夜が白む（十一月十九日は今の十二月。明け六つ）。勝つ時は朝の光
    rt.world.setTime('morning');
    if (F.osakaFar) F.osakaFar.group.visible = true;
    rt.after(7, () => { if (F.step === 4) rt.say('浅野長晟', '夜が白んできた。明け六つの約束の刻じゃ', 3.2); });
    engun.start(rt, { NGATE, GATE });   // 城からの加勢・一時押される・浅野の後備（k08/engun.js）
  },
  // ⑤ 北の口に卍の幟を立てる（守兵は博労淵へ退く）
  stage5(rt) {
    const F = rt.flags;
    F.step = 5; F.tS = rt.t;
    rt.award((t) => t.side.push('北の口の守兵を追い払った'), '北の口の守兵を追い払った');
    rt.unmark('k08');
    // 北の口の二つの櫓の鉄砲と弓は、幟が立つまで撃ち続ける（退く守兵の殿。幟の所へ寄るのに撃たれる。勝てば皆逃げる）
    for (const g of [...F.s4, ...F.towers.slice(0, 2), F.zen]) flee(g);
    engun.fleeAll(rt);
    rt.say('明石全延', 'もはや持たぬ。博労淵へ引け', 3);
    rt.obj('main', '砦の北の口に卍の幟を立てる', 'main');
    F.flagAt = { x: NGATE.x, z: NGATE.z + 3 };
    rt.marker('k08', F.flagAt, '北の口', { h: 3 });
    hold(F.saki, F.flagAt.x, F.flagAt.z + 2);
    hold(F.east, 14, -66);
  },

  // 丸太の組は斬り合わない。二列に並んで先手の後ろを歩き、②で門の前に着いてから門扉を打つ（b_t04_negoro.js の carryRam と同じ形）
  carryRam(rt, dt) {
    // 先の二人が扉の 1.6m 手前に立つ所まで寄せる（丸太の真ん中が門から hajo の HIT_R 4.2m の内に入らないと打たない）
    const F = rt.flags, g = F.ramG, s = F.gate, FRONT = GATE.z + 1;
    // ①は入り江の岸の手前（先手の後ろ）まで。②で竹束の間を抜けて門へ
    const goal = F.step >= 2 ? FRONT : SHORE.z + 10;
    let off = 0, count = 0;
    // 担ぎ手の配列と持ち場の座標は毎コマ作り直さない。
    for (const u of g.units) {
      if (!u.alive || u.fleeing) continue;
      const i = count++;
      if (u.target && !u.target.isStruct) u.target = null;
      const qx = GATE.x + (i % 2 ? 0.6 : -0.6), qz = F.ramZ + 0.6 + Math.floor(i / 2) * 0.9;
      const dx = qx - u.pos.x, dz = qz - u.pos.z, d = Math.hypot(dx, dz);
      off += d;
      if (d > 0.05) { const m = Math.min(d, 2.4 * dt) / d; u.pos.x += dx * m; u.pos.z += dz * m; }
    }
    if (!count) return;
    // 皆が列に着いている間だけ前へ。すぐ前に斬りかかる敵がいる間は、味方が退けるまで待つ（十秒まで）
    const ordered = off / count < 2;
    let foe = false;
    rt.army.forNear(GATE.x, F.ramZ - 3, 5, (u) => { if (!foe && u.alive && u.team === 1 && !u.isStruct && !u.perch && !u.fleeing && !u.downed && !u.dying) foe = true; });
    F.ramWait = foe ? (F.ramWait || 0) + dt : Math.max(0, (F.ramWait || 0) - dt);
    if (F.ramZ > goal && (!foe || F.ramWait > 10)) F.ramZ = Math.max(goal, F.ramZ - (ordered ? 2 : 1) * dt);
    if (F.step >= 2 && F.ramZ <= FRONT + 2.5) {
      if (g.order !== 'attack') { g.order = 'attack'; g.focus = s; g.seekRange = 1; }
      for (const u of g.units) if (u.alive && !u.fleeing) u.target = s;   // 担ぎ手は皆、門扉を打つ
    } else { g.order = 'move'; g.focus = null; }
    g.anchor.x = GATE.x; g.anchor.z = F.ramZ;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('k08');
    rt.scene.add(nobori(rt.world, F.flagAt.x + 2, F.flagAt.z, 'hachisuka', 7));
    rt.award((t) => { t.main = true; t.special = { label: '抜け駆けで木津川口の砦を一日で奪った', pts: 20 }; }, '木津川口の砦を奪った');
    rt.banner('木津川口の戦い　勝ち', '大坂の外の砦が一つ落ちた');
    rt.player.u.invuln = true;
    for (const g of rt.army.groups) if (g.team === 1) flee(g);
    rt.say(SHISHA, '殿の仰せ。木津川口は落ちた。海から城への舟の道はこれで絶えた、と', 3.8);
    rt.after(4.4, () => rt.say('浅野長晟', '一番乗りは蜂須賀殿の手か。抜け駆けの申し開きは、大御所様の御前でなされよと伝えよ', 4.2));
    rt.after(9, () => rt.say(SHISHA, 'しかと。殿は覚悟の上。次は博労淵の砦と仰せでござる', 3.4));
    rt.finish({ scriptedEnd: true }, iriguchi.ending(rt, { shisha: SHISHA }));   // 締め：これはまだ入口（k08/iriguchi.js）
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false; rt.unmark('k08');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) { sfx('wood', 0.8); rt.bark('大手門が破れた'); }
  },
  onKill(rt, v) { const F = rt.flags; if (v.team === 1) F.ek++; else F.ak++; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    // 味方が先に敵を払っても、本人が目標の場所へ進むまでは達成にしない。
    // 一度加わった後は、傷の手当てで下がっても参加を取り消さない。
    // 入り江は z=50 の両側八歩。距離だけでは水中（z=54 近く）でも達成したため、北岸へ上がった事も確かめる。
    if (F.step === 1 && P.z <= SHORE.z + 10 && near(P, SHORE, 24)) F.shoreJoined = true;
    if (F.step === 2 && near(P, GATE, 24)) F.gateJoined = true;
    if (F.step === 3 && P.z < GATE.z && Math.abs(P.x) < WALL_X && near(P, INSIDE, 24)) F.insideJoined = true;
    if (F.step === 4 && near(P, NGATE, 24)) F.northJoined = true;
    // 砦の兵は手薄で浮き足立っている（史実）。豊臣方の組は傷を軽めにそろえる（夜襲の一人が数突きで倒れない）
    //   櫓の上の鉄砲と弓は、夜明けまでは闇に撃ち下ろすので当たりが浅い（11/6 fixc0823：描いて遊んだ通しで、丸太と寄せる門の前で南の櫓の二組に二十秒で撃ち倒された）
    if (!(F.lightT > rt.t)) { F.lightT = rt.t + 1; const m = F.step <= 2 ? 0.3 : F.step === 4 ? 0.4 : 0.5;   // ④は北の口の守兵・全延の組・城からの加勢が一度に来る（11/9 二巡で加勢を足した分だけ軽く）
      for (const g of rt.army.groups) if (g.team === 1) g.dmgMult = F.towers.includes(g) || /物見櫓の守り|隅櫓の守り/.test(g.name || '') ? m * 0.2 : g === F.inner ? 0.4 : g === F.engun ? 0.15 : g === F.zen ? 0.22 : m;   // 全延の組は馬上の大将と旗本で、bot の傷の大半（百二十〜百四十）を与えていた
      // 城の作り（perch.js）の櫓の守りは、この戦が自分で立てる櫓の守り（F.towers）と同じ櫓に重なり、弾が二重になっていた
      //   （bot：倍率を下げても、撃ち方の止めを掛けても物見櫓の守りの傷が八十〜百三十）。櫓の上の兵はこの戦の F.towers に任せ、重なる方は除く
      for (const g of rt.army.groups) if (g.team === 1 && !g.k08Soft && /物見櫓の守り|隅櫓の守り/.test(g.name || '')) { g.k08Soft = true; for (const u of [...g.units]) if (u.alive) rt.army.despawn(u); } }   // 11/9 徳川C：城の作り（perch.js）が立てる物見櫓の守りが③④で本人を撃ち倒していた（bot：鉄砲の傷の八割）。櫓の上からの弾は軽く
    if (F.step <= 2 && F.gate.alive) this.carryRam(rt, dt);
    if (F.ram) F.ram.tick(dt);
    // 時間や味方の損耗だけで未達成の目標を失敗にしない。主人公が残る守兵を討つ間は続ける。
    // 浅野勢は急いで入り江の東の深み（胸まで）を渡り、溺れる者を出す（史実の「溺れる者を多く出した」。五人まで。膝までの浅瀬では溺れない）
    if (F.step >= 2 && F.drown < 5 && !(F.drownT > rt.t)) {
      F.drownT = rt.t + 2.5;
      const W = rt.world;
      const u = F.asano.units.find((v) => v.alive && (v.type === 'ashigaru' || v.type === 'samurai') && W.waterDepthAt(v.pos.x, v.pos.z) > 0.8);
      if (u) {
        F.drown++; rt.army.kill(u, null);
        if (F.drown === 2) rt.say(SHISHA, '浅野殿の手、入り江の深みで溺るる者が出ておる', 3);
      }
    }
    // 舟手の鉄砲は川から砦の内の明石の兵を撃つ（舟の上の兵は共通の頭では的を選ばず撃たなかった。今福と同じく一人ずつ狙う。七〜十一秒に一発）
    if (F.step >= 2 && F.step <= 4) for (const g of F.fune) for (const u of g.units) {
      if (!u.alive || (u.k08Shot = (u.k08Shot ?? 1 + Math.random() * 6) - dt) > 0) continue;
      u.k08Shot = 7 + Math.random() * 4;
      const t = rt.army.nearestEnemy(u, 60, (o) => !o.isStruct && !o.fleeing && !o.noTarget && !o.invuln);
      if (t) { u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.mesh.rotation.y = u.heading; rt.army.fireGun(u, t); }
    }
    if (F.step === 1) {
      const n = sum(F.s1);
      if (!F.w1on && n <= F.fN * 0.6) {
        F.w1on = true; join(rt, 's1', 'fN', F.w1);
        rt.say('明石全延', '岸の者を見捨てるな。門から出て撃ちかけよ', 3.2);
        return;
      }
      // 先手が岸を払っても、本人が入り江を渡って岸へ加わるまで待つ。
      if (F.shoreJoined && F.w1on && n <= F.fN * 0.15) this.stage2(rt);
    } else if (F.step === 2) {
      // 別手が砦の背に着くか、四十秒経てば民家に火
      if (!F.burned && (rt.t - F.tS > 40 || near(F.east.center(), { x: 44, z: -82 }, 14))) this.burn(rt);
      const st = F.gate;
      if (!st || !st.alive || st.hp <= 0) { if (F.gateJoined) this.stage3(rt); return; }
      rt.objProgress('main', `${Math.round(100 - (100 * st.hp) / st.maxHp)}／100`);
      // 寄せた味方が門を打つ（門の前に味方が多いほど早い。主人公がそばで打てばさらに早い）
      let n = 0;
      for (const u of F.saki.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 16) n++;
      if (near(P, GATE, 6)) n += 8;   // 主人公が掛矢で打てば早く破れる（門の下に長く立たせない）
      if (alive(F.wallG) && F.wallG.count > 6) n = Math.floor(n * 0.6);
      if (F.burned) n += 6;   // 背の火で守りが浮き足立ち、閂を守る手が減る（門の前に主人公を一分半も立たせない）
      if (n) { st.hp -= dt * 0.9 * Math.min(n, 14); if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.army.structFall(st); this.onStructDestroyed(rt, st); } }
    } else if (F.step === 3) {
      if (!F.okuOn && sum(F.s3) <= F.gN * 0.5) {
        F.okuOn = true;
        for (const u of F.oku.units) u.noTarget = false;
        join(rt, 's3', 'gN', F.oku);
        rt.say('明石全延', '奥の者も出よ！　門を取り返せ', 3);
        return;
      }
      if (F.insideJoined && F.okuOn && sum(F.s3) <= F.gN * 0.15) this.stage4(rt);
    } else if (F.step === 4) {
      // 柵の外へ押し出された守兵は北の口の守りから外れた者（博労淵へ逃げる）。残りが追えずに④が止まらないように
      //   退き口を守る組は四十五秒は粘る（11/5 crit：④が二十秒で済んだ）
      if (F.northJoined && northLeft(F) <= Math.floor(F.nN * 0.2) && rt.t - F.tS > 45 && engun.cleared(rt)) this.stage5(rt);
    } else if (F.step === 5) {
      // 幟は主人公が北の口に来て立てる。待つだけで最後の目標を果たさない。
      // 主人公は北の口に着いて幟の竿を土に突き立てる（櫓から撃たれながら五秒ほど留まる。着いた途端に勝ちにしない）
      F.plant = near(P, F.flagAt, 6) ? (F.plant || 0) + dt : 0;
      if (F.plant > 5) this.win(rt);
    }
  },
};

// bot の頭：近い敵を突き、段の行き先へ。門の段は門を打つ
k08_osaka_kizu.botBrain = (b, inp, { goTo, patientStrike }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  if (!F.step) return;   // 戦の前の話の間は陣で聞く（先に岸へ走って鉄砲組に撃たれた）
  const gc = F.saki.center();
  // 手負いは門の前の竹束の陰まで下がり、傷が癒えてから戻る（門の前と砦の内で矢玉に討たれた。11/6 fix4 の通しで四度）
  if (u.hp < u.maxHp * 0.45) F.botRest = true; else if (u.hp > u.maxHp * 0.85) F.botRest = false;
  //   竹束の列（GATE.z+15）は真ん中の通り道から抜ける（斜めに下がると竹束に詰まって門の前に立ち続けた）
  //   ③④は砦の内で、門の外まで下がる間に追ってきた侍に背から討たれた（11/6 fixc0823 の描いた通しで二度）。先手の列の八歩後ろで癒える
  if (F.botRest && F.step >= 3 && F.step <= 4) {
    const rest = F.botRestAt || (F.botRestAt = { x: 0, z: 0 });
    rest.x = gc.x; rest.z = gc.z + 8;
    goNorthTo(b, inp, goTo, rest, 2);
    return;
  }
  //   ②は通り道の真ん中に立つと門の内の鉄砲に撃ち抜かれた（同じ通しで 111 秒に討たれた）。通り道を抜けたら西の竹束の真後ろに隠れる
  if (u.hp < u.maxHp * 0.6 && F.step === 2) F.botRest = true;
  if (F.botRest && F.step === 2) {
    if (u.pos.z < GATE.z + 16.2) { goTo(p, inp, 0, GATE.z + 17.5, 1); return; }
    goTo(p, inp, -8.2, GATE.z + 16.9, 0.6); return;
  }
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  // 櫓の床の上の撃ち手は地上から突けない。届かない相手の下で足を止めない。
  const e = b.army.nearestEnemy(u, 12, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.dying && !o.woundOut && !o.evacuatedWound && !o.invuln && o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e && F.step >= 1 && F.step < 5) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 振りを受けてから返す（共通の patientStrike）。くじの突きでは一人も討てず、先手が崩れて負けた（11/8）
    // 刀は patientStrike の間合い（1.9m）より内へ寄る。槍と同じ 2.4m で止まると一度も斬れない。
    const attackAt = p.weapon === 'sword' ? 1.6 : 2.2;
    if (d > attackAt) goTo(p, inp, e.pos.x, e.pos.z, attackAt);
    patientStrike(p, inp, e, d);
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  if (F.step <= 1) { at(fightingTarget(F.s1, u.pos)?.pos || SHORE, 2.2); return; }
  if (F.step === 2) {
    // 丸太が門に着くまでは丸太の脇について寄せ、手負いは竹束の陰へ下がる（門の前に一人で立ち続けて櫓と門の内の弓に討たれない）
    if (F.ramZ > GATE.z + 5) { at({ x: GATE.x + 2.4, z: Math.max(GATE.z + 4, F.ramZ + 1) }, 1.5); return; }
    // 扉が破れる間際は先手の後ろへ一歩引く（破れた途端に門の内の守りが打って出て、扉の前の一人が深手を負った。描かない通しで二度）
    if (F.gate.hp < F.gate.maxHp * 0.12) { at({ x: GATE.x + 3, z: GATE.z + 9 }, 1.5); return; }
    if (Math.hypot(u.pos.x - GATE.x, u.pos.z - (GATE.z + 3)) > 3) { at({ x: GATE.x, z: GATE.z + 3 }, 2); return; }
    p.yaw = Math.atan2(GATE.x - u.pos.x, GATE.z - u.pos.z);
    inp.leftPressed = Math.random() < 0.6;
    return;
  }
  if (F.step === 3) { goNorthTo(b, inp, goTo, fightingTarget(F.s3, u.pos)?.pos || INSIDE, 2.2); return; }
  if (F.step === 4) {
    const target = northTarget(F, u.pos)?.pos || NGATE;
    // 加勢を迎えて門の外へ出た後も、内の守兵へは開いた北門を通って戻る。
    // 外へ出る時だけ迂回すると、帰りに北の塀へ斜めに寄って止まる。
    goNorthTo(b, inp, goTo, target, 2.2); return;
  }
  // ⑤は砦の真ん中の道を北へ（櫓の角へ真っすぐ向かって詰まらない）
  const f = F.flagAt || NGATE;
  // 加勢を追って北門の外に残った場合も、塀を横切らず開いた門から幟へ戻る。
  if (u.pos.z < WALL_N || Math.abs(u.pos.x) > WALL_X) { goNorthTo(b, inp, goTo, f, 2); return; }
  if (Math.abs(u.pos.x - f.x) > 5 && u.pos.z > f.z + 8) { at({ x: f.x, z: u.pos.z - 4 }, 2); return; }
  at(f, 2);
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k08_osaka_kizu = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.fN, sum(F.s1), F.fN * 0.15);
  if (F.step === 3) return cut(F.gN, sum(F.s3), F.gN * 0.15);
  if (F.step === 4) {
    const north = cut(F.nN, northLeft(F), Math.floor(F.nN * 0.2));
    const reinforcements = cut(F.engunN, engun.remaining(rt), Math.ceil(F.engunN * 0.3));
    // 城からの加勢も退けるまで④は続く。守兵だけを数えて達成済みに見せない。
    if (north && reinforcements) return [north[0] + reinforcements[0], north[1] + reinforcements[1]];
    return north || reinforcements;
  }
  return null;
};
// 戦の進行の札（段）：F.step の 1〜5（五つ。史実の時刻の順。goals5.js が「敵を何人討つ」で埋めない）
setStages('k08_osaka_kizu', [['入り江を渡り、岸の鉄砲組を討つ', 1], ['砦の大手門を味方と打ち破る', 2], ['砦の内へ入り、明石の守兵を討つ', 3], ['砦の北の口で明石全延の組を追い払う', 4], ['砦の北の口に卍の幟を立てる', 5]]);

export { k08_osaka_kizu };
export default k08_osaka_kizu;

