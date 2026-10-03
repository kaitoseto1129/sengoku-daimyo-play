// ======================================================================
// naka.js … 天守・櫓・御殿の「中」（kaito 10/2「天守や櫓の中に入れるように。天守の中で大将を見つける」）
// 建てる側（props.tenshu・castle_parts の隅櫓・櫓門・御殿）が addInterior で「階の並び」を渡すだけで、
//   ・当たり：階ごとの床（floors.js の deck。上の階は階段の口を空ける）・中の階段（inner の坂）・壁（その階の高さだけ効く SOLIDS）
//     ・入口（戸口の隙間と、外から上がる石段）・階段の口の手すり
//   ・見た目（近づいた時だけ作る・近い時だけ描く）：板の床・内の壁と柱・狭間と窓（穴）・窓からの光の筋・灯明・急な箱階段
//     光は頂点の色に焼き込む（MeshBasic。画質「低」でも重くしない。中の灯りで陰を作らない）
//   ・中にいる兵に u.naka を付ける（units.js：上下の階の者とは斬り合わない）
//   ・遊び手が中にいる時：カメラは寄せて部屋の内に収める（player.js が nakaCamClamp を呼ぶ）。日の光を少し落とす
// 戦ごとに nakaReset（battle.js が SOLIDS と一緒に空にする）。nakaTick は battle.js が毎コマ呼ぶ。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addDeck, addRamp } from './floors.js';
import { SOLIDS } from './props.js';

export const NAKA = { list: [], flagged: [], t: 0, outer: false, cur: null, dim: 1, lt: null };

export function nakaReset() {
  NAKA.list.length = 0; NAKA.flagged.length = 0; NAKA.t = 0; NAKA.outer = false; NAKA.cur = null; NAKA.dim = 1; NAKA.lt = null; NAKA.pp = null;
}

// 四角 [-hw,hw]×[-hd,hd] から穴 h（x0,x1,z0,z1）を抜いた残り（四つまでの四角）
function rectMinus(hw, hd, h) {
  if (!h) return [[-hw, hw, -hd, hd]];
  const out = [];
  const x0 = Math.max(-hw, h.x0), x1 = Math.min(hw, h.x1), z0 = Math.max(-hd, h.z0), z1 = Math.min(hd, h.z1);
  if (x0 - -hw > 0.05) out.push([-hw, x0, -hd, hd]);
  if (hw - x1 > 0.05) out.push([x1, hw, -hd, hd]);
  if (z0 - -hd > 0.05) out.push([x0, x1, -hd, z0]);
  if (hd - z1 > 0.05) out.push([x0, x1, z1, hd]);
  return out;
}

function seg(I, ax, az, bx, bz, y0, y1, r = 0.14) {
  const [wax, waz] = I.P(ax, az), [wbx, wbz] = I.P(bx, bz);
  const o = { k: 's', ax: wax, az: waz, bx: wbx, bz: wbz, r, yBot: y0, yTop: y1, naka: I.id,
    x0: Math.min(wax, wbx) - r, x1: Math.max(wax, wbx) + r, z0: Math.min(waz, wbz) - r, z1: Math.max(waz, wbz) + r };
  SOLIDS.push(o);
  return o;
}

// 一つの面（局所の t 軸に沿う長さ len）の壁を、穴（{t0,t1,y0,y1}）を避けて区切る：[t0,t1,y0,y1] の並び
function facePanels(len, h, holes) {
  const hs = holes.slice().sort((a, b) => a.t0 - b.t0), out = [];
  let t = -len / 2;
  for (const o of hs) {
    if (o.t0 > t + 0.02) out.push([t, o.t0, 0, h]);
    if (o.y0 > 0.02) out.push([o.t0, o.t1, 0, o.y0]);
    if (o.y1 < h - 0.02) out.push([o.t0, o.t1, o.y1, h]);
    t = o.t1;
  }
  if (len / 2 > t + 0.02) out.push([t, len / 2, 0, h]);
  return out;
}

// o: { name, kind('tenshu'|'yagura'|'gate'|'goten'), x, z, rot, levels: [{ y, w, d, h }],
//      door: { side(+1＝局所の +z の面), lx, w }, approach: { pad, len } か null, oku（御殿の奥の間の割合）,
//      wins(lv, k) → [{ face: 'z'|'x', s: ±1, t, w, y0, y1 }]（外の格子窓の場所に合わせる。無ければ自動）, where（大将の居場所の言い方） }
export function addInterior(world, o) {
  const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  const I = {
    id: NAKA.list.length, name: o.name || '櫓', kind: o.kind || 'yagura', x: o.x, z: o.z, rot, c, s,
    levels: o.levels.map((l, k) => ({ ...l, k })), door: { side: 1, lx: 0, w: 1.3, ...(o.door || {}) },
    oku: o.oku || 0, wins: o.wins || null, built: false, mesh: null, glows: [], stairs: [], seen: {}, onEnter: null, onLevel: null,
  };
  I.P = (lx, lz) => [I.x + lx * c + lz * s, I.z - lx * s + lz * c];
  I.L = (wx, wz) => { const dx = wx - I.x, dz = wz - I.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const Ls = I.levels, ds = I.door.side;
  I.R = Math.hypot(Ls[0].w, Ls[0].d) / 2 + (o.approach ? o.approach.pad + o.approach.len : 0);
  // 階段：k → k+1。上の階の壁ぎわ（階ごとに前と奥を互い違い）に、x の向きへ上る急な箱階段
  for (let k = 0; k + 1 < Ls.length; k++) {
    const lv = Ls[k], up = Ls[k + 1], rise = up.y - lv.y;
    const sg = (k % 2 === 0 ? -1 : 1) * ds;
    const L = Math.min(up.w - 1.2, Math.max(2.4, rise * 0.92));
    const lz = sg * (up.d / 2 - 0.8);
    const st = { k, sg, L, lz, y0: lv.y, y1: up.y, w: 0.95, hole: { x0: -L / 2 - 0.25, x1: L / 2 - 0.2, z0: sg < 0 ? -up.d / 2 : up.d / 2 - 1.6, z1: sg < 0 ? -up.d / 2 + 1.6 : up.d / 2 } };
    I.stairs.push(st);
    const [ax, az] = I.P(-L / 2, lz), [bx, bz] = I.P(L / 2, lz);
    addRamp({ ax, az, bx, bz, w: st.w, ya: lv.y, yb: up.y, inner: true });
    // 階段の下へ横から潜り込まない（内の側の桁と、上の端）
    seg(I, -L / 2 + 0.9, lz - sg * 0.55, L / 2, lz - sg * 0.55, lv.y - 0.4, lv.y + 0.6, 0.1);
    seg(I, L / 2 + 0.05, lz - sg * 0.55, L / 2 + 0.05, sg * (lv.d / 2), lv.y - 0.4, lv.y + 1.2, 0.1);
    // 上の階：階段の口の手すり（上り口の端だけ空ける）
    const hz = sg < 0 ? st.hole.z1 : st.hole.z0;
    seg(I, st.hole.x0, hz, st.hole.x1 - 1.0, hz, up.y - 0.3, up.y + 1.2, 0.08);
    seg(I, st.hole.x0, hz, st.hole.x0, sg * up.d / 2, up.y - 0.3, up.y + 1.2, 0.08);
  }
  // 床と壁
  I.deckIds = [];
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2;
    const hole = k > 0 ? I.stairs[k - 1].hole : null;
    lv.pieces = rectMinus(hw, hd, hole);
    let main = null, area = -1;
    for (const [x0, x1, z0, z1] of lv.pieces) {
      const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      const id = addDeck({ x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, cx, cz, y: lv.y, name: `${I.name} ${k + 1}階`, roof: lv.y + lv.h });
      const a = (x1 - x0) * (z1 - z0);
      if (a > area) { area = a; main = id; }
    }
    I.deckIds.push(main);
    const y0 = lv.y - 1.2, y1 = lv.y + lv.h, iw = hw - 0.08, id = hd - 0.08;
    seg(I, -iw, -id, -iw, id, y0, y1); seg(I, iw, -id, iw, id, y0, y1);
    for (const sd of [-1, 1]) {
      if (k === 0 && sd === ds) {
        // 当たりの口は見た目の戸口より 0.4m ずつ広く（人の太さ 0.45 と壁の太さで、見た目どおりだと通れない）
        const a = I.door.lx - I.door.w / 2 - 0.4, b = I.door.lx + I.door.w / 2 + 0.4;
        seg(I, -iw, sd * id, a, sd * id, y0, y1); seg(I, b, sd * id, iw, sd * id, y0, y1);
      } else seg(I, -iw, sd * id, iw, sd * id, y0, y1);
    }
    // 御殿の奥の間：襖の仕切り（口は片寄せ）
    if (I.oku && k === 0) {
      const pz = -ds * (hd - lv.d * I.oku), ox = hw * 0.45;
      seg(I, -iw, pz, ox - 1.05, pz, y0, y1, 0.08); seg(I, ox + 1.05, pz, iw, pz, y0, y1, 0.08);
      I.okuZ = pz;
    }
  }
  // 入口：戸口の外の踊り場と、地面から上がる石段（外壁の足もとの当たりの外まで）
  const L0 = Ls[0], hd0 = L0.d / 2;
  if (o.approach) {
    const { pad, len } = o.approach;
    const [tx, tz] = I.P(I.door.lx, ds * (hd0 + pad)), [bx, bz] = I.P(I.door.lx, ds * (hd0 + pad + len));
    const gy = world.heightAt(bx, bz);
    I.approach = { pad, len, gy };
    addRamp({ ax: bx, az: bz, bx: tx, bz: tz, w: I.door.w + 0.3, ya: gy, yb: L0.y, inner: true });   // 横からは乗らない（下の端から上る）
    const [cx, cz] = I.P(I.door.lx, ds * (hd0 + pad / 2 - 0.1));
    addDeck({ x0: -(I.door.w + 0.4) / 2, x1: (I.door.w + 0.4) / 2, z0: -(pad + 0.4) / 2, z1: (pad + 0.4) / 2, rot, cx, cz, y: L0.y, name: `${I.name}の戸口` });
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + pad + len + 0.8));
    I.doorOut = { x: ox, z: oz };
  } else {
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + 1.2));
    I.doorOut = { x: ox, z: oz };
  }
  { const [ix, iz] = I.P(I.door.lx, ds * (hd0 - 1.1)); I.doorIn = { x: ix, z: iz, y: L0.y }; }
  // 大将の居場所：一番上の階の、上り口から遠い側（御殿は奥の間）
  const top = Ls[Ls.length - 1];
  let sp;
  if (I.oku) sp = I.P(-I.door.lx * 0.3, -ds * (hd0 - L0.d * I.oku / 2));
  else {
    const st = I.stairs[I.stairs.length - 1];
    sp = st ? I.P(-st.L * 0.15, -st.sg * Math.max(0, top.d / 2 - 1.1)) : I.P(0, -ds * Math.max(0, top.d / 2 - 1.0));
  }
  I.lordSpot = { x: sp[0], z: sp[1], y: top.y };
  I.where = o.where || (I.oku ? `${I.name}の奥の間` : Ls.length > 1 ? `${I.name}の最上階` : `${I.name}の中`);
  NAKA.list.push(I);
  // 隅櫓・天守の戸口の外に篝を一つ（外から入口が分かる。B101）。足もとが地面の戸口だけ
  if ((I.kind === 'yagura' || I.kind === 'tenshu') && world && world.addFire) {
    const [fx, fz] = I.P(I.door.lx + 1.1, ds * (Ls[0].d / 2 + 1.1));
    if (Math.abs(world.heightAt(fx, fz) - Ls[0].y) < 1.2) world.addFire(fx, fz, { torch: true, h: 0.9 });
  }
  return I;
}

// 点がどの建物の何階の中か（{ I, lv } か null）
export function nakaRoomAt(x, z, y) {
  for (const I of NAKA.list) {
    if (Math.abs(x - I.x) > I.R + 1 || Math.abs(z - I.z) > I.R + 1) continue;
    const [lx, lz] = I.L(x, z);
    for (let k = I.levels.length - 1; k >= 0; k--) {
      const lv = I.levels[k];
      if (Math.abs(lx) > lv.w / 2 + 0.05 || Math.abs(lz) > lv.d / 2 + 0.05) continue;
      if (y >= lv.y - 0.6 && y <= lv.y + lv.h) return { I, lv };
    }
  }
  return null;
}
// 点 (x,z) を足もとに含む建物（大将の居場所を探す。高さは問わない）
export function nakaFind(x, z) {
  for (const I of NAKA.list) {
    const [lx, lz] = I.L(x, z), lv = I.levels[0];
    if (Math.abs(lx) <= lv.w / 2 + 0.3 && Math.abs(lz) <= lv.d / 2 + 0.3) return I;
  }
  return null;
}

// 道しるべ（任務の印）：建物の外なら戸口、中なら上の階への階段の上り口、御殿は奥の間の口、着けば的（大将）。
// rt.marker の pos に関数として渡す（印が一歩ずつ先を指す。真っすぐ寄せて壁に詰まらない）
export function nakaGuide(I, target) {
  const xz = (a) => { const [x, z] = I.P(a[0], a[1]); return { x, z }; };
  return () => {
    const p = NAKA.pp;
    const tg = typeof target === 'function' ? target() : target;
    if (!p) return tg;
    const r = nakaRoomAt(p.x, p.z, p.y);
    const d = (q) => Math.hypot(q.x - p.x, q.z - p.z);
    if (!r || r.I !== I) {
      const out = I.doorOut, inn = I.doorIn;
      // 戸口の下まで来たら、離れるまでは中を指す（石段の上で外と中を行き来しない）
      if (d(out) < 1.6 || d(inn) < 3.5) I.goIn = true; else if (d(out) > 5 && d(inn) > 6) I.goIn = false;
      if (I.goIn) return inn;
      return out;
    }
    const k = r.lv.k, top = I.levels.length - 1;
    if (k < top) {
      const st = I.stairs[k], foot = xz([-st.L / 2 - 0.7, st.lz]), head = xz([st.L / 2 + 0.6, st.lz]);
      if (I.upK !== k) { I.upK = k; I.upGo = false; }
      if (p.y > r.lv.y + 0.5 || d(foot) < 1.0) I.upGo = true; else if (d(foot) > 4) I.upGo = false;
      return I.upGo ? head : foot;
    }
    if (I.okuZ != null) {
      const [, lz] = I.L(p.x, p.z), inOku = (lz - I.okuZ) * -I.door.side > 0.1;
      if (!inOku) return xz([r.lv.w / 2 * 0.45, I.okuZ - I.door.side * 1.2]);
    }
    return tg;
  };
}

// カメラを部屋の内に収める（player.js）。中にいなければ何もしない
export function nakaCamClamp(v) {
  const C = NAKA.cur;
  if (!C) return false;
  const { I, lv } = C;
  let [lx, lz] = I.L(v.x, v.z);
  const mx = lv.w / 2 - 0.3, mz = lv.d / 2 - 0.3;
  lx = Math.max(-mx, Math.min(mx, lx)); lz = Math.max(-mz, Math.min(mz, lz));
  const [wx, wz] = I.P(lx, lz);
  v.x = wx; v.z = wz;
  v.y = Math.max(lv.y + 0.5, Math.min(lv.y + lv.h - 0.18, v.y));
  return true;
}

// ---------------- 見た目 ----------------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.35, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  MAT = {
    base: new THREE.MeshBasicMaterial({ vertexColors: true }),
    shaft: new THREE.MeshBasicMaterial({ color: 0xfff0d2, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    glow: new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }),
    door: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  return MAT;
}
function colorize(g, hex, emit) {
  g = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.userData.emit = !!emit;
  return g;
}

// 中を作る（近づいた時に一度だけ）
function buildInside(rt, I) {
  I.built = true;
  const M = mats(), list = [], lamps = [], winPts = [];
  const put = (g, lx, y, lz, hex, emit) => { g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(colorize(g, hex, emit)); };
  const box = (lx, y, lz, w, h, d, hex, emit) => put(new THREE.BoxGeometry(w, h, d), lx, y, lz, hex, emit);
  const grp = new THREE.Group();
  const Ls = I.levels, ds = I.door.side;
  const goten = I.kind === 'goten';
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = goten ? 0xb8ab90 : 0xa89a80, FLOOR = goten ? 0x8e9060 : 0x8a6a48, BOARD = 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
    // 床（階段の口は空ける）・天井（上の階段の口は空ける）
    for (const [x0, x1, z0, z1] of lv.pieces) box((x0 + x1) / 2, y - 0.04, (z0 + z1) / 2, x1 - x0, 0.08, z1 - z0, FLOOR);
    const upSt = I.stairs[k];
    for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, DARK);
    // 床板の目地（長い方向へ数本）
    for (let q = -hw + 0.9; q < hw - 0.2; q += 0.9) box(q, y + 0.002, 0, 0.02, 0.006, lv.d * 0.98, 0x4a3828);
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      box(q, y + h - 0.13, 0, 0.17, 0.24, lv.d - 0.2, DARK);
    }
    box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK);
    // 窓（外の格子窓の場所に合わせる）
    let wins = I.wins ? I.wins(lv, k) : null;
    if (!wins) {
      wins = [];
      if (!goten) {
        const nw = Math.max(1, Math.round(lv.w / 2.6));
        for (let q = 0; q < nw; q++) for (const sd of [-1, 1]) wins.push({ face: 'z', s: sd, t: -hw + (q + 0.5) * lv.w / nw, w: 0.8, y0: h * 0.5, y1: h * 0.5 + 0.5 });
        const nd = Math.max(1, Math.round(lv.d / 2.6));
        for (let q = 0; q < nd; q++) for (const sd of [-1, 1]) wins.push({ face: 'x', s: sd, t: -hd + (q + 0.5) * lv.d / nd, w: 0.7, y0: h * 0.5, y1: h * 0.5 + 0.5 });
      } else {
        for (const sd of [-1, 1]) for (const t of [-hd * 0.45, hd * 0.45]) wins.push({ face: 'x', s: sd, t, w: 1.4, y0: 0.7, y1: 1.9, shoji: true });
      }
    }
    // 四つの面：穴のある壁（内の側）。入口の階は戸口も穴
    for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = (face === 'z' ? hd : hw) - 0.1;
      const holes = wins.filter((o) => o.face === face && o.s === sd && !o.shoji).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: 0, y1: Math.min(h - 0.3, 2.0) });
      for (const [t0, t1, a0, a1] of facePanels(len, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (face === 'z') box(tm, yy, sd * off, tw, hh, 0.06, WALL); else box(sd * off, yy, tm, 0.06, hh, tw, WALL);
      }
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      if (!goten) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        if (k === 0 && face === 'z' && sd === ds) { wb(-len / 2, I.door.lx - I.door.w / 2 - 0.05); wb(I.door.lx + I.door.w / 2 + 0.05, len / 2); } else wb(-len / 2, len / 2);
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + 0.1) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      // 柱：隅と窓の両脇。長押（横の木）
      const n = Math.max(2, Math.round(len / 1.9));
      for (let q = 0; q <= n; q++) { const t = -len / 2 + q * len / n; if (face === 'z') box(t, y + h / 2, sd * (off - 0.06), 0.16, h, 0.14, DARK); else box(sd * (off - 0.06), y + h / 2, t, 0.14, h, 0.16, DARK); }
      if (face === 'z') box(0, y + h * 0.8, sd * (off - 0.06), len, 0.1, 0.1, DARK); else box(sd * (off - 0.06), y + h * 0.8, 0, 0.1, 0.1, len, DARK);
      if (face === 'z') box(0, y + 0.06, sd * (off - 0.03), len, 0.12, 0.05, DARK); else box(sd * (off - 0.03), y + 0.06, 0, 0.05, 0.12, len, DARK);
    }
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (o.shoji) {   // 明かり障子：外の光で白く光る紙と、細い桟
        if (o.face === 'z') box(px, y + (o.y0 + o.y1) / 2, pz - o.s * 0.05, o.w, o.y1 - o.y0, 0.02, 0xd8d0b8, true); else box(px - o.s * 0.05, y + (o.y0 + o.y1) / 2, pz, 0.02, o.y1 - o.y0, o.w, 0xd8d0b8, true);
        for (let q = 1; q < 4; q++) { const t = -o.w / 2 + q * o.w / 4; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz - o.s * 0.07, 0.025, o.y1 - o.y0, 0.02, DARK); else box(px - o.s * 0.07, y + (o.y0 + o.y1) / 2, pz + t, 0.02, o.y1 - o.y0, 0.025, DARK); }
      } else {
        // 格子（縦の木。間から外が見える）と、窓の下の敷居
        for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK); else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);
      }
      winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji ? 0.7 : 1]);
    }
    // 窓からの光の筋（一つの階に三つまで）
    let ns = 0;
    for (const o of wins) {
      if (ns >= 3 || o.shoji) continue;
      ns++;
      const len2 = Math.min(3.2, (o.y0 + o.y1) / 2 + 1.2), g = new THREE.PlaneGeometry(o.w * 0.9, len2);
      // 窓から内へ、下り気味に差し込む板
      g.translate(0, -len2 / 2, 0); g.rotateX(-0.75);
      if (o.face === 'x') g.rotateY(-o.s * Math.PI / 2); else if (o.s > 0) g.rotateY(Math.PI);
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.12)] : [o.s * (hw - 0.12), o.t];
      g.translate(px, y + (o.y0 + o.y1) / 2, pz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      const sh = new THREE.Mesh(g, M.shaft); sh.renderOrder = 3; grp.add(sh);
    }
    // 階段（急な箱階段：踏み板と両の桁）
    if (upSt) {
      const rise = upSt.y1 - upSt.y0, n = Math.max(6, Math.round(rise / 0.3)), run = upSt.L / n;
      for (let q = 0; q < n; q++) box(-upSt.L / 2 + (q + 0.5) * run, upSt.y0 + (q + 1) * rise / n - 0.03, upSt.lz, run + 0.06, 0.06, upSt.w, WOOD);
      const ang = Math.atan2(rise, upSt.L), sl = Math.hypot(rise, upSt.L);
      for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(sl, 0.26, 0.06); g.rotateZ(ang); put(g, 0, upSt.y0 + rise / 2 - 0.05, upSt.lz + e * upSt.w / 2, DARK); }
    }
    // 灯明（台と火袋）。中は暗いので一つの階に一つか二つ
    const ln = goten || lv.w > 6 ? 2 : 1;
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      const lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
      box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      lamps.push([lx, y + 1.08, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, y + 1.08, wz); sp.scale.setScalar(0.8); sp.renderOrder = 4; grp.add(sp);
      I.glows.push(sp);
    }
    // 武具：槍掛けに数本（天守・櫓）。御殿の奥の間は一段高い上段
    if (!goten && lv.w > 4) {
      const sz = upSt ? -upSt.sg : ds;
      box(0, y + 1.9, sz * (hd - 0.22), Math.min(2.4, lv.w * 0.5), 0.06, 0.08, DARK);
      for (let q = -2; q <= 2; q++) { const g = new THREE.CylinderGeometry(0.022, 0.022, 2.9, 5); g.rotateX(sz * 0.12); put(g, q * 0.45, y + 1.48, sz * (hd - 0.3), 0x2c2016); box(q * 0.45, y + 2.95, sz * (hd - 0.3 + 0.17), 0.04, 0.25, 0.03, 0x9a9a9e); }
    }
    if (goten && I.okuZ != null) {
      const backD = lv.d * I.oku, bz = -ds * (hd - backD / 2);
      box(0, y + 0.08, bz - ds * 0.1, lv.w - 0.3, 0.16, backD - 0.4, 0x8a8050);
      // 襖の仕切り（口は片寄せ）
      const pz = I.okuZ, ox = hw * 0.45;
      for (const [a, b] of [[-hw + 0.1, ox - 0.8], [ox + 0.8, hw - 0.1]]) box((a + b) / 2, y + h / 2, pz, b - a, h, 0.06, 0xc8bc9c);
      box(ox, y + h - 0.25, pz, 1.6, 0.5, 0.08, DARK);
    }
  }
  // 光を頂点の色に焼き込む：暗い地に、灯明の暖かい明かりと窓の明かり
  for (const g of list) {
    if (g.userData.emit) continue;
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const wx = P.getX(i), wy = P.getY(i), wz = P.getZ(i);
      const dx0 = wx - I.x, dz0 = wz - I.z, lx = dx0 * I.c - dz0 * I.s, lz = dx0 * I.s + dz0 * I.c;
      let r = 0.4, gg = 0.37, b = 0.35;
      for (const [ax, ay, az] of lamps) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 4.2); r += f * f * 1.15; gg += f * f * 0.8; b += f * f * 0.42; }
      for (const [ax, ay, az, k2] of winPts) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 3.2); r += f * f * 0.6 * k2; gg += f * f * 0.6 * k2; b += f * f * 0.6 * k2; }
      C.setXYZ(i, Math.min(1, C.getX(i) * r * 1.3), Math.min(1, C.getY(i) * gg * 1.3), Math.min(1, C.getZ(i) * b * 1.3));
    }
  }
  const m = new THREE.Mesh(mergeGeometries(list), M.base);
  m.matrixAutoUpdate = false;
  grp.add(m);
  grp.userData.naka = I.id;
  rt.scene.add(grp);
  I.mesh = grp;
}

// 外の見た目：戸口（暗い口）と、外から上がる石段（戦の始めに全部まとめて一つ）
function buildOuter(rt) {
  NAKA.outer = true;
  const list = [];
  for (const I of NAKA.list) {
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, lx, y, lz, hex) => { g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(colorize(g, hex)); };
    // 戸口：外へ向いた一枚（内からは見えない＝中から外が見える）
    const dh = Math.min(lv.h - 0.3, 2.0);
    // 御殿は壁に口が開いているので、暗い一枚は置かず枠だけ
    const off = I.kind === 'goten' ? 0.2 : 0.08;
    if (I.kind !== 'goten') { const g = new THREE.PlaneGeometry(I.door.w, dh); if (ds < 0) g.rotateY(Math.PI); put(g, I.door.lx, lv.y + dh / 2, ds * (hd + off), 0x0c0907); }
    { const g = new THREE.BoxGeometry(I.door.w + 0.3, 0.16, 0.2); put(g, I.door.lx, lv.y + dh + 0.08, ds * (hd + off + 0.04), 0x2e2218); }
    for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, dh, 0.2); put(g, I.door.lx + e * (I.door.w / 2 + 0.08), lv.y + dh / 2, ds * (hd + off + 0.04), 0x2e2218); }
    if (I.approach) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      const stone = I.kind !== 'goten' && I.kind !== 'gate';
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        const g = new THREE.BoxGeometry(I.door.w + 0.3, Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4); put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
    }
  }
  if (!list.length) return;
  const m = new THREE.Mesh(mergeGeometries(list), mats().door);
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
  rt.scene.add(m);
}

// 毎コマ（battle.js）
export function nakaTick(rt, dt) {
  if (!NAKA.list.length || !rt.player) return;
  if (!NAKA.outer) buildOuter(rt);
  const u = rt.player.u, p = u.pos;
  NAKA.pp = p;
  NAKA.t += dt;
  // 近づいた建物だけ中を作り、近い時だけ描く
  for (const I of NAKA.list) {
    const d = Math.hypot(p.x - I.x, p.z - I.z);
    if (!I.built && d < I.R + 16) buildInside(rt, I);
    if (I.mesh) I.mesh.visible = d < I.R + 12;
  }
  // 遊び手の居る部屋
  const prev = NAKA.cur;
  NAKA.cur = u.alive ? nakaRoomAt(p.x, p.z, p.y) : null;
  const C = NAKA.cur;
  if (C && (!prev || prev.I !== C.I || prev.lv !== C.lv)) {
    const I = C.I, k = C.lv.k;
    if (!I.seen.in) { I.seen.in = true; if (I.onEnter) I.onEnter(rt, I); else if (rt.bark) rt.bark(I.levels.length > 1 ? `${I.name}の中。階段で上の階へ` : `${I.name}の中`); }
    if (!I.seen[k]) { I.seen[k] = true; if (I.onLevel) I.onLevel(rt, I, k); }
  }
  // 灯明のゆらぎ
  for (const I of NAKA.list) {
    if (!I.mesh || !I.mesh.visible) continue;
    for (let i = 0; i < I.glows.length; i++) { const sp = I.glows[i], t = NAKA.t * 7 + i * 1.7 + I.id; sp.visible = !rt.camera || sp.position.distanceTo(rt.camera.position) > 1.6; sp.scale.setScalar(0.78 + Math.sin(t) * 0.04 + Math.sin(t * 2.3) * 0.03); }
  }
  // 中は暗い：日の光と空の明かりを少し落とす（ほかが値を替えたら、それを新しい元にする）
  const W = rt.world;
  if (W && W.sun && W.hemi) {
    const want = C ? 0.5 : 1;
    NAKA.dim += (want - NAKA.dim) * Math.min(1, dt * 3);
    if (Math.abs(NAKA.dim - 1) < 0.002) NAKA.dim = 1;
    const lt = NAKA.lt || (NAKA.lt = { sun: W.sun.intensity, hemi: W.hemi.intensity, sunSet: W.sun.intensity, hemiSet: W.hemi.intensity });
    if (Math.abs(W.sun.intensity - lt.sunSet) > 1e-4) lt.sun = W.sun.intensity;
    if (Math.abs(W.hemi.intensity - lt.hemiSet) > 1e-4) lt.hemi = W.hemi.intensity;
    lt.sunSet = W.sun.intensity = lt.sun * NAKA.dim;
    lt.hemiSet = W.hemi.intensity = lt.hemi * (0.4 + NAKA.dim * 0.6);
  }
  // 中にいる兵の印（0.2 秒ごと）
  NAKA.ft = (NAKA.ft || 0) - dt;
  if (NAKA.ft > 0 || !rt.army) return;
  NAKA.ft = 0.2;
  for (const o of NAKA.flagged) o.naka = null;
  NAKA.flagged.length = 0;
  for (const I of NAKA.list) {
    rt.army.forNear(I.x, I.z, I.R, (o) => {
      if (!o.alive || o.isStruct || o.naka) return;
      const r = nakaRoomAt(o.pos.x, o.pos.z, o.pos.y);
      if (r && r.I === I) { o.naka = I.id + 1; NAKA.flagged.push(o); }
    });
  }
}
