// 足軽の御貸具足の六通り（kaito 10/30「みな同じ茶色の具足で、同じ人が並んで見える」）。
// 人の作り分け（look.vi の 0〜5）ごとに、胴の漆（黒・茶・朱の少し）・威糸の色・使い込み（汚れ・擦れ）を変える。
// 二と五は素懸の小札の胴（units_model の vi % 3 === 2 と同じ）。色は形の頂点の色と uniform なので、材質は増やさない。
export const OKE_VAR = [
  { armor: 0x6e4f38, lace: 0x6b4a2e, wear: 0.45, dirt: 0.8, sug: 0 },   // 茶の漆の桶側
  { armor: 0x2c2723, lace: 0x3a2a20, wear: 0.8, dirt: 1.0, sug: 0 },    // 黒漆の桶側
  { armor: 0x2a2622, lace: 0xa8987a, wear: 0.6, dirt: 0.9, sug: 1 },    // 黒漆の小札に生成りの素懸
  { armor: 0x4c3628, lace: 0x5a3a24, wear: 1.0, dirt: 1.15, sug: 0 },   // 焦げ茶の桶側（使い込み）
  { armor: 0x5c2c22, lace: 0x3a2a20, wear: 0.7, dirt: 0.95, sug: 0 },   // 溜塗の暗い朱の桶側（敵の赤備えと見分ける）
  { armor: 0x5e4430, lace: 0x8a4a30, wear: 0.55, dirt: 0.85, sug: 1 },  // 茶の小札に褪せた赤茶の素懸
];
// 赤備え（朱の濃い家の色）は家の色を守る
const redHouse = (hex) => { if (hex == null) return false; const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return r > 90 && r > g * 2 && r > b * 2; };
// 名の無い足軽（tier 0）だけ。名のある武将・本人・南蛮・僧兵・小袖は触らない。同じ見た目に二度掛けない（loanWorn）
export function loanWear(look) {
  if (!look || look.loanWorn || (look.tier || 0) !== 0 || look.kacchu || look.nanban || look.sohei || look.kosode || look.hero || look.face === 'player'
    || (typeof look.face === 'string' && look.face.startsWith('g:')) || look.takedaRed) return look;
  const v = OKE_VAR[((look.vi || 0) % 6 + 6) % 6];
  const keep = redHouse(look.armor);
  return { ...look, loanWorn: 1, armor: keep ? look.armor : v.armor, lace: v.lace, dirt: Math.min(1, (look.dirt ?? 0.85) * v.dirt) };
}
