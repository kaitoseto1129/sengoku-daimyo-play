// ======================================================================
// 三木城・大村の合戦 大村坂の後：城の二度目の出撃（約8分〜11分半）
// 構成：docs/oda15_plan_1108.md の 26（9〜12 三木城側出撃・包囲陣を守る）。
// 大村坂を取った後、城の門が開き、別所の手が手薄の平田の付城へ打って出る。
// 流れ：使番の急報 → 大村から平田へ駆け戻る（移る間：俵を担ぐ味方・秀吉の馬廻が追い越す）
//   → 木戸で一の寄せ（十四人）→ 城から鉄砲・二の寄せ（十六人）→ 退けたら段の終わり。
// 寄せ手は少数の本物の兵（本物の兵の総数が二百十人を超える時は人数を減らす）。敵の体力は変えない。
// ======================================================================
import { sfx } from '../audio.js';
import { enemyGroup } from '../bhelp.js';
import { dress } from '../b_inabayama.js';

export const DESHIRO_LEN = 300;   // 長引いた時に木戸の守備を知らせる秒

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.step >= 3) return;
  F.step = 3; F.stepT = rt.t;
  const S = (F.mkSally = { t0: rt.t, waves: [], w1: false, w2: false, arrived: false, done: false, said: {} });
  rt.setPhase('sally2'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.unmark('omura'); rt.unzone('omura');
  rt.obj('main', '平田の付城へ戻り、木戸を守れ', 'main');
  sfx('horagai', 0.7);
  rt.army.playFar('taiko', ctx.castle, 0.8);
  rt.say('使番', '三木の城の門が開いた！　別所の手が、手薄の平田へ打って出たぞ！', 4.5);
  rt.after(5, () => { if (F.mkSally === S && !S.done) rt.say('羽柴秀吉', '大村は取った。者ども、平田へ駆け戻れ！　付城を一つも破らせるな', 4.5); });
  ctx.rally(rt);
}

function wave(rt, ctx, n, bows) {
  const F = rt.flags;
  let real = 0; for (const u of rt.army.units) if (u.alive) real++;
  const room = Math.max(6, Math.min(n, 220 - real));
  const list = [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: Math.max(2, room - 2 - bows) }];
  if (bows) list.push({ type: 'bow', n: bows });
  const at = ctx.sallyFrom;
  const g = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '城から出た別所勢', anchor: { x: at.x, z: at.z }, facing: -Math.PI / 2,
    formation: 'column', colW: 3, spacing: 1.1, roadColumn: true, arriveCount: 2, arriveRadius: 4, aggro: 12, fleeDir: { x: 1, z: 0.4 } },
  dress(list, ctx.bessho));
  g.order = 'path'; g.path = [[at.x, at.z], ...ctx.sallyPath.map((p) => p.slice())]; g.pathIdx = 0; g.march = false;
  g.speed = Math.max(g.speed || 0, 3.2);
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.march = false; q.onArrive = null; q.seekRange = Math.max(q.seekRange || 0, 40); q.focus = rt.player.u.alive ? rt.player.u : null; };
  F.mkSally.waves.push(g);
  return g;
}

// 毎コマ（半秒ごと）。段が終わったら true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.mkSally;
  if (!S || S.done) return false;
  const t = rt.t - S.t0, p = rt.player.u.pos, G = ctx.gate;
  const once = (k, fn) => { if (!S.said[k]) { S.said[k] = true; fn(); } };
  // 駆け戻る間の出来事
  if (t >= 18) once('tawara', () => rt.say('足軽', '荷駄の俵じゃ！　陣へ運べ、城へは一俵もやらぬ', 3));
  if (t >= 34) once('uma', () => { rt.army.playFar('hooves', p, 0.8); rt.say('使番', '秀吉様の馬廻が先に駆ける。平田の木戸で並べ！', 3.5); });
  if (!S.arrived && Math.hypot(p.x - G.x, p.z - G.z) < 18) { S.arrived = true; rt.say('組頭', 'よう戻った！　浅瀬を渡って来るぞ、木戸の前で槍をそろえよ', 4); }
  // 一の寄せ：着いたら、遅くとも七十秒で
  if (!S.w1 && (S.arrived && t >= 40 || t >= 70)) {
    S.w1 = true; S.w1T = rt.t;
    wave(rt, ctx, 14, 0);
    rt.army.playFar('toki', ctx.sallyFrom, 0.9);
    rt.say('物見', '城兵が浅瀬を渡る！　十余人、木戸を目がけて来るぞ！', 3.5);
    rt.obj('main', '平田の木戸で、城から出た別所勢を退けよ', 'main');
  }
  // 二の寄せ：一の寄せが崩れるか、七十秒たったら。城の鉄砲が先に鳴る
  if (S.w1 && !S.w2 && (S.waves.every(ctx.gone) && rt.t - S.w1T >= 25 || rt.t - S.w1T >= 70)) {
    S.w2 = true; S.w2T = rt.t;
    rt.army.playFar('volley', ctx.castle, 1);
    rt.after(1.5, () => rt.army.playFar('volley', ctx.castle, 0.8));
    wave(rt, ctx, 16, 2);
    rt.say('組頭', '城から鉄砲じゃ！　二の手が来る。列を崩すな！', 3.5);
  }
  // 三の寄せ：二の手が崩れるか七十秒たったら、火矢で付城の小屋を焼き、その煙に紛れて最後の手が来る（11/9 二巡：段を一つ厚く）
  if (S.w2 && !S.w3 && (S.waves.every(ctx.gone) && rt.t - S.w2T >= 20 || rt.t - S.w2T >= 70)) {
    S.w3 = true; S.w3T = rt.t;
    const G = ctx.gate, fx = G.x + 6, fz = G.z - 10;
    S.fire = rt.world.addFire?.(fx, fz, { h: 1.5, size: 2.2 });
    rt.army.play('arrow', { x: fx, z: fz }, 1);
    rt.say('足軽', '火矢じゃ！　付城の小屋が燃える！', 3);
    rt.after(4, () => { if (F.mkSally === S && !S.done) { wave(rt, ctx, 12, 2); rt.army.playFar('toki', ctx.sallyFrom, 0.9); rt.say('組頭', '煙に紛れて三の手じゃ！　木戸を渡すな！', 3.5); } });
    rt.after(60, () => { if (S.fire) { rt.world.removeFire?.(S.fire); S.fire = null; } });
  }
  // 主力を退けた後、浅瀬や柵に残った数人を探し続けさせない。
  // 本人の帰着と三の手の実際の出撃を待ち、残兵には城へ退く下知を出す。
  if (S.arrived && S.w3 && S.waves.length >= 3 && rt.t - S.w3T >= 70 && !S.retreatOrdered) {
    let remaining = 0;
    for (const g of S.waves) for (const u of g.units) {
      if (u.alive && u.hp > 0 && !u.gone && !u.dying && !u.fleeing && !u.woundOut && !u.evacuatedWound && !u.noTarget) remaining++;
    }
    if (remaining <= 4) {
      S.retreatOrdered = true;
      for (const g of S.waves) if (!ctx.gone(g)) ctx.flee(g);
      rt.say('物見', '城兵の主力を退けた！　残る手も三木城へ退いてゆくぞ！', 4);
    }
  }
  if (S.arrived && S.w3 && S.waves.length >= 3 && S.waves.every(ctx.gone) && rt.t - S.w3T >= 20) {
    once('won', () => rt.award((t2) => { if (!t2.side.includes('城の出撃から平田の付城を守った')) t2.side.push('城の出撃から平田の付城を守った'); }, '付城を守った'));
    S.done = true; return true;
  }
  if (t >= DESHIRO_LEN) {
    // 時間だけで敵を退かせて達成にしない。木戸への帰着と三度の寄せの決着を待つ。
    once('long', () => rt.say('組頭', '平田の木戸を守れ！　城兵を退けるまで持ち場を離れるな！', 4));
  }
  return false;
}

export function pin(rt, ctx) {
  const S = rt.flags.mkSally;
  return S && !S.done ? ctx.gate : null;
}
