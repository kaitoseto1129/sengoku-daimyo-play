// ======================================================================
// 一つの戦を濃くする「段」の流れ（桶狭間・森部・墨俣・姉川・設楽原で使う）
//   戦の途中や勝ったあとに、段を幾つも重ねる：立て直し（rest）→ 判断（pick）→ 激突（fight）→ 持ちこたえ（hold）→ 移る（move）
//   選んだ事は mem に残り、後の段の敵の数・行き先・手柄が変わる。どの段にも時間切れの保険があり、必ず次の段へ進む
// 使い方：depthStart(rt, ctx, [段…], 終わった時) を呼び、戦の update で depthTick(rt, dt) を回す
//   ctx = { faction, flag, armor（敵の控えの旗と具足）, friends: (rt) => [味方の組…], look: (list) => list（敵の見た目）, aid: { name, faction, flag, list }（足りない時に加わる味方）, dmg, scale }
// 敵は小勢をぽつぽつ出さない：一つの波は、近くの本物の兵（足軽を scale 倍）＋後ろに数百の軍勢（backOf の控え）で、大きな塊としてどっと来る。
//   控えに踏み込めば、近い所から本物の兵に替わる（b_nagashinojo.js の wake）
// ======================================================================
import { enemyGroup, allyGroup, centerOf, hiddenFrom } from './bhelp.js';
import { moraleWord } from './hud.js';
import { sfx } from './audio.js';
import { backOf, ARMOR } from './b_nagashinojo.js';

const gone = (g) => !g || g.count === 0 || g.routed;
// 段の上では、二人以下に減った組・皆が逃げ出した組は「崩れた」とみなす（逃げ惑う数人を探し回らせない）
const spent = (g) => gone(g) || g.count <= 2 || g.units.every((u) => !u.alive || u.fleeing);
const alive = (gs) => gs.filter((g) => !spent(g));
const heads = (gs) => alive(gs).reduce((a, g) => a + g.count, 0);

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
  nextStep(rt);
}

function nextStep(rt) {
  const D = rt.flags.dp;
  D.i++;
  const s = D.steps[D.i];
  if (!s) { D.on = false; D.cur = null; rt.unmark('dp'); rt.unzone('dp'); if (D.done) D.done(rt, D.mem); return; }
  if (s.skip && s.skip(rt, D.mem)) { nextStep(rt); return; }
  D.cur = { s, t0: rt.t, groups: [], goal: null };
  s.start(rt, D.cur, D.mem, D.ctx);
}

export function depthTick(rt, dt) {
  // 味方が数人まで減ったら、新手の組が追いつく（立ちっぱなしで全員が倒れる流れにしない。A029）
  if (rt.t > 60 && !rt.over && rt.t - (rt._rfT ?? 0) > 4) {
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
  // 保険：どの段も、長引けば時間切れで次の段へ
  if (!fin && el > s.max && rt.canFailMission()) { C.timeout = true; fin = true; }
  if (fin) {
    if (s.end) s.end(rt, C, D.mem, D.ctx);
    nextStep(rt);
  }
}

// ---------------- 敵と味方を出す ----------------
function spawnFoes(rt, C, ctx, at, spec) {
  const from = ctx.fixedSpawn ? (spec.from || at) : hiddenFrom(rt, spec.from || at);
  const fl = { x: from.x - at.x, z: from.z - at.z }, L = Math.hypot(fl.x, fl.z) || 1;
  // 足軽・鉄砲・弓は数を増やして、ぎっしりした塊にする
  const k = spec.scale ?? ctx.scale ?? 1.7;
  const big = spec.list.map((q) => (q.type === 'ashigaru' || q.type === 'gun' || q.type === 'bow' ? { ...q, n: Math.round(q.n * k) } : q));
  const list = ctx.look ? ctx.look(big) : big;
  const g = enemyGroup(rt, { fixed: !!ctx.fixedSpawn, faction: spec.faction || ctx.faction, name: spec.name, anchor: { x: from.x, z: from.z }, facing: Math.atan2(-fl.x, -fl.z), order: 'attack', seekRange: spec.seek || 60, aggro: 14, width: spec.width || 10, morale: spec.morale || 90, fleeDir: { x: fl.x / L, z: fl.z / L }, formation: spec.formation }, list);
  g.anchor = { x: at.x + (spec.off ? spec.off.x : 0), z: at.z + (spec.off ? spec.off.z : 0) };
  g.dmgMult = spec.dmg ?? ctx.dmg ?? 0.62;
  if (spec.noRout) { g.noRout = true; rt.after(spec.noRout, () => { g.noRout = false; }); }
  C.groups.push(g);
  C.nTot = (C.nTot || 0) + g.count;
  // 後ろに同じ旗の数百の軍勢（控え）が付いてくる
  const mass = spec.mass ?? ctx.mass ?? 160;
  if (mass > 0 && ctx.backing !== false) backOf(rt, g, { flag: spec.flag || ctx.flag || spec.faction || ctx.faction, armor: spec.armor || ctx.armor || ARMOR[spec.faction || ctx.faction] || 0x33302a, kind: spec.kind || (spec.list.some((q) => q.type === 'cavalry') ? 'cavalry' : 'spear'), w: 20, depth: 12, gap: ctx.backGap, count: mass, seed: 300 + Math.floor(Math.random() * 600) });
  if (spec.say) rt.say(spec.say[0], spec.say[1], spec.say[2] || 3);
  return g;
}
// 味方の組を段の場所へ（勝手に立ち尽くさない）。足りなければ新手の味方が追いつく
function sendFriends(rt, ctx, at, mode) {
  const fr = (ctx.friends ? ctx.friends(rt) : []).filter((g) => g && g.count);
  if (ctx.aid && (!ctx.aidG || gone(ctx.aidG) || ctx.aidG.count < 8)) {
    const p = rt.player.u.pos;
    const fac = ctx.aid.faction || 'oda';
    ctx.aidG = allyGroup(rt, { faction: fac, name: ctx.aid.name, anchor: { x: p.x + 4, z: p.z + 4 }, facing: 0, aggro: 12, width: 12, noRout: true, dmgMult: 0.7 }, ctx.aid.list.map((q) => (q.type === 'ashigaru' ? { ...q, n: Math.round(q.n * 1.6) } : q)));
    // 味方も数百の軍勢で押し出す（後ろに控え）
    if (ctx.backing !== false) backOf(rt, ctx.aidG, { flag: ctx.aid.flag || fac, armor: ARMOR[fac] || ARMOR.oda, kind: 'spear', w: 20, depth: 10, gap: ctx.backGap, count: 140, seed: 900 + Math.floor(Math.random() * 90) });
    rt.after(40, () => { if (ctx.aidG) ctx.aidG.noRout = false; });
    if (ctx.aidSaid) rt.bark(ctx.aidSaid);
  }
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
    if (Math.hypot(c.x - C.at.x, c.z - C.at.z) > 30) { g.order = 'attack'; g.seekRange = 90; g.anchor = { x: C.at.x, z: C.at.z }; }
  }
}
function markFirst(rt, C) {
  const g = alive(C.groups)[0];
  if (g === C.marked) return;
  C.marked = g;
  if (g) rt.marker('dp', centerOf(g), () => `${g.name || '敵'}・${moraleWord(g.morale)}`, { red: true, group: g });
  else rt.unmark('dp');
}

// ---------------- 段の形 ----------------
// 立て直し：組を集め直し、手負いの手当て、上役の下知
export function rest(o) {
  return {
    kind: 'rest', max: (o.dur || 14) + 1,
    start(rt, C, m, ctx) {
      const u = rt.player.u;
      if (o.heal !== 0) rt.player.treatWounds(o.heal ?? 0.35);
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
    kind: 'fight', max: o.max || 150, skip: o.skip,
    start(rt, C, m, ctx) {
      const at = typeof o.at === 'function' ? o.at(rt, m) : o.at;
      C.at = at; C.goal = at; C.later = (typeof o.later === 'function' ? o.later(rt, m) : o.later || []).slice();
      if (o.title) rt.banner(o.title, o.sub || '');
      sfx('taiko', 0.8);
      for (const [who, text, dur] of o.say || []) { const t = typeof text === 'function' ? text(rt, m) : text; if (t) rt.say(who, t, dur || 3.5); }
      for (const sp of o.foes(rt, m)) spawnFoes(rt, C, ctx, at, sp);
      C.n0 = heads(C.groups);
      if (C.groups[0]) rt.army.play('eshout', C.groups[0].center(), 1.6);
      rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
      sendFriends(rt, ctx, at, 'attack');
      markFirst(rt, C);
    },
    tick(rt, C, m, ctx, el) {
      for (let k = C.later.length - 1; k >= 0; k--) {
        const w = C.later[k];
        if (el < w.t) continue;
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
      rt.objProgress('dp', `敵 ${heads(C.groups)}人${C.later.length ? '・まだ来る' : ''}`);
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
    kind: 'hold', max: dur + 35, skip: o.skip,
    start(rt, C, m, ctx) {
      const at = typeof o.at === 'function' ? o.at(rt, m) : o.at;
      C.at = at; C.goal = at; C.inT = 0; C.botRadius = o.r || 14;
      C.waves = (typeof o.waves === 'function' ? o.waves(rt, m) : o.waves || []).slice();
      if (o.title) rt.banner(o.title, o.sub || '');
      sfx('taiko', 0.7);
      for (const [who, text, dur2] of o.say || []) { const t = typeof text === 'function' ? text(rt, m) : text; if (t) rt.say(who, t, dur2 || 3.5); }
      rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
      dropSameMark(rt, o.label);
      rt.marker('dp', at, o.label || '持ち場', { h: 3 });
      rt.zone('dp', at.x, at.z, o.r || 14);
      sendFriends(rt, ctx, at, 'hold');
    },
    tick(rt, C, m, ctx, el, dt) {
      for (let k = C.waves.length - 1; k >= 0; k--) {
        const w = C.waves[k];
        if (el < w.t) continue;
        C.waves.splice(k, 1);
        if (w.if && !w.if(rt, m)) continue;
        if (w.say) rt.say(w.say[0], typeof w.say[1] === 'function' ? w.say[1](rt, m) : w.say[1], w.say[2] || 3.5);
        rt.army.play('eshout', w.foes(rt, m).reduce((q, sp) => { spawnFoes(rt, C, ctx, C.at, sp); return sp.from || q; }, C.at), 1.6);
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
      rt.objProgress('dp', left > 0 ? `持ちこたえる あと${left}秒${n ? `・敵 ${n}人` : ''}` : `残りの敵 ${n}人`);
      // 守る場所は敵の中心へ動かさない。追うと味方の列を離れてしまう。
      C.goal = C.at;
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
    kind: 'move', max: o.max || 100, skip: o.skip,
    start(rt, C, m, ctx) {
      const to = typeof o.to === 'function' ? o.to(rt, m) : o.to;
      C.at = to; C.goal = to; C.amb = o.ambush ? { ...o.ambush } : null;
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
      if (!C.arr && d < (o.r || 8)) { C.arr = true; C.arrT = el; rt.unmark('dp'); rt.unzone('dp'); }
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
  inp.leftPressed = false; inp.chargeHold = false;
  goTo(p, inp, x, z, r);
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
  if (D && D.cur && D.cur.s.kind === 'move' && !D.cur.arr) {
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
  let e = b.army.nearestEnemy(u, 14, (o) => (!hold || Math.hypot(o.pos.x - hold.at.x, o.pos.z - hold.at.z) <= hold.botRadius) && !o.noTarget && !o.woundOut && !o.invuln && !o.fleeing && o.type !== 'dummy' && (kz === undefined || o.pos.z > kz) && (!D?.ctx?.routeFight || (Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))));
  // 構えを解いて突くまでの半秒は相手を保つ。近い兵が入れ替わるたびに
  // 待ちをやり直すと、密集した辻で一度も突けない。
  const previous = p.botStrikeFoe;
  if (p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team &&
      !previous.fleeing && !previous.woundOut && !previous.noTarget && !previous.invuln &&
      Math.abs(previous.pos.y - u.pos.y) < 3 && (kz === undefined || previous.pos.z > kz) &&
      Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.7 : 2.8) &&
      !b.army.wallBetween(u.pos, -1, previous.pos, false)) e = previous;
  if (e && D?.cur?.s.kind === 'hold' && Math.hypot(e.pos.x - D.cur.at.x, e.pos.z - D.cur.at.z) > D.cur.botRadius) e = null;
  // 攻める段では、任務の印に着いても寄せ手が遠ければ、その隊の生きた兵へ進む。
  // 谷道の寄せを止める段は、持ち場の範囲に残る任務の敵も探す。
  // 平均位置で止まり、離れて残った侍を待ち続けない。他の守る段は近い敵だけを迎える。
  if (!e && D?.ctx?.botSeek && (D.cur?.s.kind === 'fight' || (hold && D.ctx.botSeekHold))) {
    e = b.army.nearestEnemy(u, D.ctx.botSeek, (o) => (!hold || Math.hypot(o.pos.x - hold.at.x, o.pos.z - hold.at.z) <= hold.botRadius) && !o.noTarget && !o.woundOut && !o.invuln && !o.fleeing && o.type !== 'dummy' && D.cur.groups.includes(o.group) && (kz === undefined || o.pos.z > kz) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false));
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
      if (ad >= reach && !attacker.charging) inp.k.add('KeyW');
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
