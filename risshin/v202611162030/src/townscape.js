// 城下の端：道沿いの家並み、塀の屋敷、作事場と田畑。戦場と歩く町で共用する。
import * as THREE from 'three';
import { hut, solidRect, solidSeg, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { S as SETTINGS } from './settings.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOF = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
// 遠村用の切妻。棟を長辺へ通し、四角錐と同じ八枚の三角で輪郭を作る。
const VILLAGE_ROOF = new THREE.BufferGeometry();
{
  const v = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [-.5, .5, 0], [.5, .5, 0]];
  const faces = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2], [0, 1, 2], [0, 2, 3]];
  VILLAGE_ROOF.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap(face => face.flatMap(i => v[i])), 3));
  VILLAGE_ROOF.computeVertexNormals();
}
const LOG = new THREE.CylinderGeometry(1, 1, 1, 6);
const MAT = new THREE.MeshStandardMaterial({ roughness: 1 });
const SOIL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
let FENCE_MAT = null;
function fenceMat() {
  if (FENCE_MAT) return FENCE_MAT;
  // 三間弱の面に縦板六枚。板目と雨垂れは絵で付け、塀の面数を増やさない。
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 128;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const tone = 103 + i * 17 % 25, xx = i * 32;
    ctx.fillStyle = `rgb(${tone + 14},${tone + 5},${tone - 12})`; ctx.fillRect(xx, 0, 32, 128);
    ctx.fillStyle = '#463f32'; ctx.fillRect(xx, 0, 1, 128);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? 'rgba(42,35,26,.2)' : 'rgba(206,190,156,.13)';
      ctx.fillRect(xx + 3 + (i * 7 + k * 11) % 27, 0, 1, 128);
    }
    const wet = ctx.createLinearGradient(0, 70 + i * 7 % 23, 0, 128);
    wet.addColorStop(0, 'rgba(36,37,25,0)'); wet.addColorStop(1, 'rgba(36,37,25,.5)');
    ctx.fillStyle = wet; ctx.fillRect(xx, 0, 32, 128);
  }
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  FENCE_MAT = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: .018, roughness: 1 });
  return FENCE_MAT;
}
let TIMBER = null;
function timberMat() {
  if (TIMBER) return TIMBER;
  // 円柱の側面は樹皮、両端は木口。側面と木口を一つの材質で描く。
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#776b55'; ctx.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = k % 3 ? '#655b48' : '#94816a';
    ctx.fillRect(k * 3.2, (k * 17) % 29, 1 + k % 2, 96);
  }
  ctx.fillStyle = '#c3a87b'; ctx.fillRect(0, 96, 128, 32);
  for (let k = 1; k < 6; k++) {
    ctx.strokeStyle = k % 2 ? '#a68b62' : '#b19870';
    ctx.beginPath(); ctx.ellipse(64, 112, k * 10.5, k * 2.6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = LOG.clone(), uv = geometry.attributes.uv, normal = geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) uv.setY(i, Math.abs(normal.getY(i)) < .5 ? uv.getY(i) * .72 : .76 + uv.getY(i) * .23);
  TIMBER = { geometry, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }) };
  return TIMBER;
}

export function townscape(rt, x, z, rot = 0, outskirts = false) {
  const W = rt.world, c = Math.cos(rot), s = Math.sin(rot), batch = makeSimpleBatch(), high = true;
  const boxes = [], walls = [], logs = [], roofs = [], positions = [], colors = [];
  const point = (a, b) => [x + a * c + b * s, z - a * s + b * c];
  const add = (a, b, w, h, d, col, lift = 0, angle = 0, pitch = 0, wall = false) => {
    const [px, pz] = point(a, b);
    (wall ? walls : boxes).push({ x: px, y: W.heightAt(px, pz) + h / 2 + lift, z: pz, w, h, d, col, rot: rot + angle, pitch });
  };
  const house = (a, b, angle, ita = true, w = 7, d = 5, shop = false, residence = false) => {
    const [px, pz] = point(a, b);
    if (!shop && !residence) { hut(W, px, pz, w, d, rot + angle, { ita, batch, thatchTies: true }); return; }
    // 小屋の棟は奥行き方向。寸法を入れ替えて回し、道に長い軒を向ける。
    hut(W, px, pz, d, w, rot + angle + Math.PI / 2, { ita, batch, thatchTies: true, boardRoof: true, weatheredBoards: residence, minka: !residence });
    let base = W.heightAt(px, pz);
    for (const u of [-w / 2, w / 2]) for (const v of [-d / 2, d / 2]) {
      const [xx, zz] = point(a + u * Math.cos(angle) + v * Math.sin(angle), b - u * Math.sin(angle) + v * Math.cos(angle));
      base = Math.max(base, W.heightAt(xx, zz));
    }
    const front = (u, v, bw, bh, bd, col, lift, pitch = 0) => {
      const aa = a + u * Math.cos(angle) + v * Math.sin(angle), bb = b - u * Math.sin(angle) + v * Math.cos(angle);
      const [xx, zz] = point(aa, bb);
      add(aa, bb, bw, bh, bd, col, lift + base - W.heightAt(xx, zz), angle, pitch);
    };
    if (residence) {
      // 屋敷は長い軒を庭へ向ける。腰板・白土の壁・閉じた建具を縁側の奥へ収める。
      front(0, d / 2 + .1, w - .35, 1.05, .12, 0xb8ae96, 1.42);
      front(0, d / 2 + .11, w - .35, .72, .13, 0x6e5941, .3);
      for (const u of [-w * .28, 0, w * .28]) {
        front(u, d / 2 + .2, 1.15, 1.85, .1, 0x96846a, .42);
        for (const du of [-.5, .5]) front(u + du, d / 2 + .27, .06, 1.9, .06, 0x4e402f, .4);
      }
      for (let j = 0; j < 3; j++) front(0, d / 2 + .18 + j * .28, w + .15, .12, .265, j % 2 ? 0x736048 : 0x806b50, .34);
      for (const u of [-w / 2 + .12, 0, w / 2 - .12]) {
        front(u, d / 2 + .72, .17, .34, .17, 0x4e402f, 0);
        front(u, d / 2 + .72, .12, 2.3, .12, 0x594631, .46);
      }
      front(0, d / 2 + .4, w + .55, .12, 1.2, 0x79654a, 2.75, .22);
      front(0, d / 2 + 1.02, 1.5, .17, .4, 0x82765f, 0);
      const [xx, zz] = point(a + Math.sin(angle) * (d / 2 + .42), b + Math.cos(angle) * (d / 2 + .42));
      solidRect(xx, zz, w + .2, .85, rot + angle);
      return;
    }
    // 腰板の上に小さな格子窓と板戸。暗い面を壁へ重ね、屋内は作らない。
    front(-w * .22, d / 2 + .07, w * .3, .85, .08, 0x302b22, 1.12);
    for (let j = 0; j < 5; j++) front(-w * .22 + (j - 2) * w * .055, d / 2 + .13, .055, .9, .06, 0x77634a, 1.1);
    front(w * .23, d / 2 + .09, 1.25, 1.9, .1, 0x67523a, .22);
    for (const u of [-.4, 0, .4]) front(w * .23 + u, d / 2 + .15, .035, 1.9, .045, 0x42392b, .22);
    front(0, d / 2 + .48, w + .45, .12, 1.15, 0x79654a, 2.28, .22);
    for (const u of [-w / 2 + .15, w / 2 - .15]) front(u, d / 2 + .85, .12, 2.2, .12, 0x53432f, .05);
  };
  // 小さな面を地形へ沿わせる。田も畦も斜面から浮かせない。
  const surface = (a, b, w, d, hex, lift = .035) => {
    const color = new THREE.Color(hex), nx = Math.ceil(w / 2.5), nz = Math.ceil(d / 2.5);
    const vertex = (u, v) => {
      const [px, pz] = point(a - w / 2 + u * w / nx, b - d / 2 + v * d / nz);
      positions.push(px, W.heightAt(px, pz) + lift, pz); colors.push(color.r, color.g, color.b);
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      vertex(i, j); vertex(i, j + 1); vertex(i + 1, j);
      vertex(i + 1, j); vertex(i, j + 1); vertex(i + 1, j + 1);
    }
  };
  const fence = (a, b, aa, bb) => {
    const n = Math.ceil(Math.hypot(aa - a, bb - b) / 3);
    for (let i = 0; i < n; i++) {
      const u = a + (aa - a) * (i + .5) / n, v = b + (bb - b) * (i + .5) / n;
      const len = Math.hypot(aa - a, bb - b) / n;
      add(u, v, len + .05, 1.65, .18, high ? 0xffffff : 0x716451, 0, -Math.atan2(bb - b, aa - a), 0, high);
      add(u, v, len + .15, .12, .38, 0x4f493c, 1.65, -Math.atan2(bb - b, aa - a));
      if (high) {
        // 下端の湿りと柱で、均一な一枚板の塀を崩す。
        const angle = -Math.atan2(bb - b, aa - a);
        add(u, v, len, .23, .2, 0x514a3b, 0, angle);
        add(a + (aa - a) * i / n, b + (bb - b) * i / n, .16, 1.85, .22, 0x514230);
      }
    }
    const A = point(a, b), B = point(aa, bb); solidSeg(...A, ...B, .2);
  };
  if (!outskirts) {
    // 散らした村ではなく、六間ほどの通りへ軒を向ける町家。
    surface(0, 0, 6, 44, 0x796b53);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      // 高では同じ八軒を二組の家並みに寄せ、真ん中だけ横路地を空ける。
      const b = high ? [-16, -8.1, 3.1, 11][i] : -16 + i * 10.5;
      house(side * 6.5, b, -side * Math.PI / 2, i !== 3, i % 2 ? 7 : 6, 5, high);
    }
    if (high) {
      surface(0, -2.5, 22, 3.2, 0x918066, .055);
      // 土の路肩と、戸口まで踏み固めた短い道。通りの幅は保つ。
      for (const side of [-1, 1]) {
        surface(side * 3.25, 0, .45, 44, 0x605a46, .06);
        for (const b of [-16, -8.1, 3.1, 11]) surface(side * 3.65, b, 1.6, 1.8, 0x9b8c71, .075);
        // 家の背後を細い敷地に分ける。横路地と屋敷の門前は空ける。
        // 裏の囲いは腰までの板塀。既存の箱の束へ入れ、描く回数を増やさない。
        for (const [i, b] of [-16, -8.1, 3.1, 11].entries()) {
          const width = i % 2 ? 7 : 6, a = side * 10.65;
          surface(a, b, 2.5, width - .3, i % 2 ? 0x81765b : 0x71674e, .06);
          for (const db of [-width / 2, width / 2]) {
            add(a, b + db, 2.8, 1, .1, 0xd4c8af, 0, 0, 0, true);
            for (const da of [-1.3, 1.3]) add(a + da, b + db, .12, 1.15, .12, 0x514634);
            const A = point(a - 1.4, b + db), B = point(a + 1.4, b + db);
            solidSeg(...A, ...B, .12);
          }
          // 裏戸に相当する一間弱の隙間を残す。
          for (const sd of [-1, 1]) {
            const len = (width - 1.4) / 2, bb = b + sd * (width + 1.4) / 4;
            add(side * 12.05, bb, .1, 1, len, 0xc4b89e, 0, 0, 0, true);
            const A = point(side * 12.05, bb - len / 2), B = point(side * 12.05, bb + len / 2);
            solidSeg(...A, ...B, .12);
          }
        }
      }
    }
  }
  // 町の脇の屋敷。門口を空け、塀の内に庭と平屋を置く。
  const ax = outskirts ? 0 : 21, bz = outskirts ? 0 : -6;
  if (high) {
    // 二つの門を横路地へつなぐ。歩く町では北端が既存の横町に届く。
    surface(ax - 10.5, bz + 1, 3, 42, 0x99896d, .07);
    surface(ax - 12.1, bz + 1, .28, 42, 0x5f5b47, .08);
  }
  for (const dz of [-10, 10]) {
    const zz = bz + dz;
    surface(ax, zz, 15, 17, 0x81755b);
    fence(ax - 7.5, zz - 8.5, ax + 7.5, zz - 8.5);
    fence(ax + 7.5, zz - 8.5, ax + 7.5, zz + 8.5);
    fence(ax + 7.5, zz + 8.5, ax - 7.5, zz + 8.5);
    fence(ax - 7.5, zz - 8.5, ax - 7.5, zz - 1.6);
    fence(ax - 7.5, zz + 1.6, ax - 7.5, zz + 8.5);
    add(ax - 7.5, zz, .32, .25, 3.8, 0x4b4031, 2.1);
    for (const sd of [-1, 1]) add(ax - 7.5, zz + sd * 1.7, .23, 2.2, .23, 0x574733);
    house(ax + 1, zz + 1, -Math.PI / 2, true, 7, 5, false, high);
    if (high) {
      surface(ax - 7.9, zz, 3, 2.6, 0x99896d, .08);
      add(ax - 7.5, zz, .48, .12, 3.25, 0x8b8370, .03);
      // 門の切妻は板二枚。通り抜ける幅と高さを空ける。
      for (const sd of [-1, 1]) add(ax - 7.5, zz + sd * .48, 1.9, .13, 1.1, sd < 0 ? 0x79664b : 0x68573f, 2.64, 0, sd * .34);
      // 主屋の南に小さな納屋。門からの踏み道と裏庭を分ける。
      house(ax + 2, zz - 5.6, -Math.PI / 2, dz < 0, 3.2, 2.5);
      surface(ax - 3.4, zz, 7.8, 2.2, 0xa5987b, .07);
      surface(ax + 1, zz + 6.3, 7, 2.5, dz < 0 ? 0x656348 : 0x777052, .06);
      add(ax - 1.4, zz + 6, 4.1, .15, .8, 0x574834, .22);
      for (const db of [-1.3, 1.3]) add(ax - 1.4, zz + 6 + db, .18, 2.4, .18, 0x574834);
      add(ax - 1.4, zz + 6, .18, .18, 3.1, 0x574834, 2.3);
      const [px, pz] = point(ax - 1.4, zz + 6); solidRect(px, pz, 4.1, .8, rot);
    }
  }
  // 作事場：横木の上へ丸太を段積みにし、脇に挽いた板を積む。
  const yardX = outskirts ? 5 : -22, yardZ = outskirts ? -75 : 0;
  surface(yardX, yardZ, 13, 17, 0x8e7c5e);
  if (high) {
    // 岡崎の作事小屋に寄せ、壁を閉じず柱・梁と片流れの板屋根を見せる。
    for (const da of [-2.7, 0, 2.7]) for (const db of [3.7, 6.3]) {
      add(yardX + da, yardZ + db, .18, 3.05 - (db - 3.35) * .145, .18, 0x63523c);
      const [px, pz] = point(yardX + da, yardZ + db); solidRect(px, pz, .24, .24, rot);
    }
    for (const db of [3.7, 6.3]) add(yardX, yardZ + db, 6, .18, .2, 0x51412f, 2.87 - (db - 3.35) * .145);
    for (let j = 0; j < 5; j++) add(yardX, yardZ + 3.35 + j * .83, 6.5, .12, .9, j % 2 ? 0x7d6a50 : 0x8c785a, 3.05 - j * .12, 0, .144);
    // 挽き台・切り屑・立て掛けた板。丸太の山は前の巡の配置を保つ。
    for (const da of [-1.7, 1.7]) {
      for (const db of [4.5, 5.5]) add(yardX + da, yardZ + db, .14, .8, .14, 0x594831);
      add(yardX + da, yardZ + 5, .2, .16, 1.4, 0x594831, .8);
    }
    add(yardX, yardZ + 5, 4.8, .22, .42, 0xb2986c, .98);
    { const [px, pz] = point(yardX, yardZ + 5); solidRect(px, pz, 4.8, .5, rot); }
    // 乾燥架に板を斜め掛けする。下を離し、板の間から向こうが見える。
    for (const da of [1.9, 3.5]) {
      add(yardX + da, yardZ + 6.45, .13, 2, .13, 0x574832);
      add(yardX + da, yardZ + 6.15, .8, .12, .8, 0x574832);
    }
    add(yardX + 2.7, yardZ + 6.45, 1.9, .14, .14, 0x655139, 1.8);
    for (let j = 0; j < 4; j++) {
      const h = 2.2 + j * .12, pitch = -.25 - j % 2 * .035;
      add(yardX + 2.15 + j * .36, yardZ + 6.08, .28, h, .09, j % 2 ? 0x998365 : 0xb29b74, .09, 0, pitch);
    }
    { const [px, pz] = point(yardX + 2.7, yardZ + 6.2); solidRect(px, pz, 1.9, 1, rot); }
    for (let j = 0; j < 6; j++) add(yardX - 2 + j * .71, yardZ + 3.8 + j % 2 * .4, .7, .035, .13, 0xb29a71, .04, j * .6);
  } else house(yardX, yardZ + 5, 0, true, 6, 3);
  for (let pile = 0; pile < 3; pile++) {
    const a = yardX - 3 + pile * 3, b = yardZ - 2;
    for (const db of [-2, 2]) add(a, b + db, 2.2, .18, .23, 0x514534);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
      const [px, pz] = point(a + (k - (3 - row) / 2) * .43, b);
      logs.push({ x: px, y: W.heightAt(px, pz) + .4 + row * .36, z: pz, w: .21, h: 5.5, d: .21, col: row % 2 ? 0x9e845d : 0x746044, rot, log: true });
    }
    const [px, pz] = point(a, b); solidRect(px, pz, 2.1, 5.7, rot);
  }
  for (let i = 0; i < 5; i++) add(yardX + 4.5, yardZ - 2, 1.4, .12, 5.5, 0xac936a, i * .16);
  { const [px, pz] = point(yardX + 4.5, yardZ - 2); solidRect(px, pz, 1.5, 5.6, rot); }
  // 畦で分けた田畑。遠い畝は細い草を植えず、色の帯で表す。
  const fx = outskirts ? 47 : -23, fz = outskirts ? -47 : 40;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const a = fx + (i - 1) * 12, b = fz + j * 13;
    surface(a, b, 12, 13, 0x817b52);
    if (high) {
      // 刈り跡・湿った田・菜畑を区画ごとに混ぜる。遠景は草の立体を増やさず土の面へ描く。
      const crop = (i + j * 2) % 3;
      surface(a, b, 10.6, 11.5, [0x8e805e, 0x505849, 0x695a3e][crop], .065);
      for (let k = 0; k < (crop === 0 ? 3 : 6); k++) {
        const len = 9.3 + (i * 3 + j + k * 2) % 4 * .35;
        if (crop === 0) surface(a, b - 3.4 + k * 3.4, len, .3, 0xa09068, .095);
        else surface(a - 4.4 + k * 1.75, b + (k % 2 ? .18 : -.18), crop === 1 ? .2 : .65, len, crop === 1 ? 0x737b50 : 0x78804d, .095);
      }
    } else {
      surface(a, b, 10.6, 11.5, j % 2 ? 0x74613e : 0x536044, .065);
      for (let k = 0; k < 6; k++) surface(a - 4.4 + k * 1.75, b, .48, 10.8, j % 2 ? 0x8d7951 : 0x737c4c, .095);
    }
  }
  if (high) {
    // 畑の色帯の間に湿った用水筋を通し、外縁の農道を村へつなぐ。
    // 水路は浅い暗色の底と両岸の土で表し、遠景用の面を同じ束へまとめる。
    for (const da of [-6, 6]) {
      surface(fx + da, fz + 13, .62, 39, 0x414d42, .075);
      for (const sd of [-1, 1]) surface(fx + da + sd * .45, fz + 13, .24, 39, 0x928361, .11);
    }
    surface(fx, fz + 32, 36, .65, 0x414d42, .075);
    for (const sd of [-1, 1]) surface(fx, fz + 32 + sd * .48, 36, .27, 0x928361, .11);
    surface(fx + 20, fz + 19, 2.8, 54, 0x9c8c6e, .075);
    surface(fx + 2, fz + 44.5, 39, 2.8, 0xa29578, .075);
    // 畦から農道へ渡る小さな板。家や兵は増やさない。
    for (const da of [-6, 6]) {
      for (let k = 0; k < 3; k++) add(fx + da, fz + 32 + (k - 1) * .25, 1.8, .09, .23, 0x78694f, .15);
    }
  }
  // 村は同じ基本形を小さくまとめ、町家より少数の茅屋根で輪郭を作る。
  for (let i = 0; i < 4; i++) {
    const a = high ? fx - 11 + Math.floor(i / 2) * 19 : fx - 14 + i * 9;
    const b = high ? fz + (i % 2 ? 50 : 39) : fz + 41 + (i % 2) * 7;
    const [px, pz] = point(a, b), angle = high ? (i % 2 ? Math.PI : 0) : i % 2 ? .15 : -.1;
    if (high) {
      // 農家の戸口を同じ道へ向け、裏の菜畑と踏み庭で集落をまとめる。
      surface(a, b + (i % 2 ? -3.3 : 3.3), 3.2, 2.8, 0xa29578, .08);
      surface(a + 5, b, 3.8, 5.8, 0x716046, .06);
      for (let k = 0; k < 3; k++) surface(a + 3.8 + k * 1.15, b, .38, 5.2, 0x6f774d, .09);
    }
    add(a, b, 5.5, 2.5, 4, 0x796a51, 0, angle);
    add(a + (high ? Math.sin(angle) * 2.02 : 0), b + (high ? Math.cos(angle) * 2.02 : 2.02), 1.1, 1.8, .06, 0x332d22, 0, high ? angle : 0);
    roofs.push({ x: px, y: W.heightAt(px, pz) + (high ? 3.45 : 3.6), z: pz, w: high ? 6.7 : 4.5, h: high ? 1.9 : 2.2, d: high ? 5.2 : 3.6, col: i % 2 ? 0x8d8064 : 0x776e56, rot: rot + angle });
    if (high) {
      add(a, b, 6.9, .14, .32, 0x4f4738, 4.36, angle);
      for (const sd of [-1, 1]) add(a + Math.sin(angle) * sd * 2.5, b + Math.cos(angle) * sd * 2.5, 6.7, .2, .25, 0x625b46, 2.42, angle);
    }
    solidRect(px, pz, 5.7, 4.2, rot + angle);
  }
  finalizeSimpleBatch(rt, batch);
  const logTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const pitchTurn = new THREE.Quaternion(), pitchAxis = new THREE.Vector3(1, 0, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  const timber = high ? timberMat() : null;
  for (const [items, geo] of [[boxes, BOX], [walls, BOX], [logs, timber ? timber.geometry : LOG], [roofs, high ? VILLAGE_ROOF : ROOF]]) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, items === walls ? fenceMat() : items === logs && timber ? timber.material : MAT, items.length);
    items.forEach((it, i) => {
      q.setFromAxisAngle(axis, it.rot);
      if (it.log) q.multiply(logTurn);
      if (it.pitch) q.multiply(pitchTurn.setFromAxisAngle(pitchAxis, it.pitch));
      p.set(it.x, it.y, it.z); scale.set(it.w, it.h, it.d);
      mesh.setMatrixAt(i, m4.compose(p, q, scale));
      mesh.setColorAt(i, items === logs && timber ? color.setScalar(.92 + i % 3 * .04) : color.set(it.col));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, SOIL); ground.receiveShadow = true; rt.scene.add(ground);
}
