import * as THREE from 'three';

// 旗・指物の家紋をキャンバスで描く
const cache = new Map();

const FLAG_BG = {
  oda: '#d9b43c', eiraku: '#d9b43c', imagawa: '#e8e2d2', saito: '#dfe3e6',
  ichimonji: '#ece6d6', maru: '#ece6d6', igeta: '#ece6d6', hikyaku: '#e8e2d2',
  // 長篠編
  tokugawa: '#ebe5d4', takeda: '#e6dfcd', akazonae: '#8e2a1e', okudaira: '#e8e2d2',
  katabami: '#ece6d6', okubo: '#e8e2d2', onri: '#efe9da', furin: '#1f2a44',
  // 日本地図の諸家
  hojo: '#ece6d6', uesugi: '#ece6d6', mori: '#ece6d6', shimazu: '#ece6d6', date: '#ece6d6', sanada: '#9a2a20',
  toyotomi: '#e6dfcd', ishida: '#ece6d6', azai: '#ece6d6', asakura: '#ece6d6', chosokabe: '#ece6d6',
  otomo: '#ece6d6', satake: '#ece6d6', maeda: '#ece6d6', miyoshi: '#ece6d6', kuroda: '#ece6d6',
  // 関ヶ原・姉川の諸家
  todo: '#ece6d6', otani: '#ece6d6', kobayakawa: '#ece6d6', kyogoku: '#ece6d6', ii: '#a3281c', inaba: '#ece6d6', ukita: '#ece6d6',
  // 武将の陣羽織の紋
  akechi: '#ece6d6', honda: '#ece6d6', mizuno: '#ece6d6',
  // 織田家の諸将（柴田の二つ雁金・丹羽の直違・池田の揚羽蝶・森の鶴丸・佐々の棕櫚・滝川の丸に竪木瓜）
  kari: '#ece6d6', sujikai: '#ece6d6', ageha: '#ece6d6', tsuru: '#ece6d6', shuro: '#ece6d6', takigawa: '#ece6d6',
};


// 縦書きの字を並べる（旗印の文字）
function column(ctx, text, x, y0, y1, size) {
  ctx.font = `bold ${Math.round(size)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = [...text].length, step = (y1 - y0) / n;
  [...text].forEach((ch, i) => {
    // 筆のかすれ：少しずらして薄く重ねる
    ctx.globalAlpha = 0.35; ctx.fillText(ch, x + 0.8, y0 + step * (i + 0.5) + 0.6);
    ctx.globalAlpha = 1; ctx.fillText(ch, x, y0 + step * (i + 0.5));
  });
}

// ---------------- 家紋を描く小さな道具 ----------------
// 紋はすべて「半径 1 の丸」の中で描く（drawMon が紋の真ん中へ動かし、半径 r に広げる）。y は下向き
const INK = '#16140f';
const RING = 0.1;   // 「丸に〜」の丸の太さ（紋帳の並の丸）
const TAU = Math.PI * 2;

// 丸い点・丸（輪）・菱
function disk(g, x, y, rr) { g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
function ring(g, ro, t, x = 0, y = 0) { g.beginPath(); g.arc(x, y, ro, 0, TAU); g.arc(x, y, ro - t, 0, TAU, true); g.fill(); }
function rhomb(g, x, y, hw, hh) { g.beginPath(); g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y); g.closePath(); g.fill(); }
function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
// 左右が同じ形：右半分のベジェ（[c1x,c1y,c2x,c2y,x,y] の並び）を折り返して閉じる。始めと終わりは x=0 の上
function sym(start, segs) {
  const p = new Path2D(); p.moveTo(start[0], start[1]);
  for (const s of segs) p.bezierCurveTo(...s);
  const pts = [start, ...segs.map((s) => [s[4], s[5]])];
  for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i], to = pts[i]; p.bezierCurveTo(-s[2], s[3], -s[0], s[1], -to[0], to[1]); }
  p.closePath();
  return p;
}
// 置いて回して縮めてから描く（rot=0 は +y＝下向き、Math.PI で上向き）
function at(g, x, y, rot, s, fn) { g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); fn(); g.restore(); }
// 紋の中の字（半径 1 の中の大きさで）
function txt(g, s, x, y, size) {
  g.save(); g.scale(0.01, 0.01);
  g.font = `bold ${Math.round(size * 100)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x * 100, y * 100);
  g.restore();
}
// 筆の「一」：入りは斜めに、終わりは止めで少し膨らむ
function brushBar(g, x0, x1, y, t) {
  const p = new Path2D();
  p.moveTo(x0, y + t * 0.3);
  p.quadraticCurveTo(x0 + t * 0.1, y - t * 0.55, x0 + t * 0.7, y - t * 0.45);
  p.lineTo(x1 - t * 0.8, y - t * 0.55);
  p.quadraticCurveTo(x1 - t * 0.1, y - t * 0.95, x1 + t * 0.15, y - t * 0.1);
  p.quadraticCurveTo(x1 + t * 0.1, y + t * 0.5, x1 - t * 0.6, y + t * 0.45);
  p.lineTo(x0 + t * 0.5, y + t * 0.55);
  p.quadraticCurveTo(x0 + t * 0.05, y + t * 0.6, x0, y + t * 0.3);
  g.fill(p);
}

// 葵の葉：軸の付け根が中へ、葉先が外（+y）へ。付け根の両脇に耳（切れ込み）がある
const AOI = sym([0, 0.21], [[0.04, 0.12, 0.12, 0.08, 0.2, 0.11], [0.36, 0.17, 0.46, 0.32, 0.44, 0.47], [0.42, 0.63, 0.22, 0.75, 0, 0.88]]);
// 片喰の葉（ハート形）：尖りが中、くぼみが外
const KATA = sym([0, 0.04], [[0.1, 0.1, 0.44, 0.28, 0.43, 0.55], [0.42, 0.8, 0.14, 0.86, 0.06, 0.72], [0.04, 0.69, 0.01, 0.66, 0, 0.64]]);
// 花びら（唐花・花菱）：付け根が中、先に小さなくぼみ
const PETAL = sym([0, 0.06], [[0.09, 0.08, 0.17, 0.18, 0.15, 0.3], [0.13, 0.41, 0.05, 0.45, 0, 0.4]]);
// 剣（片喰・梅鉢・唐花の間に立つ細い刃）
const KEN = (() => { const p = new Path2D(); p.moveTo(-0.045, 0.12); p.lineTo(0.045, 0.12); p.lineTo(0.045, 0.64); p.lineTo(0, 0.94); p.lineTo(-0.045, 0.64); p.closePath(); return p; })();
// 笹・竹の葉（細長い葉）
const SASA = sym([0, 0], [[0.05, 0.05, 0.065, 0.2, 0.05, 0.3], [0.035, 0.37, 0.012, 0.41, 0, 0.44]]);

// 葉脈を地の色で抜く（付け根 (0,y0) から、各点へ少し膨らんで）
function veins(g, bg, y0, ends, lw) {
  g.strokeStyle = bg; g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath();
  for (const [x, y] of ends) { g.moveTo(0, y0); g.quadraticCurveTo(x * 0.25, (y0 + y) * 0.5 + 0.04, x, y); }
  g.stroke();
}
// 片喰：三枚の葉と、間の三本の軸。ken なら軸の代わりに剣
function katabami(g, ken) {
  for (let i = 0; i < 3; i++) at(g, 0, 0, Math.PI + i * TAU / 3, 1, () => g.fill(KATA));
  for (let i = 0; i < 3; i++) {
    at(g, 0, 0, i * TAU / 3, 1, () => {
      if (ken) g.fill(KEN);
      else { g.fillRect(-0.018, 0.05, 0.036, 0.5); disk(g, 0, 0.55, 0.035); }
    });
  }
}
// 木瓜：n 個の窠（丸を寄せた形）。lobes の丸を合わせた形を塗る
function mokkoPath(n, c, rho, a0) {
  const p = new Path2D();
  for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; p.moveTo(Math.cos(a) * c + rho, Math.sin(a) * c); p.arc(Math.cos(a) * c, Math.sin(a) * c, rho, 0, TAU); }
  return p;
}
// 木瓜一つ：外の窠（墨）・白・内の細い線・白、真ん中に唐花（花びら n 枚と剣）
function mokko(g, bg, n, a0, sx) {
  const c = n === 5 ? 0.45 : 0.42, rho = 1 - c;
  const P = mokkoPath(n, c, rho, a0);
  const layer = (s, col) => { g.save(); g.scale(s * sx, s); g.fillStyle = col; g.fill(P); g.restore(); };
  layer(1, INK); layer(0.89, bg); layer(0.83, INK); layer(0.77, bg);
  g.fillStyle = INK;
  const fs = n === 5 ? 1.3 : 1.2;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * TAU / n;
    at(g, 0, 0, a - Math.PI / 2, fs, () => g.fill(PETAL));
    at(g, 0, 0, a + Math.PI / n - Math.PI / 2, fs * 0.62, () => g.fill(KEN));
  }
  g.fillStyle = bg; disk(g, 0, 0, 0.1); g.fillStyle = INK; disk(g, 0, 0, 0.05);
}
// 花菱：四枚の花びらを菱の形に（横が長い）
function hanabishi(g, bg) {
  for (const [a, s] of [[0, 0.78], [Math.PI, 0.78], [Math.PI / 2, 1], [-Math.PI / 2, 1]]) at(g, 0, 0, a, 1, () => { g.scale(1, s); g.fill(KATA); });
  g.fillStyle = bg; disk(g, 0, 0, 0.07); g.fillStyle = INK;
}
// 藤の花：房に沿って小さな花（三日月の形）を左右に並べる。pts は房の筋 [x,y] の並び、size は根元の花の大きさ
function fujiRaceme(g, bg, pts, size, tipSize) {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
    const s = size + (tipSize - size) * (i / (n - 2));
    for (const sd of [-1, 1]) {
      const fx = x0 + (-ty) * sd * s * 0.95, fy = y0 + tx * sd * s * 0.95;
      g.fillStyle = INK; disk(g, fx, fy, s);
      g.fillStyle = bg; disk(g, fx + tx * s * 0.55 - ty * sd * s * 0.1, fy + ty * s * 0.55 + tx * sd * s * 0.1, s * 0.62);
    }
  }
  g.fillStyle = INK; const [ex, ey] = pts[n - 1]; disk(g, ex, ey, tipSize * 0.9);
}

// ---------------- 家紋（紋帳の形に合わせる） ----------------
// 各関数は (g, bg)。g は紋の真ん中が原点、半径 1。塗りは INK にしてある
const MON = {
  // 織田木瓜：五つの窠の中に唐花
  oda(g, bg) { mokko(g, bg, 5, -Math.PI / 2, 1); },
  // 永楽通宝：銭の縁と四角い穴の縁。字は上・下・右・左の順に「永樂通寶」
  eiraku(g, bg) {
    ring(g, 0.98, 0.12);
    g.fillRect(-0.27, -0.27, 0.54, 0.54); g.fillStyle = bg; g.fillRect(-0.17, -0.17, 0.34, 0.34); g.fillStyle = INK;
    txt(g, '永', 0, -0.57, 0.46); txt(g, '樂', 0, 0.59, 0.46); txt(g, '通', 0.58, 0.02, 0.46); txt(g, '寶', -0.58, 0.02, 0.46);
  },
  // 足利二つ引（今川）：丸の内を五つに等しく分け、二本目と四本目を墨に
  imagawa(g) {
    ring(g, 1, RING);
    g.save(); g.beginPath(); g.arc(0, 0, 1 - RING + 0.005, 0, TAU); g.clip();
    g.fillRect(-1, -0.54, 2, 0.36); g.fillRect(-1, 0.18, 2, 0.36); g.restore();
  },
  // 撫子（斎藤）：先がぎざぎざの花びら五枚、真ん中に蕊
  saito(g, bg) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5, hw = 0.56;
      g.beginPath(); g.moveTo(Math.cos(a - 0.3) * 0.2, Math.sin(a - 0.3) * 0.2);
      for (let k = 0; k <= 8; k++) { const b = a - hw + (k / 8) * hw * 2, rr = k % 2 ? 0.78 : 0.96; g.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
      g.lineTo(Math.cos(a + 0.3) * 0.2, Math.sin(a + 0.3) * 0.2); g.closePath(); g.fill();
    }
    g.fillStyle = bg; disk(g, 0, 0, 0.17); g.fillStyle = INK; disk(g, 0, 0, 0.08);
  },
  // 一文字（筆の一）
  ichimonji(g) { brushBar(g, -0.95, 0.9, 0, 0.3); },
  // 二つ雁金（柴田）：上下に並ぶ二羽の雁。広げた翼と、前へ伸ばした首
  kari(g) {
    for (const y of [-0.42, 0.38]) at(g, 0, y, 0, 0.9, () => {
      poly(g, [[-0.85, -0.05], [-0.35, -0.3], [-0.05, -0.05], [0.25, -0.32], [0.8, -0.1], [0.3, 0.02], [0.1, 0.2], [-0.25, 0.05]]);
      poly(g, [[-0.05, -0.05], [0.05, -0.45], [0.18, -0.55], [0.12, -0.35], [0.08, -0.05]]);
      disk(g, 0.15, -0.55, 0.07);
    });
  },
  // 直違（丹羽）：二本の太い棒を斜めに打ち違える
  sujikai(g) { at(g, 0, 0, Math.PI / 4, 1, () => g.fillRect(-0.95, -0.14, 1.9, 0.28)); at(g, 0, 0, -Math.PI / 4, 1, () => g.fillRect(-0.95, -0.14, 1.9, 0.28)); },
  // 揚羽蝶（池田）：横向きの蝶。大きな上の羽・小さな下の羽・胴と触角
  ageha(g, bg) {
    poly(g, [[-0.05, -0.1], [-0.55, -0.85], [-0.85, -0.55], [-0.7, -0.1], [-0.2, 0.05]]);
    poly(g, [[-0.05, 0.05], [-0.6, 0.15], [-0.75, 0.55], [-0.4, 0.75], [-0.1, 0.35]]);
    poly(g, [[0.05, -0.05], [0.55, -0.7], [0.75, -0.4], [0.3, 0.05]]);
    poly(g, [[0.05, 0.1], [0.45, 0.3], [0.35, 0.65], [0.1, 0.4]]);
    g.fillRect(-0.06, -0.35, 0.12, 0.85);
    g.fillStyle = bg; disk(g, -0.55, -0.45, 0.1); disk(g, -0.45, 0.45, 0.07); g.fillStyle = INK;
  },
  // 鶴丸（森）：翼を丸く広げた鶴。上に頭、下に尾
  tsuru(g, bg) {
    ring(g, 0.85, 0.22);
    g.fillStyle = bg; poly(g, [[-0.2, -0.9], [0.2, -0.9], [0.1, 0.9], [-0.1, 0.9]]); g.fillStyle = INK;
    disk(g, 0, -0.62, 0.13); g.fillStyle = '#9e2a1e'; disk(g, 0, -0.66, 0.06); g.fillStyle = INK;
    poly(g, [[-0.1, -0.5], [0.1, -0.5], [0.16, 0.5], [0, 0.7], [-0.16, 0.5]]);
  },
  // 棕櫚（佐々）：扇に開いた葉を三方へ
  shuro(g) {
    for (const [x, y, a] of [[0, -0.1, 0], [-0.45, 0.35, -0.9], [0.45, 0.35, 0.9]]) at(g, x, y, a, 0.62, () => {
      for (let i = 0; i < 9; i++) at(g, 0, 0.4, (i - 4) * 0.2, 1, () => poly(g, [[-0.05, 0], [0, -1.05], [0.05, 0]]));
      g.fillRect(-0.04, 0.35, 0.08, 0.55);
    });
  },
  // 丸に竪木瓜（滝川）：外の丸の中に、縦長の木瓜
  takigawa(g, bg) { ring(g, 0.92, 0.13); at(g, 0, 0, 0, 0.64, () => mokko(g, bg, 4, Math.PI / 4, 0.8)); },
  maru(g) { ring(g, 0.85, 0.17); },
  // 井桁（井伊）：菱に傾けた井の字。棒の端は外へ少し出る
  igeta(g) { igetaShape(g); },
  // 延暦寺：八輻の輪宝（天台の寺の旗。菊輪宝の菊はたしかでないので描かない）
  hikyaku(g, bg) {
    for (let i = 0; i < 8; i++) at(g, 0, 0, i * TAU / 8, 1, () => poly(g, [[-0.13, 0.68], [0, 1], [0.13, 0.68]]));
    ring(g, 0.8, 0.16);
    g.fillStyle = bg; ring(g, 0.72, 0.03); g.fillStyle = INK;
    for (let i = 0; i < 8; i++) at(g, 0, 0, i * TAU / 8 + TAU / 16, 1, () => poly(g, [[0, 0.2], [0.07, 0.42], [0, 0.66], [-0.07, 0.42]]));
    disk(g, 0, 0, 0.24); g.fillStyle = bg; ring(g, 0.19, 0.035); disk(g, 0, 0, 0.07);
  },
  // 丸に三つ葉葵（徳川）：葉先を外へ向けた三枚の葵。葉脈を白く抜き、軸は真ん中で合う
  tokugawa(g, bg) {
    ring(g, 1, RING);
    for (let i = 0; i < 3; i++) {
      at(g, 0, 0, Math.PI + i * TAU / 3, 1, () => {
        g.fillStyle = INK; g.fill(AOI);
        veins(g, bg, 0.23, [[0, 0.8], [0.16, 0.14], [0.31, 0.24], [0.38, 0.44], [0.27, 0.66], [-0.16, 0.14], [-0.31, 0.24], [-0.38, 0.44], [-0.27, 0.66]], 0.028);
        g.fillStyle = INK; g.fillRect(-0.032, 0, 0.064, 0.23);
      });
    }
    g.fillStyle = INK; disk(g, 0, 0, 0.06);
  },
  // 武田菱（割菱）：横に広い大菱を、辺に平行な筋で四つの菱に割る
  takeda(g) { const HW = 1, HH = 0.8, k = 0.86; for (const [x, y] of [[0, -HH / 2], [HW / 2, 0], [0, HH / 2], [-HW / 2, 0]]) rhomb(g, x, y, HW / 2 * k, HH / 2 * k); },
  // 赤備えは赤地に白の割菱
  akazonae(g) { g.fillStyle = '#efe6d2'; MON.takeda(g); },
  // 奥平団扇（軍配団扇）：団扇の輪郭と縁の線だけ（面の模様は確かでないので描かない）
  okudaira(g, bg) {
    const P = sym([0, -0.95], [[0.25, -0.92, 0.64, -0.72, 0.64, -0.32], [0.64, 0.06, 0.36, 0.28, 0.16, 0.36], [0.1, 0.4, 0.08, 0.44, 0, 0.46]]);
    g.fill(P); g.fillRect(-0.075, 0.38, 0.15, 0.52); disk(g, 0, 0.93, 0.09);
    g.save(); g.translate(0, -0.32); g.scale(0.84, 0.84); g.translate(0, 0.32); g.strokeStyle = bg; g.lineWidth = 0.035; g.stroke(P); g.restore();
    g.fillStyle = bg; disk(g, 0, 0.93, 0.035);
  },
  // 丸に片喰（酒井）
  katabami(g) { ring(g, 1, RING); katabami(g, false); },
  // 上り藤に大の字（大久保）：下の葉から左右の房が上へ伸び、上で向き合う
  okubo(g, bg) {
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + sd * (0.36 + k * 0.29); pts.push([Math.cos(a) * 0.76, Math.sin(a) * 0.76]); }
      fujiRaceme(g, bg, pts, 0.14, 0.07);
      // 根元の葉（三枚）
      g.fillStyle = INK;
      for (const [a, s] of [[-0.2, 0.75], [0.45, 0.7]]) at(g, sd * 0.2, 0.84, Math.PI + sd * a, s, () => g.fill(SASA));
    }
    g.fillStyle = INK; txt(g, '大', 0, 0.02, 0.9);
  },
  onri() {}, furin() {},   // 字の旗（drawMon の中で書く）
  // 北条鱗：正三角より平たい三つの鱗を、頂で接して山に積む
  hojo(g) { const b = 0.96, h = 0.6; for (const [x, y] of [[0, -h], [-b / 2, 0], [b / 2, 0]]) poly(g, [[x, y], [x + b / 2, y + h], [x - b / 2, y + h]]); },
  // 竹に雀（上杉笹）：竹の輪と笹の葉、向き合う二羽の雀（形は紋帳を簡略にした）
  uesugi(g, bg) {
    g.strokeStyle = INK; g.lineWidth = 0.075; g.lineCap = 'butt';
    for (const sd of [-1, 1]) { g.beginPath(); if (sd < 0) g.arc(0, 0, 0.8, Math.PI * 0.56, Math.PI * 1.62); else g.arc(0, 0, 0.8, Math.PI * 1.38, Math.PI * 0.44 + TAU); g.stroke(); }
    // 竹の節
    g.strokeStyle = bg; g.lineWidth = 0.022;
    for (const b of [0.2, 0.75, 2.4, 2.95, 3.6, 5.8]) { g.beginPath(); g.moveTo(Math.cos(b) * 0.75, Math.sin(b) * 0.75); g.lineTo(Math.cos(b) * 0.85, Math.sin(b) * 0.85); g.stroke(); }
    g.fillStyle = INK;
    // 笹の葉：輪のあちこちに三枚ずつ
    for (const [b, dir] of [[-2.05, 1], [-1.09, -1], [2.75, 1], [0.39, -1], [2.1, -1], [1.04, 1]]) {
      const x = Math.cos(b) * 0.8, y = Math.sin(b) * 0.8;
      for (const [o, s] of [[-0.55, 0.75], [0, 0.85], [0.55, 0.7]]) at(g, x, y, b - Math.PI / 2 + dir * (0.9 + o), s, () => g.fill(SASA));
    }
    // 二羽の雀（左は右向き、右は左向き）
    for (const sd of [-1, 1]) {
      g.save(); g.translate(sd * 0.3, 0.1); g.scale(-sd * 1.3, 1.3);
      g.beginPath(); g.ellipse(0, 0.04, 0.2, 0.13, -0.35, 0, TAU); g.fill();
      disk(g, 0.15, -0.1, 0.1);
      poly(g, [[0.23, -0.14], [0.33, -0.1], [0.23, -0.06]]);
      poly(g, [[-0.14, 0.08], [-0.34, 0.2], [-0.3, 0.1], [-0.36, 0.06]]);
      // 上げた翼（羽の先を三つに刻む）
      g.beginPath(); g.moveTo(0.02, -0.04); g.lineTo(-0.1, -0.44); g.lineTo(-0.04, -0.38); g.lineTo(0.02, -0.46); g.lineTo(0.07, -0.37); g.lineTo(0.14, -0.43); g.quadraticCurveTo(0.14, -0.14, 0.06, -0.02); g.closePath(); g.fill();
      g.fillStyle = bg; disk(g, 0.18, -0.12, 0.022); g.fillStyle = INK;
      g.restore();
    }
  },
  // 大一大万大吉（石田）
  ishida(g) { ring(g, 1, 0.08); txt(g, '大一', 0, -0.47, 0.46); txt(g, '大万', 0, 0, 0.46); txt(g, '大吉', 0, 0.47, 0.46); },
  // 結び雁金（真田）：上を向いた雁の頭と、結び目の形の翼（紋帳を簡略にした）
  sanada2(g, bg) {
    g.strokeStyle = INK; g.lineWidth = 0.13; g.lineJoin = 'round';
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(0, -0.18);
      g.bezierCurveTo(sd * 0.3, -0.62, sd * 0.95, -0.62, sd * 0.86, -0.12);
      g.bezierCurveTo(sd * 0.8, 0.24, sd * 0.3, 0.18, 0, 0.02); g.stroke();
      g.beginPath(); g.moveTo(0, 0.1);
      g.bezierCurveTo(sd * 0.2, 0.3, sd * 0.62, 0.36, sd * 0.56, 0.66);
      g.bezierCurveTo(sd * 0.5, 0.9, sd * 0.18, 0.82, sd * 0.1, 0.62); g.stroke();
    }
    g.beginPath(); g.ellipse(0, -0.02, 0.16, 0.26, 0, 0, TAU); g.fill();
    disk(g, 0, -0.42, 0.14); poly(g, [[-0.06, -0.52], [0, -0.78], [0.06, -0.52]]);
    g.fillStyle = bg; disk(g, 0.05, -0.45, 0.028);
  },
  // 一文字に三つ星（毛利）
  mori(g) { brushBar(g, -0.9, 0.84, -0.62, 0.3); for (const [x, y] of [[0, -0.02], [-0.31, 0.52], [0.31, 0.52]]) disk(g, x, y, 0.28); },
  // 丸に十字（島津）：太い十字が丸に届く
  shimazu(g) { ring(g, 1, 0.14); g.fillRect(-0.9, -0.1, 1.8, 0.2); g.fillRect(-0.1, -0.9, 0.2, 1.8); },
  // 竪三引両（伊達）：丸の内を七つに分け、二・四・六本目を墨に
  date(g) {
    ring(g, 1, RING);
    const d = (2 - RING * 2) / 7;
    g.save(); g.beginPath(); g.arc(0, 0, 1 - RING + 0.005, 0, TAU); g.clip();
    for (const k of [1, 3, 5]) g.fillRect(-1 + RING + k * d, -1, d, 2);
    g.restore();
  },
  // 扇に月丸（佐竹）：五本骨の扇に、白く抜いた丸
  satake(g, bg) {
    const py = 0.62, A = 0.9;
    g.beginPath(); g.arc(0, py, 1.52, -Math.PI / 2 - A, -Math.PI / 2 + A); g.arc(0, py, 0.66, -Math.PI / 2 + A, -Math.PI / 2 - A, true); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.06;
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 - A + i * A / 2; g.beginPath(); g.moveTo(0, py); g.lineTo(Math.cos(a) * 0.7, py + Math.sin(a) * 0.7); g.stroke(); }
    g.strokeStyle = bg; g.lineWidth = 0.02;
    for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 - A + i * A / 4; g.beginPath(); g.moveTo(Math.cos(a) * 0.7, py + Math.sin(a) * 0.7); g.lineTo(Math.cos(a) * 1.48, py + Math.sin(a) * 1.48); g.stroke(); }
    g.fillStyle = bg; disk(g, 0, py - 1.08, 0.3);
    g.fillStyle = INK; disk(g, 0, py, 0.08); g.fillStyle = bg; disk(g, 0, py, 0.03);
  },
  // 六文銭（真田）：穴あき銭を三つずつ二段に
  sanada(g, bg) { for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.64, y = i < 3 ? -0.33 : 0.33; g.fillStyle = '#1a1612'; disk(g, x, y, 0.29); g.fillStyle = bg; g.fillRect(x - 0.09, y - 0.09, 0.18, 0.18); } },
  // 五七桐（豊臣）：左右に五つ、中に七つの花の房。下に葉脈のある桐の葉三枚
  toyotomi(g, bg) {
    const LEAF = sym([0, 0], [[0.2, -0.02, 0.37, 0.12, 0.37, 0.36], [0.37, 0.6, 0.2, 0.78, 0, 1]]);
    const leafAt = (x, y, rot, s) => at(g, x, y, rot, s, () => {
      g.fillStyle = INK; g.fill(LEAF);
      g.strokeStyle = bg; g.lineWidth = 0.05; g.stroke(LEAF);
      g.lineWidth = 0.035; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0.1); g.lineTo(0, 0.88);
      for (const t of [0.25, 0.45, 0.65]) for (const sd of [-1, 1]) { g.moveTo(0, t); g.quadraticCurveTo(sd * 0.14, t + 0.04, sd * 0.26, t + 0.14); }
      g.stroke();
    });
    leafAt(-0.08, 0.1, 1.05, 0.78); leafAt(0.08, 0.1, -1.05, 0.78); leafAt(0, 0.02, 0, 0.92);
    g.fillStyle = INK;
    // 花：小さな三つ裂けの鐘の形
    const FL = (() => { const p = new Path2D(); p.moveTo(-0.045, 0); p.quadraticCurveTo(-0.08, -0.06, -0.065, -0.12); p.lineTo(-0.03, -0.09); p.lineTo(0, -0.14); p.lineTo(0.03, -0.09); p.lineTo(0.065, -0.12); p.quadraticCurveTo(0.08, -0.06, 0.045, 0); p.closePath(); return p; })();
    const stalk = (x, top, n) => {
      g.fillRect(x - 0.015, top, 0.03, -top - 0.05);
      at(g, x, top + 0.04, 0, 1.5, () => g.fill(FL));
      for (let k = 0; k < (n - 1) / 2; k++) for (const sd of [-1, 1]) at(g, x + sd * 0.04, top + 0.2 + k * 0.16, sd * 0.8, 1.5, () => g.fill(FL));
    };
    stalk(0, -0.97, 7); stalk(-0.5, -0.78, 5); stalk(0.5, -0.78, 5);
  },
  // 三つ盛亀甲に花菱（浅井）：三つの亀甲を蜂の巣のように寄せ、それぞれに花菱
  azai(g, bg) {
    const s = 0.5, y1 = 0.375, dx = Math.sqrt(3) / 2 * s;
    const hex = (x, y, rr) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    const cs = [[0, y1 - 1.5 * s], [-dx, y1], [dx, y1]];
    for (const [x, y] of cs) { g.fillStyle = INK; hex(x, y, s); }
    for (const [x, y] of cs) { g.fillStyle = bg; hex(x, y, s - 0.1); }
    g.fillStyle = INK;
    for (const [x, y] of cs) at(g, x, y, 0, 0.4, () => hanabishi(g, bg));
  },
  // 三つ盛木瓜（朝倉）
  asakura(g, bg) { for (const [x, y] of [[0, -0.46], [-0.5, 0.42], [0.5, 0.42]]) at(g, x, y, 0, 0.47, () => mokko(g, bg, 4, Math.PI / 4, 1.12)); },
  // 抱き杏葉（大友）：向き合う二枚の杏葉（形は紋帳を簡略にした）
  otomo(g, bg) {
    for (const sd of [-1, 1]) {
      g.save(); g.scale(sd, 1);
      const P = new Path2D(); P.moveTo(0.06, -0.92);
      P.bezierCurveTo(-0.5, -0.8, -0.9, -0.3, -0.78, 0.2); P.bezierCurveTo(-0.68, 0.62, -0.3, 0.84, -0.06, 0.86);
      P.bezierCurveTo(-0.28, 0.6, -0.4, 0.3, -0.36, 0); P.bezierCurveTo(-0.32, -0.4, -0.16, -0.7, 0.06, -0.92); P.closePath();
      g.fill(P);
      g.strokeStyle = bg; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.02, -0.8); g.bezierCurveTo(-0.5, -0.5, -0.66, 0.1, -0.2, 0.76);
      for (const t of [-0.5, -0.2, 0.1, 0.4]) { g.moveTo(-0.5 - t * 0.1, t); g.lineTo(-0.72 + Math.abs(t) * 0.1, t - 0.08); g.moveTo(-0.5 - t * 0.1, t); g.lineTo(-0.38, t - 0.1); }
      g.stroke(); g.restore();
    }
  },
  // 藤巴（黒田）：一つの藤の房が巴に巻く。頭に葉
  kuroda(g, bg) {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16, a = -Math.PI / 2 + 0.25 + t * Math.PI * 1.75, rr = 0.72 - t * 0.5; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    fujiRaceme(g, bg, pts, 0.16, 0.06);
    g.fillStyle = INK;
    for (const [a, s] of [[-2.4, 0.95], [-1.8, 1.05], [-1.2, 0.9]]) at(g, -0.04, -0.74, a, s, () => g.fill(SASA));
    g.strokeStyle = INK; g.lineWidth = 0.05; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.quadraticCurveTo(0.05, -0.8, -0.02, -0.76); g.stroke();
  },
  // 七つ片喰（長宗我部）：真ん中に一つ、まわりに六つ
  chosokabe(g) {
    at(g, 0, 0, 0, 0.36, () => katabami(g, false));
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; at(g, Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0, 0.33, () => katabami(g, false)); }
  },
  // 加賀梅鉢（前田）：五つの丸い花びら、間に剣、真ん中の蕊に白い輪
  maeda(g, bg) {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; disk(g, Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.3); }
    for (let i = 0; i < 5; i++) at(g, 0, 0, i * TAU / 5, 1, () => { g.fillStyle = INK; g.fill(KEN); });
    disk(g, 0, 0, 0.26); g.fillStyle = bg; ring(g, 0.19, 0.035); g.fillStyle = INK;
  },
  // 三階菱（三好）：下ほど大きな菱を三つ重ねる（上の菱の縁を白く抜いて分ける）
  miyoshi(g, bg) {
    for (const [y, hw, hh] of [[0.5, 0.96, 0.4], [-0.06, 0.72, 0.31], [-0.55, 0.48, 0.22]]) {
      g.fillStyle = bg; rhomb(g, 0, y, hw + 0.08, hh + 0.05);
      g.fillStyle = INK; rhomb(g, 0, y, hw, hh);
    }
  },
  // 藤堂蔦：五つに尖った蔦の葉一枚、葉脈を白く、下に茎
  todo(g, bg) {
    const P = sym([0, -0.92], [[0.1, -0.7, 0.22, -0.5, 0.25, -0.4], [0.42, -0.52, 0.7, -0.52, 0.84, -0.36], [0.78, -0.16, 0.56, -0.04, 0.46, 0.04], [0.62, 0.12, 0.72, 0.3, 0.68, 0.44], [0.46, 0.62, 0.14, 0.52, 0, 0.3]]);
    g.fill(P);
    veins(g, bg, 0.26, [[0, -0.74], [0.62, -0.34], [-0.62, -0.34], [0.54, 0.36], [-0.54, 0.36]], 0.035);
    g.strokeStyle = INK; g.lineWidth = 0.07; g.lineCap = 'butt'; g.beginPath(); g.moveTo(0, 0.26); g.quadraticCurveTo(0.03, 0.6, 0.1, 0.95); g.stroke();
  },
  // 対い蝶（大谷）：向き合う二匹の揚羽（形は紋帳を簡略にした）
  otani(g, bg) {
    for (const sd of [-1, 1]) {
      g.save(); g.translate(sd * 0.46, 0.05); g.scale(-sd, 1);
      const UP = new Path2D(); UP.moveTo(0.1, -0.04); UP.bezierCurveTo(-0.1, -0.5, -0.46, -0.8, -0.5, -0.6); UP.bezierCurveTo(-0.52, -0.36, -0.36, -0.14, -0.02, 0.02); UP.closePath();
      const LO = new Path2D(); LO.moveTo(0, 0.04); LO.bezierCurveTo(-0.4, 0.06, -0.52, 0.34, -0.36, 0.56); LO.bezierCurveTo(-0.28, 0.44, -0.18, 0.5, -0.14, 0.62); LO.bezierCurveTo(0.02, 0.4, 0.06, 0.2, 0.06, 0.08); LO.closePath();
      g.fillStyle = INK; g.fill(UP); g.fill(LO);
      g.strokeStyle = bg; g.lineWidth = 0.028; g.lineCap = 'round'; g.beginPath();
      for (const [x, y] of [[-0.44, -0.6], [-0.44, -0.34], [-0.26, -0.14]]) { g.moveTo(0.04, -0.02); g.lineTo(x * 0.85, y * 0.85); }
      for (const [x, y] of [[-0.4, 0.3], [-0.24, 0.48]]) { g.moveTo(0.02, 0.08); g.lineTo(x * 0.85, y * 0.85); }
      g.stroke();
      g.fillStyle = INK; g.beginPath(); g.ellipse(0.14, 0.02, 0.07, 0.26, 0.5, 0, TAU); g.fill();
      disk(g, 0.28, -0.22, 0.06);
      g.strokeStyle = INK; g.lineWidth = 0.022; g.beginPath(); g.moveTo(0.3, -0.26); g.quadraticCurveTo(0.34, -0.5, 0.2, -0.62); g.moveTo(0.32, -0.24); g.quadraticCurveTo(0.46, -0.44, 0.4, -0.58); g.stroke();
      g.restore();
    }
  },
  // 違い鎌（小早川）：柄を交えた二本の鎌、刃は外へ反る
  kobayakawa(g) {
    for (const sd of [-1, 1]) {
      g.save(); g.scale(sd, 1); g.rotate(0.62);
      g.fillRect(-0.055, -0.3, 0.11, 1.2);
      g.fillRect(-0.075, -0.36, 0.15, 0.1);
      const B = new Path2D(); B.moveTo(-0.06, -0.34); B.bezierCurveTo(-0.1, -0.78, 0.42, -0.98, 0.8, -0.7);
      B.bezierCurveTo(0.46, -0.78, 0.12, -0.7, 0.06, -0.34); B.closePath(); g.fill(B);
      g.restore();
    }
  },
  // 平四つ目結（京極）：四角い目結を四つ、田の字に
  kyogoku(g, bg) { for (const x of [-0.44, 0.44]) for (const y of [-0.44, 0.44]) { g.fillStyle = INK; g.fillRect(x - 0.38, y - 0.38, 0.76, 0.76); g.fillStyle = bg; g.fillRect(x - 0.15, y - 0.15, 0.3, 0.3); } },
  // 井伊の旗：赤地に金の井桁
  ii(g) { g.fillStyle = '#d8b24a'; igetaShape(g); },
  // 折敷に三文字（稲葉）：隅を切った角の縁（太い線と細い線）、中に「三」
  inaba(g, bg) {
    const oct = (q, c) => { g.beginPath(); g.moveTo(-q + c, -q); g.lineTo(q - c, -q); g.lineTo(q, -q + c); g.lineTo(q, q - c); g.lineTo(q - c, q); g.lineTo(-q + c, q); g.lineTo(-q, q - c); g.lineTo(-q, -q + c); g.closePath(); g.fill(); };
    g.fillStyle = INK; oct(0.92, 0.3); g.fillStyle = bg; oct(0.8, 0.26); g.fillStyle = INK; oct(0.75, 0.24); g.fillStyle = bg; oct(0.71, 0.23);
    g.fillStyle = INK;
    brushBar(g, -0.4, 0.38, -0.34, 0.13); brushBar(g, -0.3, 0.28, -0.02, 0.12); brushBar(g, -0.52, 0.5, 0.34, 0.14);
  },
  // 剣片喰（宇喜多）
  ukita(g) { at(g, 0, 0, 0, 0.8, () => katabami(g, false)); for (let i = 0; i < 3; i++) at(g, 0, 0, i * TAU / 3, 1, () => g.fill(KEN)); },
  // 桔梗（明智）：先の尖った花びら五枚、筋と蕊を白く抜く。明智の水色桔梗なので水色で
  akechi(g, bg) {
    const P = sym([0, 0.1], [[0.1, 0.12, 0.34, 0.3, 0.36, 0.58], [0.37, 0.74, 0.22, 0.8, 0.14, 0.82], [0.08, 0.86, 0.03, 0.92, 0, 0.99]]);
    g.fillStyle = '#4f7fa6';
    for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => g.fill(P));
    g.strokeStyle = bg; g.lineWidth = 0.03; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => { g.beginPath(); g.moveTo(0, 0.34); g.lineTo(0, 0.82); g.stroke(); });
    g.fillStyle = bg; disk(g, 0, 0, 0.2);
    g.fillStyle = '#4f7fa6'; for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => { g.fillRect(-0.018, 0.04, 0.036, 0.13); disk(g, 0, 0.17, 0.035); });
  },
  // 丸に立葵（本多）：立った茎に葵の葉三枚と、蕾（形は紋帳を簡略にした）
  honda(g, bg) {
    ring(g, 1, RING);
    g.fillRect(-0.035, -0.4, 0.07, 1.25);
    const leaf = (x, y, rot, s) => at(g, x, y, rot, s, () => {
      g.fillStyle = INK; g.fill(AOI);
      veins(g, bg, 0.23, [[0, 0.8], [0.31, 0.24], [0.38, 0.44], [0.27, 0.66], [-0.31, 0.24], [-0.38, 0.44], [-0.27, 0.66]], 0.03);
    });
    leaf(0, -0.2, Math.PI, 0.8);
    leaf(-0.02, 0.2, Math.PI / 2 + 0.35, 0.72); leaf(0.02, 0.2, -Math.PI / 2 - 0.35, 0.72);
    g.fillStyle = INK;
    for (const sd of [-1, 1]) {
      g.save(); g.translate(sd * 0.3, 0.6);
      g.beginPath(); g.moveTo(-sd * 0.3, 0.04); g.quadraticCurveTo(-sd * 0.12, 0.02, 0, 0); g.lineWidth = 0.035; g.strokeStyle = INK; g.stroke();
      disk(g, 0, -0.02, 0.11); poly(g, [[-0.1, 0.02], [0, -0.22], [0.1, 0.02]]);
      g.fillStyle = bg; g.fillRect(-0.012, -0.12, 0.024, 0.14); g.fillStyle = INK;
      g.restore();
    }
  },
  // 沢瀉（水野）：真ん中に矢じりの形の葉、左右に細い葉、間に小さな白い花の房
  mizuno(g, bg) {
    const ARROW = sym([0, -0.95], [[0.12, -0.8, 0.3, -0.55, 0.28, -0.2], [0.27, 0.02, 0.36, 0.14, 0.42, 0.26], [0.26, 0.2, 0.1, 0.08, 0.03, 0.1]]);
    g.fillStyle = INK;
    at(g, -0.42, 0.26, -0.42, 0.7, () => g.fill(ARROW)); at(g, 0.42, 0.26, 0.42, 0.7, () => g.fill(ARROW));
    g.strokeStyle = bg; g.lineWidth = 0.06; g.stroke(ARROW); g.fillStyle = INK; g.fill(ARROW);
    g.strokeStyle = bg; g.lineWidth = 0.03; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -0.8); g.lineTo(0, 0.08); g.stroke();
    g.fillStyle = INK; g.fillRect(-0.035, 0.08, 0.07, 0.82);
    for (const sd of [-1, 1]) {
      g.strokeStyle = INK; g.lineWidth = 0.035; g.beginPath(); g.moveTo(0, 0.8); g.quadraticCurveTo(sd * 0.3, 0.5, sd * 0.62, -0.5); g.stroke();
      for (const [t, k] of [[-0.5, 1], [-0.25, 0.9], [0, 0.8], [0.22, 0.7]]) {
        const x = sd * (0.62 - (t + 0.5) * 0.28), y = t;
        for (const o of [-1, 1]) { g.fillStyle = INK; disk(g, x + o * 0.09 * k, y, 0.075 * k); g.fillStyle = bg; disk(g, x + o * 0.09 * k, y, 0.03 * k); }
      }
    }
  },
};
// 井桁：井の字を 45 度に倒し、少し平たくして菱の形に
function igetaShape(g) {
  g.save(); g.scale(1.2, 0.96); g.rotate(Math.PI / 4);
  for (const d of [-0.28, 0.28]) { g.fillRect(d - 0.09, -0.6, 0.18, 1.2); g.fillRect(-0.6, d - 0.09, 1.2, 0.18); }
  g.restore();
}

export function drawMon(ctx, kind, w, h) {
  const bg = FLAG_BG[kind] || '#ddd';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.32, r = w * 0.34;
  if (kind === 'onri') {
    // 家康の旗印「厭離穢土欣求浄土」：白地に墨で二行
    ctx.fillStyle = '#14110d';
    column(ctx, '厭離穢土', w * 0.68, h * 0.05, h * 0.95, w * 0.36);
    column(ctx, '欣求浄土', w * 0.32, h * 0.05, h * 0.95, w * 0.36);
  } else if (kind === 'furin') {
    // 武田の孫子の旗（風林火山）：紺地に金の字で二行
    ctx.fillStyle = '#d8b24a';
    column(ctx, '疾如風徐如林', w * 0.7, h * 0.04, h * 0.96, w * 0.28);
    column(ctx, '侵掠如火不動如山', w * 0.3, h * 0.04, h * 0.96, w * 0.26);
  } else if (MON[kind]) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(r, r);
    ctx.fillStyle = INK; ctx.strokeStyle = INK;
    MON[kind](ctx, bg);
    ctx.restore();
  }
  // 乳（旗竿を通す輪）の影
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(0, 0, w * 0.06, h);
}

export function flagTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  // 近くで見ても紙のように見えないよう、前の倍の細かさで描く（汚しの位置は前と同じ 128×256 の座標で置く）
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  drawMon(g, kind, W, H);
  let seed = 0; for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // 織り目：細かな縦糸と横糸（明暗がごくわずかに揺らぐ）
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.03})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,255,255,${0.015 + rnd() * 0.025})`; g.fillRect(x, 0, 1, H); }
  // 染めのむら：大きくゆるい濃淡
  for (let i = 0; i < 10; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 90, d = rnd() < 0.5;
    const sg = g.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, d ? 'rgba(30,24,16,0.07)' : 'rgba(255,250,236,0.06)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.save(); g.scale(W / 128, H / 256);
  // 竿から垂れた布の皺：縦に波打つ陰と照り（竿から遠いほど、裾ほど深い）
  // 布の波打ちは形（units.js の旗の揺れ）が光で見せるので、絵の皺はごく薄く、間の不揃いな大きい襞だけにする（規則正しい縞は近くで描いた縞に見える）
  const fold = []; { let a = 0, v = 0; for (let x = 0; x < 128; x++) { v += (rnd() - 0.5) * 0.09; v *= 0.93; a += 0.05 + v; fold.push(a); } }
  for (let x = 4; x < 128; x += 1) {
    const w = (Math.sin(fold[x] + 0.8) * 0.75 + Math.sin(fold[x] * 2.3 + 2.1) * 0.25) * 0.4;
    const k = 0.35 + x / 128 * 0.65;
    const fg = g.createLinearGradient(0, 0, 0, 256);
    const col = w > 0 ? '255,250,238' : '20,16,10';
    const a = Math.abs(w) * (w > 0 ? 0.07 : 0.12) * k;
    fg.addColorStop(0, `rgba(${col},${a * 0.35})`); fg.addColorStop(1, `rgba(${col},${a})`);
    g.fillStyle = fg; g.fillRect(x, 0, 1, 256);
  }
  // 日に焼けた褪せ：上ほど色が抜けて灰がかる
  const sun = g.createLinearGradient(0, 0, 0, 140); sun.addColorStop(0, 'rgba(200,196,184,0.18)'); sun.addColorStop(1, 'rgba(200,196,184,0)');
  g.fillStyle = sun; g.fillRect(0, 0, 128, 140);
  // 裾の汚れ（土ぼこりが染みて黄土色にくすむ）
  const gr = g.createLinearGradient(0, 150, 0, 256); gr.addColorStop(0, 'rgba(90,72,46,0)'); gr.addColorStop(1, 'rgba(90,72,46,0.34)');
  g.fillStyle = gr; g.fillRect(0, 150, 128, 106);
  // 泥はね：裾の近くに、ごく細かな飛沫（近くで見ても水玉に見えないよう小さく薄く）
  for (let i = 0; i < 70; i++) { const x = rnd() * 128, y = 205 + rnd() * rnd() * 51 * -1 + 51, r = 0.25 + rnd() * rnd() * 0.9; g.fillStyle = `rgba(62,48,30,${0.1 + rnd() * 0.16})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  // 雨じみ：縁の濃い、薄い輪
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 128, y = rnd() * 256, r = 4 + rnd() * 12;
    const sg = g.createRadialGradient(x, y, r * 0.6, x, y, r); sg.addColorStop(0, 'rgba(60,48,30,0.02)'); sg.addColorStop(0.85, 'rgba(60,48,30,0.07)'); sg.addColorStop(1, 'rgba(60,48,30,0)');
    g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = 'rgba(40,30,20,0.35)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 256);
  g.restore();
  // 縁のほつれ（竿と反対の端）
  for (let y = 0; y < H; y += 5) if (rnd() < 0.3) g.clearRect(W - 2 - rnd() * 5, y, 5, 2 + rnd() * 7);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

// 陣幕（今川の二つ引両）
// mon を渡すと、白い幅の真ん中に家紋を染め抜く（一枚の幅ごとに一つ）
export function jinmakuTexture(mon) {
  const key = 'jinmaku' + (mon || '');
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  // 近くで見ても粗くならないよう倍の細かさで描く（描く座標は前と同じ 256×64）
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#e6dfcf'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1a1712';
  g.fillRect(0, 14, 256, 9); g.fillRect(0, 36, 256, 9);
  if (mon) {
    // 家紋を別に描いて、中の白い幅へ小さく写す
    const m = document.createElement('canvas'); m.width = 128; m.height = 256;
    drawMon(m.getContext('2d'), mon, 128, 256);
    g.save(); g.beginPath(); g.arc(128, 29.5, 6.2, 0, 7); g.clip();
    g.drawImage(m, 20, 38, 88, 88, 121.5, 23, 13, 13);
    g.restore();
  }
  // 布の縫い目（幅ごと）と、織り目・裾の汚れ
  g.fillStyle = 'rgba(0,0,0,.12)';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 64);
  for (let y = 0; y < 64; y += 1) { g.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.02})`; g.fillRect(0, y, 256, 0.5); }
  for (let x = 0; x < 256; x += 1) { g.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.02})`; g.fillRect(x, 0, 0.5, 64); }
  // 風雨にさらされた布：ゆるい染みと、縫い目に沿った汚れ
  for (let i = 0; i < 8; i++) { const x = Math.random() * 256, y = Math.random() * 64, r = 6 + Math.random() * 16; const sg = g.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, 'rgba(70,56,36,0.06)'); sg.addColorStop(1, 'rgba(70,56,36,0)'); g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const gr = g.createLinearGradient(0, 44, 0, 64); gr.addColorStop(0, 'rgba(70,56,36,0)'); gr.addColorStop(1, 'rgba(70,56,36,0.3)');
  g.fillStyle = gr; g.fillRect(0, 44, 256, 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
