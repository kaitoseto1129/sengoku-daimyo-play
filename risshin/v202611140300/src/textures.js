import * as THREE from 'three';
import { astcRetry } from './astc_rt.js';

// 旗・指物の家紋をキャンバスで描く
const cache = new Map();
export function sharedFlagResources() { return cache; }

const FLAG_BG = {
  oda: '#cdac50', eiraku: '#cdac50', imagawa: '#e8e2d2', saito: '#dfe3e6',
  ichimonji: '#ece6d6', maru: '#ece6d6', igeta: '#ece6d6', hikyaku: '#e8e2d2', kuyo: '#ece6d6',
  // 長篠編
  tokugawa: '#ebe5d4', takeda: '#e6dfcd', akazonae: '#8e2a1e', okudaira: '#e8e2d2',
  katabami: '#ece6d6', okubo: '#e8e2d2', onri: '#efe9da', furin: '#1f2a44', sakakibara: '#efe9da',
  // 日本地図の諸家
  hojo: '#ece6d6', uesugi: '#ece6d6', mori: '#ece6d6', shimazu: '#ece6d6', date: '#ece6d6', sanada: '#9a2a20',
  uesugi_bi: '#ece6d6', uesugi_ryu: '#ece6d6',
  toyotomi: '#e6dfcd', kiri53: '#e6dfcd', ishida: '#ece6d6', azai: '#ece6d6', asakura: '#ece6d6', chosokabe: '#ece6d6',
  otomo: '#ece6d6', satake: '#ece6d6', maeda: '#ece6d6', miyoshi: '#ece6d6', kuroda: '#ece6d6',
  // 関ヶ原・姉川の諸家
  todo: '#ece6d6', otani: '#ece6d6', kobayakawa: '#ece6d6', wakisaka: '#ece6d6', kyogoku: '#ece6d6', ii: '#a3281c', inaba: '#ece6d6', ukita: '#ece6d6', konishi: '#ece6d6',
  // 武将の陣羽織の紋
  akechi: '#ece6d6', honda: '#ece6d6', mizuno: '#ece6d6', kanamori: '#ece6d6',
  // 織田家の諸将（柴田の二つ雁金・丹羽の直違・池田の揚羽蝶・森の鶴丸・佐々の棕櫚・滝川の丸に竪木瓜）
  kari: '#ece6d6', sujikai: '#ece6d6', ageha: '#ece6d6', tsuru: '#ece6d6', shuro: '#ece6d6', takigawa: '#ece6d6',
  // 稲生の信勝方（林美作守の勢）：信勝は弾正忠家。林家の紋は伝わらないので、主の信勝の木瓜を白地に（信長方の金地と分ける）
  nobukatsu: '#ece6d6',
  hachisuka: '#ece6d6', manji: '#ece6d6', kitabatake: '#ece6d6', sakuma: '#ece6d6', hori: '#ece6d6',
  kuki: '#ece6d6', asano: '#ece6d6', horio: '#ece6d6', narita: '#ece6d6', akadori: '#ece6d6', kashiwa: '#ece6d6', kuginuki: '#ece6d6', umebachi: '#ece6d6',
  honganji: '#ece6d6', sagarifuji: '#ece6d6', ikko: '#ece6d6', namu: '#ece6d6',
  // 明石全登の手（キリシタンの組）の花クルス
  kurusu: '#ece6d6', rokkaku: '#ece6d6',
};

// 家ごとの染め色は、遠くで軍を見分けるための遊び用。史実の旗色の復元ではない。
// 緑・紫・橙は出さない（物差し 四3。11/6 共通の係：長久手の揚羽蝶の紫・徳川の緑・長宗我部の緑ほかを黒・茶・鼠へ）
// 紋の地色とは分け、陣羽織や地図が使う紋の切り出しには染め色を混ぜない。
const FLAG_DYE = {
  oda: '#cdac50', eiraku: '#cdac50', imagawa: '#9f2846', saito: '#4a4440',
  azai: '#3c4048', asakura: '#6a5240', takeda: '#ba3825', tokugawa: '#3a3a38',
  honganji: '#5a4a40', sagarifuji: '#5a4a40', ikko: '#98663b', namu: '#98663b',
  mori: '#3a3834', uesugi: '#5b5448', akechi: '#8a7a55',
  hojo: '#bca25c', shimazu: '#5e5a4e', date: '#55524a', sanada: '#9a2a20', sanada2: '#9a2a20',
  toyotomi: '#8a6418', kiri53: '#8a6418', ishida: '#4a4a52', chosokabe: '#3e3c36', otomo: '#7a6448',   // 11/8 critic60（十5・樫井）：生成りの地に淡い金で、遠目に紋の無い白い板に見えた。濃い金茶に（11/8：この注が石田・長宗我部・大友の色を消していたので行末へ移した）
  satake: '#8b772b', maeda: '#6a4a48', miyoshi: '#685348', kuroda: '#343331',
  todo: '#6e6a5a', otani: '#504a46', kobayakawa: '#a58b44', wakisaka: '#5a6a78', kyogoku: '#76685a', konishi: '#6d5a48',
  ii: '#a3281c', inaba: '#5a5446', ukita: '#7a5a44', akazonae: '#8e2a1e',
  okudaira: '#40484a', katabami: '#827548', okubo: '#5e5a4c',
  kari: '#855534', sujikai: '#4a4840', ageha: '#3a3836', tsuru: '#6a6152', nobukatsu: '#6e5e4c',
  shuro: '#4c5550', takigawa: '#8c7a52', hachisuka: '#ad8239', manji: '#3b3632', honda: '#46443f', mizuno: '#6e6052',
  ichimonji: '#76736a', maru: '#927c63', kitabatake: '#927c63', igeta: '#4e4c44', hikyaku: '#6e5a48', kuyo: '#3c3a36', asano: '#3a4a6a', horio: '#5a5446', narita: '#4a4e5a', akadori: '#9f2846', kashiwa: '#4e4a40', kuginuki: '#5a4e44', umebachi: '#46443f', kurusu: '#4a4640', rokkaku: '#4a4640',
};


const hexRgb = (s) => { const n = parseInt(String(s).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

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
  // 遠目でも窠（外の縁）と唐花（真ん中）が分かるよう、内の線を太め、唐花との白い間も広めにする（近くの大きさはそのまま）
  layer(1, INK); layer(0.89, bg); layer(0.80, INK); layer(0.70, bg);
  g.fillStyle = INK;
  const fs = (n === 5 ? 1.3 : 1.2) * 0.86;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * TAU / n;
    at(g, 0, 0, a - Math.PI / 2, fs, () => g.fill(PETAL));
    at(g, 0, 0, a + Math.PI / n - Math.PI / 2, fs * 0.62, () => g.fill(KEN));
  }
  g.fillStyle = bg; disk(g, 0, 0, 0.1); g.fillStyle = INK; disk(g, 0, 0, 0.05);
}
// 花菱：四枚の花びらを菱の形に（横が長い）
function hanabishi(g, bg, ink = INK) {
  g.fillStyle = ink;
  for (const [a, s] of [[0, 0.78], [Math.PI, 0.78], [Math.PI / 2, 1], [-Math.PI / 2, 1]]) at(g, 0, 0, a, 1, () => { g.scale(1, s); g.fill(KATA); });
  g.fillStyle = bg; disk(g, 0, 0, 0.07); g.fillStyle = ink;
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
function kiriMon(g, bg, nc, ns, tc, ts) {
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
  stalk(0, tc, nc); stalk(-0.5, ts, ns); stalk(0.5, ts, ns);
}

const MON = {
  // 小雑賀川の既存の烏を孫一専用の紋へ共用。ほかの隊の旗の描き方は保つ。
  // 旗印伝承と復元範囲：docs/generals_look_1108/鈴木孫一.md。
  '孫一の八咫烏'(g, bg) {
    g.beginPath(); g.ellipse(0, .05, .5, .36, -.2, 0, TAU); g.fill();
    disk(g, .42, -.36, .2);
    g.beginPath(); g.moveTo(.58, -.42); g.lineTo(.9, -.34); g.lineTo(.58, -.28); g.closePath(); g.fill();
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(-.1, -.1);
      g.quadraticCurveTo(-.5, -.9 * (sd > 0 ? 1 : .8), -.95, -.55 + sd * .1);
      g.quadraticCurveTo(-.55, -.2, -.2, .2); g.closePath(); g.fill();
    }
    g.beginPath(); g.moveTo(-.45, .2); g.lineTo(-.95, .5); g.lineTo(-.5, .36); g.closePath(); g.fill();
    g.lineWidth = .07;
    for (const dx of [-.12, .04, .2]) {
      g.beginPath(); g.moveTo(dx, .35); g.lineTo(dx - .05, .85); g.stroke();
    }
    g.fillStyle = bg; disk(g, .48, -.4, .05);
  },
  // 高山家の七曜。山崎・賤ヶ岳の旗は家紋による復元（当日の染色・配列は未確認）。
  ukon_nanayo(g) {
    disk(g, 0, 0, .22);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      disk(g, Math.sin(a) * .65, Math.cos(a) * .65, .22);
    }
  },
  // 榊原家の源氏車。所用具足の金具に合わせる八輻の輪郭の略復元。
  genjiguruma(g) {
    g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = .10;
    for (const r of [.19, .77, .91]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8; g.beginPath();
      g.moveTo(Math.cos(a) * .19, Math.sin(a) * .19);
      g.lineTo(Math.cos(a) * .77, Math.sin(a) * .77); g.stroke();
    }
    g.restore();
  },
  // 今川の赤鳥（馬の垢を取る櫛。Commons「Japanese crest Imagawa Akadori.svg」の形）：上に穴のある三つ葉の摘み、丸い背、先の尖った七本の歯。赤で染める
  akadori(g, bg) {
    g.fillStyle = '#a3261c';
    for (const [x, y, r] of [[0, -0.58, 0.17], [-0.22, -0.55, 0.13], [0.22, -0.55, 0.13]]) disk(g, x, y, r);
    g.fillRect(-0.16, -0.5, 0.32, 0.2);
    g.beginPath(); g.moveTo(-0.79, 0.28); g.lineTo(-0.79, 0.08); g.bezierCurveTo(-0.79, -0.3, -0.4, -0.4, 0, -0.4); g.bezierCurveTo(0.4, -0.4, 0.79, -0.3, 0.79, 0.08); g.lineTo(0.79, 0.28); g.closePath(); g.fill();
    const tw = (1.58 - 6 * 0.06) / 7;
    for (let i = 0; i < 7; i++) { const x0 = -0.79 + i * (tw + 0.06); g.beginPath(); g.moveTo(x0, 0.26); g.lineTo(x0 + tw, 0.26); g.lineTo(x0 + tw, 0.72); g.lineTo(x0 + tw / 2, 0.82); g.lineTo(x0, 0.72); g.closePath(); g.fill(); }
    g.fillStyle = bg; disk(g, 0, -0.6, 0.06); g.fillStyle = INK;
  },
  // 成田氏の月下三引両（ウィキペディア「忍城の戦い」の紋の図・Commons「月下三引两纹.jpg」）：上に右下の厚い三日月、下に横三本
  narita(g, bg) {
    g.beginPath(); g.arc(0, -0.2, 0.62, 0, TAU); g.fill();
    g.fillStyle = bg; g.beginPath(); g.arc(-0.08, -0.3, 0.53, 0, TAU); g.fill(); g.fillStyle = INK;
    for (const y of [0.37, 0.57, 0.78]) g.fillRect(-0.7, y, 1.4, 0.14);
  },
  // 堀尾家の分銅（両の脇を丸く抉った秤の錘。上下の縁はまっすぐ、四隅は丸める）。今福の堀尾忠晴の鉄砲衆（k09_imafuku）
  horio(g, bg) {
    g.beginPath(); g.moveTo(-0.5, -0.66); g.lineTo(0.5, -0.66); g.quadraticCurveTo(0.62, -0.66, 0.62, -0.5);
    g.bezierCurveTo(0.18, -0.36, 0.18, 0.36, 0.62, 0.5); g.quadraticCurveTo(0.62, 0.66, 0.5, 0.66); g.lineTo(-0.5, 0.66); g.quadraticCurveTo(-0.62, 0.66, -0.62, 0.5);
    g.bezierCurveTo(-0.18, 0.36, -0.18, -0.36, -0.62, -0.5); g.quadraticCurveTo(-0.62, -0.66, -0.5, -0.66); g.closePath(); g.fill();
    g.fillStyle = bg; g.fillRect(-0.36, -0.035, 0.72, 0.07);   // 腰の細い白い筋（紋帳の分銅の境）
  },
  // 山内家の丸に三つ柏（紋帳の三つ柏：上に一枚、左右下に二枚の柏の葉を軸で合わせ、葉の縁は波の切れ込み・中に葉脈）。川田の山内一豊（k02_kawada）
  kashiwa(g, bg) {
    g.lineWidth = 0.1; g.strokeStyle = INK; g.beginPath(); g.arc(0, 0, 0.93, 0, TAU); g.stroke();
    const leaf = new Path2D();
    leaf.moveTo(0, 0);
    for (const sd of [1, -1]) {
      leaf.moveTo(0, 0);
      for (let k = 0; k < 4; k++) { const y0 = -0.06 - k * 0.15, y1 = y0 - 0.15, w = 0.26 - Math.abs(k - 1.4) * 0.05; leaf.quadraticCurveTo(sd * (w + 0.06), (y0 + y1) / 2, sd * w * 0.72, y1); }
      leaf.quadraticCurveTo(sd * 0.1, -0.74, 0, -0.78);
    }
    for (let i = 0; i < 3; i++) at(g, 0, 0.04, i * TAU / 3, 1, () => {
      g.fillStyle = INK; g.fill(leaf);
      g.strokeStyle = bg; g.lineWidth = 0.035; g.beginPath(); g.moveTo(0, -0.06); g.lineTo(0, -0.68);
      for (const t of [-0.22, -0.38, -0.54]) for (const sd of [-1, 1]) { g.moveTo(0, t); g.lineTo(sd * 0.13, t - 0.09); }
      g.stroke();
    });
  },
  // 一柳家の釘抜（座金の四角に四角い穴。紋帳の「釘抜」）。川田の一柳直盛（k02_kawada）
  // 六角（佐々木）の隅立て四つ目結：四つの目結（中を抜いた菱）を菱に並べる（箕作で戦の側に描いていた形を共通へ。11/6 共通の係）
  rokkaku(g) {
    const P = new Path2D();
    const sq = (cx, cy, r) => { P.moveTo(cx, cy - r); P.lineTo(cx + r, cy); P.lineTo(cx, cy + r); P.lineTo(cx - r, cy); P.closePath(); };
    for (const [cx, cy] of [[0, -0.48], [0.48, 0], [0, 0.48], [-0.48, 0]]) { sq(cx, cy, 0.44); sq(cx, cy, 0.19); }
    g.fill(P, 'evenodd');
  },
  kuginuki(g, bg) {
    g.fillRect(-0.66, -0.66, 1.32, 1.32);
    g.fillStyle = bg; g.fillRect(-0.24, -0.24, 0.48, 0.48); g.fillStyle = INK;
  },
  // 筒井家の梅鉢（五つの丸い花びらと真ん中の丸、間に五本の蕊。紋帳の「梅鉢」）。信貴山の筒井順慶（shigisan）
  umebachi(g, bg) {
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5; disk(g, Math.sin(a) * 0.56, -Math.cos(a) * 0.56, 0.32); }
    g.fillStyle = bg; disk(g, 0, 0, 0.27);
    g.strokeStyle = bg; g.lineWidth = 0.07; g.beginPath();
    for (let i = 0; i < 5; i++) { const a = (i + 0.5) * TAU / 5; g.moveTo(Math.sin(a) * 0.2, -Math.cos(a) * 0.2); g.lineTo(Math.sin(a) * 0.52, -Math.cos(a) * 0.52); }
    g.stroke();
    g.fillStyle = INK; disk(g, 0, 0, 0.17);
  },
  // 九鬼家の左三つ巴。鳥羽市『鳥羽城と九鬼嘉隆』第二章の巴紋を参考にする。
  // https://www.city.toba.mie.jp/material/files/group/70/03tobajyoukukiyoshitaka.pdf
  kuki(g) {
    for (let i = 0; i < 3; i++) at(g, 0, 0, i * TAU / 3, 1, () => {
      g.beginPath();
      g.moveTo(0, -.96);
      g.bezierCurveTo(-.75, -.94, -.98, -.3, -.56, .04);
      g.bezierCurveTo(-.25, .28, .17, -.04, -.03, -.32);
      g.bezierCurveTo(-.28, -.67, -.28, -.78, 0, -.96);
      g.closePath(); g.fill();
    });
  },
  // 北畠の笹竜胆。三つの花と五枚の葉を簡略化。松阪市掲載の大河内地区資料による。
  // https://www.city.matsusaka.mie.jp/uploaded/attachment/68548.pdf
  kitabatake(g, bg) {
    g.strokeStyle = INK; g.lineWidth = 0.055; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0.65); g.lineTo(0, -0.56);
    for (const sd of [-1, 1]) { g.moveTo(0, 0.48); g.quadraticCurveTo(sd * 0.48, 0.1, sd * 0.5, -0.28); }
    g.stroke();
    for (const [x, y] of [[0, -0.64], [-0.5, -0.36], [0.5, -0.36]]) {
      at(g, x, y, 0, 0.3, () => {
        for (let i = 0; i < 5; i++) at(g, 0, 0, i * TAU / 5, 2, () => g.fill(PETAL));
        g.fillStyle = bg; disk(g, 0, 0, 0.12);
      });
    }
    for (const rot of [-1.15, -0.6, 0, 0.6, 1.15]) at(g, 0, 0.2, rot, 1.8, () => {
      g.fillStyle = INK; g.fill(SASA);
      g.strokeStyle = bg; g.lineWidth = 0.012;
      g.beginPath(); g.moveTo(0, 0.09); g.lineTo(0, 0.35); g.stroke();
    });
  },
  // 織田木瓜：五つの窠の中に唐花
  oda(g, bg) { mokko(g, bg, 5, -Math.PI / 2, 1); },
  nobukatsu(g, bg) { mokko(g, bg, 5, -Math.PI / 2, 1); },
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
  // 佐久間信盛：丸の内に三引両（岐阜市の家紋解説）。輪の内側に三本を収める。
  sakuma(g) {
    ring(g, 1, RING);
    g.save(); g.beginPath(); g.arc(0, 0, 1 - RING, 0, TAU); g.clip();
    for (const y of [-0.62, -0.12, 0.38]) g.fillRect(-1, y, 2, 0.24);
    g.restore();
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
  // 二つ雁金（柴田）：上下に並ぶ二羽の雁。三枚の風切りで反った翼、胴と尾、右へ曲げた首と頭（紋帳の雁金の形）
  kari(g, bg) { for (const [x, y] of [[-0.07, -0.47], [0.07, 0.5]]) at(g, x, y, 0, 0.68, () => goose(g, bg)); },
  // 直違（丹羽）：二本の太い棒を斜めに打ち違える
  sujikai(g) { at(g, 0, 0, Math.PI / 4, 1, () => g.fillRect(-0.95, -0.14, 1.9, 0.28)); at(g, 0, 0, -Math.PI / 4, 1, () => g.fillRect(-0.95, -0.14, 1.9, 0.28)); },
  // 遊びの旗は糸輪の形にする。墨俣での実際の旗印を復元した物ではない。
  hachisuka(g) {
    g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = 0.09;
    for (const r of [0.69, 0.84]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  },
  // 丸に卍（蜂須賀。慶長の阿波徳島の蜂須賀家の紋。木津川口などで def.flagEra の hachisuka をこれに替える）：太い丸の内に左卍（上の腕は左へ、右の腕は上へ折れる）
  manji(g) {
    ring(g, 0.94, 0.12);
    const t = 0.11, a = 0.52;
    g.fillRect(-t, -a, 2 * t, 2 * a); g.fillRect(-a, -t, 2 * a, 2 * t);
    g.fillRect(-a, -a, a + t, 2 * t); g.fillRect(a - 2 * t, -a, 2 * t, a + t);
    g.fillRect(-t, a - 2 * t, a + t, 2 * t); g.fillRect(-a, -t, 2 * t, a + t);
  },
  // 揚羽蝶（池田）：横から見た蝶。手前の大きな上の羽と尾のある下の羽、奥の羽を小さく。筋と斑を白く抜き、胴の周りを細く白で縁取る
  ageha(g, bg) {
    g.beginPath(); g.moveTo(0.15, -0.2); g.bezierCurveTo(-0.1, -0.55, -0.55, -0.95, -0.92, -0.78); g.bezierCurveTo(-1.0, -0.6, -0.9, -0.35, -0.78, -0.22);
    g.lineTo(-0.64, -0.18); g.lineTo(-0.52, -0.07); g.bezierCurveTo(-0.35, -0.02, -0.15, 0.05, 0.05, 0.02); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.02, 0.08); g.bezierCurveTo(-0.3, 0.05, -0.72, 0.15, -0.72, 0.42); g.bezierCurveTo(-0.72, 0.6, -0.55, 0.7, -0.44, 0.66);
    g.lineTo(-0.4, 0.95); g.lineTo(-0.3, 0.66); g.bezierCurveTo(-0.15, 0.6, -0.05, 0.4, -0.02, 0.28); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.22, -0.15); g.bezierCurveTo(0.45, -0.5, 0.7, -0.62, 0.85, -0.5); g.bezierCurveTo(0.95, -0.35, 0.75, -0.12, 0.25, 0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.1, 0.15); g.bezierCurveTo(0.4, 0.15, 0.6, 0.3, 0.55, 0.48); g.bezierCurveTo(0.5, 0.6, 0.3, 0.55, 0.08, 0.3); g.closePath(); g.fill();
    g.strokeStyle = bg; g.lineWidth = 0.028; g.lineCap = 'round';
    for (const [x, y] of [[-0.86, -0.66], [-0.8, -0.36], [-0.58, -0.86], [-0.6, -0.1]]) { g.beginPath(); g.moveTo(0.02, -0.04); g.quadraticCurveTo((x + 0.02) / 2, (y - 0.04) / 2 - 0.08, x * 0.9, y * 0.9); g.stroke(); }
    for (const [x, y] of [[-0.62, 0.4], [-0.42, 0.58]]) { g.beginPath(); g.moveTo(0, 0.14); g.lineTo(x * 0.92, y * 0.92); g.stroke(); }
    g.fillStyle = bg; disk(g, -0.66, -0.6, 0.07); disk(g, -0.56, 0.42, 0.05); disk(g, 0.62, -0.42, 0.045);
    // 胴と頭・触角
    g.save(); g.translate(0.08, 0.05); g.rotate(0.45); g.beginPath(); g.ellipse(0, 0, 0.075, 0.5, 0, 0, TAU);
    g.lineWidth = 0.07; g.stroke(); g.fillStyle = INK; g.fill(); g.restore();
    disk(g, 0.33, -0.46, 0.085);
    g.strokeStyle = INK; g.lineWidth = 0.03;
    for (const [cx, cy, x, y] of [[0.28, -0.75, 0.24, -0.92], [0.5, -0.7, 0.66, -0.82]]) { g.beginPath(); g.moveTo(0.33, -0.5); g.quadraticCurveTo(cx, cy, x, y); g.stroke(); disk(g, x, y, 0.04); }
  },
  // 鶴丸（森）：左右の翼で丸を作り、上に丹頂の頭、下に尾羽。風切りの筋を白く抜く
  tsuru(g, bg) {
    const a0 = -Math.PI / 2 + 0.34, a1 = Math.PI / 2 - 0.24;
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      g.beginPath(); g.arc(0, 0, 0.95, a0, a1); g.arc(0, 0, 0.6, a1 - 0.06, a0 + 0.14, true); g.closePath(); g.fill();
      g.strokeStyle = bg; g.lineWidth = 0.035;
      for (const a of [0.45, 0.78, 1.1]) { g.beginPath(); g.moveTo(Math.cos(a) * 0.63, Math.sin(a) * 0.63); g.lineTo(Math.cos(a + 0.14) * 0.97, Math.sin(a + 0.14) * 0.97); g.stroke(); }
      g.restore();
    }
    g.beginPath(); g.ellipse(0, 0.16, 0.2, 0.34, 0, 0, TAU); g.fill();
    g.fillRect(-0.05, -0.62, 0.1, 0.52);
    disk(g, 0, -0.71, 0.13);
    poly(g, [[-0.08, -0.74], [-0.36, -0.66], [-0.08, -0.63]]);
    poly(g, [[-0.2, 0.42], [-0.12, 0.84], [0, 0.6], [0.12, 0.84], [0.2, 0.42]]);
    g.fillStyle = '#7e3427'; disk(g, 0.01, -0.79, 0.06);
    g.fillStyle = bg; disk(g, -0.04, -0.72, 0.022); g.fillStyle = INK;
  },
  // 棕櫚（佐々）：扇に開いた葉を三方へ
  shuro(g) {
    for (const [x, y, a] of [[0, -0.1, 0], [-0.45, 0.35, -0.9], [0.45, 0.35, 0.9]]) at(g, x, y, a, 0.62, () => {
      for (let i = 0; i < 9; i++) at(g, 0, 0.4, (i - 4) * 0.2, 1, () => poly(g, [[-0.05, 0], [0, -1.05], [0.05, 0]]));
      g.fillRect(-0.04, 0.35, 0.08, 0.55);
    });
  },
  // 丸に竪木瓜（滝川）：外の丸の中に、縦長の木瓜
  takigawa(g, bg) {
    ring(g, 0.92, 0.13);
    at(g, 0, 0, 0, 0.64, () => {
      // 外の窠だけでなく唐花と剣も一緒に縦長へ。外丸は真円のまま残す。
      g.scale(0.8, 1);
      mokko(g, bg, 4, Math.PI / 4, 1);
    });
  },
  // 大滝寺の一益の陣羽織：時代祭の立四窠紋を参考に、外丸のない竪木瓜で補う。
  // 当日の所用品の写しではない。隊旗の丸に竪木瓜とは分ける。
  takigawa_haori(g, bg) {
    at(g, 0, 0, 0, 0.9, () => {
      g.scale(0.8, 1);
      mokko(g, bg, 4, Math.PI / 4, 1);
    });
  },
  maru(g) { ring(g, 0.85, 0.17); },
  // 妙行寺伝来の清正の背旗。太い輪の蛇の目。
  janome(g) { ring(g, 0.85, 0.4); },
  // 九曜（細川忠興）：大きな丸を八つの小さな丸が囲む
  kuyo(g) { disk(g, 0, 0, 0.34); for (let i = 0; i < 8; i++) disk(g, Math.cos(i * TAU / 8) * 0.68, Math.sin(i * TAU / 8) * 0.68, 0.2); },
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
  // 丸に違い鷹の羽（浅野）：外の丸の中に、二枚の鷹の羽を斜めに打ち違える。羽の筋と斑を白く抜く（同じ名が二つあり後の方だけ効いていたので一つに。11/6 共通の係）
  asano(g, bg) {
    ring(g, 0.94, 0.12);
    for (const s of [1, -1]) at(g, 0, 0, s * 0.62, 1, () => {
      g.fillStyle = INK; g.beginPath(); g.moveTo(0, -0.78); g.bezierCurveTo(0.2, -0.6, 0.2, 0.3, 0.12, 0.5); g.lineTo(-0.12, 0.5); g.bezierCurveTo(-0.2, 0.3, -0.2, -0.6, 0, -0.78); g.fill();
      g.fillRect(-0.025, 0.45, 0.05, 0.3);
      g.strokeStyle = bg; g.lineWidth = 0.03;
      g.beginPath(); g.moveTo(0, -0.7); g.lineTo(0, 0.48); g.stroke();
      for (const y of [-0.42, -0.14, 0.14]) { g.beginPath(); g.moveTo(-0.15, y + 0.1); g.lineTo(0, y); g.lineTo(0.15, y + 0.1); g.stroke(); }
    });
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
  // 武田の花菱（割菱も伝わるが、この旗は花菱で揃える）
  // 甲府市：https://www.city.kofu.yamanashi.jp/senior/kamejii/027.html
  // 武田菱（割菱）：大きな菱を四つに割った形。細い隙間を残して四つの菱を並べる
  takeda(g) { for (const [x, y] of [[0, -0.45], [-0.52, 0], [0.52, 0], [0, 0.45]]) rhomb(g, x, y, 0.49, 0.42); },
  // 山県の赤備え：赤地に白の花菱。井伊の後世の赤備えとは分ける
  akazonae(g, bg) { hanabishi(g, bg, '#efe6d2'); },
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
  onri() {}, furin() {}, namu() {}, ikko() {},   // 字の旗（drawMon の中で書く）
  // 本願寺の下り藤。旗・指物・陣羽織で同じ絵を使う
  // 本願寺：https://www.hongwanji.or.jp/info/reiki_int/reiki_honbun/x034RG00000162.html
  sagarifuji(g, bg) {
    g.strokeStyle = INK; g.lineWidth = 0.07; g.lineCap = 'round';
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(0, -0.62);
      g.bezierCurveTo(sd * 0.38, -0.94, sd * 0.94, -0.56, sd * 0.72, -0.18);
      g.stroke();
      const pts = [];
      for (let k = 0; k <= 7; k++) pts.push([sd * (0.72 - k * 0.075), -0.22 + k * 0.15]);
      fujiRaceme(g, bg, pts, 0.14, 0.045);
      g.fillStyle = INK;
      for (const a of [-0.55, 0.55]) at(g, sd * 0.04, -0.62, Math.PI + sd * a, 0.7, () => g.fill(SASA));
    }
  },
  honganji(g, bg) { MON.sagarifuji(g, bg); },
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
  // 花クルス（明石全登の手）：腕の先が三つの丸に開く十字。丸は付けない
  kurusu(g) {
    g.fillRect(-0.1, -0.62, 0.2, 1.24); g.fillRect(-0.62, -0.1, 1.24, 0.2);
    for (const [x, y] of [[0, -0.72], [0, 0.72], [-0.72, 0], [0.72, 0]]) {
      disk(g, x, y, 0.13);
      disk(g, x + (y ? 0.14 : 0),y + (x ? 0.14 : 0), 0.1); disk(g, x - (y ? 0.14 : 0), y - (x ? 0.14 : 0), 0.1);
    }
  },
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
  sanada(g, bg, col = '#1a1612') { for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.64, y = i < 3 ? -0.33 : 0.33; g.fillStyle = col; disk(g, x, y, 0.29); g.fillStyle = bg; g.fillRect(x - 0.09, y - 0.09, 0.18, 0.18); } },
  // 五七桐（豊臣）：左右に五つ、中に七つの花の房。下に葉脈のある桐の葉三枚
  toyotomi(g, bg) { kiriMon(g, bg, 7, 5, -0.97, -0.78); },
  // 五三桐（天正十三年の関白の前の羽柴の旗。中に五つ、左右に三つの花の房）
  kiri53(g, bg) { kiriMon(g, bg, 5, 3, -0.9, -0.72); },
  // 久政の寿像（持明院）の交差した櫂。長政の亀甲とは別の紋。旗への転用は復元案。
  hisamasa_kai(g) {
    for (const a of [-Math.PI / 4, Math.PI / 4]) {
      at(g, 0, 0, a, 1, () => {
        g.fillRect(-0.045, -0.9, 0.09, 1.25);
        g.beginPath(); g.moveTo(-0.045, 0.18); g.lineTo(-0.16, 0.42);
        g.lineTo(-0.16, 0.88); g.quadraticCurveTo(0, 1.02, 0.16, 0.88);
        g.lineTo(0.16, 0.42); g.lineTo(0.045, 0.18); g.closePath(); g.fill();
      });
    }
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
  // 堀秀政も三つ盛亀甲に花菱。同じ紋の描画を共用し、浅井家の旗色は借りない。
  // https://blog.livedoor.jp/jidai2005/archives/57811288.html
  hori(g, bg) { MON.azai(g, bg); },
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
  // 裏梅鉢（金森）：花の裏側を表す五本の萼。前田の剣梅鉢とは分ける。
  // 飛騨高山旅ガイドの金森家の紋を参考にした描画。細部の寸法は復元案。
  // https://www.hidatakayama.or.jp/special/detail_345.html
  kanamori(g) {
    g.strokeStyle = INK; g.lineWidth = 0.075;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5, x = Math.cos(a), y = Math.sin(a);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(x * 0.66, y * 0.66); g.stroke();
      disk(g, x * 0.66, y * 0.66, 0.29);
    }
    disk(g, 0, 0, 0.19);
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
  // 輪違い（脇坂）：横に並べた二つの輪を交える
  wakisaka(g) { ring(g, 0.56, 0.15, -0.36, 0); ring(g, 0.56, 0.15, 0.36, 0); },
  // 中結び祇園守（小西）：斜めに交えた二本の守り札（両端に巻きの白い線）、交わる所を結びで留める
  konishi(g, bg) {
    for (const sd of [-1, 1]) {
      g.save(); g.rotate(sd * 0.62); g.fillStyle = INK; g.fillRect(-0.15, -0.9, 0.3, 1.8);
      g.fillStyle = bg; for (const y of [-0.74, -0.64, 0.64, 0.74]) g.fillRect(-0.15, y - 0.02, 0.3, 0.04);
      g.restore();
    }
    g.fillStyle = bg; disk(g, 0, 0, 0.3); g.fillStyle = INK; ring(g, 0.26, 0.08);
    g.save(); g.rotate(Math.PI / 4); g.fillRect(-0.06, -0.42, 0.12, 0.84); g.fillRect(-0.42, -0.06, 0.84, 0.12); g.restore();
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
  akechi(g, bg, col = '#4f7fa6') {
    const P = sym([0, 0.1], [[0.1, 0.12, 0.34, 0.3, 0.36, 0.58], [0.37, 0.74, 0.22, 0.8, 0.14, 0.82], [0.08, 0.86, 0.03, 0.92, 0, 0.99]]);
    g.fillStyle = col;
    for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => g.fill(P));
    g.strokeStyle = bg; g.lineWidth = 0.03; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => { g.beginPath(); g.moveTo(0, 0.34); g.lineTo(0, 0.82); g.stroke(); });
    g.fillStyle = bg; disk(g, 0, 0, 0.2);
    g.fillStyle = col; for (let i = 0; i < 5; i++) at(g, 0, 0, Math.PI + i * TAU / 5, 1, () => { g.fillRect(-0.018, 0.04, 0.036, 0.13); disk(g, 0, 0.17, 0.035); });
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
// 雁金の一羽（半径 1 の中）：翼は下の縁から先へ反り、先に三枚の風切りの切れ込み
function goose(g, bg) {
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 0.08, 0.12);
    g.bezierCurveTo(s * 0.4, 0.2, s * 0.78, 0.02, s * 0.98, -0.42);
    g.lineTo(s * 0.8, -0.3); g.lineTo(s * 0.83, -0.52); g.lineTo(s * 0.65, -0.34); g.lineTo(s * 0.64, -0.54);
    g.bezierCurveTo(s * 0.5, -0.3, s * 0.3, -0.1, s * 0.1, -0.04); g.closePath(); g.fill();
  }
  g.beginPath(); g.ellipse(0, 0.12, 0.15, 0.24, 0, 0, TAU); g.fill();
  poly(g, [[-0.11, 0.28], [0, 0.54], [0.11, 0.28]]);
  g.strokeStyle = INK; g.lineWidth = 0.1; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -0.02); g.bezierCurveTo(0, -0.3, 0.08, -0.48, 0.2, -0.58); g.stroke();
  disk(g, 0.24, -0.62, 0.11);
  poly(g, [[0.31, -0.7], [0.48, -0.64], [0.31, -0.56]]);
  g.fillStyle = bg; disk(g, 0.25, -0.65, 0.026); g.fillStyle = INK;
}
// 井桁：井の字を 45 度に倒し、少し平たくして菱の形に
function igetaShape(g) {
  g.save(); g.scale(1.2, 0.96); g.rotate(Math.PI / 4);
  for (const d of [-0.28, 0.28]) { g.fillRect(d - 0.09, -0.6, 0.18, 1.2); g.fillRect(-0.6, d - 0.09, 1.2, 0.18); }
  g.restore();
}

// 寄せの染め分けは遊び用の復元。旗の数・将の名を史実として増やさない。
export function yoseFlagKinds(family) {
  return family === 'takeda' ? ['yose_takeda_red', 'yose_takeda_orange', 'yose_takeda_black', 'takeda', 'furin', 'yose_takeda_red']
    : Array(6).fill('yose_' + family);
}
export function yoseFlagTexture(family) {
  if (family !== 'takeda') return flagTexture(family);
  const key = 'yose_atlas_' + family;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 1536; c.height = 512;
  const g = c.getContext('2d');
  yoseFlagKinds(family).forEach((kind, i) => g.drawImage(settleFlag(flagTexture(kind)).image, i * 256, 0));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // 各旗の縁に隣の色がにじまないよう、幟の絵は同じ一枚から読む。
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.userData.mon = family; t.userData.astcAlpha = true;   // iPhone：一枚一枚の旗と同じく RGBA の ASTC で（透けるので印が無いと読み出しを三度捨てていた）
  cache.set(key, t); return t;
}

// 本の復元図どおりの家の旗（K291）。同じ紋を縦に三つ連ねる幟・地色・紋の色。紋の関数は MON を使い回す
const monAt = (ctx, kind, x, y, r, bg, ...rest) => { ctx.save(); ctx.translate(x, y); ctx.scale(r, r); ctx.fillStyle = INK; ctx.strokeStyle = INK; MON[kind](ctx, bg, ...rest); ctx.restore(); };
const fillBg = (ctx, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); };
const SHIRO = '#ece6d6';
const BOOK_FLAG = {
  // 織田：黄地に黒の永楽通宝を縦に三つ（紋の木瓜は胴と陣笠に残す）
  oda(ctx, w, h, nobori) { fillBg(ctx, w, h, '#cdac50'); const cx = w * (nobori ? 0.54 : 0.5); for (const y of [.2, .5, .8]) monAt(ctx, 'eiraku', cx, h * y, Math.min(w * .3, h * .13), '#cdac50'); },
  // 今川：白地に黒の二引両と五七桐（流れ旗）。丸は付けない
  imagawa(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); const cx = w * (nobori ? 0.54 : 0.5); ctx.fillStyle = INK; ctx.fillRect(w * .12, h * .16, w * .76, h * .07); ctx.fillRect(w * .12, h * .30, w * .76, h * .07); monAt(ctx, 'toyotomi', cx, h * .64, w * .3, SHIRO); },
  // 斎藤：白地に黒の二頭立波（向き合う二つの波頭）
  saito(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); const cx = w * (nobori ? 0.54 : 0.5), r = w * .4; ctx.save(); ctx.translate(cx, h * .34); ctx.scale(r, r); ctx.fillStyle = INK;
    // 二頭立波：左右から立ち上がる二つの波。外側から内へ巻く波頭、下に太い波の胴、頭の先に三つの飛沫
    for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1);
      ctx.beginPath(); ctx.moveTo(0.02, 0.98); ctx.bezierCurveTo(0.55, 0.98, 0.95, 0.75, 0.98, 0.3); ctx.bezierCurveTo(1.0, -0.15, 0.8, -0.5, 0.45, -0.72);
      ctx.bezierCurveTo(0.25, -0.84, 0.1, -0.78, 0.08, -0.62); ctx.bezierCurveTo(0.06, -0.48, 0.2, -0.42, 0.3, -0.5); ctx.bezierCurveTo(0.22, -0.3, 0.1, -0.3, 0.02, -0.34);
      ctx.bezierCurveTo(0.14, -0.1, 0.55, -0.2, 0.6, 0.1); ctx.bezierCurveTo(0.64, 0.4, 0.45, 0.62, 0.02, 0.66); ctx.closePath(); ctx.fill();
      // 波頭の巻きの内側の抜き（白）
      ctx.fillStyle = SHIRO; ctx.beginPath(); ctx.arc(0.2, -0.6, 0.075, 0, TAU); ctx.fill(); ctx.fillStyle = INK;
      // 飛沫
      for (const [x, y, rr] of [[0.62, -0.82, 0.07], [0.78, -0.66, 0.06], [0.9, -0.46, 0.05]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); }
      ctx.restore(); }
    ctx.restore(); },
  // 浅井：白地に黒の井桁（本の想像復元）
  azai(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); monAt(ctx, 'igeta', w * (nobori ? 0.54 : 0.5), h * .34, w * .4, SHIRO); },
  // 朝倉：白地に赤の三つ盛木瓜を縦に三つ
  asakura(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); const cx = w * (nobori ? 0.54 : 0.5); for (const y of [.2, .5, .8]) { ctx.save(); ctx.translate(cx, h * y); const r = Math.min(w * .3, h * .13); ctx.scale(r, r); ctx.fillStyle = '#a52b24'; for (const [x, yy] of [[0, -0.46], [-0.5, 0.42], [0.5, 0.42]]) at(ctx, x, yy, 0, 0.47, () => mokkoPath && (ctx.fillStyle = '#a52b24', ctx.fill(mokkoPath(4, 0.42, 0.58, Math.PI / 4)))); ctx.restore(); } },
  // 徳川：白地に黒の三つ葉葵を縦に三つ
  tokugawa(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); const cx = w * (nobori ? 0.54 : 0.5); for (const y of [.2, .5, .8]) monAt(ctx, 'tokugawa', cx, h * y, Math.min(w * .3, h * .13), SHIRO); },
  // 武田：赤地に黒の花菱を縦に連ねた陣旗（孫子の旗 furin は別）
  takeda(ctx, w, h, nobori) { fillBg(ctx, w, h, '#b72f21'); const cx = w * (nobori ? 0.54 : 0.5); for (const y of [.14, .38, .62, .86]) { ctx.save(); ctx.translate(cx, h * y); const r = Math.min(w * .3, h * .1); ctx.scale(r, r); hanabishi(ctx, '#b72f21', '#15120e'); ctx.restore(); } },
  // 明智：水色地に淡い色の桔梗を中央に一つ
  akechi(ctx, w, h, nobori) { fillBg(ctx, w, h, '#8fb3c9'); monAt(ctx, 'akechi', w * (nobori ? 0.54 : 0.5), h * .34, w * .4, '#8fb3c9', '#ece6d6'); },
  // 真田：赤地に金の六連銭
  sanada(ctx, w, h, nobori) { fillBg(ctx, w, h, '#9a2a20'); monAt(ctx, 'sanada', w * (nobori ? 0.54 : 0.5), h * .34, w * .42, '#9a2a20', '#d8b24a'); },
  // 毛利：赤地に白の一文字三星
  mori(ctx, w, h, nobori) { fillBg(ctx, w, h, '#a3281c'); const cx = w * (nobori ? 0.54 : 0.5), r = w * .4; ctx.save(); ctx.translate(cx, h * .34); ctx.scale(r, r); ctx.fillStyle = SHIRO; ctx.strokeStyle = SHIRO; MON.mori(ctx, '#a3281c'); ctx.restore(); },
  // 北条：白地に黒の三つ鱗（染めの帯は付けない）
  hojo(ctx, w, h, nobori) { fillBg(ctx, w, h, SHIRO); monAt(ctx, 'hojo', w * (nobori ? 0.54 : 0.5), h * .34, w * .42, SHIRO); },
};
export function drawMon(ctx, kind, w, h, dyed = false, nobori = false) {
  // 藤堂の旗印は家紋の蔦と分ける。紋の切り出しには従来の蔦を保つ。
  // 今治城の展示解説：docs/generals_look_1108/藤堂高虎.md。
  if (kind === '高虎の三つ丸餅' || (kind === 'todo' && (dyed || nobori))) {
    ctx.fillStyle = '#232c40'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ece6d6';
    for (const y of [.22, .48, .74]) {
      ctx.beginPath(); ctx.arc(w * .5, h * y, Math.min(w * .28, h * .105), 0, TAU); ctx.fill();
    }
    return;
  }
  // 官兵衛の中白旗。豊前入国前の上部の永楽銭は既存の紋を共用する。
  // 帯の比率と染め色は復元案。出所：docs/generals_look_1108/黒田官兵衛.md。
  if (kind === '官兵衛の中白' || kind === '官兵衛の中白永楽') {
    ctx.fillStyle = '#201e22'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ece6d6'; ctx.fillRect(0, h / 3, w, h / 3);
    if (kind === '官兵衛の中白永楽') {
      // 既存の銭は墨描きなので透過の別面へ描き、白抜きに染め替える。
      const coin = document.createElement('canvas'); coin.width = coin.height = 128;
      const g = coin.getContext('2d');
      g.translate(64, 64); g.scale(58, 58); g.fillStyle = INK; g.strokeStyle = INK;
      MON.eiraku(g, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ece6d6'; g.fillRect(0, 0, 128, 128);
      const size = Math.min(w * .6, h * .28);
      ctx.drawImage(coin, (w - size) / 2, h / 6 - size / 2, size, size);
    }
    return;
  }
  // 内藤昌豊の伝承旗。胴赤は中央の横帯とし、裾赤や主家の菱紋にしない。
  // 帯幅と染めの色は復元案。既存の旗の作成時に描き、材質を使い回す。
  if (kind === '内藤の胴赤') {
    ctx.fillStyle = '#ece6d6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a52b24'; ctx.fillRect(0, h / 3, w, h / 3);
    return;
  }
  // 東博の榊原康政像。対象三戦だけ日輪と「無」を組み合わせる。篆書の筆形は略復元。
  if (kind === '榊原の日輪無') {
    ctx.fillStyle = '#efe9da'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b52a20'; ctx.beginPath();
    ctx.arc(w * .5, h * .22, w * .27, 0, TAU); ctx.fill();
    ctx.fillStyle = INK;
    column(ctx, '無', w * .5, h * .4, h * .83, w * .75);
    return;
  }
  // 伊達家伝来の白地赤日の丸旗。竹雀の家紋とは別に、政宗の旗持ちだけが使う。
  if (kind === '景勝の白丸') {
    ctx.fillStyle = '#232c40'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ece6d6'; ctx.beginPath();
    ctx.arc(w * .5, h * .36, w * .29, 0, TAU); ctx.fill();
    return;
  }
  if (kind === 'date_hinomaru') {
    ctx.fillStyle = '#ece6d6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b52a20'; ctx.beginPath();
    ctx.arc(w * .5, h * .36, w * .29, 0, TAU); ctx.fill();
    return;
  }
  // 『信長公記』巻三・志賀御陣之事：道家（道豪）兄弟の白い指物。
  // 染め色や家紋を足さず、記された字を残す。筆跡と字配りは推定復元。
  if (kind === '天下一の勇士') {
    ctx.fillStyle = '#ece6d6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = INK;
    column(ctx, '天下一の勇士', w * .5, h * .06, h * .94, w * .42);
    return;
  }
  // 佐久間の軍旗に伝わる白・黒・浅葱。段の幅・色順は復元で、家紋を重ねない。
  // 雑賀の陣所だけが指定する。織り目・汚しと絵の使い回しは共通の旗に任せる。
  if (kind === '佐久間の段染め') {
    const colors = ['#ece6d6', '#201f1c', '#67a6ad'];
    for (let i = 0; i < colors.length; i++) {
      const y0 = Math.round(h * i / colors.length), y1 = Math.round(h * (i + 1) / colors.length);
      ctx.fillStyle = colors[i]; ctx.fillRect(0, y0, w, y1 - y0);
    }
    return;
  }
  // 武田騎馬の背旗は一隊で同じ朱地。六文銭は使わない。
  if (kind === 'takeda_kiba' || kind === 'furin_kiba') {
    ctx.fillStyle = '#b52c20'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = kind === 'furin_kiba' ? '#191511' : '#f3e7d4';
    if (kind === 'furin_kiba') {
      ctx.font = `bold ${w * 0.62}px serif`; ctx.textAlign = 'center';
      for (const [i, ch] of [...'風林火山'].entries()) ctx.fillText(ch, w / 2, h * (0.2 + i * 0.22));
    } else {
      ctx.save(); ctx.translate(w / 2, h * 0.32); ctx.scale(w * 0.33, w * 0.33);
      for (const [x, y] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
        ctx.beginPath(); ctx.moveTo(x, y - 0.38); ctx.lineTo(x + 0.44, y);
        ctx.lineTo(x, y + 0.38); ctx.lineTo(x - 0.44, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    return;
  }
  // 一人ずつの旗印（kacchu_required.js）：sashi:紋:地色:墨色[:裾の段の色]。紋は MON の鍵か「字」で始まる旗の字。
  // 家紋か名字の字を地色と墨で染め分ける（家の旗と同じ作り。染めの配色は復元案）
  if (kind.startsWith('sashi:')) {
    const [, mon, bg, ink, band] = kind.split(':');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (band) { ctx.fillStyle = band; ctx.fillRect(0, h * 0.64, w, h * 0.36); }
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    // 白線：地色に横の線を二本（足軽大将の指物。units.js）
    if (mon === '白線') { ctx.fillRect(0, h * 0.22, w, h * 0.07); ctx.fillRect(0, h * 0.40, w, h * 0.07); }
    else if (mon.startsWith('字')) {
      const t = mon.slice(1), n = [...t].length, y1 = band ? h * 0.6 : h * 0.92;
      column(ctx, t, w * 0.52, h * 0.07, y1, Math.min(w * 0.56, (y1 - h * 0.07) / n * 0.9));
    } else if (MON[mon]) {
      // 紋の関数は墨（INK）で塗るので、別の板に墨と抜き色で描いてから、地色と墨色へ置き換えて重ねる
      const r = w * (nobori ? 0.44 : 0.36), c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.translate(w * (nobori ? 0.54 : 0.5), h * 0.32); g.scale(r, r); g.fillStyle = INK; g.strokeStyle = INK;
      MON[mon](g, '#ff00ff');
      const im = g.getImageData(0, 0, w, h), d = im.data, A = hexRgb(ink), B = hexRgb(bg);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const s = Math.min(1, Math.max(0, (d[i] - 22) / 233));
        for (let k = 0; k < 3; k++) d[i + k] = A[k] + (B[k] - A[k]) * s;
      }
      g.putImageData(im, 0, 0); ctx.drawImage(c, 0, 0);
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(0, 0, w * 0.06, h);
    return;
  }
  // K291 11/13：家の旗（flagTexture）は『戦国武将100 家紋・旗・馬印FILE』（docs/books/kamon_hata_umajirushi.md）の復元図に合わせる。
  //   胴・陣笠・札・地図の紋（dyed=false）はこれまでの家紋のまま。乳の影は共通の末尾で付ける。
  if (dyed && BOOK_FLAG[kind]) { BOOK_FLAG[kind](ctx, w, h, nobori); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, w * 0.06, h); return; }
  if (kind.startsWith('yose_') && !kind.startsWith('yose_takeda_')) kind = kind.slice(5);
  // aka_〇〇：紋はそのまま、染めだけ朱にする（稲生の信勝方など、同じ家中の敵味方を旗の色で分ける戦の指定）。
  let dye = null;
  if (kind.startsWith('aka_')) { kind = kind.slice(4); dye = '#a8321f'; }
  if (kind.startsWith('yose_takeda_')) {
    const bg = kind.endsWith('black') ? '#191713' : kind.endsWith('orange') ? '#c56a26' : '#b72f21';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h * 0.3); ctx.scale(w * 0.38, w * 0.38);
    ctx.fillStyle = kind.endsWith('black') ? '#eee4cd' : '#15120e';
    if (kind.endsWith('mikata')) hanabishi(ctx, bg, '#f4ead8');
    else if (kind.endsWith('orange')) hanabishi(ctx, bg, '#15120e');
    else { for (const [x, y] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
      ctx.beginPath(); ctx.moveTo(x, y - 0.42); ctx.lineTo(x + 0.48, y); ctx.lineTo(x, y + 0.42); ctx.lineTo(x - 0.48, y); ctx.closePath(); ctx.fill();
    } }
    ctx.restore(); return;
  }
  // 蜂須賀の旗だけは全面を黄土色に染める。白い大紋の連なりを避ける（染め色は遊び用）。
  const smallHachisuka = dyed && kind === 'hachisuka';
  const bg = smallHachisuka ? FLAG_DYE.hachisuka : FLAG_BG[kind] || '#ddd';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const lettering = kind === 'namu' || kind === 'ikko' || kind === 'onri' || kind === 'furin' || kind === 'sakakibara';
  // 上下の広い染めで色を残し、紋の周りは従来の明暗を保つ。字の旗は字の両脇だけを染める。
  if (dyed && (dye || FLAG_DYE[kind]) && !smallHachisuka) {
    ctx.fillStyle = dye || FLAG_DYE[kind];
    if (lettering) {
      ctx.fillRect(0, 0, w * 0.13, h);
      ctx.fillRect(w * 0.87, 0, w * 0.13, h);
    } else {
      ctx.fillRect(0, 0, w, h * 0.08);
      ctx.fillRect(0, h * 0.56, w, h * 0.44);
    }
  }
  // 置き幟は紋を大きくし、乳の切り欠きにかからないよう少し右へ寄せる。
  const cx = w * (nobori ? 0.54 : 0.5), cy = h * 0.32, r = w * (nobori ? 0.44 : smallHachisuka ? 0.22 : dyed ? 0.38 : 0.34);
  if (kind === 'namu' || kind === 'ikko') {
    ctx.fillStyle = INK;
    column(ctx, '南無阿弥陀仏', cx, h * 0.05, h * 0.95, w * 0.32);
  } else if (kind === 'uesugi_bi' || kind === 'uesugi_ryu') {
    // 上杉家に伝わる「毘」「龍」の軍旗。筆形は読みやすい字で補う。
    // 米沢市上杉博物館「戦う上杉氏」：
    // https://www.denkoku-no-mori.yonezawa.yamagata.jp/012tatakau.htm
    ctx.fillStyle = INK;
    column(ctx, kind === 'uesugi_bi' ? '毘' : '龍', cx, h * 0.12, h * 0.58, w * 0.75);
  } else if (kind === 'onri') {
    // 家康の旗印「厭離穢土欣求浄土」：白地に墨で二行
    ctx.fillStyle = '#14110d';
    column(ctx, '厭離穢土', w * 0.68, h * 0.05, h * 0.95, w * 0.36);
    column(ctx, '欣求浄土', w * 0.32, h * 0.05, h * 0.95, w * 0.36);
  } else if (kind === 'sakakibara') {
    // 榊原康政の「無」。篆書の厳密な復元ではなく、旗印の文字を補う。
    ctx.fillStyle = INK;
    column(ctx, '無', cx, h * 0.12, h * 0.58, w * 0.75);
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

// 指物（四半）の乳：布と同じ地の輪を竿の側に五つ、上の横手に三つ（数は奇数）。輪の間は布を切り欠き、竿が透けて見える。
// 上の縁には横手（L字の金具で竿に留めた横木）を描く。旗の揺れは竿の側と上の縁を留めているので、横手は真っ直ぐのまま
function chiLoops(g, W, H) {
  const cw = Math.round(W * 0.075), bh = Math.round(H * 0.04);
  const src = document.createElement('canvas'); src.width = W; src.height = H; src.getContext('2d').drawImage(g.canvas, 0, 0);
  g.clearRect(0, 0, cw, H); g.clearRect(0, 0, W, bh);
  // 横手：焦茶の木。上に細い照り、下に影
  const by = Math.round(bh * 0.28), bt = Math.round(bh * 0.44);
  g.fillStyle = '#3a2c1c'; g.fillRect(0, by, W, bt);
  g.fillStyle = 'rgba(255,240,210,.18)'; g.fillRect(0, by, W, 2);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, by + bt - 2, W, 2);
  // L字の金具（竿と横手の角）
  g.fillStyle = '#26221e'; g.fillRect(0, by - 2, cw * 0.9, bt + 4); g.fillRect(0, by, Math.round(cw * 0.45), bh * 2.2);
  const loop = (x, y, w, h, horiz) => {
    g.drawImage(src, horiz ? x : cw, horiz ? bh : y, w, h, x, y, w, h);
    const gr = horiz ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(0.45, 'rgba(0,0,0,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const n = 5, th = Math.round(H * 0.075), span = H - bh - th;
  for (let i = 0; i < n; i++) loop(0, Math.round(bh + span * (i + 0.5) / n - th / 2 + th * 0.3), cw, th, false);
  const tw = Math.round(W * 0.16);
  for (const f of [0.18, 0.53, 0.88]) loop(Math.round(W * f - tw / 2), 0, tw, bh, true);
}

// 敵の旗（指物・幟）は赤い縁で囲む（kaito 10/23 稲生 6）。この戦の敵の家紋を戦の始めに覚える。味方と同じ紋は縁を付けない。
export const enemyFlagKinds = new Set(), allyFlagKinds = new Set();
export const enemyFlagKind = (kind) => enemyFlagKinds.has(kind) && !allyFlagKinds.has(kind);
// 時代で替える旗の種（battle.js が戦の始めに指定）。天正十三年より前の羽柴の旗は五三桐
let ERA = null;
export function setFlagEra(map) { ERA = map; }
// enemy：true で敵の赤い縁、'ally' で味方の藍の縁（kaito 11/11 遊び5-2「味方は青、敵は赤（印・旗の縁）」）
export function flagTexture(kind, nobori = false, enemy = false) {
  kind = ERA?.[kind] ?? kind;
  const ally = enemy === 'ally';
  if (ally) enemy = false;
  const key = (nobori ? 'nobori_' + kind : kind) + (enemy ? '|e' : ally ? '|a' : '');
  if (cache.has(key)) return cache.get(key);
  // 近くで見ても紙のように見えないよう、前の倍の細かさで描く（汚しの位置は前と同じ 128×256 の座標で置く）
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });   // 下で getImageData で染めのむらを付ける。GPU の板のままだと読み戻しで戦の支度が数秒延びた（11/10 天王寺岡山 3.3秒）
  drawMon(g, kind, W, H, true, nobori);
  // 11/12 関ヶ原の支度で旗の布（にじみ・染めのむら・汚し）を家の数だけ一度に描き、一コマが1.8秒延びた。
  //   紋だけを先に描いた布をすぐ返し、布の仕上げは後のコマへ一枚ずつ回す（同じ canvas に描き足して送り直す。読み込みの札の間に済む）
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.mon = kind;   // 遠くの大軍（world.addDistantArmy）が、布から家紋＝敵か味方かを知る
  cache.set(key, t);
  queueFlagPaint(t, () => {
  let seed = 0; for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // 11/8 騎馬の旗がイラストっぽい：紋と地の境が切り絵のように鋭く、墨も地も一色の塗りだった。
  //   現存の背旗（東京大学史料編纂所の落合左平次道次背旗・歴博「戦国の兜と旗」）は、染めの境が布目へ少し滲み、墨は真っ黒でなく濃淡のむらがある。
  //   境を一画素ほど滲ませ、墨は灰がかった焦茶の濃淡に、地の色は染めのむら（大きくゆるい明暗）を付けて少しくすませる（docs/kacchu_ref_1108.md）
  //   11/10：canvas の filter='blur' は CPU の板では一枚百ms 近くかかり、旗の多い戦で支度が二秒近く延びた。
  //   同じ幅（[1,2,1] を縦横に二度＝ぼかしの幅およそ一画素）を、色に透けを掛けた値の上で手でぼかす（canvas の blur と同じく透けた端も滲む）。
  {
    const im = g.getImageData(0, 0, W, H), d = im.data, n = W * H;
    const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
    for (let p = 0; p < n; p++) { const q = p * 4, al = d[q + 3] / 255; a[q] = d[q] * al; a[q + 1] = d[q + 1] * al; a[q + 2] = d[q + 2] * al; a[q + 3] = d[q + 3]; }
    const pass = (s, t, dx, dy) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const xm = Math.max(0, x - dx), xp = Math.min(W - 1, x + dx), ym = Math.max(0, y - dy), yp = Math.min(H - 1, y + dy);
        const q = (y * W + x) * 4, qm = (ym * W + xm) * 4, qp = (yp * W + xp) * 4;
        for (let ch = 0; ch < 4; ch++) t[q + ch] = (s[qm + ch] + 2 * s[q + ch] + s[qp + ch]) * 0.25;
      }
    };
    pass(a, b, 1, 0); pass(b, a, 1, 0); pass(a, b, 0, 1); pass(b, a, 0, 1);
    for (let p = 0; p < n; p++) { const q = p * 4, al = a[q + 3], k = al > 0 ? 255 / al : 0; d[q] = a[q] * k; d[q + 1] = a[q + 1] * k; d[q + 2] = a[q + 2] * k; d[q + 3] = al; }
    g.putImageData(im, 0, 0);
  }
  // 白い地を真っ白にせず、晒していない生成りの麻に（白いほど黄みと灰みを強く）。色の地も少しくすませる。
  {
    const GW = 9, GH = 17, nz = new Float32Array(GW * GH), nz2 = new Float32Array(GW * GH);
    for (let i = 0; i < nz.length; i++) { nz[i] = rnd() * 2 - 1; nz2[i] = rnd() * 2 - 1; }
    const samp = (a, u, v) => { const x = u * (GW - 1), y = v * (GH - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(GW - 1, x0 + 1), y1 = Math.min(GH - 1, y0 + 1), fx = x - x0, fy = y - y0;
      return (a[y0 * GW + x0] * (1 - fx) + a[y0 * GW + x1] * fx) * (1 - fy) + (a[y1 * GW + x0] * (1 - fx) + a[y1 * GW + x1] * fx) * fy; };
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const p = i >> 2, u = (p % W) / W, v = Math.floor(p / W) / H;
      const l = (d[i] + d[i + 1] + d[i + 2]) / 765, k = Math.min(1, Math.max(0, (l - 0.55) / 0.35));
      d[i] *= 0.96 * (1 - k * 0.09); d[i + 1] *= 0.96 * (1 - k * 0.13); d[i + 2] *= 0.95 * (1 - k * 0.21);
      // 染めのむら（地も墨も）と、色の地は二割ほど彩りを落とす（刈安・紅花の染めの、日に褪せた色）
      const m = 1 + samp(nz, u, v) * 0.07 + samp(nz2, u * 0.5 + 0.25, v * 0.5) * 0.04;
      const gy = (d[i] + d[i + 1] + d[i + 2]) / 3;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = (d[i + ch] * 0.82 + gy * 0.18) * m;
      // 墨：真っ黒でなく、灰がかった焦茶の濃淡（濃い所ほど持ち上げる）
      const dk = Math.max(0, 1 - l / 0.2);
      if (dk > 0) { const s = 1 + samp(nz2, u, v) * 0.35; d[i] += dk * 30 * s; d[i + 1] += dk * 26 * s; d[i + 2] += dk * 22 * s; }
    }
    g.putImageData(im, 0, 0);
  }
  // 敵の赤い縁は、汚し・ほつれ・乳の前に染める。後から塗ると、ほつれた端と乳の隙間が埋まって真っ直ぐな四角の枠になり、近くで板に見えた。
  // 染めの縁なので幅を少し揺らし、角で途切れさせない。
  // 11/5 common_1105i：8 画素ごとの段の内の際は、近くで切り貼りの色紙の縁に見えた。幅をなめらかに揺らし、内の際は麻へ染みてにじむ（濃い芯から薄く三段）
  // 味方は同じ染めの縁を藍で（赤より細め。色だけに頼らず、敵の縁は太い）
  if (enemy || ally) {
    const p0 = rnd() * 6.28, p1 = rnd() * 6.28, w0 = enemy ? 21 : 15;
    const wd = (t, s) => w0 + Math.sin(t * 0.045 + p0 + s) * 1.8 + Math.sin(t * 0.13 + p1 + s * 2) * 0.9;
    for (const [grow, a] of [[2.5, 0.16], [1.2, 0.34], [0, 1]]) {
      g.fillStyle = enemy ? `rgba(178,46,30,${a})` : `rgba(40,70,140,${a})`;
      for (let y = 0; y < H; y += 2) { g.fillRect(0, y, wd(y, 0) + grow, 2); const b = wd(y, 1.7) + grow; g.fillRect(W - b, y, b, 2); }
      for (let x = 0; x < W; x += 2) { g.fillRect(x, 0, 2, wd(x, 3.1) + grow); const b = wd(x, 4.4) + grow; g.fillRect(x, H - b, 2, b); }
    }
  }
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
  // 縁のほつれ（竿と反対の端）。11/5 写真の指物は縁を折り返して縫い、ほつれはごく細い。前の 5 画素の四角い欠けは、透かしの切り捨てで遠くから画素の階段（ぎざぎざの縁）に見えた
  for (let y = 0; y < H; y += 5) if (rnd() < 0.12) g.clearRect(W - 1 - rnd() * 1.5, y, 1.5, 1 + rnd() * 3);
  // 裾のほつれと、垂れた糸（欠けは浅く、糸は細く短く）
  for (let x = 0; x < W; x += 4) if (rnd() < 0.15) g.clearRect(x, H - 1 - rnd() * 2, 1 + rnd() * 2, 3);
  g.fillStyle = 'rgba(70,58,40,.5)';
  for (let i = 0; i < 3; i++) { const x = W * 0.15 + rnd() * W * 0.8; g.clearRect(x - 1, H - 4, 2, 4); g.fillRect(x, H - 4, 1, 2 + rnd() * 3); }
  chiLoops(g, W, H);
  t.needsUpdate = true;
  astcRetry(t, true);   // iPhone：透ける布も RGBA の ASTC で（astc_rt）。仕上げた後に一度だけ縮める
  });
  return t;
}
// 旗の布の仕上げの順番待ち。一つの仕事で一枚ずつ。絵を読む所（寄せ旗の一枚絵・描き足しの紋）は settleFlag で先に仕上げる
const flagPaintJobs = new Map();
let flagPaintTimer = 0;
function queueFlagPaint(t, paint) {
  flagPaintJobs.set(t, paint);
  if (!flagPaintTimer) flagPaintTimer = setTimeout(runFlagPaint, 0);
}
function runFlagPaint() {
  flagPaintTimer = 0;
  const first = flagPaintJobs.keys().next();
  if (first.done) return;
  settleFlag(first.value);
  if (flagPaintJobs.size) flagPaintTimer = setTimeout(runFlagPaint, 0);
}
export function settleFlag(t) {
  const paint = t && flagPaintJobs.get(t);
  if (!paint) return t;
  flagPaintJobs.delete(t);
  paint();
  return t;
}

// 本人の背の無地の旗の布目（白に近い明るさだけ。色は材質の染め色を掛ける）。11/5 common_1105i：一色の板は 844×390 で黄色い紙の札に見えた。
// 麻の織り目・染めのむら・上の褪せ・裾の土・折り返して縫った縁の陰。破れと穴は付けない（無地の旗の決まり）。全員で一枚を使う
let plainFlagTex = null;
export function plainFlagTexture() {
  if (plainFlagTex) return plainFlagTex;
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7919; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.025 + rnd() * 0.03})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(0,0,0,${0.01 + rnd() * 0.025})`; g.fillRect(x, 0, 1, H); }
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W, y = rnd() * H, r = 14 + rnd() * 34, d = rnd() < 0.55;
    const sg = g.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, d ? 'rgba(40,30,20,0.09)' : 'rgba(255,255,255,0.08)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const sun = g.createLinearGradient(0, 0, 0, 110); sun.addColorStop(0, 'rgba(225,222,212,0.22)'); sun.addColorStop(1, 'rgba(225,222,212,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, 110);
  const gr = g.createLinearGradient(0, 160, 0, H); gr.addColorStop(0, 'rgba(80,64,42,0)'); gr.addColorStop(1, 'rgba(80,64,42,0.3)');
  g.fillStyle = gr; g.fillRect(0, 160, W, H - 160);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,46,30,${0.08 + rnd() * 0.12})`; g.beginPath(); g.arc(rnd() * W, H - rnd() * rnd() * 50, 0.3 + rnd() * 0.6, 0, 7); g.fill(); }
  // 折り返しの縁：外の端は二重の布で濃く、縫い目の内に細い陰
  g.fillStyle = 'rgba(30,22,14,0.16)'; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3); g.fillRect(W - 3, 0, 3, H);
  g.fillStyle = 'rgba(30,22,14,0.12)'; g.fillRect(0, 4, W, 1); g.fillRect(0, H - 5, W, 1); g.fillRect(W - 5, 0, 1, H);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  plainFlagTex = t;
  return t;
}

// 陣幕。家紋のある幕は生成りに大紋を染め、指定のない幕は従来の二つ引両。
export function jinmakuTexture(mon) {
  mon = ERA?.[mon] ?? mon;
  const key = 'jinmaku' + (mon || '');
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  // 近くで見ても粗くならないよう倍の細かさで描く（描く座標は前と同じ 256×64）
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#e6dfcf'; g.fillRect(0, 0, 256, 64);
  if (MON[mon]) {
    // 四メートルに二紋。横長の絵でも、実物の布では丸く見える比率にする。
    // 旗の地色や竿の影を写さず、同じ紋の形だけを生成りへ直接染め抜く。
    for (const x of [64, 192]) {
      g.save(); g.translate(x, 30); g.scale(29, 18);
      g.fillStyle = INK; g.strokeStyle = INK; MON[mon](g, '#e6dfcf'); g.restore();
    }
  } else {
    g.fillStyle = '#1a1712';
    g.fillRect(0, 14, 256, 9); g.fillRect(0, 36, 256, 9);
  }
  if (mon && !MON[mon]) {
    // 家紋を別に描いて、中の白い幅へ小さく写す
    const m = document.createElement('canvas'); m.width = 128; m.height = 256;
    drawMon(m.getContext('2d'), mon, 128, 256);
    g.save(); g.beginPath(); g.arc(128, 29.5, 6.2, 0, 7); g.clip();
    g.drawImage(m, 20, 38, 88, 88, 121.5, 23, 13, 13);
    g.restore();
  }
  // 上下の補強布と折り返し。太い横帯を避け、白い幕の面積と輪郭を残す。
  g.fillStyle = '#554a39'; g.fillRect(0, 0, 256, 2.5); g.fillRect(0, 61, 256, 3);
  g.fillStyle = 'rgba(255,244,214,.5)';
  for (let x = 1; x < 256; x += 3) { g.fillRect(x, 2, 1, .5); g.fillRect(x, 61.5, 1, .5); }
  // 布の縫い目（幅ごと）と、織り目・裾の汚れ
  for (let x = 0; x < 256; x += 32) {
    // 幅継ぎは黒い太線でなく、重ねた布の細い影と縫い糸で表す。
    g.fillStyle = 'rgba(49,38,24,.18)'; g.fillRect(x, 0, .5, 64);
    g.fillStyle = 'rgba(255,246,220,.28)'; g.fillRect(x + .5, 0, .5, 64);
    g.fillStyle = 'rgba(75,62,42,.3)';
    for (let y = 1; y < 64; y += 2) g.fillRect(x + 1.5, y, .5, .75);
  }
  // 折り返した上下の縁。遠くでは元の絵の縮小表示に任せる。
  g.fillStyle = 'rgba(58,46,30,.18)'; g.fillRect(0, 1, 256, .5); g.fillRect(0, 62, 256, .5);
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

// textures.js に無い家の紋・字の旗：flagTexture の無地の布に、ここで描き足す（一度だけ。兵の指物・幟・遠くの大軍が同じ布を使う）
// draw(g) は 128×256 の布の上に描く（紋の真ん中はおよそ (64, 82)、半径 43）。すでに紋が描かれている布なら何もしない
export function customFlag(key, draw, bg, nobori = false) {
  const t = settleFlag(flagTexture(key, nobori));
  if (t.userData.custom) return t;
  t.userData.custom = true;
  const g = t.image.getContext('2d');
  // 布の絵は 128×256 で描いた頃の座標で描く（今の布が倍の細かさなら、その分だけ拡げる）
  const k = (t.image.width || 128) / 128;
  const d = g.getImageData(24 * k, 40 * k, 80 * k, 84 * k).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 16 * k * k) if (d[i] + d[i + 1] + d[i + 2] < 240) ink++;
  if (ink > 40) return t;
  if (bg) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = bg; g.fillRect(0, 0, 128 * k, 256 * k); g.restore(); }
  g.save(); g.scale(k, k); g.fillStyle = g.strokeStyle = '#17130f'; draw(g); g.restore();
  t.needsUpdate = true;
  return t;
}
