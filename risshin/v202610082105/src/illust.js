// 合戦図屏風のような一枚絵と、ゲームのアイコンをキャンバスで描く（外から画像は読まない）
// 墨と金と朱。和紙の上に金雲をたなびかせ、その間に城と軍勢と旗を置く
// 描くのは一度だけ。描いた絵は blob の URL にして使い回す
import { drawMon } from './textures.js';

const TAU = Math.PI * 2;
const INK = '#1c1712';
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 決まった並びの乱数（同じ絵が毎回同じに描ける）
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 家紋の旗は一つの紋につき一度だけ描き、あとは縮めて貼る
const monCache = new Map();
function monCanvas(kind) {
  if (!monCache.has(kind)) { const c = mk(64, 128); drawMon(c.getContext('2d'), kind, 64, 128); monCache.set(kind, c); }
  return monCache.get(kind);
}

// ---------------- 家ごとの色と旗 ----------------
const FAC = {
  tokugawa: { armor: ['#2b2723', '#3a322a', '#46392b', '#2e2c2a'], flag: ['tokugawa'], nobori: ['tokugawa', 'onri', 'tokugawa'], hat: '#26211c' },
  okudaira: { armor: ['#2b2723', '#3a322a'], flag: ['okudaira'], nobori: ['okudaira', 'tokugawa'], hat: '#26211c' },
  sakai: { armor: ['#2b2723', '#3a322a', '#40372c'], flag: ['katabami'], nobori: ['katabami', 'tokugawa'], hat: '#26211c' },
  okubo: { armor: ['#2b2723', '#3a322a'], flag: ['okubo'], nobori: ['okubo', 'tokugawa'], hat: '#26211c' },
  takeda: { armor: ['#2c2723', '#4a2e22', '#3b312a', '#2a2a2e'], flag: ['takeda'], nobori: ['takeda', 'furin', 'takeda'], hat: '#2a241e' },
  akazonae: { armor: ['#a63a26', '#b5442b', '#96331f', '#ad3c27'], flag: ['akazonae'], nobori: ['akazonae', 'furin'], hat: '#8e2f1f', tack: '#b8412a', red: true },
  oda: { armor: ['#2a2622', '#3a332b', '#2e2a26'], flag: ['eiraku'], nobori: ['oda', 'eiraku'], hat: '#2a241e' },
  imagawa: { armor: ['#3b3530', '#4b3b2c', '#2e2a26'], flag: ['imagawa'], nobori: ['imagawa'], hat: '#2a241e' },
  saito: { armor: ['#3b3530', '#2e2a26'], flag: ['saito'], nobori: ['saito'], hat: '#2a241e' },
  azai: { armor: ['#3b3530', '#2e2a26', '#4a3a2a'], flag: ['azai'], nobori: ['azai'], hat: '#2a241e' },
  asakura: { armor: ['#3b3530', '#2e2a26'], flag: ['asakura'], nobori: ['asakura'], hat: '#2a241e' },
  sanada: { armor: ['#a63a26', '#b5442b', '#96331f'], flag: ['sanada'], nobori: ['sanada'], hat: '#8e2f1f', tack: '#b8412a', red: true },
  maeda: { armor: ['#2b2723', '#3a322a'], flag: ['maeda'], nobori: ['maeda', 'tokugawa'], hat: '#26211c' },
  ii: { armor: ['#a63a26', '#b5442b', '#96331f'], flag: ['ii'], nobori: ['ii'], hat: '#8e2f1f', tack: '#b8412a', red: true },
  todo: { armor: ['#2b2723', '#3a322a'], flag: ['todo'], nobori: ['todo'], hat: '#26211c' },
  ishida: { armor: ['#2b2723', '#3a322a', '#46392b'], flag: ['ishida'], nobori: ['ishida'], hat: '#26211c' },
  otani: { armor: ['#2b2723', '#3a322a'], flag: ['otani'], nobori: ['otani'], hat: '#26211c' },
  kobayakawa: { armor: ['#2b2723', '#3a322a'], flag: ['kobayakawa'], nobori: ['kobayakawa'], hat: '#26211c' },
  shimazu: { armor: ['#2b2723', '#3a322a'], flag: ['shimazu'], nobori: ['shimazu'], hat: '#26211c' },
  toyotomi: { armor: ['#2b2723', '#3a322a', '#46392b'], flag: ['toyotomi'], nobori: ['toyotomi'], hat: '#26211c' },
};
const COATS = ['#5a3a22', '#6b4424', '#3a2a1e', '#2a211b', '#7a5a3a', '#4a3020', '#b9ae98'];

// ---------------- 紙と金 ----------------
function washi(g, W, H, R, base = '#e3d7b9') {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = R() * W, y = R() * H, r = 40 + R() * 240, a = 0.03 + R() * 0.05;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < 0.55 ? `rgba(120,96,56,${a})` : `rgba(255,250,235,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  fibers(g, W, H, R, 0, 0, W, H);
}
// 和紙の繊維
function fibers(g, W, H, R, x0, y0, w, h, k = 1) {
  g.lineWidth = 1;
  for (let i = 0; i < (w * h / 900) * k; i++) {
    const x = x0 + R() * w, y = y0 + R() * h, a = R() * TAU, l = 3 + R() * 14;
    g.strokeStyle = `rgba(${R() < 0.5 ? '90,70,40' : '255,252,240'},${0.04 + R() * 0.07})`;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + R() * 3, y + Math.sin(a) * l * 0.5 + R() * 3, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
// 金箔：四角い箔を少しずつ色を変えて貼り、継ぎ目（箔足）を細く残す。上に砂子を撒く
function goldLeaf(g, R, x, y, w, h, sq = 46) {
  const base = g.createLinearGradient(0, y, 0, y + h);
  base.addColorStop(0, '#dcbb62'); base.addColorStop(1, '#bd9641');
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const sx = Math.floor(x / sq) * sq, sy = Math.floor(y / sq) * sq;
  for (let yy = sy; yy < y + h; yy += sq) {
    const off = ((yy / sq) % 2) * sq * 0.5;
    for (let xx = sx - off; xx < x + w; xx += sq) {
      const v = R();
      g.fillStyle = v < 0.5 ? `rgba(255,236,170,${v * 0.12})` : `rgba(110,80,20,${(v - 0.5) * 0.1})`;
      g.fillRect(xx, yy, sq, sq);
      g.fillStyle = 'rgba(120,88,30,0.09)'; g.fillRect(xx, yy, sq, 1); g.fillRect(xx, yy, 1, sq);
    }
  }
  for (let i = 0; i < w * h / 380; i++) {
    const s = 0.6 + R() * 2;
    g.fillStyle = `rgba(255,242,196,${0.25 + R() * 0.5})`; g.fillRect(x + R() * w, y + R() * h, s, s);
  }
  // 切箔：少し大きな箔の欠片
  for (let i = 0; i < w * h / 9000; i++) { const s = 2 + R() * 5; g.fillStyle = `rgba(${R() < 0.5 ? '240,214,140' : '170,130,50'},${0.3 + R() * 0.4})`; g.save(); g.translate(x + R() * w, y + R() * h); g.rotate(R() * 3); g.fillRect(-s / 2, -s / 2, s, s * (0.5 + R())); g.restore(); }
}
// 金雲（すやり霞）：角の丸い長い帯に、上下へ小さなふくらみをつける
function goldCloud(g, R, x, y, len, th, o = {}) {
  const p = new Path2D();
  p.roundRect(x, y - th / 2, len, th, th / 2);
  const n = Math.max(2, Math.round(len / (th * 1.5)));
  for (let i = 0; i < n; i++) {
    const cx = x + th * 0.7 + (len - th * 1.4) * (i + 0.5 + (R() - 0.5) * 0.6) / n;
    const up = R() < 0.62, r = th * (0.32 + R() * 0.28), cy = y + (up ? -th * 0.42 : th * 0.42);
    p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU);
  }
  g.save();
  g.shadowColor = 'rgba(40,28,10,.35)'; g.shadowBlur = th * 0.25; g.shadowOffsetY = th * 0.06;
  g.lineWidth = Math.max(2, th * 0.045); g.strokeStyle = 'rgba(128,94,34,.8)'; g.stroke(p);
  g.shadowColor = 'transparent';
  g.fillStyle = '#c9a44f'; g.fill(p);
  g.clip(p);
  goldLeaf(g, R, x - th, y - th * 1.2, len + th * 2, th * 2.4, Math.max(24, th * 0.6));
  // 下の縁をわずかに沈め、上に光
  const sh = g.createLinearGradient(0, y - th, 0, y + th);
  sh.addColorStop(0, 'rgba(255,240,190,.18)'); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(90,60,20,.22)');
  g.fillStyle = sh; g.fillRect(x - th, y - th * 1.2, len + th * 2, th * 2.4);
  if (o.dim) { g.fillStyle = o.dim; g.fillRect(x - th, y - th * 1.2, len + th * 2, th * 2.4); }
  g.restore();
}

// ---------------- 山・野・川 ----------------
// 稜線の点（いくつかの波を重ねる）
function ridge(R, x0, x1, base, amp, step = 10) {
  const ph = [R() * 9, R() * 9, R() * 9], f = [0.0023 + R() * 0.002, 0.007 + R() * 0.004, 0.02 + R() * 0.01];
  const pts = [];
  for (let x = x0; x <= x1 + step; x += step) {
    const v = Math.sin(x * f[0] + ph[0]) * 0.6 + Math.sin(x * f[1] + ph[1]) * 0.3 + Math.sin(x * f[2] + ph[2]) * 0.1;
    pts.push([x, base - (v * 0.5 + 0.5) * amp]);
  }
  return pts;
}
// 峰を決めて描く稜線（中ほどが高い山）
function peak(x0, x1, base, top, R, step = 10) {
  const pts = [], m = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  for (let x = x0; x <= x1; x += step) {
    const t = 1 - Math.abs(x - m) / hw;
    pts.push([x, base - (top) * Math.pow(Math.max(0, t), 0.9) - Math.sin(x * 0.05 + R()) * 3]);
  }
  return pts;
}
function hill(g, R, pts, bottom, c0, c1, o = {}) {
  const p = new Path2D();
  p.moveTo(pts[0][0], bottom);
  for (const [x, y] of pts) p.lineTo(x, y);
  p.lineTo(pts[pts.length - 1][0], bottom); p.closePath();
  const top = Math.min(...pts.map((q) => q[1]));
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1);
  g.save(); g.globalAlpha = o.alpha ?? 1; g.fillStyle = gr; g.fill(p);
  if (o.line !== false) {
    // 稜線の墨：太さを揺らす
    g.strokeStyle = o.line || 'rgba(28,23,18,.55)';
    for (let i = 1; i < pts.length; i++) {
      g.lineWidth = (o.lw || 2.4) * (0.5 + R() * 0.8);
      g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
    }
    // 点苔
    if (o.moss !== false) {
      g.fillStyle = 'rgba(30,40,24,.6)';
      for (let i = 0; i < pts.length; i += 2) if (R() < 0.55) { const r = 1.5 + R() * 3; g.beginPath(); g.ellipse(pts[i][0] + (R() - 0.5) * 8, pts[i][1] + 2 + R() * 10, r * 1.4, r, 0, 0, TAU); g.fill(); }
    }
  }
  g.restore();
  return p;
}
// 松：幹を曲げ、平たい葉の塊を段に
function pine(g, R, x, y, s, o = {}) {
  const lean = (R() - 0.5) * s * 0.4;
  g.strokeStyle = o.trunk || '#3a2c20'; g.lineWidth = Math.max(1, s * 0.07); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 1.4, y - s * 0.5, x + lean, y - s); g.stroke();
  const n = 3 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    const t = 0.45 + i / n * 0.55, cx = x + lean * t + (R() - 0.5) * s * 0.3, cy = y - s * t, rw = s * (0.42 - i * 0.06), rh = s * 0.1;
    g.fillStyle = o.col || '#2f4a32'; g.beginPath(); g.ellipse(cx, cy, rw, rh, (R() - 0.5) * 0.2, 0, TAU); g.fill();
    g.fillStyle = 'rgba(20,28,18,.5)'; for (let k = 0; k < 5; k++) { g.fillRect(cx - rw * 0.8 + R() * rw * 1.6, cy - rh * 0.3 + R() * rh * 0.6, 1.4, 1.4); }
  }
}
// 丸い木（広葉）
function tree(g, R, x, y, s, col = '#3f5a3c') {
  g.strokeStyle = '#3a2c20'; g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * s * 0.1, y - s * 0.5); g.stroke();
  for (let k = 0; k < 4; k++) {
    g.fillStyle = k % 2 ? col : shadeHex(col, -0.18);
    g.beginPath(); g.arc(x + (R() - 0.5) * s * 0.5, y - s * 0.6 - R() * s * 0.35, s * (0.22 + R() * 0.12), 0, TAU); g.fill();
  }
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (c) => clamp(Math.round(c + (k > 0 ? (255 - c) * k : c * k)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
// 川：上の岸と下の岸の線の間を群青で塗り、白い波を描く
function river(g, R, top, bot, o = {}) {
  const p = new Path2D();
  p.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top) p.lineTo(x, y);
  for (let i = bot.length - 1; i >= 0; i--) p.lineTo(bot[i][0], bot[i][1]);
  p.closePath();
  const ys = [...top, ...bot].map((q) => q[1]);
  const gr = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  gr.addColorStop(0, o.c0 || '#56709a'); gr.addColorStop(1, o.c1 || '#34507a');
  g.save(); g.fillStyle = gr; g.fill(p);
  g.clip(p);
  // 波：小さな弧を並べる
  const xs = [...top, ...bot].map((q) => q[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  g.strokeStyle = o.wave || 'rgba(236,232,216,.55)'; g.lineWidth = o.ww || 1.6;
  const ws = o.ws || 26;
  for (let y = y0 + ws * 0.5; y < y1; y += ws * 0.55) {
    for (let x = x0 + ((y / ws) % 2) * ws * 0.5; x < x1; x += ws * (1.1 + R() * 0.6)) {
      if (R() < 0.35) continue;
      g.beginPath(); g.arc(x, y + ws * 0.35, ws * 0.35, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(28,23,18,.45)'; g.lineWidth = 1.6;
  g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.beginPath(); bot.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
}
// 曲がった帯（川の中心線と幅から、両岸の点を作る）
function band(pts, w0, w1) {
  const top = [], bot = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const w = lerp(w0, w1, i / (pts.length - 1)) / 2;
    top.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); bot.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [top, bot];
}
// なめらかな点列（端点を曲線で結ぶ）
function curve(ctrl, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n * (ctrl.length - 1), k = Math.min(ctrl.length - 2, Math.floor(t)), u = t - k;
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
    const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

// ---------------- 人と馬と旗 ----------------
function ln(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
// 腰から上（胴・腕・頭・笠か兜・武器・背の旗）。yw は腰の高さ
function upper(g, x, yw, s, o) {
  const d = o.dir || 1, lw = Math.max(0.6, s * 0.028), lean = (o.lean || 0) * s;
  const sh = yw - s * 0.30, big = s > 44;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 背の旗（指物）
  if (o.flag) {
    const px = x - d * s * 0.09 + lean * 0.5, top = sh - s * 0.66;
    g.strokeStyle = '#2a2016'; g.lineWidth = Math.max(0.7, s * 0.02); ln(g, px, yw - s * 0.04, px, top);
    const fw = s * 0.21, fh = s * 0.42, fx = d > 0 ? px - fw : px;
    flagImg(g, monCanvas(o.flag), fx, top, fw, fh, d, big);
  }
  const hand = [x + d * s * 0.2 + lean, sh + s * 0.13];
  weapon(g, hand, s, o, d);
  // 胴
  const arm = o.armor || '#2b2723';
  g.fillStyle = arm; g.strokeStyle = INK; g.lineWidth = lw;
  g.beginPath(); g.moveTo(x - s * 0.1, yw); g.lineTo(x + s * 0.1, yw); g.lineTo(x + s * 0.125 + lean, sh); g.lineTo(x - s * 0.125 + lean, sh); g.closePath(); g.fill(); g.stroke();
  if (big) {
    // 胴の照りと、縅の横の線
    const gl = g.createLinearGradient(x - s * 0.12, 0, x + s * 0.12, 0);
    gl.addColorStop(0, 'rgba(0,0,0,.25)'); gl.addColorStop(0.55, 'rgba(255,240,210,.12)'); gl.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = gl; g.fill();
    g.strokeStyle = o.lace || (o.red ? 'rgba(40,16,10,.45)' : 'rgba(190,150,90,.45)'); g.lineWidth = Math.max(0.6, s * 0.01);
    for (let k = 1; k <= 4; k++) { const t = k / 5; ln(g, x - s * 0.1 + lean * t - s * 0.02 * t, lerp(yw, sh, t), x + s * 0.1 + lean * t + s * 0.02 * t, lerp(yw, sh, t)); }
  }
  // 草摺
  g.fillStyle = shadeHex(arm.startsWith('#') ? arm : '#2b2723', -0.2); g.strokeStyle = INK; g.lineWidth = lw;
  g.beginPath(); g.moveTo(x - s * 0.1, yw - s * 0.02); g.lineTo(x + s * 0.1, yw - s * 0.02); g.lineTo(x + s * 0.145, yw + s * 0.11); g.lineTo(x - s * 0.145, yw + s * 0.11); g.closePath(); g.fill(); g.stroke();
  if (big) { g.lineWidth = Math.max(0.5, s * 0.008); for (let k = -1; k <= 1; k++) ln(g, x + k * s * 0.045, yw, x + k * s * 0.065, yw + s * 0.11); }
  // 袖（肩の板）
  g.fillStyle = arm; g.beginPath(); g.moveTo(x + lean - s * 0.13, sh - s * 0.01); g.lineTo(x + lean + s * 0.13, sh - s * 0.01); g.lineTo(x + lean + d * s * 0.16, sh + s * 0.09); g.lineTo(x + lean - d * s * 0.02, sh + s * 0.1); g.closePath(); g.fill(); g.lineWidth = lw; g.stroke();
  // 腕
  g.strokeStyle = arm; g.lineWidth = Math.max(1, s * 0.06); ln(g, x + lean + d * s * 0.06, sh + s * 0.03, hand[0], hand[1]);
  g.fillStyle = '#b8906a'; g.beginPath(); g.arc(hand[0], hand[1], Math.max(0.8, s * 0.026), 0, TAU); g.fill();
  // 頭
  const hx = x + lean * 1.1 + d * s * 0.012, hy = sh - s * 0.085;
  g.fillStyle = '#c49c74'; g.beginPath(); g.arc(hx, hy, s * 0.062, 0, TAU); g.fill();
  if (big && o.helm === 'kabuto') { g.fillStyle = '#2a1e18'; g.fillRect(hx - s * 0.05 + d * s * 0.01, hy - s * 0.005, s * 0.1, s * 0.05); } // 面頬
  if (o.helm === 'kabuto') {
    // 兜：鉢と、裾広がりの錣。前立は金
    g.fillStyle = '#1e1a16';
    g.beginPath(); g.moveTo(hx - s * 0.12, hy + s * 0.02); g.lineTo(hx - s * 0.075, hy - s * 0.04); g.lineTo(hx + s * 0.075, hy - s * 0.04); g.lineTo(hx + s * 0.12, hy + s * 0.02); g.closePath(); g.fill();
    g.beginPath(); g.arc(hx, hy - s * 0.035, s * 0.078, Math.PI, 0); g.fill();
    if (big) { g.strokeStyle = 'rgba(210,180,110,.5)'; g.lineWidth = Math.max(0.5, s * 0.008); for (let k = -2; k <= 2; k++) ln(g, hx + k * s * 0.028, hy - s * 0.035, hx + k * s * 0.015, hy - s * 0.1); }
    if (o.crest) {
      g.strokeStyle = '#d9b24c'; g.lineWidth = Math.max(0.9, s * 0.022);
      if (o.crest === 'moon') { g.beginPath(); g.arc(hx, hy - s * 0.2, s * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      else { g.beginPath(); g.moveTo(hx - s * 0.1, hy - s * 0.24); g.quadraticCurveTo(hx - s * 0.03, hy - s * 0.1, hx, hy - s * 0.1); g.quadraticCurveTo(hx + s * 0.03, hy - s * 0.1, hx + s * 0.1, hy - s * 0.24); g.stroke(); }
    }
  } else {
    // 陣笠
    g.fillStyle = o.hat || '#2a241e'; g.strokeStyle = INK; g.lineWidth = lw;
    g.beginPath(); g.moveTo(hx - s * 0.16, hy - s * 0.005); g.quadraticCurveTo(hx, hy - s * 0.15, hx + s * 0.16, hy - s * 0.005); g.closePath(); g.fill(); g.stroke();
    if (big) { g.fillStyle = '#c9a44f'; g.beginPath(); g.arc(hx, hy - s * 0.055, s * 0.018, 0, TAU); g.fill(); }
  }
}
// 旗の布：大きい時は風で揺らす
function flagImg(g, img, x, y, w, h, d, wave) {
  if (!wave) { g.drawImage(img, x, y, w, h); g.strokeStyle = 'rgba(28,23,18,.55)'; g.lineWidth = Math.max(0.5, w * 0.03); g.strokeRect(x, y, w, h); return; }
  const n = 8;
  for (let j = 0; j < n; j++) {
    const off = Math.sin(j * 0.9 + x * 0.01) * w * 0.07 * (j / n) * -d;
    g.drawImage(img, 0, j * img.height / n, img.width, img.height / n + 1, x + off, y + j * h / n, w, h / n + 0.6);
    // 布の皺
    g.fillStyle = `rgba(0,0,0,${0.06 + 0.06 * Math.sin(j * 1.7 + x)})`; g.fillRect(x + off, y + j * h / n, w, h / n * 0.3);
  }
  g.strokeStyle = 'rgba(28,23,18,.5)'; g.lineWidth = Math.max(0.6, w * 0.025); g.strokeRect(x, y, w, h);
}
function weapon(g, [hx, hy], s, o, d) {
  const w = o.weapon || 'spear';
  g.lineCap = 'round';
  if (w === 'spear') {
    const a = o.angle ?? 1.15, L = s * (o.len || 2.1), cx = Math.cos(a) * d, cy = -Math.sin(a);
    const tx = hx + cx * L * 0.72, ty = hy + cy * L * 0.72, bx = hx - cx * L * 0.28, by = hy - cy * L * 0.28;
    g.strokeStyle = '#3a2a1a'; g.lineWidth = Math.max(0.7, s * 0.022); ln(g, bx, by, tx, ty);
    g.strokeStyle = '#d8d3c5'; g.lineWidth = Math.max(0.9, s * 0.03); ln(g, tx - cx * s * 0.02, ty - cy * s * 0.02, tx + cx * s * 0.13, ty + cy * s * 0.13);
  } else if (w === 'gun') {
    g.strokeStyle = '#231e19'; g.lineWidth = Math.max(0.8, s * 0.035); ln(g, hx - d * s * 0.28, hy + s * 0.04, hx + d * s * 0.5, hy - s * 0.02);
    g.strokeStyle = '#5a4128'; g.lineWidth = Math.max(0.8, s * 0.05); ln(g, hx - d * s * 0.28, hy + s * 0.05, hx - d * s * 0.08, hy + s * 0.03);
  } else if (w === 'bow') {
    g.strokeStyle = '#3a2a1a'; g.lineWidth = Math.max(0.8, s * 0.025);
    g.beginPath(); g.ellipse(hx - d * s * 0.06, hy - s * 0.1, s * 0.14, s * 0.62, 0, d > 0 ? -1.35 : Math.PI - 1.35, d > 0 ? 1.35 : Math.PI + 1.35); g.stroke();
  } else if (w === 'sword') {
    g.strokeStyle = '#d8d3c5'; g.lineWidth = Math.max(0.8, s * 0.025); ln(g, hx, hy, hx + d * s * 0.35, hy - s * 0.45);
  }
}
// 歩きの兵（足は x,y）
function foot(g, x, y, s, o) {
  const d = o.dir || 1, run = o.run || 0, yw = y - s * 0.42;
  g.strokeStyle = '#2e2620'; g.lineWidth = Math.max(1, s * 0.062); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, yw); g.lineTo(x + d * s * (0.05 + 0.08 * run), yw + s * 0.2); g.lineTo(x + d * s * (0.03 + 0.15 * run), y); g.stroke();
  g.beginPath(); g.moveTo(x, yw); g.lineTo(x - d * s * 0.04 * (1 + run), yw + s * 0.21); g.lineTo(x - d * s * (0.05 + 0.17 * run), y - s * 0.02 * run); g.stroke();
  upper(g, x, yw, s, { lean: run * 0.05, ...o });
}
// 馬（足の下が y。s は乗り手の背丈）。駆けるときは脚を前後へ伸ばす
// なめらかな閉じた形（点の中点を曲線で結ぶ）
function smooth(g, pts) {
  g.beginPath();
  const m = (i) => { const p = pts[i % pts.length], q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
  g.moveTo(...m(0));
  for (let i = 1; i <= pts.length; i++) g.quadraticCurveTo(...pts[i % pts.length], ...m(i));
  g.closePath();
}
function horse(g, x, y, s, o) {
  const d = o.dir || 1, coat = o.coat || '#5a3a22', lw = Math.max(0.6, s * 0.018), by = y - s * 0.66, big = s > 44;
  const P = (dx, dy) => [x + d * dx * s, by + dy * s];
  // 脚：上は太く（腿）、下は細く（管）、蹄は黒
  const leg = (a, b, c, col) => {
    g.strokeStyle = col; g.lineCap = 'round';
    g.lineWidth = Math.max(1.2, s * 0.1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    g.lineWidth = Math.max(0.9, s * 0.045); g.beginPath(); g.moveTo(...b); g.lineTo(...c); g.stroke();
    g.fillStyle = '#16110c'; g.beginPath(); g.arc(c[0], c[1], Math.max(0.8, s * 0.028), 0, TAU); g.fill();
  };
  const far = shadeHex(coat, -0.35);
  if (o.stand) { leg(P(0.26, 0.05), P(0.28, 0.35), P(0.27, 0.66), far); leg(P(-0.3, 0.05), P(-0.34, 0.35), P(-0.3, 0.66), far); }
  else { leg(P(0.24, 0.06), P(0.38, 0.3), P(0.24, 0.5), far); leg(P(-0.28, 0.05), P(-0.24, 0.34), P(-0.42, 0.56), far); }
  // 尾（流れる毛）
  g.strokeStyle = shadeHex(coat, -0.5); g.lineCap = 'round';
  const tailEnd = o.stand ? 0.34 : 0.12;
  for (let k = 0; k < (big ? 7 : 2); k++) {
    g.lineWidth = Math.max(0.8, s * (big ? 0.022 : 0.05));
    g.beginPath(); g.moveTo(...P(-0.44, -0.1)); g.quadraticCurveTo(...P(-0.62, -0.14 + k * 0.03), ...P(-0.84 - k * 0.015, tailEnd + k * 0.035)); g.stroke();
  }
  // 胴：胸は深く、尻は丸く、腹は締まる
  const body = [P(0.42, -0.04), P(0.3, -0.16), P(0.12, -0.16), P(-0.12, -0.14), P(-0.34, -0.19), P(-0.48, -0.06), P(-0.44, 0.1), P(-0.28, 0.17), P(0.02, 0.16), P(0.26, 0.17), P(0.4, 0.1)];
  g.fillStyle = coat; smooth(g, body); g.fill();
  // 首と頭
  const neck = [P(0.18, -0.12), P(0.34, -0.3), P(0.46, -0.44), P(0.54, -0.46), P(0.58, -0.38), P(0.5, -0.24), P(0.42, 0.02)];
  smooth(g, neck); g.fill();
  const head = [P(0.46, -0.47), P(0.52, -0.5), P(0.68, -0.36), P(0.77, -0.27), P(0.75, -0.21), P(0.68, -0.21), P(0.55, -0.3)];
  smooth(g, head); g.fill();
  g.beginPath(); g.moveTo(...P(0.49, -0.47)); g.lineTo(...P(0.47, -0.56)); g.lineTo(...P(0.54, -0.48)); g.fill();
  if (big) {
    // 陰と照り
    g.save(); smooth(g, body); g.clip();
    const gl = g.createLinearGradient(0, by - s * 0.2, 0, by + s * 0.18);
    gl.addColorStop(0, 'rgba(255,235,200,.2)'); gl.addColorStop(0.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,.4)');
    g.fillStyle = gl; g.fillRect(x - s, by - s * 0.3, s * 2, s * 0.6);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = s * 0.01;
    g.beginPath(); g.arc(...P(-0.3, 0.0), s * 0.13, -1.2, 1.4); g.stroke();   // 尻の筋
    g.beginPath(); g.arc(...P(0.3, 0.02), s * 0.1, 1.6, 4.2); g.stroke();    // 肩の筋
    g.restore();
    g.fillStyle = '#0e0a07'; g.beginPath(); g.arc(...P(0.6, -0.38), s * 0.012, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(...P(0.73, -0.24), s * 0.01, 0, TAU); g.fill();
  }
  g.strokeStyle = INK; g.lineWidth = lw; smooth(g, body); g.stroke(); smooth(g, head); g.stroke();
  // たてがみ
  g.strokeStyle = shadeHex(coat, -0.55); g.lineWidth = Math.max(0.8, s * 0.035);
  g.beginPath(); g.moveTo(...P(0.2, -0.16)); g.quadraticCurveTo(...P(0.34, -0.36), ...P(0.5, -0.48)); g.stroke();
  if (big) { g.lineWidth = s * 0.008; for (let k = 0; k < 10; k++) { const t = k / 10, [mx, my] = P(0.22 + t * 0.28, -0.18 - t * 0.3); g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - d * s * 0.06, my - s * 0.02 + Math.sin(k) * s * 0.02); g.stroke(); } }
  // 近い脚（駆ける：前は伸ばし、後ろは蹴る）
  if (o.stand) { leg(P(0.3, 0.06), P(0.33, 0.36), P(0.33, 0.66), coat); leg(P(-0.26, 0.06), P(-0.28, 0.36), P(-0.24, 0.66), coat); }
  else { leg(P(0.3, 0.06), P(0.52, 0.22), P(0.74, 0.36), coat); leg(P(-0.32, 0.06), P(-0.5, 0.3), P(-0.78, 0.42), coat); }
  // 馬具：障泥・鞍・胸繋と尻繋、朱の房
  const tack = o.tack || '#8e3322';
  g.fillStyle = o.red ? '#7e2a1c' : '#3b2a1c';
  g.beginPath(); g.moveTo(...P(-0.1, -0.12)); g.lineTo(...P(0.12, -0.12)); g.quadraticCurveTo(...P(0.14, 0.08), ...P(0.06, 0.12)); g.lineTo(...P(-0.1, 0.12)); g.quadraticCurveTo(...P(-0.14, 0.0), ...P(-0.1, -0.12)); g.fill();
  if (big) { g.strokeStyle = 'rgba(210,170,90,.5)'; g.lineWidth = s * 0.006; g.stroke(); }
  g.fillStyle = '#2b1d14'; g.beginPath(); g.moveTo(...P(-0.14, -0.2)); g.quadraticCurveTo(...P(0.0, -0.1), ...P(0.16, -0.2)); g.lineTo(...P(0.14, -0.13)); g.lineTo(...P(-0.12, -0.13)); g.fill();
  g.strokeStyle = tack; g.lineWidth = Math.max(0.8, s * 0.02);
  g.beginPath(); g.moveTo(...P(0.1, -0.12)); g.quadraticCurveTo(...P(0.3, 0.08), ...P(0.4, -0.02)); g.stroke();
  g.beginPath(); g.moveTo(...P(-0.1, -0.12)); g.quadraticCurveTo(...P(-0.3, 0.0), ...P(-0.46, -0.08)); g.stroke();
  // 房：紐の先に下がる
  const tas = (dx, dy, l) => { const [tx, ty] = P(dx, dy); g.strokeStyle = tack; g.lineWidth = Math.max(0.6, s * 0.008); ln(g, tx, ty, tx - d * s * 0.02, ty + s * l); g.fillStyle = tack; g.beginPath(); g.ellipse(tx - d * s * 0.02, ty + s * (l + 0.03), Math.max(0.8, s * 0.018), Math.max(1.2, s * 0.035), 0, 0, TAU); g.fill(); };
  if (big) { for (const [dx, dy] of [[-0.22, -0.06], [-0.3, -0.06], [-0.38, -0.07]]) tas(dx, dy, 0.07); tas(0.34, 0.02, 0.06); tas(0.26, 0.06, 0.05); }
  else { tas(-0.3, -0.06, 0.05); tas(0.34, 0.02, 0.05); }
  // 面繋（頭の紐）
  if (big) { g.strokeStyle = tack; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(...P(0.52, -0.46)); g.lineTo(...P(0.6, -0.26)); g.moveTo(...P(0.56, -0.31)); g.lineTo(...P(0.74, -0.25)); g.stroke(); }
}
function rider(g, x, y, s, o) {
  const d = o.dir || 1;
  horse(g, x, y, s, o);
  const by = y - s * 0.66, yw = by - s * 0.15;
  g.strokeStyle = shadeHex(o.armor && o.armor.startsWith('#') ? o.armor : '#2b2723', -0.3); g.lineWidth = Math.max(1, s * 0.06); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + d * s * 0.02, yw); g.lineTo(x + d * s * 0.13, by + s * 0.0); g.lineTo(x + d * s * 0.07, by + s * 0.15); g.stroke();
  upper(g, x - d * s * 0.02, yw, s, { lean: 0.07, ...o });
  // 手綱
  g.strokeStyle = 'rgba(40,30,20,.7)'; g.lineWidth = Math.max(0.5, s * 0.01);
  ln(g, x + d * s * 0.2, yw - s * 0.18, x + d * s * 0.7, by - s * 0.26);
}
// 幟：長い竿に縦長の旗
function nobori(g, x, y, s, kind, d = 1) {
  const top = y - s * 2.7, fw = s * 0.34, fh = s * 1.35;
  g.strokeStyle = '#2a2016'; g.lineWidth = Math.max(0.9, s * 0.03); g.lineCap = 'round';
  ln(g, x, y - s * 0.2, x, top); ln(g, x, top + s * 0.04, x + d * fw, top + s * 0.04);
  flagImg(g, monCanvas(kind), d > 0 ? x : x - fw, top + s * 0.04, fw, fh, d, s > 24);
}
// 遠近：地平から手前へ向けて、人を大きく
const persp = (y0, s0, y1, s1, pw = 1.2) => (y) => lerp(s0, s1, Math.pow(clamp((y - y0) / (y1 - y0), 0, 1), pw));

// 軍勢：範囲の中に兵を散らし、奥から手前へ描く
// o = { x0, x1, y0, y1, n, dir, fac, cav, gun, bow, run, angle, scale, nobori, inside, rows }
function host(g, R, o) {
  const F = FAC[o.fac] || FAC.tokugawa, items = [];
  for (let i = 0; i < o.n; i++) {
    let x, y, t = 0;
    do { x = lerp(o.x0, o.x1, R()); y = lerp(o.y0, o.y1, R()); } while (o.inside && !o.inside(x, y) && ++t < 30);
    if (o.inside && !o.inside(x, y)) continue;
    const r = R(), cav = o.cav || 0, gun = o.gun || 0, bow = o.bow || 0;
    items.push({ x, y, kind: r < cav ? 'cav' : r < cav + gun ? 'gun' : r < cav + gun + bow ? 'bow' : 'spear', a: R(), b: R(), c: R() });
  }
  for (let i = 0; i < (o.nobori || 0); i++) {
    let x, y, t = 0;
    do { x = lerp(o.x0, o.x1, R()); y = lerp(o.y0, o.y1, R() * 0.8); } while (o.inside && !o.inside(x, y) && ++t < 30);
    items.push({ x, y, kind: 'nobori', a: R(), b: R(), c: R() });
  }
  items.sort((p, q) => p.y - q.y);
  for (const it of items) {
    const s = o.scale(it.y), d = o.dir || 1;
    const base = { dir: d, armor: F.armor[Math.floor(it.a * F.armor.length)], hat: F.hat, red: F.red, tack: F.tack, flag: it.c < (o.flagRate ?? 0.92) ? F.flag[Math.floor(it.b * F.flag.length)] : null };
    if (it.kind === 'nobori') nobori(g, it.x, it.y, s, F.nobori[Math.floor(it.a * F.nobori.length)], d);
    else if (it.kind === 'cav') rider(g, it.x, it.y, s, { ...base, coat: o.coats ? o.coats[Math.floor(it.b * o.coats.length)] : COATS[Math.floor(it.b * 6)], helm: 'kabuto', crest: it.c > 0.75 ? (it.a > 0.5 ? 'moon' : 'v') : null, weapon: 'spear', angle: o.cavAngle ?? (0.25 + it.a * 0.5), stand: o.stand });
    else if (it.kind === 'gun') foot(g, it.x, it.y, s, { ...base, weapon: 'gun', run: 0 });
    else if (it.kind === 'bow') foot(g, it.x, it.y, s, { ...base, weapon: 'bow', run: 0 });
    else foot(g, it.x, it.y, s, { ...base, weapon: 'spear', helm: it.a > 0.88 ? 'kabuto' : 'jingasa', angle: (o.angle ?? 1.2) + (it.b - 0.5) * 0.25, run: o.run || 0 });
    if (o.after) o.after(it, s);
  }
}

// ---------------- 煙・火・雨・霧 ----------------
function puff(g, R, x, y, r, col = '238,234,222', a = 0.55) {
  for (let i = 0; i < 6; i++) {
    const px = x + (R() - 0.5) * r * 1.2, py = y + (R() - 0.5) * r * 0.5, pr = r * (0.4 + R() * 0.5);
    const gr = g.createRadialGradient(px, py, 0, px, py, pr);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
}
function fire(g, R, x, y, s) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gl = g.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 1.6);
  gl.addColorStop(0, 'rgba(255,150,60,.55)'); gl.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gl; g.fillRect(x - s * 1.6, y - s * 1.9, s * 3.2, s * 3.2);
  g.restore();
  for (let k = 0; k < 5; k++) {
    const fx = x + (R() - 0.5) * s * 0.6, fh = s * (0.5 + R() * 0.7), fw = s * (0.12 + R() * 0.12);
    g.fillStyle = k % 2 ? '#e8a13a' : '#c9452a';
    g.beginPath(); g.moveTo(fx - fw, y); g.quadraticCurveTo(fx - fw, y - fh * 0.6, fx + (R() - 0.5) * fw, y - fh); g.quadraticCurveTo(fx + fw, y - fh * 0.5, fx + fw, y); g.closePath(); g.fill();
  }
  puff(g, R, x, y - s * 1.5, s * 0.9, '60,54,48', 0.35);
}
function rain(g, R, W, H, n, a = 0.28) {
  g.strokeStyle = `rgba(214,220,220,${a})`; g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) { const x = R() * (W + 200) - 100, y = R() * H, l = 26 + R() * 40; ln(g, x, y, x - l * 0.35, y + l); }
}
function mist(g, R, x, y, w, h, a = 0.7, col = '236,236,228') {
  g.save(); g.filter = `blur(${Math.round(h * 0.35)}px)`;
  g.fillStyle = `rgba(${col},${a})`;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x + w * (i + 0.5) / 5 + (R() - 0.5) * w * 0.1, y + (R() - 0.5) * h * 0.4, w * 0.16, h * 0.5, 0, 0, TAU); g.fill(); }
  g.restore();
}

// ---------------- 城と砦 ----------------
// 反りのある屋根（軒は反り上がり、上へすぼまる）
function roof(g, cx, y, w, h, o = {}) {
  const e = w / 2, t = w * (o.top ?? 0.2), col = o.col || '#3b3d42';
  const p = new Path2D();
  p.moveTo(cx - e - w * 0.03, y - h * 0.16);
  p.quadraticCurveTo(cx - e * 0.55, y + h * 0.04, cx, y + h * 0.04);
  p.quadraticCurveTo(cx + e * 0.55, y + h * 0.04, cx + e + w * 0.03, y - h * 0.16);
  p.quadraticCurveTo(cx + t * 1.5, y - h * 0.45, cx + t, y - h);
  p.lineTo(cx - t, y - h);
  p.quadraticCurveTo(cx - t * 1.5, y - h * 0.45, cx - e - w * 0.03, y - h * 0.16);
  g.fillStyle = col; g.fill(p);
  g.save(); g.clip(p); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = Math.max(0.6, w * 0.006);
  for (let x = cx - e; x < cx + e; x += Math.max(3, w * 0.03)) ln(g, x, y + h * 0.1, cx + (x - cx) * 0.45, y - h);
  const sh = g.createLinearGradient(0, y - h, 0, y); sh.addColorStop(0, 'rgba(255,255,255,.1)'); sh.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = sh; g.fill(p);
  g.restore();
  g.strokeStyle = INK; g.lineWidth = Math.max(0.8, w * 0.01); g.stroke(p);
  g.fillStyle = INK; g.fillRect(cx - t - w * 0.01, y - h - Math.max(1, h * 0.08), t * 2 + w * 0.02, Math.max(1.5, h * 0.12));
  if (o.shachi) { g.fillStyle = '#d9b24c'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(cx + sd * t, y - h - h * 0.14, h * 0.07, h * 0.16, sd * 0.4, 0, TAU); g.fill(); } }
  if (o.gable) { g.fillStyle = o.wall || '#ece6d6'; g.beginPath(); g.moveTo(cx - w * 0.14, y - h * 0.2); g.lineTo(cx, y - h * 0.62); g.lineTo(cx + w * 0.14, y - h * 0.2); g.closePath(); g.fill(); g.stroke(); }
}
// 天守：層を重ね、上ほど小さく。black なら黒漆の壁に金の飾り（大坂）
function tenshu(g, cx, by, w, lv, o = {}) {
  let y = by, ww = w;
  const wall = o.black ? '#26221e' : '#ece6d6';
  for (let i = 0; i < lv; i++) {
    const hh = w * 0.25 * (1 - i * 0.06);
    g.fillStyle = wall; g.fillRect(cx - ww / 2, y - hh, ww, hh);
    g.strokeStyle = INK; g.lineWidth = Math.max(0.8, w * 0.008); g.strokeRect(cx - ww / 2, y - hh, ww, hh);
    if (o.black) { g.fillStyle = '#c9a44f'; g.fillRect(cx - ww / 2, y - hh * 0.2, ww, Math.max(1, hh * 0.05)); }
    else { g.fillStyle = '#3a3128'; g.fillRect(cx - ww / 2, y - hh * 0.32, ww, hh * 0.32); }
    g.fillStyle = o.black ? '#c9a44f' : '#2a241e';
    const nwin = Math.max(2, Math.round(ww / (w * 0.16)));
    for (let k = 0; k < nwin; k++) g.fillRect(cx - ww / 2 + ww * (k + 0.35) / nwin, y - hh * 0.75, ww * 0.3 / nwin, hh * 0.28);
    roof(g, cx, y - hh + hh * 0.08, ww * 1.3, hh * 0.62, { shachi: i === lv - 1, gable: i > 0 && i < lv - 1 && ww > w * 0.5, wall, col: o.roof });
    y -= hh + hh * 0.42; ww *= 0.78;
  }
}
// 石垣：扇の勾配の反り
function ishigaki(g, R, cx, by, wb, wt, h) {
  const p = new Path2D();
  p.moveTo(cx - wb / 2, by); p.quadraticCurveTo(cx - wt / 2 - (wb - wt) * 0.08, by - h * 0.45, cx - wt / 2, by - h);
  p.lineTo(cx + wt / 2, by - h); p.quadraticCurveTo(cx + wt / 2 + (wb - wt) * 0.08, by - h * 0.45, cx + wb / 2, by); p.closePath();
  const gr = g.createLinearGradient(0, by - h, 0, by); gr.addColorStop(0, '#a29b8a'); gr.addColorStop(1, '#7c7568');
  g.fillStyle = gr; g.fill(p);
  g.save(); g.clip(p); g.strokeStyle = 'rgba(40,34,28,.45)'; g.lineWidth = 1;
  const rh = Math.max(5, h / 9);
  for (let y = by; y > by - h; y -= rh) { ln(g, cx - wb, y, cx + wb, y); for (let x = cx - wb / 2 + R() * rh * 2; x < cx + wb / 2; x += rh * (1.4 + R() * 1.6)) ln(g, x, y, x + (R() - 0.5) * 2, y - rh); }
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(p);
}
// 塀：白い漆喰、下見板、瓦の笠木、狭間
function wallRun(g, pts, h, o = {}) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    g.fillStyle = o.col || '#e9e2d0';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h); g.closePath(); g.fill();
    g.fillStyle = '#3a3128'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h * 0.38); g.lineTo(x0, y0 - h * 0.38); g.closePath(); g.fill();
    g.strokeStyle = '#2e2e32'; g.lineWidth = Math.max(1.5, h * 0.2); ln(g, x0, y0 - h, x1, y1 - h);
    g.fillStyle = '#2a241e';
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / (h * 1.1));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t) - h * 0.66; if (k % 2) g.fillRect(x - h * 0.07, y - h * 0.07, h * 0.14, h * 0.14); else { g.beginPath(); g.moveTo(x, y - h * 0.09); g.lineTo(x + h * 0.08, y + h * 0.06); g.lineTo(x - h * 0.08, y + h * 0.06); g.fill(); } }
    g.strokeStyle = 'rgba(28,23,18,.6)'; g.lineWidth = 1; ln(g, x0, y0, x1, y1);
  }
}
// 柵：丸太を立て、横木を二本（馬防柵は太く）
function palisade(g, R, pts, h, o = {}) {
  const step = o.step || h * 0.32;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
    g.strokeStyle = o.col || '#5a4630'; g.lineWidth = Math.max(1, h * (o.thick || 0.06)); g.lineCap = 'round';
    for (let k = 0; k <= n; k++) { const t = k / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t); ln(g, x, y, x + (R() - 0.5) * h * 0.06, y - h * (0.9 + R() * 0.2)); }
    g.strokeStyle = '#4a3a28'; g.lineWidth = Math.max(0.8, h * 0.04);
    ln(g, x0, y0 - h * 0.35, x1, y1 - h * 0.35); ln(g, x0, y0 - h * 0.75, x1, y1 - h * 0.75);
  }
}
// 井楼・櫓：柱の上に板囲いと小さな屋根
function yagura(g, cx, by, w, h, o = {}) {
  g.strokeStyle = '#4a3826'; g.lineWidth = Math.max(1, w * 0.06);
  const top = by - h * 0.62;
  ln(g, cx - w * 0.42, by, cx - w * 0.38, top); ln(g, cx + w * 0.42, by, cx + w * 0.38, top);
  g.lineWidth = Math.max(0.8, w * 0.03); ln(g, cx - w * 0.4, by, cx + w * 0.38, top); ln(g, cx + w * 0.4, by, cx - w * 0.38, top);
  g.fillStyle = o.wall || '#7c6446'; g.fillRect(cx - w / 2, top - h * 0.24, w, h * 0.26);
  g.strokeStyle = 'rgba(30,22,14,.5)'; g.lineWidth = 1; for (let k = 1; k < 4; k++) ln(g, cx - w / 2, top - h * 0.24 + k * h * 0.065, cx + w / 2, top - h * 0.24 + k * h * 0.065);
  g.strokeStyle = INK; g.strokeRect(cx - w / 2, top - h * 0.24, w, h * 0.26);
  g.fillStyle = '#1e1a16'; g.fillRect(cx - w * 0.3, top - h * 0.17, w * 0.6, h * 0.05);
  roof(g, cx, top - h * 0.24, w * 1.4, h * 0.2, { col: o.roof || '#4d4338', top: 0.12 });
}
// 平屋（館・小屋）
function hall(g, cx, by, w, h, o = {}) {
  g.fillStyle = o.wall || '#d9d0bb'; g.fillRect(cx - w / 2, by - h * 0.5, w, h * 0.5);
  g.fillStyle = '#4a3a28'; for (let k = 0; k < 6; k++) g.fillRect(cx - w / 2 + w * k / 6, by - h * 0.5, Math.max(1, w * 0.012), h * 0.5);
  g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(cx - w / 2, by - h * 0.5, w, h * 0.5);
  roof(g, cx, by - h * 0.48, w * 1.22, h * 0.55, { col: o.roof || '#5a4a3a', top: 0.34 });
}
// 門（冠木門・櫓門）
function gate(g, cx, by, w, h, o = {}) {
  g.fillStyle = '#3a2c1e'; g.fillRect(cx - w / 2, by - h * 0.7, w * 0.1, h * 0.7); g.fillRect(cx + w * 0.4, by - h * 0.7, w * 0.1, h * 0.7);
  g.fillStyle = o.open ? '#1a1612' : '#5a4630'; g.fillRect(cx - w * 0.4, by - h * 0.62, w * 0.8, h * 0.62);
  if (!o.open) { g.strokeStyle = '#2a1e14'; g.lineWidth = 1; ln(g, cx, by - h * 0.62, cx, by); g.fillStyle = '#1e1a16'; for (let k = 0; k < 3; k++) g.fillRect(cx - w * 0.36, by - h * (0.5 - k * 0.18), w * 0.72, Math.max(1, h * 0.03)); }
  if (o.yagura) { g.fillStyle = '#ece6d6'; g.fillRect(cx - w * 0.55, by - h * 1.05, w * 1.1, h * 0.36); g.strokeStyle = INK; g.strokeRect(cx - w * 0.55, by - h * 1.05, w * 1.1, h * 0.36); roof(g, cx, by - h * 1.02, w * 1.4, h * 0.3); }
  else roof(g, cx, by - h * 0.68, w * 1.3, h * 0.26, { col: '#4a4038', top: 0.3 });
}
// 陣幕：白と黒の段の幕に紋
function maku(g, x0, y0, x1, y1, h, mon) {
  g.fillStyle = '#e6dfcf'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h); g.closePath(); g.fill();
  g.strokeStyle = '#1a1712'; g.lineWidth = Math.max(1, h * 0.14);
  ln(g, x0, y0 - h * 0.3, x1, y1 - h * 0.3); ln(g, x0, y0 - h * 0.7, x1, y1 - h * 0.7);
  if (mon) { const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / (h * 2))); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; g.drawImage(monCanvas(mon), 8, 12, 48, 48, lerp(x0, x1, t) - h * 0.3, lerp(y0, y1, t) - h * 0.8, h * 0.6, h * 0.6); } }
  g.strokeStyle = '#4a3a28'; g.lineWidth = 1.2; ln(g, x0, y0 - h, x1, y1 - h);
}
// 土塁：盛った土の土手（上の線と高さ）
function earthwork(g, R, pts, h, o = {}) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1] + h);
  for (const [x, y] of pts) p.lineTo(x, y);
  for (let i = pts.length - 1; i >= 0; i--) p.lineTo(pts[i][0] + (o.slant || 0), pts[i][1] + h);
  p.closePath();
  const ys = pts.map((q) => q[1]);
  const gr = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys) + h);
  gr.addColorStop(0, o.c0 || '#7d8a5a'); gr.addColorStop(1, o.c1 || '#8a6f4a');
  g.fillStyle = gr; g.fill(p);
  g.save(); g.clip(p); g.strokeStyle = 'rgba(40,30,20,.25)'; g.lineWidth = 1;
  for (let i = 0; i < pts.length; i += 2) { const [x, y] = pts[i]; ln(g, x, y + 2, x + (R() - 0.5) * 10 + (o.slant || 0) * 0.5, y + h * (0.4 + R() * 0.5)); }
  g.restore();
  g.strokeStyle = 'rgba(28,23,18,.55)'; g.lineWidth = 1.6; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
}
// 岩の崖：縦の皴を墨で
function cliff(g, R, pts0, bottom, o = {}) {
  // 岩の縁をぎざぎざに
  const pts = pts0.map(([x, y], i) => (i === 0 || i === pts0.length - 1 ? [x, y] : [x + (R() - 0.5) * 10, y + (R() - 0.3) * 12]));
  const p = new Path2D();
  p.moveTo(pts[0][0], bottom); for (const [x, y] of pts) p.lineTo(x, y); p.lineTo(pts[pts.length - 1][0], bottom); p.closePath();
  const top = Math.min(...pts.map((q) => q[1]));
  const gr = g.createLinearGradient(0, top, 0, bottom); gr.addColorStop(0, o.c0 || '#8d8672'); gr.addColorStop(1, o.c1 || '#5f5a4c');
  g.fillStyle = gr; g.fill(p);
  g.save(); g.clip(p);
  for (let i = 0; i < 160; i++) {
    const x = lerp(pts[0][0], pts[pts.length - 1][0], R()), y = top + R() * (bottom - top), l = 20 + R() * 70;
    g.strokeStyle = `rgba(30,26,20,${0.2 + R() * 0.35})`; g.lineWidth = 1 + R() * 2.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 16, y + l * 0.5, x + (R() - 0.5) * 10, y + l); g.stroke();
  }
  // 横の岩の層
  g.strokeStyle = 'rgba(30,26,20,.25)'; g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { const x = lerp(pts[0][0], pts[pts.length - 1][0], R()), y = top + R() * (bottom - top), l = 30 + R() * 90; ln(g, x, y, x + l, y + (R() - 0.5) * 8); }
  g.fillStyle = 'rgba(90,110,70,.5)';
  for (let i = 0; i < 60; i++) { const x = lerp(pts[0][0], pts[pts.length - 1][0], R()), y = top + R() * (bottom - top); g.beginPath(); g.ellipse(x, y, 4 + R() * 10, 2 + R() * 4, 0, 0, TAU); g.fill(); }
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
}
// 竹束（鉄砲よけの竹の束）
function takedaba(g, x, y, s) { g.fillStyle = '#6e7a44'; g.fillRect(x - s * 0.12, y - s * 0.55, s * 0.24, s * 0.55); g.strokeStyle = '#3e4524'; g.lineWidth = 1; for (let k = -1; k <= 1; k++) ln(g, x + k * s * 0.07, y, x + k * s * 0.07, y - s * 0.55); g.strokeStyle = '#4a3a28'; ln(g, x - s * 0.12, y - s * 0.4, x + s * 0.12, y - s * 0.4); }

// ---------------- 仕上げ（屏風の折れ・古び） ----------------
function finish(g, W, H, R, o = {}) {
  const n = o.panels || 6, pw = W / n;
  for (let i = 1; i < n; i++) {
    const x = i * pw, gr = g.createLinearGradient(x - pw * 0.5, 0, x + pw * 0.5, 0);
    if (i % 2) { gr.addColorStop(0, 'rgba(255,246,220,0)'); gr.addColorStop(0.47, 'rgba(255,246,220,.07)'); gr.addColorStop(0.5, 'rgba(20,14,8,.16)'); gr.addColorStop(0.56, 'rgba(20,14,8,.05)'); gr.addColorStop(1, 'rgba(20,14,8,0)'); }
    else { gr.addColorStop(0, 'rgba(20,14,8,0)'); gr.addColorStop(0.44, 'rgba(20,14,8,.06)'); gr.addColorStop(0.5, 'rgba(20,14,8,.12)'); gr.addColorStop(0.53, 'rgba(255,246,220,.06)'); gr.addColorStop(1, 'rgba(255,246,220,0)'); }
    g.fillStyle = gr; g.fillRect(x - pw * 0.5, 0, pw, H);
    g.fillStyle = 'rgba(40,30,20,.28)'; g.fillRect(x - 0.6, 0, 1.2, H);
  }
  // 褪せ：色を少し抜き、縁を焼く
  g.save(); g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${o.fade ?? 0.18})`; g.fillRect(0, 0, W, H); g.restore();
  g.save(); g.globalCompositeOperation = 'multiply';
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
  v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(150,120,80,.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H); g.restore();
  fibers(g, W, H, R, 0, 0, W, H, 0.5);
}
// 夜・夜明け・雨の色（全体に掛ける）
function tint(g, W, H, stops, mode = 'multiply') {
  g.save(); g.globalCompositeOperation = mode;
  const gr = g.createLinearGradient(0, 0, 0, H); for (const [t, c] of stops) gr.addColorStop(t, c);
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}
// 空（金地）と野
function skyAndField(g, R, W, H, hy, o = {}) {
  goldLeaf(g, R, 0, 0, W, hy + 40, 64);
  const hz = g.createLinearGradient(0, hy * 0.25, 0, hy + 40);
  hz.addColorStop(0, 'rgba(226,216,186,0)'); hz.addColorStop(0.6, 'rgba(226,216,186,.55)'); hz.addColorStop(1, 'rgba(222,214,190,.9)');
  g.fillStyle = hz; g.fillRect(0, 0, W, hy + 40);
  const gr = g.createLinearGradient(0, hy, 0, H);
  gr.addColorStop(0, o.f0 || '#c8c296'); gr.addColorStop(1, o.f1 || '#aaa57a');
  g.fillStyle = gr; g.fillRect(0, hy, W, H - hy);
  fibers(g, W, H, R, 0, hy, W, H - hy, 0.7);
  // 野のむら（緑青と黄土を薄く）
  for (let i = 0; i < 30; i++) { const x = R() * W, y = hy + R() * (H - hy), r = 60 + R() * 200; const c = g.createRadialGradient(x, y, 0, x, y, r); c.addColorStop(0, R() < 0.5 ? 'rgba(95,125,80,.16)' : 'rgba(170,140,80,.14)'); c.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2); }
}
// 遠い山並み（霞む）
function farHills(g, R, W, base, amp, col = ['#8e9c86', '#b8b894'], alpha = 0.9) {
  hill(g, R, ridge(R, -20, W + 20, base, amp, 12), base + 80, col[0], col[1], { alpha, lw: 1.6, moss: false, line: 'rgba(40,40,30,.35)' });
}
// 草むら・点景
function grass(g, R, x0, x1, y0, y1, n, col = 'rgba(60,80,44,.5)') {
  g.strokeStyle = col; g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, R()), y = lerp(y0, y1, R()), h = 4 + R() * 8; ln(g, x, y, x - 2, y - h); ln(g, x, y, x + 2, y - h * 0.8); }
}

// ================= 場面 =================
const W0 = 2400, H0 = 720;
const SCENES = {
  // 長篠城籠城：二つの川が合わさる崖の上の城を、武田の大軍が囲む
  nagashinojo(g, R, W, H) {
    skyAndField(g, R, W, H, 250);
    farHills(g, R, W, 270, 90);
    hill(g, R, ridge(R, -20, 1300, 330, 110), 420, '#5f7a52', '#8f9a6c');
    hill(g, R, ridge(R, 1900, W + 20, 360, 120), 460, '#5a7650', '#8f9a6c');
    for (let i = 0; i < 40; i++) pine(g, R, R() * 1250, 300 + R() * 90, 24 + R() * 16);
    // 川：寒狭川（左上から）と宇連川（右から）が崖の下で合わさる
    const [t1, b1] = band(curve([[700, 330], [980, 420], [1250, 560], [1480, 740]], 60), 40, 140);
    river(g, R, t1, b1);
    const [t2, b2] = band(curve([[W + 40, 430], [2150, 520], [1850, 640], [1560, 740]], 60), 50, 140);
    river(g, R, t2, b2);
    // 崖と城
    const top = curve([[1270, 640], [1300, 470], [1350, 380], [1420, 320], [1650, 300], [1840, 330], [1880, 420], [1850, 540], [1860, 660]], 70);
    cliff(g, R, top, 760);
    // 崖の上の木
    for (let i = 0; i < 10; i++) pine(g, R, 1330 + R() * 540, 330 + R() * 40, 22 + R() * 10);
    const edge = [[1320, 350], [1430, 312], [1650, 300], [1850, 336]];
    hall(g, 1560, 300, 180, 70); hall(g, 1740, 312, 130, 56);
    wallRun(g, edge, 26);
    yagura(g, 1420, 318, 50, 110); yagura(g, 1840, 340, 46, 100);
    gate(g, 1650, 300, 60, 56, { yagura: true });
    for (const [x, y, k] of [[1380, 330, 'okudaira'], [1500, 306, 'tokugawa'], [1700, 302, 'okudaira'], [1790, 322, 'tokugawa'], [1880, 350, 'okudaira']]) nobori(g, x, y, 34, k, 1);
    for (let i = 0; i < 7; i++) puff(g, R, 1360 + i * 80, 318 + R() * 20, 26, undefined, 0.5);
    // 囲む武田：左の野と、右の丘
    const sc = persp(360, 16, 720, 50);
    for (let i = 0; i < 16; i++) takedaba(g, 1000 + i * 26 + R() * 10, 540 + i * 6 + R() * 10, sc(560));
    host(g, R, { x0: 40, x1: 1150, y0: 400, y1: 720, n: 190, dir: 1, fac: 'takeda', scale: sc, nobori: 12, cav: 0.1, gun: 0.1, angle: 1.25, inside: (x, y) => y > 400 + (x < 900 ? 0 : (x - 900) * 0.3) });
    host(g, R, { x0: 40, x1: 700, y0: 520, y1: 720, n: 40, dir: 1, fac: 'akazonae', scale: sc, nobori: 4, cav: 0.5 });
    host(g, R, { x0: 1960, x1: W - 30, y0: 380, y1: 620, n: 60, dir: -1, fac: 'takeda', scale: sc, nobori: 5, angle: 1.3, inside: (x, y) => y < 380 + (W - x) * 0.33 });
    for (let i = 0; i < 6; i++) puff(g, R, 900 + i * 50, 560 + R() * 40, 34, undefined, 0.35);
    goldCloud(g, R, -120, 70, 1100, 110); goldCloud(g, R, 1450, 150, 1150, 100); goldCloud(g, R, 1980, 290, 520, 70);
    goldCloud(g, R, -150, 700, 820, 100); goldCloud(g, R, 1950, 720, 600, 90);
  },
  // 鳶ヶ巣山：夜明けの尾根の砦を、酒井の別働隊が背から突く
  tobinosu(g, R, W, H) {
    skyAndField(g, R, W, H, 330, { f0: '#9a9a78', f1: '#6f7458' });
    farHills(g, R, W, 330, 80, ['#7d8a86', '#a7a994']);
    // 尾根
    const rp = curve([[-20, 520], [250, 430], [450, 380], [650, 330], [850, 300], [1100, 250], [1350, 262], [1550, 285], [1700, 340], [1900, 350], [2150, 430], [2420, 470]], 120).map(([x, y]) => [x, y + Math.sin(x * 0.03) * 6]);
    hill(g, R, rp, 760, '#3f5840', '#5d6a48', { lw: 3 });
    for (let i = 0; i < 70; i++) { const x = R() * W; const k = rp.findIndex((q) => q[0] > x); const y = (rp[k] || rp[rp.length - 1])[1]; pine(g, R, x, y + 10 + R() * 200, 26 + R() * 26, { col: '#253a28' }); }
    // 砦：柵・井楼・小屋
    const fort = [[860, 300], [1000, 268], [1150, 250], [1300, 255], [1440, 268]];
    hall(g, 1120, 262, 120, 50, { roof: '#5a4a3a' }); hall(g, 1290, 266, 100, 44);
    palisade(g, R, fort.map(([x, y]) => [x, y + 22]), 40);
    yagura(g, 960, 290, 44, 110); yagura(g, 1400, 280, 44, 100);
    for (const x of [1030, 1200, 1350]) nobori(g, x, 262, 28, x === 1200 ? 'furin' : 'takeda', -1);
    fire(g, R, 1180, 262, 40); fire(g, R, 1320, 270, 30);
    // 登る別働隊（右下から左上へ）
    const sc = persp(300, 16, 720, 46);
    host(g, R, { x0: 1350, x1: 2380, y0: 330, y1: 720, n: 170, dir: -1, fac: 'sakai', scale: sc, nobori: 10, gun: 0.2, run: 0.7, angle: 0.9, inside: (x, y) => y > 300 + (x - 1300) * 0.22 });
    host(g, R, { x0: 700, x1: 1350, y0: 280, y1: 330, n: 30, dir: 1, fac: 'takeda', scale: sc, angle: 1.0 });
    for (let i = 0; i < 8; i++) puff(g, R, 1450 + i * 70, 330 + i * 18 + R() * 20, 30, undefined, 0.35);
    goldCloud(g, R, -100, 80, 1200, 110); goldCloud(g, R, 1600, 140, 900, 90); goldCloud(g, R, -200, 640, 900, 110);
    // 夜明け：上は藍、山の端に朝の赤み
    tint(g, W, H, [[0, 'rgb(62,72,128)'], [0.3, 'rgb(120,122,170)'], [0.46, 'rgb(215,170,150)'], [0.62, 'rgb(110,112,150)'], [1, 'rgb(70,78,118)']]);
    g.save(); g.globalCompositeOperation = 'screen';
    const dawn = g.createRadialGradient(1900, 330, 0, 1900, 330, 900); dawn.addColorStop(0, 'rgba(240,150,90,.55)'); dawn.addColorStop(1, 'rgba(230,140,80,0)');
    g.fillStyle = dawn; g.fillRect(0, 0, W, H); g.restore();
    fire(g, R, 1180, 262, 34); fire(g, R, 1320, 270, 26);
    for (let i = 0; i < 16; i++) { const x = 1400 + R() * 950, y = 360 + R() * 330; g.save(); g.globalCompositeOperation = 'lighter'; const t = g.createRadialGradient(x, y - 30, 0, x, y - 30, 26); t.addColorStop(0, 'rgba(255,170,80,.6)'); t.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = t; g.fillRect(x - 26, y - 56, 52, 52); g.restore(); }
  },
  // 設楽原：連吾川を挟み、三重の馬防柵と鉄砲、駆け込む武田の騎馬
  shitaragahara(g, R, W, H) {
    skyAndField(g, R, W, H, 260);
    farHills(g, R, W, 280, 80);
    hill(g, R, ridge(R, -20, 900, 330, 80), 420, '#5f7a52', '#9aa070');
    hill(g, R, ridge(R, 1500, W + 20, 320, 90), 420, '#5a7650', '#9aa070');
    for (let i = 0; i < 30; i++) pine(g, R, 1500 + R() * 900, 290 + R() * 60, 20 + R() * 14);
    maku(g, 1750, 330, 2050, 320, 24, 'oda'); maku(g, 2100, 320, 2380, 330, 24, 'tokugawa');
    const [t, b] = band(curve([[1180, 330], [1240, 450], [1300, 580], [1330, 740]], 50), 24, 60);
    river(g, R, t, b);
    const sc = persp(330, 16, 720, 50);
    // 柵の内の鉄砲（右）
    host(g, R, { x0: 1500, x1: 2380, y0: 360, y1: 720, n: 200, dir: -1, fac: 'tokugawa', scale: sc, gun: 0.55, nobori: 8, angle: 1.3 });
    host(g, R, { x0: 1900, x1: 2380, y0: 350, y1: 520, n: 60, dir: -1, fac: 'oda', scale: sc, gun: 0.5, nobori: 6, angle: 1.3 });
    for (let k = 0; k < 3; k++) {
      const pts = curve([[1400 + k * 40, 340], [1440 + k * 40, 480], [1470 + k * 40, 600], [1500 + k * 40, 740]], 24);
      palisade(g, R, pts, sc(500) * 1.2, { thick: 0.08 });
    }
    for (let i = 0; i < 22; i++) { const y = 360 + i * 17; puff(g, R, 1420 + (y - 340) * 0.2 + R() * 30, y - 20, 22 + (y - 340) * 0.08, undefined, 0.55); }
    // 駆け込む武田（左）
    host(g, R, { x0: 20, x1: 1250, y0: 380, y1: 720, n: 140, dir: 1, fac: 'akazonae', scale: sc, cav: 0.75, nobori: 8, run: 0.8, angle: 0.7, inside: (x, y) => x < 1180 + (y - 330) * 0.2 });
    host(g, R, { x0: 20, x1: 700, y0: 340, y1: 460, n: 80, dir: 1, fac: 'takeda', scale: sc, cav: 0.4, nobori: 10, run: 0.5 });
    for (let i = 0; i < 10; i++) puff(g, R, 200 + R() * 1000, 520 + R() * 180, 60, '170,150,110', 0.22);
    goldCloud(g, R, -100, 90, 1300, 120); goldCloud(g, R, 1500, 160, 1000, 100); goldCloud(g, R, -150, 330, 420, 70);
    goldCloud(g, R, 2050, 720, 500, 90);
  },
  // 諏訪原城：丸馬出と三日月堀の台地の城を、徳川が攻める
  suwahara(g, R, W, H) {
    skyAndField(g, R, W, H, 240);
    farHills(g, R, W, 260, 70);
    // 大井川（右奥）
    const [t, b] = band(curve([[1700, 260], [2000, 330], [2250, 420], [2440, 520]], 40), 60, 150);
    river(g, R, t, b, { c0: '#6f86a6', c1: '#4a6388' });
    // 台地
    hill(g, R, curve([[500, 420], [800, 300], [1200, 250], [1700, 260], [1950, 380], [2100, 520]], 60), 560, '#6d7c52', '#8f8a5e');
    // 本曲輪
    wallRun(g, [[1150, 290], [1350, 270], [1600, 272], [1750, 300]], 24);
    hall(g, 1450, 272, 170, 64); yagura(g, 1160, 300, 44, 104); yagura(g, 1740, 305, 44, 100);
    for (const x of [1250, 1400, 1550, 1680]) nobori(g, x, 280, 30, x % 2 ? 'furin' : 'takeda', -1);
    // 丸馬出：城の門の前に張り出した半円の土塁（上に塀）と、その外を囲む三日月堀
    const cx = 1060, cy = 400;
    const moat = new Path2D(); moat.ellipse(cx, cy + 20, 300, 120, 0, 0, Math.PI); moat.ellipse(cx, cy + 20, 230, 82, 0, Math.PI, 0, true); moat.closePath();
    g.fillStyle = '#5a5238'; g.fill(moat); g.strokeStyle = 'rgba(28,23,18,.6)'; g.lineWidth = 2; g.stroke(moat);
    g.fillStyle = 'rgba(80,100,120,.35)'; g.beginPath(); g.ellipse(cx, cy + 118, 200, 14, 0, 0, TAU); g.fill();
    const mound = new Path2D(); mound.ellipse(cx, cy + 20, 225, 80, 0, 0, Math.PI); mound.lineTo(cx - 225, cy - 10); mound.lineTo(cx + 225, cy - 10); mound.closePath();
    const mg = g.createLinearGradient(0, cy - 10, 0, cy + 100); mg.addColorStop(0, '#8a9460'); mg.addColorStop(1, '#6d5c3e');
    g.fillStyle = mg; g.fill(mound); g.stroke(mound);
    const rim = []; for (let a = 0.08; a <= Math.PI - 0.08; a += 0.12) rim.push([cx + Math.cos(a) * 205, cy + 6 + Math.sin(a) * 60]);
    wallRun(g, rim.reverse(), 18);
    gate(g, cx, cy - 6, 46, 44);
    for (let i = 0; i < 7; i++) { const q = rim[1 + i * 2] || rim[rim.length - 1]; puff(g, R, q[0], q[1] - 20, 24, undefined, 0.55); }
    for (const q of [rim[2], rim[rim.length - 3]]) nobori(g, q[0], q[1] - 10, 28, 'takeda', -1);
    for (let i = 0; i < 16; i++) pine(g, R, 560 + R() * 1500, 300 + R() * 180, 20 + R() * 12);
    // 攻める徳川（左下から）
    const sc = persp(360, 18, 720, 52);
    host(g, R, { x0: 20, x1: 1500, y0: 560, y1: 720, n: 170, dir: 1, fac: 'tokugawa', scale: sc, nobori: 12, gun: 0.15, bow: 0.15, run: 0.5, angle: 1.0 });
    host(g, R, { x0: 20, x1: 700, y0: 420, y1: 560, n: 70, dir: 1, fac: 'okubo', scale: sc, nobori: 6, gun: 0.2 });
    
    for (let i = 0; i < 12; i++) takedaba(g, 700 + i * 44, 600 + R() * 20, sc(600));
    goldCloud(g, R, -120, 80, 1200, 120); goldCloud(g, R, 1700, 120, 900, 100); goldCloud(g, R, -200, 360, 600, 90);
    goldCloud(g, R, 1800, 700, 800, 100);
  },
  // 姉川：浅い川の瀬で、両軍が水しぶきを上げてぶつかる
  anegawa(g, R, W, H) {
    skyAndField(g, R, W, H, 230);
    farHills(g, R, W, 250, 110, ['#7f8f84', '#adb293']);
    hill(g, R, ridge(R, -20, W + 20, 300, 60), 360, '#617a52', '#a0a270');
    const [t, b] = band(curve([[-40, 400], [600, 430], [1200, 470], [1800, 450], [2440, 480]], 60), 150, 190);
    river(g, R, t, b, { ws: 30 });
    const sc = persp(300, 16, 720, 48);
    host(g, R, { x0: 20, x1: W - 20, y0: 310, y1: 420, n: 170, dir: 1, fac: 'azai', scale: sc, nobori: 14, cav: 0.1, run: 0.4, angle: 0.9 });
    host(g, R, { x0: 1500, x1: W - 20, y0: 310, y1: 400, n: 60, dir: -1, fac: 'asakura', scale: sc, nobori: 6 });
    host(g, R, { x0: 20, x1: 1500, y0: 470, y1: 720, n: 190, dir: -1, fac: 'oda', scale: sc, nobori: 14, cav: 0.08, run: 0.5, angle: 0.8 });
    host(g, R, { x0: 1500, x1: W - 20, y0: 480, y1: 720, n: 120, dir: -1, fac: 'tokugawa', scale: sc, nobori: 8, cav: 0.08, run: 0.5, angle: 0.8 });
    for (let i = 0; i < 40; i++) { const x = R() * W, y = 420 + R() * 80; g.strokeStyle = 'rgba(240,240,232,.7)'; g.lineWidth = 1.5; for (let k = 0; k < 4; k++) ln(g, x, y, x + (R() - 0.5) * 30, y - 10 - R() * 20); }
    goldCloud(g, R, -100, 90, 1100, 120); goldCloud(g, R, 1300, 140, 1200, 110); goldCloud(g, R, 1900, 300, 600, 70);
    goldCloud(g, R, -150, 720, 700, 90);
  },
  // 関ヶ原：朝霧の谷に、東西の旗が入り乱れる。松尾山には小早川
  sekigahara(g, R, W, H) {
    skyAndField(g, R, W, H, 240);
    farHills(g, R, W, 270, 120, ['#7d8c86', '#aab096']);
    hill(g, R, peak(1700, 2420, 360, 190, R), 460, '#4f6c48', '#86926a');
    hill(g, R, peak(-20, 700, 350, 150, R), 460, '#4f6c48', '#86926a');
    for (let i = 0; i < 40; i++) pine(g, R, 1750 + R() * 650, 260 + R() * 150, 22 + R() * 12);
    maku(g, 1950, 250, 2200, 248, 20, 'kobayakawa');
    for (const x of [1980, 2060, 2140]) nobori(g, x, 248, 24, 'kobayakawa', -1);
    const sc = persp(300, 15, 720, 46);
    host(g, R, { x0: 700, x1: 1700, y0: 330, y1: 470, n: 110, dir: 1, fac: 'ishida', scale: sc, nobori: 10, gun: 0.2 });
    host(g, R, { x0: 1300, x1: 1800, y0: 380, y1: 500, n: 50, dir: -1, fac: 'otani', scale: sc, nobori: 5 });
    host(g, R, { x0: 20, x1: 700, y0: 420, y1: 600, n: 80, dir: 1, fac: 'shimazu', scale: sc, nobori: 6 });
    host(g, R, { x0: 300, x1: 1300, y0: 520, y1: 720, n: 150, dir: -1, fac: 'todo', scale: sc, nobori: 10, run: 0.5, angle: 0.9 });
    host(g, R, { x0: 1300, x1: W - 20, y0: 520, y1: 720, n: 100, dir: -1, fac: 'ii', scale: sc, cav: 0.4, nobori: 8, run: 0.6 });
    host(g, R, { x0: 700, x1: 1500, y0: 480, y1: 560, n: 60, dir: -1, fac: 'tokugawa', scale: sc, nobori: 8 });
    mist(g, R, 200, 470, 1600, 120, 0.55); mist(g, R, 900, 330, 1400, 90, 0.45); mist(g, R, -100, 620, 1200, 100, 0.35);
    goldCloud(g, R, -100, 100, 1200, 120); goldCloud(g, R, 1500, 120, 1000, 100); goldCloud(g, R, 1500, 700, 1000, 100);
  },
  // 真田丸：大坂城の南の出丸。赤備えが塀の内から撃ち、徳川方が空堀へ押し寄せる
  sanadamaru(g, R, W, H) {
    skyAndField(g, R, W, H, 250);
    farHills(g, R, W, 270, 60);
    // 奥に大坂城
    ishigaki(g, R, 1900, 330, 520, 420, 90); tenshu(g, 1900, 240, 170, 5, { black: true });
    wallRun(g, [[1500, 330], [1640, 320], [2160, 320], [2400, 330]], 16);
    // 真田丸：土塁と塀と井楼
    const top = curve([[550, 440], [800, 360], [1100, 340], [1400, 360], [1600, 430]], 40);
    earthwork(g, R, top, 110, { c0: '#8a7a50', c1: '#6a5838' });
    wallRun(g, top, 26);
    yagura(g, 800, 370, 50, 120); yagura(g, 1380, 370, 50, 120); yagura(g, 1100, 350, 56, 130);
    for (const x of [700, 900, 1000, 1200, 1300, 1500]) { const k = top.findIndex((q) => q[0] > x); nobori(g, x, top[k][1] - 14, 32, 'sanada', 1); }
    for (let i = 0; i < 18; i++) { const q = top[Math.floor(R() * top.length)]; puff(g, R, q[0], q[1] - 18, 26, undefined, 0.55); }
    // 空堀と柵
    palisade(g, R, curve([[450, 580], [800, 500], [1100, 480], [1400, 500], [1700, 580]], 30), 40);
    // 押し寄せる徳川方
    const sc = persp(340, 16, 720, 50);
    host(g, R, { x0: 20, x1: W - 20, y0: 540, y1: 720, n: 260, dir: 1, fac: 'maeda', scale: sc, nobori: 16, run: 0.6, angle: 1.0, gun: 0.1 });
    host(g, R, { x0: 1700, x1: W - 20, y0: 420, y1: 560, n: 70, dir: -1, fac: 'ii', scale: sc, nobori: 6 });
    for (let i = 0; i < 8; i++) takedaba(g, 200 + i * 90 + R() * 30, 560 + R() * 30, sc(570));
    goldCloud(g, R, -150, 90, 1400, 120); goldCloud(g, R, 2150, 110, 500, 80); goldCloud(g, R, 1350, 60, 350, 60); goldCloud(g, R, -200, 700, 700, 100);
  },
  // 桶狭間：豪雨の中、窪地の今川の陣へ、織田勢が丘を駆け下りる
  okehazama(g, R, W, H) {
    skyAndField(g, R, W, H, 230);
    farHills(g, R, W, 250, 70, ['#6f7a70', '#8f9486']);
    hill(g, R, curve([[700, 480], [1000, 350], [1300, 330], [1600, 350], [1900, 480]], 40), 720, '#56704a', '#7a8058');
    hill(g, R, curve([[-20, 330], [400, 260], [800, 300], [1100, 420], [1300, 460]], 50), 720, '#4a6040', '#6a7050');
    hill(g, R, curve([[1500, 470], [1800, 330], [2100, 300], [2420, 340]], 40), 720, '#4a6040', '#6a7050');
    for (let i = 0; i < 50; i++) { const x = R() < 0.5 ? R() * 1100 : 1600 + R() * 800; pine(g, R, x, 300 + R() * 160, 26 + R() * 18, { col: '#2c4230' }); }
    // 窪地の今川の陣
    maku(g, 1150, 560, 1450, 555, 30, 'imagawa'); maku(g, 1450, 555, 1700, 570, 30, 'imagawa');
    hall(g, 1420, 540, 140, 50, { roof: '#6a5a44' });
    const sc = persp(300, 18, 720, 52);
    host(g, R, { x0: 1100, x1: 1800, y0: 560, y1: 720, n: 80, dir: -1, fac: 'imagawa', scale: sc, nobori: 6, angle: 1.3 });
    host(g, R, { x0: 20, x1: 1150, y0: 330, y1: 720, n: 200, dir: 1, fac: 'oda', scale: sc, nobori: 10, run: 0.9, angle: 0.75, inside: (x, y) => y > 320 + x * 0.12 });
    goldCloud(g, R, -100, 80, 1200, 110); goldCloud(g, R, 1500, 130, 900, 90);
    // 雨雲と豪雨
    tint(g, W, H, [[0, 'rgb(160,166,166)'], [0.5, 'rgb(206,208,198)'], [1, 'rgb(178,182,170)']]);
    for (let i = 0; i < 8; i++) puff(g, R, R() * W, 40 + R() * 140, 240, '70,76,80', 0.28);
    rain(g, R, W, H, 1400, 0.32);
  },
  // 森部：川沿いの野で、斎藤勢の横を突く
  moribe(g, R, W, H) {
    skyAndField(g, R, W, H, 250);
    farHills(g, R, W, 270, 70);
    const [t, b] = band(curve([[-40, 330], [700, 360], [1500, 340], [2440, 380]], 60), 70, 90);
    river(g, R, t, b);
    for (let i = 0; i < 20; i++) tree(g, R, R() * W, 300 + R() * 20, 30 + R() * 14);
    const sc = persp(330, 16, 720, 48);
    host(g, R, { x0: 700, x1: W - 20, y0: 420, y1: 620, n: 200, dir: -1, fac: 'saito', scale: sc, nobori: 14, angle: 1.1, run: 0.2 });
    host(g, R, { x0: 20, x1: 900, y0: 460, y1: 720, n: 170, dir: 1, fac: 'oda', scale: sc, nobori: 10, run: 0.8, angle: 0.8, cav: 0.08 });
    for (let i = 0; i < 8; i++) puff(g, R, 700 + R() * 500, 500 + R() * 150, 50, '170,150,110', 0.22);
    goldCloud(g, R, -100, 90, 1100, 110); goldCloud(g, R, 1400, 150, 1100, 100); goldCloud(g, R, 1900, 700, 600, 90); goldCloud(g, R, -200, 360, 500, 70);
  },
  // 墨俣：長良川の西岸で砦を普請し、寄せる斎藤勢を防ぐ
  sunomata(g, R, W, H) {
    skyAndField(g, R, W, H, 240);
    farHills(g, R, W, 260, 90);
    hill(g, R, peak(1800, 2400, 320, 140, R), 360, '#4f6c48', '#86926a');
    const [t, b] = band(curve([[-40, 380], [800, 400], [1600, 360], [2440, 400]], 60), 160, 200);
    river(g, R, t, b, { ws: 30 });
    // 対岸の斎藤勢
    const sc = persp(300, 14, 720, 50);
    host(g, R, { x0: 300, x1: 1800, y0: 262, y1: 288, n: 90, dir: 1, fac: 'saito', scale: sc, nobori: 10 });
    // 砦の普請
    const ring = [[500, 560], [800, 520], [1200, 510], [1600, 530], [1900, 580]];
    palisade(g, R, ring, 46);
    yagura(g, 900, 540, 50, 120); hall(g, 1250, 560, 160, 60, { roof: '#6a5a44' });
    g.strokeStyle = '#6a5236'; g.lineWidth = 4;
    for (let i = 0; i < 12; i++) ln(g, 1350 + i * 14, 610, 1600 + i * 10, 590);
    // 足場
    g.strokeStyle = '#7a6040'; g.lineWidth = 2.5; for (let k = 0; k < 5; k++) ln(g, 1500 + k * 30, 560, 1500 + k * 30, 440); for (let k = 0; k < 4; k++) ln(g, 1490, 560 - k * 35, 1630, 560 - k * 35);
    host(g, R, { x0: 20, x1: W - 20, y0: 560, y1: 720, n: 220, dir: -1, fac: 'oda', scale: sc, nobori: 12, gun: 0.15, angle: 1.2 });
    // 川を渡る斎藤の舟
    for (let i = 0; i < 5; i++) { const x = 400 + i * 360 + R() * 80, y = 420 + R() * 40; g.fillStyle = '#4a3a28'; g.beginPath(); g.moveTo(x - 60, y); g.quadraticCurveTo(x, y + 18, x + 60, y); g.lineTo(x + 50, y + 8); g.lineTo(x - 50, y + 8); g.fill(); for (let k = 0; k < 4; k++) foot(g, x - 36 + k * 22, y + 2, 26, { dir: 1, armor: '#3b3530', flag: 'saito', angle: 1.3 }); }
    goldCloud(g, R, -150, 90, 1300, 120); goldCloud(g, R, 1500, 140, 1100, 100); goldCloud(g, R, 2000, 720, 600, 90); goldCloud(g, R, -150, 450, 380, 60);
  },
  // 城攻め（どの城にも使う一枚）：石垣の上の天守を、梯子と鉄砲で攻める
  siege(g, R, W, H) {
    skyAndField(g, R, W, H, 260);
    farHills(g, R, W, 280, 80);
    hill(g, R, curve([[600, 520], [900, 380], [1200, 330], [1600, 330], [1900, 400], [2100, 520]], 60), 620, '#5f7a52', '#8f9a6c');
    ishigaki(g, R, 1350, 420, 700, 560, 90);
    wallRun(g, [[1080, 332], [1620, 332]], 22);
    tenshu(g, 1350, 330, 200, 4);
    yagura(g, 1080, 340, 50, 110); yagura(g, 1620, 340, 50, 110);
    for (const x of [1150, 1260, 1450, 1560]) nobori(g, x, 330, 28, 'takeda', -1);
    for (let i = 0; i < 8; i++) puff(g, R, 1100 + i * 70, 320 + R() * 20, 26, undefined, 0.5);
    // 梯子
    g.strokeStyle = '#6a5236'; g.lineWidth = 3;
    for (const x of [1060, 1200, 1500, 1640]) { ln(g, x, 440, x + 20, 340); ln(g, x + 22, 440, x + 42, 340); for (let k = 0; k < 6; k++) ln(g, x + k * 3.3, 440 - k * 17, x + 22 + k * 3.3, 440 - k * 17); }
    const sc = persp(360, 16, 720, 52);
    host(g, R, { x0: 20, x1: W - 20, y0: 440, y1: 720, n: 300, dir: 1, fac: 'tokugawa', scale: sc, nobori: 18, run: 0.5, gun: 0.15, bow: 0.1, angle: 1.1, inside: (x, y) => y > 440 + Math.max(0, 300 - Math.abs(x - 1350)) * 0.1 });
    goldCloud(g, R, -150, 90, 1300, 120); goldCloud(g, R, 1650, 150, 900, 100); goldCloud(g, R, -150, 340, 560, 80); goldCloud(g, R, 1950, 700, 600, 90);
  },
};
// タイトル：土煙の中を、赤備えの騎馬の大軍がこちらへ駆ける。奥には柵と鉄砲の煙、金雲
function titleScene(g, R, W, H) {
  const hy = H * 0.43;
  skyAndField(g, R, W, H, hy, { f0: '#b9b28a', f1: '#8f8664' });
  // 奥の霞んだ岩山
  hill(g, R, peak(-100, 900, hy + 30, 240, R, 12), hy + 120, '#7a8680', '#a7aa96', { alpha: 0.85, lw: 1.4, moss: false, line: 'rgba(40,40,30,.3)' });
  hill(g, R, peak(700, 1900, hy + 30, 300, R, 12), hy + 120, '#6f7c78', '#a1a592', { alpha: 0.85, lw: 1.4, moss: false, line: 'rgba(40,40,30,.3)' });
  hill(g, R, peak(1600, 2500, hy + 30, 220, R, 12), hy + 120, '#7a8680', '#a7aa96', { alpha: 0.85, lw: 1.4, moss: false, line: 'rgba(40,40,30,.3)' });
  mist(g, R, -100, hy - 10, W + 200, 90, 0.5, '222,210,178');
  // 遠くの城（長篠城）と、右の柵と鉄砲
  cliff(g, R, curve([[1950, hy + 40], [2000, hy - 30], [2150, hy - 50], [2300, hy - 20], [2350, hy + 40]], 30), hy + 60, { c0: '#8a8472', c1: '#78725f' });
  wallRun(g, [[2020, hy - 36], [2150, hy - 52], [2290, hy - 26]], 10); yagura(g, 2060, hy - 38, 18, 44); yagura(g, 2260, hy - 30, 18, 40);
  const sc = persp(hy, 10, H + 60, 300, 1.8);
  host(g, R, { x0: 1850, x1: W, y0: hy + 10, y1: hy + 130, n: 90, dir: -1, fac: 'tokugawa', scale: sc, gun: 0.6, nobori: 10, angle: 1.3 });
  for (let k = 0; k < 2; k++) palisade(g, R, curve([[1700 + k * 30, hy + 20], [1760 + k * 30, hy + 90], [1820 + k * 30, hy + 170]], 12), 26 + k * 4, { thick: 0.08 });
  for (let i = 0; i < 14; i++) puff(g, R, 1700 + i * 16 + R() * 20, hy + 10 + i * 11, 26 + i * 2, undefined, 0.6);
  // 土煙
  for (let i = 0; i < 26; i++) puff(g, R, R() * 1900, hy + 40 + R() * 260, 120 + R() * 120, '196,176,136', 0.22);
  // 赤備えの騎馬の大軍：奥から手前へ密に
  host(g, R, { x0: -80, x1: 1750, y0: hy + 20, y1: hy + 200, n: 260, dir: 1, fac: 'akazonae', scale: sc, cav: 0.85, nobori: 16, run: 0.8, cavAngle: 0.35, inside: (x, y) => x < 1680 + (y - hy) * 0.6 });
  for (let i = 0; i < 10; i++) puff(g, R, R() * 1700, hy + 180 + R() * 120, 160, '196,176,136', 0.25);
  host(g, R, { x0: -120, x1: 1500, y0: hy + 200, y1: hy + 360, n: 60, dir: 1, fac: 'akazonae', scale: sc, cav: 0.9, nobori: 3, run: 0.8, cavAngle: 0.3, coats: ['#5a3a22', '#3a2a1e', '#2a211b', '#6b4424'] });
  for (let i = 0; i < 8; i++) puff(g, R, R() * 1600, H - 60 + R() * 60, 220, '190,168,126', 0.28);
  host(g, R, { x0: 1300, x1: 2300, y0: hy + 230, y1: H - 60, n: 6, dir: 1, fac: 'akazonae', scale: sc, cav: 1, run: 0.8, cavAngle: 0.3, coats: ['#5a3a22', '#3a2a1e', '#6b4424'] });
  for (let i = 0; i < 6; i++) puff(g, R, 1300 + R() * 1100, H - 80 + R() * 60, 200, '190,168,126', 0.3);
  // 先頭の武将（大きく、低い目線で）
  rider(g, 1080, H + 30, 330, { dir: 1, armor: '#b1402a', red: true, tack: '#c0452e', coat: '#3a2a1e', helm: 'kabuto', crest: 'v', flag: 'akazonae', weapon: 'spear', angle: 0.22, len: 2.4 });
  rider(g, 420, H + 70, 360, { dir: 1, armor: '#a63a26', red: true, tack: '#b8412a', coat: '#5a3a22', helm: 'kabuto', crest: 'moon', flag: 'akazonae', weapon: 'spear', angle: 0.3, len: 2.3 });
  // 金雲
  goldCloud(g, R, -150, 90, 1250, 140); goldCloud(g, R, 1400, 150, 1150, 120); goldCloud(g, R, 600, hy - 90, 700, 80);
  goldCloud(g, R, 1850, H - 40, 700, 120);
}
// 後日譚の結び：戦の終わった秋。実った田と、自分の旗の立つ城、帰る雁
function epilogueScene(g, R, W, H, mon, aiji) {
  skyAndField(g, R, W, H, 290, { f0: '#b9b88a', f1: '#9c9a6c' });
  farHills(g, R, W, 310, 110, ['#8f9a86', '#b9b594']);
  // 実った田：畦で区切った田を、金茶と萌黄に塗り分ける（手前ほど大きく）
  for (let r = 0; r < 7; r++) {
    const y0 = 400 + r * r * 7 + r * 18, y1 = 400 + (r + 1) * (r + 1) * 7 + (r + 1) * 18, cw = 120 + r * 40;
    for (let x = -((r * 53) % cw); x < W; x += cw) {
      const k = R();
      g.fillStyle = k < 0.7 ? `rgb(${196 + R() * 20},${158 + R() * 20},${72 + R() * 20})` : k < 0.9 ? '#9aa46a' : '#8d7a52';
      g.fillRect(x + 2, y0 + 2, cw - 4, y1 - y0 - 3);
      g.fillStyle = 'rgba(150,110,40,.5)'; for (let i = 0; i < cw * (y1 - y0) / 120; i++) g.fillRect(x + 4 + R() * (cw - 8), y0 + 3 + R() * (y1 - y0 - 6), 1.5, 2.5);
    }
    g.strokeStyle = 'rgba(80,70,40,.55)'; g.lineWidth = 2; ln(g, 0, y0, W, y0);
  }
  // 稲架（刈った稲を掛けて干す）
  for (let i = 0; i < 6; i++) { const x = 150 + i * 190 + R() * 60, y = 520 + R() * 120, w = 90 + R() * 40, h = 30 + (y - 500) * 0.12; g.strokeStyle = '#4a3a28'; g.lineWidth = 2; ln(g, x, y, x, y - h); ln(g, x + w, y, x + w, y - h); g.fillStyle = '#b08a3a'; g.fillRect(x, y - h, w, h * 0.55); g.strokeStyle = 'rgba(90,60,20,.6)'; g.lineWidth = 1; for (let k = 0; k < w; k += 4) ln(g, x + k, y - h, x + k, y - h * 0.4); }
  // 城のある丘と紅葉
  hill(g, R, curve([[1050, 480], [1250, 330], [1500, 250], [1750, 280], [2000, 400], [2250, 520]], 60), 540, '#5f7a52', '#8f9a6c');
  for (let i = 0; i < 46; i++) { const x = 1120 + R() * 1060, y = 330 + R() * 190; tree(g, R, x, y, 24 + R() * 14, R() < 0.55 ? '#b0492c' : '#c98a3a'); }
  wallRun(g, [[1330, 300], [1500, 262], [1700, 272]], 22);
  hall(g, 1500, 264, 190, 70); yagura(g, 1340, 306, 44, 110); yagura(g, 1700, 284, 44, 104);
  gate(g, 1580, 268, 56, 48, { open: true });
  nobori(g, 1430, 270, 40, mon, 1); nobori(g, 1640, 270, 44, aiji || mon, -1);
  // 城へ続く道と、帰ってきた組（合印の旗）
  g.strokeStyle = 'rgba(200,184,140,.9)'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(700, 720); g.quadraticCurveTo(1100, 560, 1580, 290); g.stroke();
  const sc = persp(300, 14, 720, 48);
  for (let i = 0; i < 16; i++) { const t = 0.12 + i / 16 * 0.8, x = lerp(lerp(700, 1100, t), lerp(1100, 1580, t), t), y = lerp(lerp(720, 560, t), lerp(560, 290, t), t); foot(g, x + 8, y, sc(y), { dir: 1, armor: '#2b2723', flag: i % 3 === 0 ? (aiji || mon) : null, weapon: 'spear', angle: 1.45, run: 0.3 }); }
  // 刈り入れの人
  for (let i = 0; i < 10; i++) { const x = 100 + R() * 1000, y = 560 + R() * 150; foot(g, x, y, sc(y) * 0.9, { dir: R() < 0.5 ? 1 : -1, armor: '#6a5a44', hat: '#b09a64', weapon: 'none', lean: 0.1 }); }
  // 雁の列
  g.strokeStyle = 'rgba(28,23,18,.8)'; g.lineWidth = 2.4;
  for (let i = 0; i < 9; i++) { const x = 500 + i * 46, y = 220 + Math.abs(i - 4) * 16; g.beginPath(); g.moveTo(x - 12, y - 4); g.quadraticCurveTo(x - 4, y - 8, x, y); g.quadraticCurveTo(x + 4, y - 8, x + 12, y - 4); g.stroke(); }
  goldCloud(g, R, -150, 90, 1300, 120); goldCloud(g, R, 1750, 130, 800, 100); goldCloud(g, R, -150, 380, 560, 80); goldCloud(g, R, 1950, 700, 600, 100);
  // 夕方の暖かい色
  tint(g, W, H, [[0, 'rgb(255,238,208)'], [1, 'rgb(240,220,186)']]);
}

// ================= 描いて使い回す =================
const store = new Map();   // 鍵 → { url, p }
const SEEDS = { title: 7, epilogue: 11 };
function seedOf(k) { let h = 17; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return SEEDS[k] || h; }
// 鍵から絵を描く（一度だけ）。返すのはキャンバス
export function drawIllust(key) {
  const [name, a, b] = key.split(':');
  const R = rng(seedOf(key));
  if (name === 'title') { const c = mk(2400, 900), g = c.getContext('2d'); washi(g, 2400, 900, R); titleScene(g, R, 2400, 900); finish(g, 2400, 900, R, { fade: 0.22 }); return c; }
  const c = mk(W0, H0), g = c.getContext('2d');
  washi(g, W0, H0, R);
  if (name === 'epilogue') epilogueScene(g, R, W0, H0, a || 'tokugawa', b);
  else (SCENES[name] || SCENES.siege)(g, R, W0, H0);
  finish(g, W0, H0, R);
  return c;
}
// 絵の URL を約束で返す（同じ鍵は二度描かない）
export function illustURL(key) {
  if (!store.has(key)) {
    const p = new Promise((res) => {
      const run = () => {
        const c = drawIllust(key);
        c.toBlob((bl) => res(bl ? URL.createObjectURL(bl) : c.toDataURL('image/jpeg', 0.88)), 'image/jpeg', 0.88);
      };
      // 画面が出てから描く（出る前に固まらないように）
      requestAnimationFrame(() => setTimeout(run, 0));
    });
    store.set(key, p);
  }
  return store.get(key);
}
// 戦の id か物語の札の題から、絵の鍵を選ぶ
export function illustKey(id, title = '') {
  if (id && SCENES[id]) return id;
  return /城|砦|丸/.test(title) ? 'siege' : null;
}

// 絵を置く所（screens.js が HTML に入れ、mountIllust で絵を差し込む）
export function illustHtml(key, cls = 'band', label = '') {
  ensureCss();
  if (!key) return '';
  return `<figure class="ill ill-${cls}" data-ill="${key}"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}><img alt="" decoding="async"></figure>`;
}
export function mountIllust(root) {
  (root || document).querySelectorAll('figure.ill[data-ill]').forEach((f) => {
    const img = f.querySelector('img');
    img.onload = () => f.classList.add('on');
    illustURL(f.dataset.ill).then((u) => {
      if (!f.isConnected) return;
      img.src = u;
      if (img.complete && img.naturalWidth) f.classList.add('on');
    });
  });
}
// 暇なときに先に描いておく
export function prewarm(keys) {
  const go = () => { const k = keys.shift(); if (!k) return; illustURL(k).then(() => (window.requestIdleCallback || setTimeout)(go)); };
  (window.requestIdleCallback || setTimeout)(go);
}

// 絵の枠の見た目（屏風：黒漆の縁に金の細い線）
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'ill-css';
  st.textContent = `
  .ill { margin: 0 auto; position: relative; overflow: hidden; background: #2a2219; border: 3px solid #17130f; box-shadow: 0 0 0 1px rgba(194,162,90,.55), 0 10px 30px rgba(0,0,0,.45); }
  .ill img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .7s ease-out; }
  .ill.on img { opacity: 1; }
  .ill::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 1px rgba(194,162,90,.35), inset 0 0 24px rgba(20,14,8,.35); }
  .ill-band { width: min(1100px, 100%); height: clamp(100px, min(calc(78vh - 450px), 30vw), 330px); margin: 8px auto 18px; }
  .ill-band img { object-position: 50% 45%; }
  .ill-title { width: 100%; height: clamp(120px, min(calc(100vh - 530px), 38vw), 330px); margin: 6px 0 4px; }
  .ill-title img { object-position: 50% 60%; }
  .ill-epi { width: 100%; height: clamp(72px, min(calc(44vh - 248px), 30vw), 200px); margin: 8px auto 16px; }
  .story.has-ill h2 { margin: 6px 0 14px; }
  @media (max-height: 760px) { .story.has-ill h2 { font-size: clamp(30px, 5vw, 52px); margin: 4px 0 10px; } .story.has-ill p { margin-bottom: 16px; line-height: 1.9; } }
  @media (prefers-reduced-motion: reduce) { .ill img { transition: none; } }
  body.rm .ill img { transition: none; }
  `;
  document.head.appendChild(st);
}

// ================= アイコン =================
// 兜（金の鍬形の前立）と、斜めの槍と、朱の家紋の丸。小さい時は形を減らす
export function drawIcon(N) {
  const c = mk(N, N), g = c.getContext('2d'), u = N / 512, small = N <= 32, tiny = N <= 16;
  const px = (v, min = 1) => Math.max(min, v * u);
  // 地：墨
  const bg = g.createRadialGradient(N * 0.5, N * 0.42, 0, N * 0.5, N * 0.5, N * 0.75);
  bg.addColorStop(0, '#2a231c'); bg.addColorStop(1, '#100d0a');
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  if (!small) { const R = rng(3); g.save(); fibers(g, N, N, R, 0, 0, N, N, 0.6 * (512 / N)); g.restore(); }
  // 朱の丸と、金の輪（家紋の丸）
  const cx = 256 * u, cy = (tiny ? 262 : 250) * u, rr = (tiny ? 214 : 196) * u;
  const rd = g.createRadialGradient(cx - rr * 0.3, cy - rr * 0.35, rr * 0.1, cx, cy, rr);
  rd.addColorStop(0, '#d0553a'); rd.addColorStop(1, '#9a3522');
  g.fillStyle = rd; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
  if (!tiny) { g.strokeStyle = '#c9a44f'; g.lineWidth = px(12); g.beginPath(); g.arc(cx, cy, rr + px(10), 0, TAU); g.stroke(); }
  // 槍：左下から右上へ（兜の後ろ）
  if (!tiny) {
    const a = [70 * u, 470 * u], b = [430 * u, 70 * u];
    g.strokeStyle = '#1b1510'; g.lineWidth = px(small ? 22 : 16, 1.6); g.lineCap = 'round'; ln(g, a[0], a[1], b[0] - 50 * u, b[1] + 55 * u);
    // 穂（鋼）
    g.fillStyle = '#e4e0d4';
    g.save(); g.translate(b[0], b[1]); g.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
    g.beginPath(); g.moveTo(-86 * u, -px(12, 1.2)); g.lineTo(10 * u, 0); g.lineTo(-86 * u, px(12, 1.2)); g.closePath(); g.fill();
    g.fillStyle = '#c9a44f'; g.fillRect(-100 * u, -px(12, 1.2), 16 * u, px(24, 2.4));
    g.restore();
  }
  // 兜
  const hy = (tiny ? 318 : 312) * u;
  // 錣（裾広がり、三段）
  g.fillStyle = '#16120f';
  g.beginPath(); g.moveTo(cx - 118 * u, hy - 6 * u); g.lineTo(cx + 118 * u, hy - 6 * u); g.lineTo(cx + 176 * u, hy + 104 * u); g.quadraticCurveTo(cx, hy + 130 * u, cx - 176 * u, hy + 104 * u); g.closePath(); g.fill();
  if (!small) {
    g.strokeStyle = '#c9a44f'; g.lineWidth = px(5);
    for (const t of [0.34, 0.68]) { g.beginPath(); g.moveTo(cx - (118 + 58 * t) * u, hy + (-6 + 110 * t) * u); g.quadraticCurveTo(cx, hy + (-6 + 110 * t + 26 * t) * u, cx + (118 + 58 * t) * u, hy + (-6 + 110 * t) * u); g.stroke(); }
    g.strokeStyle = '#b3402a'; g.lineWidth = px(3);
    for (let k = -5; k <= 5; k++) { g.beginPath(); g.moveTo(cx + k * 22 * u, hy); g.lineTo(cx + k * 32 * u, hy + 108 * u); g.stroke(); }
  }
  // 吹返し（左右に折れた耳）
  g.fillStyle = '#16120f';
  for (const sd of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + sd * 104 * u, hy - 40 * u); g.lineTo(cx + sd * 158 * u, hy - 58 * u); g.lineTo(cx + sd * 150 * u, hy + 18 * u); g.lineTo(cx + sd * 108 * u, hy + 10 * u); g.closePath(); g.fill();
    if (!small) { g.strokeStyle = '#c9a44f'; g.lineWidth = px(5); g.stroke(); }
  }
  // 鉢
  const hg = g.createLinearGradient(cx - 120 * u, 0, cx + 120 * u, 0);
  hg.addColorStop(0, '#0e0b09'); hg.addColorStop(0.4, '#3a322a'); hg.addColorStop(1, '#0e0b09');
  g.fillStyle = hg; g.beginPath(); g.ellipse(cx, hy - 8 * u, 116 * u, 118 * u, 0, Math.PI, 0); g.closePath(); g.fill();
  if (!small) {
    g.strokeStyle = 'rgba(214,180,100,.7)'; g.lineWidth = px(3);
    for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(cx + k * 26 * u, hy - 10 * u); g.quadraticCurveTo(cx + k * 22 * u, hy - 90 * u, cx + k * 4 * u, hy - 122 * u); g.stroke(); }
    g.fillStyle = '#c9a44f'; g.beginPath(); g.ellipse(cx, hy - 124 * u, 16 * u, 6 * u, 0, 0, TAU); g.fill();
  }
  // 眉庇（前の縁）
  g.fillStyle = '#0e0b09'; g.beginPath(); g.moveTo(cx - 126 * u, hy - 6 * u); g.quadraticCurveTo(cx, hy - 34 * u, cx + 126 * u, hy - 6 * u); g.lineTo(cx + 120 * u, hy + 12 * u); g.quadraticCurveTo(cx, hy - 10 * u, cx - 120 * u, hy + 12 * u); g.closePath(); g.fill();
  g.strokeStyle = '#c9a44f'; g.lineWidth = px(6, tiny ? 0 : 1); if (!tiny) g.stroke();
  // 鍬形（金の前立）：額から左右へ大きく反り上がる
  const gold = g.createLinearGradient(0, 40 * u, 0, hy);
  gold.addColorStop(0, '#f0d27a'); gold.addColorStop(0.6, '#d0a748'); gold.addColorStop(1, '#a8802e');
  g.fillStyle = gold; g.strokeStyle = '#3a2a10'; g.lineWidth = px(4, small ? 0.8 : 1);
  // 角の中心線（根元から外へ反り上がる）に沿って、根元は太く先は細い帯を塗る
  for (const sd of [-1, 1]) {
    const B = [cx + sd * 16 * u, hy - 40 * u], C = [cx + sd * 150 * u, hy - 70 * u], T = [cx + sd * 176 * u, (tiny ? 70 : 58) * u];
    const L = [], Rr = [], n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      const px2 = mt * mt * B[0] + 2 * mt * t * C[0] + t * t * T[0], py2 = mt * mt * B[1] + 2 * mt * t * C[1] + t * t * T[1];
      const dx = 2 * mt * (C[0] - B[0]) + 2 * t * (T[0] - C[0]), dy = 2 * mt * (C[1] - B[1]) + 2 * t * (T[1] - C[1]), l = Math.hypot(dx, dy) || 1;
      const w = Math.max(tiny ? 1.4 : small ? 1.6 : 0, lerp(tiny ? 40 : small ? 34 : 30, tiny ? 16 : 7, t) * u) / 2;
      L.push([px2 - dy / l * w, py2 + dx / l * w]); Rr.push([px2 + dy / l * w, py2 - dx / l * w]);
    }
    g.beginPath(); L.forEach(([qx, qy], i) => (i ? g.lineTo(qx, qy) : g.moveTo(qx, qy))); for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(...Rr[i]); g.closePath();
    g.fillStyle = gold; g.fill(); if (!small) g.stroke();
  }
  // 台（前立の根元）に小さな家紋の丸
  g.fillStyle = gold; g.beginPath(); g.arc(cx, hy - 26 * u, px(tiny ? 34 : 26, 1.5), 0, TAU); g.fill();
  if (!tiny) { g.stroke(); g.fillStyle = '#9a3522'; g.beginPath(); g.arc(cx, hy - 26 * u, px(13, 1), 0, TAU); g.fill(); }
  return c;
}
