import * as THREE from 'three';

// 地面・樹皮・葉・木肌などの絵を、キャンバスで描いて作る（外の画像を使わない）
// どれも一度だけ作って使い回す
const cache = new Map();
function once(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// なめらかな雑音（値雑音を何段か重ねる）。タイルの端がつながるように周期を合わせる
function noiseField(size, seed, octaves = 4, base = 4) {
  const R = rnd(seed);
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = R();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * n, fy = (y / size) * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
      const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
      const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
      out[y * size + x] += (a + (b - a) * sy) * amp;
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function toTex(canvas, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// 透ける絵（葉・草）：透明な所の色を、描いた所の平均の色で埋めて渡す
// （キャンバスのままだと透明な所が黒になり、遠くで縮んだ絵に黒が混ざって、草や葉の塊が黒ずむ）
// flipY は CanvasTexture と同じ向きになるよう、行を上下に入れ替えて作る
export function alphaTex(canvas, srgb = true) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) if (src[i + 3] > 128) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
  if (n) { r /= n; g /= n; b /= n; }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = ((h - 1 - y) * w + x) * 4;
    const a = src[si + 3];
    // 縁の半透明の所は、描いた色と平均の色を透け具合で混ぜる
    const k = a / 255;
    out[di] = src[si] * k + r * (1 - k); out[di + 1] = src[si + 1] * k + g * (1 - k); out[di + 2] = src[si + 2] * k + b * (1 - k); out[di + 3] = a;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function paintField(size, seed, colorAt) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const n1 = noiseField(size, seed, 5, 4), n2 = noiseField(size, seed + 7, 3, 16);
  for (let i = 0; i < size * size; i++) {
    const [r, gg, b] = colorAt(n1[i], n2[i], i % size, Math.floor(i / size));
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, g };
}
const mix = (a, b, t) => a + (b - a) * t;
const lerp3 = (A, B, t) => [mix(A[0], B[0], t), mix(A[1], B[1], t), mix(A[2], B[2], t)];

// 草地：緑と枯れ色のまだら。細い葉の筋を重ねる
export function grassTex() {
  return once('grass', () => {
    const { c, g } = paintField(512, 11, (a, b) => {
      let col = lerp3([58, 72, 34], [86, 98, 44], a);
      col = lerp3(col, [112, 104, 60], Math.max(0, b - 0.55) * 1.6);   // 枯れ草
      col = lerp3(col, [44, 52, 28], Math.max(0, 0.4 - a) * 1.2);      // 濃い影
      return col;
    });
    const R = rnd(3);
    for (let i = 0; i < 9000; i++) {
      const x = R() * 512, y = R() * 512, l = 3 + R() * 9, a = -Math.PI / 2 + (R() - 0.5) * 1.2;
      const v = R();
      g.strokeStyle = v < 0.5 ? `rgba(${40 + R() * 30},${60 + R() * 40},${20 + R() * 15},0.55)` : `rgba(${110 + R() * 50},${120 + R() * 40},${60 + R() * 20},0.35)`;
      g.lineWidth = 0.8 + R();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // 土の地肌がところどころ
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${90 + R() * 30},${76 + R() * 20},${52},${0.25 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * 512, R() * 512, 1 + R() * 4, 1 + R() * 3, R() * 3, 0, 7); g.fill(); }
    return toTex(c);
  });
}

// 踏み固められた土：小石と轍の筋
export function dirtTex() {
  return once('dirt', () => {
    const { c, g } = paintField(512, 21, (a, b) => {
      let col = lerp3([96, 80, 58], [128, 108, 78], a);
      col = lerp3(col, [74, 62, 46], Math.max(0, b - 0.6) * 1.5);
      return col;
    });
    const R = rnd(5);
    for (let i = 0; i < 1400; i++) {
      const x = R() * 512, y = R() * 512, r = 0.6 + R() * 2.6, v = 90 + R() * 80;
      g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},0.8)`; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); g.fill();
      g.fillStyle = 'rgba(30,24,18,0.35)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.8, r, r * 0.5, 0, 0, 7); g.fill();
    }
    // 土の塊・足跡・蹄の跡（数十 cm の凹凸。近くで見た時に、平らな面に見えないように）
    for (let i = 0; i < 220; i++) {
      const x = 14 + R() * 484, y = 14 + R() * 484, r = 4 + R() * 9, a = R() * 3;
      g.fillStyle = `rgba(40,30,22,${0.1 + R() * 0.14})`; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + R() * 0.4), a, 0, 7); g.fill();
      g.fillStyle = `rgba(170,150,120,${0.08 + R() * 0.1})`; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.7, r * 0.3, a, 0, 7); g.fill();
    }
    // 赤土・黄土の斑と、乾いて白っぽい所
    // （端にかかる斑は反対側にも描いて、繰り返した時に継ぎ目が出ないようにする）
    for (let i = 0; i < 30; i++) {
      const x0 = R() * 512, y0 = R() * 512, r = 20 + R() * 60, k = R();
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const x = x0 + ox, y = y0 + oy;
        if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, k < 0.4 ? 'rgba(140,90,50,0.12)' : k < 0.7 ? 'rgba(190,175,140,0.1)' : 'rgba(50,40,30,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // 轍（縦の筋）
    for (let k = 0; k < 6; k++) {
      const x0 = R() * 512;
      g.strokeStyle = `rgba(60,48,34,${0.15 + R() * 0.15})`; g.lineWidth = 6 + R() * 8;
      // 端の位置と傾きをそろえ、道の途中で筋が切れないようにする
      g.beginPath();
      for (let y = 0; y <= 512; y += 16) {
        const x = x0 + Math.sin(y / 512 * Math.PI * 2 + k) * 6;
        if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    return toTex(c);
  });
}

// 泥：濡れて暗い土。水の溜まった所は光る（粗さは別に下げる）
export function mudTex() {
  return once('mud', () => {
    const { c, g } = paintField(512, 31, (a, b) => {
      let col = lerp3([54, 44, 34], [78, 64, 48], a);
      col = lerp3(col, [40, 38, 36], Math.max(0, b - 0.62) * 2.2);
      return col;
    });
    const R = rnd(9);
    // 泥の塊と浅いくぼみ。縮んだ絵でも残る大きさで、濡れた所と乾いた縁を描く
    for (let i = 0; i < 48; i++) {
      const x = R() * 512, y = R() * 512, rx = 8 + R() * 22, ry = rx * (0.35 + R() * 0.4), a = R() * Math.PI;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        if (x + ox + rx < 0 || x + ox - rx > 512 || y + oy + rx < 0 || y + oy - rx > 512) continue;
        g.fillStyle = 'rgba(24,22,18,0.22)'; g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); g.fill();
        g.strokeStyle = 'rgba(130,112,84,0.16)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, Math.PI, Math.PI * 2); g.stroke();
      }
    }
    // 足跡
    for (let i = 0; i < 160; i++) {
      const x = R() * 512, y = R() * 512, a = R() * 6;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(28,22,16,0.5)'; g.beginPath(); g.ellipse(0, 0, 3, 7, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(120,110,96,0.25)'; g.beginPath(); g.ellipse(0.8, -1, 2, 5, 0, 0, 7); g.fill();
      g.restore();
    }
    return toTex(c);
  });
}

// 岩肌（急な斜面）
export function stoneTex() {
  return once('stone', () => {
    const { c } = paintField(256, 41, (a, b) => {
      const v = mix(70, 128, a) * (0.85 + b * 0.3);
      return [v * 0.95, v * 0.95, v * 0.9];
    });
    return toTex(c);
  });
}

// 大きな斑（タイルの繰り返しを隠す）
export function macroTex() {
  return once('macro', () => {
    const { c } = paintField(256, 51, (a, b) => { const v = 128 + (a - 0.5) * 150 + (b - 0.5) * 60; return [v, v, v]; });
    return toTex(c, true, false);
  });
}

// 樹皮：縦の割れ目
export function barkTex(kind = 'cedar') {
  return once('bark' + kind, () => {
    const base = kind === 'pine' ? [96, 70, 52] : kind === 'bamboo' ? [120, 132, 70] : [88, 62, 46];
    const { c, g } = paintField(128, kind.length * 13, (a) => lerp3(base, base.map((v) => v * 0.6), a));
    const R = rnd(kind.length * 17);
    if (kind === 'bamboo') {
      for (let y = 0; y < 128; y += 32) { g.fillStyle = 'rgba(70,80,40,0.8)'; g.fillRect(0, y, 128, 3); g.fillStyle = 'rgba(200,210,150,0.35)'; g.fillRect(0, y + 3, 128, 2); }
    } else {
      for (let i = 0; i < 70; i++) {
        const x = R() * 128;
        g.strokeStyle = `rgba(30,20,14,${0.3 + R() * 0.4})`; g.lineWidth = 1 + R() * 2;
        g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 128; y += 16) g.lineTo(x + (R() - 0.5) * 4, y); g.stroke();
      }
    }
    return toTex(c);
  });
}

// 葉の束（透ける板に貼る）：針葉・広葉・竹・薄
export function leafTex(kind) {
  return once('leaf' + kind, () => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    // 描いた後に alphaTex で読み出すので、読み出しの速い（画面の部品を使わない）キャンバスにする。携帯では読み出しが特に遅い
    const g = c.getContext('2d', { willReadFrequently: true });
    const R = rnd(kind.length * 31 + 7);
    if (kind === 'needle') {
      // 杉・松の葉：放射状の細い針の塊
      for (let k = 0; k < 26; k++) {
        const cx = S * (0.2 + R() * 0.6), cy = S * (0.2 + R() * 0.6);
        for (let i = 0; i < 70; i++) {
          const a = R() * Math.PI * 2, l = 10 + R() * 26, v = 0.25 + R() * 0.5;
          g.strokeStyle = `rgba(${28 + v * 30},${48 + v * 40},${24 + v * 16},0.9)`; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
        }
      }
    } else if (kind === 'broad') {
      for (let i = 0; i < 520; i++) {
        const x = S * 0.5 + (R() - 0.5) * S * 0.9 * Math.sqrt(R()), y = S * 0.5 + (R() - 0.5) * S * 0.9 * Math.sqrt(R());
        if (Math.hypot(x - S / 2, y - S / 2) > S * 0.46) continue;
        // 葉ごとの明暗は控えめに（ばらつきが強いと、遠目にざらざらした点描に見える）
        const v = 0.3 + R() * 0.45;
        g.fillStyle = `rgba(${50 + v * 50},${70 + v * 55},${30 + v * 20},0.95)`;
        g.beginPath(); g.ellipse(x, y, 4 + R() * 5, 2 + R() * 3, R() * 6, 0, 7); g.fill();
      }
    } else if (kind === 'bamboo') {
      for (let i = 0; i < 140; i++) {
        const x = R() * S, y = R() * S, a = (R() - 0.5) * 1.4 + (R() < 0.5 ? 0 : Math.PI), l = 18 + R() * 20, v = R();
        g.fillStyle = `rgba(${80 + v * 40},${110 + v * 40},${50 + v * 20},0.95)`;
        g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(l / 2, 0, l / 2, 2.2, 0, 0, 7); g.fill(); g.restore();
      }
    } else if (kind === 'susuki') {
      // 薄（ススキ）：細い葉と穂
      for (let i = 0; i < 40; i++) {
        const x = S * (0.15 + R() * 0.7), h = S * (0.5 + R() * 0.45), lean = (R() - 0.5) * 60, v = R();
        g.strokeStyle = `rgba(${120 + v * 50},${120 + v * 40},${70 + v * 20},0.9)`; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h); g.stroke();
        if (R() < 0.45) { g.strokeStyle = 'rgba(225,212,180,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + lean, S - h); g.quadraticCurveTo(x + lean * 1.2, S - h - 14, x + lean * 1.5, S - h - 26); g.stroke(); }
      }
    } else if (kind === 'flower') {
      // 野の花：草の中に白・黄・薄紫の点
      for (let i = 0; i < 26; i++) {
        const x = S * (0.1 + R() * 0.8), h = S * (0.3 + R() * 0.4);
        g.strokeStyle = 'rgba(70,96,40,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, S); g.lineTo(x + (R() - 0.5) * 10, S - h); g.stroke();
        g.fillStyle = ['rgba(236,232,220,0.95)', 'rgba(222,196,80,0.95)', 'rgba(170,150,200,0.95)'][i % 3];
        g.beginPath(); g.arc(x, S - h, 3 + R() * 3, 0, 7); g.fill();
      }
    }
    return alphaTex(c);
  });
}

// 木肌（柵・普請の材木）：縦の木目・年輪の筋・節・干割れ・雨に晒された灰色の斑・手斧の削り跡
export function woodTex() {
  return once('wood', () => {
    // 色は頂点の色で付けるので、ここは明るい灰の木目だけ（平均の明るさは前と同じくらい）
    const S = 256;
    const { c, g } = paintField(S, 61, (a, b) => { const v = mix(196, 238, a) * mix(0.94, 1.04, b); return [v, v * 0.985, v * 0.955]; });
    const R = rnd(4);
    // 木目：ゆるく波打つ細い筋を何本も
    for (let i = 0; i < 110; i++) {
      const x = R() * S, k = R();
      g.strokeStyle = k < 0.7 ? `rgba(70,58,46,${0.08 + R() * 0.18})` : `rgba(255,250,240,${0.08 + R() * 0.1})`;
      g.lineWidth = 0.6 + R() * 1.6;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 8) g.lineTo(x + Math.sin(y * 0.05 + i) * 2.5 + Math.sin(y * 0.013 + i * 0.3) * 4, y);
      g.stroke();
    }
    // 節：木目がよけて回り込む濃い楕円
    for (let i = 0; i < 3; i++) {
      const x = R() * S, y = R() * S, r = 1.5 + R() * 2.5;
      for (let k = 3; k >= 0; k--) { g.strokeStyle = `rgba(60,44,30,${0.06 + (3 - k) * 0.035})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r + k * 2, (r + k * 2) * 2.2, 0, 0, 7); g.stroke(); }
      g.fillStyle = 'rgba(50,36,24,0.32)'; g.beginPath(); g.ellipse(x, y, r, r * 1.6, 0, 0, 7); g.fill();
    }
    // 干割れ：細く暗い割れ目
    for (let i = 0; i < 9; i++) {
      const x = R() * S, y0 = R() * S, l = 20 + R() * 70;
      g.strokeStyle = 'rgba(30,22,16,0.5)'; g.lineWidth = 0.8 + R() * 0.8;
      g.beginPath(); g.moveTo(x, y0); for (let y = y0; y < y0 + l; y += 6) g.lineTo(x + (R() - 0.5) * 1.5, y); g.stroke();
    }
    // 雨に晒された灰の斑と、黒ずんだ染み
    for (let i = 0; i < 26; i++) {
      const x = R() * S, y = R() * S, r = 10 + R() * 40, dark = R() < 0.4;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? 'rgba(60,54,48,0.14)' : 'rgba(200,204,206,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 手斧の削り跡：横に並ぶ浅い凹み
    for (let i = 0; i < 40; i++) {
      const x = R() * S, y = R() * S;
      const gr = g.createLinearGradient(x, y - 5, x, y + 5); gr.addColorStop(0, 'rgba(255,250,240,0.1)'); gr.addColorStop(1, 'rgba(40,30,20,0.1)');
      g.fillStyle = gr; g.fillRect(x - 8, y - 5, 16, 10);
    }
    return toTex(c);
  });
}

// 茅葺き：藁の束が斜めに重なる
export function thatchTex() {
  return once('thatch', () => {
    const S = 256;
    const { c, g } = paintField(S, 71, (a) => lerp3([118, 100, 66], [150, 128, 84], a));
    const R = rnd(8);
    for (let row = 0; row < 16; row++) {
      const y = row * 16;
      g.fillStyle = 'rgba(40,30,18,0.35)'; g.fillRect(0, y + 13, S, 3);
      for (let i = 0; i < 180; i++) {
        const x = R() * S, l = 10 + R() * 8, v = R();
        g.strokeStyle = `rgba(${150 + v * 60},${126 + v * 50},${80 + v * 30},0.55)`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y + l); g.stroke();
      }
    }
    return toTex(c);
  });
}
