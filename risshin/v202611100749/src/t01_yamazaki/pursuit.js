// ======================================================================
// 山崎の戦い　⑦の段「追撃と光秀の敗走」（13〜15分）と戦の後の余韻
//   御牧の殿が破れると日が暮れかかる。光秀は少ない近習と勝竜寺城へ退く（討たせない）。
//   主人公は池田勢と、道に残る明智の後ろの兵を払いながら勝竜寺城の門の前まで追う。
//   着くと門が閉じ、城の奥から松明の小勢が北へ抜けていく（夜のうちに坂本へ）。
//   見出し「明智光秀、山崎より敗走」→ 使番の後の知らせ（小栗栖）→ 秀吉「上様の仇は討った」→「柴田勝家、北国にあり」。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { report } from './far.js';

export const GATE = { x: 62, z: -164 };   // 勝竜寺城の門の前（堀の手前）
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

export function retreatToCastle(rt) {
  const F = rt.flags, g = F.mitsuG;
  if (!g || F.mitsuRetreat) return;
  F.mitsuRetreat = true;
  // 本陣から城内へ直進すると西の板塀に当たる。門の南で揃えてから土橋と門を通す。
  // 旗本は討てない兵なので、通常の到着判定では全員が除かれてしまう。
  g.fixed = false; g.arriveNoncombat = true; g.order = 'retreat'; g.speed = 3;
  g.dest = { x: 64, z: -168 };
  g.onArrive = (q) => { q.order = 'retreat'; q.dest = { x: 64, z: -200 }; };
}

export function start(rt, ctx) {
  const F = rt.flags;
  try { const W = rt.world; W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 24; } catch (e) { /* 空はそのまま */ }
  if (rt.world.setRainTarget) rt.world.setRainTarget(0.12);
  // 光秀と近習は勝竜寺城へ（もう退き始めている）
  retreatToCastle(rt);
  // 道に残る明智の後ろの兵（追う道の途中）
  F.rear = enemyGroup(rt, { name: '明智の後ろの兵', faction: 'akechi', anchor: { x: 40, z: -132 }, facing: 0.6, width: 10, formation: 'line', order: 'hold', aggro: 18, seekRange: 26, morale: 80, dmgMult: 0.45 },
    ctx.ak([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
  // 門へ近づいた瞬間に兵を作らず、追撃が始まる時から門前で待たせる。
  F.gateG = enemyGroup(rt, { name: '勝竜寺城の守り', faction: 'akechi', anchor: { x: 64, z: -178 }, facing: 0, width: 8, formation: 'line', order: 'hold', aggro: 8, seekRange: 12, morale: 85, dmgMult: 0.45 },
    ctx.ak([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
  F.gateG.stay = true;
  F.rearGs = [F.rear, F.gateG];
  try { const Y = F.yfar || {}; Y.akRes?.rout?.({ hideAfter: 30 }); Y.tenno?.rout?.('B', { minFight: 2, hideAfter: 30 }); } catch (e) { /* 遠景 */ }
  // 二巡 11/9：御坊塚の陣幕（18, −158）の手前を避ける（池田・堀が陣幕に突っかかって二十秒止まった）
  for (const [g, d] of [[F.ikeda, { x: 52, z: -128 }], [F.kato, { x: 70, z: -146 }], [F.hori, { x: 34, z: -130 }]]) {
    if (!ctx.live(g)) continue;
    g.order = 'move'; g.dest = d; g.speed = 3.6; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 24; q.seekRange = 30; };
  }
  rt.after(1, () => report(rt, '敵右翼崩れました！　天王山の手も松田勢が退きまする！'));
  rt.after(5, () => rt.say('堀秀政', '明智勢、勝竜寺へ退く！　追え、追え！', 3));
  rt.after(16, () => rt.say('足軽', '日が暮れる……桔梗の旗が城へ入っていくぞ', 3));
  rt.after(30, () => report(rt, '津田・斎藤の兵、淀川を渡って散りまする！'));
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  if (F.pStep) {
    // 倒れている間は呼ばれない更新で余韻を進め、やり直しの札の裏で勝たせない。
    F.finaleT = (F.finaleT || 0) + dt;
    finaleTick(rt, ctx);
    return;
  }
  // 門の前に着くと、城の中から守りの兵が打って出る（光秀が抜ける時を稼ぐ）。払えば門が閉じる
  if (!F.sortie && (near(P, GATE, 18) && el > 20)) {
    F.sortie = rt.t;
    F.gateG.stay = false;
    F.gateG.order = 'attack'; F.gateG.aggro = 26; F.gateG.seekRange = 34;
    rt.army.play('toki', { x: 64, z: -176 }, 1.0);
    rt.say('明智の侍', '殿が落ちられるまで、門は渡さぬ！', 2.8);
  }
  // 道の途中に残った健在の兵で門前の務めが止まらないよう、守りに合流させる。
  // 時間だけでは退かせず、門前で実際に戦ってから締める。
  if (F.sortie && el > 100 && near(P, GATE, 18) && (F.rearGatherT = (F.rearGatherT || 0) - dt) <= 0) {
    F.rearGatherT = 3;
    for (const g of F.rearGs) {
      if (!ctx.live(g) || g.routed) continue;
      const c = g.center();
      if (!c || near(c, GATE, 24)) continue;
      g.stay = false; g.order = 'move'; g.dest = { x: GATE.x, z: GATE.z };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 26; q.seekRange = 34; };
    }
  }
  // 主力の八割を破れば残兵は退く。遠い三人を探し続けて門前の務めが止まらないようにする。
  if (F.sortie && near(P, GATE, 18) && ctx.aliveN(F.rearGs) <= Math.max(2, ctx.allN(F.rearGs) * 0.2)) {
    F.pStep = 1;
    finale(rt, ctx);
  }
}

// 門が閉じ、光秀は夜のうちに抜けていく。戦の後の知らせと余韻
function finale(rt, ctx) {
  const F = rt.flags;
  for (const g of [F.rear, F.gateG]) if (ctx.live(g)) { g.routed = true; g.order = 'flee'; }
  rt.army.play('toki', { x: 62, z: -150 }, 1.4);
  rt.say('堀秀政', '門を閉ざしたか。囲め！　城は小さい、今宵のうちに落ちるわ', 3.4);
  // 光秀は近習と北の裏から抜ける（討たせない。見えるのは松明の小勢だけ）
  F.finaleT = 0;
  F.finaleIndex = 0;
}

const FINALE_AT = [3, 7, 12.5, 17, 21.5, 25.5, 30];
function finaleTick(rt, ctx) {
  const F = rt.flags;
  // 経過と番号だけを戻せる形で持ち、毎コマ関数や配列を作らない。
  while (F.finaleIndex < FINALE_AT.length && F.finaleT >= FINALE_AT[F.finaleIndex]) {
    switch (F.finaleIndex++) {
      case 0:
        // 城へ入る時の到着処理を外す。移動限界（210）の内で北へ抜け、城内へ引き返させない。
        if (F.mitsuG) { F.mitsuG.onArrive = null; F.mitsuG.order = 'retreat'; F.mitsuG.dest = { x: 80, z: -208 }; F.mitsuG.speed = 3.2; }
        rt.banner('明智光秀、山崎より敗走', '');
        break;
      case 1: rt.say('黒田官兵衛', '日向は夜のうちに城を抜け、坂本へ落ちましょう。道々の郷人が黙ってはおりますまい', 4.4); break;
      // 秀吉の本陣へ勝報→勝鬨。秀吉は本能寺の方（北東の京）を一度見る。すぐ天下人の顔はしない（11/10 指示書）
      case 2: report(rt, '秀吉様の本陣へ勝報！　明智勢、勝竜寺へ逃げ込みました！', 3.8); rt.army.play('toki', { x: -34, z: 100 }, 1.6); break;
      case 3: rt.say('羽柴秀吉', '……上様。日向は退けましたぞ', 3.6); break;
      case 4: report(rt, '柴田勝家様、北国にあり。清須へ向かわれるとの由', 3.6); break;
      case 5: rt.say('羽柴秀吉', 'まだ山崎に勝っただけじゃ。気を緩めるな', 3.6); break;
      case 6: ctx.done(); break;
    }
  }
}

export function botTarget(rt) {
  const F = rt.flags;
  return F.pStep ? null : GATE;
}
