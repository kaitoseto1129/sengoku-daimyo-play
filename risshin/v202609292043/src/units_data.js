// 兵種（TYPES）・名のある武将（GENERALS）・肌の色・家ごとの見た目（FACTION）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import * as THREE from 'three';

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
  // 今川義元（永禄三年 41）：黒漆の胴に赤の威し、赤地錦の直垂（陣羽織の代わり）。公家風のふくよかな顔
  '今川義元': { armor: 0x221816, lace: 0x9a2e20, hat: 'kabuto_m', haori: 0x8a2418, horo: 0, mon: 'imagawa', haoriMonCol: 0xc9a24a, skin: 0xc4a07c, tack: 0x6a1c14,
    face: { w: 1.12, jaw: 1.2, chin: 0.9, cheek: 1.1, gaunt: 0.2, brow: 0.9, nose: 1.0, nw: 1.1, eye: 1.0, t: 3, hair: 0x15110d, age: 41, esp: 1.02, beard: { mus: 0.5, musW: 0.9, musH: 0.5, droop: 0.2, goat: 0.3, goatW: 0.5, side: 0, stub: 0.2 } } },
  // 織田家編の上役と、敵の侍大将（顔は兵と同じ作りで、兜・甲冑・陣羽織で見分ける。家紋は隊の家のまま）
  '柴田勝家': { armor: 0x1c1a1a, lace: 0x5a2a1c, hat: 'kabuto_g', haori: 0x3a2a1a, horo: 0, mon: 'kari', haoriMonCol: 0xe6dfcf, cmd: 'bold', skin: 0xa87f5c, tack: 0x2a2420,
    face: { w: 1.1, jaw: 1.35, chin: 0.9, cheek: 1.3, gaunt: 0.3, brow: 1.45, nose: 0.95, nw: 1.25, eye: 1.3, t: 7, hair: 0x2a2622, age: 48, esp: 0.96, beard: { mus: 1, musW: 1.1, musH: 1.1, droop: 0.6, goat: 0.9, goatW: 1.1, side: 0.8, stub: 1.3 } } },
  '森可成': { armor: 0x24221f, lace: 0x2e3a52, hat: 'kabuto_s', haori: 0x2e3a52, horo: 0, mon: 'tsuru', haoriMonCol: 0xe6dfcf, cmd: 'bold', skin: 0xa87f5c, tack: 0x2a2a38,
    face: { w: 1.0, jaw: 1.1, chin: 1.0, cheek: 1.2, gaunt: 0.7, brow: 1.25, nose: 1.05, nw: 1.05, eye: 1.2, t: 5, hair: 0x2a2622, age: 47, beard: { mus: 0.75, musW: 0.95, droop: 0.5, goat: 0.6, side: 0.4, stub: 1.0 } } },
  '大沢勘兵衛': { armor: 0x2a2420, lace: 0x3c5a8a, hat: 'kabuto_b', haori: 0x4a3a22, horo: 0, skin: 0x9c7453,
    face: { w: 1.05, jaw: 1.2, chin: 0.9, cheek: 1.15, gaunt: 0.4, brow: 1.3, nose: 0.9, nw: 1.2, eye: 1.25, t: 5, hair: 0x15110d, age: 40, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.5, side: 0.5, stub: 1.1 } } },
  '磯野員昌': { armor: 0x2a1c18, lace: 0x7a5a2a, hat: 'kabuto_t', haori: 0x5a3a1a, horo: 0, skin: 0x9c7453, tack: 0x4a2a1c,
    face: { w: 1.08, jaw: 1.25, chin: 0.95, cheek: 1.2, gaunt: 0.4, brow: 1.35, nose: 1.0, nw: 1.2, eye: 1.3, t: 4, hair: 0x15110d, age: 47, beard: { mus: 0.85, musW: 1.05, droop: 0.4, goat: 0.5, side: 0.3, stub: 1.0 } } },
  '遠藤直経': { armor: 0x1c1a1a, lace: 0x6a1c14, hat: 'kabuto_namazu', haori: 0x2a2a2a, horo: 0, skin: 0xa87f5c,
    face: { w: 0.95, jaw: 1.0, chin: 1.1, cheek: 1.3, gaunt: 1.1, brow: 1.2, nose: 1.1, nw: 0.95, eye: 1.3, t: 3, hair: 0x15110d, age: 34, beard: { mus: 0.5, musW: 0.8, droop: 0.3, goat: 0.2, side: 0, stub: 0.8 } } },
  '朝倉景健': { armor: 0x24221f, lace: 0x3a5a3a, hat: 'kabuto_w', haori: 0x3a4a2a, horo: 0, skin: 0xb88e6a, tack: 0x2a3a2a,
    face: { w: 1.02, jaw: 0.9, chin: 1.0, cheek: 1.0, gaunt: 0.3, brow: 1.0, nose: 1.0, nw: 1.05, eye: 1.05, t: 3, hair: 0x15110d, age: 34, beard: { mus: 0.4, musW: 0.8, musH: 0.5, droop: 0.2, goat: 0.2, side: 0, stub: 0.4 } } },
  '日比野下野守': { armor: 0x22241e, lace: 0x6b6a4a, hat: 'kabuto_f', haori: 0x3a4632, horo: 0, skin: 0xa87f5c,
    face: { w: 1.04, jaw: 1.15, chin: 0.9, cheek: 1.2, gaunt: 0.6, brow: 1.3, nose: 0.95, nw: 1.15, eye: 1.25, t: 6, hair: 0x4a4640, age: 50, beard: { mus: 0.7, musW: 0.95, droop: 0.6, goat: 0.6, side: 0.2, stub: 1.0 } } },
  '長井甲斐守': { armor: 0x22241e, lace: 0x5a5a3a, hat: 'kabuto_m', haori: 0x4a3a22, horo: 0, skin: 0x9c7453,
    face: { w: 0.98, jaw: 1.05, chin: 1.0, cheek: 1.25, gaunt: 0.9, brow: 1.2, nose: 1.05, nw: 1.0, eye: 1.2, t: 4, hair: 0x2a2622, age: 42, beard: { mus: 0.6, musW: 0.85, droop: 0.45, goat: 0.4, side: 0.1, stub: 0.9 } } },
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
  '前田利家': { armor: 0x1c1a1a, lace: 0x9a7a3a, hat: 'kabuto_namazu', hatFix: 1, haori: 0x2a2622, horo: 0x9e2a1e, mon: 'maeda', cmd: 'bold', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a2420,
    face: { w: 0.98, jaw: 1.05, chin: 1.05, cheek: 1.15, gaunt: 0.6, brow: 1.2, nose: 1.1, nw: 1.0, eye: 1.1, t: 4, hair: 0x2a2622, age: 23, beard: { mus: 0.35, musW: 0.8, musH: 0.7, droop: 0.3, goat: 0.15, side: 0, stub: 0.5 } } },
  // 織田方の宿老・部将（夜の計画 A1）：兜の立物・威の色・陣羽織の色を人ごとに変え、顔も人ごとに（のっぺりした同じ顔にしない）
  '羽柴秀吉': { armor: 0x2a2420, lace: 0x9a7a3a, hat: 'kabuto_bari', hatFix: 1, haori: 0x8a5a1c, horo: 0, mon: 'toyotomi', cmd: 'lively', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x6a4a1c,
    face: { w: 0.9, jaw: 0.8, chin: 1.2, cheek: 1.4, gaunt: 1.3, brow: 1.1, nose: 1.0, nw: 1.05, eye: 1.25, t: 4, hair: 0x2a2622, age: 43, esp: 1.06, beard: { mus: 0.45, musW: 0.7, musH: 0.6, droop: 0.3, goat: 0.25, goatW: 0.5, side: 0, stub: 0.5 } } },
  '丹羽長秀': { armor: 0x22241e, lace: 0x3a5a3a, hat: 'kabuto_w', haori: 0x2e3a2a, horo: 0, mon: 'sujikai', cmd: 'calm', haoriMonCol: 0xe6dfcf, skin: 0xb08664, tack: 0x2a3a2a,
    face: { w: 1.0, jaw: 1.0, chin: 1.05, cheek: 1.05, gaunt: 0.5, brow: 1.0, nose: 1.05, nw: 1.0, eye: 1.05, t: 3, hair: 0x15110d, age: 40, beard: { mus: 0.35, musW: 0.75, musH: 0.6, droop: 0.2, goat: 0.1, side: 0, stub: 0.4 } } },
  '佐久間信盛': { armor: 0x2a2420, lace: 0x5a4630, hat: 'kabuto_g', haori: 0x4a3a22, horo: 0, mon: 'none', skin: 0xa87f5c, tack: 0x3a2a1c,
    face: { w: 1.1, jaw: 1.2, chin: 0.9, cheek: 1.0, gaunt: 0.1, brow: 1.0, nose: 0.95, nw: 1.15, eye: 1.1, t: 6, hair: 0x4a4640, age: 49, beard: { mus: 0.7, musW: 0.95, droop: 0.6, goat: 0.6, goatW: 0.8, side: 0.2, stub: 0.9 } } },
  '滝川一益': { armor: 0x1c1a1a, lace: 0x6a6a6a, hat: 'kabuto_f', haori: 0x2a2a32, horo: 0, mon: 'takigawa', cmd: 'calm', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x2a2a30,
    face: { w: 0.96, jaw: 1.05, chin: 1.0, cheek: 1.3, gaunt: 1.1, brow: 1.3, nose: 1.1, nw: 1.0, eye: 1.3, t: 5, hair: 0x2a2622, age: 50, beard: { mus: 0.6, musW: 0.9, droop: 0.5, goat: 0.4, side: 0.3, stub: 1.0 } } },
  '織田信忠': { armor: 0x1c1a1a, lace: 0x3c5a8a, hat: 'kabuto_s', haori: 0x6a1a14, horo: 0, mon: 'oda', haoriMonCol: 0xc9a24a, skin: 0xc09a74, tack: 0x2a2a30,
    face: { w: 0.93, jaw: 0.85, chin: 1.1, cheek: 1.0, gaunt: 0.6, brow: 1.1, nose: 1.15, nw: 0.92, eye: 1.15, t: 1, hair: 0x15110d, age: 22, beard: { mus: 0.15, musW: 0.6, musH: 0.5, goat: 0, side: 0, stub: 0.35 } } },
  '蜂須賀正勝': { armor: 0x2a1c18, lace: 0x7a2a1c, hat: 'kabuto_m', haori: 0x3a2a1a, horo: 0, mon: 'none', skin: 0x8e6446, tack: 0x4a2a1c,
    face: { w: 1.06, jaw: 1.3, chin: 0.85, cheek: 1.25, gaunt: 0.5, brow: 1.35, nose: 0.9, nw: 1.2, eye: 1.3, t: 7, hair: 0x3a3632, age: 52, beard: { mus: 0.9, musW: 1.05, droop: 0.6, goat: 0.8, side: 0.7, stub: 1.3 } } },
  '筒井順慶': { armor: 0x24221f, lace: 0x5a3a5a, hat: 'kabuto_w', haori: 0x3a2a3a, horo: 0, mon: 'igeta', haoriMonCol: 0xe6dfcf, skin: 0xb88e6a, tack: 0x3a2a3a,
    face: { w: 1.0, jaw: 0.95, chin: 1.0, cheek: 1.0, gaunt: 0.4, brow: 0.95, nose: 1.0, nw: 1.05, eye: 1.0, t: 1, hair: 0x15110d, age: 28, beard: { mus: 0.1, musW: 0.5, goat: 0, side: 0, stub: 0.3 } } },
  '河尻秀隆': { armor: 0x1c1a1a, lace: 0x2a2a2a, hat: 'kabuto_m', haori: 0x2a2622, horo: 0x2a2a2a, mon: 'none', skin: 0xa87f5c, tack: 0x2a2420,
    face: { w: 1.0, jaw: 1.1, chin: 0.95, cheek: 1.2, gaunt: 0.8, brow: 1.2, nose: 1.0, nw: 1.05, eye: 1.2, t: 6, hair: 0x4a4640, age: 55, beard: { mus: 0.65, musW: 0.9, droop: 0.55, goat: 0.55, side: 0.2, stub: 0.9 } } },
  '池田恒興': { armor: 0x24221f, lace: 0x2e3a52, hat: 'kabuto_b', haori: 0x2e3a52, horo: 0, mon: 'ageha', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a2a38,
    face: { w: 1.04, jaw: 1.1, chin: 0.95, cheek: 1.1, gaunt: 0.4, brow: 1.15, nose: 0.95, nw: 1.1, eye: 1.1, t: 4, hair: 0x15110d, age: 38, beard: { mus: 0.55, musW: 0.9, droop: 0.4, goat: 0.4, side: 0.1, stub: 0.7 } } },
  '佐々成政': { armor: 0x1c1a1a, lace: 0x9a2e20, hat: 'kabuto_g', haori: 0x2a2a2a, horo: 0x1a1a1a, mon: 'shuro', haoriMonCol: 0xe6dfcf, cmd: 'bold', skin: 0xa87f5c, tack: 0x2a2420,
    face: { w: 0.97, jaw: 1.05, chin: 1.0, cheek: 1.25, gaunt: 0.9, brow: 1.3, nose: 1.05, nw: 1.0, eye: 1.25, t: 4, hair: 0x15110d, age: 38, beard: { mus: 0.6, musW: 0.9, droop: 0.45, goat: 0.3, side: 0, stub: 0.8 } } },
  '黒田官兵衛': { armor: 0x151312, lace: 0x3a3a3a, hat: 'kabuto_m', haori: 0x2a2a2a, horo: 0, mon: 'kuroda', haoriMonCol: 0xe6dfcf, skin: 0xb08664, tack: 0x2a2a2a,
    face: { w: 0.95, jaw: 0.9, chin: 1.1, cheek: 1.15, gaunt: 0.9, brow: 1.1, nose: 1.1, nw: 0.95, eye: 1.2, t: 3, hair: 0x15110d, age: 33, beard: { mus: 0.4, musW: 0.75, musH: 0.6, droop: 0.25, goat: 0.2, side: 0, stub: 0.5 } } },
  // 敵方の武将（夜の計画 A1）：織田方と同じ作り込み。家ごとの威の色・陣羽織・兜の立物と、人ごとの顔
  '斎藤龍興': { armor: 0x22241e, lace: 0x6a5a8a, hat: 'kabuto_w', haori: 0x4a3a5a, horo: 0, mon: 'saito', haoriMonCol: 0xe6dfcf, skin: 0xc09a74, tack: 0x3a2a4a,
    face: { w: 0.94, jaw: 0.85, chin: 1.05, cheek: 0.95, gaunt: 0.4, brow: 0.95, nose: 1.05, nw: 0.95, eye: 1.0, t: 0, hair: 0x15110d, age: 20, beard: { mus: 0.05, musW: 0.5, goat: 0, side: 0, stub: 0.25 } } },
  '稲葉良通': { armor: 0x24221f, lace: 0x3a5a3a, hat: 'kabuto_m', haori: 0x3a4632, horo: 0, mon: 'inaba', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a3a2a,
    face: { w: 1.02, jaw: 1.15, chin: 0.95, cheek: 1.25, gaunt: 0.8, brow: 1.3, nose: 1.0, nw: 1.1, eye: 1.25, t: 6, hair: 0x4a4640, age: 52, beard: { mus: 0.7, musW: 0.95, droop: 0.6, goat: 0.65, side: 0.3, stub: 1.0 } } },
  '山崎吉家': { armor: 0x24221f, lace: 0x3a5a3a, hat: 'kabuto_f', haori: 0x3a4a2a, horo: 0, mon: 'asakura', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a3a2a,
    face: { w: 1.04, jaw: 1.2, chin: 0.9, cheek: 1.2, gaunt: 0.6, brow: 1.3, nose: 0.95, nw: 1.15, eye: 1.25, t: 5, hair: 0x2a2622, age: 45, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.6, side: 0.5, stub: 1.1 } } },
  '松井宗信': { armor: 0x221816, lace: 0x9a2e20, hat: 'kabuto_w', haori: 0x6a2418, horo: 0, mon: 'imagawa', haoriMonCol: 0xc9a24a, skin: 0xa87f5c, tack: 0x6a1c14,
    face: { w: 1.0, jaw: 1.1, chin: 0.95, cheek: 1.2, gaunt: 0.7, brow: 1.25, nose: 1.0, nw: 1.05, eye: 1.2, t: 4, hair: 0x15110d, age: 40, beard: { mus: 0.65, musW: 0.9, droop: 0.45, goat: 0.45, side: 0.1, stub: 0.9 } } },
  '仁科盛信': { armor: 0x3a2622, lace: 0x9a2e20, hat: 'kabuto_f', haori: 0x2a2622, horo: 0, mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0xb08664, tack: 0x5a1c14,
    face: { w: 0.95, jaw: 0.95, chin: 1.1, cheek: 1.15, gaunt: 0.8, brow: 1.15, nose: 1.1, nw: 0.95, eye: 1.15, t: 1, hair: 0x15110d, age: 26, beard: { mus: 0.2, musW: 0.6, musH: 0.6, goat: 0.05, side: 0, stub: 0.5 } } },
  '今福浄閑': { armor: 0x2a2420, lace: 0x7a2a1c, hat: 'kabuto_m', haori: 0x3a2a1a, horo: 0, mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x4a2a1c,
    face: { w: 1.0, jaw: 1.05, chin: 0.95, cheek: 1.35, gaunt: 1.1, brow: 1.2, nose: 1.0, nw: 1.05, eye: 1.3, t: 7, hair: 0x9a948a, age: 62, beard: { mus: 0.75, musW: 0.9, droop: 0.7, goat: 0.8, side: 0.5, stub: 1.0 } } },
  '土屋昌続': { armor: 0x3a2622, lace: 0x9a2e20, hat: 'kabuto_m', haori: 0x3a2622, horo: 0, mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x5a1c14,
    face: { w: 0.97, jaw: 1.0, chin: 1.05, cheek: 1.15, gaunt: 0.7, brow: 1.2, nose: 1.05, nw: 1.0, eye: 1.15, t: 3, hair: 0x15110d, age: 31, beard: { mus: 0.45, musW: 0.8, musH: 0.6, droop: 0.25, goat: 0.2, side: 0, stub: 0.6 } } },
  '土屋昌恒': { armor: 0x3a2622, lace: 0x9a2e20, hat: 'kabuto_b', haori: 0x2a2622, horo: 0, mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0xb08664, tack: 0x5a1c14,
    face: { w: 0.95, jaw: 0.95, chin: 1.1, cheek: 1.2, gaunt: 0.9, brow: 1.15, nose: 1.1, nw: 0.95, eye: 1.2, t: 1, hair: 0x15110d, age: 27, beard: { mus: 0.25, musW: 0.6, goat: 0.05, side: 0, stub: 0.6 } } },
  '河窪信実': { armor: 0x2a2420, lace: 0x9a2e20, hat: 'kabuto_w', haori: 0x3a2a22, horo: 0, mon: 'takeda', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x5a1c14,
    face: { w: 1.02, jaw: 1.1, chin: 0.95, cheek: 1.2, gaunt: 0.6, brow: 1.25, nose: 1.0, nw: 1.1, eye: 1.2, t: 5, hair: 0x2a2622, age: 45, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.6, side: 0.4, stub: 1.0 } } },
  '島津義弘': { armor: 0x1c1a1a, lace: 0x2a2a2a, hat: 'kabuto_m', haori: 0x2a2a2a, horo: 0, mon: 'shimazu', haoriMonCol: 0xe6dfcf, skin: 0x8e6446, tack: 0x2a2420,
    face: { w: 1.05, jaw: 1.2, chin: 0.9, cheek: 1.4, gaunt: 1.1, brow: 1.4, nose: 1.0, nw: 1.15, eye: 1.35, t: 7, hair: 0x9a948a, age: 66, esp: 0.97, beard: { mus: 0.85, musW: 1.0, droop: 0.7, goat: 0.9, goatW: 0.9, side: 0.6, stub: 1.1 } } },
  '島津豊久': { armor: 0x1c1a1a, lace: 0x2a2a2a, hat: 'kabuto_b', haori: 0x2a2a2a, horo: 0, mon: 'shimazu', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x2a2420,
    face: { w: 0.97, jaw: 1.05, chin: 1.05, cheek: 1.2, gaunt: 0.7, brow: 1.2, nose: 1.05, nw: 1.0, eye: 1.2, t: 3, hair: 0x15110d, age: 31, beard: { mus: 0.5, musW: 0.85, droop: 0.3, goat: 0.25, side: 0, stub: 0.7 } } },
  '平塚為広': { armor: 0x24221f, lace: 0x5a5a3a, hat: 'kabuto_m', haori: 0x3a3a2a, horo: 0, mon: 'none', skin: 0xa87f5c,
    face: { w: 1.0, jaw: 1.1, chin: 0.95, cheek: 1.25, gaunt: 0.9, brow: 1.25, nose: 1.0, nw: 1.05, eye: 1.25, t: 6, hair: 0x4a4640, age: 50, beard: { mus: 0.7, musW: 0.9, droop: 0.55, goat: 0.6, side: 0.2, stub: 0.9 } } },
  '薄田兼相': { armor: 0x2a1c18, lace: 0x7a5a2a, hat: 'kabuto_g', haori: 0x5a3a1a, horo: 0, mon: 'toyotomi', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x4a2a1c,
    face: { w: 1.1, jaw: 1.3, chin: 0.9, cheek: 1.2, gaunt: 0.3, brow: 1.4, nose: 0.95, nw: 1.25, eye: 1.3, t: 5, hair: 0x15110d, age: 40, beard: { mus: 0.9, musW: 1.1, droop: 0.5, goat: 0.7, side: 0.7, stub: 1.2 } } },
  // 敵方の侍大将（名の無い者も、家の色の甲冑・陣羽織と人ごとの顔で。並の侍と同じ顔にしない）
  '今川方の侍大将': { armor: 0x221816, lace: 0x9a2e20, hat: 'kabuto_w', haori: 0x7a2418, horo: 0, mon: 'imagawa', haoriMonCol: 0xc9a24a, skin: 0xa87f5c, tack: 0x6a1c14,
    face: { w: 1.04, jaw: 1.15, chin: 0.95, cheek: 1.2, gaunt: 0.5, brow: 1.3, nose: 0.95, nw: 1.15, eye: 1.25, t: 5, hair: 0x1e1812, age: 44, beard: { mus: 0.8, musW: 1, droop: 0.55, goat: 0.55, side: 0.35, stub: 1.1 } } },
  '稲田弾正': { armor: 0x22241e, lace: 0x6a5a8a, hat: 'kabuto_f', haori: 0x3a3048, horo: 0, mon: 'saito', haoriMonCol: 0xe6dfcf, skin: 0x9c7453, tack: 0x3a2a4a,
    face: { w: 1.06, jaw: 1.25, chin: 0.9, cheek: 1.3, gaunt: 0.7, brow: 1.4, nose: 0.9, nw: 1.2, eye: 1.3, t: 7, hair: 0x2a2622, age: 46, esp: 0.97, beard: { mus: 0.9, musW: 1.05, droop: 0.6, goat: 0.75, side: 0.6, stub: 1.3 } } },
  '浅井の殿の侍大将': { armor: 0x2e2a26, lace: 0x3c5a48, hat: 'kabuto_m', haori: 0x3a4a3a, horo: 0, mon: 'azai', haoriMonCol: 0xe6dfcf, skin: 0xa87f5c, tack: 0x2a3a30,
    face: { w: 0.98, jaw: 1.1, chin: 1.0, cheek: 1.3, gaunt: 1.0, brow: 1.25, nose: 1.05, nw: 1.0, eye: 1.25, t: 4, hair: 0x2a2622, age: 38, beard: { mus: 0.6, musW: 0.9, droop: 0.4, goat: 0.35, side: 0.15, stub: 1.1 } } },
  '朝倉の侍大将': { armor: 0x33291f, lace: 0x7a5a2a, hat: 'kabuto_w', haori: 0x4a3a1a, horo: 0, mon: 'asakura', haoriMonCol: 0xe6dfcf, skin: 0xb08664, tack: 0x4a3a1c,
    face: { w: 1.08, jaw: 1.2, chin: 0.9, cheek: 1.1, gaunt: 0.2, brow: 1.2, nose: 0.95, nw: 1.2, eye: 1.15, t: 6, hair: 0x4a4640, age: 51, beard: { mus: 0.75, musW: 0.95, droop: 0.65, goat: 0.6, goatW: 0.9, side: 0.25, stub: 0.9 } } },
  '吉田出雲守': { armor: 0x24221f, lace: 0x5a4630, hat: 'kabuto_m', haori: 0x3a2e24, horo: 0, mon: 'none', skin: 0xa87f5c, tack: 0x3a2a1c,
    face: { w: 1.0, jaw: 1.05, chin: 1.0, cheek: 1.25, gaunt: 0.9, brow: 1.2, nose: 1.1, nw: 1.0, eye: 1.2, t: 6, hair: 0x5a5650, age: 55, beard: { mus: 0.65, musW: 0.85, droop: 0.7, goat: 0.7, goatW: 0.7, side: 0.1, stub: 0.9 } } },
  '後藤又兵衛': { armor: 0x2a2624, lace: 0x5a2a1c, hat: 'kabuto_t', haori: 0x2a2a2a, horo: 0, mon: 'toyotomi', haoriMonCol: 0xe6dfcf, skin: 0x8e6446, tack: 0x3a2018,
    face: { w: 1.08, jaw: 1.3, chin: 0.9, cheek: 1.35, gaunt: 0.8, brow: 1.45, nose: 0.95, nw: 1.25, eye: 1.3, t: 7, hair: 0x6a665e, age: 55, esp: 0.96, beard: { mus: 1, musW: 1.1, musH: 1.1, droop: 0.6, goat: 0.9, goatW: 1.05, side: 0.8, stub: 1.3 } } },
  '堀秀政': { armor: 0x1c1a1a, lace: 0x2e3a4a, hat: 'kabuto_m', haori: 0x2e3a4a, horo: 0, mon: 'none', skin: 0xb88e6a, tack: 0x2a2a38,
    face: { w: 0.95, jaw: 0.9, chin: 1.1, cheek: 1.05, gaunt: 0.6, brow: 1.05, nose: 1.1, nw: 0.95, eye: 1.1, t: 1, hair: 0x15110d, age: 24, beard: { mus: 0.2, musW: 0.6, musH: 0.6, goat: 0.05, side: 0, stub: 0.45 } } },
  '村井貞勝': { armor: 0x24221f, lace: 0x4a4a4a, hat: 'kabuto_w', haori: 0x3a3a32, horo: 0, mon: 'none', skin: 0xb08664, tack: 0x2a2a2a,
    face: { w: 0.98, jaw: 0.95, chin: 1.05, cheek: 1.2, gaunt: 1.1, brow: 1.1, nose: 1.1, nw: 1.0, eye: 1.2, t: 6, hair: 0x9a948a, age: 62, beard: { mus: 0.5, musW: 0.8, droop: 0.6, goat: 0.55, goatW: 0.6, side: 0, stub: 0.7 } } },
};
// 各戦に史実でいた名のある武将（段3「量を増やす」）：兜・威・陣羽織・顔を人ごとに。年はその戦の頃
//   顔は [幅, えら, 頬骨, 眉の張り, 鼻, 目の細さ] と、髭の濃さ（0〜1）から作る（年で髪・皺・頬のこけが変わる）
function famFace(age, [w, jaw, cheek, brow, nose, eye], b, hair) {
  const cl = (v, a, c) => Math.max(a, Math.min(c, v));
  return { w, jaw, chin: +cl(2.05 - jaw, 0.8, 1.15).toFixed(2), cheek, gaunt: +(age >= 55 ? 1.1 : age >= 45 ? 0.75 : age >= 30 ? 0.5 : 0.25).toFixed(2), brow, nose, nw: +cl(2.1 - nose, 0.85, 1.3).toFixed(2), eye,
    t: cl(Math.round((age - 18) / 6), 0, 7), hair: hair ?? (age >= 58 ? 0x8a847a : age >= 50 ? 0x4a4640 : age >= 40 ? 0x1e1812 : 0x15110d), age, esp: +(1 + (1 - w) * 0.3).toFixed(2),
    beard: { mus: b, musW: +(0.55 + b * 0.45).toFixed(2), musH: +(0.55 + b * 0.55).toFixed(2), droop: +(0.2 + b * 0.4).toFixed(2), goat: +(b * 0.8).toFixed(2), goatW: +(0.6 + b * 0.35).toFixed(2), side: b > 0.75 ? 0.3 : 0, stub: +(0.35 + b * 0.6).toFixed(2) } };
}
// [名, 胴, 威, 兜, 陣羽織, 家紋, 肌, 年, 顔の形, 髭, ほか]
for (const [nm, armor, lace, hat, haori, mon, skin, age, shape, b, x] of [
  // 桶狭間（永禄三年）
  ['服部小平太', 0x24221f, 0x3c5a8a, 'kabuto_m', 0x3a2a22, 'none', 0xa87f5c, 26, [1.0, 1.05, 1.1, 1.15, 1.0, 1.05], 0.35],
  ['毛利新介', 0x2a2420, 0x7a2a1c, 'kabuto_b', 0x2a2622, 'none', 0x9c7453, 28, [1.04, 1.2, 1.2, 1.25, 0.95, 1.15], 0.5, { cmd: 'bold' }],
  ['井伊直盛', 0x2a2420, 0x9a2e20, 'kabuto_w', 0x5a1c14, 'ii', 0xb08664, 34, [0.97, 0.95, 1.05, 1.05, 1.1, 1.0], 0.4],
  ['由比正信', 0x221816, 0x9a2e20, 'kabuto_f', 0x6a2418, 'imagawa', 0xa87f5c, 46, [1.02, 1.1, 1.25, 1.2, 1.0, 1.2], 0.7],
  // 森部（永禄四年）
  ['足立六兵衛', 0x22241e, 0x6a5a8a, 'kabuto_g', 0x3a3048, 'saito', 0x8e6446, 40, [1.08, 1.35, 1.3, 1.4, 0.9, 1.25], 0.95, { cmd: 'bold' }],
  // 墨俣・稲葉山（永禄九〜十年）
  ['前野長康', 0x2a2420, 0x5a4630, 'kabuto_m', 0x4a3a22, 'none', 0x9c7453, 38, [1.0, 1.1, 1.15, 1.1, 1.05, 1.1], 0.55],
  ['日根野弘就', 0x22241e, 0x5a4a6a, 'kabuto_w', 0x3a3048, 'saito', 0xa87f5c, 48, [0.98, 1.0, 1.3, 1.3, 1.1, 1.25], 0.6],
  ['長井道利', 0x22241e, 0x5a5a3a, 'kabuto_m', 0x3a3a2a, 'saito', 0xb08664, 55, [0.95, 0.9, 1.35, 1.2, 1.15, 1.3], 0.7],
  // 箕作・大河内（永禄十一〜十二年）
  ['建部秀明', 0x24221f, 0x3a5a3a, 'kabuto_f', 0x2e3a2a, 'none', 0xa87f5c, 35, [1.02, 1.05, 1.1, 1.1, 1.0, 1.05], 0.45],
  ['北畠具教', 0x1c1a1a, 0x7a2a5a, 'kabuto_w', 0x4a2a4a, 'none', 0xc09a74, 41, [0.96, 0.9, 1.05, 1.15, 1.15, 1.1], 0.5, { cmd: 'calm' }],
  ['日置大膳', 0x2a2420, 0x6a4a2a, 'kabuto_g', 0x3a2a1a, 'none', 0x8e6446, 45, [1.08, 1.3, 1.25, 1.35, 0.9, 1.2], 0.85],
  // 金ヶ崎・姉川（元亀元年）
  ['池田勝正', 0x24221f, 0x2e3a52, 'kabuto_m', 0x2a2a3a, 'none', 0xb08664, 31, [0.98, 1.0, 1.05, 1.05, 1.05, 1.0], 0.3],
  ['朝倉景鏡', 0x24221f, 0x3a5a3a, 'kabuto_f', 0x3a4a2a, 'asakura', 0xb88e6a, 45, [1.0, 0.95, 1.2, 1.1, 1.1, 1.15], 0.45],
  ['坂井政尚', 0x2a2420, 0x5a2a1c, 'kabuto_g', 0x3a2a1a, 'none', 0x9c7453, 47, [1.05, 1.2, 1.25, 1.3, 0.95, 1.2], 0.75],
  // 野田・福島・志賀（元亀元年）
  ['三好長逸', 0x24221f, 0x2a4a5a, 'kabuto_w', 0x2a3a4a, 'none', 0xb88e6a, 54, [1.0, 0.95, 1.3, 1.15, 1.1, 1.3], 0.6],
  ['下間頼廉', 0x1c1a1a, 0x5a4a3a, 'kabuto_m', 0x3a3a3a, 'none', 0xb08664, 34, [1.02, 1.1, 1.1, 1.2, 1.0, 1.1], 0.2],
  ['織田信治', 0x1c1a1a, 0x3c5a8a, 'kabuto_s', 0x5a1a14, 'oda', 0xc09a74, 25, [0.95, 0.85, 1.0, 1.0, 1.15, 1.0], 0.15, { haoriMonCol: 0xc9a24a }],
  ['各務元正', 0x24221f, 0x2e3a52, 'kabuto_m', 0x2a2a3a, 'tsuru', 0xa87f5c, 32, [1.03, 1.15, 1.15, 1.2, 1.0, 1.1], 0.5, { haoriMonCol: 0xe6dfcf }],
  ['浅井長政', 0x1c1a1a, 0x3c5a48, 'kabuto_w', 0x2a3a30, 'azai', 0xc09a74, 25, [1.02, 0.95, 1.0, 1.05, 1.1, 1.0], 0.2, { haoriMonCol: 0xe6dfcf }],
  // 比叡山（元亀二年）
  ['正覚院豪盛', 0x2a2420, 0x5a4a3a, 'kabuto_m', 0x3a3430, 'none', 0xa87f5c, 55, [1.06, 1.2, 1.3, 1.35, 1.0, 1.3], 0, { hair: 0x4a4640 }],
  // 三方ヶ原（元亀三年）
  ['平手汎秀', 0x24221f, 0x9a7a3a, 'kabuto_b', 0x5a3a1a, 'none', 0xc09a74, 20, [0.95, 0.8, 0.95, 0.95, 1.05, 1.0], 0],
  ['小山田信茂', 0x3a2622, 0x9a2e20, 'kabuto_m', 0x3a2a22, 'takeda', 0xa87f5c, 33, [1.0, 1.05, 1.15, 1.15, 1.05, 1.1], 0.45, { haoriMonCol: 0xe6dfcf }],
  // 刀根坂・小谷（天正元年）
  ['河合吉統', 0x24221f, 0x3a5a3a, 'kabuto_m', 0x2e3a2a, 'asakura', 0xa87f5c, 50, [1.0, 1.05, 1.25, 1.2, 1.05, 1.2], 0.65],
  ['浅井久政', 0x2e2a26, 0x3c5a48, 'kabuto_w', 0x3a3a30, 'azai', 0xb88e6a, 47, [1.04, 0.95, 1.1, 1.05, 1.1, 1.15], 0.55, { haoriMonCol: 0xe6dfcf }],
  ['赤尾清綱', 0x2a2420, 0x7a2a1c, 'kabuto_f', 0x3a2a22, 'azai', 0x9c7453, 59, [0.97, 1.1, 1.35, 1.3, 1.1, 1.3], 0.8],
  ['竹中重治', 0x1c1a1a, 0x3a3a3a, 'kabuto_m', 0x2a2a2a, 'none', 0xc4a07c, 29, [0.92, 0.8, 0.95, 0.95, 1.1, 1.0], 0.05, { cmd: 'calm' }],
  // 長島・越前・岩村（天正二〜三年）
  ['下間頼旦', 0x2a2420, 0x5a4a3a, 'kabuto_m', 0x3a3430, 'none', 0xa87f5c, 42, [1.05, 1.15, 1.2, 1.2, 1.0, 1.15], 0.3],
  ['織田信広', 0x1c1a1a, 0x3c5a8a, 'kabuto_s', 0x6a1a14, 'oda', 0xb08664, 46, [1.02, 1.0, 1.15, 1.1, 1.1, 1.15], 0.55, { haoriMonCol: 0xc9a24a }],
  ['下間頼照', 0x2a2420, 0x4a3a2a, 'kabuto_w', 0x3a3430, 'none', 0xb08664, 57, [0.98, 0.95, 1.3, 1.25, 1.15, 1.3], 0.4],
  ['杉浦玄任', 0x2a2420, 0x5a3a2a, 'kabuto_f', 0x3a2a1a, 'none', 0x9c7453, 50, [1.06, 1.25, 1.25, 1.3, 0.95, 1.2], 0.75],
  ['毛利長秀', 0x24221f, 0x2e3a52, 'kabuto_m', 0x2a2a3a, 'none', 0xa87f5c, 34, [1.0, 1.05, 1.1, 1.1, 1.0, 1.05], 0.4],
  ['秋山虎繁', 0x2a2420, 0x9a2e20, 'kabuto_g', 0x4a2a1c, 'takeda', 0x9c7453, 48, [1.06, 1.3, 1.3, 1.35, 0.9, 1.25], 0.85, { cmd: 'bold', haoriMonCol: 0xe6dfcf }],
  ['座光寺為清', 0x3a2622, 0x7a2a1c, 'kabuto_m', 0x3a2a22, 'takeda', 0xa87f5c, 40, [1.0, 1.05, 1.15, 1.15, 1.05, 1.1], 0.5],
  // 雑賀・手取川・信貴山（天正五年）
  ['土橋守重', 0x151312, 0x3a3a3a, 'kabuto_m', 0x2a2a2a, 'none', 0x8e6446, 45, [1.05, 1.2, 1.2, 1.25, 1.0, 1.2], 0.7],
  ['柿崎景家', 0x1c1a1a, 0x2a3a5a, 'kabuto_g', 0x2a2a3a, 'none', 0x9c7453, 64, [1.04, 1.25, 1.4, 1.4, 1.0, 1.35], 0.9, { cmd: 'bold' }],
  ['河田長親', 0x1c1a1a, 0x2a3a5a, 'kabuto_m', 0x2a2a3a, 'none', 0xc09a74, 34, [0.96, 0.9, 1.05, 1.05, 1.1, 1.05], 0.3],
  ['松永久通', 0x24221f, 0x6a3a1a, 'kabuto_w', 0x4a2a1a, 'none', 0xb88e6a, 34, [1.0, 0.95, 1.05, 1.1, 1.1, 1.05], 0.35],
  ['海老名友清', 0x24221f, 0x5a3a2a, 'kabuto_m', 0x3a2a1a, 'none', 0xa87f5c, 45, [1.04, 1.15, 1.2, 1.2, 1.0, 1.15], 0.6],
  // 木津川口・三木・有岡（天正六〜七年）
  ['九鬼嘉隆', 0x1c1a1a, 0x2a3a5a, 'kabuto_m', 0x1f2a44, 'none', 0x8e6446, 36, [1.06, 1.25, 1.2, 1.3, 0.95, 1.15], 0.6, { cmd: 'bold' }],
  ['村上元吉', 0x24221f, 0x6a2a1a, 'kabuto_f', 0x3a2a1a, 'none', 0x9c7453, 25, [1.0, 1.05, 1.05, 1.1, 1.0, 1.05], 0.25],
  ['乃美宗勝', 0x24221f, 0x4a3a2a, 'kabuto_w', 0x2a2622, 'none', 0x8e6446, 51, [1.02, 1.15, 1.3, 1.25, 1.0, 1.25], 0.7],
  ['児玉就英', 0x24221f, 0x3a4a3a, 'kabuto_m', 0x2e3a2a, 'none', 0xa87f5c, 34, [0.98, 1.0, 1.1, 1.1, 1.05, 1.05], 0.4],
  ['谷衛好', 0x24221f, 0x4a4a2a, 'kabuto_m', 0x3a3a2a, 'none', 0xa87f5c, 50, [1.0, 1.1, 1.25, 1.2, 1.05, 1.2], 0.65],
  ['別所吉親', 0x2a2420, 0x5a2a1c, 'kabuto_g', 0x3a2a1a, 'none', 0x9c7453, 45, [1.05, 1.2, 1.2, 1.3, 0.95, 1.2], 0.7, { cmd: 'bold' }],
  ['生石治家', 0x24221f, 0x3a4a3a, 'kabuto_f', 0x2e3a2a, 'none', 0xa87f5c, 40, [1.0, 1.05, 1.15, 1.15, 1.05, 1.1], 0.5],
  ['池田知正', 0x24221f, 0x2e3a52, 'kabuto_m', 0x2a2a3a, 'none', 0xc09a74, 24, [0.97, 0.9, 1.0, 1.0, 1.1, 1.0], 0.15],
  ['渡辺勘大夫', 0x2a2420, 0x5a4630, 'kabuto_w', 0x3a2e24, 'none', 0x9c7453, 40, [1.04, 1.15, 1.15, 1.2, 1.0, 1.15], 0.6],
  // 伊賀・鳥取・高遠・田野（天正九〜十年）
  ['蒲生氏郷', 0x1c1a1a, 0x2a2a2a, 'kabuto_b', 0x3a2a4a, 'none', 0xc09a74, 25, [0.96, 0.9, 1.0, 1.05, 1.1, 1.0], 0.15],
  ['百地丹波', 0x2a2622, 0x3a3a3a, 'kabuto_m', 0x2a2a2a, 'none', 0x8e6446, 50, [0.96, 1.05, 1.35, 1.3, 1.1, 1.35], 0.5],
  ['滝野吉政', 0x2a2622, 0x4a3a2a, 'kabuto_w', 0x2a2622, 'none', 0x9c7453, 40, [1.0, 1.1, 1.15, 1.15, 1.0, 1.15], 0.45],
  ['奈佐日本之介', 0x24221f, 0x2a3a5a, 'kabuto_f', 0x1f2a44, 'none', 0x8e6446, 40, [1.06, 1.25, 1.2, 1.3, 0.95, 1.15], 0.8, { cmd: 'bold' }],
  ['森下道誉', 0x24221f, 0x4a3a2a, 'kabuto_m', 0x3a2e24, 'none', 0xa87f5c, 55, [0.98, 1.0, 1.3, 1.2, 1.1, 1.3], 0.55],
  ['森長可', 0x1c1a1a, 0x2a2a2a, 'kabuto_s', 0x1a1a1a, 'tsuru', 0xb08664, 24, [1.02, 1.1, 1.05, 1.25, 1.0, 1.1], 0.2, { cmd: 'bold', haoriMonCol: 0xe6dfcf }],
  ['団忠正', 0x24221f, 0x3c5a8a, 'kabuto_m', 0x2a2a3a, 'none', 0xb88e6a, 26, [0.98, 0.95, 1.0, 1.05, 1.05, 1.0], 0.2],
  ['小山田昌行', 0x3a2622, 0x9a2e20, 'kabuto_m', 0x3a2a22, 'takeda', 0xa87f5c, 42, [1.02, 1.1, 1.2, 1.2, 1.0, 1.15], 0.6, { haoriMonCol: 0xe6dfcf }],
  ['諏訪勝右衛門', 0x2a2420, 0x7a2a1c, 'kabuto_w', 0x3a2a22, 'takeda', 0x9c7453, 40, [1.0, 1.05, 1.15, 1.15, 1.05, 1.1], 0.5],
  ['武田信勝', 0x1c1a1a, 0xa8281c, 'kabuto_m', 0x1f2a44, 'takeda', 0xc4a07c, 15, [0.92, 0.75, 0.9, 0.9, 1.05, 0.95], 0, { haoriMonCol: 0xc9a24a }],
  ['小宮山友晴', 0x3a2622, 0x7a2a1c, 'kabuto_m', 0x2a2622, 'takeda', 0xa87f5c, 40, [1.02, 1.15, 1.2, 1.25, 1.0, 1.15], 0.6],
  // 本能寺（天正十年六月）
  ['斎藤利三', 0x1c1a1a, 0x2e3a52, 'kabuto_g', 0x2a2a3a, 'akechi', 0xa87f5c, 48, [1.04, 1.2, 1.3, 1.35, 0.95, 1.25], 0.7, { cmd: 'bold' }],
  ['明智秀満', 0x1c1a1a, 0x3a3a52, 'kabuto_w', 0x2e3a4a, 'akechi', 0xb88e6a, 46, [0.98, 0.95, 1.15, 1.15, 1.1, 1.15], 0.45, { cmd: 'calm' }],
  ['安田国継', 0x24221f, 0x4a4a5a, 'kabuto_m', 0x2a2a32, 'akechi', 0x9c7453, 33, [1.04, 1.2, 1.15, 1.25, 1.0, 1.1], 0.55],
]) {
  if (GENERALS[nm]) continue;
  const { hair, ...rest } = x || {};
  GENERALS[nm] = { armor, lace, hat, haori, horo: 0, mon, skin, ...rest, face: famFace(age, shape, b, hair) };
}
// 馬具の色（名のある武将）：家の色。書いていない武将は、陣羽織・威の色から
for (const [nm, g] of Object.entries(GENERALS)) {
  if (!g.tack) g.tack = ({ '山県昌景': 0x8e2218, '武田勝頼': 0xa8281c, '徳川家康': 0x2a2420, '大久保忠世': 0x262c3a, '酒井忠次': 0x3a2a1c, '奥平信昌': 0x2a2420 })[nm] ?? new THREE.Color(g.lace).multiplyScalar(0.8).getHex();
}
// 肌の色：色白・ふつう・日焼け・よく焼けた
export const SKIN_TONES = [0xb58c68, 0xa87f5c, 0xc09a74, 0x9c7453, 0x8e6446, 0xb08664];

// cloth：足軽の鎧下と袴の色の幅（六通り。遠目で家の塊が分かるように）・busho：侍大将の甲冑・haori：陣羽織
export const FACTION = {
  oda: { armor: 0x2a2e36, lace: 0x3e5070, lace2: 0x33445e, lace3: 0x5a4a3a, flag: 'oda',
    cloth: [0x1f1e1f, 0x2a3040, 0x33302a, 0x1f2533, 0x3a3024, 0x2e3438], busho: 0x1c1a1a, haori: 0x6b1f18 },
  imagawa: { armor: 0x3f2a24, lace: 0x7a3a2a, lace2: 0x8a4a30, lace3: 0x5a3a2a, flag: 'imagawa',
    cloth: [0x3e2620, 0x3a3a26, 0x4a2c22, 0x34382a, 0x3a2e24, 0x2b2622], busho: 0x2e1c18, haori: 0x7a2a1c },
  saito: { armor: 0x35382c, lace: 0x6b6a4a, lace2: 0x5a5a3a, lace3: 0x7a6a4a, flag: 'saito',
    cloth: [0x34342e, 0x3a2e24, 0x2e3228, 0x2b2622, 0x3c3428, 0x262c3a], busho: 0x22241e, haori: 0x3a4632 },
  // 長篠：徳川は黒い小札に茶と紺の威し、武田は赤みの小札に朱の威し、山県の赤備えは全身朱
  tokugawa: { armor: 0x24221f, lace: 0x5a4630, lace2: 0x2e3a52, lace3: 0x4a3a2a, flag: 'tokugawa',
    cloth: [0x262c3a, 0x2b2622, 0x2a2e3c, 0x3a2e24, 0x22262e, 0x34342e], busho: 0x1c1a1a, haori: 0x6a5424 },
  takeda: { armor: 0x3a2622, lace: 0x9a2e20, lace2: 0x7a2a1c, lace3: 0x5a2a20, flag: 'takeda',
    cloth: [0x3a2622, 0x2b2622, 0x442a22, 0x34342e, 0x3a2e24, 0x262c3a], busho: 0x2a1a18, haori: 0x7a1c14 },
  akazonae: { armor: 0x8e1f16, lace: 0xb8342a, lace2: 0xa02a20, lace3: 0x7a1e16, flag: 'akazonae',
    cloth: [0x4a1e18, 0x3a2220, 0x552218, 0x3a2622, 0x4a1e18, 0x2b2622], busho: 0x8e1f16, haori: 0x8e1f16 },
};
