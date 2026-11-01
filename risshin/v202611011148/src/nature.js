import * as THREE from 'three';
import { generatedTex } from './generated_tex.js';
import { S as SETTINGS } from './settings.js';
import { loadGroundPhoto } from './ground_photo.js';

// 地面・樹皮・葉・木肌などの絵。自作の生成画像とキャンバスの絵を共用する
// どれも一度だけ作って使い回す
const cache = new Map();
export function sharedNatureResources() { return cache; }
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
  t.userData.astcStatic = true;   // 一度描いたきりの絵：iPhone は送った後に canvas を返す（astc_rt）
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

// 写真は色合わせ済みの512角。平場の指定でも同じ絵を共用し、丸い窪みは焼き込まない。
function groundPhoto(kind) {
  return once(`groundPhoto-${kind}`, () => {
    // 写真を待つ間も土粒と草の斑を残す。失敗時に単色の板を出し続けない。
    // 既存の雑音を一度だけ焼き、写真が届けば同じ入れ物へ戻す。
    const { c } = paintField(256, kind === 'grass' ? 11 : 23, (a, b) => {
      const grain = (b - 0.5) * 32;
      return kind === 'grass'
        ? [47 + a * 38 + grain, 58 + a * 40 + grain, 25 + a * 22 + grain * 0.5]
        : kind === 'mud' ? [54 + a * 24 + grain * 0.5, 44 + a * 20 + grain * 0.5, 34 + a * 14 + grain * 0.4]
        : [87 + a * 68 + grain, 65 + a * 57 + grain, 40 + a * 40 + grain * 0.6];
    });
    const tex = toTex(c);
    tex.anisotropy = 4;
    tex.userData.noAstc = true; // 既に圧縮した絵を読むので、その場での圧縮はしない。
    tex.userData.photoReady = { value: 0 };
    loadGroundPhoto(kind)
      .then((loaded) => {
        tex.dispose(); // 仮の絵の領域を返してから、同じ入れ物に圧縮した絵を渡す。
        tex.image = loaded.image; tex.mipmaps = loaded.mipmaps;
        tex.isCompressedTexture = !!loaded.isCompressedTexture;
        tex.format = loaded.format; tex.type = loaded.type;
        tex.userData.freeImage = !!loaded.userData.freeImage;
        tex.flipY = loaded.flipY; tex.generateMipmaps = loaded.generateMipmaps;
        tex.minFilter = loaded.minFilter; tex.needsUpdate = true;
        tex.userData.photoReady.value = 1;
        c.width = c.height = 1;
      }).catch(() => {}); // 読めない時も、季節と夜の色が付く下地を残す。
    return tex;
  });
}

// 画質「低」は既存の下地を保ち、近くの濃淡にだけ同じ写真を共用する。
export function groundDetailTex(kind) { return groundPhoto(kind); }

// 草地：株の根元・伏せた葉・株間の土。同じ絵の濃淡を地面の凹凸にも使う。
export function grassTex(plain = false) {
  if (SETTINGS.quality === 'high') return groundPhoto('grass');
  return once(plain ? 'grassPlain' : 'grass', () => {
    const { c, g } = paintField(512, 11, (a, b) => {
      let col = lerp3([58, 72, 34], [86, 98, 44], a);
      col = lerp3(col, [112, 104, 60], Math.max(0, b - 0.55) * 1.6);   // 枯れ草
      col = lerp3(col, [44, 52, 28], Math.max(0, 0.4 - a) * 1.2);      // 濃い影
      return col;
    });
    const R = rnd(3);
    // 端を越えた株も隣へ描く。遠くでは縮小画像にまとまり、縫い目や細い縞を残さない。
    const stamp = (x, y, radius, draw) => {
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        if (x + dx + radius < 0 || x + dx - radius > 512 || y + dy + radius < 0 || y + dy - radius > 512) continue;
        g.save(); g.translate(x + dx, y + dy); draw(); g.restore();
      }
    };
    // 面全体を平行な線で埋めず、湿った窪みと乾いた土の縁を草の下へ残す。
    // 指定した原では丸い窪みを焼き込まない。地面の泥と二重の輪になってしまう。
    for (let i = 0; i < (plain ? 0 : 95); i++) {
      const x = R() * 512, y = R() * 512, radius = 5 + R() * 19, angle = R() * Math.PI;
      stamp(x, y, radius + 3, () => {
        g.rotate(angle);
        g.fillStyle = 'rgba(126,105,70,0.38)';
        g.beginPath(); g.ellipse(0, 0, radius, radius * 0.55, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(47,43,29,0.32)';
        g.beginPath(); g.ellipse(-1, 1, radius * 0.8, radius * 0.4, 0, 0, 7); g.fill();
      });
    }
    for (let i = 0; i < 320; i++) {
      const x = R() * 512, y = R() * 512, radius = 8 + R() * 16;
      const angle = R() * Math.PI * 2, dry = R() < 0.24;
      // 根を共有する葉を一度作り、端の写しでも同じ形と色を保つ。
      const leaves = [];
      for (let j = 0; j < 11; j++) {
        const a = angle + (R() - 0.5) * 4.8, length = radius * (0.35 + R() * 0.65);
        leaves.push([Math.cos(a) * length, Math.sin(a) * length, (R() - 0.5) * length * 0.65,
          0.7 + R() * 1.5, R()]);
      }
      stamp(x, y, radius * 1.5, () => {
        // 根元の陰は小さく締め、株全体に丸い黒斑を付けない。
        g.fillStyle = 'rgba(27,34,18,0.38)';
        g.beginPath(); g.ellipse(0, 1, radius * 0.28, radius * 0.18, angle, 0, 7); g.fill();
        for (const [tx, ty, bend, width, tint] of leaves) {
          const cx = tx * 0.45 - Math.sin(angle) * bend, cy = ty * 0.45 + Math.cos(angle) * bend;
          g.fillStyle = dry ? `rgba(151,133,78,${0.4 + tint * 0.3})`
            : `rgba(${65 + tint * 52},${82 + tint * 48},${32 + tint * 24},0.7)`;
          // 先を尖らせて曲げる。明るい葉と暗い根が既存の法線処理にも起伏を渡す。
          g.beginPath(); g.moveTo(-width, 0);
          g.quadraticCurveTo(cx - width, cy, tx, ty);
          g.quadraticCurveTo(cx + width, cy, width, 0); g.closePath(); g.fill();
        }
      });
    }
    return toTex(c);
  });
}

// 踏み固めた土。長い藁の筋で一面を覆わず、締まった地肌に土塊と浅い踏み跡を残す。
// 色の濃淡は共通地面の凹凸にも使われる。追加の面や法線用の絵は持たない。
export function dirtTex(plain = false, procedural = false) {
  // 足形を省く戦は、高画質でも作り置きの細粒を選べる。未指定の戦は写真のまま。
  if (SETTINGS.quality === 'high' && !procedural) return groundPhoto('dirt');
  const size = 512;
  return once(`dirt-${size}-${plain}`, () => {
    const { c, g } = paintField(size, 23, (a, b) => {
      const hollow = Math.max(0, 0.48 - a) * 1.8;
      const grain = (b - 0.5) * 24;
      return [142 + a * 34 - hollow * 48 + grain,
        119 + a * 30 - hollow * 42 + grain,
        87 + a * 27 - hollow * 32 + grain * 0.8];
    });
    const R = rnd(231);
    // 以降は同じ縮尺で描く。端をまたぐ模様を隣にも描き、繰り返しの継ぎ目をなくす。
    g.scale(size / 512, size / 512);
    const stamp = (x, y, radius, draw) => {
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        if (x + dx + radius < 0 || x + dx - radius > 512 || y + dy + radius < 0 || y + dy - radius > 512) continue;
        g.save(); g.translate(x + dx, y + dy); draw(); g.restore();
      }
    };
    // 押し固めた面と崩れた粒を混ぜる。土塊の大きさ・角数・向きはそろえない。
    for (let i = 0; i < (plain ? 0 : 190); i++) {
      const x = R() * 512, y = R() * 512, radius = 1.5 + Math.pow(R(), 2) * 14;
      const points = [], n = 5 + Math.floor(R() * 4), squash = 0.45 + R() * 0.5;
      for (let j = 0; j < n; j++) {
        const a = j / n * Math.PI * 2, r = radius * (0.65 + R() * 0.35);
        points.push([Math.cos(a) * r, Math.sin(a) * r * squash]);
      }
      const angle = R() * Math.PI * 2, light = R() < 0.45;
      stamp(x, y, radius + 2, () => {
        g.rotate(angle); g.beginPath();
        points.forEach(([px, py], j) => j ? g.lineTo(px, py) : g.moveTo(px, py));
        g.closePath(); g.fillStyle = light ? 'rgba(192,169,128,0.24)' : 'rgba(80,66,47,0.22)'; g.fill();
        g.strokeStyle = 'rgba(70,57,40,0.15)'; g.lineWidth = 0.7; g.stroke();
      });
    }
    // 砂礫は短い粒にする。遠くでは縮小画像で地肌へ溶ける。
    for (let i = 0; i < 4200; i++) {
      const x = R() * 512, y = R() * 512, radius = 0.35 + R() * 1.1;
      const light = R() < 0.48;
      stamp(x, y, 2, () => {
        g.fillStyle = light ? 'rgba(214,194,156,0.28)' : 'rgba(65,54,39,0.25)';
        g.beginPath(); g.ellipse(0, 0, radius, radius * 0.65, 0, 0, Math.PI * 2); g.fill();
      });
    }
    // 踏み跡は少数・浅く。行進する同じ足形の列にはしない。
    for (let i = 0; i < (plain ? 0 : 9); i++) {
      const x = R() * 512, y = R() * 512, angle = R() * Math.PI * 2;
      stamp(x, y, 19, () => {
        g.rotate(angle); g.scale(0.8 + (i % 3) * 0.12, 1);
        g.fillStyle = 'rgba(73,59,42,0.16)';
        g.beginPath(); g.ellipse(0, -5, 4.5, 9, 0.1, 0, Math.PI * 2); g.ellipse(0, 7, 3.5, 4.5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(199,175,134,0.2)'; g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(0, -5, 5, 9.5, 0.1, 0.1, Math.PI); g.stroke();
      });
    }
    const tex = toTex(c);
    tex.anisotropy = 4;
    return tex;
  });
}

// 土塁と切岸は、道の轍とは別の赤土・黒土・根と雨筋の絵。
export function bankTex() {
  return generatedTex('earth');
}

// 泥：濡れて暗い土。水の溜まった所は光る（粗さは別に下げる）
export function mudTex(plain = false) {
  // 画質「高」は田・ぬかるみに CC0 の泥の写真（Poly Haven brown_mud_02・512角）
  if (SETTINGS.quality === 'high') return groundPhoto('mud');
  return once(`mud-${plain}`, () => {
    const { c, g } = paintField(512, 31, (a, b) => {
      let col = lerp3([54, 44, 34], [78, 64, 48], a);
      col = lerp3(col, [40, 38, 36], Math.max(0, b - 0.62) * 2.2);
      return col;
    });
    const R = rnd(9);
    // 泥の塊と浅いくぼみ。縮んだ絵でも残る大きさで、濡れた所と乾いた縁を描く
    for (let i = 0; i < (plain ? 0 : 48); i++) {
      const x = R() * 512, y = R() * 512, rx = 8 + R() * 22, ry = rx * (0.35 + R() * 0.4), a = R() * Math.PI;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        if (x + ox + rx < 0 || x + ox - rx > 512 || y + oy + rx < 0 || y + oy - rx > 512) continue;
        g.fillStyle = 'rgba(24,22,18,0.22)'; g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); g.fill();
        g.strokeStyle = 'rgba(130,112,84,0.16)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, Math.PI, Math.PI * 2); g.stroke();
      }
    }
    // 足跡
    for (let i = 0; i < (plain ? 0 : 160); i++) {
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
// 境内の砂利一枚。粒の陰と明るい縁を焼き込み、遠景は縮小画像へ戻す。
export function gravelTex() {
  return once('gravelCourt', () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), R = rnd(158206);
    g.fillStyle = '#8c887d'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const x = R() * 256, y = R() * 256, r = 0.8 + R() * 2.1;
      const v = Math.floor(115 + R() * 100), a = R() * Math.PI;
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
        g.fillStyle = '#555249'; g.beginPath();
        g.ellipse(x + dx + 0.5, y + dy + 0.8, r * 1.2, r * 0.75, a, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgb(${v},${v - 3},${v - 12})`; g.beginPath();
        g.ellipse(x + dx, y + dy, r, r * 0.65, a, 0, Math.PI * 2); g.fill();
      }
    }
    return toTex(c);
  });
}

export function stoneTex() {
  return once('stone', () => {
    const { c, g } = paintField(256, 41, (a, b) => {
      const v = mix(70, 128, a) * (0.85 + b * 0.3);
      // 広い苔の斑と、風化した灰褐色。凹凸にも同じ絵を使う。
      const moss = Math.max(0, a - 0.57) * 1.3;
      return [v * (0.95 - moss * 0.2), v * (0.95 + moss * 0.06), v * (0.9 - moss * 0.32)];
    });
    // 枝分かれする細い割れ。端を越えた線は隣にも描き、繰り返しの継ぎ目を残さない。
    const R = rnd(413);
    for (let i = 0; i < 15; i++) {
      let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2;
      const points = [[x, y]];
      for (let k = 0; k < 4; k++) {
        a += (R() - 0.5) * 1.1;
        x += Math.cos(a) * (8 + R() * 15); y += Math.sin(a) * (8 + R() * 15);
        points.push([x, y]);
      }
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
        const line = (ox, oy) => {
          g.beginPath(); g.moveTo(points[0][0] + dx + ox, points[0][1] + dy + oy);
          for (let k = 1; k < points.length; k++) g.lineTo(points[k][0] + dx + ox, points[k][1] + dy + oy);
          g.stroke();
        };
        g.strokeStyle = 'rgba(185,174,146,0.3)'; g.lineWidth = 2.2; line(1, 1);
        g.strokeStyle = 'rgba(32,29,24,0.55)'; g.lineWidth = 0.7 + i % 3 * 0.35; line(0, 0);
        g.beginPath(); g.moveTo(points[2][0] + dx, points[2][1] + dy);
        g.lineTo(points[2][0] + dx + Math.cos(a + 1.1) * 12, points[2][1] + dy + Math.sin(a + 1.1) * 12); g.stroke();
      }
    }
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
  if (kind === 'cedar') return generatedTex('cedar');
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
    if (kind === 'treeCedar' || kind === 'treePine' || kind === 'treeBroad' || kind === 'treeBamboo') {
      // 一株分の葉。枝間の抜けと不揃いな葉先を残し、三枚板と遠景の一枚で共用する。
      const cedar = kind === 'treeCedar', pine = kind === 'treePine';
      const bamboo = kind === 'treeBamboo';
      const bunch = (x, y, rx, ry) => {
        for (let j = 0; j < 42; j++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R());
          const px = x + Math.cos(a) * rx * d, py = y + Math.sin(a) * ry * d;
          const v = 155 + R() * 65 + (1 - py / S) * 20;
          g.fillStyle = `rgb(${v * 0.91 | 0},${v | 0},${v * 0.79 | 0})`;
          g.beginPath(); g.ellipse(px, py, bamboo ? 2 : 3 + R() * 4, bamboo ? 9 : 2 + R() * 3, R() * 3, 0, Math.PI * 2); g.fill();
        }
      };
      // 遠くの一枚の木（10/29）：細い傘・切り絵に見えないよう、丸い葉の塊を重ねる。
      // 塊ごとに上と日の側を明るく、下と奥を暗く。塊の間に暗い隙間と枝・幹をのぞかせる。
      const limb = (x0, y0, x1, y1, w) => {
        g.strokeStyle = 'rgb(56,52,40)'; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (R() - 0.5) * S * 0.05, (y0 + y1) / 2, x1, y1); g.stroke();
      };
      const clumps = [];
      const clump = (x, y, rx, ry, depth) => clumps.push([Math.max(rx + 2, Math.min(S - rx - 2, x)), y, rx, ry, depth]);
      const paint = () => {
        clumps.sort((p, q) => p[4] - q[4]);
        for (const [x, y, rx, ry, depth] of clumps) {
          const base = 0.6 + depth * 0.4;
          g.fillStyle = `rgb(${66 * base | 0},${76 * base | 0},${56 * base | 0})`;
          g.beginPath(); g.ellipse(x, y + ry * 0.1, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2); g.fill();
          const n = Math.round(26 + rx * ry * 0.09);
          for (let j = 0; j < n; j++) {
            const a = R() * Math.PI * 2, d = Math.sqrt(R()), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
            const lit = Math.max(0, Math.min(1, 0.55 - oy * 0.45 - ox * 0.2 + (R() - 0.5) * 0.3));
            const v = (88 + lit * 158) * base;
            g.fillStyle = `rgb(${v * 0.9 | 0},${v | 0},${v * 0.76 | 0})`;
            g.beginPath(); g.ellipse(x + ox * rx, y + oy * ry, 2.5 + R() * 3.5, 2 + R() * 2.5, R() * 3, 0, Math.PI * 2); g.fill();
          }
        }
      };
      if (cedar) {
        // 杉：真っすぐな幹に、上ほど小さい塊を互い違いに積む（縁は欠けて凸凹）
        limb(S * 0.5, S, S * 0.5, S * 0.05, 5);
        // 本物の杉（10/30）：細い尖った梢から、段ごとに長さの違う枝が左右で不揃いに張り、枝先が垂れる。
        // 段の間に暗い隙間と幹をのぞかせ、整った三角の切り絵にしない。裾は広げすぎず、細長い樹形。
        for (let k = 0; k < 15; k++) {
          const t = k / 14, y = S * (0.06 + t * 0.84), w = S * (0.035 + Math.pow(t, 0.85) * 0.27) * (0.7 + R() * 0.45);
          for (const side of [-1, 0, 1]) {
            if (side && k < 2) continue;
            if (side && k > 4 && R() < 0.18) continue;   // ところどころ枝が欠けて幹が見える
            const reach = side ? (0.5 + R() * 0.55) : 0, rx = w * (side ? 0.4 : 0.42) * (0.7 + R() * 0.5) + 3;
            const ry = S * 0.03 * (0.8 + R() * 0.5) + rx * 0.12;
            if (side) limb(S * 0.5, y - ry * 0.3, S * 0.5 + side * w * reach * 0.9, y + ry * 0.5, 1.6 + t * 1.6);
            clump(S * 0.5 + side * w * reach, y + reach * ry * 0.7 + (R() - 0.5) * S * 0.02, rx, ry, side ? R() * 0.9 : 0.25 + R() * 0.35);
          }
        }
        paint();
      } else if (pine) {
        // 松：曲がった幹に、高さの違う平たい葉の塊が段違いに付く（傘一枚にしない）
        let px = S * 0.5, py = S;
        for (let k = 0; k < 5; k++) {
          const nx = px + (R() - 0.5) * S * 0.14, ny = py - S * 0.17;
          limb(px, py, nx, ny, 8 - k * 1.2);
          const pads = k === 4 ? 1 : 1 + (R() < 0.6 ? 1 : 0);
          for (let j = 0; j < pads; j++) {
            const side = k === 4 ? 0 : (j ? -1 : 1) * ((k & 1) ? -1 : 1), rx = S * (0.11 + R() * 0.08) * (1 - k * 0.08);
            const cx = nx + side * S * (0.12 + R() * 0.16), cy = ny + (R() - 0.3) * S * 0.06;
            if (side) limb(nx, ny, cx - side * rx * 0.4, cy + S * 0.02, 3);
            clump(cx, cy, rx, rx * (0.45 + R() * 0.2), 0.2 + R() * 0.8);
            if (R() < 0.7) clump(cx + side * rx * 0.5, cy - rx * 0.2, rx * 0.6, rx * 0.35, 0.5 + R() * 0.5);
          }
          px = nx; py = ny;
        }
        paint();
      } else if (!bamboo) {
        // 雑木：幹から大枝が開き、丸い塊が重なった円い樹冠。下の縁から幹がのぞく
        limb(S * 0.5, S, S * 0.49, S * 0.6, 8);
        for (let k = 0; k < 13; k++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()), rx = S * (0.11 + R() * 0.07);
          const x = S * (0.5 + Math.cos(a) * d * 0.29), y = S * (0.45 + Math.sin(a) * d * 0.25);
          if (k < 5) limb(S * 0.49, S * 0.62, x, y + rx * 0.3, 3.5);
          clump(x, y, rx, rx * (0.75 + R() * 0.2), Math.max(0, Math.min(1, 0.85 - (y / S - 0.2) * 0.9 + (R() - 0.5) * 0.4)));
        }
        paint();
      } else {
        const rows = 7;
        for (let k = 0; k < rows; k++) {
          const y = S * (0.16 + k / (rows - 1) * 0.67);
          const w = S * 0.22;
          for (let j = 0; j < 4; j++) bunch(S * 0.5 + (j / 3 - 0.5) * w * 1.6,
            y + (R() - 0.5) * S * 0.09, w * 0.48, S * 0.095);
        }
      }
    } else if (kind === 'cedar') {
      // 杉の一枝。細線だけの梯子を避け、重なる針葉の房で枝元を包む。
      // 近景も遠景も既存の一枚を共用し、枝間の透かしと先細りを残す。
      g.strokeStyle = 'rgb(112,120,95)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(S * 0.5, S * 0.95); g.quadraticCurveTo(S * 0.43, S * 0.5, S * 0.52, S * 0.08); g.stroke();
      for (let k = 0; k < 16; k++) {
        const t = k / 16, y = S * (0.88 - t * 0.75), x = S * (0.49 + Math.sin(t * 5) * 0.025);
        for (const side of [-1, 1]) {
          const reach = S * (0.07 + Math.sin((0.12 + t * 0.88) * Math.PI) * 0.29) * (0.78 + R() * 0.22);
          const rise = S * (0.06 + R() * 0.07), rootY = y + (R() - 0.5) * S * 0.035;
          // 奥の葉房を面で描く。中央を膨らませ、枝先へ絞って板の直線を出さない。
          g.fillStyle = 'rgb(139,151,119)';
          g.beginPath(); g.moveTo(x, rootY + 5);
          g.bezierCurveTo(x + side * reach * 0.35, rootY - rise * 0.15 - 10,
            x + side * reach * 0.75, rootY - rise - 7, x + side * reach, rootY - rise);
          g.bezierCurveTo(x + side * reach * 0.72, rootY - rise + 10,
            x + side * reach * 0.3, rootY + 12, x, rootY + 5); g.fill();
          g.strokeStyle = 'rgb(132,141,112)'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(x, rootY); g.quadraticCurveTo(x + side * reach * 0.6, rootY - rise * 0.3, x + side * reach, rootY - rise); g.stroke();
          for (let j = 0; j < 12; j++) {
            const q = (j + 0.5) / 12, px = x + side * reach * q, py = rootY - rise * q * q;
            const len = S * (0.035 + R() * 0.025) * (1 - q * 0.6);
            // 対の針葉を枝先へ向ける。根元の陰から葉先の明るさへ、房単位で濃淡を付ける。
            for (const edge of [-1, 1]) {
              const tipX = px + side * len * 0.8, tipY = py + edge * len * 0.85 - len * 0.35;
              const v = 169 + q * 35 + (edge < 0 ? 14 : 0) + R() * 12;
              g.fillStyle = `rgb(${v * 0.94 | 0},${v | 0},${v * 0.83 | 0})`;
              g.beginPath(); g.moveTo(px - side * 3, py + 2);
              g.quadraticCurveTo(px + side * len * 0.25, py + edge * len * 0.6, tipX, tipY);
              g.quadraticCurveTo(px + side * len * 0.55, py + edge * len * 0.15, px - side * 3, py + 2); g.fill();
            }
          }
        }
      }
    } else if (kind === 'needle') {
      // 松の葉：根元の枝から小枝が分かれ、枝先ごとに針の房が開く一本の枝（10/30）。
      // 四角い板いっぱいに針の玉を散らすと、近くの木で切り絵の四角い塊に見えた。外縁は透明に残し、
      // 房の芯は奥の葉の陰で暗く、針先は明るく細く。縁は薄い針で、柔らかく抜ける。
      const tufts = [];
      g.lineCap = 'round';
      for (let k = 0; k < 9; k++) {
        const side = k % 2 ? 1 : -1, t = (k + 0.5) / 9;
        const x0 = S * (0.5 + Math.sin(t * 4) * 0.02), y0 = S * (0.9 - t * 0.62);
        const reach = S * (0.1 + Math.sin(t * Math.PI) * 0.22) * (0.75 + R() * 0.3);
        const x1 = x0 + side * reach, y1 = y0 - S * (0.05 + R() * 0.1);
        g.strokeStyle = 'rgb(70,62,46)'; g.lineWidth = 2.2 - t;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 - S * 0.01, x1, y1); g.stroke();
        tufts.push([x1, y1, 0.8 + R() * 0.4], [(x0 + x1) / 2, (y0 + y1) / 2 - S * 0.02, 0.6 + R() * 0.3]);
      }
      g.strokeStyle = 'rgb(66,58,42)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(S * 0.5, S * 0.98); g.quadraticCurveTo(S * 0.47, S * 0.55, S * 0.5, S * 0.2); g.stroke();
      tufts.push([S * 0.5, S * 0.2, 1.1]);
      for (const [cx, cy, sz] of tufts) {
        // 房の芯は奥の針の重なりで暗い（下地の小さな影。四角や丸の輪郭は出さない）
        g.fillStyle = 'rgba(64,82,52,0.75)';
        g.beginPath(); g.ellipse(cx, cy, 9 * sz, 7 * sz, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 64; i++) {
          // 針は上と外へ開く。下向きの針は短く暗い。
          const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.9, up = -Math.sin(a);
          const l = (12 + R() * 18) * sz * (0.6 + up * 0.4), v = 0.2 + R() * 0.45 + up * 0.25;
          g.strokeStyle = `rgba(${120 + v * 95},${140 + v * 85},${100 + v * 70},${i < 48 ? 0.95 : 0.55})`;
          g.lineWidth = i < 48 ? 1.5 : 1;
          g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.5 + 2, cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
        }
      }
    } else if (kind === 'broad') {
      // 丸い点の円盤をやめ、七つの枝先へ葉を寄せる。房の間と外縁は透明に残す。
      // 近景・遠景が同じ絵を共用するので、距離が変わっても枝間の切れ込みを保つ。
      const sprays = [
        [0.23, 0.53, 0.17, 0.17], [0.77, 0.48, 0.17, 0.19],
        [0.37, 0.65, 0.18, 0.15], [0.65, 0.64, 0.17, 0.16],
        [0.30, 0.31, 0.17, 0.19], [0.68, 0.28, 0.18, 0.17],
        [0.48, 0.19, 0.16, 0.15],
      ];
      // 葉の隙間からだけ細枝を見せる。枝先ほど細くし、太い線の網にはしない。
      g.strokeStyle = 'rgb(71,76,49)'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(S * 0.51, S * 0.89);
      g.quadraticCurveTo(S * 0.45, S * 0.51, S * 0.48, S * 0.17); g.stroke();
      for (const [cx, cy, rx, ry] of sprays) {
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(S * 0.49, S * (cy + 0.22));
        g.quadraticCurveTo(S * cx, S * (cy + 0.13), S * cx, S * (cy - 0.08)); g.stroke();
      }
      for (const [cx, cy, rx, ry] of sprays) {
        // 奥の葉を先に、上を向く葉を後に描く。粒ごとの乱れより房全体の陰影を優先。
        for (let i = 0; i < 60; i++) {
          const front = i >= 30, a = R() * Math.PI * 2, d = Math.sqrt(R());
          const x = S * (cx + Math.cos(a) * rx * d);
          const y = S * (cy + Math.sin(a) * ry * d + (front ? -0.025 : 0.035));
          // 本流の明るい灰緑と控えめな明暗を残す。個体色との二重の暗染めを避ける。
          const v = (front ? 194 : 172) + (1 - (y / S - cy) / ry) * 6 + R() * 10;
          g.fillStyle = `rgba(${v * 0.94},${v},${v * 0.84},0.95)`;
          const angle = Math.atan2(y / S - cy - 0.08, x / S - cx) + (R() - 0.5) * 0.7;
          g.beginPath(); g.ellipse(x, y, 5 + R() * 3, 2.5 + R() * 1.5, angle, 0, Math.PI * 2); g.fill();
        }
      }
    } else if (kind === 'bamboo') {
      // 竹の葉の房（10/30）：上の細い小枝から、笹の葉が指を広げたように下へ垂れる。
      // 板一面に葉を散らさず、房の間を抜いて四角い板に見せない。
      for (let s = 0; s < 6; s++) {
        let x = S * (0.15 + R() * 0.7), y = S * (0.06 + R() * 0.3);
        const dir = x < S * 0.5 ? 1 : -1;
        g.strokeStyle = 'rgb(96,104,58)'; g.lineWidth = 1.4;
        for (let j = 0; j < 4; j++) {
          const nx = x + dir * S * (0.06 + R() * 0.05), ny = y + S * (0.07 + R() * 0.06);
          g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          // 節ごとに三〜五枚の葉を扇に垂らす
          const n = 3 + Math.floor(R() * 3);
          for (let q = 0; q < n; q++) {
            const a = Math.PI / 2 + dir * (0.2 + (q / n) * 0.9) + (R() - 0.5) * 0.3, l = 26 + R() * 18, v = R();
            g.fillStyle = `rgba(${78 + v * 44},${106 + v * 44},${46 + v * 22},0.97)`;
            g.save(); g.translate(nx, ny); g.rotate(a); g.beginPath();
            g.moveTo(0, 0); g.quadraticCurveTo(l * 0.35, -3.2, l, 0); g.quadraticCurveTo(l * 0.35, 3.2, 0, 0); g.fill(); g.restore();
          }
          x = nx; y = ny;
        }
      }
    } else if (kind === 'susuki') {
      // 狭い根元から長い葉が弓なりに垂れる株。直立する茎だけの黒い網にしない。
      // 絵は一度だけ作り、遠景も同じ二枚板で使い回す。
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 1 : -1, v = R();
        const root = S * (0.46 + R() * 0.08), reach = S * (0.18 + R() * 0.27);
        const tip = root + side * reach, tipY = S * (0.38 + R() * 0.48);
        const shoulder = root + side * reach * 0.48, crest = S * (0.14 + R() * 0.23);
        const width = 2.5 + R() * 2.5;
        const tint = g.createLinearGradient(0, S, 0, crest);
        tint.addColorStop(0, 'rgb(104,108,72)');
        tint.addColorStop(0.5, `rgb(${150 + v * 38},${148 + v * 30},${94 + v * 30})`);
        tint.addColorStop(1, 'rgb(205,193,143)');
        g.fillStyle = tint;
        g.beginPath(); g.moveTo(root - width * 0.35, S);
        g.bezierCurveTo(root - width, S * 0.65, shoulder - width, crest, tip, tipY);
        g.bezierCurveTo(shoulder + width, crest + width, root + width, S * 0.65, root + width * 0.35, S);
        g.closePath(); g.fill();
      }
      // 穂（10/30 手本の芒）：茎の先から長い穂が弓なりにうなだれ、細い枝穂が房になって垂れる。
      // 穂の長さは株の丈の五分の一ほど。銀白の毛の房で、太い棒や短い粒で穂を代用しない。
      for (let i = 0; i < 8; i++) {
        const root = S * (0.45 + R() * 0.1), x = S * (0.22 + R() * 0.56);
        const y = S * (0.1 + R() * 0.16), nod = (x < S * 0.5 ? -1 : 1) * (0.6 + R() * 0.4);
        g.strokeStyle = 'rgb(160,152,108)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(root, S);
        g.quadraticCurveTo(root, S * 0.5, x, y); g.stroke();
        const L = S * (0.2 + R() * 0.07);
        for (let j = 0; j < 16; j++) {
          // 軸は上へ出てから外へ倒れ、先ほど下がる
          const t = j / 15, ax = x + nod * L * 0.55 * t, ay = y - L * 0.35 * t + L * 0.55 * t * t;
          const len = (1 - t * 0.55) * (11 + R() * 9);
          for (const side of [-1, 1]) {
            const ex = ax + (side * 0.45 + nod * 0.55) * len, ey = ay + len * (0.75 + R() * 0.25);
            g.strokeStyle = R() < 0.5 ? 'rgb(226,214,178)' : 'rgb(240,232,206)'; g.lineWidth = 1.4;
            g.beginPath(); g.moveTo(ax, ay);
            g.quadraticCurveTo(ax + side * len * 0.35 + nod * len * 0.3, ay + len * 0.1, ex, ey); g.stroke();
          }
        }
      }
    } else if (kind === 'higanbana') {
      // 秋の彼岸花：葉のない細い茎と、反り返る花弁・長いおしべ。
      // 絵は最初の一枚だけ作り、群落の二枚板で使い回す。
      for (let i = 0; i < 9; i++) {
        const x = S * (0.18 + R() * 0.64), y = S * (0.18 + R() * 0.25);
        g.strokeStyle = 'rgba(66,90,38,0.95)'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x - 3, y + 65, x, y); g.stroke();
        for (let j = 0; j < 6; j++) {
          const a = j * Math.PI / 3, dx = Math.cos(a), dy = Math.sin(a) * 0.55;
          g.strokeStyle = j % 2 ? 'rgba(192,40,30,0.98)' : 'rgba(226,65,42,0.98)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + dx * 8, y - 12, x + dx * 21, y + dy * 17 - 8, x + dx * 15, y + dy * 20); g.stroke();
          g.strokeStyle = 'rgba(236,93,65,0.95)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dx * 20, y + dy * 25, x + dx * 26, y + dy * 30 - 5); g.stroke();
        }
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
  return generatedTex('cedar', true);
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
