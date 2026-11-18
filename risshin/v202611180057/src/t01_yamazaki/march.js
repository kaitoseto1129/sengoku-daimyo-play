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

// 終えた段や再開前の場面の声・下知を、今の戦況へ持ち越さない。
function after(rt, sec, fn) {
  const F = rt.flags, group = F.tired;
  rt.after(sec, () => {
    if (rt.flags !== F || F.tired !== group || F.stage !== 1 || rt.over || rt.retryOpen || !rt.player.u.alive) return;
    fn();
  });
}

export function start(rt, ctx) {
  const F = rt.flags;
  // 池田勢は疲れた足で街道を上る（主人公の脇を歩く。走らない）
  F.ikeda.order = 'move'; F.ikeda.dest = { x: JOIN.x + 8, z: JOIN.z + 6 }; F.ikeda.speed = 2.4;
  F.ikeda.onArrive = (g) => { g.order = 'hold'; };
  // 遅れて歩く疲れた足軽の小組（大返しの強行軍。槍を杖に）
  F.tired = allyGroup(rt, { name: '大返しの足軽', anchor: { x: ctx.MARCH0.x + 6, z: ctx.MARCH0.z - 26 }, facing: Math.PI, width: 8, formation: 'column', aggro: 4, seekRange: 8, morale: 70, noRout: true, speed: 1.4 },
    ctx.fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }], ctx.IK));
  F.tired.order = 'move'; F.tired.dest = { x: JOIN.x + 16, z: JOIN.z + 14 };
  F.tired.onArrive = (g) => { g.order = 'hold'; };   // 11/18 K365：着いた後も「移る」のまま立ち、act bot の止まり（25回）に出ていた
  const Y = F.yfar || {};
  // 後ろ備えは北へ歩き出す（街道を上る大軍の列）
  try { Y.nobutaka?.moveTo(30, 120, 160); Y.niwa?.moveTo(-74, 128, 170); } catch (e) { /* 動かなくても進む */ }
  // 山崎の手前（大返しの終わり）：諸将の旗が増え、走っていた軍が戦うための軍勢になる（11/10 指示書）
  after(rt, 1, () => rt.say('足軽', '……本当に、戻ってきたんじゃな', 3));
  after(rt, 4.5, () => report(rt, '中川清秀様・高山右近様・池田恒興様、ご着到！'));
  after(rt, 9, () => rt.say('羽柴秀吉', '上様の仇、日向を討つは今ぞ。槍を立てよ、火縄を確かめよ！', 3.6));
  after(rt, 14, () => report(rt, '丹羽様・信孝様の備えも、街道を上って参られまする！'));
  after(rt, 19, () => rt.say('堀秀政', '高山殿の陣へ急ぐぞ。ここからは戦じゃ', 3));
  after(rt, 26, () => rt.say('黒田官兵衛', '明智の旗、本能寺で見た旗じゃ。今度はこちらが攻める番', 3.4));
  after(rt, 40, () => report(rt, '明智日向、山崎に布陣！　御坊塚に桔梗の大旗！'));
  after(rt, 54, () => rt.say('中川清秀', '天王山を先に取った方が勝ちじゃ。秀長殿の手が登っておる', 3.2));
  // 物見の斬り込み（最初の接触）：主人公が道の半ばまで来たら、川の岸の葦から明智の物見が道へ
  F.mStep = 0;
  F.mSkHoldT = 0;
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos;
  // 池田勢は本人の脇を行く（騎馬の本人が先へ出て、徒歩2.4の池田勢が六十歩あまり後ろに残り、②までの野原に本人ひとりに見えていた。11/18 クラウド k365-cloud-38 一枚表③）
  if (F.mStep < 3 && F.ikeda && rt.player.u.alive && (F._ikFollowT = (F._ikFollowT || 0) - dt) <= 0) {
    F._ikFollowT = 2;
    const ic = F.ikeda.center?.();
    // 11/18 夜50-18：b_t01_yamazaki.js の後追い（本人の前 (3,-6)）と行き先を取り合い、二秒ごとに下知を置き直して隊が止まった（act bot 我が備の止まり19回）。行き先が本人の近くなら置き直さない
    if (ic && !near(ic, P, 26) && !(F.ikeda.order === 'move' && F.ikeda.dest && near(F.ikeda.dest, P, 12))) { F.ikeda.order = 'move'; F.ikeda.speed = 3.6; F.ikeda.dest = { x: P.x - 8, z: P.z + 8 }; F.ikeda.onArrive = (g) => { g.order = 'hold'; }; }
  }
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
      ctx.ak([{ type: 'samurai', n: 2, o: { horse: true } }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }, { type: 'gun', n: 3 }]));
    F.scouts.dest = { x: P.x, z: P.z };
    // 11/18 夜50-18 K281：段1の始め（200秒）に本人の30〜60m の敵の本物が0人（物見は67m 先の14人だけ）。
    //   葦に伏せた明智の足軽の組が物見と一緒に街道の脇へ出る（先手の物見・伏せ勢との小競り合いが山崎の口開け）
    F.ambush = enemyGroup(rt, { name: '明智の伏せ足軽', faction: 'akechi', anchor: { x: P.x + 34, z: P.z - 30 }, facing: -2.2, width: 14, formation: 'line', order: 'hold', aggro: 14, seekRange: 22, morale: 60, dmgMult: 0.35 },
      ctx.ak([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 6 }]));
    //   葦の際に列を並べて鉄砲を撃ちかけ、寄った者へだけ槍を入れる（本人の四十歩あまり先に桔梗の旗の列が見える）
    // 羽柴の先手の一組も街道の脇から物見へ当たる（野が騎馬二騎だけにならない。本物の兵の塊同士・k365-cloud-07 の照らし）
    F.vanHelp = allyGroup(rt, { name: '羽柴の先手', anchor: { x: JOIN.x + 34, z: JOIN.z + 34 }, facing: Math.PI, width: 10, formation: 'line', aggro: 30, seekRange: 50, morale: 90, noRout: true, speed: 3.6, dmgMult: 0.45 },
      ctx.fl([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }], ctx.HA));
    F.vanHelp.order = 'move'; F.vanHelp.dest = { x: 26, z: 52 }; F.vanHelp.onArrive = (g) => { g.order = 'attack'; };
    rt.army.play('toki', { x: 26, z: 52 }, 0.8);
    rt.say('堀秀政', '葦の中に桔梗の旗！　物見じゃ、討ち取れ！', 3);
    F.mScT = rt.t;
  }
  if (F.mStep === 1 && F.scouts) {
    const left = ctx.aliveN(F.scouts);
    // 時間だけで健在の物見を撃退した事にしない。
    if (left <= 2) {
      F.mStep = 2;
      for (const u of F.scouts.units) if (u.alive) { F.scouts.routed = true; F.scouts.order = 'flee'; break; }
      if (F.ambush && ctx.aliveN(F.ambush)) { F.ambush.routed = true; F.ambush.order = 'flee'; }
      rt.award((t) => t.side.push('街道で明智の物見を追い払った'), '明智の物見を追い払った');
      rt.say('堀秀政', 'ようやった。日向は、もう目の前じゃ', 2.8);
      // 川のこちらの岸に出た明智の鉄砲の小組（前衛との二度目の接触。先陣の陣の手前）
      F.skirm = enemyGroup(rt, { name: '明智の鉄砲の小組', faction: 'akechi', anchor: { x: 2, z: 22 }, facing: Math.PI, width: 8, formation: 'line', order: 'hold', aggro: 22, seekRange: 30, morale: 70, dmgMult: 0.35 },
        ctx.ak([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
      after(rt, 4, () => rt.say('高山右近', '川のこちらへ鉄砲が出ておる！　陣の前を払うてくれ！', 3));
      // 南の後ろ備えはさらに北へ（後ろが厚くなる）
      try { const Y = F.yfar || {}; Y.hon?.moveTo(-36, 118, 60); } catch (e) { /* 遠くの列 */ }
    }
  }
  // 着いた（物見を払った後、先陣の陣に着き、池田勢も近い）：高山右近が迎え、川向こうから斎藤勢が寄せる
  const ic = F.ikeda?.center?.();
  const skLeft = ctx.aliveN(F.skirm);
  // 六割以上を破り、先陣を一分押さえたら離れた残兵も退く。
  // 陣の外や討死中の時刻だけで進めず、鉄砲の一人を探し続けさせない。
  const holding = F.mStep === 2 && rt.player.u.alive && !rt.retryOpen && near(P, JOIN, 18);
  if (holding && skLeft <= ctx.allN(F.skirm) * 0.4) F.mSkHoldT += dt;
  else F.mSkHoldT = 0;
  if (holding && (skLeft <= 1 || F.mSkHoldT >= 60) && (!ic || near(ic, JOIN, 34) || rt.t - F.st0 > 170)) {
    F.mStep = 3;
    if (F.skirm && skLeft) { F.skirm.routed = true; F.skirm.order = 'flee'; }
    // 着いた：川向こうで明智の備が岸へ出て並ぶ（桔梗の旗の列）。鉄砲が川越しに鳴り、斎藤勢が川へ下りる
    rt.say('高山右近', 'よう来られた！　見よ、川向こうに桔梗の旗が並ぶ', 3.2);
    rt.army.play('volley', { x: -10, z: -26 }, 1.0);
    try { const Y = F.yfar || {}; Y.akRes?.moveTo?.(-20, -150, 30); } catch (e) { /* 遠景 */ }
    after(rt, 4, () => rt.say('堀秀政', '斎藤内蔵助の手じゃ。槍を揃えて待て', 3));
    after(rt, 9, () => rt.army.play('volley', { x: 4, z: -24 }, 1.2));
    after(rt, 12, () => rt.say('高山右近', '来るぞ……川へ下りた！', 2.6));
    F.mJoinWait = 0;
  }
}

// bot：近くの物見を討ち、いなければ先陣の陣へ
export function botTarget(F) { return F.mStep === 1 && F.scouts ? null : JOIN; }
export function foes(F) { return [F.scouts, F.mStep === 1 && F.ambush, F.skirm].filter(Boolean); }
