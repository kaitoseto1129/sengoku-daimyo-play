// 遠くで持ち場に立つだけの組を休ませる共通の手（11/19 係・kaito「天王寺レベルの軍勢」：天王寺の k15/yasumi.js を全戦で使える形に）。
//   兵の数は減らさない（K285 見せかけ無し）。携帯（MEM_TIGHT）だけ：携帯は二十八m より先の兵を遠景の束（units.js updateImpostors）で描くので、
//   体の形を場から外しても同じ姿。パソコンは束にしないので休ませない。
//   休ませる組：本人の組でない・崩れていない・持ち場で待つ（hold・yari）・動いていない・持ち場が本人から六十m より遠い・五十m 内に相手の兵がいない。
//   兵：名の無い・馬に乗らない・旗持ちでない・狙いも打ち込みも無い・本人から五十八m より遠い兵だけ。敵が寄る・本人が近づく・組が動けば〇・五秒で起こす。
//   o.only(g)：休ませてよい組を絞る（布陣の表の idleFar の戦は、表が立てた備 g._fjR だけ。戦の筋の組には触らない）。?k15park=0 で切る（前後の比べ用）
import { MEM_TIGHT } from './settings.js';

export function idleFarTick(rt, o = {}) {
  // 11/21 クラウド kaito2（K564 根白坂のパソコン：兵5180・1コマ124ms・うち3236人が遠くで待つだけ）：o.pc の戦はパソコンでも計算を休ませる。
  //   パソコンは遠景の束が無いので体の形は場に残す（同じ所に持ち場の姿で立ったまま見える）。計算だけを休む
  if (!MEM_TIGHT && !o.pc) return;
  const F = rt.flags;
  if ((F._kykT || 0) > rt.t) return;
  F._kykT = rt.t + 0.5;
  if (typeof location !== 'undefined' && /[?&]k15park=0\b/.test(location.search)) return;
  const me = rt.player?.u; if (!me || !rt.army) return;
  const P = me.pos, A = rt.army;
  const off = rt.over || F.ending || !me.alive;
  let n = 0;
  for (const g of A.groups) {
    if (!g.units || !g.units.length) continue;
    if (o.only && !o.only(g) && !g.units.some((u) => u._kyk)) continue;
    let idle = !off && !g.isPlayerSquad && !g.routed && (g.order === 'hold' || g.order === 'yari') && !g.marching &&
      (g.anchorSpeed || 0) < 0.1 && !!g.anchor && Math.hypot(g.anchor.x - P.x, g.anchor.z - P.z) > 60 && (!o.only || o.only(g));
    // 11/28 クラウド設楽原（K732⑥）：o.foeR(g)＝組ごとの相手の近さの線（既定五十m）。柵の内で追い討ちまで動かない後ろの列は、柵の外の敵では動かないので線を縮めてよい
    if (idle && A.foeNear(g, (o.foeR && o.foeR(g)) || 50)) idle = false;
    for (const u of g.units) {
      if (u.idleSkip && !u._kyk) continue;   // 共通の idle_park が休ませた兵はそちらに任せる
      const on = idle && u.alive && !u.gone && !u.isPlayer && !u.name && u.type !== 'busho' && !u.mounted && !u.stdHeld && !u.isStandard && !u.atk && !u.fleeing &&
        !(u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 50) &&
        Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 58;
      if (on) n++;
      if (!!u._kyk === on) continue;
      u._kyk = on; u.idleSkip = on;
      if (on && u.mesh?.parent && MEM_TIGHT) { u._kyParent = u.mesh.parent; u.mesh.parent.remove(u.mesh); }
      else if (!on && u.mesh && !u.mesh.parent && u._kyParent) { if (!u.gone) u._kyParent.add(u.mesh); u._kyParent = null; }   // K399：休む間に去った兵（despawn）は場へ戻さない（行列が止まったまま原点で描かれ、山崎で毎コマ千三百回の描きになっていた）
    }
  }
  F.kyParked = n;
}
