// ======================================================================
// 山崎の戦い　①の段「大返しの到着」（0〜3分）
//   秀吉の本陣の前から、疲れた池田勢と街道を北へ上り、先陣の高山右近の陣へ合流する。
//   道すがら：秀吉と官兵衛の言葉（本能寺の焼け落ち・毛利との急ぎの和睦）、遅れる疲れた兵、使番「光秀は山崎に布陣」。
//   円明寺川の岸の葦から明智の物見が道へ斬りかかる（最初の接触）。着けば高山右近が迎え、斎藤勢が川を越えて来る。
// 行き先は高山の陣の▼一つ（動かさない）。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { report } from './far.js';

export const JOIN = { x: -30, z: 30 };   // 先陣（高山右近の陣の後ろ）
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

export function start(rt, ctx) {
  const F = rt.flags;
  // 池田勢は疲れた足で街道を上る（主人公の脇を歩く。走らない）
  F.ikeda.order = 'move'; F.ikeda.dest = { x: JOIN.x + 8, z: JOIN.z + 6 }; F.ikeda.speed = 2.4;
  F.ikeda.onArrive = (g) => { g.order = 'hold'; };
  // 遅れて歩く疲れた足軽の小組（大返しの強行軍。槍を杖に）
  F.tired = allyGroup(rt, { name: '大返しの足軽', anchor: { x: ctx.START.x + 10, z: ctx.START.z + 8 }, facing: Math.PI, width: 8, formation: 'column', aggro: 4, seekRange: 8, morale: 70, noRout: true, speed: 1.4 },
    ctx.fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }], ctx.IK));
  F.tired.order = 'move'; F.tired.dest = { x: JOIN.x + 16, z: JOIN.z + 14 };
  const Y = F.yfar || {};
  // 後ろ備えは北へ歩き出す（街道を上る大軍の列）
  try { Y.nobutaka?.moveTo(30, 120, 160); Y.niwa?.moveTo(-74, 128, 170); } catch (e) { /* 動かなくても進む */ }
  rt.after(1, () => rt.say('羽柴秀吉', '備中から駆け通して来たぞ。上様の仇、日向を討つは今ぞ', 3.6));
  rt.after(5, () => rt.say('黒田官兵衛', '毛利とは和を結んで参った。背は案じるに及ばず。前だけを見られよ', 3.6));
  rt.after(10, () => rt.say('池田恒興', '高山殿の陣へ急ぐぞ。足を止めるな', 3));
  rt.after(18, () => rt.say('足軽', '二百里を駆け通しじゃ……足が棒のようじゃ', 3));
  rt.after(26, () => report(rt, '本能寺は焼け落ち、上様のお姿は見つかりませぬ！'));
  rt.after(40, () => report(rt, '明智日向、山崎に布陣！　御坊塚に桔梗の大旗！'));
  rt.after(54, () => rt.say('中川清秀', '天王山を先に取った方が勝ちじゃ。秀長殿の手が登っておる', 3.2));
  // 物見の斬り込み（最初の接触）：主人公が道の半ばまで来たら、川の岸の葦から明智の物見が道へ
  F.mStep = 0;
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos;
  if (F.mStep === 3) {
    // 迎えの後も陣に留まって開戦を待つ。離れた場所や討たれた間は合流を果たした事にしない。
    if (!rt.player.u.alive || rt.retryOpen || !near(P, JOIN, 18)) return;
    F.mJoinWait = (F.mJoinWait || 0) + dt;
    if (F.mJoinWait >= 14.5) ctx.next();
    return;
  }
  if (F.mStep === 0 && (P.z < 92 || rt.t - F.st0 > 50)) {
    F.mStep = 1;
    F.scouts = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: 26, z: 52 }, facing: -2.2, width: 8, formation: 'line', order: 'attack', aggro: 40, seekRange: 60, morale: 70, dmgMult: 0.4 },
      ctx.ak([{ type: 'samurai', n: 2, o: { horse: true } }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
    F.scouts.dest = { x: P.x, z: P.z };
    rt.army.play('toki', { x: 26, z: 52 }, 0.8);
    rt.say('池田恒興', '葦の中に桔梗の旗！　物見じゃ、討ち取れ！', 3);
    F.mScT = rt.t;
  }
  if (F.mStep === 1 && F.scouts) {
    const left = F.scouts.units.filter((u) => u.alive && !u.gone && !u.fleeing).length;
    // 時間だけで健在の物見を撃退した事にしない。
    if (left <= 2) {
      F.mStep = 2;
      for (const u of F.scouts.units) if (u.alive) { F.scouts.routed = true; F.scouts.order = 'flee'; break; }
      rt.award((t) => t.side.push('街道で明智の物見を追い払った'), '明智の物見を追い払った');
      rt.say('池田恒興', 'ようやった。日向は、もう目の前じゃ', 2.8);
      // 川のこちらの岸に出た明智の鉄砲の小組（前衛との二度目の接触。先陣の陣の手前）
      F.skirm = enemyGroup(rt, { name: '明智の鉄砲の小組', faction: 'akechi', anchor: { x: 2, z: 22 }, facing: Math.PI, width: 8, formation: 'line', order: 'hold', aggro: 22, seekRange: 30, morale: 70, dmgMult: 0.35 },
        ctx.ak([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
      rt.after(4, () => rt.say('高山右近', '川のこちらへ鉄砲が出ておる！　陣の前を払うてくれ！', 3));
      // 南の後ろ備えはさらに北へ（後ろが厚くなる）
      try { const Y = F.yfar || {}; Y.hon?.moveTo(-36, 118, 60); } catch (e) { /* 遠くの列 */ }
    }
  }
  // 着いた（物見を払った後、先陣の陣に着き、池田勢も近い）：高山右近が迎え、川向こうから斎藤勢が寄せる
  const ic = F.ikeda?.center?.();
  const skLeft = F.skirm ? F.skirm.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0;
  if (F.mStep === 2 && near(P, JOIN, 18) && skLeft <= 1 && (!ic || near(ic, JOIN, 34) || rt.t - F.st0 > 170)) {
    F.mStep = 3;
    if (F.skirm && skLeft) { F.skirm.routed = true; F.skirm.order = 'flee'; }
    // 着いた：川向こうで明智の備が岸へ出て並ぶ（桔梗の旗の列）。鉄砲が川越しに鳴り、斎藤勢が川へ下りる
    rt.say('高山右近', '池田殿、よう来られた！　見よ、川向こうに桔梗の旗が並ぶ', 3.2);
    rt.army.play('volley', { x: -10, z: -26 }, 1.0);
    try { const Y = F.yfar || {}; Y.akRes?.moveTo?.(-20, -150, 30); } catch (e) { /* 遠景 */ }
    rt.after(4, () => rt.say('池田恒興', '斎藤内蔵助の手じゃ。槍を揃えて待て', 3));
    rt.after(9, () => rt.army.play('volley', { x: 4, z: -24 }, 1.2));
    rt.after(12, () => rt.say('高山右近', '来るぞ……川へ下りた！', 2.6));
    F.mJoinWait = 0;
  }
}

// bot：近くの物見を討ち、いなければ先陣の陣へ
export function botTarget(F) { return F.mStep === 1 && F.scouts ? null : JOIN; }
export function foes(F) { return [F.scouts, F.skirm].filter(Boolean); }
