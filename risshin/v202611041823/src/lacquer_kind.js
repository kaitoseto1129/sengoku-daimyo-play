// 足軽の御貸具足の漆の色（kaito 10/31 夜）。近い兵（humans_dress.js・units.js）と遠い大軍（world_army.js）で同じ表を使う。青は使わない。
//   ①黒漆（多くの家）：照りの差・下地の茶の剥げ・泥で六通り
//   ②錆地（一揆・雑賀・小さな家・寄せ集め）：くすんだ茶がかった鉄色に、所々の錆の赤茶
//   ③赤備え（武田・井伊・真田）：朱の濃さと褪せで六通り
// 一つの値は [色, 寄せる割合, 明るさの倍]
export const LAC_BLACK = [[0x1c1814, 0.85, 1], [0x2a2622, 0.85, 1.22], [0x16130f, 0.85, 0.92], [0x2c2824, 0.8, 1], [0x24201a, 0.8, 1.1], [0x32302c, 0.7, 0.95]];
export const LAC_SABI = [[0x4a3e30, 0.85, 1], [0x5e3a22, 0.85, 1], [0x3e352b, 0.85, 1], [0x6e3e22, 0.75, 1], [0x504234, 0.85, 1.05], [0x2e2822, 0.8, 1]];
export const LAC_AKA = [[0x8a2a1c, 0.85, 1], [0x7a2618, 0.85, 1], [0x963222, 0.8, 1], [0x6a2216, 0.85, 1], [0x84301e, 0.75, 1], [0x5e1e14, 0.8, 1]];
// 足軽の胴を六組で色ごと分ける表（humans_dress.js の soldierVar・world_army_shader.js の遠い大軍の胴と陣笠。11/2）
//   黒漆の軍：黒漆二・溜塗・錆地・茶・朱。錆地の軍：錆地・錆の赤茶・黒漆・茶・溜塗・鉄
//   三つ目の値（明るさの倍）：溜塗・茶・朱は 1 のままだと陰と漆の沈みで黒に潰れ、844×390 の写真で胴が皆黒に見えた（11/2）。色の付いた漆だけ明るく
//   11/2 夕 kaito「茶色・赤茶色の変な足軽がいる。docs/ashigaru_ref_1101 の黒漆と生成りの足軽に揃える」：溜塗・茶・朱の胴をやめ、
//   六組とも黒漆（照りの差・擦れて下地の見える黒・鉄黒）にする。錆地の軍も鉄の黒に寄せ、赤茶にしない
export const LAC_MIX1 = [[0x1c1814, 0.85, 1], [0x24201c, 0.85, 1.2], [0x2a2622, 0.85, 1.1], [0x302a24, 0.85, 1.15], [0x181614, 0.85, 1.3], [0x34302c, 0.85, 1.05]];
export const LAC_MIX2 = [[0x3a3630, 0.85, 1.1], [0x2e2a26, 0.85, 1.15], [0x1c1814, 0.85, 1.1], [0x403a32, 0.85, 1.05], [0x262320, 0.85, 1.2], [0x34302a, 0.85, 1.1]];
export const KIND_AKA =new Set(['takeda', 'akazonae', 'ii', 'sanada', 'aka_oda', 'aka_kari']);
export const KIND_SABI = new Set(['namu', 'honganji', 'ikko', 'yatagarasu', 'saika', 'iga', 'maru', 'none', 'hikyaku', '']);
// 旗の名から漆の種類：3 赤備え・2 錆地・1 黒漆
export function lacKind(flag) {
  const f = String(flag || '');
  return KIND_AKA.has(f) ? 3 : KIND_SABI.has(f) ? 2 : 1;
}
export const LAC_OF = { 1: LAC_BLACK, 2: LAC_SABI, 3: LAC_AKA };
// 旗の名で決まる、軍の基の漆（同じ家は同じ色。人ごとの差は soldierVar・遠い兵の色で付ける）
export function houseHash(flag) {
  let h = 0; for (const ch of String(flag || '')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}
// 家ごとの布の色の芯（共通の差の1「兵が灰・黒の同じ形で単調」11/1）。黒漆の中に赤・茶・生成りの布を混ぜる。
//   近い兵（units.js の鎧下・脚絆・鉢巻）と遠い大軍（world_army_shader.js の脚・腕・袖）で同じ表。青は使わない。色は褪せた染め
//   11/2 夕：赤茶・弁柄の布が「茶色・赤茶色の変な足軽」に見えた。手本 ref1 の黒い小袖と茶の裁着袴へ（黒鼠・墨・茶・焦げ茶）
export const CLOTH_CORE = [0x3a3632, 0x5e4c3c, 0x2e2b28, 0x54443a, 0x44403a, 0x4a3e34];   // 黒鼠・茶・墨・焦げ茶・鼠・丁子茶
export const CLOTH_PLAIN = [0x3a3632, 0x54443a, 0x2e2b28, 0x4a4540];   // 家を問わない布：黒鼠・茶・墨・鼠
export function houseCore(flag) {
  const f = String(flag || '');
  if (lacKind(f) === 3) return 0x7a2c1e;
  return CLOTH_CORE[(houseHash(f) >>> 5) % CLOTH_CORE.length];
}
