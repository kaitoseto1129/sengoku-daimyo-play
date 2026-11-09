// 一宮城の陣立て（docs/generals_toyo_toku_1108.md の 8）。総大将は秀長（秀吉と混同しない）。
// 一宮城を囲む手だけを置く。讃岐・伊予や岩倉・脇の別方面は使番の知らせで伝える。
// 本陣の近くに軽い旗本を重ねず、秀長の本物の隊に結ぶ。各手の人数は総勢五万に合わせた遊びの推定。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '羽柴', facing: 0, honjin: { x: 52, z: -176 }, mpu: 5, formation: '鶴翼', terrain: 'mountain', flag: 'toyotomi', armor: 0x2b2723, uma: 'fukube', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'masakatsu', layer: 'sakite', wing: 'left', men: 2000, taisho: '蜂須賀正勝', flag: 'hachisuka', bind: F('masakatsu') },
      { id: 'kanbei', layer: 'ichi', wing: 'left', men: 3000, taisho: '黒田官兵衛', flag: 'kuroda', bind: F('kanbei') },
      { id: 'iemasa', layer: 'ichi', wing: 'left', men: 3000, taisho: '蜂須賀家政', flag: 'hachisuka', bind: F('iemasa') },
      { id: 'ote', layer: 'ichi', wing: 'right', men: 15000, taisho: '', at: { x: 150, z: -10 }, hold: true },
      { id: 'todo', layer: 'ni', wing: 'right', men: 10000, taisho: '藤堂高虎', at: { x: 230, z: -120 }, hold: true },
      { id: 'masuda', layer: 'yobi', wing: 'right', men: 9000, taisho: '増田長盛', at: { x: 250, z: -200 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '羽柴秀長', bind: F('honjin') },
    ] },
  honjinView: { A: false },   // 秀長の本陣は戦のファイルが作る
};
