// 名のある武将の兜の立物（kaito 10/28「政宗の三日月・真田の鹿角と六文銭・信玄の諏訪法性…これくらいリアリティあるのに」）。
// 形の座標：錣の裾が y=0、鉢の軸が x=z=0、前が +z、1 = 1m（兜のスキャンと named_kacchu の立物と同じ）。
// 返す形：[主の形, 材質の鍵, [[添えの形, 材質の鍵], ...]]。鍵は gold・silver・black・white。
// 近い形（hi）と遠い形で枚数を変える。形は一度作って使い回す（毎コマ作らない）。
// 寸法と枚数は伝来品の写真の見え方に合わせた復元案（実測ではない）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KACCHU } from './kacchu_data.js';
import { maedateGeometry, isMaedate } from './kabuto_maedate.js';

// 武将ごとの立物。諏訪法性は近い兜（スキャン）だけで足す（遠い形は units_model の kabuto_suwa が白熊と獅子を描く）
const BY_NAME = {
  伊達政宗: 'date_moon',
  真田信繁: 'sanada_rokumon', 真田幸村: 'sanada_rokumon',
  武田信玄: 'suwa_hossho',
  徳川家康: 'ieyasu_shida',
  羽柴秀吉: 'hideyoshi_bari', 豊臣秀吉: 'hideyoshi_bari',
  黒田官兵衛: 'kuroda_goshi', 黒田如水: 'kuroda_goshi',
  藤堂高虎: 'todo_tokan',
  本多忠勝: 'honda_shika',
};
for (const [n, k] of Object.entries(BY_NAME)) if (KACCHU[n]) KACCHU[n].crest = k;
// 藤堂の唐冠は立物の形が鉢そのもの。下の鉢は丸い頭形にして、units_model の唐冠（上へ反る黒い纓）を重ねない（黒い角に見えていた）
if (KACCHU['藤堂高虎']) KACCHU['藤堂高虎'].bowl = 'zunari';
// 錣の段・威の糸（兜だけ。胴の odo は変えない）。rows 段数・style 毛引（kebiki）か素懸（sugake）・lace 錣の威
// 糸の色は具足の威（kacchu_data の調べ）とそろえ、段数と通し方は伝来品の写真の見え方に合わせた復元案（実測ではない）：
//   政宗 黒漆五枚胴具足の兜：日根野形の錣に黒糸の素懸　信長 紺糸威胴丸の兜：紺糸の毛引
//   信玄・信繁：紅糸の毛引　家康 歯朶具足：黒糸の毛引　秀吉：白糸の素懸　如水 合子形：黒糸の素懸三段　高虎 唐冠形：黒糸の毛引三段
const HELM = {
  伊達政宗: { rows: 4, style: 'sugake', lace: 0x16191b },
  織田信長: { rows: 4, style: 'kebiki', lace: 0x2e4468 },
  武田信玄: { rows: 4, style: 'kebiki', lace: 0xb02a1c },
  真田信繁: { rows: 4, style: 'kebiki', lace: 0xb8342a },
  真田幸村: { rows: 4, style: 'kebiki', lace: 0xb8342a },
  徳川家康: { rows: 4, style: 'kebiki', lace: 0x1c1a1a },
  羽柴秀吉: { rows: 4, style: 'sugake', lace: 0xe4dfcc },
  豊臣秀吉: { rows: 4, style: 'sugake', lace: 0xe4dfcc },
  黒田官兵衛: { rows: 3, style: 'sugake', lace: 0x1a1a1a },
  黒田如水: { rows: 3, style: 'sugake', lace: 0x1a1a1a },
  藤堂高虎: { rows: 3, style: 'kebiki', lace: 0x3a2a1e },
};
for (const [n, h] of Object.entries(HELM)) {
  const k = KACCHU[n]; if (!k) continue;
  k.shikoroRows = h.rows; k.shikoroLace = h.lace;
  if (!k.shikoroStyle || k.shikoroStyle === 'kebiki' || k.shikoroStyle === 'sugake') k.shikoroStyle = h.style;
}

const KINDS = new Set(['date_moon', 'sanada_rokumon', 'suwa_hossho', 'ieyasu_shida', 'hideyoshi_bari', 'kuroda_goshi', 'todo_tokan', 'honda_shika']);
export const isRealCrest = (k) => KINDS.has(k) || isMaedate(k);
const cache = new Map();

const clean = (g) => {
  let n = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
};
const join = (gs) => { const g = mergeGeometries(gs.map(clean)); g.computeBoundingSphere(); return g; };
// 打ち出しの薄板。近いものは縁を丸く落として照りの線を立てる
const plate = (pts, hi, d = 0.004) => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))),
    hi ? { depth: d, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 4 } : { depth: d, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -d / 2); return g;
};
const tube = (pts, r, hi) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), hi ? 12 : 5, r, hi ? 6 : 4);
// 根元から先へ細る管（鹿角の枝）。輪ごとに芯からの距離を縮める
const horn = (pts, r0, r1, hi) => {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), T = hi ? 12 : 4, R = hi ? 7 : 4;
  const g = new THREE.TubeGeometry(c, T, 1, R), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= T; i++) {
    const t = i / T, o = c.getPointAt(t), r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= R; j++) { const k = i * (R + 1) + j; v.fromBufferAttribute(p, k).sub(o).multiplyScalar(r).add(o); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  // 先は丸く閉じる
  const tip = new THREE.SphereGeometry(r1, hi ? 5 : 3, hi ? 4 : 2); tip.translate(...pts[pts.length - 1]);
  return join([g, tip]);
};
// 鉢の丸みに沿って左右の先を後ろへ反らす
const bend = (g, k = 0.3) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) - k * x * x); } return g; };

function build(kind, hi, near) {
  if (kind === 'date_moon') {
    // 政宗の弦月：鉢の幅の三倍に届く細く長い金の三日月。真ん中でも指二本ほどの幅で、両の先は針のように尖って高く上がる。
    // 本人の右（-x）が少し短い（刀を振る邪魔にならないように、と伝わる）。下に黒漆の小さな台
    const pts = [], N = hi ? 48 : 16, RX = 0.46, RY = 0.25;
    const ex = (x) => (x < 0 ? x * 0.88 : x);
    for (let i = 0; i <= N; i++) { const a = Math.PI + i * Math.PI / N; pts.push([ex(RX * Math.cos(a)), RY * Math.sin(a)]); }
    // 内の弧：幅は真ん中で 0.034、先へ向けて細る（先は外の弧に寄せて尖らせる）
    for (let i = N - 1; i >= 1; i--) { const a = Math.PI + i * Math.PI / N, c = Math.cos(a), w = 0.034 * Math.pow(Math.abs(Math.sin(a)), 1.4); pts.push([ex((RX - w * 0.3 * Math.abs(c)) * c), RY * Math.sin(a) + w]); }
    const g = plate(pts, hi, 0.005); g.translate(0, 0.475, 0.168); bend(g, 0.32);
    const dai = new THREE.BoxGeometry(0.036, 0.05, 0.012); dai.translate(0, 0.2, 0.165);
    return [join([g]), 'gold', [[join([dai]), 'black']]];
  }
  if (kind === 'sanada_rokumon') {
    // 真田の兜：黒漆の大きな鹿角の脇立と、前に金の六文銭（三つずつ二段）
    const coins = [];
    for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) {
      const s = new THREE.Shape(); s.absarc(0, 0, 0.023, 0, Math.PI * 2, false);
      const h = new THREE.Path(); const q = 0.0065; h.moveTo(-q, -q); h.lineTo(-q, q); h.lineTo(q, q); h.lineTo(q, -q); h.closePath(); s.holes.push(h);
      const g = new THREE.ExtrudeGeometry(s, hi ? { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 12 } : { depth: 0.003, bevelEnabled: false, curveSegments: 6 });
      g.translate(c * 0.05, 0.262 - r * 0.05, 0.17 + (r ? 0.004 : 0)); coins.push(g);
      // 銭の縁の輪と、穴の周りの郭（鋳物の段）
      if (hi) {
        const rim = new THREE.TorusGeometry(0.0215, 0.0018, 3, 20); rim.translate(c * 0.05, 0.262 - r * 0.05, 0.1735 + (r ? 0.004 : 0)); coins.push(rim);
        const sq = new THREE.TorusGeometry(0.0095, 0.0014, 3, 4); sq.rotateZ(Math.PI / 4); sq.translate(c * 0.05, 0.262 - r * 0.05, 0.1735 + (r ? 0.004 : 0)); coins.push(sq);
      }
    }
    const horns = [];
    for (const sd of [-1, 1]) {
      const X = (p) => [sd * p[0], p[1], p[2]];
      // 本角：太い根元から外へ開いて上へ伸び、先は後ろへ流れる。枝は前と外へ三本。どれも先へ細る
      horns.push(horn([[0.125, 0.16, 0.02], [0.17, 0.25, 0.01], [0.2, 0.36, -0.02], [0.215, 0.5, -0.06], [0.2, 0.64, -0.1]].map(X), 0.022, 0.005, hi));
      horns.push(horn([[0.183, 0.3, -0.004], [0.25, 0.36, 0.01], [0.3, 0.44, 0.0]].map(X), 0.014, 0.004, hi));
      horns.push(horn([[0.212, 0.46, -0.05], [0.28, 0.52, -0.06], [0.32, 0.62, -0.08]].map(X), 0.012, 0.0035, hi));
      if (hi) horns.push(horn([[0.2, 0.22, 0.015], [0.245, 0.245, 0.04], [0.265, 0.29, 0.05]].map(X), 0.011, 0.003, hi));
      // 根元の節（角座）：ごつごつした瘤
      const root = new THREE.SphereGeometry(0.026, hi ? 8 : 5, hi ? 6 : 4); root.scale(1.1, 0.9, 1); root.translate(sd * 0.127, 0.163, 0.02); horns.push(root);
    }
    return [join(coins), 'gold', [[join(horns), 'black']]];
  }
  if (kind === 'suwa_hossho') {
    // 信玄の諏訪法性：鉢を覆って肩まで垂れる白熊（ヤクの白い毛）、大きな金の鍬形、前の金の獅子噛
    const gold = [];
    for (const sd of [-1, 1]) {
      const g = plate([[0, 0], [0.055, 0], [0.16, 0.08], [0.25, 0.22], [0.29, 0.34], [0.23, 0.27], [0.12, 0.14], [0.035, 0.08]].map(([x, y]) => [sd * x, y]), hi);
      g.translate(sd * 0.02, 0.17, 0.165); gold.push(bend(clean(g), 0.4));
    }
    const face = new THREE.Shape(); const M = hi ? 18 : 10;
    for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2, r = (i % 2 ? 0.04 : 0.05); const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.9; i ? face.lineTo(x, y) : face.moveTo(x, y); }
    face.closePath();
    const fg = new THREE.ExtrudeGeometry(face, { depth: 0.012, bevelEnabled: hi, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }); fg.translate(0, 0.215, 0.16); gold.push(fg);
    if (hi) for (const sd of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.009, 8, 6); eye.translate(sd * 0.018, 0.225, 0.181); gold.push(eye);
      const brow = new THREE.BoxGeometry(0.026, 0.007, 0.008); brow.rotateZ(sd * -0.35); brow.translate(sd * 0.02, 0.238, 0.179); gold.push(brow);
      const fang = new THREE.ConeGeometry(0.004, 0.014, 4); fang.rotateX(Math.PI); fang.translate(sd * 0.012, 0.192, 0.18); gold.push(fang);
    }
    const nose = new THREE.SphereGeometry(0.012, hi ? 8 : 5, hi ? 6 : 4); nose.scale(1.2, 0.9, 1); nose.translate(0, 0.208, 0.182); gold.push(nose);
    const fur = [];
    // 毛の冠：鉢の上を覆う（前は鍬形の後ろで止める）
    const cap = new THREE.SphereGeometry(0.152, hi ? 20 : 10, hi ? 8 : 4, 0, Math.PI * 2, 0, 1.15); cap.scale(1.14, 1.12, 1.16); cap.translate(0, 0.135, -0.01); fur.push(cap);
    // 毛は細い房を三層に重ねる（太い房は白い平たい板に見えた。10/29）。内の層は短く鉢に沿い、外の層ほど長く広がる。
    // 房は上で細く束ね、下へ向けて少し外へ反りながら広がる（三段に折った細い錐）。毛先の透けと陰は furMaterial の色で
    const layers = hi ? [[0.0, 0.85, 120], [0.035, 1.0, 110], [0.07, 1.12, 90]] : [[0.03, 1.0, 26]];
    let k = 0;
    for (const [dr, lk, N] of layers) for (let i = 0; i < N; i++, k++) {
      // 鉢の横から後ろへ、肩の上まで大きく広がって垂れる。顔の前（±50°）には出さない
      const h1 = ((k * 53) % 17) / 17, j = ((k * 37) % 11) / 11;
      const a = Math.PI * 0.3 + ((i + h1 * 0.8) / N) * Math.PI * 1.4;
      const sa = Math.sin(a), ca = Math.cos(a);
      const len = (0.46 + j * 0.18 + (Math.abs(ca) > 0.8 ? 0.08 : 0)) * lk, out = (0.22 + j * 0.07) * lk + dr;
      const top = new THREE.Vector3(sa * (0.13 + dr * 0.4), 0.31 - j * 0.04 - dr * 0.3, ca * (0.13 + dr * 0.4));
      const pts = [];
      for (let q = 0; q <= 3; q++) {
        const t = q / 3, sw = Math.sqrt(t);
        pts.push(new THREE.Vector3(sa * (0.13 + dr * 0.4 + (out - 0.13) * sw), top.y - len * t, ca * (0.13 + dr * 0.4 + (out - 0.13) * sw) - 0.03 * t));
      }
      // 一本の房：上の束ねは細く、中ほどで広がり、毛先へ細る扁平な錐（帯の面を外へ向ける）
      const w0 = hi ? 0.006 : 0.03, w1 = hi ? 0.016 + 0.012 * j : 0.07, seg = hi ? 3 : 2;
      const pos = [], idx = [];
      for (let q = 0; q <= 3; q++) {
        const t = q / 3, w = q === 3 ? w0 * 0.3 : w0 + (w1 - w0) * Math.sin(t * Math.PI * 0.6), c = pts[q];
        for (let r = 0; r <= seg; r++) {
          const u = r / seg * 2 - 1, bulge = Math.sqrt(1 - u * u) * w * 0.35;
          pos.push(c.x + ca * u * w + sa * bulge, c.y, c.z - sa * u * w + ca * bulge);
        }
      }
      for (let q = 0; q < 3; q++) for (let r = 0; r < seg; r++) { const a0 = q * (seg + 1) + r, b0 = a0 + seg + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      fur.push(g);
    }
    return [join(gold), 'gold', [[join(fur), 'white']]];
  }
  if (kind === 'ieyasu_shida') {
    // 家康の歯朶：台から左右へ扇に開く二本の金の歯朶（裏白）の葉。軸に沿って小葉が並び、先ほど小さい
    const parts = [], n = hi ? 13 : 6;
    const stem = (sd) => {
      const P = (t) => new THREE.Vector2(sd * (0.012 + 0.2 * t + 0.03 * t * t), 0.03 + 0.27 * t - 0.06 * t * t);
      for (let i = 0; i < n; i++) {
        const t = 0.06 + 0.92 * i / n, p = P(t), q = P(t + 0.02), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
        const tx = dx / l, ty = dy / l, L = 0.075 * (1 - t * 0.75), w = 0.011 * (1 - t * 0.5);
        for (const s of [-1, 1]) {
          // 小葉は軸から斜め先へ向く尖った葉
          const nx = -ty * s, ny = tx * s, ax = nx * 0.8 + tx * 0.6, ay = ny * 0.8 + ty * 0.6;
          parts.push(plate([[p.x - tx * w, p.y - ty * w], [p.x + ax * L * 0.5 - tx * w * 0.6, p.y + ay * L * 0.5 - ty * w * 0.6], [p.x + ax * L, p.y + ay * L], [p.x + ax * L * 0.5 + tx * w, p.y + ay * L * 0.5 + ty * w], [p.x + tx * w, p.y + ty * w]], hi, 0.003));
        }
      }
      const sp = []; for (let i = 0; i <= 10; i++) { const p = P(i / 10); sp.push([p.x, p.y]); }
      for (let i = 10; i >= 0; i--) { const p = P(i / 10); sp.push([p.x, p.y + 0.007 * (1 - i / 12)]); }
      parts.push(plate(sp, hi, 0.004));
    };
    stem(-1); stem(1);
    const dai = new THREE.CylinderGeometry(0.026, 0.018, 0.04, hi ? 12 : 6); dai.scale(1, 1, 0.45); dai.translate(0, 0.012, 0); parts.push(dai);
    const g = join(parts.map((q) => { q.translate(0, 0.17, 0.16); return q; })); bend(g, 0.5);
    return [g, 'gold'];
  }
  if (kind === 'hideyoshi_bari') {
    // 秀吉の馬藺の後立：鉢の後ろから光の輪のように開く、細く尖った金の葉
    const parts = [], N = hi ? 29 : 13, L = 0.5;
    for (let i = 0; i < N; i++) {
      const a = (i / (N - 1) - 0.5) * Math.PI * 1.15, w = 0.016;
      const g = plate([[0, 0], [w, L * 0.25], [w * 0.75, L * 0.75], [0, L], [-w * 0.75, L * 0.75], [-w, L * 0.25]], hi, 0.003);
      g.rotateZ(-a); g.rotateX(-0.18); g.translate(0, 0, -i * 0.0004); parts.push(g);
    }
    const dai = new THREE.CylinderGeometry(0.03, 0.02, 0.07, hi ? 12 : 6); dai.translate(0, -0.02, 0); parts.push(dai);
    const g = join(parts); g.translate(0, 0.27, -0.145);
    return [g, 'gold'];
  }
  if (kind === 'kuroda_goshi') {
    // 黒田如水の銀白檀塗の合子形：鉢の上へ伏せた大きな椀。頂に小さな摘み
    const prof = [[0.158, 0.13], [0.166, 0.16], [0.18, 0.22], [0.183, 0.27], [0.174, 0.32], [0.15, 0.36], [0.11, 0.39], [0.05, 0.405], [0.0, 0.408]].map(([r, y]) => new THREE.Vector2(r, y));
    const parts = [new THREE.LatheGeometry(prof, hi ? 32 : 12)];
    const lip = new THREE.TorusGeometry(0.16, 0.006, 4, hi ? 32 : 12); lip.rotateX(Math.PI / 2); lip.translate(0, 0.135, 0); parts.push(lip);
    const knob = new THREE.SphereGeometry(0.022, hi ? 10 : 6, hi ? 6 : 4); knob.scale(1, 0.7, 1); knob.translate(0, 0.418, 0); parts.push(knob);
    const g = join(parts); g.scale(1, 1, 1.06); g.translate(0, 0, -0.008);
    return [g, 'silver'];
  }
  if (kind === 'todo_tokan') {
    // 藤堂の唐冠形：黒漆の冠形の鉢、後ろに丸く立つ巾子（こじ）、左右へ長く張った銀の纓（えい）
    // 遠い形は units_model の丸い頭形の鉢（半径 0.19）が冠を兼ねるので、巾子と纓だけを載せる
    const prof = [[0.156, 0.13], [0.16, 0.2], [0.155, 0.27], [0.135, 0.315], [0.08, 0.335], [0.0, 0.34]].map(([r, y]) => new THREE.Vector2(r, y));
    const cap = new THREE.LatheGeometry(prof, hi ? 28 : 10); cap.scale(1, 1, 1.06);
    // 巾子：前から見て角の立たない丸い筒。頂は半球で閉じる
    const kp = [[0.07, 0], [0.072, 0.06], [0.066, 0.095], [0.05, 0.118], [0.026, 0.128], [0, 0.131]].map(([r, y]) => new THREE.Vector2(r, y));
    const koji = new THREE.LatheGeometry(kp, hi ? 20 : 8); koji.scale(1.15, 1, 0.62); koji.translate(0, near ? 0.27 : 0.25, near ? -0.07 : -0.1);
    const wings = [];
    for (const sd of [-1, 1]) {
      // 纓：根元が細く、先が丸く広がる長い薄板。少し上へ反り、先ほど後ろへ流れる
      const pts = [], N = hi ? 8 : 4;
      pts.push([0.05, -0.012]);
      for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i * Math.PI / N; pts.push([0.52 + Math.cos(a) * 0.04, 0.012 + Math.sin(a) * 0.04]); }
      pts.push([0.05, 0.012]);
      const g = plate(pts.map(([x, y]) => [sd * x, y]), hi, 0.005);
      g.rotateZ(sd * 0.14); bend(g, 0.12); g.translate(0, near ? 0.34 : 0.33, near ? -0.08 : -0.11); wings.push(g);
    }
    return [join(near ? [cap, koji] : [koji]), 'black', [[join(wings), 'silver']]];
  }
  if (kind === 'honda_shika') {
    // 本多忠勝の鹿角脇立：和紙を張り重ねた黒漆の大きな鹿角。鉢の左右から外へ開き、頭の二倍の高さまで立つ。
    // 本角に前へ出る眉枝・外への二の枝・先の二股。太い根元から先へ細る（平たい板にしない）
    const parts = [];
    for (const sd of [-1, 1]) {
      const X = (p) => [sd * p[0], p[1], p[2]];
      parts.push(horn([[0.12, 0.17, -0.01], [0.165, 0.28, -0.02], [0.215, 0.42, -0.045], [0.25, 0.56, -0.07], [0.255, 0.7, -0.095]].map(X), 0.027, 0.012, hi));
      parts.push(horn([[0.15, 0.24, -0.015], [0.2, 0.27, 0.03], [0.24, 0.32, 0.06]].map(X), 0.016, 0.004, hi));
      parts.push(horn([[0.205, 0.39, -0.04], [0.29, 0.44, -0.04], [0.36, 0.52, -0.05]].map(X), 0.015, 0.004, hi));
      parts.push(horn([[0.252, 0.66, -0.09], [0.31, 0.72, -0.1], [0.35, 0.8, -0.11]].map(X), 0.012, 0.003, hi));
      parts.push(horn([[0.255, 0.68, -0.093], [0.235, 0.76, -0.1], [0.23, 0.83, -0.105]].map(X), 0.011, 0.003, hi));
      if (hi) parts.push(horn([[0.235, 0.5, -0.06], [0.2, 0.57, -0.04], [0.19, 0.63, -0.035]].map(X), 0.011, 0.003, hi));
      const root = new THREE.SphereGeometry(0.03, hi ? 8 : 5, hi ? 6 : 4); root.scale(1.1, 0.9, 1); root.translate(sd * 0.12, 0.17, -0.01); parts.push(root);
    }
    return [join(parts), 'black'];
  }
  return null;
}
// near：近い兜（スキャン）の時だけ true。諏訪法性は遠い形では返さない
// 白熊の毛の材質：一つだけ作って使い回す。形の位置から、細い毛筋の明暗・内の層と根元の陰・毛先の透け（抜き）を描く
let FUR_MAT = null;
export function furMaterial() {
  if (FUR_MAT) return FUR_MAT;
  const m = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, metalness: 0, roughness: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vFuP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFuP = position;');
    sh.fragmentShader = 'varying vec3 vFuP;\nfloat fuH(float x) { return fract(sin(x * 127.1) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float ang = atan(vFuP.x, vFuP.z), r = length(vFuP.xz);
        float s1 = ang * 260.0, s2 = ang * 95.0 + 3.0;
        // 毛筋：細い筋の明暗（二つの細かさを重ねる）
        float str = 0.72 + 0.2 * fuH(floor(s1)) + 0.12 * fuH(floor(s2));
        // 内の層・鉢に近い所・房の上の束ねは陰る（毛の重なりの影）
        float occ = mix(0.5, 1.0, smoothstep(0.13, 0.3, r)) * mix(0.75, 1.0, smoothstep(0.32, 0.18, vFuP.y));
        // 毛先は筋ごとに長さを変えて抜く（切り揃えた板の縁にしない）
        float tip = vFuP.y + 0.5 * fuH(floor(s1) + 7.0) * 0.12;
        if (vFuP.y < -0.05 && fuH(floor(s1) + floor(vFuP.y * 40.0) * 3.1) > smoothstep(-0.36, -0.05, tip) + 0.25) discard;
        diffuseColor.rgb *= str * occ;
        // 古びた白：根元は少し黄ばむ
        diffuseColor.rgb *= mix(vec3(0.93, 0.88, 0.78), vec3(1.0), smoothstep(0.25, 0.05, vFuP.y));
      }`);
  };
  m.customProgramCacheKey = () => 'kabuto-fur1';
  FUR_MAT = m; return m;
}
export function realCrestGeometry(kind, hi = true, near = false) {
  // 前立の形は kabuto_maedate.js が本（下の build は古い形の控え）
  if (isMaedate(kind)) return maedateGeometry(kind, hi, near);
  if (!KINDS.has(kind)) return undefined;
  if (kind === 'suwa_hossho' && !near) return null;
  const key = kind + (hi ? '|近' : '|遠') + (near && kind === 'todo_tokan' ? '|兜' : '');
  if (!cache.has(key)) cache.set(key, build(kind, hi, near));
  return cache.get(key);
}
