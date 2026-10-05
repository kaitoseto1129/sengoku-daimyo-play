// 信長の南蛮具足とマントは伝わる姿をもとにした推定。設楽原から使う。
// 基本形を部位ごとに一度だけまとめ、近景・遠景・骨入りの人で共有する。
import * as THREE from 'three';

export function nanbanAfter(def, battle) {
  if (def.town) return (def.year || 0) >= 1575;
  const id = def.key || battle?.id;
  if (id === 'honnoji') return false;
  if (id === 'shitaragahara') return true;
  const year = Number(String(def.year || battle?.year || '').match(/\d{4}/)?.[0] || 0);
  return year > 1575 || (year === 1575 && !['nagashinojo', 'sune', 'tobinosu'].includes(id));
}
export function nanbanLook(look) {
  return { ...look, nanban: 1, armor: 0xa7abad, lace: 0x17191c, cloth: 0x202b40,
    hat: 'kabuto_nanban', haori: 0x17191c, sode: false, menpo: 0, horo: 0, pole: false, flag: null, kote: 3, saya: true };
}

const cache = new Map();
// 点を環状に並べた打ち出し。一枚板の胸と桃形の鉢の稜線を少ない面で作る。
function shell(rings, n, point) {
  const pos = [], ix = [];
  for (let j = 0; j < rings; j++) for (let i = 0; i <= n; i++) pos.push(...point(j, i / n * Math.PI * 2));
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    ix.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals();
  return g;
}
export function nanbanGeometry(kind, hi, part, sd, tools) {
  const key = [kind, hi ? 1 : 0, part || '', sd || 0].join('|');
  if (cache.has(key)) return cache.get(key);
  const { P, at, merge, MK, limb, ball } = tools;
  const silver = 0xa7abad, gold = 0xb08a3a, black = 0x17191c, navy = 0x202b40;
  const pts = [], groups = {};
  let out = pts;
  const add = (g, col, mk = MK.cloth, reg = 'cloth') => out.push(P(g, col, { mk, reg, dirt: 0.32 }));
  const metal = (g, col = silver) => add(g, col, col === gold ? MK.gold : MK.iron, 'iron');
  const box = (w, h, d, x, y, z, col = silver, ry = 0, rz = 0) => metal(at(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry, rz), col);
  const seg = hi ? 12 : 8;
  if (kind === 'body') {
    for (const k of ['base', 'torso', 'hips', 'head', 'haori', 'koshi', 'sodeP', 'sodeN', 'back', 'pole']) groups[k] = [];
    out = groups.base;
    add(at(new THREE.CylinderGeometry(0.19, 0.2, 0.18, seg), 0, 0.93, 0), navy);
    out = groups.torso;
    const profile = [[0.2, 0.15, 0.93], [0.235, 0.18, 1.08], [0.26, 0.19, 1.3], [0.22, 0.16, 1.41]];
    metal(shell(4, seg, (j, a) => {
      const [rx, rz, y] = profile[j], front = Math.max(0, Math.cos(a)), ridge = Math.pow(front, 10);
      return [rx * Math.sin(a), y - (j === 0 ? ridge * 0.065 : 0), rz * Math.cos(a) + ridge * 0.035];
    }));
    // 首の襟は二段。胸板の中央は縦に打ち出し、下端を尖らせる。
    for (const y of [1.422, 1.445]) metal(at(new THREE.TorusGeometry(0.092, 0.012, 4, seg), 0, y, 0, Math.PI / 2));
    if (hi) for (let i = 0; i < 5; i++) box(0.025 + i * 0.004, 0.0015, 0.001, -0.13 + i * 0.043, 1.12 + i * 0.044, 0.184, 0x70767a, 0, -0.5);
    out = groups.hips;
    // 七枚の草摺それぞれに、銀の板を五段重ねる。黒い縅は小さな点。
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + Math.PI;
      for (let j = 0; j < 5; j++) {
        const r = 0.225 + j * 0.02, y = 0.88 - j * 0.045;
        box(0.17 + j * 0.009, 0.054, 0.018, Math.sin(a) * r, y, Math.cos(a) * r, silver, a);
        if (hi) for (const x of [-0.055, 0, 0.055]) {
          const rr = r + 0.012;
          add(at(ball(0.005, 0.004, 0.003, 4, 3), Math.sin(a) * rr + Math.cos(a) * x, y + 0.013, Math.cos(a) * rr - Math.sin(a) * x), black);
        }
      }
    }
    out = groups.head;
    // 銀の桃形鉢。頂の稜線が前後へ鋭く伸びる。
    const hp = [[0.135, 0.185, 1.685], [0.14, 0.205, 1.75], [0.07, 0.18, 1.835], [0.001, 0.115, 1.885]];
    metal(shell(4, seg, (j, a) => { const [x, z, y] = hp[j]; return [x * Math.sin(a), y - (j === 3 ? Math.abs(Math.cos(a)) * 0.055 : 0), z * Math.cos(a)]; }));
    // 後ろの黒い錣。前を開けて顔を隠さない。
    for (let j = 0; j < 4; j++) add(at(new THREE.CylinderGeometry(0.15 + j * 0.014, 0.164 + j * 0.014, 0.038, seg, 1, true, Math.PI / 2, Math.PI), 0, 1.673 - j * 0.029, -0.008), black, MK.lac, 'lacq');
    for (const s of [-1, 1]) box(0.038, 0.066, 0.018, s * 0.143, 1.69, 0.115, gold, s * 0.38, s * 0.25);
    // 丸い前立に五つの窠と内側の唐花を重ね、織田木瓜にする。
    metal(at(new THREE.CylinderGeometry(0.049, 0.049, 0.012, seg), 0, 1.767, 0.2, Math.PI / 2), gold);
    add(at(new THREE.CircleGeometry(0.042, seg), 0, 1.767, 0.208), black);
    for (const [scale, col, z] of [[1, gold, 0.211], [0.86, black, 0.215], [0.74, gold, 0.219], [0.62, black, 0.223]]) {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const g = at(ball(0.021 * scale, 0.021 * scale, 0.002, 8, 4), Math.sin(a) * 0.017 * scale, 1.767 + Math.cos(a) * 0.017 * scale, z);
        if (col === gold) metal(g, gold); else add(g, black);
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      metal(at(ball(0.006, 0.011, 0.002, 6, 4), Math.sin(a) * 0.01, 1.767 + Math.cos(a) * 0.01, 0.226, 0, 0, -a), gold);
    }
    metal(at(ball(0.004, 0.004, 0.002, 6, 4), 0, 1.767, 0.228), gold);
    out = groups.haori;
    // 肩からふくらはぎへ垂れるマント。裏表を別の薄い面にし、裏は赤。
    const capePoint = (v, a, inner = false) => {
      const w = 0.27 + v * 0.14, x = (a * 2 - 1) * w;
      return [x, 1.43 - v * 1.03, -0.18 - v * 0.18 - Math.cos((a * 2 - 1) * Math.PI / 2) * 0.065 - Math.sin(a * Math.PI * 8) * 0.014 * v + (inner ? 0.006 : 0)];
    };
    const cloth = (inner) => {
      const p = [], ix = [], nx = hi ? 12 : 6, ny = hi ? 6 : 3;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) p.push(...capePoint(j / ny, i / nx, inner));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; if (inner) ix.push(a, b, a + 1, a + 1, b, b + 1); else ix.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals(); return g;
    };
    add(cloth(false), black); add(cloth(true), 0x701f23);
    for (const s of [0, 1]) for (let j = 0; j < 6; j++) {
      const a = capePoint(j / 6, s), b = capePoint((j + 1) / 6, s);
      metal(limb(a, b, 0.008, 0.008, 4), gold);
    }
    for (let i = 0; i < 8; i++) metal(limb(capePoint(1, i / 8), capePoint(1, (i + 1) / 8), 0.008, 0.008, 4), gold);
    for (const s of [-1, 1]) metal(at(ball(0.018, 0.018, 0.009, 6, 4), s * 0.15, 1.415, 0.146), gold);
    out = groups.koshi;
    // 腰の刀。金の鞘口・鐺・鍔、紺の柄。
    const tilt = 0.72;
    box(0.044, 0.58, 0.04, -0.26, 0.8, 0.04, black, 0, tilt);
    for (const y of [0.04, 0.51]) box(0.05, 0.028, 0.045, -0.26 - Math.sin(tilt) * (y - 0.29), 0.8 + Math.cos(tilt) * (y - 0.29), 0.04, gold, 0, tilt);
    add(at(new THREE.BoxGeometry(0.038, 0.16, 0.037), -0.5, 1.09, 0.04, 0, 0, tilt), navy);
    metal(at(new THREE.CylinderGeometry(0.051, 0.051, 0.009, 8), -0.45, 1.025, 0.04, 0, 0, tilt), gold);
    // 全部位を一度の組み立てで覚える。後の人と各場面では形を増やさない。
    for (const [name, list] of Object.entries(groups)) {
      const g = list.length ? merge(list) : null;
      cache.set(['body', hi ? 1 : 0, name, 0].join('|'), g);
      for (const src of list) src.dispose();
    }
    for (const name of ['nohead', '']) {
      const list = Object.keys(groups).filter(k => !name || k !== 'head').map(k => cache.get(['body', hi ? 1 : 0, k, 0].join('|'))).filter(Boolean).map(g => g.clone());
      cache.set(['body', hi ? 1 : 0, name, 0].join('|'), merge(list));
      for (const src of list) src.dispose();
    }
    return cache.get(key);
  }
  if (kind === 'thigh') {
    if (!part) add(limb([0, 0.02, 0], [0, -0.4, 0.01], 0.116, 0.09, seg), navy);
    add(at(new THREE.CylinderGeometry(0.122, 0.114, 0.26, seg, 1, true, -0.85, 1.7), 0, -0.16, 0.012), black, MK.cloth, 'kote');
    for (let j = 0; j < (hi ? 5 : 3); j++) for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.36; box(0.032, hi ? 0.032 : 0.056, 0.006, Math.sin(a) * 0.12, -0.055 - j * (hi ? 0.049 : 0.082), Math.cos(a) * 0.126, silver, a); }
  } else if (kind === 'leg') {
    if (!part) add(limb([0, 0, 0], [0, -0.3, 0], 0.079, 0.065, seg), navy);
    metal(at(new THREE.CylinderGeometry(0.086, 0.07, 0.265, seg, 1, true, -1.35, 2.7), 0, -0.14, 0));
    for (const y of [-0.035, -0.245]) add(at(new THREE.TorusGeometry(y > -0.1 ? 0.085 : 0.073, 0.006, 3, seg), 0, y, 0, Math.PI / 2), black);
  } else if (kind === 'arm') {
    const upper = !part || part === 'upper', fore = !part || part === 'fore', hand = !part || part === 'hand';
    if (upper) { add(limb([0, -0.02, 0], [0, -0.27, 0], 0.066, 0.055, seg), navy, MK.cloth, 'kote'); box(0.035, 0.15, 0.012, sd * 0.056, -0.13, 0.005, silver, sd * Math.PI / 2); }
    if (fore) { add(limb([0, -0.27, 0], [0, -0.5, 0], 0.056, 0.046, seg), navy, MK.cloth, 'kote'); box(0.055, 0.18, 0.012, 0, -0.385, -0.05); }
    if (hand) { if (!part) add(at(ball(0.038, 0.043, 0.028, 6, 4), 0, -0.55, 0), 0xb58c68, MK.skin, 'skin'); box(0.058, 0.05, 0.009, 0, -0.54, -0.03); }
  }
  const g = pts.length ? merge(pts) : null; cache.set(key, g); return g;
}
