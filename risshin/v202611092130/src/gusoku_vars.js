// 足軽の御貸具足の六通り（kaito 10/30「みな同じ茶色の具足で、同じ人が並んで見える」）。
// 人の作り分け（look.vi の 0〜5）ごとに、胴の漆（黒・茶・朱の少し）・威糸の色・使い込み（汚れ・擦れ）を変える。
// 二と五は素懸の小札の胴（units_model の vi % 3 === 2 と同じ）。色は形の頂点の色と uniform なので、材質は増やさない。
export const OKE_VAR = [
// 11/2 夕 kaito「茶色・赤茶色の変な足軽」：六通りとも黒漆（照り・擦れ・汚れの差）に。手本 docs/ashigaru_ref_1101
  { armor: 0x221e1a, lace: 0x2e2620, wear: 0.45, dirt: 0.8, sug: 0 },   // 黒漆の桶側（照りのある新しい物）
  { armor: 0x2c2723, lace: 0x3a2a20, wear: 0.8, dirt: 1.0, sug: 0 },    // 黒漆の桶側
  { armor: 0x2a2622, lace: 0x5a5046, wear: 0.6, dirt: 0.9, sug: 1 },    // 黒漆の小札に鼠の素懸
  { armor: 0x302a24, lace: 0x3a2e26, wear: 1.0, dirt: 1.15, sug: 0 },   // 擦れた黒漆の桶側（使い込み）
  { armor: 0x1c1a18, lace: 0x2a2420, wear: 0.7, dirt: 0.95, sug: 0 },   // 鉄黒の桶側
  { armor: 0x2e2a26, lace: 0x4a4038, wear: 0.55, dirt: 0.85, sug: 1 },  // 黒漆の小札に焦げ茶の素懸
];
// 名の無い足軽（tier 0）だけ。名のある武将・本人・南蛮・僧兵・小袖は触らない。同じ見た目に二度掛けない（loanWorn）
export function loanWear(look) {
  if (!look || look.loanWorn || (look.tier || 0) !== 0 || look.kacchu || look.nanban || look.sohei || look.kosode || look.hero || look.face === 'player'
    || (typeof look.face === 'string' && look.face.startsWith('g:')) || look.takedaRed) return look;
  const v = OKE_VAR[((look.vi || 0) % 6 + 6) % 6];
  // 11/3 kaito の手本 docs/ashigaru_ref_1101/ref8_uniform「一つの家の足軽は全員同じ姿」：御貸具足の漆と縅は家の物（units.js が決めた色）のまま。
  //   人ごとに変えるのは使い込みの汚れだけ（前は六通りの漆と縅に塗り替え、隊の中で胴と縅の色が散っていた）
  return { ...look, loanWorn: 1, dirt: Math.min(1, (look.dirt ?? 0.85) * v.dirt) };
}
