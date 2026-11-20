// 追い討ちの得と危うさ（kaito 11/11 要件定義書 16・18。全戦共通。battle.js が毎コマ呼ぶ）。字も札も足さない。
//   得：背を向けた敵を討てば「追い討ち」の手柄（一人3・五人まで）。逃げる旗持ちを討てば敵旗奪取。
//   危うさ：味方から離れて逃げる敵を追い続けると、
//     ① 恐れが上がる（息・耳鳴り・視野は player.dread が出す）
//     ② 得物を持ったまま一人で逃げていた敵が振り返って斬りかかる（窮鼠。崩れた備の者は戻さない＝筋書きの「崩した」を守る）
//     ③ 追えの下知が無いのに深追いすると「勝手な追撃」（一度の深追いに一回・一つの戦に二回まで）。上役が叱る
//   追えの下知：flags.pursuit・chaseOrdered・tsuigeki、勝ちが決まった後、大将（G.lord）の時は叱られない。
const TICK = 0.5, LOOK = 30, ALLY = 40;

export function pursuitTick(rt, dt) {
  const S = rt._pur || (rt._pur = { t: 0, chase: 0, counted: false, n: 0, turnT: -99, kills: 0, said: -99 });
  if ((S.t -= dt) > 0) return;
  S.t = TICK;
  const P = rt.player?.u;
  if (!P || !P.alive || rt.over || rt.def.dojo || rt.def.town || !rt.army) { S.chase = 0; return; }
  let run = 0, fight = 0, ally = 0;
  const now = rt.army.time ?? rt.t;
  rt.army.forNear(P.pos.x, P.pos.z, ALLY, (o) => {
    if (!o.alive || o === P || o.gone || o.civ || o.isStruct || o.noTarget) return;
    const dx = o.pos.x - P.pos.x, dz = o.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
    if (Math.abs(o.pos.y - P.pos.y) > 4) return;
    if (o.team === P.team) { if (!o.isSub && !o.fleeing && d2 < ALLY * ALLY) ally++; return; }
    if (d2 > LOOK * LOOK) return;
    if (o.fleeing || o.group?.routed) run++; else if (!o.surrender) fight++;
  });
  const chasing = run >= 2 && run > fight * 2 && ally < 2;
  S.chase = chasing ? S.chase + TICK : Math.max(0, S.chase - 2 * TICK);
  if (S.chase === 0) S.counted = false;
  if (S.chase < 6) return;
  // ① 離れて追うほど恐れる
  rt.player.dread = Math.min(1, (rt.player.dread || 0) + 0.035);
  // ② 窮鼠：得物を持って一人で逃げていた者が二人まで振り返る（三十秒に一度）
  if (S.chase >= 9 && rt.t - S.turnT > 30) {
    let k = 0;
    rt.army.forNear(P.pos.x, P.pos.z, 14, (o) => {
      if (k >= 2 || !o.alive || o.team === P.team || !o.fleeing || o.group?.routed || o.name || o.isTaisho || o.mounted && !o.wpn) return;
      if (!o.wpn || !o.wpn.parent || o.dropped || o.downed || o.woundOut || Math.abs(o.pos.y - P.pos.y) > 2) return;
      o.fleeing = false; o.moraleFleeDir = null; o.squadRallyTo = null; o.fright = 0; o.backUntil = 0;
      o.turnBack = now + 12; o.target = P; o.atk = null; o.aiT = 0; o.cheer = 1;
      k++;
    });
    if (k) { S.turnT = rt.t; rt.army.play?.('eshout', P.pos, 0.7); }
  }
  // ③ 下知なき深追い
  const F = rt.flags || {};
  const ordered = F.pursuit || F.chaseOrdered || F.tsuigeki || F.ending || rt.G?.lord || rt.tracker?.main === true;
  if (!ordered && !S.counted && S.chase >= 10 && S.n < 2 && !(rt.violPend && rt.t - rt.violPend.t < 20)) {
    S.counted = true; S.n++;
    rt.award((t) => { t.pursuits++; }, '勝手な追撃');
    if (rt.t - S.said > 20) {
      S.said = rt.t;
      const boss = rt.flags?.bossName || '組頭';
      rt.say?.(boss, `${rt.G?.name || ''}、深追いするな！　旗へ戻れ`.replace(/^、/, ''), 3);
    }
  }
}

// 自分が討った敵が背を向けていたら追い討ちの手柄。逃げる旗持ちなら旗を奪った事にする。
export function pursuitKill(rt, v) {
  if (!v || !(v.fleeing || v.group?.routed) || v.civ || v.isStruct || v.surrender || rt.def.dojo || rt.def.town) return;
  const S = rt._pur || (rt._pur = { t: 0, chase: 0, counted: false, n: 0, turnT: -99, kills: 0, said: -99 });
  S.kills++;
  const at = { x: v.pos.x, y: v.pos.y, z: v.pos.z };
  if ((v.banner || v.stdHeld) && !S.flag) { S.flag = true; rt.award((t) => { t.c.flag++; }, '敵旗奪取', at); }
  if (S.kills <= 5) rt.award((t) => { t.special = { label: '追い討ち', pts: Math.min(S.kills, 5) * 3 }; }, '', at);   // 札は出さない（討ち取りの札が既に出る）
}
