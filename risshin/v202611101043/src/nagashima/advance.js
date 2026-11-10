// ======================================================================
// 長島一向一揆　作り直し（kaito 11/9 夜 docs/nagashima_spec_1109.md「逃げ場がなくなっていく」）
// 岸の物見（monomi.js）の後、細い堤 → 堤の砦 → 舟着場（水路）→ 寺内の在所 → 囲みを閉じる → 最後の突破 → 堤の上の終わり。
// 段は共通の b_depth.js（fight・hold・move・rest）に、長島の決まりを足して使う：
//   ・制圧は全滅でなく、寄せた数の七割が崩れるか、門徒頭が倒れるか、刻限で進む（残兵は奥へ退く）
//   ・特定の NPC・舟の到着・本人の一太刀に頼らない（残兵を探し続けない刻限）
//   ・非戦の民（war_people の群れ）は狙いの外。武器を持つ門徒だけが敵
// 座標は b_nagashima.js の地形（堤 x=-46、堤の砦 -50,-58、西の分流 x≈-64、願証寺 -44,-82、南の川 z≈-134）に合わせる。
// ======================================================================
import { sfx } from '../audio.js';
import { fight, hold, move, rest } from '../b_depth.js';

export const ADV_MISSIONS = [
  '堤の上へ上がり、輪中と門徒の砦を見よ',
  '前方の堤を確保せよ',
  '第一砦を制圧せよ',
  '水路を確保せよ',
  '在所の入口の門徒を退けよ',
  '最後の脱出路を封鎖せよ',
  '最後の突破を食い止めよ',
  '堤の上を歩け',
];
// チェックポイント（指示書の CP1〜CP6）→ 段の番号
export const ADV_CP = { 1: 0, 2: 3, 3: 5, 4: 8, 5: 10, 6: 13 };

const P = {
  dikeHead: { x: -46, z: -10 },
  dikeFront: { x: -46, z: -42 },
  fort: { x: -50, z: -55 },
  landing: { x: -57, z: -76 },
  village: { x: -54, z: -100 },  // 舟着場から本堂（-53〜-35, -94〜-74）の西の小道をまっすぐ南へ下りた在所の口
  exit: { x: -36, z: -122 },
  walk: { x: -52, z: -123 },     // 左に南の川、右に燃える在所（東の大きな堂の脇は避ける）
};
export const ADV_POINTS = P;

// 生きて戦える者の数（崩れた・逃げた・深手の者を除く）
function fighters(C) {
  let n = 0;
  for (const g of C.groups) if (!g.routed) for (const u of g.units) {
    // 深手で後送された者や武器を捨てた者を、残る守兵として探させない。
    if (u.alive && u.hp > 0 && !u.dying && !u.gone && !u.fleeing && !u.woundOut &&
        !u.rearWound && !u.downed && !u.noTarget && !u.civ && !u.isStruct) n++;
  }
  return n;
}
// 制圧の段：本人が持ち場へ進み、寄せた数の ratio が崩れたら残りは奥へ退く。
function take(o) {
  const st = fight({ ...o, noRefill: true });
  const tick = st.tick;
  st.idleAdvance = false; st.noHardCap = true; st.limit = Infinity;
  st.tick = (rt, C, m, ctx, el, dt) => {
    const cleared = tick(rt, C, m, ctx, el, dt);
    const u = rt.player.u;
    const present = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing &&
      Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 14;
    C.takeT = (C.takeT || 0) + (present ? dt : 0);
    // 味方だけで敵を退けても、本人が来ないまま制圧にはしない。
    if (!present || C.takeT < 3) return false;
    if (C.later.length) return false;
    if (cleared) return true;
    const tot = C.nTot || 0;
    if (tot && (tot - fighters(C)) / tot >= (o.ratio ?? 0.7)) return true;
    if (o.leader && C.groups.some((g) => g.leader && !g.leader.alive) && (tot - fighters(C)) / tot >= 0.4) return true;
    // 刻限は残兵を探し続けないための救い。四割を崩すまでは制圧扱いにしない。
    if (el > (o.cap || 170) && tot && fighters(C) <= tot * 0.6) return true;
    return false;
  };
  return st;
}
// 旗を立てる：本人が印の内に三秒、近くに武器を持つ敵がいない。
function plant(o) {
  return {
    kind: 'move', max: 60, limit: Infinity, idleAdvance: false, noHardCap: true,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.t = 0;
      rt.obj('dp', o.obj, 'main');
      rt.marker('dp', o.at, o.label, { h: 3 });
      rt.zone('dp', o.at.x, o.at.z, 4);
      for (const [who, text, d] of o.say || []) rt.say(who, text, d || 3.5);
    },
    tick(rt, C, m, ctx, el, dt) {
      const u = rt.player.u, p = u.pos;
      const near = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing && Math.hypot(p.x - o.at.x, p.z - o.at.z) < 4.5;
      let calm = near;
      if (calm) for (const q of rt.army.units) if (q.team !== u.team && q.alive && q.hp > 0 && !q.downed && !q.dying && !q.gone &&
        !q.woundOut && !q.rearWound && !q.fleeing && !q.noTarget && !q.isStruct && !q.civ &&
        (q.pos.x - p.x) ** 2 + (q.pos.z - p.z) ** 2 < 36) { calm = false; break; }
      if (calm) C.t += dt;
      return C.t >= 3;
    },
    end(rt, C) { rt.unmark('dp'); rt.unzone('dp'); rt.objDone('dp'); o.done?.(rt); },
  };
}
// 段に右上の番号とチェックポイントを付ける
function tag(st, k, cp, pin) {
  const start = st.start;
  // 本人の移動・守備を、共通の放置送りや時間切れで飛ばさない。
  if (st.kind === 'move' || st.kind === 'hold') {
    st.idleAdvance = false; st.noHardCap = true; st.limit = Infinity;
    const tick = st.tick;
    st.tick = (rt, C, m, ctx, el, dt) => {
      const u = rt.player.u;
      const ready = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing;
      if (st.kind === 'move') return ready && tick(rt, C, m, ctx, el, dt);
      const before = C.inT;
      const done = tick(rt, C, m, ctx, el, dt);
      // 共通の「半分ほど参加」ではなく、持ち場で守った時間を数える。
      const present = ready && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < C.botRadius;
      C.inT = before + (present ? dt : 0);
      const duration = st.max - 35;
      // 寄せの上限後は残兵を退かせる。本人が守らないまま成功にはしない。
      return present && C.inT >= duration && !C.waves.length && (done ||
        el >= Math.max(duration + 60, 200) && C.nTot > 0 && fighters(C) <= C.nTot * 0.6);
    };
  }
  if (pin) st.pin = pin;
  st.start = (rt, C, m, ctx) => {
    const F = rt.flags;
    F.advK = Math.max(F.advK || 0, k);
    if (cp) { F.advCP = cp; F.step = 10 + cp; }
    start(rt, C, m, ctx);
    if (st.kind !== 'rest') rt.obj('main', ADV_MISSIONS[F.advK], 'main');
  };
  return st;
}

// K：{ monto(n, s2), guns(n), bows(n), desperate(n, s2), events: { … 場面の絵 } }
export function advanceSteps(K) {
  const E = K.events;
  return [
    // ---- 0:00〜2:30 細い堤 ----
    tag(rest({ dur: 4, heal: 0, banner: ['細い堤', '左右は水。大軍も一列でしか進めない'], fn: (rt) => E.column(rt),
      say: [['組頭', '道が狭い。'], ['足軽', '前が止まると、後ろも全部止まる……']] }), 1, 1, P.dikeHead),
    tag(move({ to: P.dikeHead, obj: ADV_MISSIONS[1], label: '堤の口', r: 5, max: 90 }), 1),
    tag(take({ at: P.dikeFront, title: '堤の先に門徒の旗', sub: '槍・弓・鉄砲。ここでは人数が役に立たない', obj: ADV_MISSIONS[1], cap: 150, ratio: 0.65,
      say: [['組頭', '一人ずつしか前へ出られん。槍を揃えて押せ！']],
      foes: () => [
        { name: '堤を塞ぐ門徒', from: { x: -46, z: -50 }, list: K.monto(7, 2), mass: 0, dmg: 0.7 },
        { name: '砦の土塁の弓', from: { x: -54, z: -54 }, list: K.bows(3), mass: 0, dmg: 0.5 },
      ],
      later: [
        { t: 22, say: ['足軽', '横の葦から鉄砲じゃ！　伏せろ！'], foes: () => [{ name: '葦に伏せた鉄砲', from: { x: -40, z: -49 }, list: K.guns(3), mass: 0, dmg: 0.5 }] },
      ],
      reward: '前方の堤を確保した' }), 1),
    // ---- 2:30〜5:00 第一砦（堤の砦）----
    tag(rest({ dur: 4, heal: 0.2, fn: (rt) => E.fortWarn(rt), say: [['使番', '堤の先の砦じゃ！　門を抜けよ！'], ['組頭', '正面だけ見るな。水路の向こうからも来るぞ']] }), 2, 2, P.fort),
    tag(take({ at: P.fort, title: '堤の砦', sub: '柵と土塁と小さな櫓。寺と在所へ続く口', obj: ADV_MISSIONS[2], cap: 170, ratio: 0.7, leader: true,
      foes: () => [
        { name: '砦の門徒', from: { x: -50, z: -62 }, list: K.monto(8, 2, '門徒頭'), mass: 0, dmg: 0.7 },
        { name: '水路の向こうの鉄砲', from: { x: -72, z: -58 }, list: K.guns(3), mass: 0, dmg: 0.45, noRout: 60 },
      ],
      later: [
        { t: 18, say: ['足軽', '小舟じゃ！　水路から上がって来よる！'], foes: () => [{ name: '小舟から上がる門徒', from: { x: -59, z: -66 }, list: K.monto(5, 1), mass: 0, dmg: 0.7 }] },
      ],
      reward: '堤の砦を制圧した', onEnd: (rt) => E.fortTaken(rt) }), 2),
    // ---- 5:00〜7:30 水路の戦い（舟着場）----
    tag(rest({ dur: 5, heal: 0.25, fn: (rt) => E.fleetIn(rt), say: [['使番', '九鬼殿の船が水路へ入る！　舟着場を取れ！'], ['組頭', '舟を全部沈めずともよい。岸を取って旗を立てるのじゃ']] }), 3, 3, P.landing),
    tag(take({ at: P.landing, title: '舟着場', sub: '水面に矢と弾。岸からは槍', obj: ADV_MISSIONS[3], cap: 160, ratio: 0.7,
      foes: () => [
        { name: '舟着場の門徒', from: { x: -52, z: -88 }, list: K.monto(7, 1), mass: 0, dmg: 0.7 },
        { name: '対岸の弓', from: { x: -76, z: -84 }, list: K.bows(4), mass: 0, dmg: 0.45, noRout: 60 },
      ],
      later: [
        { t: 20, say: ['足軽', '舟が横付けしてくる！'], foes: () => [{ name: '横付けした舟の門徒', from: { x: -60, z: -92 }, list: K.monto(5, 1), mass: 0, dmg: 0.7 }] },
      ],
      reward: '舟着場を取った' }), 3),
    tag(plant({ at: P.landing, obj: '舟着場に旗を立てよ', label: '舟着場', say: [['組頭', '旗を立てよ！　水軍に知らせるのじゃ']], done: (rt) => E.flagLanding(rt) }), 3),
    // ---- 7:30〜10:00 寺内の在所 ----
    tag(rest({ dur: 7, heal: 0.3, fn: (rt) => E.village(rt),
      say: [['足軽', '……家じゃ。鍋も、干した着物もある'], ['組頭', '槍を持つ者だけを討て。逃げる者は追うな'], ['足軽', 'ここに住んどる者が、戦うとるんか……']] }), 4, 4, P.village),
    tag(hold({ at: P.village, dur: 75, r: 12, noRefill: true, title: '寺内の在所', sub: '武器を持つ門徒が、家族を奥へ逃がすため防ぐ', label: '在所の入口', obj: ADV_MISSIONS[4],
      waves: [
        { t: 0, foes: () => [{ name: '在所の口を守る門徒', from: { x: -50, z: -110 }, list: K.monto(7, 2), mass: 0, dmg: 0.6 }] },
        { t: 26, say: ['足軽', '後ろを、女子供が走っていく……'], foes: () => [{ name: '寺から出た門徒', from: { x: -44, z: -104 }, list: K.monto(5, 1), mass: 0, dmg: 0.6 }] },
        { t: 48, foes: () => [{ name: '在所の鉄砲', from: { x: -57, z: -110 }, list: K.guns(3), mass: 0, dmg: 0.45 }] },
      ],
      reward: '在所の入口を押さえた' }), 4),
    // ---- 10:00〜12:30 包囲が完成する ----
    tag(rest({ dur: 12, heal: 0.3, fn: (rt) => E.closing(rt) }), 5, 5, P.exit),
    tag(move({ to: P.exit, obj: ADV_MISSIONS[5], label: '最後の脱出路', r: 5, max: 110,
      say: [['組頭', '南の舟入りが最後の出口じゃ。塞げ！']] }), 5),
    tag(rest({ dur: 9, heal: 0, fn: (rt) => E.lastClosed(rt) }), 5, 0, P.exit),
    // ---- 12:30〜14:00 最後の突破（金ヶ崎の殿の裏返し）----
    tag(rest({ dur: 5, heal: 0.4, fn: (rt) => E.desperate(rt), say: [['組頭', '来るぞ……退く所の無い者は、強い。ここを守れ！']] }), 6, 6, P.exit),
    tag(hold({ at: P.exit, dur: 80, r: 12, noRefill: true, limit: 200, title: '最後の突破', sub: '後ろの家族を逃がすため、門徒が突っ込んでくる', label: '最後の脱出路', obj: ADV_MISSIONS[6],
      waves: [
        { t: 0, foes: () => [{ name: '突破する門徒', from: { x: -48, z: -110 }, list: K.desperate(9, 2), mass: 0, dmg: 0.75, noRout: 45, morale: 100 }] },
        { t: 24, say: ['足軽', '旗が倒れても、まだ来る……！'], foes: () => [{ name: '家族を背にした門徒', from: { x: -42, z: -108 }, list: K.desperate(8, 1), mass: 0, dmg: 0.75, noRout: 40, morale: 100 }] },
        { t: 46, say: ['組頭', '……わしらが金ヶ崎でやった事と、同じじゃ'], foes: () => [{ name: '最後に突っ込む門徒', from: { x: -52, z: -110 }, list: K.desperate(7, 2), mass: 0, dmg: 0.75, noRout: 30, morale: 100 }] },
      ],
      reward: '最後の突破を食い止めた', onEnd: (rt) => E.breakFailed(rt) }), 6),
  ];
}
