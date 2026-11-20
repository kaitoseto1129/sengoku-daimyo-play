// 手取川の重さ（11/18 クラウド tedorigawa-owner・台帳 K365 の重さの表で全戦一番重い：iPhone の真似 中央122.6ms）。
//   描かずの数えで開幕の四十秒は生きた兵 315〜319 人（上限 250）・一コマの計算 20ms 前後。重いのは兵の数に比例する共通の計算（act・animate）。
//   共通の idle_park.js は携帯の味方の組だけを休ませる。手取川は北岸の奥（九十〜百五十m）で待つ上杉の後備え・旗本・脇備えと、
//   南岸で受け取りを待つ滝川の手が、遊ぶ間ずっと持ち場に立つだけ。これを敵味方とも休ませる。携帯（MEM_TIGHT）だけ：携帯は二十八m より先の兵を
//   遠景の束で描く（army_quality.js の段2）ので、形を外しても同じ姿で見える。パソコンは束にしないので休ませない（消えて見えるため）
//   （units.js の idleSkip。体の形は場から外し、遠景の束（updateImpostors）が同じ場所に描く）。兵の並び army.units はそのまま（数え・勝ち負けは変わらない）。
//   休ませる組：本人の組でない・崩れていない・持ち場で待つ（hold・yari）・動いていない・持ち場が本人から六十m より遠い・四十五m 内に相手の兵がいない。
//   兵：名の無い・馬に乗らない・旗持ちでない・狙いも打ち込みも無い兵だけ。敵が寄る・本人が近づく・組が動けば〇・五秒で起こす。
//   ?tdpark=0 で切る（前後の比べ用）
import { MEM_TIGHT } from '../settings.js';

export function tedoIdleFar(rt) {
  if (!MEM_TIGHT) return;
  const F = rt.flags;
  if ((F._tdkT || 0) > rt.t) return;
  F._tdkT = rt.t + 0.5;
  if (typeof location !== 'undefined' && /[?&]tdpark=0\b/.test(location.search)) return;
  const me = rt.player?.u; if (!me || !rt.army) return;
  const P = me.pos, A = rt.army;
  const off = rt.over || F.ending || !me.alive;
  let n = 0;
  for (const g of A.groups) {
    if (!g.units || !g.units.length) continue;
    let idle = !off && !g.isPlayerSquad && !g.routed && (g.order === 'hold' || g.order === 'yari') && !g.marching &&
      (g.anchorSpeed || 0) < 0.1 && !!g.anchor && Math.hypot(g.anchor.x - P.x, g.anchor.z - P.z) > 60;
    if (idle && A.foeNear(g, 45)) idle = false;
    for (const u of g.units) {
      if (u.idleSkip && !u._tdk) continue;   // 共通の idle_park が休ませた兵はそちらに任せる
      const on = idle && u.alive && !u.gone && !u.isPlayer && !u.name && u.type !== 'busho' && !u.mounted && !u.stdHeld && !u.isStandard && !u.atk && !(u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 45) &&
        Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 55;
      if (on) n++;
      if (!!u._tdk === on) continue;
      u._tdk = on; u.idleSkip = on;
      if (on && u.mesh?.parent) { u._tdParent = u.mesh.parent; u.mesh.parent.remove(u.mesh); }
      else if (!on && u.mesh && !u.mesh.parent && u._tdParent) { if (!u.gone) u._tdParent.add(u.mesh); u._tdParent = null; }   // K399：休む間に去った兵（despawn）は場へ戻さない（行列が止まったまま原点で描かれ、山崎で毎コマ千三百回の描きになっていた）
    }
  }
  F.tdParked = n;
}
