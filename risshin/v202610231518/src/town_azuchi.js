// 安土の城下専用。寸法と配置は推定。町を建てる時だけ形を作り、更新はしない。
import * as THREE from 'three';
import { ishigaki } from './props.js';
import { S as SETTINGS } from './settings.js';

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 地理院の一メートル標高を読んだ値。大手口九十メートルを町の台の四メートルへ合わせる。
// 本丸の見込み（南東）・天主台の周囲・天主台。中心、幅、奥行き、上面、向きの余弦・正弦。
// 湖と町を保つため南北の距離は圧縮する。平場の寸法と約百七メートルの比高は保つ。
const TIERS = [[10, 150, 126, 49, 101.3, .5, -Math.sqrt(3) / 2], [-48, 199, 62, 36, 105.5, 1, 0], [-48, 199, 24, 20, 110.8, 1, 0]];
const OTE = [[0, 80], [0, 200], [-36, 200]];
export function azuchiGround(x, z, ground) {
  if (z >= 76) {
    const foot = smooth(80, 195, z);
    const flank = (1 - smooth(45, 80, Math.abs(x))) * (1 - smooth(205, 220, z));
    const base = (4 + 92 * foot) * flank;
    let hill = base;
    for (const [cx, cz, w, d, top, c, s] of TIERS) {
      const dx = x - cx, dz = z - cz;
      const edge = Math.min(w / 2 - Math.abs(dx * c + dz * s), d / 2 - Math.abs(dz * c - dx * s));
      hill = Math.max(hill, base + (top - base) * smooth(-8, 0, edge));
    }
    ground = Math.max(ground, hill * smooth(70, 86, z));
  }
  // 湖岸と城下の運河。歩ける町と施設の外に置く。
  if (x < -80 || z > 220) ground = -1.2;
  if (x > 67 && x < 75 && z > -90 && z < 225) ground = -1.2;
  return ground;
}

export function azuchiBuilt(def) {
  // 1579年に天主完成。1582年六月中旬の焼失後は再建しない。
  if (def.year < 1579 || def.year > 1582) return false;
  if (def.year < 1582) return true;
  if (/春|(?:正|一|二|三|四|五)月/.test(def.when)) return true;
  // 本能寺の変の六月二日にはまだある。月だけで焼失後と決めない。
  const day = String(def.when || '').match(/六月([一二三四五六七八九十]+)日/);
  if (!day) return false;
  const nums = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const [tens, ones] = day[1].split('十');
  const date = day[1].includes('十') ? (nums[tens] || 1) * 10 + (nums[ones] || 0) : nums[tens];
  return date < 14;
}

export function buildAzuchi(rt, def, kb, add, shapes) {
  const { box, cyl, tri, mergeAll, material } = shapes, W = rt.world, parts = [];
  const gold = 0xc6a34e, wood = 0x26221f, tile = 0x45494b;
  // 広い下層の入母屋と、小さな望楼。五層六階で、下の一層に二階を収める。
  const roof = (x, z, y, w, d, gable = false, gilded = false) => {
    const rise = gable ? 2.2 : 1.25, half = d / 2 + .8;
    const len = Math.hypot(half, rise), angle = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      parts.push(box(w + 1.6, .2, len, x, y + rise / 2, z + s * half / 2, tile, { rx: s * angle }));
      if (gable) {
        const gx = x + s * (w / 2 + .25);
        parts.push(tri([gx, y, z - half], [gx, y, z + half], [gx, y + rise, z], wood));
        for (const side of [-1, 1]) parts.push(box(.22, .22, len, gx, y + rise / 2, z + side * half / 2, gilded ? gold : wood, { rx: side * angle }));
      }
    }
    parts.push(box(w + 1.8, .2, .22, x, y + rise, z, gilded ? gold : tile));
    return rise;
  };
  const stone = (pts, y, h = 5) => add(ishigaki(W, pts, { topY: y, minH: h, maxH: h, out: -1, big: 2, kind: 'nozura', noKit: true, batch: kb }));
  // 本丸の北西は上の平場へつなぐ。巨大な三段の石垣にはせず、縁だけを積む。
  const [cx, cz, w, d, top, c, s] = TIERS[0];
  const corner = (x, z) => [cx + x * c - z * s, cz + x * s + z * c];
  const front = cz - (d / 2 + cx * s) / c;
  stone([corner(-w / 2, -d / 2), [-4, front - 4 * s / c]], top + .2, 9.5);
  stone([[4, front + 4 * s / c], corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)], top + .2, 9.5);
  stone([[-17, 196], [-17, 181], [-79, 181], [-79, 217], [-17, 217], [-17, 204]], 105.7, 4.2);
  stone([[-36, 204], [-36, 209], [-60, 209], [-60, 189], [-36, 189], [-36, 196]], 110.8, 5.3);
  // 麓から北へ百二十メートル直進し、西へ折れて天主台の東口に届く。
  // 段の上面を両端の高い方へ合わせ、格子の坂へ沈まないようにする。町を建てる時だけ作る。
  for (let i = 1; i < OTE.length; i++) {
    const [ax, az] = OTE[i - 1], [bx, bz] = OTE[i];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len), step = len / n;
    for (let j = 0; j < n; j++) {
      const a = j / n, b = (j + 1) / n, t = (a + b) / 2;
      const ya = W.heightAt(ax + dx * a, az + dz * a), yb = W.heightAt(ax + dx * b, az + dz * b);
      const h = Math.max(.35, Math.abs(yb - ya) + .35), top = Math.max(ya, yb) + .1;
      parts.push(box(8, h, step + .05, ax + dx * t, top - h / 2, az + dz * t, 0x8c877b, { ry: Math.atan2(dx, dz) }));
    }
  }
  const house = (x, z, w, d) => {
    const y = W.heightAt(x, z);
    parts.push(box(w, 3, d, x, y + 1.5, z, 0x594334));
    roof(x, z, y + 3, w, d, true);
    for (const s of [-1, 1]) parts.push(box(.25, 1.8, d + 5, x + s * (w / 2 + 2), y + .9, z, 0x826e53));
    parts.push(box(w + 4, 1.8, .25, x, y + .9, z + d / 2 + 2.5, 0x826e53));
  };
  // 道の両脇に家臣屋敷。城内の西側に摠見寺の堂と三重塔。
  for (const z of [98, 118]) for (const s of [-1, 1]) house(s * 19, z, 12, 7);
  if (def.year >= 1579) {
    house(-23, 148, 14, 10);
    let y = W.heightAt(-24, 173);
    for (let i = 0; i < 3; i++) {
      const w = 5.2 - i * .65;
      parts.push(box(w, 2.6, w, -24, y + 1.3, 173, 0x6a3f2c));
      y += 2.6 + roof(-24, 173, y + 2.6, w, w);
    }
    parts.push(cyl(.08, .08, 3.5, -24, y + 1.75, 173, 0x594838, 6));
  }
  const x = TIERS[2][0], z = TIERS[2][1], y0 = TIERS[2][4];
  if (azuchiBuilt(def)) {
    let y = y0;
    const layers = [[18, 15, 7, wood], [17, 14, 4.4, wood], [15, 12, 4, wood], [8.8, 8.8, 4, 0x9e3329], [7.2, 6.6, 3.5, gold]];
    for (const [i, [w, d, h, col]] of layers.entries()) {
      if (i === 3) {
        const g = cyl(w / 2, w / 2, h, 0, 0, 0, col, 8);
        g.rotateY(Math.PI / 8);
        g.translate(x, y + h / 2, z);
        parts.push(g);
      } else parts.push(box(w, h, d, x, y + h / 2, z, col));
      if (i === 3) {
        const face = w / 2 * Math.cos(Math.PI / 8);
        for (const side of [-1, 1]) {
          parts.push(box(.8, 1, .08, x, y + h / 2, z + side * (face + .04), 0x121310));
          parts.push(box(.08, 1, .8, x + side * (face + .04), y + h / 2, z, 0x121310));
        }
      } else for (const dy of (i === 0 ? [2, 5.4] : [h / 2])) for (const s of [-1, 1]) for (const offset of [-.27, 0, .27]) {
        parts.push(box(.8, 1, .08, x + offset * w, y + dy, z + s * (d / 2 + .04), 0x121310));
        if (i !== 3) parts.push(box(.08, 1, .8, x + s * (w / 2 + .04), y + dy, z + offset * d, 0x121310));
      }
      y += h + roof(x, z, y + h, w, d, i === 1 || i === 2 || i === 4, true);
    }
  }
  // 水は動かさない一枚の面。湖・運河を同じ束へ入れる。
  parts.push(box(130, .08, 370, -145, -.25, 65, 0x405d68));
  parts.push(box(330, .08, 60, 20, -.25, 250, 0x405d68));
  parts.push(box(8, .08, 310, 71, -.25, 65, 0x405d68));
  const geometry = mergeAll(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; rt.scene.add(mesh);
}
