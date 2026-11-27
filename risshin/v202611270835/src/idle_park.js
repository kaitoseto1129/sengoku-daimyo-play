// 遠くで待つだけの味方の組を休ませる共通の手（11/17 iMac n-atsumi・台帳 K360⑥・K365 携帯の重さ）。battle.js が毎コマ呼ぶ（0.5 秒に一度だけ見る）。
//   長篠（b_shitaragahara.js shIdleFill・n-nagashino）で柵の鉄砲衆に効いた手（1コマ 60→26ms）を全戦へ：
//   携帯（MEM_TIGHT）で、本人の側の組のうち、持ち場で待つだけ（hold・止まっている）・本人から 70m より遠い・組の 50m 内に敵がいない組は、
//   名の無い兵の計算を丸ごと休ませ（units.js の idleSkip）、体の形も場から外す（行列の更新と描く前の振り分けを省く）。
//   兵は遠景の束（units.js updateImpostors）で同じ場所に描かれる。敵が寄る・本人が近づく・組が動けば 0.5 秒で戻す。
//   敵の組は休ませない（兵の並び army.units はそのままなので、戦の数え・勝ち負けは変わらない）。止める：戦の定義に noIdlePark: true
import { MEM_TIGHT } from './settings.js';
import { FLAT } from './flat_rule.js';

export function idleParkTick(rt) {
  if (!MEM_TIGHT || !rt.army || rt.def?.noIdlePark || rt.over) return;
  if (typeof location !== 'undefined' && location.search.includes('nopark')) return;   // 前後の比べ用
  const F = rt.flags; if ((F._ipT || 0) > rt.t) return;
  F._ipT = rt.t + 0.5;
  const me = rt.player?.u; if (!me) return;
  const P = me.pos, A = rt.army, team = me.team;
  // 11/21 K470（cloud-37）：休む兵は霧の手前では描かれず（遠景の束は霧の先だけ・flat_rule.js）、組が動き出して起こした時に霧の手前で急に現れた
  //   （携帯の戸次川 40秒：渡り始めた仙石秀久の旗本が 52〜56m に急に十人）。休ませるのは霧の見える遠さ＋10m より先だけ（どこで起こしても霧の中）
  const PARK_D = Math.max(70, (FLAT.on ? FLAT.far : 0) + 10);
  for (const g of A.groups) {
    if (!g.units || !g.units.length) continue;
    let idle = g.team === team && !g.isPlayerSquad && !g.routed && (g.order === 'hold' || g.order === 'yari') && !g.marching &&
      (g.anchorSpeed || 0) < 0.1 && Math.hypot(g.anchor.x - P.x, g.anchor.z - P.z) > PARK_D && me.alive;
    if (idle && A.foeNear(g, 50)) idle = false;
    for (const u of g.units) {
      if (u.idleSkip && !u._ipk) continue;   // 戦の側が休ませた兵（長篠の柵）はその戦に任せる
      const on = idle && u.alive && !u.gone && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > PARK_D && !u.isPlayer && !u.name && u.type !== 'busho' && !u.mounted && !u.stdHeld && !u.isStandard && !u.target && !u.atk;
      if (!!u._ipk === on) continue;
      u._ipk = on; u.idleSkip = on;
      if (on && u.mesh?.parent) { u._ipParent = u.mesh.parent; u.mesh.parent.remove(u.mesh); }
      else if (!on && u.mesh && !u.mesh.parent && u._ipParent) { if (!u.gone) u._ipParent.add(u.mesh); u._ipParent = null; }   // K399：休む間に去った兵（despawn）は場へ戻さない（行列が止まったまま原点で描かれ、山崎で毎コマ千三百回の描きになっていた）
    }
  }
}
