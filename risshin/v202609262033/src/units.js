import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, drawMon } from './textures.js';
import { sfx, withPan } from './audio.js';
import { S } from './settings.js';

// ---------------- 兵種 ----------------
export const TYPES = {
  ashigaru: { hp: 30, dmg: 8, reach: 3.4, cd: 1.7, windup: 0.5, speed: 2.4, run: 4.3, weapon: 'spear', hat: 'jingasa' },
  bow: { hp: 24, dmg: 9, reach: 1.6, cd: 2.6, windup: 0.5, speed: 2.4, run: 4.3, weapon: 'bow', hat: 'jingasa', range: 34 },
  samurai: { hp: 75, dmg: 13, reach: 1.75, cd: 1.4, windup: 0.45, speed: 2.5, run: 4.5, weapon: 'sword', hat: 'kabuto' },
  gun: { hp: 26, dmg: 34, reach: 1.6, cd: 21, windup: 1.3, speed: 2.3, run: 4.2, weapon: 'gun', hat: 'jingasa', range: 46 },
  cavalry: { hp: 110, dmg: 16, reach: 2.7, cd: 1.6, windup: 0.3, speed: 3.6, run: 8.5, weapon: 'spear', hat: 'kabuto' },
  busho: { hp: 190, dmg: 18, reach: 1.85, cd: 1.3, windup: 0.45, speed: 2.5, run: 4.4, weapon: 'sword', hat: 'kabuto_m' },
  dummy: { hp: 99999, dmg: 0, reach: 0.1, cd: 99, windup: 1, speed: 0, run: 0, weapon: 'none', hat: 'none' },
  porter: { hp: 26, dmg: 2, reach: 1.4, cd: 2.2, windup: 0.5, speed: 2.0, run: 3.4, weapon: 'none', hat: 'jingasa' },
  player: { hp: 100, dmg: 14, reach: 2.8, cd: 0.5, windup: 0.12, speed: 3.8, run: 6.6, weapon: 'spear', hat: 'jingasa' },
};

// 実在の武将の見た目（docs/nagashino-scenarios.md）。名前の最後の語で引く（「足軽大将 大沢勘兵衛」→「大沢勘兵衛」）
export const GENERALS = {
  // horo：母衣の色（0 は着けない。母衣は母衣衆と、史実で着けた武将だけ。前田利家は赤母衣衆の筆頭）
  // face：顔の形（w 幅・jaw えら・chin 顎先・cheek 頬骨・gaunt 頬のこけ・brow 眉の張り・nose 鼻・nw 鼻の幅・eye 目の細さ・t 年と髭の模様・hair 髪の色・age 年・esp 目の間隔・beard 髭：mus 口髭の量・musW 幅・musH 厚み・droop 端の垂れ・goat 顎髭・goatW 顎髭の幅・side 頬の髭・stub 無精髭）
  // 天正三年（1575）の年：家康 32・勝頼 29・山県 46・馬場 60・内藤 53・真田信綱 38・大久保 43・酒井 48・奥平 20
  '山県昌景': { armor: 0x8e1f16, lace: 0xb8342a, hat: 'kabuto_r', haori: 0x7a1a12, horo: 0, menpo: 0x6e5e50, menpoStyle: 'hanbo', mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0x9c7453,
    face: { w: 1.06, jaw: 1.35, chin: 0.8, cheek: 1.3, gaunt: 0.5, brow: 1.4, nose: 0.8, nw: 1.3, eye: 1.25, t: 5, hair: 0x1e1812, browT: 1.4, age: 46, esp: 0.94, beard: { mus: 1, musW: 1.05, musH: 1.2, droop: 0.5, goat: 0.85, goatW: 1.1, side: 0.6, stub: 1.3 } } },
  '馬場信春': { armor: 0x1c1a1a, lace: 0x2a3a5a, hat: 'kabuto_w', haori: 0x2e3a52, horo: 0, mon: 'takeda', skin: 0xa87f5c,
    face: { w: 0.96, jaw: 0.9, chin: 1.0, cheek: 1.4, gaunt: 1.2, brow: 1.3, nose: 1.1, nw: 1.0, eye: 1.3, t: 7, hair: 0x9a948a, browT: 1.2, age: 60, esp: 1.04, beard: { mus: 0.75, musW: 0.95, droop: 0.7, goat: 0.8, goatW: 0.8, side: 0.35, stub: 0.9 } } },
  '内藤昌豊': { armor: 0x2a2420, lace: 0x7a2a1c, hat: 'kabuto_m', haori: 0x4a3a22, horo: 0, mon: 'takeda', skin: 0xa87f5c,
    face: { w: 1.02, jaw: 1.1, chin: 0.9, cheek: 1.2, gaunt: 0.8, brow: 1.2, nose: 1.0, nw: 1.1, eye: 1.2, t: 6, hair: 0x4a4640, age: 53, esp: 1.0, beard: { mus: 0.7, musW: 0.9, droop: 0.5, goat: 0.6, goatW: 0.9, side: 0.15, stub: 0.9 } } },
  '真田信綱': { armor: 0x1c1a1a, lace: 0x9a2e20, hat: 'kabuto_f', haori: 0x3a2622, horo: 0, mon: 'takeda', skin: 0xb08664,
    face: { w: 0.97, jaw: 1.0, chin: 1.1, cheek: 1.15, gaunt: 0.7, brow: 1.15, nose: 1.1, nw: 0.95, eye: 1.05, t: 4, hair: 0x15110d, age: 38, esp: 1.02, beard: { mus: 0.55, musW: 0.8, musH: 0.8, droop: 0.3, goat: 0.35, goatW: 0.7, side: 0, stub: 0.8 } } },
  '武田勝頼': { armor: 0x1c1a1a, lace: 0x9a2e20, hat: 'kabuto_suwa', haori: 0x1f2a44, horo: 0, mon: 'takeda', haoriMonCol: 0xc9a24a, skin: 0xc09a74,
    face: { w: 0.95, jaw: 0.85, chin: 1.1, cheek: 1.0, gaunt: 0.6, brow: 1.0, nose: 1.15, nw: 0.95, eye: 1.0, t: 3, hair: 0x15110d, age: 29, esp: 1.05, beard: { mus: 0.18, musW: 0.6, musH: 0.6, droop: 0.2, goat: 0, side: 0, stub: 0.5 } } },
  '徳川家康': { armor: 0x151312, lace: 0x2a2a2a, hat: 'kabuto_shida', haori: 0x5a4632, horo: 0, mon: 'tokugawa', haoriMonCol: 0xe6dfcf, skin: 0xb88e6a,
    face: { w: 1.1, jaw: 1.25, chin: 0.85, cheek: 0.9, gaunt: -0.3, brow: 1.1, nose: 0.9, nw: 1.2, eye: 1.2, t: 3, hair: 0x15110d, age: 32, esp: 0.97, beard: { mus: 0.35, musW: 0.7, musH: 0.7, droop: 0.35, goat: 0.3, goatW: 0.6, side: 0, stub: 0.6 } } },
  '大久保忠世': { armor: 0x24221f, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x2e3a52, mon: 'okubo', skin: 0xa87f5c,
    face: { w: 1.0, jaw: 1.15, chin: 0.9, cheek: 1.2, gaunt: 0.6, brow: 1.2, nose: 0.95, nw: 1.1, eye: 1.1, t: 4, hair: 0x1e1812, age: 43, esp: 1.0, beard: { mus: 0.65, musW: 0.9, droop: 0.45, goat: 0.5, goatW: 0.85, side: 0.25, stub: 1 } } },
  '酒井忠次': { armor: 0x24221f, lace: 0x5a4630, hat: 'kabuto_w', haori: 0x3a2e24, mon: 'katabami', skin: 0xa87f5c,
    face: { w: 1.03, jaw: 1.05, chin: 1.0, cheek: 1.3, gaunt: 0.8, brow: 1.3, nose: 1.05, nw: 1.05, eye: 1.2, t: 6, hair: 0x3a3632, age: 48, esp: 1.03, beard: { mus: 0.6, musW: 0.85, droop: 0.55, goat: 0.7, goatW: 0.75, side: 0.1, stub: 0.8 } } },
  '奥平信昌': { armor: 0x24221f, lace: 0x4a3a2a, hat: 'kabuto_m', haori: 0x2a2622, mon: 'okudaira', skin: 0xc09a74,
    face: { w: 0.95, jaw: 0.8, chin: 1.0, cheek: 1.0, gaunt: 0.5, brow: 0.95, nose: 1.0, nw: 1.0, eye: 1.0, t: 0, hair: 0x15110d, age: 20, esp: 1.02, beard: { mus: 0.05, musW: 0.5, musH: 0.5, goat: 0, side: 0, stub: 0.35 } } },
  // ほかの戦で味方・敵に出る武将（年はその戦の頃）。mon: 'none' は家紋を描かない（絵のない家）
  // hatFix：戦の定義の hat より、ここの兜を先にする（井伊の天衝・真田の鹿角など、その人と分かる兜）
  '織田信長': { armor: 0x1c1a1a, lace: 0x3c5a8a, hat: 'kabuto_m', haori: 0x7a1d14, horo: 0, mon: 'oda', haoriMonCol: 0xc9a24a, skin: 0xb88e6a, tack: 0x2a2a30,
    face: { w: 0.94, jaw: 0.85, chin: 1.15, cheek: 1.05, gaunt: 0.8, brow: 1.15, nose: 1.15, nw: 0.9, eye: 1.2, t: 3, hair: 0x15110d, age: 26, esp: 1.0, beard: { mus: 0.5, musW: 0.95, musH: 0.45, droop: 0.15, goat: 0.12, goatW: 0.4, side: 0, stub: 0.3 } } },
  '木下藤吉郎': { armor: 0x2a2420, lace: 0x7a5a2a, hat: 'kabuto_bari', haori: 0x6a4a1c, horo: 0, mon: 'none', skin: 0x9c7453, tack: 0x5a4020,
    face: { w: 0.9, jaw: 0.8, chin: 1.2, cheek: 1.35, gaunt: 1.2, brow: 1.1, nose: 1.0, nw: 1.05, eye: 1.25, t: 1, hair: 0x1e1812, age: 24, esp: 1.06, beard: { mus: 0.2, musW: 0.6, musH: 0.6, droop: 0.2, goat: 0.1, goatW: 0.5, side: 0, stub: 0.25 } } },
  '明智光秀': { armor: 0x1c1a1a, lace: 0x2e3a52, hat: 'kabuto_w', haori: 0x3a3a52, horo: 0, mon: 'akechi', skin: 0xb88e6a, tack: 0x2a2a38,
    face: { w: 0.95, jaw: 0.9, chin: 1.05, cheek: 1.1, gaunt: 0.7, brow: 1.1, nose: 1.1, nw: 0.95, eye: 1.1, t: 3, hair: 0x2a2622, age: 44, beard: { mus: 0.4, musW: 0.8, musH: 0.7, droop: 0.3, goat: 0.2, goatW: 0.6, side: 0, stub: 0.5 } } },
  '水野勝成': { armor: 0x24221f, lace: 0x5a2a1c, hat: 'kabuto_m', haori: 0x3a2a1a, horo: 0, mon: 'mizuno', skin: 0x8e6446, tack: 0x4a2a1c,
    face: { w: 1.08, jaw: 1.3, chin: 0.85, cheek: 1.3, gaunt: 0.4, brow: 1.4, nose: 0.9, nw: 1.25, eye: 1.3, t: 5, hair: 0x4a4640, age: 51, beard: { mus: 0.9, musW: 1.05, droop: 0.6, goat: 0.8, side: 0.6, stub: 1.2 } } },
  '本多忠政': { armor: 0x151312, lace: 0x2a2a2a, hat: 'kabuto_shika', haori: 0x2a2a2a, horo: 0, mon: 'honda', skin: 0xa87f5c, tack: 0x1a1816,
    face: { w: 1.02, jaw: 1.1, chin: 0.95, cheek: 1.15, gaunt: 0.5, brow: 1.2, nose: 1.0, nw: 1.1, eye: 1.15, t: 4, hair: 0x15110d } },
  '本多忠勝': { armor: 0x151312, lace: 0x2a2a2a, hat: 'kabuto_shika', hatFix: 1, haori: 0x2a2a2a, horo: 0, mon: 'honda', skin: 0x9c7453, tack: 0x1a1816,
    face: { w: 1.06, jaw: 1.25, chin: 0.9, cheek: 1.2, gaunt: 0.3, brow: 1.35, nose: 0.95, nw: 1.2, eye: 1.25, t: 4, hair: 0x15110d, age: 52, esp: 0.97, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.6, side: 0.45, stub: 1.1 } } },
  '戸田勝成': { armor: 0x24221f, lace: 0x4a4a2a, hat: 'kabuto_m', haori: 0x3a3a2a, horo: 0, mon: 'none', skin: 0xa87f5c,
    face: { w: 1.0, jaw: 1.05, chin: 1.0, cheek: 1.2, gaunt: 0.8, brow: 1.2, nose: 1.05, nw: 1.0, eye: 1.2, t: 6, hair: 0x5a5650 } },
  '井伊直政': { armor: 0x8e1f16, lace: 0xb8342a, hat: 'kabuto_tentsuki', hatFix: 1, haori: 0x7a1a12, horo: 0, mon: 'ii', haoriMonCol: 0xc9a24a, skin: 0xc09a74, tack: 0x8e2218,
    face: { w: 0.93, jaw: 0.85, chin: 1.1, cheek: 1.0, gaunt: 0.5, brow: 1.05, nose: 1.1, nw: 0.92, eye: 1.05, t: 1, hair: 0x15110d, age: 39, beard: { mus: 0.15, musW: 0.6, musH: 0.6, goat: 0, side: 0, stub: 0.4 } } },
  '真田信繁': { armor: 0x8e1f16, lace: 0xb8342a, hat: 'kabuto_sanada', hatFix: 1, haori: 0x7a1a12, horo: 0, mon: 'sanada', haoriMonCol: 0xc9a24a, skin: 0xa87f5c, tack: 0x8e2218,
    face: { w: 0.97, jaw: 1.0, chin: 1.05, cheek: 1.25, gaunt: 1.0, brow: 1.15, nose: 1.05, nw: 1.0, eye: 1.15, t: 4, hair: 0x3a3632, age: 48, beard: { mus: 0.55, musW: 0.85, droop: 0.4, goat: 0.75, goatW: 0.7, side: 0.1, stub: 0.8 } } },
  '前田利家': { armor: 0x1c1a1a, lace: 0x9a7a3a, hat: 'kabuto_namazu', hatFix: 1, haori: 0x2a2622, horo: 0x9e2a1e, mon: 'maeda', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a2420,
    face: { w: 0.98, jaw: 1.05, chin: 1.05, cheek: 1.15, gaunt: 0.6, brow: 1.2, nose: 1.1, nw: 1.0, eye: 1.1, t: 4, hair: 0x2a2622, age: 23, beard: { mus: 0.35, musW: 0.8, musH: 0.7, droop: 0.3, goat: 0.15, side: 0, stub: 0.5 } } },
};
// 馬具の色（名のある武将）：家の色。書いていない武将は、陣羽織・威の色から
for (const [nm, g] of Object.entries(GENERALS)) {
  if (!g.tack) g.tack = ({ '山県昌景': 0x8e2218, '武田勝頼': 0xa8281c, '徳川家康': 0x2a2420, '大久保忠世': 0x262c3a, '酒井忠次': 0x3a2a1c, '奥平信昌': 0x2a2420 })[nm] ?? new THREE.Color(g.lace).multiplyScalar(0.8).getHex();
}
// 肌の色：色白・ふつう・日焼け・よく焼けた
export const SKIN_TONES = [0xb58c68, 0xa87f5c, 0xc09a74, 0x9c7453, 0x8e6446, 0xb08664];

export const FACTION = {
  oda: { armor: 0x2b3140, lace: 0x3c5a8a, lace2: 0x2f4a70, lace3: 0x5a4a3a, flag: 'oda' },
  imagawa: { armor: 0x3f2a24, lace: 0x7a3a2a, lace2: 0x8a4a30, lace3: 0x5a3a2a, flag: 'imagawa' },
  saito: { armor: 0x35382c, lace: 0x6b6a4a, lace2: 0x5a5a3a, lace3: 0x7a6a4a, flag: 'saito' },
  // 長篠：徳川は黒い小札に茶と紺の威し、武田は赤みの小札に朱の威し、山県の赤備えは全身朱
  tokugawa: { armor: 0x24221f, lace: 0x5a4630, lace2: 0x2e3a52, lace3: 0x4a3a2a, flag: 'tokugawa' },
  takeda: { armor: 0x3a2622, lace: 0x9a2e20, lace2: 0x7a2a1c, lace3: 0x5a2a20, flag: 'takeda' },
  akazonae: { armor: 0x8e1f16, lace: 0xb8342a, lace2: 0xa02a20, lace3: 0x7a1e16, flag: 'akazonae' },
};

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
};
// 顔の模様は八枚（年と髭）：0 若い・剃った 1 若い・無精髭 2 中年・無精髭 3 中年・口髭 4 中年・口髭と顎髭 5 中年・髭面 6 年寄り・口髭と顎髭 7 年寄り・髭面
const faceReg = (t) => [1024 + (t % 4) * 256, Math.floor(t / 4) * 256, 256, 256];
// 胴や陣笠・陣羽織に描く家紋
// 置き場：y=768〜896 の 1024×128 を、64px の升に二段（一段に16、合わせて32まで）
const MONS = ['tokugawa', 'takeda', 'oda', 'imagawa', 'saito', 'okudaira', 'katabami', 'okubo', 'akechi', 'honda', 'mizuno', 'ii', 'sanada', 'maeda'];
const monReg = (k) => { const i = MONS.indexOf(k === 'akazonae' ? 'takeda' : k); return i < 0 ? null : [(i % 16) * 64, 768 + Math.floor(i / 16) * 64, 64, 64]; };
const PLAIN_UV = [(1024 + 128) / AW, 1 - (768 + 128) / AH];

// 顔の模様の座標：θ（正面が 0、左右へ ±π）と φ（上下 ±π/2）。正面ほど細かく割る
const faceS = (th) => 0.5 + 0.5 * Math.sign(th) * Math.pow(Math.abs(th) / Math.PI, 0.6);
const faceTh = (s) => Math.sign(s - 0.5) * Math.PI * Math.pow(Math.abs(2 * s - 1), 1 / 0.6);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeAtlas() {
  const cv = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = AW; c.height = AH; return c.getContext('2d'); });
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

  // 桶側胴：横の板を鋲で留める（足軽の御貸具足）
  clip(ALL, REG.okegawa, () => {
    const [x0, y0, w, h] = REG.okegawa, ph = h / 5;
    for (let k = 0; k < 5; k++) {
      const y = y0 + k * ph;
      const gr = G.createLinearGradient(0, y, 0, y + ph); gr.addColorStop(0, gray(240)); gr.addColorStop(0.3, gray(214)); gr.addColorStop(0.85, gray(182)); gr.addColorStop(1, gray(80));
      G.fillStyle = gr; G.fillRect(x0, y, w, ph);
      for (let x = x0 + 8; x < x0 + w; x += 16) { G.fillStyle = gray(70); G.beginPath(); G.arc(x, y + 8, 3, 0, 7); G.fill(); G.fillStyle = gray(255); G.beginPath(); G.arc(x - 0.6, y + 7.4, 1.6, 0, 7); G.fill(); }
    }
    scratches(REG.okegawa, 500, 0.26);
    // 縁の擦れ（下地が出る）
    for (let i = 0; i < 90; i++) { R.fillStyle = gray(255, 0.3 + rnd() * 0.5); R.fillRect(x0 + rnd() * w, y0 + Math.floor(rnd() * 5) * ph + ph - 3 - rnd() * 3, 2 + rnd() * 8, 1.5); }
    mottle(REG.okegawa, 1400, 0.1, 0.5, 0.8);
  });

  // 籠手：布の袋に鎖を編み、ところどころに筏（小さな板）
  clip(ALL, REG.kote, () => {
    const [x0, y0, w, h] = REG.kote;
    for (let y = y0; y < y0 + h; y += 3) { G.fillStyle = gray(y % 6 < 3 ? 214 : 190); G.fillRect(x0, y, w, 1.5); }
    for (let y = y0 + 6, j = 0; y < y0 + h; y += 12, j++) for (let x = x0 + 6 + (j % 2) * 6; x < x0 + w; x += 12) {
      R.strokeStyle = gray(255); R.lineWidth = 2.2; R.beginPath(); R.arc(x, y, 3.6, 0, 7); R.stroke();
      G.strokeStyle = gray(240); G.lineWidth = 1.2; G.beginPath(); G.arc(x, y, 3.6, Math.PI, Math.PI * 1.8); G.stroke();
      G.strokeStyle = gray(90); G.beginPath(); G.arc(x, y, 3.6, 0, Math.PI * 0.8); G.stroke();
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
    for (let i = 0; i < 40; i++) { const px = x0 + rnd() * w, py = y0 + rnd() * h, rr = 2 + rnd() * 7; const gr = R.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, gray(255, 0.7)); gr.addColorStop(1, gray(255, 0)); R.fillStyle = gr; R.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
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
  clip(ALL, REG.wood, () => { const [x0, y0, w, h] = REG.wood; for (let y = y0; y < y0 + h; y += 1) { G.fillStyle = gray(200 + Math.sin(y * 0.7 + Math.sin(y * 0.13) * 3) * 30); G.fillRect(x0, y, w, 1); } mottle(REG.wood, 400, 0.08, 0.3, 0.3); });
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
  });
  // 組紐：斜めの撚り
  clip(ALL, REG.cord, () => { const [x0, y0, w, h] = REG.cord; for (let d = -h; d < w; d += 5) { G.strokeStyle = gray(245); G.lineWidth = 2; G.beginPath(); G.moveTo(x0 + d, y0 + h); G.lineTo(x0 + d + h, y0); G.stroke(); G.strokeStyle = gray(120); G.lineWidth = 1; G.beginPath(); G.moveTo(x0 + d + 3, y0 + h); G.lineTo(x0 + d + 3 + h, y0); G.stroke(); } });

  // 家紋（textures.js の絵を使い、地との色の差を赤に）
  MONS.forEach((k, i) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 200;
    const g = c.getContext('2d'); drawMon(g, k, 128, 200);
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
        line(G, [[sd * 0.2, 0.175], [sd * 0.33, 0.19], [sd * 0.46, 0.18]], '20,14,10', 0.9, 2.2);
        // 眉
        line(R, [[sd * 0.16, 0.3], [sd * 0.32, 0.34], [sd * 0.5, 0.31]], '255,255,255', 0.95, 3.2);
        // ほうれい線
        line(G, [[sd * 0.17, -0.1], [sd * 0.26, -0.24], [sd * 0.3, -0.38]], '0,0,0', 0.12 + age * 0.14, 2 + age);
        if (age >= 1) line(G, [[sd * 0.24, 0.1], [sd * 0.34, 0.08], [sd * 0.44, 0.1]], '0,0,0', 0.18 + age * 0.1, 1.4);   // 目の下のたるみ
        if (age >= 2) for (let k = 0; k < 3; k++) line(G, [[sd * 0.55, 0.22 - k * 0.04], [sd * 0.68, 0.24 - k * 0.06]], '0,0,0', 0.35, 1.2);   // 目尻のしわ
        if (age >= 2) line(G, [[sd * 0.22, -0.4], [sd * 0.25, -0.52]], '0,0,0', 0.3, 1.4);
      }
      blob(G, 0, -0.2, 0.1, 0.05, '0,0,0', 0.3);          // 鼻の下
      line(G, [[-0.2, -0.34], [0, -0.33], [0.2, -0.34]], '30,16,12', 0.75, 2);   // 口
      blob(G, 0, -0.45, 0.16, 0.05, '0,0,0', 0.25);       // 下唇の下
      // 顎の下と首は暗い
      { const gr = G.createLinearGradient(0, P(0, -0.8)[1], 0, P(0, -1.3)[1]); gr.addColorStop(0, gray(0, 0)); gr.addColorStop(1, gray(0, 0.4)); G.fillStyle = gr; G.fillRect(x0, y0, 256, 256); }
      // 額のしわ
      if (age >= 1) for (let k = 0; k < (age === 2 ? 4 : 2); k++) line(G, [[-0.45, 0.5 + k * 0.07], [-0.15, 0.53 + k * 0.07], [0.15, 0.52 + k * 0.07], [0.45, 0.5 + k * 0.07]], '0,0,0', 0.2 + age * 0.08, 1.3);
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
// 兵の材質（humans.js の甲冑もこれで描く）
export const UNIT_MAT = MAT;
// 雨に濡れると、甲冑も布も少し照る
export const UNIT_WET = { value: 0 };
MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uWet = UNIT_WET;
  sh.vertexShader = 'attribute float mtl;\nattribute vec3 col2;\nvarying float vMtl;\nvarying vec3 vCol2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMtl = mtl; vCol2 = col2;');
  sh.fragmentShader = `uniform float uWet;
varying float vMtl;
varying vec3 vCol2;
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
      diffuseColor.rgb *= baseC;`)
    .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = mix(mkRough(mkA), mkRough(mkB), txA.r);
      roughnessFactor = mix(roughnessFactor, 0.97, dd * 0.7);
      roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : 0.4);`)
    .replace('#include <metalnessmap_fragment>', `
      float metalnessFactor = mix(mkMetal(mkA), mkMetal(mkB), txA.r) * (1.0 - dd);`);
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
      // 目玉（白目は少しくすみ、黒目は濃い茶）と、上下のまぶた
      parts.push(P(at(ball(eyeW, eyeW * eh, eyeW * 0.7), e[0] - dx * 0.004, e[1], e[2] - dz * 0.004), 0xbfb4a2, { mk: MK.eye }));
      parts.push(P(at(ball(0.0062, 0.0062 * Math.min(1, eh * 1.4), 0.004), e[0] + dx * 0.0035, e[1] - 0.0004, e[2] + dz * 0.0035), 0x1c120c, { mk: MK.eye }));
      const lid = ball(0.0145, 0.0068, 0.009, 10, 6); lid.rotateZ(sd * -0.1);
      parts.push(P(at(lid, e[0] + dx * 0.002, e[1] + 0.0048, e[2] + dz * 0.002), skin, sk));
      parts.push(P(at(ball(0.013, 0.0045, 0.0075, 10, 5), e[0] + dx * 0.0014, e[1] - 0.0058, e[2] + dz * 0.0014), skin, sk));
      const lash = new THREE.BoxGeometry(0.026, 0.0022, 0.004); lash.rotateZ(sd * 0.1); lash.rotateY(sd * 0.33);
      parts.push(P(at(lash, e[0] + dx * 0.0072, e[1] + 0.0018, e[2] + dz * 0.0072), 0x120c08, { mk: MK.cloth }));
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
    // 遠目：鼻と耳だけ形にする（目・眉・髭は顔の模様で）
    const tip = p(0, -0.07);
    parts.push(P(at(new THREE.BoxGeometry(0.022, 0.045, 0.03), 0, tip[1] + 0.012, tip[2] + 0.004, -0.25), skin, sk));
    if (!F.monk) for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.02, 0.05, 0.036), sd * 0.108 * F.w, 1.6, 0.0), skin, sk));
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
function kuwaBlade(s, sd) { return blade([[0, 0], [0.018, 0.0], [0.05 * s, 0.14 * s], [0.08 * s, 0.26 * s], [0.092 * s, 0.31 * s], [0.074 * s, 0.3 * s], [0.052 * s, 0.2 * s], [0.02 * s, 0.07 * s], [-0.004, 0.02]].map(([x, y]) => [x * sd, y])); }
function hatParts(look, parts, hi) {
  const hat = look.hat;
  const T = look.tier || 0;
  const gold = 0xc9a24a, brass = 0xa8893f;
  const lace = look.lace || 0x5a4630;
  if (hat === 'jingasa' || hat === 'jingasa_n') {
    const col = hat === 'jingasa_n' ? 0x151312 : 0x2e2820;
    // 陣笠：なだらかな反りの円錐を漆で塗る。擦れて下地の赤茶が出る
    const prof = [[0.0, 0.16], [0.08, 0.14], [0.2, 0.09], [0.32, 0.035], [0.4, 0.0], [0.405, -0.012]].map(([r, y]) => new THREE.Vector2(r, y));
    const kasa = new THREE.LatheGeometry(prof, hi ? 28 : 12, Math.PI, Math.PI * 2);
    // 高さ：縁が眉の高さ。頭は笠の円錐の内に入り、頭に当てる輪（布）は円錐の内で頭の太い所に掛かる（縁の高さで頭の上に載せると、頭から浮いて見える）
    const hy = 1.655;
    parts.push(P(at(kasa, 0, hy, 0), col, { mk: MK.lac, reg: 'lacq', c2: 0x5a3422, mk2: MK.wood }));
    if (hi) {
      const under = new THREE.LatheGeometry(prof.slice().reverse().map((v) => new THREE.Vector2(v.x, v.y - 0.012)), 20);
      parts.push(P(at(under, 0, hy, 0), 0x3a2418, { mk: MK.lac, reg: 'lacq' }));
      parts.push(P(at(new THREE.TorusGeometry(0.4, 0.012, 4, 28), 0, hy - 0.008, 0, Math.PI / 2), 0x1c1914, { mk: MK.lac, reg: 'lacq' }));
      // 頭に当てる輪（布）と、顎の下で結ぶ忍の緒
      parts.push(P(at(new THREE.TorusGeometry(0.106, 0.016, 5, 16), 0, hy + 0.013, 0, Math.PI / 2), 0x4a4236, { reg: 'cloth' }));
      for (const sd of [-1, 1]) parts.push(P(limb([sd * 0.1, hy, 0.0], [sd * 0.02, 1.49, 0.075], 0.0045, 0.0045, 4), 0xcfc4a8, { reg: 'cord' }));
      parts.push(P(at(ball(0.012, 0.008, 0.008), 0, 1.49, 0.078), 0xcfc4a8, { reg: 'cord' }));
      // 前に家紋（御貸具足の印）
      const mr = monReg(look.mon);
      if (mr) {
        const mp = [[0.1, 0.132], [0.16, 0.107], [0.22, 0.085], [0.28, 0.058]].map(([r, y]) => new THREE.Vector2(r, y + 0.004));
        const dec = new THREE.LatheGeometry(mp, 4, -0.34, 0.68);
        parts.push(P(at(dec, 0, hy, 0), col, { mk: MK.lac, reg: mr, c2: hat === 'jingasa_n' ? gold : 0xb08a3a, mk2: MK.gold, swap: false }));
      }
    } else parts.push(P(at(new THREE.TorusGeometry(0.4, 0.012, 3, 12), 0, hy - 0.008, 0, Math.PI / 2), 0x1c1914, { mk: MK.lac }));
    if (look.tenugui && hi) parts.push(P(at(new THREE.CylinderGeometry(0.117, 0.115, 0.03, 16, 1, true), 0, 1.655, 0.006), 0xd6ccb4, { reg: 'cloth' }));
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
    parts.push(P(at(ball(0.05, 0.045, 0.035), 0, 1.79, 0.2), gold, { mk: MK.gold }));   // 獅子の顔
    if (hi) for (const sd of [-1, 1]) parts.push(P(at(ball(0.014, 0.01, 0.01), sd * 0.018, 1.8, 0.232), 0x1a1410, { mk: MK.lac }));
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
function cuirass(r0, seg) {
  const g = new THREE.LatheGeometry(DO_PROF.map(([r, y]) => new THREE.Vector2(r * r0, y)), seg, Math.PI, Math.PI * 2);
  g.scale(1, 1, 0.8);
  return g;
}
// 陣羽織のひだ（背の角度 th と高さ y での、外への出っ張り m）
export const haoriFold = (th, y) => 0.011 * Math.sin(th * 9 + 0.6) * Math.min(1, Math.max(0.15, (1.44 - y) / 0.64));
// 体つき：足軽は細く締まり、侍は厚い
const BUILD = [0.94, 1.0, 1.05, 1.08];

// grp を渡すと、その部分だけ（骨の入った人に着せるため）：base 腰と肩の下着・torso 胴まわり・hips 草摺・sodeP/sodeN 袖（+x/-x）・head 兜と面頬
function bodyGeometry(key, o, hi, grp) {
  const ck = key + (hi ? '|H' : '|L') + (grp ? '|' + grp : '');
  if (geoCache.has(ck)) return geoCache.get(ck);
  if (o.sohei) return soheiBody(ck, o, hi, grp);   // 僧兵は甲冑でなく衣と袈裟
  const PT = { base: [], torso: [], hips: [], sodeP: [], sodeN: [], head: [], haori: [], back: [], koshi: [] };
  let parts = PT.base;
  const T = o.tier || 0;
  const r0 = BUILD[T];
  const armor = o.armor, lace = o.lace;
  const under = o.cloth || 0x2b2622;   // 鎧下の布
  DIRT = o.dirt ?? [0.85, 0.6, 0.45, 0.3][T];
  const gold = 0xc9a24a, brass = 0xa8893f;
  const S = hi ? 1 : 0;
  // 胴の模様：足軽は桶側（横の板を鋲留め）か腹巻（素懸）、侍は素懸、侍大将からは毛引
  const doStyle = T === 0 ? ((o.vi || 0) % 3 === 2 ? 'sugake' : 'okegawa') : T === 1 ? 'sugake' : 'kebiki';
  const rows = doStyle === 'okegawa' ? [0, 1] : [0, 0.75];
  // 腰（袴の上端）と上帯
  parts.push(P(at(new THREE.CylinderGeometry(0.19 * r0, 0.2 * r0, 0.2, hi ? 14 : 8), 0, 0.82, 0), under, { reg: 'cloth' }));
  // 鎧下の肩と、首元の襟（白い襦袢がのぞく）
  const yoke = ball(0.25 * r0, 0.07, 0.15 * r0, hi ? 14 : 8, 5);
  parts.push(P(at(yoke, 0, 1.43, -0.005), under, { reg: 'cloth' }));
  parts = PT.torso;
  parts.push(P(at(new THREE.CylinderGeometry(0.068, 0.1, 0.06, hi ? 14 : 8, 1, true), 0, 1.47, 0.005), under, { reg: 'cloth' }));
  if (hi) {
    for (const sd of [-1, 1]) parts.push(P(at(new THREE.BoxGeometry(0.018, 0.075, 0.006), sd * 0.03, 1.46, 0.07, -0.25, 0, sd * 0.55), 0xd8d0bc, { reg: 'cloth' }));
  }
  // 胴
  parts.push(P(cuirass(r0, hi ? 28 : 12), armor, { mk: MK.lac, reg: doStyle, c2: lace, mk2: MK.cloth, rv: rows }));
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
    const mp = DO_PROF.slice(3, 6).map(([r, y]) => new THREE.Vector2(r * r0 * 1.012, y));
    const dec = new THREE.LatheGeometry(mp, hi ? 6 : 3, -0.42, 0.84); dec.scale(1, 1, 0.8);
    parts.push(P(dec, armor, { mk: MK.lac, reg: mr, c2: o.monCol || 0xb08a3a, mk2: MK.gold }));
  }
  // 草摺：板を垂らし、裾へ広げる。足軽は五枚、侍から七枚
  parts = PT.hips;
  {
    const np = T === 0 ? 5 : 7;
    const krv = doStyle === 'okegawa' ? [0, 0.6] : doStyle === 'sugake' ? [0, 0.5] : [0, 0.625];
    for (let k = 0; k < np; k++) {
      const a = (k / np) * Math.PI * 2 + (np === 5 ? Math.PI / 5 : 0);
      const L = (Math.PI * 2 / np) * 0.97;
      const kz = arcCyl(0.214 * r0, 0.27 * r0, 0.27, hi ? 3 : 2, L, a + Math.PI);
      kz.scale(1, 1, 0.86);
      parts.push(P(at(kz, 0, 0.765, 0), armor, { mk: MK.lac, reg: doStyle, c2: lace, mk2: MK.cloth, rv: krv, ru: [0, doStyle === 'okegawa' ? 0.35 : 0.2] }));
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
    if (hi) { const p = hb.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i) + 0.004; const r = Math.hypot(x, z) || 1; const th = Math.atan2(x, z); const d = haoriFold(th, y) + edgeOut(th, y); p.setXYZ(i, x * (1 + d / r), y, z * (1 + d / r) - 0.004); } hb.computeVertexNormals(); }
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
        const eg = surf(1, 8, (u, v) => { const y = 0.8 + v * 0.64; const r = rAt0(y) + haoriFold(th, y) + edgeOut(th, y) - T_ * u; return [Math.sin(th) * r, y, Math.cos(th) * r - 0.004]; });
        if (sd > 0) { const ex = eg.index.array; for (let i = 0; i < ex.length; i += 3) { const t = ex[i]; ex[i] = ex[i + 2]; ex[i + 2] = t; } eg.computeVertexNormals(); }
        parts.push(P(eg, new THREE.Color(o.haori).multiplyScalar(0.8).getHex(), { reg: 'cloth' }));
      }
    }
    parts.push(P(at(arcCyl(0.12, 0.27 * r0, 0.08, hi ? 14 : 6, Math.PI * 1.1, Math.PI), 0, 1.47, 0), o.haori, { reg: 'cloth' }));
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
    parts.push(P(limb(pt(0.01), pt(0.16), 0.015, 0.014, 5), 0x2a2420, { reg: 'cord' }));
  }
  parts = PT.torso;
  // 母衣（母衣衆の背の袋）：竹の籠（母衣串）に十二枚はぎの布を張る。縦長の卵形で、上が細く、下は開いて腰の後ろへ垂れる。
  // 大きさは背の幅から肩の少し上まで。形は半ばふくらんだ所で作り、駆ける速さでふくらみ・しぼむのは humans.js の揺れで
  if (o.horo) {
    const hg = surf(hi ? 24 : 10, hi ? 12 : 6, (u, v) => {
      const th = u * Math.PI * 2, ph = Math.PI / 2 - v * Math.PI * 0.8;   // 上の口から下の開いた口まで
      const c = Math.cos(ph), s = Math.sin(ph);
      const gore = 1 + 0.03 * Math.abs(Math.sin(th * 6));                  // 布のはぎ目のふくらみ
      const wr = 1 + 0.035 * Math.sin(th * 5 + v * 7) * v + 0.02 * Math.sin(th * 11 - v * 4) * v;   // しわ（下ほど）
      const egg = 1 - 0.2 * s;                                             // 上が細い
      const r = gore * wr * egg;
      let z = Math.cos(th) * c * 0.15 * r;
      if (z > 0) z *= 0.35;                                                // 背に当たる側は平ら
      return [Math.sin(th) * c * 0.2 * r, s * 0.3, z];
    });
    // 下の口から中が見えても抜けないよう、裏（面の向きを返した物）も
    const inner = hg.clone(); const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    inner.scale(0.985, 0.985, 0.985); inner.computeVertexNormals();
    PT.back.push(P(at(hg, 0, 1.36, -0.37), o.horo, { reg: 'horo', dirt: 0.25 }));
    PT.back.push(P(at(inner, 0, 1.36, -0.37), new THREE.Color(o.horo).multiplyScalar(0.55).getHex(), { reg: 'horo', dirt: 0.3 }));
    if (hi) {
      // 母衣串（籠の竹の骨）の頭と、背の受け
      parts.push(P(limb([0, 1.44, -0.2], [0, 1.66, -0.37], 0.006, 0.005, 4), 0x3a2c1c, { reg: 'wood' }));
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
  if (o.pole) {
    parts.push(P(at(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 5), 0, 2.0, -0.22), 0x3a2c1c, { reg: 'wood', swap: true }));
    parts.push(P(at(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), 0, 1.07, -0.21), 0x2a1c10, { mk: MK.lac, reg: 'lacq' }));
    if (hi) parts.push(P(at(new THREE.BoxGeometry(0.06, 0.03, 0.05), 0, 1.36, -0.2), 0x2a1c10, { mk: MK.lac }));
  }
  // nohead：頭に付く物（笠・兜・面頬）を除く（軽い形では頭の形の方に入れる）
  const list = grp === 'nohead' ? [...PT.base, ...PT.torso, ...PT.hips, ...PT.sodeP, ...PT.sodeN, ...PT.haori, ...PT.back, ...PT.koshi] : grp ? PT[grp] : [...PT.base, ...PT.torso, ...PT.hips, ...PT.sodeP, ...PT.sodeN, ...PT.head, ...PT.haori, ...PT.back, ...PT.koshi];
  const g = list.length ? merge(list) : null;
  geoCache.set(ck, g);
  return g;
}

// 脚は太ももと脛の二節（膝で曲がる）。太ももは腰、脛は膝を原点に下へ
// part：'armor' 佩楯と膝の紐だけ（骨の入った人に着せるため）
function thighGeometry(o, hi, part) {
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
  if (o.sohei && part !== 'foot') return soheiShin(o, hi, part);
  const cloth = o.cloth || 0x2b2622, T = o.tier || 0, vi = o.vi || 0;
  const k = 'shin' + cloth + '|' + T + '|' + (T === 0 ? vi % 2 : 0) + '|' + (hi ? 1 : 0) + (part || '');
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
    if (vi % 2) {
      P_.push(P(at(arcCyl(0.08 * b, 0.064 * b, 0.22, hi ? 7 : 4, Math.PI * 0.95, 0), 0, -0.14, -0.004), 0x2e3236, { mk: MK.iron, reg: 'iron' }));
      if (hi) P_.push(P(at(new THREE.BoxGeometry(0.004, 0.22, 0.008), 0, -0.14, 0.076 * b), 0x1a1816, { mk: MK.iron }));
    }
  } else {
    // 侍：篠臑当（縦の鉄の篠を鎖でつなぐ）。侍大将から膝に立挙
    P_.push(P(at(arcCyl(0.078 * b, 0.062 * b, 0.26, hi ? 8 : 4, Math.PI * 1.05, 0), 0, -0.14, -0.006), 0x2a2622, { reg: 'shino', c2: 0x2e3236, mk2: MK.iron, flipV: false }));
    if (hi) for (const y of [-0.015, -0.265]) P_.push(P(at(new THREE.TorusGeometry(y > -0.1 ? 0.078 * b : 0.062 * b, 0.0045, 4, 12), 0, y, -0.006, Math.PI / 2), 0x3a342c, { reg: 'cord' }));
    if (T >= 2) P_.push(P(at(arcCyl(0.085 * b, 0.08 * b, 0.08, hi ? 6 : 3, Math.PI * 0.8, 0), 0, 0.03, 0.01, -0.15), o.armor || 0x1c1a1a, { mk: MK.lac, reg: 'lacq' }));
  }
  // 足袋と草鞋：甲のふくらみ、踵、親指の股、藁の底、結んだ紐
  const tabi = T === 0 ? 0x8e8676 : 0x3a3630;
  if (part === 'leg') { /* 脛だけ */ } else if (hi) {
    P_.push(P(at(ball(0.044, 0.036, 0.1, 10, 6), 0, -0.318, 0.06), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(ball(0.038, 0.035, 0.04, 8, 6), 0, -0.316, -0.02), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(ball(0.017, 0.016, 0.025, 6, 4), 0.022, -0.33, 0.15), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(new THREE.BoxGeometry(0.003, 0.018, 0.035), 0.008, -0.33, 0.16), 0x2a2620, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(new THREE.BoxGeometry(0.1, 0.016, 0.25), 0, -0.354, 0.05), 0x9a8a5a, { mk: MK.straw, reg: 'straw', dirt: 1 }));
    P_.push(P(at(new THREE.TorusGeometry(0.046, 0.005, 4, 10, Math.PI), 0, -0.342, 0.09, 0, Math.PI / 2, 0), 0xa89a6a, { mk: MK.straw, reg: 'cord', dirt: 1 }));
    P_.push(P(at(new THREE.TorusGeometry(0.05, 0.005, 4, 12), 0, -0.29, -0.004, Math.PI / 2), 0xa89a6a, { mk: MK.straw, reg: 'cord', dirt: 1 }));
    P_.push(P(limb([0.012, -0.345, 0.17], [0.03, -0.3, 0.02], 0.004, 0.004, 3), 0xa89a6a, { mk: MK.straw, dirt: 1 }));
    P_.push(P(limb([0.012, -0.345, 0.17], [-0.03, -0.3, 0.02], 0.004, 0.004, 3), 0xa89a6a, { mk: MK.straw, dirt: 1 }));
  } else {
    P_.push(P(at(new THREE.BoxGeometry(0.09, 0.06, 0.2), 0, -0.315, 0.04), tabi, { reg: 'cloth', dirt: 1 }));
    P_.push(P(at(new THREE.BoxGeometry(0.1, 0.022, 0.24), 0, -0.345, 0.04), 0x9a8a5a, { mk: MK.straw }));
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
  // 乗せる前に手・旗を 0.95 上げてある形（出世の見本・伝令）は、和種の鞍の高さへ下ろす
  if (!u.rideFix) { u.rideFix = true; for (const part of [u.body, u.hand, u.flag, u.uma]) if (part) part.position.y -= 0.95 - RIDE.y; }
  const y = RIDE.y + 0.71;
  u.legL.position.set(0.24, y, 0.04); u.legR.position.set(-0.24, y, 0.04);
  u.legL.rotation.set(-1.25, 0, -0.3); u.legR.rotation.set(-1.25, 0, 0.3);
  if (u.shinL) { u.shinL.rotation.x = 1.3; u.shinR.rotation.x = 1.3; }
}

// 腕：肩を原点に真下へ。二の腕・前腕・手。籠手（鎖と篠）を着けるか、袖をたくし上げて素肌か
// part：'upper' 二の腕の籠手・'fore' 前腕の籠手・'hand' 手甲だけ（骨の入った人に着せるため）
function armGeometry(o, sd, kote, hi, part) {
  if (o.sohei) return soheiArm(o, sd, hi, part);
  const skin = o.skin || 0xb58c68, cloth = o.cloth || 0x2b2622, T = o.tier || 0;
  const k = 'arm' + skin + '|' + cloth + '|' + sd + '|' + (kote ? 1 : 0) + '|' + T + '|' + (hi ? 1 : 0) + (part || '');
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
    if (hi && part !== 'fore') P_.push(P(at(ball(0.034, 0.03, 0.022, 8, 5), 0, -0.27, -0.034), 0x2e3236, { mk: MK.iron, reg: 'iron' }));   // 肘金
    if (part !== 'upper') P_.push(P(limb([0, -0.27, 0], [0, -0.5, 0], 0.05 * b, 0.041 * b, seg), kc, { reg: 'kote', c2: 0x2e3236, mk2: MK.iron }));
    // 篠（前腕の外側に細い鉄の板）
    if (part !== 'upper') for (const a of hi ? [-0.45, 0, 0.45] : [0]) {
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
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), 0, -0.54, -0.027, 0.1), T >= 2 ? (o.armor || 0x1c1a1a) : 0x2e3236, { mk: T >= 2 ? MK.lac : MK.iron, reg: 'lacq' }));
  } else if (part) { /* 籠手だけ */ } else if (hi) {
    // 手：握った拳（掌・指の列と節・親指）。籠手なら甲に手甲
    const hx = 0;
    P_.push(P(at(ball(0.035 * b, 0.044, 0.027, 8, 6), hx, -0.545, 0), skin, { mk: MK.skin, reg: 'skin' }));
    const fr = new THREE.CylinderGeometry(0.018, 0.018, 0.066 * b, 8); fr.rotateZ(Math.PI / 2);
    P_.push(P(at(fr, hx, -0.578, 0.014), skin, { mk: MK.skin, reg: 'skin' }));
    for (let i = 0; i < 4; i++) P_.push(P(at(ball(0.0105, 0.011, 0.011, 6, 4), hx + (i - 1.5) * 0.017 * b, -0.565, 0.028), skin, { mk: MK.skin, reg: 'skin' }));
    P_.push(P(limb([-sd * 0.028, -0.528, 0.012], [-sd * 0.02, -0.574, 0.032], 0.0115, 0.0095, 6), skin, { mk: MK.skin, reg: 'skin' }));
    if (kote) P_.push(P(at(new THREE.BoxGeometry(0.056 * b, 0.05, 0.007), hx, -0.54, -0.027, 0.1), T >= 2 ? (o.armor || 0x1c1a1a) : 0x2e3236, { mk: T >= 2 ? MK.lac : MK.iron, reg: 'lacq' }));
  } else {
    P_.push(P(at(ball(0.046, 0.056, 0.05, 6, 4), 0, -0.55, 0.01), skin, { mk: MK.skin }));
  }
  const g = P_.length ? merge(P_) : null;
  geoCache.set(k, g);
  return g;
}

// 腕を狙いの点へ向ける（胴の座標で）。長さが合わなければ少し縮める
const _dn = new THREE.Vector3(0, -1, 0), _v = new THREE.Vector3();
function aimArm(arm, tx, ty, tz) {
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
  if (w === 'bow') {
    // 弓は左手で押し出し、右手は弦を引く（引いた弦の所 u.bowR）
    aimArm(u.armL, hx, hy, hz);
    if (u.bowR) aimArm(u.armR, u.bowR.x, u.bowR.y - by, u.bowR.z);
    else aimArm(u.armR, 0.12, 1.28, u.atk ? -0.05 : 0.1);
  } else if (u.lh) {
    // 鉄砲の込め直し：右手で筒を支え、左手は筒先・火皿へ
    aimArm(u.armR, hx, hy, hz);
    aimArm(u.armL, u.lh[0], u.lh[1] - by, u.lh[2]);
  } else if (u.mounted && (w === 'spear' || w === 'gun' || w === 'bow')) {
    // 馬上：右手で槍、左手は手綱
    aimArm(u.armR, hx, hy, hz);
    aimArm(u.armL, -0.08, 1.02, 0.42);
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
}

// ---------------- 武器 ----------------
// どの武器も右手の握り（u.hand の原点）から前（+z）へ伸びる
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
  const k = 'spear|' + sp.L + '|' + sp.ho;
  if (geoCache.has(k)) return geoCache.get(k);
  DIRT = 0.3;
  const { L, grip, hoL, r } = sp;
  const z0 = -grip, zt = L - grip, zh = zt - hoL;
  const j1 = 0.42, j2 = j1 + (zh - 0.5 - j1) * 0.5;
  const sec = [[], [], []];
  const rad = (z) => r * (1.1 - 0.25 * (z - z0) / (zh - z0));   // 元が太く、先が細い
  const shaft = (i, a, b) => sec[i].push(P(at(new THREE.CylinderGeometry(rad(b), rad(a), b - a, 7, 1, true), 0, 0, (a + b) / 2, Math.PI / 2), 0x2a1c12, { mk: MK.lac, reg: 'wood', swap: true }));
  shaft(0, z0 + 0.06, j1); shaft(1, j1, j2); shaft(2, j2, zh - 0.38);
  // 石突（鉄の尻金）
  sec[0].push(P(at(new THREE.CylinderGeometry(rad(z0) + 0.002, rad(z0) * 0.75, 0.08, 7), 0, 0, z0 + 0.04, Math.PI / 2), 0x3a3e42, { mk: MK.iron, reg: 'iron' }));
  // 千段巻（穂の下を糸で巻いて漆で固める）と、口金
  sec[2].push(P(at(new THREE.CylinderGeometry(rad(zh) + 0.0025, rad(zh) + 0.003, 0.28, 7), 0, 0, zh - 0.25, Math.PI / 2), 0x1d1a16, { reg: 'cord', swap: true }));
  sec[2].push(P(at(new THREE.CylinderGeometry(rad(zh) + 0.001, rad(zh) + 0.0035, 0.1, 8), 0, 0, zh - 0.06, Math.PI / 2), 0x3a3e42, { mk: MK.iron, reg: 'iron' }));
  // 塩首（穂の根元の細い首）
  sec[2].push(P(at(new THREE.CylinderGeometry(0.0055, 0.009, 0.035, 6), 0, 0, zh - 0.0, Math.PI / 2), 0x55595c, { mk: MK.iron }));
  if (sp.ho === 'omi') {
    // 大身：長い両刃の穂。鎬で菱の断面、先で細る
    sec[2].push(P(loft(DIA, 12, (v) => { const w = 0.019 * (v < 0.08 ? 0.7 + v * 3.7 : 1 - v * 0.2) * Math.min(1, (1 - v) / 0.22); return [zh + 0.015 + v * hoL, 0, w, 0.006 * (1 - v * 0.5) * Math.min(1, (1 - v) / 0.22 + 0.2)]; }), 0xb8bcbe, { mk: MK.iron, reg: 'iron' }));
  } else {
    // 平三角：三角の断面の穂
    sec[2].push(P(loft(TRI, 6, (v) => { const w = 0.015 * Math.min(0.65 + v * 4, (1 - v) * 1.2); return [zh + 0.015 + v * hoL, 0, w, 0.0065 * Math.min(1, (1 - v) * 1.3)]; }), 0xb0b4b6, { mk: MK.iron, reg: 'iron' }));
  }
  const full = merge(sec.flat().map((g) => g.clone()));
  const s0 = merge(sec[0]), s1 = merge(sec[1]), s2 = merge(sec[2]);
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
  parts.push(P(loft(KATANA, 26, (v) => {
    const w = 0.0155 - 0.0045 * v, tip = v > 0.93 ? Math.sqrt(Math.max(0, (1 - v) / 0.07)) : 1;
    return [zb + v * Lb, sori * v * v + w * (1 - tip), 0.0036 * (1 - 0.35 * v) * Math.max(0.15, tip), w * tip];
  }), 0xc6cacc, { mk: MK.iron, reg: 'iron' }));
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
  const st = new THREE.BoxGeometry(0.036, 0.032, zm - 0.1); st.translate(0, 0.008, (zm - 0.1) / 2 - 0.03);
  parts.push(P(st, 0x5a3a24, { mk: MK.wood, reg: 'wood', swap: true }));
  // 台尻：頬付けの短い床。少し下へ曲がる
  parts.push(P(at(new THREE.BoxGeometry(0.044, 0.07, 0.34), 0, -0.018, -0.2, -0.16), 0x4a3020, { mk: MK.wood, reg: 'wood', swap: true }));
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
  if (kind === 'spear') {
    const G = spearGeometry(spearSpec(sk, extra));
    const a = new THREE.Mesh(G.s1, MAT), b = new THREE.Mesh(G.s2, MAT);
    a.position.z = G.j1; b.position.z = G.j2 - G.j1;
    a.add(b); a.visible = false; m.add(a);
    m.userData.flex = { G, a, b, on: false, ang: 0, vel: 0 };
    m.userData.tip = G.tip; m.userData.butt = G.butt; m.userData.spec = G.sp;
  } else if (kind === 'gun') {
    const ram = new THREE.Mesh(ramGeometry(), MAT);
    ram.position.set(0, -0.012, 0.1);
    m.add(ram);
    const em = new THREE.Mesh(EMBER_GEO, EMBER_MAT);
    em.position.set(0.028, 0.05, 0.036);
    m.add(em);
    m.userData.ram = ram; m.userData.ember = em;
  } else if (kind === 'bow') {
    const s1 = new THREE.Mesh(STRING_GEO, MAT), s2 = new THREE.Mesh(STRING_GEO, MAT);
    const ar = new THREE.Mesh(arrowGeometry(), MAT);
    ar.visible = false;
    m.add(s1, s2, ar);
    m.userData.bow = { s1, s2, ar, draw: -1 };
    setBowDraw(m, 0, null);
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
  if (lv !== B.lv) { B.lv = lv; w.geometry = bowGeometry(lv); }
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
const coatO = (st, extra = {}) => ({ mk: MK.skin, reg: 'skin', ...extra });
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
    const L = 0.95, t0 = sd > 0 ? Math.PI / 2 - 0.85 : Math.PI * 1.5 - 0.1;
    const ao = new THREE.CylinderGeometry(0.335, 0.335, 0.52, 10, 1, true, t0, L); ao.rotateX(Math.PI / 2);
    Q.push(P(at(ao, 0, 1.3, 0.02), st.aori, { reg: 'lacq', mk: MK.lac }));
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
    const tg = new THREE.ConeGeometry(0.045, 0.24, 7); tg.rotateX(Math.PI);
    Q.push(P(at(tg, Math.sin(a) * 0.33, 1.13, -0.62 + Math.cos(a) * -0.08), st.tassels, { reg: 'fur' }));
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
  // 鬣：首の背に沿って、右へ垂れる
  const mn = bez([0.03, 0.02, -0.38], [0.05, 0.56, -0.2], [0.03, 0.77, 0.2]);
  Q.push(P(sweep(mn, (t) => [0.03, 0.06 * (1 - t * 0.5), -0.02], 8, 14), st.mane, { reg: 'hair' }));
  const fl = new THREE.ConeGeometry(0.045, 0.16, 6); fl.rotateX(Math.PI * 0.85);
  Q.push(P(at(fl, 0, 0.73, 0.36), st.mane, { reg: 'hair' }));   // 前髪
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
  Q.push(P(sweep(cv, (t) => [tab(tr, t), tab(td, t)], 12, 12), c, { mk: MK.skin, reg: 'skin' }));
  if (!front) Q.push(P(at(ball(0.035, 0.04, 0.04, 8, 6), 0, -0.47, -0.1), c, { mk: MK.skin, reg: 'skin' }));   // 飛節の角
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
  Q.push(P(sweep(dock, (t) => [0.05 - 0.015 * t, 0.055 - 0.02 * t], 10, 6), st.coat, { mk: MK.skin, reg: 'skin' }));
  const hair = bez([0, -0.02, -0.02], [0, -0.3, -0.18], [0, -0.55, -0.12], [0, -0.82, -0.1]);
  Q.push(P(sweep(hair, (t) => [0.045 + 0.04 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.8), 0.05 + 0.03 * Math.sin(t * Math.PI * 0.9)], 10, 14), st.mane, { reg: 'hair' }));
}
export const ENEMY_HORSE = { coat: 0x4a3222, mane: 0x16120e, tack: 0x6a2a1c, saddle: 0x1a1512, aori: 0x3a2e22, tassels: 0x1f2a4a, armor: 0 };
// 日本の在来馬の毛色。points は脚先と鬣・尾が黒い（鹿毛・黒鹿毛）。w は出やすさ
export const COATS = [
  { kind: '栗毛', coat: 0x663a1e, mane: 0x4e2a14, points: 0, w: 3 },
  { kind: '鹿毛', coat: 0x5e3520, mane: 0x120e0b, points: 1, w: 4 },
  { kind: '黒鹿毛', coat: 0x2e1f16, mane: 0x0e0b09, points: 1, w: 3 },
  { kind: '青毛', coat: 0x17130f, mane: 0x0c0a08, points: 0, w: 2 },
  { kind: '栃栗毛', coat: 0x4a2a18, mane: 0x7a5a3a, points: 0, w: 1 },
  { kind: '芦毛', coat: 0x86827a, mane: 0x4a4640, points: 0.4, w: 1 },
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
      P.push(paint(at(new THREE.BoxGeometry(0.02, 0.42, 0.5), sx, 1.28, 0.02), st.aori));
      P.push(paint(at(new THREE.BoxGeometry(0.1, 0.03, 0.2), sx * 1.12, 0.98, 0.1), 0x2a2420));
      P.push(paint(at(new THREE.BoxGeometry(0.01, 0.34, 0.01), sx * 1.08, 1.16, 0.1), 0x2a2420));
    }
    // 胸繋・尻繋（手綱の色）
    P.push(paint(at(new THREE.TorusGeometry(0.3, 0.02, 4, 16, Math.PI * 1.2), 0, 1.3, 0.62, 0, 0, Math.PI * 0.9), st.tack));
    P.push(paint(at(new THREE.TorusGeometry(0.31, 0.022, 4, 16, Math.PI * 1.1), 0, 1.33, -0.66, 0, 0, Math.PI * 0.95), st.tack));
    // 厚総：尻に下がる房
    if (st.tassels) for (let k = 0; k < 7; k++) {
      const a = -0.9 + k * 0.3;
      P.push(paint(at(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 6), Math.sin(a) * 0.33, 1.14, -0.62 + Math.cos(a) * -0.08), st.tassels));
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
    P.push(paint(at(new THREE.BoxGeometry(0.05, 0.78, 0.12), 0, 0.33, -0.03, 0.62), st.mane));
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
  tail.add(mergedMesh('ht' + st.mane + '|' + c, (P) => { P.push(paint(at(new THREE.BoxGeometry(0.09, 0.72, 0.1), 0, -0.34, -0.06, 0.25), st.mane)); }, (Q) => horseTailHi(Q, st)));
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

export function weaponMesh(kind, extra = 0, sk) { return makeWeapon(kind, extra, sk); }

// 透けた旗の材質（元の材質ごとに一つ）
const fadedCache = new Map();
function fadedFlag(m) {
  if (m.userData.faded) return m;
  if (!fadedCache.has(m)) { const f = m.clone(); f.transparent = true; f.opacity = 0.22; f.alphaTest = 0; f.depthWrite = false; f.userData.faded = true; f.onBeforeCompile = m.onBeforeCompile; fadedCache.set(m, f); }
  return fadedCache.get(m);
}
// 旗の時計（はためきの位相）
export const FLAG_T = { value: 0 };
function flagMaterial(kind) {
  if (flagMatCache.has(kind)) return flagMatCache.get(kind);
  const m = new THREE.MeshStandardMaterial({ map: flagTexture(kind), side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  // 布のはためき：竿から離れるほど大きく波打つ。旗ごとに位相をずらす
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T;
    sh.vertexShader = 'uniform float uFlagT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fo = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = fo.x * 0.73 + fo.z * 0.41;
      float k = clamp(position.x / 0.36, 0.0, 1.0);
      transformed.z += (sin(uFlagT * 5.2 + position.x * 16.0 + position.y * 4.0 + ph) * 0.045 + sin(uFlagT * 2.3 + ph) * 0.03) * k;
      transformed.x -= abs(sin(uFlagT * 5.2 + position.x * 16.0 + ph)) * 0.012 * k;`);
  };
  flagMatCache.set(kind, m);
  return m;
}

// 馬印：金扇・瓢箪・日輪
function umaGeometry(kind) {
  const k = 'uma' + kind;
  if (geoCache.has(k)) return geoCache.get(k);
  const gold = 0xd4ab4e, parts = [];
  parts.push(paint(at(new THREE.CylinderGeometry(0.02, 0.022, 2.4, 5), 0, 2.1, 0), 0x2a1c10));
  if (kind === 'fan') {
    // 開いた扇：要（かなめ）を下にした半円。裏からも見えるよう両面に
    for (const ry of [0, Math.PI]) parts.push(paint(at(new THREE.CircleGeometry(0.7, 18, Math.PI * 0.12, Math.PI * 0.76), 0, 3.05, 0, 0, ry), gold));
    for (const ry of [0, Math.PI]) parts.push(paint(at(new THREE.CircleGeometry(0.17, 14), 0, 3.5, ry ? -0.01 : 0.01, 0, ry), 0xb8231a));
    for (let k = 0; k < 7; k++) { const a = Math.PI * 0.12 + (k / 6) * Math.PI * 0.76; parts.push(paint(at(new THREE.BoxGeometry(0.015, 0.7, 0.03), Math.cos(a) * 0.35, 3.05 + Math.sin(a) * 0.35, 0, 0, 0, a - Math.PI / 2), 0x6a4a1a)); }
  } else if (kind === 'gourd') {
    parts.push(paint(at(new THREE.SphereGeometry(0.3, 12, 8), 0, 3.4, 0), gold));
    parts.push(paint(at(new THREE.SphereGeometry(0.2, 12, 8), 0, 3.82, 0), gold));
    parts.push(paint(at(new THREE.CylinderGeometry(0.05, 0.08, 0.14, 8), 0, 4.06, 0), 0xb8231a));
    for (let i = 0; i < 8; i++) parts.push(paint(at(new THREE.BoxGeometry(0.03, 0.34, 0.03), Math.sin(i * 0.8) * 0.12, 3.05, Math.cos(i * 0.8) * 0.12), 0xb8231a));
  } else {
    parts.push(paint(at(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), 0, 3.5, 0, Math.PI / 2), gold));
    parts.push(paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 18), 0, 3.5, 0.01, Math.PI / 2), 0xb8231a));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push(paint(at(new THREE.BoxGeometry(0.03, 0.22, 0.02), Math.sin(a) * 0.5, 3.5 + Math.cos(a) * 0.5, 0, 0, 0, -a), gold)); }
  }
  const g = merge(parts);
  geoCache.set(k, g);
  return g;
}

// 近い兵だけ細かい形で描く（描く直前にカメラとの距離で形を入れ替える）
export const LOD = { near: 16, on: true };
// 遠い兵（カメラから far m より先）は、一人ずつの形をやめて軽い兵の形でまとめて描く（world.makeImpostor。描く回数を減らす）
// 騎馬・武将・名のある者・倒れかけの者は、そのまま一人ずつ描く
export const IMP = { on: true, far: 48 };
// 待つ兵の小さな動き（idleFx・遠くの兵の揺れ）。見比べる時は on を false に
export const IDLE = { on: true };
function lodSwap(mesh, hi, lo, near) {
  mesh.geometry = hi;
  if (hi === lo) return;
  mesh.onBeforeRender = (r, s, cam) => {
    const e = mesh.matrixWorld.elements, c = cam.matrixWorld.elements;
    const dx = e[12] - c[12], dy = e[13] - c[13], dz = e[14] - c[14];
    const nr = (near ?? LOD.near);
    const want = !LOD.on || dx * dx + dy * dy + dz * dz < nr * nr ? hi : lo;
    if (mesh.geometry !== want) mesh.geometry = want;
  };
}
// 顔の形の値を引く（名のある武将・本人・兵の顔の番号）
function faceOf(look) {
  const f = look.face;
  if (f && typeof f === 'object') return f;
  if (f === 'player') return PLAYER_FACE;
  if (typeof f === 'string' && f.startsWith('g:')) return (GENERALS[f.slice(2)] || {}).face || FACES[0];
  return FACES[(f | 0) % FACES.length];
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
  const vi = (look.vi || 0) % 6, f = typeof look.face === 'number' ? look.face : 0;
  const lead = (look.tier ?? 0) >= 2;   // 大将（正覚院豪盛など）は裹頭に金茶の袈裟
  const sv = lead ? 2 : (f * 5 + vi * 3 + 2) % 8;   // 0 鉢巻・1 兜・ほかは裹頭
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
    tg.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    nr.set(...ns[i]).normalize();
    sd.crossVectors(nr, tg).normalize();
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
  const pos = [], uv = [], sh = [], idx = [];
  const NW = ths.length, NH = phs.length;
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const th = ths[i], ph = phs[j];
    const c = Math.cos(ph), dx = Math.sin(th) * c, dy = Math.sin(ph), dz = Math.cos(th) * c;
    const r = R(th, ph) + off;
    const x = C.x + dx * r, y = C.y + dy * r;
    // 目の窓：正面の細い横長（端は細く）
    const fr = sm(0.45, 0.7, dz);
    const ex = (x - win.x) / win.hw, ey = (y - win.y) / win.hh;
    const e = 0.35 * ex * ex + 0.65 * ex ** 6 + ey * ey;
    const m = fr * (1 - sm(0.72, 1.2, e));
    // 巻きの重なり：額の段は後ろの結びへ下がり、目の下・顎の段は後ろへ上がる。頭の上は張って滑らか
    const bk = (1 - Math.cos(th)) / 2;
    const qU = (y - yTop - 0.004 + 0.05 * bk) / 0.024, qL = (yBot - 0.003 + 0.055 * bk - y) / 0.022;
    const wU = hi ? sm(0, 0.5, qU) * (1 - sm(C.y + 0.07, C.y + 0.11, y)) : 0;
    const wL = hi ? sm(0, 0.5, qL) * sm(C.y - 0.24, C.y - 0.17, y) : 0;
    let dr = 0.0042 * (wU * (1 - saw(qU)) + wL * (1 - saw(qL)));
    let s = 1 - 0.3 * (wU * sm(0.72, 1, saw(qU)) + wL * sm(0.72, 1, saw(qL)));
    // しわ：巻いた向きに細かく
    if (hi) dr += (0.0013 * Math.sin(th * 19 + y * 90 + vi) + 0.0008 * Math.sin(th * 31 - y * 170 + vi * 2)) * (0.35 + wU + wL);
    // 窓の縁は少し盛り上がり、内へ折れ込む。奥は影
    dr += 0.0035 * Math.sin(Math.PI * Math.min(1, m / 0.5)) * (m < 0.5 ? 1 : 0) - 0.042 * sm(0.3, 1, m);
    s *= 1 - 0.7 * sm(0.15, 0.7, m);
    const rr = r + dr;
    pos.push(C.x + dx * rr, C.y + dy * rr, C.z + dz * rr);
    uv.push(i / (NW - 1), j / (NH - 1));
    sh.push(s);
  }
  for (let j = 0; j < NH - 1; j++) for (let i = 0; i < NW - 1; i++) { const a = j * NW + i, b = a + 1, cc = a + NW, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
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
      const rr = (r0_ + (r1 - r0_) * Math.pow(w, 0.75)) * fold - (inner ? 0.006 : 0);
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
  const g = katoGeometry(R, HC, { col: o.kato || 0xe2dccf, vi, hi, win: { x: 0, y: 1.622, hw: 0.056, hh: 0.014 + 0.002 * (vi % 3) }, drop: [1, 1.15, 0.9, 1.25, 1.05, 0.95][vi] });
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
  // 五条袈裟：左の肩から右の脇へ斜めに掛ける布の帯。厚み（表と裏）、縁取り、条の縫い目、しわ
  {
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
      const a = -Math.PI + u * Math.PI * 2, y = -0.5 + v * 0.27, t = (-0.23 - y) / 0.27;
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

// 見た目の値から形の鍵を作る（同じ見た目の兵は形を共有する）
function lookKey(look) {
  return [look.armor, look.lace, look.hat, look.sode ? 1 : 0, look.haori || 0, look.pole ? 1 : 0, look.saya ? 1 : 0, look.menpo || 0, look.menpoStyle || '', look.horo || 0, look.trim || 0, look.left || '', look.cloth || 0, look.tier, (look.vi || 0) % 6, look.mon || '', look.haoriMon || '', look.tenugui ? 1 : 0, look.dirt ?? '', look.sohei ? 's' + look.soheiV + '/' + (look.kato || 0) + '/' + (look.kesa || 0) + (look.haramaki ? 'h' : '') : ''].join('|');
}
function tierOf(look) { return look.tier ?? (look.haori ? 2 : look.hat && look.hat.startsWith('kabuto') ? 1 : 0); }
function headOf(look, hi) {
  const T = look.tier;
  const F = faceOf(look);
  const skin = look.skin || 0xb58c68;
  const hair = F.hair || look.hair || HAIR.black;
  const fkey = typeof look.face === 'string' ? look.face : 'f' + ((look.face | 0) % FACES.length);
  const F2 = { ...F, neck: [0.95, 1.1, 1.2, 1.25][T] };
  const hdirt = look.dirt ?? [0.7, 0.45, 0.3, 0.15][T];
  // 僧兵（humans.js が monk を付ける）：剃った頭で髷がなく、耳は裹頭の中（布から突き出ないよう形にしない）
  if (look.monk) { F2.monk = 1; F2.t = (F.t || 0) % 3; }   // 髭も剃る（顔の模様は剃り跡・無精髭だけ）
  return headGeometry(fkey + '|' + T + (look.monk ? '|m' : ''), F2, skin, hair, hi, hdirt);
}
// 軽い形の頭：顔と、頭に付く物（陣笠・鉢巻・兜・面頬）を一つの形に（首を振っても、倒れても、笠が頭から離れないよう）
function headWithHat(key, look, hi) {
  const ck = 'hh|' + key + '|' + (typeof look.face === 'string' ? look.face : look.face | 0) + '|' + (look.skin || 0) + '|' + (look.hair || 0) + (hi ? '|H' : '|L');
  if (geoCache.has(ck)) return geoCache.get(ck);
  const face = headOf(look, hi), hat = bodyGeometry(key, look, hi, 'head');
  const g = hat ? merge([face.clone(), hat.clone()]) : face;
  geoCache.set(ck, g);
  return g;
}
const koteOf = (look) => look.kote ?? (look.tier >= 1 ? 3 : [3, 3, 1, 3, 0, 3][(look.vi || 0) % 6]);
// 骨の入った人（humans.js）に着せる部品。どれも本編の兵と同じ形・同じ材質で、部位ごとに分けてある
// 胴まわり・草摺・袖・兜は立ち姿の体の座標、腕と脚の部品は関節を原点に下（-y）へ伸びる座標
// hi：false なら遠く用の軽い形（humans.js が遠くの兵に使う）
export function lookParts(look0, hi = true) {
  look0 = soheiLook(look0);
  const look = { ...look0, tier: tierOf(look0) };
  const key = lookKey(look);
  const kote = koteOf(look);
  const F = faceOf(look);
  return {
    look, key, F, skin: look.skin || 0xb58c68, hair: F.hair || look.hair || HAIR.black,
    torso: bodyGeometry(key, look, hi, 'torso'), hips: bodyGeometry(key, look, hi, 'hips'), haori: bodyGeometry(key, look, hi, 'haori'), back: bodyGeometry(key, look, hi, 'back'), koshi: bodyGeometry(key, look, hi, 'koshi'),
    sodeP: bodyGeometry(key, look, hi, 'sodeP'), sodeN: bodyGeometry(key, look, hi, 'sodeN'), head: bodyGeometry(key, look, hi, 'head'),
    face: headOf(look, hi),
    thigh: thighGeometry(look, hi, 'armor'), leg: shinGeometry(look, hi, 'leg'), foot: shinGeometry(look, hi, 'foot'),
    upperP: armGeometry(look, 1, kote & 2, hi, 'upper'), foreP: armGeometry(look, 1, kote & 2, hi, 'fore'), handP: armGeometry(look, 1, kote & 2, hi, 'hand'),
    upperN: armGeometry(look, -1, kote & 1, hi, 'upper'), foreN: armGeometry(look, -1, kote & 1, hi, 'fore'), handN: armGeometry(look, -1, kote & 1, hi, 'hand'),
  };
}

export function buildModel(u, look) {
  const root = new THREE.Group();
  look = soheiLook(look);
  const T = tierOf(look);
  look = { ...look, tier: T };
  const key = lookKey(look);
  const body = new THREE.Mesh(bodyGeometry(key, look, true, 'nohead'), MAT);
  lodSwap(body, body.geometry, bodyGeometry(key, look, false, 'nohead'));
  body.castShadow = true;
  root.add(body);
  // 顔と首（肌と髪の色、顔の形で作り分ける）。笠・兜は頭の形に入れる（首の動きについて行く）
  const head = new THREE.Mesh(headWithHat(key, look, true), MAT);
  lodSwap(head, head.geometry, headWithHat(key, look, false));
  head.castShadow = true;
  body.add(head);
  const legL = new THREE.Mesh(thighGeometry(look, true), MAT);
  const legR = new THREE.Mesh(thighGeometry(look, true), MAT);
  lodSwap(legL, legL.geometry, thighGeometry(look, false), 12); lodSwap(legR, legR.geometry, thighGeometry(look, false), 12);
  legL.position.set(0.11, 0.74, 0);
  legR.position.set(-0.11, 0.74, 0);
  const shinL = new THREE.Mesh(shinGeometry(look, true), MAT), shinR = new THREE.Mesh(shinGeometry(look, true), MAT);
  lodSwap(shinL, shinL.geometry, shinGeometry(look, false), 12); lodSwap(shinR, shinR.geometry, shinGeometry(look, false), 12);
  shinL.position.set(0, -0.4, 0.01); shinR.position.set(0, -0.4, 0.01);
  legL.add(shinL); legR.add(shinR);
  legL.castShadow = legR.castShadow = shinL.castShadow = shinR.castShadow = true;
  root.add(legL, legR);
  const wpn = makeWeapon(look.weapon, look.weaponExtra || 0, look.spear);
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';   // 左右に向けてから上下（刀の振り・槍の払いが素直になる）
  hand.position.set(look.weapon === 'bow' ? -0.3 : 0.3, 1.08, 0.18);
  hand.add(wpn);
  root.add(hand);
  let flag = null;
  if (look.flag) {
    flag = new THREE.Mesh(flagGeo, flagMaterial(look.flag));
    flag.position.set(0, 2.36, -0.24);
    flag.scale.setScalar(look.flagScale || 1);
    // 本人の指物：旗の上に横手（横の竿）と竿の先の飾り
    if (look.hero) {
      const bar = new THREE.Mesh(heroFlagBar(), MAT);
      flag.add(bar);
    }
    root.add(flag);
  }
  // 馬印（城主から）：背に高く掲げる
  let uma = null;
  if (look.uma) { uma = new THREE.Mesh(umaGeometry(look.uma), MAT); uma.position.set(0, 0, -0.26); uma.castShadow = true; root.add(uma); }
  // 腕（胴の子にして、胴の上下や傾きについて行かせる）。籠手は両腕・左だけ・なし
  const kote = koteOf(look);
  const armR = new THREE.Mesh(armGeometry(look, 1, kote & 2, true), MAT), armL = new THREE.Mesh(armGeometry(look, -1, kote & 1, true), MAT);
  lodSwap(armR, armR.geometry, armGeometry(look, 1, kote & 2, false)); lodSwap(armL, armL.geometry, armGeometry(look, -1, kote & 1, false));
  armR.position.set(0.27, 1.37, 0); armL.position.set(-0.27, 1.37, 0);
  armR.castShadow = armL.castShadow = true;
  body.add(armR, armL);
  u.mesh = root; u.body = body; u.head = head; u.legL = legL; u.legR = legR; u.shinL = shinL; u.shinR = shinR; u.hand = hand; u.wpn = wpn; u.flag = flag; u.uma = uma;
  u.armR = armR; u.armL = armL; u.lookWeapon = look.weapon; u.look = look;
  poseArms(u);
  return root;
}
function heroFlagBar() {
  const k = 'herobar';
  if (geoCache.has(k)) return geoCache.get(k);
  const g = merge([
    P(at(new THREE.CylinderGeometry(0.009, 0.009, 0.38, 5), 0.18, 0.365, 0, 0, 0, Math.PI / 2), 0x2a1c12, { mk: MK.lac }),
    P(at(new THREE.ConeGeometry(0.018, 0.06, 6), 0, 0.41, 0), 0xa8893f, { mk: MK.gold }),
  ]);
  geoCache.set(k, g);
  return g;
}

// ---------------- 部隊・兵 ----------------
let nextId = 1;
// 重なる音をまとめる：[そのまま鳴らす数, まとめた音の名]
const SOUND_BUNCH = { gun: [2, 'volley'], string: [3, 'volleyBow'], arrow: [3, null], hooves: [2, 'gallop'], neigh: [2, null], kin: [3, null], yoroi: [3, null], thunk: [3, null], hizara: [2, null], hit: [4, null] };
// 史実で生き延びる武将（invuln）の体力の下限（最大の何割）。ここまで削ると手傷を負って退く
export const WOUND_FLOOR = 0.35;
// 倒れる動き（animDeath）の長さ。これより後の倒れた体は、最後の姿勢のまま止める
export const DEATH_END = 2.2;
const _dUp = new THREE.Vector3(), _dN = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dI = new THREE.Quaternion();

export class Group {
  constructor(o) {
    Object.assign(this, {
      team: 0, faction: 'oda', name: '', order: 'hold', formation: 'line', width: 0, spacing: 1.5,
      anchor: { x: 0, z: 0 }, facing: 0, dest: null, path: null, pathIdx: 0, speed: 2.2,
      aggro: 10, seekRange: 45, morale: 100, noRout: false, routed: false,
      fleeDir: { x: 0, z: -1 }, flankHits: 0, flankAwarded: false, dmgMult: 1, defMult: 1,
      isPlayerSquad: false, focus: null, fire: true, leader: null, onRout: null, assault: null, label: '',
    }, o);
    this.id = nextId++;
    this.units = [];
    this.initial = 0;
  }
  alive() { return this.units.filter((u) => u.alive); }
  get count() { let n = 0; for (const u of this.units) if (u.alive) n++; return n; }
  center() {
    let x = 0, z = 0, n = 0;
    for (const u of this.units) if (u.alive) { x += u.pos.x; z += u.pos.z; n++; }
    return n ? { x: x / n, z: z / n } : { x: this.anchor.x, z: this.anchor.z };
  }
  forward() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  // 鉄砲の段の数（鉄砲の隊だけ。ranks で決められる。1 なら一列）
  gunRanks() { return this.isGun && (this.formation === 'line' || this.formation === 'yari') && !this.marching ? Math.max(1, this.ranks || 2) : 1; }
  // 並び方：横に何人、間はどれほど
  layout(n) {
    const f = this.marching ? 'march' : this.formation;
    let sp = f === 'loose' ? this.spacing * 2.2 : f === 'yari' ? this.spacing * 0.8 : this.spacing;
    if (this.cav) sp *= 1.7;   // 馬は場所をとる
    let cols = this.width || Math.max(2, Math.ceil(Math.sqrt(n * 2.2)));
    if (f === 'column') cols = 2;
    if (f === 'march') cols = n >= 24 ? 4 : n >= 9 ? 3 : 2;
    if (f === 'yari') cols = Math.max(2, Math.ceil(n / 2));
    const R = this.gunRanks();
    if (R > 1) cols = Math.ceil(n / R);
    return { f, sp, cols, R };
  }
  // 鉄砲の段：i 番の兵の列と、その列で何番目か
  gunSlot(i, n, cols) {
    const col = i % cols, k = Math.floor(i / cols);
    const cnt = Math.floor((n - 1 - col) / cols) + 1;
    const fr = (this.front && this.front[col]) || 0;
    return { col, k, cnt, row: (k - fr + cnt) % cnt };
  }
  slotPos(i, n) {
    const { f, sp, cols, R } = this.layout(n);
    let row, col, inRow, lat = 0;
    if (R > 1) {
      // 撃った者は後ろの段へ下がり、込めた者が前に出る。段ごとに半間ずらし、すれ違えるように
      const s = this.gunSlot(i, n, cols);
      row = s.row; col = s.col; inRow = cols;
      lat = (row % 2) * sp * 0.5;
    } else {
      row = Math.floor(i / cols); col = i % cols;
      inRow = Math.min(cols, n - row * cols);
    }
    const r = (col - (inRow - 1) / 2) * sp + lat;
    const b = row * sp * (f === 'column' || f === 'march' ? 1.3 : R > 1 ? 0.8 : 1);
    // 並びは、ゆっくり向きを変える隊の向き（_face）に合わせる
    const h = this._face ?? this.facing;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -Math.cos(h), rz = Math.sin(h);
    return { x: this.anchor.x + rx * r - fx * b, z: this.anchor.z + rz * r - fz * b };
  }
  // 横の広がりの半分（向きを変える速さに使う）
  halfWidth() {
    const { sp, cols } = this.layout(this.initial || 1);
    return Math.min(cols, this.initial || 1) * sp / 2;
  }
}

export class Unit {
  constructor(o) {
    const t = TYPES[o.type];
    Object.assign(this, {
      team: 0, type: 'ashigaru', name: '', hp: t.hp, maxHp: t.hp, dmg: t.dmg, reach: t.reach, cd: 0, cdBase: t.cd,
      windup: t.windup, speed: t.speed, run: t.run, range: t.range || 0, heading: 0, alive: true, fleeing: false,
      target: null, moveTo: null, atk: null, aiT: Math.random() * 0.3, slot: 0, isPlayer: false, isSub: false,
      confused: 0, invuln: false, deadT: 0, anim: Math.random() * 10, moving: 0, lastHitT: 99, hitFlash: 0,
      tag: '', noHead: false,
    }, o);
    this.id = nextId++;
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.vel = { x: 0, z: 0 };
    this.mv = { x: 0, z: 0 };     // 自分の足での速さ（加減速する）
    this.push = { x: 0, z: 0 };   // 押し合いの力（ならして使う）
  }
}

// ---------------- 軍勢の管理 ----------------
export class Army {
  constructor(scene, world, hooks = {}) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.units = [];
    this.groups = [];
    this.structs = [];
    this.arrows = [];
    this.dead = [];
    this.grid = new Map();
    this.cell = 6;
    this.lodT = 0;
    this.time = 0;
    this.buildParticles();
    this.tmpSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
  }

  addGroup(o) {
    const g = new Group(o);
    this.groups.push(g);
    return g;
  }

  addUnit(g, o) {
    const fac = FACTION[g.faction] || FACTION.oda;
    const u = new Unit({ team: g.team, ...o });
    u.group = g;
    u.slot = g.units.length;
    g.units.push(u);
    g.initial++;
    const t = TYPES[u.type];
    // 名のある実在の武将は、その人の兜・甲冑・陣羽織で
    const gen = (o.name && GENERALS[o.name.replace(/^.* /, '')]) || {};
    // 騎馬武者の六人に一人は背に母衣（母衣衆）。残りは指物を立て、旗の林にする
    const horoCav = u.type === 'cavalry' && o.flag === undefined && u.id % 6 === 0;
    if (horoCav) o = { ...o, flag: null };
    // 見た目の組み合わせ（一人ずつ変えるが、形の数が増えすぎないよう六通りに束ねる）
    const vi = u.id % 6;
    const tier = u.type === 'player' ? (o.tier ?? 0) : gen.armor ? 3 : u.type === 'busho' ? 3 : (u.type === 'samurai' || u.type === 'cavalry') ? 1 : 0;
    const look = {
      armor: o.armor ?? gen.armor ?? (u.type === 'busho' ? (g.faction === 'akazonae' ? fac.armor : 0x1c1a1a) : fac.armor),
      // 威糸の色に少しばらつきを持たせる
      lace: o.lace ?? gen.lace ?? [fac.lace, fac.lace2 || fac.lace, fac.lace3 || fac.lace][vi % 3],
      // 足軽の六人に一人は陣笠を脱いで鉢巻、一人は陣笠の下に手拭い
      hat: (gen.hatFix && gen.hat) || (o.hat ?? gen.hat ?? (u.type === 'busho' ? 'kabuto_b' : tier === 0 && vi === 5 && (u.type === 'ashigaru' || u.type === 'bow') ? 'hachimaki' : t.hat)),
      tenugui: tier === 0 && vi === 2,
      sode: u.type === 'samurai' || u.type === 'busho' || o.sode,
      haori: o.haori ?? gen.haori ?? (u.type === 'busho' ? (g.team === 0 ? 0x6b1f18 : 0x5a4a22) : 0),
      pole: o.flag !== null && u.type !== 'porter',
      flag: o.flag === null || u.type === 'porter' ? null : (o.flag || fac.flag),
      // 旗の大きさで隊が分かる：鉄砲は小旗、騎馬は大きな指物
      flagScale: o.flagScale || (u.type === 'busho' ? 1.3 : u.type === 'gun' ? 0.55 : u.type === 'cavalry' ? 1.35 : 1),
      weapon: o.weapon || t.weapon,
      // 足軽の槍は長柄（5m ほど）
      weaponExtra: o.weaponExtra ?? 0,
      // 槍の拵え：足軽は長柄（三間。織田は三間半）、騎馬と侍は素槍、武将は大身槍
      spear: o.spear ?? (o.weaponExtra != null ? null : u.type === 'ashigaru' && !o.weapon ? (g.faction === 'oda' ? 'nagae35' : 'nagae') : u.type === 'busho' ? 'omi' : 'su'),
      skin: o.skin ?? gen.skin ?? SKIN_TONES[vi],
      // 顔：名のある武将はその人の顔、本人は本人の顔、兵は十二の顔から
      face: o.face ?? (gen.face ? 'g:' + o.name.replace(/^.* /, '') : (u.id * 7) % 12),
      // 鎧下・袴の色：藍・茶・鼠・黒
      cloth: o.cloth ?? [0x2b2622, 0x262c3a, 0x3a2e24, 0x34342e, 0x262c3a, 0x2b2622][vi],
      saya: u.type === 'samurai' || u.type === 'busho' || u.type === 'cavalry' || o.saya,
      menpo: o.menpo ?? (gen.armor ? gen.menpo || 0 : (u.type === 'busho' && vi % 2 === 0 ? 0x6a1c14 : u.type === 'samurai' && u.id % 2 === 0 ? 0x1c1a18 : 0)),
      menpoStyle: o.menpoStyle ?? gen.menpoStyle ?? (u.type === 'busho' ? 'hanbo' : 'full'),
      // 母衣は母衣衆（騎馬の使番）と、史実で母衣を着けた武将（前田利家の赤母衣など）だけ
      horo: gen.horo ?? (horoCav ? (u.id % 12 === 0 ? 0xe6dfcf : fac.lace) : 0),
      tier, vi, mon: o.mon ?? gen.mon ?? fac.flag, haoriMonCol: gen.haoriMonCol,
      trim: o.trim || 0, left: o.left || null, uma: o.uma || null, dirt: o.dirt, hero: u.type === 'player',
      // 本物の胴丸（humans.js の3Dスキャン）を着る（侍大将より上の本人など）
      real: o.real || 0,
      // 僧兵（humans.js で白い裹頭・袈裟・薙刀を着せる）
      sohei: o.sohei || 0,
    };
    buildModel(u, look);
    if (u.type === 'cavalry') o.horse = true;
    // 名のある武将の馬は、家の色の馬具（鞍の縁は金、厚総は大きく）
    const hst = () => { const s = horseStyleFor(u.id, gen.face ? 2 : u.type === 'busho' ? 1 : 0, g.faction); if (gen.tack) { s.tack = gen.tack; s.tassels = gen.tack === 0x2a2420 || gen.tack === 0x1a1816 ? (gen.lace ?? s.tassels) : new THREE.Color(gen.tack).multiplyScalar(1.3).getHex(); s.cushion = gen.haori ?? s.cushion; } return s; };
    if (o.horse) this.setMounted(u, true, buildHorse(o.horseStyle || hst()));
    if (u.type === 'porter') {
      const box = new THREE.Mesh(paint(at(new THREE.BoxGeometry(0.6, 0.45, 0.4), 0, 1.45, -0.3), 0x6b5236), MAT);
      u.mesh.add(box);
    }
    // 影を描かない画質では、足元に丸い影を置いて接地感を出す
    if (this.blobShadows) {
      if (!this.blobGeo) { this.blobGeo = new THREE.CircleGeometry(0.45, 12); this.blobGeo.rotateX(-Math.PI / 2); this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }); }
      const bl = new THREE.Mesh(this.blobGeo, this.blobMat); bl.position.y = 0.03; u.mesh.add(bl); u.blob = bl;
    }
    // 体格のばらつき：小柄・普通・大柄、痩せ・がっしり
    if (u.type !== 'player' && u.type !== 'dummy' && !o.horse) { const h = 0.92 + Math.random() * 0.16, w = 0.92 + Math.random() * 0.16; u.mesh.scale.set(h * w, h, h * (0.96 + (w - 1) * 0.6)); }
    u.pos.y = this.world.heightAt(u.pos.x, u.pos.z);
    u.mesh.position.copy(u.pos);
    u.heading = o.heading ?? g.facing;
    u.mesh.rotation.y = u.heading;
    this.scene.add(u.mesh);
    this.units.push(u);
    return u;
  }

  // 部隊を陣形どおりに一括配置
  spawn(g, list) {
    const n = list.reduce((a, s) => a + s.n, 0);
    const total = g.units.length + n;
    // 隊の種類：六割より多くが鉄砲なら鉄砲の隊（段を組んで入れ替わる）、騎馬なら騎馬の隊（間を広くとる）
    const cnt = (ty) => g.units.filter((x) => x.type === ty).length + list.reduce((a, s) => a + (s.type === ty ? s.n : 0), 0);
    g.isGun = total >= 4 && cnt('gun') >= total * 0.6;
    g.cav = total >= 3 && cnt('cavalry') >= total * 0.6;
    g.cavShare = cnt('cavalry') / Math.max(1, total);
    if (g.isGun && !g.front) g.front = [];
    let i = g.units.length;
    const out = [];
    let banner = total >= 8 && !g.isPlayerSquad && !g.units.some((x) => x.banner);
    for (const spec of list) {
      for (let k = 0; k < spec.n; k++) {
        const p = g.slotPos(i, total);
        // 大きめの部隊には隊旗を持つ旗持ちを一人（鉄砲の隊は、小旗の中に大きな隊旗が一本）
        const bo = banner && (spec.type === 'ashigaru' || (g.isGun && spec.type === 'gun')) && !(spec.o && spec.o.flag === null) ? { flagScale: 1.9 } : {};
        const u = this.addUnit(g, { type: spec.type, x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, ...(spec.o || {}), ...bo });
        if (bo.flagScale) { u.banner = true; banner = false; }
        out.push(u);
        i++;
      }
    }
    return out;
  }

  addStruct(s) {
    const st = Object.assign({ isStruct: true, alive: true, hp: 100, maxHp: 100, team: 0 }, s);
    this.structs.push(st);
    return st;
  }

  // ---------------- 空間検索 ----------------
  rebuildGrid() {
    this.grid.clear();
    const c = this.cell;
    for (const u of this.units) {
      if (!u.alive) continue;
      const k = Math.floor(u.pos.x / c) + ',' + Math.floor(u.pos.z / c);
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(u);
    }
  }

  forNear(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.grid.get(i + ',' + j);
      if (a) for (const u of a) fn(u);
    }
  }

  nearestEnemy(u, r, filter) {
    let best = null, bd = Infinity;
    const r2 = r * r;
    // 攻めかかる隊は、10m より遠くの逃げる敵を後回しにする（深追いしない）
    const late = u.group && u.group.order === 'attack';
    this.forNear(u.pos.x, u.pos.z, r, (o) => {
      if (o.team === u.team || !o.alive || o.invuln || o.noTarget) return;
      if (filter && !filter(o)) return;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      const d = dx * dx + dz * dz;
      if (d >= r2) return;
      const k = late && o.fleeing && d > 100 ? d + 1e6 : d;
      if (k < bd) { bd = k; best = o; }
    });
    return best;
  }

  // pos から的 tp までの間に塀・柵（seg）があるか。塀のすぐ内側（2.5m 以内）の城方が外を突くのはよいが、外から内へは届かない
  wallBetween(pos, team, tp) {
    for (const s of this.structs) {
      if (!s.alive || !s.seg) continue;
      if (segHit(pos.x, pos.z, tp.x, tp.z, s.seg) < 0) continue;
      if (s.team === team && distToSeg(pos.x, pos.z, s.seg) < 2.5) continue;
      return true;
    }
    return false;
  }

  enemiesInArc(pos, heading, reach, halfAngle, team) {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.forNear(pos.x, pos.z, reach + 1, (o) => {
      // 討たれない武将も、手傷を負って退くまでは突ける（damage で下限に止める）
      if (o.team === team || !o.alive || (o.invuln && o.woundOut)) return;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.35) return;
      if (this.wallBetween(pos, team, o.pos)) return;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (cos < Math.cos(halfAngle)) return;
      out.push({ u: o, d, cos });
    });
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // 位置に応じた音量と左右の定位で鳴らす
  play(name, pos, vol = 1) {
    // 同じ音が一度にたくさん重なるときは、まとめて一つの大きな音にする（一斉射撃・弓の斉射・騎馬の群れ）
    const lim = SOUND_BUNCH[name];
    if (lim) {
      const s = this.sndBunch || (this.sndBunch = {});
      const r = s[name] || (s[name] = { t: -9, n: 0 });
      if (this.time - r.t > 0.4) { r.t = this.time; r.n = 0; }
      r.n++;
      if (r.n > lim[0]) {
        if (r.n !== lim[0] + 1 || !lim[1]) return;
        name = lim[1]; vol *= 1.1;
      }
    }
    const v = this.hooks.volumeAt ? this.hooks.volumeAt(pos) : 1;
    const pan = this.hooks.panAt ? this.hooks.panAt(pos) : 0;
    withPan(pan, () => sfx(name, v * vol));
  }

  // ---------------- ダメージ ----------------
  // opts：kind 技（thrust 突き・slam 叩き・sweep 払い・kesa/gyaku/yoko 斬り・tsuki 刀の突き・charge 騎馬の突き・butt 台尻・arrow 矢・gun 弾）、
  //       pierce 構えで防げない、out 振りの記録（res に 'hit'|'armor'|'block' を書く）、y 当たった高さ、d 撃った遠さ
  damage(t, amount, src, opts = {}) {
    if (!t.alive) return;
    const out = opts.out;
    if (t.isStruct) {
      t.hp -= amount * (1 - (t.armor || 0));
      t.hitT = this.time;
      if (out) out.res = 'hit';
      if (Math.random() < 0.5) this.play('knock', t.seg ? { x: (t.seg[0] + t.seg[2]) / 2, z: (t.seg[1] + t.seg[3]) / 2 } : { x: t.x, z: t.z }, 0.8);
      if (this.hooks.onStructHit) this.hooks.onStructHit(t, src);
      if (t.hp <= 0) { t.alive = false; t.hp = 0; if (t.mesh) t.mesh.visible = false; if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(t); }
      return;
    }
    // 史実で生き延びる武将（invuln）：遊び手の一撃だけは通る。ただし体力は最大の 35% で止まり、そこで手傷を負って退く。
    // 味方の兵や筋書きの弾は今まで通り甲冑で弾く（勝手に史実が崩れないように）
    if (t.invuln && !this.mayWound(t, src)) { if (out) out.res = 'armor'; return; }
    const kind = opts.kind || 'thrust';
    // どちらから打たれたか（打たれた者の向きから見て）。side：右から 1、左から -1
    let from = 'front', side = Math.random() < 0.5 ? 1 : -1;
    if (src && src.pos) {
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
      const fw = (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d;
      const rt = (dx * Math.cos(t.heading) - dz * Math.sin(t.heading)) / d;
      side = rt >= 0 ? 1 : -1;
      from = fw > 0.5 ? 'front' : fw < -0.45 ? 'back' : side > 0 ? 'right' : 'left';
    }
    if (t.isPlayer && this.hooks.playerDamage) {
      // 構えて受けた：刃と刃（柄）が当たって火花
      if (t.guard && from === 'front' && src && !src.isStruct && kind !== 'gun' && kind !== 'arrow') { this.clashAt(src, t); if (out) out.res = 'block'; }
      amount = this.hooks.playerDamage(amount, src);
      if (amount <= 0) return;
    }
    // 敵も正面からの攻撃は構えて防ぐことがある（薙ぎ・溜め突き・反撃・背後からは防げない）
    if (src && src.isPlayer && !t.isPlayer && !opts.pierce && t.type !== 'dummy' && !t.stagger && !t.atk && !t.fleeing) {
      // 構えの姿勢をとっている敵は防ぎやすく、そうでない敵は防ぎにくい
      const chance = ({ ashigaru: 0.18, samurai: 0.38, busho: 0.5, bow: 0.05 }[t.type] || 0) * (t.guarding > 0 ? 2.2 : 0.6);
      if (from === 'front' && Math.random() < chance) {
        amount *= 0.2;
        t.guardFlash = 0.35;
        this.clashAt(src, t);
        if (out) out.res = 'block';
        if (this.hooks.onBlocked) this.hooks.onBlocked(t);
        t.hp -= amount; t.lastHitT = 0;
        if (t.invuln && t.hp <= t.maxHp * WOUND_FLOOR) { t.hp = t.maxHp * WOUND_FLOOR; this.generalWounded(t, src); return; }
        if (t.hp <= 0) this.kill(t, src);
        return;
      }
    }
    // 当たった所と甲冑：甲冑に当たれば弾かれて浅手、隙間に通れば深手
    const z = t.isPlayer ? { part: 'torso', res: 'flesh' } : this.hitZone(t, kind, src, opts);
    if (z.res === 'armor') amount *= kind === 'slam' ? 0.5 : kind === 'gun' ? 0.45 : 0.22;
    else if (z.res === 'gap') amount *= 1.3;
    else if (z.part === 'head' || z.part === 'neck') amount *= 1.4;
    if (out) out.res = z.res === 'armor' ? 'armor' : 'hit';
    t.hp -= amount;
    // 討たれない武将は下限で止まる（最後に手傷の知らせ）
    const woundNow = t.invuln && t.hp <= t.maxHp * WOUND_FLOOR;
    if (woundNow) t.hp = t.maxHp * WOUND_FLOOR;
    t.lastHitT = 0;
    t.hitFlash = 0.15;
    if (t.isSub && t.hp > 0 && t.hp < t.maxHp * 0.3 && !t.woundedWarned && this.hooks.onSubWounded) { t.woundedWarned = true; this.hooks.onSubWounded(t); }
    if (t.isSub && src && !src.isStruct && t.group && this.hooks.onSquadFlanked) {
      const f = t.group.forward();
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / d < -0.3) this.hooks.onSquadFlanked(t.group);
    }
    // 体の崩れ：甲冑で止まれば小さく怯むだけ。脚をやられれば膝をつく。前からはのけぞり、横からは横へ、後ろからは前へよろける
    const heavy = amount >= t.maxHp * 0.28 || kind === 'charge' || (kind === 'gun' && z.res !== 'armor');
    let hk;
    if (z.res === 'armor') hk = 'flinch';
    else if ((z.part === 'leg' || z.part === 'thigh') && (heavy || Math.random() < 0.45)) hk = 'kneel';
    else if (from === 'back') hk = 'stumble';
    else if (from === 'left' || from === 'right') hk = 'side';
    else hk = heavy && Math.random() < 0.45 ? 'kneel' : 'recoil';
    if ((t.mounted || t.isPlayer) && hk === 'kneel') hk = 'recoil';
    // 大きな崩れ（膝をつく）は 2.5 秒に一度まで（一人を延々と封じ込めない）
    if (hk === 'kneel' && t.lastKneelT > this.time - 2.5) hk = 'recoil';
    const HD = { flinch: 0.25, recoil: 0.5, side: 0.55, stumble: 0.55, kneel: 1.3 };
    t.hit = { kind: hk, t: 0, dur: HD[hk], from, side, part: z.part, res: z.res, heavy, wkind: kind };
    t.lastHit = t.hit;
    if (!t.isPlayer && t.type !== 'dummy') {
      const stg = hk === 'kneel' ? 1.2 : hk === 'flinch' ? 0.1 : 0.32;
      if (hk === 'kneel') t.lastKneelT = this.time;
      // 振りかぶっていた技は崩れて出せない（弓も引き直し）
      if (stg > 0.3 && t.atk && !t.atk.ranged) { t.atk = null; t.cd = Math.max(t.cd, 0.6); }
      if (!(t.stagger > stg)) t.stagger = stg;
      // 打たれた勢いでわずかに押される（吹き飛ばしはしない）
      if (src && src.pos) {
        const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
        const push = hk === 'flinch' ? 0.05 : hk === 'kneel' ? 0.1 : kind === 'charge' ? 0.35 : 0.18;
        t.pos.x += dx / d * push; t.pos.z += dz / d * push;
      }
    }
    // 自分の攻撃が当たった手応え（怯みは連続しない）
    if (src && src.isPlayer && !t.isPlayer) {
      if (!(t.lastStagT > this.time - 1.4)) { t.stagger = Math.max(t.stagger || 0, 0.28); t.lastStagT = this.time; }
      if (this.hooks.onPlayerLanded) this.hooks.onPlayerLanded(t, amount);
    }
    if (z.res === 'armor') this.armorSpark(t, src, z.part, kind);
    else if (t.type === 'dummy' || t.maxHp > 9000) { this.burst(t.pos.x, this.partY(t, z.part), t.pos.z, 4, t.type === 'dummy' ? 'wood' : 'cloth', 0, 0, t.pos.y); this.play('hit', t.pos, 0.7); }   // 藁人形・稽古の相手は血を出さない
    else { this.bleed(t, src, kind, amount / t.maxHp, z.part); this.play('hit', t.pos, kind === 'arrow' ? 0.6 : 1); }
    // 側面・背面の判定（自分の組による攻撃のみ）
    if (src && !src.isStruct && t.group && t.team !== 0 && (src.isPlayer || src.isSub)) {
      const g = t.group;
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const f = g.forward();
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot < 0.2 && !g.routed) {
        g.flankHits++;
        g.morale -= 1.2;
        if (this.hooks.onFlank) this.hooks.onFlank(g, src);
        if (this.hooks.onFlankHit) this.hooks.onFlankHit(g);
      }
    }
    if (woundNow) { this.generalWounded(t, src); return; }
    if (t.hp <= 0) {
      // プレイヤーの重傷処理は Battle 側で行う
      if (t.isPlayer) { t.hp = 0; return; }
      this.kill(t, src);
    }
  }

  // 遊び手の一撃が、討たれない武将（invuln）に通るか。手傷を負って退いた後は通らない
  mayWound(t, src) {
    return !!(src && src.isPlayer && !t.isPlayer && t.team !== src.team && !t.woundOut && t.type !== 'dummy' && t.type !== 'porter');
  }

  // 手傷を負わせた：武将はよろめき、近くの旗本が割って入り、武将は自陣の奥へ退く（馬なら駆け去る）。
  // 以後この戦では狙えない（noTarget）。知らせと戦功は woundQ を見た player.js が出す
  generalWounded(t, src) {
    if (t.woundOut) return;
    const g = t.group;
    const sp = src && src.pos ? src.pos : t.pos;
    // 打った者から見た向き（p）と、退く向き（a：打った者から離れ、隊の後ろへ）
    let px = sp.x - t.pos.x, pz = sp.z - t.pos.z, pd = Math.hypot(px, pz);
    if (pd < 0.01) { px = Math.sin(t.heading); pz = Math.cos(t.heading); pd = 1; }
    px /= pd; pz /= pd;
    let ax = -px, az = -pz;
    if (g) { const f = g.forward(); ax = ax * 0.6 - f.x; az = az * 0.6 - f.z; }
    const ad = Math.hypot(ax, az) || 1; ax /= ad; az /= ad;
    const far = t.mounted ? 30 : 16, lim = 168;
    const to = { x: Math.max(-lim, Math.min(lim, t.pos.x + ax * far)), z: Math.max(-lim, Math.min(lim, t.pos.z + az * far)) };
    t.woundOut = { t: this.time + (t.mounted ? 12 : 18), to };
    t.noTarget = true;
    t.target = null; t.atk = null; t.swing = null; t.charging = false; t.aiT = 0;
    // よろめく（徒歩なら膝をつき、馬上なら仰け反って馬が竿立ち）
    t.hit = { kind: t.mounted ? 'recoil' : 'kneel', t: 0, dur: t.mounted ? 0.6 : 1.2, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' };
    t.lastHit = t.hit; t.lastKneelT = this.time;
    t.stagger = Math.max(t.stagger || 0, t.mounted ? 0.5 : 1.0);
    if (t.mounted && t.horse && t.horse.userData.horse) t.horse.userData.horse.rear = 0.6;
    // 近くの旗本（槍・刀の者を三人まで）が、武将と打った者の間に割って入る
    const near = [];
    this.forNear(t.pos.x, t.pos.z, 9, (o) => {
      if (o === t || !o.alive || o.team !== t.team || o.isPlayer || o.fleeing || o.invuln || o.type === 'dummy' || o.type === 'porter' || o.type === 'gun' || o.type === 'bow') return;
      near.push([Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z), o]);
    });
    near.sort((a, b) => a[0] - b[0]);
    near.slice(0, 3).forEach(([, o], i) => {
      const k = (i - 1) * 1.1;
      o.cover = { t: this.time + 5, x: t.pos.x + px * 1.4 - pz * k, z: t.pos.z + pz * 1.4 + px * k };
      o.confused = 0; o.aiT = 0;
    });
    if (g) g.morale -= 10;   // 大将の手傷に隊が揺らぐ
    this.play('eshout', t.pos, 1.3);
    this.play('yoroi', t.pos, 1);
    (this.woundQ || (this.woundQ = [])).push({ u: t, src });
  }

  // どこに当たり、甲冑がそれを止めたか：{ part: head|neck|shoulder|torso|arm|thigh|leg, res: armor 弾かれた|gap 隙間に通った|flesh 素肌・布 }
  hitZone(t, kind, src, opts) {
    const r = Math.random();
    let part;
    if (opts.y != null) {
      const h = opts.y - t.pos.y - (t.mounted ? RIDE.y : 0);
      part = h > 1.52 ? 'head' : h > 1.36 ? (r < 0.4 ? 'neck' : 'shoulder') : h > 0.95 ? (r < 0.8 ? 'torso' : 'arm') : h > 0.5 ? 'thigh' : 'leg';
    } else if (kind === 'slam' || kind === 'kesa') part = r < 0.4 ? 'head' : r < 0.8 ? 'shoulder' : 'arm';
    else if (kind === 'gyaku') part = r < 0.4 ? 'arm' : r < 0.75 ? 'torso' : 'thigh';
    else if (kind === 'sweep' || kind === 'yoko') part = r < 0.35 ? 'arm' : r < 0.7 ? 'torso' : r < 0.82 ? 'neck' : 'thigh';
    else if (t.mounted && src && !src.mounted) part = r < 0.45 ? 'thigh' : r < 0.85 ? 'torso' : 'arm';   // 下から馬上の者を突く
    else part = r < 0.08 ? 'head' : r < 0.15 ? 'neck' : r < 0.6 ? 'torso' : r < 0.7 ? 'arm' : r < 0.88 ? 'thigh' : 'leg';
    if (t.type === 'dummy' || t.type === 'porter') return { part, res: 'flesh' };
    const L = t.look || {}, T = L.tier || 0;
    const kab = !!(L.hat && L.hat.startsWith('kabuto')), jin = !!(L.hat && L.hat.startsWith('jingasa'));
    // 覆われている割合：足軽は胴と陣笠、侍は籠手・佩楯・臑当まで
    const cover = { head: kab ? 0.85 : jin ? 0.6 : 0, neck: T >= 1 ? 0.45 : 0.1, shoulder: L.sode ? 0.85 : 0.35, torso: 0.92, arm: T >= 1 ? 0.7 : 0.25, thigh: T >= 1 ? 0.65 : 0.2, leg: T >= 1 ? 0.75 : 0.35 }[part];
    // 甲冑に止められやすさ（技ごと）。弾は近ければ胴も抜く
    let stop = { thrust: 0.42, charge: 0.25, tsuki: 0.4, kesa: 0.55, gyaku: 0.55, yoko: 0.55, slam: 0.3, sweep: 0.5, arrow: 0.55, gun: 0.06, butt: 0.6 }[kind] ?? 0.45;
    if (kind === 'gun' && opts.d) stop += Math.min(0.35, opts.d / 150);
    if (T >= 2) stop *= 1.15;
    if (src && src.isPlayer) stop *= opts.pierce ? 0 : 0.55;   // 自分の槍は隙間を狙って突く
    if (Math.random() < cover * stop) return { part, res: 'armor' };
    return { part, res: cover > 0.5 ? 'gap' : 'flesh' };
  }

  // 当たった所の高さ（体の座標）
  partY(t, part) { return t.pos.y + (t.mounted ? RIDE.y : 0) + ({ head: 1.58, neck: 1.46, shoulder: 1.42, arm: 1.15, torso: 1.15, thigh: 0.78, leg: 0.42 }[part] || 1.15); }

  // 甲冑に弾かれた：小さな火花と、小札に当たる乾いた音
  armorSpark(t, src, part, kind) {
    let nx = 0, nz = 0;
    if (src && src.pos) { nx = src.pos.x - t.pos.x; nz = src.pos.z - t.pos.z; const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; }
    if (kind !== 'slam' && kind !== 'butt') this.spark(t.pos.x + nx * 0.25, this.partY(t, part), t.pos.z + nz * 0.25, kind === 'gun' ? 5 : 3);
    this.play('yoroi', t.pos, kind === 'arrow' ? 0.6 : 1);
  }

  // 刃と刃・柄が打ち合う：二人の間の、受けた側の少し前で火花と金の音
  clashAt(a, b) {
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(0.9, d * 0.35);
    this.spark(b.pos.x + dx / d * k, b.pos.y + (b.mounted ? RIDE.y : 0) + 1.3, b.pos.z + dz / d * k, 9);
    this.play('kin', b.pos, 1);
  }

  // 血：小さな飛沫と、地面の小さな染み（控えめ。設定で「控えめ」「なし」にできる）
  bleed(t, src, kind, sev, part = 'torso') {
    const lv = bloodLv();
    let nx = 0, nz = 0;
    if (src && src.pos) { nx = t.pos.x - src.pos.x; nz = t.pos.z - src.pos.z; const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; }
    const y = this.partY(t, part);
    if (lv === 0) { this.burst(t.pos.x + nx * 0.15, y, t.pos.z + nz * 0.15, 3, 'cloth', nx, nz, t.pos.y); return; }
    const n = Math.round((lv === 2 ? 3 : 1) + Math.min(1, sev) * (lv === 2 ? 5 : 2));
    this.burst(t.pos.x + nx * 0.15, y, t.pos.z + nz * 0.15, n, 'blood', nx, nz, t.pos.y);
    if (Math.random() < (lv === 2 ? 0.65 : 0.3)) this.stain(t.pos.x + nx * (0.3 + Math.random() * 0.6), t.pos.z + nz * (0.3 + Math.random() * 0.6), (0.1 + Math.random() * 0.12) * (lv === 2 ? 1.3 : 1), 60);
  }

  // 地面の染み：新しいうちは暗い赤、乾くと茶に褪せ、やがて消える
  stain(x, z, r, life = 80, grow = 0) {
    const lv = bloodLv();
    if (lv === 0) return null;
    if (!this.stains) this.stains = [];
    const m = new THREE.Mesh(STAIN_GEOS[Math.floor(Math.random() * STAIN_GEOS.length)], new THREE.MeshBasicMaterial({ color: 0x3a120e, transparent: true, opacity: lv === 2 ? 0.55 : 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const s = lv === 2 ? 1 : 0.7;
    m.position.set(x, this.world.heightAt(x, z) + 0.03, z);
    m.rotation.y = Math.random() * 6.28;
    const sx = r * s * (0.8 + Math.random() * 0.4), sz = r * s * (0.8 + Math.random() * 0.4);
    m.scale.set(grow ? sx * 0.25 : sx, 1, grow ? sz * 0.25 : sz);
    this.scene.add(m);
    const o = { m, t: 0, life, sx, sz, grow, op: m.material.opacity };
    this.stains.push(o);
    while (this.stains.length > 150) { const q = this.stains.shift(); this.scene.remove(q.m); q.m.material.dispose(); }
    return o;
  }
  updateStains(dt) {
    if (!this.stains) return;
    this.stainT = (this.stainT || 0) + dt;
    if (this.stainT < 0.2) return;
    const st = this.stainT; this.stainT = 0;
    for (let i = this.stains.length - 1; i >= 0; i--) {
      const o = this.stains[i];
      o.t += st;
      const k = o.t / o.life;
      if (k >= 1) { this.scene.remove(o.m); o.m.material.dispose(); this.stains.splice(i, 1); continue; }
      // 倒れた者の下の血だまりは、しばらくかけて広がる
      if (o.grow) { const g = Math.min(1, 0.25 + o.t / 12); o.m.scale.set(o.sx * g, 1, o.sz * g); }
      // 乾く：暗い赤 → 土の茶。終わりの三割で薄れて消える
      const dry = Math.min(1, k * 2.5);
      o.m.material.color.setRGB(0.227 - 0.07 * dry, 0.07 + 0.03 * dry, 0.055 + 0.03 * dry);
      o.m.material.opacity = o.op * (1 - 0.35 * dry) * Math.min(1, (1 - k) / 0.3);
    }
  }

  kill(t, src) {
    t.alive = false;
    if (t.blob) t.blob.visible = false;
    t.hp = 0;
    t.deadT = 0;
    t.atk = null; t.swing = null; t.reload = null;
    t.fall = (Math.random() < 0.5 ? 1 : -1);
    t.fallAxis = Math.random() < 0.3 ? 'z' : 'x';
    // 倒れ方：打たれた向きと所で決める。多くは膝から力が抜けて崩れる
    const L = t.lastHit || {};
    const r = Math.random();
    let kind;
    if (t.mounted) kind = t.horse && r < 0.55 ? 'unhorse' : 'horse';
    else if (L.from === 'back') kind = r < 0.65 ? 'forward' : 'crumple';
    else if (L.from === 'left' || L.from === 'right') kind = r < 0.55 ? 'side' : 'crumple';
    else if (L.wkind === 'gun' || L.wkind === 'charge' || (L.heavy && (L.wkind === 'thrust' || L.wkind === 'tsuki'))) kind = r < 0.55 ? 'back' : 'crumple';
    else if (L.part === 'leg' || L.part === 'thigh') kind = 'crumple';
    else kind = r < 0.6 ? 'crumple' : r < 0.85 ? 'back' : 'side';
    // 横へは、打たれた側と反対へ倒れる
    t.death = { kind, side: L.side ? -L.side : t.fall, t: 0, fwd: Math.random() < 0.6 };
    if (kind === 'unhorse') this.unhorse(t);
    // 馬ごと倒れる者は、手の武器をすぐ落とす（徒歩の者は倒れながら落とす）
    if (kind === 'horse') this.dropWeapon(t);
    const g = t.group;
    if (g) {
      g.morale -= (100 / Math.max(6, g.initial)) * 1.15;
      if (t === g.leader) {
        g.morale -= 30;
        if (this.hooks.onLeaderKilled) this.hooks.onLeaderKilled(g, src);
        // 部隊長の死：一定確率で混乱
        for (const o of g.units) if (o.alive && Math.random() < 0.45) o.confused = 4 + Math.random() * 4;
      }
    }
    if (t.type === 'busho') {
      this.forNear(t.pos.x, t.pos.z, 30, (o) => { if (o.team === t.team && o.group) o.group.morale -= 6; });
    }
    if (t.tag === 'flag' && g) g.morale -= 15;
    if (Math.random() < 0.3) this.play('cry', t.pos, 0.7);
    this.dead.push(t);
    if (this.dead.length > 140) {
      const old = this.dead.shift();
      this.scene.remove(old.mesh);
      if (old.dropped) this.scene.remove(old.dropped);
      if (old.hatOff) this.scene.remove(old.hatOff);
    }
    if (this.hooks.onKill) this.hooks.onKill(t, src);
  }

  // 陣笠を頭から落とす：頭の形を顔だけにし、笠だけの形を頭の先の地面に置く（骨の体は humans.js が u.hatOff を見て頭の笠を隠す）
  dropHat(u) {
    const L = u.look;
    if (!L || !(L.hat === 'jingasa' || L.hat === 'jingasa_n') || !u.head || u.isPlayer) return;
    const key = lookKey(L);
    const g = bodyGeometry(key, L, true, 'head');
    if (!g) return;
    u.head.geometry = headOf(L, true);
    lodSwap(u.head, u.head.geometry, headOf(L, false));
    // 頭のてっぺんの先 0.3m ほど、少し横へ。笠は上を向いて地面に伏せる（少し傾く）
    u.mesh.updateMatrixWorld(true);
    const hp = new THREE.Vector3(0, 1.62, 0).applyMatrix4(u.head.matrixWorld);
    const tp = new THREE.Vector3(0, 1.9, 0).applyMatrix4(u.head.matrixWorld);
    const dx = tp.x - hp.x, dz = tp.z - hp.z, dl = Math.hypot(dx, dz) || 1;
    const sd = (u.id * 0.37) % 1 - 0.5;
    const x = hp.x + dx / dl * 0.3 - dz / dl * sd * 0.5, z = hp.z + dz / dl * 0.3 + dx / dl * sd * 0.5;
    const y = this.world.heightAt(x, z);
    const m = new THREE.Mesh(g, MAT);
    m.castShadow = true;
    // 形は立ち姿の体の座標（縁の高さ 約 1.64）。縁が地面に着くよう下げる
    m.position.set(x, y - 1.63, z);
    m.rotation.set(0, u.id * 2.4, 0);
    const tilt = 0.12 + ((u.id * 0.61) % 1) * 0.15;
    m.rotateOnWorldAxis(new THREE.Vector3(Math.cos(u.id), 0, Math.sin(u.id)), tilt);
    // 傾けた分、縁の低い側が沈まないよう少し持ち上げる
    m.position.y += Math.sin(tilt) * 0.4;
    // 回した中心が笠の真ん中になるよう、回す前の中心（0, 1.66, 0）の分を戻す
    const c0 = new THREE.Vector3(0, 1.66, 0).applyQuaternion(m.quaternion);
    m.position.x += -c0.x; m.position.z += -c0.z; m.position.y += 1.66 - c0.y;
    this.scene.add(m);
    u.hatOff = m;
  }

  // 手の武器を地面に落とす（地面の傾きに沿わせる）
  dropWeapon(t) {
    const w = t.wpn;
    if (!w || !w.parent || t.isPlayer || t.dropped) return;
    w.parent.remove(w);
    flexSpear(w, 0, false, 0);
    const B = w.userData.bow;
    if (B) { setBowDraw(w, 0, null); B.ar.visible = false; }
    if (w.userData.ember) w.userData.ember.visible = false;
    const a = t.heading + (Math.random() - 0.5) * 1.5 + (B ? Math.PI / 2 : 0);
    const x = t.pos.x + Math.sin(a + 1.2) * 0.45, z = t.pos.z + Math.cos(a + 1.2) * 0.45;
    const L = (w.userData.tip || 1) - (w.userData.butt || -0.3);
    const y0 = this.world.heightAt(x - Math.sin(a) * L * 0.4, z - Math.cos(a) * L * 0.4), y1 = this.world.heightAt(x + Math.sin(a) * L * 0.6, z + Math.cos(a) * L * 0.6);
    w.position.set(x, (y0 + y1) / 2 + 0.03, z);
    w.rotation.set(-Math.atan2(y1 - y0, L), a, B ? Math.PI / 2 : 0, 'YXZ');
    this.scene.add(w);
    t.dropped = w;
  }

  // 落馬：討たれた乗り手が鞍から横へずり落ち、主を失った馬は駆け去る
  unhorse(t) {
    const h = t.horse;
    const spd = Math.hypot(t.vel.x, t.vel.z);
    this.dropWeapon(t);
    this.setMounted(t, false);
    if (h) {
      if (h.parent) h.parent.remove(h);
      h.position.copy(t.mesh.position); h.rotation.set(0, t.heading, 0);
      this.scene.add(h);
      const L = this.looseHorses || (this.looseHorses = []);
      // 元の乗り手の家・名と、馬の速さ・体力（プレイヤーが捕らえて乗るときに使う）
      const gname = t.name ? t.name.replace(/^.* /, '') : '';
      const from = {
        team: t.team, house: HOUSE_NAME[t.group && t.group.faction] || '', name: GENERALS[gname] ? gname : '',
        speed: Math.max(0.9, Math.min(1.12, (t.run || 8.5) / 8.5)), hp: Math.min(260, Math.round((t.maxHp || 110) * 1.4)),
      };
      L.push({ h, heading: t.heading + (Math.random() - 0.5) * 0.9, spd: Math.max(spd, 4), t: 0, from });
      // 多すぎる時は古い空馬から消す（プレイヤーが置いた馬は残す）
      if (L.length > 12) { const k = L.findIndex((o) => !o.kept); if (k >= 0) this.scene.remove(L.splice(k, 1)[0].h); }
      if (h.userData.horse) h.userData.horse.spook = 1;
      this.play('neigh', t.pos, 0.7);
    }
    t.death.vx = spd * 0.5;
  }
  updateLooseHorses(dt) {
    const L = this.looseHorses;
    if (!L) return;
    const P = this.playerUnit;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i];
      o.t += dt;
      const p = o.h.position, H = o.h.userData.horse;
      let want;
      o.shyT = (o.shyT || 0) - dt; o.neighT = (o.neighT || 0) - dt;
      if (o.held > 0) {
        // 手綱を取られている間：人の方へ向き直り、首を振って足踏みし、だんだん落ち着く
        o.held -= dt;
        if (P) o.heading += angleDiff(o.heading, Math.atan2(P.pos.x - p.x, P.pos.z - p.z)) * Math.min(1, dt * 2.2);
        want = 0;
        if (H && (H.snortT || 0) > 0.6) H.snortT = 0;
      } else if (o.kept) {
        // プレイヤーが降りて置いた馬：その場で待つ
        want = 0;
      } else {
        // 近づく人に驚いて少し逃げ、嘶く。止まって落ち着いた馬や、後ろから静かに寄れば逃げない
        if (P && P.alive && !P.mounted && o.shyT <= -1.5) {
          const dx = P.pos.x - p.x, dz = P.pos.z - p.z, d = Math.hypot(dx, dz);
          if (d < 6.5 && d > 0.1) {
            const behind = (Math.sin(o.heading) * dx + Math.cos(o.heading) * dz) / d < -0.45;
            const quiet = Math.hypot(P.vel.x, P.vel.z) < 4.2;
            if (!(quiet && (o.calm || behind))) {
              o.shyT = 1.1 + Math.random() * 0.6;
              o.shyDir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.8;
              o.t = Math.min(o.t, 12);
              if (H) H.spook = 1;
              if (o.neighT <= 0) { this.play('neigh', p, 0.6); o.neighT = 3; }
            }
          }
        }
        // 驚いて駆け、やがて速足、並足になり、止まって草を食む
        want = o.shyT > 0 ? 4.2 : o.t < 4 ? 7.5 : o.t < 9 ? 3.5 : o.t < 20 ? 1.2 : 0;
      }
      o.spd += (want - o.spd) * Math.min(1, dt * (o.held > 0 || o.shyT > 0 ? 3 : 1.2));
      o.calm = o.kept || (o.t > 18 && o.spd < 0.6);
      if (o.shyT > 0 && !(o.held > 0)) o.heading += angleDiff(o.heading, o.shyDir) * Math.min(1, dt * 4);
      else if (Math.abs(p.x) > 150 || Math.abs(p.z) > 150) o.heading += angleDiff(o.heading, Math.atan2(-p.x, -p.z)) * Math.min(1, dt);
      else if (!o.kept && !(o.held > 0)) o.heading += Math.sin(o.t * 0.4 + i) * 0.15 * dt;
      p.x += Math.sin(o.heading) * o.spd * dt; p.z += Math.cos(o.heading) * o.spd * dt;
      p.y = this.world.heightAt(p.x, p.z);
      o.h.rotation.y = o.heading;
      animateHorse(o.h, dt, o.spd);
      // 長く放っておいた空馬は消す（置いた馬と、プレイヤーの近くの馬は残す）
      if (o.t > 120 && !o.kept && !(P && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 40)) { this.scene.remove(o.h); L.splice(i, 1); }
    }
  }

  // ---------------- 鉄砲 ----------------
  // 引き金を落とす直前：火皿の口薬が燃え、小さな煙が上がる
  panFlash(u, near) {
    if (!near) return;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rx = Math.cos(u.heading), rz = -Math.sin(u.heading);
    const x = u.pos.x + fx * 0.35 + rx * 0.14, y = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.5, z = u.pos.z + fz * 0.35 + rz * 0.14;
    this.spark(x, y, z, 3);
    this.smoke(x, y, z, 0, 0, 0.35);
    this.play('hizara', u.pos, 0.8);
  }
  // 放つ。当たるかは弾の散り（遠いほど広がる）と的の大きさ、柵・塀の陰で決まる。雨では火縄が湿って撃てないことが多い
  fireGun(u, t) {
    if ((this.rain || 0) > 0.3 && Math.random() < 0.7) { this.play('click', u.pos, 1); if (this.hooks.onGunMisfire) this.hooks.onGunMisfire(u); return false; }
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rx = Math.cos(u.heading), rz = -Math.sin(u.heading);
    const my = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.46;
    const mx = u.pos.x + fx * 1.3 + rx * 0.1, mz = u.pos.z + fz * 1.3 + rz * 0.1;
    const near = !u.offscreen && u.camD < 90;
    if (near) { this.flash(mx, my, mz, 1); this.spark(mx + fx * 0.15, my, mz + fz * 0.15, 6, fx, fz); }
    this.smoke(mx, my, mz, fx, fz, 1);
    this.play('gun', u.pos, 1.6);
    u.fireT = 0.45;
    if (!t.alive) return true;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    // 弾の散り（標準偏差 m）と、的の半分の幅・高さ（立った人・馬上の人）
    const sig = 0.22 + d * 0.017;
    const hw = t.mounted ? 0.55 : 0.24, hh = t.mounted ? 1.05 : 0.8;
    let hit = erf(hw / (sig * 1.414)) * erf(hh / (sig * 1.414)) * this.coverBetween(u.pos, t.pos, u.team);
    if (t.isPlayer) hit = Math.min(hit, 0.45);  // 自分への一発は外れもある（避けようのない即死にしない）
    if (t.isPlayer && t.u_dodging) hit = 0;
    const dmg = u.dmg * (t.isPlayer ? 0.75 : 1) * (0.85 + Math.random() * 0.3);
    if (Math.random() < hit) this.damage(t, dmg, u, { kind: 'gun', d });
    else {
      // 外れ弾：密な隊なら隣や後ろの者に当たることがある。当たらなければ土が跳ねる
      let other = null;
      if (!t.isPlayer) this.forNear(t.pos.x, t.pos.z, 1.8, (o) => { if (!other && o !== t && o.alive && o.team !== u.team && !o.invuln && !o.isPlayer && Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 1.6 && Math.random() < 0.08) other = o; });
      if (other) this.damage(other, dmg, u, { kind: 'gun', d });
      else if (t.camD < 60) {
        const ox = t.pos.x + (Math.random() - 0.5) * sig * 3 + fx * Math.random() * 2, oz = t.pos.z + (Math.random() - 0.5) * sig * 3 + fz * Math.random() * 2;
        this.burst(ox, this.world.heightAt(ox, oz) + 0.05, oz, 4, 'dust', fx, fz);
      }
    }
    if (t.isPlayer && this.hooks.onGunAtPlayer) this.hooks.onGunAtPlayer(u);
    return true;
  }
  // 込め直し：筒を立てて火薬と弾を落とし、込め矢で突き固め、火皿に口薬を盛って火蓋を閉じ、火縄を挟み直す
  startReload(u, k = 1) {
    const dur = u.cdBase * (0.9 + Math.random() * 0.3) * k;
    u.cd = dur;
    u.reload = { t: 0, dur };
  }
  // a から b への射線を、b の方の柵・塀がさえぎるか（的がそのすぐ後ろにいれば陰になる）。1 ならさえぎる物なし
  coverBetween(a, b, team) {
    let k = 1;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team === team) continue;
      const q = segHit(a.x, a.z, b.x, b.z, s.seg);
      if (q < 0 || (1 - q) * L > 4) continue;
      k *= /柵/.test(s.name || '') ? 0.6 : 0.25;
    }
    return k;
  }

  // 閃光：筒先のごく短い橙の光
  flash(x, y, z, s = 1) {
    if (!this.flashTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,.85)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.flashTex = new THREE.CanvasTexture(c);
      this.flashes = [];
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: Math.random() * 6.28 }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(0.55 * s);
    this.scene.add(sp);
    this.flashes.push({ sp, t: 0, life: 0.07 });
  }

  // 硝煙：筒先から前へどっと吹き出し、すぐ勢いを失って、風に流されながら大きく広がって薄れる（数挺撃てばしばらく視界が曇る）
  smoke(x, y, z, fx = 0, fz = 0, amt = 1) {
    if (!this.smokeTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      // もこもこした煙：小さな丸をいくつも重ねる
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 30, px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r, rr = 18 + Math.random() * 22;
        const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(236,234,228,.35)'); gr.addColorStop(1, 'rgba(236,234,228,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      this.smokeTex = new THREE.CanvasTexture(c);
      this.smokes = [];
    }
    const tint = this.world && this.world.timeKey === 'dusk' ? 0xd8c2b0 : this.world && this.world.timeKey === 'storm' ? 0x9a9e9e : 0xe2e2dc;
    const n = amt < 0.5 ? 2 : 7;
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.85, color: tint, rotation: Math.random() * 6.28 }));
      sp.position.set(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.3) * 0.2, z + (Math.random() - 0.5) * 0.2);
      sp.scale.setScalar(0.3 * amt);
      this.scene.add(sp);
      // 前の粒ほど速く遠くへ（筒先からの噴き出し）。火皿の煙は上へ
      const burst = amt < 0.5 ? 0.3 : 2 + (k / n) * 9 * (0.7 + Math.random() * 0.5);
      this.smokes.push({ sp, t: 0, life: (amt < 0.5 ? 2.5 : 9 + Math.random() * 5), vx: fx * burst + (Math.random() - 0.5) * 0.6, vz: fz * burst + (Math.random() - 0.5) * 0.6, vy: (amt < 0.5 ? 0.5 : 0.1 + Math.random() * 0.25), spin: (Math.random() - 0.5) * 0.3, s0: 0.3 * amt, s1: amt < 0.5 ? 0.9 : 4.6 + Math.random() * 1.6 });
    }
    // 古い煙から消して、数を抑える
    while (this.smokes.length > 170) { const o = this.smokes.shift(); this.scene.remove(o.sp); o.sp.material.dispose(); }
  }

  updateSmoke(dt) {
    if (this.flashes) for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.life) { this.scene.remove(f.sp); f.sp.material.dispose(); this.flashes.splice(i, 1); continue; }
      f.sp.material.opacity = 1 - f.t / f.life;
    }
    if (!this.smokes) return;
    // 風：煙はそよ風（1m/秒ほど）で横へ流れる
    const wx = Math.sin(this.wind || 0.6) * 0.9, wz = Math.cos(this.wind || 0.6) * 0.9;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { this.scene.remove(s.sp); s.sp.material.dispose(); this.smokes.splice(i, 1); continue; }
      // 吹き出した直後にすぐ膨らみ、そのあとゆっくり広がる
      s.sp.scale.setScalar(s.s0 + Math.min(1, s.t * 1.5) * s.s1 * 0.12 + Math.sqrt(k) * s.s1 * 0.88);
      const drag = Math.exp(-dt * 3.2);
      s.vx *= drag; s.vz *= drag;
      const wk = Math.min(1, s.t * 0.8);
      s.sp.position.x += (s.vx + wx * wk) * dt; s.sp.position.z += (s.vz + wz * wk) * dt;
      s.sp.position.y += s.vy * dt;
      s.sp.material.rotation += s.spin * dt;
      s.sp.material.opacity = 0.7 * Math.min(1, s.t * 10) * (1 - k) * (1 - k * 0.3);
    }
  }

  // ---------------- 弓矢 ----------------
  // 射る：遠い的・柵の陰の的へは高く射上げる（曲射）。風を少し見越すが、読み切れずに流される
  shoot(u, t) {
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rxv = Math.cos(u.heading), rzv = -Math.sin(u.heading);
    const sx = u.pos.x + fx * 0.6 - rxv * 0.12, sy = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.5, sz = u.pos.z + fz * 0.6 - rzv * 0.12;
    const d = Math.hypot(t.pos.x - sx, t.pos.z - sz);
    const lob = d > 24 || this.coverBetween(u.pos, t.pos, u.team) < 1 || !!this.shotBlocked(u, t.pos);
    // 曲射は高く射上げ、柵や前の味方を越えて上から落とす
    const T = lob ? Math.max(1.3, d / 15) : Math.max(0.45, d / 30);
    // 曲射は的を外しやすい
    const spread = (0.8 + d * 0.035) * (1 + (this.rain || 0) * 0.8) * (lob ? 1.4 : 1);
    const W = this.windAcc();
    let tx = t.pos.x + (t.vel?.x || 0) * T * 0.6 + (Math.random() - 0.5) * spread;
    let tz = t.pos.z + (t.vel?.z || 0) * T * 0.6 + (Math.random() - 0.5) * spread;
    // 風の見越し（七割ほど）
    tx -= W.x * T * T * 0.5 * 0.7; tz -= W.z * T * T * 0.5 * 0.7;
    const ty = t.pos.y + (t.mounted ? RIDE.y : 0) + 1.15;
    const g = 9.8;
    const vel = new THREE.Vector3((tx - sx) / T, (ty - sy + 0.5 * g * T * T) / T, (tz - sz) / T);
    const mesh = new THREE.Mesh(arrowGeometry(), MAT);
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(sx + vel.x, sy + vel.y, sz + vel.z);
    this.scene.add(mesh);
    this.arrows.push({ pos: mesh.position, prev: mesh.position.clone(), vel, team: u.team, owner: u, life: T + 2, mesh, dmg: u.dmg * (u.group?.dmgMult || 1), stuck: false });
    this.play('string', u.pos, 0.8);
    if (t.isPlayer && this.hooks.onArrowAtPlayer) this.hooks.onArrowAtPlayer(u);
    this.play('arrow', u.pos, 0.6);
  }
  // 風で矢が流される力（m/秒²）
  windAcc() { const a = this.wind || 0.6; return { x: Math.sin(a) * 0.6, z: Math.cos(a) * 0.6 }; }

  // 刺さった矢を残す（地面・柵・人。しばらくして消す）
  pinArrow(a, life, parent) {
    a.stuck = true; a.life = life;
    if (parent) {
      const m = a.mesh;
      parent.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      parent.getWorldQuaternion(q);
      m.quaternion.premultiply(q.invert());
      parent.worldToLocal(m.position);
      parent.add(m);
      a.parent = parent;
      // 一人に残す矢は四本まで
      const mine = this.arrows.filter((o) => o.parent === parent);
      if (mine.length > 4) { const o = mine[0]; o.life = 0; }
    }
  }

  updateArrows(dt) {
    const W = this.windAcc();
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0) { (a.parent || this.scene).remove(a.mesh); this.arrows.splice(i, 1); continue; }
      if (a.stuck) continue;
      a.vel.y -= 9.8 * dt;
      a.vel.x += W.x * dt; a.vel.z += W.z * dt;
      a.prev.copy(a.pos);
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      const p0 = a.prev, p1 = a.pos;
      // 敵方の柵・塀に刺さる（味方の柵は狭間や隙間から射るので抜ける）
      let wall = null, wq = 2;
      for (const s of this.structs) {
        if (!s.alive || s.team === a.team) continue;
        if (s.seg) {
          const q = segHit(p0.x, p0.z, p1.x, p1.z, s.seg);
          if (q < 0 || q > wq) continue;
          const cx = p0.x + (p1.x - p0.x) * q, cz = p0.z + (p1.z - p0.z) * q, cy = p0.y + (p1.y - p0.y) * q;
          const top = this.world.heightAt(cx, cz) + (s.h || (/塀|壁|門|石垣|櫓/.test(s.name || '') ? 3 : 2.1));
          // 柵は杭の間を抜けることがある（四本に一本）
          if (cy < top && !(a.skip && a.skip.has(s))) { if (/柵/.test(s.name || '') && Math.random() < 0.25) (a.skip || (a.skip = new Set())).add(s); else { wall = s; wq = q; } }
        } else if (s.solidR && Math.hypot(p1.x - s.x, p1.z - s.z) < s.solidR && p1.y < this.world.heightAt(s.x, s.z) + 3) { wall = s; wq = 1; }
      }
      // 人：矢の通り道（前のコマからの線）に一番近い所で、体の筒に入ったか
      let hit = null, hq = 2, hy = 0;
      if (!a.glanced) this.forNear(p1.x, p1.z, 2.2, (o) => {
        if (!o.alive || o.team === a.team || (o.invuln && !this.mayWound(o, a.owner))) return;
        const vx = p1.x - p0.x, vz = p1.z - p0.z, l2 = vx * vx + vz * vz || 1e-6;
        const q = Math.max(0, Math.min(1, ((o.pos.x - p0.x) * vx + (o.pos.z - p0.z) * vz) / l2));
        const cx = p0.x + vx * q, cz = p0.z + vz * q, cy = p0.y + (p1.y - p0.y) * q;
        const rr = o.mounted ? 0.6 : 0.3, top = o.pos.y + (o.mounted ? 2.4 : 1.72);
        if (Math.hypot(o.pos.x - cx, o.pos.z - cz) < rr && cy > o.pos.y + 0.05 && cy < top && q < hq) { hit = o; hq = q; hy = cy; }
      });
      // 散開していると矢が当たりにくい
      if (hit && hit.group && hit.group.formation === 'loose' && Math.random() < 0.4) hit = null;
      if (hit && hq <= wq) {
        a.pos.set(p0.x + (p1.x - p0.x) * hq, hy, p0.z + (p1.z - p0.z) * hq);
        const rec = { res: null };
        this.damage(hit, a.dmg, a.owner, { kind: 'arrow', y: hy, out: rec });
        if (rec.res === 'armor') {
          // 甲冑に弾かれて落ちる
          a.glanced = true;
          a.vel.set(-a.vel.x * 0.15 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, -a.vel.z * 0.15 + (Math.random() - 0.5) * 3);
          a.pos.addScaledVector(a.vel, 0.02);
        } else if (hit.isPlayer) { this.scene.remove(a.mesh); this.arrows.splice(i, 1); }
        else {
          // 刺さったまま残る（倒れれば体と一緒に）
          const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
          a.pos.addScaledVector(a.vel, 0.12 / L);
          this.pinArrow(a, 50, hit.mesh);
        }
        continue;
      }
      if (wall) {
        const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
        a.pos.set(p0.x + (p1.x - p0.x) * wq, p0.y + (p1.y - p0.y) * wq, p0.z + (p1.z - p0.z) * wq).addScaledVector(a.vel, 0.1 / L);
        this.pinArrow(a, 40, null);
        this.play('thunk', a.pos, 0.5);
        continue;
      }
      const gy = this.world.heightAt(a.pos.x, a.pos.z);
      if (a.pos.y < gy) {
        // 地面に斜めに刺さる（鏃が少し埋まる）
        const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
        const back = (gy - a.pos.y) / Math.max(0.2, -a.vel.y / L);
        a.pos.addScaledVector(a.vel, -back / L).addScaledVector(a.vel, (a.glanced ? 0.02 : 0.12) / L);
        this.pinArrow(a, a.glanced ? 15 : 30, null);
      }
    }
    // 残る矢は全部で百八十本まで
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) if (this.arrows[i].stuck && ++n > 180) { const a = this.arrows[i]; (a.parent || this.scene).remove(a.mesh); this.arrows.splice(i, 1); }
  }

  // ---------------- 粒子（血しぶき・土・布の埃）と火花 ----------------
  buildParticles() {
    const N = 400;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pGround = new Float32Array(N);
    this.pIdx = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -999;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: true, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    // 打ち合いの火花
    const S = 120;
    this.sN = S; this.sPos = new Float32Array(S * 3); this.sVel = new Float32Array(S * 3); this.sLife = new Float32Array(S); this.sIdx = 0;
    for (let i = 0; i < S; i++) this.sPos[i * 3 + 1] = -999;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffd98a, size: 0.05, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  // 火花：fx, fz を渡すとその向きへ飛ぶ（筒先の燃えかす）
  spark(x, y, z, n, fx = 0, fz = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.sIdx = (this.sIdx + 1) % this.sN;
      this.sPos[i * 3] = x; this.sPos[i * 3 + 1] = y; this.sPos[i * 3 + 2] = z;
      this.sVel[i * 3] = (Math.random() - 0.5) * 4 + fx * 6; this.sVel[i * 3 + 1] = Math.random() * 2.5; this.sVel[i * 3 + 2] = (Math.random() - 0.5) * 4 + fz * 6;
      this.sLife[i] = 0.15 + Math.random() * 0.2;
    }
  }

  // 粒：blood 血（暗い赤）・dust 土・cloth 布の埃。nx, nz の向きへ飛ぶ。gy は地面の高さ（そこで止める）
  burst(x, y, z, n, type = 'dust', nx = 0, nz = 0, gy = null) {
    const C = PCOL[type] || PCOL.dust;
    const blood = type === 'blood';
    if (gy == null) gy = this.world.heightAt(x, z);
    for (let k = 0; k < n; k++) {
      const i = this.pIdx = (this.pIdx + 1) % this.pN;
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      const sp = blood ? 0.8 + Math.random() * 1.6 : 0.6 + Math.random() * 1.2;
      this.pVel[i * 3] = nx * sp + (Math.random() - 0.5) * 1.2;
      this.pVel[i * 3 + 1] = (blood ? 0.3 : 0.8) + Math.random() * (blood ? 1.4 : 2);
      this.pVel[i * 3 + 2] = nz * sp + (Math.random() - 0.5) * 1.2;
      const j = 0.85 + Math.random() * 0.3;
      this.pCol[i * 3] = C[0] * j; this.pCol[i * 3 + 1] = C[1] * j; this.pCol[i * 3 + 2] = C[2] * j;
      this.pLife[i] = 0.5 + Math.random() * 0.4;
      this.pGround[i] = gy;
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.sN; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) { this.sPos[i * 3 + 1] = -999; continue; }
      this.sVel[i * 3 + 1] -= 9 * dt;
      for (let a = 0; a < 3; a++) this.sPos[i * 3 + a] += this.sVel[i * 3 + a] * dt;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      // 地面に落ちたら消える
      if (this.pLife[i] <= 0 || this.pPos[i * 3 + 1] < this.pGround[i]) { this.pLife[i] = 0; this.pPos[i * 3 + 1] = -999; continue; }
      this.pVel[i * 3 + 1] -= 9.8 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  // 馬に乗せる・降ろす（乗り手の手・旗・馬印を鞍の高さへ）
  setMounted(u, on, horse) {
    if (!!u.mounted === on) return;
    const dy = on ? RIDE.y : -RIDE.y;
    for (const part of [u.hand, u.flag, u.uma]) if (part) part.position.y += dy;
    // 乗り手（体・脚・手・旗・馬印）は「鞍」の入れ物に入れ、馬の背の上下・前後の揺れをそのまま受ける
    const riderParts = [u.body, u.legL, u.legR, u.hand, u.flag, u.uma];
    if (on) {
      u.horse = horse || u.horse;
      if (u.horse.parent !== u.mesh) u.mesh.add(u.horse);
      u.horse.position.set(0, 0, 0); u.horse.rotation.set(0, 0, 0);
      if (!u.seat) { u.seat = new THREE.Group(); u.seat.matrixAutoUpdate = false; }
      u.seat.matrix.identity(); u.mesh.add(u.seat);
      for (const part of riderParts) if (part) u.seat.add(part);
      u.rideFix = true;
      seatLegs(u);
    } else {
      if (u.horse && u.horse.parent === u.mesh) u.mesh.remove(u.horse);
      for (const part of riderParts) if (part) u.mesh.add(part);
      if (u.human && u.human.root.parent === u.seat) u.mesh.add(u.human.root);
      if (u.seat) u.mesh.remove(u.seat);
      u.rideFix = false;
      u.legL.position.set(0.11, 0.74, 0); u.legR.position.set(-0.11, 0.74, 0);
      u.legL.rotation.set(0, 0, 0); u.legR.rotation.set(0, 0, 0);
      if (u.shinL) { u.shinL.rotation.x = 0; u.shinR.rotation.x = 0; }
    }
    u.mounted = on;
  }

  // ---------------- 部隊の更新 ----------------
  updateGroups(dt) {
    for (const g of this.groups) {
      const n = g.count;
      if (n === 0) continue;
      // 崩れた部隊は、戦の筋書きが号令を出しても逃げ続ける（bot の報告から。自分の組は号令で立て直せる）
      if (g.routed && g.order !== 'flee' && !g.isPlayerSquad) g.order = 'flee';
      if (!g.routed && !g.noRout && g.morale < 22) {
        g.routed = true;
        g.order = 'flee';
        for (const u of g.units) if (u.alive) {
          u.fleeing = true; u.target = null; u.atk = null;
          // 逃げる兵は武器を捨てる（近くの兵だけ見た目を変える）
          if (u.wpn && u.wpn.parent && u.type !== 'cavalry' && this.playerUnit && Math.hypot(u.pos.x - this.playerUnit.pos.x, u.pos.z - this.playerUnit.pos.z) < 60 && Math.random() < 0.7) {
            const w = u.wpn; u.hand.remove(w);
            w.position.set(u.pos.x, u.pos.y + 0.06, u.pos.z); w.rotation.set(0, Math.random() * 6, 0);
            this.scene.add(w); u.dropped = w;
          }
        }
        if (g.onRout) g.onRout(g);
        if (this.hooks.onRout) this.hooks.onRout(g);
      }
      // 崩れかけた敵勢は一度だけ後ろへ下がって立て直そうとする
      // 崩れかけた隊から、弱気な叫びが上がる（近くの隊だけ）
      if (!g.routed && !g.wavered && g.morale < 30 && n >= 3 && this.hooks.onWaver) {
        g.wavered = true;
        const P = this.playerUnit;
        const c = g.center();
        if (P && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 40) this.hooks.onWaver(g);
      }
      if (g.morale > 55) g.wavered = false;
      if (g.team !== 0 && !g.routed && !g.noRout && !g.regrouped && g.morale < 35 && g.morale >= 22) {
        g.regrouped = true; g.regroupT = 4; g.morale += 12;
        if (this.hooks.onRegroup) this.hooks.onRegroup(g);
      }
      if (g.regroupT > 0) g.regroupT -= dt;
      // 敵の侍（部隊長）はときどき仲間を鼓舞する
      if (g.team !== 0 && !g.routed && g.leader && g.leader.alive && g.units.some((u) => u.alive && u.target)) {
        g.rallyT = (g.rallyT ?? 8 + Math.random() * 6) - dt;
        if (g.rallyT <= 0) { g.rallyT = 12 + Math.random() * 6; g.morale = Math.min(100, g.morale + 6); g.leader.cheer = 1; this.play('eshout', g.leader.pos, 0.7); }
      }
      // 部隊長が健在なら少しずつ立て直す。戦いが収まった組も落ち着きを取り戻す
      if (!g.routed) {
        if (g.leader && g.leader.alive) g.morale += 0.8 * dt;
        if (g.isPlayerSquad) {
          g.calmT = (g.units.some((u) => u.alive && (u.target || u.atk)) ? 0 : (g.calmT || 0) + dt);
          if (g.calmT > 4 && g.morale < 85) g.morale += 2 * dt;
        }
      }
      g.morale = Math.min(100, g.morale);
      if (g.order === 'move' && g.dest) {
        const dx = g.dest.x - g.anchor.x, dz = g.dest.z - g.anchor.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const s = Math.min(d, g.speed * dt);
          g.anchor.x += dx / d * s; g.anchor.z += dz / d * s;
          if (d > 2) g.facing = Math.atan2(dx, dz);
        } else if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      if (g.order === 'path' && g.path) {
        const p = g.path[g.pathIdx];
        if (p) {
          const dx = p[0] - g.anchor.x, dz = p[1] - g.anchor.z;
          const d = Math.hypot(dx, dz);
          // 隊列の最後尾が遅れすぎたら先頭を待たせる
          const c = g.center();
          const lag = Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z);
          const sp = lag > n * 0.9 + 6 ? g.speed * 0.3 : g.speed;
          if (d < 1) g.pathIdx++;
          else {
            g.anchor.x += dx / d * Math.min(d, sp * dt);
            g.anchor.z += dz / d * Math.min(d, sp * dt);
            const want = Math.atan2(dx, dz);
            g.facing += angleDiff(g.facing, want) * Math.min(1, dt * 2);
          }
        } else if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      this.shapeGroup(g, dt);
    }
  }

  // 隊の形を整える：向きはゆっくり変え、行軍は縦隊、鉄砲は段の入れ替わり
  shapeGroup(g, dt) {
    // 隊の要（anchor）の動く速さ（兵がそれに歩調を合わせる）
    if (g._ax === undefined) { g._ax = g.anchor.x; g._az = g.anchor.z; g.anchorSpeed = 0; }
    const av = Math.hypot(g.anchor.x - g._ax, g.anchor.z - g._az) / Math.max(dt, 1e-3);
    g.anchorSpeed += (Math.min(9, av) - g.anchorSpeed) * Math.min(1, dt * 4);
    g._ax = g.anchor.x; g._az = g.anchor.z;
    // 行軍：遠くへ進むときは縦隊、行き先が近づいたら横隊へ開く（騎馬の多い隊は横に並んだまま駆ける）
    let march = false;
    // 敵が近ければ行軍をやめて横隊に開く（半秒ごとに見る）
    g._foeT = (g._foeT || 0) - dt;
    if (g._foeT <= 0 && (g.order === 'move' || g.order === 'path')) { g._foeT = 0.5 + Math.random() * 0.2; g._foeNear = this.foeNear(g, 38); }
    if (g.march !== false && !g.isPlayerSquad && g.formation === 'line' && (g.cavShare || 0) < 0.25 && g.initial >= 6 && !g._foeNear) {
      if (g.order === 'path') march = true;
      else if (g.order === 'move' && g.dest) march = Math.hypot(g.dest.x - g.anchor.x, g.dest.z - g.anchor.z) > (g.marching ? 20 : 26);
    }
    if (g.march === true && (g.order === 'move' || g.order === 'path')) march = true;
    g.marching = march;
    // 向きを変える：一斉にくるりと回らず、横に広い隊ほどゆっくり回る（外側の兵が歩いて回り込める速さ）
    if (g._face === undefined) g._face = g.facing;
    const df = angleDiff(g._face, g.facing);
    if (Math.abs(df) > 1e-4) {
      const rate = Math.max(0.3, Math.min(1.6, 3 / Math.max(1, g.halfWidth())));
      g._face += Math.sign(df) * Math.min(Math.abs(df), rate * dt);
    }
    // 鉄砲の段：前の段の者が倒れていたら、次の者を前へ
    if (g.isGun && g.front) {
      const n = g.initial, { cols, R } = g.layout(n);
      if (R > 1) for (let c = 0; c < cols; c++) {
        const cnt = Math.floor((n - 1 - c) / cols) + 1;
        let fr = g.front[c] || 0;
        for (let k = 0; k < cnt; k++) { const u = g.units[c + fr * cols]; if (u && u.alive) break; fr = (fr + 1) % cnt; }
        g.front[c] = fr;
      }
    }
  }

  // 隊の要の近くに敵がいるか
  foeNear(g, r) {
    let hit = false;
    const a = g.anchor;
    this.forNear(a.x, a.z, r, (o) => { if (!hit && o.alive && o.team !== g.team && !o.fleeing && !o.noTarget && Math.abs(o.pos.x - a.x) < r && Math.abs(o.pos.z - a.z) < r) hit = true; });
    return hit;
  }
  // 鉄砲の段の入れ替わり：撃った者は後ろへ下がって込め直し、次の者が前に出る
  gunRotate(u) {
    const g = u.group;
    if (!g || !g.isGun || !g.front) return;
    const { cols, R } = g.layout(g.initial);
    if (R <= 1 || u.slot >= g.initial) return;
    const s = g.gunSlot(u.slot, g.initial, cols);
    if (s.row === 0) g.front[s.col] = (s.k + 1) % s.cnt;
  }
  // 鉄砲の段で、今この者が撃つ番か（前の段にいて、持ち場に着いている）
  gunMayFire(u) {
    const g = u.group;
    if (!g || !g.isGun || !g.front || u.slot >= g.initial) return true;
    if (!(g.order === 'hold' || g.order === 'yari' || g.order === 'follow' || g.order === 'move')) return true;
    const { cols, R } = g.layout(g.initial);
    if (R <= 1) return true;
    return g.gunSlot(u.slot, g.initial, cols).row === 0;
  }

  think(u) {
    const g = u.group;
    // 槍衾の何列目か（前の列は槍を下げて揃える）
    u.row = g.formation === 'yari' ? Math.floor(u.slot / Math.max(2, Math.ceil(g.initial / 2))) : 0;
    // 手傷を負った武将：退いている間も、退いた後も戦わない（隊の奥に控える）。筋書きが invuln を解いたら元に戻す
    if (u.woundOut) {
      if (!u.invuln) { u.woundOut = null; u.noTarget = false; }
      else if (!u.fleeing) {
        u.target = null; u.atk = null; u.watch = null;
        if (u.woundOut.t > this.time) u.moveTo = u.woundOut.to;
        else { const f = g.forward(), s = g.slotPos(u.slot, g.initial); u.moveTo = { x: s.x - f.x * 10, z: s.z - f.z * 10 }; }
        return;
      }
    }
    // 旗本：手傷の武将の前に割って入り、打った者を迎える
    if (u.cover) {
      if (u.cover.t > this.time && !u.fleeing) {
        const p = this.playerUnit;
        u.target = p && p.alive && p.team !== u.team && Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < 2.6 ? p : null;
        if (!u.target) u.moveTo = u.cover;
        return;
      }
      u.cover = null;
    }
    if (u.confused > 0) {
      // 行き先はたまにしか変えない（その場でくるくる向きを変えないように）
      if (!u.moveTo || Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1 || Math.random() < 0.05) u.moveTo = { x: u.pos.x + (Math.random() - 0.5) * 6, z: u.pos.z + (Math.random() - 0.5) * 6 };
      u.target = null;
      return;
    }
    if (g.regroupT > 0) {
      const f = g.forward();
      u.target = null;
      u.moveTo = { x: u.pos.x - f.x * 8, z: u.pos.z - f.z * 8 };
      return;
    }
    if (u.fleeing) {
      u.target = null;
      if (u.loopP) this.freeSama(u);
      const f = g.fleeDir;
      // 逃げる向きは兵ごとに少しずつ違うが、走っている間は変えない
      const j = ((u.id * 0.618) % 1 - 0.5) * 8;
      u.moveTo = { x: u.pos.x + f.x * 20 - f.z * j, z: u.pos.z + f.z * 20 + f.x * j };
      return;
    }
    // 守る隊（g.guard）の大将：敵に気づいたら旗本の後ろへ下がる（間近に来た敵だけを払う）
    if (g.guardOn && u === g.leader && u.type === 'busho' && g.count > 3 && (g.order === 'hold' || g.order === 'yari')) {
      const near = this.nearestEnemy(u, 2.6);
      if (near) { u.target = near; return; }
      u.target = null; u.watch = null;
      const f = g.forward(), s = g.slotPos(u.slot, g.initial);
      u.moveTo = { x: s.x - f.x * 7, z: s.z - f.z * 7 };
      return;
    }
    let engage;
    switch (g.order) {
      case 'attack': engage = g.seekRange; break;
      case 'retreat': engage = 1.8; break;
      case 'path': engage = g.aggro * 0.6; break;
      case 'move': engage = Math.min(g.aggro, 6); break;
      case 'follow': engage = g.aggro; break;
      case 'assault': engage = 4.5; break;
      default: engage = g.aggro;
    }
    if ((u.type === 'bow' || u.type === 'gun') && g.fire !== false && g.order !== 'retreat') engage = Math.max(engage, u.range * (u.type === 'bow' ? 1 - 0.35 * (this.rain || 0) : 1));
    if (u.type === 'bow' && !g.fire) engage = Math.min(engage, 3);
    // 「敵を狙え」の指定目標
    if (g.focus && g.focus.alive && g.order !== 'retreat') {
      const d = Math.hypot(g.focus.pos.x - u.pos.x, g.focus.pos.z - u.pos.z);
      if (d < 60) {
        // 近すぎる別の敵がいればそちらを優先（身を守る）
        const near = this.nearestEnemy(u, 2.2);
        u.target = near || g.focus;
        return;
      }
    } else if (g.focus && !g.focus.alive) {
      g.focus = null;
      if (g.isPlayerSquad && this.hooks.onFocusDone) this.hooks.onFocusDone(g);
    }
    // 自分の組は、組頭（プレイヤー）に斬りかかる敵を優先して迎え撃つ
    if (g.isPlayerSquad && (g.order === 'follow' || g.order === 'hold') && this.playerUnit && this.playerUnit.alive) {
      const pu = this.playerUnit;
      const dp = Math.hypot(pu.pos.x - u.pos.x, pu.pos.z - u.pos.z);
      if (dp < 14) {
        const foe = this.nearestEnemy(pu, 5, (o) => o.target === pu);
        if (foe) { u.target = foe; return; }
      }
    }

    let t = null;
    // 槍・刀の者は、塀・柵の向こうで届かない敵を狙わない（弓・鉄砲は越えて撃てる）
    const melee = u.type !== 'bow' && u.type !== 'gun';
    // 鉄砲は、塀の向こうで見えない者（狭間にも塀の上にもいない者）を狙わない
    const ok = (o) => (!melee || !this.wallBetween(u.pos, u.team, o.pos)) && (u.type !== 'gun' || !this.hiddenBehind(u, o));
    if (g.order === 'hold' || g.order === 'follow' || g.order === 'yari') {
      // 持ち場から離れすぎない
      const home = g.slotPos(u.slot, g.initial);
      t = this.nearestEnemy(u, engage, (o) => Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < engage + 2 && ok(o));
    } else if (engage > 0) {
      t = this.nearestEnemy(u, engage, ok);
      // 届く敵がいなければ、塀の向こうの敵へ寄せる（塀ぎわで押す）。門や塀を攻める隊はそちらを優先
      if (!t && melee && g.order !== 'assault') t = this.nearestEnemy(u, engage);
    }
    if (t) { u.target = t; u.watch = null; return; }
    u.target = null;
    // 持ち場を守る者は、少し先（30m 以内）の敵を見張る（そちらへ体を向ける）
    if (g.order === 'hold') {
      if (!(u.watchT > this.time) || (u.watch && !u.watch.alive)) { u.watch = this.nearestEnemy(u, 30); u.watchT = this.time + 1 + Math.random(); }
    } else u.watch = null;
    if (g.order === 'assault' && g.assault) {
      const st = g.assault(u);
      if (st && st.isStruct) { u.target = st; return; }
      if (st) { u.moveTo = st; return; }
    }
    // 狭間・柵ぎわで撃っていた者は、しばらくそこに留まる（敵が見えなくなるたびに持ち場へ戻らない）
    if (u.loopP && g.order === 'hold' && u.loopT > this.time - 8) { u.moveTo = u.loopP; return; }
    if (u.loopP) this.freeSama(u);
    u.moveTo = g.slotPos(u.slot, g.initial);
  }

  distTo(u, t) {
    if (t.isStruct) {
      if (t.seg) return distToSeg(u.pos.x, u.pos.z, t.seg) - 0.2;
      return Math.hypot(t.x - u.pos.x, t.z - u.pos.z) - (t.r || 1);
    }
    return Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  }

  targetPoint(t) {
    if (t.isStruct) {
      if (t.seg) { const s = t.seg; return { x: (s[0] + s[2]) / 2, z: (s[1] + s[3]) / 2 }; }
      return { x: t.x, z: t.z };
    }
    return { x: t.pos.x, z: t.pos.z };
  }

  // 間合いに入った相手を打つ（当たり外れと倍率）。sw は振りの記録（当たり・甲冑・受け・空振りを書く）
  strike(u, t, near, mult = 1, sw = null) {
    const g = u.group;
    let dmg = u.dmg * (g.dmgMult || 1) * (0.8 + Math.random() * 0.4) * mult;
    if (u.type === 'gun') dmg *= 0.2;  // 鉄砲足軽の白兵は弱い
    if (g.formation === 'yari' && (g.order === 'yari' || g.order === 'hold')) dmg *= 1.35;
    if (t.group && t.group.formation === 'yari' && !t.isStruct) dmg *= 0.75;
    if (t.group && t.group.defMult) dmg /= t.group.defMult;
    if (t.isPlayer) dmg *= 0.9;
    const kind = sw ? sw.kind : 'thrust';
    if (Math.random() < (t.isPlayer || t.isStruct ? 0.9 : 0.72)) this.damage(t, dmg, u, { kind, out: sw });
    else if (t.isStruct) { if (sw) sw.res = 'miss'; }
    else if (Math.random() < 0.6) {
      // 受けられた：刃と刃・柄と柄が打ち合う
      if (sw) sw.res = 'block';
      t.guardFlash = 0.3;
      if (near) this.clashAt(u, t);
    } else {
      // かわされた：穂先・刃は体の脇を抜ける
      if (sw) sw.res = 'miss';
      if (near) this.play('swing', u.pos, 0.5);
    }
  }
  faceTo(u, t) { const p = this.targetPoint(t); return Math.atan2(p.x - u.pos.x, p.z - u.pos.z); }
  // 振り出す：技ごとの長さ（秒）と、穂先・刃が届く時（割合）
  startSwing(u, kind, t) {
    const S_ = SWING[kind] || SWING.thrust;
    u.swing = { kind, t: 0, dur: S_[0], at: S_[1], target: t, done: false, res: null, d: t ? this.distTo(u, t) : 0, charging: u.charging, side: Math.random() < 0.5 ? 1 : -1 };
    u.strikeT = 0.2;
    if (kind === 'slam') { u.slamT = S_[0]; kickSpear(u.wpn, -2.5); }
    if (kind === 'sweep') u.sweepT = S_[0];
    if (u.camD < 30) this.play(kind === 'thrust' || kind === 'tsuki' ? 'thrust' : kind === 'slam' || kind === 'butt' ? 'swing' : 'slash', u.pos, 0.45);
  }
  // 届いた時：まだ間合いにいて、前にいれば打つ。離れていれば空を切る（遠すぎる所や横の者には当たらない）
  landSwing(u, s, near) {
    const t = s.target;
    if (!t || !t.alive) { s.res = 'miss'; return; }
    const d = this.distTo(u, t);
    s.d = d;
    const sword = (u.wpnKind || u.lookWeapon) === 'sword';
    const lim = u.reach + (t.isStruct ? 0.4 : sword ? 0.15 : 0.3);
    let front = 1;
    if (!t.isStruct) { const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z; front = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / (Math.hypot(dx, dz) || 1); }
    // 塀・柵の向こうの者には届かない
    if (d > lim || front < (s.kind === 'sweep' || s.kind === 'yoko' ? 0.2 : 0.55) || (!t.isStruct && this.wallBetween(u.pos, u.team, t.pos))) { s.res = 'miss'; if (near) this.play('swing', u.pos, 0.4); return; }
    const mult = s.charging ? 1.8 : 1;
    if (s.charging) { u.charging = false; u.chargeCd = this.time + 5; }
    this.strike(u, t, near, mult, s);
    // 穂先が止まった勢いで柄が撓む（甲冑・受けで止まれば強く）
    if (s.res && s.res !== 'miss') kickSpear(u.wpn, s.kind === 'slam' ? 5 : s.res === 'hit' ? 1.6 : 3);
  }

  // 向きを変える：なめらかに、ただし一度に回れる速さ（rad/s）には限りがある
  turn(u, h, dt, rate) {
    const d = angleDiff(u.heading, h);
    const cap = rate * dt;
    u.heading += Math.max(-cap, Math.min(cap, d * Math.min(1, dt * 6)));
  }

  // 鉄砲の段で持ち場を守っている隊か
  gunGated(g) {
    if (!g.isGun || !g.front || g.gunRanks() <= 1) return false;
    return g.order === 'hold' || g.order === 'yari' || g.order === 'follow' || g.order === 'move';
  }

  // 騎馬：助走をつけて突っ込み、当てたら駆け抜けて離れ、向きを変えてまた寄せる
  cavalry(u, t, d, tp, dt, near) {
    if (u.stagger > 0) return { want: null, speed: 0 };   // 止められて竿立ち
    if (u.cv === 'out') {
      u.cvT -= dt;
      // 十分に離れたら、向きを変えてまた寄せる
      if (u.cvT > 0 || (d < 9 && u.cvT > -2.5)) return { want: { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }, speed: u.run * 0.9 };
    }
    u.cv = 'in';
    if (d > 7) this.startCharge(u, near);
    if (u.stagger > 0) return { want: null, speed: 0 };
    if (d <= u.reach + (u.charging ? 0.9 : 0.4) && (u.charging || u.cd <= 0) && !t.isStruct && !this.wallBetween(u.pos, u.team, t.pos)) {
      const was = u.charging;
      // 駆けながらの突きは、構えた槍がそのまま当たる（振りかぶらない）
      u.swing = { kind: was ? 'charge' : 'thrust', t: 0, dur: 0.2, at: 0, done: true, target: t, res: null, d };
      this.strike(u, t, near, was ? 1.8 : 1, u.swing);
      u.strikeT = 0.2;
      u.cd = u.cdBase * (0.85 + Math.random() * 0.3);
      u.charging = false; u.chargeCd = this.time + (was ? 3 : 1.5);
      // 駆け抜ける：突いたらそのまま前へ抜け、止まって斬り合わない
      const h = u.heading + (was ? 0 : (u.id % 2 ? 0.8 : -0.8));
      u.cv = 'out'; u.cvT = was ? 1.8 : 2.2; u.cvDir = { x: Math.sin(h), z: Math.cos(h) };
      return { want: { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }, speed: u.run };
    }
    return { want: tp, speed: u.charging || d > 5 ? u.run : u.speed * 1.4 };
  }
  // 駆け出す（蹄の音）。駆けている間に槍衾や柵に当たると止められる
  startCharge(u, near) {
    if (u.charging || u.chargeCd > this.time || u.stagger > 0) return;
    u.charging = true; u.chargeT = this.time;
    if (near) this.play('hooves', u.pos, 1.2);
  }
  // 槍衾に正面（±60°）から当たると止められる。横や後ろから突っ込めば止められない
  checkYari(u) {
    let stopped = null;
    this.forNear(u.pos.x, u.pos.z, 3.2, (o) => {
      if (stopped || !o.alive || o.team === u.team || !o.group || o.group.formation !== 'yari' || !(o.group.order === 'yari' || o.group.order === 'hold')) return;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((dx * Math.sin(o.heading) + dz * Math.cos(o.heading)) / d < 0.5) return;
      stopped = o;
    });
    if (!stopped) return;
    // 槍衾の者が穂先を揃えて突き出し、柄が撓む
    stopped.swing = { kind: 'thrust', t: 0, dur: 0.2, at: 0, done: true, target: u, res: 'hit', d: Math.hypot(u.pos.x - stopped.pos.x, u.pos.z - stopped.pos.z) };
    stopped.strikeT = 0.2; kickSpear(stopped.wpn, 2.5);
    this.bleed(u, stopped, 'thrust', 1.4, 'flesh');
    this.cavalryStopped(u, stopped.pos.x, stopped.pos.z, 35);
    if (this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, stopped);
    if (u.hp <= 0) this.kill(u, stopped);
  }
  // 騎馬が止められた：馬が竿立ちになり、しばらく動けず、そのあと退いて寄せ直す
  cavalryStopped(u, bx, bz, hurt) {
    u.charging = false; u.chargeCd = this.time + 6; u.stagger = 1.6; u.lastHitT = 0;
    // 討たれない武将は下限（WOUND_FLOOR）より下がらない
    u.hp = u.invuln ? Math.max(Math.min(u.hp, u.maxHp * WOUND_FLOOR), u.hp - hurt) : u.hp - hurt;
    const dx = u.pos.x - bx, dz = u.pos.z - bz, d = Math.hypot(dx, dz) || 1;
    u.cv = 'out'; u.cvT = 2.2; u.cvDir = { x: dx / d, z: dz / d };
    u.mv.x *= 0.1; u.mv.z *= 0.1;
    if (u.horse && u.horse.userData.horse) u.horse.userData.horse.rear = 0.8;
    this.spark(u.pos.x, u.pos.y + 1.6, u.pos.z, 10);
    this.play('neigh', u.pos, 0.8);
  }

  act(u, dt, near) {
    const g = u.group;
    let want = null, face = null;
    let speed = u.speed;
    if (u.stagger > 0) u.stagger -= dt;
    if (u.relT > 0) u.relT -= dt;
    if (u.hit) { u.hit.t += dt; if (u.hit.t > u.hit.dur) u.hit = null; }
    // 振り出した武器：穂先・刃が届いた時に当たりを決める（振る前・届く前には当たらない）
    if (u.swing) {
      const s = u.swing;
      s.t += dt;
      if (!s.done && s.t >= s.dur * s.at) { s.done = true; this.landSwing(u, s, near); }
      if (s.t >= s.dur + 0.3) u.swing = null;
    }
    if (u.atk) {
      const a = u.atk;
      a.t -= dt;
      if (a.ranged) {
        // 鉄砲：火蓋を切り、台尻を頬に付けて狙い、引き金を落とす（火皿の口薬が先に光り、すぐ筒の薬に移る）
        if (a.t <= 0.1 && !a.pan) { a.pan = true; this.panFlash(u, near); }
        if (a.t <= 0 && a.target.alive && !a.target.isStruct && this.shotBlocked(u, this.targetPoint(a.target))) {
          // 狙う間に的が動き、自分の方の塀が前に来た：撃たずに筒を下ろす（弾は塀を抜けない）
          u.atk = null; u.cd = 0.4;
        } else if (a.t <= 0) {
          u.atk = null;
          const ok = this.fireGun(u, a.target);
          this.startReload(u, ok ? 1 : 0.3);
          this.gunRotate(u);
        } else face = this.faceTo(u, a.target);
      } else if (a.bow) {
        // 弓：番えて、打ち起こし、引き分け、会で狙いを定めて離れ
        const tg = a.target.alive ? a.target : u.target && u.target.alive && !u.target.isStruct ? u.target : null;
        // 引く間は体を横に開く（左の肩を的へ）ので、向きを少し右へ
        if (tg) face = this.faceTo(u, tg) + (a.dur - a.t > 0.8 ? 0.3 : 0);
        if (a.t <= 0) {
          u.atk = null; u.relT = 0.55;
          if (tg) this.shoot(u, tg);
          u.cd = u.cdBase * (0.8 + Math.random() * 0.5);
        }
      } else if (a.t <= 0) {
        u.atk = null;
        u.cd = u.cdBase * (0.85 + Math.random() * 0.45) * (g.morale < 40 ? 1.35 : 1);
        this.startSwing(u, a.kind || 'thrust', a.target);
      } else face = this.faceTo(u, a.target);
    } else if (u.target && u.target.alive) {
      const t = u.target;
      const d = this.distTo(u, t);
      const tp = this.targetPoint(t);
      const fa = Math.atan2(tp.x - u.pos.x, tp.z - u.pos.z);
      if (u.type === 'cavalry' && t.isStruct && u.cv === 'out' && !u.fleeing && !(u.stagger > 0) && (u.cvT -= dt) > 0) {
        // 柵に止められた騎馬は、いったん退いてから寄せ直す
        want = { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }; speed = u.run * 0.8;
        if (u.cvT <= dt) u.cv = 'in';
      } else if (u.type === 'cavalry' && !t.isStruct && !u.fleeing) {
        const r = this.cavalry(u, t, d, tp, dt, near);
        want = r.want; speed = r.speed;
        if (!want) face = null;
      } else if (u.type === 'gun' && !t.isStruct && d > 4 && d <= u.range) {
        // 鉄砲：足を止めて狙いを定め、撃つ（撃てば長い装填）。段を組んだ隊は、前の段の者だけが撃つ
        face = fa;
        let ready = true;
        if (this.gunGated(g) && !this.atLoop(u)) {
          const sp = g.slotPos(u.slot, g.initial);
          const ds = Math.hypot(sp.x - u.pos.x, sp.z - u.pos.z);
          if (ds > 0.45) { want = sp; speed = ds > 3 ? u.run : u.speed; }
          ready = ds < 1.1 && this.gunFront(u);
        }
        // 自分の方の塀・柵が撃つ線をさえぎる時は撃たない。狭間の後ろや柵のすぐ後ろへ寄って、そこから撃つ
        const wb = this.shotBlocked(u, tp);
        if (wb) {
          ready = false;
          const p = this.loopPost(u, tp, wb);
          const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
          if (dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; }
        } else if (this.atLoop(u)) u.loopT = this.time;
        // 塀の向こうに隠れた者（狭間にも塀の上にも見えない者）は撃たない
        if (ready && this.hiddenBehind(u, t)) ready = false;
        // 撃つ線の上（前）に味方がいれば、撃たずに待つ
        if (ready && u.cd <= 0 && this.allyInLine(u, tp, d)) ready = false;
        // 号令を待つ鉄砲組（holdFire）は、込めたまま「放て」を待つ
        if (ready && u.cd <= 0 && !(u.stagger > 0) && !g.holdFire && g.fire !== false && Math.abs(angleDiff(u.heading, fa)) < 0.5) {
          const dur = 0.45 + u.windup * (0.8 + Math.random() * 0.4);   // 火蓋を切る（0.45 秒）と狙い
          u.atk = { t: dur, dur, target: t, ranged: true };
          if (t.isPlayer) this.playerAttackers++;
        }
      } else if (u.type === 'gun' && !t.isStruct && d > u.range) {
        want = tp; speed = u.run;
      } else if (u.type === 'bow' && !t.isStruct && d < 4 && g.order !== 'hold' && g.order !== 'yari') {
        // 弓兵は間合いを詰められたら下がる
        want = { x: u.pos.x - (tp.x - u.pos.x), z: u.pos.z - (tp.z - u.pos.z) }; speed = u.run;
      } else if (u.type === 'bow' && !t.isStruct && d > 4 && g.fire) {
        if (d <= u.range * (1 - 0.35 * (this.rain || 0))) {
          face = fa;
          // 自分の方の塀・柵が前にある時：近くの狭間へ寄って射る。狭間が無ければ塀の上越しに高く射上げる（塀のすぐ後ろからは射ない）
          let clear = true;
          const wb = this.shotBlocked(u, tp);
          if (wb) {
            const p = this.loopPost(u, tp, wb);
            const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
            if (p && dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; clear = false; }
            else if (distToSeg(u.pos.x, u.pos.z, wb.seg) < 2.5) clear = false;
          } else if (this.atLoop(u)) u.loopT = this.time;
          // 組の弓はおおむね揃えて引く（誰かが番えれば、支度のできかけた者も続く）
          const volley = g.bowT > this.time - 0.5 && u.cd < 1.2;
          if (clear && (u.cd <= 0 || volley) && Math.abs(angleDiff(u.heading, fa)) < 0.6 && !(u.stagger > 0)) {
            const dur = 2.1 + Math.random() * 0.5;   // 番える 0.8・打ち起こし 0.5・引き分け 0.7・会
            u.atk = { t: dur, dur, target: t, bow: true };
            u.bowElev = d > 24 ? Math.min(0.75, 0.3 + (d - 24) / 50) : wb ? 0.5 : 0.04;
            if (!(g.bowT > this.time - 0.5)) g.bowT = this.time;
          }
        } else { want = tp; speed = u.run; }
      } else if (d > u.reach * 0.92 || (u.charging && t.isStruct)) {
        want = tp; speed = d > 6 || g.order === 'attack' ? u.run : u.speed;
        // 騎馬は柵へも駆けて当たる（正面から当たると止められる）
        if (u.type === 'cavalry' && d > 7) this.startCharge(u, near);
        if (u.charging) speed = u.run;
      } else if (t.isPlayer && u.guarding > 0) {
        // 構えの姿勢：その場で槍を立てて待つ
        u.guarding -= dt;
        face = fa;
      } else if (t.isPlayer && this.playerAttackers >= (this.maxAttackers || 3) && !u.stagger) {
        // 一度に斬りかかるのは3人まで。残りは間合いの外で機をうかがう
        const a = (u.id * 2.39996) % (Math.PI * 2);
        const r = u.reach + 1.4;
        want = { x: t.pos.x + Math.sin(a) * r, z: t.pos.z + Math.cos(a) * r };
        if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 0.5) want = null;
        face = fa;
      } else {
        face = fa;
        // 自分（プレイヤー）を前にした侍・足軽は、ときどき構えの姿勢をとる
        if (t.isPlayer && u.cd > 0.2 && !(u.guardCd > this.time) && u.type !== 'bow' && Math.random() < dt * (u.type === 'ashigaru' ? 0.5 : 1.1)) {
          u.guarding = 0.8 + Math.random() * 0.9; u.guardCd = this.time + 3;
        }
        if (u.cd <= 0 && !(u.stagger > 0)) {
          // 技を選ぶ：長柄は突く・上から叩く・払う。刀は袈裟・逆袈裟・横に薙ぐ・突く。鉄砲と弓は台尻・弓で打つ
          const w = u.wpnKind || u.lookWeapon, r = Math.random();
          const kind = w === 'sword' ? (r < 0.32 ? 'kesa' : r < 0.56 ? 'gyaku' : r < 0.8 ? 'yoko' : 'tsuki')
            : w === 'spear' ? (u.type === 'ashigaru' && !u.mounted && !t.isStruct ? (r < 0.42 ? 'slam' : r < 0.54 ? 'sweep' : 'thrust') : 'thrust')
            : w === 'gun' || w === 'bow' ? 'butt' : 'thrust';
          const dur = u.windup * (kind === 'slam' ? 1.25 : 1) * (0.9 + Math.random() * 0.3) + (t.isPlayer ? 0.12 : 0);
          u.atk = { t: dur, dur, target: t, kind, slam: kind === 'slam' };
          if (t.isPlayer) { this.playerAttackers++; if (near) this.play('tick', u.pos, 0.8); }
          if (near && this.hooks.onWindup) this.hooks.onWindup(u, t);
        }
      }
      u.settled = false;
    } else if (u.moveTo) {
      const dx = u.moveTo.x - u.pos.x, dz = u.moveTo.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      const busy = u.fleeing || g.order === 'retreat' || u.confused > 0 || g.regroupT > 0;
      // 持ち場に着いたら落ち着く（隊が止まっている間は、少しずれても歩き直さない）
      const stay = !busy && g.anchorSpeed < 0.3 && (u.settled ? d < 0.9 : d < 0.3);
      if (stay) {
        u.settled = true; face = g._face ?? g.facing;
        const w = u.watch;
        if (w && w.alive && g.order === 'hold') {
          face = Math.atan2(w.pos.x - u.pos.x, w.pos.z - u.pos.z);
          // 棒立ちにならないよう、ときどき小さく足を踏みかえる
          if (!(u.stepT > 0) && Math.random() < dt * 0.35) {
            const a = Math.random() * Math.PI * 2;
            u.stepTo = { x: u.moveTo.x + Math.sin(a) * 0.3, z: u.moveTo.z + Math.cos(a) * 0.3 }; u.stepT = 0.6;
          }
          if (u.stepT > 0) { u.stepT -= dt; want = u.stepTo; speed = u.speed * 0.35; }
        } else u.stepT = 0;
      } else if (d > 0.05) {
        u.settled = false; u.stepT = 0;
        want = u.moveTo;
        speed = d > 4 || busy || g.anchorSpeed > u.speed * 0.85 ? u.run : u.speed;
        // 騎馬の隊が駆けて寄せるとき（逃げるときは除く）
        if (u.type === 'cavalry' && !busy && d > 12 && g.anchorSpeed > 2.5) this.startCharge(u, near);
      }
    }
    // 駆けている騎馬：槍衾に当たれば止められる。足が止まれば駆けるのをやめる
    if (u.charging && u.type === 'cavalry') {
      if (!u.fleeing) this.checkYari(u);
      if (u.charging && this.time - (u.chargeT || 0) > 2.5 && Math.hypot(u.mv.x, u.mv.z) < 2.5) u.charging = false;
    }
    // 手負いは鈍り、縦陣は速く、槍衾の前では足が止まる
    if (u.hp < u.maxHp * 0.3) speed *= 0.75;
    if (g.formation === 'column') speed *= 1.15;
    if (u.target && u.target.group && u.target.group.formation === 'yari' && !u.target.isStruct && u.team !== u.target.team && u.type !== 'cavalry' && this.distTo(u, u.target) < 4.5) speed *= 0.4;
    if (u.fleeing) speed = u.run * 1.05;
    else if (u.woundOut && u.woundOut.t > this.time) speed = u.run * (u.mounted ? 1.1 : 0.9);   // 手傷の武将は急いで退く
    if (u.confused > 0) speed = u.speed * 0.6;
    if (u.mounted && u.stagger > 0) want = null;   // 竿立ちの間は動けない
    this.steer(u, dt, want, speed, face);
  }

  // u から tp へ撃つ線の上（25m まで）に味方が立っているか
  allyInLine(u, tp, d) {
    const L = Math.min(d - 1.2, 25);
    if (L <= 0.8) return false;
    const fx = (tp.x - u.pos.x) / d, fz = (tp.z - u.pos.z) / d;
    let hit = false;
    this.forNear(u.pos.x + fx * L / 2, u.pos.z + fz * L / 2, L / 2 + 1, (o) => {
      if (hit || o === u || !o.alive || o.team !== u.team) return;
      const ox = o.pos.x - u.pos.x, oz = o.pos.z - u.pos.z;
      const along = ox * fx + oz * fz;
      if (along < 0.8 || along > L) return;
      if (Math.abs(ox * fz - oz * fx) < 0.55) hit = true;
    });
    return hit;
  }

  // ---------------- 狭間・柵ごしに撃つ ----------------
  // 塀・柵の上の高さ
  wallTop(s, x, z) { return this.world.heightAt(x, z) + (s.h || (/塀|壁|門|石垣|櫓/.test(s.name || '') ? 3 : 2.1)); }
  // u から tp へ撃つ線を、自分の方の塀・柵がさえぎるか（さえぎる物を返す。無ければ null）
  // 狭間の後ろに立つ者はその穴から、柵のすぐ後ろ（筒先が柵の外へ出る所）の者は柵の隙間から、櫓や石垣の上の者は塀の上越しに撃てる
  shotBlocked(u, tp) {
    const eye = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.46;
    const L = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z) || 1;
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team !== u.team) continue;
      const q = segHit(u.pos.x, u.pos.z, tp.x, tp.z, s.seg);
      if (q < 0) continue;
      const cx = u.pos.x + (tp.x - u.pos.x) * q, cz = u.pos.z + (tp.z - u.pos.z) * q;
      if (/柵/.test(s.name || '') && q * L < 1.1) continue;
      if (eye > this.wallTop(s, cx, cz) + 0.25) continue;
      const m = u.sama;
      // 狭間の穴を抜ける線（穴の正面から 55 度まで。斜めに撃つと、塀を越す所は穴の真ん中から少しずれる）
      if (m && this.atLoop(u) && Math.hypot(cx - m.x, cz - m.z) < 1.0) continue;
      return s;
    }
    return null;
  }
  // o が u から見て、敵方の塀の向こうに隠れているか（狭間に付いた者・塀より高い所の者は見える。柵は透けて見える）
  hiddenBehind(u, o) {
    if (o.isStruct) return false;
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team === u.team || s.team !== o.team || /柵/.test(s.name || '')) continue;
      const q = segHit(u.pos.x, u.pos.z, o.pos.x, o.pos.z, s.seg);
      if (q < 0) continue;
      if (this.atLoop(o)) return false;
      const cx = u.pos.x + (o.pos.x - u.pos.x) * q, cz = u.pos.z + (o.pos.z - u.pos.z) * q;
      if (o.pos.y + (o.mounted ? RIDE.y : 0) + 1.5 > this.wallTop(s, cx, cz)) return false;
      return true;
    }
    return false;
  }
  // 狭間・柵ぎわの持ち場に着いているか
  atLoop(u) { return !!u.loopP && Math.hypot(u.loopP.x - u.pos.x, u.loopP.z - u.pos.z) < 0.55; }
  // 塀の区画の狭間（bhelp の attachSama や wallLine の sama で決まる。無ければ 1.5m ごと＝塀の形の穴と同じ割り方）
  samasOf(s) {
    if (s.sama) return s.sama;
    s.sama = [];
    // 狭間のあるのは城の塀だけ（寺の築地塀・柵・門には無い）
    if (!(s.samaStep || s.name === '塀') || s.gate !== undefined || s.port) return s.sama;
    const [ax, az, bx, bz] = s.seg, L = Math.hypot(bx - ax, bz - az) || 1;
    const n = Math.max(1, Math.round(L / (s.samaStep || 1.5)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      s.sama.push({ s, x: ax + (bx - ax) * t, z: az + (bz - az) * t, kind: s.samaStep ? null : i % 2 ? 'bow' : 'gun', nx: -(bz - az) / L, nz: (bx - ax) / L, by: null });
    }
    return s.sama;
  }
  // 狭間 m から tp を狙えるか（穴の正面から 55 度まで・届く所）。side は兵の立つ側
  samaAims(m, side, tp, range) {
    const dx = tp.x - m.x, dz = tp.z - m.z, d = Math.hypot(dx, dz) || 1;
    return -(dx * m.nx + dz * m.nz) * side / d > 0.57 && d <= range + 1;
  }
  freeSama(u) {
    if (u.sama && u.sama.by === u) u.sama.by = null;
    u.sama = null; u.loopP = null;
  }
  // 撃つ持ち場：柵なら、撃つ線が柵を越す所のすぐ後ろ。塀なら、近くの空いた狭間の真後ろ（一人ずつ）
  loopPost(u, tp, wb) {
    if (/柵/.test(wb.name || '')) {
      const [ax, az, bx, bz] = wb.seg, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, L = Math.sqrt(l2);
      const q = segHit(u.pos.x, u.pos.z, tp.x, tp.z, wb.seg);
      const t = q < 0 ? 0.5 : Math.max(0.08, Math.min(0.92, (((u.pos.x + (tp.x - u.pos.x) * q) - ax) * dx + ((u.pos.z + (tp.z - u.pos.z) * q) - az) * dz) / l2));
      const cx = ax + dx * t, cz = az + dz * t, nx = -dz / L, nz = dx / L;
      if (Math.hypot(cx - u.pos.x, cz - u.pos.z) > 7) return null;
      const sd = (u.pos.x - cx) * nx + (u.pos.z - cz) * nz > 0 ? 1 : -1;
      if (u.sama) this.freeSama(u);
      u.loopP = { x: cx + nx * sd * 0.65, z: cz + nz * sd * 0.65 }; u.loopT = this.time;
      return u.loopP;
    }
    let m = u.sama;
    if (m && !(m.s.alive && m.by === u && this.samaAims(m, u.loopSide, tp, u.range))) { this.freeSama(u); m = null; }
    if (!m && !(u.samaSeekT > this.time)) {
      u.samaSeekT = this.time + 0.4 + Math.random() * 0.3;
      let best = null, bd = 196, bs = 1;
      for (const s of this.structs) {
        if (!s.alive || !s.seg || s.team !== u.team || distToSeg(u.pos.x, u.pos.z, s.seg) > 14) continue;
        for (const c of this.samasOf(s)) {
          if (c.by && c.by !== u && c.by.alive && c.by.sama === c) continue;
          const side = (u.pos.x - c.x) * c.nx + (u.pos.z - c.z) * c.nz > 0 ? 1 : -1;
          if (!this.samaAims(c, side, tp, u.range)) continue;
          // 鉄砲は鉄砲狭間、弓は矢狭間を先に選ぶ
          const k = (c.x - u.pos.x) ** 2 + (c.z - u.pos.z) ** 2 + (c.kind && c.kind !== u.type ? 16 : 0);
          if (k < bd) { bd = k; best = c; bs = side; }
        }
      }
      if (best) {
        if (u.sama) this.freeSama(u);
        best.by = u; u.sama = best; u.loopSide = bs;
        u.loopP = { x: best.x + best.nx * bs * 0.64, z: best.z + best.nz * bs * 0.64 };
      }
      m = best;
    }
    if (!m) return null;
    u.loopT = this.time;
    return u.loopP;
  }

  // 前の段にいる鉄砲か
  gunFront(u) {
    const g = u.group;
    const { cols } = g.layout(g.initial);
    return u.slot >= g.initial || g.gunSlot(u.slot, g.initial, cols).row === 0;
  }

  // 歩き方：加減速し、向きは少しずつ変え、前が詰まれば待ち、立っている味方はよけて通る
  steer(u, dt, want, speed, face) {
    const g = u.group, mounted = !!u.mounted;
    const rate = mounted ? 2.4 : 5;   // 向きを変えられる速さ（rad/s）
    let sp = 0, fx = 0, fz = 0;
    if (want) {
      const dx = want.x - u.pos.x, dz = want.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        fx = dx / d; fz = dz / d;
        // 着く前に足をゆるめる（隊が進んでいれば、その歩みに合わせる）
        const gs = g && g.anchorSpeed > 0.3 ? g.anchorSpeed : 0;
        sp = Math.min(speed, gs + 0.4 + d * (mounted ? 1.0 : 1.5));
        if (d > (mounted ? 2.5 : 1.2) || u.fleeing) {
          const hd = Math.atan2(dx, dz);
          this.turn(u, hd, dt, rate);
          const off = Math.abs(angleDiff(u.heading, hd));
          if (mounted) {
            // 馬は横へは歩けない：向いている方へ進み、大きく曲がるときは速さを落とす
            sp *= Math.max(0.3, Math.cos(Math.min(off, 1.3)));
            fx = Math.sin(u.heading); fz = Math.cos(u.heading);
          } else if (off > 1.3) sp *= 0.4;   // 大きく向きを変えるときは、まず向き直る
        } else {
          // 持ち場の少しの直しは、向きを変えずに横へ寄る
          sp = Math.min(sp, mounted ? 1.2 : 1.6);
          this.turn(u, face ?? (g ? g._face ?? g.facing : u.heading), dt, rate * 0.5);
        }
      }
    } else if (face !== null && face !== undefined) this.turn(u, face, dt, rate * 1.2);
    // 詰まり：行き先がまだ遠いのに二秒ほどでほとんど進めなければ、しばらく斜め横へ回り込む
    // （押し合い・前の者の背・柵の角で、足踏みもせずに止まったままにしない）
    let detour = false;
    if (IDLE.on && want && !u.isPlayer && !mounted && sp > 0.2) {
      const S = u.stk || (u.stk = { x: u.pos.x, z: u.pos.z, t: 0, d: 0, s: 1 });
      S.t += dt;
      if (S.t > 2) {
        const far = Math.hypot(want.x - u.pos.x, want.z - u.pos.z) > 1.5;
        if (far && S.d <= 0 && Math.hypot(u.pos.x - S.x, u.pos.z - S.z) < 0.35) { S.d = 1 + Math.random() * 0.8; S.s = Math.random() < 0.5 ? -1 : 1; }
        S.t = 0; S.x = u.pos.x; S.z = u.pos.z;
      }
      if (S.d > 0) {
        S.d -= dt; detour = true;
        const c = Math.cos(1.1 * S.s), s = Math.sin(1.1 * S.s), nx = fx * c + fz * s, nz = -fx * s + fz * c;
        fx = nx; fz = nz;
        sp = Math.max(sp, u.speed * 0.7);
      }
    } else if (u.stk) { u.stk.t = 0; u.stk.x = u.pos.x; u.stk.z = u.pos.z; }
    let dvx = fx * sp, dvz = fz * sp;
    // 押し合い（馬は足軽を押しのける）・前の味方が進んでいれば詰まって待つ・立っている味方はよけて通る
    let px = 0, pz = 0, sx = 0, sz = 0, block = 1;
    const queue = !u.target;   // 隊列で歩くときだけ、前の者に合わせて詰まる（敵へ向かうときは押し合う）
    const r0 = mounted ? 1.25 : 0.85;
    this.forNear(u.pos.x, u.pos.z, mounted ? 1.5 : 1.3, (o) => {
      if (o === u || !o.alive) return;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2.25 || d2 < 1e-6) return;
      const d = Math.sqrt(d2);
      const rr = o.mounted ? 1.25 : r0;
      if (d < rr) {
        const k = o.isPlayer ? 5 : o.mounted && !mounted ? 5.5 : mounted && !o.mounted ? 1.1 : 3.2;
        const push = (rr - d) * k;
        px += dx / d * push; pz += dz / d * push;
      }
      if (queue && sp > 0.3 && o.team === u.team && d < 1.3 && !o.isPlayer) {
        const ahead = -(dx * fx + dz * fz);
        if (ahead > 0.25) {
          const lat = -dx * fz + dz * fx;
          if (Math.abs(lat) < 0.7) {
            const along = o.mv ? o.mv.x * fx + o.mv.z * fz : 0;
            if (along > 0.3) block = Math.min(block, Math.max(0.15, (d - 0.75) / 0.5));
            else { const s = (lat >= 0 ? -1 : 1) * sp * 0.7 * (1.3 - d); sx += fz * s; sz -= fx * s; }
          }
        }
      }
    });
    if (!detour) { dvx *= block; dvz *= block; }
    // 加減速（馬は立ち上がりが遅い）
    const cur = Math.hypot(u.mv.x, u.mv.z), tgt = Math.hypot(dvx, dvz);
    const acc = (tgt > cur ? (mounted ? 3.4 : 5.5) : (mounted ? 5 : 8)) * dt;
    const ex = dvx - u.mv.x, ez = dvz - u.mv.z, el = Math.hypot(ex, ez);
    if (el <= acc) { u.mv.x = dvx; u.mv.z = dvz; } else { u.mv.x += ex / el * acc; u.mv.z += ez / el * acc; }
    // 押し合いはならして使う（兵がガクガク揺れないように）
    const pk = Math.min(1, dt * 10);
    u.push.x += (px + sx - u.push.x) * pk; u.push.z += (pz + sz - u.push.z) * pk;
    u.vel.x = u.mv.x + u.push.x; u.vel.z = u.mv.z + u.push.z;
    u.moving = Math.min(1, Math.hypot(u.mv.x, u.mv.z) / 2.4);
  }

  collide(u) {
    for (const s of this.structs) {
      if (!s.alive || !s.seg) continue;
      const [ax, az, bx, bz] = s.seg;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      let t = ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t, cz = az + dz * t;
      const ox = u.pos.x - cx, oz = u.pos.z - cz;
      const d = Math.hypot(ox, oz);
      if (d < 0.6) {
        const nx = d > 1e-4 ? ox / d : (s.nx || 0), nz = d > 1e-4 ? oz / d : (s.nz || 1);
        u.pos.x = cx + nx * 0.6; u.pos.z = cz + nz * 0.6;
        // 駆けてきた騎馬は柵に当たって止まる（馬が竿立ちになり、しばらく動けない）
        if (u.charging && u.team !== s.team) {
          this.cavalryStopped(u, cx, cz, 18);
          u.stagger = 1.4;
          s.hp -= 8;
          this.play('knock', { x: cx, z: cz }, 1);
          if (this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, s);
          if (u.hp <= 0) this.kill(u, null);
          else if (s.hp <= 0 && s.alive) { s.alive = false; s.hp = 0; if (s.mesh) s.mesh.visible = false; if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(s); }
        }
      }
    }
    for (const s of this.structs) {
      if (!s.alive || !s.solidR) continue;
      const dx = u.pos.x - s.x, dz = u.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < s.solidR && d > 1e-4) { u.pos.x = s.x + dx / d * s.solidR; u.pos.z = s.z + dz / d * s.solidR; }
    }
  }

  // 待つ間の小さな動き：棒立ちにしない。一人ずつ時をずらして、
  //   ・いつも：重心を左右へ移す（力を抜いた脚の膝がゆるむ）・首を少し回す
  //   ・ときどき：足の踏みかえ・見回し・隣と話す・槍の持ち替え・得物の手入れ
  //   ・陣の中（持ち場で待ち、敵が遠い）：膝をつく者もいる。敵が近ければ（見張る相手がいれば）立って腰を落として構える
  // 返す物 u.idl：drop（手を下げる分）・low（身構え）・sit（膝つき）・rx（槍の傾けの足し）。骨の入った人（humans.js）も low と sit を使う
  idleFx(u, dt) {
    const I = u.idl || (u.idl = { ph: Math.random(), a: null, k: 0, d: 0, t: 1 + Math.random() * 7, s: 1, tw: 0, hy: 0, hp: 0, rx: 0, sit: 0, sitW: 0, sitT: 3 + Math.random() * 10, low: 0, drop: 0, hOff: 0, talk: false });
    const g = u.group, w = u.wpnKind || u.lookWeapon;
    // 狙う相手はいるが、まだ撃たない・打ちかからない者（「放て」を待つ鉄砲・間合いの外で待つ者）も、構えたまま小さく動く
    const waitT = !!u.target && !u.target.isStruct && u.target.alive !== false && !u.atk && !u.swing && !(u.guarding > 0) && u.moving < 0.15;
    const idle = !u.fleeing && (!u.target || waitT) && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) && !(u.cheer > 0) && !(u.confused > 0) && u.moving < 0.15
      && !(u.reload && w === 'gun') && !(u.bowPh && u.bowPh !== 'rest');
    const foe = !idle ? null : waitT ? u.target : u.watch && u.watch.alive ? u.watch : null;
    // 身構え（敵が 30m ほどに来た）
    I.low += ((foe ? 1 : 0) - I.low) * Math.min(1, dt * 3);
    // 陣の中で膝をつく：持ち場で落ち着いて待ち、敵が遠い時だけ。しばらくすると立ち上がる（槍衾の前の列は立ったまま）
    const camp = idle && !foe && g && g.order === 'hold' && u.settled && !(g.formation === 'yari' && u.row === 0) && !u.isSub;
    I.sitT -= dt;
    if (I.sitT <= 0) { I.sitT = 12 + Math.random() * 25; I.sitW = Math.random() < 0.35 ? 1 : 0; }
    I.sit += ((camp ? I.sitW : 0) - I.sit) * Math.min(1, dt * 2.2);
    // ときどきの仕草
    if (!idle) { I.a = null; I.t = Math.max(I.t, 1 + Math.random() * 2); }
    else if (I.a) { I.k += dt; if (I.k >= I.d) { I.a = null; I.t = foe ? 0.6 + Math.random() * 2 : 1.5 + Math.random() * 5; } }
    else if ((I.t -= dt) <= 0) {
      const r = Math.random();
      let a = foe ? (r < 0.5 ? 'step' : 'look') : I.sit > 0.5 ? (r < 0.45 ? 'look' : r < 0.8 ? 'talk' : 'tend')
        : r < 0.2 ? 'step' : r < 0.42 ? 'look' : r < 0.64 ? 'talk' : r < 0.84 && w !== 'bow' ? 'regrip' : 'tend';
      I.s = Math.random() < 0.5 ? -1 : 1;
      if (a === 'talk') {
        // 隣の者へ顔を向けて話す（相手も手が空いていれば、こちらを向いて聞く）
        let m = null;
        this.forNear(u.pos.x, u.pos.z, 2.6, (o) => { if (!m && o !== u && o.alive && o.team === u.team && !o.isPlayer && !o.target && !o.mounted && o.moving < 0.15) m = o; });
        if (!m) a = 'look';
        else {
          const rel = (o) => Math.max(-1, Math.min(1, angleDiff(o === u ? u.heading : m.heading, o === u ? Math.atan2(m.pos.x - u.pos.x, m.pos.z - u.pos.z) : Math.atan2(u.pos.x - m.pos.x, u.pos.z - m.pos.z))));
          I.tw = rel(u); I.talk = true;
          const J = m.idl;
          if (J && !J.a) { J.a = 'talk'; J.k = 0; J.d = 3 + Math.random() * 3; J.tw = rel(m); J.talk = false; }
        }
      }
      I.a = a; I.k = 0;
      I.d = a === 'step' ? 1.1 : a === 'look' ? 2 + Math.random() * 2 : a === 'talk' ? 3 + Math.random() * 3 : a === 'regrip' ? 1.4 : 3 + Math.random() * 2;
    }
    // 仕草ごとの体の向き・首・槍
    let yaw = 0, hy = 0, hp = 0, rx = 0, lean = 0, lift = 0, liftL = true;
    if (I.a) {
      const q = I.k / I.d, env = sm(0, 0.2, q) * (1 - sm(0.78, 1, q));
      if (I.a === 'step') { const q2 = (q * 2) % 1; lift = Math.sin(q2 * Math.PI); liftL = (q < 0.5) === (I.s > 0); yaw = I.s * 0.1 * env; }
      else if (I.a === 'look') { hy = I.s * (0.55 + I.ph * 0.45) * env; yaw = I.s * 0.2 * env; }
      else if (I.a === 'talk') { yaw = I.tw * 0.5 * env; hy = I.tw * 0.45 * env; hp = env * (0.05 + 0.07 * Math.sin(I.k * (I.talk ? 5.5 : 2.2) + I.ph * 9)); }
      else if (I.a === 'regrip') rx = -0.45 * Math.sin(q * Math.PI);
      else if (I.a === 'tend') { lean = 0.16 * env; hp = 0.42 * env; rx = -0.5 * env; }
    }
    // 敵が近い時は、見張る相手へ顔を向ける
    if (foe) hy += Math.max(-0.8, Math.min(0.8, angleDiff(u.heading + u.body.rotation.y, Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z)))) * 0.6;
    const T = this.time, ph = I.ph, on = idle ? 1 : 0;
    // 重心の左右（人ごとに速さと向きが違う）
    // 敵が近い時は落ち着かず、速く小さく揺れる。穂先・筒先もわずかに上下する
    const ws = Math.sin(T * (0.45 + ph * 0.35) * (1 + I.low * 1.6) + ph * 40) * on;
    u.body.rotation.z += ws * 0.045 * (1 - I.sit * 0.5);
    if (foe) rx += 0.06 * Math.sin(T * (1.1 + ph * 0.6) + ph * 20);
    u.body.rotation.y += yaw;
    u.body.rotation.x += lean + I.low * 0.14 + I.sit * 0.05;
    // 首（胴の子）：なめらかに向きを追い、うなずきは首の付け根を軸に
    const kh = Math.min(1, dt * 5);
    I.hy += (hy + 0.12 * Math.sin(T * 0.31 + ph * 17) * on - I.hy) * kh;
    I.hp += (hp - I.hp) * kh;
    I.rx += (rx - I.rx) * Math.min(1, dt * 8);
    if (u.head) {
      const N = 1.5;
      u.head.rotation.set(I.hp, I.hy, 0);
      u.head.position.set(0, N - N * Math.cos(I.hp), -N * Math.sin(I.hp));
    }
    // 脚（units.js の形の時だけ。骨の入った人は humans.js が low・sit から脚を折る）
    const drop = I.sit * 0.29 + I.low * 0.06;
    I.drop = drop;
    if (u.shinL && u.body.visible !== false) {
      let lL = u.legL.rotation.x, lR = u.legR.rotation.x, sL = u.shinL.rotation.x, sR = u.shinR.rotation.x;
      // 力を抜いた脚の膝がゆるむ
      if (ws > 0) { sL += 0.14 * ws; lL -= 0.05 * ws; } else { sR -= 0.14 * ws; lR += 0.05 * ws; }
      // 踏みかえ：片足ずつ軽く上げて置き直す
      if (lift) { if (liftL) { lL -= 0.38 * lift; sL += 0.7 * lift; } else { lR -= 0.38 * lift; sR += 0.7 * lift; } }
      // 身構え：左足を前、膝を曲げて腰を落とす
      lL -= 0.25 * I.low; sL += 0.35 * I.low; lR += 0.12 * I.low; sR += 0.3 * I.low;
      // 膝つき：右の膝を立て、左の膝を地につける（骨の入った人と同じ向き）
      const k = I.sit;
      if (k > 0.01) { lR += (-1.4 - lR) * k; sR += (1.45 - sR) * k; lL += (0.1 - lL) * k; sL += (1.5 - sL) * k; }
      u.legL.rotation.x = lL; u.legR.rotation.x = lR; u.shinL.rotation.x = sL; u.shinR.rotation.x = sR;
      u.body.position.y -= drop + Math.abs(ws) * 0.008;
    }
    return I;
  }

  animate(u, dt, near) {
    const m = u.mesh;
    if (!u.alive) {
      // 馬上で討たれた：馬が崩れて倒れ、乗り手は鞍ごと地面へ（馬の倒れ方に任せる）
      if (u.mounted && u.horse && u.horse.userData.horse && u.deadT < 4) {
        u.deadT += dt;
        const H = u.horse.userData.horse;
        H.dead = true;
        if (u.horse.visible !== false) animateHorse(u.horse, dt, 0);
        if (u.seat) { u.seat.matrix.copy(H.seat); u.seat.matrixWorldNeedsUpdate = true; }
        return;
      }
      if (u.death && !u.mounted) { if (u.death.t < DEATH_END) this.animDeath(u, dt, near); else u.deadT += dt; return; }
      if (u.deadT < 1 && !u.mounted) {
        u.deadT += dt;
        const k = Math.min(1, u.deadT / 0.55);
        // 倒れる向きはさまざま（前後・左右）
        if (u.fallAxis === 'z') m.rotation.z = Math.PI / 2 * k * u.fall * (k * k);
        else m.rotation.x = -Math.PI / 2 * k * u.fall * (k * k);
        m.position.y = u.pos.y - 0.1 * k;
      }
      return;
    }
    m.position.set(u.pos.x, u.pos.y, u.pos.z);
    m.rotation.y = u.heading;
    if (u.fireT > 0) u.fireT -= dt;
    // 自分（プレイヤー）の振りと崩れの時計（兵は act で進める）
    if (u.isPlayer) { if (u.swing) { u.swing.t += dt; if (u.swing.t > u.swing.dur + 0.3) u.swing = null; } if (u.hit) { u.hit.t += dt; if (u.hit.t > u.hit.dur) u.hit = null; } }
    if (!near || u.offscreen) {
      if (u.wpn) flexSpear(u.wpn, dt, false, 0);
      // 遠くの兵（手足は省く）：体だけ小さく揺らし、ゆっくり見回す（安い動き。一人ずつ時をずらす）
      if (IDLE.on && !u.offscreen && !u.isPlayer && !u.mounted && u.body && u.moving < 0.1) {
        const p = u.id * 0.618;
        u.body.rotation.z = Math.sin(this.time * (0.9 + (p % 1) * 0.6) + p * 40) * 0.06;
        u.body.rotation.y = Math.sin(this.time * (0.4 + (p * 7 % 1) * 0.3) + p * 17) * 0.4;
        u.body.rotation.x = Math.sin(this.time * 0.7 + p * 9) * 0.04;
        u.body.position.y = Math.sin(this.time * 1.8 + u.id) * 0.015;
      }
      return;
    }
    // 被弾でのけぞる／混乱してふらつく
    if (u.recoil > 0) u.recoil -= dt;
    // 打たれた崩れ（u.hit）：素早く崩れて、ゆっくり戻る
    const H = u.hit;
    let hx = 0, hz = 0;
    if (H) {
      const k = H.t / H.dur, e = k < 0.18 ? k / 0.18 : Math.max(0, (1 - k) / 0.82);
      if (H.kind === 'recoil') hx = -0.32 * e;
      else if (H.kind === 'flinch') { hx = -0.1 * e; hz = H.side * 0.05 * e; }
      else if (H.kind === 'side') { hx = -0.08 * e; hz = H.side * 0.3 * e; }
      else if (H.kind === 'stumble') hx = 0.32 * e;
    }
    // のけぞり・突きの踏み込み・走りの前傾
    u.body.rotation.x = u.recoil > 0 ? -0.28 * (u.recoil / 0.22) : u.strikeT > 0 ? 0.2 * Math.sin((1 - u.strikeT / 0.2) * Math.PI) : u.moving > 1.1 ? 0.12 : 0;
    u.body.rotation.x += hx;
    // 崩れかけの兵は、ちらちらと後ろを振り返る
    const scared = u.group && u.group.morale < 32 && !u.isPlayer && !u.fleeing;
    // 薙ぎのひねり、立ち止まったときの見回し
    u.body.rotation.y = scared && Math.sin(this.time * 0.9 + u.id) > 0.55 ? Math.sign(Math.sin(u.id)) * 0.9 : u.sweepT > 0 ? Math.sin((1 - u.sweepT / 0.35) * Math.PI * 2) * 0.35 : (u.moving < 0.1 && !u.target && !u.isPlayer ? Math.sin(this.time * 0.35 + u.id * 1.7) * 0.22 : 0);
    // 勝鬨・鼓舞で槍を掲げる
    if (u.cheer > 0) u.cheer -= dt;
    u.body.rotation.z = (u.confused > 0 ? Math.sin(this.time * 7 + u.id) * 0.12 : 0) + hz;
    // 打たれた手応え：のけぞり、大きく崩れたら膝をつく（吹き飛ばしはしない）
    if (u.flinchT > 0) u.flinchT -= dt;
    const kneel = u.stagger > 0.7 && !u.mounted && !u.isPlayer;
    if (u.flinchT > 0) u.body.rotation.x = -Math.sin(u.flinchT / 0.32 * Math.PI) * 0.28;
    else if (kneel) u.body.rotation.x = 0.32;
    u.anim += dt * (3 + u.moving * 6);
    if (u.mounted) {
      // 馬上：脚は鞍をはさみ、馬は速さに合わせて駆ける
      seatLegs(u);
      const Hh = u.horse && u.horse.userData.horse;
      // 打たれて大きく崩れたら、馬も驚いて跳ねる（竿立ちの最中でなければ）
      if (Hh && u.stagger > 0.5 && !(Hh.rear > 0) && (Hh.spookT || 0) <= 0) { Hh.spook = 1; Hh.spookT = 4; }
      if (Hh) Hh.spookT = (Hh.spookT || 0) - dt;
      if (u.horse && u.horse.visible !== false) animateHorse(u.horse, dt, Math.hypot(u.vel.x, u.vel.z));
      if (u.seat && Hh) { u.seat.matrix.copy(Hh.seat); u.seat.matrixWorldNeedsUpdate = true; }
    } else {
      const sw = Math.sin(u.anim) * 0.65 * u.moving;
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      // 前へ振り出す脚は膝を折る。走るほど深く
      const mv = Math.min(1.4, u.moving);
      const kneeK = (0.35 + mv * 0.5) * Math.min(1, mv * 2);
      if (u.shinL) { u.shinL.rotation.x = Math.max(0, -Math.cos(u.anim)) * kneeK; u.shinR.rotation.x = Math.max(0, Math.cos(u.anim)) * kneeK; }
      // 崩れて膝をつく
      if (kneel && u.shinL) { u.legL.rotation.x = -0.9; u.shinL.rotation.x = 1.5; u.legR.rotation.x = 0.2; u.shinR.rotation.x = 1.2; }
      // 前へよろける・のけぞる時は、片足を一歩出して踏みとどまる
      else if (H && (H.kind === 'stumble' || H.kind === 'recoil') && u.moving < 0.3) { const e = Math.sin(Math.min(1, H.t / H.dur) * Math.PI); u.legL.rotation.x = (H.kind === 'stumble' ? -0.45 : 0.3) * e; }
    }
    // 馬上の弾みは鞍の入れ物（u.seat）が馬の背から受けるので、ここでは乗り手の小さな腰の動きだけ
    u.body.position.y = (u.mounted ? RIDE.y : 0) + Math.abs(Math.sin(u.anim)) * (u.mounted ? 0.02 : 0.05) * u.moving;
    if (u.dodging) u.body.position.y -= 0.28;
    if (kneel) u.body.position.y -= 0.25;
    // 立ち止まっているときの息づかい
    if (u.moving < 0.1) u.body.position.y += Math.sin(this.time * 1.8 + u.id) * 0.012;
    // 待つ間の小さな動き（重心・踏みかえ・見回し・話す・持ち替え・手入れ・膝つき・身構え）
    const idl = IDLE.on && !u.isPlayer && !u.mounted && !kneel ? this.idleFx(u, dt) : null;
    // 前のコマで下げた手の高さを戻す（膝つき・身構えの分）
    if (u.idl && u.idl.hOff) { u.hand.position.y += u.idl.hOff; u.idl.hOff = 0; }
    // 武器の構え（敵が近くて身構えている時も、穂先・筒先を前へ）
    const wType = u.wpnKind || u.lookWeapon || TYPES[u.type].weapon;
    const engaged = !!(u.target || u.atk || u.isPlayer) || !!(idl && idl.low > 0.5);
    u.lh = null;
    if (wType === 'spear') this.poseSpear(u, dt, engaged);
    else if (wType === 'gun') this.poseGun(u, dt, engaged);
    else if (wType === 'sword') this.poseSword(u, dt, engaged);
    else if (wType === 'bow') this.poseBow(u, dt);
    if (idl && idl.drop > 0.005) { u.hand.position.y -= idl.drop; idl.hOff = idl.drop; }
    if (near && !u.offscreen) poseArms(u, u.anim);
    if (u.guardFlash > 0) u.guardFlash -= dt;
    if (u.strikeT > 0) u.strikeT -= dt;
    if (u.slamT > 0) u.slamT -= dt;
    if (u.sweepT > 0) u.sweepT -= dt;
    // 指物は風下へなびく
    if (u.flag) u.flag.rotation.y = (this.wind || 0) - u.heading - Math.PI / 2 + Math.sin(this.time * 2.2 + u.id) * 0.25;
  }

  // 槍：構え・突き（まっすぐ出して引く）・叩き（長柄を振り上げて打ち下ろす）・払い。
  // 相手が近すぎれば柄を手元へ繰り込み、それでも余れば穂先を上げる（穂先が相手の体を突き抜けない）
  poseSpear(u, dt, engaged) {
    const h = u.hand, w = u.wpn, g = u.group;
    let rx = engaged ? -0.06 : -0.55, ry = 0, ext = 0, slide = 0;
    // 槍衾：前の列は槍を下げて穂先を揃え、後ろの列は前の者の肩越しに斜めに構える
    if (g && g.formation === 'yari' && !u.isPlayer && !u.mounted && (g.order === 'yari' || g.order === 'hold') && !u.fleeing) rx = u.row === 0 ? 0.07 : u.row === 1 ? -0.1 : -0.45;
    const tip = (w && w.userData.tip) || 2;
    // 相手までの前への遠さ（dT）
    const sw = u.swing;
    const tg = (sw && sw.target) || (u.atk && u.atk.target) || u.target || u.fitT;
    let dT = 99;
    if (tg && tg.alive !== false) {
      if (tg.isStruct) dT = this.distTo(u, tg) + 0.2;
      else if (tg.pos) {
        const dx = tg.pos.x - u.pos.x, dz = tg.pos.z - u.pos.z;
        const along = dx * Math.sin(u.heading) + dz * Math.cos(u.heading), lat = Math.abs(dx * Math.cos(u.heading) - dz * Math.sin(u.heading));
        if (along > 0.3 && lat < 1.3) dT = along;
      }
    }
    const reach0 = 0.18 + tip;
    if (engaged && dT < 99) {
      // 構えた穂先は相手の 0.55m 手前
      const over = reach0 - (dT - 0.55);
      if (over > 0) {
        slide = -Math.min(0.9, over);
        const rest = over + slide;
        if (rest > 0) rx = Math.min(rx, -Math.acos(Math.max(0.35, (reach0 + slide - rest) / (reach0 + slide))));
      }
    }
    const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk;
    if (a) {
      const k = Math.min(1, 1 - Math.max(0, a.t) / (a.dur || u.windup));
      // 振り上げて溜める（叩き）／引いて溜める（突き）／横へ振りかぶる（払い）
      if (a.kind === 'slam') { rx = Math.min(rx, -0.1) - 1.0 * k; ext = -0.15 * k; }
      else if (a.kind === 'sweep') { ry = 0.8 * k; rx = -0.1; }
      else ext = -0.35 * k;
    }
    if (sw && (sw.kind === 'thrust' || sw.kind === 'charge') && sw.t < sw.dur + 0.3) {
      // 突き：まっすぐ出して、引く。当たれば穂先は相手の所で止まり、外れれば体の脇を抜ける
      const p = sw.t / sw.dur;
      const out = p < 0.5 ? Math.sin(p / 0.5 * Math.PI / 2) : p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.8);
      let e = 0.6 * out;
      const cur = (reach0 + slide) * Math.cos(rx);
      if (sw.res === 'hit') e = Math.min(e, sw.d - 0.1 - cur);
      else if (sw.res === 'armor' || sw.res === 'block') e = Math.min(e, sw.d - 0.3 - cur + (sw.res === 'block' ? -0.15 : 0));
      else if (sw.res === 'miss') ry = sw.side * 0.22 * out;
      ext = Math.max(-0.4, e);
      if (sw.res === 'block' && p > 0.5) rx -= 0.25 * out;   // 受けられて穂先が上へ逸れる
    } else if (sw && sw.kind === 'slam' && sw.t < sw.dur + 0.3) {
      // 叩き：振り上げた長柄を、しなりを利かせて打ち下ろす
      const p = Math.min(1, sw.t / (sw.dur * sw.at));
      const end = -Math.atan2(0.55, Math.max(1, (sw.d || dT) - 0.1));   // 柄が相手の頭の高さを打つ
      const hi = -1.1;
      rx = p < 1 ? hi + (end - hi) * p * p : end + Math.min(0.5, (sw.t - sw.dur * sw.at) * 0.6) * (sw.res === 'miss' ? 1 : 0.2);
      ext = -0.1;
    } else if (u.sweepT > 0) {
      const p = 1 - u.sweepT / 0.35;
      ry = Math.sin(p * Math.PI * 2) * 0.9;
      if (!u.isPlayer && sw && sw.kind === 'sweep') { const q = Math.min(1, sw.t / sw.dur); ry = 0.8 - 1.8 * q; rx = -0.1; }
    } else if (u.slamT > 0 && u.isPlayer) { rx = -1.05 + (1 - u.slamT / 0.26) * 1.35; }
    else if (u.strikeT > 0 && u.isPlayer && !sw) ext = Math.sin((1 - u.strikeT / 0.2) * Math.PI) * 0.6;
    // 右手の握りは体の右にあるので、穂先を相手の真ん中へ少し内へ向ける
    if (engaged && dT < 99 && !u.mounted) ry -= Math.atan2(0.28, Math.max(1, dT));
    if (u.guard || u.guardFlash > 0 || u.guarding > 0) { rx = -0.9; ry = -0.25; }
    if (u.cheer > 0) { rx = -1.35; ext = 0.1 + Math.abs(Math.sin(this.time * 6)) * 0.15; }
    // 崩れた時は穂先が下がる
    if (u.hit && u.hit.kind !== 'flinch') rx += 0.12 * Math.sin(Math.min(1, u.hit.t / u.hit.dur) * Math.PI);
    // 士気が落ちると、槍先が揃わず揺れる
    const gm = g ? g.morale : 100;
    if (gm < 40 && !u.isPlayer) rx += Math.sin(this.time * 1.7 + u.id * 2.3) * (40 - gm) * 0.012;
    // 待つ間の持ち替え・手入れ（idleFx）
    if (u.idl && u.idl.rx && !u.atk && !u.swing) rx += u.idl.rx;
    // なめらかに（突きの速さは残す）
    const s = u.spr || (u.spr = { rx, ry, sl: slide });
    const kk = Math.min(1, dt * (sw || a ? 30 : 10));
    s.rx += (rx - s.rx) * kk; s.ry += (ry - s.ry) * kk; s.sl += (slide - s.sl) * Math.min(1, dt * 8);
    h.rotation.x = s.rx; h.rotation.y = s.ry; h.position.z = 0.18 + ext;
    if (w) w.position.z = s.sl;
    // しなり：近くの兵だけ。柄が水平に近いほど先が垂れる
    if (w) flexSpear(w, dt, u.camD < 26, Math.cos(s.rx));
  }

  // 打刀：構え（中段）・袈裟（右上から左下）・逆袈裟（左下から右上）・横に薙ぐ・突き・受け（刃を横にして受ける）
  poseSword(u, dt, engaged) {
    const h = u.hand, oy = u.mounted ? RIDE.y : 0;
    // [x, y, z, 上下, 左右, 刃の向き]
    let P = engaged ? SW_POSE.chudan : SW_POSE.sage;
    const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk, sw = u.swing;
    if (a && SW_POSE[a.kind + '0']) {
      const k = Math.min(1, 1 - Math.max(0, a.t) / (a.dur || u.windup));
      P = lerpPose(SW_POSE.chudan, SW_POSE[a.kind + '0'], k * (2 - k));
    } else if (sw && SW_POSE[sw.kind + '0'] && sw.t < sw.dur + 0.3) {
      // 振り：速く出て、当たった所で止まる（受けられれば途中で弾かれ、甲冑なら浅く止まる）
      const p = Math.min(1, sw.t / sw.dur);
      let q = 1 - (1 - p) * (1 - p);
      const stop = sw.res === 'block' ? 0.45 : sw.res === 'armor' ? 0.65 : 1;
      q = Math.min(q, stop);
      P = lerpPose(SW_POSE[sw.kind + '0'], SW_POSE[sw.kind + '1'], q);
      if (sw.t > sw.dur) P = lerpPose(P, SW_POSE.chudan, Math.min(1, (sw.t - sw.dur) / 0.3));
    } else if (u.strikeT > 0 && u.isPlayer) {
      P = lerpPose(SW_POSE.kesa0, SW_POSE.kesa1, 1 - u.strikeT / 0.2);
    }
    if (u.guard || u.guardFlash > 0 || u.guarding > 0) P = SW_POSE.uke;
    if (u.cheer > 0) P = SW_POSE.cheer;
    const s = u.swp || (u.swp = P.slice());
    const kk = Math.min(1, dt * (sw || a ? 35 : 10));
    for (let i = 0; i < 6; i++) s[i] += (P[i] - s[i]) * kk;
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3], s[4], s[5]);
  }

  // 鉄砲：担ぐ・構える・火蓋を切る・頬付けで狙う・放つ（反動）・込め直し（筒を立て、火薬・弾・込め矢・口薬・火縄）
  poseGun(u, dt, engaged) {
    const h = u.hand, w = u.wpn, oy = u.mounted ? RIDE.y : 0;
    let ph = engaged ? 'ready' : 'carry', k = 0;
    const a = u.atk && u.atk.ranged ? u.atk : null;
    if (a) { const e = a.dur - a.t; if (e < 0.45) { ph = 'kiri'; k = e / 0.45; } else { ph = 'aim'; k = Math.min(1, (e - 0.45) / 0.5); } }
    else if (u.fireT > 0) { ph = 'fire'; k = 1 - u.fireT / 0.45; }
    else if (u.reload && !u.isPlayer && u.moving < 0.5) {
      let f = u.reload.t / u.reload.dur;
      for (const [nm, len] of RELOAD) { if (f < len) { ph = nm; k = f / len; break; } f -= len; }
    }
    // 号令への「応」・勝鬨：鉄砲を高く掲げる
    if (u.cheer > 0 && !a) { ph = 'cheer'; k = 0; }
    u.gunPh = ph; u.gunK = k;
    const P = ph === 'cheer' ? [0.3, 1.62 + Math.abs(Math.sin(this.time * 6)) * 0.08, 0.12, -1.35] : GUN_POSE[ph] || GUN_POSE.ready;
    let [x, y, z, rx] = P;
    // 待つ間の持ち替え・手入れ（idleFx）
    if (ph === 'carry' && u.idl && u.idl.rx) rx += u.idl.rx * 0.6;
    if (ph === 'fire') { const e = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k); z -= 0.08 * e; rx -= 0.16 * e; }
    // 込め矢で突き固める間は、筒を少し揺らす
    if (ph === 'ram') y += Math.max(0, Math.sin(k * Math.PI * 7)) * 0.02;
    const s = u.gpr || (u.gpr = [x, y, z, rx]);
    const kk = Math.min(1, dt * (ph === 'fire' ? 40 : 7));
    s[0] += (x - s[0]) * kk; s[1] += (y - s[1]) * kk; s[2] += (z - s[2]) * kk; s[3] += (rx - s[3]) * kk;
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3], 0, 0);
    // 左手：込め直しでは筒先（火薬・弾・込め矢）、火皿（口薬・火蓋）へ
    const bx = Math.sin(s[3]), bc = Math.cos(s[3]);
    const muz = [s[0], s[1] + oy - bx * GUN_MUZ + 0.03, s[2] + bc * GUN_MUZ];
    if (ph === 'powder' || ph === 'ball' || ph === 'ram') u.lh = muz;
    else if (ph === 'prime' || ph === 'kiri' || ph === 'match') u.lh = [s[0] + 0.03, s[1] + oy - bx * 0.06 + 0.05, s[2] + bc * 0.06];
    // 込め矢：台の下から抜き、筒先から入れて三度ほど突き、戻す
    const R = w && w.userData.ram;
    if (R) {
      if (ph === 'ram') {
        if (k < 0.15) { const q = k / 0.15; R.position.set(0, -0.012 + (GUN_BORE + 0.012) * q, 0.1 + 0.95 * q); }
        else if (k < 0.85) { const q = (k - 0.15) / 0.7, depth = 0.5 + 0.32 * Math.abs(Math.sin(q * Math.PI * 3)); R.position.set(0, GUN_BORE, GUN_MUZ + 0.01 - depth); }
        else { const q = (k - 0.85) / 0.15; R.position.set(0, GUN_BORE - (GUN_BORE + 0.012) * q, 1.05 - 0.95 * q); }
      } else R.position.set(0, -0.012, 0.1);
      // 骨の入った人が自分の槊杖を出している間は、二本にならないよう隠す
      R.visible = !(u.human && u.human.rod && u.human.rod.visible);
    }
    // 火縄の火（雨では消えがち）
    const E = w && w.userData.ember;
    if (E) { E.visible = (this.rain || 0) < 0.5 && u.camD < 40; if (E.visible) E.scale.setScalar(0.8 + Math.sin(this.time * 13 + u.id) * 0.2); }
  }

  // 弓：番える → 打ち起こし（弓を頭の上へ）→ 引き分け（押し開いて下ろす）→ 会（狙う）→ 離れ（弦音）→ 残心
  poseBow(u, dt) {
    const h = u.hand, w = u.wpn, oy = u.mounted ? RIDE.y : 0;
    const a = u.atk && u.atk.bow ? u.atk : null;
    let ph = 'rest', k = 0;
    if (a) {
      const e = a.dur - a.t;
      if (e < 0.8) { ph = 'nock'; k = e / 0.8; } else if (e < 1.3) { ph = 'raise'; k = (e - 0.8) / 0.5; } else if (e < 2.0) { ph = 'draw'; k = (e - 1.3) / 0.7; } else { ph = 'kai'; k = 1; }
    } else if (u.relT > 0) { ph = 'zanshin'; k = 1 - u.relT / 0.55; }
    const Q = BOW_POSE;
    let P, draw = 0;
    if (ph === 'nock') P = lerpPose(Q.rest, Q.nock, Math.min(1, k * 1.5));
    else if (ph === 'raise') { P = lerpPose(Q.nock, Q.raise, k * (2 - k)); draw = 0.08 * k; }
    else if (ph === 'draw') { const e = k * k * (3 - 2 * k); P = lerpPose(Q.raise, Q.kai, e); draw = 0.08 + 0.92 * e; }
    else if (ph === 'kai') { P = Q.kai.slice(); draw = 1; P[1] += Math.sin(this.time * 9 + u.id) * 0.002; }
    else if (ph === 'zanshin') P = lerpPose(Q.kai, Q.rest, Math.max(0, k - 0.5) * 2);
    else if (u.cheer > 0) { ph = 'cheer'; P = [-0.12, 1.86 + Math.abs(Math.sin(this.time * 6)) * 0.08, 0.2, 0.15, 0]; }   // 号令への「応」・勝鬨：弓を高く掲げる
    else P = Q.rest;
    // 遠い的へは弓を上へ傾けて射上げる
    const elev = ph === 'draw' || ph === 'kai' ? (u.bowElev || 0) * (ph === 'kai' ? 1 : k) : 0;
    const s = u.bpr || (u.bpr = P.slice());
    const kk = Math.min(1, dt * 14);
    for (let i = 0; i < 5; i++) s[i] += (P[i] - s[i]) * kk;
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3] - elev, s[4], 0);
    // 左の肩を的へ向けるように、上体を右へひねる
    if (ph === 'raise' || ph === 'draw' || ph === 'kai') u.body.rotation.y = 0.45 * (ph === 'raise' ? k : 1);
    // 弦を引く所（弓の手の座標）と、右手の置き所（体の外の座標）
    const B = w && w.userData.bow;
    u.bowPh = ph; u.bowDraw = draw;
    if (!B) return;
    const nock = _nk.set(0.02, 0.015, -0.16 - 0.72 * draw);
    const strung = ph === 'nock' ? k > 0.55 : ph === 'raise' || ph === 'draw' || ph === 'kai';
    setBowDraw(w, draw, ph === 'rest' || ph === 'zanshin' || (ph === 'nock' && k < 0.55) ? null : nock);
    B.ar.visible = strung;
    if (strung) { B.ar.position.set(nock.x, nock.y, nock.z + 0.9); B.ar.rotation.set(0, 0, 0); }
    // 右手：番える時は弦に、引く時は引いた弦と一緒に、離れでは後ろへ開く、ふだんは腰の横
    h.updateMatrix();
    const R = u.bowR || (u.bowR = new THREE.Vector3());
    if (ph === 'zanshin') R.set(0.42, 1.45 + oy, -0.18);
    else if (ph === 'rest' || (ph === 'nock' && k < 0.35)) R.set(0.28, 0.95 + oy, 0.12);
    else R.copy(nock).applyMatrix4(h.matrix);
  }

  // 死：膝から力が抜けて崩れる・後ろへ倒れる・前へ倒れる・横へ倒れる・馬から落ちる
  animDeath(u, dt, near) {
    const m = u.mesh, D = u.death;
    // 最後のコマは DEATH_END ちょうどの姿勢にして、その後は動かさない（humans.js も同じ時に骨を固める）
    D.t = Math.min(DEATH_END, D.t + dt); u.deadT += dt;
    const t = D.t;
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const fall = (x) => { x = Math.min(1, Math.max(0, x)); return x * x; };   // 重さで倒れる（だんだん速く）
    const lie = Math.PI / 2 * 0.96;
    let rx = 0, rz = 0, dy = 0, bodyY = 0, bodyX = 0, kneel = 0, ox = 0, oz = 0, b = 0;
    if (D.kind === 'crumple') {
      const a = ease(t / 0.4); b = fall((t - 0.3) / 0.55);
      kneel = a * (1 - b); bodyY = -0.42 * a * (1 - b); bodyX = 0.45 * a * (1 - b);
      if (D.fwd) rx = lie * b; else rz = -D.side * lie * b;
    } else if (D.kind === 'back') {
      const a = ease(t / 0.22); b = fall((t - 0.16) / 0.6);
      rx = -0.18 * a * (1 - b) - lie * b; kneel = 0.35 * a * (1 - b); bodyX = -0.2 * a * (1 - b);
    } else if (D.kind === 'forward') {
      const a = ease(t / 0.2); b = fall((t - 0.12) / 0.55);
      kneel = 0.6 * a * (1 - b); bodyY = -0.2 * a * (1 - b); rx = lie * b; bodyX = 0.3 * a * (1 - b);
    } else if (D.kind === 'side') {
      const a = ease(t / 0.25); b = fall((t - 0.15) / 0.6);
      kneel = 0.5 * a * (1 - b); bodyY = -0.25 * a * (1 - b); rz = -D.side * lie * b;
    } else if (D.kind === 'unhorse') {
      // 鞍の高さから、横へずり落ちる
      const tt = Math.min(t, 0.62);
      dy = Math.max(0, RIDE.y + 0.2 + 0.6 * tt - 4.9 * tt * tt);
      b = ease(t / 0.55);
      rz = -D.side * lie * b; kneel = 0.4 * (1 - b);
      const s = Math.min(t, 0.6) * (0.9 + (D.vx || 0) * 0.2);
      ox = Math.cos(u.heading) * D.side * s; oz = -Math.sin(u.heading) * D.side * s;
    }
    // 倒れ切った時の小さな弾み
    if (b >= 1 && D.kind !== 'unhorse') { const tb = D.tb ?? (D.tb = t); const e = Math.exp(-(t - tb) * 9) * Math.sin((t - tb) * 22) * 0.04; if (rx) rx -= Math.sign(rx) * e; if (rz) rz -= Math.sign(rz) * e; }
    m.rotation.order = 'YXZ';
    m.rotation.set(rx, u.heading, rz);
    // 寝るほど地面の傾きに沿わせる（坂で頭がめり込んだり、足が浮いたりしないよう）。傾きは体の真ん中の下で測る
    const lk = Math.max(Math.abs(Math.sin(rx)), Math.abs(Math.sin(rz)));
    const W = this.world;
    const gx = u.pos.x + ox, gz = u.pos.z + oz, gy = ox || oz ? W.heightAt(gx, gz) : u.pos.y;
    if (lk > 0.01) {
      _dUp.set(0, 1, 0).applyQuaternion(m.quaternion);
      const cx = gx + _dUp.x * 0.85, cz = gz + _dUp.z * 0.85, e = 0.6;
      _dN.set(W.heightAt(cx - e, cz) - W.heightAt(cx + e, cz), 2 * e, W.heightAt(cx, cz - e) - W.heightAt(cx, cz + e)).normalize();
      _dQ.setFromUnitVectors(_dUp.set(0, 1, 0), _dN);
      _dQ.slerp(_dI, 1 - lk);
      m.quaternion.premultiply(_dQ);
    }
    // 寝た体が地面に沈まないよう、倒れた分だけ持ち上げる（地面の向きに）
    const lift = 0.11 * lk;
    m.position.set(gx + (lk > 0.01 ? _dN.x * lift : 0), gy + dy + (lk > 0.01 ? _dN.y * lift : lift), gz + (lk > 0.01 ? _dN.z * lift : 0));
    u.body.position.y = bodyY; u.body.rotation.set(bodyX, 0, 0);
    if (u.legL) { u.legL.rotation.x = -1.3 * kneel; u.legR.rotation.x = -0.9 * kneel; }
    if (u.shinL) { u.shinL.rotation.x = 2.0 * kneel; u.shinR.rotation.x = 1.8 * kneel; }
    // 骨の入った人（humans.js）は u.deathKneel の量で膝を折る（有り無しで切り替えると体が跳ぶ）
    u.stagger = 0; u.deathKneel = kneel;
    // 力が抜けた手から武器が落ちる
    if (t > 0.35 && !D.dropped) { D.dropped = true; this.dropWeapon(u); u.wpnKind = 'none'; }
    if (near && u.armR) poseArms(u, 0);
    // 寝た体は棒のようにしない：脚を曲げて開き、腕を投げ出す（人ごとに違う形）
    if (b > 0 && u.armR && u.legL) {
      const r = (u.id * 0.618) % 1;
      // 横向きに寝る時は脚を重ね、腕を体の前へ（開くと下の脚・腕が地面にめり込み、上の腕が宙に立つ）。humans.js の骨の体も同じ形
      const sideLie = D.kind === 'side' || D.kind === 'unhorse' || (D.kind === 'crumple' && !D.fwd);
      u.legL.rotation.x = -1.3 * kneel - (0.3 + 0.6 * r) * b; u.legL.rotation.z = sideLie ? 0 : (0.1 + 0.25 * (1 - r)) * b; u.legR.rotation.z = sideLie ? 0 : -(0.08 + 0.2 * r) * b;
      if (u.shinL) u.shinL.rotation.x = 2.0 * kneel + (0.5 + 0.9 * r) * b;
      if (sideLie) { aimArm(u.armR, 0.22, 1.37 - 0.55, 0.32 * b); aimArm(u.armL, -0.22, 1.37 - 0.5, 0.38 * b); }
      else { aimArm(u.armR, 0.27 + (0.3 + 0.2 * r) * b, 1.37 - 0.5 + 0.35 * r * b, 0.15 * b); aimArm(u.armL, -0.27 - (0.25 + 0.25 * (1 - r)) * b, 1.37 - 0.5 + 0.4 * (1 - r) * b, 0.2 * r * b); }
    }
    // 倒れた体の下に、ゆっくり広がる血だまり
    // 陣笠は倒れた拍子に頭から落ち、頭の先の地面に転がる（付けたままだと寝た体の笠の縁が地面にめり込む）
    if (t > 0.9 && !D.hat) { D.hat = true; this.dropHat(u); }
    if (t > 0.9 && !D.pool) {
      D.pool = true;
      const f = D.kind === 'side' || (D.kind === 'crumple' && !D.fwd) || D.kind === 'unhorse' ? 0 : rx > 0 ? 0.85 : -0.85;
      const sd = f ? 0 : D.side * 0.85;
      const px = m.position.x + Math.sin(u.heading) * f + Math.cos(u.heading) * sd, pz = m.position.z + Math.cos(u.heading) * f - Math.sin(u.heading) * sd;
      u.stain = this.stain(px, pz, 0.6 + Math.random() * 0.3, 150, 1);
    }
  }

  update(dt, focus, cam, frustum) {
    FLAG_T.value += dt;
    this.time += dt;
    this.rebuildGrid();
    this.wind = (this.wind || 0.6) + Math.sin(this.time * 0.05) * 0.002;
    // プレイヤーを狙って構えている敵（予備動作の表示と同時攻撃数の制限に使う）
    this.threats = [];
    for (const u of this.units) if (u.alive && ((u.atk && u.atk.target.isPlayer && !u.atk.bow) || (u.charging && u.cv === 'in' && u.target && u.target.isPlayer && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 10))) this.threats.push(u);
    this.playerAttackers = this.threats.length;
    this.updateGroups(dt);
    this.lodT -= dt;
    const doLod = this.lodT <= 0;
    if (doLod) this.lodT = 0.4;
    for (const u of this.units) {
      if (u.hitFlash > 0) u.hitFlash -= dt;
      u.lastHitT += dt;
      const dist = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
      const near = dist < 70;
      u.camD = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : dist;
      if (doLod && u.alive) {
        u.legL.visible = u.legR.visible = near;
        if (u.flag) u.flag.visible = dist < 110;
        u.body.castShadow = dist < (this.shadowDist ?? 34) && this.shadows !== false;
      }
      // 画面の外にいる兵は手足の動きを省く
      if (frustum && u.alive) { this.tmpSphere.center.set(u.pos.x, u.pos.y + 1, u.pos.z); u.offscreen = !frustum.intersectsSphere(this.tmpSphere); }
      // カメラのすぐ前にいる兵は消して視界を確保する
      if (cam && u.alive && !u.isPlayer) {
        const cd = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        u.mesh.visible = !(cd < 2.2 && Math.abs(u.pos.y + 1.2 - cam.y) < 2);
        // 得物はカメラのすぐ前（体ごと消す 2.2m）まで見せる。隠すと手だけが宙を握って見える（鉄砲・弓・刀は近くても隠さない）
        if (u.wpn && !(u.human && u.human.cmdHid)) u.wpn.visible = dist < 95 && (cd > 2.2 || (u.wpnKind || u.lookWeapon) !== 'spear');
        // 指物がカメラと自分の間にある・カメラのすぐ前にあるときは透かす（自分の組の旗は透かさない）
        if (u.flag) {
          let fade = false;
          if (cd < 9 && !u.isSub) {
            const P = this.playerUnit;
            if (cd < 3.2) fade = true;
            else if (P) {
              // カメラの前方、画面の中ほどにかかる旗（自分より手前か、自分のすぐ先まで）
              const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1;
              const vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
              const along = (vx * ax + vz * az) / L;
              const side = Math.abs(vx * az - vz * ax) / L;
              fade = along > 0 && along < L + 5 && side < 1.2 + along * 0.45;
            }
          }
          if (!u.flagMat) u.flagMat = u.flag.material;
          if (fade !== !!u.flagFaded) { u.flagFaded = fade; u.flag.material = fade ? fadedFlag(u.flagMat) : u.flagMat; }
        }
      }
      if (!u.alive || u.isPlayer || u.type === 'dummy') { this.animate(u, dt, near); continue; }
      if (u.confused > 0) u.confused -= dt;
      u.cd -= dt;
      // 込め直しは足を止めてでないとできない（歩いている間は進まない）
      if (u.reload) { if (u.moving > 0.5 || u.fleeing) u.cd += dt; else u.reload.t += dt; if (u.cd <= 0) u.reload = null; }
      // AI の間引き（遠い兵ほど判断間隔を長くする）
      u.aiT -= dt;
      if (u.aiT <= 0) {
        this.think(u);
        u.aiT = (dist < 30 ? 0.18 : dist < 80 ? 0.4 : 0.8) * (0.8 + Math.random() * 0.4);
      }
      if (u.target && (!u.target.alive || (u.target.team === u.team && !u.target.isStruct))) { u.target = null; u.aiT = 0; }
      this.act(u, dt, near);
      // 乾いた日に隊が動けば土ぼこりが立つ（近くの兵だけ）
      if (dist < 55 && (u.mounted ? 1 : 0.18) * Math.hypot(u.vel.x, u.vel.z) * dt > Math.random() * 1.2) this.world.puff(u.pos.x, u.pos.z, u.mounted ? 2 : 1);
      u.pos.x += u.vel.x * dt;
      u.pos.z += u.vel.z * dt;
      this.collide(u);
      const lim = 176;
      // 逃げる兵は地図の端か、戦ごとに決めた「遠景の大軍の手前」（world.fleeOut）で消す（大軍の塊の中を歩かせない）
      if (u.fleeing && (Math.abs(u.pos.x) > lim || Math.abs(u.pos.z) > lim || (this.world.def.fleeOut && this.world.def.fleeOut(u.pos.x, u.pos.z, u.team)))) { this.despawn(u); continue; }
      u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x));
      u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
      if (this.world.def.water && u.pos.x > this.world.def.water.x - 1) u.pos.x = this.world.def.water.x - 1;
      u.pos.y = this.world.heightAt(u.pos.x, u.pos.z);
      this.animate(u, dt, near);
    }
    this.updateImpostors(cam);
    this.updateArrows(dt);
    this.updateSmoke(dt);
    this.updateParticles(dt);
    this.updateStains(dt);
    this.updateLooseHorses(dt);
  }

  // 遠い兵をまとめて描く（IMP）。甲冑の色と旗ごとに、軽い兵の形の束を一つ持つ
  updateImpostors(cam) {
    if (!this.world.makeImpostor) return;
    const I = this.imp || (this.imp = new Map());
    if (cam) this.impCam = { x: cam.x, z: cam.z };
    for (const st of I.values()) st.n = 0;
    const KIND = { ashigaru: 0, gun: 1, bow: 2, samurai: 3 };
    for (const u of this.units) {
      const k = KIND[u.type];
      const far = IMP.on && u.alive && !u.isPlayer && !u.isSub && !u.mounted && k !== undefined && !u.name && !(u.fall > 0) && u.look
        && u.camD > (u.imp ? IMP.far - 6 : IMP.far);
      if (!far) { if (u.imp) { u.imp = false; if (u.mesh && !u.gone) u.mesh.visible = true; } continue; }
      u.imp = true;
      u.mesh.visible = false;
      const key = u.look.armor + '|' + (u.look.flag || '');
      let st = I.get(key);
      if (!st) {
        st = { im: this.world.makeImpostor(u.look.armor, u.look.flag || 'tokugawa', 160), n: 0 }; I.set(key, st);
        // 兵の更新なしにカメラだけ大きく動いた（写真モード）：そのカメラからの遠さでまとめ直す
        st.im.onCam = (p) => {
          const c = this.impCam;
          if (c && Math.hypot(p.x - c.x, p.z - c.z) < 8) return;
          for (const q of this.units) q.camD = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
          this.updateImpostors(p);
        };
      }
      if (st.n >= st.im.cap) { u.imp = false; u.mesh.visible = true; continue; }
      const helm = u.look.hat && u.look.hat.startsWith('kabuto') ? 1 : 0;
      st.im.put(st.n++, u.pos.x, u.pos.z, u.heading, k, helm, k === 0 ? 1.25 : 0, u.look.flag ? 1 : 0, (u.id * 0.618) % 1);
    }
    for (const st of I.values()) st.im.commit(st.n);
  }

  // 勝鬨：その陣営の兵が槍を掲げる
  celebrate(team) {
    for (const u of this.units) if (u.alive && u.team === team && !u.isPlayer) u.cheer = 3 + Math.random();
  }

  despawn(u) {
    u.alive = false;
    u.gone = true;
    this.scene.remove(u.mesh);
  }
}

// 技の長さ（秒）と、穂先・刃が届く時（割合）
const SWING = { thrust: [0.22, 0.5], charge: [0.2, 0], slam: [0.34, 0.72], sweep: [0.34, 0.55], kesa: [0.26, 0.55], gyaku: [0.26, 0.55], yoko: [0.26, 0.5], tsuki: [0.22, 0.5], butt: [0.24, 0.55] };
// 刀の構え [x, y, z, 上下, 左右, 刃の向き]（手の置き所。体の外の座標）
const SW_POSE = {
  sage: [0.28, 1.0, 0.25, 0.5, 0, 0], chudan: [0.12, 1.12, 0.32, -0.45, -0.08, 0],
  kesa0: [0.3, 1.62, 0.02, -2.2, 0.35, -0.3], kesa1: [-0.12, 0.95, 0.42, 0.75, -0.55, -0.5],
  gyaku0: [-0.12, 0.92, 0.2, 0.7, -0.7, 2.6], gyaku1: [0.3, 1.58, 0.38, -1.4, 0.55, 2.6],
  yoko0: [0.38, 1.3, 0.0, -0.15, 1.5, -1.57], yoko1: [-0.25, 1.25, 0.35, -0.1, -1.2, -1.57],
  tsuki0: [0.18, 1.15, -0.02, -0.08, 0, 1.57], tsuki1: [0.08, 1.25, 0.72, -0.05, -0.05, 1.57],
  uke: [0.12, 1.45, 0.3, -0.35, -1.25, 0], cheer: [0.3, 1.9, 0.1, -1.6, 0, 0],
};
// 鉄砲の構え [x, y, z, 上下]
const GUN_POSE = {
  carry: [0.3, 1.08, 0.18, -0.8], ready: [0.22, 1.1, 0.25, -0.35], kiri: [0.2, 1.14, 0.26, -0.12], aim: [0.1, 1.45, 0.25, -0.02], fire: [0.1, 1.45, 0.25, -0.02],
  lower: [0.24, 0.74, 0.34, -1.45], powder: [0.24, 0.74, 0.34, -1.45], ball: [0.24, 0.74, 0.34, -1.45], ram: [0.24, 0.74, 0.34, -1.45], prime: [0.18, 1.02, 0.3, -0.12], match: [0.18, 1.02, 0.3, -0.12],
};
// 込め直しの手順と、それぞれにかかる割合（合わせて 1）
const RELOAD = [['lower', 0.06], ['powder', 0.16], ['ball', 0.1], ['ram', 0.34], ['prime', 0.22], ['match', 0.12]];
// 弓の構え [x, y, z, 上下, 左右]（弓を持つ左手）
const BOW_POSE = { rest: [-0.28, 1.0, 0.18, 0.12, 0], nock: [-0.05, 1.08, 0.36, 0.05, -0.2], raise: [0.02, 1.76, 0.3, 0, -0.25], kai: [-0.02, 1.5, 0.62, 0, -0.3] };
const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const _nk = new THREE.Vector3();
// 血の見せ方（設定）：2 あり・1 控えめ・0 なし
export function bloodLv() { const b = S.blood; return b === 'off' ? 0 : b === 'low' ? 1 : 2; }
// 粒の色
const PCOL = { blood: [0.3, 0.06, 0.045], dust: [0.42, 0.37, 0.29], cloth: [0.36, 0.34, 0.3], wood: [0.45, 0.36, 0.24] };
// 染みの形：縁の不揃いな円を三通り
const STAIN_GEOS = [0, 1, 2].map((s) => {
  const r = rng(71 + s * 13), n = 14, pos = [0, 0, 0], idx = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 0.7 + r() * 0.4; pos.push(Math.cos(a) * k, 0, Math.sin(a) * k); }
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
});
// 誤差関数（弾の当たる見込み）
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
// 線分 a→b が柵の線 s と交わる所（a→b の割合 0..1）。交わらなければ -1
function segHit(ax, az, bx, bz, s) {
  const [cx, cz, dx, dz] = s;
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return -1;
  const qx = cx - ax, qz = cz - az;
  const u = (qx * sZ - qz * sX) / den, v = (qx * rZ - qz * rX) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? u : -1;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distToSeg(x, z, s) {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

// 空馬の元の持ち主の家の名（「武田の馬を分捕った」の札に使う）
const HOUSE_NAME = { tokugawa: '徳川', takeda: '武田', akazonae: '山県の赤備え', okudaira: '奥平', oda: '織田', imagawa: '今川', saito: '斎藤' };
