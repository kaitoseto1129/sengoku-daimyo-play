// K467（11/20 kaito「十人ほどしか来ない。天王寺の真田・毛利の時のように一気に大勢で来る」）の共通の部品。
//   cloud-47 が三方ヶ原（b_mikatagahara.js takedaMove）で作った形を、ほかの戦の「敵が寄せる段」から一行で呼べるようにした（クラウド kaito2 k365-cloud-27）。
//   布陣の表が立てた敵の太い塊（十二人以上）のうち本人に近い n 個を、at の前へ横に並べて走り込ませる（天王寺の charge と同じ：
//   持ち場を前へ移し、走って寄せ、目の前の者と斬り合う）。遠くの塊は持ち場に残り、地図に陣の形を残す。兵は足さない（K285）。
//   _fjGo を付けて、布陣の動き（fujin_place.js fujinMoves）が元の持ち場へ戻さないようにする。返す数は動かした塊の数。
export function chargeFujinBlocks(rt, at, o = {}) {
  const me = rt.player?.u; if (!me || !at || typeof window !== 'undefined' && window.__k467off) return 0;   // __k467off：前後の比べの時だけ（直す前の動き）
  const n = o.n ?? 3, maxD = o.maxD ?? 220, spread = o.spread ?? 12, min = o.min ?? 12;
  const blocks = (rt.army.groups || []).filter((g) => g._fjR && g.team !== me.team && g.count >= min && !g.routed && !g.hidden && !g._charge && !g._fjGo)
    .map((g) => { const c = g.center(); return { g, d: Math.hypot(c.x - me.pos.x, c.z - me.pos.z) }; })
    .filter((q) => q.d < maxD).sort((a, b) => a.d - b.d).slice(0, n);
  // 横に並べる向き：at から本人へ向かう線に直交
  const vx = me.pos.x - at.x, vz = me.pos.z - at.z, vl = Math.hypot(vx, vz) || 1, px = -vz / vl, pz = vx / vl;
  blocks.forEach(({ g }, i) => {
    const k = i - (blocks.length - 1) / 2;
    g._chA = o.aggro ?? 7; g.allOutRun = true; g.order = 'hold'; g._charge = true; g._fjGo = true; g.stay = true;
    g.dest = null; g.path = null; g.focus = null; g.onArrive = null;
    g.anchor = { x: at.x + px * k * spread, z: at.z + pz * k * spread };
    g.aggro = o.aggro ?? 7; g.seekRange = o.seekRange ?? 11; g.morale = Math.max(g.morale || 0, 90); g._far = false; g.marching = false; g.noEngage = false;
  });
  return blocks.length;
}
