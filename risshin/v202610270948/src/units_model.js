// 兵の形の部品：模様の絵・素材・頭・兜・面頬・胴・手足・武器・馬・僧兵の形
// 形を作る関数どうしが「汚れの具合（DIRT）」を分け合って書き換えるので、ここは一つのファイルのまま
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { drawMon } from './textures.js';
import { nanbanGeometry } from './nanban.js';
import * as THREE from 'three';
import { S } from './settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodSwap } from './units_flags.js';
import { FACTION } from './units_data.js';
import { saddleBow, stirrupParts, harnessParts } from './horse_tack.js';
let WEAPONS = null, weaponsLoading = null;
export function loadWeapons() {
  if (!weaponsLoading) weaponsLoading = import('./asset_reader.js').then(({ readAsset }) => readAsset('weapons', 'weapons')).then((m) => { WEAPONS = m.default; return true; }).catch(() => { weaponsLoading = null; return false; });
  return weaponsLoading;
}
import { YUMI, loadYumi } from './yumi.js';
// 母衣の仕立てと、骨で曲げる範囲をそろえる（肩から後ろへ尾を引く籠）。
export const HORO_HEIGHT = 1.08, HORO_TOP = 1.62, HORO_BACK = -0.28;
// 胴丸は八間を基本とする復元。形の分割と、歩行時に揺らす板の数をそろえる。
// https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
export const kusazuriCount = (look) => look.kusazuriCount === 12 ? 12 : look.domaru ? 8 : (look.tier || 0) === 0 ? 5 : 7;

// ---------------- モデル ----------------
// 模様の絵は 2048×1024 の一枚にまとめる（兵も馬も同じ材質で描き、描く回数を増やさない）。
// 赤＝二つめの色の混ぜ具合（威糸・鎖・髭・家紋）、緑＝明るさ（凹凸の陰・擦れ）、青＝汚れ（泥・汗）
const AW = 2048, AH = 1024, LUM0 = 200;
const REG = {
  sugake: [0, 0, 512, 512], kebiki: [512, 0, 512, 512],
  okegawa: [0, 512, 256, 256], kote: [256, 512, 256, 256], haidate: [512, 512, 256, 256], shino: [768, 512, 256, 256],
  cloth: [1024, 512, 256, 256], lacq: [1280, 512, 256, 256], hair: [1536, 512, 256, 256], skin: [1792, 512, 256, 256],
  straw: [0, 896, 256, 128], wood: [256, 896, 256, 128], iron: [512, 896, 256, 128], suji: [768, 896, 256, 128],
  // 無地欄の左三枠を家紋へ譲る。無地の色・絵の大きさ・材質は変えない。
  plain: [1216, 768, 64, 256], fur: [1280, 768, 256, 256], horo: [1536, 768, 256, 256], cord: [1792, 768, 256, 256],
  // 下段は桶側の四枚の板・色々威・四将の家紋・陣笠へ分ける。
  okeV: [0, 832, 448, 64], kasa: [768, 832, 256, 64],
  sugakeIro: [448, 832, 32, 64], kebikiIro: [480, 832, 32, 64],
};
// 色々威は紺・朱・白・萌黄の順。絵の透過成分を段の色番号として読む。
// 本の色々威（酒井忠次・加藤清正の具足）は、褪せた色が二段ずつの帯で替わる。一段ごとに替えると旗の縞に見えるので二段で一色、色も沈める（10/27）
const IRO_LACE = [0x9a432f, 0xcdc4ab, 0x6b4a2e, 0x263852];   // 朱・白・茶・紺（本の色々威は暖かい朱と白が主。萌黄を朱と並べると旗の三色に見えるので外す）
export const iroLaceColor = (row) => IRO_LACE[((Math.floor(row / 2) % 4) + 4) % 4];
const iroLaceShader = `
      vec3 laceC = vCol2;
      if (txA.a < 0.95) {
        float band = floor(txA.a * 4.0);
        laceC = ${IRO_LACE.map((hex, i) => {
          const c = new THREE.Color(hex);
          return (i < 3 ? `band < ${i + 0.5} ? ` : '') + `vec3(${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)})`;
        }).join(' : ')};
      }
`;
// 顔の模様は八枚（年と髭）：0 若い・剃った 1 若い・無精髭 2 中年・無精髭 3 中年・口髭 4 中年・口髭と顎髭 5 中年・髭面 6 年寄り・口髭と顎髭 7 年寄り・髭面
const faceReg = (t) => [1024 + (t % 4) * 256, Math.floor(t / 4) * 256, 256, 256];
// 胴や陣笠・陣羽織に描く家紋
// 上段に堀・佐久間を残し、無地欄の端に金森・九鬼・滝川を置く。
// 下段は柴田・丹羽・佐々・池田と、一益の陣羽織の紋。桶側・色々威・陣笠と重ねず、絵や描画回数は増やさない。
// 具足表と旗で使う所属の紋を補う。当日の着用を断定しない。
const MONS = ['tokugawa', 'takeda', 'oda', 'imagawa', 'saito', 'okudaira', 'katabami', 'okubo', 'akechi', 'honda', 'mizuno', 'ii', 'sanada', 'maeda', 'hori', 'sakuma', 'kanamori', 'kuki', 'takigawa', 'kari', 'sujikai', 'shuro', 'ageha', 'takigawa_haori'];
// 陣笠の家紋を朱で描く家（ほかは金）
const KASA_SHU = new Set(['imagawa', 'saito', 'okudaira', 'katabami', 'akechi', 'mizuno', 'maeda']);
export const monReg = (k) => { const i = MONS.indexOf(k === 'akazonae' ? 'takeda' : k); return i < 0 ? null : i < 19 ? [i * 64, 768, 64, 64] : [512 + (i - 19) * 64, 832, 64, 64]; };
const PLAIN_UV = [(REG.plain[0] + REG.plain[2] / 2) / AW, 1 - (REG.plain[1] + REG.plain[3] / 2) / AH];

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
          // 糸の下へ落ちる影と、擦れて丸くなった山を同じ絵へ焼く。
          G.fillStyle = gray(62, 0.65); G.fillRect(x + dx - 1, y + 2, 7, rh - 2);
          R.fillStyle = gray(255); R.fillRect(x + dx, y - 2, 4, rh + 2);
          for (let yy = y; yy < y + rh; yy += 3) { G.fillStyle = gray(yy % 6 < 3 ? 235 : 170); G.fillRect(x + dx, yy, 4, 2); }
          G.fillStyle = gray(245, 0.4); G.fillRect(x + dx, y + 2, 1, rh - 5);
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
  // 篠臑当：紺の家地に縦の細板を五本。籠手の遠い形にも使う
  clip(ALL, REG.shino, () => {
    const [x0, y0, w, h] = REG.shino;
    const step = w / 5, plate = step * 0.42;
    for (let i = 0; i < 5; i++) {
      const x = x0 + (i + 0.5) * step - plate / 2;
      R.fillStyle = gray(255); R.fillRect(x, y0 + 5, plate, h - 10);
      const gr = G.createLinearGradient(x, 0, x + plate, 0); gr.addColorStop(0, gray(150)); gr.addColorStop(0.35, gray(245)); gr.addColorStop(1, gray(150));
      G.fillStyle = gr; G.fillRect(x, y0 + 5, plate, h - 10);
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
    // 簡易顔が残る段も、墨の目鼻や輪郭を描かず、柔らかな濃淡だけにする。
    const line = (ctx, pts, col, a, wd) => {
      for (const [th, ph] of pts) blob(ctx, th, ph, 0.095, wd / 256 * Math.PI * 1.8, col, a * 0.24);
    };
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
        // 頬当・顎紐の脇と、鼻筋の横の陰。共有の貼り物に描き、部品を増やさない。
        blob(G, sd * 0.9, -0.12, 0.22, 0.5, '30,20,14', 0.26);
        blob(G, sd * 0.13, 0.01, 0.08, 0.22, '30,20,14', 0.32);
        blob(G, sd * 0.6, -0.34, 0.2, 0.16, '0,0,0', 0.1 + age * 0.06);  // 頬の下のこけ
        // 目（遠くの兵のため。近くでは目玉がのる）
        line(G, [[sd * 0.2, 0.175], [sd * 0.33, 0.19], [sd * 0.46, 0.18]], '20,14,10', 0.7, 1.9);
        // 眉
        line(G, [[sd * 0.16, 0.3], [sd * 0.32, 0.34], [sd * 0.5, 0.31]], '20,14,10', 0.5, 2.1);
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
  // 八段の糸と札の陰を同じ絵へ焼く。追加の形・材質・絵は作らない。
  for (const [name, dense] of [['sugakeIro', false], ['kebikiIro', true]]) {
    const [x0, y0, w, h] = REG[name];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 8), yy = y % 8, xx = x % 8;
      const thread = dense ? yy >= 2 && x % 3 !== 2 : xx === 2 || xx === 4;
      const o = ((y0 + y) * AW + x0 + x) * 4;
      const lum = thread ? (y % 2 ? 190 : 235) : yy === 7 ? 80 : 220 - yy * 7;
      out.data[o] = thread ? 255 : 0;
      out.data[o + 1] = d[1][o] = lum;
      out.data[o + 2] = 24 + yy * 2;
      out.data[o + 3] = ((row >> 1) % 4) * 64 + 32;
    }
  }
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  c.getContext('2d').putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.userData.astcAlpha = true;   // 色番号を保って同じ容量の圧縮を使う
  // 凹凸の絵（明るさ＝高さとして傾きを求める）：小札の段・札の境・鋲・鎖の網目・篠・筋兜の筋
  const G0 = d[1], nd = cv[0].createImageData(AW, AH);
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const i = y * AW + x;
    // 顔と無地は弱く、布は少し、甲冑の模様は強く
    const k = (y < 512 && x >= 1024) ? 0.8 : (y >= 768 && x >= 1024 && x < 1280) ? 0 : (y >= 512 && y < 768 && x >= 1024 && x < 1280) ? 1.5 : (y < 512 && x < 1024) ? 4.0 : 3.2;
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
const MAT = S.simpleMaterials
  ? new THREE.MeshPhongMaterial({ vertexColors: true, map: makeAtlas(), shininess: 18, specular: 0x333333 })
  : new THREE.MeshStandardMaterial({ vertexColors: true, map: makeAtlas(), normalMap: ATLAS_N, normalScale: new THREE.Vector2(1, 1), roughness: 0.9, metalness: 0 });
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
// 近い兵に面の補光を回す。夜は強め、通常・束・低画質の材質で共有する。
export const UNIT_NIGHT = { value: 0 };
export const UNIT_NIGHT_FOCUS = { value: new THREE.Vector3() };
// 夜の鉄の照り。共通材質の値だけを変え、光に向いた面の反射は通常の照明へ任せる。
export const UNIT_FIRE_METAL = { value: 0 };
function unitFireMetal(sh) {
  sh.uniforms.uFireMetal = UNIT_FIRE_METAL;
  sh.fragmentShader = 'uniform float uFireMetal;\n' + sh.fragmentShader.replace('#include <lights_physical_fragment>', `
    float fireIron = step(0.12, metalnessFactor) * (1.0 - step(0.9, metalnessFactor));
    metalnessFactor = min(1.0, metalnessFactor + uFireMetal * fireIron);
    roughnessFactor *= 1.0 - uFireMetal * fireIron * 0.45;
    #include <lights_physical_fragment>`);
}
// 顔・衣・甲冑と遠い軽い兵で補光を共用する。縁に柔らかな照り返しを残し、
// 上方からの光を面の向きと素材色に掛け、漆の黒と布の染めを残す。
// 間接光へ入れてから溝の遮光を掛ける。金具の反射には拡散色を足さない。
function unitFill(strength, focus) {
  return `
    {
      float fillNear = clamp(${strength}, 0.0, 1.0) * (1.0 - smoothstep(30.0, 38.0, length(vViewPosition - ${focus})));
      vec3 fillDir = (viewMatrix * vec4(-0.447214, 0.8, 0.4, 0.0)).xyz;
      float fillFace = max(0.0, dot(normal, fillDir));
      float fillEdge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      // 布の鈍い面光と、光側に限った漆・鉄の弱い照りを、間接光の遮光へ渡す。
      float fillRim = fillEdge * fillEdge * (${S.simpleMaterials ? '0.25' : '1.0 - roughnessFactor'}) * fillFace;
      // 暗い床や柱の前でも、黒い具足の手足を読める散乱光を残す。
      reflectedLight.indirectDiffuse += max(material.diffuseColor, vec3(0.065)) * vec3(0.7, 0.76, 0.85) * (0.38 + 0.65 * fillFace + 0.12 * fillRim) * fillNear;
      // 逆光の袖や脚も暗い柱から離して読む。面の色を残し、線の形は増やさない。
      // 縁の照りは夜と暗い空の時だけ。昼（既定の 0.35）は付けない：輪郭に青白い縁がちらつき、本の写真の黒漆に見えない（10/27）
      float rimK = smoothstep(0.4, 0.85, clamp(${strength}, 0.0, 1.0));
      reflectedLight.indirectDiffuse += max(material.diffuseColor, vec3(0.22)) * vec3(0.78, 0.84, 0.95) * smoothstep(0.35, 0.9, fillEdge) * 1.05 * fillNear * rimK;
      // 森の陰でも袖・兜・脚の縁に空の照り返しを残す。追加の形や光源は作らない。
      // 面の色と霧・遮蔽は保ち、近い兵だけに同じ補光を使う。
      totalEmissiveRadiance += vec3(0.12, 0.14, 0.17) * smoothstep(0.45, 0.9, fillEdge) * fillNear * rimK;
    }
    #include <aomap_fragment>`;
}
// 骨のある人の肌・衣・兜にも、同じ近距離の補光を使う。
export function unitContour(sh) {
  unitFireMetal(sh);
  sh.uniforms.uNearContour = UNIT_NIGHT;
  sh.uniforms.uContourFocus = UNIT_NIGHT_FOCUS;
  sh.fragmentShader = 'uniform float uNearContour;\nuniform vec3 uContourFocus;\n' + sh.fragmentShader;
  sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', unitFill('uNearContour', 'uContourFocus'));
}
// 戦の経過による汚れ。近くの人と軽い兵で同じ値を使い、材質は増やさない。
export const UNIT_GRIME = { value: 0 };
MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uWet = UNIT_WET;
  sh.uniforms.uNightContour = UNIT_NIGHT;
  sh.uniforms.uNightFocus = UNIT_NIGHT_FOCUS;
  sh.uniforms.uBattleGrime = UNIT_GRIME;
  if (S.simpleMaterials) {
    sh.vertexShader = 'attribute float mtl;\nattribute vec3 col2;\nvarying float vMtl;\nvarying vec3 vCol2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMtl = mtl; vCol2 = col2;');
    sh.fragmentShader = 'uniform float uWet, uBattleGrime, uNightContour;\nuniform vec3 uNightFocus;\nvarying float vMtl;\nvarying vec3 vCol2;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 txA = texture2D(map, vMapUv);
        float dirtA = clamp(fract(vMtl + 0.001) / 0.9, 0.0, 1.0);
        float dd = clamp(txA.b * dirtA * 1.3, 0.0, 1.0);`)
      .replace('#include <color_fragment>', `
        ${iroLaceShader}
      vec3 baseC = mix(vColor.rgb, laceC, txA.r) * (txA.g * ${(255 / LUM0).toFixed(4)});
        baseC = mix(baseC, vec3(0.075, 0.058, 0.04) * (0.7 + 0.5 * txA.g), dd * 0.85);
        diffuseColor.rgb *= baseC * (1.0 - uWet * 0.12);`)
      .replace('#include <aomap_fragment>', unitFill('uNightContour', 'uNightFocus'));
    return;
  }
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
float mkRough(int k) {
#ifdef NEAR_85
 if (k == 0) return 1.0; if (k == 1) return 0.34; if (k == 3) return 0.42;
#endif
 return k == 1 ? 0.3 : k == 2 ? 0.58 : k == 3 ? 0.4 : k == 4 ? 0.28 : k == 5 ? 0.8 : k == 6 ? 0.97 : k == 7 ? 0.18 : 0.93; }
float mkMetal(int k) {
#ifdef NEAR_85
 if (k == 3) return 0.88; if (k == 1) return 0.0;
#endif
 return k == 3 ? 0.62 : k == 4 ? 0.92 : k == 1 ? 0.06 : 0.0; }
` + sh.fragmentShader
    .replace('#include <map_fragment>', `
      vec4 txA = texture2D(map, vMapUv);
      float mA = floor(vMtl + 0.001);
      int nA = int(mA);
      int mkA = nA - (nA / 8) * 8;
      int mkB = nA / 8;
      float dirtA = clamp((vMtl - mA) / 0.9, 0.0, 1.0);`)
    .replace('#include <color_fragment>', `
      ${iroLaceShader}
      vec3 baseC = mix(vColor.rgb, laceC, txA.r) * (txA.g * ${(255 / LUM0).toFixed(4)});
      float dd = clamp(txA.b * dirtA * 1.3, 0.0, 1.0);
      baseC = mix(baseC, vec3(0.075, 0.058, 0.04) * (0.7 + 0.5 * txA.g), dd * 0.85);
      baseC *= 1.0 - uWet * (mkA == 0 ? 0.22 : 0.06);
      // 漆の顔料は深い色に。威糸と布を巻き込まず、札の面だけ沈める。
      int surfaceKind = txA.r > 0.5 ? mkB : mkA;
      if (surfaceKind == 1) baseC *= 0.86 + txA.g * 0.08;
      // 甲冑の泥はねと擦れ。絵の既存の斑を使い、細かな雑音の計算を増やさない。
      if (surfaceKind == 1 || surfaceKind == 3) {
        float mud = smoothstep(0.1, 0.7, txA.b) * uBattleGrime;
        float splash = smoothstep(0.7, 0.92, txA.r) * (1.0 - smoothstep(0.4, 0.9, vObjP.y)) * uBattleGrime;
        float scuff = smoothstep(0.75, 0.95, txA.r) * uBattleGrime * (1.0 - splash);
        baseC = mix(baseC, vec3(0.1, 0.078, 0.055), clamp(mud * 0.45 + splash * 0.3, 0.0, 0.65));
        baseC = mix(baseC, vec3(0.24, 0.17, 0.1), scuff * 0.28);
        dd = clamp(dd + mud * 0.35 + splash * 0.25, 0.0, 1.0);
      }
      diffuseColor.rgb *= baseC;`)
    .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = mix(mkRough(mkA), mkRough(mkB), txA.r);
      roughnessFactor = mix(roughnessFactor, 0.97, dd * 0.7);
      // 濡れた布・藁は繊維の粗さを保ち、肌・漆・鉄の照りと分ける。
      // 威糸との境も、既存の素材の混ぜ方へ合わせる。
      float wetA = mkA == 0 || mkA == 6 ? 0.12 : mkA == 2 ? 0.18 : 0.4;
      float wetB = mkB == 0 || mkB == 6 ? 0.12 : mkB == 2 ? 0.18 : 0.4;
      // 泥の付いた札は粗さを残し、洗われた鉄と漆だけに雨空の照りを返す。
      float wetFinish = mix(wetA, wetB, txA.r) * (1.0 - dd * 0.75);
      roughnessFactor *= 1.0 - uWet * wetFinish;`)
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
          // 雨の艶をここで上書きしない。泥と擦れの所だけ鈍くする。
          roughnessFactor = mix(0.3 * (1.0 - uWet * 0.4), 0.78, clamp(worn, 0.0, 1.0));
          float scratch = smoothstep(0.82, 0.98, txA.g) * (0.35 + uBattleGrime * 0.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.13, 0.095), scratch * 0.22);
          roughnessFactor = mix(roughnessFactor, 0.7, smoothstep(0.3, 0.85, upN) * 0.6 * (1.0 - uWet));
        } else if (mk == 3) {
          float rust = smoothstep(0.6, 0.85, uVn(vObjP * 17.0 + 11.0)) * (0.4 + dirtA * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.085, 0.035), rust * 0.7);
          metalnessFactor *= 1.0 - rust * 0.8; roughnessFactor = mix(roughnessFactor, 0.9, rust);
          // 鉄肌の磨かれた所と荒れた所で照りを分ける。既存の斑を再利用する。
          roughnessFactor = clamp(roughnessFactor + (nz2 - 0.5) * 0.18, 0.32, 0.92);
        } else if (mk == 2) {
          // 肌は漆の鋭い艶と分け、既存の斑で日焼け・汗・汚れの鈍い反射にする。
          roughnessFactor = mix(0.67, 0.5, nz2) * (1.0 - uWet * 0.12);
          diffuseColor.rgb *= vec3(1.02, 0.98, 0.94) * (0.94 + nz * 0.1);
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
    .replace('#include <aomap_fragment>', unitFill('uNightContour', 'uNightFocus'))
    // 共通の材質で輪郭の陰を強める。形や描画回数は増やさない。
    .replace('#include <opaque_fragment>', `
      float bodyEdge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      outgoingLight *= 1.0 - 0.24 * bodyEdge * bodyEdge;
      #include <opaque_fragment>`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { int mkS = txA.r > 0.5 ? mkB : mkA; if (mkS == 1 || mkS == 3) {
          // 漆の黒い面と鉄の鈍い照りを分ける。空の映り込みで一様な灰色へ戻さない。
          reflectedLight.indirectSpecular *= mix(mkS == 1 ? 0.22 : 0.58, mkS == 1 ? 0.42 : 0.78, uWet);
          // 小札と重なりの暗部だけ環境光を遮る。日の当たる面の色は保つ。
          reflectedLight.indirectDiffuse *= mix(mkS == 1 ? 0.54 : 0.72, 1.0, smoothstep(0.2, 0.52, txA.g));
        }
        // 上を向いた漆（陣笠の上面・兜の鉢）は空を丸ごと映して薄紫に浮くので、映り込みをさらに削る
        if (mkS == 1) { float upS = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); reflectedLight.indirectSpecular *= mix(1.0, mix(0.35, 0.6, uWet), smoothstep(0.2, 0.8, upS)); } }`);
  unitFireMetal(sh);
};
// 軽い兵をまとめて描く InstancedMesh 用の兵の材質（MAT と同じ中身・同じ defines）。
//   同じ材質を一人ずつの形と InstancedMesh の両方に使うと、描くたびにシェーダーを選び直す手間が掛かる（毎コマ百回以上）ので分ける
// 小札の写真（画像生成、assets/tex/kozane.jpg）を、毛引威・素懸威の段の絵へ重ねる（読み終わった時に一度だけ。材質は作り直さない）
//   毛引：札の明るさ（緑）も糸の所（赤：青みの強い所）も写真から。素懸：糸の列は今の絵のまま、札の明るさだけ写真に寄せる（擦れ・傷・札ごとの照りのむら）
//   写真の一段（画像の 1/4 の高さ）を絵の一段（64px）に、札の幅を 16px に合わせて並べる。凹凸の絵（ATLAS_N）も同じ所だけ作り直す
let kozaneDone = false;
export function patchKozane(img) {
  if (kozaneDone || !MAT.map || !ATLAS_N || !img || !img.width) return;
  kozaneDone = true;
  const iw = img.width, ih = img.height;
  const pc = document.createElement('canvas'); pc.width = iw; pc.height = ih;
  const pg = pc.getContext('2d', { willReadFrequently: true }); pg.drawImage(img, 0, 0);
  const P0 = pg.getImageData(0, 0, iw, ih).data;
  // 明るさの幅（5%〜95%）で揃える
  const hist = new Uint32Array(256);
  for (let i = 0; i < iw * ih; i++) hist[(P0[i * 4] * 0.3 + P0[i * 4 + 1] * 0.59 + P0[i * 4 + 2] * 0.11) | 0]++;
  const pct = (q) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= q * iw * ih) return v; } return 255; };
  const lo = pct(0.05), hi = Math.max(lo + 10, pct(0.95));
  const sx = (16 * 22) / iw, sy = 64 / (ih / 4), oy = Math.round(ih * 0.05);   // 札は横に二十二枚。写真の段は上から 5% の所で始まる
  const src = (x, y) => { const u = Math.floor((x / sx)) % iw, v = (Math.floor(y / sy) + oy) % ih; return (v * iw + u) * 4; };
  const cv = MAT.map.image, ctx = cv.getContext('2d', { willReadFrequently: true });
  for (const [name, dense] of [['kebiki', true], ['sugake', false]]) {
    const [x0, y0, w, h] = REG[name];
    const im = ctx.getImageData(x0, y0, w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = src(x, y);
      const r = P0[s], g = P0[s + 1], b = P0[s + 2];
      const l = r * 0.3 + g * 0.59 + b * 0.11;
      const gp = Math.max(40, Math.min(255, 70 + (l - lo) / (hi - lo) * 185));
      if (dense) {
        const lace = b - Math.max(r, g) > 12 ? 1 : 0;   // 紺の糸は青みが強い
        d[o] = lace ? 255 : 0;
        d[o + 1] = lace ? Math.min(255, gp * 1.05 + 30) : gp;
      } else if (d[o] < 128) d[o + 1] = Math.round(d[o + 1] * 0.4 + gp * 0.6);
    }
    ctx.putImageData(im, x0, y0);
    // 凹凸の絵：明るさの傾きから（makeAtlas の甲冑の模様と同じ強さ）
    const nctx = ATLAS_N.image.getContext('2d', { willReadFrequently: true });
    const nd = nctx.getImageData(x0, y0, w, h), n = nd.data;
    const G = (x, y) => d[(Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4 + 1] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = 3.2, hx = G(x + 1, y) - G(x - 1, y), hy = G(x, y + 1) - G(x, y - 1);
      let nx = -hx * k, ny = hy * k, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      const o = (y * w + x) * 4; n[o] = (nx * 0.5 + 0.5) * 255; n[o + 1] = (ny * 0.5 + 0.5) * 255; n[o + 2] = (nz * 0.5 + 0.5) * 255; n[o + 3] = 255;
    }
    nctx.putImageData(nd, x0, y0);
  }
  // 札を描き足したら甲冑の絵はもう描き直さない：iPhone（astc_rt）は canvas を返してよい（2048×1024 ×2 ＝ 16MB の IOSurface）
  MAT.map.userData.astcStatic = true; ATLAS_N.userData.astcStatic = true;
  MAT.map.needsUpdate = true; ATLAS_N.needsUpdate = true;
}
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
// 上限つきの表（古い物から手放す）：部品の形の表は兵ごとに違う鍵（個体の肌・小袖の色・傷）で増え続け、
//   桶狭間で 1 分に 1400 個・80MB（GPU へは送らない中間の形）が溜まって iPhone の WebContent を 2GB まで押していた（10/19）。
//   使っている形は mesh が持っているので、表から外しても消えない（同じ鍵をまた頼まれた時に作り直すだけ）
export class LruMap extends Map {
  constructor(maxN = 2000, maxMB = 0, trackRefs = false) { super(); this.maxN = maxN; this.maxBytes = maxMB * 1048576; this.bytes = 0; this.sizes = this.maxBytes ? new Map() : null; this.refs = trackRefs ? new WeakMap() : null; }
  static bytesOf(v) {
    if (!v || typeof v !== 'object') return 0;
    if (v.isBufferGeometry) { let n = 0; for (const k in v.attributes) n += v.attributes[k].array ? v.attributes[k].array.byteLength : 0; if (v.index && v.index.array) n += v.index.array.byteLength; return n; }
    return 0;
  }
  get(k) { if (!super.has(k)) return undefined; const v = super.get(k); super.delete(k); super.set(k, v); return v; }
  set(k, v) {
    if (super.has(k)) this.delete(k);
    super.set(k, v);
    if (this.refs && v && v.isBufferGeometry) this.refs.set(v, (this.refs.get(v) || 0) + 1);
    if (v && v.isBufferGeometry && v.userData) v.userData.ck = k;   // 作り直す時に表から外す鍵（dropLazyGeo）
    if (this.sizes) { const b = LruMap.bytesOf(v); this.sizes.set(k, b); this.bytes += b; }
    while (this.size > this.maxN || (this.maxBytes && this.bytes > this.maxBytes && this.size > 1)) { const old = this.keys().next().value; this.delete(old); }
    return this;
  }
  delete(k) { if (this.refs) { const v = super.get(k); if (v && v.isBufferGeometry) { const n = this.refs.get(v) - 1; if (n) this.refs.set(v, n); else this.refs.delete(v); } } if (this.sizes && this.sizes.has(k)) { this.bytes -= this.sizes.get(k); this.sizes.delete(k); } return super.delete(k); }
  clear() { super.clear(); if (this.refs) this.refs = new WeakMap(); if (this.sizes) this.sizes.clear(); this.bytes = 0; }
}
const geoCache = new LruMap(2400, 48, true);
{ const clear0 = geoCache.clear.bind(geoCache); geoCache.clear = () => { unitShapes.clear(); clear0(); }; }
// 兵の細かい形（体・頭）は、近くで描く時しか要らないのに全員分の CPU の配列を戦の間ずっと持っていた（森部 858 個・98MB。10/20）。
//   iPhone では、しばらく描かれない形の配列を手放し、要る時に同じ鍵で作り直す（lazyGeo で作り方を覚えておく。見た目は同じ）
export const LAZY_STAT = { dropped: 0, restored: 0, bytes: 0, arraysDropped: 0, arraysMade: 0, temporaryDisposed: 0 };
export function lazyGeo(g, make) { if (g && g.isBufferGeometry) g._make = make; return g; }
export function dropLazyGeo(g) {
  // 一度戻した形は再び捨てない。隠れるたびに同じ配列を作る循環を止める。
  if (!g || !g._make || g._lazy || g._lazyRestored) return false;
  // 別名の数は表の出し入れ時に数える。兵ごとに最大2400件を探す処理と、その途中の配列作成を避ける。
  const refs = geoCache.refs.get(g) || 0;
  if (refs > 1 || (refs && Map.prototype.get.call(geoCache, g.userData.ck) !== g)) return false;
  // 同じ形の兵どうしで共有している配列（unitShapes の _unitShared：位置・法線・uv・index）は残し、兵ごとの色などの配列だけ手放す
  //   （共有の配列は 10MB ほどで、描かれない形の配列 60MB 強の大半は共有していない方だった。10/21 引き算）
  const attrs = []; for (const k in g.attributes) if (!g.attributes[k]._unitShared) attrs.push(g.attributes[k]); if (g.index && !g.index._unitShared) attrs.push(g.index);
  if (!attrs.length) return false;
  for (const a of attrs) { const d = Object.getOwnPropertyDescriptor(a, 'array'); if (!d || d.get || !a.array) return false; }   // GPU に任せている物は触らない
  g._lazy = true;
  for (const a of attrs) {
    LAZY_STAT.arraysDropped++;
    a._lazyDropped = true;
    LAZY_STAT.bytes += a.array.byteLength; a._lazyCtor = a.array.constructor; a._lazyBytes = a.array.byteLength;
    Object.defineProperty(a, 'array', {
      configurable: true, enumerable: true,
      get() { restoreLazy(g); return this.array; },
      set(v) { Object.defineProperty(this, 'array', { value: v, writable: true, configurable: true, enumerable: true }); },
    });
  }
  LAZY_STAT.dropped++;
  return true;
}
function restoreLazy(g) {
  g._lazy = false; g._lazyRestored = true; LAZY_STAT.restored++;
  // 先に取り出し口（getter）を外して空の配列にしておく（作り直しの途中で共有の属性を読んでも、ここへ戻って回らない）
  const own = []; for (const k in g.attributes) own.push(g.attributes[k]); if (g.index) own.push(g.index);
  //   外すのは自分が手放した配列だけ。共有の配列（_unitShared）の取り出し口は GPU から読み戻す口（main.js の gpuOnly）で、
  //   ここで空にすると同じ形の兵全員の位置が 0 個になり、倒れた形の写しの囲みが NaN になっていた（森部 10/25）
  for (const a of own) { const d = Object.getOwnPropertyDescriptor(a, 'array'); if (d && d.get && a._lazyDropped) Object.defineProperty(a, 'array', { value: new (a._lazyCtor || Float32Array)(0), writable: true, configurable: true, enumerable: true }); }
  const ck = g.userData && g.userData.ck;
  if (ck != null && geoCache.get(ck) === g) geoCache.delete(ck);   // 表の同じ物を返されないよう外してから作り直す
  let g2 = null;
  try { g2 = g._make(); } catch (e) { g2 = null; }
  if (g2 === g) g2 = null;
  // 属性を替える前に、古い属性を参照している描画側のバッファを返す。
  let resized = false;
  for (const k of [...Object.keys(g.attributes), 'index']) {
    const a = k === 'index' ? g.index : g.attributes[k], b = k === 'index' ? g2?.index : g2?.attributes[k];
    if (a?._lazyDropped && b?.array && (b.array.byteLength !== a._lazyBytes || b.array.constructor !== a._lazyCtor)) resized = true;
  }
  if (resized) g.dispose();
  // 作り直した配列の大きさ（や型）が元と違う時は、同じ属性に入れ替えると three が「大きさが違う」と投げて毎コマ止まる（墨俣 10/20 実機）。
  //   その時は属性ごと新しくして（three が新しい buffer を作る）、前の属性は捨てる
  const take = (a, b, k, isIndex) => {
    if (!a._lazyDropped) return;   // 共有の配列は手放していないので触らない
    a._lazyDropped = false;
    if (b === a) return;
    const arr = b && b.array ? b.array : new (a._lazyCtor || Float32Array)(0);
    LAZY_STAT.arraysMade++;
    LAZY_STAT.bytes -= a._lazyBytes || 0;
    // 今実行中の取り出し口も、新しい配列を返せるようにする。
    a.array = arr;
    if (a._lazyBytes !== undefined && (arr.byteLength !== a._lazyBytes || arr.constructor !== a._lazyCtor)) {
      LAZY_STAT.resized = (LAZY_STAT.resized || 0) + 1;
      const na = new THREE.BufferAttribute(arr, a.itemSize, a.normalized);
      if (isIndex) g.setIndex(na); else g.setAttribute(k, na);
      return;
    }
    a.needsUpdate = true;
  };
  for (const k in g.attributes) take(g.attributes[k], g2 && g2.attributes[k], k, false);
  if (g.index) take(g.index, g2 && g2.index, 'index', true);
  if (g2) { g2.dispose?.(); LAZY_STAT.temporaryDisposed++; }
  if (ck != null) geoCache.set(ck, g);   // 表はこの形（作り直した物は配列を渡して捨てる）
}
const flagMatCache = new Map();
const flagGeo = new THREE.PlaneGeometry(0.36, 0.72, 8, 8);   // はためくよう細かく割る
flagGeo.translate(0.18, 0, 0);
flagGeo.userData.unitFlag = true;
// 敵の旗は先が二つに分かれ、味方の四角旗と色なしでも見分けられる。
const enemyFlagGeo = flagGeo.clone();
const enemyFlagPos = enemyFlagGeo.attributes.position;
for (let i = 0; i < enemyFlagPos.count; i++) {
  const x = enemyFlagPos.getX(i), y = enemyFlagPos.getY(i);
  enemyFlagPos.setX(i, x * (1 - .7 * (1 - Math.abs(y) / .36)));
}
enemyFlagGeo.computeVertexNormals();
export { enemyFlagGeo };

// 部品に色・素材・模様の場所を持たせる
// o：mk 素材、c2 二つめの色、mk2 二つめの素材、reg 模様の場所、ru/rv 模様のどこを使うか、flipV 上下を返す、dirt 汚れ
let DIRT = 0.4;
// 色々威の境で三角形を分ける。頂点色だけ替えると紫と紅が面の途中で混ざる。
// 支度中だけ作り、出来た形は従来どおり保管・結合して共通材質で描く。
function laceBandGeometry(geo, bands) {
  const attrs = Object.entries(geo.attributes), output = attrs.map(() => []);
  const position = attrs.findIndex(([name]) => name === 'position');
  const index = geo.index, count = index ? index.count : geo.attributes.position.count;
  const clip = (poly, y, below) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ay = a[position][1], by = b[position][1];
      const insideA = below ? ay <= y : ay >= y, insideB = below ? by <= y : by >= y;
      if (insideA) out.push(a);
      if (insideA !== insideB) {
        const t = (y - ay) / (by - ay);
        out.push(a.map((values, k) => values.map((v, c) => v + (b[k][c] - v) * t)));
      }
    }
    return out;
  };
  for (let i = 0; i < count; i += 3) {
    const triangle = [];
    for (let j = 0; j < 3; j++) {
      const id = index ? index.getX(i + j) : i + j;
      triangle.push(attrs.map(([, a]) => Array.from({ length: a.itemSize }, (_, c) => a.array[id * a.itemSize + c])));
    }
    let bottom = -Infinity;
    for (const [top] of bands) {
      let poly = triangle;
      if (Number.isFinite(bottom)) poly = clip(poly, bottom, false);
      if (Number.isFinite(top)) poly = clip(poly, top, true);
      for (let j = 1; j + 1 < poly.length; j++)
        for (const vertex of [poly[0], poly[j], poly[j + 1]])
          for (let k = 0; k < attrs.length; k++) output[k].push(...vertex[k]);
      bottom = top;
    }
  }
  const g = new THREE.BufferGeometry();
  for (let k = 0; k < attrs.length; k++) g.setAttribute(attrs[k][0], new THREE.Float32BufferAttribute(output[k], attrs[k][1].itemSize));
  geo.dispose();
  return g;
}
function P(geo, hex, o = {}) {
  const g = o.c2Bands ? laceBandGeometry(geo, o.c2Bands) : geo;
  const n = g.attributes.position.count;
  const kind = o.mk ?? (GOLDS.has(hex) ? MK.gold : IRONS.has(hex) ? MK.iron : WOODS.has(hex) ? MK.wood : SKINS.has(hex) ? MK.skin : MK.cloth);
  const k2 = o.mk2 ?? kind;
  g.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(n).fill(kind + k2 * 8 + Math.min(1, o.dirt ?? DIRT) * 0.9), 1));
  const c = new THREE.Color(hex), c2 = new THREE.Color(o.c2 ?? hex);
  const a = new Float32Array(n * 3), b = new Float32Array(n * 3);
  // 札の折り返しの裏へ接触影を焼き込む。共有形を作る時だけ計算し、布と肌の明るさは保つ。
  const edge = (kind === MK.lac || kind === MK.iron) && g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const shade = edge ? 1 - Math.max(0, -edge.getY(i)) * .22 : 1;
    a[i * 3] = c.r * shade; a[i * 3 + 1] = c.g * shade; a[i * 3 + 2] = c.b * shade;
    b[i * 3] = c2.r * shade; b[i * 3 + 1] = c2.g * shade; b[i * 3 + 2] = c2.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('col2', new THREE.BufferAttribute(b, 3));
  // 色々威は形を作る時だけ糸の色を段ごとに塗る。材質と描く回数は増やさない。
  if (o.c2Bands) {
    const pos = g.attributes.position, colors = o.c2Bands.map(([top, hex]) => [top, new THREE.Color(hex)]);
    for (let i = 0; i < n; i += 3) {
      // 境の頂点は両色で分けてある。同じ三角形は同じ糸色にそろえる。
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const band = colors.find(([top]) => y <= top);
      if (band) for (let j = 0; j < 3; j++) g.attributes.col2.setXYZ(i + j, band[1].r, band[1].g, band[1].b);
    }
  }
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
    dequantize(p, 'color'); dequantize(p, 'col2');   // 一度まとめた形（8 bit の色）を部品にする時は float に戻す（型を揃える）
    if (!p.index) { const n = p.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; p.setIndex(new THREE.BufferAttribute(ix, 1)); }
    for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv', 'color', 'col2', 'mtl'].includes(k)) p.deleteAttribute(k);
  }
  const g = mergeGeometries(parts);
  if (g) {
    // 色（color・col2）は 8 bit の正規化で持つ（見た目は同じで一頂点 60→44 byte。読む側は getX・setXYZ）。部品として束ね直す時は dequantize
    quantize8(g, 'color'); quantize8(g, 'col2');
    // 兵の形は GPU へ送った後に CPU の配列を手放してよい（main.js の gpuOnly。要る時は GPU から読み戻す）
    // 囲み（箱と球）は配列があるうちに作る。手放した後に視野の判定や影の箱で求めると、GPU から読み戻して待たせる（10/23）
    if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingSphere) g.computeBoundingSphere();
    for (const k in g.attributes) g.attributes[k].gpuOnly = true; if (g.index) g.index.gpuOnly = true;
    shareShape(g);
  }
  return g;
}
// 兵の形の「形」（position・normal・uv・index）を、同じ形の兵で共有する（色 color・col2・mtl だけ兵ごと）。
//   兵ごとの鍵（色・傷）で別の形になるので、同じ体格・同じ部品でも頂点の配列が兵の数だけ GPU と CPU に乗っていた
//   （森部の乱戦で送り済みの兵の形 1193 個・82MB。GPU process が 600MB を越えて WebContent ごと切られる。10/20）。
//   three は属性（BufferAttribute）ごとに一度だけ送るので、同じ属性を使い回せば GPU も一つ。中身の hash で見分ける
const unitShapes = new Map();
export const UNIT_SHAPE_STAT = { made: 0, shared: 0 };
function shareShape(g) {
  const pos = g.attributes.position, uv = g.attributes.uv, nr = g.attributes.normal;
  if (!pos || !g.index || !pos.array || pos.count < 64 || (typeof window !== 'undefined' && window.__apx && window.__apx.noshare)) return;   // x_noshare：実機で切って比べる
  let h = 2166136261;
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619); };
  const hashF = (arr) => { const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length); for (let i = 0; i < u.length; i++) mix(u[i]); };
  hashF(pos.array); if (uv) hashF(uv.array); if (nr) hashF(nr.array);
  const ix = g.index.array; for (let i = 0; i < ix.length; i++) mix(ix[i]);
  const key = pos.count + ':' + ix.length + ':' + (uv ? 1 : 0) + (nr ? 1 : 0) + ':' + (h >>> 0).toString(36);
  const sh = unitShapes.get(key);
  // 共有の元が配列を手放している（lazy・gpuOnly）時は、今できた配列を新しい元にする（作り直しの最中に自分を読んで回らないように）
  const dropped = sh && ['position', 'normal', 'uv', 'index'].some((k) => { const a = sh[k]; if (!a) return false; const d = Object.getOwnPropertyDescriptor(a, 'array'); return (d && d.get) || !a.array || a.array.length === 0; });
  if (sh && !dropped && sh.position.count === pos.count && sh.index.count === g.index.count && !!sh.uv === !!uv && !!sh.normal === !!nr) {
    for (const a of [sh.position, sh.normal, sh.uv, sh.index]) if (a) a._unitShared = true;
    g.setAttribute('position', sh.position); if (nr) g.setAttribute('normal', sh.normal); if (uv) g.setAttribute('uv', sh.uv); g.setIndex(sh.index);
    UNIT_SHAPE_STAT.shared++;
    return;
  }
  unitShapes.set(key, { position: pos, normal: nr, uv, index: g.index });
  UNIT_SHAPE_STAT.made++;
}
function quantize8(g, name) {
  const a = g.attributes[name];
  if (!a || a.normalized || !(a.array instanceof Float32Array)) return;
  const src = a.array, out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, src[i])) * 255);
  g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, true));
}
// 正規化した整数の属性（8 bit の色など）を float に戻す（他の部品と束ねる前に。束ねた人の形の部品が来た時のため）
export function dequantize(g, name) {
  const a = g.attributes[name];
  if (!a || !a.normalized || a.array instanceof Float32Array) return;
  const src = a.array, max = src instanceof Uint8Array ? 255 : 65535, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] / max;
  g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
}
// 二点を結ぶ円柱（腕・脚の骨組み）
function limb(a, b, r1, r2, seg = 7, rounded = false) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  // 中央の一周だけで肉付きを作る。周囲の滑らかさを保ち、縦三分割の余分な面を送らない。
  const g = new THREE.CylinderGeometry(r2, r1, d.length(), seg, rounded ? 2 : 1);
  // 球を筒へ重ねず、一枚の皮膚・布として肉付きと関節への絞りを作る。
  // 元の筒と球の組み合わせより面が少なく、作った部位は従来どおり共有する。
  if (rounded) {
    const p = g.attributes.position, length = d.length();
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / length + .5;
      const swell = 1 + Math.sin(t * Math.PI) * .12;
      p.setX(i, p.getX(i) * swell); p.setZ(i, p.getZ(i) * swell);
    }
    g.computeVertexNormals();
  }
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
  // 管や馬体の周回端は位置が同じでも別頂点。法線を合わせて縦の硬い継ぎ目を消す。
  // 開いた布・面は端の位置が異なるため触らない。面数と共有形は保つ。
  const normal = g.attributes.normal;
  for (let j = 0; j <= nv; j++) {
    const a = j * (nu + 1), b = a + nu;
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    if (dx * dx + dy * dy + dz * dz > 1e-10) continue;
    const x = normal.getX(a) + normal.getX(b), y = normal.getY(a) + normal.getY(b), z = normal.getZ(a) + normal.getZ(b);
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) continue;
    normal.setXYZ(a, x / length, y / length, z / length);
    normal.setXYZ(b, x / length, y / length, z / length);
  }
  return g;
}
// 前（+z）を中心にした円柱の一部（center＝向き。π なら背）
function arcCyl(rt, rb, h, seg, L, center = 0) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, true, center - L / 2, L); }
// 近景の袖板。薄い筒の切れ端ではなく、裾に折り返しの厚みを持つ鉄板。
// 表と小口の頂点を分け、丸い表の照りと、下を向く暗い小口を混ぜない。
// 一段を一つの形に束ねる。遠景は従来の一枚面を使う。
function sleevePlate(rt, rb, h, span, center, seg = 4) {
  const edge = 0.006;
  const prof = [
    [rb - edge, -h / 2 + edge], [rb - edge, -h / 2],
    [rb, -h / 2], [rb, -h / 2],
    [rb + 0.002, -h / 2 + edge], [rt, h / 2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, seg, center - span / 2, span);
  // 小口には縅の模様を引き伸ばさず、段の裾の漆を割り当てる。
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, i % prof.length < 4 ? 0 : (i % prof.length === 4 ? edge / h : 1));
  return g;
}
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
  // 目だけを細く穴にせず、眼窩から頬骨へつなぐ。粗い頭にも残る幅で彫る。
  z -= 0.010 * G2(0.34, 0.20, 0.22, 0.15);
  z += 0.004 * G2(0.43, -0.04, 0.25, 0.12);               // 下まぶたから頬骨
  z += 0.007 * G(0, -0.34, 0.34, 0.18);                   // 歯列を包む口もと
  z -= 0.003 * G(0, -0.48, 0.25, 0.06);                   // 下唇と顎の境
  z += 0.006 * F.chin * G(0, -0.70, 0.38, 0.16);          // 顎の面
  z += 0.006 * G(0, 0.14, 0.09, 0.1);                      // 鼻の付け根
  out[0] = HC.x + x; out[1] = HC.y + y; out[2] = HC.z + z;
  return out;
}
// 頭の外向きの向き（θ）
const hdir = (th) => [Math.sin(th), Math.cos(th)];

function headGeometry(fkey, F, skin, hair, hi, dirt) {
  const key = 'h' + fkey + '|' + skin + '|' + hair + '|' + (hi ? 1 : 0);
  if (geoCache.has(key)) return geoCache.get(key);
  // 影を描かない携帯でも笠の下の肌を白く浮かせない。形を作る時だけ色を決める。
  if (F.hatShade) skin = new THREE.Color(skin).multiplyScalar(0.82).getHex();
  DIRT = dirt;
  const parts = [];
  const sk = { mk: MK.skin, reg: 'skin', mk2: MK.cloth, c2: hair };
  const lipC = new THREE.Color(skin).lerp(new THREE.Color(0x7a3a30), 0.32).getHex();
  // 首（太さは体格で）
  const nr = 0.052 * (F.neck || 1);
  parts.push(P(limb([0, 1.43, 0.0], [0, 1.555, 0.012], nr * 1.15, nr, hi ? 12 : 6), skin, sk));
  if (hi) parts.push(P(at(ball(0.012, 0.016, 0.01), 0, 1.5, 0.05 * (F.neck || 1)), skin, sk));   // のどぼとけ
  // 頭：顔の模様の座標で、正面ほど細かく
  // 共用する遠目の顔も頬と顎を丸める。近景の実写の顔の枠は増やさない。
  const nu = hi ? 30 : 16, nv = hi ? 22 : 12;
  const head = surf(nu, nv, (u, v) => headPt(faceTh(u), (v - 0.5) * Math.PI * 0.999, F));
  parts.push(P(head, skin, { ...sk, reg: faceReg(F.t) }));
  // 簡略顔にも鼻脇・眼窩・頬下の陰と泥のむらを残す。形と材質の数は増やさない。
  {
    const pos = head.attributes.position, colors = head.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const front = Math.max(0, Math.min(1, z / 0.065));
      const eye = Math.exp(-(((Math.abs(x) - 0.036) / 0.024) ** 2) - ((y - 1.632) / 0.013) ** 2);
      const cheek = Math.exp(-(((Math.abs(x) - 0.055) / 0.027) ** 2) - ((y - 1.582) / 0.019) ** 2);
      const soil = (0.5 + 0.5 * Math.sin(x * 167 + y * 91 + F.t * 2.3)) * (dirt || 0) * 0.09;
      const shade = 1 - front * (eye * 0.24 + cheek * 0.14 + soil);
      colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
    }
  }
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
  // 肌色一色の頭・鼻・耳を、同じ肌の厚みとしてつなぐ。
  // 接触する所の陰と血色を既存の頂点色へ焼く。影の無い携帯や遠い粗い顔でも残り、
  // 形・材質・描く回数は増えない。髪・眉・目玉には掛けない。
  const pos = g.attributes.position, colors = g.attributes.color, kinds = g.attributes.mtl;
  const spot = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  const age = Math.min(1, (F.t || 0) / 6);
  for (let i = 0; i < pos.count; i++) {
    if ((Math.floor(kinds.getX(i)) % 8) !== MK.skin) continue;
    const x = Math.abs(pos.getX(i)), y = pos.getY(i), z = pos.getZ(i);
    const front = sm(0.025, 0.085, z);
    const socket = spot(x, y, 0.033 * F.w, 1.625, 0.023, 0.017);
    const hollow = spot(x, y, 0.065 * F.w, 1.562, 0.025, 0.023) * F.gaunt;
    const underNose = spot(x, y, 0, 1.575, 0.020, 0.009);
    const underLip = spot(x, y, 0, 1.542, 0.025, 0.008);
    const cheek = spot(x, y, 0.057 * F.w, 1.589, 0.030, 0.023);
    const ear = sm(0.085, 0.112, x) * (1 - sm(0.025, 0.065, z));
    const neck = (1 - sm(1.49, 1.54, y)) * 0.18;
    // 笠の直下の陰は、頭・鼻・耳をまとめた後に一度だけ付ける。
    const hat = F.hatShade ? 0.3 * sm(1.59, 1.66, y) : 0;
    const shade = 1 - hat - neck - front * (socket * 0.28 + hollow * (0.10 + age * 0.07) + underNose * 0.20 + underLip * 0.16);
    const flush = front * cheek * (0.06 + age * 0.025) + ear * 0.07;
    colors.setXYZ(i, colors.getX(i) * shade * (1 + flush * 0.35), colors.getY(i) * shade * (1 - flush * 0.65), colors.getZ(i) * shade * (1 - flush));
  }
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
function hatParts(look, parts, hi, fallen = false) {
  const hat = look.hat;
  const T = look.tier || 0;
  const gold = look.face === 'player' ? 0xffd76a : 0xc9a24a, brass = look.face === 'player' ? 0xffd76a : 0xa8893f;
  const lace = look.lace || 0x5a4630;
  if (hat === 'jingasa' || hat === 'jingasa_n') {
    const hatStart = parts.length;
    const col = look.hatColor ?? (hat === 'jingasa_n' ? 0x121110 : 0x1c1916);
    // 高さ：縁が眉の高さ。頭は笠の円錐の内に入り、頭に当てる輪（布）は円錐の内で頭の太い所に掛かる（縁の高さで頭の上に載せると、頭から浮いて見える）
    const hy = 1.655;
    const fit = 0.96 + ((look.vi || 0) % 6) * .016; // 六つの共用形で笠の張りを変える。
    if (!hi) {
      // 遠くの軽い形：なだらかな円錐と縁
      const prof = [[0.0, 0.25], [0.07, 0.195], [0.16, 0.122], [0.25, 0.043], [0.31, 0.0], [0.315, -0.01]].map(([r, y]) => new THREE.Vector2(r * 0.91 * fit, y));
      // 中景へ切り替わる時にも笠の縁が十二角へ跳ねない。共用する形だけを細かくする。
      parts.push(P(at(new THREE.LatheGeometry(prof.slice().reverse(), 20, Math.PI, Math.PI * 2), 0, hy, 0), col, { mk: MK.lac, reg: 'kasa', c2: 0x3e2a1e, mk2: MK.wood }));
      parts.push(P(at(new THREE.TorusGeometry(0.282 * fit, 0.011, 3, 20), 0, hy - 0.008, 0, Math.PI / 2), 0x1c1914, { mk: MK.lac }));
      return;
    }
    // 近くの陣笠（御貸具足の鉄笠・塗り笠）：浅い円錐が頂から縁へ少し反り、縁の先でわずかに上へ返る。頂に小さな座。
    // 黒漆の艶、擦れた所（縁・頂・欠け）から下塗りが出る（塗り陣笠は朱の下塗り、安い笠は紙と竹の茶）。前に小さく家紋（家ごとに金か朱）、顎紐
    const R = 0.3003 * fit;
    // 戦国の陣笠は頂の立った円錐（資料の雑兵の笠）：頂を上げ、縁へ真っ直ぐ下ろす（平たい皿にしない）
    const prof = [[0, 0.158], [0.02, 0.156], [0.05, 0.146], [0.1, 0.123], [0.16, 0.09], [0.22, 0.056], [0.27, 0.031], [0.3, 0.017], [0.318, 0.01], [0.33, 0.014]].map(([r, y]) => [r * 0.91 * fit, y + 0.1 * Math.max(0, 1 - r / 0.3)]);   // 本の陣笠は頂のとがった円錐（10/27 頂を上げた）
    const yAt = (r) => { for (let i = 1; i < prof.length; i++) if (r <= prof[i][0]) { const [ra, ya] = prof[i - 1], [rb, yb] = prof[i]; return ya + (yb - ya) * (r - ra) / (rb - ra); } return prof[prof.length - 1][1]; };
    // 回す点は下から上の順に並べる（上から上の順だと面が下を向き、上から見えるのは裏の茶色だった）
    const kasa = new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), 48, Math.PI, Math.PI * 2);
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
    const under = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.min(r, R - 0.004), y - 0.01)), 32);
    parts.push(P(at(under, 0, hy, 0), 0x4a1c14, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(at(new THREE.TorusGeometry(R - 0.002, 0.0065, 4, 48), 0, hy + 0.009, 0, Math.PI / 2), col, { mk: MK.lac, reg: 'kasa', c2: 0x6a2216, mk2: MK.lac, rv: [0, 0.1] }));
    // 頂の座（笠の頂を押さえる小さな丸い金具）
    parts.push(P(at(ball(0.026, 0.011, 0.026, 10, 4), 0, hy + prof[0][1] - 0.001, 0), col, { mk: MK.lac, reg: 'lacq', c2: 0x6a2216, mk2: MK.lac }));
    parts.push(P(at(new THREE.TorusGeometry(0.026, 0.003, 3, 12), 0, hy + prof[0][1] - 0.005, 0, Math.PI / 2), 0x2a2420, { mk: MK.iron }));
    if (look.detail85) {
      const tilt = ((look.vi || 0) - 2.5) * 0.018;
      for (let i = hatStart; i < parts.length; i++) parts[i].translate(0, -hy, 0).rotateZ(tilt).rotateX(tilt * 0.5).translate(0, hy, 0);
    }
    // 頭に当てる輪（布）と、顎の下で結ぶ忍の緒
    if (!fallen) {
      parts.push(P(at(new THREE.TorusGeometry(0.106, 0.016, 5, 16), 0, hy + 0.013, 0, Math.PI / 2), 0x4a4236, { reg: 'cloth' }));
      for (const sd of [-1, 1]) parts.push(P(limb([sd * 0.1, hy, 0.0], [sd * 0.02, 1.49, 0.075], look.detail85 ? 0.006 : 0.0045, look.detail85 ? 0.006 : 0.0045, 4), 0xcfc4a8, { reg: 'cord' }));
      parts.push(P(at(ball(0.012, 0.008, 0.008), 0, 1.49, 0.078), 0xcfc4a8, { reg: 'cord' }));
    }
    // 前に家紋（御貸具足の印）：小さく、家ごとに金か朱
    const mr = monReg(look.mon);
    if (mr) {
      const shu = KASA_SHU.has(look.mon);
      const mp = [0.21, 0.185, 0.16, 0.135].map((r) => new THREE.Vector2(r, yAt(r) + 0.0035));
      const dec = new THREE.LatheGeometry(mp, 4, -0.23, 0.46);
      if (look.detail85) { const tilt = ((look.vi || 0) - 2.5) * 0.018; dec.rotateZ(tilt).rotateX(tilt * 0.5); }
      parts.push(P(at(dec, 0, hy, 0), col, { mk: MK.lac, reg: mr, c2: shu ? 0xa8301c : (hat === 'jingasa_n' ? gold : 0xb08a3a), mk2: shu ? MK.lac : MK.gold, swap: false }));
    }
    // 落ちた笠には首に沿う垂れ布を付けない。地面で白い首のように立たせない。
    if (fallen) return;
    if (look.tenugui) parts.push(P(at(new THREE.CylinderGeometry(0.117, 0.115, 0.03, 16, 1, true), 0, 1.655, 0.006), 0xd6ccb4, { reg: 'cloth' }));
    // 笠の下の垂れ布（日除け・雨よけの手拭いを笠の内に挟み、耳の横から首の後ろへ垂らす。雑兵物語の足軽）。三人に二人
    if (look.kasaDrape !== false && T === 0 && (look.vi || 0) % 3 !== 1) {
      const th0 = 1.15, sdv = (look.vi || 0) * 1.3;
      const pt = (u, v) => {
        const th = th0 + u * (Math.PI * 2 - th0 * 2), back = Math.max(0, -Math.cos(th));
        // 布のたるみ：裾ほど大きく波打ち、背は肩へ掛かって外へ開く
        const r = 0.116 + 0.026 * v + 0.008 * v * Math.sin(th * 6 + sdv) + 0.003 * v * Math.sin(th * 15 + sdv * 2) + 0.022 * v * v * back;
        const y = 1.668 - v * (0.15 + 0.06 * back) + 0.01 * v * Math.sin(th * 4 + sdv);
        return [Math.sin(th) * r, y, Math.cos(th) * r * 0.97 - 0.01];
      };
      const tg = surf(look.detail85 ? 16 : 20, 4, pt);
      const ti = tg.clone(); const ix = ti.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } ti.computeVertexNormals();
      // 本の足軽の着用の写真は、笠の下から紺の布を垂らす。生成りの明るい布は白い板に見えるので、紺を主に褪せた鼠を一つ（10/27）
      const tc = [0x2a3448, 0x5e5a50, 0x323c52][(look.vi || 0) % 3];
      const drape = P(tg, tc, { reg: 'cloth' });
      // 布の折り返しの陰を共用形へ焼く。笠の下の手拭いを白い板にしない。
      const dp = drape.attributes.position, dn = drape.attributes.normal;
      for (let i = 0; i < dp.count; i++) {
        const fold = 0.78 + Math.max(0, dn.getY(i)) * 0.12
          + Math.sin(Math.atan2(dp.getX(i), dp.getZ(i) + 0.01) * 6 + sdv) * 0.08;
        for (const name of ['color', 'col2']) {
          const color = drape.attributes[name];
          color.setXYZ(i, color.getX(i) * fold, color.getY(i) * fold, color.getZ(i) * fold);
        }
      }
      parts.push(drape, P(ti, new THREE.Color(tc).multiplyScalar(0.6).getHex(), { reg: 'cloth' }));
    }
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
  const kind = look.bowl;
  const zunari = kind ? kind === 'zunari' : hat === 'kabuto' && (look.vi || 0) % 2 === 1;
  const lacqHelm = !!kind || hat === 'kabuto_r' || hat === 'kabuto_suwa' || hat === 'kabuto_t' || hat === 'kabuto_shida' || hat === 'kabuto_tentsuki' || hat === 'kabuto_sanada' || hat === 'kabuto_shika' || hat === 'kabuto_bari';
  // 名将の鉢は六種類。錣と眉庇は共通で、頂点数を増やさず輪郭を変える。
  const noshi = kind === 'noshi_eboshi', coveredSuji = kind === 'suji' && look.sujiPlates === 61;
  const tall = kind === 'eboshi' || kind === 'namazu' || noshi, height = noshi ? 0.6 : kind === 'namazu' ? 0.73 : 0.38;
  // 比叡山の伝来具足を基にする二人だけ、板の継ぎ目を実際の隆起にする。
  // 一間を三分割し、鉢へまとめる。近景・遠景とも同じ本数で、形は既存の仕組みで共有する。
  const sujiPlates = kind === 'suji' && [40, 62].includes(look.sujiPlates) ? look.sujiPlates : 0;
  // 実測高のある筋兜だけ浅い鉢へ。最後の高さ九割の縮小を先に戻す。
  // 八幡座と篠垂も同じ鉢の面へ合わせ、形は生成時に共有する。
  const bowlRise = kind === 'suji' && look.bowlHeight > 0 ? look.bowlHeight / 0.9 : 0.19 * (zunari ? 0.86 : 0.94);
  const bowlSegments = sujiPlates ? sujiPlates * 3 : hi ? (kind || look.detail85 ? 24 : 32) : 12;
  // 八幡座の内側まで鉢で塞がず、天辺の穴を開ける。穴径は一般的な構造による復元。
  // https://www.kazo-dmuseum.jp/04visit/02castle/05-05-01.htm
  // 同じ分割数の鉢と既存の金具を生成時に結合し、近遠で穴の有無を変えない。
  const takigawaHelm = S.quality === 'high' && kind === 'suji' && look.crest === 'takigawa_buffalo';
  const tehen = kind === 'suji' && (look.tehenHole || takigawaHelm);
  const crownAngle = tehen ? Math.asin(0.015 / 0.19) : 0;
  const bowl = tall ? new THREE.CylinderGeometry(kind === 'namazu' ? 0.18 : 0.018, kind === 'namazu' ? 0.12 : 0.19, height, hi ? 16 : 10, 3, !noshi) : new THREE.SphereGeometry(0.19, takigawaHelm ? 32 : coveredSuji ? 61 : bowlSegments, hi ? (kind ? 8 : 9) : 5, Math.PI, Math.PI * 2, crownAngle, Math.PI / 2 - crownAngle);
  if (tall) {
    bowl.scale(1, 1, kind === 'namazu' ? 0.34 : 0.85);
    bowl.translate(0, height / 2, 0);
    if (noshi) {
      // 前からは細く、横からは後ろへ反る長烏帽子。鯰尾の横に広い頂部とは分ける。
      // 三段の輪をそのまま使い、近景・遠景とも結合済みの形と共通の金材質を保管する。
      const points = bowl.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const t = points.getY(i) / height;
        points.setX(i, points.getX(i) * (1 - 0.45 * t));
        points.setZ(i, points.getZ(i) - 0.17 * t * t);
      }
      bowl.computeVertexNormals();
    }
  }
  else {
    if (sujiPlates) {
      const p = bowl.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const ridge = (i % (bowlSegments + 1)) % 3 === 1 ? 1.012 : 1;
        p.setXYZ(i, p.getX(i) * ridge, p.getY(i), p.getZ(i) * ridge);
      }
      bowl.computeVertexNormals();
    }
    bowl.scale(kind === 'namban' ? 0.95 : 1, bowlRise / 0.19, 1.05);
    if (kind === 'momonari') {
      const p = bowl.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.13 * Math.pow(Math.max(0, p.getY(i) / 0.18), 3));
      bowl.computeVertexNormals();
    }
  }
  const helmMat = kind === 'namazu' || noshi ? MK.gold : lacqHelm ? MK.lac : MK.iron;
  parts.push(P(at(bowl, 0, 1.66, 0), iron, { mk: helmMat, reg: takigawaHelm || coveredSuji ? 'lacq' : kind ? (kind === 'suji' && !sujiPlates ? 'suji' : 'lacq') : zunari ? 'iron' : 'suji', ru: [0, 1] }));
  if (hi && kind === 'momonari' && look.momonariHagi) {
    // 雑賀の堀だけ、滑らかな一体の鉢へ鉄板の中央の矧ぎ目を補う。
    // 文化庁「桃形兜」の中央・側面の矧ぎ合わせを構造の手掛かりとする。
    // https://online.bunka.go.jp/db/heritages/detail/539848
    // 所用兜の再現ではない。黒漆の細い鎬を既存の頭へ結合し、形・材質を共有する。
    // 左右二面を中央で合わせ、単なる金の飾り筋にはしない。
    for (const sd of [-1, 1]) {
      const seam = surf(1, 16, (u, v) => {
        const angle = (v - .5) * Math.PI, y = .19 * .94 * Math.cos(angle);
        return [sd * u * .004, 1.66 + y + .13 * Math.pow(y / .18, 3) + (1 - u) * .004,
          .19 * 1.05 * Math.sin(angle) + (1 - u) * .003 * Math.sin(angle)];
      });
      // 左右で面の向きをそろえ、片側だけ裏面にならないようにする。
      if (sd > 0) {
        const ix = seam.index.array;
        for (let i = 0; i < ix.length; i += 3) [ix[i], ix[i + 2]] = [ix[i + 2], ix[i]];
        seam.computeVertexNormals();
      }
      parts.push(P(seam, iron, { mk: MK.lac, reg: 'lacq' }));
    }
  }
  if (takigawaHelm) {
    // 筋は矧板の縁の折り立て。平面の筋模様を重ねず、黒漆の細い稜線で補う。
    // 千葉県立中央博物館 大多喜城分館「甲冑とは何か」の筋兜の構造を参考にした復元。
    // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sub0001.htm
    // 三十二間・筋の高さは一益の所用品を特定した数値ではない。
    // 鉢と同じ緯線に頂点を置き、筋が曲面から浮かないようにする。
    // 兜へ結合して保存するため、描く回数や毎コマの処理は増やさない。
    const bands = hi ? 8 : 5;
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI * 2 / 32;
      const rib = surf(2, bands, (u, v) => {
        const th = crownAngle + v * (Math.PI / 2 - crownAngle);
        const raised = u === .5 ? .0015 : -.001;
        const r = (.19 + raised) * Math.sin(th);
        const angle = a + (.5 - u) * .0014 / Math.max(.015, r);
        return [Math.sin(angle) * r, 1.66 + (.19 + raised) * .94 * Math.cos(th), Math.cos(angle) * r * 1.05];
      });
      parts.push(P(rib, iron, { mk: MK.lac, reg: 'lacq' }));
    }
    // 笠印付鐶：鉢の後正中へ、座金・留め軸と垂れた鐶を補う。
    // 上記博物館の筋兜の解説に基づく一般的な構造。寸法・色は一益の所用品の実測ではない。
    // 高画質の専用兜だけに結合し、近景・遠景とも保存済みの形を使う。
    parts.push(P(at(new THREE.CylinderGeometry(.015, .015, .004, 10), 0, 1.755, -.173, Math.PI / 2), iron, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(limb([0, 1.755, -.171], [0, 1.755, -.192], .006, .006, 6), 0x2a2622, { mk: MK.iron, reg: 'iron' }));
    parts.push(P(at(new THREE.TorusGeometry(.0215, .0035, 5, 12), 0, 1.734, -.19), 0x2a2622, { mk: MK.iron, reg: 'iron' }));
    // 穴の内壁から暗い裏地へ続ける。近景・遠景とも兜へ結合して保存し、材質・描く回数は増やさない。
    const wall = new THREE.LatheGeometry([
      new THREE.Vector2(.015, 1.838), new THREE.Vector2(.015, 1.821),
    ], 12);
    parts.push(P(wall, iron, { mk: MK.lac, reg: 'lacq' }));
    parts.push(P(at(new THREE.CircleGeometry(.016, 12), 0, 1.821, 0, -Math.PI / 2), 0x24201c, { mk: MK.cloth, reg: 'cloth' }));
  }
  if (kind === 'tokan') {
    // 丹羽家伝来の唐冠兜を参考とする復元。低い鉢の上に冠を重ね、左右へ纓を延ばす。
    // 筋兜の金の筋は足さない。近景・遠景とも既存の頭の形へ結合し、材質と保管を共用する。
    const crown = new THREE.CylinderGeometry(.115, .155, .19, hi ? 12 : 8, 1);
    crown.scale(1, 1, .78);
    parts.push(P(at(crown, 0, 1.88, -.015), iron, { mk: MK.lac, reg: 'lacq' }));
    for (const sd of [-1, 1]) {
      const outline = [[.09, .015], [.22, .04], [.34, .12], [.44, .24],
        [.46, .235], [.43, .13], [.34, .04], [.21, -.025], [.09, -.03]];
      const wing = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(sd * x, y))),
        { depth: .012, bevelEnabled: false, steps: 1, curveSegments: 2 });
      parts.push(P(at(wing, 0, 1.85, -.045), iron, { mk: MK.lac, reg: 'lacq' }));
      // 金花猫塗の斑を少数の金箔片で補う。配置・大きさは実測ではない。
      for (let i = 0; i < 3; i++)
        parts.push(P(at(new THREE.BoxGeometry(.012, .018, .002), sd * (.19 + i * .075),
          1.87 + i * .045, -.031, 0, 0, sd * (.2 + i * .15)), gold, { mk: MK.gold }));
    }
  }
  if (coveredSuji) {
    // 手取川の謙信の総覆輪。鉢と同じ曲面に細い金の縁を六十一本通す。
    // 組み立て時だけ作って頭の形へ結合し、共通材質・既存の形の保管を使う。
    const edges = [], steps = hi ? 8 : 5;
    for (let i = 0; i < 61; i++) {
      const edge = new THREE.SphereGeometry(0.191, 1, steps,
        Math.PI + i * Math.PI * 2 / 61 - 0.0045, 0.009, 0, Math.PI / 2);
      edge.scale(1, 0.94, 1.05); edge.translate(0, 1.66, 0);
      edges.push(edge);
    }
    const edging = mergeGeometries(edges);
    edges.forEach(edge => edge.dispose());
    parts.push(P(edging, gold, { mk: MK.gold }));
  }
  // 天辺の穴を囲む八幡座。穴の縁に据え、遠くでも金具と穴を保つ。
  if ((hi || tehen) && (!kind || kind === 'suji')) parts.push(P(at(new THREE.TorusGeometry(0.022, 0.007, 5, 12), 0, 1.66 + bowlRise * Math.cos(crownAngle) - 0.003, 0, Math.PI / 2), T >= 2 ? gold : brass, { mk: MK.gold }));
  if (hi || sujiPlates) {
    // 比叡山の信長・光秀の腰巻は、距離で消さず黒漆の鉢と同じ仕上げにする。
    // 鉢と同じ前後の伸びへ合わせる。寸法は復元、生成時に既存の兜へ結合して共有する。
    const band = new THREE.CylinderGeometry(0.194, 0.196, 0.026, hi ? 32 : 12, 1, true);
    if (sujiPlates) band.scale(1, 1, 1.05);
    parts.push(P(at(band, 0, 1.672, 0), iron, { mk: lacqHelm ? MK.lac : MK.iron, reg: sujiPlates ? 'lacq' : 'iron' }));
  }
  if (hi) {
    // 篠垂（前の金の筋）：侍大将から
    if (T >= 2 && !zunari && !coveredSuji && (!kind || kind === 'suji') && look.shinodare !== false && look.crest !== 'oda_kuwa') for (const a of [-0.28, 0, 0.28]) {
      if (takigawaHelm) {
        // 大滝寺の一益：直線の棒は中央が鉢に埋まるため、曲面に沿う薄い筋金にする。
        // 山口県の文化財解説にある篠垂を参考にした復元。本人の所用品・寸法の特定ではない。
        // https://bunkazai.pref.yamaguchi.lg.jp/sp/bunkazai/summary.asp?mid=70099
        // 既存の兜へ結合・保存する。材質・描く回数・毎コマの処理は増やさない。
        const strip = surf(2, 8, (u, v) => {
          const ph = 1.2 - .85 * v, width = .007 + .005 * v;
          const radius = .192 * Math.cos(ph);
          const angle = a + (.5 - u) * width / radius;
          const crown = u === .5 ? .0008 : 0;
          return [Math.sin(angle) * (radius + crown),
            1.66 + (.19 * .94 + crown) * Math.sin(ph),
            Math.cos(angle) * (radius + crown) * 1.05];
        });
        parts.push(P(strip, gold, { mk: MK.gold }));
      } else {
        const q = (ph) => [0.192 * Math.sin(a) * Math.cos(ph), 1.66 + bowlRise * Math.sin(ph), 0.192 * 1.05 * Math.cos(a) * Math.cos(ph)];
        parts.push(P(limb(q(1.2), q(0.35), 0.0035, 0.006, 4), gold, { mk: MK.gold }));
      }
    }
  }
  // 眉庇（前の庇）：少し反らせ、縁に金の覆輪
  const visorSegments = takigawaHelm ? 10 : hi ? 10 : 5;
  const visor = arcCyl(0.198, 0.235, 0.05, visorSegments, Math.PI * 0.62, 0);
  if (takigawaHelm) {
    // 大滝寺の一益：眉庇を裏から透ける一枚面にせず、裏面と板の小口を補う。
    // 千葉県立中央博物館「甲冑の構成」の鉄板製の真向（眉庇）を参考にした復元。
    // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sub0003.htm
    // 厚さは補完。高画質の近景・遠景で同じ形を保存し、既存の兜へ結合する。
    const inside = visor.clone(), outer = visor.attributes.position, inner = inside.attributes.position;
    for (let i = 0; i < inner.count; i++) {
      const x = inner.getX(i), z = inner.getZ(i), scale = 1 - .002 / Math.hypot(x, z);
      inner.setX(i, x * scale); inner.setZ(i, z * scale);
    }
    const index = inside.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i]; index[i] = index[i + 2]; index[i + 2] = t;
    }
    inside.computeVertexNormals();
    const edgePositions = [], row = visorSegments + 1;
    const edge = (a, b) => {
      for (const [p, i] of [[outer, a], [outer, b], [inner, a], [outer, b], [inner, b], [inner, a]]) {
        edgePositions.push(p.getX(i), p.getY(i), p.getZ(i));
      }
    };
    for (let i = 0; i < visorSegments; i++) {
      edge(i, i + 1); edge(row + i + 1, row + i);
    }
    edge(row, 0); edge(visorSegments, row + visorSegments);
    const edging = new THREE.BufferGeometry();
    edging.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edging.computeVertexNormals();
    // 真向も金具廻りとして表裏を革で包む復元。既存の面を使い、形は増やさない。
    parts.push(P(at(inside, 0, 1.672, .012, -.22), 0x39312a, { mk: MK.cloth, reg: 'cloth' }),
      P(at(edging, 0, 1.672, .012, -.22), iron, { mk: MK.lac, reg: 'lacq' }));
  }
  parts.push(P(at(visor, 0, 1.672, 0.012, -0.22), takigawaHelm ? 0x39312a : iron,
    takigawaHelm ? { mk: MK.cloth, reg: 'cloth' } : { mk: MK.lac, reg: 'lacq' }));
  if ((hi || tehen) && T >= 1) { const vr = arcRing(0.235, 0.004, Math.PI * 0.62, 0, 10); vr.translate(0, -0.025, 0); parts.push(P(at(vr, 0, 1.672, 0.012, -0.22), T >= 2 ? gold : brass, { mk: MK.gold })); }
  // 錣（しころ）：首の後ろと横を守る段。顔の前は開ける。一段ずつ小札と威糸
  // 比叡山の信長は小形、光秀は切付小札の錣。遠景でも四段と首を覆う長さを保つ。
  // 一段の周方向の分割数だけは既存の近遠の値を使い、形・材質の共有も保つ。
  const compactShikoro = look.shikoroStyle === 'compact';
  const kiritsukeShikoro = hi && look.shikoroStyle === 'kiritsuke';
  const kozaneShikoro = hi && compactShikoro && look.honkozane;
  // 比叡山の信長の小形の錣にも、胴・大袖とそろう紺糸の厚みを補う復元案。
  // 光秀の紅糸と作り方を共用する。札頭の刻みは切付小札の指定だけに留める。
  const denseShikoroLace = kiritsukeShikoro || (hi && compactShikoro && look.honkozane);
  // 刻みや紅糸の厚みは近景だけ。四段の輪郭は距離で変えない。
  const threeRows = look.shikoroRows === 3;
  const shikoroStyle = ['compact', 'kiritsuke'].includes(look.shikoroStyle) ? (T >= 2 ? 'kebiki' : 'sugake') : look.shikoroStyle ?? (T >= 2 ? 'kebiki' : 'sugake');
  const shikoroLace = look.shikoroLace ?? lace;
  // 四段を指定した復元具足は、遠景でも最下段を省かず首を覆う長さを保つ。
  const n = threeRows ? 3 : look.shikoroRows === 4 || takigawaHelm || hi || compactShikoro || look.shikoroStyle === 'kiritsuke' ? 4 : 3;
  const shikoroStep = compactShikoro ? 0.012 : 0.024, shikoroHeight = compactShikoro ? 0.72 : 1;
  const shikoroSegments = kiritsukeShikoro || kozaneShikoro ? 72 : takigawaHelm || hi ? 16 : 8;
  for (let i = 0; i < n; i++) {
    const rt = 0.2 + (threeRows ? i * 1.5 : i) * shikoroStep, rb = 0.222 + (threeRows ? i * 1.5 : i) * shikoroStep;
    const height = (threeRows ? 0.084 : 0.066) * shikoroHeight, span = Math.PI * 1.42;
    const y = (threeRows ? 1.626 - i * 0.075 : 1.668 - (0.033 + i * 0.056) * shikoroHeight), z = -0.012 - (threeRows ? i * 1.5 : i) * shikoroStep * 0.5;
    const sk = arcCyl(rt, rb, height, shikoroSegments, span, Math.PI);
    if (takigawaHelm) {
      // 錣の札を裏から透ける一枚面にせず、裏面と上下・左右の小口を補う。
      // 千葉県立中央博物館「甲冑の構成」の札の説明を参考にした復元。
      // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sub0003.htm
      // 板厚・四段の構成は所用品の実測ではない。兜へ結合・保存し、材質も共用する。
      const inside = sk.clone(), outer = sk.attributes.position, inner = inside.attributes.position;
      for (let j = 0; j < inner.count; j++) {
        const x = inner.getX(j), z = inner.getZ(j), scale = 1 - .002 / Math.hypot(x, z);
        inner.setX(j, x * scale); inner.setZ(j, z * scale);
      }
      const index = inside.index.array;
      for (let j = 0; j < index.length; j += 3) {
        const t = index[j]; index[j] = index[j + 2]; index[j + 2] = t;
      }
      inside.computeVertexNormals();
      const edgePositions = [], stride = shikoroSegments + 1;
      const edge = (a, b) => {
        for (const [p, j] of [[outer, a], [outer, b], [inner, a], [outer, b], [inner, b], [inner, a]]) {
          edgePositions.push(p.getX(j), p.getY(j), p.getZ(j));
        }
      };
      for (let j = 0; j < shikoroSegments; j++) {
        edge(j, j + 1); edge(stride + j + 1, stride + j);
      }
      edge(stride, 0); edge(shikoroSegments, stride + shikoroSegments);
      const edging = new THREE.BufferGeometry();
      edging.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      edging.computeVertexNormals();
      parts.push(P(at(inside, 0, y, z), iron, { mk: MK.lac, reg: 'lacq' }),
        P(at(edging, 0, y, z), iron, { mk: MK.lac, reg: 'lacq' }));
    }
    if (kozaneShikoro) {
      // 信長の小形の錣も一枚板にせず、本小札を重ねた外面として補う。
      // 二十四枚・重ね代二ミリは描画上の復元。切付小札の札頭の刻みとは分ける。
      // 生成時だけ加工し、既存の兜の形・材質へ結合して使い回す。
      const p = sk.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), z = p.getZ(k), r = Math.hypot(x, z);
        const phase = (k % 73) % 3;
        if (!r || !phase) continue;
        const scale = 1 + phase * 0.001 / r;
        p.setXYZ(k, x * scale, p.getY(k), z * scale);
      }
      sk.computeVertexNormals();
    }
    if (kiritsukeShikoro) {
      // 光秀の切付小札の錣。一枚板の札頭だけを刻み、別々の小札にはしない。
      // 二十四山・谷の深さ四ミリは実測ではない復元。上端の頂点列だけを加工する。
      const p = sk.attributes.position;
      for (let k = 0; k <= 72; k += 3) p.setY(k, p.getY(k) - 0.004);
      sk.computeVertexNormals();
    }
    const row = 7 - i;
    parts.push(P(at(sk, 0, y, z), iron, { mk: MK.lac, reg: shikoroStyle, c2: shikoroLace, mk2: MK.cloth, rv: [row / 8, (row + 1) / 8], ru: [0, 0.6] }));
    if (denseShikoroLace) {
      // 紺糸・紅糸は板の反りに沿わせる。二十四列・太さ・通し方は実測でなく復元。
      // 近い兜を作る時だけ既存の共有形・布材質へ結合し、描く回数を増やさない。
      const pitch = span / 24;
      for (let k = 0; k < 24; k++) {
        const a = Math.PI - span / 2 + (k + 0.5) * pitch;
        // 段ごとに途切れていた糸を、裾の外へ回して次段の上端へ渡す。
        // 次段は半径だけでなく中心も後ろへずれるので、接続端の座標もそろえる。
        // 通し方・寸法は復元。既存の糸の断面を延ばし、描画の束と材質は増やさない。
        const profile = [];
        if (i < n - 1) profile.push(
          new THREE.Vector2(rt + shikoroStep + 0.002, -0.056 * shikoroHeight + height / 2 - 0.004),
          new THREE.Vector2(rb + 0.004, -height / 2 - 0.002),
        );
        profile.push(
          new THREE.Vector2(rb + 0.002, -height / 2 + 0.002),
          new THREE.Vector2(rt + 0.002, height / 2 - 0.004),
        );
        const cord = new THREE.LatheGeometry(profile, 2, a - pitch * 0.41, pitch * 0.82);
        if (i < n - 1) {
          const p = cord.attributes.position;
          for (let v = 0; v < p.count; v += profile.length) p.setZ(v, p.getZ(v) - shikoroStep * 0.5);
          cord.computeVertexNormals();
        }
        parts.push(P(at(cord, 0, y, z), lace, { reg: 'cord' }));
      }
    }
  }
  if (hi && look.shikoroStyle === 'kebiki' && !threeRows && !look.doubleShikoro) {
    // 雑賀の堀だけに指定する毛引威。細かな縦糸で錣の段を綴る復元案。
    // https://www.touken-world.jp/tips/59008/
    // 薄い面を頭の共有形へ一度だけ結合し、兜と同じ縮尺・骨で動かす。
    // 既存の布材質を使い、描画回数と毎コマの処理は増やさない。
    const count = 64, span = Math.PI * 1.42;
    for (let i = 0; i < n; i++) for (let j = 0; j < count; j++) {
      const angle = Math.PI - span / 2 + (j + .5) * span / count;
      const cord = surf(1, 1, (u, v) => {
        const a = angle + (u - .5) * span / count * .78;
        const r = .222 + i * .024 - v * .022 + .003;
        return [Math.sin(a) * r, 1.635 - i * .056 - .033 + v * .066,
          Math.cos(a) * r - .012 - i * .012];
      });
      parts.push(P(cord, lace, { mk: MK.cloth, reg: 'cord' }));
    }
  }
  if (hi && look.shikoroStyle === 'sugake' && !threeRows && !look.doubleShikoro) {
    // 雑賀の佐久間だけの復元。段の表へ二筋ずつの糸を通す。
    // 上越市の茶糸素懸威具足の解説を構造の参考とし、所用品とは断定しない。
    // https://www.city.joetsu.niigata.jp/site/cultural-property/cultural-property-city325.html
    // 頭の共有形へ一度だけ結合し、兜とともに縮める。材質・毎コマの処理は増やさない。
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < 6; j++) for (const offset of [-.025, .025]) {
      const angle = Math.PI * (.4 + j * 1.2 / 5) + offset;
      const point = (t) => {
        const r = .217 + i * .024 + t * .024;
        return [Math.sin(angle) * r, 1.635 - i * .056 - t * .056,
          Math.cos(angle) * r - .012 - (i + t) * .012];
      };
      parts.push(P(limb(point(0), point(1), .003, .003, 4), lace, { mk: MK.cloth, reg: 'cord' }));
    }
  }
  // 伝謙信所用兜の二重錣。外の笠状の錣の内側に、首へ沿う二段を補う。
  // https://uesugi-keishoden.jp/
  // 内錣の段数・寸法と配色は復元案。外錣の下から裾が見え、顔の前は開けておく。
  // 頭の共有形へ結合し、材質と描画回数・毎コマの更新は増やさない。
  if (look.doubleShikoro) for (let i = 0; i < 2; i++) {
    const sk = arcCyl(0.178 + i * 0.008, 0.192 + i * 0.008, 0.066,
      hi ? 16 : 8, Math.PI * 1.42, Math.PI);
    parts.push(P(at(sk, 0, 1.432 - i * 0.056, -0.014), iron,
      { mk: MK.lac, reg: shikoroStyle, c2: shikoroLace, mk2: MK.cloth,
        rv: [(5 - i) / 8, (6 - i) / 8], ru: [0, 0.6] }));
  }
  if (takigawaHelm) {
    // 一益の錣の裾に菱縫を補う。既存の段の模様だけでは裾の交差する緒が出ない。
    // 刀剣ワールド所蔵「黒漆塗本小札紺糸威丸胴具足」の錣を参考にした構造の復元。
    // https://www.touken-world.jp/search-armor/toseigusoku/57876/
    // 色・数・一段の縫い方は補完で、一益の所用品を特定しない。共用の兜へ結合して保存する。
    const last = n - 1, segments = shikoroSegments, span = Math.PI * 1.42;
    const start = Math.PI - span / 2, step = span / segments;
    const point = (angle, down) => {
      // 錣は多角形。円の外周に置くと面から浮くため、実際の板の面へ沿わせる。
      const mid = start + (Math.floor((angle - start) / step) + .5) * step;
      const radius = (.2 + last * .024 + .022 * down) * Math.cos(step / 2) / Math.cos(angle - mid) + .003;
      return [Math.sin(angle) * radius, 1.635 - last * .056 + .033 - .066 * down,
        Math.cos(angle) * radius - .012 - last * .012];
    };
    for (let j = 0; j < segments; j++) {
      const angle = start + (j + .5) * step;
      for (const sd of [-1, 1]) {
        parts.push(P(limb(point(angle - sd * .033, .56), point(angle + sd * .033, .89), .0025, .0025, 4), lace, { mk: MK.cloth, reg: 'cord' }));
      }
    }
  }
  // 吹返し：錣の端を外へ折り返した板。侍大将からは家紋の金具
  // 謙信の伝来兜は上二枚を別々に折り返す。段の位置と寸法は復元案。
  const fukiRows = look.fukigaeshiRows === 2 ? 2 : 1;
  for (const sd of [1, -1]) for (let fi = 0; fi < fukiRows; fi++) {
    // 錣の上の二段の前の端から、外へ（少し後ろへ）折り返した板。錣に付けて浮かせない
    const th = sd * Math.PI * 0.29, ry = Math.atan2(0.85, sd * 0.5);
    const fr = 0.212 + fi * 0.036;
    const fy = fukiRows === 2 ? 1.626 - fi * 0.075 : 1.6;
    const fh = fukiRows === 2 ? 0.068 : 0.1;
    const ex = Math.sin(th) * fr, ez = Math.cos(th) * fr - 0.012 - fi * 0.018;
    const ox = Math.cos(ry), oz = -Math.sin(ry);   // 板の外への向き
    const fcol = hat === 'kabuto_t' ? gold : iron === 0x25282b ? 0x2a221c : iron;
    const fukiY = fukiRows === 2 ? fy : 1.65 - 0.05 * shikoroHeight;
    const fukiHeight = fh * shikoroHeight;
    const fk = new THREE.BoxGeometry(0.066, fukiHeight, 0.01, kiritsukeShikoro ? 18 : 1);
    if (kiritsukeShikoro) {
      // 光秀の吹返しも錣と同じ切付小札として補う。一枚板を保ち、上端だけに札頭を刻む。
      // 井伊美術館の解説を参考にした復元。六山・谷四ミリ・糸の配置は実測ではない。
      // https://www.ii-museum.jp/blank-27
      const p = fk.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (p.getY(k) <= 0) continue;
        const column = Math.round((p.getX(k) / 0.066 + 0.5) * 18);
        if (column % 3 === 0) p.setY(k, p.getY(k) - 0.004);
      }
      fk.computeVertexNormals();
    }
    parts.push(P(at(fk, ex + ox * 0.03, fukiY, ez + oz * 0.03, 0, ry, 0), fcol, { mk: MK.lac, reg: 'lacq' }));
    if (denseShikoroLace) {
      // 比叡山の信長の吹返しにも、錣とそろう紺糸の厚みを補う復元案。
      // 光秀の紅糸と共用し、小形の錣では板と同じ比率で糸を短くする。
      // 生成時に既存の頭の束へ結合し、形と布材質を共有する。
      // 外端の覆輪とは間を開け、札頭の刻みも糸で埋めない。
      const nx = Math.sin(ry), nz = Math.cos(ry);
      for (let k = 0; k < 6; k++) {
        const x = -0.0275 + k * 0.011;
        const cord = new THREE.BoxGeometry(0.007, fukiHeight * 0.82, 0.003);
        parts.push(P(at(cord, ex + ox * (0.03 + x) + nx * 0.0065, fukiY - 0.002,
          ez + oz * (0.03 + x) + nz * 0.0065, 0, ry, 0), shikoroLace, { reg: 'cord' }));
      }
    }
    if (takigawaHelm) {
      // 大滝寺の一益：吹返しの包革と覆輪を、近景・遠景とも残す。
      // 千葉県立中央博物館「甲冑の構成」の革所・金具廻りを参考にした一般的な復元。
      // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sub0003.htm
      // 無地の革の色・縁の仕様は所用品の実測ではない。兜へ結合して共用する。
      const nx = Math.sin(ry), nz = Math.cos(ry);
      // 表だけでなく裏も包む。薄い板二枚を兜へ結合し、毎コマは作らない。
      for (const face of [-1, 1]) {
        parts.push(P(at(new THREE.BoxGeometry(.054, .086, .002),
          ex + ox * .03 + nx * .006 * face, 1.6, ez + oz * .03 + nz * .006 * face, 0, ry, 0),
        0x39312a, { mk: MK.cloth, reg: 'cloth' }));
      }
      for (const dy of [-.049, .049]) {
        parts.push(P(at(new THREE.BoxGeometry(.066, .004, .013),
          ex + ox * .03, 1.6 + dy, ez + oz * .03, 0, ry, 0), T >= 2 ? gold : brass, { mk: MK.gold }));
      }
    }
    if ((hi || takigawaHelm) && T >= 1) {
      // 縁の覆輪と、家紋の金具
      parts.push(P(at(new THREE.BoxGeometry(0.006, fukiHeight + 0.002, 0.013), ex + ox * 0.063, fukiY, ez + oz * 0.063, 0, ry, 0), T >= 2 ? gold : brass, { mk: MK.gold }));
      // 比叡山の四将には、本人の家紋金具として未確認の丸い飾りを補わない。
      if (fi === 0 && look.fukigaeshiBadge !== false) {
        const nx = Math.sin(ry), nz = Math.cos(ry);   // 板の面の向き（前）
        const dk = new THREE.CylinderGeometry(0.019, 0.019, 0.006, 12); dk.rotateX(Math.PI / 2); dk.rotateY(ry);
        parts.push(P(at(dk, ex + ox * 0.034 + nx * 0.008, fukiY + 0.01 * shikoroHeight, ez + oz * 0.034 + nz * 0.008), T >= 2 ? gold : brass, { mk: MK.gold }));
      }
    }
  }
  if (S.quality === 'high' && look.crest === 'takigawa_buffalo') {
    // 大滝寺の一益：面頬を省いた顔にも忍緒を回し、兜を顎の下で留める。
    // 千葉県立総南博物館「忍緒」：https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sinobinoo.htm
    // 色・通し方・結びは復元案。兜の形へ結合して保存し、頭の動きに追従させる。
    const cord = look.lace || 0x24242a;
    for (const sd of [-1, 1]) {
      const points = [[sd * .15, 1.66, .015], [sd * .125, 1.55, .105], [sd * .022, 1.48, .11]];
      for (let i = 0; i < points.length - 1; i++) {
        parts.push(P(limb(points[i], points[i + 1], .008, .008, 5), cord, { mk: MK.cloth, reg: 'cord' }));
      }
      // 結び目から短い端を左右へ垂らす。喉を横切る長い棒にはしない。
      parts.push(P(limb([sd * .012, 1.48, .11], [sd * .045, 1.425, .115], .007, .005, 5), cord, { mk: MK.cloth, reg: 'cord' }));
    }
    parts.push(P(at(ball(.023, .012, .012, 8, 4), 0, 1.48, .11), cord, { mk: MK.cloth, reg: 'cord' }));
  }
  // 前立の台
  const disk = () => parts.push(P(at(new THREE.CylinderGeometry(0.03, 0.034, 0.014, hi ? 12 : 6), 0, 1.73, 0.19, Math.PI / 2 - 0.25), gold, { mk: MK.gold }));
  const kuwa = (s) => { for (const sd of [1, -1]) parts.push(P(at(kuwaBlade(s, sd), sd * 0.018, 1.74, 0.19, -0.18), gold, { mk: MK.gold })); };
  if (hat === 'kabuto' && look.face === 'player') { kuwa(1); disk(); }
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
  if (look.helmetCord) {
    // 比叡山の信長・光秀・勝家・信盛：鉢裏から頬の外を通り、顎下へ留める緒。口元は開ける。
    // 色と結び方は復元。近遠とも同じ輪郭で兜へ結合し、形・材質を共有する。
    for (const sd of [-1, 1]) {
      const a = [sd * 0.155, 1.65, 0.025], b = [sd * 0.115, 1.52, 0.1], c = [0, 1.465, 0.11];
      parts.push(P(limb(a, b, 0.006, 0.006, 5), lace, { reg: 'cord' }));
      parts.push(P(limb(b, c, 0.006, 0.006, 5), lace, { reg: 'cord' }));
      parts.push(P(limb(c, [sd * 0.025, 1.42, 0.12], 0.006, 0.004, 5), lace, { reg: 'cord' }));
    }
    parts.push(P(at(ball(0.011, 0.009, 0.009, 6, 4), 0, 1.465, 0.11), lace, { reg: 'cord' }));
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
const DO_PROF = [[0.19, 0.88], [0.195, 0.95], [0.208, 1.05], [0.232, 1.18], [0.248, 1.3], [0.238, 1.38], [0.19, 1.43], [0.1, 1.46]];
// rows：胴の段の数（桶側の板・小札の段）。近くの形（hi）では段ごとに下の縁が外へ出る（上の段が下の段に重なる）形にし、
// 板を貼った筒でなく、段を重ねた厚みのある胴に見せる。模様の上下（v）は高さで決め、絵の段と形の段をそろえる
function cuirass(r0, seg, rows = 0, hi = false, opening = '', honkozane = false, backOpening = false, rightOpening = false, domaruOpening = false) {
  // 比叡山の伝来具足を参考にした胴だけ、小札の重なりを形にも残す。
  // 一周五十六枚・厚み二ミリは復元上の補い。生成時に胴へまとめて共有する。
  // 一枚を三分割し、近い形だけに使う。材質と描く回数は増やさない。
  const kozane = hi && honkozane;
  if (kozane) seg = 56 * 3;
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
  // 本編は槍を持つ右手が +x。胴丸の引き合わせも右脇（+x）へそろえる。
  // 近遠とも同じ細い合わせ目を残す。
  const nimai = opening === 'nimai', right = opening === 'right' || nimai, gap = right ? 0.035 : 0;
  const points = prof.map(([r, y]) => new THREE.Vector2(r * r0, y));
  let g;
  if (nimai) {
    // 二枚胴は前後を左脇の蝶番でつなぐ。左右の合わせ目を近遠とも残す。
    // 一周の分割数は従来と同じ。生成時に結合し、描く回数を増やさない。
    const front = new THREE.LatheGeometry(points, seg / 2, -Math.PI / 2 + gap / 2, Math.PI - gap);
    const back = new THREE.LatheGeometry(points, seg / 2, Math.PI / 2 + gap / 2, Math.PI - gap);
    g = mergeGeometries([front, back]); front.dispose(); back.dispose();
  } else if (domaruOpening) {
    g = new THREE.LatheGeometry(points, seg, -Math.PI / 2 + .036, Math.PI * 2 - .072);
  } else if (backOpening || rightOpening) {
    const start = rightOpening ? Math.PI / 2 : Math.PI;
    g = new THREE.LatheGeometry(points, seg, start + 0.065, Math.PI * 2 - 0.13);
  } else g = new THREE.LatheGeometry(points, seg, right ? Math.PI / 2 + gap / 2 : Math.PI, Math.PI * 2 - gap);
  // 模様の上下は高さで（点の数によらず、絵の段が同じ高さに来るように）
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - y0) / (y1 - y0));
  if (kozane) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      // 胸板は一枚のまま。小札の段だけ、隣の札へかぶせた縁をわずかに出す。
      if (y >= 1.345 || r === 0) continue;
      const a = Math.atan2(x, z) * 56 / (Math.PI * 2);
      const edge = Math.abs(a - Math.round(a));
      const overlap = edge < 0.1 ? 0.002 : 0;
      p.setXYZ(i, x * (1 + overlap / r), y, z * (1 + overlap / r));
    }
    g.computeVertexNormals();
  }
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
// 足軽の桶側胴（横矧）の近くの形：横長の鉄の板を七段に重ね、鋲で留める（御貸具足）。上の段の裾が下の段の上に重なり、裾の縁が少し外へ出る。
// 胸から腰へすぼまる（樽のように腹が張らない）。一段を前・左・後・右の四枚に分け、okeV の絵（板の長さに鋲が三つ）を一枚ずつ貼る
const OKE_PROF = [[0.184, 0.88], [0.19, 0.95], [0.203, 1.05], [0.226, 1.18], [0.245, 1.3], [0.238, 1.38], [0.19, 1.43], [0.1, 1.46]];
function okeYoko(r0, armor) {
  const rAt = (y) => { for (let i = 1; i < OKE_PROF.length; i++) { const [ra, ya] = OKE_PROF[i - 1], [rb, yb] = OKE_PROF[i]; if (y <= yb) return ra + (rb - ra) * ((y - ya) / (yb - ya)); } return OKE_PROF[OKE_PROF.length - 1][0]; };
  const rows = 7, Y0 = 0.876, Y1 = 1.345, H = (Y1 - Y0) / rows, t = 0.0085, out = [];
  for (let j = 0; j < rows; j++) {
    const ya = Y0 + j * H, yb = ya + H + 0.007;
    const prof = [[rAt(ya) + t * 0.2, ya - 0.004], [rAt(ya) + t, ya + 0.002], [rAt(ya + H * 0.45) + t * 0.5, ya + H * 0.45], [rAt(yb) + 0.001, yb]].map(([r, y]) => new THREE.Vector2(r * r0, y));
    for (let q = 0; q < 4; q++) {
      const g = new THREE.LatheGeometry(prof, 6, -Math.PI / 4 + q * Math.PI / 2, Math.PI / 2 * 1.015);
      const p = g.attributes.position, uv = g.attributes.uv, np = prof.length;
      for (let i = 0; i < p.count; i++) uv.setXY(i, Math.floor(i / np) / 6, Math.min(1, Math.max(0, (p.getY(i) - ya) / (yb - ya))));
      g.scale(1, 1, 0.8);
      const v = (j + q * 3) % 4;
      out.push(P(g, armor, { mk: MK.lac, reg: 'okeV', rv: [v / 4, (v + 1) / 4], c2: 0x4a2a1a, mk2: MK.lac }));
    }
  }
  // 胸の上・脇・背の上の板（いちばん上の段の端にかぶせる）
  const top = [[rAt(1.338) + 0.008, 1.338], [rAt(1.36) + 0.007, 1.362], [0.238, 1.38], [0.19, 1.43], [0.1, 1.46]].map(([r, y]) => new THREE.Vector2(r * r0, y));
  const tg = new THREE.LatheGeometry(top, 24, Math.PI, Math.PI * 2); tg.scale(1, 1, 0.8);
  out.push(P(tg, armor, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
  return out;
}
// 陣羽織のひだ（背の角度 th と高さ y での、外への出っ張り m）
export const haoriFold = (th, y) => (0.013 * Math.sin(th * 9 + 0.6) + 0.006 * Math.sin(th * 23 + 1.7 + y * 3)) * Math.min(1, Math.max(0.15, (1.44 - y) / 0.64));
// 体つき：足軽は細く締まり、侍は厚い
const BUILD = [0.94, 1.0, 1.05, 1.08];
// 羽織の前後で体格・肩の下がり・ひだを揃える。形を組む時だけ使う。
export function haoriPoint(th, y, tier, hi) {
  let r = (0.35 + (0.262 - 0.35) * ((y - 0.8) / 0.64)) * BUILD[tier || 0];
  let sy = 0;
  if (hi) {
    const dc = Math.PI - Math.abs(th);
    const side = Math.min(1, dc / (Math.PI * 0.4));
    const edge = Math.min(1, Math.max(0, (dc - Math.PI * 0.26) / (Math.PI * 0.14)));
    const low = Math.min(1, Math.max(0, (1.44 - y) / 0.64));
    const top = Math.min(1, Math.max(0, (y - 1.2) / 0.24));
    sy = -0.085 * side * side * top * top;
    r += haoriFold(th, y) + edge * edge * 0.035 * low - 0.03 * top * top * (0.4 + 0.6 * side);
  }
  return [Math.sin(th) * r, y + sy, Math.cos(th) * r - 0.004];
}

// grp を渡すと、その部分だけ（骨の入った人に着せるため）：base 腰と肩の下着・torso 胴まわり・hips 草摺・sodeP/sodeN 袖（+x/-x）・head 兜と面頬
const bodyPartsCache = new LruMap(160);
const partAttributes = new Map();
// 色だけ違う部位も、座標・法線・模様・素材の配列を共有する。
// 色は従来の頂点色に残すので、高画質の材質と束の描き方もそのまま使える。
function partGeo(parts) {
  const g = parts.length > 1 ? merge(parts) : parts[0] || null;
  if (!g) return g;
  for (const name of ['position', 'normal', 'uv', 'mtl', 'color', 'col2', 'index']) {
    const a = name === 'index' ? g.index : g.attributes[name];
    if (!a) continue;
    const values = a.array;
    let hash = 0;
    const step = Math.max(1, Math.floor(values.length / 32));
    for (let i = 0; i < values.length; i += step) hash = (Math.imul(hash, 31) + Math.round(values[i] * 10000)) | 0;
    const key = [name, values.constructor.name, values.length, a.itemSize, a.normalized, hash].join('|');
    let list = partAttributes.get(key);
    if (!list) partAttributes.set(key, list = []);
    const shared = list.find(b => {
      for (let i = 0; i < values.length; i++) if (values[i] !== b.array[i]) return false;
      return true;
    });
    if (shared) {
      shared._unitShared = true;
      if (name === 'index') g.setIndex(shared);
      else g.setAttribute(name, shared);
    } else list.push(a);
  }
  return g;
}
function bodyPartList(PT, grp) {
  const names = grp === 'rider' ? ['base', 'torso', 'haori', 'back', 'koshi', 'pole']
    : grp === 'nohead' ? ['base', 'torso', 'hips', 'sodeP', 'sodeN', 'haori', 'back', 'koshi', 'pole']
    : grp ? [grp] : Object.keys(PT);
  return names.flatMap(name => PT[name]);
}
function bodyGeometry(key, o, hi, grp) {
  if (o.nanban && !o.kosode) return nanbanGeometry('body', hi, grp, 0, { P, at, merge, MK, limb, ball });
  const ck = key + (hi ? '|H' : '|L') + (o.honnoCloth ? '|honnoCloth' : '') + (grp ? '|' + grp : '');
  if (geoCache.has(ck)) return geoCache.get(ck);
  if (grp === 'fallenHat') {
    const parts = [];
    DIRT = o.dirt ?? 0.85;
    hatParts(o, parts, hi, true);
    const g = parts.length ? merge(parts) : null;
    geoCache.set(ck, g);
    return g;
  }
  if (o.sohei) return soheiBody(ck, o, hi, grp);
  // 一つの部位を頼まれても全身を色付けしていた。全身の部品を一度だけ作り、結合も部位ごとに共有する。
  const partsKey = key + (hi ? '|H' : '|L') + (o.honnoCloth ? '|honnoCloth' : '');
  if (bodyPartsCache.has(partsKey)) {
    const PT = bodyPartsCache.get(partsKey);
    const list = bodyPartList(PT, grp);
    const g = list.length > 1 ? merge(list) : list[0] || null;
    if (grp && PT[grp]) PT[grp] = g ? [g] : [];
    geoCache.set(ck, g);
    return g;
  }   // 僧兵は甲冑でなく衣と袈裟
  const T = o.tier || 0;
  // 同じ六つの共用形の中で、胸と肩の厚みに差を付ける。手足の関節は動かさない。
  const r0 = BUILD[T] * (o.hero ? 1 : [0.96, 1.035, 0.99, 1.055, 0.975, 1.015][(o.vi || 0) % 6]);
  const armor = o.armor, lace = o.lace;
  // 金小札は札だけに既存の金の質感を使う。威糸・兜・手足は従来の材質を保つ。
  const kozaneMk = o.goldKozane || o.kozaneFinish === 'gold' ? MK.gold : MK.lac;
  // 金小札の色を一枚板へ広げない。堀の胸板・小鰭・冠板は黒漆で補う復元案。
  // 形と材質は既存のまま、金具の金色と小札の金の質感は保つ。
  const plateArmor = o.goldKozane ? (o.helm ?? 0x1c1a1a) : armor;
  // 長近の金箔草摺。胴と独立して色・仕上げを選び、共通の五段の形へ焼き込む。
  const kusazuriColor = o.kusazuriColor ?? armor;
  const kusazuriMat = o.kusazuriFinish === 'gold' ? MK.gold : kozaneMk;
  const under = o.cloth || 0x2b2622;   // 鎧下の布
  DIRT = o.dirt ?? [0.85, 0.6, 0.45, 0.3][T];
  const gold = 0xc9a24a, brass = 0xa8893f;
  // 胴の模様：足軽は桶側（横の板を鋲留め）か腹巻（素懸）、侍は素懸、侍大将からは毛引
  const doStyle = o.doStyle ?? (T === 0 ? ((o.vi || 0) % 3 === 2 ? 'sugake' : 'okegawa') : T === 1 ? 'sugake' : 'kebiki');
  const rows = doStyle === 'okegawa' ? [0, 1] : [0, 0.75];
  // 手取川の謙信の色々威。板の模様だけでなく、重ねる緒もその高さの色へそろえる。
  // 山形県の伝来具足解説（黒韋・紫糸・紅糸）を参考とする復元案。
  // https://www.pref.yamagata.jp/cgi-bin/yamagata-takara/?id=1072&m=detail
  // 緒の配置は従来の補完を保ち、共有形の組み立て時だけ色を選ぶ。
  const laceColorAt = (bands, y) => bands?.find(([top]) => y <= top)?.[1] ?? lace;
  // 部位に効く値だけを鍵にする。色・素材・模様・汚れを含め、共有後は塗り直さない。
  // 手取川の謙信の色々威・総覆輪・三枚錣、利家の脇の合わせ・五段威も区別する。
  // 全身の鍵だけで分けても、ここで同じ部品を借りると伝来具足の指定が消える。
  const named = typeof o.face === 'string' && o.face.startsWith('g:');
  const takigawaTakahimo = S.quality === 'high' && o.crest === 'takigawa_buffalo';
  const takigawaSode = takigawaTakahimo;
  const takigawaKusazuri = takigawaTakahimo;
  // 大滝寺の一益の黒糸威の胴にも、着脱する右脇の合わせを補う。
  // 兵庫県立歴史博物館「胴丸」を参考とする復元で、本人の所用品の特定ではない。
  // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
  // 高画質だけに適用し、引合緒と鎧下は既存の共有部品へ結合する。
  const rightOpening = !!o.rightOpening || takigawaTakahimo;
  const common = [hi, T, r0, DIRT];
  const partKeys = {
    base: [under],
    // 雑賀の堀の金小札・胴丸・脇板・緒を、同色の別形式の具足と混ぜない。
    torso: [armor, lace, kozaneMk, under, doStyle, o.mon, o.monCol, o.trim, o.left, !!o.horo, !!o.menpo, (o.vi || 0) % 3, named, plateArmor, !!o.domaru, !!o.sode, !!o.wakiita, o.takahimo, o.kurijime, !!o.doSugake, !!o.doKebiki, o.doLaceBands, !!o.backOpening, rightOpening, !!o.agemaki, o.doOpening, !!o.honkozane, o.sodeStyle, !!o.takahimo, takigawaTakahimo],
    hips: [kusazuriColor, lace, kusazuriMat, doStyle, !!o.domaru, o.kusazuriHishinui, o.kusazuriMimiito, !!o.yurugi, !!o.kusazuriSugake, o.kusazuriLaceRows, o.kusazuriFur, o.doLaceBands, o.takedaRed, !!o.goldKozane, o.kusazuriCount, o.kusazuriLength, !!o.honkozane, !!o.kusazuriStepped, takigawaKusazuri],
    sodeP: [armor, lace, kozaneMk, !!o.sode, o.shoulderMark, plateArmor, !!o.domaru, doStyle, named, o.sodeMimiito, o.sodeStyle, o.sodeHishinui, o.sodeLaceBands, o.sodeShape, hi ? o.sodeLining : null, o.takedaRed, !!o.honkozane, !!o.sodeCrownFit, takigawaSode],
    sodeN: [armor, lace, kozaneMk, !!o.sode, o.shoulderMark, plateArmor, !!o.domaru, doStyle, named, o.sodeMimiito, o.sodeStyle, o.sodeHishinui, o.sodeLaceBands, o.sodeShape, hi ? o.sodeLining : null, o.takedaRed, !!o.honkozane, !!o.sodeCrownFit, takigawaSode],
    head: [o.face === 'player', under, o.detail85, o.hat, o.hatColor, o.hachi, o.helm, o.bowl, o.lace, o.mon, o.tenugui, o.kasaDrape !== false, o.vi || 0, o.menpo, o.menpoStyle, o.sujiPlates, o.shikoroRows, o.fukigaeshiRows, o.shikoroStyle, o.shikoroLace, !!o.doubleShikoro, !!o.momonariHagi, o.bowlHeight, !!o.tehenHole, !!o.honkozane, o.shinodare === false, o.fukigaeshiBadge === false, !!o.helmetCord, S.quality === 'high' && o.crest === 'takigawa_buffalo'],
    haori: [o.haori, o.detail85, o.haoriCollar, o.haoriMon || o.mon, o.haoriMonCol, S.quality === 'high' && o.haoriMon === 'takigawa_haori'],
    back: [o.horo, o.longHoro],
    // 一益の復元した拵えと納刀・抜刀を分ける。同じ指定の形は引き続き共用する。
    koshi: [!!o.saya, named, o.weapon === 'bow', !!o.pole, !!o.horo, o.swordMount, o.weapon === 'sword',
      S.quality === 'high' ? o.uwaobi || 0 : 0,
      S.quality === 'high' ? o.sayaSori || 0 : 0,
      S.quality === 'high' && named ? o.sayaOval || 1 : 1,
      S.quality === 'high' && named ? o.tsukaOval || 1 : 1,
      S.quality === 'high' && o.crest === 'takigawa_buffalo',
      S.quality === 'high' && o.emptySaya && o.weapon === 'sword',
      S.quality === 'high' && !!(o.sayaCord || o.emptySaya && o.weapon === 'sword')],
    pole: [!!o.pole, !!o.horo],
  };
  const PT = {}, shared = {};
  for (const name of Object.keys(partKeys)) {
    const pk = 'bodyPart|' + name + '|' + JSON.stringify([...common, ...partKeys[name]]);
    partKeys[name] = pk;
    shared[name] = geoCache.has(pk);
    const g = geoCache.get(pk);
    PT[name] = g ? [g] : [];
  }
  let parts = PT.base;
  if (!shared.base) {
  // 腰（袴の上端）と上帯
  parts.push(P(at(new THREE.CylinderGeometry(0.19 * r0, 0.2 * r0, 0.2, hi ? 14 : 8), 0, 0.82, 0), under, { reg: 'cloth' }));
  // 鎧下の肩と、首元の襟（白い襦袢がのぞく）
  // 肩は首から腕へなで下がる形に（平たい楕円の張り出しは、箱の肩に見える）
  const yoke = ball(0.23 * r0, 0.08, 0.15 * r0, hi ? 14 : 8, 5);
  { const q = yoke.attributes.position; for (let i = 0; i < q.count; i++) { const x = q.getX(i); q.setY(i, q.getY(i) - 0.9 * x * x); } yoke.computeVertexNormals(); }
  parts.push(P(at(yoke, 0, 1.435, -0.005), under, { reg: 'cloth' }));
  }
  parts = PT.torso;
  if (!shared.torso) {
  parts.push(P(at(new THREE.CylinderGeometry(0.068, 0.1, 0.06, hi ? 14 : 8, 1, true), 0, 1.47, 0.005), under, { reg: 'cloth' }));
  if (hi) {
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.018, 0.075, 0.006), sd * 0.03, 1.46, 0.07, -0.25, 0, sd * 0.55), 0xd8d0bc, { reg: 'cloth' }));
  }
  // 雑賀の堀の高画質だけ、右脇の引合緒の下でも小札を分ける。
  // 他の具足の開き位置や遠い形は保ち、共有形の組み立て時に処理する。
  const domaruOpening = hi && o.domaru && o.goldKozane;
  // 胴
  if (hi && doStyle === 'okegawa') parts.push(...(T === 0 ? okeYoko(r0, armor) : okeDo(r0, armor)));
  else {
    const smooth = doStyle === 'hotoke' || doStyle === 'katahada';
    parts.push(P(cuirass(r0, hi ? 28 : 12, smooth ? 0 : doStyle === 'okegawa' ? 5 : 6, hi, o.doOpening, o.honkozane, o.backOpening, rightOpening, domaruOpening), armor, { mk: kozaneMk, reg: smooth ? 'lacq' : doStyle, c2: smooth ? armor : doStyle === 'okegawa' ? 0x4a2a1a : lace, c2Bands: o.doLaceBands, mk2: smooth || doStyle === 'okegawa' ? MK.lac : MK.cloth, rv: rows }));
  }
  if (o.doOpening === 'right' || o.doOpening === 'nimai') {
    // 合わせ目の内側に下地、外側に締め紐。既存の胴へ結合し、形と材質を使い回す。
    // 信長の胴丸・光秀の二枚胴とも、槍を持つ右手と同じ +x 側で締める。
    const lining = new THREE.LatheGeometry(DO_PROF.slice(0, 6).map(([r, y]) => new THREE.Vector2(r * r0 - 0.004, y)), 2, Math.PI / 2 - 0.04, 0.08);
    lining.scale(1, 1, 0.8);
    parts.push(P(lining, under, { reg: 'cloth' }));
    for (const [y, r] of [[1.05, 0.218], [1.3, 0.254]]) {
      parts.push(P(at(new THREE.BoxGeometry(0.014, 0.014, 0.065), r * r0, y, 0), lace, { reg: 'cord' }));
    }
  }
  if (o.doOpening === 'nimai') {
    // 二枚胴の左脇（-x）。蝶番の位置・寸法は復元上の補い。
    // 胴の既存の形と材質へ結合し、毎コマの処理は足さない。
    const lining = new THREE.LatheGeometry(DO_PROF.slice(0, 6).map(([r, y]) => new THREE.Vector2(r * r0 - 0.004, y)), 2, -Math.PI / 2 - 0.04, 0.08);
    lining.scale(1, 1, 0.8);
    parts.push(P(lining, under, { reg: 'cloth' }));
    for (const [y, r] of [[1.05, 0.218], [1.3, 0.254]]) {
      parts.push(P(at(new THREE.BoxGeometry(0.012, 0.04, 0.05), -r * r0 - 0.004, y, 0), armor, { mk: MK.iron }));
      parts.push(P(at(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), -r * r0 - 0.014, y, 0), armor, { mk: MK.iron }));
    }
  }
  if (hi && doStyle === 'kebiki' && o.doKebiki) {
    // 雑賀の堀の胴にも、幅いっぱいに並ぶ毛引威を浅葱の糸で補う。
    // https://www.touken-world.jp/tips/59008/
    // 本数・幅は復元案。袖・草摺と同じ布の材質で、胴の共有形へ初回だけ結合する。
    const H = (1.46 - .88) / 6, count = 80, pitch = Math.PI * 2 / count;
    const radiusAt = (y) => {
      for (let i = 1; i < DO_PROF.length; i++) {
        const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i];
        if (y <= yb) return (ra + (rb - ra) * (y - ya) / (yb - ya)) * r0;
      }
      return DO_PROF[DO_PROF.length - 1][0] * r0;
    };
    for (let k = 0; k < count; k++) {
      const angle = k * pitch;
      // 右脇の開きを毛引威の面でふさがない。
      if (domaruOpening && Math.abs(angle - Math.PI * 1.5) < .036 + pitch * .39) continue;
      // 胸板・押付板・脇板へは糸を重ねず、小札の部分だけを綴る。
      const back = Math.abs(angle - Math.PI) < .8 + pitch / 2;
      const side = Math.abs(angle - Math.PI / 2) < .46 + pitch / 2 ||
        Math.abs(angle - Math.PI * 1.5) < .46 + pitch / 2;
      const limit = back ? 1.18 : side ? 1.3 : 1.34;
      for (let j = 0; j < 5; j++) {
        const y = .88 + j * H, top = Math.min(y + H - .003, limit);
        if (top <= y + .002) continue;
        const cord = surf(1, 2, (u, v) => {
          const th = angle + (u - .5) * pitch * .78;
          const py = y + .002 + v * (top - y - .002);
          const r = radiusAt(py) + (.009 - v * .006) * r0;
          return [Math.sin(th) * r, py, Math.cos(th) * r * .8];
        });
        parts.push(P(cord, lace, { mk: MK.cloth, reg: 'cord' }));
      }
    }
  }
  if (hi && doStyle === 'sugake' && o.doSugake) {
    // 雑賀の佐久間だけに、二筋ずつ並ぶ素懸威を形で補う。
    // https://api.online.bunka.go.jp/heritages/detail/575596
    // 茶の色・配置は復元案。共有する胴へ初回だけ結合する。
    const H = (1.46 - .88) / 6;
    const point = (angle, y, extra) => {
      for (let i = 1; i < DO_PROF.length; i++) {
        const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i];
        if (y > yb) continue;
        const r = (ra + (rb - ra) * (y - ya) / (yb - ya) + extra) * r0;
        return [Math.sin(angle) * r, y, Math.cos(angle) * r * .8];
      }
    };
    for (let k = 0; k < 8; k++) for (const offset of [-.035, .035]) {
      const angle = k * Math.PI / 4 + offset;
      for (let j = 0; j < 5; j++) {
        const y = .88 + j * H;
        // 最上段も胸板の下まで綴る。胸板を越えて首元へ糸を延ばさない。
        const top = Math.min(y + H + .002, 1.34);
        // 板の下縁・中央・上縁をたどり、次の段までつなぐ。
        const a = point(angle, y + .002, .009);
        const b = point(angle, (y + .002 + top) * .5, .006);
        const c = point(angle, top, .009);
        parts.push(P(limb(a, b, .003, .003, 4), lace, { reg: 'cord' }));
        parts.push(P(limb(b, c, .003, .003, 4), lace, { reg: 'cord' }));
      }
    }
  }
  if (o.backOpening) {
    // 腹巻は背で引き合わせる（兵庫県立歴史博物館）。寸法と緒の配置は補完。
    // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_haramaki/
    // 割れ目の内側に鎧下を置き、胴の丸みに沿わせる。全て共有の胴へ結合する。
    const lining = new THREE.LatheGeometry(DO_PROF.map(([r, y]) => new THREE.Vector2(r * r0 - 0.008, y)), 2, Math.PI - 0.08, 0.16);
    lining.scale(1, 1, 0.8);
    parts.push(P(lining, under, { reg: 'cloth' }));
    for (const [r, y] of [DO_PROF[1], DO_PROF[3], DO_PROF[5]])
      parts.push(P(at(new THREE.BoxGeometry(0.045, 0.009, 0.009), 0, y, -(r * r0 + 0.009) * 0.8), laceColorAt(o.doLaceBands, y), { reg: 'cord' }));
  }
  if (rightOpening) {
    // 胴丸の右脇。細い合わせの内側へ鎧下を沿わせ、指定した威の色の引合緒を渡す。
    // 本編の右は +x。部品は胴へ結合し、近景・遠景とも作った形を共有する。
    const lining = new THREE.LatheGeometry(DO_PROF.map(([r, y]) => new THREE.Vector2(r * r0 - 0.008, y)), 2, Math.PI / 2 - 0.08, 0.16);
    lining.scale(1, 1, 0.8);
    parts.push(P(lining, under, { reg: 'cloth' }));
    for (const [r, y] of [DO_PROF[1], DO_PROF[3], DO_PROF[5]])
      parts.push(P(at(new THREE.BoxGeometry(0.009, 0.009, 0.036), r * r0 + 0.009, y, 0), lace, { reg: 'cord' }));
  }
  if (doStyle === 'sugake' && T === 0) {
    // 腹巻は背で引き合わせる：背の割れ目
    parts.push(P(at(new THREE.BoxGeometry(0.012, 0.5, 0.01), 0, 1.15, -0.2 * r0 * 0.8 - 0.005), 0x0e0c0a, { mk: MK.lac }));
  }
  if (o.domaru) {
    // 胴丸は着用者の右脇（-x）で引き合わせる。
    // 兵庫県立歴史博物館の形式解説を手掛かりにした補完。堀の伝来品の細部を断定しない。
    // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
    // 胴の曲面に沿う細い合わせ目と引合緒を、共有する胴の形へ一度だけ結合する。
    // 開いた札の内側には鎧下を置く。表面へ黒線を重ねるだけにしない。
    // https://www.meihaku.jp/armor-basic/armor-structural/
    const seamProfile = (domaruOpening ? DO_PROF : DO_PROF.slice(0, 6))
      .map(([r, y]) => new THREE.Vector2(r * r0 + (domaruOpening ? -.008 : .012), y));
    const seam = new THREE.LatheGeometry(seamProfile, 1,
      -Math.PI / 2 - (domaruOpening ? .05 : .018), domaruOpening ? .1 : .036);
    seam.scale(1, 1, .8);
    parts.push(P(seam, domaruOpening ? under : 0x171411,
      domaruOpening ? { mk: MK.cloth, reg: 'cloth' } : { mk: MK.lac, reg: 'lacq' }));
    for (const i of [1, 3, 4]) {
      const [r, y] = DO_PROF[i], radius = r * r0 + .016;
      const cord = new THREE.LatheGeometry([
        new THREE.Vector2(radius, y - .004), new THREE.Vector2(radius, y + .004),
      ], 4, -Math.PI / 2 - .13, .26);
      cord.scale(1, 1, .8);
      parts.push(P(cord, lace, { reg: 'cord' }));
      if (hi) {
        // 雑賀の堀の引合緒は、横線だけでなく右脇で結んだ形へ補う。
        // 名古屋刀剣博物館の引合緒解説を手掛かりとする復元案。
        // https://www.meihaku.jp/armor-basic/armor-structural/
        // 結び・垂れの寸法は未確認。共有する胴へ結合し、毎コマは作らない。
        const knot = [-radius - .006, y, 0];
        for (const sd of [-1, 1]) {
          parts.push(P(at(new THREE.TorusGeometry(.011, .003, 4, 8),
            knot[0], y + .003, sd * .012, 0, Math.PI / 2, sd * .25),
          lace, { reg: 'cord' }));
          parts.push(P(limb(knot, [-radius - .009, y - .038, sd * .018],
            .0035, .003, 4), lace, { reg: 'cord' }));
        }
      }
    }
  }
  if (hi && o.domaru && o.kurijime != null) {
    // 雑賀の堀の胴丸に、腰を締める繰締緒と右腰の繰締鐶を補う。
    // https://www.meihaku.jp/armor-basic/armor-structural/
    // https://www.meihaku.jp/curator-tweet/curator-tweet-armor2/
    // 色・寸法・結びは復元案。胴の共有形へ結合し、毎コマの処理は増やさない。
    const waistPoint = (angle, side) => {
      const y = .99 + side * .014 * Math.sin(angle);
      const r = (.195 + (.208 - .195) * (y - .95) / .1) * r0 + .018;
      return [Math.sin(angle) * r, y, Math.cos(angle) * r * .8];
    };
    for (const side of [-1, 1]) for (let j = 0; j < 24; j++) {
      parts.push(P(limb(waistPoint(j * Math.PI / 12, side),
        waistPoint((j + 1) * Math.PI / 12, side), .004, .004, 4),
      o.kurijime, { reg: 'cord' }));
    }
    const ringX = waistPoint(-Math.PI / 2, 1)[0];
    parts.push(P(at(new THREE.TorusGeometry(.019, .0035, 4, 10),
      ringX, .99, 0, 0, Math.PI / 2), brass, { mk: MK.gold }));
    const knot = waistPoint(0, 1);
    for (const side of [-1, 1]) {
      parts.push(P(at(new THREE.TorusGeometry(.015, .004, 4, 10),
        side * .015, knot[1], knot[2] + .004, 0, 0, side * .4),
      o.kurijime, { reg: 'cord' }));
      parts.push(P(limb(knot, [side * .022, .93, knot[2] + .006],
        .004, .0035, 4), o.kurijime, { reg: 'cord' }));
    }
  }
  if (hi && o.honkozane && doStyle === 'kebiki') {
    // 比叡山の信長・光秀の胴。毛引威を横帯だけにせず、小札の外を密に通る糸で補う。
    // 京都国立博物館・井伊美術館の解説を参考にした復元。列数・厚みは実測ではない。
    // https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
    // https://www.ii-museum.jp/blank-27
    // 生成時だけ既存の胴へ結合する。近い形と布材質を共用し、毎コマの処理は増やさない。
    const rAt = (y) => {
      for (let i = 1; i < DO_PROF.length; i++) {
        const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i];
        if (y <= yb) return ra + (rb - ra) * (y - ya) / (yb - ya);
      }
      return DO_PROF[DO_PROF.length - 1][0];
    };
    const nimai = o.doOpening === 'nimai', right = nimai || o.doOpening === 'right';
    const panels = nimai ? 2 : 1, gap = right ? 0.035 : 0;
    const span = (Math.PI * 2 - panels * gap) / panels, columns = 56 / panels;
    const pitch = span / columns, start = right ? Math.PI / 2 + gap / 2 : Math.PI;
    const step = (DO_PROF[DO_PROF.length - 1][1] - DO_PROF[0][1]) / 6;
    for (let row = 0; row < 6; row++) {
      const low = DO_PROF[0][1] + row * step;
      if (low >= 1.345) break; // 胸板には糸をかぶせない。
      // 胴の段の反りに沿わせ、小札の縁より外へ四ミリ出す。
      const points = [
        [low + 0.002, 0.0055], [low + step * 0.5, 0.0055 * 0.45],
        [Math.min(low + step - 0.003, 1.345), 0],
      ];
      if (row > 0) {
        // 胴の段の裾でも威糸を切らず、下の札の糸の上端へつなぐ。
        // 張り出す縁に沿って回し、板の中へ潜らせない。通し方と寸法は復元。
        // 同じ糸の断面だけ延ばし、形の共有・材質・描く回数は保つ。
        points.unshift([low - 0.003, 0], [low, 0]);
      }
      const profile = points.map(([y, edge]) => new THREE.Vector2((rAt(y) + edge) * r0 + 0.004, y));
      for (let panel = 0; panel < panels; panel++) for (let col = 0; col < columns; col++) {
        // 引き合わせと二枚胴の蝶番の隙間は渡らず、前後の板ごとに糸を収める。
        const a = start + panel * Math.PI + (col + 0.06) * pitch;
        const cord = new THREE.LatheGeometry(profile, 2, a, pitch * 0.88);
        cord.scale(1, 1, 0.8);
        parts.push(P(cord, lace, { reg: 'cord' }));
      }
    }
  } else if (doStyle === 'kebiki') {
    // 比叡山の信長・光秀の遠景でも、胴丸の右脇と二枚胴の左右の合わせ目を紐で塞がない。
    // 胴と同じ角度で前後に分ける。紐の位置・幅は復元で、近景の毛引威はそのまま保つ。
    // 周方向の分割数と共有材質を保ち、生成時に既存の胴へ結合する。
    const nimai = o.honkozane && o.doOpening === 'nimai';
    const right = nimai || (o.honkozane && o.doOpening === 'right');
    const panels = nimai ? 2 : 1, gap = right ? 0.035 : 0;
    const span = Math.PI * 2 / panels - gap;
    const start = right ? Math.PI / 2 + gap / 2 : 0;
    for (const [y, r] of [[1.0, 0.214], [1.16, 0.236]]) for (let panel = 0; panel < panels; panel++) {
      if (y === 1.0 && hi && o.domaru && o.kurijime != null) continue;
      const b = new THREE.CylinderGeometry(r * r0 + 0.002, r * r0 + 0.002, 0.012,
        (hi ? 28 : 12) / panels, 1, true, start + panel * Math.PI, span);
      b.scale(1, 1, 0.8);
      parts.push(P(at(b, 0, y, 0), laceColorAt(o.doLaceBands, y), { reg: 'cord' }));
    }
  }
  // 胸板（前の上の板）と金具。侍大将から金の覆輪
  {
    const mp = [[0.244, 1.35], [0.236, 1.38], [0.2, 1.425], [0.16, 1.448]].map(([r, y]) => new THREE.Vector2(r * r0 * 1.02, y));
    const mb = new THREE.LatheGeometry(mp, hi ? 10 : 4, -0.62, 1.24); mb.scale(1, 1, 0.8);
    parts.push(P(mb, plateArmor, { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac }));
    if (hi || takigawaTakahimo) {
      const rim = arcRing(0.16 * r0 * 1.03, 0.006, 1.24, 0, 10); rim.scale(1, 1, 0.8);
      parts.push(P(at(rim, 0, 1.448, 0), T >= 2 ? gold : T >= 1 ? brass : armor, { mk: T >= 1 ? MK.gold : MK.lac }));
    }
    if (hi || o.takahimo) {
      // 高紐の鐶（左右の胸の上）
      for (const sd of [-1, 1]) {
        parts.push(P(at(ball(0.016, 0.012, 0.006, 8, 5), sd * 0.09, 1.42, 0.165 * r0), T >= 1 ? brass : 0x3a3e42, { mk: T >= 1 ? MK.gold : MK.iron }));
        parts.push(P(at(new THREE.TorusGeometry(0.012, 0.0035, 4, 8), sd * 0.09, 1.405, 0.175 * r0, 0.3), T >= 1 ? brass : 0x3a3e42, { mk: MK.iron }));
        // 胸の鐶から垂れる高紐。近い形に束ね、布と鉄の厚みを輪郭にも残す。
        if (o.takahimo == null || o.takahimo === true) parts.push(P(limb([sd * 0.09, 1.405, 0.185 * r0], [sd * 0.105, 1.33, 0.207 * r0], 0.005, 0.004, 4), laceColorAt(o.doLaceBands, 1.37), { reg: 'cord' }));
        if (o.takahimo === true) {
          // 比叡山の信長・光秀：肩の先と胸板の鐶を結び、途中で緒を途切れさせない。
          // 名古屋刀剣博物館の構造解説による復元。通し位置・留め具の形と寸法は実測ではない。
          // 近遠とも生成時に胴へ結合し、共有形・既存の布と漆の材質を使い回す。
          const shoulder = [sd * 0.15, 1.444, 0.11 * r0 - 0.02];
          const turn = [sd * 0.125, 1.438, 0.17 * r0];
          const ring = [sd * 0.09, 1.405, 0.185 * r0];
          parts.push(P(limb(shoulder, turn, 0.005, 0.005, 4), lace, { reg: 'cord' }));
          parts.push(P(limb(turn, ring, 0.005, 0.005, 4), lace, { reg: 'cord' }));
          parts.push(P(limb([sd * 0.09 - 0.014, 1.405, 0.19 * r0], [sd * 0.09 + 0.014, 1.405, 0.19 * r0], 0.004, 0.004, 4), 0x2a1e16, { mk: MK.lac, reg: 'lacq' }));
        }
      }
    }
  }
  if (o.domaru && o.sode) {
    // 袖を着けた胴丸の杏葉は両胸へ下げる（兵庫県立歴史博物館の形式解説）。
    // 堀の伝来品の付属品は未確認。色・輪郭は黒漆の復元案で、金小札とは分ける。
    // 胴の共有形へ結合し、近景・遠景とも残す。毎コマの部品や描画は増やさない。
    const leaf = new THREE.Shape();
    leaf.moveTo(0, .015); leaf.lineTo(.022, 0); leaf.lineTo(.031, -.035);
    leaf.lineTo(.025, -.065); leaf.lineTo(0, -.088);
    leaf.lineTo(-.025, -.065); leaf.lineTo(-.031, -.035); leaf.lineTo(-.022, 0);
    leaf.closePath();
    const plate = new THREE.ExtrudeGeometry(leaf, { depth: .006, bevelEnabled: false, steps: 1 });
    for (const sd of [-1, 1]) {
      const x = sd * .09, z = .216 * r0;
      if (o.goldKozane) {
        // 雑賀の堀の杏葉は胸の鐶でなく肩上から吊り、高紐を覆う位置へ戻す。
        // 遠い姿でも吊り元と胸に沿う位置を保ち、距離で胸の下へ飛ぶのを防ぐ。
        // https://www.meihaku.jp/armor-basic/armor-structural/
        // 胸の曲面に沿わせ、上端が胸板に埋まり、下端が宙に浮くのを防ぐ。
        // 色・寸法は復元案。共有する胴へ結合し、毎コマの処理は増やさない。
        const g = plate.clone(), p = g.attributes.position;
        const front = (px, py) => {
          let radius = DO_PROF[DO_PROF.length - 1][0] * r0;
          for (let i = 1; i < DO_PROF.length; i++) {
            const [ra, ya] = DO_PROF[i - 1], [rb, yb] = DO_PROF[i];
            if (py > yb) continue;
            radius = (ra + (rb - ra) * (py - ya) / (yb - ya)) * r0;
            break;
          }
          return Math.sqrt(Math.max(0, radius * radius - px * px)) * .8 + .015;
        };
        for (let i = 0; i < p.count; i++) {
          const px = sd * (.12 + p.getX(i)), py = 1.44 + p.getY(i);
          p.setXYZ(i, px, py, front(px, py) + p.getZ(i));
        }
        g.computeVertexNormals();
        parts.push(P(g, plateArmor, { mk: MK.lac, reg: 'lacq' }));
        parts.push(P(limb([sd * .145, 1.445, .105 * r0],
          [sd * .12, 1.455, front(sd * .12, 1.455) + .003], .004, .004, 4),
        lace, { reg: 'cord' }));
      } else {
        parts.push(P(at(plate.clone(), x, 1.37, z, 0, sd * .12, sd * .08), plateArmor, { mk: MK.lac, reg: 'lacq' }));
        parts.push(P(limb([x, 1.405, .175 * r0], [x, 1.383, z + .003], .004, .004, 4), lace, { reg: 'cord' }));
      }
    }
    plate.dispose();
  }
  // 家紋（足軽の御貸具足は胴の前に大きく）
  const mr = monReg(o.mon);
  if (mr && T === 0) {
    const mp = DO_PROF.slice(3, 6).map(([r, y]) => new THREE.Vector2(r * r0 * (hi && doStyle === 'okegawa' ? 1.05 : 1.03), y));
    const dec = new THREE.LatheGeometry(mp, hi ? 6 : 3, -0.42, 0.84); dec.scale(1, 1, 0.8);
    parts.push(P(dec, armor, { mk: MK.lac, reg: mr, c2: o.monCol || 0xb08a3a, mk2: MK.gold }));
  }
  }
  // 草摺：板を垂らし、裾へ広げる。足軽は五間、侍から七間、胴丸は八間
  parts = PT.hips;
  if (!shared.hips) {
    const np = kusazuriCount(o);
    // 桶側の胴の草摺は、鉄か革の板を五段、素懸で威す（胴の縦の板の絵は使わない）
    const kbase = doStyle === 'okegawa' || doStyle === 'hotoke' || doStyle === 'katahada' ? 'sugake' : doStyle;
    // 高画質の堀の浅葱糸威は、汎用の色々威へ替えず、毛引威の補完へ渡す。
    const kreg = T >= 1 && !o.doLaceBands && o.kusazuriColor == null && !o.takedaRed && !(hi && o.goldKozane) ? kbase + 'Iro' : kbase;
    // 手取川の利家は五段の板と白糸の段をそろえる。共通の八段の絵を使い回す。
    const krv = o.kusazuriLaceRows != null ? [0, o.kusazuriLaceRows / 8]
      : doStyle === 'okegawa' ? [0, 0.625] : doStyle === 'sugake' ? [0, 0.5] : [0, 0.625];
    // 足軽の近くの形：五段の板の下の縁がそれぞれ外へ出る（一枚の板に縞を描いた形に見せない）。上の端は 0.884 まで（上は揺糸の帯。板を揺らす骨の見分けを崩さない）
    // 足軽の近くの形は、上の端を胴の裾の内へ入れ（腰で胴の外へ張り出さない）、裾へ広がる板を少し長く
    const ash = hi && T === 0;
    // 伝来具足の実測長を指定した時だけ裾を延ばす。上端の段の隙間三ミリを除いた板の長さ。
    const measuredLength = o.kusazuriLength;
    // 軽い姿も腰幅を胴の内へ収める。切り替えで腰が張り出す人形体形を防ぐ。
    const KY1 = T === 0 ? 0.872 : 0.884, KY0 = measuredLength ? KY1 - 0.003 - measuredLength : T === 0 ? 0.6 : 0.63;
    const KR0 = T === 0 ? 0.262 : 0.27, KR1 = T === 0 ? 0.18 : 0.202;
    const kr = (y) => (KR0 + (KR1 - KR0) * (y - KY0) / (KY1 - KY0)) * r0;
    let kprof = null;
    // 近くの形は、侍の草摺も段の板に（一枚の板に縞を描いた形にしない）。
    // 比叡山の信長・光秀は遠景でも同じ五段の裾と重なりを保つ。
    // 本小札の細部は近景だけ。生成時に共有形へまとめ、材質や毎コマの処理は増やさない。
    // 比叡山の勝家・信盛も五段を保つ。小札の細分は増やさず、遠景用の少ない面で段を付ける。
    if (hi || takigawaKusazuri || o.honkozane || o.kusazuriStepped) {
      kprof = [];
      const H = (KY1 - KY0) / 5, t = ash ? 0.007 : 0.006;
      for (let j = 0; j < 5; j++) { const ya = KY0 + j * H, yb = ya + H; kprof.push([kr(ya), ya], [kr(ya) + t, ya + 0.002], [kr(ya + H * 0.5) + t * 0.45, ya + H * 0.5], [kr(yb - 0.003), yb - 0.003]); }
      kprof = kprof.map(([r, y]) => new THREE.Vector2(r, y));
    }
    for (let k = 0; k < np; k++) {
      const a = (k / np) * Math.PI * 2 + (np === 5 ? Math.PI / 5 : 0);
      const L = (Math.PI * 2 / np) * 0.93;
      let kz;
      if (kprof) {
        // 近景の草摺は腿に沿う丸みを残す。段の数は増やさず、共有する形の横方向だけ滑らかにする。
        // 比叡山の信長・光秀の本小札は、草摺にも札を重ねた縁を残す。
        // 札幅約一・八センチ・重ね代二ミリは描画上の復元。生成時だけ細分し、共有形へまとめる。
        const kozane = hi && o.honkozane;
        const segments = kozane ? Math.max(7, Math.ceil(L * KR0 * r0 / 0.018)) * 3 : hi ? 7 : 3;
        kz = new THREE.LatheGeometry(kprof, segments, a + Math.PI - L / 2, L);
        const p = kz.attributes.position, uv = kz.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          uv.setY(i, (p.getY(i) - KY0) / (KY1 - KY0));
          if (!kozane) continue;
          const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
          const phase = Math.round(uv.getX(i) * segments) % 3;
          const overlap = phase * 0.001;
          p.setX(i, x * (1 + overlap / r)); p.setZ(i, z * (1 + overlap / r));
        }
        if (kozane) kz.computeVertexNormals();
        kz.scale(1, 1, 0.86);
      } else { kz = arcCyl(KR1 * r0, KR0 * r0, KY1 - KY0, hi ? 3 : 2, L, a + Math.PI); kz.scale(1, 1, 0.86); at(kz, 0, (KY0 + KY1) * 0.5, 0); }
      if (takigawaKusazuri) {
        // 一益の草摺：跳ね上がった板を裏から見ても消さず、薄い札の厚みを補う。
        // 厚み・裏の仕上げは復元案。七間の分割と骨の割り当てを保ち、腰の共用形へ結合する。
        const inside = kz.clone(), outer = kz.attributes.position, inner = inside.attributes.position;
        for (let i = 0; i < inner.count; i++) {
          const x = inner.getX(i), z = inner.getZ(i) / .86;
          const scale = 1 - .002 / Math.hypot(x, z);
          inner.setX(i, x * scale); inner.setZ(i, z * scale * .86);
        }
        const index = inside.index.array;
        for (let i = 0; i < index.length; i += 3) {
          const t = index[i]; index[i] = index[i + 2]; index[i + 2] = t;
        }
        inside.computeVertexNormals();
        // 格子の頂点順に依存せず、表面の外周だけを拾って表裏をつなぐ。
        const boundary = new Map(), indices = kz.index.array;
        for (let i = 0; i < indices.length; i += 3) for (let j = 0; j < 3; j++) {
          const a = indices[i + j], b = indices[i + (j + 1) % 3];
          const key = Math.min(a, b) + '|' + Math.max(a, b);
          if (boundary.has(key)) boundary.delete(key); else boundary.set(key, [a, b]);
        }
        const positions = [];
        for (const [a, b] of boundary.values()) {
          for (const [p, i] of [[outer, b], [outer, a], [inner, a], [outer, b], [inner, a], [inner, b]]) {
            positions.push(p.getX(i), p.getY(i), p.getZ(i));
          }
        }
        const edging = new THREE.BufferGeometry();
        edging.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        edging.computeVertexNormals();
        parts.push(P(inside, armor, { mk: MK.lac, reg: 'lacq' }),
          P(edging, armor, { mk: MK.lac, reg: 'lacq' }));
      }
      parts.push(P(kz, kusazuriColor, { mk: kusazuriMat, reg: kreg, c2: lace, mk2: MK.cloth, rv: krv, ru: [0, 0.2] }));
      if (takigawaKusazuri) {
        // 大滝寺の一益：五段分の模様には含まれない、草摺の裾板の菱縫を補う。
        // 福井市立郷土歴史博物館「甲冑の美」の草摺の補強・装飾の解説を参考にする。
        // https://www.history.museum.city.fukui.fukui.jp/tenji/kaisetsusheets/78.pdf
        // 黒い緒の数・寸法は復元案。高画質の近景・遠景で腰の形へ結合・保存する。
        const start = a + Math.PI - L / 2, step = L / 7;
        const point = (angle, y) => {
          // 板は七分割の面。実際の段の断面と面へ沿わせ、円周上に糸を浮かせない。
          let i = 1;
          while (i < kprof.length - 1 && kprof[i].y < y) i++;
          const lo = kprof[i - 1], up = kprof[i];
          const radius = lo.x + (up.x - lo.x) * (y - lo.y) / (up.y - lo.y);
          const mid = start + (Math.floor((angle - start) / step) + .5) * step;
          const r = radius * Math.cos(step / 2) / Math.cos(angle - mid) + .002;
          return [Math.sin(angle) * r, y, Math.cos(angle) * r * .86];
        };
        // 草摺の小札板の両端にも耳糸を通す。出典は上記の甲冑解説。
        // 段板の折り返しに沿って曲げ、板を貫く直線や宙に浮く緒にしない。
        // 色・通し方・太さは復元案。高画質だけで腰の共有形へ結合する。
        for (const edge of [-1, 1]) {
          const angle = start + L / 2 + edge * (L / 2 - .018);
          for (let j = 1; j < kprof.length; j++) {
            parts.push(P(limb(point(angle, kprof[j - 1].y), point(angle, kprof[j].y),
              .0025, .0025, 3), lace, { mk: MK.cloth, reg: 'cord' }));
          }
        }
        for (let j = 1; j <= 5; j++) {
          const angle = start + (j + .5) * step;
          for (const cross of [-1, 1]) {
            parts.push(P(limb(point(angle - step * .32, KY0 + .026 - cross * .01),
              point(angle + step * .32, KY0 + .026 + cross * .01), .0025, .0025, 4),
            lace, { mk: MK.cloth, reg: 'cord' }));
          }
        }
      }
      if (hi && o.honkozane && doStyle === 'kebiki') {
        // 比叡山の信長・光秀の草摺。毛引威を絵だけにせず、小札の反りに沿う糸も補う。
        // 光秀の胴・草摺を本小札毛引威とする井伊美術館の解説などを参考にした復元。
        // https://www.ii-museum.jp/blank-27
        // 列数・太さ・通し方は実測ではない。札ごとに一列とし、隣の草摺の間には渡さない。
        // 生成時に既存の草摺へ結合し、共有形・布材質・揺れる骨をそのまま使う。
        const columns = Math.max(7, Math.ceil(L * KR0 * r0 / 0.018));
        const pitch = L / columns, H = (KY1 - KY0) / 5;
        for (let row = 0; row < 5; row++) {
          const low = KY0 + row * H;
          // 上の段の裾を回り、下の段の糸の上端へつなぐ。五段を別々の縞にしない。
          // 糸の断面だけ延ばし、形の数・材質・揺れる骨は増やさない。
          const points = [];
          if (row > 0) points.push(
            new THREE.Vector2(kr(low - 0.003) + 0.004, low - 0.003),
            new THREE.Vector2(kr(low + 0.002) + 0.016, low - 0.002),
          );
          points.push(
            new THREE.Vector2(kr(low + 0.002) + 0.016, low + 0.002),
            new THREE.Vector2(kr(low + H * 0.5) + 0.0094, low + H * 0.5),
            new THREE.Vector2(kr(low + H - 0.003) + 0.004, low + H - 0.003),
          );
          for (let col = 0; col < columns; col++) {
            const cord = new THREE.LatheGeometry(points, 2, a + Math.PI - L / 2 + (col + 0.06) * pitch, pitch * 0.88);
            cord.scale(1, 1, 0.86);
            parts.push(P(cord, lace, { reg: 'cord' }));
          }
        }
      }
      if (hi && o.domaru && o.goldKozane && kreg === 'kebiki') {
        // 雑賀の堀の草摺にも、袖と同じ浅葱の毛引威を形で補う。
        // 名古屋刀剣博物館の毛引威の説明を構造の参考とする。
        // https://www.meihaku.jp/armor-basic/armor-highlight/
        // 本数・寸法は復元案。薄い帯を段の面へ沿わせ、腰の共有形へ結合する。
        // 各間の既存の骨で揺らすため、描画回数と毎コマの処理は増えない。
        const H = (KY1 - KY0) / 5, count = 12, pitch = L * .92 / count;
        for (let j = 0; j < 5; j++) {
          const y = KY0 + j * H;
          for (let n = 0; n < count; n++) {
            const center = a + Math.PI + (n - (count - 1) / 2) * pitch;
            const cord = surf(1, 1, (u, v) => {
              const th = center + (u - .5) * pitch * .78;
              const py = y + .002 + v * (H - .005);
              const r = kr(py) + .016 - v * .012;
              return [Math.sin(th) * r, py, Math.cos(th) * r * .86];
            });
            parts.push(P(cord, lace, { mk: MK.cloth, reg: 'cord' }));
          }
        }
      }
      if (hi && o.kusazuriMimiito != null) {
        // 草摺の両縁を通る耳糸。雑賀の堀は浅葱、佐久間は茶で補う復元案。
        // 広島県「銀小札白糸威胴丸具足」の草摺の耳糸を構造の手掛かりとする。
        // https://www.pref.hiroshima.lg.jp/uploaded/attachment/655530.pdf
        // 五段の小口に沿わせ、各間の共有形へ結合する。既存の骨で揺らす。
        const H = (KY1 - KY0) / 5;
        for (const sd of [-1, 1]) {
          const th = a + Math.PI + sd * (L / 2 - .012);
          const point = (y, offset) => {
            const r = kr(y) + offset;
            return [Math.sin(th) * r, y, Math.cos(th) * r * .86];
          };
          for (let j = 0; j < 5; j++) {
            const y = KY0 + j * H;
            parts.push(P(limb(point(y + .002, .016), point(y + H - .003, .004),
              .0035, .0035, 4), o.kusazuriMimiito, { reg: 'cord' }));
          }
        }
      }
      if (hi && o.kusazuriHishinui != null) {
        // 雑賀の堀と佐久間の草摺の裾板へ菱縫を補う。色・針目・寸法は復元案。
        // 一乗谷朝倉氏遺跡発掘調査報告二十、草摺四一〇（最下段）の記述を参照。
        // https://sitereports.nabunken.go.jp/files/attach/64/64522/140420_1_特別史跡一乗谷朝倉氏遺跡発掘調査報告.pdf
        // 板の曲面へ沿わせて共有形へ結合し、既存の草摺の骨で一緒に揺らす。
        const H = (KY1 - KY0) / 5, y = KY0 + H * .5;
        const point = (th, py) => {
          const r = kr(py) + .012;
          return [Math.sin(th) * r, py, Math.cos(th) * r * .86];
        };
        for (let j = 0; j < 4; j++) {
          const th = a + Math.PI + (j - 1.5) * L / 4;
          for (const dir of [-1, 1]) parts.push(P(limb(
            point(th - dir * L / 12, y - .016),
            point(th + dir * L / 12, y + .016), .0025, .0025, 4),
          o.kusazuriHishinui, { reg: 'cord' }));
        }
      }
      if (hi && o.kusazuriSugake) {
        // 雑賀の佐久間の草摺も、間を空けた二筋ずつの糸で段の板をつなぐ。
        // 文化遺産オンライン「金小札赤糸素懸威腹巻」の二筋ずつ綴る構造を参考とする。
        // https://api.online.bunka.go.jp/heritages/detail/575596
        // 既存の素懸威を形で補う復元案。本人の所用品や当日の着用は未確認。
        // 板の傾斜に沿わせて共有する腰へ結合し、各間とともに揺らす。
        const H = (KY1 - KY0) / 5;
        for (const offset of [-.27, -.19, .19, .27]) {
          const th = a + Math.PI + offset * L;
          const point = (y, extra) => {
            const r = kr(y) + extra;
            return [Math.sin(th) * r, y, Math.cos(th) * r * .86];
          };
          for (let j = 0; j < 5; j++) {
            const y = KY0 + j * H;
            parts.push(P(limb(point(y + .002, .016), point(y + H - .003, .004),
              .003, .003, 4), lace, { reg: 'cord' }));
          }
        }
      }
      if (o.kusazuriFur) {
        // 伝長近所用具足の裾板熊毛植毛。最下段だけを覆い、上四段の金箔と威糸は見せる。
        // 一枚ごとに薄い毛の帯を結合し、既存の草摺の骨で揺らす。毛一本ずつの物体は作らない。
        const seg = hi ? 8 : 4;
        const fur = arcCyl(kr(KY0 + 0.05) + 0.007, kr(KY0) + 0.012, 0.07, seg, L, a + Math.PI);
        const p = fur.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) {
          // 毛先の丈を交互にずらす。継ぎ目の両端は短くして隣の板をつながない。
          const j = i % (seg + 1);
          p.setY(i, p.getY(i) - (j > 0 && j < seg && j % 2 ? 0.012 : 0));
        }
        fur.computeVertexNormals();
        fur.scale(1, 1, 0.86); at(fur, 0, KY0 + 0.015, 0);
        parts.push(P(fur, o.kusazuriFur, { mk: MK.cloth, reg: 'fur' }));
      }
      // 足軽：板の段をつなぐ二列の素懸の糸（段ごとに板の外の面に沿わせる）
      if (ash) {
        const H = (KY1 - KY0) / 5, c = a + Math.PI;
        for (let j = 0; j < 5; j++) for (const sd of [-1, 1]) {
          const th = c + sd * L * 0.2, y = KY0 + (j + 0.55) * H, r = kr(y) + 0.008;
          parts.push(P(at(new THREE.BoxGeometry(0.006, H * 0.8, 0.004), Math.sin(th) * r, y, Math.cos(th) * r * 0.86, 0, th, 0), lace, { reg: 'cord' }));
        }
      }
    }
    // 揺糸（胴と草摺をつなぐ糸）
    if (o.honkozane) {
      // 比叡山の信長・光秀。独立して揺れる草摺を、一周つながる布帯で塞がない。
      // 遠景も同じ揺糸を保ち、距離の切替で草摺の間が布帯に埋まるのを防ぐ。
      // 二将の腰の共有形を作る時だけ結合し、毎コマの処理や描画の束は増やさない。
      // 本小札の毛引威を参考にした復元。糸数・長さ・通し方は実測によらない。
      // 草摺と同じ角度・幅に収め、隣の間へ渡さない。生成時だけ腰の共有形へ結合する。
      // https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
      // https://www.ii-museum.jp/blank-27
      const span = Math.PI * 2 / np * 0.97;
      const columns = Math.max(7, Math.ceil(span * KR0 * r0 / 0.018)), pitch = span / columns;
      const points = [new THREE.Vector2(0.214 * r0, 0.8825), new THREE.Vector2(0.203 * r0, 0.9175)];
      for (let k = 0; k < np; k++) for (let col = 0; col < columns; col++) {
        const start = k / np * Math.PI * 2 + Math.PI - span / 2 + (col + 0.06) * pitch;
        const cord = new THREE.LatheGeometry(points, 2, start, pitch * 0.88);
        cord.scale(1, 1, 0.84);
        parts.push(P(cord, lace, { reg: 'cord' }));
      }
    } else if (hi && (o.yurugi || o.domaru && o.goldKozane)) {
      // 雑賀の堀と佐久間は、腰を一続きの筒で塞がず、各間を吊る糸で補う。
      // 名古屋刀剣博物館の構造解説：https://www.meihaku.jp/armor-basic/armor-structural/
      // 本数・長さ・色は復元案。共有する腰の形へ結合し、材質や描画回数は増やさない。
      const step = Math.PI * 2 / np;
      for (let k = 0; k < np; k++) for (let j = 0; j < 4; j++) {
        const a = k * step + Math.PI + (j - 1.5) * step * .2;
        parts.push(P(limb(
          [Math.sin(a) * .203 * r0, .9175, Math.cos(a) * .203 * r0 * .84],
          [Math.sin(a) * .214 * r0, KY1, Math.cos(a) * .214 * r0 * .86],
          .0035, .0035, 4), lace, { reg: 'cord' }));
      }
    } else {
      const yb = hi && T === 0 ? new THREE.CylinderGeometry(0.178 * r0, 0.18 * r0, 0.035, 20, 1, true) : new THREE.CylinderGeometry(0.203 * r0, 0.214 * r0, 0.035, hi ? 28 : 10, 1, true); yb.scale(1, 1, 0.84);
      parts.push(P(at(yb, 0, 0.9, 0), lace, { reg: 'kebiki', rv: [0.3, 0.36], ru: [0, 1] }));
    }
  }
  parts = PT.torso;
  if (!shared.torso) {
  // 肩上（わたがみ）と小鰭
  for (const sd of [1, -1]) {
    parts.push(P(at(new THREE.BoxGeometry(0.07, 0.018, 0.22 * r0), sd * 0.15, 1.435, -0.02), o.goldKozane ? plateArmor : T >= 1 ? 0x2a1e16 : armor, { mk: MK.lac, reg: 'lacq' }));
    if ((hi && !o.takahimo) || takigawaTakahimo) parts.push(P(at(new THREE.BoxGeometry(0.078, 0.01, 0.01), sd * 0.145, 1.452, 0.09), lace, { reg: 'cord' }));
    if (takigawaTakahimo) {
      // 大滝寺の一益：肩上と胸板の鐶を高紐でつなぐ。垂れた端だけにしない。
      // 刀剣ワールド桑名・多度別館「甲冑の部位解説」の肩上・高紐を参考にした復元。
      // https://www.touken-collection-kuwana.jp/armor-basic/kattyu-bui/
      // 色・通し方・寸法は所用品の再現ではない。胴へ結合・保存し、近景・遠景で共用する。
      for (const side of [-1, 1]) {
        const top = [sd * .145 + side * .008, 1.452, .09];
        const bend = [sd * .115 + side * .006, 1.44, .15 * r0];
        const ring = [sd * .09 + side * .006, 1.405, .185 * r0];
        parts.push(P(limb(top, bend, .004, .004, 4), lace, { reg: 'cord' }),
          P(limb(bend, ring, .004, .004, 4), lace, { reg: 'cord' }));
      }
    }
    // 小鰭：肩の外に寝かせて付ける（首の横に立てると顔にかぶる）
    if (T >= 1 && hi) parts.push(P(at(arcCyl(0.075, 0.085, 0.04, 4, 1.2, sd * Math.PI / 2), sd * 0.215, 1.41, -0.01, 0, 0, sd * -1.1), plateArmor, { mk: MK.lac, reg: 'lacq' }));
  }
  if (o.domaru) {
    // 胴丸の背の上端は、小札ではなく押付板で肩上を受ける。
    // 名古屋刀剣博物館の構造解説：https://www.meihaku.jp/armor-basic/armor-structural/
    // 雑賀の堀の所用品の細部は未確認。胸板と同じ黒漆で補う復元案。
    // 胴の曲面に沿わせ、共有する胴へ結合する。総角付の鐶より上に収める。
    const profile = DO_PROF.slice(5).map(([r, y]) => new THREE.Vector2(r * r0 + .009, y));
    const backPlate = new THREE.LatheGeometry(profile, hi ? 10 : 4, Math.PI - .8, 1.6);
    backPlate.scale(1, 1, .8);
    parts.push(P(backPlate, plateArmor, { mk: MK.lac, reg: 'lacq' }));
  }
  if (hi && o.domaru && o.wakiita) {
    // 胴丸の両脇上端を守る脇板。雑賀の堀だけに黒漆で補う復元案。
    // 名古屋刀剣博物館：https://www.meihaku.jp/armor-basic/armor-structural/
    // 脇の中央を低くし、胸板・押付板と同じ一枚板の材質で胴へ結合する。
    // 作るのは共有形の初回だけ。兵数・動き・描画回数は変えない。
    for (const sd of [-1, 1]) {
      const start = sd * Math.PI / 2 - .46;
      const plate = new THREE.LatheGeometry(DO_PROF.slice(4, 6).map(([r, y]) =>
        new THREE.Vector2(r * r0 + .012, y)), 8, start, .92);
      const p = plate.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < 1.34) continue;
        const angle = Math.atan2(p.getX(i), p.getZ(i));
        const t = Math.max(0, Math.min(1, (angle - start) / .92));
        p.setY(i, p.getY(i) - .035 * Math.sin(t * Math.PI));
      }
      plate.scale(1, 1, .8); plate.computeVertexNormals();
      parts.push(P(plate, plateArmor, { mk: MK.lac, reg: 'lacq' }));
    }
  }
  if (hi && typeof o.takahimo === 'number') {
    // 胸板と肩上を高紐でつなぐ（名古屋刀剣博物館の構造解説）。
    // https://www.meihaku.jp/armor-basic/armor-structural/
    // 雑賀の堀と佐久間だけに補う。色・寸法・結び方は伝来品の再現ではなく復元案。
    // 胴の共有形へ結合し、胸板・鐶と同じ変形で収める。材質・描画回数は増やさない。
    for (const sd of [-1, 1]) {
      const chest = [sd * .09, 1.405, .175 * r0];
      const knot = [sd * .145, 1.445, .105 * r0];
      parts.push(P(limb(chest, knot, .005, .005, 4), o.takahimo, { reg: 'cord' }));
      parts.push(P(limb(knot, [sd * .15, 1.454, .04 * r0], .005, .005, 4),
        o.takahimo, { reg: 'cord' }));
      for (const side of [-1, 1]) {
        parts.push(P(at(new THREE.TorusGeometry(.012, .004, 4, 8),
          knot[0] + side * .012, knot[1], knot[2] + .006, -.45, 0, side * .4),
        o.takahimo, { reg: 'cord' }));
        parts.push(P(limb(knot,
          [knot[0] + side * .018, 1.411, knot[2] + .02], .004, .004, 4),
        o.takahimo, { reg: 'cord' }));
      }
    }
  }
  // 背の総角（あげまき）：侍から
  if (T >= 1 && (hi || o.sodeStyle === 'osode')) {
    // 雑賀の堀と佐久間では、従来の位置だと総角が背の小札に埋まる。
    // 胴の最も張る段とその厚みより外へ出し、垂れは背の曲面へ沿わせる。
    // 形は一度だけ胴へ結合し、既存の糸・金具の材質を共用する。
    const supportedKnot = o.domaru || o.agemaki;
    const knotZ = supportedKnot ? -(0.248 * r0 * 0.8 + 0.018) : -0.198 * r0 * 0.8 - 0.012;
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.TorusGeometry(0.024, 0.007, 4, 10), sd * 0.024, 1.24, knotZ, 0, 0, sd * 0.6), lace, { reg: 'cord' }));
    if (supportedKnot) {
      // 総角は背の鐶から下げる。名古屋刀剣博物館の部位解説を参照。
      // https://www.meihaku.jp/armor-basic/armor-structural/
      // 二人の所用品の意匠・緒の色は未確認。簡素な金具と各人の威糸で補う。
      parts.push(P(at(new THREE.TorusGeometry(0.012, 0.0035, 4, 8), 0, 1.32, knotZ), brass, { mk: MK.gold }));
      parts.push(P(limb([0, 1.309, knotZ], [0, 1.24, knotZ], 0.005, 0.005, 4), lace, { reg: 'cord' }));
      for (const sd of [-1, 1]) {
        parts.push(P(limb([sd * 0.012, 1.24, knotZ], [sd * 0.018, 1.18, -0.232 * r0 * 0.8 - 0.018], 0.006, 0.006, 4), lace, { reg: 'cord' }));
        parts.push(P(limb([sd * 0.018, 1.18, -0.232 * r0 * 0.8 - 0.018], [sd * 0.027, 1.11, -0.224 * r0 * 0.8 - 0.018], 0.006, 0.006, 4), lace, { reg: 'cord' }));
      }
    } else {
      for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.014, 0.12, 0.006), sd * 0.018, 1.17, -0.2 * r0 * 0.8 - 0.012, 0, 0, sd * 0.15), lace, { reg: 'cord' }));
    }
  }
  }
  // 袖：肩から下げた板の段（侍から）。足軽大将から冠板に金具
  for (const sd of [1, -1]) {
    if (T === 0 || !o.sode || shared[sd > 0 ? 'sodeP' : 'sodeN']) continue;
    parts = sd > 0 ? PT.sodeP : PT.sodeN;
    if (o.sodeStyle === 'osode') {
      // 伝信長所用具足の大袖。腕を包む壺袖でなく、肩から吊った幅広い七段の板。
      // 長さは京都国立博物館の解説による。幅・厚み・反りと吊るす位置は復元。
      // 近景も遠景も同じ輪郭を使い、既存の袖の束と揺れる骨へまとめる。
      // 冠板も含めた全長を三十六・四センチにする。重ね代で裾を延ばさない。
      const rows = 7, height = 0.364, crownTop = 1.426, crownHeight = 0.026;
      const panelTop = crownTop - crownHeight, bottom = crownTop - height;
      const step = (panelTop - bottom) / rows;
      // 大袖を平らな箱にせず、幅の中央が外へ張る緩い反りを付ける復元案。
      // 反り一・二センチは実測ではない。冠板・威糸も同じ面へ沿わせて結合する。
      const bow = (g, width, z0 = 0) => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const z = (p.getZ(i) + z0) * 2 / width;
          p.setX(i, p.getX(i) + sd * 0.012 * (1 - z * z));
        }
        g.computeVertexNormals();
        return g;
      };
      for (let j = 0; j < rows; j++) {
        const top = Math.min(crownTop, panelTop - j * step + 0.003);
        const low = Math.max(bottom, panelTop - (j + 1) * step - 0.003);
        // 本小札の大袖を一枚板にしない。外面に札の重なりを刻み、既存の袖へ結合する。
        // 一段十六枚・重ね代二ミリは復元。近景だけ細分し、遠景の輪郭と全長は保つ。
        const width = 0.27 + j * 0.002, segments = hi && o.honkozane ? 48 : 8;
        const g = new THREE.BoxGeometry(0.018, top - low, width, 1, 1, segments);
        if (segments > 1) {
          const p = g.attributes.position;
          for (let i = 0; i < p.count; i++) {
            if (!hi || !o.honkozane || sd * p.getX(i) < 0.008) continue;
            const phase = Math.round((p.getZ(i) / width + 0.5) * segments) % 3;
            p.setX(i, p.getX(i) + sd * phase * 0.001);
          }
          g.computeVertexNormals();
        }
        parts.push(P(at(bow(g, width), sd * (0.315 + j * 0.005), (top + low) / 2, 0), armor,
          { mk: MK.lac, reg: 'kebiki', c2: lace, mk2: MK.cloth, rv: [(rows - 1 - j) / 8, (rows - j) / 8], ru: [0, 0.27] }));
        if (hi && o.honkozane) {
          // 京都国立博物館が記す、紺糸を隙間なく通す毛引威。
          // https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
          // 小札の外面で段をつなぐ糸の厚みも示す。列数・太さ・通し方は復元。
          // 近い大袖だけ生成時に結合し、既存の布材質と袖の骨を共用する。
          const pitch = width / 16;
          for (let k = 0; k < 16; k++) {
            const cord = new THREE.BoxGeometry(0.004, top - low + 0.002, pitch * 0.88);
            parts.push(P(at(bow(cord, width, -width / 2 + (k + 0.5) * pitch), sd * (0.329 + j * 0.005), (top + low) / 2,
              -width / 2 + (k + 0.5) * pitch), lace, { reg: 'cord' }));
            if (j > 0) {
              // 段が外へ張り出す所でも、威糸を上の札から下の札へつなぐ。
              // 袖幅の広がりにも合わせ、上下の列の端へ結ぶ。寸法・通し方は復元。
              // 生成時に同じ袖へ結合し、共有形と布材質を使い回す。
              const prevZ = -(width - 0.002) / 2 + (k + 0.5) * (width - 0.002) / 16;
              const z = -width / 2 + (k + 0.5) * pitch;
              const seam = panelTop - j * step;
              const bridge = new THREE.BoxGeometry(0.004, 0.008, pitch * 0.88);
              const p = bridge.attributes.position;
              for (let i = 0; i < p.count; i++) {
                const t = p.getY(i) / 0.008;
                p.setX(i, p.getX(i) - sd * 0.005 * t);
                p.setZ(i, p.getZ(i) + (prevZ - z) * t);
              }
              bridge.computeVertexNormals();
              parts.push(P(at(bow(bridge, width - 0.001, (prevZ + z) / 2), sd * (0.329 + (j - 0.5) * 0.005), seam,
                (prevZ + z) / 2), lace, { reg: 'cord' }));
            }
          }
        }
      }
      parts.push(P(at(bow(new THREE.BoxGeometry(0.022, crownHeight, 0.28, 1, 1, 8), 0.28), sd * 0.315, crownTop - crownHeight / 2, 0), armor, { mk: MK.lac, reg: 'lacq' }));
      // 肩上から冠板へ渡す紐。反りで外へ張る板の上端までつなぎ、途中で浮かせない。
      // 通し位置は実測ではない復元。近遠とも生成時に既存の袖へ結合して共有する。
      for (const dz of [-0.08, 0.08]) {
        const crownX = 0.315 + 0.012 * (1 - (2 * dz / 0.28) ** 2);
        parts.push(P(limb([sd * 0.17, 1.441, dz], [sd * crownX, crownTop, dz], 0.0045, 0.0045, 4), lace, { reg: 'cord' }));
      }
      // 背の総角から大袖の後ろへ渡す掛緒。肩の紐だけで袖を浮かせない。
      // https://www.meihaku.jp/art-knowledge/yoroichakuyou-shidai/
      // 一般的な結着構造による復元。寸法と通し位置は伝来品の実測ではない。
      // 生成時に袖の共有形へまとめ、近遠とも既存の布材質と袖の骨を使う。
      const back = [sd * 0.024, 1.24, -0.198 * r0 * 0.8 - 0.012];
      const turn = [sd * 0.18, 1.32, -0.19];
      const crown = [sd * (0.315 + 0.012 * (1 - (0.16 / 0.28) ** 2)), crownTop - crownHeight / 2, -0.08];
      parts.push(P(limb(back, turn, 0.004, 0.004, 4), lace, { reg: 'cord' }));
      parts.push(P(limb(turn, crown, 0.004, 0.004, 4), lace, { reg: 'cord' }));
      continue;
    }
    const rowsN = T >= 2 ? 6 : 5;
    if (o.domaru) {
      // 上級武者の胴丸は大袖を着ける（兵庫県立歴史博物館の形式解説）。
      // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
      // 堀の伝来品の寸法は未確認。壺袖の筒形でなく、幅を保つ板の段で補う。
      // 既存の袖の骨で揺らす共有形へ結合し、部品や材質を毎コマ増やさない。
      const y0 = 1.39, y1 = 1.05, H = (y0 - y1) / rowsN;
      const sleeveLace = doStyle === 'sugake' ? 'sugake' : 'kebiki';
      for (let j = 0; j < rowsN; j++) {
        const y = y0 - (j + .5) * H;
        parts.push(P(at(new THREE.BoxGeometry(.018, H + .008, .34),
          sd * (.30 + (y0 - y) * .15), y, 0, 0, 0, sd * .15), armor,
        { mk: kozaneMk, reg: sleeveLace, c2: lace, mk2: MK.cloth,
          rv: [(rowsN - 1 - j) / 8, (rowsN - j) / 8], ru: [0, .22] }));
        if (hi && o.sodeLining != null) {
          // 大袖の裏包。山口県の文化財要録にある栗色韋無地を構造の参考にする。
          // https://bunkazai.pref.yamaguchi.lg.jp/sp/bunkazai/summary.asp?mid=70095
          // 堀の所用品の色・寸法は未確認。札の内面へ沿わせ、表の威糸を覆わない。
          // 既存の袖へ結合して保管し、材質と骨を共用する。毎コマの生成はない。
          parts.push(P(at(new THREE.BoxGeometry(.002, H + .008, .34),
            sd * (.30 + (y0 - y) * .15 - .010 * Math.cos(.15)),
            y - .010 * Math.sin(.15), 0, 0, 0, sd * .15),
          o.sodeLining, { mk: MK.cloth }));
        }
        if (hi && o.goldKozane && sleeveLace === 'kebiki') {
          // 雑賀の堀の大袖は、金小札を浅葱の毛引威で綴る復元案。
          // https://www.meihaku.jp/armor-basic/armor-highlight/
          // 二筋ずつの素懸威と区別し、幅いっぱいへ細かく糸を並べる。
          // 本数・幅は所用品の再現ではない。薄い四角の面を共有形へ結合し、
          // 袖の骨で一緒に揺らす。材質・描画回数・毎コマの処理は増やさない。
          for (let k = 0; k < 20; k++) {
            const z = (k - 9.5) * .016;
            const cord = surf(1, 1, (u, v) => {
              const dy = (v - .5) * (H + .008);
              return [sd * (.30 + (y0 - y) * .15 + .012 * Math.cos(.15) - dy * Math.sin(.15)),
                y + .012 * Math.sin(.15) + dy * Math.cos(.15), z - sd * (u - .5) * .011];
            });
            parts.push(P(cord, lace, { mk: MK.cloth, reg: 'cord' }));
          }
        }
      }
      parts.push(P(at(new THREE.BoxGeometry(.024, .03, .35), sd * .30, 1.40, 0),
        plateArmor, { mk: MK.lac, reg: 'lacq' }));
      if (hi && o.sodeMimiito != null) {
        // 大袖の前後の縁を通る耳糸。雑賀の堀だけに浅葱で補う復元案。
        // 広島県「銀小札白糸威胴丸具足」の大袖の耳糸を構造の手掛かりとする。
        // https://www.pref.hiroshima.lg.jp/uploaded/attachment/655530.pdf
        // 伝来品の色・組み方は写さない。袖の共有形へ結合し、既存の骨で揺らす。
        for (const z of [-.171, .171]) for (let j = 0; j < rowsN; j++) {
          const center = y0 - (j + .5) * H;
          // 各札板の傾きに沿わせ、耳糸が小口へ埋まるのを防ぐ。
          const point = (dy) => [
            sd * (.30 + (y0 - center) * .15 + .012 * Math.cos(.15) - dy * Math.sin(.15)),
            center + .012 * Math.sin(.15) + dy * Math.cos(.15), z,
          ];
          parts.push(P(limb(point(-H / 2 - .004), point(H / 2 + .004),
            .004, .004, 4), o.sodeMimiito, { reg: 'cord' }));
        }
      }
      if (hi) {
        // 大袖の後ろの緒を総角へ留める（名古屋刀剣博物館の構造解説）。
        // https://www.meihaku.jp/armor-basic/armor-structural/
        // 堀の所用品の結び方・色・寸法は未確認。浅葱の緒で構造を補う復元案。
        // 総角側は名将の胴の変形後の位置へ合わせ、袖側は後縁へ結ぶ。
        const knotX = .024, knotY = 1.24;
        const named = typeof o.face === 'string' && o.face.startsWith('g:');
        const knotZ = -(0.248 * r0 * 0.8 + .018);
        const start = [sd * knotX * (named ? .86 + .05 * ((knotY - .88) / .42) : 1),
          knotY, knotZ * (named ? .72 + .2 * (knotX / (.25 * r0)) : 1)];
        const bend = [sd * .18, 1.21, -.24 * r0];
        const end = [sd * .33, 1.24, -.18];
        parts.push(P(limb(start, bend, .005, .005, 4), lace, { reg: 'cord' }));
        parts.push(P(limb(bend, end, .005, .005, 4), lace, { reg: 'cord' }));
        // 大袖の裾板に菱縫を補う。山口県の文化財要録「紺糸威肩紅腹巻」付大袖を参照。
        // https://bunkazai.pref.yamaguchi.lg.jp/sp/bunkazai/summary.asp?mid=70095
        // 堀所用の色・針目は未確認なので、浅葱の威糸で補う復元案。
        // 既存の袖の共有形へ結合し、袖の骨と一緒に揺らす。
        const stitchPoint = (y, z) => [sd * (.30 + (y0 - y) * .15 + .014), y, z];
        for (let k = 0; k < 6; k++) {
          const z = -.135 + k * .054, y = y1 + H * .5;
          for (const dir of [-1, 1]) parts.push(P(limb(
            stitchPoint(y - .016, z - dir * .018),
            stitchPoint(y + .016, z + dir * .018), .0025, .0025, 4),
          lace, { reg: 'cord' }));
        }
      }
      // 肩上と冠板を袖緒でつなぎ、大袖が肩の外へ浮いた板に見えないようにする。
      // 緒の位置・太さ・浅葱色は堀の伝来品では確認できない復元案。
      // 袖と同じ共有形へ結合し、既存の骨で揺らす。材質・描画回数は増やさない。
      for (const dz of [-.08, .08]) {
        parts.push(P(limb([sd * .17, 1.445, dz], [sd * .245, 1.425, dz],
          .006, .006, 4), lace, { reg: 'cord' }));
        parts.push(P(limb([sd * .245, 1.425, dz], [sd * .30, 1.405, dz],
          .006, .006, 4), lace, { reg: 'cord' }));
      }
      if (hi) for (const dz of [-.12, .12])
        parts.push(P(at(ball(.012, .012, .005, 8, 5), sd * .315, 1.40, dz,
          0, sd * Math.PI / 2), gold, { mk: MK.gold }));
      continue;
    }
    // 伝来具足の袖の威し方がある時は、身分で決めた汎用の模様より先に使う。
    const sodeBase = o.sodeStyle === 'kiritsuke' ? 'kebiki' : o.sodeStyle ?? (T >= 2 ? 'kebiki' : 'sugake');
    const iro = !o.sodeLaceBands && !o.takedaRed && !o.honkozane && !o.sodeCrownFit;
    const sodeStyle = iro ? sodeBase + 'Iro' : sodeBase;
    const tsubo = o.sodeShape === 'tsubo';
    const span = Math.PI * (tsubo ? 0.9 : 0.7), start = sd * Math.PI / 2 - span / 2;
    // 壺袖は腕へ沿う深い湾曲と、裾が内へすぼまる輪郭を作る。閉じた筒にはしない。
    // 蟹江町の甲冑解説を形の参考にする。寸法は復元案。
    // https://www.town.kanie.aichi.jp/uploaded/attachment/23878.pdf
    // 板と上に重ねる威糸を同じ座標で曲げ、浮いた糸や左右のずれを作らない。
    // 形を共有する時だけ加工し、毎コマの更新や材質・板の数は増やさない。
    const sleeveAt = (g, y) => {
      if (!tsubo) return at(g.scale(0.5, 1, 1), sd * 0.2625, y, 0);
      g.scale(0.8, 1, 1);
      const points = g.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const t = Math.max(0, Math.min(1, (1.39 - y - points.getY(i)) / 0.24));
        points.setX(i, points.getX(i) - sd * 0.025 * t * t);
      }
      g.computeVertexNormals();
      return at(g, sd * 0.225, y, 0);
    };
    if (hi || takigawaSode) {
      // 裾の折り返しまで同じ板に含め、段の厚みに光が当たるようにする。
      const y0 = 1.39, y1 = 1.15, H = (y0 - y1) / rowsN;
      for (let j = 0; j < rowsN; j++) {
        const yt = y0 - j * H, rt = 0.125 - 0.031 * j / rowsN, rb = 0.125 - 0.031 * (j + 1) / rowsN + 0.004;
        // 表と小口の光を分けつつ、八分割の滑らかさと肩への位置合わせを保つ。
        const kiritsuke = o.sodeStyle === 'kiritsuke';
        const g = sleevePlate(rt, rb, H + 0.008, span, sd * Math.PI / 2, kiritsuke ? 48 : 8);
        if (kiritsuke) {
          // 光秀の伝来具足を参考にした切付小札。別々の札を重ねず、一枚板の上端を刻む。
          // 一段十六山・谷の深さ四ミリは描画上の復元。近い袖だけ生成時に加工して共有する。
          // 六点の断面の最後が上端。小口と裾の厚み、模様の座標は保つ。
          const p = g.attributes.position;
          for (let i = 5; i < p.count; i += 6) {
            if (Math.floor(i / 6) % 3 === 0) p.setY(i, p.getY(i) - 0.004);
          }
          g.computeVertexNormals();
        }
        g.translate(0, -H / 2 - 0.004, 0);
        const cordLace = o.sodeLaceBands?.find(([top]) => yt - H * 0.52 <= top)?.[1] ?? (iro && !o.goldKozane ? iroLaceColor(8 - rowsN + j) : lace);
        const offsets = o.sodeStyle === 'sugake' ? [-.48, -.36, .36, .48] : [-.42, .42];
        parts.push(P(sleeveAt(g, yt), armor, { mk: kozaneMk, reg: sodeStyle, c2: lace, c2Bands: o.sodeLaceBands, mk2: MK.cloth, rv: [(rowsN - 1 - j) / 8, (rowsN - j) / 8], ru: [0, 0.22] }));
        if (kiritsuke) {
          // 比叡山の光秀だけ、紅糸を札頭の十六山にそろえて密に並べる復元案。
          // 列数・太さ・通し方は実測ではない。板の反りに沿う薄い糸を生成時に袖へ結合し、
          // 既存の布材質・共有形・揺れる骨を使う。毎コマの生成や描画の束は増やさない。
          const pitch = span / 16;
          for (let k = 0; k < 16; k++) {
            const a = sd * Math.PI / 2 - span / 2 + (k + 0.5) * pitch;
            // 上段の折り返しの外を回り、下段の糸の上端へ渡す。
            // 次段の上半径は rb - 0.004。継ぎ目を同じ座標にし、
            // 段ごとに浮いて途切れる糸にしない。通し方と寸法は復元。
            const profile = [];
            if (j < rowsN - 1) profile.push(
              new THREE.Vector2(rb - 0.002, -H - 0.012),
              new THREE.Vector2(rb + 0.003, -H - 0.010),
            );
            profile.push(
              new THREE.Vector2(rb + 0.004, -H - 0.002),
              new THREE.Vector2(rt + 0.002, j > 0 ? -0.012 : -0.004),
            );
            const cord = new THREE.LatheGeometry(profile, 2, a - pitch * 0.41, pitch * 0.82);
            parts.push(P(sleeveAt(cord, yt), lace, { reg: 'cord' }));
          }
        } else for (const da of offsets) {
          // 共通の袖は二列の縅を板の面へ密着させる。
          const a = sd * Math.PI / 2 + da, r = (rt + rb) * 0.5 + 0.004;
          const cord = at(new THREE.BoxGeometry(0.006, H * 0.82, 0.005), Math.sin(a) * r, -H * 0.52, Math.cos(a) * r, 0, a);
          parts.push(P(sleeveAt(cord, yt), cordLace, { reg: 'cord' }));
        }
        if (takigawaSode) {
          // 小札板の両端を通す耳糸。福井市立郷土歴史博物館「甲冑の美」を参考に補う。
          // https://www.history.museum.city.fukui.fukui.jp/tenji/kaisetsusheets/78.pdf
          // 黒い緒の通し方と寸法は復元案。段板と同じ袖に結合し、遠景でも共有する。
          for (const edge of [-1, 1]) {
            const a = sd * Math.PI / 2 + edge * (span / 2 - .035);
            const top = [Math.sin(a) * (rt + .003), -.004, Math.cos(a) * (rt + .003)];
            const bottom = [Math.sin(a) * (rb + .003), -H - .004, Math.cos(a) * (rb + .003)];
            parts.push(P(sleeveAt(limb(top, bottom, .0035, .0035, 4), yt), cordLace, { reg: 'cord' }));
          }
        }
        if (o.sodeMimiito != null) {
          // 湾曲した袖の前後の小口を耳糸で綴じる。雑賀の佐久間だけに補う復元案。
          // 各段のすぼまりに沿わせ、袖の共有形に結合して既存の骨で揺らす。
          for (const edge of [-1, 1]) {
            const a = sd * Math.PI / 2 + edge * span / 2;
            parts.push(P(sleeveAt(limb(
              [Math.sin(a) * (rt + .004), 0, Math.cos(a) * (rt + .004)],
              [Math.sin(a) * (rb + .004), -H - .008, Math.cos(a) * (rb + .004)],
              .004, .004, 4), yt), o.sodeMimiito, { reg: 'cord' }));
          }
        }
        if (j === rowsN - 1 && o.sodeHishinui != null) {
          // 雑賀の佐久間の裾板を綴じる菱縫。茶の色・針目は復元案。
          // 袖板と同じ縮尺・傾斜へ合わせ、共有形に結合して既存の骨で揺らす。
          const point = (a, down) => {
            const r = rt + (rb + .002 - rt) * down + .004;
            return [Math.sin(a) * r, -(H + .008) * down, Math.cos(a) * r];
          };
          for (let k = 0; k < 6; k++) {
            const a = sd * Math.PI / 2 - .75 + k * .3;
            for (const dir of [-1, 1]) parts.push(P(sleeveAt(limb(
              point(a - dir * .09, .28), point(a + dir * .09, .80),
              .0025, .0025, 4), yt), o.sodeHishinui, { reg: 'cord' }));
          }
        }
      }
      // 冠板を肩へ吊る二本の紐。板だけが宙に浮いた輪郭にしない。
      for (const dz of [-0.06, 0.06]) parts.push(P(limb([sd * 0.16, 1.445, dz * 0.75], [sd * 0.3, 1.405, dz], 0.004, 0.004, 3), laceColorAt(o.sodeLaceBands, 1.425), { reg: 'cord' }));
      if (takigawaSode) {
        // 大滝寺の一益：裾板を交差する菱縫。色・数・寸法は一般的な構造の復元。
        // 福井市立郷土歴史博物館「甲冑の美」の菱縫の解説を参考にする。
        // https://www.history.museum.city.fukui.fukui.jp/tenji/kaisetsusheets/78.pdf
        // 段板と緒を近景・遠景とも同じ袖へ結合・保存し、袖の骨と一緒に動かす。
        const r = .104, y = 1.166;
        for (let k = 0; k < 5; k++) {
          const a = sd * Math.PI / 2 + (k - 2) * .4;
          for (const cross of [-1, 1]) {
            const a0 = a - .14, a1 = a + .14;
            const cord = limb([Math.sin(a0) * r, -.009 * cross, Math.cos(a0) * r],
              [Math.sin(a1) * r, .009 * cross, Math.cos(a1) * r], .003, .003, 4);
            parts.push(P(sleeveAt(cord, y), lace, { reg: 'cord' }));
          }
        }
      }
    } else if (o.sodeStyle === 'kiritsuke' || o.sodeCrownFit) {
      // 比叡山の光秀・勝家・信盛。遠くでも袖の段・反り・裾の折り返しを近景とそろえる。
      // 冠板へ結着する素懸威の袖も、一枚の筒へ戻さず、同じ六段の輪郭を保つ。
      // 切付小札の刻みと糸の厚みは近景で示し、ここでは共有する湾曲板へまとめる。
      // 段数・寸法は復元案。生成時だけ作り、毎コマの処理や材質は増やさない。
      const H = (1.39 - 1.15) / rowsN;
      for (let j = 0; j < rowsN; j++) {
        const rt = 0.125 - 0.031 * j / rowsN, rb = 0.125 - 0.031 * (j + 1) / rowsN + 0.004;
        const g = sleevePlate(rt, rb, H + 0.008, span, sd * Math.PI / 2, 8);
        g.translate(0, -H / 2 - 0.004, 0);
        parts.push(P(sleeveAt(g, 1.39 - j * H), armor, { mk: kozaneMk, reg: sodeStyle, c2: lace, c2Bands: o.sodeLaceBands, mk2: MK.cloth,
          rv: [(rowsN - 1 - j) / 8, (rowsN - j) / 8], ru: [0, 0.22] }));
      }
    } else {
      const g = new THREE.CylinderGeometry(0.125, 0.098, 0.24, 3, 1, true, start, span);
      parts.push(P(sleeveAt(g, 1.27), armor, { mk: kozaneMk, reg: sodeStyle, c2: lace, c2Bands: o.sodeLaceBands, mk2: MK.cloth, rv: [0, rowsN / 8], ru: [0, 0.22] }));
    }
    // 手取川の謙信の壺袖。冠板の上端を外へ直角に折り、頸へ当たらない折冠を補う。
    // 東京国立博物館「色々糸威腹巻」の壺袖を形の参考にする。
    // https://emuseum.nich.go.jp/detail?content_base_id=100508&langId=ja
    // 謙信の伝来品そのものの細部・当日の所用を断定しない復元案。
    // 薄い折り返しも同じ袖へ結合する。形は共有し、材質・描画回数・更新は増やさない。
    let kb;
    if (takigawaSode) {
      // 大滝寺の一益：鉄板製の冠板を表だけの円筒にせず、裏と四辺を閉じる。
      // 千葉県立中央博物館「甲冑の構成」の金具廻りを参考にした一般的な補完。
      // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sub0003.htm
      // 板厚・寸法・黒漆は所用品の特定ではない。高画質の近景・遠景で共有する。
      const outline = [];
      for (let i = 0; i <= 8; i++) {
        const a = start + span * i / 8;
        outline.push(new THREE.Vector2(Math.sin(a) * .123, Math.cos(a) * .123));
      }
      for (let i = 8; i >= 0; i--) {
        const a = start + span * i / 8;
        outline.push(new THREE.Vector2(Math.sin(a) * .117, Math.cos(a) * .117));
      }
      kb = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: .03, bevelEnabled: false, steps: 1 });
      kb.rotateX(Math.PI / 2); kb.translate(0, .015, 0);
      const pos = kb.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const taper = 1 + (.015 - pos.getY(i)) / .03 * (.002 / .123);
        pos.setXYZ(i, pos.getX(i) * taper, pos.getY(i), pos.getZ(i) * taper);
      }
      kb.computeVertexNormals();
    } else kb = tsubo ? new THREE.LatheGeometry([
      new THREE.Vector2(0.125, -0.015), new THREE.Vector2(0.123, 0.009),
      new THREE.Vector2(0.143, 0.009), new THREE.Vector2(0.143, 0.015),
      new THREE.Vector2(0.123, 0.015),
    ], hi ? 6 : 3, start, span)
      : new THREE.CylinderGeometry(0.123, 0.125, 0.03, hi ? 6 : 3, 1, true, start, span);
    parts.push(P(sleeveAt(kb, 1.40), plateArmor, { mk: MK.lac, reg: 'lacq' }));
    // 光秀の袖を吊る紅糸は、遠くでも消さず冠板の上端までつなぐ。
    // 通し位置は復元。冠板に合わせて横幅を縮めた座標を使い、近遠で同じ形にする。
    // 既存の袖へ生成時に結合し、布材質と揺れる骨を共用する。
    // 勝家・信盛の復元袖は、冠板の実際の面へ紐と金具を据える。
    // 横幅を半分にした板の三分割・六分割にも合わせ、近遠で結着を保つ。
    // 生成時だけ計算し、既存の袖の共有形と布・金属の材質へまとめる。
    const crownFace = (z, radius) => {
      const step = span / (hi ? 6 : 3), a = Math.acos(z / radius);
      const begin = Math.PI * 0.15 + Math.floor((a - Math.PI * 0.15) / step) * step;
      const x0 = Math.sin(begin) * radius * 0.5, z0 = Math.cos(begin) * radius;
      const x1 = Math.sin(begin + step) * radius * 0.5, z1 = Math.cos(begin + step) * radius;
      const nx = z0 - z1, nz = x1 - x0, len = Math.hypot(nx, nz);
      return { x: 0.2625 + x0 + (x1 - x0) * (z - z0) / (z1 - z0), nx: nx / len, nz: nz / len };
    };
    if (hi || o.sodeStyle === 'kiritsuke' || o.sodeCrownFit) for (const dz of [-0.06, 0.06]) {
      const kiritsuke = o.sodeStyle === 'kiritsuke';
      const x = o.sodeCrownFit ? crownFace(dz, 0.123).x : kiritsuke ? 0.2625 + Math.sqrt(0.123 ** 2 - dz ** 2) * 0.5 : 0.3;
      parts.push(P(limb([sd * 0.16, 1.445, dz * 0.75], [sd * x, kiritsuke || o.sodeCrownFit ? 1.415 : 1.405, dz], 0.004, 0.004, 3), laceColorAt(o.sodeLaceBands, 1.425), { reg: 'cord' }));
    }
    if (hi && T >= 1) for (const dz of [-0.06, 0.06]) {
      let x = sd * 0.325, z = dz, turn = sd * Math.PI / 2;
      if (o.sodeCrownFit) {
        const face = crownFace(dz, 0.124);
        x = sd * (face.x + face.nx * 0.002);
        z += face.nz * 0.002;
        turn = Math.atan2(sd * face.nx, face.nz);
      }
      if (o.sodeStyle === 'kiritsuke') {
        // 光秀の冠板は横幅を半分に縮めた六分割の湾曲板。
        // 縮める前の位置に金具を浮かせず、実際の板の面と向きへ据える。
        // 円弧の理想面でなく、冠板の頂点間の面を使う。生成時だけ計算し、既存の袖へ結合する。
        const step = span / 6, a = Math.acos(dz / 0.124);
        const begin = Math.PI * 0.15 + Math.floor((a - Math.PI * 0.15) / step) * step;
        const x0 = Math.sin(begin) * 0.124 * 0.5, z0 = Math.cos(begin) * 0.124;
        const x1 = Math.sin(begin + step) * 0.124 * 0.5, z1 = Math.cos(begin + step) * 0.124;
        const nx = z0 - z1, nz = x1 - x0, len = Math.hypot(nx, nz);
        x = sd * (0.2625 + x0 + (x1 - x0) * (dz - z0) / (z1 - z0) + nx / len * 0.002);
        z += nz / len * 0.002;
        turn = Math.atan2(sd * nx, nz);
      }
      parts.push(P(at(ball(0.012, 0.012, 0.005, 8, 5), x, 1.40, z, 0, turn), T >= 2 ? gold : brass, { mk: MK.gold }));
    }
  }
  // 足軽には板袖を足さず、鎧下の筒袖と籠手を見せる。
  // 味方の袖印。近い人と遠い人で同じ形を共有し、袖の骨と一緒に動かす。
  if (o.shoulderMark) for (const sd of [1, -1]) {
    if (shared[sd > 0 ? 'sodeP' : 'sodeN']) continue;
    parts = sd > 0 ? PT.sodeP : PT.sodeN;
    parts.push(P(at(new THREE.BoxGeometry(0.014, 0.16, 0.13), sd * 0.325, 1.34, 0.018, 0, 0, sd * 0.18), o.shoulderMark, { mk: MK.cloth, reg: 'plain' }));
  }
  parts = PT.torso;
  if (!shared.torso) {
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
  }
  if (o.haori && !shared.haori) {
    // 袖なしの陣羽織。背だけの布にせず、左右の前身頃と肩で胴を包む。
    parts = PT.haori;
    const hb = hi ? new THREE.CylinderGeometry(0.262 * r0, 0.35 * r0, 0.64, 12, 2, true, Math.PI - Math.PI * 0.4, Math.PI * 0.8) : arcCyl(0.262 * r0, 0.35 * r0, 0.64, 6, Math.PI * 0.8, Math.PI);
    at(hb, 0, 1.12, -0.004);
    // 布のひだ：裾ほど深く波打つ（humans.js の背の家紋も同じ式で沿わせる）
    // 脇の端は裾ほど外へ開く（脇の割れから布が広がる）
    const edgeOut = (th, y) => { const dc = Math.PI - Math.abs(th); const e = Math.min(1, Math.max(0, (dc - Math.PI * 0.26) / (Math.PI * 0.14))); const low = Math.min(1, Math.max(0, (1.44 - y) / 0.64)); return e * e * 0.035 * low; };
    // 肩の線：上の縁は背の真ん中で高く、肩の外へ向けて下がり、少し内へ寄って肩に掛かる（横一直線の板の縁にしない）
    const shoulder = (th, y) => { const dc = Math.min(1, Math.abs(Math.PI - Math.abs(th)) / (Math.PI * 0.4)); const top = Math.min(1, Math.max(0, (y - 1.2) / 0.24)); return [-0.085 * dc * dc * top * top, -0.03 * top * top * (0.4 + 0.6 * dc)]; };
    if (hi) { const p = hb.attributes.position; for (let i = 0; i < p.count; i++) { const th = Math.atan2(p.getX(i), p.getZ(i) + 0.004); p.setXYZ(i, ...haoriPoint(th, p.getY(i), T, true)); } hb.computeVertexNormals(); }
    parts.push(P(hb, o.haori, { reg: 'cloth', dirt: DIRT * 0.6 }));
    const linedTakigawa = S.quality === 'high' && o.haoriMon === 'takigawa_haori';
    if (hi || linedTakigawa) {
      // 布の厚み：裏地（少し内に、面を返して）と、脇の端の縁（表と裏をつなぐ細い帯）。横から見ても線にならない
      const T_ = 0.012, lin = new THREE.Color(o.haori).multiplyScalar(0.62).getHex();
      const inner = hb.clone(); const ip = inner.attributes.position;
      for (let i = 0; i < ip.count; i++) { const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i) + 0.004; const r = Math.hypot(x, z) || 1; ip.setXYZ(i, x * (1 - T_ / r), y, z * (1 - T_ / r) - 0.004); }
      const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
      inner.computeVertexNormals();
      parts.push(P(inner, lin, { reg: 'cloth', dirt: DIRT * 0.5 }));
      if (linedTakigawa) {
        // 大滝寺の一益：背面も袷仕立てとして、肩口・裾・脇を表地と裏地で閉じる。
        // 東京国立博物館所蔵の陣羽織の袷仕立てを参考にした一般的な補完。
        // https://kunishitei.bunka.go.jp/heritage/detail/201/10363
        // 色・厚み・裁ちは一益の所用品の再現ではない。遠景にも裏地を残す。
        // 実際の背布の頂点から小口を作り、既存の羽織へ結合・保存する。
        const op = hb.attributes.position, edgePositions = [];
        const columns = hb.parameters.radialSegments, rows = hb.parameters.heightSegments;
        const stride = columns + 1, bottom = rows * stride;
        const edge = (a, b) => {
          for (const [p, i] of [[op, a], [op, b], [ip, a], [op, b], [ip, b], [ip, a]]) {
            edgePositions.push(p.getX(i), p.getY(i), p.getZ(i));
          }
        };
        for (let i = 0; i < columns; i++) {
          edge(i, i + 1); edge(bottom + i + 1, bottom + i);
        }
        for (let i = 0; i < rows; i++) {
          edge((i + 1) * stride, i * stride);
          edge(i * stride + columns, (i + 1) * stride + columns);
        }
        const edging = new THREE.BufferGeometry();
        edging.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
        edging.computeVertexNormals();
        parts.push(P(edging, o.haori, { reg: 'cloth', dirt: DIRT * 0.6 }));
      } else {
      const rAt0 = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - 0.8) / 0.64);
      for (const sd of [-1, 1]) {
        const th = Math.PI + sd * Math.PI * 0.4;
        const eg = surf(1, 8, (u, v) => { const y = 0.8 + v * 0.64; const [sy, sr] = shoulder(th, y); const r = rAt0(y) + haoriFold(th, y) + edgeOut(th, y) + sr - T_ * u; return [Math.sin(th) * r, y + sy, Math.cos(th) * r - 0.004]; });
        if (sd > 0) { const ex = eg.index.array; for (let i = 0; i < ex.length; i += 3) { const t = ex[i]; ex[i] = ex[i + 2]; ex[i + 2] = t; } eg.computeVertexNormals(); }
        parts.push(P(eg, new THREE.Color(o.haori).multiplyScalar(0.8).getHex(), { reg: 'cloth' }));
      }
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
    // 大滝寺の一益は、画質「高」の遠景でも羽織の立四窠紋を残す。
    // 紋は既存の絵と羽織の形へ結合し、材質や描く回数を増やさない。
    if (hm && (hi || (S.quality === 'high' && o.haoriMon === 'takigawa_haori'))) {
      const y0 = 1.04, y1 = 1.38, rAt = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - (1.12 - 0.32)) / 0.64);
      const dec = new THREE.CylinderGeometry(rAt(y1) + 0.004, rAt(y0) + 0.004, y1 - y0, linedTakigawa ? 18 : 6, linedTakigawa ? 4 : 1, true, Math.PI - 0.60, 1.20);
      at(dec, 0, (y0 + y1) / 2, -0.004);
      if (linedTakigawa) {
        // 一益の立四窠紋を、実際の背布の三角形へ沿わせる。
        // 円筒のまま重ねると、ひだや肩の下がりから紋が浮く。
        // 組み立て時にだけ補間し、近景・遠景とも羽織の共用形に結合する。
        const cloth = hb.attributes.position, pos = dec.attributes.position, uv = dec.attributes.uv;
        const columns = hb.parameters.radialSegments, rows = hb.parameters.heightSegments;
        const stride = columns + 1;
        for (let i = 0; i < pos.count; i++) {
          const th = Math.PI - .6 + uv.getX(i) * 1.2;
          const y = y0 + uv.getY(i) * (y1 - y0);
          const cx = (th - hb.parameters.thetaStart) / hb.parameters.thetaLength * columns;
          const cy = (1.44 - y) / .64 * rows;
          const col = Math.min(columns - 1, Math.max(0, Math.floor(cx)));
          const row = Math.min(rows - 1, Math.max(0, Math.floor(cy)));
          const u = cx - col, v = cy - row, a = row * stride + col;
          // 円筒の格子は左上・左下・右上と、左下・右下・右上に分かれる。
          const ids = u + v <= 1 ? [a, a + stride, a + 1] : [a + stride, a + stride + 1, a + 1];
          const weights = u + v <= 1 ? [1 - u - v, v, u] : [1 - u, u + v - 1, 1 - v];
          let x = 0, yy = 0, z = 0;
          for (let j = 0; j < 3; j++) {
            x += cloth.getX(ids[j]) * weights[j];
            yy += cloth.getY(ids[j]) * weights[j];
            z += cloth.getZ(ids[j]) * weights[j];
          }
          pos.setXYZ(i, x + Math.sin(th) * .004, yy, z + Math.cos(th) * .004);
        }
        dec.computeVertexNormals();
      }
      parts.push(P(dec, o.haori, { reg: hm, c2: o.haoriMonCol || 0xe6dfcf, mk2: o.haoriMonCol && GOLDS.has(o.haoriMonCol) ? MK.gold : MK.cloth, dirt: 0.2 }));
    }
    // 裾は腰まで。既存の裏地・縁・紋も同じ比率で縮め、背へ長く尾を引かせない。
    for (const g of parts) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), low = Math.max(0, Math.min(1, (1.44 - y) / 0.64));
        p.setXYZ(i, p.getX(i) * (1 - low * 0.12), y + low * 0.14, p.getZ(i));
      }
      g.computeVertexNormals();
    }
    for (const sd of [-1, 1]) {
      // 前は開き、脇の上半分は腕を通す空間にする。袖や外へ張り出す布は付けない。
      const front = surf(hi ? 4 : 2, hi ? 4 : 2, (u, v) => {
        const y = 0.94 + v * 0.5 - 0.055 * u * u * v;
        const x = sd * (0.055 + u * (0.205 - v * 0.025));
        const fold = (1 - v) * (0.009 * Math.sin(u * Math.PI * 4) + 0.006 * Math.sin(u * Math.PI * 7));
        return [x * r0, y, 0.23 - u * u * 0.055 + fold];
      });
      if (sd < 0) { const ix = front.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
      front.computeVertexNormals();
      const lining = front.clone(), ix = lining.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
      lining.translate(0, 0, -0.008); lining.computeVertexNormals();
      parts.push(P(front, o.haori, { reg: 'cloth' }));
      parts.push(P(lining, new THREE.Color(o.haori).multiplyScalar(0.62).getHex(), { reg: 'cloth' }));
      // 元の肩板一枚を薄い布の帯へ変える。首側を高くし、前後の身頃へ垂らす。
      const shoulderCloth = surf(hi ? 4 : 2, hi ? 4 : 2, (u, v) => {
        const z = -0.17 + v * 0.4, outer = u * u;
        const arch = Math.sin(v * Math.PI);
        return [sd * (0.14 + u * 0.09) * r0,
          1.44 + 0.055 * arch - 0.055 * outer - 0.012 * Math.sin(u * Math.PI * 3) * arch,
          z];
      });
      if (sd > 0) { const ix = shoulderCloth.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
      shoulderCloth.computeVertexNormals();
      parts.push(P(shoulderCloth, o.haori, { reg: 'cloth' }));
    }
    parts = PT.torso;
  }
  // 刀：鞘・鍔・柄を左の腰に差す（腰の骨に付ける組。胴丸の上にも差す）
  parts = PT.koshi;
  if (!shared.koshi) {
  if (S.quality === 'high' && o.uwaobi) {
    // 大滝寺の一益：下緒の戻り先となる上帯を胴の裾へ巻く。色・幅・結びは復元案。
    // 名古屋刀剣博物館「甲冑の着方」：https://www.meihaku.jp/armor-basic/armor-wear/
    // 腰の形へ結合し、納刀・抜刀と近景・遠景で共用する。材質や毎コマの処理は増やさない。
    const belt = new THREE.CylinderGeometry(.225 * r0, .218 * r0, .055, hi ? 24 : 12, 1, true);
    belt.scale(1, 1, .8);
    parts.push(P(at(belt, 0, .945, 0), o.uwaobi, { reg: 'cloth' }));
    const front = .225 * r0 * .8;
    parts.push(P(at(ball(.025, .018, .014, 8, 4), .035, .945, front), o.uwaobi, { reg: 'cloth' }));
    for (const sd of [-1, 1]) {
      parts.push(P(at(new THREE.BoxGeometry(.022, .075, .008), .035 + sd * .018, .901, front + .008, -.1, 0, sd * .2), o.uwaobi, { reg: 'cloth' }));
    }
  }
  if (o.saya) {
    const named = typeof o.face === 'string' && o.face.startsWith('g:');
    // 手取川の謙信は手に抜いた合口の刀を持つ。腰の本差へ別の柄・鍔を重ねない。
    // 姫鶴一文字附属拵の黒漆鞘・尖った栗形・棟寄りの返角を参考にした復元。
    // https://www.denkoku-no-mori.yonezawa.yamagata.jp/togodb/capt.php?ID=17039
    // 留め具の寸法・位置と当日の所用は断定せず、形は既存の腰部へ結合して共有する。
    const drawnAikuchi = o.swordMount === 'kenshin_aikuchi' && o.weapon === 'sword';
    const h0 = [(named ? -0.27 : -0.23) * r0, 0.93, 0.07];
    const d = new THREE.Vector3(named ? 0 : 0.1, named ? 0.48 : 0.2, 1).normalize();
    const end = named ? -0.8 : -0.72;
    // 大滝寺専用。刀身の反りに合わせて鞘も曲げる。寸法は所用品の実測ではなく復元。
    // 刀剣博物館「歴史」：https://www.touken.or.jp/museum/sword/history.html
    const sori = S.quality === 'high' ? (o.sayaSori || 0) : 0;
    // 大滝寺の一益：平たい刀身を納める鞘を、丸棒から扁平な断面へ補う。
    // 刀装部位の参考：https://www.touken.or.jp/museum/sword/tousougu.html
    // 厚みの比率は復元案。名のある武将の鞘は軸が左右へ傾かないので、幅だけを縮める。
    const oval = S.quality === 'high' && named ? (o.sayaOval || 1) : 1;
    // 大滝寺の一益：柄も刀身に沿う扁平な断面で補う。厚みと金具は復元案。
    // 縁・頭の部位は刀剣博物館の解説を参考にする。
    // https://www.touken.or.jp/museum/sword/tousougu.html
    const tsukaOval = S.quality === 'high' && named ? (o.tsukaOval || 1) : 1;
    const grip = (a, b, ra, rb, x, seg) => {
      const g = limb(a, b, ra, rb, seg);
      if (tsukaOval !== 1) g.translate(-x, 0, 0).scale(tsukaOval, 1, 1).translate(x, 0, 0);
      return g;
    };
    const pt = (k) => {
      const bend = k < 0 ? sori * (k / end) ** 2 : 0;
      return [h0[0] + d.x * k, h0[1] + d.y * k - d.z * bend, h0[2] + d.z * k + d.y * bend];
    };
    // 大滝寺の一益：単色の柄に菱巻の窓を補う。刀剣博物館「刀装・刀装具」を参考にした復元。
    // https://www.touken.or.jp/museum/sword/tousougu.html
    // 扁平な柄を指定した時の近景だけ。腰の形へ結合・保存し、描く回数と毎コマの処理を増やさない。
    const gripWindows = (point, axis, start, step, count, radius) => {
      if (!hi || tsukaOval === 1) return;
      for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
        const c = point(start + i * step), x = c[0] + side * (radius * .866 * tsukaOval + .0004);
        const a = .010, b = .004;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          x, c[1] + axis.y * a, c[2] + axis.z * a,
          x, c[1] - axis.z * b, c[2] + axis.y * b,
          x, c[1] - axis.y * a, c[2] - axis.z * a,
          x, c[1] + axis.z * b, c[2] - axis.y * b,
        ], 3));
        g.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
        g.computeVertexNormals();
        parts.push(P(g, 0x9b9685, {}));
      }
    };
    // 大滝寺の一益：腰の大小にも目貫を補う。刀装部位は刀剣博物館の解説を参照。
    // https://www.touken.or.jp/museum/sword/tousougu.html
    // 意匠・材質・位置は復元案。低い金具を表裏でずらし、家紋や名物の意匠は創作しない。
    // 菱巻と同じ近景の腰へ結合して保存するため、材質・描く回数・毎コマの処理は増やさない。
    const gripMenuki = (point, axis, radius, front, back) => {
      if (!hi || tsukaOval === 1) return;
      for (const side of [-1, 1]) {
        const c = point(side > 0 ? front : back);
        const fitting = ball(.0025, .004, .011, 6, 4);
        fitting.rotateX(-Math.atan2(axis.y, axis.z));
        fitting.translate(c[0] + side * (radius * .866 * tsukaOval + .001), c[1], c[2]);
        parts.push(P(fitting, 0xa8893f, { mk: MK.gold }));
      }
    };
    // 大滝寺の一益：茎を柄へ留める目釘。目貫とは別に、菱巻の窓から表裏へ通す。
    // 名古屋刀剣博物館：https://www.meihaku.jp/touken-qa/touken-qa-detail_4-1/
    // 位置・太さ・色は復元案。高画質の近景の腰へ結合・保存し、毎コマの処理は足さない。
    const gripMekugi = (point, at, radius, pegRadius) => {
      if (!hi || tsukaOval === 1) return;
      const c = point(at), half = radius * .866 * tsukaOval + .0007;
      parts.push(P(limb([c[0] - half, c[1], c[2]], [c[0] + half, c[1], c[2]],
        pegRadius, pegRadius * .85, 6), 0x8c7048, { reg: 'cord' }));
    };
    // 大滝寺の一益：鍔の両面を受ける切羽を大小に補う。寸法・銅色は一般的な構造の復元。
    // 刀剣博物館「刀装・刀装具」：https://www.touken.or.jp/museum/sword/tousougu.html
    // 画質「高」の近景だけ。既存の腰へ結合して保存し、材質・描く回数・毎コマの処理は増やさない。
    const gripSeppa = (point, x, thickness, radius) => {
      if (!hi || tsukaOval === 1) return;
      for (const start of [-.003, thickness]) {
        parts.push(P(grip(point(start), point(start + .003), radius, radius, x, 8), 0x99714c, { mk: MK.iron }));
      }
    };
    // 大滝寺の一益：手の刀と腰の柄を重複させない。鞘と脇差は既存の形を残す。
    const emptySaya = S.quality === 'high' && o.emptySaya && o.weapon === 'sword';
    const mouthAt = emptySaya ? -.028 : 0;
    let saya;
    if (sori) {
      // 一続きの筒を曲げ、継ぎ目の蓋を作らない。保存済みの腰へ結合し、描く回数は増やさない。
      saya = new THREE.CylinderGeometry(.018, .016, 1, hi ? 6 : 4, 8);
      if (emptySaya) {
        // 抜刀時は鞘本体の口側の蓋だけを除く。鞘尻は閉じたまま残す。
        // 刀剣博物館の木製の鞘の説明を参考にした補完。深さは所用品の実測ではない。
        // https://www.touken.or.jp/museum/sword/tousougu.html
        const indices = saya.index.array, side = saya.groups[0], bottom = saya.groups[2];
        saya.setIndex([...indices.slice(side.start, side.start + side.count),
          ...indices.slice(bottom.start, bottom.start + bottom.count)]);
        saya.clearGroups();
      }
      const pos = saya.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = end + (pos.getY(i) + .5) * (mouthAt - end), c = pt(k);
        const slope = 2 * sori * k / (end * end);
        const ty = d.y - d.z * slope, tz = d.z + d.y * slope, len = Math.hypot(ty, tz);
        const radial = pos.getZ(i);
        pos.setXYZ(i, c[0] + pos.getX(i), c[1] - tz / len * radial, c[2] + ty / len * radial);
      }
      saya.computeVertexNormals();
    } else saya = limb(pt(end), pt(mouthAt), .016, .018, hi ? 6 : 4);
    if (oval !== 1) saya.translate(-h0[0], 0, 0).scale(oval, 1, 1).translate(h0[0], 0, 0);
    parts.push(P(saya, 0x14110e, { mk: MK.lac, reg: 'lacq' }));
    if (emptySaya) {
      // 抜刀した鞘口を平らな蓋にしない。筒と口の縁を付け、奥に暗い底を残す。
      // 既存の腰の形へ結合して保存するため、人や描く回数は増えない。
      const seg = hi ? 10 : 6;
      const mouth = new THREE.CylinderGeometry(.018, .018, .028, seg, 1, true);
      mouth.scale(oval, 1, 1);
      mouth.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      mouth.translate(...pt(-.014));
      parts.push(P(mouth, 0x14110e, { mk: MK.lac, reg: 'lacq' }));
      // 大滝寺の一益：外面だけの筒では内側が透けるため、鯉口から奥へ木の内壁を補う。
      // 刀剣博物館「刀装・刀装具」の木製の鞘を参考にした復元で、所用品の実測ではない。
      // https://www.touken.or.jp/museum/sword/tousougu.html
      // 面を内向きにして既存の腰へ結合・保存する。材質や描く回数、毎コマの処理は増やさない。
      const lining = new THREE.CylinderGeometry(.012, .012, .10, seg, 2, true);
      const inner = lining.attributes.position;
      for (let i = 0; i < inner.count; i++) {
        const k = inner.getY(i) - .05, c = pt(k), radial = inner.getZ(i);
        const slope = 2 * sori * k / (end * end);
        const ty = d.y - d.z * slope, tz = d.z + d.y * slope, len = Math.hypot(ty, tz);
        inner.setXYZ(i, c[0] + inner.getX(i) * oval, c[1] - tz / len * radial,
          c[2] + ty / len * radial);
      }
      const indices = lining.index;
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i);
        indices.setX(i, indices.getX(i + 2)); indices.setX(i + 2, a);
      }
      lining.computeVertexNormals();
      parts.push(P(lining, 0x493b29, {}));
      // 奥は暗い面で閉じ、見通し用の穴にはしない。共用の腰へ一度だけ結合する。
      const depth = new THREE.CircleGeometry(.012, seg);
      depth.scale(oval, 1, 1);
      depth.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
      depth.translate(...pt(-.10));
      parts.push(P(depth, 0x17130f, {}));
      const rim = new THREE.RingGeometry(.012, .018, seg);
      rim.scale(oval, 1, 1);
      rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
      rim.translate(...pt(0));
      parts.push(P(rim, 0x29221a, { mk: MK.lac }));
    }
    const hasSayaCord = S.quality === 'high' && (o.sayaCord || emptySaya);
    // 大滝寺の一益：納刀時の大小にも鯉口の縁を残す。抜刀時の長い鞘には既に開いた口がある。
    // 刀剣博物館「刀装・刀装具」：https://www.touken.or.jp/museum/sword/tousougu.html
    // 色・厚みは復元案。既存の腰へ結合して保存し、材質と毎コマの処理は増やさない。
    const sayaKoiguchi = (point, x, radius) => {
      if (!hi || !hasSayaCord || tsukaOval === 1) return;
      const rim = limb(point(-.022), point(-.003), radius, radius, 10);
      rim.translate(-x, 0, 0).scale(oval, 1, 1).translate(x, 0, 0);
      parts.push(P(rim, 0x29221a, { mk: MK.lac, reg: 'lacq' }));
    };
    const sayaCord = (point, direction, curve, radius, offset, belt, drop) => {
      // 下緒は栗形の位置から帯へ返す復元。結び方や色を本人の所用品とは断定しない。
      // 納刀中も鞘を帯へ留める緒は残す。抜刀の有無と付属品の有無を分ける。
      // 刀剣博物館「刀装・刀装具」：https://www.touken.or.jp/museum/sword/tousougu.html
      const tie = point(offset);
      // 栗形は鞘の表へ付け、穴へ下緒を通す。鞘の中心から緒を生やさない。
      // 穴を鞘の長手へ向けた簡素な復元。形は腰へ結合して保存する。
      tie[0] -= radius * oval + .006;
      const slope = 2 * curve * offset / (end * end);
      const axis = new THREE.Vector3(0, direction.y - direction.z * slope, direction.z + direction.y * slope).normalize();
      const eye = new THREE.TorusGeometry(.010, .004, 4, hi ? 10 : 6);
      eye.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
      eye.translate(...tie);
      parts.push(P(eye, 0x14110e, { mk: MK.lac }));
      const before = [tie[0], tie[1] - axis.y * .018, tie[2] - axis.z * .018];
      const after = [tie[0], tie[1] + axis.y * .018, tie[2] + axis.z * .018];
      const loop = [tie[0] - .028, tie[1] - drop, tie[2] - .015];
      for (const [a, b] of [[before, after], [after, loop], [loop, belt], [belt, before]]) {
        parts.push(P(limb(a, b, .003, .003, 4), 0x43382c, { reg: 'cord' }));
      }
    };
    if (hasSayaCord) sayaCord(pt, d, sori, .018, -.12, [h0[0] + .055, .96, h0[2] - .035], .12);
    if (drawnAikuchi) {
      const kp = pt(-0.1), rp = pt(-0.18);
      parts.push(P(at(new THREE.ConeGeometry(0.014, 0.025, 4), kp[0] - 0.023, kp[1], kp[2], 0, 0, Math.PI / 2), 0x14110e, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(at(new THREE.BoxGeometry(0.009, 0.012, 0.025), rp[0], rp[1] + 0.018, rp[2], -0.45), 0x14110e, { mk: MK.lac, reg: 'lacq' }));
    }
    if (!emptySaya && !drawnAikuchi) {
      sayaKoiguchi(pt, h0[0], .020);
      parts.push(P(grip(pt(0.02), pt(0.25), 0.017, 0.016, h0[0], hi ? 6 : 4), 0x2a2420, { reg: 'cord' }));
      gripWindows(pt, d, .052, .029, 6, .017);
      gripMekugi(pt, .052, .017, .0026);
      gripMenuki(pt, d, .017, .09, .17);
      // 大滝寺の一益：納刀しても、手の刀と同じ薄い縦長の鉄鍔にする。
      // 輪郭・寸法は既存の抜刀用の復元に合わせる。本人の所用品の実測ではない。
      // 切羽と縁も鍔の厚みに合わせて接続し、腰の保存済み形へ一度だけ結合する。
      const tsubaThickness = tsukaOval !== 1 ? .006 : .012;
      gripSeppa(pt, h0[0], tsubaThickness, .024);
      if (tsukaOval !== 1) parts.push(P(grip(pt(tsubaThickness + .003), pt(.035), .018, .018, h0[0], hi ? 8 : 4), 0x2a2622, { mk: MK.iron }));
      if (hi) {
        const radius = tsukaOval !== 1 ? .037 : .038;
        const ts = limb(pt(0), pt(tsubaThickness), radius, radius, tsukaOval !== 1 ? 18 : 12);
        if (tsukaOval !== 1) ts.translate(-h0[0], 0, 0).scale(.88, 1, 1).translate(h0[0], 0, 0);
        parts.push(P(ts, 0x2a2622, { mk: MK.iron, reg: tsukaOval !== 1 ? 'iron' : undefined }));
      }
    }
    if (T >= 2) {
      // 侍大将から：太刀の柄頭と鐺に金具、鞘に下緒
      // 大滝寺の一益：大小の鐺も鍔・縁・頭と同じ鉄色で補う。
      // 刀剣博物館の実用刀の材料を参考にした復元案で、本人の所用品の特定ではない。
      // https://www.touken.or.jp/museum/sword/tousougu.html
      // 画質「高」の専用装備だけ。既存の形を腰へ結合・保存し、材質や毎コマの処理は増やさない。
      const ironKojiri = S.quality === 'high' && o.crest === 'takigawa_buffalo';
      if (!emptySaya && !drawnAikuchi) {
        // 大滝寺の一益：納刀時も抜刀用の刀・脇差と同じ鉄色の柄頭にする。
        // 刀剣博物館「刀装・刀装具」の実用刀の材料を参考にした復元で、所用品の特定ではない。
        // https://www.touken.or.jp/museum/sword/tousougu.html
        // 保存する腰の形へ結合し、近景・遠景と指揮中で共有する。
        const ironKashira = S.quality === 'high' && o.crest === 'takigawa_buffalo';
        parts.push(P(grip(pt(0.245), pt(0.265), 0.018, 0.017, h0[0], hi ? 8 : 4),
          ironKashira ? 0x2a2622 : gold, { mk: ironKashira ? MK.iron : MK.gold }));
      }
      if (!drawnAikuchi) {
        const kojiri = limb(pt(end), pt(end + 0.04), 0.0175, 0.017, hi ? 8 : 4);
        if (oval !== 1) kojiri.translate(-h0[0], 0, 0).scale(oval, 1, 1).translate(h0[0], 0, 0);
        parts.push(P(kojiri, ironKojiri ? 0x2a2622 : gold,
          ironKojiri ? { mk: MK.iron, reg: 'iron' } : { mk: MK.gold }));
      }
      // 脇差：太刀の内に、短く、柄を前へ
      const w0 = [(named ? -0.235 : -0.17) * r0, 0.95, 0.12];
      const dw = new THREE.Vector3(named ? 0 : 0.2, named ? 0.4 : 0.12, 1).normalize();
      // 大滝寺の一益：脇差も反りのある鞘で補う。反りの量・金具は所用品の実測ではない。
      // 刀剣博物館の大小・刀装の解説を参考にした復元。長い鞘と同じ曲率で、短い分だけ浅くする。
      // https://www.touken.or.jp/museum/sword/making.html
      // https://www.touken.or.jp/museum/sword/tousougu.html
      const shortSori = named ? sori : 0;
      const wp = (k) => {
        const bend = k < 0 ? shortSori * (k / end) ** 2 : 0;
        return [w0[0] + dw.x * k, w0[1] + dw.y * k - dw.z * bend, w0[2] + dw.z * k + dw.y * bend];
      };
      let shortSaya;
      if (shortSori) {
        // 初めに一度だけ曲げて腰へ結合する。近景・遠景と納刀中で保存済みの形を使う。
        shortSaya = new THREE.CylinderGeometry(.015, .013, 1, hi ? 6 : 4, 6);
        const pos = shortSaya.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const k = (pos.getY(i) - .5) * .45, c = wp(k);
          const slope = 2 * shortSori * k / (end * end);
          const ty = dw.y - dw.z * slope, tz = dw.z + dw.y * slope, len = Math.hypot(ty, tz);
          const radial = pos.getZ(i);
          pos.setXYZ(i, c[0] + pos.getX(i), c[1] - tz / len * radial, c[2] + ty / len * radial);
        }
        shortSaya.computeVertexNormals();
      } else shortSaya = limb(wp(-0.45), wp(0), 0.013, 0.015, hi ? 6 : 4);
      if (oval !== 1) shortSaya.translate(-w0[0], 0, 0).scale(oval, 1, 1).translate(w0[0], 0, 0);
      parts.push(P(shortSaya, 0x14110e, { mk: MK.lac, reg: 'lacq' }));
      sayaKoiguchi(wp, w0[0], .017);
      if (hasSayaCord && tsukaOval !== 1) {
        // 大滝寺の一益：脇差にも栗形と下緒を補う。長い刀の抜刀中も腰に残す。
        // 刀剣博物館の打刀拵の部位を参考にした復元で、所用品の位置・結び方ではない。
        // 大小で同じ組み立てを使い、腰の保存済み形へ結合する。毎コマの処理は足さない。
        sayaCord(wp, dw, shortSori, .015, -.10, [w0[0] + .055, .97, w0[2] - .025], .08);
      }
      if (shortSori) {
        const shortKojiri = limb(wp(-.45), wp(-.425), .014, .0135, hi ? 8 : 4);
        if (oval !== 1) shortKojiri.translate(-w0[0], 0, 0).scale(oval, 1, 1).translate(w0[0], 0, 0);
        parts.push(P(shortKojiri, ironKojiri ? 0x2a2622 : gold,
          ironKojiri ? { mk: MK.iron, reg: 'iron' } : { mk: MK.gold }));
      }
      parts.push(P(grip(wp(0.015), wp(0.16), 0.014, 0.013, w0[0], hi ? 6 : 4), 0x2a2420, { reg: 'cord' }));
      gripWindows(wp, dw, .043, .027, 4, .014);
      gripMekugi(wp, .043, .014, .0023);
      gripMenuki(wp, dw, .014, .06, .115);
      // 大滝寺の一益：脇差の金色の丸鍔を、打刀と揃う薄い鉄の鍔へ補う。
      // 刀剣博物館「刀装・刀装具」の実用刀の鉄・銅を参考にした復元。本人の所用品とは断定しない。
      // https://www.touken.or.jp/museum/sword/tousougu.html
      // 画質「高」だけ。既存の腰へ結合し、納刀中も抜刀中も保存済みの形を使う。
      const shortIronTsuba = S.quality === 'high' && o.crest === 'takigawa_buffalo';
      const shortTsubaThickness = shortIronTsuba ? .006 : .01;
      gripSeppa(wp, w0[0], shortTsubaThickness, .020);
      if (tsukaOval !== 1) {
        // 腰の形へ一度だけ結合し、納刀・抜刀と近景・遠景で使い回す。
        parts.push(P(grip(wp(shortIronTsuba ? shortTsubaThickness + .003 : .01), wp(.03), .015, .015, w0[0], hi ? 8 : 4), 0x2a2622, { mk: MK.iron }));
        parts.push(P(grip(wp(.15), wp(.17), .014, .0135, w0[0], hi ? 8 : 4), 0x2a2622, { mk: MK.iron }));
      }
      if (hi) {
        const tsuba = limb(wp(0), wp(shortTsubaThickness), .028, .028, shortIronTsuba ? 18 : 10);
        if (shortIronTsuba) tsuba.translate(-w0[0], 0, 0).scale(.88, 1, 1).translate(w0[0], 0, 0);
        parts.push(P(tsuba, shortIronTsuba ? 0x2a2622 : gold,
          shortIronTsuba ? { mk: MK.iron, reg: 'iron' } : { mk: MK.gold }));
      }
    }
  } else if (T === 0 && hi) {
    // 胴締め：胴の裾の上に白い布の帯を巻き、左の前で結んで端を垂らす（大小はこの帯に差す。雑兵物語の足軽）
    {
      const bt = new THREE.CylinderGeometry(0.19 * r0, 0.192 * r0, 0.05, 24, 1, true); bt.scale(1, 1, 0.83);
      parts.push(P(at(bt, 0, 0.905, 0), 0xd2c9b2, { reg: 'cloth', dirt: 0.8 }));
      const bt2 = new THREE.CylinderGeometry(0.193 * r0, 0.193 * r0, 0.012, 24, 1, true); bt2.scale(1, 1, 0.83);
      parts.push(P(at(bt2, 0, 0.912, 0), 0xb8ae96, { reg: 'cloth', dirt: 0.8 }));
      parts.push(P(at(ball(0.026, 0.022, 0.016, 8, 5), -0.06, 0.905, 0.163 * r0), 0xd2c9b2, { reg: 'cloth', dirt: 0.8 }));
      for (const [dx, a] of [[-0.075, 0.25], [-0.05, -0.12]]) parts.push(P(at(new THREE.BoxGeometry(0.03, 0.12, 0.006), dx, 0.84, 0.168 * r0, -0.08, 0, a), 0xd2c9b2, { reg: 'cloth', dirt: 0.9 }));
    }
    // 打刀：脇差の外に、柄を前へ（鍔は帯の前）。鞘は後ろへ下がる
    {
      const h0 = [-0.2 * r0, 0.92, 0.1];
      const d = new THREE.Vector3(0.1, 0.42, 1).normalize();
      const pt = (k) => [h0[0] + d.x * k, h0[1] + d.y * k, h0[2] + d.z * k];
      parts.push(P(limb(pt(-0.7), pt(0), 0.0155, 0.0175, 5), 0x16130f, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(limb(pt(0.012), pt(0.22), 0.016, 0.0145, 5), 0x2e261e, { reg: 'cord' }));
      parts.push(P(limb(pt(-0.002), pt(0.01), 0.034, 0.034, 10), 0x2a2622, { mk: MK.iron }));
      parts.push(P(limb(pt(0.215), pt(0.232), 0.0155, 0.014, 6), 0x3a3430, { mk: MK.iron }));
      parts.push(P(limb(pt(-0.705), pt(-0.68), 0.0158, 0.016, 6), 0x3a3430, { mk: MK.iron }));
    }
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
  }
  parts = PT.torso;
  // 兵糧袋（打飼袋）：米を小分けにして結んだ細長い布の袋を輪にし、左の肩から右の脇へ斜めに掛ける。近くの形だけ
  if (!shared.torso && T === 0 && hi && !o.horo) {
    const C = [[-0.14, 1.5, 0.0], [-0.1, 1.42, 0.172], [-0.01, 1.26, 0.222], [0.1, 1.1, 0.192], [0.2, 0.985, 0.11], [0.238, 0.955, -0.02], [0.2, 0.985, -0.135], [0.1, 1.1, -0.2], [-0.01, 1.26, -0.226], [-0.1, 1.42, -0.178]];
    const cv = new THREE.CatmullRomCurve3(C.map(([x, y, z]) => new THREE.Vector3(x * r0 / 0.94, y, z * r0 / 0.94)), true);
    const N = 11, Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), bc = [0x7e6e50, 0x6c6048, 0x8a7854][(o.vi || 0) % 3];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N, c = cv.getPointAt(t), tn = cv.getTangentAt(t);
      const g = ball(0.034, 0.05, 0.029, 7, 5); q.setFromUnitVectors(Y, tn); g.applyQuaternion(q); g.translate(c.x, c.y, c.z);
      parts.push(P(g, bc, { reg: 'cloth', dirt: 0.9 }));
      const k = cv.getPointAt(i / N), kt = cv.getTangentAt(i / N);
      const kg = new THREE.CylinderGeometry(0.013, 0.013, 0.016, 6); q.setFromUnitVectors(Y, kt); kg.applyQuaternion(q); kg.translate(k.x, k.y, k.z);
      parts.push(P(kg, 0x3a3024, { reg: 'cord' }));
    }
  }
  // 母衣：資料本の竹籠と布の縦じわを残し、頭より細い筒が背から後ろ下へ尾を引く形にする。
  // 遠目も同じ断面と背の受筒を使い、平たい葉や浮いた袋にしない。
  if (o.horo && !shared.back) {
    // 桶狭間は背の中央に立つ楕円の籠。布・竹・緒を同じ寸法で作り、形の共有も保つ。
    const oval = !!o.longHoro;
    const round = o.longHoro === 'round';
    // 桶狭間は資料本の丸い母衣へ寄せる。輪・竹・縁取りも布と同じ断面を使う。
    const HH = HORO_HEIGHT, RX = round ? 0.43 : oval ? 0.25 : 0.16, RZ = round ? 0.38 : oval ? 0.23 : 0.12;
    const CY = HORO_TOP - HH / 2, back = round ? -0.58 : oval ? -0.43 : HORO_BACK;
    // 白地は生成りにする。赤母衣・黒母衣など、定義された染めの色は保つ。
    const cr = (o.horo >> 16) & 255, cg = (o.horo >> 8) & 255, cb = o.horo & 255;
    const cloth = Math.min(cr, cg, cb) >= 190 && Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 45 ? 0xd9cba7 : o.horo;
    const prof = (t) => (round ? 0.26 : oval ? 0.5 : 0.35) + (round ? 0.74 : oval ? 0.5 : 0.65) * Math.pow(Math.sin(t * Math.PI), round ? 0.65 : 0.25);
    const point = (th, t, frame = false) => {
      // 輪の間だけ布がたわむ。はぎ目の谷は遠目用の形にも残す。
      const slack = Math.abs(Math.sin((t - 0.5) * Math.PI * 3));
      const seam = frame ? 0.98 : 1 - 0.08 * Math.pow(Math.abs(Math.sin(th * 6)), 4);
      const wr = frame ? 1 : 1 + slack * (0.08 * Math.sin(th * 5 + t * 9) + 0.04 * Math.sin(th * 13 - t * 6));
      const r = prof(t) * seam * wr;
      const z = Math.cos(th) * RZ * r;                         // 背側も厚みを残す筒の断面
      const hem = frame ? 0 : Math.pow(t, 5) * (0.009 * Math.sin(th * 5) + 0.005 * Math.sin(th * 9));
      // 籠のない母衣は肩から下へ垂らす。裾を直線で後ろへ伸ばすと硬い板になる。
      const drape = oval ? 0 : 0.16 * t * t;
      const fold = oval || frame ? 0 : Math.sin(th * 7 + t * 3) * 0.018 * Math.sin(t * Math.PI);
      return [Math.sin(th) * RX * r, HH / 2 - t * HH + hem, z + fold - drape];
    };
    // 縦じわは遠目でも残し、分割数は今までと同じにする。
    const hg = surf(hi ? 48 : 24, hi ? 12 : 5, (u, v) => point(u * Math.PI * 2, v));
    // 下の口から中が見えても抜けないよう、裏（面の向きを返した物）も
    // 横に回って下へ進む面は内向きなので、まず表を外向きにそろえる。
    const outer = hg.index.array; for (let i = 0; i < outer.length; i += 3) { const t = outer[i]; outer[i] = outer[i + 2]; outer[i + 2] = t; }
    hg.computeVertexNormals();
    const inner = hg.clone(); const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    inner.scale(0.985, 0.985, 0.985); inner.computeVertexNormals();
    PT.back.push(P(at(hg, 0, CY, back), cloth, { reg: 'horo', flipV: true, dirt: 0.25 }));
    PT.back.push(P(at(inner, 0, CY, back), new THREE.Color(cloth).multiplyScalar(0.55).getHex(), { reg: 'horo', flipV: true, dirt: 0.3 }));
    // 布と同じ断面に竹を沿わせる。裾から見える輪は画質「低」でも残す。
    for (const t of hi ? [0.35, 0.7, 1] : [0.7, 1]) {
      const rg = surf(hi ? 16 : 12, hi ? 4 : 3, (u, v) => {
        const th = u * Math.PI * 2, a = v * Math.PI * 2, q = point(th, t, true);
        return [q[0] + 0.003 * Math.sin(th) * Math.cos(a), q[1] + 0.003 * Math.sin(a), q[2] + 0.003 * Math.cos(th) * Math.cos(a)];
      });
      PT.back.push(P(at(rg, 0, CY, back), 0x9a8152, { reg: 'wood' }));
    }
    // 八本の竹の筋を布のすぐ裏に沿わせる。縦じわの山と裾に骨が見える。
    for (let j = 0; j < 8; j++) {
      const th = j * Math.PI / 4, steps = hi ? 8 : 5;
      for (let i = 0; i < steps; i++) {
        const a = point(th, i / steps, true), b = point(th, (i + 1) / steps, true);
        PT.back.push(P(at(limb(a, b, 0.003, 0.003, 3), 0, CY, back), 0x9a8152, { reg: 'wood' }));
      }
    }
    // 口の縁取りは竹の輪に重ね、赤・白とも布の染めを保つ。
    for (const t of [0, 1]) {
      const edge = surf(hi ? 24 : 12, 2, (u, v) => {
        const q = point(u * Math.PI * 2, t === 0 ? v * 0.018 : 1 - v * 0.018);
        return [q[0] * 1.02, q[1], q[2] - 0.003];
      });
      if (t === 0) {
        const ix = edge.index.array;
        for (let i = 0; i < ix.length; i += 3) { const a = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = a; }
      }
      edge.computeVertexNormals();
      PT.back.push(P(at(edge, 0, CY, back), new THREE.Color(cloth).multiplyScalar(0.7).getHex(), { reg: 'cord' }));
    }
    // 背の受筒は根元を胴に埋め、袋の上の口まで繋ぐ。武将の重ね着と画質「低」でも省かない。
    PT.back.push(P(limb([0, 1.38, -0.18], [0, HORO_TOP, back], 0.025, 0.022, hi ? 8 : 5), 0x3a2c1c, { reg: 'wood' }));
    if (hi) {
      // 左右の肩から袋を留める緒。袋と一緒に揺らし、甲冑の形には手を加えない。
      for (const sd of [-1, 1]) {
        const q = point(sd * Math.PI / 4, 0.08, true);
        PT.back.push(P(limb([sd * 0.18, 1.5, -0.19], [q[0], q[1] + CY, q[2] + back], 0.006, 0.006, 4), 0xb8a078, { reg: 'cord' }));
      }
    }
  }
  // 面頬
  if (o.menpo) { if (!shared.head) menpoParts(o, PT.head, hi); }
  else if (!shared.torso && T >= 1 && hi) {
    // 喉輪
    // 金小札の胴から喉輪の色までは分からない。兜と同じ黒漆の復元色を使い、威糸は保つ。
    const nodowaArmor = o.goldKozane ? (o.helm ?? 0x1c1a1a) : armor;
    parts.push(P(at(arcCyl(0.075, 0.1, 0.05, 8, Math.PI * 0.9, 0), 0, 1.47, 0.01), nodowaArmor, { mk: MK.lac, reg: 'sugake', c2: lace, mk2: MK.cloth, rv: [7 / 8, 1], ru: [0, 0.25] }));
  }
  if (!shared.head && hi && o.detail85) {
    // 首の肌と鎧の間に襟布を挟む。頭の束に含め、描く回数を増やさない。
    PT.head.push(P(at(new THREE.CylinderGeometry(0.077, 0.095, 0.055, 8, 1, true), 0, 1.465, 0.005), under, { mk: MK.cloth, reg: 'cloth' }));
  }
  if (!shared.head) hatParts(o, PT.head, hi);
  // 指物の竿と受筒・合当理
  // 竿は別の組（pole）に入れる：骨の入った人では、受筒を支点に、駆ける・止まる・振り向く勢いで遅れてしなる（背の旗も一緒に）
  if (o.pole && !o.horo) {
    if (!shared.pole) PT.pole.push(P(at(new THREE.CylinderGeometry(0.012, 0.016, 1.6, 5), 0, 2.0, -0.22), 0x897044, { reg: 'wood', swap: true }));
    // 受筒と合当理は胴の固定部（koshi）に入れ、竿だけをしならせる。竿の根元は筒の口へ重ねる。
    if (!shared.koshi) PT.koshi.push(P(at(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), 0, 1.07, -0.22), 0x211b18, { mk: MK.lac, reg: 'lacq' }));
    if (hi && !shared.koshi) PT.koshi.push(P(at(new THREE.BoxGeometry(0.06, 0.03, 0.08), 0, 1.36, -0.20), 0x211b18, { mk: MK.lac }));
  }
  // 名将の胸を浅く平らにし、腰へすぼめる。段・金具・紐も同じ変形で収める。
  if (named && !shared.torso) for (const g of PT.torso) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.88 || y > 1.46) continue;
      const t = Math.min(1, Math.max(0, (y - 0.88) / 0.42));
      p.setX(i, x * (0.86 + 0.05 * t));
      p.setZ(i, z * (0.72 + 0.2 * Math.min(1, Math.abs(x) / (0.25 * r0))));
    }
    g.computeVertexNormals();
  }
  // nohead：頭に付く物（笠・兜・面頬）を除く（軽い形では頭の形の方に入れる）
  // 元の円柱・板・球と色の配列を全身ごとに残さず、結合した部位だけを共有する。
  for (const name of Object.keys(PT)) if (!shared[name]) {
    const list = PT[name];
    const g = partGeo(list);
    geoCache.set(partKeys[name], g);
    PT[name] = g ? [g] : [];
  }
  bodyPartsCache.set(partsKey, PT);
  const list = bodyPartList(PT, grp);
  const g = list.length > 1 ? merge(list) : list[0] || null;
  if (grp && PT[grp]) PT[grp] = g ? [g] : [];
  geoCache.set(ck, g);
  return g;
}

// 脚は太ももと脛の二節（膝で曲がる）。太ももは腰、脛は膝を原点に下へ
// part：'armor' 佩楯と膝の紐だけ（骨の入った人に着せるため）
function thighGeometry(o, hi, part) {
  if (o.nanban && !o.kosode) return nanbanGeometry('thigh', hi, part, 0, { P, at, merge, MK, limb, ball });
  if (o.sohei) return soheiThigh(o, hi);
  const cloth = o.cloth || 0x2b2622, T = o.tier || 0;
  const hd0 = hi && T === 0 && (o.vi || 0) % 2 === 0;   // 足軽の半分は布の佩楯（伊予佩楯）を前に垂らす
  const haidateCloth = T >= 2 ? (o.lace || cloth) : cloth;
  const solidHaidate = S.quality === 'high' && o.crest === 'takigawa_buffalo' && T >= 1;
  // 一益の黒い家地を、先に作った別の武将の威色で共用しない。
  const ac = o.goldKozane ? 0x1c1a1a : o.armor || 0x2a2622;
  const k = 'thigh' + cloth + '|' + T + '|' + (o.armor || 0) + '|' + (hi ? 1 : 0) + (part || '') + (hd0 ? '|h' : '') + '|' + haidateCloth + '|' + solidHaidate + '|' + ac;
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.9, 0.7, 0.5, 0.35][T];
  const b = BUILD[T];
  const P_ = [];
  // 袴の太もも（足軽は細く裾を絞る）
  if (!part) P_.push(P(limb([0, 0.02, 0], [0, -0.4, 0.01], 0.108 * b, 0.084 * b, hi ? 12 : 7, hi), cloth, { reg: 'cloth' }));
  // 佩楯（侍から）：前に小さな板を並べた布
  if (T >= 1) {
    const segments = solidHaidate || hi ? 6 : 3;
    const outer = arcCyl(0.118 * b, 0.112 * b, 0.25, segments, Math.PI * 0.9, 0.15);
    if (solidHaidate) {
      // 大滝寺の一益：小札を縫い付ける家地の裏と縁を補う。
      // https://www.meihaku.jp/curator-tweet/curator-tweet-kogusoku-haidate/
      // 色・厚みは復元案。遠景でも保ち、組み立て時に結合して共有する。
      const inside = outer.clone(), op = outer.attributes.position, ip = inside.attributes.position;
      for (let j = 0; j < ip.count; j++) {
        const x = ip.getX(j), z = ip.getZ(j), scale = 1 - .002 / Math.hypot(x, z);
        ip.setX(j, x * scale); ip.setZ(j, z * scale);
      }
      const index = inside.index.array;
      for (let j = 0; j < index.length; j += 3) {
        const t = index[j]; index[j] = index[j + 2]; index[j + 2] = t;
      }
      inside.computeVertexNormals();
      const positions = [], stride = segments + 1;
      const edge = (a, c) => {
        for (const [p, j] of [[op, a], [op, c], [ip, a], [op, c], [ip, c], [ip, a]])
          positions.push(p.getX(j), p.getY(j), p.getZ(j));
      };
      for (let j = 0; j < segments; j++) {
        edge(j, j + 1); edge(stride + j + 1, stride + j);
      }
      edge(stride, 0); edge(segments, stride + segments);
      const edging = new THREE.BufferGeometry();
      edging.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      edging.computeVertexNormals();
      for (const g of [inside, edging]) P_.push(P(at(g, 0, -0.15, 0.012, 0.06), haidateCloth, { reg: 'cloth' }));
    }
    P_.push(P(at(outer, 0, -0.15, 0.012, 0.06), haidateCloth, { reg: 'haidate', c2: ac, mk2: MK.lac }));
  }
  // 足軽の佩楯：腿の前を覆う布に、小さな漆の板を縫い付けた物（膝の上まで）。腿の丸みに沿う
  if (hd0) P_.push(P(at(arcCyl(0.112 * b, 0.104 * b, 0.27, 5, Math.PI * 0.82, 0.12), 0, -0.2, 0.014, 0.07), cloth, { reg: 'haidate', c2: o.armor || 0x2a2622, mk2: MK.lac }));
  // 膝の紐（細い帯。蓋のある筒にすると膝に円盤が付いて見える）
  P_.push(P(at(new THREE.CylinderGeometry(0.079 * b, 0.077 * b, 0.026, hi ? 12 : 6, 1, true), 0, -0.39, 0.01), 0x3a342c, { reg: 'cord' }));
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}
// part：'leg' 脛当だけ・'coveredLeg' 布を含む脛・'foot' 足だけ（骨の入った人に着せるため）
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
  const named = typeof o.face === 'string' && o.face.startsWith('g:');
  // 金の胴でも臑は黒漆。朱など暗い漆の胴はその色、紐は威の色にそろえる。
  const ac = named && new THREE.Color(o.armor || 0x1c1a1a).getHSL({}).l > 0.18 ? 0x1c1a1a : o.armor || 0x1c1a1a;
  const lc = named ? o.lace || 0x202b3d : 0x202b3d;
  const shinTies = S.quality === 'high' && !!o.shinTies;
  const k = 'shin' + (o.detail85 ? '個体|' : '') + cloth + '|' + T + '|' + (T === 0 ? vi % 3 + '/' + (vi % 4 === 3 ? 0 : 1) : 0) + '|' + ac + '|' + lc + '|' + named + '|' + (hi ? 1 : 0) + (part || '') + '|' + shinTies;
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.95, 0.8, 0.6, 0.45][T];
  const b = BUILD[T];
  const P_ = [];
  // 脛とふくらはぎ
  if (!part || part === 'coveredLeg') P_.push(P(limb([0, 0, 0], [0, -0.3, -0.01], 0.07 * b, 0.05 * b, hi ? 10 : 6, hi && !part), cloth, { reg: 'cloth', flipV: true }));
  if (part === 'foot') { /* 足だけ */ } else if (T === 0 && (!o.detail85 || vi % 3 !== 1)) {
    // 足軽：脚絆（布を巻き、上下を紐で結ぶ）。半分は筒臑当
    const kc = [0x4a4a44, 0x2e3440, 0x5a5244][vi % 3];
    P_.push(P(limb([0, -0.02, 0.0], [0, -0.28, -0.008], 0.074 * b, 0.058 * b, hi ? 10 : 6), kc, { reg: 'cloth', flipV: true }));
    if (hi) for (const y of [-0.04, -0.26]) P_.push(P(at(new THREE.TorusGeometry(y > -0.1 ? 0.074 * b : 0.058 * b, 0.004, 4, 12), 0, y, -0.004, Math.PI / 2), 0x202b3d, { reg: 'cord' }));
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
        for (const y of [-0.055, -0.225]) P_.push(P(at(new THREE.TorusGeometry((y > -0.1 ? 0.079 : 0.068) * b, 0.004, 3, 12), 0, y, -0.004, Math.PI / 2), 0x202b3d, { reg: 'cord' }));
        // 立挙：膝頭を覆う反った板（臑当の上の端から立ち上がる）。下に布の膝の当て
        { const g = arcCyl(0.084 * b, 0.086 * b, 0.075, 4, Math.PI * 0.62, 0); g.translate(0, 0.012, 0.004); g.rotateX(-0.12); P_.push(P(g, ac, { mk: MK.lac, reg: 'okeV', rv: [0.75, 1], swap: true, flipV: true, c2: 0x4a2a1a, mk2: MK.lac })); }
      } else P_.push(P(at(arcCyl(0.08 * b, 0.064 * b, 0.22, 4, Math.PI * 0.95, 0), 0, -0.14, -0.004), ac, { mk: MK.lac, reg: 'lacq' }));
    }
  } else if (T >= 1) {
    // 侍：篠臑当（縦の鉄の篠を鎖でつなぐ）。侍大将から膝に立挙
    P_.push(P(at(arcCyl(0.078 * b, 0.062 * b, 0.26, hi ? 8 : 4, Math.PI * 1.05, 0), 0, -0.14, -0.006), lc, { mk: MK.cloth, reg: 'shino', c2: named ? ac : 0x2e3236, mk2: named ? MK.lac : MK.iron, flipV: false }));
    if (hi || shinTies) for (const y of [-0.015, -0.265]) {
      const radius = (y > -0.1 ? 0.078 : 0.062) * b;
      P_.push(P(at(new THREE.TorusGeometry(radius, 0.0045, 4, 12), 0, y, -0.006, Math.PI / 2), lc, { mk: MK.cloth, reg: 'cord' }));
      if (shinTies) {
        // 大滝寺の一益：輪だけの緒に、後ろで留める結びと短い端を補う。
        // 色・位置・結び方は復元案。近景・遠景とも脛の形へ結合し、材質と形を使い回す。
        // 小具足の構造の参考：https://www.meihaku.jp/curator-tweet/curator-tweet-kogusoku-suneate/
        const z = -radius - .012;
        for (const sd of [-1, 1]) {
          P_.push(P(limb([-sd * .012, y + .009, z], [sd * .012, y - .009, z], .005, .005, 4), lc, { reg: 'cord' }));
          P_.push(P(limb([sd * .008, y - .004, z], [sd * .025, y - .043, z - .004], .0045, .0035, 4), lc, { reg: 'cord' }));
        }
      }
    }
    if (T >= 2) P_.push(P(at(arcCyl(0.085 * b, 0.08 * b, 0.08, hi ? 6 : 3, Math.PI * 0.8, 0), 0, 0.03, 0.01, -0.15), ac, { mk: MK.lac, reg: 'lacq' }));
  }
  // 足袋と草鞋：甲のふくらみ、踵、親指の股、藁の底、結んだ紐
  // 足軽の足袋は、白っぽいと運動靴のように浮くので、履き古した紺・茶の暗い色に（人ごとに）
  const tabi = T === 0 ? [0x4a4640, 0x3c3d42][vi % 2] : 0x3a3630;
  if (part === 'leg' || part === 'coveredLeg') { /* 脛だけ */ } else if (hi) {
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
// 乗り手だけ当時の体格へ。腰を支点に縮め、馬の大きさと鞍への着座を保つ。
const riderFit = new THREE.Matrix4().makeScale(0.90, 0.935, 0.935);
riderFit.setPosition(0, 1.43 * (1 - 0.935), 0);
export const RIDE = { y: 0.72, fit: riderFit, unfit: riderFit.clone().invert() };
// 骨の入った本物の馬を動かす道具（humans.js が入れる。読めない時は空のまま＝今の形の馬）
// made：作った馬（humans.js が本物の馬の形に替える。使番・町の馬など、兵でない馬も）
export const HORSE_HOOK = { drive: null, made: [] };
// 馬上の脚：太ももを前へ出し、脛は鐙へ下ろす
export function seatLegs(u) {
  prepareRider(u);
  // 乗せる前に手・旗を 0.95 上げてある形（出世の見本・伝令）は、和種の鞍の高さへ下ろす
  if (!u.rideFix) { u.rideFix = true; for (const part of [u.body, u.hand, u.flag, u.uma]) if (part) part.position.y -= 0.95 - RIDE.y; }
  const y = RIDE.y + 0.71;
  u.legL.position.set(0.16, y, 0); u.legR.position.set(-0.16, y, 0);
  // 外へ開いて馬腹をはさむ。脛の開きは戻し、足を左右の鐙へ下ろす。
  u.legL.rotation.set(-0.65, 0, 0.6); u.legR.rotation.set(-0.65, 0, -0.6);
  if (u.shinL) { u.shinL.rotation.set(0.85, 0, -0.6); u.shinR.rotation.set(0.85, 0, 0.6); }
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
    geoCache.set(sk, merge(stirrupParts().map(([g, color]) =>
      P(at(g.clone(), 0, -0.37, 0.055), color, { mk: MK.lac, reg: 'lacq' }))));
  }
  // 鐙は足と同じ脛の子。元の馬具がある時は二重に描かない。
  const irons = [];
  for (const shin of [u.shinL, u.shinR]) if (shin) {
    const iron = new THREE.Mesh(geoCache.get(sk), MAT); shin.add(iron); irons.push(iron);
  }
  if (!riderReinMat) riderReinMat = new THREE.LineBasicMaterial({ color: 0x35271b });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60), 3).setUsage(THREE.DynamicDrawUsage));
  // 手綱は毎コマ形が動くので、鞍のまわり 3m の球で画面の外かどうかを見る（前は画面の外の騎馬の手綱も一本ずつ描いていた）
  rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3);
  const reins = new THREE.LineSegments(rg, riderReinMat);
  (u.seat || u.mesh).add(reins);
  u.riderModel = { irons, reins };
}

// 腕：肩を原点に真下へ。二の腕・前腕・手。籠手（鎖と篠）を着けるか、袖をたくし上げて素肌か
// part：'upper' 二の腕の籠手・'fore' 前腕の籠手・'hand' 手甲だけ（骨の入った人に着せるため）
// 本人の籠手（前腕と手甲）：一人称で目の前に来るので、丸みのある前腕の形（肘の下の膨らみ・手首へ細く・断面はやや平たい）に、
//   布の手甲の袋を縫い、侍は鎖を編んで篠（細い鉄の板）を五本、足軽は篠を三本外に当てる。紐は細い焦茶
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
      // 足軽の篠三本。元の一枚板より面数を減らす。
      for (let i = -1; i <= 1; i++) P_.push(P(surf(3, 6, (s, v) => ring(thc + i * 0.65 - (s - 0.5) * 0.28, 0.07 + v * 0.8, 0.0035 + 0.003 * Math.sin(Math.PI * s))), o.armor || 0x2e3236, { mk: MK.lac, reg: 'lacq' }));
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
  // 大滝寺の一益：高画質では遠景も肘金と三本の篠を残す。
  // 黒漆の仕上げは一般的な籠手による復元で、本人の所用品の特定ではない。
  // https://www.meihaku.jp/curator-tweet/curator-tweet-kogusoku-kote/
  const fullKote = S.quality === 'high' && o.crest === 'takigawa_buffalo' && T >= 1;
  const kc = T >= 2 ? (o.lace || cloth) : cloth;
  // 別の武将の威色や鉄地の部品を、一益の黒い家地・黒漆へ混ぜない。
  const handArmor = o.goldKozane ? 0x1c1a1a : o.armor || 0x1c1a1a;
  const k = 'arm' + (o.detail85 ? '個体|' : '') + skin + '|' + cloth + '|' + sd + '|' + (kote ? 1 : 0) + '|' + T + '|' + (hi ? 1 : 0) + (part || '') + (T === 0 && kote ? '|' + (o.armor || 0) : '') + (fullKote ? '|黒漆籠手|' + kc + '|' + (o.armor || 0x1c1a1a) : '') + (T >= 2 && kote ? '|' + handArmor + '|' + kc : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? [0.8, 0.55, 0.4, 0.3][T];
  const b = BUILD[T];
  const P_ = [];
  const seg = hi ? 10 : 6;
  const plateColor = fullKote ? (o.armor || 0x1c1a1a) : 0x2e3236;
  const plateFinish = fullKote ? { mk: MK.lac, reg: 'lacq' } : { mk: MK.iron, reg: 'iron' };
  // 肩の丸み
  if (!part) P_.push(P(at(ball(0.068 * b, 0.075, 0.068 * b, hi ? 10 : 6, 6), 0, -0.02, 0), kote ? kc : cloth, { reg: kote && T >= 1 ? 'kote' : 'cloth', c2: 0x2e3236, mk2: MK.iron }));
  if (kote && part !== 'hand') {
    if (part !== 'fore') P_.push(P(limb([0, -0.02, 0], [0, -0.27, 0], 0.058 * b, 0.05 * b, seg), kc, { reg: T === 0 ? 'cloth' : 'kote', c2: 0x2e3236, mk2: MK.iron }));
    if ((hi || fullKote) && part !== 'fore') P_.push(P(at(ball(0.034, 0.03, 0.022, 8, 5), 0, -0.27, -0.034), T === 0 ? (o.armor || 0x2e3236) : plateColor, T === 0 ? { mk: MK.lac, reg: 'lacq', c2: 0x4a2a1a, mk2: MK.lac } : plateFinish));   // 肘金
    // 足軽の御貸具足の籠手：二の腕の外に小さな板（家の色の漆）を二枚
    if (hi && T === 0 && part !== 'fore' && part !== 'upper') for (const y of [-0.1, -0.18]) P_.push(P(at(arcCyl(0.062 * b, 0.058 * b, 0.06, 3, Math.PI * 0.45, sd * Math.PI / 2), 0, y, 0), o.armor || 0x2e3236, { mk: MK.lac, reg: 'okeV', rv: [0.25, 0.5], swap: true, c2: 0x4a2a1a, mk2: MK.lac }));
    if (part !== 'upper') P_.push(P(limb([0, -0.27, 0], [0, -0.5, 0], 0.05 * b, 0.041 * b, seg), kc, { reg: T === 0 ? 'cloth' : 'kote', c2: 0x2e3236, mk2: MK.iron }));
    // 篠（前腕の外側に細い鉄の板）
    // 足軽：家地に三本の篠。遠くは同じ一枚の形に五本の篠の絵を貼る。
    if (part !== 'upper' && T === 0) {
      const th = sd * Math.PI / 2 + Math.PI * 0.12 * sd;
      if (hi) for (const da of [-0.65, 0, 0.65]) {
        const a = th + da;
        P_.push(P(at(new THREE.BoxGeometry(0.014, 0.19, 0.006), Math.sin(a) * 0.052 * b, -0.385, Math.cos(a) * 0.052 * b, 0, a), o.armor || 0x2e3236, { mk: MK.lac, reg: 'lacq' }));
      } else P_.push(P(at(arcCyl(0.056 * b, 0.047 * b, 0.2, 2, Math.PI * 0.95, th), 0, -0.385, 0), kc, { reg: 'shino', c2: o.armor || 0x2e3236, mk2: MK.lac }));
    } else if (part !== 'upper') for (const a of hi || fullKote ? [-0.45, 0, 0.45] : [0]) {
      const th = sd * Math.PI / 2 + a + Math.PI * 0.15 * sd;
      P_.push(P(at(new THREE.BoxGeometry(0.013, 0.2, 0.006), Math.sin(th) * 0.048 * b, -0.385, Math.cos(th) * 0.048 * b, 0, th, 0), plateColor, plateFinish));
    }
    if (part !== 'upper') P_.push(P(at(new THREE.CylinderGeometry(0.042 * b, 0.042 * b, 0.02, seg), 0, -0.5, 0), o.detail85 ? 0x2e3236 : 0x3a342c, o.detail85 ? { mk: MK.iron, reg: 'iron' } : { reg: 'cord' }));
  } else if (!part) {
    // 袖を肘までたくし上げ、前腕は素肌。手首に布を巻く
    P_.push(P(limb([0, -0.02, 0], [0, -0.26, 0], 0.062 * b, 0.056 * b, seg), cloth, { reg: 'cloth' }));
    P_.push(P(at(new THREE.TorusGeometry(0.055 * b, 0.012, 5, seg), 0, -0.265, 0, Math.PI / 2), cloth, { reg: 'cloth' }));
    P_.push(P(limb([0, -0.27, 0], [0, -0.5, 0], 0.045 * b, 0.034 * b, seg, hi), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(new THREE.CylinderGeometry(0.038 * b, 0.038 * b, 0.03, seg), 0, -0.49, 0), 0x8a8270, { reg: 'cloth' }));
  }
  if (part === 'hand') {
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), 0, -0.54, -0.027, 0.1), T >= 2 || T === 0 ? handArmor : 0x2e3236, { mk: T >= 2 || T === 0 ? MK.lac : MK.iron, reg: 'lacq' }));
  } else if (part) { /* 籠手だけ */ } else if (hi) {
    // 手：握った拳（掌・指の列と節・親指）。籠手なら甲に手甲
    const hx = 0;
    P_.push(P(at(ball(0.035 * b, 0.044, 0.027, 8, 6), hx, -0.545, 0), skin, { mk: MK.skin, reg: 'skin' }));
    const fr = new THREE.CylinderGeometry(0.018, 0.018, 0.066 * b, 8); fr.rotateZ(Math.PI / 2);
    P_.push(P(at(fr, hx, -0.578, 0.014), skin, { mk: MK.skin, reg: 'skin' }));
    for (let i = 0; i < 4; i++) P_.push(P(at(ball(0.0105, 0.011, 0.011, 6, 4), hx + (i - 1.5) * 0.017 * b, -0.565, 0.028), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(limb([-sd * 0.028, -0.528, 0.012], [-sd * 0.02, -0.574, 0.032], 0.0115, 0.0095, 6), skin, { mk: MK.skin, reg: 'skin' }));
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), hx, -0.54, -0.027, 0.1), T >= 2 || T === 0 ? handArmor : 0x2e3236, { mk: T >= 2 || T === 0 ? MK.lac : MK.iron, reg: 'lacq' }));
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
    if (H.bitN) _rBit.set(sd * H.bitN.x, H.bitN.y, H.bitN.z); else _rBit.set(sd * 0.08, 0.47, 0.73);
    _rBit.applyEuler(H.neck.rotation).add(H.neck.position).multiplyScalar(HORSE_K);
    _rBit.y -= H.body.position.y * HORSE_K;
    _rBit.applyAxisAngle(_rAxis, -H.body.rotation.x);
    if (!u.isPlayer) _rBit.applyMatrix4(RIDE.unfit);
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
    // 馬の胴にも舌長鐙がある。馬を伴わない見本だけ脛の鐙を出す。
    for (const iron of u.riderModel.irons) iron.visible = on && !H;
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
  } else if ((w === 'spear' || w === 'gun') && rx < -0.4
    && !(w === 'spear' && (u.spearSupport || u.contactBrace > 0.1 || u.atk || u.swing || u.guard || u.guarding > 0 || u.guardFlash > 0))) {
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
  const u8 = (s) => { if (s instanceof Uint8Array) return s; const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const pos = new Float32Array(u8(D.P).buffer), nor = new Float32Array(u8(D.N).buffer), C = u8(D.C), K = u8(D.K), I = new Uint16Array(u8(D.I).buffer);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  // 素材の座標が拵えの寸法から外れていたら、実寸の共通形へ戻す。
  // 読み込み時の一度だけ調べ、巨大な白い刃や金具を戦場へ出さない。
  g.computeBoundingBox();
  const b = g.boundingBox;
  if ((key === 'sword' || key === 'gun') &&
      (!Number.isFinite(b.min.x + b.min.y + b.min.z + b.max.x + b.max.y + b.max.z) ||
       b.max.x - b.min.x > (key === 'sword' ? 0.18 : 0.35) ||
       b.max.y - b.min.y > (key === 'sword' ? 0.22 : 0.45) ||
       b.max.z > (key === 'sword' ? 1.05 : 1.3) || b.min.z < -0.5)) {
    g.dispose();
    return REALW[key] = key === 'sword' ? swordGeometry() : gunGeometry();
  }
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
  // 穂は長さ一・幅と厚みは±一、石突は後端から根元までの一に収める。
  // 元素材の余白や倍率を引き継がず、同じ金具の形を全兵で共有する。
  g.computeBoundingBox();
  const b = g.boundingBox;
  const dx = Math.max(0.0001, b.max.x - b.min.x), dy = Math.max(0.0001, b.max.y - b.min.y);
  const dz = Math.max(0.0001, b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) * 0.5, -(b.min.y + b.max.y) * 0.5, key === 'yariButt' ? -b.max.z : -b.min.z);
  g.scale(2 / dx, 2 / dy, 1 / dz);
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
  // 名古屋刀剣博物館「槍が描かれた浮世絵」の利家の伝承（現物は伝わらない）。寸法は既存の三間半に揃える。
  // https://www.meihaku.jp/ukiyoe-basic/yari-ukiyoe/
  mataza: { L: 6.3, grip: 1.9, ho: 'sankaku', hoL: 0.16, r: 0.02, bend: 1.15, shaft: 0xa52b1c }, // 利家の朱柄
  tonbo: { L: 4.0, grip: 1.15, ho: 'omi', hoL: 0.44, r: 0.019, bend: 0.55 },      // 蜻蛉切：穂一尺四寸余の笹穂、柄は長い（本多忠勝）
  jumonji: { L: 3.0, grip: 0.95, ho: 'jumonji', hoL: 0.26, r: 0.017, bend: 0.42 },  // 十文字槍：穂の根元の両脇に鎌刃
  nagae: { L: 5.4, grip: 1.6, ho: 'sankaku', hoL: 0.16, r: 0.019, bend: 1 },       // 足軽の長柄（三間）
  nagae35: { L: 6.3, grip: 1.9, ho: 'sankaku', hoL: 0.16, r: 0.02, bend: 1.15 },   // 織田の長柄（三間半）
  // 利家の愛槍は現存しない。三間半の朱柄という伝承を、既存の長柄と同じ作りで補う。
  // 名古屋刀剣博物館「槍が描かれた浮世絵」 https://www.meihaku.jp/ukiyoe-basic/yari-ukiyoe/
  maeda_shu: { L: 6.3, grip: 1.9, ho: 'sankaku', hoL: 0.16, r: 0.02, bend: 1.15, shaft: 0x9e2a1e },
};
export function spearSpec(v, extra = 0) {
  if (SPEARS[v]) return SPEARS[v];
  const L = 4.2 + extra;
  return { L, grip: L * 0.3, ho: 'sankaku', hoL: 0.17, r: 0.018, bend: L / 5.4 };
}
// 槍：柄は三つに分け、節で曲げてしなりを出す（近くの兵だけ。遠くは一つの形）
function spearGeometry(sp) {
  const k = 'spear|' + sp.L + '|' + sp.ho + '|' + (sp.shaft ?? '') + (realOn() ? '' : '|old');
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
  // 朱柄の指定も形のキャッシュへ含め、足軽の同じ長さの槍へ色を持ち越さない。
  // 黒一色の線にせず、拭き漆の下の木地を残す。朱柄だけは指定色を保つ。
  const shaftColor = sp.shaft ?? 0x66503a;
  const shaft = (i, a, b) => sec[i].push(P(at(new THREE.CylinderGeometry(rad(b), rad(a), b - a, 7, 1, true), 0, 0, (a + b) / 2, Math.PI / 2), shaftColor, { mk: sp.shaft != null ? MK.lac : MK.wood, reg: 'wood', swap: true }));
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
function swordGeometry(extra = 0, mount) {
  const odachi = extra > 0;
  const aikuchi = mount === 'kenshin_aikuchi';
  const k = (odachi ? 'w-odachi|' + extra : 'w-katana') + (aikuchi ? '|謙信合口' : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.25;
  const parts = [];
  // 大太刀も一度だけ形を作り、同じ得物の武将どうしで共有する。
  const Lb = 0.7 + extra, zb = 0.1, sori = odachi ? 0.034 : 0.07;
  const bl = P(loft(KATANA, 26, (v) => {
    const w = (odachi ? 0.025 : 0.0155) - 0.0045 * v, tip = v > 0.93 ? Math.sqrt(Math.max(0, (1 - v) / 0.07)) : 1;
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
  // 謙信の伝来拵を参考にする時だけ鍔を付けない。刃と握る位置は共通。
  if (!aikuchi) {
    // 鍔：少し縦長の丸い鉄鍔
    const tb = new THREE.CylinderGeometry(0.037, 0.037, 0.006, 18); tb.scale(0.88, 1, 1);
    parts.push(P(at(tb, 0, 0.002, 0.063, Math.PI / 2), 0x2a2622, { mk: MK.iron, reg: 'iron' }));
  }
  // 柄：楕円の断面。柄糸を菱に巻き、窓から白い鮫皮がのぞく
  const grip = odachi ? 0.65 : 0.25;
  const ts = new THREE.CylinderGeometry(0.0132, 0.0148, grip, 10); ts.scale(1, 1, 1.28);
  parts.push(P(at(ts, 0, 0, 0.062 - grip / 2, Math.PI / 2), aikuchi ? 0x202c40 : 0x1d1a18, { reg: 'cord', swap: true }));
  if (!aikuchi) for (const sd of [-1, 1]) for (let i = 0; i < (odachi ? 19 : 7); i++) parts.push(P(at(new THREE.BoxGeometry(0.002, 0.0105, 0.0105), sd * 0.0126, 0, 0.04 - i * 0.034, Math.PI / 4), 0xd8d2c0, {}));
  // 藍韋平巻は白い菱窓を開けず、巻き目を柄へ結合する。作成後の形は共有する。
  if (aikuchi) for (let i = 0; i < 9; i++) {
    const band = new THREE.CylinderGeometry(0.0136, 0.0152, 0.006, 10, 1, true);
    band.scale(1, 1, 1.28);
    parts.push(P(at(band, 0, 0, 0.047 - i * 0.026, Math.PI / 2), 0x29374c, { reg: 'cord' }));
  }
  // 目貫（金の飾り）と柄頭
  parts.push(P(at(ball(0.004, 0.007, 0.014, 6, 4), 0.014, 0.002, -0.03), 0xc9a24a, { mk: MK.gold }));
  parts.push(P(at(ball(0.004, 0.007, 0.014, 6, 4), -0.014, 0.002, aikuchi ? -0.03 : -0.09), 0xc9a24a, { mk: MK.gold }));
  const kz = new THREE.CylinderGeometry(0.0145, 0.016, 0.022, 10); kz.scale(1, 1, 1.28);
  parts.push(P(at(kz, 0, 0, 0.052 - grip, Math.PI / 2), 0x2a2622, { mk: MK.iron }));
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
function weaponGeometry(kind, extra = 0, sk, swordMount) {
  if (kind === 'spear') return spearGeometry(spearSpec(sk, extra)).full;
  if (kind === 'sword') return swordGeometry(extra, swordMount);
  if (kind === 'gun') return gunGeometry();
  if (kind === 'bow') return bowGeometry(0);
  const k = 'w-none';
  if (!geoCache.has(k)) geoCache.set(k, merge([P(new THREE.BoxGeometry(0.01, 0.01, 0.01), 0x000000)]));
  return geoCache.get(k);
}
export function makeWeapon(kind, extra = 0, sk, swordMount) {
  const m = new THREE.Mesh(weaponGeometry(kind, extra, sk, swordMount), MAT);
  m.userData.kind = kind;
  // 鉄砲・刀：近い兵と自分は本物の形、遠い兵は自前の形（まとめて描く時も userData.lod で選ぶ）
  // 指定の拵えを、近景用の汎用の鍔付き刀へ戻さない。共通の材質で細部まで描く。
  if ((kind === 'gun' || (kind === 'sword' && !extra && !swordMount)) && realOn()) lodSwap(m, realWeapon(kind), m.geometry);
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
  const front = saddleBow(0.24, 0.39, 0.12, 0.14).clone();
  Q.push(P(at(front, 0, 1.56, 0.25, -0.2), st.saddle, { mk: MK.lac, reg: 'lacq' }));
  const back = saddleBow(0.26, 0.35, 0.12, 0.13).clone();
  Q.push(P(at(back, 0, 1.56, -0.22, 0.35), st.saddle, { mk: MK.lac, reg: 'lacq' }));
  // 障泥：胴に沿って曲がる革の垂れ（左右）
  for (const sd of [1, -1]) {
    // 裾の両端は短くして角を丸める（四角い板に見せない）
    const ao = surf(6, 4, (u, v) => { const vv = v * (1 - 0.3 * Math.pow(Math.abs(2 * u - 1), 4)); return [sd * (0.29 + Math.sin(vv * Math.PI * 0.7) * 0.04 + vv * Math.sin(u * Math.PI * 4) * 0.009), 1.5 - vv * 0.4 + vv * vv * Math.cos(u * Math.PI * 2) * 0.012, (u - 0.5) * 0.52 + 0.02]; });
    const back = ao.clone(), ix = back.index;
    Q.push(P(ao, st.aori, { reg: 'cloth', mk: MK.cloth }));
    for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
    back.computeVertexNormals(); Q.push(P(back, st.aori, { reg: 'cloth', mk: MK.cloth }));
    // 鐙（舌長の鐙）と力革
    Q.push(P(limb([sd * 0.22, 1.58, 0.1], [sd * 0.37, 1.18, 0.15], 0.012, 0.012, 4), st.tack, { reg: 'cord' }));
    for (const [g, color] of stirrupParts()) Q.push(P(at(g.clone().scale(1.2, 1.2, 1.2), sd * 0.37, 0.94, 0.09), color, { mk: MK.lac, reg: 'lacq' }));
  }
  // 鞍につながる胸繋・尻繋と房。元の輪と房は重ねず置き換える。
  for (const [g, fringe] of harnessParts(true)) {
    if (fringe && !st.tassels) continue;
    Q.push(P(g.clone(), fringe ? st.tassels : st.tack, { reg: 'cord', mk: MK.cloth }));
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
  // 裾を毛束に分ける。同じ尾の形にまとめ、描く回数は増やさない。
  for (let i = -1; i <= 1; i++) {
    Q.push(P(limb([i * 0.025, -0.5, -0.14], [i * 0.037, -0.86 + Math.abs(i) * 0.05, -0.09], 0.022, 0.003, 5), st.mane, { reg: 'hair' }));
  }
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
    saddle: 0x111010,
    rim: rank >= 2 ? 0xc9a24a : 0,
    cushion: F.cushion,
    // 大将の障泥は濃い茶の革。ほぼ黒（0x241a12）だと、馬の腹の下に黒い四角が貼り付いて見えた（森部 10/25）
    aori: rank >= 2 ? 0x5a3c24 : 0x3a2e22,
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
    P.push(paint(at(saddleBow(0.24, 0.39, 0.12, 0.14).clone(), 0, 1.56, 0.25, -0.2), st.saddle));
    P.push(paint(at(saddleBow(0.26, 0.35, 0.12, 0.13).clone(), 0, 1.56, -0.22, 0.35), st.saddle));
    // 障泥（泥よけの垂れ）と鐙
    for (const sx of [0.29, -0.29]) {
      const cloth = surf(2, 2, (u, v) => [sx + Math.sign(sx) * Math.sin(v * Math.PI * 0.7) * 0.035, 1.49 - v * 0.42 + v * v * Math.cos(u * Math.PI * 2) * 0.012, (u - 0.5) * 0.5 + 0.02]);
      const back = cloth.clone(), ix = back.index;
      for (let j = 0; j < ix.count; j += 3) { const k = ix.getX(j); ix.setX(j, ix.getX(j + 1)); ix.setX(j + 1, k); }
      back.computeVertexNormals(); P.push(paint(cloth, st.aori), paint(back, st.aori));
      // 遠くは舌と鳩胸だけ。形は胴の一枚へ混ぜる。
      for (const [g, color] of stirrupParts().slice(0, 2)) P.push(paint(at(g.clone().scale(1.2, 1.2, 1.2), Math.sign(sx) * 0.37, 0.94, 0.09), color));
      P.push(paint(limb([Math.sign(sx) * 0.22, 1.58, 0.1], [Math.sign(sx) * 0.37, 1.18, 0.15], 0.012, 0.012, 4), st.tack));
    }
    // 遠くも胸繋・尻繋を鞍へつなぎ、胸と尻に房を分ける。
    for (const [g, fringe] of harnessParts()) {
      if (fringe && !st.tassels) continue;
      P.push(paint(g.clone(), fringe ? st.tassels : st.tack));
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
    P.push(paint(at(new THREE.TorusGeometry(0.085, 0.009, 4, 10), 0, 0.53, 0.63, 0.55), st.tack));
    P.push(paint(at(new THREE.TorusGeometry(0.1, 0.009, 4, 10), 0, 0.71, 0.3, 0.9), st.tack));
    for (const sd of [1, -1]) {
      P.push(paint(limb([sd * 0.095, 0.72, 0.3], [sd * 0.08, 0.52, 0.62], 0.009, 0.009, 4), st.tack));
      P.push(paint(limb([sd * 0.08, 0.47, 0.68], [sd * 0.13, 0.22, 0.12], 0.008, 0.008, 4), st.tack));
      P.push(paint(limb([sd * 0.13, 0.22, 0.12], [sd * 0.1, 0.2, -0.38], 0.008, 0.008, 4), st.tack));
    }
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
      const up = new THREE.LatheGeometry([[0.045, -0.5], [0.06, -0.36], [front ? 0.085 : 0.11, -0.15], [front ? 0.1 : 0.13, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
      up.scale(1, 1, front ? 1.1 : 1.35);
      P.push(paint(at(up, 0, 0, front ? 0 : -0.03), c));
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
  tail.add(mergedMesh('ht' + st.mane + '|' + c, (P) => {
    // 軽い尾も板や一本の棒にせず、三つの立体の毛束にする。
    for (let i = -1; i <= 1; i++) {
      P.push(paint(limb([i * 0.018, 0, 0], [i * 0.035, -0.8 + Math.abs(i) * 0.06, -0.12], 0.034, 0.005, 5), st.mane));
    }
  }, (Q) => horseTailHi(Q, st)));
  tail.rotation.x = 0.35;
  shape.add(tail);
  if (HORSE_HOOK.made.length < 400) HORSE_HOOK.made.push(root);
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
    // 基本形は静止中も飛節を少し折る。本物の馬から切り出した形には元の曲がりがある。
    const rest = h.userData.px ? 0 : (1 - moving) * (i < 2 ? 0.04 : 0.16);
    w += i < 2 ? rest : -rest;
    const kw = (i < 2 ? -lift : lift * 0.8) + (i < 2 ? -rest * 2 : rest * 2);
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
  for (let k = -2; k <= 12; k++) phs.push(pE0 + (pE1 - pE0) * k / 10);
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
  // 本能寺の小袖は近い姿でも肩と背の丸み・ひだを残す。形は共有する。
  if (o.honnoCloth) hi = true;
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
  PT.torso.push(P(at(ball((o.kosode ? 0.235 : 0.265) * r0, o.kosode ? 0.045 : 0.08, 0.165 * r0, hi ? 16 : 8, hi ? 6 : 4), 0, 1.435, -0.005), robe, { reg: 'cloth' }));
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
    if (o.honnoCloth) {
      // 着せる前に帯と同じ胴の部品へ結びを入れる。骨への変換後も背に付く。
      const back = robePt(Math.PI, 0.98, 0.045)[2];
      PT.torso.push(P(at(ball(0.062, 0.036, 0.03, 10, 6), 0, 0.98, back), o.obi || 0x3a2e26, { reg: 'cloth', dirt: 0.3 }));
      for (const sd of [-1, 1]) PT.torso.push(P(at(ball(0.028, 0.08, 0.018, 8, 5), sd * 0.035, 0.91, back + 0.008, 0, 0, sd * 0.3), o.obi || 0x3a2e26, { reg: 'cloth', dirt: 0.3 }));
    }
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
    const sk = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = 0.58 + v * (0.97 - 0.58), k = (0.97 - y) / 0.39; const r = (0.212 + (o.bankCloth ? 0.04 : 0.075) * k) * r0 * (1 + (hi ? 0.035 * Math.sin(th * 6 + 0.5) * k + 0.012 * Math.sin(th * 13) * k : 0)) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.9]; };
    PT.hips.push(P(surf(hi ? 32 : o.bankCloth ? 14 : 10, hi ? 4 : o.bankCloth ? 2 : 1, (u, v) => sk(u, v, false)), robe, { reg: 'cloth' }));
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
  const k = 'sthigh' + (o.cloth || 0) + '|' + (hi ? 1 : 0) + (o.bankCloth ? '|岸の小袖' : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.6;
  const robe = o.cloth || 0x222120;
  const tb = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = -0.44 + v * 0.56, t = (0.12 - y) / 0.56; const r = (o.bankCloth ? 0.105 + 0.018 * t : 0.128 + 0.04 * t) * (1 + (hi ? 0.045 * Math.sin(th * 5 + 1) * t : 0)) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.95 + 0.01]; };
  const P_ = [P(surf(hi ? 16 : o.bankCloth ? 10 : 7, hi ? 4 : o.bankCloth ? 2 : 1, (u, v) => tb(u, v, false)), robe, { reg: 'cloth' })];
  if (hi) P_.push(P(flipG(surf(16, 2, (u, v) => tb(u, v, true))), darker(robe, 0.5), { reg: 'cloth' }));
  const g = merge(P_);
  geoCache.set(k, g);
  return g;
}
// 脛：衣の裾が脛の上までかかり、その下は脛巾（白っぽい布を巻き、上下を紐で結ぶ）
function soheiShin(o, hi, part) {
  const vi = (o.vi || 0) % 3;
  const k = 'sshin' + (o.cloth || 0) + '|' + vi + '|' + (hi ? 1 : 0) + (part || '') + (o.bankCloth ? '|岸の小袖' : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.85;
  const robe = o.cloth || 0x222120, hb = SOHEI_HABAKI[vi];
  const P_ = [];
  if (!part) P_.push(P(limb([0, 0, 0], [0, -0.3, -0.01], 0.066, 0.05, hi ? 10 : 6), robe, { reg: 'cloth', flipV: true }));
  const hm = (u, v, inner) => { const th = -Math.PI + u * Math.PI * 2, y = -0.15 + v * 0.19; const r = (o.bankCloth ? 0.117 : 0.162) + 0.006 * (1 - v) + (hi ? 0.007 * Math.sin(th * 5 + 1) : 0) - (inner ? 0.006 : 0); return [Math.sin(th) * r, y, Math.cos(th) * r * 0.95 + 0.012]; };
  P_.push(P(surf(hi ? 16 : o.bankCloth ? 10 : 7, 1, (u, v) => hm(u, v, false)), robe, { reg: 'cloth' }));
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
  if (o.honnoCloth) hi = true;
  const k = 'sarm' + (o.cloth || 0) + '|' + (o.skin || 0) + '|' + sd + '|' + (hi ? 1 : 0) + (part || '') + (o.bankCloth ? '|岸の小袖' : '') + (o.kosode ? '|小袖' : '');
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = o.dirt ?? 0.6;
  const robe = o.cloth || 0x222120, skin = o.skin || 0xb58c68;
  const P_ = [];
  if (!part || part === 'upper') P_.push(P(at(ball(0.07, 0.075, 0.07, hi ? 10 : 6, 6), 0, -0.02, 0), robe, { reg: 'cloth' }));
  if (!part || part === 'upper') {
    // 小袖は肩から肘へ落ちる細い筒。僧衣の大きな袂とは形を分ける。
    const up = (u, v, inner) => { const a = -Math.PI + u * Math.PI * 2, y = -0.29 + v * 0.3, t = (0.01 - y) / 0.3; const r = (o.kosode ? 0.065 + 0.012 * Math.sin(t * Math.PI) : 0.078 + 0.016 * t) + 0.004 * Math.sin(a * 5 + t * 2) * Math.sin(t * Math.PI) - (inner ? 0.005 : 0); return [Math.sin(a) * r, y, Math.cos(a) * r - 0.012 * t * Math.max(0, -Math.cos(a))]; };
    P_.push(P(surf(hi ? 14 : 6, hi ? 3 : 1, (u, v) => up(u, v, false)), robe, { reg: 'cloth' }));
  }
  if (!part || part === 'fore') {
    const fo = (u, v, inner) => {
      const a = -Math.PI + u * Math.PI * 2, y = -0.5 + v * 0.27, t = Math.max(0, Math.min(1, (-0.23 - y) / 0.27));   // 丸めの誤差で負にならないよう（負の累乗は NaN）
      const r = (o.kosode ? 0.074 - 0.022 * t : o.bankCloth ? 0.082 + 0.012 * t : 0.092 + 0.03 * t) + (hi ? 0.006 * Math.sin(a * 5 + t * 3) : 0) - (inner ? 0.006 : 0);
      const bag = (o.kosode ? 0.012 + 0.025 * Math.sin(t * Math.PI) : o.bankCloth ? 0.015 + 0.045 * Math.pow(t, 0.8) : 0.025 + 0.13 * Math.pow(t, 0.8)) * Math.pow(Math.max(0, -Math.cos(a)), 1.4);
      return [Math.sin(a) * r * (1 - 0.25 * Math.max(0, -Math.cos(a)) * t), y - 0.02 * bag / 0.15, Math.cos(a) * r - bag];
    };
    P_.push(P(surf(hi ? 18 : o.bankCloth ? 10 : 7, hi ? 4 : o.bankCloth ? 2 : 1, (u, v) => fo(u, v, false)), robe, { reg: 'cloth' }));
    if (hi) P_.push(P(flipG(surf(18, 2, (u, v) => fo(u, v, true))), darker(robe, 0.45), { reg: 'cloth' }));
  }
  if (!part || part === 'hand') {
    // 骨に着せる時も手を独立した部品として残す。袖の中へ隠さない。
    // 袖口から出る手首と拳
    P_.push(P(limb([0, -0.44, 0], [0, -0.52, 0], 0.036, 0.034, hi ? 8 : 5), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(ball(0.035, 0.044, 0.03, hi ? 8 : 6, hi ? 6 : 4), 0, -0.55, 0.018), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(at(ball(0.018, 0.032, 0.018, hi ? 6 : 4, 4), -sd * 0.031, -0.537, 0.034, 0, 0, sd * 0.4), skin, { mk: MK.skin, reg: 'skin' }));
  }
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}

export { flagMatCache, geoCache, paint, at, merge, PLAYER_FACE, FACES, HAIR, headGeometry, bodyGeometry, thighGeometry, shinGeometry, armGeometry, MAT, flagGeo, P, flexSpear, EMBER_GEO, EMBER_MAT, arrowStub, sm, GUN_MUZ, GUN_BORE, GUN_RAM, aimArm, rng };

// 戦をまたいで使う兵の素材。戦の片付けでは返さない。
export function sharedUnitResources() {
  return [geoCache, bodyPartsCache, horseCache, flagMatCache, MAT, MAT_I, MAT_P, EMBER_GEO, EMBER_MAT];
}
