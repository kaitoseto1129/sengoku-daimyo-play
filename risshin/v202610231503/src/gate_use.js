// gate_use.js … 自分の側の城の門を、門の前で押して開け閉めする（kaito 10/2）
// siege_gate.js の makeGate の戻り値を受けて、門の前に押せる札「門を開ける／門を閉める」を出す。
// 開いた門（struct.opened）は army_move.js の collide が素通しにする（敵も入れる。閉めれば塞がる）。
// 破られて倒れた門（breached）は閉め直せないので、札を出さない。
// 使い方（戦の定義から）：
//   import { gateUse } from './gate_use.js';
//   F.gu = gateUse(rt, [F.gateMk, F.gateNiMk], { team: 0 });
//   毎コマ F.gu.tick();      F.gu.open(F.gateMk) / F.gu.close(F.gateMk) で戦の筋からも開け閉めできる
// ======================================================================

const mid = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });

export function gateUse(rt, gates, o = {}) {
  const L = (gates || []).filter(Boolean).map((G, i) => ({ G, id: 'gateuse' + i + '_' + (G.name || ''), key: '' }));
  const U = {
    // 門の口に敵が立っている時は閉められない（挟まって閉まらない）
    blocked(G) {
      const c = mid(G.struct);
      let foe = false;
      rt.army.forNear(c.x, c.z, 1.6, (u) => { if (u.alive && !u.isStruct && u.team !== G.guardTeam) foe = true; });
      return foe;
    },
    open(G) {
      if (!G || G.breached || G.opened) return false;
      G._openNow(false);
      return true;
    },
    close(G) {
      if (!G || G.breached || !G.opened) return false;
      if (U.blocked(G)) { if (rt.bark) rt.bark('口に敵がいて、門が閉まらない', true); return false; }
      G.close();
      // kido()（castle_parts.js）は扉を door でなく mesh で返すので、葉と閂をここで戻す（子は [左の葉, 右の葉, 閂]）
      const m = !G.gateObj.door && G.gateObj.mesh;
      if (m && m.userData.leaves) { m.userData.leaves.forEach((pv) => pv.rotation.set(0, 0, 0)); if (m.children[2]) m.children[2].visible = true; }
      if (rt.bark) rt.bark(`${G.name}を閉めた`);
      return true;
    },
    tick() {
      if (rt.over) { for (const q of L) if (q.key) { rt.uninteract(q.id); q.key = ''; } return; }
      for (const q of L) {
        const G = q.G;
        const want = G.breached || !G.struct.alive ? '' : G.opened ? '門を閉める' : '門を開ける';
        if (want === q.key) continue;
        if (q.key) rt.uninteract(q.id);
        q.key = want;
        if (!want) continue;
        const c = mid(G.struct);
        rt.addInteract(q.id, c, want, () => (G.opened ? U.close(G) : U.open(G)), { r: o.r || 4, prio: 1 });
      }
    },
    near(p, r = 4) { return L.find((q) => { const c = mid(q.G.struct); return Math.hypot(c.x - p.x, c.z - p.z) < r; }) || null; },
  };
  return U;
}
