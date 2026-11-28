// ======================================================================
// 一つの戦を濃くする「段」の流れ（桶狭間・森部・墨俣・姉川・設楽原で使う）
//   戦の途中や勝ったあとに、段を幾つも重ねる：立て直し（rest）→ 判断（pick）→ 激突（fight）→ 持ちこたえ（hold）→ 移る（move）
//   選んだ事は mem に残り、後の段の敵の数・行き先・手柄が変わる。どの段にも時間切れの保険があり、必ず次の段へ進む
// 使い方：depthStart(rt, ctx, [段…], 終わった時) を呼び、戦の update で depthTick(rt, dt) を回す
//   ctx = { faction, flag, armor（敵の控えの旗と具足）, friends: (rt) => [味方の組…], look: (list) => list（敵の見た目）, aid: { name, faction, flag, list }（足りない時に加わる味方）, dmg, scale }
// 敵は小勢をぽつぽつ出さない：一つの波は、近くの本物の兵（足軽を scale 倍）＋後ろに数百の軍勢（backOf の控え）で、大きな塊としてどっと来る。
//   控えに踏み込めば、近い所から本物の兵に替わる（b_nagashinojo.js の wake）
// ======================================================================
import { enemyGroup, allyGroup, centerOf, hiddenFrom, k712March } from './bhelp.js';
import { moraleWord } from './hud.js';
import { sfx } from './audio.js';
import { backOf, ARMOR } from './b_nagashinojo.js';
import { pruneFar } from './depth_reserve.js';
import { cpCue } from './checkpoint_chain.js';
import { goalsArrived } from './goals5.js';

const gone = (g) => !g || g.count === 0 || g.routed;
// 段の上では、二人以下に減った組・皆が逃げ出した組は「崩れた」とみなす（逃げ惑う数人を探し回らせない）
const spent = (g) => gone(g) || g.count <= 2 || g.units.every((u) => !u.alive || u.fleeing);
const alive = (gs) => gs.filter((g) => !spent(g));
const heads = (gs) => alive(gs).reduce((a, g) => a + g.count, 0);
// K652（11/25 Sanae・窓口の決め）：o.fromArrival の段（軽い型 light_battle.js が渡す）は、寄せ（hold の waves・fight の later）の刻を
//   本人が段の場（at から r＋30m）に着いてから数える。「信長で出陣」で旗本百人を連れて歩くと、着く前の野で寄せに囲まれて倒れた（e15・毛利 m04 ほか）。
//   着かないまま四十秒たてば数え始める（止まった遊び手で段が止まらないように）。持ちこたえる刻（dur）と上限は今のまま
const ARR_WAIT = 40;
const ARR_OFF = typeof location !== 'undefined' && /[?&]k652arr0\b/.test(location.search);   // ?k652arr0：前の数え方（比べる時だけ）
function wavesEl(rt, C, o, el, r) {
  if (!o.fromArrival || ARR_OFF) return el;
  if (C.arrEl == null) { const p = rt.player.u.pos; if (el > ARR_WAIT || Math.hypot(p.x - C.at.x, p.z - C.at.z) < r + 30) C.arrEl = el; }
  return C.arrEl == null ? -1 : el - C.arrEl;
}

// 段の持ち場の印と同じ名の印（戦の側が先に出した物）を下げる。同じ名の印が二つ並んでいた（10/2 金ヶ崎の「三の備（狭路）」）
function dropSameMark(rt, label) {
  if (!label || !rt.markers) return;
  for (const m of rt.markers.slice()) if (m.id !== 'dp' && !m.red && m.label === label) rt.unmark(m.id);
}

export const depthOn = (rt) => !!(rt.flags.dp && rt.flags.dp.on);
export const depthMem = (rt) => (rt.flags.dpMem = rt.flags.dpMem || {});

export function depthStart(rt, ctx, steps, done) {
  const F = rt.flags;
  F.dp = { ctx, steps: steps.filter(Boolean), i: -1, on: true, done, mem: depthMem(rt) };
  // K473（kaito 11/20「行き先の地面に白い丸。着いたら丸が消えて、その任務は済み」）：段の行き先の白い丸（goal_ring.js）に入ったら、
  //   移る段（move）の一行をその場で済にする。戦が自前の口を持つ時はそちらを先に呼ぶ（11/20 クラウド k365-cloud-03）
  if (rt.def && !rt.def._dpRingHooked) {
    const own = rt.def.goalRingDone;
    rt.def.goalRingDone = (r, t, key) => { if (own) own(r, t, key); depthRingDone(r, t); };
    rt.def._dpRingHooked = true;
  }
  nextStep(rt);
}
function depthRingDone(rt, t) {
  const D = rt.flags.dp, C = D?.cur;
  if (!D?.on || !C || C.s.kind !== 'move' || !C.at || C.arr || Math.hypot(t.x - C.at.x, t.z - C.at.z) > 3) return;
  C.arr = true; C.arrT = rt.t - C.t0; rt.unmark('dp'); rt.unzone('dp'); rt.objDone('dp');
  dpArrivedRow(rt, C);
}
// 右上の段の表の今の行も済の印へ（goals5.js goalsArrived。呼び名が合う時だけ）
function dpArrivedRow(rt, C) {
  const o = (rt.objectives || []).find((x) => x.id === 'dp');
  try { goalsArrived(rt, [o?.text, C.s?.label, C.label]); } catch (e) { /* 表の無い戦 */ }
}

// 途中の保存から続ける時（battle_checkpoint.js の resumeSteps）：今の段を捨て、k 番目の段の始まりへ飛ぶ（前へは戻らない）
export function depthJump(rt, k) {
  const D = rt.flags.dp;
  if (!D || !D.on || !(k > D.i)) return;
  D.i = k - 1;
  nextStep(rt);
}

// 途中の保存（K363）：段の流れの番号を段として記録し、続ける時は飛ばした段の終わりの出来事（resumeEnd＝各段の onEnd・rest の fn）を音もなく起こして k 番目へ飛ぶ。
//   戦の定義に  checkpointStep: depthCheckpointStep,  resumeSteps: depthResumeSteps,  を足す（段の流れを begin() で始める戦用）
export const depthCheckpointStep = (rt) => { const D = rt.flags.dp; return D && D.on ? D.i : -1; };
export const depthResumeSteps = Array.from({ length: 14 }, (_, i) => i + 1).map((k) => [k, function (rt) {
  if (!rt.flags.dp && this.begin) this.begin(rt);
  const D = rt.flags.dp;
  if (!D || !D.on || k >= D.steps.length) return;
  for (let j = D.i; j < k; j++) D.steps[j]?.resumeEnd?.(rt, D.mem, true);
  depthJump(rt, k);
}]);

function nextStep(rt) {
  const D = rt.flags.dp;
  D.i++;
  const s = D.steps[D.i];
  if (!s) { D.on = false; D.cur = null; rt.unmark('dp'); rt.unzone('dp'); if (D.done) D.done(rt, D.mem); return; }
  if (s.skip && s.skip(rt, D.mem)) { nextStep(rt); return; }
  D.cur = { s, t0: rt.t, groups: [], goal: null, k0: rt.stats?.kills || 0, specs: [] };
  s.start(rt, D.cur, D.mem, D.ctx);
}

export function depthTick(rt, dt) {
  // 味方が数人まで減ったら、新手の組が追いつく（立ちっぱなしで全員が倒れる流れにしない。A029）
  if (!rt.def.noReinforcements && rt.t > 60 && !rt.over && rt.t - (rt._rfT ?? 0) > 4) {
    rt._rfT = rt.t;
    let n = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 0 && !u.isPlayer && u.type !== 'dummy' && u.type !== 'porter') n++;
    if (n < 8 && (rt._rfN || 0) < 3 && rt.t - (rt._rfLast ?? -99) > 40) {
      rt._rfN = (rt._rfN || 0) + 1; rt._rfLast = rt.t;
      const p = rt.player.u.pos;
      allyGroup(rt, { name: '新手の足軽', anchor: { x: p.x, z: p.z + 14 }, facing: 0, order: 'follow', aggro: 12, width: 10, morale: 90 }, [{ type: 'ashigaru', n: 8 }]);
      rt.say('足軽', '新手が追いついたぞ！　お頭、もう一押しじゃ', 3);
    }
  }
  const D = rt.flags.dp;
  if (!D || !D.on || !D.cur || rt.over) return;
  const C = D.cur, s = C.s, el = rt.t - C.t0;
  let fin = s.tick(rt, C, D.mem, D.ctx, el, dt);
  // AY5：自分が動かなくても物語は進む。止まって二十秒で味方の組が段の目当てへ攻め出し、四十五秒止まったままなら（目標は果たせなくても）次の段へ移る
  const pp = rt.player.u.pos, ip = (rt._idleP ||= { x: pp.x, z: pp.z, t: rt.t });
  // 持ち場を守る下知での待機は、戦の側が指定した時だけ放置から外す。
  if (Math.hypot(pp.x - ip.x, pp.z - ip.z) > 6 || D.ctx.idleWait?.(rt, C)) { ip.x = pp.x; ip.z = pp.z; ip.t = rt.t; }
  const idle = rt.t - ip.t;
  if (!fin && s.idleAdvance !== false && idle >= 20 && !C.nudged) {
    C.nudged = true;
    const go = C.goal || C.at;
    // 段の目当ての四十歩内に敵がいない時（持ち場を守る段など）は攻め出させない（敵の無い所で attack のまま立つ。11/6 三方ヶ原）
    const foeNear = go && rt.army.units.some((o) => o.alive && o.team !== rt.player.u.team && !o.isStruct && !o.civ && (o.pos.x - go.x) ** 2 + (o.pos.z - go.z) ** 2 < 1600);
    if (go && foeNear && D.ctx.friends) for (const g of D.ctx.friends(rt)) if (g && g.count && !g.routed) { g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 40); g.anchor = { x: go.x, z: go.z }; }
  }
  if (!fin && s.idleAdvance !== false && idle >= 45 && el > 60 && rt.t >= (rt.missionDangerUntil || 0)) { C.timeout = true; fin = true; }
  // 保険：どの段も、長引けば時間切れで次の段へ（斬り合いの段は AB の新手が尽きるまで待つので、七分まで延ばす）
  //   limit：戦の側が段の長さの上限を決めた時はそれを使う（関ヶ原は段が五つ重なり、七分ずつ延びると15分を超えた。11/8）
  if (!fin && el > (s.limit ?? (s.kind === 'fight' || s.kind === 'hold' ? Math.max(s.max, AB_LIMIT) : s.max)) && rt.canFailMission()) { C.timeout = true; fin = true; }
  // 11/17 K358 iMac n-kwatch：戦の側が段の上限（limit）を決めた時は、本人が戦っていない間（canFailMission が偽）も上限で進める。
  //   伏見城で上限150秒の段が、本人が敵から離れている間は四分（下の240）まで延び、戦が十八分の打ち切りで失敗していた
  if (!fin && s.limit != null && Number.isFinite(s.limit) && el > s.limit) { C.timeout = true; fin = true; }
  // 11/9 徳川C（見回り）：戦ごとの待ち（本人が段の場へ着く・本人が戦う・limit = Infinity）で、段が十八分の打ち切りまで止まる戦が多かった
  //   （bot 中学生：伏見・道明寺・河田米野・根来寺・一宮城など）。どの段も七分（AB_LIMIT）を越えたら、味方の働きで段が済んだとみなして先へ進める。
  //   s.noHardCap で戦の側が外せる
  //   本人がその段で戦っていない（canFailMission が偽）時は四分で進める。戦っている時は七分まで待つ
  if (!fin && !s.noHardCap && el > (rt.canFailMission() ? AB_LIMIT : 240)) { C.timeout = true; fin = true; }
  if (fin) {
    if (s.end) s.end(rt, C, D.mem, D.ctx);
    nextStep(rt);
  }
}

// ---------------- 敵と味方を出す ----------------
// 11/13 K285 MB係三：本物の兵が上限（250）に詰まると、段の寄せが0人で出て持ち場へ敵が来ず、守りの段が刻限まで止まった
//   （三方ヶ原の平手の陣：寄せ六隊が全部0人・act bot が十八分で切り上げ）。足りない分は、前に立って待つ備（depth_reserve の新手）を
//   この段の寄せとして持ち場へ掛からせ、まだ足りなければ本人から百歩より遠い名の無い兵を外して空ける。
function stageRoom(rt, C, at, spec, want) {
  const me = rt.player?.u, cap = (rt.def?.realCap ?? 250) - 15;
  if (!me || !want) return;
  let n = 0;
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) n++;
  let over = n + want - cap;
  if (over <= 0) return;
  const S = rt.flags._dr;
  if (S) for (let i = S.E.length - 1; i >= 0 && over > 0; i--) {
    const g = S.E[i];
    if (!g || !g.count || g.routed || !g.stay) continue;
    S.E.splice(i, 1);
    g.stay = false; g.fire = true; g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 60);
    g.anchor = { x: at.x + (spec.off ? spec.off.x : 0), z: at.z + (spec.off ? spec.off.z : 0) };
    C.groups.push(g); C.nTot = (C.nTot || 0) + g.count; over -= g.count;
  }
  if (over <= 0) return;
  pruneFar(rt, me, over);   // 名のある将の備は芯を残す（depth_reserve.js・K324）
}
// 11/20 クラウド（④湧き出し・箕作／佐和山）：spec.adopt＝前もって置いた組（preFoes）を段の敵として起こす。本人の目の前で急に現れない
function spawnFoes(rt, C, ctx, at, spec) {
  const pre = spec.adopt ? spec.adopt(rt) : null;
  if (pre && pre.count && !pre.routed) {
    pre.ambush = false; for (const u of pre.units) u._crouch = false;
    pre.stay = false; pre.order = 'attack'; pre.aggro = 14; pre.seekRange = spec.seek || 60;
    pre.anchor = { x: at.x + (spec.off ? spec.off.x : 0), z: at.z + (spec.off ? spec.off.z : 0) };
    if (spec.hunt && rt.player?.u) pre.focus = rt.player.u;
    if (spec.noRout) { pre.noRout = true; rt.after(spec.noRout, () => { pre.noRout = false; }); }
    C.groups.push(pre); C.nTot = (C.nTot || 0) + pre.count;
    if (!spec.refill) C.specs.push(spec);
    if (spec.say) rt.say(spec.say[0], spec.say[1], spec.say[2] || 3);
    return pre;
  }
  const from0 = ctx.fixedSpawn ? (spec.from || at) : hiddenFrom(rt, spec.from || at);
  // K712（kaito 11/26「兵が近くでループしてくるのはやめて」）：討った兵の代わり（refill）は必ず、段の寄せも本人の 60m 内に出る時は、
  //   本人から 120m 先（敵の来る向き・見えない所）に立てて段の場所へ歩かせる。置けなければその寄せは出さない（新手の時）／元の所（筋書きの寄せ）
  const from = spec._pre ? from0 : k712From(rt, C, at, from0, spec._k712 === 'refill', !!ctx.fixedSpawn);
  if (!from) return null;
  const fl = { x: from.x - at.x, z: from.z - at.z }, L = Math.hypot(fl.x, fl.z) || 1;
  // 足軽・鉄砲・弓は数を増やして、ぎっしりした塊にする
  const k = spec.scale ?? ctx.scale ?? 1.7;
  const big = spec.list.map((q) => (q.type === 'ashigaru' || q.type === 'gun' || q.type === 'bow' ? { ...q, n: Math.round(q.n * k) } : q));
  stageRoom(rt, C, at, spec, big.reduce((a, q) => a + (q.n || 0), 0));   // 戦の look は残りの枠で人数を削る（三方ヶ原は 235 まで）ので、削る前に空ける
  const list = ctx.look ? ctx.look(big) : big;
  // 11/18 23:15 UTC クラウド kaito2（河田の足跡：出る所と着く所が同じ新手は逃げ向きが零になり、崩れても村の中で八十秒立ったまま）。零の時は決めず、崩れた時に敵から離れる向きへ
  const g = enemyGroup(rt, { fixed: !!ctx.fixedSpawn, k712here: true, faction: spec.faction || ctx.faction, name: spec.name, anchor: { x: from.x, z: from.z }, facing: Math.atan2(-fl.x, -fl.z), order: 'attack', seekRange: spec.seek || 60, aggro: 14, width: spec.width || 10, morale: spec.morale || 90, ...(Math.hypot(fl.x, fl.z) > 0.5 ? { fleeDir: { x: fl.x / L, z: fl.z / L } } : {}), formation: spec.formation, ...(spec.noGuard ? { noGuard: true } : {}) }, list);
  g.anchor = { x: at.x + (spec.off ? spec.off.x : 0), z: at.z + (spec.off ? spec.off.z : 0) };
  if (from !== from0) { const a = g.anchor; g.anchor = { x: from.x, z: from.z }; k712March(rt, g, a); }   // K712：120m 先に立てた寄せは段の場所へ行軍させる（attack のままだと敵が seek の内に来るまで動かない・伏見）
  g.dmgMult = spec.dmg ?? ctx.dmg ?? 0.62;
  // 11/17 owner-4：spec.hunt＝本人を狙って来る組（長島で味方の大勢が先に組み合い、本人へ刃が一度も届かず易しすぎた）
  if (spec.hunt && rt.player?.u) g.focus = rt.player.u;
  if (spec.seekCap) g.seekCap = spec.seekCap;   // 11/18 クラウド kaito2：nudge が探す広さを90m に広げても、この広さで止める（稲葉山の町の出口）
  if (spec.noRout) { g.noRout = true; rt.after(spec.noRout, () => { g.noRout = false; }); }
  C.groups.push(g);
  C.nTot = (C.nTot || 0) + g.count;
  if (!spec.refill) C.specs.push(spec);
  // 後ろに同じ旗の数百の軍勢（控え）が付いてくる
  const mass = spec.mass ?? ctx.mass ?? 160;
  if (mass > 0 && ctx.backing !== false) backOf(rt, g, { flag: spec.flag || ctx.flag || spec.faction || ctx.faction, armor: spec.armor || ctx.armor || ARMOR[spec.faction || ctx.faction] || 0x33302a, kind: spec.kind || (spec.list.some((q) => q.type === 'cavalry') ? 'cavalry' : 'spear'), w: 20, depth: 12, gap: ctx.backGap, count: mass, seed: 300 + Math.floor(Math.random() * 600) });
  if (spec.say) rt.say(spec.say[0], spec.say[1], spec.say[2] || 3);
  return g;
}
// K712：本人から 120m 以上離れた、置ける所（戦場の端の内・歩ける・段の場所との間に塀や柵が無い・画面に見えない）を、敵の来る向きに探す
const K712_FAR = [125, 140, 160, 185], K712_NEAR = 120;   // 11/27 kaito2：段の寄せも本人の 120m 内に出る時は 120m 先へ（kaito「新しい波は120mより遠くから」・前は 60m）
const k712Off = typeof location !== 'undefined' && /[?&]k712off\b/.test(location.search);   // ?k712off：前の湧き方（比べる時だけ）
function k712Log(rt, d, moved) {
  const L = rt.flags._k712 || (rt.flags._k712 = { n: 0, near: 0, moved: 0, skip: 0, min: Infinity });
  if (d == null) { L.skip++; return; }
  L.n++; if (moved) L.moved++; if (d < K712_NEAR) L.near++; if (d < L.min) L.min = Math.round(d);
}
function k712From(rt, C, at, p0, refill, fixed) {
  const P = rt.player?.u?.pos;
  if (!P || k712Off) return p0;
  const d0 = Math.hypot(p0.x - P.x, p0.z - P.z);
  // 出所を決めた戦（fixedSpawn＝城の門の外など）は元の所（11/27 kaito2：伏見で門の外の寄せ手を 120m 先へ移すと堀と曲輪を回れず、段の敵が来ないまま止まった）
  if (!refill && (fixed || d0 >= K712_NEAR)) { k712Log(rt, d0, false); return p0; }
  if (refill && d0 >= 120) { k712Log(rt, d0, false); return p0; }
  // 向き：元の出所 → 段の場所 → 敵の重心 の順に、本人から見た向き
  let dx = p0.x - P.x, dz = p0.z - P.z;
  if (Math.hypot(dx, dz) < 3 && at) { dx = at.x - P.x; dz = at.z - P.z; }
  if (Math.hypot(dx, dz) < 3) {
    let sx = 0, sz = 0, n = 0;
    for (const u of rt.army.units) if (u.alive && !u.gone && u.team !== rt.player.u.team && !u.isStruct && !u.civ) { sx += u.pos.x; sz += u.pos.z; n++; }
    if (n) { dx = sx / n - P.x; dz = sz / n - P.z; }
  }
  let L = Math.hypot(dx, dz);
  if (L < 3) { const a = (C.refills || 0) * 2.1; dx = Math.sin(a); dz = Math.cos(a); L = 1; }
  dx /= L; dz /= L;
  const LIM = Math.min(rt.world?.def?.moveLim || rt.def?.moveLim || 1e9, rt.world?.half ? rt.world.half - 4 : 1e9) - 22;
  const B = rt.def?.reserveBox;
  const goal = at || p0;
  const ok = (q) => Math.abs(q.x) <= LIM && Math.abs(q.z) <= LIM && (!B || (Math.abs(q.x) <= B.xw && q.z >= B.zn && q.z <= B.zs))
    && rt.world?.walkable?.(q.x, q.z) !== false && !(rt.army.wallBetween && rt.army.wallBetween(goal, -1, q));
  const tryRing = (ks) => {
    for (const k of ks) for (const sh of [0, 22, -22, 45, -45]) {
      const q = { x: P.x + dx * k - dz * sh, z: P.z + dz * k + dx * sh };
      if (ok(q)) return q;
    }
    return null;
  };
  // 段の場所の向こう（段の場所から本人と反対へ）も試す：段の場所が本人の前にある時に、その奥の後詰の方から来る形
  let q = tryRing(K712_FAR);
  if (!q && at) { const ax = at.x - P.x, az = at.z - P.z, al = Math.hypot(ax, az); if (al > 3) { dx = ax / al; dz = az / al; q = tryRing(K712_FAR); } }
  if (!q && !refill) q = tryRing([100, 85, 70].filter((k) => k > d0 + 5));   // 元の所より近くへは寄せない   // 筋書きの寄せ：狭い戦場では 120m 先が無い。せめて 60m の外
  if (!q) { if (refill) { k712Log(rt, null); return null; } k712Log(rt, d0, false); return p0; }
  k712Log(rt, Math.hypot(q.x - P.x, q.z - P.z), true);
  return q;
}
// AB（kaito 11/3「出来事は濃く長く。一つの段でたくさんの敵としっかり数分戦い、敵の数と自分の手柄で段が進む。時間で勝手に次の段へ進めない」）：
//   寄せた敵を崩し切っても、段の決めの数（AB_MIN 人か、最初の寄せの 1.6 倍）を崩し、本人が AB_MINE 人を討つまでは、同じ方から新手が来る。
//   新手は前の組が崩れてから一組ずつ（本物の兵の数を増やさない）。七分（AB_LIMIT）を過ぎたら新手は止める
const AB_MIN = 40, AB_MINE = 2, AB_LIMIT = 420, REFILL_MAX = 6;
const REFILL_WORDS = ['新手が来るぞ！　構えよ！', '後ろからまだ寄せて来る！', '敵の新手じゃ！　息を継ぐ間も無いぞ！'];
function refill(rt, C, ctx, el, o) {
  if (o.noRefill || !C.specs.length || el > AB_LIMIT || rt.over) return false;
  if ((C.refills || 0) >= REFILL_MAX) return false;   // K712：湧きの回数に限り（一つの段で六組まで）
  const need = Math.max(AB_MIN, Math.round((C.nBase || (C.nBase = C.nTot || 0)) * 1.6));
  const beaten = (C.nTot || 0) - heads(C.groups);
  const mine = (rt.stats?.kills || 0) - (C.k0 || 0);
  if (beaten >= need && mine >= AB_MINE) return false;
  const sp = C.specs[(C.refills || 0) % C.specs.length];
  C.refills = (C.refills || 0) + 1;
  // 名のある武将は二人に増やさない（新手は名の無い兵だけ）
  const list = (sp.list || []).filter((q) => q.type !== 'busho' && !q.o?.name && !q.o?.invuln);
  if (!list.length) return C.refills < C.specs.length * 2 ? refill(rt, C, ctx, el, o) : false;
  // 出る所：元の組の出所。無い時は段の場所から本人と反対へ四十歩（目の前に湧かせない）
  let from = sp.from;
  if (!from) {
    const p = rt.player.u.pos, dx = C.at.x - p.x, dz = C.at.z - p.z, L = Math.hypot(dx, dz);
    const a = L > 3 ? Math.atan2(dx, dz) : (C.refills * 2.1);
    from = { x: C.at.x + Math.sin(a) * 40, z: C.at.z + Math.cos(a) * 40 };  }
  // 新手は名のある将を連れないので、組の名から人の名（「真田大助の隊」の「真田大助の」）を外す（大将が二人いるように聞こえない。11/6 真田丸の頼み）
  const bare = sp.name ? sp.name.replace(/^新手の/, '').replace(/^[^\s、。]{2,8}の(?=隊|備|手|組|衆)/, '') : '';
  const ng0 = spawnFoes(rt, C, ctx, C.at, { ...sp, from, list, refill: true, _k712: 'refill', mass: 0, say: null, name: bare ? '新手の' + bare : '敵の新手' });
  if (!ng0) return false;   // K712：120m 先に置ける所が無い＝新手は出さない（近くで湧かせない）
  rt.bark(REFILL_WORDS[C.refills % REFILL_WORDS.length]);
  const ng = C.groups[C.groups.length - 1];
  if (ng) rt.army.play('eshout', ng.center(), 1.4);
  return true;
}
// 段を自前で締める戦（withstand など）向け：決めの数と本人の手柄に届いたか。届かず寄せが尽きていれば新手を出して false
export function abEnough(rt, C, el, o = {}) {
  const D = rt.flags.dp;
  if (!C || !C.specs) return true;
  if (alive(C.groups).length) {
    const need = Math.max(AB_MIN, Math.round((C.nBase || C.nTot || 0) * 1.6));
    return el > AB_LIMIT || ((C.nTot || 0) - heads(C.groups) >= need && (rt.stats?.kills || 0) - (C.k0 || 0) >= AB_MINE);
  }
  return !refill(rt, C, D?.ctx || {}, el, o);
}
// 11/20 クラウド（④湧き出し）：段の敵を戦の始め（支度）に先に置き、持ち場で伏せて待たせる。段が来たら spec.adopt で起こす
//   見つかるまで狙わない（aggro・seekRange 0）。数と顔ぶれは段で出すのと同じ
export function preFoes(rt, ctx, at, spec, o = {}) {
  const C = { groups: [], specs: [] };
  const g = spawnFoes(rt, C, ctx, at, { ...spec, adopt: null, say: null, refill: true, _pre: true });
  if (!g) return null;
  g.order = 'hold'; g.stay = true; g.aggro = 0; g.seekRange = 0; g.focus = null;
  if (o.crouch) { g.ambush = true; for (const u of g.units) u._crouch = true; }
  return g;
}
// 味方の援け（ctx.aid）を作る。ctx.aidFrom(rt) があればそこで出す（本人の脇で急に現れない。箕作の大手道の下）
export function aidNow(rt, ctx, first = false) {
  if (!ctx.aid || (ctx.aidG && !gone(ctx.aidG) && ctx.aidG.count >= 8)) return ctx.aidG;
  {
    const q = !first && ctx.aidFrom ? ctx.aidFrom(rt) : null, p = q || rt.player.u.pos;
    const fac = ctx.aid.faction || 'oda';
    ctx.aidG = allyGroup(rt, { faction: fac, ...(ctx.aid.flag ? { flag: ctx.aid.flag } : {}), name: ctx.aid.name, anchor: { x: p.x + 4, z: p.z + 4 }, facing: 0, aggro: 12, width: 12, noRout: true, dmgMult: 0.7 }, ctx.aid.list.map((q) => (q.type === 'ashigaru' ? { ...q, n: Math.round(q.n * 1.6) } : q)));
    // 味方も数百の軍勢で押し出す（後ろに控え）
    // ctx.aidBacking = false：味方の後続に軽い控えを付けない（本人のそばを歩く作り物になる。kaito AA）
    if (ctx.backing !== false && ctx.aidBacking !== false) backOf(rt, ctx.aidG, { flag: ctx.aid.flag || fac, armor: ARMOR[fac] || ARMOR.oda, kind: 'spear', w: 20, depth: 10, gap: ctx.backGap, count: 140, seed: 900 + Math.floor(Math.random() * 90) });
    rt.after(40, () => { if (ctx.aidG) ctx.aidG.noRout = false; });
    if (ctx.aidSaid) rt.bark(ctx.aidSaid);
  }
  return ctx.aidG;
}
// 味方の組を段の場所へ（勝手に立ち尽くさない）。足りなければ新手の味方が追いつく
function sendFriends(rt, ctx, at, mode) {
  const fr = (ctx.friends ? ctx.friends(rt) : []).filter((g) => g && g.count);
  aidNow(rt, ctx);
  if (ctx.aidG && ctx.aidG.count) fr.push(ctx.aidG);
  fr.forEach((g, i) => {
    const k = i - (fr.length - 1) / 2;
    g.calm = false;
    g.anchor = { x: at.x + k * 6, z: at.z + (i % 2) * 5 };
    if (mode === 'hold') { g.order = 'hold'; g.aggro = 16; } else { g.order = 'attack'; g.seekRange = 45; }
  });
}
function routAll(C) { for (const g of C.groups) if (!gone(g)) { g.noRout = false; g.morale = 0; } }
// 寄せてこない組（遠くで立ち止まった等）は、段の場所へ向け直す
function nudge(C, el) {
  if (!C.at || el - (C.nudgeT || 0) < 8) return;
  C.nudgeT = el;
  for (const g of alive(C.groups)) {
    const c = g.center();
    if (Math.hypot(c.x - C.at.x, c.z - C.at.z) > 30) { g.order = 'attack'; g.seekRange = Math.min(90, g.seekCap ?? 90); g.anchor = { x: C.at.x, z: C.at.z }; }
  }
}
function footOf(rt, g) {
  const c0 = centerOf(g);
  return () => {
    const p = rt.player.u.pos, W = rt.world;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.noTarget || W.walkable(u.pos.x, u.pos.z, u.pos.y) === false) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z) + Math.abs(u.pos.y - p.y) * 4;
      if (d < bd) { bd = d; best = u; }
    }
    return best ? { x: best.pos.x, z: best.pos.z } : c0();
  };
}
function markFirst(rt, C) {
  // def.dpNoMark：段の敵の組に赤い札を立てない（名のある将の名札と二つ出た。11/8 critic60 八王子）。行き先は戦の金の▼一つ
  if (rt.def.dpNoMark) return;
  const g = alive(C.groups)[0];
  if (g === C.marked) return;
  C.marked = g;
  // def.dpFootMark：組の真ん中は折り返す山道では登れない切岸の上になる（11/13 クラウドせ・稲葉山 K098「山が急すぎて登れない」：
  //   act bot で中枢曲輪の守りの印が五度、歩けない地面を指した）。歩ける所に立つ、本人に一番近い兵の足元を指す。
  if (g) rt.marker('dp', rt.def.dpFootMark ? footOf(rt, g) : centerOf(g), () => `${g.name || '敵'}・${moraleWord(g.morale)}`, { red: true, group: g });
  else rt.unmark('dp');
}

// ---------------- 段の形 ----------------
// 立て直し：組を集め直し、手負いの手当て、上役の下知
export function rest(o) {
  return {
    resumeEnd: o.fn, kind: 'rest', max: (o.dur || 14) + 1,
    start(rt, C, m, ctx) {
      const u = rt.player.u;
      if (o.heal !== 0) rt.player.treatWounds(o.heal ?? 0.35);
      // 11/18 クラウド関ヶ原（賤ヶ岳・越前に倣う）：ctx.restHp＝立て直しの段で息を整え、命をその割合まで戻す（傷の重さ K360⑦ は変えない。無ければ今まで通り）
      if (ctx.restHp && u?.alive && u.maxHp && o.heal !== 0) u.hp = Math.max(u.hp, u.maxHp * ctx.restHp);
      for (const g of rt.squadGroups || []) if (g.count) { g.order = 'follow'; if (ctx.calmRest !== false) g.morale = Math.min(100, g.morale + 30); }
      for (const g of (ctx.friends ? ctx.friends(rt) : []).filter((q) => q && q.count)) { if (ctx.calmRest !== false) g.morale = Math.min(100, (g.morale || 60) + 20); g.calm = false; g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; }
      rt.unmark('dp'); rt.unzone('dp');
      rt.after(3.5, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); });
      if (o.banner) rt.banner(o.banner[0], o.banner[1]);
      if (o.bark) rt.bark(o.bark);   // 戦ごとの文だけ（A022）
      let d = 0.5;
      for (const [who, text, dur] of o.say || []) { const w = typeof who === 'function' ? who(rt, m) : who, t = typeof text === 'function' ? text(rt, m) : text; if (t) { rt.after(d, () => rt.say(w, t, dur || 3.5)); d += (dur || 3.5) + 0.3; } }
      if (o.fn) o.fn(rt, m);
    },
    tick(rt, C, m, ctx, el) { return el >= (o.dur || 14); },
  };
}

// 判断：選んだ事は on(rt, m, i) で mem に残す（時間切れは一つ目）
export function pick(o) {
  const T = o.time || 18;
  return {
    kind: 'pick', max: T + 40, skip: o.skip,
    start(rt, C) { C.i = null; },
    tick(rt, C, m, ctx, el) {
      if (!C.shown) {
        if (rt.choice && el < 30) return false;   // 前の判断が済むまで待つ
        C.shown = true; C.t1 = rt.t;
        if (o.pre) o.pre(rt, m);
        rt.choose(typeof o.title === 'function' ? o.title(rt, m) : o.title, o.options, (i) => { C.i = i; }, T);
        return false;
      }
      if (C.i === null && rt.t - C.t1 > T + 3) { if (rt.choice && rt.choice.onPick) rt.pickChoice(0); if (C.i === null) C.i = 0; }
      if (C.i === null) return false;
      o.on(rt, m, C.i);
      return true;
    },
  };
}

// 激突：敵の組を出して崩す。later で新手・横槍を足す
//   o = { at, title, sub, obj, foes: (rt, m) => [spec…], later: [{ t, foes, say }], max, reward, onEnd(rt, m, won) }
export function fight(o) {
  return {
    resumeEnd: o.onEnd, kind: 'fight', max: o.max || 150, limit: o.limit, skip: o.skip,
    killAll: true,   // 寄せた組を全部崩せば済む段（stages.js が札に倒す数を出す）
    start(rt, C, m, ctx) {
      const at = typeof o.at === 'function' ? o.at(rt, m) : o.at;
      C.at = at; C.goal = at; C.later = (typeof o.later === 'function' ? o.later(rt, m) : o.later || []).slice();
      if (o.title) rt.banner(o.title, o.sub || '');
      if (o.startSound !== false) sfx('taiko', 0.8);
      for (const [who, text, dur] of o.say || []) { const t = typeof text === 'function' ? text(rt, m) : text; if (t) rt.say(who, t, dur || 3.5); }
      for (const sp of o.foes(rt, m)) spawnFoes(rt, C, ctx, at, sp);
      C.n0 = heads(C.groups);
      // 指定した戦では、門前と同じく遠い鬨が距離に応じて遅れて届く。
      rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
      if (C.groups[0]) {
        if (o.onShout) o.onShout(rt, C, m, C.groups[0]);
        else rt.army[o.farShout ? 'playFar' : 'play']('eshout', C.groups[0].center(), 1.6);
      }
      sendFriends(rt, ctx, at, 'attack');
      markFirst(rt, C);
    },
    tick(rt, C, m, ctx, el) {
      const we = wavesEl(rt, C, o, el, 14);
      for (let k = C.later.length - 1; k >= 0; k--) {
        const w = C.later[k];
        if (we < w.t) continue;
        C.later.splice(k, 1);
        if (w.if && !w.if(rt, m)) continue;
        if (w.title) rt.banner(w.title, w.sub || '');
        if (w.say) rt.say(w.say[0], typeof w.say[1] === 'function' ? w.say[1](rt, m) : w.say[1], w.say[2] || 3.5);
        for (const sp of w.foes(rt, m)) spawnFoes(rt, C, ctx, C.at, sp);
      }
      for (const g of alive(C.groups)) if (g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
      nudge(C, el);
      markFirst(rt, C);
      const g0 = alive(C.groups)[0];
      C.goal = g0 ? g0.center() : C.at;
      // 何人中何人を倒したか（十八の2・BZ）
      rt.objProgress('dp', `敵 ${Math.max(0, (C.nTot || 0) - heads(C.groups))}／${C.nTot || 0}人${C.later.length ? '・まだ来る' : ''}`);
      if (!C.later.length && !alive(C.groups).length && !o.preserveFoes && refill(rt, C, ctx, el, o)) return false;
      return !C.later.length && !alive(C.groups).length;
    },
    end(rt, C, m, ctx) {
      // 時間切れでも、寄せた敵の六割より多くを崩していれば勝ちとする
      const won = o.preserveFoes ? !C.timeout : !C.timeout || heads(C.groups) <= Math.max(4, (C.nTot || 0) * 0.4);
      if (!o.preserveFoes) routAll(C);
      rt.unmark('dp');
      if (won) { rt.objDone('dp'); if (o.reward) rt.award((t) => (typeof o.reward === 'function' ? o.reward(t, m) : t.side.push(o.reward)), typeof o.rewardLabel === 'string' ? o.rewardLabel : (typeof o.reward === 'string' ? o.reward : '手柄')); }
      else rt.objFail('dp');
      if (o.onEnd) o.onEnd(rt, m, won);
    },
  };
}

// 持ちこたえ：その場を dur 秒守る。waves で寄せが来る
export function hold(o) {
  const dur = o.dur || 90;
  return {
    resumeEnd: o.onEnd, kind: 'hold', max: dur + 35, limit: o.limit, skip: o.skip,
    start(rt, C, m, ctx) {
      const at = typeof o.at === 'function' ? o.at(rt, m) : o.at;
      C.at = at; C.goal = at; C.inT = 0; C.botRadius = o.r || 14;
      C.waves = (typeof o.waves === 'function' ? o.waves(rt, m) : o.waves || []).slice();
      if (o.title) rt.banner(o.title, o.sub || '');
      if (o.startSound !== false && o.startDrum !== false) sfx('taiko', 0.7);
      for (const [who, text, dur2] of o.say || []) { const t = typeof text === 'function' ? text(rt, m) : text; if (t) rt.say(who, t, dur2 || 3.5); }
      rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
      dropSameMark(rt, o.label);
      rt.marker('dp', at, o.label || '持ち場', { h: 3 });
      rt.zone('dp', at.x, at.z, o.r || 14);
      sendFriends(rt, ctx, at, 'hold');
    },
    tick(rt, C, m, ctx, el, dt) {
      const we = wavesEl(rt, C, o, el, o.r || 14);
      for (let k = C.waves.length - 1; k >= 0; k--) {
        const w = C.waves[k];
        if (we < w.t) continue;
        C.waves.splice(k, 1);
        if (w.if && !w.if(rt, m)) continue;
        if (w.say && !o.onShout) rt.say(w.say[0], typeof w.say[1] === 'function' ? w.say[1](rt, m) : w.say[1], w.say[2] || 3.5);
        let group = null, from = C.at;
        for (const sp of w.foes(rt, m)) { group = spawnFoes(rt, C, ctx, C.at, sp); from = sp.from || from; }
        if (o.onShout) { if (group) o.onShout(rt, C, m, group); }
        else rt.army[o.farShout ? 'playFar' : 'play']('eshout', from, 1.6);
      }
      for (const g of alive(C.groups)) if (!o.realHold && g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
      // 持ちこたえる刻が過ぎ、寄せも尽きたら、残りの敵は気が挫けて崩れやすくなる（いつまでも斬り合いが続かない）
      if (!o.realHold && el >= dur && !C.waves.length) for (const g of alive(C.groups)) { g.noRout = false; g.morale = Math.min(g.morale, 30); }
      nudge(C, el);
      const p = rt.player.u.pos;
      // 持ち場の前へ出て戦っている間も、持ち場を守っていることにする（遠く離れて追い回した時だけ外す）
      if (Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14) + 30) C.inT += dt;
      if (o.realHold) {
        if (el >= (C.arrivalScanAt || 0)) {
          C.arrivalScanAt = el + 0.5; C.nearCached = 0;
          if (ctx.friends) for (const g of ctx.friends(rt)) if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (o.r || 14) + 8) C.nearCached++;
        }
        const near = C.nearCached || 0;
        if (near >= 3 && Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14) + 8) C.arrivedHold = (C.arrivedHold || 0) + dt;
        const enemies = C.groups.some((g) => !gone(g) && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut));
        rt.objProgress('dp', near < 3 ? '味方三人を持ち場へ集めよ' : (C.arrivedHold || 0) < 20 ? `列が着いてから守る あと${Math.max(0, Math.ceil(20 - (C.arrivedHold || 0)))}秒` : C.waves.length ? '持ち場で後の寄せを待て' : enemies ? '残る寄せを味方と押し返せ' : '持ち場の列を保った');
        C.goal = C.at;
        return !C.waves.length && !enemies && C.arrivedHold >= 20;
      }
      const left = Math.max(0, Math.ceil(dur - el));
      const n = heads(C.groups);
      rt.objProgress('dp', left > 0 ? `守る あと${left}秒${n ? `・敵 ${n}人` : ''}` : `残りの敵 ${n}人`);
      // 守る場所は敵の中心へ動かさない。追うと味方の列を離れてしまう。
      C.goal = C.at;
      if (!C.waves.length && !alive(C.groups).length && refill(rt, C, ctx, el, o)) return false;
      return el >= dur && !C.waves.length && !alive(C.groups).length;
    },
    end(rt, C, m) {
      if (!o.realHold) routAll(C);
      rt.unmark('dp'); rt.unzone('dp');
      const won = o.realHold ? !C.timeout && C.arrivedHold >= 20 : C.inT >= dur * 0.45;
      if (won) { rt.objDone('dp'); if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward); }
      else { rt.objFail('dp'); if (o.lost) rt.say(o.lost[0], o.lost[1], 3); }
      if (o.onEnd) o.onEnd(rt, m, won);
    },
  };
}

// 移る：組を連れて次の場所へ（途中で待ち伏せが出ることもある）
export function move(o) {
  return {
    resumeEnd: o.onEnd, kind: 'move', max: o.max || 100, skip: o.skip,
    start(rt, C, m, ctx) {
      const to = typeof o.to === 'function' ? o.to(rt, m) : o.to;
      C.at = to; C.goal = to; C.amb = o.ambush ? { ...o.ambush } : null; C.label = o.label || '';
      for (const [who, text, dur] of o.say || []) { const t = typeof text === 'function' ? text(rt, m) : text; if (t) rt.say(who, t, dur || 3.5); }
      rt.obj('dp', o.obj, 'main');
      dropSameMark(rt, o.label);
      rt.marker('dp', to, o.label || '次の持ち場', { h: 3 });
      rt.zone('dp', to.x, to.z, o.r || 8);
      sendFriends(rt, ctx, to, 'hold');
    },
    tick(rt, C, m, ctx, el) {
      const p = rt.player.u.pos;
      const d = Math.hypot(p.x - C.at.x, p.z - C.at.z);
      if (C.amb && (el > (C.amb.t || 999) || d < (C.amb.d || 0))) {
        const w = C.amb; C.amb = null;
        if (!w.if || w.if(rt, m)) {
          if (w.say) rt.say(w.say[0], w.say[1], w.say[2] || 3);
          if (w.title) rt.banner(w.title, w.sub || '');
          for (const sp of w.foes(rt, m)) spawnFoes(rt, C, ctx, { x: p.x, z: p.z }, sp);
        }
      }
      for (const g of alive(C.groups)) if (g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
      const near = alive(C.groups)[0];
      C.goal = near ? near.center() : C.at;
      if (!C.arr && d < (o.r || 8)) { C.arr = true; C.arrT = el; rt.unmark('dp'); rt.unzone('dp'); cpCue(rt, C.at); rt.objDone('dp'); dpArrivedRow(rt, C); }   // P4（K410）：移る先のピンに着いたら「済」の印と音。K473：一行もその場で済に（前は待ち伏せが片付くか二十五秒後まで済にならなかった）
      rt.objProgress('dp', C.arr ? (near ? `待ち伏せの敵 ${heads(C.groups)}人` : '') : `あと ${Math.round(d)}m`);
      // 着いたら、残った待ち伏せは味方に任せて次へ（25 秒まで待つ）
      return C.arr && (!alive(C.groups).length || el - C.arrT > 25);
    },
    end(rt, C, m) {
      routAll(C);
      rt.unmark('dp'); rt.unzone('dp');
      if (C.arr) rt.objDone('dp'); else rt.objFail('dp');
      if (o.onEnd) o.onEnd(rt, m, !!C.arr);
    },
  };
}

// bot（自動の遊び手）：段の間は、目の前の敵を突き、いなければ段の的へ
export function depthBot(b, inp, goTo) {
  depthBot0(b, inp, goTo);
  const D = b.flags.dp;
  if (D && D.ctx && D.ctx.ring) steerRing(b, inp, D.ctx.ring);
  if (D && D.ctx && D.ctx.botSteer) D.ctx.botSteer(b, inp);
}
// 柵の輪（付城など）に bot が突っかからないよう、歩く向きを輪の外回りへ曲げる。ring = { x, z, r, gap（口の向き。0 = +z） }
//   外から輪に当たりそうなら輪に沿って回り、口の前まで来たら入る。内から出る時は口へ向かう
export function steerRing(b, inp, ring) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u;
  const dx = u.pos.x - ring.x, dz = u.pos.z - ring.z, d = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), g = ring.gap || 0, gx = Math.sin(g), gz = Math.cos(g);
  const off = Math.abs(Math.atan2(dx * gz - dz * gx, dx * gx + dz * gz));   // 口からの角度のずれ
  if (d < ring.r - 0.4) {
    const ax = dx + fx * 3, az = dz + fz * 3;
    if (Math.hypot(ax, az) > ring.r - 1 && off > 0.3) {
      const ix = ring.x + gx * (ring.r - 3), iz = ring.z + gz * (ring.r - 3);
      const tx = Math.hypot(u.pos.x - ix, u.pos.z - iz) > 2 ? ix : ring.x + gx * (ring.r + 5), tz = Math.hypot(u.pos.x - ix, u.pos.z - iz) > 2 ? iz : ring.z + gz * (ring.r + 5);
      p.yaw = Math.atan2(tx - u.pos.x, tz - u.pos.z);
    }
    return;
  }
  const ax = dx + fx * 4, az = dz + fz * 4;
  if (Math.hypot(ax, az) > ring.r + 2.5) { b.ringSide = 0; return; }
  if (off < 0.45 && fx * dx + fz * dz < 0) return;       // 口の前：そのまま入る
  const t1x = -dz / d, t1z = dx / d;
  if (!b.ringSide) b.ringSide = t1x * fx + t1z * fz >= 0 ? 1 : -1;
  const s = b.ringSide, nx = t1x * s + (dx / d) * 0.35, nz = t1z * s + (dz / d) * 0.35;
  p.yaw = Math.atan2(nx, nz);
}
// 退く向きと構える向きを分ける。近い敵には正面を向けたまま歩く。
function depthWithdraw(b, inp, goTo, x, z, r, guardR = 3.5, run = true) {
  const p = b.player, u = p.u;
  // 通りを指定した戦だけ、構えた横歩きにも同じ曲がり角を使う。
  // 行き先へ直線で引き直すと、町屋や堀へ向かって歩き続けてしまう。
  const way = b.flags.dp?.ctx?.withdrawWay;
  if (way) {
    const goal = p._depthWithdrawGoal || (p._depthWithdrawGoal = { x: 0, z: 0 });
    goal.x = x; goal.z = z;
    const q = way(b.army, u, goal);
    if (q !== goal) { x = q.x; z = q.z; r = q.botRadius ?? r; }
  }
  inp.leftPressed = false; inp.chargeHold = false;
  // 曲がり角を選んだ後は、戦固有の頭や共通の頭で道を選び直さない。
  goTo(p, inp, x, z, r, !!way);
  let foe = b.army.nearestEnemy(u, guardR, (o) => !o.fleeing && !o.noTarget && !b.army.wallBetween(u.pos, u.team, o.pos));
  let ad = guardR;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, u.team, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { foe = o; ad = d; }
  }
  inp.guardHold = !!foe; inp.runHeld = run && !foe;
  if (!foe) return;
  if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
  const walk = inp.k.has('KeyW');
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (!walk) return;
  const dx = x - u.pos.x, dz = z - u.pos.z;
  const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
  const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
  if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
}

function depthBot0(b, inp, goTo) {
  const p = b.player, u = p.u, D = b.flags.dp;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE'); inp.guardHold = false;
  if (!u.alive) return;
  // 移る下知では、待ち伏せを追わず目的地へ。着いた後は近い敵を払う。
  // K582 11/22 クラウド b_osaka 持ち主：退き口をたどる戦（def.botEvacStick と botEvacuating）は、着いた後に印から離れても敵を払いに行かず印へ戻る
  if (D && D.cur && D.cur.s.kind === 'move' && (!D.cur.arr || (b.def.botEvacStick && b.def.botEvacuating?.(b)))) {
    const q = D.cur.at;
    depthWithdraw(b, inp, goTo, q.x, q.z, 4);
    return;
  }
  // 深手：構えたまま、味方の組の中へ下がって息を整える（素直な遊び手の真似。戻れば、また前へ）
  // 傷は自然回復しない。手当てを終えたら、残る深手だけで退避を繰り返さない。
  const needsTreatment = u.hp < u.maxHp * (D?.ctx?.botTreatAt ?? 0.5) && p.treatmentLeft > 0 && !p.bandaged;
  if (needsTreatment || p.sta < p.maxSta * 0.22) b.flags.dpBack = true;
  // 手当て済みで気力が戻れば、近くに敵がいても任務へ戻る。包囲の退避は共通の頭で判断する。
  if (b.flags.dpBack && p.sta > p.maxSta * 0.55 && !needsTreatment) b.flags.dpBack = false;
  if (b.flags.dpBack && D && D.ctx) {
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 手当ては敵から十二歩以上離れ、六歩以内の味方に守られて初めてできる。
    // 最寄りの隊の中心だけを選ぶと、前線の八歩後ろで手当てを待ち続ける。
    // 止まる範囲の二歩も見込み、生きた味方の後ろに安全な場所を探す。
    const back = p._depthBack || (p._depthBack = { x: 0, z: 0, at: 0, found: false });
    if (!(back.at > b.t)) {
      back.at = b.t + 0.5; back.found = false;
      const friends = D.ctx.friends ? D.ctx.friends(b) : null, squads = b.squadGroups;
      const fn = friends ? friends.length : 0, sn = squads ? squads.length : 0;
      let best = Infinity, bestClear = -1;
      for (let i = 0; i < fn + sn + 1; i++) {
        const g = i < fn ? friends[i] : i === fn ? D.ctx.aidG : squads[i - fn - 1];
        if (!g || !g.count || g.routed) continue;
        for (const mate of g.units) {
          if (mate === u || !mate.alive || mate.fleeing || mate.civ || mate.noTarget || mate.farSim ||
              mate.woundOut || mate.rearWound || mate.stagger > 0 || mate.hp < mate.maxHp * 0.35 ||
              mate.type === 'dummy' || mate.type === 'porter') continue;
          let foe = null, fd = Infinity;
          for (const o of b.army.units) {
            if (!o.alive || o.team === u.team || o.fleeing || o.civ || o.noTarget || o.isStruct ||
                o.type === 'dummy' || o.type === 'porter') continue;
            const d = (o.pos.x - mate.pos.x) ** 2 + (o.pos.z - mate.pos.z) ** 2;
            if (d < fd) { foe = o; fd = d; }
          }
          const q = foe ? foe.pos : D.cur?.goal;
          let ax = q ? mate.pos.x - q.x : 0, az = q ? mate.pos.z - q.z : 0;
          const len = Math.hypot(ax, az);
          if (len < 0.1) { ax = -Math.sin(g.facing); az = -Math.cos(g.facing); }
          else { ax /= len; az /= len; }
          const tx = mate.pos.x + ax * 4, tz = mate.pos.z + az * 4;
          // 戦固有の道幅・足場がある時だけ、休めない候補を外す。
          if (D.ctx.botBackAllowed && !D.ctx.botBackAllowed(b, tx, tz)) continue;
          let clearance = Infinity;
          for (const o of b.army.units) {
            if (!o.alive || o.team === u.team || o.fleeing || o.civ || o.noTarget || o.isStruct ||
                o.type === 'dummy' || o.type === 'porter') continue;
            clearance = Math.min(clearance, (o.pos.x - tx) ** 2 + (o.pos.z - tz) ** 2);
          }
          const distance = (tx - u.pos.x) ** 2 + (tz - u.pos.z) ** 2;
          const safe = clearance >= 14 * 14;
          // 安全な候補では近さを優先。まだ無ければ、敵から最も離れる場所へ退く。
          if (safe ? bestClear < 14 * 14 || distance < best : bestClear < 14 * 14 && clearance > bestClear) {
            back.x = tx; back.z = tz; back.found = true; best = distance; bestClear = clearance;
          }
        }
      }
    }
    if (back.found) {
      depthWithdraw(b, inp, goTo, back.x, back.z, 1.5, 6, false);
      // 馬上では傷を縛れない。安全な退き先へ着いたら降り、通常の手当てを待つ。
      // 降りる場所が塞がれた時も、同じ釦を毎コマ押して知らせを重ねない。
      if (needsTreatment && p.mounted && p.mountT <= 0 &&
          Math.hypot(back.x - u.pos.x, back.z - u.pos.z) <= 1.5 &&
          !b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget && !o.woundOut && !o.isStruct) &&
          !(back.dismountAt > b.t)) {
        inp.e.add('KeyR'); back.dismountAt = b.t + 8;
      }
      return;
    }
  }
  const kz = D && D.ctx && D.ctx.keepZ;   // 川を渡ってはならない段（姉川）：向こう岸の敵は追わない
  // 持ち場の外の敵を候補から外してから選ぶ。最寄りだけ捨てると、内側の敵を見落とす。
  const hold = D?.cur?.s.kind === 'hold' ? D.cur : null;
  const allowed = D?.ctx?.botFoeAllowed;
  let e = b.army.nearestEnemy(u, 14, (o) => (!allowed || allowed(o)) && (!hold || Math.hypot(o.pos.x - hold.at.x, o.pos.z - hold.at.z) <= hold.botRadius) && !o.noTarget && !o.woundOut && !o.invuln && !o.fleeing && o.type !== 'dummy' && (kz === undefined || o.pos.z > kz) && (!D?.ctx?.routeFight || (Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))));
  // 構えを解いて突くまでの半秒は相手を保つ。近い兵が入れ替わるたびに
  // 待ちをやり直すと、密集した辻で一度も突けない。
  const previous = p.botStrikeFoe;
  if (p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team &&
      (!allowed || allowed(previous)) &&
      !previous.fleeing && !previous.woundOut && !previous.noTarget && !previous.invuln &&
      Math.abs(previous.pos.y - u.pos.y) < 3 && (kz === undefined || previous.pos.z > kz) &&
      Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.7 : 2.8) &&
      !b.army.wallBetween(u.pos, -1, previous.pos, false)) e = previous;
  if (e && D?.cur?.s.kind === 'hold' && Math.hypot(e.pos.x - D.cur.at.x, e.pos.z - D.cur.at.z) > D.cur.botRadius) e = null;
  // 攻める段では、任務の印に着いても寄せ手が遠ければ、その隊の生きた兵へ進む。
  // 谷道の寄せを止める段は、持ち場の範囲に残る任務の敵も探す。
  // 平均位置で止まり、離れて残った侍を待ち続けない。他の守る段は近い敵だけを迎える。
  if (!e && D?.ctx?.botSeek && (D.cur?.s.kind === 'fight' || (hold && D.ctx.botSeekHold))) {
    e = b.army.nearestEnemy(u, D.ctx.botSeek, (o) => (!allowed || allowed(o)) && (!hold || Math.hypot(o.pos.x - hold.at.x, o.pos.z - hold.at.z) <= hold.botRadius) && !o.noTarget && !o.woundOut && !o.invuln && !o.fleeing && o.type !== 'dummy' && D.cur.groups.includes(o.group) && (kz === undefined || o.pos.z > kz) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀で槍の間合いに止まると、振っても届かず敵の槍だけを受ける。
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    // 前の敵へ狙いが残ると、更新時に向きを戻されて今の相手へ届かない。
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    inp.leftPressed = d < reach && !e.invuln && p.cd <= 0 && !p.pending && p.sta >= 18;
    // 構えをくじで解かず、実際に振りかぶる敵へ向ける。
    let attacker = null, ad = 10, impact = Infinity, threatN = 0;
    for (const o of b.army.threats || []) {
      if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const nd = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (nd >= 10) continue;
      threatN++;
      // 近い相手の長い振りかぶりより、今届く別の槍を先に受ける。
      const soon = o.swing && !o.swing.done ? 0 : o.atk ? o.atk.t : nd / Math.max(1, o.run);
      if (soon < impact || (soon === impact && nd < ad)) { attacker = o; ad = nd; impact = soon; }
    }
    inp.guardHold = !!attacker;
    if (attacker) {
      if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
      inp.k.delete('KeyW');
      p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      // 防御で向き直っても、この段の足場と持ち場の外へは踏み込まない。
      if (ad >= reach && !attacker.charging && (!allowed || allowed(attacker) &&
          (!hold || Math.hypot(attacker.pos.x - hold.at.x, attacker.pos.z - hold.at.z) <= hold.botRadius))) inp.k.add('KeyW');
      inp.leftPressed = ad < reach && !attacker.invuln && p.cd <= 0 && !p.pending && p.sta >= 18;
    }
    // 槍は構えたまま押すと短い払いになる。敵の隙で構えを解き、突きの間合いを使う。
    // 解いてから半秒は同じ相手を見て待ち、毎コマ構え直して反撃を消さない。
    const foe = attacker || e, fd = attacker ? ad : d;
    // 味方へ振っている敵には横から突ける。自分への打ち込みだけを受ける。
    const attacking = (foe.atk && foe.atk.target === u && !foe.atk.bow) ||
      (foe.swing && !foe.swing.done && foe.swing.target === u) || (foe.charging && foe.target === u);
    // 一人だけの長い振りかぶりなら、構えを解く半秒と突きの出が間に合う時に反撃する。
    const guardWait = p.guard ? 0.45 : Math.max(0, 0.45 - (p.time - (p.guardOffT ?? -9)));
    const winding = threatN === 1 && foe.atk?.target === u && !foe.atk.bow &&
      !foe.atk.ranged && foe.atk.t > guardWait + 0.2 && !foe.charging && !(foe.swing && !foe.swing.done);
    const safe = fd < reach && !foe.invuln && (!attacking || winding);
    const opening = safe && (winding || p.counterT > 0 || foe.cd > 0.3 || foe.stagger > 0.3 || foe.target !== u);
    if (!safe || p.botStrikeFoe !== foe) p.botStrikeUntil = 0;
    if (opening && !(p.botStrikeUntil > p.time)) { p.botStrikeFoe = foe; p.botStrikeUntil = p.time + 0.7; }
    const striking = safe && (opening || p.botStrikeUntil > p.time);
    if (p.weapon === 'sword' || p.weapon === 'spear') {
      inp.guardHold = !!attacker && !striking;
      inp.leftPressed = striking && p.cd <= 0 && !p.pending && p.sta >= 18 &&
        (p.weapon === 'sword' || (!p.guard && p.time - (p.guardOffT ?? -9) > 0.45));
    }
    // 休む段で組は追従へ戻る。有岡の攻める段では再び組へ号令する。
    // 遠い敵への移動中に同じ号令を重ねると取り消しになるため待つ。
    const g = b.squadGroups[0];
    const attackOrders = !b.def.botOrders || (D?.ctx?.botAttackOrders && D.cur?.s.kind === 'fight');
    if (attackOrders && b.squad.length && g?.count && g.order !== 'attack' &&
        !(g.order === 'move' && p.lastCmd?.id === 'attack') && d < 20 && !(b.botCmdT > b.t)) {
      inp.e.add('KeyC'); b.botCmdT = b.t + 4.5;
    }
    return;
  }
  const q = D && D.cur && D.cur.goal;
  if (q) goTo(p, inp, q.x, kz === undefined ? q.z : Math.max(q.z, kz + 3), 4);
}
