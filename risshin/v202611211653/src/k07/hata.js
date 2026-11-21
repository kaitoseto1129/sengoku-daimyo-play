// ======================================================================
// 佐和山：石田の旗が減っていく（kaito 11/8：docs/toku15_plan_1108.md の 7「城内へ東軍が複数方向から。石田の旗が減っていく」・army_depth_spec 23「旗をUI代わりに」）
//   城の曲輪ごとに立つ石田の幟（flags(rt) が rt.flags.ishidaFlags に置く）を、その曲輪が落ちた所で一本ずつ倒す。字は出さない。
//   大手 → 三の丸 → 二の丸 → 本丸・太鼓丸の順。どの曲輪の旗かは幟の場所で決める（下の AREA）。
// 入れ方：update で tick(rt, dt) を毎コマ（段の番号は depth の F.dp.i、落城は F.burned を見る）。
// ======================================================================
// 段（F.dp.i）がこれを超えたら倒す：①大手門(0)→休み(1)→移る(2)→②三の丸(3)→休み(4)→③二の丸の下(5)→④上(6)→休み(7)→⑤本丸(8)
const AREA = (x, z) => (x > 90 ? 0 : z < -90 ? 3 : z < -60 ? 5 : z < -20 ? 6 : 99);

export function tick(rt, dt) {
  const F = rt.flags, L = F.ishidaFlags;
  if (!L || !L.length) return;
  const i = F.dp?.i ?? -1, done = F.dp && !F.dp.on;
  if ((F.hataT = (F.hataT || 0) - dt) <= 0) {
    F.hataT = 0.5;
    let k = 0;
    for (const f of L) {
      if (f.fall != null) continue;
      const a = AREA(f.x, f.z);
      if (i > a || F.burned || done) { f.fall = 0; f.delay = 0.6 + k * 1.3; k++; }   // 一本ずつ、少し間を空けて倒れる
    }
  }
  for (const f of L) {
    if (f.fall == null || f.fall >= 1) continue;
    if ((f.delay -= dt) > 0) continue;
    f.fall = Math.min(1, f.fall + dt / 1.6);
    const e = f.fall * f.fall;   // 初めはゆっくり、終わりに地へ叩きつく
    f.g.rotation.set(0, f.r, 1.42 * e);
    f.g.position.y = f.y - 0.1 * e;
  }
}
