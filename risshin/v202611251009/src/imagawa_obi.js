// 今川家編の「大軍の綻び」の帯（H3・docs/house_imagawa.md）。i08 大高・i09 丸根・i10 桶狭間・b_i_common が使う。
//   K651：i10 が織田の桶狭間の戦場（b_okehazama.js）を読むようになったので、帯だけを軽い置き場に分けた（i08・i09 が大きな戦場の組を読まないように）。
//   F.obiAt＝[前の備, 本陣, 後ろの備] の組が無い時の置き場（無ければ原点）
import * as THREE from 'three';

// 「大軍の綻び」の帯：前備・旗本・後備の中心を結ぶ金の細い線を三筋まで。太さ（筋の数）で列のつながりを、切れかけは点滅で見せる。
//   線と材質は一度だけ作って使い回す（毎コマ new しない）。字は出さない
const SEG = 20;
export function obiTick(rt, dt) {
  const F = rt.flags, O = F.obi, W = rt.world;
  if (!O.lines) {
    O.lines = [];
    for (let s = 0; s < 2; s++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xd9a21c, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
      const row = [];
      for (let k = 0; k < 3; k++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
        const L = new THREE.Line(geo, mat); L.frustumCulled = false; L.renderOrder = 5; L.visible = false;
        rt.scene.add(L); row.push(L);
      }
      O.lines.push({ mat, row });
    }
  }
  O.t += dt;
  const A = F.allies || [], K = F.obiAt || [], Z = { x: 0, z: 0 }, c = (g, at) => (g && g.count ? g.center?.() : null) || at || Z;
  const hon = c(A[1], K[1]), pairs = [[hon, c(A[0], K[0]), O.a], [hon, c(A[2], K[2]), O.b]];
  for (let s = 0; s < 2; s++) {
    const [p, q, v] = pairs[s], { mat, row } = O.lines[s];
    const n = F.ending ? 0 : v > 0.66 ? 3 : v > 0.33 ? 2 : v > 0 ? 1 : 0;
    mat.opacity = v > 0.33 ? 0.9 : 0.35 + 0.55 * Math.abs(Math.sin(O.t * 5));   // 切れかけは点滅
    const d = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / d, nz = (q.x - p.x) / d;
    for (let k = 0; k < 3; k++) {
      const L = row[k];
      L.visible = k < n;
      if (!L.visible) continue;
      const off = (k - (n - 1) / 2) * 0.6, a = L.geometry.attributes.position;
      for (let j = 0; j <= SEG; j++) {
        const f = j / SEG, x = p.x + (q.x - p.x) * f + nx * off, z = p.z + (q.z - p.z) * f + nz * off;
        a.setXYZ(j, x, W.heightAt(x, z) + 3.2 + Math.sin(f * Math.PI) * 1.5, z);
      }
      a.needsUpdate = true;
    }
  }
}
