// ======================================================================
// 越前・大滝寺の山狩り　導入（0〜6分）「森の残党捜索・小隊の山狩り・山中の一揆勢」（docs/oda15_plan_1108.md 19）
//   府中を追われた一揆の残りが山に潜む。組（小隊）で雨の森の小道を狩り、藪から立った残党と槍を合わせる。
//   次に右の谷筋へ回ると、潜んでいた一団が坂の上から竹槍で突き下ろす（山中の小さな戦）。
//   生け捕った者の口から、千余りが大滝寺に籠ったと知れ、麓の参道へ戻って寺攻め（本体の assault）へ渡す。
// 兵は二つの一団の十五人だけ。字は台詞と任務の一行だけ。行き先は金の▼一つ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { siegeFighter } from '../siege_zones.js';
import { sweepGroup, leaveForMe } from './hondo_sweep.js';

const A = { x: -30, z: -150 };   // 左の森の小道の入り口（FOREST_ROAD の初め）
const B = { x: 24, z: -142 };    // 右の谷筋（VALLEY_ROAD の初めの手前）
const BACK = { x: 0, z: -165 };  // 麓の参道の集まり場
export const GOAL = '雨の森と谷筋で、潜む一揆の残党を狩る';
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// 討死動作中・後送中の者を、残る敵や行き先へ数えない（寺攻めと同じ条件）。
const fighter = (u) => siegeFighter(u) && u.hp > 0 && !u.dying && !u.rearWound;
// 11/18 クラウド持ち主：谷の一団の一人が惣門の方へ流れ、印がそれを追って本人を惣門の見張りの中へ連れて行き、act bot が山狩りの間に二度倒れた（126・169秒）。
//   寺の麓の線（z −118）より上へ流れた残党は、山狩りの相手にも印にも数えない（散った者として扱う）。
const inHills = (u) => u.pos.z < -118;

export function active(rt) { const Y = rt.flags.ikYama; return !!Y && !Y.done; }
export function pin(rt) {
  const Y = rt.flags.ikYama;
  if (!Y || Y.done) return null;
  // 斬り合いの間も残る敵を指す。離れた弓兵が索敵の外へ出ても、本人の足元で止まらない。
  if (Y.s === 1 || Y.s === 3) {
    const p = rt.player.u.pos;
    let target = null, nearest = Infinity;
    if (Y.g) for (const u of Y.g.units) {
      if (!fighter(u) || !inHills(u)) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < nearest) { target = u.pos; nearest = d; }
    }
    return target || (Y.s === 1 ? A : B);
  }
  return Y.s === 0 ? A : Y.s === 2 ? B : Y.s === 4 ? BACK : null;
}

// ctx：{ look（門徒の小袖）, done（寺攻めを始める） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.ikYama) return;
  const Y = F.ikYama = { s: 0, at: rt.t, ctx, done: false };
  rt.unmark('main');
  rt.marker('ikYama', () => pin(rt) || rt.player.u.pos, '山狩り', {});
  rt.obj('main', '雨の森の左の小道で、一揆の残党を狩る', 'main', true);
  rt.say('組頭', '府中を追われた一揆が、この山に潜んでおる。左の森の小道から狩るぞ', 4);
  for (const q of rt.squadGroups || []) q.order = 'follow';
}

// 寺の惣門の守りと混ざらないよう、寺から十分離れた所（z −135 より麓）に置き、崩れたら寺と反対の外の山へ逃がす
function band(rt, Y, at, list, name) {
  Y.bands ||= [];
  const g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name, fixed: true, noGuard: true, anchor: { ...at }, facing: Math.PI,
    fleeDir: { x: Math.sign(at.x) || -1, z: -0.6 }, aggro: 24, seekRange: 30, width: 8, formation: 'loose', morale: 100, noRout: true, speed: 3.4 },
  list.map(([type, n]) => ({ type, n, o: { ...Y.ctx.look } })));
  g.order = 'attack';
  // 11/14 クラウド：山狩りの残党が崩れず倍率もなく、始まりの段（98 秒）で act を倒した（103）。一太刀を半分に
  g.dmgMult = 0.5;
  Y.bands.push(g);
  return g;
}
const standing = (g) => g.units.filter((u) => fighter(u) && inHills(u)).length;
function rout(g) {
  g.fleeDir = { x: Math.sign(g.anchor.x) || -1, z: -0.6 };
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.focus = null;
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
}

export function tick(rt) {
  const F = rt.flags, Y = F.ikYama;
  if (!Y || Y.done || F.ending) return;
  // 11/15 クラウド：act bot が森の小道・谷筋の印に着けず、導入の山狩りのまま 1080 秒止まった。五分を過ぎたら残党は散り、寺攻めへ
  Y.t0 ??= rt.t;
  if (rt.t - Y.t0 > 300) { for (const g of Y.bands || []) if (g && !g.routed) rout(g); finish(rt); return; }
  const p = rt.player.u.pos;
  if (Y.s === 1 || Y.s === 3) sweepGroup(rt, Y.g);
  holdBig(rt, Y);
  // 時間だけで発見・撃退・帰還を済ませない。本人の到着と守りの損耗を待つ。
  // ① 森の小道へ。着くと藪から残党が立つ
  if (Y.s === 0) {
    if (near(p, A, 10)) {
      Y.s = 1; Y.at = rt.t;
      Y.g = band(rt, Y, { x: A.x - 6, z: A.z + 18 }, [['ashigaru', 3]], '山に潜む一揆の残党');   // 11/18 K358 クラウド kaito2：K360⑦ の後、始まって16〜30秒に侍の床の一太刀（命の六割×0.8）を含む囲みで倒れた。山に逃げた門徒の残党は百姓なので侍を外す   // 11/18 K358 クラウド kaito2：K360⑦ の後、始まって17秒から足軽六人に囲まれ床の一太刀で32秒に倒れた（act bot）。六→三人・藪は18m 先（照らし直しの4倍速の bot が始まって30秒で囲まれ倒れた）
      Y.n = Y.g.units.length;
      try { sfx('toki', 0.5); } catch (e) { /* なし */ }
      rt.say('足軽', 'おった！　藪の中じゃ！', 2.4);
      rt.after(2.6, () => rt.say('組頭', '槍をそろえよ。一人も逃がすな！', 2.8));
    }
    return;
  }
  // 岩場で止まった残党は上の sweepGroup で通れる道へ動き直す。
  // 損害の無い時間が続いた事だけでは、まだ戦える一団を撃退済みにしない。
  // 11/18 クラウド持ち主：谷筋の一団が岩場に残り、act bot が谷の狩りの段で286秒止まった（全体の五分の〆切まで）。
  //   一つの狩りが百秒を過ぎたら、残りは山へ散った事にして次の行き先へ（味方の先手が寺の外堂まで流れて待たない）。
  // 11/18 14:40 UTC 持ち主（act bot 1412・1415・1418：山狩りの段の討ち取り0〜1）：三人の一団が一人倒れただけで崩れて逃げていた。最後の一人になるまで槍を合わせる
  if (Y.s === 1) {
    if (standing(Y.g) > 1 && rt.t - Y.at < 100) return;
    rout(Y.g);
    Y.s = 2; Y.at = rt.t;
    rt.obj('main', '右の谷筋で、潜む一揆の残党を狩る', 'main', true);
    rt.say('組頭', '残りは谷へ逃げた。右の谷筋へ回れ！', 3.2);
    rt.after(3.6, () => rt.say('物見', '谷の上の岩陰に、竹槍の一団が潜んでおります', 3.2));
    return;
  }
  // ② 右の谷筋へ。坂の上から一団が突き下ろす
  if (Y.s === 2) {
    if (near(p, B, 12)) {
      Y.s = 3; Y.at = rt.t;
      Y.g = band(rt, Y, { x: B.x + 8, z: B.z + 12 }, [['ashigaru', 4], ['bow', 1]], '谷に潜む一揆勢');   // 同じ訳で侍を外す   // 同じ訳で六→四人
      Y.g.aggro = 40; Y.g.seekRange = 45;
      try { sfx('toki', 0.9); } catch (e) { /* なし */ }
      rt.say('一揆の門徒', '仏敵を討て！　南無阿弥陀仏！', 2.8);
    }
    return;
  }
  if (Y.s === 3) {
    if (standing(Y.g) > 1 && rt.t - Y.at < 100) return;
    rout(Y.g);
    Y.s = 4; Y.at = rt.t;
    rt.obj('main', '麓の参道へ戻り、寺攻めに加わる', 'main', true);
    rt.say('組頭', '生け捕った者が言うには、残党が大滝寺に籠ったそうじゃ', 3.6);
    rt.after(4, () => rt.say('組頭', '麓の参道へ戻れ。滝川様の先手が寺へ寄せる', 3.2));
    rt.award((t) => { t.side.push('雨の森と谷筋で一揆の残党を狩った'); }, '山の残党を狩った', B);
    return;
  }
  // ③ 麓の参道へ戻ると寺攻め
  if (Y.s === 4 && near(p, BACK, 12)) finish(rt);
}

// 11/18 17:20 UTC クラウド持ち主（act bot の位置の記録 1714・1717）：山狩りの一団（二〜五人）に、参道を寄せる滝川の先手（槍）・物見・麓の後備えの
//   三十〜五十人が本人のまわりから群がり、残党は本人の槍が届く前に削られた（段1 討0〜2・十五m 内の味方 46〜54人）。
//   山狩りは組（本人と組の者）の仕事。狩りの間は、一団の三十m 内にいる組でない味方の隊は自分から斬りかからない（寺攻めへ渡す時に戻す）。
function holdBig(rt, Y) {
  Y.held ||= new Set();
  const g = (Y.s === 1 || Y.s === 3) && Y.g && !Y.g.routed ? Y.g : null;
  const c = g && g.units.find((u) => fighter(u) && inHills(u));
  const me = rt.player.u, squads = rt.squadGroups || [];
  for (const h of Y.held) if (!c) { h.noEngage = h._ikYamaNoEngage0; Y.held.delete(h); }
  // 寺の守りの綱は、一団と一団の間（次の一団を探す間・麓へ戻る間）も外さない（外すと ai.js が起こして森へ下りた）。外すのは finish の時
  leashTemple(rt, Y, !Y.done);
  if (!c) return;
  // 11/19 05:50 UTC 持ち主（act bot 0514・0538：81・126秒 竹束を押して寄せる滝川一益の手（鉄砲）が止めた隊に入り、「攻めよ」の足を noEngage で止められ
  //   行き先の前で二十秒立ち尽くした★）：竹束を押している隊は止めず歩ませ、残党への狙いだけ本人に譲らせる（下の leaveForMe）。
  // 11/19 06:20 UTC 持ち主（act bot 0609：111秒 谷筋へ回る手（弓）が竹束の寄せの待ち（ready）のまま止めた隊に入り、号令 attack・行き先無しで (16,-142) に立った★）：
  //   竹束の寄せを待つ隊（ready）も押す隊と同じに止めず、残党への狙いだけ本人に譲らせる。
  const pushers = (rt.flags.TA?.items || []).filter((it) => (it.st === 'push' || it.st === 'ready') && it.g?.real).map((it) => it.g.real);
  for (const a of rt.army.groups || []) {
    if (a.team !== me.team || a === me.group || squads.includes(a) || Y.held.has(a) || pushers.includes(a)) continue;
    if (!a.units.some((u) => u.alive && Math.hypot(u.pos.x - c.pos.x, u.pos.z - c.pos.z) < 30)) continue;
    a._ikYamaNoEngage0 = !!a.noEngage; a.noEngage = true; Y.held.add(a);
    for (const u of a.units) if (u.target && g.units.includes(u.target)) u.target = null;
  }
  // 11/18 22:30 UTC 持ち主（act bot の位置の記録 2216：谷の一団四人に滝川一益の手19人・谷筋へ回る手12〜19人が掛かり、森の二人に組の者6〜12人が掛かって
  //   本人は段1 討1）。noEngage だけでは近い敵（15m）を拾い直すので、毎コマ見る：本人が三十m 内なら、止めた隊の者は残党を狙わない（狙われた者の返しは残す）。
  //   組の者は残党一人に一人まで（本人の槍を待つ）。
  leaveForMe(rt, g, [...Y.held, ...pushers, ...squads], squads);
  // 残党は組でない味方（谷筋へ回る手・麓の後備え）に打ちかかると斬り返されて削られるので、三十m 内に本人がいれば本人へ向き直る
  if (!me.alive) return;
  for (const u of g.units) {
    const t = u.target;
    if (!fighter(u) || !t || t === me || !Y.held.has(t.group)) continue;
    if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 30) { u.target = me; u.aiT = 0; }
  }
}

// 11/18 17:45 UTC 同じ持ち主（位置の記録 d8792）：森の小道 (-29,-153) の狩りに、参道の見張り・惣門前の見張り・惣門前の一揆勢が持ち場から三十〜五十m 下りて
//   本人に打ちかかり、本人は六人に囲まれて息が尽き（sta 2〜15）避けるだけになった（段1 討0）。寺の守りは寺の参道の持ち場を離れない。
//   狩りの間だけ、寺の守りの隊の寄せの間合いを持ち場の十m に縮め、持ち場から二十m より外で山の中にいる者は持ち場へ戻す。
function templeGuards(rt) {
  const F = rt.flags;
  return [F.ikkoWatchLower?.real, F.ikkoWatchMiddle?.real, F.ikkoWatchGate?.real, F.ikkoGateCrowd].filter(Boolean);
}
function leashTemple(rt, Y, on) {
  for (const g of templeGuards(rt)) {
    if (on && !g._ikLeash) { g._ikLeash = { aggro: g.aggro, seekRange: g.seekRange, order: g.order, stay: g.stay }; g.aggro = Math.min(g.aggro ?? 10, 10); g.seekRange = Math.min(g.seekRange ?? 10, 10); }
    else if (!on && g._ikLeash) { g.aggro = g._ikLeash.aggro; g.seekRange = g._ikLeash.seekRange; if (g.order === 'hold' && g._ikLeash.order) g.order = g._ikLeash.order; g.stay = g._ikLeash.stay; g._ikLeash = null; }
    // 11/18 18:30 UTC 持ち主：号令 attack の隊は 35〜60m の敵へ歩み寄る（army_think の「攻めよ」）ので、間合いを縮めても森の小道まで下りた。
    //   狩りの間は号令を「待て」に保ち、狩りが済めば元の号令へ戻す。
    //   持ち場の隊を起こす頭（ai.js の「敵が間近、持ち場から打って出る」）も、狩りの間は g.stay で止める（直した一つ目の後も号令が attack に戻った）。
    if (on) { g.stay = true; if (g.order === 'attack') { g.order = 'hold'; g.focus = null; } }
    if (!on || !g.anchor) continue;
    for (const u of g.units) {
      if (!fighter(u) || Math.abs(u.pos.x - g.anchor.x) < 14 && Math.abs(u.pos.z - g.anchor.z) < 20) continue;
      if (Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 20) continue;
      u.target = null; u.moveTo = { x: g.anchor.x + (u.slotX || 0), z: g.anchor.z }; u.aiT = 1.5;
    }
  }
}

function finish(rt) {
  const F = rt.flags, Y = F.ikYama;
  Y.done = true;
  if (Y.held) for (const h of Y.held) h.noEngage = h._ikYamaNoEngage0;
  leashTemple(rt, Y, false);
  rt.unmark('ikYama');
  // 11/14 クラウド：崩れた残党が寺攻めの段まで生き残り、山門の段（450 秒）で本人を斬って倒した。山狩りが済んだら、離れた残党は山へ消える
  const me = rt.player.u;
  for (const g of Y.bands || []) for (const u of g.units) if (u.alive && !u.gone && (!me || Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 12)) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
  try { Y.ctx.done(); } catch (e) { /* なし */ }
}

// 導入の間の bot：目前の敵に応戦し、捜索中の一団を追う。寺の守りへ寄り道しない。
export function bot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u, Y = b.flags.ikYama;
  let e = strikeTarget?.(b, 3.5);
  // 森から谷へ移る時や麓へ戻る時に、惣門の守りを追うと導入を終えられない。
  // 離れた敵は今の捜索対象だけにし、敗走した一団は追わない。
  if (!e && (Y?.s === 1 || Y?.s === 3) && Y.g && !Y.g.routed) {
    let nearest = 16;
    for (const v of Y.g.units) {
      if (!fighter(v) || !inHills(v) || v.fleeing || v.noTarget || Math.abs(v.pos.y - u.pos.y) >= 3) continue;
      const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
      if (d >= nearest || b.army.wallBetween(u.pos, -1, v.pos)) continue;
      e = v; nearest = d;
    }
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = d > 6;
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2) patientStrike(p, inp, e, d);
    return;
  }
  const q = pin(b);
  if (q) { inp.runHeld = true; goTo(p, inp, q.x, q.z, 3); }
}
