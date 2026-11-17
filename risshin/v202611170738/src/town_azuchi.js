// 安土の城下専用。寸法と配置は推定。町を建てる時だけ形を作り、更新はしない。
import * as THREE from 'three';
import { ishigaki, solidRect, solidSeg } from './props.js';
import { S as SETTINGS } from './settings.js';

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 地理院の一メートル標高を読んだ値。大手口九十メートルを町の台の四メートルへ合わせる。
// 本丸の見込み（南東）・天主台の周囲・天主台。中心、幅、奥行き、上面、向きの余弦・正弦。
// 湖と町を保つため南北の距離は圧縮する。平場の寸法と約百七メートルの比高は保つ。
// 本丸の見込みは百五十×百二十六だと南の角が町の門の前（z 九十五）まで張り出し、高さ百の壁になった（11/11 クラウドわ）。
// 本丸・二の丸の平場ほどの六十×四十四にし、平場の外は一対一・五の斜面で下ろす。
const TIERS = [[10, 180, 60, 44, 101.3, .5, -Math.sqrt(3) / 2], [-48, 199, 62, 36, 105.5, 1, 0], [-48, 199, 24, 20, 110.8, 1, 0]];
// 大手道。麓から本丸の前まで七十mで八十m上る斜面を一直線に登ると、町から急な梯子に見えた（11/11 クラウドふ）。
// 屋敷の間をつづら折りで登り（勾配は二分の一ほど）、本丸の前から北へ、西へ折れて天主台の東口へ。
const OTE = [[0, 79], [-13, 84], [13, 97], [-13, 111], [13, 125], [-13, 139], [8, 150], [0, 154], [0, 200], [-36, 200]];
const OTE_W = 6;
// つづら折りの所の斜面は平らな一枚の坂にそろえる（折れの道が斜面に沿う）。
const ZIG = (x, z) => (1 - smooth(16, 26, Math.abs(x))) * smooth(78, 84, z) * (1 - smooth(150, 158, z));
const zigPlane = (z) => Math.min(105.5, 16 + (101.3 - 16) * (z - 80) / 72);
let OTE_H = null;
const segNear = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return [Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t];
};
const TERRACES = [[28, 98, 9, 6.5], [-28, 98, 9, 6.5], [28, 118, 9, 6.5], [-28, 118, 9, 6.5], [-23, 148, 10, 8], [-24, 173, 5, 5]];
export function azuchiGround(x, z, ground, raw = false) {
  let hill = 0;
  if (z >= 76) {
    const foot = smooth(80, 195, z);
    const flank = (1 - smooth(45, 80, Math.abs(x))) * (1 - smooth(205, 220, z));
    const base = (4 + 92 * foot) * flank;
    hill = base;
    for (const [cx, cz, w, d, top, c, s] of TIERS) {
      const dx = x - cx, dz = z - cz;
      const edge = Math.min(w / 2 - Math.abs(dx * c + dz * s), d / 2 - Math.abs(dz * c - dx * s));
      // 平場の縁から外へ一対一・五で下る。縁の四メートルは丸める（崖の柱にしない）。
      const out = Math.max(0, -edge), drop = out < 4 ? out * out * 3 / 16 : (out - 2) * 1.5;
      hill = Math.max(hill, top - drop);
    }
    const zw = ZIG(x, z);
    if (zw > 0) hill += (Math.min(zigPlane(z), Math.max(hill, 101.3)) - hill) * zw;
    hill *= smooth(70, 86, z);
    // 大手道の脇の家臣屋敷・摠見寺は段の平場に建つ。斜面を屋敷ごとに平らに削る（台の柱を立てない）。
    if (!raw) for (const [hx, hz, hw, hd] of TERRACES) {
      const e = Math.min(hw - Math.abs(x - hx), hd - Math.abs(z - hz));
      if (e > -6) { const t = smooth(-6, 0, e); hill += (azuchiGround(hx, hz, 0, true) - hill) * t; }
    }
    // 道の幅と肩を道の高さで平らに切る（折れの道が斜面に傾かない）。
    if (!raw && z < 210) {
      OTE_H ||= OTE.map(([px, pz]) => azuchiGround(px, pz, 0, true));
      let best = 0, bh = hill;
      for (let i = 1; i < OTE.length; i++) {
        const [d, t] = segNear(x, z, OTE[i - 1], OTE[i]);
        const w = 1 - smooth(OTE_W / 2 + 1, OTE_W / 2 + 3, d);
        if (w > best) { best = w; bh = OTE_H[i - 1] + (OTE_H[i] - OTE_H[i - 1]) * t; }
      }
      if (best > 0) hill += (bh - hill) * best;
    }
    ground = Math.max(ground, hill);
  }
  // 湖岸と城下の運河。歩ける町と施設の外に置く。西の湖は山の裾が下りきった所から（縁で崖を立てない）。
  if ((x < -80 && hill < 2) || z > 220) ground = -1.2;
  if (x > 67 && x < 75 && z > -90 && z < 225 && hill < 2) ground = -1.2;
  return ground;
}

// 山の斜面（平場・大手道・屋敷・寺の外）は木を生やす。禿げ山の白い塊に見えていた（11/11 クラウドわ）。
export function azuchiWild(x, z) {
  if (z < 88 || azuchiGround(x, z, 0) < 8) return false;
  for (let i = 1; i < OTE.length; i++) if (segNear(x, z, OTE[i - 1], OTE[i])[0] < OTE_W / 2 + 3) return false;
  if (z > 193 && z < 207 && x > -42 && x < 8) return false;
  for (const [cx, cz, w, d, , c, s] of TIERS) {
    const dx = x - cx, dz = z - cz;
    // 平場の縁から八m を空けると、町から見上げる本丸の下の斜面が丸ごと木の無い灰色の面になった。石垣の際の四m だけ空ける（11/11 クラウドわ）。
    if (Math.min(w / 2 - Math.abs(dx * c + dz * s), d / 2 - Math.abs(dz * c - dx * s)) > -4) return false;
  }
  // 屋敷の段は石の台の外へ二m まで空ける。半径十二の円で空けると、大手道の左右が町から見上げて木の無い灰色の面になった（11/11 クラウドわ）。
  return !TERRACES.some(([hx, hz, hw, hd]) => Math.abs(x - hx) < hw + 2 && Math.abs(z - hz) < hd + 2.5);
}
export const AZUCHI_GROVES = [[38, 98, 8], [-38, 100, 8], [40, 135, 10], [-42, 165, 8], [45, 112, 12], [56, 150, 12], [-48, 128, 14], [-62, 160, 10], [-90, 190, 10], [34, 214, 10], [-82, 120, 10],
  // 大手道の両脇、屋敷の段の間の斜面。町から見上げると正面だけ灰色の岩肌の壁に見えていた（11/11 クラウドせ）。
  [-26, 135, 5], [26, 138, 5], [-38, 125, 7], [38, 128, 7]].map(([x, z, r]) => ({ x, z, r, n: 12 })).concat(
  // 屋敷の段と段の間・段の外の斜面（大手道と段の石の台にはかからない幅）。山の木はまばらに散って、町から見た大手道の左右が禿げていた（11/11 クラウドわ）。
  [[28, 108, 2.4, 3, 10], [-28, 108, 2.4, 3, 10], [42, 108, 5, 1, 12], [-42, 110, 5, 1, 12], [26, 130, 3, 2.4, 12], [-26, 130, 2.6, 2.4, 10], [39, 92, 4, 1, 8], [-39, 92, 4, 1, 8], [24, 87.5, 2.6, 3.2, 10], [-26, 87.5, 2.6, 3.2, 10]]
    .map(([x, z, r, sx, n]) => ({ x, z, r, sx, n })));

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
  // 麓から屋敷の間をつづら折りで登り、本丸の前から北へ、西へ折れて天主台の東口に届く。
  // 段の上面を両端の高い方へ合わせ、格子の坂へ沈まないようにする。町を建てる時だけ作る。
  for (let i = 1; i < OTE.length; i++) {
    const [ax, az] = OTE[i - 1], [bx, bz] = OTE[i];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len), step = len / n;
    for (let j = 0; j < n; j++) {
      const a = j / n, b = (j + 1) / n, t = (a + b) / 2;
      const ya = W.heightAt(ax + dx * a, az + dz * a), yb = W.heightAt(ax + dx * b, az + dz * b);
      const h = Math.max(.35, Math.abs(yb - ya) + .35), top = Math.max(ya, yb) + .1;
      const ry = Math.atan2(dx, dz), up = yb >= ya ? a : b;
      // 町から見上げると段の無い灰色の帯だった。石の色を段ごとに揺らし、段鼻に影の筋、両脇に側溝の石を置く（11/11 クラウドす）。
      parts.push(box(OTE_W, h, step + .05, ax + dx * t, top - h / 2, az + dz * t, [0x8c877b, 0x7f7a6e, 0x96907f][(j * 7) % 3], { ry }));
      parts.push(box(OTE_W - .4, .16, .12, ax + dx * up, top - .1, az + dz * up, 0x4a463e, { ry }));
      for (const sd of [-1, 1]) parts.push(box(.7, h + .35, step + .05, ax + dx * t + sd * (OTE_W / 2 + .35) * Math.cos(ry), top - h / 2 + .17, az + dz * t - sd * (OTE_W / 2 + .35) * Math.sin(ry), 0x5e594f, { ry }));
    }
  }
  const house = (x, z, w, d) => {
    // 斜面の屋敷は高い角に床を合わせ、低い側は石積みの台で受ける（宙に浮かせない）。
    const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => W.heightAt(x + a * (w / 2 + 2), z + b * (d / 2 + 2.5)));
    const y = Math.max(...hs), lo = Math.min(...hs);
    if (y - lo > .3) parts.push(box(w + 4.4, y - lo + .6, d + 5.4, x, (y + lo) / 2 - .3, z, 0x77736a));
    parts.push(box(w, 3, d, x, y + 1.5, z, 0x594334));
    roof(x, z, y + 3, w, d, true);
    for (const s of [-1, 1]) parts.push(box(.25, 1.8, d + 5, x + s * (w / 2 + 2), y + .9, z, 0x826e53));
    parts.push(box(w + 4, 1.8, .25, x, y + .9, z + d / 2 + 2.5, 0x826e53));
  };
  // 道の両脇に家臣屋敷。城内の西側に摠見寺の堂と三重塔。
  for (const z of [98, 118]) for (const s of [-1, 1]) house(s * 28, z, 12, 7);
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
  // 天主だけ別の束へ分ける（下で霞を薄める）。
  const keepFrom = parts.length;
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
  const keep = parts.splice(keepFrom);
  // セミナリヨ（天正八年、信長が与えた城下の地に建つ。三階の和風の建物で、屋根は城と同じ瓦。
  // 出典：ふろいす『日本史』第二部、『耶蘇会士日本通信』おるがんてぃのの天正八年の書簡。位置と寸法は推定）。
  // 町の東、運河の向こう岸に置き、町の通りから川越しに見せる。焼けた後の安土には建てない。
  if (def.year >= 1580 && azuchiBuilt(def)) {
    const sx = 92, sz = 12, white = 0xd8d1bf, post = 0x3a2c22;
    const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => W.heightAt(sx + a * 9, sz + b * 7));
    let y = Math.max(...hs) + .4;
    const lo = Math.min(...hs);
    parts.push(box(19, y - lo + .5, 15, sx, (y + lo) / 2 - .25, sz, 0x7d776c));
    for (const [w, d, h] of [[14, 10, 3.4], [11, 8, 3], [7.5, 6, 2.8]]) {
      parts.push(box(w, h, d, sx, y + h / 2, sz, white));
      // 柱と長押を黒い木で見せる（白壁だけの箱にしない）。
      for (const t of [-.5, -.25, 0, .25, .5]) for (const s of [-1, 1]) parts.push(box(.22, h, .1, sx + t * w, y + h / 2, sz + s * (d / 2 + .05), post));
      for (const s of [-1, 1]) parts.push(box(.1, h, .22, sx + s * (w / 2 + .05), y + h / 2, sz, post));
      parts.push(box(w + .2, .22, d + .2, sx, y + h * .72, sz, post));
      y += h + roof(sx, sz, y + h, w, d, true) * .55;
    }
    // 西の運河側の入口と、周りを囲む低い塀（中ほどを門として空ける）。
    const g = W.heightAt(sx - 8, sz);
    parts.push(box(.2, 2.2, 2.4, sx - 7.1, Math.max(g, lo) + 1.1, sz, post));
    for (const [x0, z0, x1, z1] of [[80, 1, 80, 9], [80, 15, 80, 23], [80, 23, 104, 23], [104, 23, 104, 1], [104, 1, 80, 1]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gy = W.heightAt(mx, mz);
      parts.push(box(x0 === x1 ? .5 : len + .5, 1.8, x0 === x1 ? len + .5 : .5, mx, gy + .9, mz, 0xcfc6b0));
      parts.push(box(x0 === x1 ? .9 : len + .9, .14, x0 === x1 ? len + .9 : .9, mx, gy + 1.87, mz, tile));
      solidSeg(x0, z0, x1, z1, .3);
    }
    solidRect(sx, sz, 19, 15);
  }
  // 水は動かさない一枚の面。湖・運河を同じ束へ入れる。
  parts.push(box(130, .08, 370, -145, -.25, 65, 0x405d68));
  parts.push(box(330, .08, 60, 20, -.25, 250, 0x405d68));
  parts.push(box(8, .08, 310, 71, -.25, 65, 0x405d68));
  const geometry = mergeAll(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; rt.scene.add(mesh);
  // 町の門から天主まで約二百八十m。霧の端（三百二十m）の手前で霞が八割に達し、通りから見上げた天主が白い影にしか見えなかった（11/11 クラウドせ）。
  // 天主の束だけ霞を六割に抑え、晴れた日に山上の金と朱の五層が通りから読めるようにする。描く遠さ・形の数は変えず、描く回数が一つ増えるだけ。
  if (keep.length) {
    const tm = material.clone();
    tm.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
        'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor * 0.6 );'));
    };
    tm.customProgramCacheKey = () => 'azuchiTenshu';
    const tg = mergeAll(keep);
    for (const g of keep) g.dispose();
    const tmesh = new THREE.Mesh(tg, tm); tmesh.castShadow = true; rt.scene.add(tmesh);
  }
}
