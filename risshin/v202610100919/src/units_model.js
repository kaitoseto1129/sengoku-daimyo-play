// 兵の形の部品：模様の絵・素材・頭・兜・面頬・胴・手足・武器・馬・僧兵の形
// 形を作る関数どうしが「汚れの具合（DIRT）」を分け合って書き換えるので、ここは一つのファイルのまま
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { drawMon } from './textures.js';
import { nanbanGeometry } from './nanban.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodSwap } from './units_flags.js';
import { FACTION } from './units_data.js';
let WEAPONS = null, weaponsLoading = null;
export function loadWeapons() {
  if (!weaponsLoading) weaponsLoading = import('./asset_weapons.js').then((m) => { WEAPONS = m.default; return true; }).catch(() => { weaponsLoading = null; return false; });
  return weaponsLoading;
}
import { YUMI, loadYumi } from './yumi.js';

// ---------------- モデル ----------------
// 模様の絵は 2048×1024 の一枚にまとめる（兵も馬も同じ材質で描き、描く回数を増やさない）。
// 赤＝二つめの色の混ぜ具合（威糸・鎖・髭・家紋）、緑＝明るさ（凹凸の陰・擦れ）、青＝汚れ（泥・汗）
const AW = 2048, AH = 1024, LUM0 = 200;
const REG = {
  sugake: [0, 0, 512, 512], kebiki: [512, 0, 512, 512],
  okegawa: [0, 512, 256, 256], kote: [256, 512, 256, 256], haidate: [512, 512, 256, 256], shino: [768, 512, 256, 256],
  cloth: [1024, 512, 256, 256], lacq: [1280, 512, 256, 256], hair: [1536, 512, 256, 256], skin: [1792, 512, 256, 256],
  straw: [0, 896, 256, 128], wood: [256, 896, 256, 128], iron: [512, 896, 256, 128], suji: [768, 896, 256, 128],
  plain: [1024, 768, 256, 256], fur: [1280, 768, 256, 256], horo: [1536, 768, 256, 256], cord: [1792, 768, 256, 256],
  // 家紋の二段目（y=832〜896）は使っていないので借りる：桶側の板（一枚ずつ。長さが横、幅が縦の四本）と、陣笠（横が笠のまわり、下が縁・上が頂）
  okeV: [0, 832, 512, 64], kasa: [512, 832, 512, 64],
};
// 顔の模様は八枚（年と髭）：0 若い・剃った 1 若い・無精髭 2 中年・無精髭 3 中年・口髭 4 中年・口髭と顎髭 5 中年・髭面 6 年寄り・口髭と顎髭 7 年寄り・髭面
const faceReg = (t) => [1024 + (t % 4) * 256, Math.floor(t / 4) * 256, 256, 256];
// 胴や陣笠・陣羽織に描く家紋
// 置き場：y=768〜896 の 1024×128 を、64px の升に二段（一段に16、合わせて32まで）
const MONS = ['tokugawa', 'takeda', 'oda', 'imagawa', 'saito', 'okudaira', 'katabami', 'okubo', 'akechi', 'honda', 'mizuno', 'ii', 'sanada', 'maeda'];
// 陣笠の家紋を朱で描く家（ほかは金）
const KASA_SHU = new Set(['imagawa', 'saito', 'okudaira', 'katabami', 'akechi', 'mizuno', 'maeda']);
const monReg = (k) => { const i = MONS.indexOf(k === 'akazonae' ? 'takeda' : k); return i < 0 ? null : [(i % 16) * 64, 768 + Math.floor(i / 16) * 64, 64, 64]; };
const PLAIN_UV = [(1024 + 128) / AW, 1 - (768 + 128) / AH];

// 顔の模様の座標：θ（正面が 0、左右へ ±π）と φ（上下 ±π/2）。正面ほど細かく割る
const faceS = (th) => 0.5 + 0.5 * Math.sign(th) * Math.pow(Math.abs(th) / Math.PI, 0.6);
const faceTh = (s) => Math.sign(s - 0.5) * Math.PI * Math.pow(Math.abs(2 * s - 1), 1 / 0.6);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeAtlas() {
  // 描いた後で読み出す絵は CPU の絵に（GPU の絵からの読み出しは、混んだ機械ではとても遅い）
  const cv = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = AW; c.height = AH; return c.getContext('2d', { willReadFrequently: true }); });
  const [R, G, B] = cv;
  const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
  R.fillStyle = '#000'; R.fillRect(0, 0, AW, AH);
  G.fillStyle = gray(LUM0); G.fillRect(0, 0, AW, AH);
  B.fillStyle = '#000'; B.fillRect(0, 0, AW, AH);
  const rnd = rng(1575);
  const clip = (ctxs, r, fn) => { for (const c of ctxs) { c.save(); c.beginPath(); c.rect(r[0], r[1], r[2], r[3]); c.clip(); } fn(); for (const c of ctxs) c.restore(); };
  const ALL = [R, G, B];
  // 細かい斑（明るさ）と汚れ（下ほど濃い）
  const mottle = (r, n, amp, dirtAmt = 0.35, bottom = 0.5) => {
    const [x, y, w, h] = r;
    for (let i = 0; i < n; i++) { const px = x + rnd() * w, py = y + rnd() * h, s = 1 + rnd() * 3; G.fillStyle = rnd() < 0.5 ? gray(255, amp * rnd()) : gray(0, amp * rnd()); G.fillRect(px, py, s, s); }
    for (let i = 0; i < n / 20; i++) {
      const px = x + rnd() * w, py = y + h * (1 - Math.pow(rnd(), 1 + bottom * 2)), rr = 4 + rnd() * 18;
      const gr = B.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, gray(255, dirtAmt * (0.4 + rnd() * 0.6))); gr.addColorStop(1, gray(255, 0));
      B.fillStyle = gr; B.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
    const gr = B.createLinearGradient(0, y + h * 0.55, 0, y + h); gr.addColorStop(0, gray(255, 0)); gr.addColorStop(1, gray(255, dirtAmt * bottom));
    B.fillStyle = gr; B.fillRect(x, y, w, h);
  };
  const scratches = (r, n, a = 0.18) => { const [x, y, w, h] = r; for (let i = 0; i < n; i++) { const px = x + rnd() * w, py = y + rnd() * h, L = 2 + rnd() * 10, an = (rnd() - 0.5) * 0.9; G.strokeStyle = gray(255, a * (0.4 + rnd())); G.lineWidth = 0.7; G.beginPath(); G.moveTo(px, py); G.lineTo(px + Math.cos(an) * L, py + Math.sin(an) * L); G.stroke(); } };

  // 小札（素懸威）：一段 64px、札は 16px。縦の糸を二本ずつ間をあけて通す
  const lamellar = (r, dense) => clip(ALL, r, () => {
    const [x0, y0, w, h] = r, rh = 64, pw = 16;
    for (let row = 0; row < h / rh; row++) {
      const y = y0 + row * rh;
      const gr = G.createLinearGradient(0, y, 0, y + rh);
      gr.addColorStop(0, gray(236)); gr.addColorStop(0.2, gray(218)); gr.addColorStop(0.8, gray(186)); gr.addColorStop(0.94, gray(120)); gr.addColorStop(1, gray(70));
      G.fillStyle = gr; G.fillRect(x0, y, w, rh);
      // 札の頭（上の縁の刻み）と札の境
      for (let x = x0 + (row % 2) * 8; x < x0 + w; x += pw) {
        G.fillStyle = gray(90, 0.7); G.fillRect(x, y + 4, 1.2, rh - 10);
        G.fillStyle = gray(255, 0.35); G.fillRect(x + 1.2, y + 4, 1, rh - 12);
        G.fillStyle = gray(255, 0.5); G.beginPath(); G.arc(x + pw / 2, y + 3, pw / 2 - 1, Math.PI, 0); G.fill();
      }
      if (!dense) {
        // 素懸：二本の縦糸を 64px ごとに
        for (let x = x0 + 22; x < x0 + w; x += 64) for (const dx of [0, 7]) {
          R.fillStyle = gray(255); R.fillRect(x + dx, y - 2, 4, rh + 2);
          for (let yy = y; yy < y + rh; yy += 3) { G.fillStyle = gray(yy % 6 < 3 ? 235 : 170); G.fillRect(x + dx, yy, 4, 2); }
        }
      } else {
        // 毛引威：札の頭の下を、糸がすき間なく覆う
        for (let x = x0; x < x0 + w; x += 5) {
          R.fillStyle = gray(255); R.fillRect(x, y + 13, 4, rh - 13);
          G.fillStyle = gray(90); G.fillRect(x + 4, y + 13, 1, rh - 13);
          for (let yy = y + 13; yy < y + rh; yy += 4) { G.fillStyle = gray(yy % 8 < 4 ? 232 : 188); G.fillRect(x, yy, 4, 2); }
        }
        G.fillStyle = gray(60, 0.8); G.fillRect(x0, y + rh - 2, w, 2);
      }
    }
    // いちばん下の段に菱縫（赤い×の綴じ）
    if (dense) for (let x = x0 + 4; x < x0 + w; x += 16) { const y = y0 + h - 22; R.strokeStyle = gray(255); R.lineWidth = 3; R.beginPath(); R.moveTo(x, y); R.lineTo(x + 9, y + 9); R.moveTo(x + 9, y); R.lineTo(x, y + 9); R.stroke(); }
    scratches(r, 700, 0.22);
    mottle(r, 1800, 0.12, 0.45, 0.8);
  });
  lamellar(REG.sugake, false);
  lamellar(REG.kebiki, true);

  // 桶側胴（縦矧）：短冊の板を縦に並べて鋲で留める（足軽の御貸具足）。遠くの軽い形の胴に貼る（近くは板一枚ずつの形と okeV）
  clip(ALL, REG.okegawa, () => {
    const [x0, y0, w, h] = REG.okegawa, n = 24, pw = w / n;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * pw;
      const gr = G.createLinearGradient(x, 0, x + pw, 0); gr.addColorStop(0, gray(105)); gr.addColorStop(0.25, gray(200)); gr.addColorStop(0.85, gray(240)); gr.addColorStop(1, gray(150));
      G.fillStyle = gr; G.fillRect(x, y0, pw, h);
      for (const fy of [0.14, 0.54, 0.92]) { const cy = y0 + h * (1 - fy); G.fillStyle = gray(70); G.beginPath(); G.arc(x + pw / 2, cy, 2.2, 0, 7); G.fill(); G.fillStyle = gray(250); G.beginPath(); G.arc(x + pw / 2 - 0.5, cy - 0.5, 1.1, 0, 7); G.fill(); }
    }
    scratches(REG.okegawa, 400, 0.24);
    // 重なりの縁の擦れ（下地が出る）
    for (let i = 0; i < 120; i++) { R.fillStyle = gray(255, 0.3 + rnd() * 0.5); R.fillRect(x0 + Math.floor(rnd() * n) * pw + pw - 2, y0 + rnd() * h, 1.5, 3 + rnd() * 10); }
    mottle(REG.okegawa, 1400, 0.1, 0.5, 0.8);
  });

  // 桶側の板（近くの形の一枚ずつ）：横が板の長さ（左が裾・右が胸）、縦に四本の板（一本 16px）。
  // 板の右の縁は隣の板に重なって明るく、左の縁は前の板の下に潜って暗い。鋲は腰・胸・裾の三つの帯に一つずつ
  clip(ALL, REG.okeV, () => {
    const [x0, y0, w, h] = REG.okeV, ph = h / 4;
    for (let k = 0; k < 4; k++) {
      const y = y0 + k * ph;
      const gr = G.createLinearGradient(0, y, 0, y + ph); gr.addColorStop(0, gray(110)); gr.addColorStop(0.18, gray(196)); gr.addColorStop(0.6, gray(222)); gr.addColorStop(0.9, gray(246)); gr.addColorStop(1, gray(150));
      G.fillStyle = gr; G.fillRect(x0, y, w, ph);
      // 板の打ち出しのゆがみ（長さの向きのゆるい明暗）
      for (let i = 0; i < 6; i++) { const cx = x0 + rnd() * w, rw = 30 + rnd() * 70; const g2 = G.createLinearGradient(cx - rw, 0, cx + rw, 0); const a = (rnd() - 0.5) * 0.16; g2.addColorStop(0, gray(a > 0 ? 255 : 0, 0)); g2.addColorStop(0.5, gray(a > 0 ? 255 : 0, Math.abs(a))); g2.addColorStop(1, gray(a > 0 ? 255 : 0, 0)); G.fillStyle = g2; G.fillRect(cx - rw, y, rw * 2, ph); }
      // 裾の端（折り返しの縁）
      G.fillStyle = gray(90); G.fillRect(x0, y, 3, ph); G.fillStyle = gray(240); G.fillRect(x0 + 3, y, 1.5, ph);
      for (const fx of [0.08, 0.46, 0.86]) {
        const cx = x0 + fx * w + (rnd() - 0.5) * 4, cy = y + ph * 0.55;
        G.fillStyle = gray(60); G.beginPath(); G.arc(cx, cy, 2.8, 0, 7); G.fill();
        G.fillStyle = gray(250); G.beginPath(); G.arc(cx - 0.5, cy - 0.6, 1.5, 0, 7); G.fill();
        R.fillStyle = gray(255, 0.35); R.beginPath(); R.arc(cx, cy, 3.2, 0, 7); R.fill();
      }
      // 擦れて下地が出た所：重なりの縁と裾
      for (let i = 0; i < 26; i++) { R.fillStyle = gray(255, 0.35 + rnd() * 0.5); R.fillRect(x0 + rnd() * w, y + ph - 2 - rnd() * 2, 3 + rnd() * 14, 1.2); }
      for (let i = 0; i < 8; i++) { R.fillStyle = gray(255, 0.4 + rnd() * 0.4); R.fillRect(x0 + rnd() * 10, y + rnd() * ph, 2 + rnd() * 5, 1.5 + rnd() * 3); }
    }
    scratches(REG.okeV, 260, 0.24);
    mottle(REG.okeV, 700, 0.08, 0.55, 0.9);
    // 下ほど泥（左が裾）
    const gd = B.createLinearGradient(x0, 0, x0 + w * 0.4, 0); gd.addColorStop(0, gray(255, 0.45)); gd.addColorStop(1, gray(255, 0)); B.fillStyle = gd; B.fillRect(x0, y0, w * 0.4, h);
  });
  // 陣笠：黒漆の刷毛目（頂から縁へ）、重ねた張りの段、縁の折り返し。擦れた所から下塗り（二つめの色）が出る：縁・頂・ところどころの欠け
  clip(ALL, REG.kasa, () => {
    const [x0, y0, w, h] = REG.kasa;
    G.fillStyle = gray(210); G.fillRect(x0, y0, w, h);
    for (let i = 0; i < 700; i++) { const x = x0 + rnd() * w; G.fillStyle = rnd() < 0.5 ? gray(255, 0.05 + rnd() * 0.06) : gray(0, 0.05 + rnd() * 0.07); G.fillRect(x, y0, 0.8 + rnd() * 1.2, h); }
    // 張りの段（頂から 1/3・2/3 の所に細い段）
    for (const f of [0.34, 0.66]) { const y = y0 + h * f; G.fillStyle = gray(120); G.fillRect(x0, y, w, 1); G.fillStyle = gray(245); G.fillRect(x0, y + 1, w, 1); }
    // 縁の折り返し（下の 5px）と頂の座（上の 4px）
    { const gr = G.createLinearGradient(0, y0 + h - 6, 0, y0 + h); gr.addColorStop(0, gray(250)); gr.addColorStop(0.4, gray(225)); gr.addColorStop(1, gray(130)); G.fillStyle = gr; G.fillRect(x0, y0 + h - 6, w, 6); }
    G.fillStyle = gray(150); G.fillRect(x0, y0 + 4, w, 1);
    // 擦れ・剥げ：縁は細かく連なって、頂はうすく、面にはぽつぽつと小さく
    for (let i = 0; i < 160; i++) { R.fillStyle = gray(255, 0.35 + rnd() * 0.6); R.fillRect(x0 + rnd() * w, y0 + h - 1 - rnd() * 4, 2 + rnd() * 9, 1 + rnd() * 2); }
    for (let i = 0; i < 30; i++) { const px = x0 + rnd() * w, py = y0 + h - 4 - rnd() * 10, rr = 1.5 + rnd() * 3.5; const gr = R.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, gray(255, 0.8)); gr.addColorStop(1, gray(255, 0)); R.fillStyle = gr; R.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
    { const gr = R.createLinearGradient(0, y0, 0, y0 + 7); gr.addColorStop(0, gray(255, 0.5)); gr.addColorStop(1, gray(255, 0)); R.fillStyle = gr; R.fillRect(x0, y0, w, 7); }
    for (let i = 0; i < 40; i++) { const px = x0 + rnd() * w, py = y0 + 6 + rnd() * (h - 14), rr = 0.8 + rnd() * 1.8; R.fillStyle = gray(255, 0.5 + rnd() * 0.4); R.beginPath(); R.arc(px, py, rr, 0, 7); R.fill(); }
    scratches(REG.kasa, 260, 0.22);
    mottle(REG.kasa, 600, 0.06, 0.35, 0.6);
  });
  // 籠手：布の袋に鎖を編み、ところどころに筏（小さな板）
  clip(ALL, REG.kote, () => {
    const [x0, y0, w, h] = REG.kote;
    for (let y = y0; y < y0 + h; y += 3) { G.fillStyle = gray(y % 6 < 3 ? 214 : 190); G.fillRect(x0, y, w, 1.5); }
    // 鎖の目：本物の籠手の鎖は目が細かい（一目 1cm に満たない）。小さな輪を詰めて編み、陰は控えめに（大きな丸の模様に見せない）
    for (let y = y0 + 3, j = 0; y < y0 + h; y += 5, j++) for (let x = x0 + 3 + (j % 2) * 2.5; x < x0 + w; x += 5) {
      R.strokeStyle = gray(255); R.lineWidth = 1.2; R.beginPath(); R.arc(x, y, 1.7, 0, 7); R.stroke();
      G.strokeStyle = gray(232); G.lineWidth = 0.7; G.beginPath(); G.arc(x, y, 1.7, Math.PI, Math.PI * 1.8); G.stroke();
      G.strokeStyle = gray(130); G.beginPath(); G.arc(x, y, 1.7, 0, Math.PI * 0.8); G.stroke();
    }
    for (let i = 0; i < 10; i++) { const x = x0 + 10 + (i % 5) * 50, y = y0 + 20 + Math.floor(i / 5) * 120; R.fillStyle = gray(255); R.fillRect(x, y, 22, 36); G.fillStyle = gray(225); G.fillRect(x, y, 22, 36); G.fillStyle = gray(90); G.fillRect(x, y + 34, 22, 2); }
    mottle(REG.kote, 1200, 0.1, 0.45, 0.5);
  });
  // 佩楯：布に小さな板（瓦）を並べ、鎖でつなぐ
  clip(ALL, REG.haidate, () => {
    const [x0, y0, w, h] = REG.haidate;
    for (let y = y0 + 3, j = 0; y < y0 + h; y += 24, j++) for (let x = x0 + 3 + (j % 2) * 12; x < x0 + w; x += 24) {
      R.fillStyle = gray(255); R.fillRect(x, y, 19, 19);
      const gr = G.createLinearGradient(x, y, x, y + 19); gr.addColorStop(0, gray(245)); gr.addColorStop(1, gray(165)); G.fillStyle = gr; G.fillRect(x, y, 19, 19);
      G.fillStyle = gray(70); G.fillRect(x, y + 18, 19, 1.5);
    }
    mottle(REG.haidate, 1200, 0.1, 0.55, 0.9);
  });
  // 篠臑当：縦の篠（細い鉄の板）を鎖でつなぐ
  clip(ALL, REG.shino, () => {
    const [x0, y0, w, h] = REG.shino;
    for (let x = x0; x < x0 + w; x += 32) {
      R.fillStyle = gray(255); R.fillRect(x + 2, y0, 22, h);
      const gr = G.createLinearGradient(x + 2, 0, x + 24, 0); gr.addColorStop(0, gray(150)); gr.addColorStop(0.35, gray(245)); gr.addColorStop(1, gray(150));
      G.fillStyle = gr; G.fillRect(x + 2, y0, 22, h);
      for (let y = y0 + 4; y < y0 + h; y += 9) { R.strokeStyle = gray(255); R.lineWidth = 1.6; R.beginPath(); R.arc(x + 28, y, 2.6, 0, 7); R.stroke(); }
    }
    for (let y = y0 + 30; y < y0 + h; y += 90) { G.fillStyle = gray(100); G.fillRect(x0, y, w, 3); }
    scratches(REG.shino, 300, 0.25);
    mottle(REG.shino, 1000, 0.1, 0.8, 1.0);
  });
  // 布：織り目・しわ・汗じみ
  clip(ALL, REG.cloth, () => {
    const [x0, y0, w, h] = REG.cloth;
    for (let y = y0; y < y0 + h; y += 2) { G.fillStyle = gray(0, 0.05); G.fillRect(x0, y, w, 1); }
    for (let x = x0; x < x0 + w; x += 2) { G.fillStyle = gray(255, 0.04); G.fillRect(x, y0, 1, h); }
    for (let i = 0; i < 26; i++) { const x = x0 + rnd() * w, wd = 6 + rnd() * 14; const gr = G.createLinearGradient(x - wd, 0, x + wd, 0); gr.addColorStop(0, gray(0, 0)); gr.addColorStop(0.5, gray(0, 0.14)); gr.addColorStop(1, gray(0, 0)); G.fillStyle = gr; G.fillRect(x - wd, y0, wd * 2, h); }
    mottle(REG.cloth, 1600, 0.08, 0.5, 0.9);
  });
  // 漆：細かな擦り傷、擦れて下地が出た所、縁の汚れ
  clip(ALL, REG.lacq, () => {
    const [x0, y0, w, h] = REG.lacq;
    scratches(REG.lacq, 900, 0.3);
    // 漆の擦れて下地が出た所：小さく薄く（兜の鉢の大きな絵では、大きな斑が染みに見える）
    for (let i = 0; i < 40; i++) { const px = x0 + rnd() * w, py = y0 + rnd() * h, rr = 1.5 + rnd() * 4; const gr = R.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, gray(255, 0.45)); gr.addColorStop(1, gray(255, 0)); R.fillStyle = gr; R.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
    for (let i = 0; i < 60; i++) { R.fillStyle = gray(255, 0.6); R.fillRect(x0 + rnd() * w, y0 + h - 2 - rnd() * 6, 3 + rnd() * 12, 1.5); }
    mottle(REG.lacq, 900, 0.08, 0.5, 0.9);
  });
  // 髪：細い筋
  clip(ALL, REG.hair, () => {
    const [x0, y0, w, h] = REG.hair;
    for (let i = 0; i < 900; i++) { const x = x0 + rnd() * w; G.fillStyle = rnd() < 0.5 ? gray(255, 0.25) : gray(0, 0.3); G.fillRect(x, y0, 1, h); }
  });
  // 肌：うっすらした斑と汚れ
  clip(ALL, REG.skin, () => { mottle(REG.skin, 2600, 0.06, 0.55, 0.3); });
  // 藁：編み目
  clip(ALL, REG.straw, () => {
    const [x0, y0, w, h] = REG.straw;
    for (let y = y0; y < y0 + h; y += 6) for (let x = x0; x < x0 + w; x += 6) { G.fillStyle = gray(((x + y) / 6) % 2 ? 235 : 165); G.fillRect(x, y, 6, 3); G.fillStyle = gray(120); G.fillRect(x, y + 5, 6, 1); }
    mottle(REG.straw, 800, 0.1, 0.8, 0.6);
  });
  // 木目
  clip(ALL, REG.wood, () => {
    const [x0, y0, w, h] = REG.wood;
    for (let y = y0; y < y0 + h; y += 1) { G.fillStyle = gray(200 + Math.sin(y * 0.7 + Math.sin(y * 0.13) * 3) * 30); G.fillRect(x0, y, w, 1); }
    // 木目：年輪の筋はうねって太さが揃わず、ところどころ節の回りで渦を巻く。導管の細かい点（樫の虎斑）
    for (let k = 0; k < 26; k++) {
      const y = y0 + rnd() * h, a = 1 + rnd() * 3, f = 0.01 + rnd() * 0.03, ph = rnd() * 6;
      G.strokeStyle = gray(rnd() < 0.5 ? 140 : 235, 0.35 + rnd() * 0.3); G.lineWidth = 0.6 + rnd() * 1.4;
      G.beginPath(); for (let x = x0; x <= x0 + w; x += 4) { const yy = y + Math.sin(x * f + ph) * a; if (x === x0) G.moveTo(x, yy); else G.lineTo(x, yy); } G.stroke();
    }
    for (let k = 0; k < 3; k++) { const cx = x0 + rnd() * w, cy = y0 + rnd() * h; for (let r = 2; r < 9; r += 2) { G.strokeStyle = gray(120, 0.4); G.lineWidth = 1; G.beginPath(); G.ellipse(cx, cy, r * 2.2, r * 0.8, 0, 0, 7); G.stroke(); } }
    for (let k = 0; k < 500; k++) { G.fillStyle = gray(rnd() < 0.5 ? 150 : 230, 0.5); G.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1 + rnd() * 3, 0.8); }
    mottle(REG.wood, 400, 0.08, 0.3, 0.3);
  });
  // 鉄：細かなあばた、錆（汚れの色で）、擦り傷
  clip(ALL, REG.iron, () => { scratches(REG.iron, 400, 0.3); mottle(REG.iron, 2000, 0.14, 0.7, 0.4); });
  // 筋兜の鉢：縦の筋と、筋の脇の影
  clip(ALL, REG.suji, () => {
    const [x0, y0, w, h] = REG.suji;
    for (let x = x0; x < x0 + w; x += 8) { G.fillStyle = gray(250); G.fillRect(x, y0, 2, h); G.fillStyle = gray(120); G.fillRect(x + 2, y0, 1.5, h); G.fillStyle = gray(212); G.fillRect(x + 3.5, y0, 4.5, h); }
    for (let x = x0 + 4; x < x0 + w; x += 8) for (let y = y0 + 10; y < y0 + h; y += 14) { G.fillStyle = gray(255, 0.4); G.fillRect(x, y, 2, 2); }
    scratches(REG.suji, 300, 0.3);
    mottle(REG.suji, 600, 0.08, 0.4, 0.6);
  });
  // 白熊（はぐま）の毛
  clip(ALL, REG.fur, () => { const [x0, y0, w, h] = REG.fur; for (let i = 0; i < 1400; i++) { const x = x0 + rnd() * w; G.strokeStyle = rnd() < 0.6 ? gray(255, 0.3) : gray(0, 0.25); G.lineWidth = 1; G.beginPath(); G.moveTo(x, y0); G.bezierCurveTo(x + 6, y0 + h * 0.3, x - 6, y0 + h * 0.6, x + (rnd() - 0.5) * 12, y0 + h); G.stroke(); } });
  // 母衣：縫い合わせた布の筋（十二枚はぎ）
  clip(ALL, REG.horo, () => {
    const [x0, y0, w, h] = REG.horo;
    for (let k = 0; k < 12; k++) { const x = x0 + (k / 12) * w; const gr = G.createLinearGradient(x, 0, x + w / 12, 0); gr.addColorStop(0, gray(150)); gr.addColorStop(0.15, gray(215)); gr.addColorStop(0.6, gray(232)); gr.addColorStop(1, gray(170)); G.fillStyle = gr; G.fillRect(x, y0, w / 12, h); }
    mottle(REG.horo, 900, 0.06, 0.3, 0.7);
    // はぎ目の二重縫いと織り目。色だけの縞でなく、近くで布の仕立てが読めるように。
    for (let k = 0; k < 12; k++) {
      const x = x0 + k * w / 12;
      G.fillStyle = gray(105, 0.65); G.fillRect(x, y0, 1, h);
      for (let y = y0 + 2; y < y0 + h; y += 5) { G.fillStyle = gray(250, 0.65); G.fillRect(x + 2, y, 1, 2); G.fillRect(x + 5, y, 1, 2); }
    }
    for (let y = y0; y < y0 + h; y += 3) { G.fillStyle = gray(120, 0.08); G.fillRect(x0, y, w, 1); }
    // 開いた裾の折り返し。
    G.fillStyle = gray(110, 0.4); G.fillRect(x0, y0 + h - 5, w, 2);
  });
  // 組紐：斜めの撚り
  clip(ALL, REG.cord, () => { const [x0, y0, w, h] = REG.cord; for (let d = -h; d < w; d += 5) { G.strokeStyle = gray(245); G.lineWidth = 2; G.beginPath(); G.moveTo(x0 + d, y0 + h); G.lineTo(x0 + d + h, y0); G.stroke(); G.strokeStyle = gray(120); G.lineWidth = 1; G.beginPath(); G.moveTo(x0 + d + 3, y0 + h); G.lineTo(x0 + d + 3 + h, y0); G.stroke(); } });

  // 家紋（textures.js の絵を使い、地との色の差を赤に）
  MONS.forEach((k, i) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true }); drawMon(g, k, 128, 200);
    const d = g.getImageData(0, 0, 128, 200).data;
    const lumAt = (j) => d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
    // 地の色は紋の下の真ん中で測る。暗い地に明るい紋（井伊の赤地に金など）も拾えるよう、差の大きさで
    const bgL = lumAt((150 * 128 + 64) * 4);
    const den = Math.max(60, Math.abs(bgL - (bgL > 128 ? 30 : 225)));
    const out = R.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const j = (y * 128 + x) * 4;
      const m = x < 9 ? 0 : Math.min(255, Math.max(0, (Math.abs(bgL - lumAt(j)) - 12) / den * 300));
      const o = (y * 128 + x) * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = m; out.data[o + 3] = 255;
    }
    // 128px で作ってから、64px の升へ縮めて置く
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 128; tmp.getContext('2d').putImageData(out, 0, 0);
    const [mx, my] = monReg(k);
    R.drawImage(tmp, 0, 0, 128, 128, mx, my, 64, 64);
  });

  // 顔（八枚）。年でしわ、髭の形、目・眉・口の陰を描く（遠くの兵はこの絵だけで顔に見える）
  for (let t = 0; t < 8; t++) {
    const [x0, y0] = faceReg(t);
    const age = t <= 1 ? 0 : t <= 5 ? 1 : 2;
    const P = (th, ph) => [x0 + faceS(th) * 256, y0 + (0.5 - ph / Math.PI) * 256];
    const blob = (ctx, th, ph, rt, rp, col, a, rot = 0) => {
      const [x, y] = P(th, ph);
      const sx = Math.abs(P(th + rt, ph)[0] - x) + 0.5, sy = rp / Math.PI * 256;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, sy);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
    };
    const line = (ctx, pts, col, a, wd) => { ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach(([th, ph], i) => { const [x, y] = P(th, ph); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    clip(ALL, faceReg(t), () => {
      // 肌の斑（毛穴・赤み・日焼けのむら）
      for (let i = 0; i < 2600; i++) { G.fillStyle = rnd() < 0.5 ? gray(255, 0.05 * rnd()) : gray(0, 0.07 * rnd()); G.fillRect(x0 + rnd() * 256, y0 + rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
      for (let i = 0; i < 30; i++) blob(G, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 1.6, 0.15 + rnd() * 0.2, 0.1 + rnd() * 0.15, rnd() < 0.5 ? '0,0,0' : '255,255,255', 0.08);
      // 光の当たる所（額・頬骨・鼻筋）と、陰（目のくぼみ・鼻の下・顎の下）
      blob(G, 0, 0.5, 0.5, 0.18, '255,255,255', 0.14);
      for (const sd of [-1, 1]) {
        blob(G, sd * 0.6, 0.0, 0.2, 0.1, '255,255,255', 0.14);
        blob(G, sd * 0.33, 0.19, 0.2, 0.12, '0,0,0', 0.42);           // 目のくぼみ
        blob(G, sd * 0.36, 0.3, 0.2, 0.06, '0,0,0', 0.25);             // 眉の下の影
        blob(G, sd * 0.6, -0.34, 0.2, 0.16, '0,0,0', 0.1 + age * 0.06);  // 頬の下のこけ
        // 目（遠くの兵のため。近くでは目玉がのる）
        line(G, [[sd * 0.2, 0.175], [sd * 0.33, 0.19], [sd * 0.46, 0.18]], '20,14,10', 0.7, 1.9);
        // 眉
        line(R, [[sd * 0.16, 0.3], [sd * 0.32, 0.34], [sd * 0.5, 0.31]], '255,255,255', 0.6, 2.1);
        // ほうれい線
        line(G, [[sd * 0.17, -0.1], [sd * 0.26, -0.24], [sd * 0.3, -0.38]], '0,0,0', 0.12 + age * 0.14, 2 + age);
        if (age >= 1) line(G, [[sd * 0.24, 0.1], [sd * 0.34, 0.08], [sd * 0.44, 0.1]], '0,0,0', 0.18 + age * 0.1, 1.4);   // 目の下のたるみ
        if (age >= 2) for (let k = 0; k < 3; k++) line(G, [[sd * 0.55, 0.22 - k * 0.04], [sd * 0.68, 0.24 - k * 0.06]], '0,0,0', 0.35, 1.2);   // 目尻のしわ
        if (age >= 2) line(G, [[sd * 0.22, -0.4], [sd * 0.25, -0.52]], '0,0,0', 0.3, 1.4);
      }
      blob(G, 0, -0.2, 0.1, 0.05, '0,0,0', 0.3);          // 鼻の下
      line(G, [[-0.2, -0.34], [0, -0.33], [0.2, -0.34]], '30,16,12', 0.32, 1.6);   // 口（濃い線は描いた顔に見えるので、口角の陰ほどに）
      blob(G, 0, -0.45, 0.16, 0.05, '0,0,0', 0.25);       // 下唇の下
      // 顎の下と首は暗い
      { const gr = G.createLinearGradient(0, P(0, -0.8)[1], 0, P(0, -1.3)[1]); gr.addColorStop(0, gray(0, 0)); gr.addColorStop(1, gray(0, 0.4)); G.fillStyle = gr; G.fillRect(x0, y0, 256, 256); }
      // 額のしわ
      if (age >= 1) for (let k = 0; k < (age === 2 ? 4 : 2); k++) line(G, [[-0.45, 0.5 + k * 0.07], [-0.15, 0.53 + k * 0.07], [0.15, 0.52 + k * 0.07], [0.45, 0.5 + k * 0.07]], '0,0,0', 0.2 + age * 0.08, 1.3);
      // 既存の八枚に日焼けと治った傷を描く。部品も材質も増やさない。
      blob(G, 0, 0.57, 0.7, 0.24, '0,0,0', 0.05 + (t % 3) * 0.035);
      for (const sd of [-1, 1]) blob(G, sd * 0.64, -0.02, 0.22, 0.18, '0,0,0', 0.04 + (t % 3) * 0.025);
      const scar = t === 2 ? [[0.48, 0.2], [0.58, -0.12], [0.63, -0.28]]
        : t === 5 ? [[-0.2, 0.62], [-0.28, 0.39], [-0.35, 0.25]]
        : t === 7 ? [[-0.62, -0.03], [-0.49, -0.22], [-0.38, -0.4]] : null;
      if (scar) { line(G, scar, '0,0,0', 0.22, 2.4); line(G, scar, '255,255,255', 0.35, 1.0); }
      // 髪と髭（赤＝髪の色）：画素ごとに θ・φ を求めて塗る
      const img = R.getImageData(x0, y0, 256, 256);
      const stub = [0, 0.5, 0.55, 0.45, 0.4, 0.3, 0.45, 0.3][t];
      const mus = [0, 0, 0, 1, 1, 1, 1, 1][t], goat = [0, 0, 0, 0, 1, 0, 1, 0][t], full = [0, 0, 0, 0, 0, 1, 0, 1][t];
      for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
        const th = faceTh((px + 0.5) / 256), ph = (0.5 - (py + 0.5) / 256) * Math.PI, at = Math.abs(th);
        let m = 0;
        // 月代（剃った頭頂）はうっすら、横と後ろは髪
        const hairTop = 0.62 + 0.75 * Math.min(1, Math.max(0, (at - 1.3) / 1.4));
        if (at > 1.18 && ph > -0.42 && ph < hairTop) m = 1;
        else if (ph > 0.72 && at <= 1.18) m = 0.2;
        if (at > 1.02 && at < 1.3 && ph > -0.12 && ph < 0.5) m = Math.max(m, 0.9);   // 鬢
        // 髭の生える所：頬の下から顎、口の周り
        const zone = ph < -0.06 && at < 1.28 && !(ph > -0.28 && ph < -0.02 && at < 0.3) && ph > -1.35 - 0 && (ph < -0.12 || at > 0.55);
        const lip = ph > -0.4 && ph < -0.27 && at < 0.2;
        const n = rnd();
        if (zone && !lip) m = Math.max(m, stub * (0.55 + n * 0.45) * (ph < -0.2 || at > 0.7 ? 1 : 0.6));
        if (mus && ph > -0.3 && ph < -0.2 && at < 0.3 + (ph + 0.3) * -1.5) m = Math.max(m, 0.85 + n * 0.15);
        if (mus && ph > -0.34 && ph < -0.22 && at > 0.2 && at < 0.36) m = Math.max(m, 0.7 * (0.5 + n * 0.5));
        if (goat && ph < -0.55 && at < 0.28) m = Math.max(m, 0.8 + n * 0.2);
        if (full && zone && !lip && (ph < -0.3 || at > 0.5)) m = Math.max(m, 0.82 + n * 0.18);
        const o = (py * 256 + px) * 4;
        const v = Math.max(img.data[o] / 255, m) * 255;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      }
      R.putImageData(img, x0, y0);
      // 汚れ・汗（頬・額・顎）
      for (let i = 0; i < 9; i++) blob(B, (rnd() - 0.5) * 1.8, -0.6 + rnd() * 1.2, 0.12 + rnd() * 0.2, 0.06 + rnd() * 0.12, '255,255,255', 0.5);
    });
  }
  // 無地（馬・旗竿など模様の要らない物）
  G.fillStyle = gray(LUM0); G.fillRect(...REG.plain); R.fillStyle = '#000'; R.fillRect(...REG.plain); B.fillStyle = '#000'; B.fillRect(...REG.plain);

  // 三枚を一枚の絵にまとめる
  const d = cv.map((c) => c.getImageData(0, 0, AW, AH).data);
  const out = cv[0].createImageData(AW, AH);
  for (let i = 0; i < AW * AH; i++) { const o = i * 4; out.data[o] = d[0][o]; out.data[o + 1] = d[1][o]; out.data[o + 2] = d[2][o]; out.data[o + 3] = 255; }
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  c.getContext('2d').putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  // 凹凸の絵（明るさ＝高さとして傾きを求める）：小札の段・札の境・鋲・鎖の網目・篠・筋兜の筋
  const G0 = d[1], nd = cv[0].createImageData(AW, AH);
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const i = y * AW + x;
    // 顔と無地は弱く、布は少し、甲冑の模様は強く
    const k = (y < 512 && x >= 1024) ? 0.8 : (y >= 768 && x >= 1024 && x < 1280) ? 0 : (y >= 512 && y < 768 && x >= 1024 && x < 1280) ? 1.5 : 3.2;
    const hx = (G0[(y * AW + Math.min(AW - 1, x + 1)) * 4] - G0[(y * AW + Math.max(0, x - 1)) * 4]) / 255;
    const hy = (G0[(Math.min(AH - 1, y + 1) * AW + x) * 4] - G0[(Math.max(0, y - 1) * AW + x) * 4]) / 255;
    let nx = -hx * k, ny = hy * k, nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const o = i * 4; nd.data[o] = (nx * 0.5 + 0.5) * 255; nd.data[o + 1] = (ny * 0.5 + 0.5) * 255; nd.data[o + 2] = (nz * 0.5 + 0.5) * 255; nd.data[o + 3] = 255;
  }
  const nc = document.createElement('canvas'); nc.width = AW; nc.height = AH;
  nc.getContext('2d').putImageData(nd, 0, 0);
  const ntex = new THREE.CanvasTexture(nc);
  ntex.anisotropy = 4;
  ntex.colorSpace = THREE.NoColorSpace;
  ATLAS_N = ntex;
  return tex;
}
let ATLAS_N = null;

// 素材の種類（頂点ごとに持たせ、光の返り方を変える）：布・漆・肌・鉄・金・木・藁
export const MK = { cloth: 0, lac: 1, skin: 2, iron: 3, gold: 4, wood: 5, straw: 6, eye: 7 };
const GOLDS = new Set([0xc9a24a, 0xd4ab4e, 0xe0bc5a, 0xf0cc62, 0xa8893f, 0xc2a25a, 0xb08a3a]);
const IRONS = new Set([0x25282b, 0x2e3236, 0xa7abad, 0xb5b9bb, 0x2a2420, 0x2a2622, 0x1d1c1a, 0x3a3e42]);
const WOODS = new Set([0x3b2a1a, 0x3a2c1c, 0x2a1c10, 0x5a4030, 0x2b1f16]);
const SKINS = new Set([0xb58c68, 0xa87f5c, 0xc09a74, 0x9c7453, 0xb88e6a]);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeAtlas(), normalMap: ATLAS_N, normalScale: new THREE.Vector2(1, 1), roughness: 0.9, metalness: 0 });
MAT.defines = { UNIT_HQ: 1 };
// 兵の材質（humans.js の甲冑もこれで描く）
export const UNIT_MAT = MAT;
let NANBAN_MAT = null;
// 使い込んだ銀と金だけ反射を鈍くする。兵の共通材質をもとに一つだけ共有。
export function nanbanMaterial() {
  if (!NANBAN_MAT) {
    NANBAN_MAT = MAT.clone();
    NANBAN_MAT.onBeforeCompile = (sh, r) => {
      MAT.onBeforeCompile(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('k == 3 ? 0.4 : k == 4 ? 0.28', 'k == 3 ? 0.64 : k == 4 ? 0.6');
    };
    NANBAN_MAT.customProgramCacheKey = () => 'nanban';
  }
  return NANBAN_MAT;
}
// 雨に濡れると、甲冑も布も少し照る
export const UNIT_WET = { value: 0 };
// 夜の近い兵だけに輪郭の補光を回す。通常・束・低画質の材質で共有する。
export const UNIT_NIGHT = { value: 0 };
export const UNIT_NIGHT_FOCUS = { value: new THREE.Vector3() };
// 戦の経過による汚れ。近くの人と軽い兵で同じ値を使い、材質は増やさない。
export const UNIT_GRIME = { value: 0 };
MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uWet = UNIT_WET;
  sh.uniforms.uNightContour = UNIT_NIGHT;
  sh.uniforms.uNightFocus = UNIT_NIGHT_FOCUS;
  sh.uniforms.uBattleGrime = UNIT_GRIME;
  sh.vertexShader = 'attribute float mtl;\nattribute vec3 col2;\nvarying float vMtl;\nvarying vec3 vCol2;\nvarying vec3 vObjP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMtl = mtl; vCol2 = col2; vObjP = position;');
  sh.fragmentShader = `uniform float uWet, uBattleGrime, uNightContour;
uniform vec3 uNightFocus;
varying float vMtl;
varying vec3 vCol2;
varying vec3 vObjP;
float uHb(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float uVn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uHb(i), uHb(i + vec3(1,0,0)), f.x), mix(uHb(i + vec3(0,1,0)), uHb(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(uHb(i + vec3(0,0,1)), uHb(i + vec3(1,0,1)), f.x), mix(uHb(i + vec3(0,1,1)), uHb(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float mkRough(int k) { return k == 1 ? 0.3 : k == 2 ? 0.58 : k == 3 ? 0.4 : k == 4 ? 0.28 : k == 5 ? 0.8 : k == 6 ? 0.97 : k == 7 ? 0.18 : 0.93; }
float mkMetal(int k) { return k == 3 ? 0.62 : k == 4 ? 0.92 : k == 1 ? 0.06 : 0.0; }
` + sh.fragmentShader
    .replace('#include <map_fragment>', `
      vec4 txA = texture2D(map, vMapUv);
      float mA = floor(vMtl + 0.001);
      int nA = int(mA);
      int mkA = nA - (nA / 8) * 8;
      int mkB = nA / 8;
      float dirtA = clamp((vMtl - mA) / 0.9, 0.0, 1.0);`)
    .replace('#include <color_fragment>', `
      vec3 baseC = mix(vColor.rgb, vCol2, txA.r) * (txA.g * ${(255 / LUM0).toFixed(4)});
      float dd = clamp(txA.b * dirtA * 1.3, 0.0, 1.0);
      baseC = mix(baseC, vec3(0.075, 0.058, 0.04) * (0.7 + 0.5 * txA.g), dd * 0.85);
      baseC *= 1.0 - uWet * (mkA == 0 ? 0.22 : 0.06);
      // 甲冑の泥はねと擦れ。絵の既存の斑を使い、細かな雑音の計算を増やさない。
      if (mkA == 1 || mkA == 3) {
        float mud = smoothstep(0.1, 0.7, txA.b) * uBattleGrime;
        float splash = smoothstep(0.7, 0.92, txA.r) * smoothstep(0.9, 0.4, vObjP.y) * uBattleGrime;
        float scuff = smoothstep(0.75, 0.95, txA.r) * uBattleGrime * (1.0 - splash);
        baseC = mix(baseC, vec3(0.1, 0.078, 0.055), clamp(mud * 0.45 + splash * 0.3, 0.0, 0.65));
        baseC = mix(baseC, vec3(0.24, 0.17, 0.1), scuff * 0.28);
        dd = clamp(dd + mud * 0.35 + splash * 0.25, 0.0, 1.0);
      }
      diffuseColor.rgb *= baseC;`)
    .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = mix(mkRough(mkA), mkRough(mkB), txA.r);
      roughnessFactor = mix(roughnessFactor, 0.97, dd * 0.7);
      roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : 0.4);`)
    .replace('#include <metalnessmap_fragment>', `
      float metalnessFactor = mix(mkMetal(mkA), mkMetal(mkB), txA.r) * (1.0 - dd);`)
    // 使い込んだ道具の手触り（人と装備を「塗った板」に見せない）：
    // ・上を向いた面（笠・兜の鉢・肩・胴の上）に土埃が積もり、艶が消える
    // ・漆は二層：下地の荒れた照りの上に、擦れていない所だけ鋭い照り。擦れた所は艶が鈍る
    // ・鉄は所々に赤い錆、布は大きな色むら
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef UNIT_HQ
      {
        int mk = txA.r > 0.5 ? mkB : mkA;
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float upN = dot(normal, upV);
        float nz = uVn(vObjP * 11.0), nz2 = uVn(vObjP * 43.0 + 5.0);
        float dust = smoothstep(0.5, 0.95, upN) * smoothstep(0.3, 0.8, nz) * (0.25 + dirtA * 0.5) * (1.0 - uWet);
        if (mk == 7) dust = 0.0;
        if (mk == 1) {
          float worn = smoothstep(0.45, 0.8, nz2) * 0.6 + dd;
          roughnessFactor = mix(0.3, 0.62, clamp(worn, 0.0, 1.0));
          roughnessFactor = mix(roughnessFactor, 0.7, smoothstep(0.3, 0.85, upN) * 0.6 * (1.0 - uWet));
        } else if (mk == 3) {
          float rust = smoothstep(0.6, 0.85, uVn(vObjP * 17.0 + 11.0)) * (0.4 + dirtA * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.085, 0.035), rust * 0.7);
          metalnessFactor *= 1.0 - rust * 0.8; roughnessFactor = mix(roughnessFactor, 0.9, rust);
        } else if (mk == 0) {
          diffuseColor.rgb *= 0.88 + nz * 0.24;
          // 布の縦のしわ（重さで垂れる襞）：谷を暗く、法線を傾けて光で凹凸を見せる（板に見せない）
          float fo = smoothstep(0.2, 0.8, uVn(vObjP * vec3(34.0, 3.5, 34.0)));
          diffuseColor.rgb *= 0.84 + fo * 0.22;
          float hB = fo * 0.007;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float fdet = dot(sx, r1) * faceDirection;
          normal = normalize(abs(fdet) * normal - sign(fdet) * (dFdx(hB) * r1 + dFdy(hB) * r2));
        }
        if (mk == 1) dust *= 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.16, 0.145) * (0.8 + 0.4 * nz2), dust * 0.35);
        roughnessFactor = mix(roughnessFactor, 0.9, dust * 0.9);
        metalnessFactor *= 1.0 - dust * 0.7;
      }
      #endif`)
    // 漆と鉄は、空の映り込みが面いっぱいに広がると灰色の板に見えるので、映り込みを抑えて黒を深くする（日の照りは鋭いまま）
    .replace('#include <opaque_fragment>', `
      // 自分から三十メートルまでは補光を保ち、その外で静かに薄める。
      float nightNear = clamp(uNightContour, 0.0, 1.0) * (1.0 - smoothstep(30.0, 38.0, length(vViewPosition - uNightFocus)));
      float nightRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      // 白い光をそのまま足すと黒い具足まで白くなる。絵と頂点色を保った散乱光にする。
      outgoingLight += diffuseColor.rgb * vec3(0.55, 0.65, 0.8) * nightNear * (0.15 + 0.65 * nightRim);
      #include <opaque_fragment>`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { int mkS = txA.r > 0.5 ? mkB : mkA; if (mkS == 1 || mkS == 3) reflectedLight.indirectSpecular *= 0.4 + uWet * 0.6;
        // 上を向いた漆（陣笠の上面・兜の鉢）は空を丸ごと映して薄紫に浮くので、映り込みをさらに削る
        if (mkS == 1) { float upS = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); reflectedLight.indirectSpecular *= mix(1.0, 0.35, smoothstep(0.2, 0.8, upS) * (1.0 - uWet)); } }`);
};
// 軽い兵をまとめて描く InstancedMesh 用の兵の材質（MAT と同じ中身・同じ defines）。
//   同じ材質を一人ずつの形と InstancedMesh の両方に使うと、描くたびにシェーダーを選び直す手間が掛かる（毎コマ百回以上）ので分ける
export const MAT_I = MAT.clone();
MAT_I.defines = MAT.defines; MAT_I.onBeforeCompile = MAT.onBeforeCompile;
// 画質「低」：色の表から頂点色を引く束用の材質（unit_pal.js）。instanceColor.x が表の行、pslot が行の中の列
export const PAL_U = { value: null };
export const MAT_P = MAT.clone();
MAT_P.defines = MAT.defines;
MAT_P.onBeforeCompile = (sh) => {
  MAT.onBeforeCompile(sh);
  sh.uniforms.uPal = PAL_U;
  sh.vertexShader = 'attribute float pslot;\nuniform sampler2D uPal;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n { ivec2 pc = ivec2(int(pslot + 0.5) * 2, int(instanceColor.x + 0.5)); vColor = texelFetch(uPal, pc, 0).rgb; vCol2 = texelFetch(uPal, pc + ivec2(1, 0), 0).rgb; }');
};
const geoCache = new Map();
const flagMatCache = new Map();
const flagGeo = new THREE.PlaneGeometry(0.36, 0.72, 8, 8);   // はためくよう細かく割る
flagGeo.translate(0.18, 0, 0);

// 部品に色・素材・模様の場所を持たせる
// o：mk 素材、c2 二つめの色、mk2 二つめの素材、reg 模様の場所、ru/rv 模様のどこを使うか、flipV 上下を返す、dirt 汚れ
let DIRT = 0.4;
function P(geo, hex, o = {}) {
  const g = geo;
  const n = g.attributes.position.count;
  const kind = o.mk ?? (GOLDS.has(hex) ? MK.gold : IRONS.has(hex) ? MK.iron : WOODS.has(hex) ? MK.wood : SKINS.has(hex) ? MK.skin : MK.cloth);
  const k2 = o.mk2 ?? kind;
  g.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(n).fill(kind + k2 * 8 + Math.min(1, o.dirt ?? DIRT) * 0.9), 1));
  const c = new THREE.Color(hex), c2 = new THREE.Color(o.c2 ?? hex);
  const a = new Float32Array(n * 3), b = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; b[i * 3] = c2.r; b[i * 3 + 1] = c2.g; b[i * 3 + 2] = c2.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('col2', new THREE.BufferAttribute(b, 3));
  const uv = new Float32Array(n * 2);
  const src = g.attributes.uv;
  const reg = typeof o.reg === 'string' ? REG[o.reg] : o.reg;
  if (reg && src) {
    const [x, y, w, h] = reg;
    const u0 = (x + 1.5) / AW, u1 = (x + w - 1.5) / AW, v0 = 1 - (y + h - 1.5) / AH, v1 = 1 - (y + 1.5) / AH;
    const [ra, rb] = o.ru || [0, 1], [va, vb] = o.rv || [0, 1];
    for (let i = 0; i < n; i++) {
      let s = src.getX(i), t = src.getY(i);
      if (o.swap) { const q = s; s = t; t = q; }
      if (o.flipV) t = 1 - t;
      s = Math.min(1, Math.max(0, ra + (rb - ra) * s)); t = Math.min(1, Math.max(0, va + (vb - va) * t));
      uv[i * 2] = u0 + (u1 - u0) * s; uv[i * 2 + 1] = v0 + (v1 - v0) * t;
    }
  } else for (let i = 0; i < n; i++) { uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// 前からある書き方（armor＝小札の模様）
function paint(geo, hex, armor = false, mk) { return P(geo, hex, armor ? { mk: mk ?? MK.lac, reg: 'sugake', mk2: MK.cloth } : { mk }); }

function at(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}
// 部品をまとめる（番号付きのまま合わせて、頂点を少なく保つ）
function merge(parts) {
  for (const p of parts) {
    if (!p.index) { const n = p.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; p.setIndex(new THREE.BufferAttribute(ix, 1)); }
    for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv', 'color', 'col2', 'mtl'].includes(k)) p.deleteAttribute(k);
  }
  return mergeGeometries(parts);
}
// 二点を結ぶ円柱（腕・脚の骨組み）
function limb(a, b, r1, r2, seg = 7) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r2, r1, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
// 楕円の玉
function ball(rx, ry, rz, ws = 8, hs = 6) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
// 格子の曲面（u は横、v は上下、どちらも 0..1）。fn(u, v) → [x, y, z]
function surf(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; const p = fn(u, v); pos.push(p[0], p[1], p[2]); uv.push(u, v); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 前（+z）を中心にした円柱の一部（center＝向き。π なら背）
function arcCyl(rt, rb, h, seg, L, center = 0) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, true, center - L / 2, L); }
// 水平の輪の一部（前を中心に）
function arcRing(r, tube, L, center = 0, seg = 12) { const g = new THREE.TorusGeometry(r, tube, 4, seg, L); g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2 - L / 2 + center); return g; }
// 板の形を押し出す（鍬形・前立）
function blade(pts, depth = 0.004, curve = 6) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------- 顔 ----------------
// 顔の形の値：w 幅、jaw えら、chin 顎先、cheek 頬骨、gaunt 頬のこけ、brow 眉の張り、nose 鼻の高さ、nw 鼻の幅、eye 目の細さ、t 模様（年と髭）、hair 髪の色
const HAIR = { black: 0x15110d, dark: 0x1e1812, grey: 0x4a4640, white: 0x9a948a };
const FACES = [
  { w: 0.95, jaw: 0.6, chin: 0.8, cheek: 1.1, gaunt: 0.9, brow: 0.9, nose: 0.9, nw: 1.0, eye: 1.0, t: 1 },
  { w: 1.0, jaw: 1.0, chin: 0.6, cheek: 1.0, gaunt: 0.4, brow: 1.1, nose: 0.8, nw: 1.15, eye: 1.1, t: 2 },
  { w: 1.03, jaw: 1.2, chin: 1.0, cheek: 1.2, gaunt: 0.3, brow: 1.2, nose: 0.9, nw: 1.1, eye: 0.9, t: 3 },
  { w: 0.94, jaw: 0.7, chin: 1.1, cheek: 0.8, gaunt: 0.5, brow: 0.9, nose: 1.1, nw: 0.95, eye: 1.0, t: 0 },
  { w: 1.0, jaw: 1.0, chin: 0.9, cheek: 1.25, gaunt: 0.7, brow: 1.1, nose: 1.0, nw: 1.0, eye: 1.15, t: 4 },
  { w: 1.02, jaw: 1.1, chin: 0.8, cheek: 1.0, gaunt: 0.4, brow: 1.0, nose: 0.85, nw: 1.2, eye: 1.0, t: 5 },
  { w: 0.96, jaw: 0.8, chin: 0.9, cheek: 1.35, gaunt: 1.0, brow: 1.25, nose: 1.0, nw: 1.0, eye: 1.2, t: 6, hair: HAIR.grey },
  { w: 0.98, jaw: 0.9, chin: 0.7, cheek: 1.0, gaunt: 0.6, brow: 1.0, nose: 0.9, nw: 1.05, eye: 0.95, t: 1 },
  { w: 1.05, jaw: 1.25, chin: 0.9, cheek: 1.1, gaunt: 0.2, brow: 1.3, nose: 0.8, nw: 1.25, eye: 1.1, t: 2 },
  { w: 0.97, jaw: 0.85, chin: 1.0, cheek: 1.15, gaunt: 0.8, brow: 1.0, nose: 1.05, nw: 1.0, eye: 1.0, t: 7, hair: HAIR.grey },
  { w: 0.99, jaw: 0.9, chin: 1.2, cheek: 0.9, gaunt: 0.5, brow: 0.95, nose: 0.95, nw: 1.05, eye: 1.05, t: 3 },
  { w: 0.93, jaw: 0.7, chin: 0.9, cheek: 1.2, gaunt: 1.0, brow: 1.1, nose: 1.0, nw: 0.95, eye: 1.1, t: 1 },
];
// 本人の顔：若く引き締まり、無精髭。眉と目元をしっかり
const PLAYER_FACE = { w: 0.97, jaw: 1.0, chin: 1.05, cheek: 1.15, gaunt: 0.75, brow: 1.2, nose: 1.05, nw: 1.0, eye: 1.05, t: 1 };
const HC = { x: 0, y: 1.6, z: 0.012 };   // 頭の中心
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 頭の面の点（θ：正面 0、φ：上下）。形の値 F で彫る
function headPt(th, ph, F, out = [0, 0, 0]) {
  const c = Math.cos(ph), s = Math.sin(ph);
  let x = Math.sin(th) * c, y = s, z = Math.cos(th) * c;
  const front = Math.max(0, Math.cos(th));
  const G = (a, b, sa, sb) => Math.exp(-((th - a) ** 2) / (2 * sa * sa) - ((ph - b) ** 2) / (2 * sb * sb));
  const G2 = (a, b, sa, sb) => G(a, b, sa, sb) + G(-a, b, sa, sb);
  const low = sm(0.0, -1.25, ph);
  let rx = 0.104 * F.w, ry = 0.13, rz = 0.117;
  if (z < 0) rz *= 1.08;                     // 後頭部の張り
  x *= rx * (1 - 0.26 * low * (1.25 - 0.35 * F.jaw)); y *= ry; z *= rz;
  y -= 0.018 * low * front;                  // 顔を少し長く
  z += 0.02 * low * front * F.chin * sm(-0.5, -1.0, ph);   // 顎先
  z -= 0.014 * front * front * (1 - low);    // 顔の前は平らに
  const hx = Math.sin(th), hz = Math.cos(th);
  let out_ = 0;
  out_ += 0.008 * F.cheek * G2(0.62, -0.02, 0.24, 0.16);   // 頬骨
  out_ -= 0.007 * F.gaunt * G2(0.62, -0.34, 0.2, 0.14);    // 頬のこけ
  out_ += 0.008 * F.jaw * G2(1.12, -0.62, 0.3, 0.2);       // えら
  out_ -= 0.004 * G2(1.08, 0.32, 0.2, 0.2);                // こめかみ
  x += hx * out_; z += hz * out_;
  z += 0.009 * F.brow * front * G(0, 0.36, 0.6, 0.07);     // 眉の張り
  z -= 0.011 * G2(0.33, 0.18, 0.13, 0.08);                 // 目のくぼみ
  z += 0.009 * G(0, -0.36, 0.3, 0.14);                     // 口もと
  z += 0.006 * G(0, 0.14, 0.09, 0.1);                      // 鼻の付け根
  out[0] = HC.x + x; out[1] = HC.y + y; out[2] = HC.z + z;
  return out;
}
// 頭の外向きの向き（θ）
const hdir = (th) => [Math.sin(th), Math.cos(th)];

function headGeometry(fkey, F, skin, hair, hi, dirt) {
  const key = 'h' + fkey + '|' + skin + '|' + hair + '|' + (hi ? 1 : 0);
  if (geoCache.has(key)) return geoCache.get(key);
  DIRT = dirt;
  const parts = [];
  const sk = { mk: MK.skin, reg: 'skin', mk2: MK.cloth, c2: hair };
  const lipC = new THREE.Color(skin).lerp(new THREE.Color(0x7a3a30), 0.32).getHex();
  // 首（太さは体格で）
  const nr = 0.052 * (F.neck || 1);
  parts.push(P(limb([0, 1.43, 0.0], [0, 1.555, 0.012], nr * 1.15, nr, hi ? 12 : 6), skin, sk));
  if (hi) parts.push(P(at(ball(0.012, 0.016, 0.01), 0, 1.5, 0.05 * (F.neck || 1)), skin, sk));   // のどぼとけ
  // 頭：顔の模様の座標で、正面ほど細かく
  const nu = hi ? 30 : 12, nv = hi ? 22 : 9;
  const head = surf(nu, nv, (u, v) => headPt(faceTh(u), (v - 0.5) * Math.PI * 0.999, F));
  parts.push(P(head, skin, { ...sk, reg: faceReg(F.t) }));
  const p = (th, ph) => headPt(th, ph, F);
  if (hi) {
    const eyeW = 0.0125, eh = 0.56 / (F.eye || 1);
    for (const sd of [-1, 1]) {
      const e = p(sd * 0.33, 0.175);
      const [dx, dz] = hdir(sd * 0.33);
      // 目玉と、上下のまぶた。白目は眉の陰で暗く、細い切れ長に（白く丸い目は描いた人形の顔に見えた。10/7 kaito）
      parts.push(P(at(ball(eyeW * 0.9, eyeW * eh * 0.7, eyeW * 0.65), e[0] - dx * 0.0045, e[1] - 0.0006, e[2] - dz * 0.0045), 0x7c6e60, { mk: MK.eye }));
      parts.push(P(at(ball(0.0056, 0.0052 * Math.min(1, eh * 1.3), 0.0036), e[0] + dx * 0.0028, e[1] - 0.0008, e[2] + dz * 0.0028), 0x1a110b, { mk: MK.eye }));
      const lid = ball(0.0152, 0.0078, 0.0095, 10, 6); lid.rotateZ(sd * -0.1);
      parts.push(P(at(lid, e[0] + dx * 0.0024, e[1] + 0.0036, e[2] + dz * 0.0024), skin, sk));
      parts.push(P(at(ball(0.0135, 0.005, 0.008, 10, 5), e[0] + dx * 0.0016, e[1] - 0.0054, e[2] + dz * 0.0016), skin, sk));
      const lash = new THREE.BoxGeometry(0.024, 0.0014, 0.003); lash.rotateZ(sd * 0.1); lash.rotateY(sd * 0.33);
      parts.push(P(at(lash, e[0] + dx * 0.0074, e[1] + 0.0004, e[2] + dz * 0.0074), 0x2a1c14, { mk: MK.cloth }));
      // 眉（髪の色）
      const b = p(sd * 0.32, 0.335);
      const brow = ball(0.02, 0.0042 * (F.browT || 1), 0.006, 8, 4); brow.rotateZ(sd * -0.12); brow.rotateY(sd * 0.32);
      parts.push(P(at(brow, b[0] + dx * 0.004, b[1], b[2] + dz * 0.004), hair, { mk: MK.cloth, reg: 'hair' }));
      // 耳：丸い耳たぶ・外の縁・内のくぼみ（僧兵は裹頭の中なので付けない）
      if (F.monk) continue;
      const ea = sd * 1.52, er = p(ea, 0.02);
      const [ex, ez] = hdir(ea);
      const ear = ball(0.01, 0.026, 0.017, 8, 6); ear.rotateY(ea); ear.rotateX(-0.12);
      parts.push(P(at(ear, er[0] + ex * 0.005, er[1], er[2] + ez * 0.005 - 0.004), skin, sk));
      const rim = new THREE.TorusGeometry(0.019, 0.0042, 4, 10, Math.PI * 1.45); rim.scale(1, 1.45, 1); rim.rotateZ(-Math.PI * 0.2); rim.rotateY(ea + Math.PI / 2 * sd - Math.PI / 2 * sd); rim.rotateY(Math.PI / 2 * sd);
      parts.push(P(at(rim, er[0] + ex * 0.01, er[1] + 0.002, er[2] + ez * 0.01 - 0.006), skin, sk));
      parts.push(P(at(ball(0.006, 0.011, 0.005, 6, 4), er[0] + ex * 0.013, er[1] - 0.002, er[2] + ez * 0.013 - 0.004), new THREE.Color(skin).multiplyScalar(0.55).getHex(), { mk: MK.skin }));
    }
    // 鼻：鼻筋・鼻先・小鼻・鼻の穴
    const nt = p(0, 0.2), tip = p(0, -0.075);
    const nh = 0.024 * F.nose, nw = F.nw;
    const bridge = limb([nt[0], nt[1] - 0.004, nt[2] + 0.001], [tip[0], tip[1] + 0.008, tip[2] + nh - 0.008], 0.0055 * nw, 0.0085 * nw, 6);
    bridge.scale(1, 1, 1);
    parts.push(P(bridge, skin, sk));
    parts.push(P(at(ball(0.0105 * nw, 0.0105, 0.011, 8, 6), tip[0], tip[1], tip[2] + nh - 0.004), skin, sk));
    for (const sd of [-1, 1]) {
      parts.push(P(at(ball(0.0085 * nw, 0.0085, 0.0095, 6, 5), sd * 0.0125 * nw, tip[1] - 0.003, tip[2] + nh * 0.45), skin, sk));
      parts.push(P(at(ball(0.0042, 0.0022, 0.0048, 6, 4), sd * 0.0065 * nw, tip[1] - 0.0095, tip[2] + nh * 0.55), 0x2a1810, { mk: MK.skin }));
    }
    // 唇と口
    const m = p(0, -0.34);
    parts.push(P(at(ball(0.021, 0.0048, 0.0075, 10, 5), m[0], m[1] + 0.0045, m[2] + 0.001), lipC, { mk: MK.skin }));
    parts.push(P(at(ball(0.018, 0.0058, 0.008, 10, 5), m[0], m[1] - 0.0045, m[2] + 0.0), lipC, { mk: MK.skin }));
    parts.push(P(at(new THREE.BoxGeometry(0.034, 0.0016, 0.004), m[0], m[1] + 0.0004, m[2] + 0.0062), 0x2a1410, { mk: MK.skin }));
    // 髭の量（口髭・顎髭・髭面）
    const mus = [3, 4, 5, 6, 7].includes(F.t), goat = [4, 6].includes(F.t), full = [5, 7].includes(F.t);
    if (mus) for (const sd of [-1, 1]) {
      const mg = ball(0.019, 0.0052, 0.007, 8, 4); mg.rotateZ(sd * -0.28);
      parts.push(P(at(mg, sd * 0.013, m[1] + 0.013, m[2] + 0.004), hair, { mk: MK.cloth, reg: 'hair' }));
    }
    if (goat) { const ch = p(0, -0.9); const cg = new THREE.ConeGeometry(0.014, 0.05, 6); cg.rotateX(Math.PI + 0.35); parts.push(P(at(cg, 0, ch[1] - 0.022, ch[2] + 0.004), hair, { mk: MK.cloth, reg: 'hair' })); }
    if (full) {
      const beard = surf(14, 7, (u, v) => { const th = (u - 0.5) * 2.5, ph = -1.3 + v * 1.0; const q = headPt(th, ph, F); const [dx, dz] = hdir(th); const k = 0.004 + 0.007 * (1 - v) * Math.cos(th * 0.8); return [q[0] + dx * k, q[1] - 0.008 * (1 - v) * Math.cos(th), q[2] + dz * k]; });
      parts.push(P(beard, hair, { mk: MK.cloth, reg: 'hair' }));
    }
    // 髪：横と後ろ（月代は剃ってある）、頭の上に髷
    if (!F.monk) {
      const hairG = surf(18, 8, (u, v) => { const th = Math.PI * 0.36 + u * Math.PI * 1.28, at = Math.abs(Math.PI - th); const top = 0.62 + 0.75 * Math.min(1, Math.max(0, (Math.PI - at - 1.3) / 1.4)); const ph = -0.4 + v * (top + 0.4); const q = headPt(th, ph, F); const [dx, dz] = hdir(th); const k = 0.004 + 0.003 * Math.sin(v * Math.PI); return [q[0] + dx * k, q[1] + 0.002, q[2] + dz * k]; });
      parts.push(P(hairG, hair, { mk: MK.cloth, reg: 'hair' }));
    }
  } else {
    // 軽い頭にも切れ長の目と口を残す。読み込み待ちや形の切り替わりで顔を失わせない。
    const tip = p(0, -0.07);
    parts.push(P(at(ball(0.011 * F.nw, 0.025, 0.018, 6, 4), 0, tip[1] + 0.01, tip[2] + 0.012), skin, sk));
    for (const sd of [-1, 1]) {
      const e = p(sd * 0.33, 0.175), b = p(sd * 0.32, 0.335);
      parts.push(P(at(new THREE.BoxGeometry(0.024, 0.003, 0.003), e[0], e[1], e[2] + 0.004, 0, sd * 0.33, sd * 0.1), 0x30231b, { mk: MK.cloth }));
      parts.push(P(at(new THREE.BoxGeometry(0.03, 0.004, 0.003), b[0], b[1], b[2] + 0.004, 0, sd * 0.32, sd * -0.12), hair, { mk: MK.cloth }));
      if (!F.monk) parts.push(P(at(ball(0.01, 0.024, 0.014, 6, 4), sd * 0.108 * F.w, 1.6, 0.0), skin, sk));
    }
    const mouth = p(0, -0.34);
    parts.push(P(at(new THREE.BoxGeometry(0.03, 0.002, 0.003), mouth[0], mouth[1], mouth[2] + 0.004), lipC, { mk: MK.skin }));
  }
  // 髷（剃った頭頂に前へ折る）と元結
  if (!F.monk) parts.push(P(limb([0, 1.715, -0.07], [0, 1.742, -0.02], 0.015, 0.017, hi ? 7 : 5), hair, { mk: MK.cloth, reg: 'hair' }));
  if (!F.monk) parts.push(P(limb([0, 1.742, -0.02], [0, 1.738, 0.05], 0.016, 0.012, hi ? 7 : 5), hair, { mk: MK.cloth, reg: 'hair' }));
  if (hi && !F.monk) parts.push(P(at(new THREE.TorusGeometry(0.017, 0.004, 4, 8), 0, 1.736, -0.03, 0.2), 0xe8e0cc, { mk: MK.cloth }));
  const g = merge(parts);
  geoCache.set(key, g);
  return g;
}

// ---------------- 兜・陣笠 ----------------
// 鍬形（片方）。s は大きさ
function kuwaBlade(s, sd) {
  // 根元は台から横へ張り出し、反って上へ伸び、先ほど幅が広がって少し外へ開く（まっすぐな棒の二本に見せない）
  const N = 9, out = [], inn = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = 0.012 + 0.078 * s * (1 - (1 - t) ** 2.4) + 0.012 * s * t ** 3, y = 0.31 * s * t ** 1.25;
    const dx = 0.078 * s * 2.4 * (1 - t) ** 1.4 + 0.036 * s * t * t, dy = 0.31 * s * 1.25 * Math.max(t, 0.02) ** 0.25;
    const l = Math.hypot(dx, dy), w = (0.006 + 0.011 * t ** 1.5) * Math.max(1, s * 0.85);
    out.push([x + (dy / l) * w, y - (dx / l) * w]); inn.push([x - (dy / l) * w, y + (dx / l) * w]);
  }
  const tip = out[N], tin = inn[N];
  const pts = [[0, -0.012], ...out, [(tip[0] + tin[0]) / 2 + 0.004 * s, (tip[1] + tin[1]) / 2 + 0.012 * s], ...inn.reverse(), [0, 0.012]];
  return blade(pts.map(([x, y]) => [x * sd, y]), 0.004, 4);
}
function hatParts(look, parts, hi) {
  const hat = look.hat;
  const T = look.tier || 0;
  const gold = 0xc9a24a, brass = 0xa8893f;
  const lace = look.lace || 0x5a4630;
  if (hat === 'jingasa' || hat === 'jingasa_n') {
    const col = look.hatColor ?? (hat === 'jingasa_n' ? 0x121110 : 0x1c1916);
    // 高さ：縁が眉の高さ。頭は笠の円錐の内に入り、頭に当てる輪（布）は円錐の内で頭の太い所に掛かる（縁の高さで頭の上に載せると、頭から浮いて見える）
    const hy = 1.655;
    if (!hi) {
      // 遠くの軽い形：なだらかな円錐と縁
      const prof = [[0.0, 0.15], [0.07, 0.132], [0.16, 0.085], [0.25, 0.03], [0.31, 0.0], [0.315, -0.01]].map(([r, y]) => new THREE.Vector2(r, y));
      parts.push(P(at(new THREE.LatheGeometry(prof.slice().reverse(), 12, Math.PI, Math.PI * 2), 0, hy, 0), col, { mk: MK.lac, reg: 'lacq', c2: 0x3e2a1e, mk2: MK.wood }));
      parts.push(P(at(new THREE.TorusGeometry(0.31, 0.011, 3, 12), 0, hy - 0.008, 0, Math.PI / 2), 0x1c1914, { mk: MK.lac }));
      return;
    }
    // 近くの陣笠（御貸具足の鉄笠・塗り笠）：浅い円錐が頂から縁へ少し反り、縁の先でわずかに上へ返る。頂に小さな座。
    // 黒漆の艶、擦れた所（縁・頂・欠け）から下塗りが出る（塗り陣笠は朱の下塗り、安い笠は紙と竹の茶）。前に小さく家紋（家ごとに金か朱）、顎紐
    const R = 0.33;
    const prof = [[0, 0.158], [0.02, 0.156], [0.05, 0.146], [0.1, 0.123], [0.16, 0.09], [0.22, 0.056], [0.27, 0.031], [0.3, 0.017], [0.318, 0.01], [0.33, 0.014]];
    const yAt = (r) => { for (let i = 1; i < prof.length; i++) if (r <= prof[i][0]) { const [ra, ya] = prof[i - 1], [rb, yb] = prof[i]; return ya + (yb - ya) * (r - ra) / (rb - ra); } return prof[prof.length - 1][1]; };
    // 回す点は下から上の順に並べる（上から上の順だと面が下を向き、上から見えるのは裏の茶色だった）
    const kasa = new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), 32, Math.PI, Math.PI * 2);
    {
      // 使い込んだ笠：縁が少し波打ち、どこかに打たれたへこみ（型で抜いたような真円の円錐に見せない）。形は人の作り分け（vi）ごと
      const p = kasa.attributes.position, uv = kasa.attributes.uv, sd = (look.vi || 0) * 1.7 + 0.4, da = sd * 2.3;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z);
        let dy = (Math.sin(a * 3 + sd) * 0.006 + Math.sin(a * 7 + sd * 2) * 0.0025) * (r / R) ** 2;
        let dd = a - da; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        dy -= 0.01 * Math.exp(-(dd * dd) / 0.05 - ((r - 0.17) ** 2) / 0.003);
        p.setY(i, p.getY(i) + dy);
        uv.setY(i, 1 - r / R);   // 絵の上下は頂からの遠さで（下の縁が絵の下）
      }
      kasa.computeVertexNormals();
    }
    parts.push(P(at(kasa, 0, hy, 0), col, { mk: MK.lac, reg: 'kasa', c2: hat === 'jingasa_n' ? 0x6a2216 : 0x4a3624, mk2: hat === 'jingasa_n' ? MK.lac : MK.wood }));
    // 裏（朱がかった茶の漆）と、縁の巻き（細い輪）
    const under = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.min(r, R - 0.004), y - 0.01)), 20);
    parts.push(P(at(under, 0, hy, 0), 0x4a1c14, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(at(new THREE.TorusGeometry(R - 0.002, 0.0065, 4, 32), 0, hy + 0.009, 0, Math.PI / 2), col, { mk: MK.lac, reg: 'kasa', c2: 0x6a2216, mk2: MK.lac, rv: [0, 0.1] }));
    // 頂の座（笠の頂を押さえる小さな丸い金具）
    parts.push(P(at(ball(0.026, 0.011, 0.026, 10, 4), 0, hy + 0.157, 0), col, { mk: MK.lac, reg: 'lacq', c2: 0x6a2216, mk2: MK.lac }));
    parts.push(P(at(new THREE.TorusGeometry(0.026, 0.003, 3, 12), 0, hy + 0.153, 0, Math.PI / 2), 0x2a2420, { mk: MK.iron }));
    // 頭に当てる輪（布）と、顎の下で結ぶ忍の緒
    parts.push(P(at(new THREE.TorusGeometry(0.106, 0.016, 5, 16), 0, hy + 0.013, 0, Math.PI / 2), 0x4a4236, { reg: 'cloth' }));
    for (const sd of [-1, 1]) parts.push(P(limb([sd * 0.1, hy, 0.0], [sd * 0.02, 1.49, 0.075], 0.0045, 0.0045, 4), 0xcfc4a8, { reg: 'cord' }));
    parts.push(P(at(ball(0.012, 0.008, 0.008), 0, 1.49, 0.078), 0xcfc4a8, { reg: 'cord' }));
    // 前に家紋（御貸具足の印）：小さく、家ごとに金か朱
    const mr = monReg(look.mon);
    if (mr) {
      const shu = KASA_SHU.has(look.mon);
      const mp = [0.21, 0.185, 0.16, 0.135].map((r) => new THREE.Vector2(r, yAt(r) + 0.0035));
      const dec = new THREE.LatheGeometry(mp, 4, -0.23, 0.46);
      parts.push(P(at(dec, 0, hy, 0), col, { mk: MK.lac, reg: mr, c2: shu ? 0xa8301c : (hat === 'jingasa_n' ? gold : 0xb08a3a), mk2: shu ? MK.lac : MK.gold, swap: false }));
    }
    if (look.tenugui) parts.push(P(at(new THREE.CylinderGeometry(0.117, 0.115, 0.03, 16, 1, true), 0, 1.655, 0.006), 0xd6ccb4, { reg: 'cloth' }));
    return;
  }
  if (hat === 'hachimaki') {
    // 鉢巻：額に巻き、後ろで結んで垂らす
    parts.push(P(at(new THREE.CylinderGeometry(0.115, 0.113, 0.032, hi ? 18 : 8, 1, true), 0, 1.66, 0.004), look.hachi || 0xd8d0bc, { reg: 'cloth' }));
    if (hi) {
      parts.push(P(at(ball(0.016, 0.014, 0.012), 0, 1.66, -0.114), look.hachi || 0xd8d0bc, { reg: 'cloth' }));
      for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.018, 0.1, 0.004), sd * 0.018, 1.612, -0.121, 0.2, 0, sd * 0.25), look.hachi || 0xd8d0bc, { reg: 'cloth' }));
    }
    return;
  }
  if (!hat || !hat.startsWith('kabuto')) return;
  const n0 = parts.length;   // ここから兜の部品（最後に頭に合わせて縮める）
  const iron = hat === 'kabuto_g' ? 0xb08a3a : hat === 'kabuto_t' ? 0x121214 : hat === 'kabuto_r' || hat === 'kabuto_tentsuki' || hat === 'kabuto_sanada' ? 0x8a1d14 : hat === 'kabuto_suwa' || hat === 'kabuto_shika' ? 0x1a1818 : hat === 'kabuto_namazu' ? 0x9a968c : look.helm || 0x25282b;
  const zunari = hat === 'kabuto' && (look.vi || 0) % 2 === 1;
  const lacqHelm = hat === 'kabuto_r' || hat === 'kabuto_suwa' || hat === 'kabuto_t' || hat === 'kabuto_shida' || hat === 'kabuto_tentsuki' || hat === 'kabuto_sanada' || hat === 'kabuto_shika' || hat === 'kabuto_bari';
  // 鉢：筋兜（縦の筋）か頭形（つるりとした形）
  const bowl = new THREE.SphereGeometry(0.19, hi ? 32 : 12, hi ? 9 : 5, Math.PI, Math.PI * 2, 0, Math.PI / 2);
  bowl.scale(1, zunari ? 0.86 : 0.94, 1.05);
  parts.push(P(at(bowl, 0, 1.66, 0), iron, { mk: lacqHelm ? MK.lac : MK.iron, reg: zunari ? 'iron' : 'suji', ru: [0, 1] }));
  if (hi) {
    // 天辺の座（八幡座）と、腰巻の帯
    parts.push(P(at(new THREE.TorusGeometry(0.022, 0.007, 5, 12), 0, 1.66 + 0.19 * (zunari ? 0.86 : 0.94) - 0.003, 0, Math.PI / 2), T >= 2 ? gold : brass, { mk: MK.gold }));
    parts.push(P(at(new THREE.CylinderGeometry(0.194, 0.196, 0.026, 32, 1, true), 0, 1.672, 0), iron, { mk: lacqHelm ? MK.lac : MK.iron, reg: 'iron' }));
    // 篠垂（前の金の筋）：侍大将から
    if (T >= 2 && !zunari) for (const a of [-0.28, 0, 0.28]) {
      const q = (ph) => [0.192 * Math.sin(a) * Math.cos(ph), 1.66 + 0.19 * 0.94 * Math.sin(ph), 0.192 * 1.05 * Math.cos(a) * Math.cos(ph)];
      parts.push(P(limb(q(1.2), q(0.35), 0.0035, 0.006, 4), gold, { mk: MK.gold }));
    }
  }
  // 眉庇（前の庇）：少し反らせ、縁に金の覆輪
  const visor = arcCyl(0.198, 0.235, 0.05, hi ? 10 : 5, Math.PI * 0.62, 0);
  parts.push(P(at(visor, 0, 1.672, 0.012, -0.22), iron, { mk: MK.lac, reg: 'lacq' }));
  if (hi && T >= 1) { const vr = arcRing(0.235, 0.004, Math.PI * 0.62, 0, 10); vr.translate(0, -0.025, 0); parts.push(P(at(vr, 0, 1.672, 0.012, -0.22), T >= 2 ? gold : brass, { mk: MK.gold })); }
  // 錣（しころ）：首の後ろと横を守る段。顔の前は開ける。一段ずつ小札と威糸
  const n = hi ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const sk = arcCyl(0.2 + i * 0.024, 0.222 + i * 0.024, 0.066, hi ? 16 : 8, Math.PI * 1.42, Math.PI);
    const row = 7 - i;
    parts.push(P(at(sk, 0, 1.635 - i * 0.056, -0.012 - i * 0.012), iron, { mk: MK.lac, reg: T >= 2 ? 'kebiki' : 'sugake', c2: lace, mk2: MK.cloth, rv: [row / 8, (row + 1) / 8], ru: [0, 0.6] }));
  }
  // 吹返し：錣の端を外へ折り返した板。侍大将からは家紋の金具
  for (const sd of [1, -1]) {
    // 錣の上の二段の前の端から、外へ（少し後ろへ）折り返した板。錣に付けて浮かせない
    const th = sd * Math.PI * 0.29, ry = Math.atan2(0.85, sd * 0.5);
    const ex = Math.sin(th) * 0.212, ez = Math.cos(th) * 0.212 - 0.012;
    const ox = Math.cos(ry), oz = -Math.sin(ry);   // 板の外への向き
    const fcol = hat === 'kabuto_t' ? gold : iron === 0x25282b ? 0x2a221c : iron;
    const fk = new THREE.BoxGeometry(0.066, 0.1, 0.01);
    parts.push(P(at(fk, ex + ox * 0.03, 1.6, ez + oz * 0.03, 0, ry, 0), fcol, { mk: MK.lac, reg: 'lacq' }));
    if (hi && T >= 1) {
      // 縁の覆輪と、家紋の金具
      parts.push(P(at(new THREE.BoxGeometry(0.006, 0.102, 0.013), ex + ox * 0.063, 1.6, ez + oz * 0.063, 0, ry, 0), T >= 2 ? gold : brass, { mk: MK.gold }));
      const nx = Math.sin(ry), nz = Math.cos(ry);   // 板の面の向き（前）
      const dk = new THREE.CylinderGeometry(0.019, 0.019, 0.006, 12); dk.rotateX(Math.PI / 2); dk.rotateY(ry);
      parts.push(P(at(dk, ex + ox * 0.034 + nx * 0.008, 1.61, ez + oz * 0.034 + nz * 0.008), T >= 2 ? gold : brass, { mk: MK.gold }));
    }
  }
  // 前立の台
  const disk = () => parts.push(P(at(new THREE.CylinderGeometry(0.03, 0.034, 0.014, hi ? 12 : 6), 0, 1.73, 0.19, Math.PI / 2 - 0.25), gold, { mk: MK.gold }));
  const kuwa = (s) => { for (const sd of [1, -1]) parts.push(P(at(kuwaBlade(s, sd), sd * 0.018, 1.74, 0.19, -0.18), gold, { mk: MK.gold })); };
  if (hat === 'kabuto_m') { kuwa(1); disk(); }
  if (hat === 'kabuto_b') { kuwa(1.5); disk(); }
  // 三日月の前立（侍大将）
  if (hat === 'kabuto_f') {
    disk();
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI * 1.1 + (i / 16) * Math.PI * 0.8; pts.push([Math.cos(a) * 0.2, 0.2 + Math.sin(a) * 0.2]); }
    for (let i = 16; i >= 0; i--) { const a = Math.PI * 1.1 + (i / 16) * Math.PI * 0.8; pts.push([Math.cos(a) * 0.19, 0.25 + Math.sin(a) * 0.19]); }
    parts.push(P(at(blade(pts, 0.005), 0, 1.745, 0.2, -0.15), gold, { mk: MK.gold }));
  }
  // 脇立（家老）
  if (hat === 'kabuto_w') {
    kuwa(1.2); disk();
    for (const sd of [1, -1]) parts.push(P(at(blade([[0, 0], [0.03, 0], [0.06, 0.3], [0.03, 0.34], [0.0, 0.1]].map(([x, y]) => [x * sd, y]), 0.01), sd * 0.19, 1.76, 0.0, 0, 0, -sd * 0.15), 0x1a1616, { mk: MK.lac, reg: 'lacq' }));
  }
  // 日輪の前立（城主・国持大名）
  if (hat === 'kabuto_s') {
    kuwa(1.2);
    parts.push(P(at(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 20), 0, 1.95, 0.18, Math.PI / 2), 0xb8231a, { mk: MK.lac }));
    parts.push(P(at(new THREE.TorusGeometry(0.125, 0.015, 4, 20), 0, 1.95, 0.19), gold, { mk: MK.gold }));
  }
  if (hat === 'kabuto_g') { kuwa(1.9); disk(); }
  // 赤備えの兜（山県昌景）：朱の鉢に金の大鍬形
  if (hat === 'kabuto_r') { kuwa(1.35); disk(); }
  // 諏訪法性の兜（武田勝頼）：白い毛（白熊）が背へ長く垂れ、金の鍬形と獅子の前立
  if (hat === 'kabuto_suwa') {
    kuwa(1.5);
    // 獅子の顔（金の打ち出し）：平たい顔に、張り出した眉・丸い目・獅子鼻・牙の見える口、まわりに巻き毛のたてがみ（丸い玉に点の目だけだと笑い顔に見える）
    parts.push(P(at(ball(0.052, 0.046, 0.022), 0, 1.79, 0.205), gold, { mk: MK.gold }));
    if (hi) {
      for (const sd of [-1, 1]) {
        parts.push(P(at(ball(0.02, 0.009, 0.012), sd * 0.02, 1.806, 0.224, 0, 0, sd * -0.35), gold, { mk: MK.gold }));   // 眉
        parts.push(P(at(ball(0.011, 0.009, 0.008), sd * 0.019, 1.796, 0.226), gold, { mk: MK.gold }));   // 目玉
        parts.push(P(at(ball(0.005, 0.005, 0.003), sd * 0.019, 1.796, 0.233), 0x1a1410, { mk: MK.lac }));   // 瞳
      }
      parts.push(P(at(ball(0.014, 0.011, 0.012), 0, 1.781, 0.232), gold, { mk: MK.gold }));   // 鼻
      parts.push(P(at(new THREE.BoxGeometry(0.03, 0.009, 0.01), 0, 1.767, 0.222), 0x2a1210, { mk: MK.lac }));   // 開いた口
      for (const sd of [-1, 1]) parts.push(P(at(new THREE.ConeGeometry(0.003, 0.01, 4), sd * 0.01, 1.765, 0.228, Math.PI), 0xe8e0c8, { mk: MK.lac }));   // 牙
      for (let k = 0; k < 11; k++) {   // たてがみの巻き毛
        const a = (k / 10) * Math.PI * 1.3 - Math.PI * 0.65;
        parts.push(P(at(ball(0.013, 0.013, 0.01), Math.sin(a) * 0.058, 1.79 + Math.cos(a) * 0.052, 0.198), gold, { mk: MK.gold }));
      }
    }
    const N = hi ? 40 : 16;
    // 毛は鉢の横から後ろにだけ植える（顔の横へ白く垂れて、頭巾のように見えないよう）
    for (let i = 0; i < N; i++) {
      const a = Math.PI * 0.85 + (i / (N - 1)) * Math.PI * 0.3;
      const len = 0.46 + ((i * 7) % 5) * 0.06 + (Math.abs(a - Math.PI) < 0.5 ? 0.12 : 0);
      const hair = new THREE.ConeGeometry(0.05, len, hi ? 5 : 3, 1, true);
      // 錣の外側に沿って背へ垂らす（根元は錣の外、毛先は少し外へ）
      hair.translate(0, -len / 2, 0); hair.rotateX(-0.14 - ((i * 3) % 4) * 0.03); hair.rotateY(a);
      parts.push(P(at(hair, Math.sin(a) * 0.25, 1.76, Math.cos(a) * 0.25), 0xe8e4da, { reg: 'fur', dirt: 0.2 }));
    }
    // 鉢の上の毛：前（眉庇の上）は開けて、横から後ろを覆う
    parts.push(P(at(new THREE.SphereGeometry(0.2, hi ? 16 : 8, 5, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI / 2), 0, 1.72, -0.01), 0xe8e4da, { reg: 'fur', dirt: 0.2 }));
  }
  // 歯朶の前立（徳川家康）：金の歯朶の葉を扇のように広げる
  if (hat === 'kabuto_shida') {
    disk();
    for (const sd of [1, -1]) for (let f = 0; f < 2; f++) {
      const base = sd * (0.25 + f * 0.35);
      for (let i = 0; i < (hi ? 11 : 5); i++) {
        const t = i / (hi ? 10 : 4);
        const ang = base + sd * t * 0.25;
        const R = 0.05 + t * 0.26;
        const cx = Math.sin(ang) * R, cy = Math.cos(ang) * R;
        const lf = ball(0.042 - t * 0.024, 0.011, 0.004, 5, 3);
        lf.rotateZ(-ang + sd * 0.9);
        parts.push(P(at(lf, cx, 1.76 + cy, 0.2 - t * 0.02), gold, { mk: MK.gold }));
        const lf2 = ball(0.036 - t * 0.02, 0.01, 0.004, 5, 3); lf2.rotateZ(-ang - sd * 0.9);
        parts.push(P(at(lf2, cx, 1.76 + cy, 0.2 - t * 0.02), gold, { mk: MK.gold }));
      }
      parts.push(P(at(new THREE.CylinderGeometry(0.004, 0.006, 0.3, 4), Math.sin(base + sd * 0.12) * 0.15, 1.76 + Math.cos(base + sd * 0.12) * 0.15, 0.2, 0, 0, -(base + sd * 0.12)), gold, { mk: MK.gold }));
    }
  }
  // 後光の前立（天下人）
  if (hat === 'kabuto_t') {
    kuwa(1.3); disk();
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI;
      const len = i % 2 ? 0.34 : 0.46;
      parts.push(P(at(new THREE.BoxGeometry(0.018, len, 0.012), Math.sin(a) * (0.2 + len / 2), 1.7 + Math.cos(a) * (0.2 + len / 2), -0.1, 0, 0, -a), gold, { mk: MK.gold }));
    }
  }
  // 天衝の前立（井伊直政）：金の大きな二本の板が、兜の前から高く立つ
  if (hat === 'kabuto_tentsuki') {
    disk();
    for (const sd of [1, -1]) {
      const pts = [[0, 0], [0.03, 0], [0.07, 0.2], [0.13, 0.46], [0.15, 0.56], [0.115, 0.55], [0.05, 0.28], [0.005, 0.06]].map(([x, y]) => [x * sd, y]);
      parts.push(P(at(blade(pts, 0.006), sd * 0.012, 1.745, 0.19, -0.2), gold, { mk: MK.gold }));
    }
  }
  // 鹿角（本多・真田）：黒い漆の角が兜の左右から枝を分けて立つ
  const antler = (col) => {
    for (const sd of [1, -1]) {
      const b0 = [sd * 0.1, 1.8, 0.1], b1 = [sd * 0.2, 1.98, 0.08], b2 = [sd * 0.27, 2.14, 0.0], b3 = [sd * 0.3, 2.26, -0.08];
      for (const [a, b, r1, r2] of [[b0, b1, 0.016, 0.013], [b1, b2, 0.013, 0.01], [b2, b3, 0.01, 0.005]]) parts.push(P(limb(a, b, r1, r2, hi ? 6 : 4), col, { mk: MK.lac, reg: 'lacq' }));
      // 枝（前へ一本・内へ一本）
      parts.push(P(limb(b1, [sd * 0.2, 2.1, 0.2], 0.01, 0.004, hi ? 5 : 3), col, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(limb(b2, [sd * 0.18, 2.24, 0.04], 0.008, 0.003, hi ? 5 : 3), col, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(at(ball(0.026, 0.02, 0.026), sd * 0.1, 1.8, 0.1), col, { mk: MK.lac }));
    }
  };
  if (hat === 'kabuto_shika') { antler(0x14110e); disk(); }
  // 真田の兜：鹿角に、前立は六文銭（金の銭を三つずつ二段）
  if (hat === 'kabuto_sanada') {
    antler(0x14110e);
    parts.push(P(at(new THREE.BoxGeometry(0.2, 0.12, 0.01), 0, 1.79, 0.2, -0.18), 0x14110e, { mk: MK.lac, reg: 'lacq' }));
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 0.06, y = 1.815 - Math.floor(i / 3) * 0.052;
      parts.push(P(at(new THREE.TorusGeometry(0.02, 0.0065, 4, hi ? 12 : 6), x, y, 0.21 - (y - 1.79) * 0.18, -0.18), gold, { mk: MK.gold }));
      if (hi) parts.push(P(at(new THREE.BoxGeometry(0.011, 0.011, 0.004), x, y, 0.213 - (y - 1.79) * 0.18, -0.18), 0x14110e, { mk: MK.lac }));
    }
  }
  // 馬藺の後立（木下藤吉郎）：細い金の串を背へ扇のように立て並べる
  if (hat === 'kabuto_bari') {
    kuwa(0.8); disk();
    const N = hi ? 29 : 11;
    for (let i = 0; i < N; i++) {
      const a = -Math.PI * 0.46 + (i / (N - 1)) * Math.PI * 0.92;
      const len = 0.5 + (i % 2) * 0.06;
      const g = new THREE.CylinderGeometry(0.0025, 0.006, len, 4); g.translate(0, len / 2, 0); g.rotateZ(-a);
      parts.push(P(at(g, 0, 1.78, -0.2), gold, { mk: MK.gold }));
    }
  }
  // 鯰尾の兜（前田利家）：銀に塗った長い鉢が、後ろへ反って高く伸びる
  if (hat === 'kabuto_namazu') {
    const g = new THREE.ConeGeometry(0.15, 0.62, hi ? 18 : 8, 3); g.scale(1, 1, 0.7);
    parts.push(P(at(g, 0, 2.04, -0.06, -0.18), 0xc8c4b8, { mk: MK.iron, reg: 'iron' }));
  }
  // 兜の大きさを頭に合わせる：鉢の径は頭の一回り上（幅 27cm ほど）、錣の広がり・吹返しも同じ割合で。頭の中心を支点に縮める
  const KX = 0.84, KY = 0.9, cy = 1.6, cz = 0.01;
  for (let i = n0; i < parts.length; i++) {
    const p = parts[i].attributes.position, nn = parts[i].attributes.normal;
    for (let j = 0; j < p.count; j++) p.setXYZ(j, p.getX(j) * KX, cy + (p.getY(j) - cy) * KY, cz + (p.getZ(j) - cz) * KX);
    // 面の向きも縮めた割合で直す（形を割り直すと継ぎ目が出るので）
    if (nn) for (let j = 0; j < nn.count; j++) { const x = nn.getX(j) / KX, y = nn.getY(j) / KY, z = nn.getZ(j) / KX, l = Math.hypot(x, y, z) || 1; nn.setXYZ(j, x / l, y / l, z / l); }
  }
}

// 面頬（侍・武将）。full は鼻から下を覆う面、hanbo は目の下頬（頬・鼻・顎を覆い、口もとは開く鉄の打ち出し）。口髭をつける物も
const MASK_F = { w: 1, jaw: 1, chin: 1, cheek: 1, gaunt: 0, brow: 1, nose: 1, nw: 1 };
function menpoParts(look, parts, hi) {
  const col = look.menpo;
  const style = look.menpoStyle || 'full';
  // 面の一片：θ（左右）・φ（上下）の範囲で、顔から少し浮かせた曲面。in：裏（赤漆）は内へ寄せて面の向きを返す
  const piece = (t0, t1, p0, p1, nu, nv, lift = 0, inn = false) => {
    const g = surf(nu, nv, (u, v) => { const th = t0 + (t1 - t0) * u, ph = p0 + (p1 - p0) * v; const q = headPt(th, ph, MASK_F); const [dx, dz] = hdir(th); const k = 0.017 + 0.006 * Math.cos(th) + lift - (inn ? 0.003 : 0); return [q[0] + dx * k, q[1] - 0.004, q[2] + dz * k + 0.004]; });
    if (inn) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  };
  if (style === 'hanbo') {
    // 目の下頬：鉄の打ち出しの面。目の下から頬・鼻・顎を覆い、口もとは開ける。裏は赤漆
    const iron = col, red = 0x8a1d14, im = { mk: MK.iron, reg: 'iron' };
    const segs = [[0.3, 1.4, -1.2, 0.02], [-1.4, -0.3, -1.2, 0.02], [-0.3, 0.3, -0.26, 0.0], [-0.3, 0.3, -1.2, -0.62]];
    for (const [t0, t1, p0, p1] of segs) {
      parts.push(P(piece(t0, t1, p0, p1, hi ? 7 : 3, hi ? 7 : 3), iron, im));
      if (hi) parts.push(P(piece(t0, t1, p0, p1, 5, 5, 0, true), red, { mk: MK.lac, reg: 'lacq' }));
    }
    // 打ち出しの鼻（鼻筋と小鼻）と、頬の皺
    const t = headPt(0, -0.1, MASK_F);
    parts.push(P(at(ball(0.016, 0.032, 0.02, hi ? 8 : 5, 6), 0, t[1] + 0.006, t[2] + 0.03, 0.25), iron, im));
    if (hi) for (const sd of [-1, 1]) {
      parts.push(P(at(ball(0.011, 0.009, 0.01, 6, 4), sd * 0.013, t[1] - 0.016, t[2] + 0.03), iron, im));
      // 頬の皺（打ち出しの筋）
      const c0 = headPt(sd * 0.42, -0.2, MASK_F), c1 = headPt(sd * 0.36, -0.55, MASK_F);
      parts.push(P(limb([c0[0] + sd * 0.012, c0[1], c0[2] + 0.018], [c1[0] + sd * 0.01, c1[1], c1[2] + 0.02], 0.0035, 0.003, 4), iron, im));
      // 口の上の打ち出しの髭（鉄の形）と、上の縁の赤い折り返し
      const m = headPt(sd * 0.16, -0.3, MASK_F);
      const mg = ball(0.03, 0.006, 0.008, 6, 4); mg.rotateZ(sd * -0.4);
      parts.push(P(at(mg, m[0] + sd * 0.008, m[1] - 0.004, m[2] + 0.026), iron, im));
      const e0 = headPt(sd * 0.3, 0.02, MASK_F), e1 = headPt(sd * 1.2, 0.02, MASK_F);
      parts.push(P(limb([e0[0], e0[1] - 0.004, e0[2] + 0.02], [e1[0] + sd * 0.02, e1[1] - 0.004, e1[2] + 0.005], 0.0035, 0.0035, 4), red, { mk: MK.lac }));
    }
  } else if (style !== 'tare') {
    // tare：面は付けず、喉の垂だけ（名のある武将は humans.js で実写の顔に沿う面を付ける）
    const top = -0.02;
    const g = surf(hi ? 16 : 8, hi ? 8 : 4, (u, v) => { const th = (u - 0.5) * 2.8, ph = -1.2 + v * (top + 1.2); const q = headPt(th, ph, MASK_F); const [dx, dz] = hdir(th); const k = 0.017 + 0.006 * Math.cos(th); return [q[0] + dx * k, q[1] - 0.004, q[2] + dz * k + 0.004]; });
    parts.push(P(g, col, { mk: MK.lac, reg: 'lacq', c2: 0x5a2a1c, mk2: MK.lac }));
  }
  if (style === 'full') {
    const t = headPt(0, -0.08, MASK_F);
    parts.push(P(at(ball(0.017, 0.028, 0.02, 8, 6), 0, t[1] + 0.012, t[2] + 0.034), col, { mk: MK.lac, reg: 'lacq' }));   // 鼻
    const m = headPt(0, -0.35, MASK_F);
    parts.push(P(at(new THREE.BoxGeometry(0.05, 0.007, 0.01), 0, m[1], m[2] + 0.024), 0x0a0706, { mk: MK.lac }));   // 口
    if (hi && look.tier >= 2) for (const sd of [-1, 1]) { const mg = ball(0.026, 0.006, 0.01, 6, 4); mg.rotateZ(sd * -0.35); parts.push(P(at(mg, sd * 0.02, m[1] + 0.015, m[2] + 0.028), look.tier >= 3 ? 0xd8d2c4 : 0x1a1612, { reg: 'hair' })); }
  }
  // 垂（のど）：小札の三段
  for (let i = 0; i < (hi ? 3 : 2); i++) {
    const y = headPt(0, -1.0, MASK_F)[1] - 0.012 - i * 0.03;
    parts.push(P(at(arcCyl(0.085 + i * 0.012, 0.095 + i * 0.012, 0.034, hi ? 8 : 4, Math.PI * 0.95, 0), 0, y, 0.02 + i * 0.004), col, { mk: MK.lac, reg: 'sugake', c2: look.lace, mk2: MK.cloth, rv: [(7 - i) / 8, (8 - i) / 8], ru: [0, 0.2] }));
  }
}

// ---------------- 胴・袖・草摺・陣羽織 ----------------
// 胴の形（胸が張り、腰が締まる）。継ぎ目は背に回す
const DO_PROF = [[0.2, 0.88], [0.205, 0.95], [0.212, 1.05], [0.232, 1.18], [0.248, 1.3], [0.238, 1.38], [0.19, 1.43], [0.1, 1.46]];
// rows：胴の段の数（桶側の板・小札の段）。近くの形（hi）では段ごとに下の縁が外へ出る（上の段が下の段に重なる）形にし、
// 板を貼った筒でなく、段を重ねた厚みのある胴に見せる。模様の上下（v）は高さで決め、絵の段と形の段をそろえる
function cuirass(r0, seg, rows = 0, hi = false) {
  const y0 = DO_PROF[0][1], y1 = DO_PROF[DO_PROF.length - 1][1];
  const rAt = (y) => { for (let i = 1; i < DO_PROF.length; i++) { const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i]; if (y <= yb) return ra + (rb - ra) * ((y - ya) / (yb - ya)); } return DO_PROF[DO_PROF.length - 1][0]; };
  let prof = DO_PROF.map(([r, y]) => [r, y]);
  if (hi && rows > 1) {
    // 段の境（胸板の下 1.34 まで）
    // 桶側（五段の板）は板の厚みと重なりを深く（平らな一枚の漆の板に見せない）
    const H = (y1 - y0) / rows, t = rows === 5 ? 0.012 : 0.0055;
    const pts = [];
    for (let k = 0; k < rows; k++) {
      const ya = y0 + k * H, yb = Math.min(y0 + (k + 1) * H, y1);
      if (ya >= 1.345) break;
      // 段の下の縁：外へ張り出し、上へ行くほど体へ寄る（次の段の下へ潜る）
      pts.push([rAt(ya), ya], [rAt(ya) + t, ya + 0.002], [rAt(ya + H * 0.5) + t * 0.45, ya + H * 0.5], [rAt(yb - 0.003), yb - 0.003]);
    }
    for (const [r, y] of DO_PROF) if (y > pts[pts.length - 1][1]) pts.push([r, y]);
    prof = pts;
  } else if (rows > 1) {
    // 軽い胴も各段の縁だけ残す。二点ずつで厚みを示し、細かな鋲や板は増やさない。
    const H = (y1 - y0) / rows, pts = [];
    for (let k = 0; k < rows; k++) {
      const ya = y0 + k * H, yb = Math.min(y0 + (k + 1) * H, y1);
      if (ya >= 1.345) break;
      pts.push([rAt(ya) + 0.007, ya], [rAt(yb - 0.003), yb - 0.003]);
    }
    for (const [r, y] of DO_PROF) if (y > pts[pts.length - 1][1]) pts.push([r, y]);
    prof = pts;
  }
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * r0, y)), seg, Math.PI, Math.PI * 2);
  // 模様の上下は高さで（点の数によらず、絵の段が同じ高さに来るように）
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - y0) / (y1 - y0));
  g.scale(1, 1, 0.8);
  return g;
}
// 桶側胴（縦矧）の近くの形：短冊の鉄の板を縦に並べ、隣の板へ少しずつ重ねる（板の右の縁が次の板の左の縁の上に出る）。
// 板は四通りの絵（okeV）を順に使う。胸の上と脇（1.36 より上）は一枚の漆の板。足軽の御貸具足なので家の色（armor）で塗る
const OKE_N = 26, OKE_Y0 = 0.88, OKE_Y1 = 1.36;
function okeDo(r0, armor) {
  const rAt = (y) => { for (let i = 1; i < DO_PROF.length; i++) { const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i]; if (y <= yb) return ra + (rb - ra) * ((y - ya) / (yb - ya)); } return DO_PROF[DO_PROF.length - 1][0]; };
  const ys = [0.88, 0.95, 1.0, 1.05, 1.12, 1.18, 1.24, 1.3, 1.36];
  const prof = ys.map((y) => new THREE.Vector2(rAt(y) * r0, y));
  const out = [], st = (Math.PI * 2) / OKE_N;
  for (let k = 0; k < OKE_N; k++) {
    const g = new THREE.LatheGeometry(prof, 2, Math.PI + k * st, st * 1.07);
    const p = g.attributes.position, uv = g.attributes.uv, np = prof.length;
    for (let i = 0; i < p.count; i++) {
      const f = Math.floor(i / np) / 2, x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) || 1;
      // 重なりの厚み：板の右の縁ほど外へ（裾ほど少し開く）
      const dr = 0.0015 + 0.0055 * f + 0.003 * (1 - (p.getY(i) - OKE_Y0) / (OKE_Y1 - OKE_Y0)) * f;
      p.setX(i, x * (1 + dr / r)); p.setZ(i, z * (1 + dr / r));
      uv.setXY(i, (p.getY(i) - OKE_Y0) / (OKE_Y1 - OKE_Y0), 1 - f);
    }
    g.computeVertexNormals();
    g.scale(1, 1, 0.8);
    const v = (k * 3 + 1) % 4;
    out.push(P(g, armor, { mk: MK.lac, reg: 'okeV', rv: [v / 4, (v + 1) / 4], c2: 0x4a2a1a, mk2: MK.lac }));
  }
  // 胸の上・脇・背の上の板（板の上の端にかぶせる）
  const top = [[rAt(1.345) + 0.009, 1.345], [rAt(1.36) + 0.008, 1.362], [0.238, 1.38], [0.19, 1.43], [0.1, 1.46]].map(([r, y]) => new THREE.Vector2(r * r0, y));
  const tg = new THREE.LatheGeometry(top, 28, Math.PI, Math.PI * 2); tg.scale(1, 1, 0.8);
  out.push(P(tg, armor, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
  // 腰の上の鋲の帯（板を内から留める横の帯の鋲頭が並ぶ）は絵に描いてある。裾の縁に細い覆輪
  const hem = arcRing(rAt(OKE_Y0) * r0 + 0.004, 0.004, Math.PI * 2, 0, 28); hem.scale(1, 1, 0.8);
  out.push(P(at(hem, 0, OKE_Y0 + 0.002, 0), armor, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
  return out;
}
// 陣羽織のひだ（背の角度 th と高さ y での、外への出っ張り m）
export const haoriFold = (th, y) => (0.013 * Math.sin(th * 9 + 0.6) + 0.006 * Math.sin(th * 23 + 1.7 + y * 3)) * Math.min(1, Math.max(0.15, (1.44 - y) / 0.64));
// 体つき：足軽は細く締まり、侍は厚い
const BUILD = [0.94, 1.0, 1.05, 1.08];

// grp を渡すと、その部分だけ（骨の入った人に着せるため）：base 腰と肩の下着・torso 胴まわり・hips 草摺・sodeP/sodeN 袖（+x/-x）・head 兜と面頬
function bodyGeometry(key, o, hi, grp) {
  if (o.nanban && !o.kosode) return nanbanGeometry('body', hi, grp, 0, { P, at, merge, MK, limb, ball });
  const ck = key + (hi ? '|H' : '|L') + (grp ? '|' + grp : '');
  if (geoCache.has(ck)) return geoCache.get(ck);
  if (o.sohei) return soheiBody(ck, o, hi, grp);   // 僧兵は甲冑でなく衣と袈裟
  const PT = { base: [], torso: [], hips: [], sodeP: [], sodeN: [], head: [], haori: [], back: [], koshi: [], pole: [] };
  let parts = PT.base;
  const T = o.tier || 0;
  const r0 = BUILD[T];
  const armor = o.armor, lace = o.lace;
  const under = o.cloth || 0x2b2622;   // 鎧下の布
  DIRT = o.dirt ?? [0.85, 0.6, 0.45, 0.3][T];
  const gold = 0xc9a24a, brass = 0xa8893f;
  const S = hi ? 1 : 0;
  // 胴の模様：足軽は桶側（横の板を鋲留め）か腹巻（素懸）、侍は素懸、侍大将からは毛引
  const doStyle = o.doStyle ?? (T === 0 ? ((o.vi || 0) % 3 === 2 ? 'sugake' : 'okegawa') : T === 1 ? 'sugake' : 'kebiki');
  const rows = doStyle === 'okegawa' ? [0, 1] : [0, 0.75];
  // 腰（袴の上端）と上帯
  parts.push(P(at(new THREE.CylinderGeometry(0.19 * r0, 0.2 * r0, 0.2, hi ? 14 : 8), 0, 0.82, 0), under, { reg: 'cloth' }));
  // 鎧下の肩と、首元の襟（白い襦袢がのぞく）
  // 肩は首から腕へなで下がる形に（平たい楕円の張り出しは、箱の肩に見える）
  const yoke = ball(0.23 * r0, 0.08, 0.15 * r0, hi ? 14 : 8, 5);
  { const q = yoke.attributes.position; for (let i = 0; i < q.count; i++) { const x = q.getX(i); q.setY(i, q.getY(i) - 0.9 * x * x); } yoke.computeVertexNormals(); }
  parts.push(P(at(yoke, 0, 1.435, -0.005), under, { reg: 'cloth' }));
  parts = PT.torso;
  parts.push(P(at(new THREE.CylinderGeometry(0.068, 0.1, 0.06, hi ? 14 : 8, 1, true), 0, 1.47, 0.005), under, { reg: 'cloth' }));
  if (hi) {
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.018, 0.075, 0.006), sd * 0.03, 1.46, 0.07, -0.25, 0, sd * 0.55), 0xd8d0bc, { reg: 'cloth' }));
  }
  // 胴
  if (hi && doStyle === 'okegawa') parts.push(...okeDo(r0, armor));
  else parts.push(P(cuirass(r0, hi ? 28 : 12, doStyle === 'okegawa' ? 5 : 6, hi), armor, { mk: MK.lac, reg: doStyle, c2: doStyle === 'okegawa' ? 0x4a2a1a : lace, mk2: doStyle === 'okegawa' ? MK.lac : MK.cloth, rv: rows }));
  if (doStyle === 'sugake' && T === 0) {
    // 腹巻は背で引き合わせる：背の割れ目
    parts.push(P(at(new THREE.BoxGeometry(0.012, 0.5, 0.01), 0, 1.15, -0.2 * r0 * 0.8 - 0.005), 0x0e0c0a, { mk: MK.lac }));
  }
  if (doStyle === 'kebiki') for (const [y, r] of [[1.0, 0.214], [1.16, 0.236]]) { const b = new THREE.CylinderGeometry(r * r0 + 0.002, r * r0 + 0.002, 0.012, hi ? 28 : 12, 1, true); b.scale(1, 1, 0.8); parts.push(P(at(b, 0, y, 0), lace, { reg: 'cord' })); }
  // 胸板（前の上の板）と金具。侍大将から金の覆輪
  {
    const mp = [[0.244, 1.35], [0.236, 1.38], [0.2, 1.425], [0.16, 1.448]].map(([r, y]) => new THREE.Vector2(r * r0 * 1.02, y));
    const mb = new THREE.LatheGeometry(mp, hi ? 10 : 4, -0.62, 1.24); mb.scale(1, 1, 0.8);
    parts.push(P(mb, armor, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
    if (hi) {
      const rim = arcRing(0.16 * r0 * 1.03, 0.006, 1.24, 0, 10); rim.scale(1, 1, 0.8);
      parts.push(P(at(rim, 0, 1.448, 0), T >= 2 ? gold : T >= 1 ? brass : armor, { mk: T >= 1 ? MK.gold : MK.lac }));
      // 高紐の鐶（左右の胸の上）
      for (const sd of [-1, 1]) {
        parts.push(P(at(ball(0.016, 0.012, 0.006, 8, 5), sd * 0.09, 1.42, 0.165 * r0), T >= 1 ? brass : 0x3a3e42, { mk: T >= 1 ? MK.gold : MK.iron }));
        parts.push(P(at(new THREE.TorusGeometry(0.012, 0.0035, 4, 8), sd * 0.09, 1.405, 0.175 * r0, 0.3), T >= 1 ? brass : 0x3a3e42, { mk: MK.iron }));
      }
    }
  }
  // 家紋（足軽の御貸具足は胴の前に大きく）
  const mr = monReg(o.mon);
  if (mr && T === 0) {
    const mp = DO_PROF.slice(3, 6).map(([r, y]) => new THREE.Vector2(r * r0 * (hi && doStyle === 'okegawa' ? 1.05 : 1.03), y));
    const dec = new THREE.LatheGeometry(mp, hi ? 6 : 3, -0.42, 0.84); dec.scale(1, 1, 0.8);
    parts.push(P(dec, armor, { mk: MK.lac, reg: mr, c2: o.monCol || 0xb08a3a, mk2: MK.gold }));
  }
  // 草摺：板を垂らし、裾へ広げる。足軽は五枚、侍から七枚
  parts = PT.hips;
  {
    const np = T === 0 ? 5 : 7;
    // 桶側の胴の草摺は、鉄か革の板を五段、素懸で威す（胴の縦の板の絵は使わない）
    const kreg = doStyle === 'okegawa' ? 'sugake' : doStyle;
    const krv = doStyle === 'okegawa' ? [0, 0.625] : doStyle === 'sugake' ? [0, 0.5] : [0, 0.625];
    // 足軽の近くの形：五段の板の下の縁がそれぞれ外へ出る（一枚の板に縞を描いた形に見せない）。上の端は 0.884 まで（上は揺糸の帯。板を揺らす骨の見分けを崩さない）
    const KY0 = 0.63, KY1 = 0.884, kr = (y) => (0.27 + (0.214 - 0.27) * (y - KY0) / 0.27) * r0;
    let kprof = null;
    if (hi && T === 0) {
      kprof = [];
      const H = (KY1 - KY0) / 5, t = 0.009;
      for (let j = 0; j < 5; j++) { const ya = KY0 + j * H, yb = ya + H; kprof.push([kr(ya), ya], [kr(ya) + t, ya + 0.002], [kr(ya + H * 0.5) + t * 0.45, ya + H * 0.5], [kr(yb - 0.003), yb - 0.003]); }
      kprof = kprof.map(([r, y]) => new THREE.Vector2(r, y));
    }
    for (let k = 0; k < np; k++) {
      const a = (k / np) * Math.PI * 2 + (np === 5 ? Math.PI / 5 : 0);
      const L = (Math.PI * 2 / np) * 0.97;
      let kz;
      if (kprof) {
        kz = new THREE.LatheGeometry(kprof, 3, a + Math.PI - L / 2, L);
        const p = kz.attributes.position, uv = kz.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - KY0) / 0.27);
        kz.scale(1, 1, 0.86);
      } else { kz = arcCyl(0.214 * r0, 0.27 * r0, 0.27, hi ? 3 : 2, L, a + Math.PI); kz.scale(1, 1, 0.86); at(kz, 0, 0.765, 0); }
      parts.push(P(kz, armor, { mk: MK.lac, reg: kreg, c2: lace, mk2: MK.cloth, rv: krv, ru: [0, 0.2] }));
    }
    // 揺糸（胴と草摺をつなぐ糸）
    const yb = new THREE.CylinderGeometry(0.203 * r0, 0.214 * r0, 0.035, hi ? 28 : 10, 1, true); yb.scale(1, 1, 0.84);
    parts.push(P(at(yb, 0, 0.9, 0), lace, { reg: 'kebiki', rv: [0.3, 0.36], ru: [0, 1] }));
  }
  parts = PT.torso;
  // 肩上（わたがみ）と小鰭
  for (const sd of [1, -1]) {
    parts.push(P(at(new THREE.BoxGeometry(0.07, 0.018, 0.22 * r0), sd * 0.15, 1.435, -0.02), T >= 1 ? 0x2a1e16 : armor, { mk: MK.lac, reg: 'lacq' }));
    if (hi) parts.push(P(at(new THREE.BoxGeometry(0.078, 0.01, 0.01), sd * 0.145, 1.452, 0.09), lace, { reg: 'cord' }));
    // 小鰭：肩の外に寝かせて付ける（首の横に立てると顔にかぶる）
    if (T >= 1 && hi) parts.push(P(at(arcCyl(0.075, 0.085, 0.04, 4, 1.2, sd * Math.PI / 2), sd * 0.215, 1.41, -0.01, 0, 0, sd * -1.1), armor, { mk: MK.lac, reg: 'lacq' }));
  }
  // 背の総角（あげまき）：侍から
  if (T >= 1 && hi) {
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.TorusGeometry(0.024, 0.007, 4, 10), sd * 0.024, 1.24, -0.198 * r0 * 0.8 - 0.012, 0, 0, sd * 0.6), lace, { reg: 'cord' }));
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.014, 0.12, 0.006), sd * 0.018, 1.17, -0.2 * r0 * 0.8 - 0.012, 0, 0, sd * 0.15), lace, { reg: 'cord' }));
  }
  // 袖：肩から下げた板の段（侍から）。足軽大将から冠板に金具
  for (const sd of [1, -1]) {
    if (!o.sode) continue;
    parts = sd > 0 ? PT.sodeP : PT.sodeN;
    const rowsN = T >= 2 ? 6 : 5;
    const g = new THREE.CylinderGeometry(0.128, 0.152, 0.3, hi ? 6 : 3, 1, true, Math.PI * (sd > 0 ? 0.15 : 1.15), Math.PI * 0.7);
    parts.push(P(at(g, 0.2 * sd, 1.27, 0), armor, { mk: MK.lac, reg: T >= 2 ? 'kebiki' : 'sugake', c2: lace, mk2: MK.cloth, rv: [0, rowsN / 8], ru: [0, 0.22] }));
    const kb = new THREE.CylinderGeometry(0.126, 0.128, 0.03, hi ? 6 : 3, 1, true, Math.PI * (sd > 0 ? 0.15 : 1.15), Math.PI * 0.7);
    parts.push(P(at(kb, 0.2 * sd, 1.43, 0), armor, { mk: MK.lac, reg: 'lacq' }));
    if (hi && T >= 1) for (const dz of [-0.06, 0.06]) parts.push(P(at(ball(0.012, 0.012, 0.005, 8, 5), 0.2 * sd + sd * 0.128, 1.43, dz, 0, sd * Math.PI / 2), T >= 2 ? gold : brass, { mk: MK.gold }));
  }
  parts = PT.torso;
  // 金の縁（家老から）
  if (o.trim) {
    const t1 = new THREE.CylinderGeometry(0.245 * r0, 0.245 * r0, 0.02, 16, 1, true); t1.scale(1, 1, 0.8);
    parts.push(P(at(t1, 0, 1.39, 0), o.trim, { mk: MK.gold }));
    const t2 = new THREE.CylinderGeometry(0.205 * r0, 0.205 * r0, 0.02, 16, 1, true); t2.scale(1, 1, 0.82);
    parts.push(P(at(t2, 0, 0.89, 0), o.trim, { mk: MK.gold }));
  }
  // 左手の采配（足軽大将）・軍配（侍大将から）
  if (o.left === 'saihai') {
    parts.push(P(at(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5), -0.3, 0.98, 0.26, 1.1), 0x2a1c10));
    for (let i = 0; i < 6; i++) parts.push(P(at(new THREE.BoxGeometry(0.02, 0.2, 0.01), -0.3 + (i - 2.5) * 0.012, 0.98, 0.5, 1.4 + (i - 2.5) * 0.08), 0xece4d0));
  } else if (o.left === 'gunbai') {
    parts.push(P(at(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 5), -0.3, 0.98, 0.25, 1.1), 0x2a1c10));
    const fan = new THREE.CylinderGeometry(0.15, 0.15, 0.015, 14); fan.scale(0.85, 1, 1);
    parts.push(P(at(fan, -0.3, 1.02, 0.47, 1.1), 0x14110e, { mk: MK.lac }));
    parts.push(P(at(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), -0.3, 1.025, 0.475, 1.1), 0xb8231a, { mk: MK.lac }));
    parts.push(P(at(new THREE.TorusGeometry(0.13, 0.008, 3, 16), -0.3, 1.02, 0.47, 1.1 - Math.PI / 2), 0xc9a24a));
  }
  if (o.haori) {
    // 陣羽織：肩から背と脇を覆い、裾が広がる。背に大きく家紋（骨の入った人では、肩を支点に遅れて揺れる）
    parts = PT.haori;
    const hb = hi ? new THREE.CylinderGeometry(0.262 * r0, 0.35 * r0, 0.64, 36, 4, true, Math.PI - Math.PI * 0.4, Math.PI * 0.8) : arcCyl(0.262 * r0, 0.35 * r0, 0.64, 6, Math.PI * 0.8, Math.PI);
    at(hb, 0, 1.12, -0.004);
    // 布のひだ：裾ほど深く波打つ（humans.js の背の家紋も同じ式で沿わせる）
    // 脇の端は裾ほど外へ開く（脇の割れから布が広がる）
    const edgeOut = (th, y) => { const dc = Math.PI - Math.abs(th); const e = Math.min(1, Math.max(0, (dc - Math.PI * 0.26) / (Math.PI * 0.14))); const low = Math.min(1, Math.max(0, (1.44 - y) / 0.64)); return e * e * 0.035 * low; };
    // 肩の線：上の縁は背の真ん中で高く、肩の外へ向けて下がり、少し内へ寄って肩に掛かる（横一直線の板の縁にしない）
    const shoulder = (th, y) => { const dc = Math.min(1, Math.abs(Math.PI - Math.abs(th)) / (Math.PI * 0.4)); const top = Math.min(1, Math.max(0, (y - 1.2) / 0.24)); return [-0.085 * dc * dc * top * top, -0.03 * top * top * (0.4 + 0.6 * dc)]; };
    if (hi) { const p = hb.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i) + 0.004; const r = Math.hypot(x, z) || 1; const th = Math.atan2(x, z); const [sy, sr] = shoulder(th, y); const d = haoriFold(th, y) + edgeOut(th, y) + sr; p.setXYZ(i, x * (1 + d / r), y + sy, z * (1 + d / r) - 0.004); } hb.computeVertexNormals(); }
    parts.push(P(hb, o.haori, { reg: 'cloth', dirt: DIRT * 0.6 }));
    if (hi) {
      // 布の厚み：裏地（少し内に、面を返して）と、脇の端の縁（表と裏をつなぐ細い帯）。横から見ても線にならない
      const T_ = 0.012, lin = new THREE.Color(o.haori).multiplyScalar(0.62).getHex();
      const inner = hb.clone(); const ip = inner.attributes.position;
      for (let i = 0; i < ip.count; i++) { const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i) + 0.004; const r = Math.hypot(x, z) || 1; ip.setXYZ(i, x * (1 - T_ / r), y, z * (1 - T_ / r) - 0.004); }
      const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
      inner.computeVertexNormals();
      parts.push(P(inner, lin, { reg: 'cloth', dirt: DIRT * 0.5 }));
      const rAt0 = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - 0.8) / 0.64);
      for (const sd of [-1, 1]) {
        const th = Math.PI + sd * Math.PI * 0.4;
        const eg = surf(1, 8, (u, v) => { const y = 0.8 + v * 0.64; const [sy, sr] = shoulder(th, y); const r = rAt0(y) + haoriFold(th, y) + edgeOut(th, y) + sr - T_ * u; return [Math.sin(th) * r, y + sy, Math.cos(th) * r - 0.004]; });
        if (sd > 0) { const ex = eg.index.array; for (let i = 0; i < ex.length; i += 3) { const t = ex[i]; ex[i] = ex[i + 2]; ex[i + 2] = t; } eg.computeVertexNormals(); }
        parts.push(P(eg, new THREE.Color(o.haori).multiplyScalar(0.8).getHex(), { reg: 'cloth' }));
      }
    }
    {
      // 肩の覆い：背の真ん中から肩の外へ向けて下がる（肩の上に水平の棚が張り出さないよう）
      const yk = at(arcCyl(0.12, 0.27 * r0, 0.08, hi ? 14 : 6, Math.PI * 1.1, Math.PI), 0, 1.47, 0);
      const q = yk.attributes.position;
      for (let i = 0; i < q.count; i++) { const x = q.getX(i), z = q.getZ(i), r = Math.hypot(x, z); const dc = Math.min(1, Math.abs(Math.PI - Math.abs(Math.atan2(x, z))) / (Math.PI * 0.55)); const o2 = Math.min(1, Math.max(0, (r - 0.12) / 0.15)); q.setY(i, q.getY(i) - 0.1 * dc * dc * o2 - 0.03 * o2); }
      yk.computeVertexNormals();
      parts.push(P(yk, o.haori, { reg: 'cloth' }));
    }
    parts.push(P(at(arcCyl(0.098, 0.108, 0.07, hi ? 10 : 5, Math.PI * 1.2, Math.PI), 0, 1.53, 0), o.haoriCollar || 0xd8d0bc, { reg: 'cloth' }));
    const hm = monReg(o.haoriMon || o.mon);
    if (hm && hi) {
      const y0 = 1.2, y1 = 1.4, rAt = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - (1.12 - 0.32)) / 0.64);
      const dec = new THREE.CylinderGeometry(rAt(y1) + 0.004, rAt(y0) + 0.004, y1 - y0, 6, 1, true, Math.PI - 0.42, 0.84);
      parts.push(P(at(dec, 0, (y0 + y1) / 2, -0.004), o.haori, { reg: hm, c2: o.haoriMonCol || 0xe6dfcf, mk2: o.haoriMonCol && GOLDS.has(o.haoriMonCol) ? MK.gold : MK.cloth, dirt: 0.2 }));
    }
    parts = PT.torso;
  }
  // 刀：鞘・鍔・柄を左の腰に差す（腰の骨に付ける組。胴丸の上にも差す）
  parts = PT.koshi;
  if (o.saya) {
    const h0 = [-0.23 * r0, 0.93, 0.07];
    const d = new THREE.Vector3(0.1, 0.2, 1).normalize();
    const pt = (k) => [h0[0] + d.x * k, h0[1] + d.y * k, h0[2] + d.z * k];
    parts.push(P(limb(pt(-0.72), pt(0), 0.016, 0.018, hi ? 6 : 4), 0x14110e, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(limb(pt(0.02), pt(0.25), 0.017, 0.016, hi ? 6 : 4), 0x2a2420, { reg: 'cord' }));
    if (hi) { const ts = limb(pt(0.0), pt(0.012), 0.038, 0.038, 12); parts.push(P(ts, 0x2a2622, { mk: MK.iron })); }
    if (T >= 2) {
      // 侍大将から：太刀の柄頭と鐺に金具、鞘に下緒
      parts.push(P(limb(pt(0.245), pt(0.265), 0.018, 0.017, hi ? 8 : 4), gold, { mk: MK.gold }));
      parts.push(P(limb(pt(-0.72), pt(-0.68), 0.0175, 0.017, hi ? 8 : 4), gold, { mk: MK.gold }));
      // 脇差：太刀の内に、短く、柄を前へ
      const w0 = [-0.17 * r0, 0.95, 0.12];
      const dw = new THREE.Vector3(0.2, 0.12, 1).normalize();
      const wp = (k) => [w0[0] + dw.x * k, w0[1] + dw.y * k, w0[2] + dw.z * k];
      parts.push(P(limb(wp(-0.45), wp(0), 0.013, 0.015, hi ? 6 : 4), 0x14110e, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(limb(wp(0.015), wp(0.16), 0.014, 0.013, hi ? 6 : 4), 0x2a2420, { reg: 'cord' }));
      if (hi) parts.push(P(limb(wp(0.0), wp(0.01), 0.028, 0.028, 10), gold, { mk: MK.gold }));
    }
  } else if (T === 0 && hi) {
    // 足軽の脇差
    const h0 = [-0.22 * r0, 0.93, 0.08];
    const d = new THREE.Vector3(0.1, 0.15, 1).normalize();
    const pt = (k) => [h0[0] + d.x * k, h0[1] + d.y * k, h0[2] + d.z * k];
    parts.push(P(limb(pt(-0.42), pt(0), 0.014, 0.016, 5), 0x1a1612, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(limb(pt(0.01), pt(0.16), 0.015, 0.014, 5), 0x3a3026, { reg: 'cord' }));
    // 鍔（鉄の丸鍔）・鞘の鯉口と鐺の角・柄頭：一本の黒い棒に見せない
    parts.push(P(limb(pt(-0.002), pt(0.008), 0.03, 0.03, 10), 0x2a2622, { mk: MK.iron }));
    parts.push(P(limb(pt(-0.03), pt(-0.012), 0.0175, 0.0165, 6), 0x2a211a, { mk: MK.wood }));
    parts.push(P(limb(pt(-0.425), pt(-0.4), 0.0145, 0.015, 6), 0x3a3430, { mk: MK.iron }));
    parts.push(P(limb(pt(0.155), pt(0.172), 0.0155, 0.014, 6), 0x3a3430, { mk: MK.iron }));
  }
  // 弓足軽の箙（右の腰）：下の箱（方立）に鏃を差し、二本の手と横木で矢を支える。羽は腰の後ろから肩の後ろへ斜めに立つ。近くの形だけ
  if (T === 0 && hi && o.weapon === 'bow') {
    const M = new THREE.Matrix4().makeTranslation(0.3 * r0, 0.72, -0.06).multiply(new THREE.Matrix4().makeRotationX(-0.38)).multiply(new THREE.Matrix4().makeRotationZ(-0.1));
    const E = [];
    E.push(P(at(new THREE.BoxGeometry(0.1, 0.09, 0.075), 0, 0.045, 0), 0x1a1612, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
    for (const sx of [-1, 1]) E.push(P(at(new THREE.BoxGeometry(0.012, 0.36, 0.012), sx * 0.046, 0.27, -0.026), 0x2a1c10, { mk: MK.lac, reg: 'lacq' }));
    E.push(P(at(new THREE.BoxGeometry(0.112, 0.024, 0.016), 0, 0.42, -0.026), 0x2a1c10, { mk: MK.lac, reg: 'lacq' }));
    E.push(P(at(new THREE.TorusGeometry(0.05, 0.004, 3, 8), 0, 0.3, -0.012, Math.PI / 2), 0x3a3026, { reg: 'cord' }));
    for (let i = 0; i < 8; i++) {
      const c = i % 4, rw = i < 4 ? 1 : -1, bx = -0.033 + c * 0.022, bz = rw * 0.014;
      const tx = bx * 1.7, tz = bz * 1.4 - 0.02, top = 0.9 + ((i * 7) % 5) * 0.008;
      E.push(P(limb([bx, 0.02, bz], [tx, top, tz], 0.0042, 0.0042, 3), 0xa8925e, { mk: MK.wood, reg: 'wood' }));
      const fc = i % 3 === 1 ? 0x3a3430 : 0xd8d0bc;
      for (const ry of [0, Math.PI / 2]) E.push(P(at(new THREE.BoxGeometry(0.02, 0.12, 0.0015), tx * 0.98, top - 0.075, tz, 0, ry + i * 0.4, 0), fc, { reg: 'fur' }));
    }
    for (const g of E) parts.push(g.applyMatrix4(M));
  }
  parts = PT.torso;
  // 母衣（母衣衆の背の袋）：竹の籠（母衣串）に十二枚はぎの布を張る。肩の下から腰まで、裾は開いて垂れる。
  // 近くも遠くも肩幅ほどに収め、既存の背の揺れに付ける。
  if (o.horo) {
    // 風をはらんだ布の袋：上は母衣串の頭で絞り、胴の高さでふくらみ、下の口はやや窄まる。高さは背丈の半分ほど（約八十センチ）。
    // 風下の背側へ吹き流れる分だけ後ろへふくらみ、十二枚はぎの縫い目で谷ができ、下ほど皺が深い。
    const HH = 0.76, RX = 0.24, RZ = 0.24, CY = 1.3;
    const prof = (t) => t < 0.68 ? 0.16 + 0.84 * Math.sin(t / 0.68 * Math.PI / 2) : 1 - 0.14 * ((t - 0.68) / 0.32);
    // 十二本のはぎ目と、その間の布の山を遠目用でも拾う。
    const hg = surf(hi ? 48 : 24, hi ? 12 : 6, (u, v) => {
      const th = u * Math.PI * 2, t = v;
      const seam = 1 - 0.07 * Math.pow(Math.abs(Math.cos(th * 6)), 4);   // 絵の縫い目と同じ所に谷
      const wr = 1 + (0.05 * Math.sin(th * 5 + t * 9) + 0.03 * Math.sin(th * 13 - t * 6)) * (0.3 + t);   // 皺
      const r = prof(t) * seam * wr;
      let z = Math.cos(th) * RZ * r;
      if (z > 0) z *= 0.3;                                    // 背に当たる側は平ら
      else z -= 0.05 * Math.sin(t * Math.PI);                  // 風をはらんで後ろへふくらむ
      const hem = Math.pow(t, 5) * (0.018 * Math.sin(th * 5) + 0.01 * Math.sin(th * 9));
      return [Math.sin(th) * RX * r, HH / 2 - t * HH + hem, z];
    });
    // 下の口から中が見えても抜けないよう、裏（面の向きを返した物）も
    // 横に回って下へ進む面は内向きなので、まず表を外向きにそろえる。
    const outer = hg.index.array; for (let i = 0; i < outer.length; i += 3) { const t = outer[i]; outer[i] = outer[i + 2]; outer[i + 2] = t; }
    hg.computeVertexNormals();
    const inner = hg.clone(); const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    inner.scale(0.985, 0.985, 0.985); inner.computeVertexNormals();
    PT.back.push(P(at(hg, 0, CY, -0.34), o.horo, { reg: 'horo', flipV: true, dirt: 0.25 }));
    PT.back.push(P(at(inner, 0, CY, -0.34), new THREE.Color(o.horo).multiplyScalar(0.55).getHex(), { reg: 'horo', flipV: true, dirt: 0.3 }));
    if (hi) {
      // 母衣串の竹の輪（布の下に透ける籠の骨）
      for (const t of [0.34, 0.72]) {
        const rg = new THREE.TorusGeometry(1, 0.016, 4, 16); rg.rotateX(Math.PI / 2);
        const rr = prof(t) * 0.94;
        rg.scale(RX * rr, 1, RZ * rr * 0.62); rg.translate(0, 0, -0.1 * rr * 0.4);
        PT.back.push(P(at(rg, 0, CY + HH / 2 - t * HH, -0.34 - 0.025 * Math.sin(t * Math.PI)), 0xb09a64, { reg: 'wood' }));
      }
    }
    if (hi) {
      // 母衣串（籠の竹の骨）の頭と、背の受け
      PT.back.push(P(limb([0, 1.44, -0.2], [0, CY + HH / 2, -0.34], 0.006, 0.005, 4), 0x3a2c1c, { reg: 'wood' }));
      // 左右の肩から袋を留める緒。袋と一緒に揺らし、甲冑の形には手を加えない。
      for (const sd of [-1, 1]) PT.back.push(P(limb([sd * 0.18, 1.5, -0.19], [sd * 0.14, 1.55, -0.34], 0.009, 0.009, 4), 0xc7b48a, { reg: 'cord' }));
    }
  }
  // 面頬
  if (o.menpo) menpoParts(o, PT.head, hi);
  else if (T >= 1 && hi) {
    // 喉輪
    parts.push(P(at(arcCyl(0.075, 0.1, 0.05, 8, Math.PI * 0.9, 0), 0, 1.47, 0.01), armor, { mk: MK.lac, reg: 'sugake', c2: lace, mk2: MK.cloth, rv: [7 / 8, 1], ru: [0, 0.25] }));
  }
  hatParts(o, PT.head, hi);
  // 指物の竿と受筒・合当理
  // 竿は別の組（pole）に入れる：骨の入った人では、受筒を支点に、駆ける・止まる・振り向く勢いで遅れてしなる（背の旗も一緒に）
  if (o.pole) {
    PT.pole.push(P(at(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 5), 0, 2.0, -0.22), 0x3a2c1c, { reg: 'wood', swap: true }));
    PT.pole.push(P(at(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), 0, 1.07, -0.21), 0x2a1c10, { mk: MK.lac, reg: 'lacq' }));
    if (hi) PT.pole.push(P(at(new THREE.BoxGeometry(0.06, 0.03, 0.05), 0, 1.36, -0.2), 0x2a1c10, { mk: MK.lac }));
  }
  // nohead：頭に付く物（笠・兜・面頬）を除く（軽い形では頭の形の方に入れる）
  const list = grp === 'rider' ? [...PT.base, ...PT.torso, ...PT.haori, ...PT.back, ...PT.koshi, ...PT.pole] : grp === 'nohead' ? [...PT.base, ...PT.torso, ...PT.hips, ...PT.sodeP, ...PT.sodeN, ...PT.haori, ...PT.back, ...PT.koshi, ...PT.pole] : grp ? PT[grp] : [...PT.base, ...PT.torso, ...PT.hips, ...PT.sodeP, ...PT.sodeN, ...PT.head, ...PT.haori, ...PT.back, ...PT.koshi, ...PT.pole];
  const g = list.length ? merge(list) : null;
  geoCache.set(ck, g);
  return g;
}

// 脚は太ももと脛の二節（膝で曲がる）。太ももは腰、脛は膝を原点に下へ
// part：'armor' 佩楯と膝の紐だけ（骨の入った人に着せるため）
function thighGeometry(o, hi, part) {
  if (o.nanban && !o.kosode) return nanbanGeometry('thigh', hi, part, 0, { P, at, merge, MK, limb, ball });
  if (o.sohei) return soheiThigh(o, hi);
  const cloth = o.cloth || 0x2b2622, T = o.tier || 0;
  const k = 'thigh' + cloth + '|' + T + '|' + (o.armor || 0) + '|' + (hi ? 1 : 0) + (part || '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.9, 0.7, 0.5, 0.35][T];
  const b = BUILD[T];
  const P_ = [];
  // 袴の太もも（足軽は細く裾を絞る）
  if (!part) P_.push(P(limb([0, 0.02, 0], [0, -0.4, 0.01], 0.108 * b, 0.084 * b, hi ? 12 : 7), cloth, { reg: 'cloth' }));
  if (hi && !part) P_.push(P(at(ball(0.07 * b, 0.1, 0.075 * b, 10, 6), 0, -0.2, 0.03), cloth, { reg: 'cloth' }));   // 腿の張り
  // 佩楯（侍から）：前に小さな板を並べた布
  if (T >= 1) P_.push(P(at(arcCyl(0.118 * b, 0.112 * b, 0.25, hi ? 6 : 3, Math.PI * 0.9, 0.15), 0, -0.15, 0.012, 0.06), T >= 2 ? (o.lace || cloth) : cloth, { reg: 'haidate', c2: o.armor || 0x2a2622, mk2: MK.lac }));
  // 膝の紐
  P_.push(P(at(new THREE.CylinderGeometry(0.08 * b, 0.08 * b, 0.04, hi ? 12 : 6), 0, -0.39, 0.01), 0x3a342c, { reg: 'cord' }));
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}
// part：'leg' 脛だけ・'foot' 足だけ（骨の入った人に着せるため）
function shinGeometry(o, hi, part) {
  if (o.nanban && !o.kosode && part !== 'foot') {
    const g = nanbanGeometry('leg', hi, part, 0, { P, at, merge, MK, limb, ball });
    if (part) return g;
    const key = 'nanbanShin|' + (hi ? 1 : 0);
    if (!geoCache.has(key)) geoCache.set(key, merge([g.clone(), shinGeometry({ ...o, nanban: 0 }, hi, 'foot').clone()]));
    return geoCache.get(key);
  }
  if (o.sohei && part !== 'foot') return soheiShin(o, hi, part);
  const cloth = o.cloth || 0x2b2622, T = o.tier || 0, vi = o.vi || 0;
  const k = 'shin' + cloth + '|' + T + '|' + (T === 0 ? vi % 3 + '/' + (vi % 4 === 3 ? 0 : 1) + '/' + (o.armor || 0) : 0) + '|' + (hi ? 1 : 0) + (part || '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.95, 0.8, 0.6, 0.45][T];
  const b = BUILD[T];
  const P_ = [];
  // 脛とふくらはぎ
  if (!part) P_.push(P(limb([0, 0, 0], [0, -0.3, -0.01], 0.07 * b, 0.05 * b, hi ? 10 : 6), cloth, { reg: 'cloth', flipV: true }));
  if (hi && !part) P_.push(P(at(ball(0.055 * b, 0.09, 0.055 * b, 10, 6), 0, -0.1, -0.022), cloth, { reg: 'cloth' }));
  if (part === 'foot') { /* 足だけ */ } else if (T === 0) {
    // 足軽：脚絆（布を巻き、上下を紐で結ぶ）。半分は筒臑当
    const kc = [0x4a4a44, 0x2e3440, 0x5a5244][vi % 3];
    P_.push(P(limb([0, -0.02, 0.0], [0, -0.28, -0.008], 0.074 * b, 0.058 * b, hi ? 10 : 6), kc, { reg: 'cloth', flipV: true }));
    if (hi) for (const y of [-0.04, -0.26]) P_.push(P(at(new THREE.TorusGeometry(y > -0.1 ? 0.074 * b : 0.058 * b, 0.004, 4, 12), 0, y, -0.004, Math.PI / 2), 0xcfc4a8, { reg: 'cord' }));
    // 筒臑当（御貸具足）：脛の前を三枚の縦の板で包み、蝶番でつなぐ。家の色の漆。上下を紐で結ぶ（四人に一人は脚絆だけ）
    if (vi % 4 !== 3) {
      const ac = o.armor || 0x2e3236;
      if (hi) {
        const w3 = Math.PI * 0.32;
        for (let j = -1; j <= 1; j++) {
          const g = arcCyl(0.081 * b + Math.abs(j) * 0.002, 0.065 * b + Math.abs(j) * 0.002, 0.22, 2, w3 * 1.06, j * w3);
          P_.push(P(at(g, 0, -0.14, -0.004), ac, { mk: MK.lac, reg: 'okeV', rv: [((j + 2) % 4) / 4, ((j + 2) % 4 + 1) / 4], swap: true, flipV: true, c2: 0x4a2a1a, mk2: MK.lac }));
        }
        // 蝶番（板の境の細い鉄）と、上下の紐
        for (const j of [-0.5, 0.5]) { const a = j * w3; P_.push(P(at(new THREE.BoxGeometry(0.006, 0.2, 0.005), Math.sin(a) * 0.075 * b, -0.14, Math.cos(a) * 0.075 * b - 0.004, 0.06, a, 0), 0x2a2420, { mk: MK.iron })); }
        for (const y of [-0.055, -0.225]) P_.push(P(at(new THREE.TorusGeometry((y > -0.1 ? 0.079 : 0.068) * b, 0.004, 3, 12), 0, y, -0.004, Math.PI / 2), 0xcfc4a8, { reg: 'cord' }));
      } else P_.push(P(at(arcCyl(0.08 * b, 0.064 * b, 0.22, 4, Math.PI * 0.95, 0), 0, -0.14, -0.004), ac, { mk: MK.lac, reg: 'lacq' }));
    }
  } else {
    // 侍：篠臑当（縦の鉄の篠を鎖でつなぐ）。侍大将から膝に立挙
    P_.push(P(at(arcCyl(0.078 * b, 0.062 * b, 0.26, hi ? 8 : 4, Math.PI * 1.05, 0), 0, -0.14, -0.006), 0x2a2622, { reg: 'shino', c2: 0x2e3236, mk2: MK.iron, flipV: false }));
    if (hi) for (const y of [-0.015, -0.265]) P_.push(P(at(new THREE.TorusGeometry(y > -0.1 ? 0.078 * b : 0.062 * b, 0.0045, 4, 12), 0, y, -0.006, Math.PI / 2), 0x3a342c, { reg: 'cord' }));
    if (T >= 2) P_.push(P(at(arcCyl(0.085 * b, 0.08 * b, 0.08, hi ? 6 : 3, Math.PI * 0.8, 0), 0, 0.03, 0.01, -0.15), o.armor || 0x1c1a1a, { mk: MK.lac, reg: 'lacq' }));
  }
  // 足袋と草鞋：甲のふくらみ、踵、親指の股、藁の底、結んだ紐
  // 足軽の足袋は、白っぽいと運動靴のように浮くので、履き古した紺・茶の暗い色に（人ごとに）
  const tabi = T === 0 ? [0x4a4640, 0x3c3d42][vi % 2] : 0x3a3630;
  if (part === 'leg') { /* 脛だけ */ } else if (hi) {
    P_.push(P(at(ball(0.044, 0.036, 0.1, 10, 6), 0, -0.318, 0.06), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(ball(0.038, 0.035, 0.04, 8, 6), 0, -0.316, -0.02), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(ball(0.017, 0.016, 0.025, 6, 4), 0.022, -0.33, 0.15), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(new THREE.BoxGeometry(0.003, 0.018, 0.035), 0.008, -0.33, 0.16), 0x2a2620, { reg: 'cloth', dirt: 1 }));
    // 藁の底：足の形の小判（角の立った板にしない）。前は指が少しはみ出す長さ、縁は編んだ藁の厚み
    { const sole = new THREE.CylinderGeometry(1, 1, 0.014, 14); sole.scale(0.047, 1, 0.112); P_.push(P(at(sole, 0, -0.353, 0.045), 0x7a6a46, { mk: MK.straw, reg: 'straw', dirt: 1 })); }
    P_.push(P(at(new THREE.TorusGeometry(0.046, 0.005, 4, 10, Math.PI), 0, -0.342, 0.09, 0, Math.PI / 2, 0), 0x857752, { mk: MK.straw, reg: 'cord', dirt: 1 }));
    P_.push(P(at(new THREE.TorusGeometry(0.05, 0.005, 4, 12), 0, -0.29, -0.004, Math.PI / 2), 0x857752, { mk: MK.straw, reg: 'cord', dirt: 1 }));
    P_.push(P(limb([0.012, -0.345, 0.17], [0.03, -0.3, 0.02], 0.004, 0.004, 3), 0x857752, { mk: MK.straw, dirt: 1 }));
    P_.push(P(limb([0.012, -0.345, 0.17], [-0.03, -0.3, 0.02], 0.004, 0.004, 3), 0x857752, { mk: MK.straw, dirt: 1 }));
  } else {
    P_.push(P(at(new THREE.BoxGeometry(0.09, 0.06, 0.2), 0, -0.315, 0.04), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(new THREE.BoxGeometry(0.1, 0.022, 0.24), 0, -0.345, 0.04), 0x6e6244, { mk: MK.straw }));
  }
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}
// 馬上の腰の持ち上げ（兵の体の原点を、地面からどれだけ上げるか）。日本の在来馬（肩の高さ 1.3m ほど）の和鞍に合わせる
export const RIDE = { y: 0.72 };
// 骨の入った本物の馬を動かす道具（humans.js が入れる。読めない時は空のまま＝今の形の馬）
export const HORSE_HOOK = { drive: null };
// 馬上の脚：太ももを前へ出し、脛は鐙へ下ろす
export function seatLegs(u) {
  prepareRider(u);
  // 乗せる前に手・旗を 0.95 上げてある形（出世の見本・伝令）は、和種の鞍の高さへ下ろす
  if (!u.rideFix) { u.rideFix = true; for (const part of [u.body, u.hand, u.flag, u.uma]) if (part) part.position.y -= 0.95 - RIDE.y; }
  const y = RIDE.y + 0.71;
  u.legL.position.set(0.24, y, 0.04); u.legR.position.set(-0.24, y, 0.04);
  u.legL.rotation.set(-0.85, 0, -0.3); u.legR.rotation.set(-0.85, 0, 0.3);
  if (u.shinL) { u.shinL.rotation.x = 1.05; u.shinR.rotation.x = 1.05; }
}

// 骨のある姿を待つ間も、馬上の腕を一本の筒にしない。形の分割は乗せた時だけ。
const riderArmCache = new WeakMap();
let riderReinMat = null;
function riderArmParts(g) {
  if (riderArmCache.has(g)) return riderArmCache.get(g);
  const pos = g.attributes.position, ix = g.index;
  const upper = [], fore = [];
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    ((pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 < -0.285 ? fore : upper).push(a, b, c);
  }
  const up = g.clone(), lo = g.clone();
  up.setIndex(upper); lo.setIndex(fore); lo.translate(0, 0.27, 0);
  up.computeBoundingSphere(); lo.computeBoundingSphere();
  const pair = [up, lo]; riderArmCache.set(g, pair); return pair;
}
function prepareRider(u) {
  if (u.riderModel || !u.armR || !u.armL || !u.look) return;
  const key = u.body.userData.lookKey;
  // 南蛮具足・僧衣は部品の分け方が違うので、元の胴を保つ。
  if (key && !u.look.nanban && !u.look.sohei) {
    lodSwap(u.body, bodyGeometry(key, u.look, true, 'rider'), bodyGeometry(key, u.look, false, 'rider'));
    for (const part of ['hips', 'sodeP', 'sodeN']) {
      const hi = bodyGeometry(key, u.look, true, part), lo = bodyGeometry(key, u.look, false, part);
      if (!hi) continue;
      const mesh = new THREE.Mesh(hi, u.body.material);
      lodSwap(mesh, hi, lo); mesh.castShadow = true;
      if (part === 'hips') u.body.add(mesh);
      else {
        const arm = part === 'sodeP' ? u.armR : u.armL;
        // 袖の原点を肩へ移し、二の腕に遅れて傾ける。
        const pivot = new THREE.Group(); pivot.position.copy(arm.position);
        mesh.position.copy(arm.position).multiplyScalar(-1); pivot.add(mesh); u.body.add(pivot);
        arm.userData.riderSleeve = pivot;
      }
    }
  }
  for (const arm of [u.armR, u.armL]) {
    const lod = arm.userData.lod, hi = riderArmParts(lod ? lod[0] : arm.geometry), lo = riderArmParts(lod ? lod[1] : arm.geometry);
    lodSwap(arm, hi[0], lo[0]);
    const fore = new THREE.Mesh(hi[1], arm.material); lodSwap(fore, hi[1], lo[1]);
    fore.position.y = -0.27; fore.castShadow = true; arm.add(fore); arm.userData.riderFore = fore;
  }
  const sk = '騎馬の鐙';
  if (!geoCache.has(sk)) {
    const cup = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    cup.scale(0.077, 0.065, 0.145);
    geoCache.set(sk, merge([
      P(at(ball(0.075, 0.021, 0.145, 10, 5), 0, -0.37, 0.055), 0x27221c, { mk: MK.iron }),
      P(at(cup, 0, -0.305, 0.06), 0x27221c, { mk: MK.iron }),
      P(limb([0, -0.305, -0.07], [0, -0.23, -0.07], 0.015, 0.012, 5), 0x27221c, { mk: MK.iron }),
    ]));
  }
  // 鐙は足と同じ脛の子。元の馬具がある時は二重に描かない。
  const irons = [];
  for (const shin of [u.shinL, u.shinR]) if (shin) {
    const iron = new THREE.Mesh(geoCache.get(sk), MAT); shin.add(iron); irons.push(iron);
  }
  if (!riderReinMat) riderReinMat = new THREE.LineBasicMaterial({ color: 0x35271b });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60), 3).setUsage(THREE.DynamicDrawUsage));
  const reins = new THREE.LineSegments(rg, riderReinMat); reins.frustumCulled = false;
  (u.seat || u.mesh).add(reins);
  u.riderModel = { irons, reins };
}

// 腕：肩を原点に真下へ。二の腕・前腕・手。籠手（鎖と篠）を着けるか、袖をたくし上げて素肌か
// part：'upper' 二の腕の籠手・'fore' 前腕の籠手・'hand' 手甲だけ（骨の入った人に着せるため）
// 本人の籠手（前腕と手甲）：一人称で目の前に来るので、丸みのある前腕の形（肘の下の膨らみ・手首へ細く・断面はやや平たい）に、
//   布の手甲の袋を縫い、侍は鎖を編んで篠（細い鉄の板）を五本、足軽は筒（一枚の板を家の色の漆で塗る）を外に当てる。紐は細い焦茶
//   座標は armGeometry と同じ（肘 y -0.27・手首 -0.5、+x×sd が外、-z が腕の甲の側）
function heroKote(o, sd, part) {
  const T = o.tier || 0, b = BUILD[T], cloth = o.cloth || 0x2b2622, kc = T >= 2 ? (o.lace || cloth) : cloth;
  const k = 'hkote|' + sd + '|' + T + '|' + kc + '|' + (o.armor || 0) + '|' + part;
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.8, 0.55, 0.4, 0.3][T];
  const P_ = [];
  const cord = 0x2e2720;
  // 手甲は写実の手（humans.js の handMat）が手の甲に塗って少し盛り上げる（形に沿う。別の板は浮いて見える）
  if (part === 'hand') { geoCache.set(k, null); return null; }
  {
    // 前腕の丸み（v：肘 0 → 手首 1）。面の向きが外を向くよう、周りの角は減る向きに回す
    const R = (v) => (0.034 + 0.016 * (1 - v) ** 1.6 + 0.004 * Math.sin(Math.min(1, v / 0.45) * Math.PI)) * b;
    const y = (v) => -0.27 - v * 0.23;
    const th0 = -sd * Math.PI / 2;   // 継ぎ目は内側（体の側）
    const ring = (th, v, dr = 0) => { const r = R(v) + dr; return [Math.sin(th) * r, y(v), Math.cos(th) * r * 0.86]; };
    // 布の袋（侍は鎖を編んだ布）。鎖の絵は筏（小さな板）の無い帯だけを、三分の一周ずつ貼る（目の大きさ 6mm ほど）
    for (const h of [0, 1, 2]) P_.push(P(surf(6, 8, (s, v) => ring(th0 - (h + s) * Math.PI * 2 / 3, v)), kc, T >= 1 ? { reg: 'kote', c2: 0x2e3236, mk2: MK.iron, swap: true, ru: [0, 0.8], rv: [0.46, 0.77] } : { reg: 'cloth', swap: true, ru: [0, 0.5], rv: [0, 0.4] }));
    // 腕の甲の側（-z。一人称で上から見える側）を中心に、少し外へ寄せて篠か筒を当てる
    const thc = Math.PI - sd * 0.3;
    if (T === 0) {
      // 筒籠手：前腕の外半分を包む一枚の板。縁は少し巻いて厚く、真ん中は膨らむ
      P_.push(P(surf(10, 6, (s, v) => { const w = 1 - 2 * s; return ring(thc + w * 1.45, 0.06 + v * 0.86, 0.0035 + 0.003 * (1 - w * w) + 0.0015 * (Math.abs(w) > 0.85 ? 1 : 0)); }), o.armor || 0x2e3236, { mk: MK.lac, reg: 'okeV', rv: [0.5, 0.75], swap: true, c2: 0x4a2a1a, mk2: MK.lac }));
    } else {
      // 篠：細長い鉄の板を五本。板は丸く盛り上がり、両の端は細る
      for (let i = -2; i <= 2; i++) P_.push(P(surf(4, 8, (s, v) => { const e = Math.sin(Math.PI * Math.min(1, v * 6, (1 - v) * 6) / 2); return ring(thc + i * 0.42 - (s - 0.5) * 0.3 * (0.6 + 0.4 * e), 0.07 + v * 0.8, 0.0025 + 0.004 * Math.sin(Math.PI * s) * e); }), T >= 2 ? 0x1c1a1a : 0x2e3236, T >= 2 ? { mk: MK.lac, reg: 'lacq' } : { mk: MK.iron, reg: 'iron' }));
    }
    // 結ぶ紐（肘の下と手首の上）と、手首の口（袋の布を折り返して締める）
    for (const v of [0.12, 0.88]) P_.push(P(surf(14, 2, (s, w) => ring(th0 - s * Math.PI * 2, v + (w - 0.5) * 0.025, 0.0055 + 0.002 * Math.sin(w * Math.PI))), cord, { reg: 'cord' }));
    P_.push(P(surf(14, 3, (s, w) => ring(th0 - s * Math.PI * 2, 0.94 + w * 0.06, 0.003 + 0.004 * Math.sin(w * Math.PI))), kc, { reg: 'cloth' }));
  }
  const g = merge(P_);
  geoCache.set(k, g);
  return g;
}
function armGeometry(o, sd, kote, hi, part) {
  if (o.nanban && !o.kosode) return nanbanGeometry('arm', hi, part, sd, { P, at, merge, MK, limb, ball });
  if (o.sohei) return soheiArm(o, sd, hi, part);
  if (o.hero && hi && kote && (part === 'fore' || part === 'hand')) return heroKote(o, sd, part);
  const skin = o.skin || 0xb58c68, cloth = o.cloth || 0x2b2622, T = o.tier || 0;
  const k = 'arm' + skin + '|' + cloth + '|' + sd + '|' + (kote ? 1 : 0) + '|' + T + '|' + (hi ? 1 : 0) + (part || '') + (T === 0 && kote ? '|' + (o.armor || 0) : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.8, 0.55, 0.4, 0.3][T];
  const b = BUILD[T];
  const P_ = [];
  const seg = hi ? 10 : 6;
  const kc = T >= 2 ? (o.lace || cloth) : cloth;   // 籠手の布（侍大将からは威糸の色の錦）
  // 肩の丸み
  if (!part) P_.push(P(at(ball(0.068 * b, 0.075, 0.068 * b, hi ? 10 : 6, 6), 0, -0.02, 0), kote ? kc : cloth, { reg: kote ? 'kote' : 'cloth', c2: 0x2e3236, mk2: MK.iron }));
  if (kote && part !== 'hand') {
    if (part !== 'fore') P_.push(P(limb([0, -0.02, 0], [0, -0.27, 0], 0.058 * b, 0.05 * b, seg), kc, { reg: 'kote', c2: 0x2e3236, mk2: MK.iron }));
    if (hi && part !== 'fore') P_.push(P(at(ball(0.034, 0.03, 0.022, 8, 5), 0, -0.27, -0.034), T === 0 ? (o.armor || 0x2e3236) : 0x2e3236, T === 0 ? { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac } : { mk: MK.iron, reg: 'iron' }));   // 肘金
    // 足軽の御貸具足の籠手：二の腕の外に小さな板（家の色の漆）を二枚
    if (hi && T === 0 && part !== 'fore') for (const y of [-0.1, -0.18]) P_.push(P(at(arcCyl(0.062 * b, 0.058 * b, 0.06, 3, Math.PI * 0.45, sd * Math.PI / 2), 0, y, 0), o.armor || 0x2e3236, { mk: MK.lac, reg: 'okeV', rv: [0.25, 0.5], swap: true, c2: 0x4a2a1a, mk2: MK.lac }));
    if (part !== 'upper') P_.push(P(limb([0, -0.27, 0], [0, -0.5, 0], 0.05 * b, 0.041 * b, seg), kc, { reg: 'kote', c2: 0x2e3236, mk2: MK.iron }));
    // 篠（前腕の外側に細い鉄の板）
    // 足軽：筒籠手（前腕の外を包む一枚の鉄の板を家の色の漆で塗り、手首と肘の下を紐で結ぶ）
    if (part !== 'upper' && T === 0) {
      const th = sd * Math.PI / 2 + Math.PI * 0.12 * sd;
      P_.push(P(at(arcCyl(0.056 * b, 0.047 * b, 0.2, hi ? 6 : 2, Math.PI * 0.95, th), 0, -0.385, 0), o.armor || 0x2e3236, { mk: MK.lac, reg: 'okeV', rv: [0.5, 0.75], swap: true, c2: 0x4a2a1a, mk2: MK.lac }));
      if (hi) for (const y of [-0.3, -0.47]) P_.push(P(at(new THREE.TorusGeometry((y > -0.4 ? 0.05 : 0.043) * b, 0.0035, 3, 10), 0, y, 0, Math.PI / 2), 0xcfc4a8, { reg: 'cord' }));
    } else if (part !== 'upper') for (const a of hi ? [-0.45, 0, 0.45] : [0]) {
      const th = sd * Math.PI / 2 + a + Math.PI * 0.15 * sd;
      P_.push(P(at(new THREE.BoxGeometry(0.013, 0.2, 0.006), Math.sin(th) * 0.048 * b, -0.385, Math.cos(th) * 0.048 * b, 0, th, 0), 0x2e3236, { mk: MK.iron, reg: 'iron' }));
    }
    if (part !== 'upper') P_.push(P(at(new THREE.CylinderGeometry(0.042 * b, 0.042 * b, 0.02, seg), 0, -0.5, 0), 0x3a342c, { reg: 'cord' }));
  } else if (!part) {
    // 袖を肘までたくし上げ、前腕は素肌。手首に布を巻く
    P_.push(P(limb([0, -0.02, 0], [0, -0.26, 0], 0.062 * b, 0.056 * b, seg), cloth, { reg: 'cloth' }));
    P_.push(P(at(new THREE.TorusGeometry(0.055 * b, 0.012, 5, seg), 0, -0.265, 0, Math.PI / 2), cloth, { reg: 'cloth' }));
    P_.push(P(limb([0, -0.27, 0], [0, -0.5, 0], 0.045 * b, 0.034 * b, seg), skin, { mk: MK.skin, reg: 'skin' }));
    if (hi) P_.push(P(at(ball(0.036 * b, 0.07, 0.034 * b, 8, 6), 0, -0.33, 0.004), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(new THREE.CylinderGeometry(0.038 * b, 0.038 * b, 0.03, seg), 0, -0.49, 0), 0x8a8270, { reg: 'cloth' }));
  }
  if (part === 'hand') {
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), 0, -0.54, -0.027, 0.1), T >= 2 || T === 0 ? (o.armor || 0x1c1a1a) : 0x2e3236, { mk: T >= 2 || T === 0 ? MK.lac : MK.iron, reg: 'lacq' }));
  } else if (part) { /* 籠手だけ */ } else if (hi) {
    // 手：握った拳（掌・指の列と節・親指）。籠手なら甲に手甲
    const hx = 0;
    P_.push(P(at(ball(0.035 * b, 0.044, 0.027, 8, 6), hx, -0.545, 0), skin, { mk: MK.skin, reg: 'skin' }));
    const fr = new THREE.CylinderGeometry(0.018, 0.018, 0.066 * b, 8); fr.rotateZ(Math.PI / 2);
    P_.push(P(at(fr, hx, -0.578, 0.014), skin, { mk: MK.skin, reg: 'skin' }));
    for (let i = 0; i < 4; i++) P_.push(P(at(ball(0.0105, 0.011, 0.011, 6, 4), hx + (i - 1.5) * 0.017 * b, -0.565, 0.028), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(limb([-sd * 0.028, -0.528, 0.012], [-sd * 0.02, -0.574, 0.032], 0.0115, 0.0095, 6), skin, { mk: MK.skin, reg: 'skin' }));
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), hx, -0.54, -0.027, 0.1), T >= 2 || T === 0 ? (o.armor || 0x1c1a1a) : 0x2e3236, { mk: T >= 2 || T === 0 ? MK.lac : MK.iron, reg: 'lacq' }));
  } else {
    // 軽い拳も丸い団子にせず、柄を包む掌と親指にする。形と材質は共有。
    P_.push(P(at(new THREE.BoxGeometry(0.061 * b, 0.068, 0.044), 0, -0.551, 0.009, -0.18), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(new THREE.BoxGeometry(0.02, 0.045, 0.024), -sd * 0.029, -0.544, 0.028, -0.32, 0, sd * 0.3), skin, { mk: MK.skin, reg: 'skin' }));
  }
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}

// 腕を狙いの点へ向ける（胴の座標で）。長さが合わなければ少し縮める
const _dn = new THREE.Vector3(0, -1, 0), _v = new THREE.Vector3();
const _rDir = new THREE.Vector3(), _rBend = new THREE.Vector3(), _rElbow = new THREE.Vector3(), _rQ = new THREE.Quaternion();
const _rBit = new THREE.Vector3(), _rGrip = new THREE.Vector3(), _rFoot = new THREE.Vector3();
function riderTack(u, w) {
  const H = u.horse && u.horse.userData.horse;
  if (!H || !u.riderModel.reins.visible) return;
  const pos = u.riderModel.reins.geometry.attributes.position;
  let n = 0;
  for (let side = 0; side < 2; side++) {
    const sd = side ? -1 : 1;
    // 銜は首と一緒に動く。鞍の揺れを引いて、乗り手の入れ物の座標へ。
    _rBit.set(sd * 0.08, 0.47, 0.73).applyEuler(H.neck.rotation).add(H.neck.position).multiplyScalar(HORSE_K);
    _rBit.y -= H.body.position.y * HORSE_K;
    _rBit.applyAxisAngle(_rAxis, -H.body.rotation.x);
    _rGrip.set(w === 'none' && !side ? 0.12 : -0.12, 1.02, 0.36).applyEuler(u.body.rotation).add(u.body.position);
    for (let seg = 0; seg < 4; seg++) for (let end = 0; end < 2; end++) {
      const k = (seg + end) / 4;
      pos.setXYZ(n++, _rBit.x + (_rGrip.x - _rBit.x) * k, _rBit.y + (_rGrip.y - _rBit.y) * k - Math.sin(k * Math.PI) * 0.04, _rBit.z + (_rGrip.z - _rBit.z) * k);
    }
    const leg = side ? u.legR : u.legL, shin = side ? u.shinR : u.shinL;
    if (shin) {
      _rFoot.set(0, -0.23, -0.07).applyEuler(shin.rotation).add(shin.position).applyEuler(leg.rotation).add(leg.position);
      pos.setXYZ(16 + side * 2, sd * 0.2, 1.34, 0.03);
      pos.setXYZ(17 + side * 2, _rFoot.x, _rFoot.y, _rFoot.z);
    }
  }
  pos.needsUpdate = true;
}
const _rAxis = new THREE.Vector3(1, 0, 0);
function aimArm(arm, tx, ty, tz) {
  const fore = arm.userData.riderFore;
  if (fore) {
    // 肩・肘・拳の二節。腕全体を縮めず、肘を体の外・下へ折る。
    _rDir.set(tx - arm.position.x, ty - arm.position.y, tz - arm.position.z);
    const d = Math.max(0.06, Math.min(0.53, _rDir.length())); _rDir.normalize();
    _rBend.set(arm.position.x > 0 ? 0.6 : -0.6, -1, -0.15);
    _rBend.addScaledVector(_rDir, -_rBend.dot(_rDir)).normalize();
    const along = (0.27 * 0.27 - 0.28 * 0.28 + d * d) / (2 * d);
    _rElbow.copy(_rDir).multiplyScalar(along).addScaledVector(_rBend, Math.sqrt(Math.max(0, 0.27 * 0.27 - along * along)));
    _v.copy(_rElbow).normalize(); arm.quaternion.setFromUnitVectors(_dn, _v); arm.scale.y = 1;
    _v.copy(_rDir).multiplyScalar(d).sub(_rElbow).normalize();
    _rQ.setFromUnitVectors(_dn, _v); fore.quaternion.copy(arm.quaternion).invert().multiply(_rQ);
    const sleeve = arm.userData.riderSleeve;
    if (sleeve) sleeve.quaternion.identity().slerp(arm.quaternion, 0.4);
    return;
  }
  _v.set(tx - arm.position.x, ty - arm.position.y, tz - arm.position.z);
  const d = _v.length() || 1;
  arm.quaternion.setFromUnitVectors(_dn, _v.multiplyScalar(1 / d));
  arm.scale.y = Math.max(0.62, Math.min(1.05, d / 0.55));
}

// 腕の構え：右手は武器の握り、左手は柄の先（槍・鉄砲）か柄頭（刀）へ
export function poseArms(u, t = 0) {
  if (!u.armR) return;
  const h = u.hand, by = u.body.position.y;
  const rx = h.rotation.x, ry = h.rotation.y;
  const dx = Math.sin(ry) * Math.cos(rx), dy = -Math.sin(rx), dz = Math.cos(ry) * Math.cos(rx);
  const hx = h.position.x, hy = h.position.y - by, hz = h.position.z;
  const w = u.wpnKind || u.lookWeapon;
  if (u.riderModel) {
    const H = u.horse && u.horse.userData.horse, on = !!u.mounted && !(H && H.real && H.real.on);
    for (const iron of u.riderModel.irons) iron.visible = on;
    u.riderModel.reins.visible = on && u.alive !== false;
  }
  if (u.mounted && w !== 'bow') {
    // 刀も槍も右手で握り、左手は必ず手綱。手ぶらなら両手で握る。
    aimArm(u.armR, w === 'none' ? 0.12 : hx, w === 'none' ? 1.02 : hy, w === 'none' ? 0.36 : hz);
    aimArm(u.armL, -0.12, 1.02, 0.36);
  } else if (u.look?.standard && w === 'none') {
    aimArm(u.armR, hx, hy, hz);
    aimArm(u.armL, -0.31, 0.86, 0.1 + Math.sin(t) * 0.22 * Math.min(1, u.moving || 0));
  } else if (w === 'bow') {
    // 弓は左手で押し出し、右手は弦を引く（引いた弦の所 u.bowR）
    aimArm(u.armL, hx, hy, hz);
    if (u.bowR) aimArm(u.armR, u.bowR.x, u.bowR.y - by, u.bowR.z);
    else aimArm(u.armR, 0.12, 1.28, u.atk ? -0.05 : 0.1);
  } else if (u.lh) {
    // 鉄砲の込め直し：右手で筒を支え、左手は筒先・火皿へ
    aimArm(u.armR, hx, hy, hz);
    aimArm(u.armL, u.lh[0], u.lh[1] - by, u.lh[2]);
  } else if ((w === 'spear' || w === 'gun') && rx < -0.4) {
    // 担いで歩くときは右手だけで持ち、左手は振る
    aimArm(u.armR, hx, hy, hz);
    const sw = Math.sin(t) * 0.22 * Math.min(1, u.moving || 0);
    aimArm(u.armL, -0.31, 0.86, 0.1 + sw);
  } else if (w === 'spear' || w === 'gun' || w === 'sword') {
    aimArm(u.armR, hx, hy, hz);
    const k = w === 'sword' ? -0.13 : w === 'gun' ? 0.36 : 0.38;
    aimArm(u.armL, hx + dx * k - 0.06, hy + dy * k, hz + dz * k);
  } else {
    // 手ぶら：歩けば腕を振る
    const sw = Math.sin(t) * 0.25 * Math.min(1, u.moving || 0);
    aimArm(u.armR, 0.31, 0.86, 0.12 + sw);
    aimArm(u.armL, -0.31, 0.86, 0.12 - sw);
  }
  if (u.mounted && u.riderModel) riderTack(u, w);
}

// ---------------- 武器 ----------------
// どの武器も右手の握り（u.hand の原点）から前（+z）へ伸びる
// 本物の武器の形（tools/weapons.mjs で軽くした物。src/asset_weapons.js。どれも CC BY 4.0、docs/CREDITS.md）：
//   火縄銃 stalkerlis180「Tanegasima」・槍の穂と石突 SublimeHurdle_1542「Yari」・打刀 Bermu「Katana Japanese sword」
//   絵は持たず、頂点の色と素材で兵の材質（MAT）に乗せる（まとめて描ける）。近い兵と自分だけこの形、遠い兵は下の自前の形
const REALW = {};
// 見比べる時：?oldwpn（または window.__oldwpn = true を戦の前に）で、今までの自前の形だけにする
const realOn = () => !!WEAPONS && (typeof location === 'undefined' || !((typeof window !== 'undefined' && window.__oldwpn) || /[?&]oldwpn\b/.test(location.search)));
function realWeapon(key, dirt = 0.25) {
  if (REALW[key]) return REALW[key];
  const D = WEAPONS[key];
  const u8 = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const pos = new Float32Array(u8(D.P).buffer), nor = new Float32Array(u8(D.N).buffer), C = u8(D.C), K = u8(D.K), I = new Uint16Array(u8(D.I).buffer);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  P(g, 0xffffff, {});
  const col = g.attributes.color, c2 = g.attributes.col2, mtl = g.attributes.mtl, c = new THREE.Color();
  for (let i = 0; i < K.length; i++) {
    c.setRGB(C[i * 3] / 255, C[i * 3 + 1] / 255, C[i * 3 + 2] / 255, THREE.SRGBColorSpace);
    col.setXYZ(i, c.r, c.g, c.b); c2.setXYZ(i, c.r, c.g, c.b);
    mtl.setX(i, K[i] * 9 + dirt * 0.9);
  }
  g.computeBoundingSphere();
  REALW[key] = g;
  return g;
}
// 槍の穂・石突：本物の形（長さ 1・幅 ±1 にそろえてある）を、拵えの寸法へ伸ばして置く
function realSpearPart(key, sx, sy, sz, z) {
  const g = realWeapon(key, 0.3).clone();
  g.scale(sx, sy, sz); g.translate(0, 0, z); g.computeVertexNormals();
  return g;
}
// 断面（反時計回りの多角形）を z に沿って押し出す。path(v) → [z, y, 横の倍率, 縦の倍率]
function loft(pts, nv, path) {
  const n = pts.length;
  return surf(n, nv, (u, v) => { const q = pts[Math.round(u * n) % n], [z, y, sx, sy] = path(v); return [q[0] * sx, y + q[1] * sy, z]; });
}
const DIA = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TRI = [[1, -0.5], [0, 1], [-1, -0.5]];
const OCT = Array.from({ length: 8 }, (_, i) => [Math.cos((i + 0.5) * Math.PI / 4), Math.sin((i + 0.5) * Math.PI / 4)]);
// 打刀の断面：下が刃、上が峰。鎬が張る
const KATANA = [[0, -1], [1, 0.25], [0.78, 0.92], [0, 1], [-0.78, 0.92], [-1, 0.25]];

// 槍の拵え：L 全長、grip 石突から右手まで、ho 穂の形、hoL 穂の長さ、r 柄の太さ、bend しなりやすさ
export const SPEARS = {
  su: { L: 2.9, grip: 0.95, ho: 'sankaku', hoL: 0.2, r: 0.016, bend: 0.45 },       // 素槍（一間半ほど）：侍・騎馬・本人
  omi: { L: 3.2, grip: 1.0, ho: 'omi', hoL: 0.48, r: 0.018, bend: 0.4 },           // 大身槍：穂が一尺半
  naga: { L: 4.5, grip: 1.35, ho: 'sankaku', hoL: 0.18, r: 0.017, bend: 0.8 },     // 長柄（二間半）：本人の長柄
  jumonji: { L: 3.0, grip: 0.95, ho: 'jumonji', hoL: 0.26, r: 0.017, bend: 0.42 },  // 十文字槍：穂の根元の両脇に鎌刃
  nagae: { L: 5.4, grip: 1.6, ho: 'sankaku', hoL: 0.16, r: 0.019, bend: 1 },       // 足軽の長柄（三間）
  nagae35: { L: 6.3, grip: 1.9, ho: 'sankaku', hoL: 0.16, r: 0.02, bend: 1.15 },   // 織田の長柄（三間半）
};
export function spearSpec(v, extra = 0) {
  if (SPEARS[v]) return SPEARS[v];
  const L = 4.2 + extra;
  return { L, grip: L * 0.3, ho: 'sankaku', hoL: 0.17, r: 0.018, bend: L / 5.4 };
}
// 槍：柄は三つに分け、節で曲げてしなりを出す（近くの兵だけ。遠くは一つの形）
function spearGeometry(sp) {
  const k = 'spear|' + sp.L + '|' + sp.ho + (realOn() ? '' : '|old');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.3;
  const { L, grip, hoL, r } = sp;
  const z0 = -grip, zt = L - grip, zh = zt - hoL;
  const j1 = 0.42, j2 = j1 + (zh - 0.5 - j1) * 0.5;
  const sec = [[], [], []];
  // far：遠くの一つの形（full）だけに入れる自前の穂・石突。near：近くの節の形（s0・s2。しなる距離の兵と自分）に入れる本物の穂・石突
  const far = [], near = [[], [], []], RO = realOn();
  const two = (i, proc, real) => { if (RO) { far.push(proc); near[i].push(real()); } else sec[i].push(proc); };
  const rad = (z) => r * (1.1 - 0.25 * (z - z0) / (zh - z0));   // 元が太く、先が細い
  // 柄の色：本物の槍（Yari）の柄の漆（黒みの強い溜塗の赤）
  const shaft = (i, a, b) => sec[i].push(P(at(new THREE.CylinderGeometry(rad(b), rad(a), b - a, 7, 1, true), 0, 0, (a + b) / 2, Math.PI / 2), RO ? 0x2c0a0a : 0x2a1c12, { mk: MK.lac, reg: 'wood', swap: true }));
  shaft(0, z0 + 0.06, j1); shaft(1, j1, j2); shaft(2, j2, zh - 0.38);
  // 石突（鉄の尻金）
  two(0, P(at(new THREE.CylinderGeometry(rad(z0) + 0.002, rad(z0) * 0.75, 0.08, 7), 0, 0, z0 + 0.04, Math.PI / 2), 0x3a3e42, { mk: MK.iron, reg: 'iron' }),
    () => realSpearPart('yariButt', rad(z0) + 0.003, rad(z0) + 0.003, 0.07, z0 + 0.07));
  // 千段巻（穂の下を糸で巻いて漆で固める）と、口金
  sec[2].push(P(at(new THREE.CylinderGeometry(rad(zh) + 0.0025, rad(zh) + 0.003, 0.28, 7), 0, 0, zh - 0.25, Math.PI / 2), 0x1d1a16, { reg: 'cord', swap: true }));
  sec[2].push(P(at(new THREE.CylinderGeometry(rad(zh) + 0.001, rad(zh) + 0.0035, 0.1, 8), 0, 0, zh - 0.06, Math.PI / 2), 0x3a3e42, { mk: MK.iron, reg: 'iron' }));
  // 塩首（穂の根元の細い首）
  sec[2].push(P(at(new THREE.CylinderGeometry(0.0055, 0.009, 0.035, 6), 0, 0, zh - 0.0, Math.PI / 2), 0x55595c, { mk: MK.iron }));
  if (sp.ho === 'jumonji') {
    // 十文字：まっすぐな両刃の穂と、根元から左右へ張り出して先が前へ反る鎌刃（上から見て十の字）
    sec[2].push(P(loft(DIA, 10, (v) => { const w = 0.014 * (v < 0.1 ? 0.75 + v * 2.5 : 1 - v * 0.25) * Math.min(1, (1 - v) / 0.25); return [zh + 0.015 + v * hoL, 0, w, 0.0055 * Math.min(1, (1 - v) / 0.25 + 0.2)]; }), 0xb6babc, { mk: MK.iron, reg: 'iron' }));
    const z0k = zh + 0.035;
    for (const sd of [-1, 1]) {
      // 腕：根元は太く、先へ細る。平たい菱の断面
      const arm = new THREE.CylinderGeometry(0.004, 0.015, 0.1, 4);
      arm.scale(0.35, 1, 1); arm.rotateZ(-sd * Math.PI / 2); arm.rotateY(-sd * 0.22);
      arm.translate(sd * 0.05 * Math.cos(0.22), 0, z0k + 0.05 * Math.sin(0.22));
      sec[2].push(P(arm, 0xb0b4b6, { mk: MK.iron, reg: 'iron' }));
      // 先：前へ曲がる小さな切っ先（引っかける所）
      const ex = sd * 0.1 * Math.cos(0.22), ez = z0k + 0.1 * Math.sin(0.22);
      const hook = new THREE.CylinderGeometry(0.0008, 0.0036, 0.05, 4);
      hook.scale(1, 1, 0.45); hook.rotateX(Math.PI / 2); hook.rotateY(-sd * 0.35);
      hook.translate(ex + sd * 0.008, 0, ez + 0.022);
      sec[2].push(P(hook, 0xb8bcbe, { mk: MK.iron, reg: 'iron' }));
    }
  } else if (sp.ho === 'omi') {
    // 大身：長い両刃の穂。鎬で菱の断面、先で細る
    two(2, P(loft(DIA, 12, (v) => { const w = 0.019 * (v < 0.08 ? 0.7 + v * 3.7 : 1 - v * 0.2) * Math.min(1, (1 - v) / 0.22); return [zh + 0.015 + v * hoL, 0, w, 0.006 * (1 - v * 0.5) * Math.min(1, (1 - v) / 0.22 + 0.2)]; }), 0xb8bcbe, { mk: MK.iron, reg: 'iron' }),
      () => realSpearPart('yariHead', 0.019, 0.0065, hoL, zh + 0.012));
  } else {
    // 平三角：三角の断面の穂
    two(2, P(loft(TRI, 6, (v) => { const w = 0.015 * Math.min(0.65 + v * 4, (1 - v) * 1.2); return [zh + 0.015 + v * hoL, 0, w, 0.0065 * Math.min(1, (1 - v) * 1.3)]; }), 0xb0b4b6, { mk: MK.iron, reg: 'iron' }),
      () => realSpearPart('yariHead', 0.014, 0.0065, hoL, zh + 0.012));
  }
  const full = merge([...sec.flat().map((g) => g.clone()), ...far]);
  const s0 = merge([...sec[0], ...near[0]]), s1 = merge(sec[1]), s2 = merge([...sec[2], ...near[2]]);
  s1.translate(0, 0, -j1); s2.translate(0, 0, -j2);
  const out = { full, s0, s1, s2, j1, j2, tip: zt, butt: z0, sp };
  geoCache.set(k, out);
  return out;
}
// 打刀：刃長二尺三寸（70cm）ほど。反り・鎺・鍔・柄巻（菱の窓から鮫皮）・柄頭
function swordGeometry() {
  const k = 'w-katana';
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.25;
  const parts = [];
  const Lb = 0.7, zb = 0.1, sori = 0.07;
  const bl = P(loft(KATANA, 26, (v) => {
    const w = 0.0155 - 0.0045 * v, tip = v > 0.93 ? Math.sqrt(Math.max(0, (1 - v) / 0.07)) : 1;
    return [zb + v * Lb, sori * v * v + w * (1 - tip), 0.0036 * (1 - 0.35 * v) * Math.max(0.15, tip), w * tip];
  }), 0xc6cacc, { mk: MK.iron, reg: 'iron' });
  // 刃文と地鉄：刃先は焼きが入って白く光り、鎬へ向かって暗い地鉄へ移る。峰と鎬地は黒みの強い鉄（一色の板に見せない）
  {
    const col = bl.attributes.color, n = KATANA.length;
    const HA = new THREE.Color(0xeef0f0), SHI = new THREE.Color(0xa4a9ac), JI = new THREE.Color(0x7c8286);
    for (let i = 0; i < col.count; i++) { const q = (i % (n + 1)) % n, c = q === 0 ? HA : q === 1 || q === n - 1 ? SHI : JI; col.setXYZ(i, c.r, c.g, c.b); }
  }
  parts.push(bl);
  // 鎺（はばき）と切羽
  parts.push(P(at(new THREE.BoxGeometry(0.0095, 0.034, 0.032), 0, 0.001, 0.085), 0xb08a3a, { mk: MK.gold }));
  parts.push(P(at(new THREE.BoxGeometry(0.012, 0.036, 0.004), 0, 0.001, 0.068), 0xa8893f, { mk: MK.gold }));
  // 鍔：少し縦長の丸い鉄鍔
  const tb = new THREE.CylinderGeometry(0.037, 0.037, 0.006, 18); tb.scale(0.88, 1, 1);
  parts.push(P(at(tb, 0, 0.002, 0.063, Math.PI / 2), 0x2a2622, { mk: MK.iron, reg: 'iron' }));
  // 柄：楕円の断面。柄糸を菱に巻き、窓から白い鮫皮がのぞく
  const ts = new THREE.CylinderGeometry(0.0132, 0.0148, 0.25, 10); ts.scale(1, 1, 1.28);
  parts.push(P(at(ts, 0, 0, -0.063, Math.PI / 2), 0x1d1a18, { reg: 'cord', swap: true }));
  for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) parts.push(P(at(new THREE.BoxGeometry(0.002, 0.0105, 0.0105), sd * 0.0126, 0, 0.04 - i * 0.034, Math.PI / 4), 0xd8d2c0, {}));
  // 目貫（金の飾り）と柄頭
  parts.push(P(at(ball(0.004, 0.007, 0.014, 6, 4), 0.014, 0.002, -0.03), 0xc9a24a, { mk: MK.gold }));
  parts.push(P(at(ball(0.004, 0.007, 0.014, 6, 4), -0.014, 0.002, -0.09), 0xc9a24a, { mk: MK.gold }));
  const kz = new THREE.CylinderGeometry(0.0145, 0.016, 0.022, 10); kz.scale(1, 1, 1.28);
  parts.push(P(at(kz, 0, 0, -0.198, Math.PI / 2), 0x2a2622, { mk: MK.iron }));
  const g = merge(parts);
  geoCache.set(k, g);
  return g;
}
// 火縄銃：八角の長い筒、筒先近くまでの台木、頬に当てる短い台尻、真鍮のからくり（火挟み・火皿・火蓋）、
// 引き金、目当て、下に込め矢（別の形。込め直しで抜いて使う）、火挟みから下がる火縄
const GUN_MUZ = 1.02, GUN_BORE = 0.034;
// 込め矢を納める所（台木の中の溝。本物の鉄砲の込め矢と同じ高さ）[y, z]
const GUN_RAM = [0.013, 0.12];
function gunGeometry() {
  const k = 'w-gun';
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.3;
  const parts = [], zm = GUN_MUZ, yb = GUN_BORE;
  parts.push(P(loft(OCT, 14, (v) => { const r = 0.0175 - 0.0045 * v + (v > 0.96 ? 0.0022 : 0); return [0.0 + v * zm, yb, r, r]; }), 0x2a2622, { mk: MK.iron, reg: 'iron' }));
  parts.push(P(at(new THREE.CircleGeometry(0.0072, 8), 0, yb, zm - 0.003), 0x060606, { mk: MK.iron }));
  // 目当て（先と元）
  parts.push(P(at(new THREE.BoxGeometry(0.004, 0.009, 0.012), 0, yb + 0.018, zm - 0.03), 0x2a2622, { mk: MK.iron }));
  parts.push(P(at(new THREE.BoxGeometry(0.01, 0.012, 0.006), 0, yb + 0.021, 0.3), 0x2a2622, { mk: MK.iron }));
  // 台木（筒先の手前まで）
  // 台木は樫に漆を掛けた濃い赤茶（明るい橙の板にしない）。木目は筒に沿って流れる
  const st = new THREE.BoxGeometry(0.036, 0.032, zm - 0.1, 1, 1, 4); st.translate(0, 0.008, (zm - 0.1) / 2 - 0.03);
  parts.push(P(st, 0x3e2416, { mk: MK.lac, reg: 'wood', swap: true }));
  // 台尻：頬付けの短い床。少し下へ曲がる。手の脂と擦れで少し黒ずむ
  parts.push(P(at(new THREE.BoxGeometry(0.044, 0.07, 0.34), 0, -0.018, -0.2, -0.16), 0x331d10, { mk: MK.lac, reg: 'wood', swap: true }));
  // 真鍮の帯（筒と台をとめる）
  for (const z of [0.2, 0.52, 0.82]) parts.push(P(at(new THREE.BoxGeometry(0.04, 0.05, 0.01), 0, 0.02, z), 0xa8893f, { mk: MK.gold }));
  // からくり：右の地板・火挟み・火皿・火蓋・引き金
  parts.push(P(at(new THREE.BoxGeometry(0.004, 0.028, 0.13), 0.02, 0.01, -0.02), 0xa8893f, { mk: MK.gold }));
  parts.push(P(limb([0.026, 0.018, -0.05], [0.03, 0.06, -0.012], 0.0035, 0.0035, 5), 0xb09040, { mk: MK.gold }));
  parts.push(P(limb([0.03, 0.06, -0.012], [0.028, 0.05, 0.03], 0.0035, 0.003, 5), 0xb09040, { mk: MK.gold }));
  parts.push(P(at(new THREE.BoxGeometry(0.014, 0.006, 0.022), 0.024, yb - 0.004, 0.045), 0xa8893f, { mk: MK.gold }));
  parts.push(P(at(new THREE.BoxGeometry(0.016, 0.0025, 0.024), 0.026, yb + 0.0015, 0.045, 0, 0, -0.25), 0xb09a50, { mk: MK.gold }));
  parts.push(P(limb([0, -0.008, -0.03], [0, -0.04, -0.05], 0.0035, 0.003, 4), 0x3a3e42, { mk: MK.iron }));
  // 火縄：火挟みから右の脇へ輪になって垂れる
  const cord = new THREE.CatmullRomCurve3([[0.028, 0.05, 0.034], [0.036, 0.03, -0.02], [0.05, -0.04, -0.08], [0.045, -0.13, -0.04], [0.035, -0.09, 0.06], [0.03, -0.02, 0.1]].map((p) => new THREE.Vector3(...p)));
  parts.push(P(new THREE.TubeGeometry(cord, 16, 0.0035, 4), 0x6a5a40, { reg: 'cord' }));
  const g = merge(parts);
  geoCache.set(k, g);
  return g;
}
function ramGeometry() {
  const k = 'w-ram';
  if (geoCache.has(k)) return geoCache.get(k);
  const g = merge([P(at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.9, 5), 0, 0, 0.45, Math.PI / 2), 0x6a4a30, { mk: MK.wood }), P(at(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), 0, 0, 0.9, Math.PI / 2), 0xa8893f, { mk: MK.gold })]);
  geoCache.set(k, g);
  return g;
}
// 弾込めの小道具。全員で形と材質を使い回す。火薬入れの口は上向き。
function gunLoadGeometry(ball) {
  const k = ball ? 'w-load-ball' : 'w-load-powder';
  if (geoCache.has(k)) return geoCache.get(k);
  const g = ball
    ? merge([P(new THREE.SphereGeometry(0.008, 6, 4), 0x79736a, { mk: MK.iron })])
    : merge([P(new THREE.SphereGeometry(0.035, 6, 4), 0x65432b, { mk: MK.wood }), P(at(new THREE.CylinderGeometry(0.007, 0.011, 0.04, 5), 0, 0.045, 0), 0xa8893f, { mk: MK.gold })]);
  geoCache.set(k, g);
  return g;
}
// 和弓：七尺三寸（2.2m）、握りは下から三分の一。draw（0..1）で引いた形（弓の先が射手の方へ寄る）
const BOW_B = -0.74, BOW_T = 1.46;
function bowGeometry(draw = 0) {
  const k = 'w-bow' + draw;
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.25;
  const parts = [];
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, y0 = BOW_B + t * (BOW_T - BOW_B), kk = (y0 - 0.36) / 1.1;
    pts.push(new THREE.Vector3(0, y0 * (1 - 0.05 * draw * kk * kk) + 0.36 * 0.05 * draw * kk * kk, -(0.17 + 0.2 * draw) * kk * kk + 0.02));
  }
  const bowC = new THREE.CatmullRomCurve3(pts);
  parts.push(P(new THREE.TubeGeometry(bowC, 28, 0.013, 5), 0x2b1f16, { mk: MK.lac, reg: 'lacq' }));
  // 籐の巻き（黒い輪）と握り革
  for (const i of [2, 4, 6, 14, 16, 18]) parts.push(P(limb([pts[i].x, pts[i].y - 0.02, pts[i].z], [pts[i].x, pts[i].y + 0.02, pts[i].z], 0.0155, 0.0155, 6), 0x15110d, { mk: MK.lac }));
  parts.push(P(limb([0, -0.08, 0.02], [0, 0.1, 0.02], 0.019, 0.019, 6), 0xd8d0bc, { reg: 'cord' }));
  const g = merge(parts);
  g.userData.tips = [pts[20].clone(), pts[0].clone()];
  geoCache.set(k, g);
  return g;
}
// 矢：先（鏃）が原点、矢筈が後ろ（-z）。三枚の羽
let ARROW_GEO = null;
export function arrowGeometry() {
  if (ARROW_GEO) return ARROW_GEO;
  DIRT = 0.2;
  const parts = [];
  parts.push(P(at(new THREE.CylinderGeometry(0.0045, 0.0045, 0.88, 4), 0, 0, -0.46, Math.PI / 2), 0x8a7250, { mk: MK.wood }));
  const hd = new THREE.ConeGeometry(0.009, 0.06, 4); hd.scale(1, 1, 0.35);
  parts.push(P(at(hd, 0, 0, -0.03, Math.PI / 2), 0x3a3e42, { mk: MK.iron }));
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    parts.push(P(at(new THREE.BoxGeometry(0.0015, 0.018, 0.13), Math.sin(a) * 0.01, Math.cos(a) * 0.01, -0.8, 0, 0, -a), i === 0 ? 0x2a2622 : 0xd8d0bc, {}));
  }
  ARROW_GEO = merge(parts);
  return ARROW_GEO;
}
// 折った矢：刺さった所から 0.14m の柄の折れ口だけ
let ARROW_STUB = null;
function arrowStub() {
  if (ARROW_STUB) return ARROW_STUB;
  ARROW_STUB = merge([P(at(new THREE.CylinderGeometry(0.0045, 0.005, 0.26, 4), 0, 0, -0.13, Math.PI / 2), 0x8a7250, { mk: MK.wood })]);
  return ARROW_STUB;
}
// 弦：長さ 1 の細い筒（根元が原点、+y へ）
const STRING_GEO = (() => { const g = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 3); g.translate(0, 0.5, 0); return P(g, 0xd8d0bc, {}); })();
const EMBER_MAT = new THREE.MeshBasicMaterial({ color: 0xff6a22 });
const EMBER_GEO = new THREE.SphereGeometry(0.006, 5, 4);

// 武器の形（兵の手に持たせる物）。槍はしなりの節、鉄砲は込め矢と火縄の火、弓は弦と番えた矢を子に持つ
function weaponGeometry(kind, extra = 0, sk) {
  if (kind === 'spear') return spearGeometry(spearSpec(sk, extra)).full;
  if (kind === 'sword') return swordGeometry();
  if (kind === 'gun') return gunGeometry();
  if (kind === 'bow') return bowGeometry(0);
  const k = 'w-none';
  if (!geoCache.has(k)) geoCache.set(k, merge([P(new THREE.BoxGeometry(0.01, 0.01, 0.01), 0x000000)]));
  return geoCache.get(k);
}
export function makeWeapon(kind, extra = 0, sk) {
  const m = new THREE.Mesh(weaponGeometry(kind, extra, sk), MAT);
  m.userData.kind = kind;
  // 鉄砲・刀：近い兵と自分は本物の形、遠い兵は自前の形（まとめて描く時も userData.lod で選ぶ）
  if ((kind === 'gun' || kind === 'sword') && realOn()) lodSwap(m, realWeapon(kind), m.geometry);
  if (kind === 'spear') {
    const G = spearGeometry(spearSpec(sk, extra));
    const a = new THREE.Mesh(G.s1, MAT), b = new THREE.Mesh(G.s2, MAT);
    a.position.z = G.j1; b.position.z = G.j2 - G.j1;
    a.add(b); a.visible = false; m.add(a);
    m.userData.flex = { G, a, b, on: false, ang: 0, vel: 0 };
    m.userData.tip = G.tip; m.userData.butt = G.butt; m.userData.spec = G.sp;
  } else if (kind === 'gun') {
    // 火皿と筒の間の雨覆。近い筒・遠い筒とも同じ小さな板を付ける。
    const ck = 'w-rain-cover';
    if (!geoCache.has(ck)) geoCache.set(ck, merge([P(at(new THREE.BoxGeometry(0.002, 0.045, 0.038), 0.016, 0.055, 0.045), 0xa8893f, { mk: MK.gold })]));
    const cover = new THREE.Mesh(geoCache.get(ck), MAT);
    m.add(cover); m.userData.rainCover = cover;
    const ram = new THREE.Mesh(ramGeometry(), MAT);
    ram.position.set(0, GUN_RAM[0], GUN_RAM[1]);
    m.add(ram);
    const em = new THREE.Mesh(EMBER_GEO, EMBER_MAT);
    // 火挟みの頭（本物の形の火挟み。遠くの自前の形でも同じ所で見分けは付かない）
    if (WEAPONS) em.position.fromArray(WEAPONS.gun.ember);
    else em.position.set(0, GUN_RAM[0], GUN_RAM[1]);
    m.add(em);
    m.userData.ram = ram; m.userData.ember = em;
    const powder = new THREE.Mesh(gunLoadGeometry(false), MAT), ball = new THREE.Mesh(gunLoadGeometry(true), MAT);
    powder.visible = ball.visible = false;
    powder.castShadow = ball.castShadow = false;
    m.add(powder, ball);
    m.userData.loadPowder = powder; m.userData.loadBall = ball;
  } else if (kind === 'bow') {
    const s1 = new THREE.Mesh(STRING_GEO, MAT), s2 = new THREE.Mesh(STRING_GEO, MAT);
    const ar = new THREE.Mesh(arrowGeometry(), MAT);
    ar.visible = false;
    m.add(s1, s2, ar);
    m.userData.bow = { s1, s2, ar, draw: -1 };
    setBowDraw(m, 0, null);
    loadYumi();
  }
  return m;
}
// 弓を引いた形にする。nock：弦を引く所（弓の手の座標）。null なら弦はまっすぐ
const _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function aimSeg(m, a, b) {
  _n2.copy(b).sub(a);
  const L = _n2.length() || 1e-4;
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, _n2.multiplyScalar(1 / L));
  m.scale.set(1, L, 1);
}
export function setBowDraw(w, draw, nock) {
  const B = w.userData.bow;
  if (!B) return;
  const lv = draw > 0.66 ? 1 : draw > 0.25 ? 0.5 : 0;
  // 近くの兵（B.near。army_anim の poseBow が決める）は本物の和弓と矢（src/yumi.js）。遠くは今の軽い形
  const real = !!(B.near && YUMI.ready);
  if (lv !== B.lv || real !== B.real) {
    B.lv = lv;
    if (real !== B.real) { B.real = real; B.ar.geometry = real ? YUMI.ya : arrowGeometry(); B.ar.material = real ? YUMI.arrowMat : MAT; w.material = real ? YUMI.bowMat : MAT; }
    w.geometry = real ? YUMI.bows[lv] : bowGeometry(lv);
  }
  const [tt, tb] = w.geometry.userData.tips;
  if (!nock) { _n1.set(0, (tt.y + tb.y) / 2, tt.z); nock = _n1; }
  aimSeg(B.s1, tt, nock); aimSeg(B.s2, tb, nock);
}
// 槍のしなり：節の角度をばねで動かす（近くの兵だけ曲げる）
function flexSpear(w, dt, on, sag) {
  const F = w.userData.flex;
  if (!F) return;
  if (on !== F.on) {
    F.on = on; F.a.visible = on;
    w.geometry = on ? F.G.s0 : F.G.full;
    if (!on) { F.ang = 0; F.vel = 0; }
  }
  if (!on) return;
  const B = F.G.sp.bend;
  // ばね：重さで先が少し垂れ（sag）、打った・当たった勢い（vel）で揺れて収まる
  const target = sag * B * 0.035;
  F.vel += ((target - F.ang) * 90 / B - F.vel * 7) * dt;
  F.ang += F.vel * dt;
  F.a.rotation.x = F.ang * 0.45; F.b.rotation.x = F.ang * 0.55;
}
export function kickSpear(w, v) { const F = w && w.userData.flex; if (F) F.vel += v * F.G.sp.bend; }

// ---------------- 馬 ----------------
// 部品ごとに動く馬（脚・首・尾）。style は拵え（毛色・手綱・厚総・馬鎧）
const horseCache = new Map();
// 馬の部品：近くは滑らかな形（hiBuild）、遠くは軽い形（build）。描く直前に距離で入れ替える
function mergedMesh(key, build, hiBuild) {
  if (!horseCache.has(key)) {
    const parts = [];
    build(parts);
    horseCache.set(key, merge(parts));
  }
  const m = new THREE.Mesh(horseCache.get(key), MAT);
  if (hiBuild) {
    const kh = key + '|H';
    if (!horseCache.has(kh)) { const parts = []; DIRT = 0.25; hiBuild(parts); horseCache.set(kh, merge(parts)); }
    lodSwap(m, horseCache.get(kh), horseCache.get(key), 30);
  }
  m.castShadow = true;
  return m;
}

// ---- 滑らかな馬（近くの馬） ----
// 表から値を引く（[位置, 値] の並びを線でつなぐ）
function tab(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; const k = (x - a) / (b - a); return va + (vb - va) * k * k * (3 - 2 * k) + (vb - va) * 0 ; }
  return T[T.length - 1][1];
}
// 道すじに沿った管（左右は x、上下は道すじと x に直交）。rad(t) → [左右の半径, 上下の半径, 上下のずれ]
const _hs = new THREE.Vector3(1, 0, 0);
function sweep(curve, rad, nu = 14, nv = 16) {
  const C = new THREE.Vector3(), Tg = new THREE.Vector3(), N2 = new THREE.Vector3();
  return surf(nu, nv, (u, v) => {
    curve.getPointAt(v, C); curve.getTangentAt(v, Tg);
    N2.set(0, Tg.z, -Tg.y).normalize();   // 背の側
    const [rx, ry, off = 0] = rad(v);
    const a = u * Math.PI * 2;
    return [C.x + Math.sin(a) * rx, C.y + N2.y * (Math.cos(a) * ry + off), C.z + N2.z * (Math.cos(a) * ry + off)];
  });
}
const bez = (...p) => (p.length === 3 ? new THREE.QuadraticBezierCurve3(...p.map((q) => new THREE.Vector3(...q))) : new THREE.CubicBezierCurve3(...p.map((q) => new THREE.Vector3(...q))));
const coatO = (st, extra = {}) => ({ mk: MK.skin, reg: 'plain', ...extra });
const lightCoat = (c) => new THREE.Color(c).getHSL({}).l > 0.45;
// 胴：胸は深く、腹は締まり、尻は丸く高い。肩と尻の筋肉の張り
const H_TOP = [[-0.95, 1.36], [-0.86, 1.5], [-0.62, 1.6], [-0.35, 1.575], [0, 1.54], [0.3, 1.56], [0.5, 1.63], [0.7, 1.56], [0.86, 1.42], [0.95, 1.3]];
const H_BOT = [[-0.95, 1.3], [-0.86, 1.12], [-0.6, 1.03], [-0.3, 0.99], [0, 0.96], [0.3, 0.94], [0.5, 0.95], [0.7, 1.0], [0.86, 1.12], [0.95, 1.24]];
const H_W = [[-0.97, 0.02], [-0.9, 0.16], [-0.78, 0.25], [-0.6, 0.285], [-0.3, 0.29], [0, 0.28], [0.3, 0.27], [0.5, 0.26], [0.7, 0.24], [0.86, 0.17], [0.97, 0.02]];
function horseBodyHi(Q, st) {
  const c = st.coat;
  const g = surf(30, 34, (u, v) => {
    const z = -0.97 + v * 1.94, a = (u - 0.5) * Math.PI * 2;
    const top = tab(H_TOP, z), bot = tab(H_BOT, z), cy = (top + bot) / 2, end = Math.min(1, tab(H_W, z) / 0.2);
    let ry = (top - bot) / 2 * Math.min(1, end * 1.3), rx = tab(H_W, z);
    const G = (z0, sz, a0, sa) => Math.exp(-((z - z0) ** 2) / (2 * sz * sz) - ((Math.abs(a) - a0) ** 2) / (2 * sa * sa));
    const bulge = 1 + 0.13 * G(-0.62, 0.16, 1.2, 0.5) + 0.09 * G(0.48, 0.12, 1.55, 0.4) + 0.05 * G(0.0, 0.3, 2.1, 0.4);
    const ca = Math.cos(a);
    return [Math.sin(a) * rx * bulge, cy + ca * ry * (ca > 0 ? 0.95 : 1), z];
  });
  Q.push(P(g, c, coatO(st)));
  // 鞍：座と、漆の前輪・後輪
  const seat = ball(0.2, 0.045, 0.27, 16, 8); Q.push(P(at(seat, 0, 1.585, 0.02), st.saddle, { mk: MK.lac, reg: 'lacq' }));
  const front = new THREE.TorusGeometry(0.17, 0.03, 6, 14, Math.PI); front.scale(1, 0.9, 1);
  Q.push(P(at(front, 0, 1.56, 0.25, -0.2), st.saddle, { mk: MK.lac, reg: 'lacq' }));
  const back = new THREE.TorusGeometry(0.19, 0.035, 6, 14, Math.PI); back.scale(1, 0.8, 1);
  Q.push(P(at(back, 0, 1.56, -0.22, 0.35), st.saddle, { mk: MK.lac, reg: 'lacq' }));
  // 障泥：胴に沿って曲がる革の垂れ（左右）
  for (const sd of [1, -1]) {
    const ao = surf(6, 4, (u, v) => [sd * (0.29 + Math.sin(v * Math.PI * 0.7) * 0.04 + v * Math.sin(u * Math.PI * 4) * 0.009), 1.5 - v * 0.4 + v * v * Math.cos(u * Math.PI * 2) * 0.012, (u - 0.5) * 0.52 + 0.02]);
    const back = ao.clone(), ix = back.index;
    Q.push(P(ao, st.aori, { reg: 'cloth', mk: MK.cloth }));
    for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
    back.computeVertexNormals(); Q.push(P(back, st.aori, { reg: 'cloth', mk: MK.cloth }));
    // 鐙（舌長の鐙）と力革
    Q.push(P(limb([sd * 0.22, 1.58, 0.1], [sd * 0.33, 1.02, 0.12], 0.012, 0.012, 4), 0x2a2420, { reg: 'cord' }));
    const ab = ball(0.05, 0.03, 0.12, 8, 5); Q.push(P(at(ab, sd * 0.34, 0.98, 0.16), 0x1a1512, { mk: MK.lac, reg: 'lacq' }));
  }
  // 胸繋・尻繋（太さのある紐）
  Q.push(P(at(new THREE.TorusGeometry(0.305, 0.018, 5, 22, Math.PI * 1.2), 0, 1.3, 0.62, 0, 0, Math.PI * 0.9), st.tack, { reg: 'cord' }));
  Q.push(P(at(new THREE.TorusGeometry(0.315, 0.02, 5, 22, Math.PI * 1.1), 0, 1.33, -0.66, 0, 0, Math.PI * 0.95), st.tack, { reg: 'cord' }));
  // 厚総：尻に下がる房
  if (st.tassels) for (let k = 0; k < 9; k++) {
    const a = -1.0 + k * 0.25;
    const tg = new THREE.CylinderGeometry(0.012, 0.04, 0.24, 7, 1, true);
    Q.push(P(at(tg, Math.sin(a) * 0.33, 1.13, -0.62 + Math.cos(a) * -0.08), st.tassels, { reg: 'cord', mk: MK.cloth }));
  }
  if (st.armor) {
    Q.push(P(at(new THREE.CylinderGeometry(0.315, 0.305, 1.0, 20, 1, true, Math.PI * 0.35, Math.PI * 1.3), 0, 1.22, 0, Math.PI / 2, 0, 0), st.armor, { mk: MK.lac, reg: 'kebiki', c2: 0xb8231a, mk2: MK.cloth }));
  }
}
// 首と頭（首の組の座標）
function horseNeckHi(Q, st) {
  const c = st.coat;
  const nk = bez([0, -0.12, -0.22], [0, 0.42, -0.08], [0, 0.7, 0.28]);
  Q.push(P(sweep(nk, (t) => [0.165 - 0.09 * t, 0.27 - 0.17 * t, 0.02 * t], 16, 16), c, coatO(st)));
  // 鬣：首の背に沿う六つの細長い束。筒状の隆起をやめ、首の横へ垂らす。
  for (let i = 0; i < 6; i++) {
    const t = i / 5, y = 0.03 + t * 0.66, z = -0.34 + t * 0.5;
    const g = surf(1, 3, (u, v) => [0.025 + v * 0.045, y - v * 0.17, z + (u - 0.5) * 0.13 * (1 - v * 0.65) - v * 0.02]);
    // 共有材質は片面なので、裏も同じ部品に入れる。
    const back = g.clone(), ix = back.index;
    Q.push(P(g, st.mane, { mk: MK.cloth, reg: 'plain' }));
    for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
    back.computeVertexNormals(); Q.push(P(back, st.mane, { mk: MK.cloth, reg: 'plain' }));
  }
  const fl = new THREE.ConeGeometry(0.035, 0.16, 5); fl.rotateX(Math.PI * 0.85);
  Q.push(P(at(fl, 0, 0.73, 0.36), st.mane, { mk: MK.cloth, reg: 'plain' }));
  // 頭：額は広く、頬（下顎）が張り、鼻面へ細る
  const hd = bez([0, 0.75, 0.25], [0, 0.66, 0.48], [0, 0.44, 0.8]);
  Q.push(P(sweep(hd, (t) => {
    const rx = tab([[0, 0.06], [0.08, 0.1], [0.3, 0.1], [0.6, 0.07], [0.88, 0.068], [0.97, 0.05], [1, 0.01]], t);
    const ry = tab([[0, 0.06], [0.1, 0.11], [0.3, 0.12], [0.55, 0.085], [0.88, 0.08], [0.97, 0.06], [1, 0.01]], t);
    const off = -tab([[0, 0], [0.2, 0.035], [0.4, 0.02], [0.6, 0], [1, 0]], t);
    return [rx, ry, off];
  }, 16, 18), c, coatO(st)));
  // 鼻面は暗く、鼻の穴と口
  Q.push(P(at(ball(0.07, 0.07, 0.07, 10, 8), 0, 0.46, 0.75), new THREE.Color(c).multiplyScalar(0.55).getHex(), coatO(st)));
  for (const sx of [0.038, -0.038]) Q.push(P(at(ball(0.016, 0.024, 0.012, 6, 5), sx, 0.47, 0.81, 0, 0, sx > 0 ? -0.3 : 0.3), 0x0c0908, { mk: MK.skin }));
  Q.push(P(at(new THREE.TorusGeometry(0.045, 0.006, 4, 10, Math.PI), 0, 0.41, 0.77, 0.5, 0, Math.PI), 0x0c0908, { mk: MK.skin }));
  // 目（濡れた黒）と眉の骨
  for (const sd of [1, -1]) {
    Q.push(P(at(ball(0.024, 0.02, 0.022, 8, 6), sd * 0.098, 0.665, 0.4), 0x0a0706, { mk: MK.eye }));
    Q.push(P(at(ball(0.03, 0.012, 0.03, 6, 4), sd * 0.094, 0.69, 0.395), c, coatO(st)));
  }
  // 面繋（頬革・鼻革・項革）と手綱
  Q.push(P(at(new THREE.TorusGeometry(0.085, 0.009, 4, 16), 0, 0.53, 0.63, 0.55), st.tack, { reg: 'cord' }));
  Q.push(P(at(new THREE.TorusGeometry(0.1, 0.009, 4, 16), 0, 0.71, 0.3, 0.9), st.tack, { reg: 'cord' }));
  for (const sd of [1, -1]) {
    Q.push(P(limb([sd * 0.095, 0.72, 0.3], [sd * 0.08, 0.52, 0.62], 0.008, 0.008, 4), st.tack, { reg: 'cord' }));
    Q.push(P(at(new THREE.TorusGeometry(0.022, 0.005, 4, 10), sd * 0.075, 0.47, 0.68, 0, Math.PI / 2), 0x3a3e42, { mk: MK.iron }));   // 轡
    const rein = new THREE.CatmullRomCurve3([[sd * 0.08, 0.47, 0.68], [sd * 0.13, 0.28, 0.35], [sd * 0.12, 0.16, -0.05], [sd * 0.1, 0.2, -0.38]].map((p) => new THREE.Vector3(...p)));
    Q.push(P(new THREE.TubeGeometry(rein, 16, 0.008, 4), st.tack, { reg: 'cord' }));
  }
  if (st.armor) Q.push(P(at(ball(0.1, 0.05, 0.22, 10, 6), 0, 0.74, 0.47, 0.55), st.armor, { mk: MK.gold, reg: 'lacq' }));
}
function horseEarHi(Q, c) {
  const eg = new THREE.LatheGeometry([[0, 0], [0.03, 0.02], [0.034, 0.07], [0.02, 0.12], [0.0, 0.15]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  eg.scale(1, 1, 0.55);
  Q.push(P(eg, c, { mk: MK.skin, reg: 'skin' }));
  const inner = ball(0.018, 0.05, 0.008, 6, 5); Q.push(P(at(inner, 0, 0.07, 0.016), 0x1a1210, { mk: MK.skin }));
}
// 上の脚：前脚は肩から前腕、後脚は腿から飛節。筋肉の張り
function horseUpperHi(Q, c, front) {
  const cv = front ? bez([0, 0.14, 0.02], [0, -0.15, 0.03], [0, -0.5, 0.0]) : bez([0, 0.2, -0.04], [0, -0.12, 0.02], [0, -0.5, -0.05]);
  const tr = front ? [[0, 0.1], [0.35, 0.078], [0.8, 0.05], [1, 0.045]] : [[0, 0.13], [0.3, 0.1], [0.7, 0.06], [1, 0.045]];
  const td = front ? [[0, 0.13], [0.35, 0.09], [0.8, 0.055], [1, 0.05]] : [[0, 0.2], [0.3, 0.14], [0.7, 0.075], [1, 0.06]];
  Q.push(P(sweep(cv, (t) => [tab(tr, t), tab(td, t)], 12, 12), c, { mk: MK.skin, reg: 'plain' }));
  if (!front) Q.push(P(at(ball(0.035, 0.04, 0.04, 8, 6), 0, -0.47, -0.1), c, { mk: MK.skin, reg: 'plain' }));   // 飛節の角
}
// 下の脚：膝・管（細く平たい）・球節・繋・蹄。鹿毛や栗毛は脚の先が黒い
function horseLowerHi(Q, st, front) {
  const c = st.coat, leg = lightCoat(c) ? c : new THREE.Color(c).lerp(new THREE.Color(st.mane), 0.7).getHex();
  Q.push(P(at(ball(0.05, 0.055, 0.052, 10, 8), 0, 0, 0.0), c, coatO(st)));
  const cv = bez([0, -0.02, 0], [0, -0.22, 0.0], [0, -0.43, 0.005]);
  Q.push(P(sweep(cv, (t) => [0.034 + 0.004 * t, 0.044 - 0.004 * t], 10, 8), leg, coatO(st)));
  Q.push(P(at(ball(0.046, 0.05, 0.052, 10, 8), 0, -0.455, 0.0), leg, coatO(st)));   // 球節
  Q.push(P(limb([0, -0.46, 0.005], [0, -0.515, 0.03], 0.034, 0.038, 10), leg, coatO(st)));   // 繋
  const hoof = new THREE.LatheGeometry([[0.0, 0.0], [0.064, 0.0], [0.06, 0.03], [0.047, 0.07], [0.04, 0.075], [0, 0.075]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  hoof.scale(1, 1, 1.12);
  Q.push(P(at(hoof, 0, -0.585, 0.04), 0x16110c, { mk: MK.lac, reg: 'wood', dirt: 1 }));
}
function horseTailHi(Q, st) {
  const dock = bez([0, 0.02, 0.06], [0, -0.03, -0.04], [0, -0.2, -0.1]);
  Q.push(P(sweep(dock, (t) => [0.05 - 0.015 * t, 0.055 - 0.02 * t], 10, 6), st.coat, { mk: MK.skin, reg: 'plain' }));
  const hair = bez([0, -0.02, -0.02], [0, -0.3, -0.18], [0, -0.55, -0.12], [0, -0.82, -0.1]);
  Q.push(P(sweep(hair, (t) => [(0.045 + 0.04 * Math.sin(t * Math.PI)) * (1 - t * 0.7), (0.05 + 0.03 * Math.sin(t * Math.PI)) * (1 - t * 0.7)], 8, 10), st.mane, { reg: 'plain' }));
}
export const ENEMY_HORSE = { coat: 0x4a3222, mane: 0x16120e, tack: 0x6a2a1c, saddle: 0x1a1512, aori: 0x3a2e22, tassels: 0x1f2a4a, armor: 0 };
// 日本の在来馬の毛色。points は脚先と鬣・尾が黒い（鹿毛・黒鹿毛）。w は出やすさ
// 在来馬（木曽馬・野間馬など）は鹿毛が多く、色は洋種より沈んで赤みが弱い。本物の馬（humans.js）は色から鰻線・淡い腹・葦毛の連銭を描き足す
export const COATS = [
  { kind: '栗毛', coat: 0x5a321c, mane: 0x4a2a16, points: 0, w: 3 },
  { kind: '鹿毛', coat: 0x4e2f1d, mane: 0x120e0b, points: 1, w: 5 },
  { kind: '黒鹿毛', coat: 0x2a1c14, mane: 0x0e0b09, points: 1, w: 3 },
  { kind: '青毛', coat: 0x131110, mane: 0x0b0a09, points: 0, w: 2 },
  { kind: '栃栗毛', coat: 0x42281a, mane: 0x6a5036, points: 0, w: 1 },
  { kind: '芦毛', coat: 0x8a8781, mane: 0x55524c, points: 0.4, w: 1 },
];
export function coatOf(kind) { return COATS.find((c) => c.kind === kind); }
// 兵の馬の拵え：毛色は一頭ずつばらつかせ、馬具（紐・房・鞍褥）の色は家（隊）でそろえる（赤備えは全部朱）
// rank 0 騎馬武者・1 侍大将・2 名のある武将（房を大きく、金の結び玉と縁で立派に）
const TACK_BY = {
  akazonae: { tack: 0x8e2218, tassels: 0xb8342a, cushion: 0x7a1a14 },
  takeda: { tack: 0x5a2018, tassels: 0x9a2e20, cushion: 0x5a1c16 },
  tokugawa: { tack: 0x2a2420, tassels: 0x2e3a52, cushion: 0x262c3a },
  oda: { tack: 0x2a2a30, tassels: 0x3c5a8a, cushion: 0x2b3140 },
};
export function horseStyleFor(seed, rank = 0, facKey = '') {
  const F = TACK_BY[facKey] || { tack: 0x3a2418, tassels: (FACTION[facKey] || {}).lace || 0x8a2418, cushion: 0x3a2a20 };
  const tot = COATS.reduce((a, c) => a + c.w, 0);
  let r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 * tot, C = COATS[0];
  for (const c of COATS) { if (r < c.w) { C = c; break; } r -= c.w; }
  return {
    coat: C.coat, mane: C.mane, points: C.points,
    tack: rank >= 2 && facKey !== 'tokugawa' ? 0xa8281c : F.tack,
    saddle: rank >= 2 ? 0x1a1210 : 0x151110,
    rim: rank >= 2 ? 0xc9a24a : 0,
    cushion: F.cushion,
    aori: rank >= 2 ? 0x241a12 : 0x3a2e22,
    tassels: rank >= 2 && facKey !== 'tokugawa' ? 0xc23a22 : F.tassels,
    big: rank >= 2 ? 1 : 0,
    armor: 0,
  };
}
// 今の形の馬を和種の大きさ（肩 1.3m ほど）へ縮める割合。鞍の上の高さが骨の入った馬と揃う
const HORSE_K = 0.86;
export function buildHorse(st = ENEMY_HORSE) {
  const key = [st.coat, st.mane, st.tack, st.saddle, st.aori, st.tassels, st.armor].join('|');
  // root（置き場所）→ pose（竿立ち・倒れる）→ shape（和種の大きさへ縮める）→ 胴・首・脚・尾。近くでは root に骨の入った馬（humans.js）が付く
  const root = new THREE.Group();
  const pose = new THREE.Group(), shape = new THREE.Group();
  shape.scale.setScalar(HORSE_K);
  pose.add(shape); root.add(pose);
  root.userData.style = st;
  const c = st.coat, dark = 0x14100c;
  // 胴・鞍・障泥・胸繋・尻繋・厚総・馬鎧
  const body = mergedMesh('hb' + key, (P) => {
    // 胴：胸は深く、腹は締まり、尻は丸い（回転体で作り、横に少しつぶす）
    const prof = [[0.02, -0.92], [0.2, -0.86], [0.3, -0.7], [0.33, -0.45], [0.3, -0.15], [0.28, 0.1], [0.3, 0.38], [0.32, 0.6], [0.26, 0.8], [0.1, 0.9], [0.02, 0.92]].map(([r, y]) => new THREE.Vector2(r, y));
    const barrel = new THREE.LatheGeometry(prof, 14);
    barrel.rotateX(Math.PI / 2); barrel.scale(0.86, 1, 1);
    P.push(paint(at(barrel, 0, 1.26, 0), c));
    // 胸前と尻の張り
    const chest = new THREE.SphereGeometry(0.26, 12, 8); chest.scale(0.95, 1.1, 0.8);
    P.push(paint(at(chest, 0, 1.2, 0.7), c));
    for (const sx of [0.14, -0.14]) { const hq = new THREE.SphereGeometry(0.2, 10, 8); hq.scale(0.9, 1.1, 1.1); P.push(paint(at(hq, sx, 1.33, -0.62), c)); }
    // 鞍（前輪と後輪が高い）
    P.push(paint(at(new THREE.BoxGeometry(0.42, 0.08, 0.5), 0, 1.55, 0.02), st.saddle));
    P.push(paint(at(new THREE.BoxGeometry(0.36, 0.16, 0.05), 0, 1.62, 0.25), st.saddle));
    P.push(paint(at(new THREE.BoxGeometry(0.36, 0.14, 0.05), 0, 1.61, -0.22), st.saddle));
    // 障泥（泥よけの垂れ）と鐙
    for (const sx of [0.29, -0.29]) {
      const cloth = surf(2, 2, (u, v) => [sx + Math.sign(sx) * Math.sin(v * Math.PI * 0.7) * 0.035, 1.49 - v * 0.42 + v * v * Math.cos(u * Math.PI * 2) * 0.012, (u - 0.5) * 0.5 + 0.02]);
      const back = cloth.clone(), ix = back.index;
      for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
      back.computeVertexNormals(); P.push(paint(cloth, st.aori), paint(back, st.aori));
      P.push(paint(at(new THREE.BoxGeometry(0.1, 0.03, 0.2), sx * 1.12, 0.98, 0.1), 0x2a2420));
      P.push(paint(at(new THREE.BoxGeometry(0.01, 0.34, 0.01), sx * 1.08, 1.16, 0.1), 0x2a2420));
    }
    // 胸繋・尻繋（手綱の色）
    P.push(paint(at(new THREE.TorusGeometry(0.3, 0.02, 4, 16, Math.PI * 1.2), 0, 1.3, 0.62, 0, 0, Math.PI * 0.9), st.tack));
    P.push(paint(at(new THREE.TorusGeometry(0.31, 0.022, 4, 16, Math.PI * 1.1), 0, 1.33, -0.66, 0, 0, Math.PI * 0.95), st.tack));
    // 厚総：尻に下がる房
    if (st.tassels) for (let k = 0; k < 7; k++) {
      const a = -0.9 + k * 0.3;
      P.push(paint(at(new THREE.CylinderGeometry(0.01, 0.035, 0.22, 6, 1, true), Math.sin(a) * 0.33, 1.14, -0.62 + Math.cos(a) * -0.08), st.tassels));
    }
    // 馬鎧：胴を覆う小札の布
    if (st.armor) {
      P.push(paint(at(new THREE.CylinderGeometry(0.31, 0.3, 1.0, 12, 1, true, Math.PI * 0.35, Math.PI * 1.3), 0, 1.22, 0, Math.PI / 2, 0, 0), st.armor, true));
      P.push(paint(at(new THREE.CylinderGeometry(0.315, 0.305, 0.04, 12, 1, true, Math.PI * 0.35, Math.PI * 1.3), 0, 1.22, 0.5, Math.PI / 2), 0xb8231a));
    }
  }, (Q) => horseBodyHi(Q, st));
  shape.add(body);
  // 首と頭
  const neck = new THREE.Group();
  neck.position.set(0, 1.42, 0.66);
  neck.add(mergedMesh('hn' + key, (P) => {
    // 首：付け根は太く、頭へ向かって細く。上に鬣
    const nk = new THREE.CylinderGeometry(0.1, 0.19, 0.78, 10); nk.scale(0.85, 1, 1.25);
    P.push(paint(at(nk, 0, 0.28, 0.14, 0.62), c));
    const mane = surf(1, 3, (u, v) => [0.025 + v * 0.035, 0.03 + u * 0.69 - v * 0.15, -0.34 + u * 0.51 - v * 0.02]);
    const back = mane.clone(), ix = back.index;
    for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
    back.computeVertexNormals(); P.push(paint(mane, st.mane), paint(back, st.mane));
    P.push(paint(at(new THREE.BoxGeometry(0.04, 0.12, 0.14), 0, 0.72, 0.28, 0.2), st.mane));   // 前髪
    // 頭：額は広く、鼻面へ細る。頬の張り
    const hd = new THREE.CylinderGeometry(0.075, 0.11, 0.52, 10); hd.scale(1, 1, 1.2);
    P.push(paint(at(hd, 0, 0.6, 0.5, 2.1), c));
    for (const sx of [0.065, -0.065]) P.push(paint(at(new THREE.SphereGeometry(0.075, 8, 6), sx, 0.66, 0.36), c));
    P.push(paint(at(new THREE.SphereGeometry(0.08, 10, 6), 0, 0.46, 0.72), 0x2a1e16));   // 鼻面
    for (const sx of [0.035, -0.035]) P.push(paint(at(new THREE.SphereGeometry(0.018, 6, 4), sx, 0.44, 0.79), 0x0c0908));   // 鼻の穴
    // 目
    P.push(paint(at(new THREE.BoxGeometry(0.21, 0.03, 0.04), 0, 0.66, 0.46), dark));
    // 面繋（頭の手綱）と手綱
    P.push(paint(at(new THREE.BoxGeometry(0.215, 0.03, 0.03), 0, 0.6, 0.62, 0.55), st.tack));
    P.push(paint(at(new THREE.BoxGeometry(0.215, 0.18, 0.025), 0, 0.64, 0.38, 0.1), st.tack));
    P.push(paint(at(new THREE.BoxGeometry(0.2, 0.02, 0.62), 0, 0.3, 0.05, -0.6), st.tack));
    // 馬面（馬鎧のとき）
    if (st.armor) P.push(paint(at(new THREE.BoxGeometry(0.215, 0.1, 0.4), 0, 0.72, 0.46, 0.55), st.armor));
  }, (Q) => horseNeckHi(Q, st)));
  shape.add(neck);
  // 耳（別の部品にして、止まっている時に向きを変える）
  const ears = [];
  for (const sx of [0.06, -0.06]) {
    const E = new THREE.Group(); E.position.set(sx, 0.74, 0.3);
    E.add(mergedMesh('he' + c, (P) => { const eg = new THREE.ConeGeometry(0.035, 0.12, 5); eg.scale(1, 1, 0.6); P.push(paint(at(eg, 0, 0.06, 0), c)); }, (Q) => horseEarHi(Q, c)));
    neck.add(E); ears.push(E);
  }
  // 脚（肩で振る）
  // 脚：肩（腰）で振り、膝（飛節）でも曲げる二節。上は太く筋肉質、下は細い管と蹄
  const legs = [], lowers = [];
  for (const [x, z, front] of [[0.15, 0.58, 1], [-0.15, 0.58, 1], [0.15, -0.58, 0], [-0.15, -0.58, 0]]) {
    const L = new THREE.Group();
    L.position.set(x, 1.12, z);
    L.add(mergedMesh('hu' + c + front, (P) => {
      const up = new THREE.CylinderGeometry(0.075, front ? 0.1 : 0.13, 0.52, 8); up.scale(1, 1, front ? 1.1 : 1.35);
      P.push(paint(at(up, 0, -0.24, front ? 0 : -0.03), c));
    }, (Q) => horseUpperHi(Q, c, front)));
    const K = new THREE.Group();
    K.position.set(0, -0.5, front ? 0.01 : -0.05);
    K.add(mergedMesh('hk' + c + st.mane + front, (P) => {
      P.push(paint(at(new THREE.SphereGeometry(0.06, 8, 6), 0, 0, 0), c));
      P.push(paint(at(new THREE.CylinderGeometry(0.038, 0.045, 0.44, 7), 0, -0.24, 0), c));
      P.push(paint(at(new THREE.SphereGeometry(0.048, 8, 6), 0, -0.46, 0.01), c));   // 球節
      P.push(paint(at(new THREE.CylinderGeometry(0.05, 0.065, 0.09, 8), 0, -0.53, 0.02), dark));   // 蹄
    }, (Q) => horseLowerHi(Q, st, front)));
    L.add(K);
    shape.add(L);
    legs.push(L); lowers.push(K);
  }
  // 尾
  const tail = new THREE.Group();
  tail.position.set(0, 1.42, -0.86);
  tail.add(mergedMesh('ht' + st.mane + '|' + c, (P) => { P.push(paint(at(new THREE.CylinderGeometry(0.045, 0.014, 0.72, 6, 2), 0, -0.34, -0.06, 0.25), st.mane)); }, (Q) => horseTailHi(Q, st)));
  tail.rotation.x = 0.35;
  shape.add(tail);
  root.userData.horse = { legs, lowers, neck, tail, body, ears, pose, shape, seat: new THREE.Matrix4(), real: null, dead: false, deadT: 0, phase: Math.random(), rear: 0, gait: 0, breath: 0, sit: 0, tailA: 0.35, tailV: 0, prev: 0, idle: Math.random() * 10, cock: -1, cockT: 3 + Math.random() * 4, snortT: 4 + Math.random() * 6, earT: 0, earA: [0, 0] };
  return root;
}
// 馬の足運び（一歩の中で、どの脚がいつ地面を蹴るか。値は一歩を 1 とした時のずれ）
// 脚の順：0 前 +x・1 前 -x・2 後 +x・3 後 -x
const GAITS = [
  { off: [0.25, 0.75, 0, 0.5], f0: 0.55, fk: 0.22, amp: 0.3, bob: 0.012, pitch: 0.0, nod: 0.07, nodK: 2 },     // 並足（四拍）
  { off: [0, 0.5, 0.5, 0], f0: 0.95, fk: 0.12, amp: 0.42, bob: 0.035, pitch: 0.01, nod: 0.01, nodK: 2 },       // 速足（斜めの二拍）
  { off: [0.66, 0.33, 0.33, 0], f0: 1.15, fk: 0.08, amp: 0.56, bob: 0.045, pitch: 0.06, nod: 0.12, nodK: 1 },   // 駆け足（三拍）
  { off: [0.52, 0.4, 0.12, 0], f0: 1.35, fk: 0.07, amp: 0.76, bob: 0.06, pitch: 0.05, nod: 0.15, nodK: 1 },     // 襲歩（四拍・宙に浮く）
];
// 脚・首・尾・耳・息を速さに合わせて動かす（speed は m/s）
export function animateHorse(h, dt, speed) {
  const H = h.userData.horse;
  if (!H) return;
  // 近くの馬は骨の入った本物の馬（humans.js）が動かし、鞍の動き（H.seat）も出す
  if (H.real && H.real.on && HORSE_HOOK.drive) { HORSE_HOOK.drive(h, dt, speed); return; }
  H.speed = speed;
  if (H.dead) { procDeath(H, dt); return; }
  // 足運びを速さで選ぶ（並足 < 2.2 < 速足 < 4.6 < 駆け足 < 7.4 < 襲歩）。切り替えはなめらかに
  const want = speed < 2.2 ? 0 : speed < 4.6 ? 1 : speed < 7.4 ? 2 : 3;
  H.gait += Math.max(-dt * 2, Math.min(dt * 2, want - H.gait));
  const gi = Math.min(2, Math.floor(H.gait)), gf = H.gait - gi;
  const A = GAITS[gi], B = GAITS[gi + 1];
  const mix = (k) => A[k] + (B[k] - A[k]) * gf;
  const moving = speed > 0.2 ? Math.min(1, speed / 0.8) : 0;
  const freq = moving ? mix('f0') + speed * mix('fk') : 0;
  H.phase = (H.phase + dt * freq) % 1;
  const amp = mix('amp') * moving;
  const T2 = Math.PI * 2;
  // 止まりかけは後ろ脚に重みを乗せる（尻を沈め、前を上げる）
  const decel = dt > 0 ? Math.max(0, (H.prev - speed) / dt) : 0;
  H.prev = speed;
  H.sit += ((decel > 2.5 ? Math.min(1, decel / 10) : 0) - H.sit) * Math.min(1, dt * (decel > 2.5 ? 8 : 2));
  // 止まっている時は、時々片方の後ろ脚を休める
  H.idle += dt;
  if (!moving) { H.cockT -= dt; if (H.cockT <= 0) { H.cock = H.cock >= 0 ? -1 : 2 + (Math.random() < 0.5 ? 0 : 1); H.cockT = 4 + Math.random() * 6; } } else H.cock = -1;
  H.legs.forEach((L, i) => {
    const off = A.off[i] + (B.off[i] - A.off[i]) * gf;
    const ph = (H.phase + off) * T2;
    let w = Math.sin(ph) * amp;
    // 脚を前へ運ぶ間は膝を折り、着く前に伸ばす（前脚は後ろへ、後脚は前へ折れる）
    let lift = Math.max(0, Math.cos(ph)) * amp * 1.5;
    if (i >= 2) w -= H.sit * 0.35;       // 後ろ脚を前へ踏み込む
    else w += H.sit * 0.12;              // 前脚は突っ張る
    if (i === H.cock) lift = 0.45;       // 休めた脚
    const kw = i < 2 ? -lift : lift * 0.8;
    const k = Math.min(1, dt * 18);
    L.rotation.x += (w - L.rotation.x) * k;
    if (H.lowers) H.lowers[i].rotation.x += (kw - H.lowers[i].rotation.x) * k;
  });
  // 背と尻の弾み：並足・速足は一歩に二度、駆け足・襲歩は一度（前後に揺れる）
  const nodK = gf > 0.5 ? B.nodK : A.nodK;
  const bob = -Math.abs(Math.sin(H.phase * T2 * (nodK === 2 ? 1 : 0.5) * 2)) * mix('bob') * moving + (nodK === 1 ? Math.sin(H.phase * T2) * mix('bob') * moving : 0);
  // 駆けた後は胸と腹が息で大きく動く
  H.breath = Math.max(0, Math.min(1, H.breath + dt * (speed > 6 ? 0.08 : speed > 3 ? 0.01 : -0.035)));
  const brRate = 1.1 + H.breath * 2.2;
  const br = Math.sin(H.idle * brRate * T2 * 0.5);
  H.body.position.y = bob - H.sit * 0.06;
  H.body.rotation.x = Math.sin(H.phase * T2 + 0.8) * mix('pitch') * moving - H.sit * 0.09;
  H.body.scale.set(1 + br * (0.006 + H.breath * 0.02), 1 + br * (0.004 + H.breath * 0.016), 1);
  // 竿立ち（手綱を強く引いたとき）
  H.rear = Math.max(0, H.rear - dt);
  const rear = H.rear > 0 ? Math.sin(Math.min(1, H.rear / 0.7) * Math.PI) * 0.5 : 0;
  H.pose.rotation.x = -rear;
  H.pose.position.y = rear * 0.3;
  // 首と頭：歩みに合わせて上下に振れる。速いほど前へ伸ばす。止まれば息に合わせ、時々鼻を鳴らして頭を振る
  H.snortT -= dt;
  let snort = 0;
  if (H.snortT < 0) { snort = Math.sin(Math.min(1, -H.snortT / 0.5) * Math.PI) * 0.18; if (H.snortT < -0.5) H.snortT = 5 + Math.random() * 8 - H.breath * 3; }
  const nod = Math.sin(H.phase * T2 * nodK + 0.6) * mix('nod') * moving;
  const neckWant = (moving ? -Math.min(0.3, speed * 0.03) + nod : 0.1 + br * (0.02 + H.breath * 0.05) - snort) - rear * 0.4 + H.sit * 0.15;
  H.neck.rotation.x += (neckWant - H.neck.rotation.x) * Math.min(1, dt * 12);
  // 尾：遅れて揺れる（ばね）。駆けると持ち上がる
  const tailWant = 0.35 + Math.min(0.3, speed * 0.03) + (moving ? Math.sin(H.phase * T2) * 0.08 : 0);
  H.tailV += ((tailWant - H.tailA) * 40 - H.tailV * 6) * dt;
  H.tailA += H.tailV * dt;
  H.tail.rotation.x = H.tailA;
  H.tail.rotation.z = Math.sin(H.idle * 1.7) * (moving ? 0.05 : 0.15) + (moving ? 0 : Math.max(0, Math.sin(H.idle * 0.37)) ** 8 * 0.5 * Math.sin(H.idle * 9));
  // 耳：止まっている時はあちこちへ向け、駆ける時は後ろへ寝かせる
  if (H.ears) {
    H.earT -= dt;
    if (H.earT <= 0) { H.earT = 1 + Math.random() * 3; H.earA = [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2]; }
    H.ears.forEach((E, i) => {
      const wy = moving && speed > 5 ? 0 : H.earA[i] * (moving ? 0.3 : 1);
      const wx = moving && speed > 5 ? -0.7 : 0;
      E.rotation.y += ((i ? -1 : 1) * wy - E.rotation.y) * Math.min(1, dt * 6);
      E.rotation.x += (wx - E.rotation.x) * Math.min(1, dt * 6);
    });
  }
  procSeat(H);
}
// 今の形の馬の鞍の動き（竿立ち・背の弾み・前後の傾き）を、乗り手を載せる行列にする
const _sq = new THREE.Quaternion(), _sv = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1), _sm = new THREE.Matrix4(), _se = new THREE.Euler();
function procSeat(H) {
  H.pose.updateMatrix();
  _sv.copy(H.body.position).multiplyScalar(HORSE_K);
  _sm.compose(_sv, _sq.setFromEuler(_se.set(H.body.rotation.x, 0, 0)), _s1);
  H.seat.multiplyMatrices(H.pose.matrix, _sm);
}
// 討たれた馬：前へ崩れてから右の脇腹を下に倒れる（骨の入った馬の倒れ方と同じ向き）
function procDeath(H, dt) {
  H.deadT += dt;
  const k = Math.min(1, Math.max(0, (H.deadT - 0.5) / 1.1)), e = k * k * (3 - 2 * k);
  const px = -0.35;   // 倒れる支点（地面の上、右の脚の外）
  const a = e * Math.PI / 2 * 0.96;
  H.pose.rotation.set(0, 0, a);
  H.pose.position.set(px - px * Math.cos(a), -px * Math.sin(a) - e * 0.05, 0);
  for (const L of H.legs) L.rotation.x += (0.15 - L.rotation.x) * Math.min(1, dt * 3);
  H.neck.rotation.x += (0.3 * e - H.neck.rotation.x) * Math.min(1, dt * 3);
  procSeat(H);
}

// ---------------- 僧兵（延暦寺・興福寺の衆徒） ----------------
// 墨染めの直綴（袖が広く、裾は脛まで）に、五条袈裟を左の肩から右の脇へ斜めに掛ける。脛巾に草鞋
// 頭は裹頭（袈裟の布で頭を包み、目のまわりだけを細く出す）。数人に一人は鉢巻か兜。裹頭の色は白・生成り・薄茶
const SOHEI_ROBE = [0x1e1c1a, 0x292623, 0x222120, 0x322e2a, 0x1b1a18, 0x2c2925];
const SOHEI_KATO = [0xe2dccf, 0xd3c8ad, 0xb8a687, 0xdcd4c2, 0xc7b692, 0xe7e2d6];
const SOHEI_KESA = [0x8a6a3a, 0x6b4c2c, 0x9e8150, 0x5c4b3a, 0x7a5a30, 0x8f7a58];
const SOHEI_HABAKI = [0xd2cab6, 0xbfb49a, 0xa89d86];
// 見た目の値を僧兵の装いにそろえる（何度通しても同じ）
export function soheiLook(look) {
  if (!look || !look.sohei || look.soheiV != null) return look;
  // 小袖姿：甲冑も袈裟も無い。白・生成りの小袖に帯（腰に刀）。頭は髷のまま（bozu は剃った頭）
  if (look.kosode) return {
    ...look, sohei: 1, soheiV: 9, monk: look.bozu ? 1 : 0, tier: 0, hat: 'none',
    cloth: look.kosodeCol || 0xe6e0d0, kesa: 0, kato: 0, armor: 0x1e1c1a, lace: 0x4a4038, kote: 0, sode: false, haori: 0, horo: 0, menpo: 0, tenugui: false, saya: false, trim: 0, left: null, haramaki: false,
  };
  const vi = (look.vi || 0) % 6, f = typeof look.face === 'number' ? look.face : 0;
  const lead = (look.tier ?? 0) >= 2;   // 大将（正覚院豪盛など）は裹頭に金茶の袈裟
  const sv = lead ? 2 : (f * 5 + vi * 3 + 2) % 10;   // 0 鉢巻・1 兜・ほかは裹頭（十人に二人ほどが鉢巻か兜）
  return {
    ...look, sohei: 1, soheiV: sv, monk: 1, tier: 0,
    hat: sv === 0 ? 'hachimaki' : sv === 1 ? 'kabuto' : 'kato',
    kato: lead ? 0xe7e2d6 : SOHEI_KATO[(vi + f) % 6], kesa: lead ? 0xa8893f : SOHEI_KESA[(vi * 2 + f) % 6], cloth: SOHEI_ROBE[vi],
    armor: 0x1e1c1a, lace: 0x4a4038, kote: 0, sode: false, haori: 0, horo: 0, menpo: 0, tenugui: false, saya: false, trim: 0, left: null,
    haramaki: sv === 1 || sv % 3 === 2,   // 衣の下に腹巻を着る者（襟元から少しのぞく）
  };
}
// 形の面を裏返す（布の裏を内から見せる）
function flipG(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); return g; }
// 細い帯：点の列 pts に沿い、表の向き ns（点ごと）で、幅 w・厚み t の板
function ribbon(pts, ns, w, t) {
  const pos = [], idx = [], n = pts.length;
  const tg = new THREE.Vector3(), nr = new THREE.Vector3(), sd = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    tg.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (tg.lengthSq() < 1e-12) tg.set(0, -1, 0);
    tg.normalize();
    nr.set(...ns[i]).normalize();
    sd.crossVectors(nr, tg);
    if (sd.lengthSq() < 1e-12) sd.set(1, 0, 0);
    sd.normalize();
    nr.crossVectors(tg, sd).normalize();
    for (const [u, v] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) pos.push(p[0] + (sd.x * u * w + nr.x * v * t) / 2, p[1] + (sd.y * u * w + nr.y * v * t) / 2, p[2] + (sd.z * u * w + nr.z * v * t) / 2);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 色に陰を掛ける（頂点ごと。布の重なりの影・目の窓の奥の影）
function shadeG(g, sh) {
  for (const k of ['color', 'col2']) { const a = g.attributes[k].array; for (let i = 0; i < sh.length; i++) { a[i * 3] *= sh[i]; a[i * 3 + 1] *= sh[i]; a[i * 3 + 2] *= sh[i]; } }
  return g;
}
const darker = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

// 頭の包みの下地：頭の点の群れを、頭の中心 C から見た向きごとの一番外の長さにし、なめらかにする
// （目のくぼみや鼻の脇に布が落ちず、鼻の上は布が橋になって覆う）。返すのは (θ, φ) → 長さ
export function headEnvelope(pts, C, NT = 48, NP = 28) {
  const g = new Float32Array(NT * NP);
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i] - C.x, dy = pts[i + 1] - C.y, dz = pts[i + 2] - C.z;
    const r = Math.hypot(dx, dy, dz);
    if (r < 1e-4) continue;
    const a = Math.min(NT - 1, Math.floor((Math.atan2(dx, dz) + Math.PI) / (Math.PI * 2) * NT));
    const b = Math.min(NP - 1, Math.max(0, Math.floor((Math.asin(dy / r) + Math.PI / 2) / Math.PI * NP)));
    if (r > g[b * NT + a]) g[b * NT + a] = r;
  }
  const cell = (G, a, b) => G[Math.min(NP - 1, Math.max(0, b)) * NT + ((a % NT) + NT) % NT];
  // 空の升は隣から埋める
  for (let it = 0; it < 40; it++) {
    let empty = 0; const h = g.slice();
    for (let b = 0; b < NP; b++) for (let a = 0; a < NT; a++) if (!g[b * NT + a]) { const m = Math.max(cell(g, a + 1, b), cell(g, a - 1, b), cell(g, a, b + 1), cell(g, a, b - 1)); h[b * NT + a] = m; if (!m) empty++; }
    g.set(h);
    if (!empty) break;
  }
  // 一番外を一升ずつ広げてから、ぼかす（元の面より内へは入れない）
  const h = g.slice();
  for (let b = 0; b < NP; b++) for (let a = 0; a < NT; a++) { let m = 0; for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) m = Math.max(m, cell(g, a + da, b + db)); h[b * NT + a] = m; }
  for (let k = 0; k < 2; k++) { const q = h.slice(); for (let b = 0; b < NP; b++) for (let a = 0; a < NT; a++) { let s = 0; for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) s += cell(q, a + da, b + db); h[b * NT + a] = Math.max(g[b * NT + a], s / 9); } }
  return (th, ph) => {
    const fa = (th + Math.PI) / (Math.PI * 2) * NT - 0.5, fb = Math.min(NP - 1, Math.max(0, (ph + Math.PI / 2) / Math.PI * NP - 0.5));
    const a0 = Math.floor(fa), b0 = Math.floor(fb), ta = fa - a0, tb = fb - b0;
    return (cell(h, a0, b0) * (1 - ta) + cell(h, a0 + 1, b0) * ta) * (1 - tb) + (cell(h, a0, b0 + 1) * (1 - ta) + cell(h, a0 + 1, b0 + 1) * ta) * tb;
  };
}

// 裹頭：R(θ, φ) は頭の中心 C から頭の面までの長さ。布は一回り外に沿い、額と頬・顎の下に巻きの重なり（段）としわ
// 目の窓（win：中心 x, y と半幅 hw・半高 hh）は細い横長で、布の縁が内へ折れ込み、奥は影。後ろで結び、端が背へ垂れる。首から肩・胸へ布が垂れる
// o：col 色・vi 作り分け・hi 細かさ・drop 垂れの長さ
export function katoGeometry(R, C, o) {
  const { col, vi = 0, hi = true, win, drop = 1 } = o;
  const off = 0.007;
  const parts = [];
  const NU = hi ? 64 : 20, NV = hi ? 26 : 10;
  const ths = []; for (let i = 0; i <= NU; i++) ths.push(faceTh(i / NU));
  let phs = []; for (let j = 0; j <= NV; j++) phs.push(-Math.PI / 2 + Math.PI * j / NV);
  // 目の窓の上下は細かく割る（縁がぎざぎざにならないよう）
  const rE = R(0, 0.05) + off;
  const pE0 = Math.asin((win.y - win.hh - C.y) / rE), pE1 = Math.asin((win.y + win.hh - C.y) / rE);
  if (hi) for (let k = -4; k <= 14; k++) phs.push(pE0 + (pE1 - pE0) * k / 10);
  phs = phs.filter((p) => p >= -Math.PI / 2 && p <= Math.PI / 2).sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1] > 0.004);
  const yTop = win.y + win.hh, yBot = win.y - win.hh;
  const saw = (q) => q - Math.floor(q);
  const pos = [], uv = [], sh = [], opening = [], idx = [];
  const NW = ths.length, NH = phs.length;
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const th = ths[i], ph = phs[j];
    const c = Math.cos(ph), dx = Math.sin(th) * c, dy = Math.sin(ph), dz = Math.cos(th) * c;
    const r = R(th, ph) + off;
    const x = C.x + dx * r, y = C.y + dy * r;
    // 目の窓：正面の細い横長（端は細く）
    const fr = sm(0.45, 0.7, dz);
    const ex = (x - win.x) / win.hw, ey = (y - win.y) / win.hh;
    // 窓は細い杏の形：真ん中が高く、目尻へ細くなり、端は丸い
    const ey2 = ey / Math.max(0.25, 1 - 0.5 * ex * ex) - 0.18 * (1 - ex * ex);
    const e = ex * ex + ey2 * ey2;
    const m = fr * (1 - sm(0.7, 1.15, e));
    opening.push(m);
    // 巻きの重なり：額の段は後ろの結びへ下がり、目の下・顎の段は後ろへ上がる。頭の上は張って滑らか
    const bk = (1 - Math.cos(th)) / 2;
    const qU = (y - yTop - 0.004 + 0.05 * bk) / 0.024, qL = (yBot - 0.003 + 0.055 * bk - y) / 0.022;
    const wU = sm(0, 0.5, qU) * (1 - sm(C.y + 0.07, C.y + 0.11, y));
    const wL = sm(0, 0.5, qL) * sm(C.y - 0.24, C.y - 0.17, y);
    let dr = 0.0058 * (wU * (1 - saw(qU)) + wL * (1 - saw(qL)));
    let s = 1 - 0.42 * (wU * sm(0.7, 1, saw(qU)) + wL * sm(0.7, 1, saw(qL)));
    if (hi) {
      // しわ：巻いた向きに細かく。谷は影
      const wr = Math.sin(th * 19 + y * 90 + vi) + 0.6 * Math.sin(th * 31 - y * 170 + vi * 2);
      dr += 0.0013 * wr * (0.35 + wU + wL);
      s *= 1 + 0.06 * wr * (0.4 + wU + wL);
      // 頭の上：布が後ろの結びへ引かれて寄るしわ（結びから放つ筋）
      const kx = Math.atan2(dx, -dz), crown = sm(C.y + 0.05, C.y + 0.12, y) + 0.5 * bk * (1 - wU - wL);
      const pl = Math.sin(kx * 9 + dy * 4 + vi);
      dr += 0.0016 * pl * crown; s *= 1 + 0.07 * pl * crown;
      // 布の汚れと色むら（手で織った麻・木綿の、揃わない地）
      const h = Math.sin(i * 12.9898 + j * 78.233 + vi) * 43758.5453;
      s *= 0.95 + 0.07 * (h - Math.floor(h)) - 0.06 * sm(C.y - 0.05, C.y - 0.2, y);
    }
    // 窓の縁は盛り上がって目の上下にかかり（上の縁は厚く）、内へ折れ込む。奥は影
    const lip = (y > win.y ? 0.0065 : 0.0045) * Math.sin(Math.PI * Math.min(1, m / 0.5)) * (m < 0.5 ? 1 : 0);
    dr += lip - 0.008 * sm(0.3, 1, m);
    s *= (1 - 0.72 * sm(0.12, 0.6, m)) * (1 - (y < win.y ? 0.18 : 0) * sm(0.05, 0.35, m) * (m < 0.5 ? 1 : 0));
    const rr = r + dr;
    pos.push(C.x + dx * rr, C.y + dy * rr, C.z + dz * rr);
    const tri = (q) => 1 - Math.abs((((q % 2) + 2) % 2) - 1);
    uv.push(tri((th + Math.PI) * 7), tri((y - C.y) * 60 + (hi ? 0.3 * Math.sin(th * 3) : 0)));
    sh.push(s);
  }
  // 黒いへこみで目を代用せず、布の面を抜いて中の顔を見せる。縁の折り返しは残す。
  for (let j = 0; j < NH - 1; j++) for (let i = 0; i < NW - 1; i++) {
    const a = j * NW + i, b = a + 1, cc = a + NW, d = cc + 1;
    if ((opening[a] + opening[b] + opening[cc]) / 3 < 0.55) idx.push(a, b, cc);
    if ((opening[b] + opening[d] + opening[cc]) / 3 < 0.55) idx.push(b, d, cc);
  }
  const hood = new THREE.BufferGeometry();
  hood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hood.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hood.setIndex(idx); hood.computeVertexNormals();
  parts.push(shadeG(P(hood, col, { reg: 'cloth', dirt: 0.3 }), sh));
  // 後ろの結び目と、背へ垂れる二つの端
  const kph = -0.1, kr = R(Math.PI, kph) + off + 0.006;
  const kp = [C.x, C.y + Math.sin(kph) * kr, C.z - Math.cos(kph) * kr];
  const knotC = darker(col, 0.93);
  parts.push(P(at(ball(0.026, 0.02, 0.016, hi ? 8 : 5, hi ? 6 : 4), kp[0], kp[1], kp[2] - 0.006), knotC, { reg: 'cloth' }));
  if (hi) for (const sd of [-1, 1]) { const lp = ball(0.022, 0.011, 0.009, 8, 5); lp.rotateZ(sd * 0.5); parts.push(P(at(lp, kp[0] + sd * 0.024, kp[1] + 0.006, kp[2] - 0.002), knotC, { reg: 'cloth' })); }
  for (const sd of [-1, 1]) {
    const L = (0.2 + 0.05 * ((vi + (sd > 0 ? 1 : 0)) % 3)) * drop, pts = [], ns = [];
    for (let k = 0; k <= (hi ? 7 : 2); k++) { const t = k / (hi ? 7 : 2); pts.push([kp[0] + sd * (0.01 + 0.035 * t), kp[1] - 0.015 - L * t, kp[2] - 0.012 - 0.07 * t - 0.02 * Math.sin(t * Math.PI)]); ns.push([sd * 0.2, 0.25, -1]); }
    parts.push(P(ribbon(pts, ns, 0.048 - 0.008 * sd, 0.004), darker(col, 0.95), { dirt: 0.4 }));
  }
  // 首から肩・胸・背へ垂れる布（前は胸まで、後ろは肩甲骨まで、横は肩に載る）
  {
    const yT = C.y - 0.1;
    const topR = (th) => { let ph = -0.9; for (let k = 0; k < 4; k++) { const r = R(th, ph) + off; ph = Math.asin(Math.max(-1, Math.min(1, (yT - C.y) / r))); } return Math.cos(ph) * (R(th, ph) + off) + 0.004; };
    const dp = (u, v, inner) => {
      const th = -Math.PI + u * Math.PI * 2, f = Math.max(0, Math.cos(th)), b = Math.max(0, -Math.cos(th)), sdd = Math.abs(Math.sin(th));
      const len = (0.05 + 0.055 * f + 0.085 * b + 0.02 * sdd) * (0.85 + 0.15 * drop) + (hi ? 0.008 * Math.sin(th * 3 + vi) : 0);
      const r1 = 0.12 + 0.045 * f + 0.075 * b + 0.05 * sdd;
      const w = 1 - v;   // v は裾（0）から上（1）
      const r0_ = topR(th);
      const fold = hi ? 1 + 0.05 * w * Math.sin(th * 8 + vi) + 0.02 * w * Math.sin(th * 15 - vi) : 1;
      const rr = (r0_ + (r1 - r0_) * Math.pow(Math.max(0, w), 0.75)) * fold - (inner ? 0.006 : 0);
      return [C.x + Math.sin(th) * rr, yT - len * w, C.z + Math.cos(th) * rr];
    };
    parts.push(P(surf(hi ? 40 : 14, hi ? 5 : 2, (u, v) => dp(u, v, false)), col, { reg: 'cloth', dirt: 0.4 }));
    if (hi) parts.push(P(flipG(surf(40, 5, (u, v) => dp(u, v, true))), darker(col, 0.55), { reg: 'cloth' }));
  }
  return merge(parts);
}
// 遠目の兵（units.js の頭）に合わせた裹頭：頭の面の点から包みを作る
const KATO_F = { w: 1.04, jaw: 1, chin: 1, cheek: 1, gaunt: 0.5, brow: 1, nose: 1, nw: 1, neck: 1 };
function katoUnit(o, hi) {
  const k = 'kato|' + (o.kato || 0) + '|' + ((o.vi || 0) % 6) + (hi ? '|H' : '|L');
  if (geoCache.has(k)) return geoCache.get(k);
  const pts = [];
  for (let j = 0; j <= 24; j++) for (let i = 0; i <= 36; i++) pts.push(...headPt(faceTh(i / 36), (j / 24 - 0.5) * Math.PI * 0.999, KATO_F));
  const tip = headPt(0, -0.075, KATO_F);
  for (const dx of [-0.01, 0, 0.01]) pts.push(tip[0] + dx, tip[1], tip[2] + 0.024);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; for (const y of [1.43, 1.48, 1.52]) pts.push(Math.sin(a) * 0.062, y, 0.006 + Math.cos(a) * 0.062); }
  const R = headEnvelope(pts, HC, 40, 24);
  const vi = (o.vi || 0) % 6;
  const g = katoGeometry(R, HC, { col: o.kato || 0xe2dccf, vi, hi, win: { x: 0, y: 1.622, hw: 0.076, hh: 0.038 + 0.002 * (vi % 3) }, drop: [1, 1.15, 0.9, 1.25, 1.05, 0.95][vi] });
  geoCache.set(k, g);
  return g;
}
// 衣の上身の形（胴の高さ y での半径）
const ROBE_PROF = [[0.2, 0.86], [0.212, 0.95], [0.222, 1.05], [0.24, 1.18], [0.255, 1.3], [0.25, 1.37], [0.216, 1.425], [0.13, 1.462], [0.075, 1.478]];
function profAt(pr, y) {
  if (y <= pr[0][1]) return pr[0][0];
  for (let i = 1; i < pr.length; i++) if (y <= pr[i][1]) { const [r0, y0] = pr[i - 1], [r1, y1] = pr[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  return pr[pr.length - 1][0];
}
// 僧兵の胴まわり：直綴の上身と裾、襟、五条袈裟、腰紐。腹巻の者は襟元に胴がのぞく。頭は裹頭（または鉢巻・兜）
function soheiBody(ck, o, hi, grp) {
  const PT = { base: [], torso: [], hips: [], sodeP: [], sodeN: [], head: [], haori: [], back: [], koshi: [] };
  const r0 = BUILD[0];
  DIRT = o.dirt ?? 0.55;
  const robe = o.cloth || 0x222120, kesa = o.kesa || 0x8a6a3a;
  const rY = (y) => profAt(ROBE_PROF, Math.min(1.478, y)) * r0;
  const fold = (th, y) => hi ? 0.011 * Math.sin(th * 7 + 1.3) * sm(1.22, 0.9, y) + 0.004 * Math.sin(th * 13 - y * 20) : 0;
  const robePt = (th, y, add = 0) => { const r = rY(y) + fold(th, y) + add; return [Math.sin(th) * r, y, Math.cos(th) * r * 0.82]; };
  const onRobe = (x, y, add) => { const r = rY(y) + add; return [x, y, Math.sqrt(Math.max(0, r * r - x * x)) * 0.82]; };
  const out = (p) => [p[0], 0.2, p[2] * 1.45];
  // 衣の下（腰と肩）
  PT.base.push(P(at(new THREE.CylinderGeometry(0.19 * r0, 0.2 * r0, 0.2, hi ? 14 : 8), 0, 0.82, 0), robe, { reg: 'cloth' }));
  PT.base.push(P(at(ball(0.25 * r0, 0.07, 0.15 * r0, hi ? 14 : 8, 5), 0, 1.43, -0.005), robe, { reg: 'cloth' }));
  // 上身：肩から腰へ、帯の上で少したるむ。肩は衣が丸く覆う（体の肩が衣から出ないよう）
  PT.torso.push(P(at(ball(0.265 * r0, 0.08, 0.165 * r0, hi ? 16 : 8, hi ? 6 : 4), 0, 1.435, -0.005), robe, { reg: 'cloth' }));
  PT.torso.push(P(surf(hi ? 32 : 12, hi ? 10 : 4, (u, v) => robePt(-Math.PI + u * Math.PI * 2, 0.86 + v * (1.478 - 0.86))), robe, { reg: 'cloth' }));
  // 襟：左の衿（上前）が右の腰へ、右の衿（下前）は胸で隠れる。内に白い襦袢の襟。襟の合わせの奥は襦袢（腹巻の者は胴）
  const xTop = (y) => -0.052 + 0.165 * (1.472 - y) / 0.5, xUnd = (y) => 0.052 - 0.075 * (1.472 - y) / 0.22;
  {
    const yX = 1.306;
    PT.torso.push(P(surf(hi ? 6 : 2, hi ? 6 : 2, (u, v) => { const y = yX + v * (1.472 - yX); return onRobe(xTop(y) + (xUnd(y) - xTop(y)) * u, y, 0.005); }), 0xd8d0bc, { reg: 'cloth', dirt: 0.4 }));
    if (o.haramaki) PT.torso.push(P(surf(hi ? 6 : 2, hi ? 4 : 1, (u, v) => { const y = yX - 0.01 + v * 0.1; return onRobe(xTop(y) + (xUnd(y) - xTop(y)) * u - 0.01 + 0.02 * u, y, 0.007); }), o.armor || 0x1e1c1a, { mk: MK.lac, reg: 'sugake', c2: o.lace || 0x4a4038, mk2: MK.cloth, rv: [0, 0.3] }));
    const line = (x0, y0, x1, y1, n, add) => { const pts = [], ns = []; for (let i = 0; i <= n; i++) { const t = i / n; const p = onRobe(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, add); pts.push(p); ns.push(out(p)); } return [pts, ns]; };
    const nn = hi ? 8 : 3;
    // 襦袢の襟（白く細く）と、衣の襟（黒く幅広く）
    PT.torso.push(P(ribbon(...line(0.052 - 0.016, 1.472, -0.035 - 0.016, 1.25, nn, 0.008), 0.014, 0.004), 0xd8d0bc, { reg: 'cloth', dirt: 0.5 }));
    PT.torso.push(P(ribbon(...line(0.052 + 0.004, 1.472, -0.035 + 0.004, 1.25, nn, 0.01), 0.034, 0.006), darker(robe, 0.8), { reg: 'cloth' }));
    PT.torso.push(P(ribbon(...line(-0.052 + 0.016, 1.472, 0.113 + 0.016, 0.97, nn, 0.011), 0.014, 0.004), 0xd8d0bc, { reg: 'cloth', dirt: 0.5 }));
    PT.torso.push(P(ribbon(...line(-0.052 - 0.004, 1.472, 0.113 - 0.004, 0.97, nn * 2, 0.014), 0.038, 0.006), darker(robe, 0.8), { reg: 'cloth' }));
    if (hi) {
      // 後ろの襟（首の後ろを回る）
      const pts = [], ns = [];
      for (let k = 0; k <= 10; k++) { const th = Math.PI * 0.35 + k / 10 * Math.PI * 1.3; const p = robePt(th, 1.462, 0.012); pts.push(p); ns.push([p[0], 0.6, p[2]]); }
      PT.torso.push(P(ribbon(pts, ns, 0.034, 0.006), darker(robe, 0.8), { reg: 'cloth' }));
    }
  }
  // 腰紐（細い組紐）
  {
    const pts = [], ns = [];
    for (let k = 0; k <= (hi ? 28 : 10); k++) { const th = -Math.PI + k / (hi ? 28 : 10) * Math.PI * 2; const p = robePt(th, 0.95, 0.01); pts.push(p); ns.push([p[0], 0, p[2]]); }
    PT.torso.push(P(ribbon(pts, ns, 0.016, 0.008), 0x6e6450, { reg: 'cord' }));
    if (hi) for (const sd of [-1, 1]) PT.torso.push(P(limb([-0.08, 0.95, 0.18], [-0.08 + sd * 0.02, 0.84, 0.19], 0.005, 0.004, 4), 0x6e6450, { reg: 'cord' }));
  }
  // 五条袈裟：左の肩から右の脇へ斜めに掛ける布の帯。厚み（表と裏）、縁取り、条の縫い目、しわ（小袖姿は袈裟の代わりに幅の広い帯）
  if (o.kosode) {
    const pts = [], ns = [];
    for (let k = 0; k <= (hi ? 28 : 10); k++) { const th = -Math.PI + k / (hi ? 28 : 10) * Math.PI * 2; const p = robePt(th, 0.98, 0.014); pts.push(p); ns.push([p[0], 0, p[2]]); }
    PT.torso.push(P(ribbon(pts, ns, 0.085, 0.012), o.obi || 0x3a2e26, { reg: 'cloth', dirt: 0.3 }));
  } else {
    const yK = (th) => { let y = 1.19; for (let k = 0; k < 5; k++) y = Math.min(1.375, 1.19 - 0.82 * Math.sin(th) * rY(y)); return y - 0.012 * Math.max(0, Math.cos(th)); };
    const hw = 0.078;
    const kp = (th, v, add) => { const y = Math.min(1.452, yK(th) + (v - 0.5) * 2 * hw); const w = hi ? 0.003 * Math.sin(th * 11 + v * 5) + 0.002 * Math.sin(th * 23) : 0; return robePt(th, y, 0.014 + add + w); };
    const nu = hi ? 48 : 16;
    PT.torso.push(P(surf(nu, hi ? 3 : 1, (u, v) => kp(-Math.PI + u * Math.PI * 2, v, 0)), kesa, { reg: 'cloth', dirt: 0.45 }));
    if (hi) PT.torso.push(P(flipG(surf(nu, 1, (u, v) => kp(-Math.PI + u * Math.PI * 2, v, -0.007))), darker(kesa, 0.6), { reg: 'cloth' }));
    const edge = darker(kesa, 0.55);
    for (const v of [0, 1]) {
      const pts = [], ns = [];
      for (let k = 0; k <= nu; k++) { const th = -Math.PI + k / nu * Math.PI * 2; const p = kp(th, v, -0.003); pts.push(p); ns.push([p[0], 0, p[2]]); }
      PT.torso.push(P(ribbon(pts, ns, 0.018, 0.012), edge, { reg: 'cloth', dirt: 0.5 }));
    }
    if (hi) for (let k = 0; k < 15; k++) {
      const th = -Math.PI + (k + 0.5) / 15 * Math.PI * 2, pts = [], ns = [];
      for (let i = 0; i <= 3; i++) { const p = kp(th, 0.06 + 0.88 * i / 3, 0.001); pts.push(p); ns.push([p[0], 0, p[2]]); }
      PT.torso.push(P(ribbon(pts, ns, 0.006, 0.003), darker(kesa, 0.75), { reg: 'cord' }));
    }
  }
  // 裾：腰から腿の中ほどまで、ひだを寄せて広がる（その下は脚の衣が脛まで続く）。右の前の合わせの線
  {
    const sk = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = 0.58 + v * (0.97 - 0.58), k = (0.97 - y) / 0.39; const r = (0.212 + 0.075 * k) * r0 * (1 + (hi ? 0.035 * Math.sin(th * 6 + 0.5) * k + 0.012 * Math.sin(th * 13) * k : 0)) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.9]; };
    PT.hips.push(P(surf(hi ? 32 : 10, hi ? 4 : 1, (u, v) => sk(u, v, false)), robe, { reg: 'cloth' }));
    if (hi) {
      PT.hips.push(P(flipG(surf(32, 2, (u, v) => sk(u, v, true))), darker(robe, 0.5), { reg: 'cloth' }));
      const pts = [], ns = [];
      for (let i = 0; i <= 4; i++) { const v = 1 - i / 4; const p = sk(0.5 + 0.07 + 0.015 * (1 - v), v, false); pts.push([p[0], p[1], p[2] + 0.004]); ns.push([p[0], 0, p[2]]); }
      PT.hips.push(P(ribbon(pts, ns, 0.012, 0.006), darker(robe, 0.75), { reg: 'cloth' }));
    }
  }
  // 頭：裹頭は頭の形に合わせて作る。鉢巻・兜は兵と同じ形
  if (o.hat === 'kato') PT.head.push(katoUnit(o, hi).clone());
  else hatParts(o, PT.head, hi);
  const list = grp === 'nohead' ? [...PT.base, ...PT.torso, ...PT.hips] : grp ? PT[grp] : [...PT.base, ...PT.torso, ...PT.hips, ...PT.head];
  const g = list.length ? merge(list) : null;
  geoCache.set(ck, g);
  return g;
}
// 脚の衣：腿から膝の下まで、広く垂れる（裾の続き）
function soheiThigh(o, hi) {
  const k = 'sthigh' + (o.cloth || 0) + '|' + (hi ? 1 : 0);
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.6;
  const robe = o.cloth || 0x222120;
  const tb = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = -0.44 + v * 0.56, t = (0.12 - y) / 0.56; const r = (0.128 + 0.04 * t) * (1 + (hi ? 0.045 * Math.sin(th * 5 + 1) * t : 0)) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.95 + 0.01]; };
  const P_ = [P(surf(hi ? 16 : 7, hi ? 4 : 1, (u, v) => tb(u, v, false)), robe, { reg: 'cloth' })];
  if (hi) P_.push(P(flipG(surf(16, 2, (u, v) => tb(u, v, true))), darker(robe, 0.5), { reg: 'cloth' }));
  const g = merge(P_);
  geoCache.set(k, g);
  return g;
}
// 脛：衣の裾が脛の上までかかり、その下は脛巾（白っぽい布を巻き、上下を紐で結ぶ）
function soheiShin(o, hi, part) {
  const vi = (o.vi || 0) % 3;
  const k = 'sshin' + (o.cloth || 0) + '|' + vi + '|' + (hi ? 1 : 0) + (part || '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.85;
  const robe = o.cloth || 0x222120, hb = SOHEI_HABAKI[vi];
  const P_ = [];
  if (!part) P_.push(P(limb([0, 0, 0], [0, -0.3, -0.01], 0.066, 0.05, hi ? 10 : 6), robe, { reg: 'cloth', flipV: true }));
  const hm = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = -0.15 + v * 0.19; const r = 0.162 + 0.006 * (1 - v) + (hi ? 0.007 * Math.sin(th * 5 + 1) : 0) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.95 + 0.012]; };
  P_.push(P(surf(hi ? 16 : 7, 1, (u, v) => hm(u, v, false)), robe, { reg: 'cloth' }));
  if (hi) P_.push(P(flipG(surf(16, 1, (u, v) => hm(u, v, true))), darker(robe, 0.5), { reg: 'cloth' }));
  P_.push(P(limb([0, -0.1, 0.0], [0, -0.285, -0.008], 0.07, 0.057, hi ? 10 : 6), hb, { reg: 'cloth', flipV: true }));
  if (hi) for (const y of [-0.12, -0.27]) P_.push(P(at(new THREE.TorusGeometry(y > -0.2 ? 0.069 : 0.058, 0.004, 4, 12), 0, y, -0.004, Math.PI / 2), 0x4a4034, { reg: 'cord' }));
  if (!part) { const f = shinGeometry({ ...o, sohei: 0 }, hi, 'foot'); if (f) P_.push(f.clone()); }
  const g = merge(P_);
  geoCache.set(k, g);
  return g;
}
// 腕：直綴の広い袖。二の腕はゆるい筒、肘から先は大きく、下（腕の後ろ）へ袂が垂れる。手は袖口から
function soheiArm(o, sd, hi, part) {
  const k = 'sarm' + (o.cloth || 0) + '|' + (o.skin || 0) + '|' + sd + '|' + (hi ? 1 : 0) + (part || '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.6;
  const robe = o.cloth || 0x222120, skin = o.skin || 0xb58c68;
  const P_ = [];
  if (!part || part === 'upper') P_.push(P(at(ball(0.07, 0.075, 0.07, hi ? 10 : 6, 6), 0, -0.02, 0), robe, { reg: 'cloth' }));
  if (!part || part === 'upper') {
    const up = (u, v, inner) => { const a = -Math.PI + u * Math.PI * 2, y = -0.29 + v * 0.3, t = (0.01 - y) / 0.3; const r = 0.078 + 0.016 * t - (inner ? 0.005 : 0); return [Math.sin(a) * r, y, Math.cos(a) * r - 0.012 * t * Math.max(0, -Math.cos(a))]; };
    P_.push(P(surf(hi ? 14 : 6, hi ? 3 : 1, (u, v) => up(u, v, false)), robe, { reg: 'cloth' }));
  }
  if (!part || part === 'fore') {
    const fo = (u, v, inner) => {
      const a = -Math.PI + u * Math.PI * 2, y = -0.5 + v * 0.27, t = Math.max(0, Math.min(1, (-0.23 - y) / 0.27));   // 丸めの誤差で負にならないよう（負の累乗は NaN）
      const r = 0.092 + 0.03 * t + (hi ? 0.006 * Math.sin(a * 5 + t * 3) : 0) - (inner ? 0.006 : 0);
      const bag = (0.025 + 0.13 * Math.pow(t, 0.8)) * Math.pow(Math.max(0, -Math.cos(a)), 1.4);
      return [Math.sin(a) * r * (1 - 0.25 * Math.max(0, -Math.cos(a)) * t), y - 0.02 * bag / 0.15, Math.cos(a) * r - bag];
    };
    P_.push(P(surf(hi ? 18 : 7, hi ? 4 : 1, (u, v) => fo(u, v, false)), robe, { reg: 'cloth' }));
    if (hi) P_.push(P(flipG(surf(18, 2, (u, v) => fo(u, v, true))), darker(robe, 0.45), { reg: 'cloth' }));
  }
  if (!part) {
    // 袖口から出る手首と拳
    P_.push(P(limb([0, -0.44, 0], [0, -0.52, 0], 0.036, 0.034, hi ? 8 : 5), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(ball(0.035, 0.044, 0.03, hi ? 8 : 6, hi ? 6 : 4), 0, -0.55, 0.004), skin, { mk: MK.skin, reg: 'skin' }));
  }
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}

export { flagMatCache, geoCache, paint, at, merge, PLAYER_FACE, FACES, HAIR, headGeometry, bodyGeometry, thighGeometry, shinGeometry, armGeometry, MAT, flagGeo, P, flexSpear, EMBER_GEO, EMBER_MAT, arrowStub, sm, GUN_MUZ, GUN_BORE, GUN_RAM, aimArm, rng };
