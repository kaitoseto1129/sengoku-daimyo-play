// 小谷の上段。映像に沿う推定復元。戦の筋と西の攻め道は変えない。
import * as THREE from 'three';
import { ishigaki, hut, palisade, kabukimon, solidSeg, solidRect, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch } from './props.js';
import { monomi } from './castle_parts.js';
import { ODANI_PLAN, UPPER, NAKAMARU, KYOGOKU, KYOGOKU2, KOMARU, SANNOMARU, SANNO2, OKURIDGE } from './castles/odani.js';

export function buildOdaniUpper(rt, ramps) {
  const W = rt.world, batch = makeSimpleBatch(), stones = makeKitBatch(), groups = new Map();
  // 単位の箱と材質を使い回し、塀・板屋根・石段・草を色ごとに一括で描く。
  const box = (color, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) => {
    let list = groups.get(color);
    if (!list) { list = []; groups.set(color, list); }
    list.push([x, y, z, w, h, d, ry, rx, rz]);
  };
  const wood = 0x67513b, roof = 0x756b59, stone = 0x827e70;
  const hei = (a, b, level) => {
    const [ax, az] = a, [bx, bz] = b, len = Math.hypot(bx - ax, bz - az);
    if (len < 0.4) return;
    const ry = Math.atan2(-(bz - az), bx - ax), nx = Math.sin(ry), nz = Math.cos(ry);
    const n = Math.ceil(len / 2);
    Object.assign(solidSeg(ax, az, bx, bz, 0.23), { yTop: level + 2.55, missileH: 2.25, missileType: 'wood' });
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, L = len / n;
      box(0xc4b89c, x, level + 1.05, z, L + 0.02, 2.1, 0.4, ry);
      box(wood, x, level + 1.05, z, 0.13, 2.25, 0.48, ry);
      for (const s of [-1, 1]) {
        box(roof, x + nx * s * 0.3, level + 2.3, z + nz * s * 0.3, L + 0.04, 0.09, 0.72, ry, s * 0.35);
        box(0x312b23, x + nx * s * 0.215, level + 1.5, z + nz * s * 0.215, 0.13, 0.26, 0.025, ry);
      }
      box(wood, x, level + 2.41, z, L + 0.02, 0.12, 0.15, ry);
    }
  };
  for (const k of UPPER) {
    const plan = ODANI_PLAN.kuruwa.find((q) => q.id === k.id);
    // 京極丸の北の平場は上段が受け持つ。重なる内側に低い塀を残さない。
    const poly = k === KYOGOKU ? [[-18, k.z1], [18, k.z1], [18, KYOGOKU2.z1], [-18, KYOGOKU2.z1]] : plan.poly;
    const gaps = [...(plan.gapAt || []), [0, k.z0], [0, k.z1]];
    for (let j = 0; j < poly.length; j++) {
      const a = poly[j], b = poly[(j + 1) % poly.length];
      if (k === KYOGOKU && j === 2) continue;
      // 山王丸の内側に重なる辺は、上段の石垣と塀だけを見せる。
      if (k === SANNOMARU && j >= 3 && j <= 5) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      let spans = [[0, 1]];
      for (const g of gaps) {
        const t = ((g[0] - a[0]) * dx + (g[1] - a[1]) * dz) / (len * len);
        const dist = Math.abs((g[0] - a[0]) * dz - (g[1] - a[1]) * dx) / len;
        if (dist > 1.2 || t < 0 || t > 1) continue;
        // 渡櫓の脇の台と外階段まで、下の縄張りと同じ口を空ける。
        const gate = ODANI_PLAN.koguchi.find(v => v.gate === 'yagura' && Math.hypot(v.at[0] - g[0], v.at[1] - g[1]) < 8);
        const r = Math.max(3.3, gate ? gate.w / 2 + 2.8 : 0) / len;
        spans = spans.flatMap(([l, u]) => [[l, Math.min(u, t - r)], [Math.max(l, t + r), u]].filter(([v, w]) => w > v));
      }
      for (const [l, u] of spans) {
        const p = [a[0] + dx * l, a[1] + dz * l], q = [a[0] + dx * u, a[1] + dz * u];
        const nx = -dz / len, nz = dx / len;
        const out = nx * ((a[0] + b[0]) / 2 - k.x) + nz * ((a[1] + b[1]) / 2 - k.cz) > 0 ? 1 : -1;
        // 大小の自然石の既存部品を使い、外へ少し張り出して切岸の土に埋めない。
        const ox = nx * out * 0.8, oz = nz * out * 0.8;
        ishigaki(W, [[p[0] + ox, p[1] + oz], [q[0] + ox, q[1] + oz]], {
          topY: k.level + 0.12, minH: k === SANNOMARU ? 5 : 3.2, maxH: k === SANNOMARU ? 6 : 4.8,
          lean: 0.2, out, capIn: 0.95, big: 1.5, noKit: true, batch: stones,
        });
        if (OKURIDGE.includes(k)) {
          const m = palisade({ heightAt: () => k.level }, [...p, ...q], { h: 1.6, batch });
          if (!m.isBatchedPart) rt.scene.add(m);
          Object.assign(solidSeg(...p, ...q, 0.2), { missileH: 1.6, missileType: 'wood' });
        } else hei(p, q, k.level + 0.12);
        const count = Math.floor((u - l) * len / 5);
        for (let i = 0; i < count; i++) {
          const t = l + (u - l) * (i + 0.5) / count, x = a[0] + dx * t + ox, z = a[1] + dz * t + oz;
          // 苔を石の外面へ、草を天端のすき間へ。数は一辺数個に抑える。
          box(0x586046, x + nx * out * 0.32, k.level - 0.8 - (i % 3) * 0.5, z + nz * out * 0.32, 0.75, 0.28, 0.1, Math.atan2(-dz, dx));
          box(0x697047, x - ox * 0.5, k.level + 0.24, z - oz * 0.5, 0.07, 0.42, 0.3, i * 1.7, 0, 0.2);
        }
      }
    }
  }
  // 既存の歩ける坂に薄い石の踏面を重ねる。段で兵の道を塞がない。
  for (const r of ramps) {
    if (r.a[0] !== 0 || r.b[0] !== 0 || r.a[1] > NAKAMARU.z0 + 3) continue;
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    const rise = W.heightAt(...r.b) - W.heightAt(...r.a);
    const n = Math.max(1, Math.ceil(len / 0.65), Math.ceil(Math.abs(rise) / 0.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, z = r.a[1] + (r.b[1] - r.a[1]) * t;
      box(stone, 0, W.heightAt(0, z) + 0.035, z, r.w * 2 - 0.3, 0.12, len / n + 0.02);
    }
  }
  // 上がりきった所の門。既存の中間の木戸と並び、全て開いて通れる。
  for (const k of [KYOGOKU, KYOGOKU2, KOMARU, SANNOMARU, SANNO2, ...OKURIDGE]) {
    rt.scene.add(kabukimon(W, 0, k.z1 - 2.5, 5, 0, { doors: false }));
  }
  rt.scene.add(hut(W, -8, KYOGOKU.z1 - 7, 4.2, 3.6, 0, { ita: true, minka: false }),
    hut(W, -7, KYOGOKU2.cz, 4.6, 3.2, 0, { ita: true, minka: false }),
    hut(W, 5.3, SANNOMARU.z1 - 6, 3.2, 3, 0, { ita: true, minka: false }));
  // 最下段の外を回る細道。柵は中丸の石垣から離し、大堀切の土橋を空ける。
  const z0 = NAKAMARU.z0, z1 = NAKAMARU.z1;
  for (const s of [-1, 1]) {
    rt.scene.add(palisade(W, [s * 14, z0, s * 14, z1 + 2], { h: 1.5, batch }));
    for (let z = z0 + 1; z < z1; z += 1) box(0x8c8066, s * 12.5, W.heightAt(s * 12.5, z) + 0.025, z, 1.15, 0.05, 1.05);
  }
  // 京極丸の祠と山王丸の社殿。高床・縁・正面の階・板の切妻を組む。
  const shrine = (x, z, w, d, h) => {
    const y = W.heightAt(x, z);
    solidRect(x, z, w, d, 0);
    box(wood, x, y + 0.65, z, w + 0.7, 0.18, d + 0.7);
    box(wood, x, y + 0.8 + h / 2, z, w, h, d);
    box(0x30271f, x, y + 0.8 + h * 0.4, z + d / 2 + 0.03, w * 0.5, h * 0.8, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(wood, x + sx * w / 2, y + 0.4, z + sz * d / 2, 0.17, 0.8, 0.17);
    for (let i = 0; i < 3; i++) box(wood, x, y + 0.12 + i * 0.22, z + d / 2 + 1.05 - i * 0.3, w * 0.5, 0.22, 0.32);
    const rw = w / 2 + 0.6, rise = rw * 0.55, angle = Math.atan2(rise, rw);
    for (const s of [-1, 1]) box(roof, x + s * rw / 2, y + 0.8 + h + rise / 2, z, Math.hypot(rw, rise), 0.12, d + 1.2, 0, 0, -s * angle);
    box(wood, x, y + 0.8 + h + rise + 0.08, z, 0.22, 0.2, d + 1.4);
  };
  shrine(5, KYOGOKU2.cz, 1.7, 1.8, 1.6);
  shrine(4.2, SANNO2.cz - 1, 3, 3.5, 2.6);
  const tx = 4.2, tz = SANNO2.z1 - 3, ty = W.heightAt(tx, tz), shu = 0xa83e29;
  for (const s of [-1, 1]) box(shu, tx + s * 1.35, ty + 1.75, tz, 0.26, 3.5, 0.26);
  box(shu, tx, ty + 2.7, tz, 3.35, 0.22, 0.22);
  box(shu, tx, ty + 3.5, tz, 3.9, 0.25, 0.38);
  box(0x402e25, tx, ty + 3.68, tz, 4.1, 0.12, 0.45);
  // 社の段の北は木の柵。さらに小さな曲輪と物見を尾根先へつなぐ。
  rt.scene.add(palisade({ heightAt: () => SANNO2.level }, [-SANNO2.hw + 2, SANNO2.z0, -3.3, SANNO2.z0], { h: 1.5, batch }));
  monomi(rt, OKURIDGE[0].x + 3.8, OKURIDGE[0].cz, { team: 1, name: '奥の尾根の物見櫓' });
  monomi(rt, OKURIDGE[1].x, OKURIDGE[1].z0 + 3, { team: 1, name: '尾根先の物見櫓' });
  // 伐採した上半分にも草の段と岩を残す。道と曲輪の床は覆わない。
  for (let z = KYOGOKU.z1 + 20; z > SANNO2.z0 - 15; z -= 9) {
    for (const side of [-1, 1]) for (let j = 0; j < 3; j++) {
      const x = side * (27 + j * 8 + 2 * Math.sin(z * 0.13));
      if (ODANI_PLAN.kuruwa.some((k) => Math.abs(x - k.x) < k.hw + 4 && z > k.z0 - 4 && z < k.z1 + 4)) continue;
      const y = W.heightAt(x, z), step = W.heightAt(x + 1, z) - y;
      box(j % 2 ? 0x69734a : 0x56633e, x, y + 0.08, z, 4.2, 0.16, 1.2, 0, 0, Math.atan(step));
      if (j === 1) box(0x8c897b, x + side * 1.2, W.heightAt(x + side * 1.2, z + 2) + 0.18, z + 2, 1.2, 0.5, 0.8, z * 0.2, 0, 0.18);
    }
  }
  // 石垣の外面に細い目地を付ける。部品は色ごとにまとめて描く。
  for (const k of [KYOGOKU, KOMARU, SANNOMARU]) for (const side of [-1, 1]) {
    const x = k.x + side * (k.hw + 1.15);
    for (let row = 0; row < 3; row++) {
      const y = k.level - 0.65 - row * 0.8;
      for (let z = k.z0 + 4; z < k.z1 - 4; z += 3) {
        box(0x47483c, x + side * row * 0.16, y, z, 0.035, 0.045, 2.5);
        box(0x47483c, x + side * row * 0.16, y + 0.36, z + (row % 2 ? 0.7 : -0.7), 0.035, 0.65, 0.045);
      }
    }
  }
  finalizeKitBatch(rt, stones);
  finalizeSimpleBatch(rt, batch);
  const geo = new THREE.BoxGeometry(1, 1, 1), obj = new THREE.Object3D();
  for (const [color, list] of groups) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1 }), list.length);
    for (let i = 0; i < list.length; i++) {
      const [x, y, z, w, h, d, ry, rx, rz] = list[i];
      obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz, 'YXZ'); obj.scale.set(w, h, d); obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
  }
}
