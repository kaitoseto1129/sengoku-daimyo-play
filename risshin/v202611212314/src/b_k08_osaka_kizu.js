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
import { retreatNorth } from './k08/retreat.js';
import * as engun from './k08/engun.js';   // ④の間：城からの加勢で一時押され、浅野の後備で押し返す   // 大坂城を囲む陣と「これはまだ入口」の締め
import { isEn, addEn } from './i18n.js';
// K516 英語の時だけ訳の表を読む（日本語の時は読まない・重さ0）
if (isEn()) { try { addEn((await import('./i18n_k08_kizu.js')).default); } catch (e) {} }

// 11/19 クラウド持ち主（物差し⑥ 写真の悪い所①「敵味方とも黒い具足と陣笠で、▼の無い者は見分けにくい」）：
//   07:10 に徳川方を紺糸威・明石の兵を赤茶の威にしたが、具足に青と朱は使わない決まり（kaito 10/29・11/3 AV1）で、
//   armor_uniform.js と humans_armor.js の noBlue が描く時にどちらも黒・黒褐へ戻していた（見た目は変わっていなかった）。
//   決まりの内の色に戻す：徳川方は黒漆に黒糸・黒褐、明石の兵は溜塗（赤みの黒）の胴に黒褐の威。見分けは旗（蜂須賀の黄土の染め・敵の旗の赤い縁）と頭上の▼で付ける
const HACHI = { flag: 'hachisuka', armor: 0x1c1b1a, lace: 0x1c1a1a };   // 蜂須賀（卍）
const ASANO = { flag: 'asano', armor: 0x1f1e1c, lace: 0x2c2622 };       // 浅野長晟（搦手）
const IKEDA = { flag: 'ageha', armor: 0x1d1c1b, lace: 0x1c1a1a };       // 池田忠雄（遊撃。揚羽蝶。忠雄は十三歳で、家老が手を率いる）
const TOYO = { flag: 'toyotomi', armor: 0x2e1c16, lace: 0x2c2622 };     // 明石の砦の兵（豊臣方）

// 置き場（x=東+、z=南+）
const FORT = { x: 0, z: -34 };                 // 砦の中ほど
const GATE = { x: 0, z: -10 };                 // 南の大手門
const NGATE = { x: 0, z: -58 };                // 北の口（博労淵・城の方へ抜ける口。門扉は無い）
const OUTER_BLK = /^明石全延の砦の外の備|^砦の北の後詰|^薄田兼相の博労淵の備/;   // 布陣（fujin_layout.js）の砦の外の備
// 外へ追った後も門の内まで戻る。門の線を目指すだけでは、手前で止まり④の参加にならない。
const NORTH_AT = { x: NGATE.x, z: NGATE.z + 6 };
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
const activeSoldier = (u) => u.alive && !u.gone && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.evacuatedWound;
// 名札の二つの描き方で、距離・退場・姿の見え隠れをそろえる。
const nameVisible = (rt, u) => activeSoldier(u) && !u.camHidden &&
  (u.pos.x - rt.player.u.pos.x) ** 2 + (u.pos.z - rt.player.u.pos.z) ** 2 <= 45 ** 2;
const fightable = (u) => activeSoldier(u) && !u.noTarget && !u.invuln;
// ③は砦の内を取る戦い。閉じた北門の外や横塀の外まで残兵を追わせない。
const insideFort = (p) => Math.abs(p.x) < WALL_X && p.z > WALL_N && p.z < GATE.z + 6;
const guardsInside = (u) => fightable(u) && insideFort(u.pos);
// 岸を離れて塀の裏や遠い脇へ回った者は、渡河を阻む守りには数えない。
const guardsShore = (u) => fightable(u) && Math.abs(u.pos.x) < WALL_X + 12 && u.pos.z > GATE.z + 2 && u.pos.z < SHORE.z + 24;
// 組の生存数には手負いの将も残る。目標と行き先は、まだ戦える守兵でそろえる。
const sum = (gs, eligible = fightable) => {
  let n = 0;
  for (const g of gs) if (alive(g)) for (const u of g.units) if (eligible(u)) n++;
  return n;
};
function fightingTarget(groups, p, north, eligible = fightable, nearGate = !!north) {
  let best = null, distance = Infinity;
  for (const g of groups) {
    if (!alive(g)) continue;
    for (const u of g.units) {
      if (!eligible(u)) continue;
      if (north && g !== north.engun && !guardsNorth(u)) continue;
      // 11/19 クラウド持ち主（act bot POSLOG 294〜332秒）：④の印が砦の東の塀の外 (31〜38,-56〜-40) に散った城からの加勢へ跳び、本人が塀の外へ追って命三割→一割。
      //   加勢は北の口の前（口から十六歩・柵の幅）にいる者を先に指す。口の前に一人もいなければ今まで通り（数え方・達成は同じ）
      if (nearGate && g === north.engun && (Math.abs(u.pos.x) > WALL_X + 4 || u.pos.z < NGATE.z - 16)) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < distance) { best = u; distance = d; }
    }
  }
  return best;
}
const insideTarget = (F, p) => fightingTarget(F.s3, p, null, guardsInside);
const shoreTarget = (F, p) => fightingTarget(F.s1, p, null, guardsShore);
const shoreCanHold = (F) => sum(F.s1, guardsShore) <= F.fN * 0.4;
// 別手がまだ南にいる時は南東の角を回り、砦内なら開いた横塀から外へ出る。
function eastRearPath(p) {
  const path = [[44, -72], [20, -72]];
  if (p.z >= GATE.z) path.unshift([46, 14]);
  else if (p.x <= WALL_X && p.z >= WALL_N) path.unshift([20, -30], [44, -30]);
  return path;
}
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる（名のある武将の隊は order の move で動かない）
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
// 浅野勢と池田勢は、残る横塀へ直進せず、開いた南面か東西の切れ目から入る。
// ④へ進んだ時も、まだ外にいる組の経路を消さない。
// 11/17 クラウド持ち主（act bot 502秒 達成・本人の討ち取り4／味方101「斬り合う相手が少なくて退屈」）：
//   砦の内（③）で、本人から二十歩内に打って出た敵の組を一つだけ本人へ向ける（岩村の huntPlayer の小さい形）。
//   敵の数・強さは変えない。本人の命が六割半を切ったら、塀を挟んだら、組が崩れたら放す（倒れの多い戦なので一組まで）。
//   ④の北の口は向けない（試しの act 3回で、④で退く本人を追わせると一度倒れた）。
// 11/18 21:05 クラウド持ち主（act bot POSLOG：③の百秒の大半を本人が竹束・塀の陰に庇い（庇）・避け（避）、門の内の弓鉄砲十三人がそろって本人を狙い続け、③の本人の討ち取り0〜3）：
//   門の内の弓鉄砲は寄せ手の塊へ撃つ。本人を狙うのは近い四人まで（うち鉄砲は二挺まで）、残りは四十歩内の一番近い味方へ（射手の数・強さ・矢玉の雨はそのまま）
function spreadVolley(rt) {
  const F = rt.flags, me = rt.player.u;
  if (!me.alive || !alive(F.inner)) return;
  const on = [];
  for (const o of F.inner.units) if (o.alive && !o.fleeing && o.target === me) on.push([Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z), o]);
  if (on.length <= 2) return;
  on.sort((a, b) => a[0] - b[0]);
  // 鉄砲は二挺まで（火縄の狙いを避けるたびに走り、③の息が一割を切って庇い続けた。act bot 21:10）
  let kept = 0, guns = 0;
  for (const [, o] of on) {
    if (kept < 4 && (o.type !== 'gun' || guns < 2)) { kept++; if (o.type === 'gun') guns++; continue; }
    let mate = null, md = 40;
    for (const a of rt.army.units) {
      if (!a.alive || a.team !== me.team || a === me || a.isStruct || a.fleeing || a.woundOut || a.civ || a.invuln) continue;
      const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
      if (d < md) { md = d; mate = a; }
    }
    if (mate) { o.target = mate; o.aiT = Math.max(o.aiT || 0, 2); }
  }
}
function thinMob(rt) {
  const me = rt.player.u;
  // 11/21 23:22 クラウド持ち主（act bot 8本に2本：③の入り口で守兵に囲まれ八秒で命67→21→倒れ。半分を切ってからでは間に合わない）：命六割半から割る
  if (!me.alive || me.hp >= me.maxHp * 0.65) return;
  const on = [];
  for (const o of rt.army.units) {
    if (!o.alive || o.team === me.team || o.target !== me || o.isStruct || o.fleeing || o.woundOut || o.perch) continue;
    const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
    if (d < 7) on.push([d, o]);
  }
  const keep = me.hp < me.maxHp * 0.35 ? 1 : 2;
  if (on.length <= keep) return;
  on.sort((a, b) => a[0] - b[0]);
  for (const [, o] of on.slice(keep)) {
    if (o.name) continue;
    let mate = null, md = 8;
    for (const a of rt.army.units) {
      if (!a.alive || a.team !== me.team || a === me || a.isStruct || a.fleeing || a.woundOut || a.civ) continue;
      const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
      if (d < md) { md = d; mate = a; }
    }
    if (!mate) continue;
    o.target = mate; o.atk = null; o.aiT = Math.min(o.aiT || 0, 0.3);
    if (!(mate.atk && mate.target?.alive)) { mate.target = o; mate.aiT = Math.min(mate.aiT || 0, 0.3); }
  }
}
function huntPlayer(rt, F, dt) {
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  const on = P?.alive && F.step === 3 && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack' || g === F.zen || g === F.inner) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F._hunter = g; return; }
}
function holdInside(g, x, z) {
  if (!g || g.routed) return;
  // 合流中は開いた入口までの経路を保ち、最後の持ち場だけ移す。
  // 隊の中心が既に内側でも、後ろの兵はまだ横塀の外に残る。
  if (g.order === 'path' && g.path?.length) {
    const last = g.path[g.path.length - 1];
    last[0] = x; last[1] = z;
    // 終点で後列を待つ間は添字が経路の末尾を越える。
    // 行き先だけ替えると旧持ち場で待ち続けるため、最後の区間を歩き直す。
    g.pathIdx = Math.min(g.pathIdx, g.path.length - 1);
    return;
  }
  const c = g.center();
  hold(g, x, z);
  // 北の塀の外へ押し出された隊は、横塀の切れ目から戻る。
  // 東西の座標だけで内側とみなすと、北門の脇の板塀に直進して止まる。
  const side = Math.sign(c.x) || 1;
  if (c.z < WALL_N) {
    g.anchor.x = c.x; g.anchor.z = c.z;
    g.order = 'path'; g.path = [[side * (WALL_X + 12), Math.min(c.z, WALL_N - 8)], [side * (WALL_X + 12), -30], [side * 12, -30], [x, z]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'hold'; };
    return;
  }
  if (Math.abs(c.x) <= WALL_X) return;
  const entryZ = c.z > GATE.z ? GATE.z + 18 : -30;
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = [[side * (WALL_X + 12), entryZ], [side * 12, entryZ], [x, z]]; g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; };
}
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);
// 北の口の守りに残る数（柵の外へ押し出された者は守りから外れた者として数えない。追えずに④が止まらないように）
const guardsNorth = (u) => fightable(u) && Math.abs(u.pos.x) < WALL_X - 0.5 && u.pos.z < GATE.z && u.pos.z > WALL_N - 4;
// 印と自動操作も達成判定と同じ守兵を追う。北門の外から来る加勢は別に数える。
const northTarget = (F, p) => fightingTarget(F.s4, p, F) || fightingTarget(F.s4, p, F, fightable, false);
// 北門をまたぐ時は、手当てに下がる場合も開いた門を通る。
function goNorthTo(b, inp, goTo, target, radius) {
  const p = b.player, pos = p.u.pos;
  // 手当てへ下がる時も竹束の列を斜めに横切らない。
  // 門前の左右から陰へ直進すると、竹束に当たったまま撃たれ続ける。
  if (pos.z > GATE.z && pos.z < GATE.z + 16.2 && target.z >= GATE.z + 16.2 && Math.abs(pos.x) > 2.5) {
    if (pos.z > GATE.z + 12.5) goTo(p, inp, pos.x, GATE.z + 12, 0.4);
    else goTo(p, inp, GATE.x, pos.z, 1);
    return;
  }
  // 竹束の陰から戦線へ戻る時も、先に中央の通り道へ出る。
  if (pos.z > GATE.z + 16.2 && target.z < GATE.z + 15 && Math.abs(pos.x) > 2.5) {
    goTo(p, inp, GATE.x, pos.z, 1);
    return;
  }
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
  // 11/18 20:05 クラウド持ち主（act bot POSLOG：③で門の外 (16,11) から塀の内の東寄りの守兵 (23,-12) へ直に向かい、南の塀に阻まれて
  //   東の塀の外 (73,-10) まで回り込み、③の六十秒を砦の外で過ごした・③の討ち取り0）。南の塀の外からは破れた大手門をくぐる
  if (b.flags.step >= 3 && pos.z > GATE.z && Math.abs(pos.x) <= WALL_X && target.z < GATE.z && b.army.wallBetween(pos, -1, target)) {
    goTo(p, inp, GATE.x, Math.abs(pos.x - GATE.x) > 2.5 ? GATE.z + 4 : GATE.z - 4, 1.5);
    return;
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
// 残兵を追い切れない時も、両方の組を半数まで崩して北の口を保てる。
// 自動操作も同じ条件で追撃から持ち場の確保へ切り替える。
const northCanHold = (rt) => northLeft(rt.flags) <= rt.flags.nN * 0.5 && engun.remaining(rt) <= (rt.flags.engunN || 0) * 0.5;
// 後備が実際に押し返せば制圧へ移る。合流が詰まった時だけ従来の三分を待つ。
const northHoldReady = (rt) => rt.flags.engunPushedBack || rt.t - rt.flags.tS > 180;
// 面の拾い直しを待たず、板塀の厚みで視点を止める。壊した区画は通す。
function fenceCameraFraction(from, to, fences) {
  let hit = null;
  for (const f of fences) {
    if (!f.struct.alive || f.struct.hp <= 0) continue;
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      const p = axis === 0 ? from.x : axis === 1 ? from.y : from.z;
      const d = (axis === 0 ? to.x : axis === 1 ? to.y : to.z) - p;
      const lo = axis === 0 ? f.x0 : axis === 1 ? f.y0 : f.z0;
      const hi = axis === 0 ? f.x1 : axis === 1 ? f.y1 : f.z1;
      if (Math.abs(d) < 1e-8) {
        if (p < lo || p > hi) { exit = -1; break; }
      } else {
        const a = (lo - p) / d, b = (hi - p) / d;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (enter > exit) break;
    }
    if (enter <= exit && (hit === null || enter < hit)) hit = enter;
  }
  return hit;
}
const flee = (g, shore = false) => {
  if (!g || g.count <= 0) return;
  // 岸の組は東の塀の外へ、それ以外は開いた北の口から博労淵へ退く。
  // 向きだけで逃がすと、東西の塀に当たって退き口へ出られない。
  // 既に士気が崩れた組にも退路を渡す。共通処理の fleeSet は退路の指定済みとは限らない。
  if (!g.k08RetreatSet) {
    g.k08RetreatSet = true;
    g.fleeDir = shore ? { x: 1, z: 0 } : { x: 0, z: -1 }; g.fleeSet = true;
    const c = g.center();
    if (shore) {
      g.fleePath = [[44, Math.max(4, c.z)], [132, 4]];
      for (const u of g.units) { u.perch = null; u.fleePath = null; u.fleePathIdx = 0; }
    } else retreatNorth(g);
  }
  g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee'; g.onArrive = null; g.focus = null;
  // 11/18 夜50-14（せっかち bot 333秒「崩れた部隊が、また戦っている」北の口の守兵・全延の組）：退く下知の時に名の無い兵の相手を外して背を向けさせる（櫓の上の殿・名のある将は今のまま）
  // 11/19 08:20 クラウド持ち主（act bot「崩れた部隊が、また戦っている」明石全延の組・flee 三回）：全延本人は討てない名のある将として外していたため、退く下知の後も馬上で本人と斬り合っていた。
  //   全延は博労淵へ退いて生き延びる人なので、退く時は全延も相手を外す（櫓の上の殿・ほかの名のある将は今のまま）
  for (const u of g.units) if (u.alive && (u.name === '明石全延' || (!u.name && !u.isTaisho && !u.invuln)) && !u.perch && !u.isPlayer) { u.target = null; u.atk = null; u.swing = null; u.fleeing = true; }
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

const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, lace: side.lace, ...o });
const sq = (side, type, n, o) => ({ type, n, o: kit(side, o) });
// 豊臣方の組（明石の砦の兵）
const foe = (rt, name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, lace: TOYO.lace, anchor: at, facing: 0, order: 'hold', aggro: 12, width: 8, ...o }, list);
// 持ち場に控えていた豊臣方の新手を放つ（本物の兵。数える組に足し、倒す数も増やす）
function join(rt, list, key, g, defend = false) {
  const F = rt.flags;
  if (!alive(g)) return;
  g.noAI = false; g.order = defend ? 'hold' : 'attack'; g.aggro = defend ? 16 : 26; g.seekRange = defend ? 20 : 60;
  if (defend) g.interiorHold = true;
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
  // 11/18 クラウド11（司令塔：三戦の質を一段上げる）：砦の内（③④）で act bot が門の内の鉄砲を避ける足（庇）と退き（避）ばかりで、五歩内の守兵も突かず討ち取り3〜6（今福と同じ形）。刃の届く敵がいれば避けずに斬り合う
  botCoverBlocked: (b) => { const st = b.flags.step; const u = b.player.u; return (st === 3 || st === 4) && !!u && !!b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.woundOut && !o.isStruct && !o.perch && o.type !== 'gun' && o.type !== 'bow'); },
  takenMult(rt) { return rt.flags.step === 4 ? 0.8 : 1; },   // 11/18 15:58 クラウド持ち主（act bot 6回に3回、④の北の口で全延の侍に囲まれ344秒前後に倒れた）：④だけ受ける傷を八割（K360⑦ の下限。敵の数・強さは同じ）
  reserveNoEnemy: true,   // 砦の内の戦。共通の待つ備の新手が act・中学生とも倒れの傷の一番（88〜300）。守兵・全延の組・城からの加勢で厚みは足りる
  playerTaken: 0.45,   // 11/15 クラウド：0.6 でも北の口の守兵・門の内の弓鉄砲に倒れ続けた（四巡目まで達成と倒れが半々）。旧：11/14 クラウド：act が三回続けて砦の内（③④）で倒れた（新手と門の内の弓鉄砲・一太刀五十の囲み）。受ける傷を六割に
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 見回り 徳川D：既定の強さでは砦の内で bot が倒れた。命懸けの戦場（lethal.js）：流れ弾・突然の負傷と討死・制圧・恐怖・孤立
  foeHit: 0.7,   // 11/9 見回り 徳川D：砦の内と奥で鉄砲・弓を三方から浴び、bot が二度とも倒れた（今福は 0.9）
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
  // 11/18 クラウド持ち主（iMac 検品「段4で本人の腰の高さにもう一つ輪が浮く」）：狙う敵の足元の太い輪は手前の兵の体の上に描かれ、腰に浮く二つ目の輪に見えた。敵は頭上の▼で足りるので出さない
  noEnemyFootRing: true,
  spearRingDepth: true,   // 11/18 夜50-14 ⑥200秒 874×402：櫓の脚の陰の敵に付く槍の赤い輪が、透けて本人の腰に巻いた輪に見えた。体と塀の後ろの輪は隠す（根白坂と同じ）
  keepBattleSigns: true,   // 行き先の案内中も武将名・人数の棒・目標一覧と敵の赤い▼を残す（九1・九3）
  siegeNoStones: true,   // 土の砦では落石を作らず、門の上からは矢だけを落とす
  enemyTriangleGroup: (rt) => (rt.flags.step === 4 ? rt.flags.zen : null),
  noTravelArrow: true,    // 行き先は真上の▼一つ（足元・端の矢印を描かない。五3）
  nameRange: 45,          // 浅野長晟・明石全延の名を、組が見える所から出す（九3）
  // 共通の名札は nameRange を最低二百〜三百歩まで広げるため、この戦の見える距離は別に守る。
  // 遠い浅野の搦手の名だけが砦の上に残らず、近づけば従来どおり頭上に出す。
  hideNameTag: (u, rt) => !nameVisible(rt, u),
  nameTagVisible: nameVisible,
  nameTagsAtHead: true,   // 名を頭上に固定し、塀に隠れた瞬間も見通しを確かめる（通し確認：浅野の名札だけが宙に残る）
  // 「ついて行く大将」の金の▼を出さない。至鎮は百二十歩後ろの陣幕の内で動かないので、門の前で行き先に着くと、その▼が画面の下の端に「蜂須賀至鎮」と貼り付いた（critic 五2・五6。11/6 fixc0823 で描いて遊んで見た）
  noLeaderFollow: true,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  prelude: false,   // 夜襲の下知は setup の会話で行う。共通の十二秒待ちを重ねず、十四・八秒で先手を出す。
  // 見せかけの軍勢・遠くの作り物の戦いは置かない（kaito AA・AF・AV の4）
  noReserve: true, noWake: true, noTaishoRaid: true, noFrontFill: true, noDistantBattle: true, noFarFill: true, noAheadFill: true,
  // 11/19 K338（天王寺・岡山の物差し）：右上の地図を戻す。木津の砦と寄せ手の備まで入る半径
  mapBack: true, mapRange: 170,
  // 控えは奥の新手・北の口の守兵・城からの加勢と浅野の後備で組んである。
  // 共通の待つ備まで足すと、閉じた北門に新手が詰まり、目標外の敵が寄せ手を囲み続ける。
  ownReserve: true,
  frontlineDensity: false,   // 見えない所から湧く「味方の小勢・敵の小勢」も出さない（kaito AW の6）
  gateGuideOwnTask: true, // 大手門は先手と寄って打ち破る（update・掛矢の手は残す）。「門を打て（長押し）」の札と案内の字を出さず、②の目標を言い替えない（十1・五1）
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を何人討つ」を足さない。goals5.js）
  goalsAllRows: true,     // 11/14 K142：右上の目標を最初から五つ並べ、済んだ段にも印を残す（一行だけにしない）
  noYaguraTask: true,     // 板囲いの櫓を「物見櫓の中へ入り…」の目標にしない（目標は五つの段だけ＝十1）
  // 見出しの札は終わりと討ち取りだけ（「敵の隊が崩れた」が⑤で八秒ごとに四度出た。案内の字＝五1。真田丸・桶狭間と同じ）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  allyReports: false,    // 使番の「〇〇殿の隊は北西で持ち場を守る」を三十秒ごとに出さない（五の1：字を足さない）
  sides: { a: { name: '徳川勢', mon: 'hachisuka', faction: 'hachisuka' }, b: { name: '豊臣勢', mon: 'toyotomi', faction: 'toyotomi' } },
  taisho: { a: { name: '蜂須賀至鎮', def: true }, b: { name: '明石全延', def: true, fate: 'flee', survives: true } },   // 全登は留守。代わりに守った全延は博労淵へ退く（討てない）
  date: () => '慶長十九年（1614）十一月十九日　未明　摂津国 木津川口',
  introText: '大坂冬の陣の始まり。明石全登の木津川口の砦は、主が城へ出て手薄。蜂須賀勢の侍大将として、夜明け前に砦を落とせ。',   // 11/17 クラウド k365-26：始めの説明（誰が・どこで・なぜ・自分の役目）
  history: '慶長十九年（1614）、方広寺の鐘の銘をめぐって徳川と豊臣の仲が裂け、豊臣秀頼は浪人を集めて大坂城に籠った。十一月、徳川家康は二十万ほどの大軍で大坂を囲み始めた。豊臣方は城の外に木津川口・博労淵・野田・福島・鴫野・今福などの砦を置いた。\n木津川口の砦は大坂湾から城へ入る舟の道を押さえる砦で、明石全登の兵およそ八百が守っていた。蜂須賀至鎮の物見が「砦の炊ぎの煙が少ない」と知らせ、家康は蜂須賀・浅野長晟・池田忠雄のおよそ三千に攻めを命じた。出陣は明け六つの約束だったが、蜂須賀勢は十九日の午前三時ごろ抜け駆けで出た。\n舟手は木津川から、陸の別手は砦の背へ回って民家に火をかけ、水と陸で挟み撃ちにした。遅れた浅野勢は急いで川を渡り、溺れる者を多く出した。全登は城の評定に出ていて留守で、一族の明石全延が守ったが指図がまとまらず、砦はその日のうちに落ち、守兵は博労淵の方へ退いた。',
  force(rt) {
    const F = rt.flags;
    // 11/18 クラウド kaito2（K365 両軍の人数）：討死一人を十五人にすると、砦を一気に取った蜂須賀勢が 3,000→1,560 と半分に減って見えた。五人に
    return { a: Math.max(0, 3000 - (F.ak || 0) * 5), a0: 3000, b: Math.max(0, Math.round(800 - (F.ek || 0) * 800 / (F.e0 || 108))), b0: 800 };
  },
  world: {
    winter: true,   // 11/19 史実照らし（docs/reki_sky_1119.md）：太陽暦の十二月〜一月。冬枯れの草と木
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
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
    nightLift: 1.5, nightFill: 0.75, nightMoonMin: 0.5,   // 11/18 クラウド K358（874×402 の写真）：③の砦の内で敵も味方も黒い影だけになり見分けられなかった。空の照り返しを 0.4→0.75（篝火の外を昼にはしない）   // 午前三時の闇。篝火の輪の外を昼の明るさにしない（有岡・刀根坂と同じ）
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
    // 11/18 クラウド持ち主（④の写真 s4_236s）：討たれた旗持ちの幟の布が、地面から斜めに浮いた白い板に見えた。岩村と同じく、落ちた幟は竿だけ残し布を隠す
    { const A = rt.army, dw = A.dropWeapon; A.dropWeapon = function (u) { dw.call(this, u); if (u.dropped?.userData?.standard && u.standardFlag && u.dropped.parent === this.scene) u.standardFlag.visible = false; }; }
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.drown = 0;
    // 11/18 クラウド K358（天王寺・岡山と同じ作り）：③④で砦の内の守兵と全延の組に囲まれ、同じ一瞬に刃が重なって倒れた（act bot 315秒）。
    //   刃も鉄砲も八割（K360⑦ の軽くする限り）。受ける傷は溜めの器（命の三割半・一秒に二分半ずつ戻る＝囲まれ撃たれ続ければ三十秒余りで倒れる）まで：門の内の弓鉄砲の一斉射ちで三秒に三十削られ、③で倒れた（act bot 160秒）。受ける量そのものを減らす
    { const P = rt.player, td = P.takeDamage; P.takeDamage = function (a, s) { if (s && !s.isStruct && a > 0) { const mx = this.u.maxHp || 100, cap = mx * 0.35; this._k08P = Math.min(cap, (this._k08P ?? cap) + Math.max(0, rt.t - (this._k08PT ?? rt.t)) * mx * 0.025); this._k08PT = rt.t; a = Math.max(0, Math.min(a * (F.step >= 3 && this.u.hp < mx * 0.3 ? 0.4 : 0.8), this._k08P));   /* 11/18 02:20 クラウド持ち主：④で命二割半のまま四十秒、退きながら鉄砲・新手に一つずつ削られ倒れた（act bot 345秒・鉄砲91）。③④で命三割を切ったら傷を半分に */ this._k08P -= a; if (!a) { this.u.hitKind = null; return 0; }
      // 11/19 08:55 クラウド持ち主（act bot 4回中2回 ④の入り口で倒れた・291・294秒）：上の「命三割を切ったら半分に」も、全延の組の倍率（0.08）も、
      //   player_hurt.js の一太刀の床（命の二割四分）が打ち消し、全延の組の侍の一太刀が毎回24で三〜四太刀に倒れていた。③④で命三割を切った時と、全延の組から命半分を切った時は床を掛けない（重い一太刀の後の抑えと同じ扱い。一太刀は一割二分まで）
      // 北の口の守兵や砦の守兵の侍にも同じ床がある。手負いの時は組を問わず連続する重い一撃を抑える。
      if ((F.step === 3 || F.step === 4) && this.u.hp < mx * 0.5) this.heavyHitT = rt.t; } return td.call(this, a, s); }; }
    // K471（司令塔の決め 11/20）：ここは馬を下りて出る。夜明け前の抜け駆けで、木津川べりの葦原と堀を越え、砦の柵へ忍び寄る戦
    //   （舟手と陸の別手の挟み撃ち・浅野勢は川を徒で渡った）。柵の際と砦の内は馬の通る幅が無い
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const faceN = Math.PI;

    // ---- 砦：柵の囲み・南の大手門・北の口・櫓・篝火 ----
    const fort0 = rt.scene.children.length;
    // 11/7 kaito「砦がとても安っぽい」：丸太の柵だけだった囲みを、狭間を切った板塀と土塁にする（真田丸・高遠の板塀と同じ作り）。
    //   ③で押し倒す門の脇・東西の一間ずつは束に入れず、一間ずつ消せるように別に作る
    const batch = makeSimpleBatch(), boards = { h: 2.6, samaStep: 1.5, boardCap: true, boardSeams: true, groundBoards: true };
    const cameraFences = [], previousCameraBlock = W.cameraBlockFraction;
    W.cameraBlockFraction = function (from, to) {
      const old = previousCameraBlock?.call(this, from, to) ?? null;
      const hit = fenceCameraFraction(from, to, cameraFences);
      return old === null ? hit : hit === null ? old : Math.min(old, hit);
    };
    const fence = (a, b, own) => {
      const structs = wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の塀', segLen: 6, mesh: castleBoardFence, meshOpt: own ? boards : { ...boards, batch } });
      for (const struct of structs) {
        const [ax, az, bx, bz] = struct.seg;
        const ya = W.heightAt(ax, az), yb = W.heightAt(bx, bz);
        cameraFences.push({ struct, x0: Math.min(ax, bx) - 0.2, x1: Math.max(ax, bx) + 0.2,
          z0: Math.min(az, bz) - 0.2, z1: Math.max(az, bz) + 0.2,
          y0: Math.min(ya, yb) - 0.3, y1: Math.max(ya, yb) + boards.h + 0.2 });
      }
      return structs;
    };
    fence([-WALL_X, GATE.z], [-10, GATE.z], true); fence([-10, GATE.z], [-3.4, GATE.z], true);
    fence([3.4, GATE.z], [10, GATE.z], true); fence([10, GATE.z], [WALL_X, GATE.z], true);
    for (const sx of [-WALL_X, WALL_X]) { fence([sx, GATE.z], [sx, -22]); fence([sx, -22], [sx, -40], true); fence([sx, -40], [sx, WALL_N]); }
    fence([-WALL_X, WALL_N], [-3.4, WALL_N]); fence([3.4, WALL_N], [WALL_X, WALL_N]);
    finalizeSimpleBatch(rt, batch);
    // 土塁は置かない（塀の外へ下る平らな板に見えた。堀の掘り込みと塀だけで足りる）
    // 11/6 fixc1711：門の構えと扉は当たりの線（GATE.z）の上に据える。前は 1.5m 外に出ていて、閉じた扉の内へ入り込み、カメラが門の屋根の下に埋まった
    // 大手門は板壁の渡櫓を載せた櫓門（土の砦の門。冠木門だけでは砦の正面に見えない。11/7 kaito）
    { const m = yaguramon(W, GATE.x, GATE.z, 6.9, 0, { doors: false, earth: true, inside: false, noKit: true }); m.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; }); rt.scene.add(m); }   // カメラは渡櫓の手前で止める（門をくぐる時、渡櫓の内に入って画面が黒く埋まった）
    // 11/18 23:15 クラウド持ち主（描く act bot の終わりの写真 874×402：⑤で幟を立てる本人の背のカメラが北の口の冠木門の屋根の下に入り、画面の上半分が屋根の裏・本人が見えない）。大手門と同じくカメラは門の手前で止める
    { const m = kabukimon(W, NGATE.x, NGATE.z - 1.5, 7, Math.PI, { doors: false }); m.traverse((o) => { if (o.isMesh) o.userData.camBlock = true; }); rt.scene.add(m); }
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
    // 旗本は F.lord に別置き。自動の供回りを足すと、下の着座処理が全員を床几の一点へ重ねる。
    F.seat = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮', anchor: SEAT, facing: faceN, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true, noRetinue: true },
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
    // 11/18 09:05 クラウド持ち主（POSLOG）：③で先手と池田の手が減り切り、④の始めに砦の内の味方は浅野の四人だけ。北の口の全延の組・城からの加勢と本人一人で向き合い、
    //   斬り合いが南の大手門まで押し戻された。蜂須賀の二の手（本陣の東に控える本物の兵）を、門が破れたら大手門から送り込み、④は北の口の先手の脇に付ける
    F.saki2 = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の二の手', anchor: { x: 14, z: 104 }, facing: faceN, width: 10, aggro: 4, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 3), sq(HACHI, 'ashigaru', 12)]);
    F.saki2.noAI = true;
    // 舟手の鉄砲（軍船の上から砦の西の柵を撃つ）
    F.fune = [];
    for (const [x, z, rot] of BOATS) {
      const g = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の舟手', fixed: true, anchor: { x, z }, facing: Math.PI / 2, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100, fullStrength: true },
        [sq(HACHI, 'gun', 2)]);
      g.noFrontline = true; g.noAI = true;   // 舟から上陸する号令を共通の頭に出させず、下の射撃処理で川から支援する
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
    // K358（11/17 iMac n-look-face）：砦に入ると近くに敵が数人しか見えず薄かった（写真 kizu_200s）。守兵と奥の新手の槍を足して砦の中を厚く（明石の手は約八百）
    // 11/19 クラウド持ち主（act bot 386秒「簡単すぎる・もっと強い奴と斬り合いたい」・名のある将 本人0）：守兵の頭に、名を伏せた明石の侍大将を一人立てる（兜・槍・徒歩）。
    //   この夜の砦の組頭の名は伝わらないので名は作らない（有岡城と同じ形）。人数は前と同じ二十（侍を一人、侍大将に替えた）
    F.garrison = foe(rt, '明石の守兵', { x: 0, z: -34 }, [sq(TOYO, 'busho', 1, { name: '明石の侍大将', horse: false, hat: 'kabuto_m', weapon: 'spear' }), sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 14), sq(TOYO, 'gun', 2), sq(TOYO, 'bow', 1)], { aggro: 3, width: 10 });   // 門が破れるまでは砦の中ほど（門の内の弓鉄砲の八歩後ろ）に控える。11/18 19:50 クラウド持ち主（K281：90秒に門の前の本人から三十〜六十歩の敵が21人）：z -40→-34
    // 侍大将へは味方の刃を四分の一（act bot 365秒：味方が先に討ち、本人の名のある将0）。本人が斬り結ぶ相手として残す（強さ・本人へ来る刃は同じ）
    for (const u of F.garrison.units) if (u.type === 'busho') u.k08taisho = true;
    // 砦の内の組は逃げ場が無く、門が破れる前に崩れない（崩れると③が一瞬で済んでしまう）
    for (const g of [F.wallG, F.garrison]) { g.noFrontline = true; g.noRout = true; }
    F.garrison.noAI = true;   // 門が破れるまで動かない（stage3 で放つ）
    // 砦の奥の小屋に控える明石の新手（③で守兵が半ばまで減ると打って出る。③が一息で済まない。11/5 crit：戦が三分で終わった）
    F.oku = foe(rt, '明石の奥の新手', { x: -8, z: -48 }, [sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 12), sq(TOYO, 'gun', 2)], { aggro: 3, width: 8 });
    F.oku.noFrontline = true; F.oku.noRout = true; F.oku.noAI = true;
    // 門の内の弓と鉄砲（門の奥の土の台に並ぶ。門が破れて寄せ手が入った途端に一斉に射ちかける。11/7 kaito「入った瞬間に鉄砲と弓が雨のように来る怖さに」）
    F.inner = foe(rt, '門の内の弓鉄砲', { x: 0, z: GATE.z - 16 }, [sq(TOYO, 'bow', 10), sq(TOYO, 'gun', 8)], { aggro: 0, width: 18, formation: 'line' });
    F.inner.noFrontline = true; F.inner.noRout = true; F.inner.noAI = true;
    for (const u of F.oku.units) u.noTarget = true;
    // 新手は始めから持ち場にいる（湧かせない。kaito AW の6）。門の前の鉄砲組と、北の口の守兵・全延の組
    F.w1 = foe(rt, '門の前の鉄砲組', { x: 0, z: GATE.z + 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'gun', 3), sq(TOYO, 'ashigaru', 2)], { aggro: 6 });
    // 射手の引き足と共通の前線移動で、岸の組が閉じた砦の裏へ流れないようにする。
    for (const g of [F.front, F.w1]) { g.noFrontline = true; g.interiorHold = true; }
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
    rt.marker('k08', () => rt.t - F.tS > 180 && shoreCanHold(F) ? SHORE : shoreTarget(F, rt.player.u.pos)?.pos || SHORE, '岸の鉄砲組', { red: true, group: F.front });
    hold(F.saki, SHORE.x - 2, SHORE.z + 4); F.saki.aggro = 22;
    hold(F.east, 48, 40);
    hold(F.ikeda, -28, 30);
    F.front.order = 'hold'; F.front.aggro = 20;
    // 11/18 クラウド持ち主（act bot 413秒：本人が入り江を渡る27〜42秒の間に先手だけで岸の鉄砲組が士気で崩れ、①の討ち取り0）。本人が北岸へ上がって二十秒までは崩れずに撃ち合う（討たれれば減る）
    F.front.noRout = true;
    // 岸の鉄砲組は胸まで濡れて上がる先手を岸の上から撃つ。先手だけで一息に払えない（11/5 crit：戦が三分で終わった）
    for (const g of F.allies) g.dmgMult = 0.4;
  },
  // ② 砦の大手門を味方と打ち破る（舟手が川から撃ち、別手が背の民家に火・浅野が遅れて渡る）
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    // K358（11/17 iMac n-look-face）：門が破れて砦の内へ入る所で、守兵と奥の新手に囲まれて一瞬で溶けた（描かずの通し 140秒で倒れる・act bot 407秒 足軽の傷108）。
    //   道明寺と同じく、命が三割五分を切ったら受ける傷を半分に（倒れる事は残す。手勢が囲んで守る間を作る）
    // 砦の内（段3〜5）では、鉄砲と矢だけでは命の二割より下へ削らない（act bot 段4：城からの加勢の鉄砲で二十秒に七割→三割、最後に一突きで倒れた）。刃では今まで通り倒れる（真田丸と同じ形）
    if (!F.gunCap) { F.gunCap = true; const dmg0 = rt.army.damage; rt.army.damage = function (t, amount, src, opts = {}) {
      // 11/18 15:55 クラウド持ち主（act bot：くぐり戸の五人も先手が先に討ち、②の本人の討ち取り0のまま）：打って出た五人へは味方の刃が浅い（四分の一）。本人が斬り結ぶ相手として残す（数・強さは同じ）
      if ((t?.k08sally || t?.k08taisho) && src && !src.isPlayer && src.team !== 1) amount *= 0.25;
      // 11/18 16:15 クラウド持ち主（act bot 三回とも ②③ の本人の討ち取り0〜2・④に二十前後が寄る）：②③で本人の四歩内の敵の兵へは味方の刃を三割半（本人が斬り結ぶ相手の止めを本人に譲る。敵の数・強さ・本人へ来る刃は同じ）
      // 11/18 22:10 クラウド持ち主（act bot 2153〜2157：③の九十秒で本人の討ち取り1・5・1）：③で本人が砦の内へ入って二十五秒は、本人の八歩内の敵へ味方の刃を一割五分（①の上がり際と同じ形。敵の数・強さ・本人へ来る刃は同じ）
      else if ((F.step === 2 || F.step === 3) && t?.team === 1 && !t.isStruct && src && !src.isPlayer && src.team !== 1) { const PU = rt.player.u, dx = PU ? Math.abs(t.pos.x - PU.pos.x) : 99, dz = PU ? Math.abs(t.pos.z - PU.pos.z) : 99;
        if (PU?.alive && F.step === 3 && F.insideJoined && rt.t - F.insideEntryAt < 25 && dx < 8 && dz < 8) amount *= 0.15; else if (PU?.alive && dx < 4 && dz < 4) amount *= 0.35; }
      // 11/18 18:10 クラウド持ち主（act bot 279秒の倒れ：③で崩れて北の口へ退く門の内の弓鉄砲が、④の本人の背を通りがけに打ち傷61）：
      //   退く兵（fleeing・名の無い者）の刃と矢玉は振り払う程度（四分の一）。退かずに戦う全延の組・加勢の傷はそのまま（K360⑦）
      if (t?.isPlayer && src && src.team === 1 && src.fleeing && !src.name && F.step >= 4) amount *= 0.25;
      if (t?.isPlayer && src && src.team === 1 && (opts.kind === 'gun' || opts.kind === 'arrow') && F.step >= 3 && F.step <= 5 && !F.ending) {
        // 本人が敵の刃と斬り合っている（三歩半の内に敵の兵）間は、門の内の弓鉄砲も味方を撃つのを恐れて狙いが逸れる（傷は三割）。act bot：段3に入ると矢弾で命七割→四割、退き続けて斬り合えず突き17/当たり0
        if (rt.army.units.some((x) => x.alive && x.team === 1 && !x.isStruct && x !== src && Math.abs(x.pos.x - t.pos.x) < 3.5 && Math.abs(x.pos.z - t.pos.z) < 3.5)) amount *= 0.3;
        amount = Math.min(amount, Math.max(0, t.hp - t.maxHp * 0.2)); if (!(amount > 0)) return; }
      return dmg0.call(this, t, amount, src, opts); }; }
    if (!F.keepUp) { F.keepUp = true; const P = rt.player, td = P.takeDamage; P.takeDamage = function (a, src) { return td.call(this, F.step >= 2 && F.step <= 5 && this.u.hp < this.u.maxHp * 0.35 ? a * 0.5 : a, src); }; }
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
    if (alive(F.sallyG)) flee(F.sallyG);   // くぐり戸から出た組の残りは門が破れたら退く（③④の守兵に重ねない）
    rt.unmark('k08');
    rt.obj('main', '砦の内へ入り、明石の守兵を討つ', 'main');
    // 11/18 08:50 クラウド持ち主（POSLOG）：②の門打ちで命三割七分のまま③に入り、竹束の陰で命が八割半に戻るまで百秒休み、③の討ち取り0。
    //   扉が破れる間に竹束の陰で傷を縛る一息（④の入りと同じ）。命六割半まで持ち直して内へ攻め入る
    rt.player.treatWounds?.(0.5);
    { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * 0.65); }
    F.botRest = false;   // 自動の遊び手の「八割半まで休む」も、傷を縛った一息で解く（②の休みを③へ持ち越して竹束の陰に立ち続けた）
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
    // 門が早く破れても、東の外を回る。北寄りの横塀はまだ残っており、
    // ②の経路を消して北の口へ直進させると、その塀に突き当たる。
    if (!F.east.routed) {
      const c = F.east.center();
      hold(F.east, c.x, c.z);
      F.east.order = 'path'; F.east.path = eastRearPath(c); F.east.pathIdx = 0;
      F.east.aggro = 4; F.east.onArrive = (g) => { g.order = 'hold'; g.aggro = 18; };
    }
    holdInside(F.ikeda, INSIDE.x - 12, INSIDE.z - 2); F.ikeda.aggro = 20;
    if (alive(F.saki2) && F.saki2.noAI) {
      const g = F.saki2;
      g.noAI = false; g.order = 'path'; g.aggro = 4; g.seekRange = 12; g.speed = 4.2;
      g.path = [[4, GATE.z + 44], [0, GATE.z + 20], [0, GATE.z - 6], [INSIDE.x - 4, INSIDE.z + 6]]; g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'hold'; q.aggro = 22; q.seekRange = 24; };
      if (!F.allies.includes(g)) F.allies.push(g);
      rt.after(5.2, () => { if (F.step === 3) rt.say(SHISHA, '殿の仰せ。二の手を門へ入れる、先手は退くな、と', 3); });
    }
    F.garrison.noAI = false;
    for (const g of [F.wallG, F.garrison]) { g.order = 'hold'; g.aggro = 16; g.seekRange = 20; g.interiorHold = true; }
    // 門の射手は持ち場で撃ち、奥の槍・侍は侵入した寄せ手へ打って出る。
    // 全員を持ち場に留めると、先着した味方だけと戦って本人の前が空く。
    F.garrison.order = 'attack';
    // 門の内の弓鉄砲は持ち場から動かずに一斉に射つ（雨のように）。夜明け前でも門の内は篝火の明かりで当たる
    F.inner.noAI = false; F.inner.order = 'hold'; F.inner.aggro = 40; F.inner.seekRange = 40; F.inner.interiorHold = true;
    rt.after(0.6, () => { if (F.step === 3) rt.say('明石全延', '入ってきたぞ。射て、射て！', 2.4); });
    for (const g of F.allies) g.dmgMult = 0.4;   // 逃げ場の無い砦の内の守兵は死に物狂い（③が一息で済まない）
    F.s3 = [F.garrison, F.wallG, F.inner]; F.gN = sum(F.s3);
    rt.marker('k08', () => insideTarget(F, rt.player.u.pos)?.pos || INSIDE, '明石の守兵', { red: true, group: F.garrison });
    rt.say(SHISHA, '殿の仰せ。門が開いた、内へ攻め入れ、と', 3.2);
    // 搦手がまだ合流中でも届く下知。到着していない隊を「着いた」と知らせない。
    rt.after(3.6, () => { if (F.step === 3) rt.say(SHISHA, '浅野殿より。東から挟み込め、との下知でござる', 3); });
    rt.after(7.4, () => { if (F.step === 3) rt.say(SHISHA, '池田の手より。西の柵が開いた、乗り込め、との由', 3); });
  },
  // ④ 砦の北の口で明石全延の組を追い払う
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('砦の内の明石の守兵を討った'), '砦の守兵を討った');
    rt.unmark('k08');
    // 砦の内を払った後の一息で傷を縛る（共通の段の合間の手当てと同じ。11/9 見回り 徳川D：③の傷を負ったまま④の北の口で侍に囲まれ倒れた）
    rt.player.treatWounds?.(0.5);
    // 11/18 クラウド持ち主（act bot 331秒の倒れ）：③で残った門の内の弓鉄砲が、二十六歩後ろの持ち場から北の口の本人の背を射続けた（傷38）。④では持ち場の十八歩内を狙い、矢玉は二割半（大手門の守りの一割と同じく、③の残りは浅く）
    if (alive(F.inner)) { F.inner.seekRange = 18; F.inner.aggro = 18; }
    { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * 0.7); }   // 11/18 クラウド K358：共通の手当ては一割五分まで。③の傷を負ったまま④の北の口の鉄砲と遠くの備に削られて倒れた（act bot 264・235秒）。砦の内を払った一息で七割まで持ち直す
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
    holdInside(F.ikeda, NGATE.x - 10, NGATE.z + 10); F.ikeda.aggro = 22;
    holdInside(F.saki2, NGATE.x - 3, NGATE.z + 14); if (F.saki2) F.saki2.aggro = 22;
    rt.marker('k08', () => northHoldReady(rt) && northCanHold(rt) ? NORTH_AT : northTarget(F, rt.player.u.pos)?.pos || NORTH_AT, '明石全延の組', { red: true, group: F.zen });
    rt.say('明石全延', '北の口を固めよ！　退き口を守れ', 3.2);
    // 午前三時に出て、砦の内を払う頃に夜が白む（十一月十九日は今の十二月。明け六つ）。勝つ時は朝の光
    rt.world.setTime('morning');
    if (F.osakaFar) F.osakaFar.group.visible = true;
    rt.after(7, () => { if (F.step === 4) rt.say(SHISHA, '夜が白んで参った。浅野殿との約束、明け六つの刻でござる', 3.2); });
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
    // 11/18 クラウド持ち主（act bot：⑤に命二割半で入り、竹束の陰で百秒休み、北の口で退き遅れの侍の一撃を受け幟まで百六十秒）：
    //   全延が退きを下知したら、櫓の上の殿を除く砦の残兵も皆博労淵へ退く。幟の段は④と同じく一息で傷を縛ってから（命七割まで）
    for (const g of rt.army.groups) if (g.team === 1 && !g.routed && g.count > 0 && !F.towers.includes(g) && !g.units.some((u) => u.perch)) flee(g);
    { const u = rt.player.u; if (u.alive) { rt.player.treatWounds?.(0.5); u.hp = Math.max(u.hp, u.maxHp * 0.7); } }
    rt.say('明石全延', 'もはや持たぬ。博労淵へ引け', 3);
    rt.obj('main', '砦の北の口に卍の幟を立てる', 'main');
    F.flagAt = { x: NGATE.x, z: NGATE.z + 3 };
    rt.marker('k08', F.flagAt, '北の口', { h: 3 });
    // K358（11/17 iMac n-look-face）：櫓の殿が幟の立つまで撃ち続け、手負いで竹束の陰へ下がると立てられないまま撃たれ続けた
    //   （act bot 421秒に⑤→511秒に櫓の鉄砲で倒れた）。撃たれながら寄る緊張は残し、二十五秒で櫓の殿も博労淵へ退く
    rt.after(25, () => {
      if (rt.over || F.ending || F.step !== 5) return;
      for (const g of F.towers.slice(0, 2)) flee(g);
      rt.say('組頭', '櫓の鉄砲も引いたぞ。今じゃ、北の口へ幟を！', 3);
    });
    // 11/19 06:55 クラウド持ち主（act bot POSLOG：⑤で本人が幟の十歩手前 (7,-47) に寄られて動けず（周りの味方4〜6人）百七十秒。
    //   先手が幟の真上 (0,-53) に固まり、南から来る本人の行く手をふさいでいた）→先手は幟の西の脇で北の口を固める
    hold(F.saki, F.flagAt.x - 9, F.flagAt.z + 4);
    // 別手がまだ東を回っている時も、北の塀へ直進させない。
    // （44,-30）から持ち場へ寄せると、切れ目の無い（24,-54）の塀に当たる。
    if (alive(F.east)) {
      const c = F.east.center();
      hold(F.east, c.x, c.z);
      F.east.order = 'path'; F.east.path = eastRearPath(c);
      F.east.path[F.east.path.length - 1] = [14, -66]; F.east.pathIdx = 0;
      F.east.onArrive = (g) => { g.order = 'hold'; };
    }
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
      // 深手で倒れた者・退場した者を担ぎ手に戻さない。
      if (!activeSoldier(u)) continue;
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
    rt.army.forNear(GATE.x, F.ramZ - 3, 5, (u) => { if (!foe && fightable(u) && !u.group?.routed && u.team === 1 && !u.isStruct && !u.perch) foe = true; });
    F.ramWait = foe ? (F.ramWait || 0) + dt : Math.max(0, (F.ramWait || 0) - dt);
    if (F.ramZ > goal && (!foe || F.ramWait > 10)) F.ramZ = Math.max(goal, F.ramZ - (ordered ? 2 : 1) * dt);
    if (F.step >= 2 && F.ramZ <= FRONT + 2.5) {
      if (g.order !== 'attack') { g.order = 'attack'; g.focus = s; g.seekRange = 1; }
      for (const u of g.units) if (activeSoldier(u)) u.target = s;   // 戦える担ぎ手だけが門扉を打つ
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
    rt.after(4.4, () => rt.say('浅野の使番', '長晟様の仰せ。一番乗りは蜂須賀殿の手か。抜け駆けの申し開きは、大御所様の御前でなされよ、と', 4.2));
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
    if (F.ending) return;
    // 共通の総大将への登録は全延の noTarget を解く。控えの間と討てない全延本人は
    // この戦の段に従わせ、③で一方的に斬りかかる・護衛が先に打って出るのを防ぐ。
    if (F.zen) for (const u of F.zen.units) if (F.step < 4 || u.invuln) u.noTarget = true;
    // 11/18 18:05 クラウド持ち主（act bot 406秒：至鎮の旗本十人が行き先の無い move のまま本陣の一点に重なった）：
    //   旗本は陣幕の前を固めて動かない。move に替えられたら持ち場で構え直す（兵は足さず消さない）
    if (F.lord && F.lord.order !== 'hold') { F.lord.order = 'hold'; F.lord.dest = null; F.lord.onArrive = null; F.lord.focus = null; F.lord.anchor = { x: HONJIN.x, z: HONJIN.z - 6 }; }
    if (!F.step) return;
    const P = rt.player.u.pos;
    // 11/18 20:20 クラウド持ち主（act bot の飛びの見張り：博労淵へ退いた豊臣の兵が退路の果て (0,-164) を越えて戦場の端 z -175 に当たり、
    //   端に沿って東へ一息に四〜六歩ずつ滑っていた・終わり際の「6m 飛ぶ」）：退路の果てを越えた者は博労淵へ抜けた（本人から百歩超・見えない）として退場させる
    if (F.step >= 3 && !(F.k08OutT > rt.t)) {
      F.k08OutT = rt.t + 1;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && u.fleeing && !u.name && !u.invuln && u.pos.z < -160 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 90) rt.army.despawn(u);
    }
    // 11/18 21:45 クラウド持ち主（描かずの見張り：遠い作り（qualityAbstract）の組が一点に重なる＝316秒 北の口の明石の新手・66秒 門の前の鉄砲組 (-6,-10)）：
    //   間引かれて止まった兵が同じ組の者と一歩より近ければ、互いに逆へ半歩ずつ寄せて離す（天王寺・岡山の新手と同じ考え。人は足さず瞬間移動もしない）
    if (!(F.k08SepT > rt.t)) {
      F.k08SepT = rt.t + 0.5;
      const vs = rt.army.units.filter((v) => v.alive && !v.gone && !v.fleeing && !v.atk && !v.isStruct && (v.qualityAbstract || v.farSim) && Math.hypot(v.vel?.x || 0, v.vel?.z || 0) < 0.3);
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        const a = vs[i], b = vs[j]; if (a.group !== b.group) continue;
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz); if (d >= 1) continue;
        if (d < 0.05) { const ang = (i * 2.399) % 6.283; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
        const k = Math.min(0.45, (1.1 - d) / 2) / d;
        for (const [u, s] of [[a, -1], [b, 1]]) {
          const nx = u.pos.x + dx * k * s, nz = u.pos.z + dz * k * s;
          if (rt.world.walkable && rt.world.walkable(nx, nz) === false) continue;
          if (rt.army.wallBetween && rt.army.wallBetween(u.pos, -1, { x: nx, z: nz })) continue;
          u.pos.x = nx; u.pos.z = nz; if (rt.world.heightAt) u.pos.y = rt.world.heightAt(nx, nz);
        }
      }
    }
    // 11/18 22:45 クラウド持ち主（act bot 221秒：明石の新手五人が北の塀の外 (9,-59) に押し付けられ、一点に重なって止まる）：
    //   砦の内の敵へ真っ直ぐ寄り、北の板塀（③は北の口も閉じている）に当たって止まっていた。塀の外の際に六秒いれば、東西の切れ目から砦の内へ回す（数・強さは同じ）
    if (F.step >= 3 && F.step <= 5 && !(F.k08WallT > rt.t)) {
      F.k08WallT = rt.t + 1;
      const c = F._wallC || (F._wallC = { x: 0, z: 0 });
      for (const g of rt.army.groups) {
        if (g.team !== 1 || g.routed || g.count < 3 || g.focus || !(g._far || g.name === '明石の新手' || g.name === '城からの加勢') || g.order === 'path' || g._k08In > rt.t) continue;
        g.center(c);
        const atWall = c.z < WALL_N && c.z > WALL_N - 6 && Math.abs(c.x) < WALL_X && (F.step === 3 || Math.abs(c.x) > 4);
        if (!atWall) { g._k08Wt = 0; continue; }
        if ((g._k08Wt = (g._k08Wt || 0) + 1) < 6) continue;
        g._k08Wt = 0; g._k08In = rt.t + 40;
        // 11/18 23:10（act bot 331秒：城からの加勢十二人が北の口の東 (14,-58) の塀に詰まる）：④からは開いた北の口をくぐらせる
        if (F.step >= 4) { g.anchor.x = c.x; g.anchor.z = c.z; g.order = 'path'; g.path = [[c.x, WALL_N - 6], [NGATE.x, WALL_N - 6], [NGATE.x, WALL_N + 8]]; g.pathIdx = 0; }
        else holdInside(g, Math.max(-16, Math.min(16, c.x)), WALL_N + 14);
        g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 14; q.seekRange = 20; };
      }
    }
    // 味方が先に敵を払っても、本人が目標の場所へ進むまでは達成にしない。
    // 一度加わった後は、傷の手当てで下がっても参加を取り消さない。
    // 入り江は z=50 の両側八歩。距離だけでは水中（z=54 近く）でも達成したため、北岸へ上がった事も確かめる。
    // 11/19 08:25 クラウド持ち主（act bot POSLOG 36〜48秒：本人が (5,41) で岸の鉄砲組の五歩手前に着いても、上がった線 z40 の外で槍が付かず「着いても六秒なにも起きない」）：線を二歩広げる
    if (F.step === 1 && P.z <= SHORE.z + 12 && near(P, SHORE, 24) && !F.shoreJoined) { F.shoreJoined = true; F.shoreJoinAt = rt.t; }
    if (F.step === 1 && F.front.noRout && F.shoreJoined && rt.t - F.shoreJoinAt > 20) F.front.noRout = false;
    if (F.step === 2 && near(P, GATE, 24)) F.gateJoined = true;
    if (F.step === 3 && P.z < GATE.z && Math.abs(P.x) < WALL_X && near(P, INSIDE, 24)) {
      if (!F.insideJoined) F.insideEntryAt = rt.t;
      F.insideJoined = true;
    }
    if (F.step === 4 && P.z < GATE.z && P.z > WALL_N && Math.abs(P.x) < WALL_X && near(P, NGATE, 24)) F.northJoined = true;
    // 11/21 クラウド k365-cloud-10（司令塔「木津の刻限」・act bot POSLOG 330〜749秒：④の四百二十秒ずっと northJoined が立たず）：
    //   全延の組・北の口の守兵は本人へ打って出て、大手門の内 (0,-10)〜(3,-29) で斬り合う。北の口の二十四歩内へは一度も寄らないので、
    //   守りを八割崩しても段が進まなかった。砦の内で北の口の組（w3・全延）と斬り合えば加わった事にする（敵の数・強さ・崩す割合は変えない）
    if (F.step === 4 && !F.northJoined && P.z < GATE.z && Math.abs(P.x) < WALL_X) {
      const me = rt.player.u;
      if ((me.atk || me.swing) && [F.w3, F.zen].some((g) => g?.units.some((v) => v.alive && !v.gone && near(v.pos, P, 6)))) F.northJoined = true;
    }
    huntPlayer(rt, F, dt);
    // 11/18 02:55 クラウド持ち主（act bot 393秒：④で命三割のまま退く間に全延の組・奥の新手・北の口の守兵の侍に背から囲まれ倒れた）：
    //   ③④で命が半分を切って囲まれたら、本人を狙う敵のうち近い二人（命三割半を切ったら一人）だけ残し、ほかは八歩内の味方と組ませる（高遠・岩石城と同じ。傷の倍率と敵の数は変えない）
    if ((F.step === 3 || F.step === 4) && (F.mobT = (F.mobT || 0) - dt) <= 0) { F.mobT = 0.5; thinMob(rt); if (F.step === 3) spreadVolley(rt); }
    // 11/18 クラウドツ五：④で命が二割まで削られたまま北の口の囲みに三十秒立ち、足軽の突きで倒れた（act bot 4回中2回・命が二割の床で止まる）。
    //   ④で命が三割を切ったら、三秒ごとに命の三分を縛り直す（味方の手当て。倒れる事は残すが、床で動けず削られ続けるのを止める）
    // 11/18 cloud-06（見回りの act bot：④で命が三割台のまま共通の退く頭（survive）が四分〜十分退き続け、本人の討ち取り0・④が646秒）：
    //   ④の間は、命が三割より上なら共通の退く頭を外し、この戦の頭（北の口へ・近い敵を受けて突く）に任せる（試し役の頭だけ。重さは変えない）
    // 11/18 23:05 クラウド持ち主（act bot POSLOG 1.5秒刻み：①で入り江の真ん中 (1,58) から、命が満ちたまま行き先が (0,62)・(15,96) へ替わり南岸へ十六歩戻った。
    //   岸の鉄砲組の火縄に向けられるたび共通の避け足（cover）が南へ下がらせ、渡り切るのが七十〜百十秒・①の討ち取り0〜1）。①は北岸へ上がるまで避け足を外す（渡る怖さは人と同じ。敵の数・強さは同じ）
    // 11/19 01:00 クラウド持ち主（POSLOG 2秒刻み：③の百四十秒、本人が一度も砦の内へ入らず大手門の外 (0〜20, 0〜10) にいた・③の討ち取り0〜1）：
    //   砦の内で一度撃たれると共通の避け足と退く頭が先に動き、門の外の竹束まで下げていた。③も命三割より上はこの戦の頭（内の守兵へ・四割半で竹束へ休む）に任せる（試し役の頭だけ）
    // 11/19 03:20 クラウド持ち主（act bot 1080秒の時切れ：⑤で命が満ちたまま大手門の内 (-3,-14) に六百秒動かず。横へずれる救いも効かない＝戦の頭まで届いていない）：
    //   ⑤も共通の避け足を外し、この戦の頭（幟へ歩く・詰まれば横へずれる）に任せる（試し役の頭だけ。撃たれながら寄る怖さは人と同じ）
    rt.def.botDefendsFort = F.step === 5 || F.step === 4 || F.step === 3 || (F.step === 1 && P.z > SHORE.z + 8)
      || (F.step === 2 && alive(F.sallyG) && F.sallyG.units.some((o) => fightable(o) && !o.fleeing && Math.hypot(o.pos.x - P.x, o.pos.z - P.z) < 8));   // 11/19 05:15：②のくぐり戸の組と斬り結ぶ間も避け足を外す（試し役の頭だけ）
    if (F.step === 4 && rt.player.u.alive && !F.ending && (F.healT4 = (F.healT4 || 0) - dt) <= 0) {
      F.healT4 = 3;
      const u = rt.player.u;
      if (u.hp < u.maxHp * 0.3) u.hp = Math.min(u.maxHp * 0.3, u.hp + u.maxHp * 0.03);
    }
    // 11/19 05:00 クラウド持ち主（act bot POSLOG 3秒刻み：③で命四割で大手門の外の竹束の陰 (-8,7) へ下がり、命四割〜六割のまま百秒立ち続けた・③が二百秒）：
    //   ③④で大手門より南の竹束の陰に立つ間は、後ろの組の者が傷を縛る（三秒ごとに命の四分、八割八分まで）。砦の内と門の前では縛らない（攻め入る怖さは同じ）
    if ((F.step === 3 || F.step === 4) && rt.player.u.alive && !F.ending && (F.healT3 = (F.healT3 || 0) - dt) <= 0) {
      F.healT3 = 3;
      const u = rt.player.u;
      if (u.pos.z > GATE.z + 14 && u.hp < u.maxHp * 0.88) u.hp = Math.min(u.maxHp * 0.88, u.hp + u.maxHp * 0.04);   // 05:15 七割半で止めると、八割半まで休む頭が門の外に立ち続けた（中学生 bot ④時切れ二回）
      // 11/21 22:58 クラウド持ち主（act bot POSLOG：③で命二割の本人が竹束の陰 (-6,10) で縛る間、布陣の「明石全延の砦の外の備 東・西」が
      //   塀の外を回って追い、命21→32 に五十秒・③が三百秒。四本に一本は大手門の外で囲まれ倒れた）：
      //   本人が命七割未満で大手門の南にいる間は、塀の外の備は本人を狙わず近くの味方と斬り合う（④の全延の組の構えと同じ。数・強さは同じ）
    }
    if ((F.step === 3 || F.step === 4) && rt.player.u.alive && !F.ending && (F.outT = (F.outT || 0) - dt) <= 0) {
      F.outT = 0.5;
      const u = rt.player.u;
      // 11/22 00:50 クラウド持ち主（今の main の act bot --mobile：④で命三割の本人が砦の内 (-2,-15〜-25) を退く間、「砦の北の後詰」の鉄砲が二十歩から撃ち続け357秒に倒れた）：
      //   ④は砦の内でも、命五割未満なら塀の外の備は本人を狙わない（数・強さは同じ）
      // 11/22 00:55 同（act bot --mobile：③で命二割半の本人が大手門のすぐ外 (2〜4,1〜5) へ退いても、明石の守兵と門の内の弓が門を出て一〜二歩から追い討ち258秒に倒れた）：
      //   ③④で本人が命三割半未満で大手門の外にいる間は、守兵と門の内の弓鉄砲も本人を追わず近くの味方と斬り合う（数・強さは同じ）
      // 11/22 03:25 クラウド持ち主（act bot POSLOG：③で命六割半の本人が竹束の陰 (-8,7) で縛る間に十二秒で命64→34、休みが八十秒続き③が百六十秒）：
      //   竹束の陰（大手門の十四歩南より外）で命七割未満の間も、守兵・門の内の弓鉄砲・奥の新手は本人を追わない（数・強さは同じ）
      const outLow = u.pos.z > GATE.z && (u.hp < u.maxHp * 0.35 || (u.pos.z > GATE.z + 14 && u.hp < u.maxHp * 0.7));
      // 11/22 02:55 クラウド持ち主（act bot --mobile 3本に1本：④で命三割の本人が大手門の内 (7,-9〜-12) へ退く間、城からの加勢の足軽が背から二太刀（命30→5→0）552秒に倒れた）：
      //   ④で命三割半未満の間は、城からの加勢も本人を追わず近くの味方と斬り合う（全延の組・北の口の守兵は今まで通り。数・強さは同じ）
      const low4 = F.step === 4 && u.hp < u.maxHp * 0.35;
      if (((u.pos.z > GATE.z - 2 && u.hp < u.maxHp * 0.7) || (F.step === 4 && u.hp < u.maxHp * 0.5) || outLow)) for (const o of rt.army.units) {
        if (!o.alive || o.team === u.team || o.target !== u || o.perch) continue;
        if (!OUTER_BLK.test(o.group?.name || '') && !(outLow && (o.group === F.garrison || o.group === F.inner || o.group === F.oku)) && !(low4 && o.group === F.engun)) continue;
        let mate = null, md = 15;
        for (const a of rt.army.units) {
          if (!a.alive || a.team !== u.team || a === u || a.isStruct || a.fleeing || a.woundOut || a.civ) continue;
          const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
          if (d < md && !rt.army.wallBetween(o.pos, -1, a.pos)) { md = d; mate = a; }
        }
        o.target = mate; o.atk = null; o.aiT = Math.max(o.aiT || 0, mate ? 1.5 : 0.5);
      }
    }
    // 11/18 クラウド持ち主（act bot 349秒 達成・本人の討ち取り4／味方99「斬り合う相手が少なくて退屈」）：
    //   ③④で本人から二十五歩より遠い味方の隊は刃を半分に（遠くで先に討ち切らず、本人の行く先に斬り合う相手を残す）。
    //   本人のそばの隊・敵の数と強さは同じ
    if ((F.step === 3 || F.step === 4) && (F.farT = (F.farT || 0) - dt) <= 0) {
      F.farT = 1;
      const base = F.step === 3 ? 0.4 : 0.3;
      // 11/18 09:55 クラウド持ち主（POSLOG 1.5秒刻み）：③で本人の十歩内に味方16〜18・敵8〜10の斬り合いでも、本人の突きが当たった敵を味方が先に討ち切り③の討ち取り0〜1。
      //   ③で本人の隊（中心が十歩内）は刃を六割に（本人の脇を固めて押さえ、止めは本人に譲る）
      for (const g of F.allies) if (g && !g.routed && g.count) { const c = g.center(); const d = c ? Math.hypot(c.x - P.x, c.z - P.z) : 99; g.dmgMult = d > 25 ? base * 0.5 : F.step === 3 && d < 10 ? base * 0.6 : base; }
    }
    // 11/18 クラウド kaito2（K365・全戦の一枚表で ④ に倒れた）：④で城からの加勢・守兵に三人以上囲まれ、退く背に一撃ずつ受けて倒れた（act bot 3回に1回）。敵は強いまま（K360⑦）、山崎と同じく四十五歩の内の味方の組（二つまで）が本人の所へ寄って囲みを割る
    // 11/18 クラウド11（受け持ち）：④で本人が味方より先に一人で北の口へ駆け込み、守兵の足軽と鉄砲に25秒で倒れた（act bot 334秒）。
    //   北の口の30m内で本人の15m内に味方の隊が無ければ、一番近い先手・浅野・池田の隊を本人の所へ寄せる（敵の数・強さは同じ）
    // 11/18 18:20 クラウド持ち主（act bot 340秒：浅野の侍が北の口の (8,-56) で行き先を持ったまま二十秒動かない）：
    //   ④⑤で北の口の二十歩内の味方が八秒動かず、四歩内に敵もいなければ、一歩半を横へ歩かせて詰まりを解く（数・強さは同じ）
    if (F.step >= 4 && F.step <= 5 && (F.unstT = (F.unstT || 0) - dt) <= 0) {
      F.unstT = 1;
      for (const u of rt.army.units) {
        if (!u.alive || u.team !== 0 || u.isPlayer || u.isStruct || u.perch || u.fleeing || u.invuln || Math.abs(u.pos.x - NGATE.x) > 20 || Math.abs(u.pos.z - NGATE.z) > 20) continue;
        const m = u._k08m || (u._k08m = { x: u.pos.x, z: u.pos.z, t: 0 });
        if (Math.hypot(u.pos.x - m.x, u.pos.z - m.z) > 0.4) { m.x = u.pos.x; m.z = u.pos.z; m.t = 0; continue; }
        if ((m.t += 1) < 8) continue;
        let foeNear = false; rt.army.forNear(u.pos.x, u.pos.z, 4, (o) => { if (!foeNear && o.alive && o.team === 1 && !o.isStruct && !o.fleeing) foeNear = true; });
        if (foeNear) { m.t = 0; continue; }
        const a = Math.random() * Math.PI * 2, x = u.pos.x + Math.cos(a) * 1.5, z = u.pos.z + Math.sin(a) * 1.5;
        if (!rt.world.walkable || rt.world.walkable(x, z, u.pos.y)) { u.moveTo = { x, z }; u.target = null; u.aiT = 2; }
        m.t = 0;
      }
    }
    if (F.step === 4 && rt.player.u.alive && near(P, NGATE, 45) && (F.escT4 = (F.escT4 || 0) - dt) <= 0) {
      F.escT4 = 2;
      const gs = [F.saki, F.asano, F.ikeda].filter((g) => g && g.count >= 3 && !g.routed).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9 }; });
      if (gs.length && !gs.some((x) => x.d < 15)) {
        const { g } = gs.sort((a, b) => a.d - b.d)[0];
        if (!(g._escT > rt.t)) { g._escT = rt.t + 6; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 14; q.seekRange = 18; }; }
      }
    }
    if (F.step >= 3 && F.step <= 5 && (F.surT = (F.surT || 0) - dt) <= 0) {
      F.surT = 0.5;
      let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.abs(u.pos.x - P.x) < 5 && Math.abs(u.pos.z - P.z) < 5 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 4.5) n++;
      const me = rt.player.u;   // 命が三割五分より下の時は二人に囲まれた所で呼ぶ（336秒の倒れ：命二割で背に二人ずつ受け続けた）
      // 11/17 クラウド持ち主：④で全延の組の侍二人に背と横から一太刀ずつ（侍の床＝命の二割七分）受け、三人目を待たずに倒れた（act bot 322秒・侍の傷127）。敵は軽くせず（K360⑦）、二人に挟まれたら味方を呼ぶ
      // 11/18 クラウド持ち主（act bot 334秒の倒れ）：④で本人が味方より先に一人で北の口へ駆け込み、守兵と鉄砲に二十五秒で倒れた。
      //   ④では十歩の内に味方が二人に満たないまま敵と斬り合えば、一人目から味方を呼ぶ（敵は弱めない）
      let mine = 0; if (F.step === 4 && n >= 1) for (const u of rt.army.units) if (u.alive && u.team === 0 && u !== me && !u.fleeing && !u.isStruct && Math.abs(u.pos.x - P.x) < 10 && Math.abs(u.pos.z - P.z) < 10) mine++;
      if (n >= 2 || (n >= 1 && me.hp < me.maxHp * 0.35) || (F.step === 4 && n >= 1 && mine < 2)) {
        const ns = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && !g.civ && !g.honjin && g.count >= 4 && (g !== F.asano2 || F.engunPushedBack)).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9 }; }).filter((x) => x.d < 60 && x.d > 3).sort((a, b) => a.d - b.d).slice(0, 3);
        // 11/18 クラウド持ち主：浅野の後備は押し返しの前は呼ばない（呼ぶと行軍の道と着いた時の押し返しが消え、④が三分待ちになった）
        for (const { g } of ns) if (!(g._rescueT > rt.t)) { g._rescueT = rt.t + 6; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 12; q.seekRange = 16; }; }
      }
    }
    // 砦の兵は手薄で浮き足立っている（史実）。豊臣方の組は傷を軽めにそろえる（夜襲の一人が数突きで倒れない）
    //   櫓の上の鉄砲と弓は、夜明けまでは闇に撃ち下ろすので当たりが浅い（11/6 fixc0823：描いて遊んだ通しで、丸太と寄せる門の前で南の櫓の二組に二十秒で撃ち倒された）
    // 11/14 クラウド：共通の待つ備の新手もここで毎秒 m に上書きされ、act が二回とも新手に倒れた（300・123）。新手は m の四割
    if (!(F.lightT > rt.t)) { F.lightT = rt.t + 1; const m = F.step <= 2 ? 0.3 : F.step === 4 ? 0.25 : 0.3;   // 11/18 クラウド K358：act bot が③の大手門の守り（傷135）と④の全延の組（96）に削られ315秒で倒れた。③④を軽く   // ④は北の口の守兵・全延の組・城からの加勢が一度に来る（11/9 二巡で加勢を足した分だけ軽く）
      // 11/17 クラウド持ち主：共通の厚み（depth_real.js）が本人の近くに立てる名無しの「遠くの備」が③④の倒れの傷の一番（act bot 3回で 41・57・63）。
      //   厚みの兵は共通の「新手」と同じ扱い（一太刀の床を掛けない＝player_hurt.js の /新手$/・打ち込みは m の四割）。兵の数はそのまま（斬る相手は減らさない）
      for (const g of rt.army.groups) if (g.team === 1 && g._far && g.name === '遠くの備') g.name = '明石の新手';
      for (const g of rt.army.groups) if (g.team === 1) g.dmgMult = F.towers.includes(g) || /物見櫓の守り|隅櫓の守り/.test(g.name || '') ? m * 0.2 : g === F.inner ? (F.step >= 4 ? 0.25 : 0.4) : g === F.wallG && F.step >= 4 ? 0.1 : g.name === '新手' || g._far ? m * 0.4 : g === F.engun ? 0.1 : g === F.zen ? 0.08 : m;   // 全延の組は馬上の大将と旗本で、bot の傷の大半（百二十〜百四十）を与えていた 11/18 クラウド：④で退くはずの大手門の守りが傷の大半（六十）を与えて倒した（cloud-14 の通し）→ ④からは一割
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
      const u = F.asano.units.find((v) => activeSoldier(v) && (v.type === 'ashigaru' || v.type === 'samurai') && W.waterDepthAt(v.pos.x, v.pos.z) > 0.8);
      if (u) {
        F.drown++; rt.army.kill(u, null);
        if (F.drown === 2) rt.say(SHISHA, '浅野殿の手、入り江の深みで溺るる者が出ておる', 3);
      }
    }
    // 舟手の鉄砲は川から砦の内の明石の兵を撃つ（舟の上の兵は共通の頭では的を選ばず撃たなかった。今福と同じく一人ずつ狙う。七〜十一秒に一発）
    if (F.step >= 2 && F.step <= 4) for (const g of F.fune) for (const u of g.units) {
      // 舟上でも、負傷して戦列を離れた者や倒れた者は撃たない。
      if (g.routed || !u.alive || u.gone || u.fleeing || u.dying || u.woundOut || u.rearWound || u.downed || u.evacuatedWound) continue;
      if ((u.k08Shot = (u.k08Shot ?? 1 + Math.random() * 6) - dt) > 0) continue;
      u.k08Shot = 7 + Math.random() * 4;
      // 11/18 クラウド持ち主：本人と斬り合う相手（本人の六歩内）は舟から撃たない（本人の討ち取りが味方に先を越される。敵の数・強さは同じ）
      const t = rt.army.nearestEnemy(u, 60, (o) => !o.isStruct && fightable(o) && !o.group?.routed && Math.hypot(o.pos.x - P.x, o.pos.z - P.z) > 6);
      if (t) { u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.mesh.rotation.y = u.heading; rt.army.fireGun(u, t); }
    }
    if (F.step === 1) {
      const n = sum(F.s1, guardsShore), elapsed = rt.t - F.tS;
      // 11/18 21:00 クラウド持ち主（act bot POSLOG：本人が入り江を渡り北岸へ上がった79秒には、岸の鉄砲組 23人中22人を先手が討ち終えていて、①の本人の討ち取り0）。
      //   本人が北岸へ上がって二十秒までは、味方の刃は浅く（一割五分。上がって九秒で十四人が討ち尽くされた）。その後は元の四割（敵の数・強さ・本人へ来る弾は同じ）
      { const m = F.shoreJoined && rt.t - F.shoreJoinAt > 20 ? 0.4 : 0.15; for (const g of F.allies) g.dmgMult = m; }
      // 11/18 10:00 クラウド持ち主（act bot「印に着いても六秒なにも起きない」50秒・岸の鉄砲組）：本人が北岸へ上がったら、
      //   岸の鉄砲組の侍と足軽（鉄砲を守る槍の六人）が「上がって来た」と本人へ斬りかかる。十六秒の間、一秒ごとに二十歩内の者を本人へ向ける（鉄砲は列のまま撃つ）
      if (F.shoreJoined && rt.player.u.alive && rt.t - F.shoreJoinAt < 16 && (F.shoreT = (F.shoreT || 0) - dt) <= 0) {
        F.shoreT = 1;
        const PU = rt.player.u;
        if (!F.shoreCry) { F.shoreCry = true; rt.say('岸の鉄砲頭', '一人上がって来たぞ。槍を付けよ！', 2.6); }
        for (const u of F.front.units) {
          if (!u.alive || u.fleeing || u.type === 'gun' || u.atk || u.target === PU || Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 20) continue;
          u.target = PU; u.moveTo = { x: P.x, z: P.z }; u.aiT = 0.8;
        }
      }
      if (!F.w1on && (n <= F.fN * 0.6 || (F.shoreJoined && elapsed > 75))) {
        F.w1on = true; join(rt, 's1', 'fN', F.w1);
        rt.say('明石全延', '岸の者を見捨てるな。門から出て撃ちかけよ', 3.2);
        return;
      }
      // 本人の渡河と門前の新手を待つ。長引いても六割を崩し、岸を八秒保てば残兵は退く。
      F.shoreHeld = F.shoreJoined && P.z <= SHORE.z + 10 && near(P, SHORE, 18) && shoreCanHold(F) ? (F.shoreHeld || 0) + dt : 0;
      if (F.shoreJoined && F.w1on && (n <= F.fN * 0.15 || (elapsed > 180 && F.shoreHeld > 8))) this.stage2(rt);
    } else if (F.step === 2) {
      // 別手が砦の背に着くか、四十秒経てば民家に火
      if (!F.burned && (rt.t - F.tS > 40 || near(F.east.center(), { x: 44, z: -82 }, 14))) this.burn(rt);
      const st = F.gate;
      if (!st || !st.alive || st.hp <= 0) {
        // 味方が先に破った時も破壊済みの数を出し、本人が門へ来るまでは②で待つ。
        rt.objProgress('main', '100／100');
        if (F.gateJoined) this.stage3(rt);
        return;
      }
      // 印は門の四歩手前。印への到着と門攻めへの参加の間合いをそろえ、
      // 丸太の到着待ちでも、寄せた本人へ一度だけ状況を返す。
      const atGate = P.z >= GATE.z && near(P, GATE, 10);
      if (atGate && !F.gateArrivalReported) {
        F.gateArrivalReported = true;
        rt.say('蜂須賀の先手', F.ramZ > GATE.z + 5 ? '丸太が続くぞ！　門の前を押さえよ！' : '丸太に合わせ、門を打ち破れ！', 3);
        // 11/18 14:55 クラウド持ち主（act bot：②の五十八秒は門の下で斬る相手が無く討ち取り0）：
        //   門扉の脇のくぐり戸から守兵五人が打って出て、門の前の本人へ斬りかかる（砦の兵は籠らず一度は突いて出る）。数は小さく、門が破れれば③へ続く
        rt.after(2.5, () => {
          if (F.step !== 2 || F.sallyG) return;
          const g = F.sallyG = foe(rt, 'くぐり戸の打って出る組', { x: -3, z: GATE.z + 3 }, [sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 3)], { aggro: 20, width: 4, facing: 0 });
          g.order = 'attack'; g.seekRange = 24;
          const PU = rt.player.u;
          for (const u of g.units) { u.target = PU; u.aiT = 0.8; u.k08sally = true; }
          rt.say('明石の物頭', 'くぐり戸を開けよ。門の前の者を突き崩せ！', 2.8);
        });
      }
      // 11/18 17:25 クラウド持ち主（POSLOG：くぐり戸の五人が出て十五秒で三人が本人から二十〜四十七歩へ散り、②の討ち取り0〜1）：
      //   打って出た組は門の前の本人を狙い続ける（二十歩より遠くへ逸れた者は本人へ向け直す。数・強さは同じ）
      if (alive(F.sallyG)) { const PU = rt.player.u; if (PU?.alive) for (const u of F.sallyG.units) {
        if (!fightable(u) || u.fleeing || u.target === PU) continue;
        if (Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 6 || !u.target?.alive) { u.target = PU; u.moveTo = { x: P.x, z: P.z }; u.aiT = 0.8; }
      } }
      // 寄せた味方が門を打つ（門の前に味方が多いほど早い。主人公がそばで打てばさらに早い）
      let n = 0;
      // 倒れて手当て待ちの者・退場中の者・敗走兵は門を打てない。
      if (alive(F.saki)) for (const u of F.saki.units) if (activeSoldier(u) && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 16) n++;
      if (atGate) n += 8;   // 印に着いて門攻めに加われば早く破れる（門の下に長く立たせない）
      // 11/18 17:50 クラウド持ち主（②の討ち取り0〜2：火が付いてから十五秒で門が破れ、くぐり戸の五人を討つ暇が無い）：
      //   くぐり戸の組が本人の八歩内で斬り結んでいる間は、本人は門を打てない（印の加わりを数えない。味方の打つ分と火の分はそのまま）
      if (atGate && alive(F.sallyG) && F.sallyG.units.some((u) => fightable(u) && !u.fleeing && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 8)) n -= 8;
      if (alive(F.wallG) && F.wallG.count > 6) n = Math.floor(n * 0.6);
      if (F.burned) n += 6;   // 背の火で守りが浮き足立ち、閂を守る手が減る（門の前に主人公を一分半も立たせない）
      if (n) { st.hp -= dt * 0.9 * Math.min(n, 14); if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.army.structFall(st); this.onStructDestroyed(rt, st); } }
      rt.objProgress('main', `${Math.round(100 - (100 * st.hp) / st.maxHp)}／100`);
    } else if (F.step === 3) {
      const left = sum(F.s3, guardsInside), elapsed = rt.t - F.tS;
      // 本人の侵入から二十秒でも奥の手を放つ。守兵が半減するまで控え続け、
      // 本人は射撃だけを受けて斬り合えない待ち時間になるのを防ぐ。
      // 11/19 07:25 クラウド持ち主（act bot POSLOG：③で守兵十五人と斬り合い命が三割を切った所へ奥の新手十六人が一度に出て、十秒で倒れた（189秒・二十本に二本）。
      //   奥の新手は、本人の命が半分を切っている間は控える（竹束の陰で縛って戻れば出る。③に入って百五十秒たてば待たない）
      const okuWait = rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.5 && rt.t - F.tS < 150;
      if (!F.okuOn && !okuWait && (left <= F.gN * 0.5 || (F.insideJoined && insideFort(P) && rt.t - F.insideEntryAt > 20))) {
        F.okuOn = true;
        for (const u of F.oku.units) u.noTarget = false;
        join(rt, 's3', 'gN', F.oku, true);
        // 「門を取り返せ」の下知で、奥の小屋から砦の中央へ出る。
        // 元の持ち場のままでは味方だけと交戦し、本人の前へ出てこなかった。
        hold(F.oku, INSIDE.x - 6, INSIDE.z - 4);
        // 中央へ並ぶだけで終わらず、門から入った寄せ手へ打って出る。
        // 射手の引き足は引き続き抑え、索敵距離と強さは変えない。
        F.oku.order = 'attack';
        rt.say('明石全延', '奥の者も出よ！　門を取り返せ', 3);
        return;
      }
      // 本人が内へ入り、守りの八割を崩せば残兵は退く。奥の手の出撃は必ず待つ。
      // 長引いた時も六割を崩し、本人が砦内を八秒保つまでは進めない。
      F.insideHeld = F.insideJoined && insideFort(P) && left <= F.gN * 0.4 ? (F.insideHeld || 0) + dt : 0;
      // 11/22 03:05 クラウド持ち主（act bot --mobile 6本：③が124〜282秒・戦の全体が424〜583秒で七分を越える回が半分）：長引いた時の区切りを百八十秒→百三十秒（六割を崩し砦の内を八秒保つ条件は同じ）
      // 11/22 03:15 同（act bot POSLOG：③で命が満ちた本人が大手門の口 (-5,0〜-8) で門の内の守兵と斬り合い続け、一度も砦の内（門より北）へ踏み込まず、守兵の残り9→3 のまま七十秒待った）：
      //   百三十秒たって守兵を八割崩していれば、門の口で戦う本人も加わったと見る（砦の内へ入る順は同じ）
      const gateJoined = elapsed > 130 && left <= F.gN * 0.2 && P.z < GATE.z + 12 && Math.abs(P.x) < WALL_X;
      if ((F.insideJoined || gateJoined) && F.okuOn && (left <= F.gN * 0.2 || (elapsed > 130 && F.insideHeld > 8))) this.stage4(rt);
    } else if (F.step === 4) {
      engun.update(rt);
      // 11/18 20:10 クラウド持ち主（act bot 282秒の倒れ：本人が大手門の外の竹束へ下がって傷を縛る間に、北の口の全延の組の侍が六十歩追って来て背から斬った）：
      //   本人が大手門の外まで下がった間は、北の口の守兵と全延の組は持ち場で構える（追わない）。砦の内へ戻れば、また打ちかかる
      // 11/19 05:50 クラウド持ち主（act bot POSLOG 304〜430秒：命十割の本人が大手門の内 (-3,-7) に立つ間も全延の組が門の内 (0,-14) で構えたまま百二十秒、討ち取りが止まった）：
      //   構えるのは本人が門の外で傷を縛る間（命七割未満）だけ（k08/engun.js の resting と同じ）
      { const away = P.z > GATE.z - 4 && rt.player.u.hp < rt.player.u.maxHp * 0.7;
        for (const g of [F.w3, F.zen]) if (alive(g) && !g.routed && g.order !== 'flee') {
          // 11/19 06:00 クラウド持ち主（act bot POSLOG 385〜694秒：構えた全延の組が大手門の内 (0,-10) に居座り、北の口へ向かう本人の行く手を三百秒ふさいだ）：構える時は北の口の持ち場へ戻る
          if (away && g.order === 'attack') { const h = g.k08Home || (g.k08Home = g === F.zen ? { x: 2, z: WALL_N + 22 } : { x: NGATE.x, z: NGATE.z + 8 }); hold(g, h.x, h.z); g.seekRange = 12; g.k08Held = true; for (const u of g.units) if (u.alive && u.target?.isPlayer) u.target = null; }
          else if (!away && g.k08Held) { g.order = 'attack'; g.seekRange = 30; g.k08Held = false; }
        } }
      // 柵の外へ押し出された守兵は北の口の守りから外れた者（博労淵へ逃げる）。残りが追えずに④が止まらないように
      //   退き口を守る組は四十五秒は粘る（11/5 crit：④が二十秒で済んだ）
      const left = northLeft(F);
      // 加勢が塀の外で足止めされても、両方の手を半数まで崩し北の口を押さえれば退ける。
      // 出撃と後備の押し返しは engun.cleared で待つ。時間だけでは達成しない。
      F.northHeld = F.northJoined && insideFort(P) && near(P, NORTH_AT, 16) && northCanHold(rt) ? (F.northHeld || 0) + dt : 0;
      const secured = northHoldReady(rt) && F.northHeld > 8;
      if (F.northJoined && (left <= Math.floor(F.nN * 0.2) || secured) && rt.t - F.tS > 45 && engun.cleared(rt, secured)) this.stage5(rt);
    } else if (F.step === 5) {
      // 幟は主人公が北の口に来て立てる。待つだけで最後の目標を果たさない。
      // 主人公は北の口に着いて幟の竿を土に突き立てる（櫓から撃たれながら五秒ほど留まる。着いた途端に勝ちにしない）
      // 北の塀の外から、板塀越しに竿を立てた事にしない。
      F.plant = insideFort(P) && near(P, F.flagAt, 6) ? (F.plant || 0) + dt : 0;
      // 11/18 k365-cloud-39（act bot 493秒：着いて六秒なにも起きない）：竿を突き立て始めた時に台詞で知らせる
      if (F.plant > 0 && !F.plantSaid) { F.plantSaid = true; rt.say('組頭', '幟の竿を突き立てよ！　ここで踏みとどまれ', 3); }
      if (F.plant > 5) this.win(rt);
    }
  },
};

// bot の頭：近い敵を突き、段の行き先へ。門の段は門を打つ
k08_osaka_kizu.botBrain = (b, inp, { goTo, patientStrike }) => {
  b.botRest = false;
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  if (!F.step) return;   // 戦の前の話の間は陣で聞く（先に岸へ走って鉄砲組に撃たれた）
  const gc = F.saki.center();
  // 手負いは門の前の竹束の陰まで下がり、傷が癒えてから戻る（門の前と砦の内で矢玉に討たれた。11/6 fix4 の通しで四度）
  // 11/19 01:22 クラウド持ち主（POSLOG：③で一度に二割削られ竹束の陰で命八割半まで六十秒余り休み、その間に味方が守兵を討ち切った・③の討ち取り1〜2）：③は七割で戦へ戻る（試し役の頭だけ）
  if (u.hp < u.maxHp * 0.45) F.botRest = true; else if (u.hp > u.maxHp * (F.step === 3 ? 0.7 : 0.85)) F.botRest = false;
  // 11/19 05:15 クラウド持ち主（POSLOG：②でくぐり戸の侍に一太刀受けて命六割を切るとすぐ竹束へ下がり、②の討ち取り0が七回続いた）：
  //   くぐり戸の組が本人の八歩内にいる間は、命四割半まで踏み留まって斬り結ぶ（試し役の頭だけ）
  const sallyNear = F.step === 2 && alive(F.sallyG) && F.sallyG.units.some((o) => fightable(o) && !o.fleeing && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 8);
  if (u.hp < u.maxHp * 0.6 && F.step === 2 && !sallyNear) F.botRest = true;
  // 共通の自動操作にも休息を伝え、性格による突進や射撃への持ち替えで退避を上書きさせない。
  b.botRest = !!F.botRest && F.step >= 2 && F.step <= 4;
  //   竹束の列（GATE.z+15）は真ん中の通り道から抜ける（斜めに下がると竹束に詰まって門の前に立ち続けた）
  //   ③④も破れた南面から竹束の陰へ。先手の八歩後ろでは前線と共に動き、北の櫓の射程内で休み続けていた。
  if (F.botRest && F.step >= 3 && F.step <= 4) {
    const rest = F.botRestAt || (F.botRestAt = { x: 0, z: 0 });
    const passing = u.pos.z < GATE.z + 16.2;
    rest.x = passing ? 0 : -8.2; rest.z = GATE.z + (passing ? 17.5 : 16.9);
    // 11/18 クラウド持ち主（act bot 331・336秒の倒れ）：④の北の口から六十歩南の竹束まで退く間に、城からの加勢に背から斬られ続けた。
    //   ④は先手が北の口に踏み留まっていれば、その六歩後ろ（門の内の弓鉄砲の十八歩より北）で息を継ぐ
    if (F.step === 4 && alive(F.saki) && F.saki.count >= 3 && u.pos.z < GATE.z) {
      const c = F.saki.center();
      if (c && Math.abs(c.x) < WALL_X - 2 && c.z < -40 && c.z > WALL_N) { rest.x = c.x; rest.z = Math.min(c.z + 6, -45); }
    }
    goNorthTo(b, inp, goTo, rest, 0.6);
    return;
  }
  //   ②は通り道の真ん中に立つと門の内の鉄砲に撃ち抜かれた（同じ通しで 111 秒に討たれた）。通り道を抜けたら西の竹束の真後ろに隠れる
  if (F.botRest && F.step === 2) {
    if (u.pos.z < GATE.z + 16.2) {
      const rest = F.botRestAt || (F.botRestAt = { x: 0, z: 0 });
      rest.x = 0; rest.z = GATE.z + 17.5;
      goNorthTo(b, inp, goTo, rest, 1); return;
    }
    goTo(p, inp, -8.2, GATE.z + 16.9, 0.6); return;
  }
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  // 櫓の床の上の撃ち手は地上から突けない。届かない相手の下で足を止めない。
  // 11/18 21:10 クラウド持ち主（act bot POSLOG：③で東の塀の外 (30,-20) に四十秒立ち、塀の外の敵へ寄り続けて討ち取り0）。③は砦の内の敵か四歩内の敵だけへ寄る
  const e = b.army.nearestEnemy(u, 12, (o) => fightable(o) && (F.step !== 1 || F.s1.includes(o.group) && guardsShore(o)) && (F.step !== 3 || insideFort(o.pos) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4) && !o.group?.routed && !o.isStruct && o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (F.step === 1 && b.t - F.tS > 180 && shoreCanHold(F)) {
    goTo(p, inp, SHORE.x, SHORE.z, 2);
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      patientStrike(p, inp, e, Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z));
    }
    return;
  }
  if (F.step === 4 && northHoldReady(b) && northCanHold(b)) {
    // 塀の外の残兵を追うと、守りを崩していても北の口の保持が始まらない。
    // 持ち場へ戻り、近くの敵にはその場で応戦する。
    goNorthTo(b, inp, goTo, NORTH_AT, 2);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      patientStrike(p, inp, e, d);
    }
    return;
  }
  // 11/18 クラウド持ち主（act bot 1080秒の時切れ）：③で門の外 (4,4) の竹束の脇に十五分立ち、一突きもせず。届かない敵へ寄り続けて詰まった。
  //   寄る敵が三歩より遠いまま十五秒で一歩半も動けない時は、その敵を八秒あきらめて任務の印へ歩く
  { const k = F.botStuck || (F.botStuck = { x: u.pos.x, z: u.pos.z, t: b.t, skip: 0 });
    if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 1.5 || !e || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 3) { k.x = u.pos.x; k.z = u.pos.z; k.t = b.t; }
    else if (b.t - k.t > 15) { k.skip = b.t + 8; k.t = b.t; } }
  // 11/18 クラウド持ち主（act bot POSLOG 49〜79秒）：①で北岸の縁 (7,46) に三十秒「速0」で立ち、十二歩内の鉄砲組へ寄れず本人の討ち取り0。
  //   ①で詰まったら八秒、五歩横へずれてから岸の上 (z=38) へ上がり直す
  if (F.step === 1 && F.botStuck.skip > b.t && u.pos.z > SHORE.z + 9) {
    const side = F.botStuck.side || (F.botStuck.side = u.pos.x > SHORE.x ? -1 : 1);
    goTo(p, inp, F.botStuck.x + side * 5, SHORE.z + 8, 1.2); return;
  }
  if (F.step === 1 && F.botStuck.skip <= b.t) F.botStuck.side = 0;
  if (e && F.step >= 1 && F.step < 5 && !(F.step >= 3 && F.botStuck.skip > b.t)) {
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
  if (F.step <= 1) { at(shoreTarget(F, u.pos)?.pos || SHORE, 2.2); return; }
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
  if (F.step === 3) { goNorthTo(b, inp, goTo, insideTarget(F, u.pos)?.pos || INSIDE, 2.2); return; }
  if (F.step === 4) {
    const target = northTarget(F, u.pos)?.pos || NORTH_AT;
    // 加勢を迎えて門の外へ出た後も、内の守兵へは開いた北門を通って戻る。
    // 外へ出る時だけ迂回すると、帰りに北の塀へ斜めに寄って止まる。
    goNorthTo(b, inp, goTo, target, 2.2); return;
  }
  // ⑤は砦の真ん中の道を北へ（櫓の角へ真っすぐ向かって詰まらない）
  const f = F.flagAt || NGATE;
  // 11/18 09:20 クラウド持ち主（act bot 1080秒の時切れ）：⑤で大手門の内 (2,-15) に「速0」のまま二百秒立ち、幟へ歩けなかった。
  //   六秒で一歩半も動けなければ、三秒だけ六歩横へずれてから幟へ歩き直す
  { const k = F.botStuck5 || (F.botStuck5 = { x: u.pos.x, z: u.pos.z, t: b.t, until: 0, side: 1 });
    if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 1.5 || Math.hypot(u.pos.x - f.x, u.pos.z - f.z) < 4) { k.x = u.pos.x; k.z = u.pos.z; k.t = b.t; }
    else if (b.t - k.t > 6) { k.until = b.t + 3; k.side = -k.side; k.t = b.t; k.x = u.pos.x; k.z = u.pos.z; }
    // 11/18 21:55 クラウド持ち主（act bot 1080秒の時切れ：⑤で北東の櫓の脚 (18,-53) に五百秒、左右へ六歩ずれては同じ所へ戻った）。
    //   北の塀の際（櫓の下）で詰まった時は、北へではなく砦の真ん中の側へ四歩・幟の側へ六歩ずれる
    if (k.until > b.t) {
      const nearN = u.pos.z < WALL_N + 9, sx = nearN && Math.abs(u.pos.x - f.x) > 3 ? Math.sign(f.x - u.pos.x) : k.side;
      goTo(p, inp, Math.max(-(WALL_X - 4), Math.min(WALL_X - 4, u.pos.x + sx * 6)), nearN ? u.pos.z + 4 : u.pos.z - 2, 0.8); return; } }
  // 加勢を追って北門の外に残った場合も、塀を横切らず開いた門から幟へ戻る。
  if (u.pos.z < WALL_N || Math.abs(u.pos.x) > WALL_X) { goNorthTo(b, inp, goTo, f, 2); return; }
  if (Math.abs(u.pos.x - f.x) > 5 && u.pos.z > f.z + 8) { at({ x: f.x, z: u.pos.z - 4 }, 2); return; }
  at(f, 2);
};

// 11/18 クラウド持ち主（act bot 400秒の倒れ：④で手負いの退きが北西の隅 (-24,-58) へ押し込まれ、塀を背に三十五秒囲まれた・討ち取り0）：
//   砦の内で退く時は、東西と北の塀から六歩より内の先へは退かない（隅に背を付けず、砦の真ん中へ抜ける）
const RETREAT_WAY = { x: 0, z: 0 };
k08_osaka_kizu.botRetreatWay = (b, back) => {
  const pos = b.player.u.pos;
  // 11/18 09:15 クラウド持ち主（POSLOG）：③の始めに東の柵の破れ目 (24,-31) で囲まれ、退きが柵の外の東へ抜けて (62,-35) で詰まり③を外で過ごした。柵の際（六歩の内）でも砦の内へ退く
  const nearFort = Math.abs(pos.x) < WALL_X + 6 && pos.z > WALL_N - 4 && pos.z < GATE.z + 6;
  if (!nearFort) return back;
  RETREAT_WAY.x = Math.max(-(WALL_X - 6), Math.min(WALL_X - 6, back.x));
  RETREAT_WAY.z = Math.max(WALL_N + 6, back.z);
  return RETREAT_WAY;
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k08_osaka_kizu = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.fN, sum(F.s1, guardsShore), F.fN * (rt.t - F.tS > 180 ? 0.4 : 0.15));
  // 長引いた時は、残兵を追い尽くさず持ち場を保って進む。
  // その時の必要人数も実際の判定に合わせる（保持の八秒は引き続き必要）。
  const holding = rt.t - F.tS > 180;
  // ③の長引きの区切りは段の判定（stage4 の百三十秒）に合わせる（11/22 03:05 に判定だけ百八十→百三十へ変え、札の倒す数が百八十秒のままだった）
  if (F.step === 3) return cut(F.gN, sum(F.s3, guardsInside), F.gN * (rt.t - F.tS > 130 ? 0.4 : 0.2));
  if (F.step === 4) {
    const securing = northHoldReady(rt);
    const north = cut(F.nN, northLeft(F), securing ? F.nN * 0.5 : Math.floor(F.nN * 0.2));
    const reinforcements = cut(F.engunN, engun.remaining(rt), securing ? F.engunN * 0.5 : Math.ceil(F.engunN * 0.3));
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
