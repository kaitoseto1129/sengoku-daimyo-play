// 11/20 K391（kaito「遠くの地面に旗だけ刺さっている所がたくさんあり、近づくと消える。部隊のいない旗は出さない」）・K460（K285 本物の兵しか映さない）：
//   場に立つ幟（battle.js の noboriFlags）のうち、30m 内に生きた兵が一人もいない物は隠す。兵が来れば（備が寄れば）また出す。
//   毎コマ全部は見ず、幟を三十に分けて一コマに一組ずつ見る（一本は約半秒ごと）。?orphanflag=1 で前の見え方（全部出す）。
const OFF = typeof location !== 'undefined' && /[?&]orphanflag=1\b/.test(location.search);
import { Vector3 } from 'three';
const R = 30, SLICES = 30, P = new Vector3();
export function orphanFlagTick(b) {
  const F = b.noboriFlags, A = b.army;
  if (OFF || !F || !F.length || !A) return;
  const per = Math.ceil(F.length / SLICES), i0 = (b._ofI || 0) % F.length;
  b._ofI = i0 + per;
  const lists = A.parked?.length ? [A.units, A.parked] : [A.units];
  for (let k = 0; k < per; k++) {
    const f = F[(i0 + k) % F.length];
    if (!f || (!f.visible && !f.userData.orphanHid)) continue;   // ほかの所が隠した旗（倒れた・燃えた）には触らない
    f.getWorldPosition(P); const x = P.x, z = P.z;   // 描かない流しでも行列を新しくして測る（舟の旗は動く）
    let near = false;
    for (const L of lists) { for (const u of L) { if (!u.alive || u.isStruct) continue; if (Math.abs(u.pos.x - x) < R && Math.abs(u.pos.z - z) < R) { near = true; break; } } if (near) break; }
    if (near) { if (f.userData.orphanHid) { f.userData.orphanHid = false; f.visible = true; } }
    else if (f.visible) { f.visible = false; f.userData.orphanHid = true; }
  }
}
