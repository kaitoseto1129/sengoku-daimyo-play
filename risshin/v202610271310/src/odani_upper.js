// 小谷の上段。映像に沿う推定復元。戦の筋と西の攻め道は変えない。
import * as THREE from 'three';
import { S } from './settings.js';
import { rockShape } from './rock_shape.js';
import { terrainView } from './terrain_view.js';
import { S as SETTINGS } from './settings.js';
import { ishigaki, hut, palisade, kabukimon, solidSeg, solidRect, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch } from './props.js';
import { monomi } from './castle_parts.js';
import { ODANI_PLAN, UPPER, NAKAMARU, KYOGOKU, KYOGOKU2, KOMARU, SANNOMARU, SANNO2, OKURIDGE, KUICHIGAI } from './castles/odani.js';

export function buildOdaniUpper(rt, ramps) {
  const low = false;
  const W = rt.world, batch = makeSimpleBatch(), stones = makeKitBatch(), groups = new Map(), wornBoards = [];
  // 束ねた土塀も視点を通さない。描く箱を毎回拾わず、一辺につき一つの箱で調べる。
  const cameraWalls = [], cameraBlock = W.cameraBlockFraction;
  // 井楼の横木の隙間を視点だけが抜けると、次の横木が顔の前を塞ぐ。
  // 下の木組みの四面で視点を止める。兵の歩行・梯子・上の見張り台は変えない。
  if (!low) for (const tower of rt.flags.C.towers) {
    const I = tower.naka;
    if (!I) continue;
    const y = W.heightAt(tower.x, tower.z), top = tower.topY - y;
    const c = Math.cos(I.rot || 0), s = Math.sin(I.rot || 0);
    for (const [ax, az, bx, bz] of [[-1.65, -1.3, 1.65, -1.3],
      [-1.65, 1.3, 1.65, 1.3], [-1.3, -1.65, -1.3, 1.65], [1.3, -1.65, 1.3, 1.65]]) {
      const dx = (bx - ax) * c + (bz - az) * s, dz = -(bx - ax) * s + (bz - az) * c;
      const len = Math.hypot(dx, dz);
      cameraWalls.push({ x: tower.x + ax * c + az * s, z: tower.z - ax * s + az * c,
        y: y - .4, tx: dx / len, tz: dz / len, len, half: .28, top: top + .4 });
    }
  }
  // 西木戸の土塁は束ねた面の拾い直しを待たず、視点を裾の手前で止める。
  // 坂に沿って短く区切り、上の段まで続く大きな箱で通路を覆わない。
  // 形と高さは b_odani の幅1.8m・高さ1.8mの土塁に合わせる。歩行の当たりは変えない。
  for (const [ax, az, bx, bz] of KUICHIGAI) {
    const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
    const count = Math.ceil(len / 1.5);
    for (let i = 0; i < count; i++) {
      const x = ax + (bx - ax) * i / count, z = az + (bz - az) * i / count;
      let bottom = Infinity, top = -Infinity;
      for (const t of [0, .5, 1]) for (const side of [-1.5, 0, 1.5]) {
        const h = W.heightAt(x + tx * len / count * t - tz * side, z + tz * len / count * t + tx * side);
        bottom = Math.min(bottom, h); top = Math.max(top, h);
      }
      cameraWalls.push({ x, z, y: bottom, tx, tz, len: len / count, half: 1.6, top: top - bottom + 1.85 });
    }
  }
  W.cameraBlockFraction = (from, to) => {
    let hit = cameraBlock?.call(W, from, to) ?? null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    for (const w of cameraWalls) {
      const x = from.x - w.x, z = from.z - w.z;
      let lo = 0, hi = hit ?? 1;
      for (let axis = 0; axis < 3; axis++) {
        // 石垣は下ほど外へ張り出す。斜めの面に沿って調べ、門の道を大きな箱で覆わない。
        const p = axis === 0 ? x * w.tx + z * w.tz : axis === 1
          ? x * -w.tz + z * w.tx + (from.y - w.y - (w.top ?? 0)) * (w.slope || 0) : from.y - w.y;
        const d = axis === 0 ? dx * w.tx + dz * w.tz : axis === 1
          ? dx * -w.tz + dz * w.tx + dy * (w.slope || 0) : dy;
        const a = axis === 0 ? -.04 : axis === 1 ? -(w.half ?? .65) : -.08;
        const b = axis === 0 ? w.len + .04 : axis === 1 ? (w.half ?? .65) : (w.top ?? 2.55);
        if (Math.abs(d) < .000001) { if (p < a || p > b) { hi = -1; break; } }
        else {
          const t0 = (a - p) / d, t1 = (b - p) / d;
          lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
          if (lo > hi) break;
        }
      }
      if (lo <= hi && lo < 1 && (hit === null || lo < hit)) hit = lo;
    }
    return hit;
  };
  // 石の面だけを視点から遮る。歩行の当たりや地面の高さは変えない。
  // 天端・裾・傾きは直後の石積みとそろえ、組み立て時に一辺一つだけ作る。
  const stoneCamera = (a, b, bottom, top, out) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < .5 || top <= bottom) return;
    cameraWalls.push({ x: a[0], z: a[1], y: bottom, tx: (b[0] - a[0]) / len,
      tz: (b[1] - a[1]) / len, len, half: .75, top: top - bottom + .22, slope: .2 * out });
  };
  // 単位の箱と材質を使い回し、塀・板屋根・石段・草を色ごとに一括で描く。
  const box = (color, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0, worn = false) => {
    if (worn) { wornBoards.push([x, y, z, w, h, d, ry, rx, rz, color]); return; }
    let list = groups.get(color);
    if (!list) { list = []; groups.set(color, list); }
    list.push([x, y, z, w, h, d, ry, rx, rz]);
  };
  const wood = 0x67513b, roof = 0x756b59, stone = 0x827e70;
  // 土の切岸は歩行と同じ地面で描く。縁から一律に張り出す上張りは、
  // 木戸脇の坂を覆い、草と土の巨大な三角板になるので重ねない。
  const hei = (a, b, level) => {
    const [ax, az] = a, [bx, bz] = b, len = Math.hypot(bx - ax, bz - az);
    if (len < 0.4) return;
    cameraWalls.push({ x: ax, z: az, y: level, tx: (bx - ax) / len, tz: (bz - az) / len, len });
    const ry = Math.atan2(-(bz - az), bx - ax), nx = Math.sin(ry), nz = Math.cos(ry);
    const n = Math.ceil(len / 2);
    Object.assign(solidSeg(ax, az, bx, bz, 0.23), { yTop: level + 2.55, missileH: 2.25, missileType: 'wood' });
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, L = len / n;
      // 厚い土壁を薄い縦板へ。板目の継ぎ目と横桟を見せ、笠も板葺きにする。
      if (true) for (let j = 0; j < 5; j++) {
        const off = ((j + .5) / 5 - .5) * L;
        const px = x + Math.cos(ry) * off, pz = z - Math.sin(ry) * off;
        // 狭間は約六メートルに一つ。板一枚を大きく抜く形を避け、小さな縦口にする。
        const tint = [0x756049, 0x897357, 0x6d5c49, 0x7c6b56][(i * 3 + j) % 4];
        if (j === 2 && i % 3 === 1) {
          const bw = L / 5 - .012, slit = Math.min(.14, bw * .45);
          box(tint, px, level + .66, pz, bw, 1.32, .12, ry);
          box(tint, px, level + 1.86, pz, bw, .48, .12, ry);
          for (const side of [-1, 1]) {
            const edge = side * (bw + slit) / 4;
            box(tint, px + Math.cos(ry) * edge, level + 1.47, pz - Math.sin(ry) * edge,
              (bw - slit) / 2, .3, .12, ry);
          }
        } else box(tint, px, level + 1.05, pz, L / 5 - .012, 2.1 - (j % 2) * .04, .12, ry, 0, 0, true);
      }
      else box(i % 3 ? 0xa38a61 : 0x96805e, x, level + 1.05, z, L + 0.02, 2.1, 0.4, ry);
      const post = L / 2;
      box(wood, x - Math.cos(ry) * post, level + 1.05, z + Math.sin(ry) * post, 0.13, 2.25, 0.48, ry);
      for (const s of [-1, 1]) {
        // 土塀の腰は板と横木。白い一枚の壁にせず、既存の石の段を見せる。
        if (true) box(wood, x + nx * s * .1, level + .48, z + nz * s * .1, L, .1, .08, ry);
        else box(wood, x + nx * s * .22, level + .55, z + nz * s * .22, L, .65, .06, ry);
        const brace = .1;
        box(0x4e3d2c, x + nx * s * brace, level + .88, z + nz * s * brace, L, .08, .07, ry);
        box(roof, x + nx * s * 0.3, level + 2.3, z + nz * s * 0.3, L + 0.04, 0.09, 0.72, ry, s * 0.35);
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
        // 折れ角では隣の辺との交点を使い、石の面の間に空を残さない。
        const join = (index, x, z) => {
          const v = poly[index], other = poly[(index + (index === j ? -1 : 1) + poly.length) % poly.length];
          const ex = other[0] - v[0], ez = other[1] - v[1], el = Math.hypot(ex, ez);
          let jx = -ez / el, jz = ex / el;
          if (jx * ((other[0] + v[0]) / 2 - k.x) + jz * ((other[1] + v[1]) / 2 - k.cz) < 0) { jx = -jx; jz = -jz; }
          const dot = Math.max(.25, 1 + jx * nx * out + jz * nz * out);
          return [x + (jx + nx * out) * .8 / dot, z + (jz + nz * out) * .8 / dot];
        };
        const sp = l === 0 ? join(j, ...p) : [p[0] + ox, p[1] + oz];
        const sq = u === 1 ? join((j + 1) % poly.length, ...q) : [q[0] + ox, q[1] + oz];
        // 下端を途中で切らず、張り出した足もとの山肌まで積む。
        // 一つの面の石の段は同じ高さから始め、坂の高い所は土へ埋める。
        let foot = k.level - (k === SANNOMARU ? 5 : 3.2);
        const samples = Math.max(2, Math.ceil((u - l) * len));
        for (let i = 0; i <= samples; i++) {
          const t = i / samples, x = sp[0] + (sq[0] - sp[0]) * t, z = sp[1] + (sq[1] - sp[1]) * t;
          for (const d of [0, 2.5, 5]) foot = Math.min(foot, W.heightAt(x + nx * out * d, z + nz * out * d) - 0.4);
        }
        // 高い石垣の裾は五メートルより外へ出る。その実際の張り出し先にも足を埋める。
        for (let pass = 0; pass < 4; pass++) {
          const toe = (k.level + .12 - foot) * .2 + .6, before = foot;
          for (let i = 0; i <= samples; i++) {
            const t = i / samples, x = sp[0] + (sq[0] - sp[0]) * t, z = sp[1] + (sq[1] - sp[1]) * t;
            foot = Math.min(foot, W.heightAt(x + nx * out * toe, z + nz * out * toe) - .4);
          }
          if (before - foot < .02) break;
        }
        const stoneGround = { heightAt: () => foot + 0.4, def: W.def };
        // 本丸側の中丸は合計5mの二段積み。中央の土橋と門は既存の開口を使う。
        if (k === NAKAMARU && j === 0) {
          const middle = k.level - 2.5;
          ishigaki(stoneGround, [[sp[0], sp[1] + 0.8], [sq[0], sq[1] + 0.8]], {
            topY: middle, minH: 2.5, maxH: 2.5, lean: 0.2, out, big: 1.8, noKit: true, batch: stones,
          });
          stoneCamera([sp[0], sp[1] + .8], [sq[0], sq[1] + .8], middle - 2.5, middle, out);
          foot = middle;
        }
        // 山王丸の石垣と中丸の正面は残し、屋敷の段と奥尾根は土の切岸を主にする。
        // 土の段は既存の地形へ任せ、石垣のある面だけを補う。
        const stoneFace = k === SANNOMARU || k === NAKAMARU;
        if (stoneFace) ishigaki(stoneGround, [sp, sq], {
          topY: k.level + 0.12, minH: 0, maxH: k.level + 0.12 - foot,
          // 大石の表に中央の頂点を残す。四隅だけ丸めると面全体が奥へ潰れ、薄板に見える。
          lean: 0.2, out, capIn: 0.95, big: k === SANNOMARU ? 2.2 : 1.5, faceSegments: 2, noKit: true, batch: stones,
        });
        if (stoneFace) stoneCamera(sp, sq, foot, k.level + .12, out);
        if (OKURIDGE.includes(k)) {
          const m = palisade(W, [...p, ...q], { h: 1.6, batch });
          if (!m.isBatchedPart) rt.scene.add(m);
          Object.assign(solidSeg(...p, ...q, 0.2), { missileH: 1.6, missileType: 'wood' });
        } else hei(p, q, k.level + 0.12 + (k === KYOGOKU && j === 1 ? 3 : 0));
        const count = Math.floor((u - l) * len / 5);
        for (let i = 0; i < count; i++) {
          const t = l + (u - l) * (i + 0.5) / count, x = a[0] + dx * t + ox, z = a[1] + dz * t + oz;
          // 苔を石の外面へ、草を天端のすき間へ。数は一辺数個に抑える。
          if (stoneFace) box(0x586046, x + nx * out * 0.32, k.level - 0.8 - (i % 3) * 0.5, z + nz * out * 0.32, 0.75, 0.28, 0.1, Math.atan2(-dz, dx));
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
  for (const [x, z, w, d] of [[-8, KYOGOKU.z1 - 7, 4.2, 3.6], [-7, KYOGOKU2.cz, 4.6, 3.2], [5.3, SANNOMARU.z1 - 6, 3.2, 3]])
    hut(W, x, z, w, d, 0, { ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch });
  // 最下段の外を回る細道。柵は中丸の石垣から離し、大堀切の土橋を空ける。
  const z0 = NAKAMARU.z0, z1 = NAKAMARU.z1;
  for (const s of [-1, 1]) {
    { const pal = palisade(W, [s * 14, z0, s * 14, z1 + 2], { h: 1.5, batch }); if (!pal.isBatchedPart) rt.scene.add(pal); }
    for (let z = z0 + 1; z < z1; z += 1) box(0x8c8066, s * 12.5, W.heightAt(s * 12.5, z) + 0.025, z, 1.15, 0.05, 1.05);
  }
  // 京極丸の祠と山王丸の社殿。高床・縁・正面の階・板の切妻を組む。
  const shrine = (x, z, w, d, h) => {
    const y = W.heightAt(x, z);
    solidRect(x, z, w, d, 0);
    box(wood, x, y + 0.65, z, w + 0.7, 0.18, d + 0.7);
    box(wood, x, y + 0.8 + h / 2, z, w, h, d);
    box(0x30271f, x, y + 0.8 + h * 0.4, z + d / 2 + 0.03, w * 0.5, h * 0.8, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * w / 2, pz = z + sz * d / 2, foot = Math.min(y, W.heightAt(px, pz)) - .12;
      box(wood, px, (foot + y + .8) / 2, pz, .17, y + .8 - foot, .17);
    }
    for (let i = 0; i < 3; i++) box(wood, x, y + 0.12 + i * 0.22, z + d / 2 + 1.05 - i * 0.3, w * 0.5, 0.22, 0.32);
    const rw = w / 2 + 0.6, rise = rw * 0.55, angle = Math.atan2(rise, rw);
    for (const s of [-1, 1]) {
      if (true) {
        // 主屋で直した板葺きを、まだ一枚続きだった社殿にも合わせる。
        // 三段の継ぎ目を互い違いにし、軒へ四センチ重ねる。既存の箱の束だけを使う。
        const length = d + 1.2, n = Math.ceil(length / .3);
        const slope = Math.hypot(rw, rise);
        for (let i = 0; i < n; i++) {
          const cuts = [0, .3 + (i % 2) * .06, .65 + (i % 2) * .06, 1];
          for (let j = 0; j < 3; j++) {
            const end = Math.min(1, cuts[j + 1] + .04 / slope), t = (cuts[j] + end) / 2;
            const seed = Math.floor(Math.abs(Math.sin(i * 127.1 + j * 311.7 + s * 43.3 + x)) * 1000);
            box([0x756b59, 0x80715b, 0x6c6252, 0x635b4e][seed % 4],
              x + s * rw * t, y + .8 + h + rise * (1 - t) + (2 - j) * .025,
              z - length / 2 + (i + .5) * length / n,
              slope * (end - cuts[j]), .075, length / n - .012, 0, 0, -s * angle);
          }
        }
        for (const t of [.32, .76]) box(wood, x + s * rw * t, y + .8 + h + rise * (1 - t) + .09,
          z, .09, .09, length + .08);
      } else box(roof, x + s * rw / 2, y + .8 + h + rise / 2, z, Math.hypot(rw, rise), .12, d + 1.2, 0, 0, -s * angle);
    }
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
  { const pal = palisade(W, [-SANNO2.hw + 2, SANNO2.z0, -3.3, SANNO2.z0], { h: 1.5, batch }); if (!pal.isBatchedPart) rt.scene.add(pal); }
  const lookout = { mon: 'azai', boarded: false, logFrame: true };
  monomi(rt, OKURIDGE[0].x + 3.8, OKURIDGE[0].cz, { ...lookout, team: 1, name: '奥の尾根の物見櫓' });
  monomi(rt, OKURIDGE[1].x, OKURIDGE[1].z0 + 3, { ...lookout, team: 1, name: '尾根先の物見櫓' });
  // 落ち葉・根元の草・露岩・倒れた枝を置く。黒い葉の玉を斜面に並べない。
  // 曲輪の段と石垣はそのまま残し、道と床は覆わない。組み立て時だけ作る。
  const leaves = [], rocks = [], roots = [], grasses = [], shadowPositions = [], shadowUvs = [];
  const onRoad = (x, z) => (W.def.paths || []).some((path) => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 4) return true;
    }
    return false;
  });
  for (let rowZ = 160; rowZ > SANNO2.z0 - 15; rowZ -= 9) {
    for (const side of [-1, 1]) for (let j = 0; j < 4; j++) {
      const z = rowZ + Math.sin(rowZ * .71 + j * 3 + side) * 3.4;
      // 株の数を増やさず清水谷から外の山肌まで散らし、黒い裸の斜面を減らす。
      const x = side * (27 + j * 22 + j * j * 2 + 4 * Math.sin(z * 0.13 + j));
      if (ODANI_PLAN.kuruwa.some((k) => Math.abs(x - k.x) < k.hw + 4 && z > k.z0 - 4 && z < k.z1 + 4)) continue;
      if (onRoad(x, z)) continue;
      // 携帯で本物の影を省いても、株の下に地面に沿う薄い影を残す。
      const shadowPoint = (px, pz, u, v) => {
        shadowPositions.push(px, W.heightAt(px, pz) + .012, pz); shadowUvs.push(u, v);
      };
      for (let n = 0; n < 8; n++) {
        const a = n * Math.PI / 4, b = (n + 1) * Math.PI / 4;
        shadowPoint(x, z, .5, .5);
        shadowPoint(x + Math.cos(b) * 1.15, z + Math.sin(b), .5 + Math.cos(b) * .5, .5 + Math.sin(b) * .5);
        shadowPoint(x + Math.cos(a) * 1.15, z + Math.sin(a), .5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5);
      }
      for (let n = 0; n < 6; n++) {
        const a = n * 2.4 + z, gx = x + Math.sin(a), gz = z + Math.cos(a) * .85;
        const h = .24 + (n % 3) * .06;
        for (const turn of [0, Math.PI / 2])
          grasses.push([gx, W.heightAt(gx, gz) + h / 2 - .025, gz, h, a + turn, n % 2 ? 0x303e32 : 0x394536]);
      }
      for (let n = 0; n < 5; n++) {
        const lx = x + Math.sin(n * 2.4 + z) * 0.85, lz = z + Math.cos(n * 2.4 + z) * 0.7;
        const size = 0.28 + 0.07 * (1 + Math.sin(z + n));
        leaves.push([lx, W.heightAt(lx, lz) + .015, lz, size, .018, size * 0.65, n + z]);
      }
      const rx = x + side * 1.2, rz = z + 2;
      const spread = .75 + .25 * Math.sin(z * .9 + j);
      rocks.push([rx, W.heightAt(rx, rz) - 0.12, rz, .85 * spread, .32 * spread, .6 * spread, z * 0.2]);
      // 短い根を曲げながら地面の高さへ合わせる。長い棒が斜面から浮かない。
      if (j === 1) for (let n = 0; n < 4; n++) {
        const ax = x + side * n * 0.6, az = z - 0.9 + Math.sin(n * 0.8 + z) * 0.22;
        const bx = x + side * (n + 1) * 0.6, bz = z - 0.9 + Math.sin((n + 1) * 0.8 + z) * 0.22;
        roots.push([ax, W.heightAt(ax, az) + 0.015, az, bx, W.heightAt(bx, bz) + 0.015, bz]);
      }
    }
  }
  const shadeCanvas = document.createElement('canvas'); shadeCanvas.width = shadeCanvas.height = 32;
  const shadeContext = shadeCanvas.getContext('2d'), gradient = shadeContext.createRadialGradient(16, 16, 2, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(8,15,18,0.32)'); gradient.addColorStop(1, 'rgba(8,15,18,0)');
  shadeContext.fillStyle = gradient; shadeContext.fillRect(0, 0, 32, 32);
  const shadeGeo = new THREE.BufferGeometry();
  shadeGeo.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
  shadeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(shadowUvs, 2));
  // 山全体で一つの面の束でも、見える小区画だけを同じ一回で描く。
  const cullSurface = (mesh) => {
    const count = mesh.geometry.attributes.position.count, indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    mesh.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    terrainView(mesh, 8, rt.scene);
    rt.scene.add(mesh);
  };
  cullSurface(new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadeCanvas), transparent: true, depthWrite: false })));
  const organicObj = new THREE.Object3D(), axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const leafColor = new THREE.Color(), leafTones = [0x6b5134, 0x796343, 0x544932, 0x665d3d];
  // 地面に寝かせた枯れ葉の輪郭。草と岩の間にも茶色の濃淡を残す。
  // 薄い落ち葉は八角の板にする。厚さの裏面を積まず、色と不揃いな輪郭を残す。
  const leafGeo = new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), lp = leafGeo.attributes.position;
  const leafColors = new Float32Array(lp.count * 3);
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
    const f = 0.9 + Math.sin(x * 9 + z * 5) * Math.cos(y * 7) * 0.12;
    lp.setXYZ(i, x * f, y * f, z * f);
    leafColor.setScalar(0.75 + Math.max(0, y) * 0.25).toArray(leafColors, i * 3);
  }
  // 輪郭と頂点色はそのまま、中心へ集めた八面を六面へ張り直す。
  // 枚数・配置・近景の形を減らさず、凹んだ輪郭も三角分割に任せる。
  const leafOutline = [];
  for (let i = 1; i <= 8; i++) leafOutline.push(new THREE.Vector2(lp.getX(i), -lp.getZ(i)));
  leafGeo.setIndex(THREE.ShapeUtils.triangulateShape(leafOutline, []).flat().map((i) => i + 1));
  leafGeo.setAttribute('color', new THREE.BufferAttribute(leafColors, 3));
  leafGeo.computeVertexNormals();
  for (const [list, geo, color] of [
    [leaves, leafGeo, 0xffffff],
    [rocks, rockShape(1, false, low ? 0 : 1), 0xffffff],
    [roots, new THREE.CylinderGeometry(0.075, 0.095, 1, 6), 0x4d3b2b],
  ]) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, vertexColors: list !== roots,
      side: list === leaves ? THREE.DoubleSide : THREE.FrontSide }), list.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (list === roots) {
        direction.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
        const length = direction.length();
        organicObj.position.set((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2);
        organicObj.quaternion.setFromUnitVectors(axis, direction.normalize()); organicObj.scale.set(1, length, 1);
      } else {
        // 葉と岩の底も斜面の向きへ合わせ、山側だけに刺さる浮いた形にしない。
        const gx = (W.heightAt(p[0] + 0.25, p[2]) - W.heightAt(p[0] - 0.25, p[2])) / 0.5;
        const gz = (W.heightAt(p[0], p[2] + 0.25) - W.heightAt(p[0], p[2] - 0.25)) / 0.5;
        direction.set(-gx, 1, -gz).normalize();
        organicObj.position.set(p[0], W.heightAt(p[0], p[2]), p[2]).addScaledVector(direction, list === rocks ? -0.08 : 0.018);
        organicObj.quaternion.setFromUnitVectors(axis, direction); organicObj.rotateY(p[6]); organicObj.scale.set(p[3], p[4], p[5]);
      }
      organicObj.updateMatrix(); mesh.setMatrixAt(i, organicObj.matrix);
      if (list === leaves) mesh.setColorAt(i, leafColor.setHex(leafTones[i % leafTones.length]));
    }
    mesh.castShadow = list !== leaves;
    mesh.receiveShadow = true; rt.scene.add(mesh);
    if (list === rocks && !low) {
      // 五十五メートル先の小石だけ割れ目を省く。岩の数・場所・色は同じ束から写す。
      // 近い岩と四十メートル内の影は元の細かい形を保つ。
      const farRocks = new THREE.InstancedMesh(rockShape(1, false, 0), mesh.material, list.length);
      farRocks.count = 0; farRocks.receiveShadow = true; farRocks.frustumCulled = false;
      farRocks.userData.noFreeze = true;
      mesh.userData.farFoliage = farRocks; rt.scene.add(farRocks);
    }
    // 小さな葉と根は近景だけ。岩は残し、画面の外だけ省く。
    W.viewCull([mesh], 0, list !== rocks ? 52 : Infinity);
  }
  // 石垣の外面に細い目地を付ける。部品は色ごとにまとめて描く。
  for (const k of [SANNOMARU]) for (const side of [-1, 1]) {
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
  // 色ごとに分けず、一つの束に一つずつの色を持たせる（色の数だけ描いていた。十六回 → 一回）
  const geo = new THREE.BoxGeometry(1, 1, 1), obj = new THREE.Object3D(), col = new THREE.Color();
  if (grasses.length) {
    // 細い草は厚みのある箱から両面の板へ。一枚十二面を二面にし、株の数と交差する向きは保つ。
    const grassGeo = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), grasses.length);
    for (let i = 0; i < grasses.length; i++) {
      const [x, y, z, h, ry, color] = grasses[i];
      obj.position.set(x, y, z); obj.rotation.set(0, ry, .18, 'YXZ'); obj.scale.set(.18, h, 1); obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix); mesh.setColorAt(i, col.setHex(color));
    }
    // 株の下の地面に沿う影は既存の束に残す。小さな草の実際の影は重ねない。
    mesh.receiveShadow = true; rt.scene.add(mesh);
    W.viewCull([mesh], 0, 52, false);
  }
  if (wornBoards.length) {
    // 板塀の地際三十センチだけ泥色にし、上は日褪せた灰茶にする。
    // 全ての板で形・材質を共有。三段の頂点色なので汚れの板を重ねない。
    const boardGeo = new THREE.BoxGeometry(1, 1, 1, 1, 3, 1), p = boardGeo.attributes.position;
    const tones = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + .5;
      const y = t < .2 ? -.5 : t < .5 ? -.36 : t < .8 ? .1 : .5;
      p.setY(i, y);
      col.setRGB(y < -.4 ? .47 : y < -.3 ? .79 : .97, y < -.4 ? .48 : y < -.3 ? .78 : .96, y < -.4 ? .42 : y < -.3 ? .7 : .9);
      tones.set([col.r, col.g, col.b], i * 3);
    }
    boardGeo.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
    const mesh = new THREE.InstancedMesh(boardGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), wornBoards.length);
    wornBoards.forEach(([x, y, z, w, h, d, ry, rx, rz, color], i) => {
      obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz, 'YXZ'); obj.scale.set(w, h, d); obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix); mesh.setColorAt(i, col.setHex(color));
    });
    mesh.userData.camNear = true;
    mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
    // 影の範囲より遠い板は、泥の細かな色分けだけを一段へまとめる。
    // 板の枚数・厚み・隙間は同じ。近い板とその影には元の三段を使う。
    const farGeo = new THREE.BoxGeometry(1, 1, 1), fp = farGeo.attributes.position;
    const farTones = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) {
      const bottom = fp.getY(i) < 0;
      col.setRGB(bottom ? .47 : .97, bottom ? .48 : .96, bottom ? .42 : .9);
      col.toArray(farTones, i * 3);
    }
    farGeo.setAttribute('color', new THREE.Float32BufferAttribute(farTones, 3));
    const farBoards = new THREE.InstancedMesh(farGeo, mesh.material, wornBoards.length);
    farBoards.count = 0; farBoards.receiveShadow = true; farBoards.frustumCulled = false;
    farBoards.userData.noFreeze = true;
    mesh.userData.farFoliage = farBoards; rt.scene.add(farBoards);
    // 近い影は残し、画面に入らない遠い板を同じ束から外す。
    W.viewCull([mesh], 55, Infinity, false);
  }
  let total = 0;
  for (const list of groups.values()) total += list.length;
  if (total) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), total);
    let n = 0;
    for (const [color, list] of groups) for (let i = 0; i < list.length; i++) {
      const [x, y, z, w, h, d, ry, rx, rz] = list[i];
      obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz, 'YXZ'); obj.scale.set(w, h, d); obj.updateMatrix();
      mesh.setMatrixAt(n, obj.matrix); mesh.setColorAt(n, col.set(color)); n++;
    }
    mesh.userData.camNear = true; // 土塀の近い面だけ、共通の透かしで戦場を空ける。
    mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
    // 上段全体の板塀・屋根・草を毎回描かず、見える部品だけ同じ束へ詰める。
    // 五十五メートル内は画面の外も影のために残し、遠い塀も密度を変えない。
    W.viewCull([mesh], 55, Infinity, false);
  }
}
