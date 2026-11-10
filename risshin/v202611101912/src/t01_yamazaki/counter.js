// ======================================================================
// 山崎の戦い　④の段「光秀本隊の反撃」（戦況の転換。8〜10分）
//   斎藤の隊を崩した直後、御坊塚から桔梗の大旗が前へ出る（「光秀本隊、前進！」）。
//   溝尾茂朝・伊勢の残りの旗本の先手が中央へ突きかかり、川の南の岸まで押し返す。大返しが成ったから楽に勝つ、にしない（11/10 指示書）。
//   前の中川・高山も押されて下がる（遠くの天王山の取り合いも明智が押す）。主人公は自分の備を入れて、崩れた中央を立て直す。
//   食い止める時は限りがある（敵の体力で伸ばさない）：九十秒持ちこたえるか、先手を崩せば、斎藤の横を突く段へ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { nobori } from '../props.js';
import { report } from './far.js';

export const STAND = { x: -12, z: 6 };    // 中央の南の岸（押し返された味方を立て直す所。11/10）
const HOLD_SEC = 110;

export function start(rt, ctx) {
  const F = rt.flags;
  F.cntHoldT = 0;
  rt.army.play('horagai', { x: 18, z: -120 }, 1.2);
  report(rt, '光秀本隊、前進！　桔梗の大旗が御坊塚を下りまする！');
  // 桔梗の大旗（光秀の馬印が前へ出る。目で分かる反撃）
  try { F.bigFlag = nobori(rt.world, 30, -96, 'akechi', 8); rt.scene.add(F.bigFlag); F.bigFlagZ = -96; } catch (e) { F.bigFlag = null; }
  F.counter = enemyGroup(rt, { name: '溝尾茂朝の旗本', faction: 'akechi', anchor: { x: 36, z: -92 }, facing: 0.5, width: 14, formation: 'line', order: 'move', aggro: 30, seekRange: 44, morale: 92, dmgMult: 0.55, speed: 3.6 },
    ctx.ak(ctx.knot(24, [{ type: 'busho', n: 1, o: { name: '溝尾茂朝', horse: true } }])));
  F.counter.dest = { x: STAND.x - 4, z: STAND.z - 2 };
  F.counter.onArrive = (g) => { g.order = 'attack'; };
  F.cntGs = [F.counter];
  F.cntN = ctx.allN(F.cntGs);
  // 前の味方は押されて少し下がる（押し返される場面）
  for (const [g, d] of [[F.taka, { x: -40, z: 30 }], [F.naka, { x: -72, z: 32 }], [F.hori, { x: -20, z: 34 }]]) {
    if (!ctx.live(g)) continue;
    g.order = 'move'; g.dest = d; g.onArrive = (q) => { q.order = 'hold'; };
  }
  try { F.yfar?.tenno?.push('B', 0.4); } catch (e) { /* 遠くの合戦 */ }
  // 池田勢は北の岸で踏みとどまる
  if (ctx.live(F.ikeda)) { F.ikeda.order = 'move'; F.ikeda.dest = { x: STAND.x + 2, z: STAND.z + 4 }; F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 20; g.seekRange = 26; }; }
  rt.after(2, () => rt.say('堀秀政', '日向の旗本が来るぞ！　中が割れる、踏みとどまれ！', 3.6));
  rt.after(10, () => rt.say('高山右近', '押される……下がれ、下がって槍を揃えよ！', 3));
  rt.after(24, () => {
    // 先の戦いで松田勢が退いた後に、時刻だけで盛り返したと知らせない。
    const g = F.matsuda;
    if (g && !g.routed && ctx.aliveN(g) > ctx.allN(g) * 0.3) report(rt, '天王山の手、松田勢がなお踏みとどまっておりまする！');
  });
  rt.after(46, () => rt.say('溝尾茂朝', '筑前の寄せ集めなど、ひと押しで川へ落とせ！', 3));
  rt.after(40, () => report(rt, '池田様・堀様の手、前へ出まする！　中を支えよとの仰せ！'));
  rt.after(62, () => report(rt, '神戸信孝様・丹羽様の備え、後ろに着到！'));
  rt.after(64, () => { try { F.yfar?.nobutaka?.moveTo(20, 70, 50); F.yfar?.tenno?.push('B', 0); F.yfar?.tenno?.push('A', 0.35); } catch (e) { /* 遠景 */ } });
}

export function tick(rt, dt, ctx) {
  const F = rt.flags;
  // 一度岸へ寄っただけで、離れた所や討たれた間の時間まで守った事にしない。
  const holding = rt.player.u.alive && !rt.retryOpen && Math.hypot(rt.player.u.pos.x - STAND.x, rt.player.u.pos.z - STAND.z) < 30;
  if (holding) F.cntHoldT = (F.cntHoldT || 0) + dt;
  // 大旗はゆっくり南へ（近づく）
  if (F.bigFlag && F.bigFlagZ < -70) { F.bigFlagZ += dt * 0.25; F.bigFlag.position.z = F.bigFlagZ; F.bigFlag.position.y = rt.world.heightAt(30, F.bigFlagZ); }
  const el = rt.t - F.st0, left = ctx.aliveN(F.cntGs);
  // 先手を早く崩しても、旗本の二陣が続いて寄せる（食い止める時は寄せの波で作る。体力で伸ばさない）
  if (!F.cnt2 && (el > 55 || (el > 25 && left <= F.cntN * 0.3))) {
    F.cnt2 = true;
    const g = enemyGroup(rt, { name: '明智の旗本の二陣', faction: 'akechi', anchor: { x: 30, z: -84 }, facing: 0.5, width: 12, formation: 'line', order: 'move', aggro: 30, seekRange: 44, morale: 90, dmgMult: 0.5, speed: 3.8 },
      ctx.ak(ctx.knot(18)));
    g.dest = { x: STAND.x - 6, z: STAND.z - 4 }; g.onArrive = (q) => { q.order = 'attack'; };
    F.cntGs.push(g); F.cntN = ctx.allN(F.cntGs);
    rt.army.play('toki', { x: 30, z: -84 }, 1.1);
    rt.say('堀秀政', '二陣が来る！　まだ退くな！', 2.6);
  }
  if (holding && F.fieldAt === F.stage && F.cnt2 && ((F.cntHoldT > HOLD_SEC) || (el > 80 && ctx.aliveN(F.cntGs) <= F.cntN * 0.3))) {
    for (const g of F.cntGs) if (ctx.live(g)) { g.routed = true; g.order = 'flee'; }
    rt.say('堀秀政', '旗本の先手が退いたぞ！　中は持った。押し返せ！', 3.2);
    ctx.next();
  }
}
