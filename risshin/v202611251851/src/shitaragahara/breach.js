// ======================================================================
// 設楽原の決戦　戦況の変わり目（6〜9分）「山県昌景の赤備えの柵破り」（docs/shitaragahara_spec_1109.md 19 第二波）
//   真田が大宮前で崩れた直後、大宮前と柳田前の間の柵（口の無い所）へ山県昌景の赤備え（騎馬と徒歩）が寄せ、一の柵・二の柵を押し倒す。
//   破れ目から柵の内へ入った赤備えを、組と予備の槍組で押し返す（柵の内の斬り合い）。同じ時に柳田前へ原昌胤が寄せる（二つの区画を走る）。
//   山県昌景は中盤の最大の強敵。討てば赤備えの大旗が倒れ、隊の気が崩れる（meisho.js）。命は普通の将のまま（体力で時を伸ばさない）。
// 兵は赤備え二十一人と二の備二十人。破れ目は柵の二つの区画（三十メートル）。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup, SH, shPos } from './side.js';
import { sfx } from '../audio.js';
import { shooters } from './plus.js';
import { lordGrace } from './saigo.js';

export const BZ = -139;   // 破れ目（大宮前と柳田前の間）

export function active(rt) { const B = rt.flags.shBreach; return !!B && !B.done; }

export function pin(rt) {
  const B = rt.flags.shBreach;
  if (!B || B.done) return null;
  // 到着しても戦線を保つ。空にすると本体が元の破れ目へ案内を戻してしまう。
  return front(rt, B);
}

// 赤備えが柵の内で破れ目から追って離れた時は、その群れの居る所が押し返す場（本人を元の破れ目へ戻させない）。
function front(rt, B) {
  if (!B.s || !B.g) return B.IN;
  if (!(B._frT > rt.t - 1)) {
    B._frT = rt.t;
    let x = 0, z = 0, n = 0;
    for (const u of B.g.units) if (u.alive && !u.fleeing && !u.gone && !u.noTarget && !u.woundOut && !u.rearWound) { x += u.pos.x; z += u.pos.z; n++; }
    const c = n ? { x: x / n, z: z / n } : null;
    B._fr = c && c.x < B.ctx.SB.x0 + 2 && Math.hypot(c.x - B.IN.x, c.z - B.IN.z) > 25 ? c : B.IN;
  }
  return B._fr;
}

export function group(rt) { const B = rt.flags.shBreach; return B && !B.done ? B.g : null; }

// ctx：{ SB, black, ready, reserve }
export function start(rt, ctx) {
  const F = rt.flags;
  const B = F.shBreach = { at: rt.t, ctx, s: 0, IN: { x: ctx.SB.x0 - ctx.SB.gap - 3, z: BZ }, done: false };
  B.g = enemyGroup(rt, { faction: 'akazonae', name: '山県昌景隊（赤備え）', fixed: true, noGuard: true, anchor: { x: 96, z: BZ }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 14, formation: 'line', morale: 100, noRout: true, speed: 3.6 },
    [{ type: 'busho', n: 1, o: { name: '山県昌景', horse: true, flag: 'akazonae' } }, { type: 'samurai', n: 2, o: { flag: 'akazonae' } }, { type: 'cavalry', n: 7, o: { horseBattle: 'mounted', flag: 'takeda_kiba' } }, { type: 'ashigaru', n: 11, o: { flag: 'akazonae' } }]);
  B.g.order = 'path'; B.g.pathIdx = 0; B.g.path = [[ctx.SB.x0 + 6, BZ]]; B.g.dest = null;
  B.g.onArrive = () => { B.arrived = true; };
  B.n0 = ctx.ready(B.g);
  // 11/18 クラウド（物差し③）：二百秒に本人から30〜60m の本物の敵が26人だけ（look200 で破れ目の柵の前に兵が数人）。
  //   赤備えの後ろに山県隊の徒歩の二の備（二十人・赤い旗）を十五m 遅れて続け、柵が破れたら破れ目へ押し込ませる。崩れも赤備えと一緒
  B.g2 = enemyGroup(rt, { faction: 'akazonae', name: '山県隊の二の備', fixed: true, noGuard: true, anchor: { x: 112, z: BZ + 3 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 16, formation: 'line', morale: 90, speed: 3.2 },
    [{ type: 'samurai', n: 1, o: { flag: 'akazonae' } }, { type: 'ashigaru', n: 19, o: { flag: 'akazonae' } }]);
  B.g2.order = 'path'; B.g2.pathIdx = 0; B.g2.path = [[ctx.SB.x0 + 16, BZ + 3]]; B.g2.dest = null;
  rt.after(1.5, () => { try { sfx('toki', 0.8); } catch (e) { /* なし */ } });
  rt.say('使番', '赤備えだ！　山県勢が、口の無い所の柵へ来るぞ！', 3.4);
  rt.after(3.8, () => { if (!F.ending) rt.say('使番', '柳田前にも原昌胤の隊が寄せております！', 3.2); });
  return B;
}

function breakFence(rt, B) {
  const F = rt.flags, x0 = B.ctx.SB.x0, gap = B.ctx.SB.gap;
  for (const s of F.fence || []) {
    if (!s.alive || !s.seg) continue;
    const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
    // 一の柵・二の柵の、破れ目の前の区画。三の柵も破れ目の真後ろの一区画だけ倒す
    // （11/11 クラウドか：三の柵が残ると、入った赤備えと本人・予備の槍組が柵を挟んで二m で向き合ったまま斬り合えず、段が千秒止まった）
    const third = s.row === 2 || s.row == null && mx < x0 - gap - 1;
    if (Math.abs(mz - BZ) > (third ? 8 : 17) || mx < x0 - 2 * gap - 4) continue;
    s.hp = 0; s.alive = false; s.hitFrom = { x: mx + 4, z: mz };
    try { rt.army.structFall(s); } catch (e) { /* 倒す形が無くても進む */ }
    try { rt.army.hooks?.onStructDestroyed?.(s); } catch (e) { /* なし */ }
  }
  try { sfx('gateBreakWood', 1); } catch (e) { /* なし */ }
}

// true の間は本体の step 2（柳田前へ移る）を止める
export function tick(rt, dt) {
  const F = rt.flags, B = F.shBreach;
  if (!B || B.done) return false;
  const p = shPos(rt), c = B.ctx, g = B.g;   // K661：d11 は元の本人の代わりの所
  if (B.s === 0) {
    // 後列や行軍の時間で柵を倒さず、戦える先頭が破る区画に取り付いた事を確かめる。
    const atFence = g.units.some((u) => u.alive && !u.fleeing && !u.gone &&
      !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - (c.SB.x0 + 6), u.pos.z - BZ) < 14);
    if (!atFence && c.ready(g) <= Math.ceil(B.n0 * 0.35)) {
      // 接近中に退けた場合は、無人の柵を壊さず、本人の持ち場の確認へ進む。
      B.s = 1; B.at1 = rt.t; B.volley = true;
      return true;
    }
    if (atFence) {
      B.s = 1; B.at1 = rt.t; B.capT = rt.t;
      breakFence(rt, B);
      rt.say('山県昌景', '柵を引き倒せ！　赤備え、中へ入れ！', 2.8);
      rt.after(3, () => rt.say('組頭', '柵が破られた！　破れ目で押し返せ！', 3));
      g.onArrive = null; g.path = null; g.dest = null; g.shBreachWay = { z: BZ };   // 残る柵の前で止まる兵は破れ目へ回る（b_shitaragahara.js shRunnerWay）
      g.order = 'attack'; g.seekRange = 40; g.aggro = 30; g.anchor.x = B.IN.x; g.anchor.z = B.IN.z;
      const g2 = B.g2;
      if (g2 && !g2.routed) { g2.path = null; g2.dest = null; g2.shBreachWay = { z: BZ }; g2.order = 'attack'; g2.seekRange = 40; g2.aggro = 24; g2.anchor.x = B.IN.x + 6; g2.anchor.z = BZ + 4; }
      const R = c.reserve();
      if (R && !R.routed) { R.order = 'move'; R.dest = { x: B.IN.x - 4, z: BZ + 8 }; R.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 20; }; }
    }
    return true;
  }
  // 一分たつと、隣の口の鉄砲組が破れ目へ向き直って撃ち込む（戦況が動く）
  if (!B.volley && rt.t - B.at1 > 55) {
    B.volley = true;
    // 射手の全滅・敗走や遠い持ち場を無視して、時刻だけで三人を倒さない。
    // 近くで戦える鉄砲組だけに下知し、遮蔽物・射程・装填と命中は通常の射撃で判定する。
    let guns = 0;
    for (const q of c.guns()) {
      if (!shooters(q)) continue;
      const at = q.center();
      if (Math.hypot(at.x - B.IN.x, at.z - B.IN.z) > 80) continue;
      q.fire = true; q.holdFire = false;
      guns++;
    }
    if (guns) rt.say('前田利家', '鉄砲組、破れ目へ向き直れ！　放て！', 2.8);
  }
  const lord = g.units.find((u) => u.name === '山県昌景');
  // 破れ目そのものか、柵の内へ入り込んだ赤備えの群れの32m内を「破れ目で押し返している」と数える。
  const at = front(rt, B);
  // 11/16 クラウドさ（K340）：赤備えが柵の外を北へ流れ、本人がそこで斬り合っても破れ目から遠いと数えず、破れ目の段が五百五十秒止まった（act bot）。
  //   この隊の生きた兵の二十m内に居れば「破れ目で押し返している」に数える
  const nearG = g.units.some((u) => u.alive && !u.fleeing && !u.gone && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 20);
  const near = nearG || Math.min(Math.hypot(p.x - B.IN.x, p.z - B.IN.z), Math.hypot(p.x - at.x, p.z - at.z)) < 32;
  if (near) B.there = true;
  const left = c.ready(g);
  // 時刻だけで討死させず、破れ目で実際に槍を合わせた時間だけを数える。
  const fighting = g.units.some((u) => {
    const target = u.atk?.target || u.swing?.target || u.target;
    return u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      target?.alive && target.pos && target.team !== u.team && !target.fleeing && !target.gone &&
      !target.woundOut && !target.rearWound && !target.noTarget &&
      Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) < 8 &&
      !rt.army.wallBetween(u.pos, -1, target.pos);
  });
  // 破れ目へ寄せた待つ備（depth_reserve の新手・武田の後続）と本人が槍を合わせている時も「破れ目で押し返している」に数える
  // （11/13 クラウドG：新手が破れ目に立ち、本人が新手と斬り合う間は数えず、破れ目の段が五百秒止まった）
  const meFight = !SH.flip && near && !!rt.army.nearestEnemy(rt.player.u, 8, (o) => !o.isStruct && !o.fleeing && !o.gone && !o.noTarget && !o.woundOut);
  if ((fighting || meFight) && near) B.fight = (B.fight || 0) + dt;
  // 11/18 クラウド持ち主（act bot 3回）：破れ目の段は近くの誰かの斬り合いが四十五秒で済み、本人の討ち取りは0〜2だった。
  //   本人が自分で槍を合わせた時間も数え、二十秒に届くまでは「斬り合い四十五秒」で閉じない（上限は下の cap＝七十秒のまま）
  if (meFight) B.meT = (B.meT || 0) + dt;
  // 11/13 クラウドし（台帳 K119「山県昌景が1分で討たれ早すぎ」）：将は破れ目の際（柵の線）で馬上から下知し、
  //   斬り合いが七十秒続くか、隊が半ばを割るまで最前の斬り合いへ出ない。体力は普通の将のまま（仕様37）。
  //   近づいた敵だけは払う（army_think の cover）。鉄砲には撃たれる（馬を撃たれれば落馬）。
  if (!B.lordIn && lord?.alive && !lord.fleeing) {
    if ((B.fight || 0) > 70 || left <= Math.ceil(B.n0 * 0.55)) B.lordIn = true;
    else {
      const c0 = g.center();
      lord.cover = { t: rt.army.time + 0.6, x: Math.max(c0.x, B.IN.x) + 9, z: c0.z };
    }
  }
  // 柵の内で斬り合う相手が居ないまま、破れ目から二十m より遠くへ流れて十五秒たてば、群れを破れ目へ呼び戻す
  // （二の柵と三の柵の間を北へ流れ、三の柵の向こうの敵を前に立ち尽くすのを止める。本人と予備の槍組は破れ目に居る）。
  B.idle = fighting ? 0 : (B.idle || 0) + dt;
  if (B.idle > 15 && g.order !== 'move') {
    const c0 = g.center();
    if (Math.hypot(c0.x - B.IN.x, c0.z - B.IN.z) > 20) {
      B.idle = 0; B._frT = -1;
      g.order = 'move'; g.dest = { x: B.IN.x, z: B.IN.z }; g.focus = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 22; q.aggro = 20; q.anchor.x = B.IN.x; q.anchor.z = B.IN.z; };
    }
  }
  // 将が味方の鉄砲に倒れても、本人が破れ目へ来るまでは任務達成にしない。
  // 交戦後に残兵が詰まった時だけ上限で救済する。本人が離れた時間は数えない。
  if (B.fight > 0 && near) B.stay = (B.stay || 0) + dt;
  const cap = B.stay > 70;   // 11/16 クラウドさ（K340・破れ目の段が153秒）：110→70・一斉射90→60・斬り合い60→45
  // 11/15 クラウドさ：240→110・一斉射140→90・斬り合い110→60（破れ目の段が200秒・戦を4〜7分へ）
  // 11/13 MB係四：赤備えが破れ目へ入らず柵の外に止まると、本人が破れ目で待っても斬り合いが起きず、この段が 223→830 秒続いた（act bot・突き九回）。
  //   鉄砲組が向き直ってから八十五秒、赤備えが槍を合わせに来なければ、柵の内の鉄砲の撃ち込みで崩れる（本人が破れ目に居る時だけ）
  const shotDown = B.there && B.volley && rt.t - B.at1 > 60 && !(B.fight > 10);
  const late = rt.t - B.at1 > 150;   // 11/16 クラウドさ：柵が破れて二分半で、どこに居ても赤備えは鉄砲に崩れる（段が止まらない）
  const end = cap || shotDown || late || B.there && ((!lord?.alive) || left <= Math.ceil(B.n0 * 0.35) || B.fight > 45 && (B.meT || 0) > 20);
  if (!end) return true;
  if (lordGrace(rt, B, lord)) { B.lordIn = true; return true; }
  if ((cap || late) && !B.there) B.noAward = true;
  B.done = true;
  if (lord?.alive) { lord.invuln = false; rt.army.kill(lord, null); }
  g.onArrive = null; g.path = null; g.focus = null;
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'retreat'; g.dest = { x: 500, z: BZ }; g.fleeDir = { x: 1, z: 0 };
  for (const u of g.units) if (u.alive) u.fleeing = true;
  const g2 = B.g2;
  if (g2 && !g2.routed) { g2.path = null; g2.morale = 0; g2.routed = true; g2.order = 'retreat'; g2.dest = { x: 500, z: BZ }; for (const u of g2.units) if (u.alive) u.fleeing = true; }
  try { sfx('volley', 0.9); } catch (e) { /* なし */ }
  if (!lord?.shPlayerKill) rt.banner('山県昌景、討死', '赤備えの大旗が倒れた');
  rt.say('組頭', '破れ目は守った！　柵の内の道を、組と柳田前へ移るぞ！', 3.8);
  if (!B.noAward) rt.award((t) => { t.side.push('柵の破れ目で山県昌景の赤備えを押し返した'); t.special = { label: '赤備えの柵破りを止めた', pts: 14 }; }, '破れ目を守った', B.IN);
  const R = c.reserve();
  if (R && !R.routed) { R.order = 'hold'; R.anchor.x = B.IN.x; R.anchor.z = BZ; R.facing = Math.PI / 2; }
  return false;
}
