// ======================================================================
// 天王寺の戦い　信長が先頭に立つ（K295・図鑑 11/14「天王寺砦：信長が先頭で、少ない味方で大軍に突っ込む。足を撃たれても止まらない」）
// 史実：信長は先手の足軽に交じり、自ら先頭に立って囲みを破った（信長公記巻九・四）。
// これまで：信長の手は道中の縦列（column）と門前の槍の列で、信長が列の中ほどに埋もれ、先頭に立つ姿が見えなかった。
// 直し：後詰の段（step 1）と再攻撃の段（step 3）の間、信長を手の兵の進む向きの先頭に置く。
//   一番前の兵より一歩半前に置く。目の前で斬り合っている間は動かさない（相手を置き去りにしない）。信長で遊ぶ時（本人が信長）は触らない。
// ======================================================================
export function install(rt) {
  const F = rt.flags;
  return {
    update(dt) {
      if (rt.G.lord || F.ending || rt.over) return;
      if (F.step !== 1 && F.step !== 3) return;
      const g = F.nobu, L = F.nobuU;
      if (!g || !L || !L.alive || L.isPlayer || L.fleeing || L.woundOut || g.routed) return;
      if (L.target?.alive && Math.hypot(L.target.pos.x - L.pos.x, L.target.pos.z - L.pos.z) < 3) return;
      if (L.atk || L.swing) return;
      let cx = 0, cz = 0, k = 0;
      for (const u of g.units) if (u !== L && u.alive && !u.fleeing && !u.woundOut) { cx += u.pos.x; cz += u.pos.z; k++; }
      if (k < 2) return;
      cx /= k; cz /= k;
      // 進む向き：道中は次の曲がり角、着いた後は隊の向き（facing は atan2(dx, dz)）
      let dx, dz;
      const p = g.order === 'path' && g.path ? g.path[Math.min(g.pathIdx || 0, g.path.length - 1)] : null;
      const aim = p ? { x: p[0], z: p[1] } : g.order === 'move' && g.dest ? g.dest : null;
      if (aim) { dx = aim.x - cx; dz = aim.z - cz; }
      else { dx = Math.sin(g.facing ?? Math.PI); dz = Math.cos(g.facing ?? Math.PI); }
      const dl = Math.hypot(dx, dz);
      if (dl < 0.5) return;
      // 一番前の兵より一歩半前（縦列は長く、重心から三歩では前の数人に埋もれた）。重心から八歩より先へは出さない。
      let front = 0;
      for (const u of g.units) if (u !== L && u.alive && !u.fleeing && !u.woundOut) front = Math.max(front, ((u.pos.x - cx) * dx + (u.pos.z - cz) * dz) / dl);
      const ahead = Math.min(8, Math.max(3, front + 1.5));
      const tx = cx + dx / dl * ahead, tz = cz + dz / dl * ahead;
      const ex = tx - L.pos.x, ez = tz - L.pos.z, ed = Math.hypot(ex, ez);
      if (ed < 1.5) return;
      // 馬の足並みより速く滑らせない（秒に四歩）。
      const st = Math.min(ed - 1, 4 * dt);
      const nx = L.pos.x + ex / ed * st, nz = L.pos.z + ez / ed * st;
      if (rt.army.wallBetween?.(L.pos, L.team, { x: nx, y: L.pos.y, z: nz })) return;
      L.pos.x = nx; L.pos.z = nz;
      if (rt.world.heightAt) L.pos.y = rt.world.heightAt(L.pos.x, L.pos.z);
      // 進む向きへ顔を向ける（後ろ向きに滑らせない）
      if (!L.target) L.heading = Math.atan2(ex, ez);
    },
  };
}
