// 足軽の御貸具足の漆の色（kaito 10/31 夜）。近い兵（humans_dress.js・units.js）と遠い大軍（world_army.js）で同じ表を使う。青は使わない。
//   ①黒漆（多くの家）：照りの差・下地の茶の剥げ・泥で六通り
//   ②錆地（一揆・雑賀・小さな家・寄せ集め）：くすんだ茶がかった鉄色に、所々の錆の赤茶
//   ③赤備え（武田・井伊・真田）：朱の濃さと褪せで六通り
// 一つの値は [色, 寄せる割合, 明るさの倍]
export const LAC_BLACK = [[0x1c1814, 0.85, 1], [0x2e261e, 0.85, 1.22], [0x16130f, 0.85, 0.92], [0x3a2a1c, 0.8, 1], [0x24201a, 0.8, 1.1], [0x45342a, 0.7, 0.95]];
export const LAC_SABI = [[0x4a3e30, 0.85, 1], [0x5e3a22, 0.85, 1], [0x3e352b, 0.85, 1], [0x6e3e22, 0.75, 1], [0x504234, 0.85, 1.05], [0x2e2822, 0.8, 1]];
export const LAC_AKA = [[0x8a2a1c, 0.85, 1], [0x7a2618, 0.85, 1], [0x963222, 0.8, 1], [0x6a2216, 0.85, 1], [0x84301e, 0.75, 1], [0x5e1e14, 0.8, 1]];
// 足軽の胴を六組で色ごと分ける表（humans_dress.js の soldierVar・world_army_shader.js の遠い大軍の胴と陣笠。11/2）
//   黒漆の軍：黒漆二・溜塗・錆地・茶・朱。錆地の軍：錆地・錆の赤茶・黒漆・茶・溜塗・鉄
//   三つ目の値（明るさの倍）：溜塗・茶・朱は 1 のままだと陰と漆の沈みで黒に潰れ、844×390 の写真で胴が皆黒に見えた（11/2）。色の付いた漆だけ明るく
export const LAC_MIX1 = [[0x1c1814, 0.85, 1], [0x4a2618, 0.85, 1.55], [0x2a2420, 0.85, 1.2], [0x5e4430, 0.85, 1.45], [0x6e2a1a, 0.8, 1.5], [0x6a4a2c, 0.85, 1.4]];
export const LAC_MIX2 = [[0x4a3e30, 0.85, 1.3], [0x6e3e22, 0.85, 1.45], [0x1c1814, 0.85, 1.1], [0x7a5634, 0.85, 1.35], [0x4a2618, 0.85, 1.5], [0x3e352b, 0.85, 1.2]];
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
export const CLOTH_CORE = [0x7a4226, 0x857660, 0x6e3424, 0x5e4630, 0x76543a, 0x6a2c20];   // 柿渋・生成り・弁柄・茶・丁子茶・褪せた赤
export const CLOTH_PLAIN = [0x857760, 0x54422f, 0x7a4a2a, 0x5a5040];   // 家を問わない布：生成り・茶・柿渋・鼠茶
export function houseCore(flag) {
  const f = String(flag || '');
  if (lacKind(f) === 3) return 0x7a2c1e;
  return CLOTH_CORE[(houseHash(f) >>> 5) % CLOTH_CORE.length];
}
