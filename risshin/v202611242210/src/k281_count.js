// K281 の数え（botStat 用・画面には出さない）：段ごとに一秒おき、本人の三十歩内の味方と、30〜60m の敵の本物を数え、平均を返す。
//   司令塔の決め（11/19）：本人の三十歩内の味方は四十前後・30〜60m の敵の本物は四十以上（90秒・200秒）。
let S = {}, owner = null, T = 0;   // 戦ごとに一つ（botStat に渡る物と update の rt が別の物なので、ここに持つ）
// 11/23 クラウドわ（K626・K564）：owner が前の戦の rt.flags（_plDrv の中の閉じた関数→rt＝Battle・Scene）を物で持ち、樫井・八尾若江の後に前の戦が残った→WeakRef で持つ
export function k281Tick(rt, dt, step) {
  const P = rt.player?.u;
  if (owner?.deref() !== rt.flags) { owner = new WeakRef(rt.flags); S = {}; T = 0; }
  if (!P?.alive || (T -= dt) > 0) return;
  T = 1;
  const r = (S[step] ||= [0, 0, 0]);
  let a = 0, e = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isStruct || u.isPlayer) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (u.team === P.team) { if (d < 30) a++; } else if (d >= 30 && d < 60) e++;
  }
  r[0]++; r[1] += a; r[2] += e;
}
export function k281Stat() {
  return 'K281 段ごと（秒/味方30内/敵30〜60） ' + Object.keys(S).map((k) => { const r = S[k]; return `段${k}:${r[0]}秒/${Math.round(r[1] / r[0])}/${Math.round(r[2] / r[0])}`; }).join(' ');
}
